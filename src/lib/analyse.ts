// Statistikk for lag, tropp, motstandere, disiplin, dommere, baner og trenere.
// Rene funksjoner over visningsmodellen (testes i tests/analyse.test.ts).
import type { Db, Kamp, KampHendelse, Person } from './db.ts';
import { normName, slugify } from './names.ts';
import { lagStat, type LagStat, type Poengregel } from './stats.ts';

export const oss = (k: Kamp) => (k.side === 'hjemme' ? k.hjemme : k.borte);
export const mot = (k: Kamp) => (k.side === 'hjemme' ? k.borte : k.hjemme);
export const erKort = (e: KampHendelse) => e.type !== 'mal';
const malFor = (k: Kamp) => k.hendelser.filter((e) => e.type === 'mal' && e.side === k.side);
const malMot = (k: Kamp) => k.hendelser.filter((e) => e.type === 'mal' && e.side !== k.side);

/** Under dette antallet kamper vises ikke prosent og snitt ("ikke nok data"). */
export const MIN_KAMPER = 5;

export interface Bilanse extends LagStat {
  seierProsent: number | null;
  poengPerKamp: number | null;
  malForSnitt: number | null;
  malMotSnitt: number | null;
}

export function bilanse(kamper: Kamp[], regel?: Poengregel): Bilanse {
  const s = lagStat(kamper, regel);
  const per = (n: number) => (s.kamper ? n / s.kamper : null);
  const pct = per(s.seire);
  return {
    ...s,
    seierProsent: pct === null ? null : Math.round(pct * 1000) / 10,
    poengPerKamp: per(s.poeng),
    malForSnitt: per(s.malFor),
    malMotSnitt: per(s.malMot),
  };
}

export interface Gruppe {
  navn: string;
  kamper: Kamp[];
  b: Bilanse;
}

export function grupper(kamper: Kamp[], nokkel: (k: Kamp) => string | null, regel?: Poengregel): Gruppe[] {
  const map = new Map<string, Kamp[]>();
  for (const k of kamper) {
    const n = nokkel(k);
    if (n === null) continue;
    if (!map.has(n)) map.set(n, []);
    map.get(n)!.push(k);
  }
  return [...map].map(([navn, ks]) => ({ navn, kamper: ks, b: bilanse(ks, regel) }));
}

// ---------- Resultater ----------

export function resultatFordeling(kamper: Kamp[]) {
  const map = new Map<string, { resultat: string; antall: number; utfall: Kamp['utfall']; f: number; m: number }>();
  for (const k of kamper) {
    const key = `${k.malFor}–${k.malMot}`;
    const e = map.get(key) ?? { resultat: key, antall: 0, utfall: k.utfall, f: k.malFor, m: k.malMot };
    e.antall++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.antall - a.antall || b.f - b.m - (a.f - a.m) || b.f - a.f);
}

/** Pausestilling fra vårt ståsted: rapporten først, ellers utledet når alle mål er kjent. */
export function pauseStilling(k: Kamp): { for: number; mot: number } | null {
  if (k.pause) return k.side === 'hjemme' ? { for: k.pause.hjemme, mot: k.pause.borte } : { for: k.pause.borte, mot: k.pause.hjemme };
  if (!k.malKomplett) return null;
  return { for: malFor(k).filter((e) => e.omgang === 1).length, mot: malMot(k).filter((e) => e.omgang === 1).length };
}

export function omganger(kamper: Kamp[]) {
  const teller = (es: KampHendelse[], o: 1 | 2) => es.filter((e) => e.omgang === o).length;
  let for1 = 0, for2 = 0, mot1 = 0, mot2 = 0, utenOmgang = 0;
  const rad = () => ({ kamper: 0, S: 0, U: 0, T: 0 });
  const pause = { ledet: rad(), likt: rad(), bak: rad() };
  const snu: Kamp[] = [];
  const tapt: Kamp[] = [];
  let grunnlag = 0;
  for (const k of kamper) {
    const f = malFor(k);
    const m = malMot(k);
    for1 += teller(f, 1);
    for2 += teller(f, 2);
    mot1 += teller(m, 1);
    mot2 += teller(m, 2);
    utenOmgang += [...f, ...m].filter((e) => e.omgang === null).length;
    const p = pauseStilling(k);
    if (!p) continue;
    grunnlag++;
    const r = p.for > p.mot ? pause.ledet : p.for < p.mot ? pause.bak : pause.likt;
    r.kamper++;
    r[k.utfall]++;
    if (p.for < p.mot && k.utfall !== 'T') snu.push(k);
    if (p.for > p.mot && k.utfall !== 'S') tapt.push(k);
  }
  return { for1, for2, mot1, mot2, utenOmgang, pause, snu, tapt, grunnlag };
}

export interface Rekke {
  lengde: number;
  fra: Kamp | null;
  til: Kamp | null;
  paagaar: boolean;
}

/** Lengste sammenhengende rekke i kronologisk rekkefølge. */
export function lengsteRekke(kamper: Kamp[], pred: (k: Kamp) => boolean): Rekke {
  let best: Rekke = { lengde: 0, fra: null, til: null, paagaar: false };
  let start = 0;
  let lengde = 0;
  kamper.forEach((k, i) => {
    if (pred(k)) {
      if (!lengde) start = i;
      lengde++;
      if (lengde >= best.lengde) best = { lengde, fra: kamper[start], til: k, paagaar: i === kamper.length - 1 };
    } else lengde = 0;
  });
  return best;
}

export function rekker(kamper: Kamp[]) {
  return {
    seier: lengsteRekke(kamper, (k) => k.utfall === 'S'),
    ubeseiret: lengsteRekke(kamper, (k) => k.utfall !== 'T'),
    tap: lengsteRekke(kamper, (k) => k.utfall === 'T'),
    utenSeier: lengsteRekke(kamper, (k) => k.utfall !== 'S'),
    scoring: lengsteRekke(kamper, (k) => k.malFor > 0),
  };
}

export function rekorder(kamper: Kamp[]) {
  const best = (score: (k: Kamp) => number) => {
    const maks = Math.max(...kamper.map(score));
    return kamper.length && maks > 0 ? { verdi: maks, kamper: kamper.filter((k) => score(k) === maks) } : null;
  };
  const medMinutt = (es: (k: Kamp) => KampHendelse[]) =>
    kamper.flatMap((k) => es(k).filter((e) => e.minutt !== null).map((e) => ({ e, k })));
  const f = medMinutt(malFor);
  const m = medMinutt(malMot);
  const min = (xs: typeof f) => [...xs].sort((a, b) => a.e.minutt! - b.e.minutt!)[0] ?? null;
  const maks = (xs: typeof f) => [...xs].sort((a, b) => b.e.minutt! - a.e.minutt!)[0] ?? null;
  return {
    storsteSeier: best((k) => k.malFor - k.malMot),
    storsteTap: best((k) => k.malMot - k.malFor),
    flestMal: best((k) => k.malFor + k.malMot),
    flestScoret: best((k) => k.malFor),
    flestSluppetInn: best((k) => k.malMot),
    raskesteMal: min(f),
    senesteMal: maks(f),
    raskesteBaklengs: min(m),
  };
}

const divisjon = (t: string) => Number(t.match(/(\d+)\.\s*div/i)?.[1] ?? NaN);

/** Sesongtabell med divisjon og opp-/nedrykk utledet av divisjonsnummeret. */
export function sesongRader(db: Db) {
  const stigende = [...db.sesonger].sort((a, b) => a - b);
  const rader = stigende.map((s, i) => {
    const ks = db.kamper.filter((k) => k.sesong === s);
    const nr = divisjon(ks[0]?.turnering ?? '');
    const forrige = i ? divisjon(db.kamper.find((k) => k.sesong === stigende[i - 1])?.turnering ?? '') : NaN;
    return {
      sesong: s,
      turneringer: [...new Set(ks.map((k) => k.turnering))],
      rykk: nr < forrige ? ('Opprykk' as const) : nr > forrige ? ('Nedrykk' as const) : null,
      b: bilanse(ks, db.settings.poeng),
    };
  });
  return rader.reverse();
}

// ---------- Spillere ----------

/** Alle hat-tricks (minst 3 mål i én kamp), nyeste først. */
export function hatTricks(personer: Person[], sesong: number | null = null) {
  return personer
    .flatMap((person) =>
      person.spillerKamper.filter((x) => x.s.mal.length >= 3 && (!sesong || x.kamp.sesong === sesong)).map((x) => ({ person, kamp: x.kamp, antall: x.s.mal.length })),
    )
    .sort((a, b) => b.kamp.dato.localeCompare(a.kamp.dato));
}

/** Lagets resultater med og uten spilleren, i sesonger der spilleren var i troppen. Null når grunnlaget er for lite. */
export function medOgUten(person: Person, kamper: Kamp[], regel?: Poengregel, min = MIN_KAMPER) {
  const med = new Set(person.spillerKamper.map((x) => x.kamp.kampnr));
  const sesonger = new Set(person.spillerKamper.map((x) => x.kamp.sesong));
  const iSesong = kamper.filter((k) => sesonger.has(k.sesong));
  const a = iSesong.filter((k) => med.has(k.kampnr));
  const b = iSesong.filter((k) => !med.has(k.kampnr));
  if (a.length < min || b.length < min) return null;
  return { med: bilanse(a, regel), uten: bilanse(b, regel) };
}

// ---------- Tropp ----------

export function troppRader(db: Db) {
  const stigende = [...db.sesonger].sort((a, b) => a - b);
  const sett = (s: number) =>
    new Set(db.kamper.filter((k) => k.sesong === s).flatMap((k) => oss(k).spillere.filter((p) => p.slug).map((p) => p.slug!)));
  const tidligere = new Set<string>();
  const rader = stigende.map((s, i) => {
    const ks = db.kamper.filter((k) => k.sesong === s);
    const denne = sett(s);
    const forrige = i ? sett(stigende[i - 1]) : null;
    const nye = [...denne].filter((x) => !tidligere.has(x));
    const tilbake = forrige ? [...denne].filter((x) => tidligere.has(x) && !forrige.has(x)) : [];
    const sluttet = forrige ? [...forrige].filter((x) => !denne.has(x)) : [];
    denne.forEach((x) => tidligere.add(x));
    return {
      sesong: s,
      kamper: ks.length,
      spillere: denne.size,
      snittTropp: ks.length ? ks.reduce((n, k) => n + oss(k).spillere.length, 0) / ks.length : 0,
      nye: i ? nye.length : null,
      tilbake: i ? tilbake.length : null,
      sluttet: i ? sluttet.length : null,
    };
  });
  return rader.reverse();
}

/** Spillerpar som oftest har vært i troppen sammen. */
export function spillerPar(kamper: Kamp[], antall = 15) {
  const map = new Map<string, number>();
  for (const k of kamper) {
    const s = oss(k).spillere.filter((p) => p.slug).map((p) => p.slug!).sort();
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) map.set(`${s[i]}|${s[j]}`, (map.get(`${s[i]}|${s[j]}`) ?? 0) + 1);
  }
  return [...map].sort((a, b) => b[1] - a[1]).slice(0, antall).map(([k, n]) => ({ a: k.split('|')[0], b: k.split('|')[1], kamper: n }));
}

export const formasjoner = (kamper: Kamp[], regel?: Poengregel) =>
  grupper(kamper, (k) => oss(k).formasjon, regel).sort((a, b) => b.b.kamper - a.b.kamper);

// ---------- Motstandere ----------

export function motstandere(kamper: Kamp[], regel?: Poengregel) {
  return grupper(kamper, (k) => k.motstander, regel)
    .map((g) => ({ ...g, slug: slugify(g.navn) }))
    .sort((a, b) => b.b.kamper - a.b.kamper || a.navn.localeCompare(b.navn, 'nb'));
}

/** Favoritt- og skrekkmotstandere: minst to møter, rangert på poeng per kamp og målforskjell. */
export function favoritter(rader: ReturnType<typeof motstandere>, antall = 3) {
  const nok = rader.filter((r) => r.b.kamper >= 2);
  const score = (r: (typeof nok)[number]) => (r.b.poengPerKamp ?? 0) + r.b.malforskjell / r.b.kamper / 100;
  const sortert = [...nok].sort((a, b) => score(b) - score(a));
  return { favoritter: sortert.slice(0, antall), skrekk: sortert.slice(-antall).reverse() };
}

// ---------- Disiplin ----------

export const BOLKER = ['0–15', '16–30', '31–45', '46–60', '61–75', '76–90+'];
export const bolk = (minutt: number) => Math.min(5, Math.max(0, Math.ceil(minutt / 15) - 1));

export function disiplin(kamper: Kamp[]) {
  const kort = (k: Kamp, oss_: boolean) => k.hendelser.filter((e) => erKort(e) && (e.side === k.side) === oss_);
  const telling = (oss_: boolean) => {
    const es = kamper.flatMap((k) => kort(k, oss_));
    const b = BOLKER.map(() => 0);
    for (const e of es) if (e.minutt !== null) b[bolk(e.minutt)]++;
    return { gule: es.filter((e) => e.type === 'gult').length, rode: es.filter((e) => e.type !== 'gult').length, bolker: b };
  };
  const mestKort = [...kamper]
    .map((k) => ({ k, oss: kort(k, true).length, mot: kort(k, false).length }))
    .sort((a, b) => b.oss + b.mot - (a.oss + a.mot))
    .slice(0, 5);
  return { oss: telling(true), mot: telling(false), mestKort, kamper: kamper.length };
}

// ---------- Dommere ----------

export function dommere(kamper: Kamp[], regel?: Poengregel) {
  const navn = new Map<string, string>();
  for (const k of kamper) if (k.dommer) navn.set(normName(k.dommer.navn), k.dommer.navn);
  return grupper(kamper, (k) => (k.dommer ? normName(k.dommer.navn) : null), regel)
    .map((g) => {
      const kort = (o: boolean) => g.kamper.flatMap((k) => k.hendelser.filter((e) => erKort(e) && (e.side === k.side) === o)).length;
      const siste = g.kamper.at(-1)!;
      return {
        ...g,
        navn: navn.get(g.navn) ?? g.navn,
        klubb: siste.dommer?.klubb ?? null,
        kortOss: kort(true),
        kortMot: kort(false),
        hjemme: bilanse(g.kamper.filter((k) => k.side === 'hjemme'), regel),
        borte: bilanse(g.kamper.filter((k) => k.side === 'borte'), regel),
      };
    })
    .sort((a, b) => b.b.kamper - a.b.kamper || a.navn.localeCompare(b.navn, 'nb'));
}

// ---------- Baner og tidspunkt ----------

const dato = (k: Kamp) => new Date(`${k.dato}T12:00:00Z`);
const UKEDAGER = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MANEDER = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];

export function tidspunkt(kamper: Kamp[], regel?: Poengregel) {
  const sortert = (gs: Gruppe[], liste: string[]) => gs.sort((a, b) => liste.indexOf(a.navn) - liste.indexOf(b.navn));
  return {
    baner: grupper(kamper, (k) => k.bane, regel).sort((a, b) => b.b.kamper - a.b.kamper || a.navn.localeCompare(b.navn, 'nb')),
    ukedager: sortert(grupper(kamper, (k) => UKEDAGER[(dato(k).getUTCDay() + 6) % 7], regel), UKEDAGER),
    maneder: sortert(grupper(kamper, (k) => MANEDER[dato(k).getUTCMonth()], regel), MANEDER),
    klokkeslett: grupper(kamper, (k) => `${k.avspark.slice(0, 2)}:00–${k.avspark.slice(0, 2)}:59`, regel).sort((a, b) => a.navn.localeCompare(b.navn)),
  };
}

// ---------- Trenere og støtteapparat ----------

export interface Periode {
  fra: string;
  til: string;
  kamper: number;
}

/** Sammenhengende perioder (i kronologisk rekkefølge) der nokkel gir samme navn. Kamper uten navn bryter ikke perioden. */
function perioder(kamper: Kamp[], navn: string, nokkel: (k: Kamp) => string[]): Periode[] {
  const out: Periode[] = [];
  let aapen: Periode | null = null;
  for (const k of kamper) {
    const ns = nokkel(k);
    if (!ns.length) continue;
    if (ns.includes(navn)) {
      if (aapen) {
        aapen.til = k.dato;
        aapen.kamper++;
      } else {
        aapen = { fra: k.dato, til: k.dato, kamper: 1 };
        out.push(aapen);
      }
    } else aapen = null;
  }
  return out;
}

export function trenere(kamper: Kamp[], regel?: Poengregel) {
  const nokkel = (k: Kamp) => (k.trener ? [k.trener.navn] : []);
  const rader = grupper(kamper, (k) => k.trener?.navn ?? null, regel)
    .map((g) => ({ ...g, slug: g.kamper.find((k) => k.trener?.slug)?.trener?.slug ?? null, perioder: perioder(kamper, g.navn, nokkel) }))
    .sort((a, b) => b.b.kamper - a.b.kamper);
  return { rader, utenTrener: kamper.filter((k) => !k.trener).length };
}

export function kontaktpersoner(kamper: Kamp[]) {
  const nokkel = (k: Kamp) => oss(k).ledere.filter((l) => /kontaktperson/i.test(l.funksjon)).map((l) => l.navn);
  const navn = [...new Set(kamper.flatMap(nokkel))];
  return navn
    .map((n) => {
      const ks = kamper.filter((k) => nokkel(k).includes(n));
      return { navn: n, slug: ks.flatMap((k) => oss(k).ledere).find((l) => l.navn === n)?.slug ?? null, kamper: ks.length, perioder: perioder(kamper, n, nokkel) };
    })
    .sort((a, b) => b.kamper - a.kamper);
}

// ---------- Fakta om én kamp ----------

export function kampFakta(k: Kamp) {
  const f = malFor(k);
  const m = malMot(k);
  const omg = (es: KampHendelse[], o: 1 | 2) => es.filter((e) => e.omgang === o).length;
  const alle = [...f, ...m].filter((e) => e.minutt !== null);
  const forste = alle.length ? alle.reduce((a, b) => (b.minutt! < a.minutt! ? b : a)) : null;
  const siste = alle.length ? alle.reduce((a, b) => (b.minutt! >= a.minutt! ? b : a)) : null;
  const ossLag = oss(k);
  const scorere = ossLag.spillere.filter((s) => s.mal.length > 0);
  const perPosisjon = new Map<string, number>();
  for (const s of scorere) if (s.posisjon) perPosisjon.set(s.posisjon, (perPosisjon.get(s.posisjon) ?? 0) + s.mal.length);
  const b = BOLKER.map(() => ({ for: 0, mot: 0 }));
  for (const e of f) if (e.minutt !== null) b[bolk(e.minutt)].for++;
  for (const e of m) if (e.minutt !== null) b[bolk(e.minutt)].mot++;
  return {
    forste,
    siste,
    malOmgang: { for: [omg(f, 1), omg(f, 2)], mot: [omg(m, 1), omg(m, 2)] },
    margin: Math.abs(k.malFor - k.malMot),
    totalt: k.malFor + k.malMot,
    ulikeScorere: scorere.length,
    hatTricks: scorere.filter((s) => s.mal.length >= 3),
    perPosisjon: [...perPosisjon],
    bolker: b,
  };
}
