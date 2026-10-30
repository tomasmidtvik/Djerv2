// Parser for NFF-kamprapporter (PDF). Kolonnene finnes fra overskriftene, ikke fra faste pikselverdier.
import { cleanText, fullName, isOurTeam } from '../names.ts';
import type { Kamprapport, PersonMedKlubb, RapportLag, RapportLeder, RapportSpiller, Score } from '../types.ts';
import { assignColumns, joinText, looksPrivate, parseGoals, parseMinutes, scrub, toLines, type Column } from './layout.ts';
import type { PdfPage, TextToken } from './pdf-text.ts';

/** Ord som starter et nytt felt i toppen av rapporten. */
const LABELS = new Set([
  'Kamp:',
  'Bane:',
  'Sluttresultat',
  'Res.',
  'Avspark',
  'Dato/tid:',
  'Kampnr:',
  'Pauseresultat',
  'Pausens',
  'Kampslutt',
  'Tillegg',
  'Antall',
  'Kampvert',
  'Dommer',
  'Dommerveileder',
  'Lagoppstilling:',
]);

export interface ParseOptions {
  /** lagnavn som identifiserer oss, f.eks. "Djerv 2" */
  lagPrefix: string;
  /** relativ sti til PDF-en (lagres i JSON) */
  kilde: string;
}

export class ParseError extends Error {}

export function isKamprapport(page: PdfPage): boolean {
  return page.tokens.some((t) => t.text === 'KAMPRAPPORT');
}

export function parseKamprapport(page: PdfPage, opts: ParseOptions): Kamprapport {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const horiz = page.tokens.filter((t) => !t.rotated);
  const rotated = page.tokens.filter((t) => t.rotated);
  const lines = toLines(horiz);

  const find = (text: string, filter: (t: TextToken) => boolean = () => true) =>
    horiz.find((t) => t.text === text && filter(t));
  const sameLine = (a: TextToken, b: TextToken) => Math.abs(a.y - b.y) <= 1.6;

  /** Tokens til høyre for en etikett på samme linje, frem til neste etikett. */
  const valueAfter = (label: TextToken | undefined, maxX = Infinity): TextToken[] => {
    if (!label) return [];
    const out: TextToken[] = [];
    const cands = horiz.filter((t) => sameLine(t, label) && t.x0 > label.x1 - 0.5 && t.x1 <= maxX).sort((a, b) => a.x0 - b.x0);
    for (const t of cands) {
      if (LABELS.has(t.text)) break;
      out.push(t);
    }
    return out;
  };

  // ---- Toppfelt ----
  const titleTok = find('KAMPRAPPORT');
  if (!titleTok) throw new ParseError('Fant ikke "KAMPRAPPORT" – er dette en kamprapport?');
  const titleLine = joinText(horiz.filter((t) => sameLine(t, titleTok)));
  const turnering = cleanText(titleLine.replace(/^KAMPRAPPORT\s*(\(\d+\))?\s*-?\s*/, ''));

  const avsparkLabel = find('Avspark');
  const rightX = avsparkLabel ? avsparkLabel.x0 - 4 : page.width * 0.7;

  const kampnr = joinText(valueAfter(find('Kampnr:'), rightX)).replace(/\s/g, '');
  if (!/^\d{6,}$/.test(kampnr)) throw new ParseError(`Fant ikke gyldig kampnummer (fikk "${kampnr}")`);

  const datoTid = joinText(valueAfter(find('Dato/tid:'), rightX));
  const avspark = joinText(valueAfter(avsparkLabel));
  const dt = parseDateTime(datoTid) ?? parseDateTime(avspark);
  if (!dt) throw new ParseError(`Fant ikke dato/tid (fikk "${datoTid}")`);
  const dtAvspark = parseDateTime(avspark);
  if (dtAvspark && (dtAvspark.dato !== dt.dato || dtAvspark.tid !== dt.tid)) {
    warn(`Dato/tid (${datoTid}) og Avspark (${avspark}) er ulike – bruker Dato/tid`);
  }

  const bane = scrub(joinText(valueAfter(find('Bane:'), rightX)), warn, 'bane');
  const kampTekst = joinText(valueAfter(find('Kamp:'), rightX));

  const resultat = parseScore(joinText(valueAfter(find('Sluttresultat'), rightX)));
  if (!resultat) throw new ParseError('Fant ikke sluttresultat');
  // Pauseresultatet er tomt i en del rapporter – det er ikke en feil, men tekst vi ikke forstår er det
  const pauseTekst = joinText(valueAfter(find('Pauseresultat'), rightX));
  const pause = parseScore(pauseTekst);
  if (!pause && pauseTekst) warn(`Kunne ikke lese pauseresultatet "${pauseTekst}"`);

  const eeoTekst = joinText(valueAfter(find('e.e.o'), rightX));
  const straffeTekst = joinText(valueAfter(find('straffekonk.'), rightX));

  const tilskuereTekst = joinText(valueAfter(find('tilskuere')));
  const tilskuere = /^\d+$/.test(tilskuereTekst) ? Number(tilskuereTekst) : null;
  const kampvertTekst = joinText(valueAfter(find('tilstede?')));

  // Venstre blokk: Dommer og Dommerveileder (klubb kan bryte over to linjer)
  const lagLabels = horiz.filter((t) => t.text === 'Lagoppstilling:').sort((a, b) => a.x0 - b.x0);
  if (lagLabels.length !== 2) throw new ParseError(`Fant ${lagLabels.length} lagoppstillinger, forventet 2`);
  const dommerLabel = find('Dommer', (t) => t.x0 < rightX);
  const veilederLabel = find('Dommerveileder', (t) => t.x0 < rightX);
  const lagY = lagLabels[0].y;
  const dommer = dommerLabel
    ? parsePersonKlubb(horiz, dommerLabel, veilederLabel?.y ?? lagY, rightX, warn, 'dommer')
    : null;
  if (!dommer) warn('Fant ikke dommer');
  const dommerveileder = veilederLabel ? parsePersonKlubb(horiz, veilederLabel, lagY, rightX, warn, 'dommerveileder') : null;

  // ---- Lagene ----
  const ranges: [number, number][] = [
    [0, lagLabels[1].x0 - 5],
    [lagLabels[1].x0 - 5, page.width + 1],
  ];
  const [hjemmelag, bortelag] = ranges.map(([xa, xb], i) =>
    parseTeam(horiz, rotated, lagLabels[i], xa, xb, i === 0 ? 'hjemmelag' : 'bortelag', warn),
  );

  // Sjekk mot "Kamp: A - B"
  const kampNavn = kampTekst.split(/\s+-\s+/);
  if (kampNavn.length === 2) {
    if (cleanText(kampNavn[0]) !== hjemmelag.navn || cleanText(kampNavn[1]) !== bortelag.navn) {
      warn(`Lagnavn i "Kamp:" (${kampTekst}) stemmer ikke med lagoppstillingene (${hjemmelag.navn} / ${bortelag.navn})`);
    }
  }

  const djerv = isOurTeam(hjemmelag.navn, opts.lagPrefix)
    ? 'hjemme'
    : isOurTeam(bortelag.navn, opts.lagPrefix)
      ? 'borte'
      : null;
  if (!djerv) warn(`Fant ikke ${opts.lagPrefix} blant lagene (${hjemmelag.navn} / ${bortelag.navn})`);

  // Advarsel hvis PDF-en inneholder noe som ligner private opplysninger
  if (lines.some((l) => looksPrivate(joinText(l.tokens)))) {
    warn('PDF-en inneholder noe som ligner telefonnummer eller e-post. Det er ikke tatt med i dataene.');
  }

  for (const [lag, side] of [
    [hjemmelag, 'hjemmelag'],
    [bortelag, 'bortelag'],
  ] as const) {
    for (const p of [...lag.spillere, ...lag.ledere]) {
      for (const m of p.rodeAdv2) {
        warn(
          `KONTROLLER: kort i kolonnen "Utv. (Adv. 2)" (rødt etter to gule) for ${p.navn} (${side}) i ${m}'. ` +
            'Denne kolonnen er ikke sett i praksis før – sjekk mot PDF-en.',
        );
      }
    }
  }

  return {
    type: 'kamprapport',
    versjon: 1,
    kampnr,
    dato: dt.dato,
    avspark: dt.tid,
    sesong: Number(dt.dato.slice(0, 4)),
    turnering,
    bane,
    resultat,
    pause,
    eeo: eeoTekst || null,
    straffekonk: straffeTekst || null,
    tilskuere,
    kampvertTilstede: kampvertTekst || null,
    dommer,
    dommerveileder,
    hjemmelag,
    bortelag,
    djerv,
    advarsler: warnings,
    kilde: opts.kilde,
  };
}

function parseDateTime(s: string): { dato: string; tid: string } | null {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return {
    dato: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
    tid: `${m[4].padStart(2, '0')}:${m[5]}`,
  };
}

function parseScore(s: string): Score | null {
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? { hjemme: Number(m[1]), borte: Number(m[2]) } : null;
}

/** Navn og klubb står i to "kolonner" på samme linje; klubbnavnet kan bryte til neste linje. */
function parsePersonKlubb(
  horiz: TextToken[],
  label: TextToken,
  nextLabelY: number,
  maxX: number,
  warn: (m: string) => void,
  what: string,
): PersonMedKlubb | null {
  const first = horiz
    .filter((t) => Math.abs(t.y - label.y) <= 1.6 && t.x0 > label.x1 && t.x1 <= maxX)
    .sort((a, b) => a.x0 - b.x0);
  if (!first.length) return null;
  // Del i grupper ved store mellomrom
  const groups: TextToken[][] = [[first[0]]];
  for (let i = 1; i < first.length; i++) {
    if (first[i].x0 - first[i - 1].x1 > 12) groups.push([]);
    groups[groups.length - 1].push(first[i]);
  }
  const nameToks = groups[0];
  const clubToks = groups.slice(1).flat();
  const clubX = clubToks[0]?.x0;
  // Fortsettelseslinjer under (før neste etikett)
  for (const t of horiz) {
    if (t.y <= label.y + 1.6 || t.y >= nextLabelY - 1.6 || t.x0 <= label.x1 || t.x1 > maxX) continue;
    if (clubX !== undefined && t.x0 >= clubX - 3) clubToks.push(t);
    else nameToks.push(t);
  }
  const byPos = (a: TextToken, b: TextToken) => a.y - b.y || a.x0 - b.x0;
  const navn = scrub(cleanText(nameToks.sort(byPos).map((t) => t.text).join(' ')), warn, what);
  const klubb = scrub(cleanText(clubToks.sort(byPos).map((t) => t.text).join(' ')), warn, `${what}s klubb`);
  return { navn, klubb: klubb || null };
}

function classifyHeader(text: string): string | null {
  const t = cleanText(text).toLowerCase();
  if (t.includes('kaptein')) return 'kaptein';
  if (t.includes('innbytter')) return 'innbytter';
  if (t.includes('draktnr')) return 'draktnr';
  if (t.includes('spilt')) return 'spilt';
  if (t.includes('direkte')) return 'direkte';
  if (/adv\.?\s*2/.test(t)) return 'adv2';
  if (/adv\.?\s*1/.test(t)) return 'adv1';
  return null;
}

/**
 * Roterte overskrifter kan komme som én bit ("Utv. (Adv. 2)") eller flere biter i samme x-posisjon.
 * Vi grupperer på x og leser nedenfra og opp.
 */
function rotatedHeaders(rotated: TextToken[], xa: number, xb: number, ya: number, yb: number): Column[] {
  const inside = rotated.filter((t) => t.x0 >= xa && t.x1 <= xb && t.y1 > ya && t.y1 <= yb + 3);
  const groups: TextToken[][] = [];
  for (const t of inside.sort((a, b) => a.x0 - b.x0)) {
    const g = groups.find((g) => Math.abs(g[0].x0 - t.x0) < 2.5);
    if (g) g.push(t);
    else groups.push([t]);
  }
  const cols: Column[] = [];
  for (const g of groups) {
    const text = g
      .sort((a, b) => b.y1 - a.y1)
      .map((t) => t.text)
      .join(' ');
    const key = classifyHeader(text);
    if (key) cols.push({ key, x0: Math.min(...g.map((t) => t.x0)) });
  }
  return cols;
}

function parseTeam(
  horiz: TextToken[],
  rotated: TextToken[],
  lagLabel: TextToken,
  xa: number,
  xb: number,
  side: string,
  warn: (m: string) => void,
): RapportLag {
  const inRange = (t: TextToken) => t.x0 >= xa && t.x0 < xb;
  const navn = joinText(horiz.filter((t) => inRange(t) && Math.abs(t.y - lagLabel.y) <= 1.6 && t.x0 > lagLabel.x1));

  // Spillertabellen
  const etternavnHdrs = horiz.filter((t) => inRange(t) && t.text === 'Etternavn' && t.y > lagLabel.y).sort((a, b) => a.y - b.y);
  const hdr = etternavnHdrs[0];
  if (!hdr) throw new ParseError(`Fant ikke spillertabellen for ${side}`);
  const onHdr = (text: string) => horiz.find((t) => inRange(t) && t.text === text && Math.abs(t.y - hdr.y) <= 2);
  const fornavnHdr = onHdr('Fornavn');
  const malHdr = onHdr('Mål');
  const cols: Column[] = [
    ...rotatedHeaders(rotated, xa, xb, lagLabel.y, hdr.y),
    { key: 'etternavn', x0: hdr.x0 },
  ];
  if (fornavnHdr) cols.push({ key: 'fornavn', x0: fornavnHdr.x0 });
  if (malHdr) cols.push({ key: 'mal', x0: malHdr.x0 });
  for (const need of ['spilt', 'draktnr', 'fornavn', 'adv1', 'adv2', 'direkte', 'mal']) {
    if (!cols.some((c) => c.key === need)) warn(`Fant ikke kolonnen "${need}" for ${side}`);
  }

  const ledereLabel = horiz.find((t) => inRange(t) && t.text === 'reservebenken' && t.y > hdr.y);
  const tableEnd = ledereLabel ? ledereLabel.y - 2 : Infinity;
  const rowTokens = horiz.filter((t) => inRange(t) && t.y > hdr.y + 2 && t.y < tableEnd);

  const spillere: RapportSpiller[] = [];
  for (const line of toLines(rowTokens)) {
    const { cells, unassigned } = assignColumns(line.tokens, cols);
    const text = (k: string) => joinText(cells.get(k) ?? []);
    const etternavn = scrub(text('etternavn'), warn, 'spillernavn');
    const fornavn = scrub(text('fornavn'), warn, 'spillernavn');
    const nrText = text('draktnr');
    if (!etternavn && !fornavn && !nrText) continue;
    const navnFull = fullName(fornavn, etternavn);
    if (unassigned.length) warn(`Ukjent tekst i raden for ${navnFull} (${side}): ${joinText(unassigned)}`);
    const w = (m: string) => warn(`${navnFull} (${side}): ${m}`);
    const { mal, selvmal } = parseGoals(text('mal'), w);
    spillere.push({
      draktnr: /^\d+$/.test(nrText) ? Number(nrText) : null,
      etternavn,
      fornavn,
      navn: navnFull,
      spilt: Boolean(text('spilt')),
      kaptein: Boolean(text('kaptein')),
      innbytter: Boolean(text('innbytter')),
      mal,
      ...(selvmal.length ? { selvmal } : {}),
      gule: parseMinutes(text('adv1'), w),
      rodeAdv2: parseMinutes(text('adv2'), w),
      rodeDirekte: parseMinutes(text('direkte'), w),
    });
  }
  if (!spillere.length) warn(`Fant ingen spillere for ${side}`);

  // Ledere på reservebenken
  const ledere: RapportLeder[] = [];
  if (ledereLabel) {
    const nrHdr = horiz.find((t) => inRange(t) && t.text === 'Nr.' && t.y > ledereLabel.y);
    if (nrHdr) {
      const onNr = (text: string) => horiz.find((t) => inRange(t) && t.text === text && Math.abs(t.y - nrHdr.y) <= 2);
      const protest = horiz.filter((t) => inRange(t) && t.text === 'PROTEST' && t.y > ledereLabel.y - 5);
      const maxX = protest.length ? Math.min(...protest.map((t) => t.x0)) - 3 : xb;
      const lcols: Column[] = [
        { key: 'nr', x0: nrHdr.x0 },
        ...rotatedHeaders(rotated, xa, maxX, ledereLabel.y, nrHdr.y),
      ];
      for (const k of ['Etternavn', 'Fornavn', 'Funksjon']) {
        const t = onNr(k);
        if (t) lcols.push({ key: k.toLowerCase(), x0: t.x0 });
        else warn(`Fant ikke kolonnen "${k}" for ledere (${side})`);
      }
      const ltoks = horiz.filter((t) => inRange(t) && t.x1 <= maxX && t.y > nrHdr.y + 2);
      for (const line of toLines(ltoks)) {
        const { cells, unassigned } = assignColumns(line.tokens, lcols);
        const text = (k: string) => joinText(cells.get(k) ?? []);
        const etternavn = scrub(text('etternavn'), warn, 'ledernavn');
        const fornavn = scrub(text('fornavn'), warn, 'ledernavn');
        if (!etternavn && !fornavn) continue;
        const navnFull = fullName(fornavn, etternavn);
        if (unassigned.length) warn(`Ukjent tekst i lederraden for ${navnFull} (${side}): ${joinText(unassigned)}`);
        const w = (m: string) => warn(`${navnFull} (leder, ${side}): ${m}`);
        const nrText = text('nr');
        ledere.push({
          nr: /^\d+$/.test(nrText) ? Number(nrText) : null,
          etternavn,
          fornavn,
          navn: navnFull,
          funksjon: scrub(text('funksjon'), warn, 'lederfunksjon'),
          gule: parseMinutes(text('adv1'), w),
          rodeAdv2: parseMinutes(text('adv2'), w),
          rodeDirekte: parseMinutes(text('direkte'), w),
        });
      }
    } else warn(`Fant ikke ledertabellen for ${side}`);
  } else warn(`Fant ikke "Ledere på reservebenken" for ${side}`);

  return { navn, spillere, ledere };
}
