// Bygger visningsmodellen for nettsiden fra rådataene: kamper, personer og hendelser.
import type { RawData, Settings } from './data.ts';
import { linkMedia, matchLineup, type MediaLink } from './link.ts';
import { cleanText, normName, slugify } from './names.ts';
import type {
  Hendelser,
  KampMeta,
  Kamprapport,
  MediaLag,
  Opptak,
  PersonMedKlubb,
  RapportLag,
  Score,
} from './types.ts';

export type Side = 'hjemme' | 'borte';
export type Utfall = 'S' | 'U' | 'T';

export interface SpillerIKamp extends Hendelser {
  /** navnet som vises (etter alias) */
  navn: string;
  /** navnet slik det står i rapporten */
  rapportNavn: string;
  /** etternavn fra rapporten (kort visning på banen) */
  etternavn: string;
  /** person-slug (bare for våre spillere) */
  slug: string | null;
  draktnr: number | null;
  kaptein: boolean;
  /** startet ikke (stod som innbytter) */
  innbytter: boolean;
  mal: number[];
  /** fra mediarapporten: "oppstilt som" */
  posisjon: string | null;
  /** fra matches-meta.yaml: true = kom inn, false = kom ikke inn, null = ukjent */
  innbyttet: boolean | null;
  innMinutt: number | null;
}

export interface LederIKamp extends Hendelser {
  navn: string;
  rapportNavn: string;
  slug: string | null;
  funksjon: string;
}

export interface LagIKamp {
  navn: string;
  erOss: boolean;
  /** spillere i troppen (krysset av som spilt) */
  spillere: SpillerIKamp[];
  ledere: LederIKamp[];
  formasjon: string | null;
  hovedtrener: string | null;
  harMedia: boolean;
}

export type HendelseType = 'mal' | 'gult' | 'rodt2' | 'rodt';

export interface KampHendelse {
  minutt: number | null;
  type: HendelseType;
  side: Side;
  navn: string | null;
  slug: string | null;
  selvmal: boolean;
  leder: boolean;
  /** stillingen etter målet */
  stilling?: [number, number];
}

export interface Kamp {
  kampnr: string;
  dato: string;
  avspark: string;
  sesong: number;
  turnering: string;
  bane: string;
  resultat: Score;
  pause: Score | null;
  eeo: string | null;
  straffekonk: string | null;
  tilskuere: number | null;
  kampvertTilstede: string | null;
  dommer: PersonMedKlubb | null;
  dommerveileder: PersonMedKlubb | null;
  hjemme: LagIKamp;
  borte: LagIKamp;
  side: Side;
  motstander: string;
  malFor: number;
  malMot: number;
  utfall: Utfall;
  hendelser: KampHendelse[];
  /** antall mål uten registrert målscorer (f.eks. selvmål som ikke er lagt inn) */
  ukjenteMal: Record<Side, number>;
  opptak: Opptak[];
  referat: string | null;
  keeper: { navn: string; slug: string | null; kilde: 'mediarapport' | 'metadata' } | null;
  mediaId: string | null;
  forrige: string | null;
  neste: string | null;
}

export interface PersonKamp {
  kamp: Kamp;
  s: SpillerIKamp;
}
export interface LederKamp {
  kamp: Kamp;
  l: LederIKamp;
}

export interface Person {
  slug: string;
  navn: string;
  /** alle stavemåter som er slått sammen til denne personen */
  varianter: string[];
  spillerKamper: PersonKamp[];
  lederKamper: LederKamp[];
  bilde: string | null;
}

export interface Db {
  settings: Settings;
  /** eldste først */
  kamper: Kamp[];
  kampMap: Map<string, Kamp>;
  personer: Person[];
  personMap: Map<string, Person>;
  /** nyeste først */
  sesonger: number[];
  mediaLinks: MediaLink[];
  /** merknader fra koblingen mellom kamprapport og mediarapport, per kamp */
  lineupMerknader: Map<string, string[]>;
  /** kamper som ble hoppet over (fant ikke vårt lag) */
  ignorert: string[];
}

const other = (s: Side): Side => (s === 'hjemme' ? 'borte' : 'hjemme');

export function buildDb(raw: RawData): Db {
  // ---- Alias ----
  const aliasMap = new Map<string, string>();
  for (const [from, to] of Object.entries(raw.alias.alias ?? {})) {
    if (typeof to === 'string' && to.trim()) aliasMap.set(normName(from), cleanText(to));
  }
  const canonical = (navn: string) => {
    let n = cleanText(navn);
    for (let i = 0; i < 5 && aliasMap.has(normName(n)); i++) n = aliasMap.get(normName(n))!;
    return n;
  };
  const keyOf = (navn: string) => normName(canonical(navn));

  // ---- Personregister for våre spillere/ledere ----
  const reg = new Map<string, { navn: string; dato: string; aliased: boolean; varianter: Set<string> }>();
  const touch = (navn: string, dato: string) => {
    const key = keyOf(navn);
    const canon = canonical(navn);
    const aliased = normName(canon) !== normName(navn);
    const e = reg.get(key);
    if (!e) reg.set(key, { navn: canon, dato, aliased, varianter: new Set([cleanText(navn)]) });
    else {
      e.varianter.add(cleanText(navn));
      if (aliased) e.aliased = true;
      if (e.aliased) e.navn = canon;
      else if (dato >= e.dato) {
        e.navn = canon;
        e.dato = dato;
      }
    }
  };

  const ours = raw.matches.filter((m) => m.djerv);
  const ignorert = raw.matches.filter((m) => !m.djerv).map((m) => m.kampnr);
  const metaOf = (kampnr: string): KampMeta => raw.meta[kampnr] ?? {};

  for (const m of ours) {
    const lag = m.djerv === 'hjemme' ? m.hjemmelag : m.bortelag;
    const ikkeSpilt = new Set((metaOf(m.kampnr).ikke_spilt ?? []).map(keyOf));
    for (const s of lag.spillere) if (s.spilt && !ikkeSpilt.has(keyOf(s.navn))) touch(s.navn, m.dato);
    for (const l of lag.ledere) touch(l.navn, m.dato);
  }

  // Slugs (unike)
  const slugByKey = new Map<string, string>();
  const usedSlugs = new Set<string>();
  for (const [key, e] of [...reg.entries()].sort((a, b) => a[1].navn.localeCompare(b[1].navn, 'nb'))) {
    let slug = slugify(e.navn) || 'person';
    for (let i = 2; usedSlugs.has(slug); i++) slug = `${slugify(e.navn)}-${i}`;
    usedSlugs.add(slug);
    slugByKey.set(key, slug);
  }

  // ---- Mediarapporter ----
  const mediaLinks = linkMedia(raw.media, raw.matches, raw.meta);
  const mediaByKamp = new Map<string, MediaLink>();
  for (const l of mediaLinks) if (l.kampnr) mediaByKamp.set(l.kampnr, l);
  const lineupMerknader = new Map<string, string[]>();

  // ---- Kamper ----
  const kamper: Kamp[] = ours
    .slice()
    .sort((a, b) => (a.dato + a.avspark).localeCompare(b.dato + b.avspark))
    .map((m) => {
      const meta = metaOf(m.kampnr);
      const side = m.djerv as Side;
      const link = mediaByKamp.get(m.kampnr);
      const mediaFor = (s: Side): MediaLag | null => {
        if (!link) return null;
        const flip = link.byttet ? other(s) : s;
        return flip === 'hjemme' ? link.media.hjemmelag : link.media.bortelag;
      };
      const merknader: string[] = [];
      const buildLag = (s: Side): LagIKamp => {
        const rl: RapportLag = s === 'hjemme' ? m.hjemmelag : m.bortelag;
        const erOss = s === side;
        const ml = mediaFor(s);
        const lineup = ml ? matchLineup(rl, ml) : null;
        if (lineup) merknader.push(...lineup.merknader);
        const ikkeSpilt = erOss ? new Set((meta.ikke_spilt ?? []).map(keyOf)) : new Set<string>();
        const brukte = erOss && meta.brukte_innbyttere ? new Map(meta.brukte_innbyttere.map((b) => [keyOf(b.navn), b.minutt ?? null])) : null;
        const spillere: SpillerIKamp[] = [];
        rl.spillere.forEach((p, i) => {
          if (!p.spilt || ikkeSpilt.has(keyOf(p.navn))) return;
          const ms = lineup?.koblet.get(i);
          const key = keyOf(p.navn);
          spillere.push({
            navn: erOss ? reg.get(key)!.navn : p.navn,
            rapportNavn: p.navn,
            etternavn: p.etternavn,
            slug: erOss ? slugByKey.get(key) ?? null : null,
            draktnr: p.draktnr,
            kaptein: p.kaptein || Boolean(ms?.kaptein),
            innbytter: p.innbytter,
            mal: p.mal,
            gule: p.gule,
            rodeAdv2: p.rodeAdv2,
            rodeDirekte: p.rodeDirekte,
            posisjon: ms && ms.start && ms.posisjon !== 'Strøket' ? ms.posisjon : null,
            innbyttet: p.innbytter && brukte ? brukte.has(key) : null,
            innMinutt: p.innbytter && brukte ? brukte.get(key) ?? null : null,
          });
        });
        const ledere: LederIKamp[] = rl.ledere.map((l) => {
          const key = keyOf(l.navn);
          return {
            navn: erOss ? reg.get(key)!.navn : l.navn,
            rapportNavn: l.navn,
            slug: erOss ? slugByKey.get(key) ?? null : null,
            funksjon: l.funksjon,
            gule: l.gule,
            rodeAdv2: l.rodeAdv2,
            rodeDirekte: l.rodeDirekte,
          };
        });
        return {
          navn: rl.navn,
          erOss,
          spillere,
          ledere,
          formasjon: ml?.formasjon ?? null,
          hovedtrener: ml?.hovedtrener ?? null,
          harMedia: Boolean(ml),
        };
      };
      const hjemme = buildLag('hjemme');
      const borte = buildLag('borte');
      if (link?.merknader.length) merknader.push(...link.merknader);
      if (merknader.length) lineupMerknader.set(m.kampnr, merknader);

      const { hendelser, ukjenteMal } = buildEvents(m, side, hjemme, borte, meta, keyOf, slugByKey);
      const oss = side === 'hjemme' ? hjemme : borte;

      // Keeper: fra mediarapport, ellers fra metadata
      let keeper: Kamp['keeper'] = null;
      const mk = oss.spillere.find((s) => s.posisjon === 'Keeper');
      if (mk) keeper = { navn: mk.navn, slug: mk.slug, kilde: 'mediarapport' };
      else if (meta.keeper) {
        const k = oss.spillere.find((s) => keyOf(s.rapportNavn) === keyOf(meta.keeper!));
        keeper = { navn: k?.navn ?? cleanText(meta.keeper), slug: k?.slug ?? null, kilde: 'metadata' };
      }

      const malFor = side === 'hjemme' ? m.resultat.hjemme : m.resultat.borte;
      const malMot = side === 'hjemme' ? m.resultat.borte : m.resultat.hjemme;
      return {
        kampnr: m.kampnr,
        dato: m.dato,
        avspark: m.avspark,
        sesong: m.sesong,
        turnering: m.turnering,
        bane: m.bane,
        resultat: m.resultat,
        pause: m.pause,
        eeo: m.eeo,
        straffekonk: m.straffekonk,
        tilskuere: meta.tilskuere ?? m.tilskuere,
        kampvertTilstede: m.kampvertTilstede,
        dommer: m.dommer,
        dommerveileder: m.dommerveileder,
        hjemme,
        borte,
        side,
        motstander: side === 'hjemme' ? m.bortelag.navn : m.hjemmelag.navn,
        malFor,
        malMot,
        utfall: malFor > malMot ? 'S' : malFor < malMot ? 'T' : 'U',
        hendelser,
        ukjenteMal,
        opptak: (meta.opptak ?? []).filter((o) => o && typeof o.url === 'string'),
        referat: meta.referat?.trim() || null,
        keeper,
        mediaId: link?.media.id ?? null,
        forrige: null,
        neste: null,
      } satisfies Kamp;
    });
  kamper.forEach((k, i) => {
    k.forrige = kamper[i - 1]?.kampnr ?? null;
    k.neste = kamper[i + 1]?.kampnr ?? null;
  });

  // ---- Personer ----
  const bySlug = new Map<string, Person>();
  for (const [key, e] of reg) {
    const slug = slugByKey.get(key)!;
    const bilde =
      ['webp', 'jpg', 'jpeg', 'png'].map((ext) => `${slug}.${ext}`).find((f) => raw.bilder.includes(f)) ?? null;
    bySlug.set(slug, {
      slug,
      navn: e.navn,
      varianter: [...e.varianter].sort(),
      spillerKamper: [],
      lederKamper: [],
      bilde: bilde ? `spillere/${bilde}` : null,
    });
  }
  for (const k of kamper) {
    const oss = k.side === 'hjemme' ? k.hjemme : k.borte;
    for (const s of oss.spillere) if (s.slug) bySlug.get(s.slug)!.spillerKamper.push({ kamp: k, s });
    for (const l of oss.ledere) if (l.slug) bySlug.get(l.slug)!.lederKamper.push({ kamp: k, l });
  }
  const personer = [...bySlug.values()].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  return {
    settings: raw.settings,
    kamper,
    kampMap: new Map(kamper.map((k) => [k.kampnr, k])),
    personer,
    personMap: bySlug,
    sesonger: [...new Set(kamper.map((k) => k.sesong))].sort((a, b) => b - a),
    mediaLinks,
    lineupMerknader,
    ignorert,
  };
}

function buildEvents(
  m: Kamprapport,
  side: Side,
  hjemme: LagIKamp,
  borte: LagIKamp,
  meta: KampMeta,
  keyOf: (n: string) => string,
  slugByKey: Map<string, string>,
): { hendelser: KampHendelse[]; ukjenteMal: Record<Side, number> } {
  const ev: KampHendelse[] = [];
  const add = (s: Side, navn: string, slug: string | null, h: Hendelser & { mal?: number[] }, leder: boolean) => {
    for (const minutt of h.mal ?? []) ev.push({ minutt, type: 'mal', side: s, navn, slug, selvmal: false, leder });
    for (const minutt of h.gule) ev.push({ minutt, type: 'gult', side: s, navn, slug, selvmal: false, leder });
    for (const minutt of h.rodeAdv2) ev.push({ minutt, type: 'rodt2', side: s, navn, slug, selvmal: false, leder });
    for (const minutt of h.rodeDirekte) ev.push({ minutt, type: 'rodt', side: s, navn, slug, selvmal: false, leder });
  };
  for (const [s, lag] of [
    ['hjemme', hjemme],
    ['borte', borte],
  ] as const) {
    for (const p of lag.spillere) add(s, p.navn, p.slug, p, false);
    for (const l of lag.ledere) add(s, l.navn, l.slug, l, true);
  }
  // Selvmål fra metadata: målet tilhører laget som fikk det
  for (const sm of meta.selvmal ?? []) {
    const til: Side = sm.til === 'djerv' ? side : other(side);
    const scorerLag = til === 'hjemme' ? borte : hjemme;
    const p = sm.spiller ? scorerLag.spillere.find((x) => keyOf(x.rapportNavn) === keyOf(sm.spiller!)) : undefined;
    ev.push({
      minutt: sm.minutt ?? null,
      type: 'mal',
      side: til,
      navn: p?.navn ?? (sm.spiller ? cleanText(sm.spiller) : null),
      slug: p?.slug ?? (sm.spiller && scorerLag.erOss ? slugByKey.get(keyOf(sm.spiller)) ?? null : null),
      selvmal: true,
      leder: false,
    });
  }
  // Mål uten registrert målscorer
  const ukjenteMal: Record<Side, number> = { hjemme: 0, borte: 0 };
  for (const s of ['hjemme', 'borte'] as const) {
    const registrert = ev.filter((e) => e.type === 'mal' && e.side === s).length;
    const fasit = s === 'hjemme' ? m.resultat.hjemme : m.resultat.borte;
    ukjenteMal[s] = Math.max(0, fasit - registrert);
    for (let i = 0; i < ukjenteMal[s]; i++) {
      ev.push({ minutt: null, type: 'mal', side: s, navn: null, slug: null, selvmal: false, leder: false });
    }
  }
  ev.sort((a, b) => (a.minutt ?? 999) - (b.minutt ?? 999));
  let h = 0;
  let b = 0;
  for (const e of ev) {
    if (e.type !== 'mal') continue;
    if (e.side === 'hjemme') h++;
    else b++;
    e.stilling = [h, b];
  }
  return { hendelser: ev, ukjenteMal };
}
