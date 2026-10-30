// Parser for mediarapporter (lagoppstilling med posisjoner). Har ikke kampnummer og ingen hendelser.
import { cleanText, slugify } from '../names.ts';
import type { MediaLag, MediaSpiller, Mediarapport } from '../types.ts';
import { joinText, looksPrivate, scrub, toLines, type Line } from './layout.ts';
import type { PdfPage, TextToken } from './pdf-text.ts';
import { ParseError } from './kamprapport.ts';

export const KJENTE_POSISJONER = ['Keeper', 'Forsvar', 'Midtbane', 'Angrep', 'Strøket'];
/** Teksten NFF bruker i stedet for navnet når en person er reservert mot publisering. */
export const SKJULT_TEKST = 'Personinfo ikke tilgjengelig';
export const erSkjultNavn = (navn: string) => cleanText(navn).toLowerCase() === SKJULT_TEKST.toLowerCase();
const POS_SET = new Set(KJENTE_POSISJONER.map((p) => p.toLowerCase()));
const KAPTEIN = /^\(?K\.?\)?$/;

export function isMediarapport(page: PdfPage): boolean {
  const texts = new Set(page.tokens.map((t) => t.text));
  return texts.has('Navn') && texts.has('Hovedtrener') && !texts.has('KAMPRAPPORT');
}

export interface MediaOptions {
  kilde: string;
  kampnrHint: string | null;
}

export function parseMediarapport(page: PdfPage, opts: MediaOptions): Mediarapport {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const horiz = page.tokens.filter((t) => !t.rotated);
  const lines = toLines(horiz);

  const navnHdrs = horiz.filter((t) => t.text === 'Navn').sort((a, b) => a.x0 - b.x0);
  if (navnHdrs.length !== 2) throw new ParseError(`Fant ${navnHdrs.length} "Navn"-overskrifter, forventet 2`);
  const [leftNavn, rightNavn] = navnHdrs;
  const hdrY = leftNavn.y;

  // Toppen: turnering, dato/avspark og bane
  const top = lines.filter((l) => l.y < hdrY - 2);
  const dateIdx = top.findIndex((l) => l.tokens.some((t) => /^(Date|Dato):?$/i.test(t.text)));
  if (dateIdx < 0) throw new ParseError('Fant ikke dato i mediarapporten');
  const dateLine = joinText(top[dateIdx].tokens);
  const dm = dateLine.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!dm) throw new ParseError(`Kunne ikke lese dato fra "${dateLine}"`);
  const dato = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const tm = dateLine.match(/(?:Kick\s*off|Avspark):?\s*(\d{1,2})[:.](\d{2})/i);
  const avspark = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
  if (!avspark) warn('Fant ikke avsparkstid');
  const turnering = dateIdx > 0 ? joinText(top.slice(0, dateIdx).flatMap((l) => l.tokens)) : null;

  // Lagnavnene står på linjen rett over "Navn"; banen mellom datolinjen og lagnavnene
  const teamLine = top[top.length - 1];
  const bane = top.length - 1 > dateIdx + 1 ? joinText(top.slice(dateIdx + 1, top.length - 1).flatMap((l) => l.tokens)) : null;

  // Bunnen: dommer
  const dommerLine = lines.find((l) => l.y > hdrY && l.tokens[0]?.text === 'Dommer');
  const dommer = dommerLine ? joinText(dommerLine.tokens.slice(1)) || null : null;
  const endY = dommerLine?.y ?? lines.find((l) => l.y > hdrY && l.tokens.some((t) => /^Assistentdommer|^Versjon/.test(t.text)))?.y ?? Infinity;

  // Høyre lag: alt fra høyre "Navn"-kolonne, pluss draktnummer som står rett foran den
  const isRight = (t: TextToken) =>
    t.x0 >= rightNavn.x0 - 3 || (/^\d+$/.test(t.text) && t.x1 > rightNavn.x0 - 12 && t.x1 <= rightNavn.x0 + 1);
  const body = horiz.filter((t) => t.y > hdrY + 2 && t.y < endY - 2);
  const leftTokens = body.filter((t) => !isRight(t));
  const rightTokens = body.filter(isRight);

  const leftName = joinText(teamLine.tokens.filter((t) => !isRight(t)));
  const rightName = joinText(teamLine.tokens.filter(isRight));
  if (!leftName || !rightName) throw new ParseError('Fant ikke begge lagnavnene');

  const hjemmelag = parseSide(toLines(leftTokens), leftName, leftNavn.x0, warn);
  const bortelag = parseSide(toLines(rightTokens), rightName, rightNavn.x0, warn);

  if (lines.some((l) => looksPrivate(joinText(l.tokens)))) {
    warn('PDF-en inneholder noe som ligner telefonnummer eller e-post. Det er ikke tatt med i dataene.');
  }

  return {
    type: 'mediarapport',
    versjon: 1,
    id: `${dato}_${slugify(hjemmelag.navn)}_${slugify(bortelag.navn)}`,
    turnering,
    dato,
    avspark,
    bane,
    dommer: dommer ? scrub(dommer, warn, 'dommer') : null,
    hjemmelag,
    bortelag,
    kampnrHint: opts.kampnrHint,
    advarsler: warnings,
    kilde: opts.kilde,
  };
}

function parseSide(lines: Line[], navn: string, navnX: number, warn: (m: string) => void): MediaLag {
  // Posisjonskolonnen: der de kjente posisjonsordene står
  const posTokens = lines.flatMap((l) => l.tokens).filter((t) => POS_SET.has(t.text.toLowerCase()));
  const posX = posTokens.length ? Math.min(...posTokens.map((t) => t.x0)) : Infinity;

  const spillere: MediaSpiller[] = [];
  let section: 'start' | 'innbyttere' | 'trener' = 'start';
  let hovedtrener: string | null = null;
  for (const line of lines) {
    const texts = line.tokens.map((t) => t.text);
    if (texts.includes('Innbyttere')) {
      section = 'innbyttere';
      continue;
    }
    if (texts.includes('Hovedtrener')) {
      section = 'trener';
      continue;
    }
    if (section === 'trener') {
      const t = joinText(line.tokens);
      if (!hovedtrener && !erSkjultNavn(t)) hovedtrener = scrub(t, warn, 'hovedtrener') || null;
      continue;
    }
    let toks = line.tokens;
    let draktnr: number | null = null;
    if (toks[0] && /^\d+$/.test(toks[0].text) && toks[0].x1 <= navnX + 1) {
      draktnr = Number(toks[0].text);
      toks = toks.slice(1);
    }
    let kaptein = false;
    toks = toks.filter((t) => {
      if (KAPTEIN.test(t.text)) {
        kaptein = true;
        return false;
      }
      return true;
    });
    const posToks = toks.filter((t) => t.x0 >= posX - 3);
    const nameToks = toks.filter((t) => t.x0 < posX - 3);
    const spillerNavn = scrub(joinText(nameToks), warn, 'spillernavn');
    if (!spillerNavn) continue;
    const posText = cleanText(joinText(posToks));
    const posisjon = posText ? (KJENTE_POSISJONER.find((p) => p.toLowerCase() === posText.toLowerCase()) ?? posText) : null;
    if (posisjon && !KJENTE_POSISJONER.includes(posisjon)) warn(`Ukjent posisjon "${posisjon}" for ${spillerNavn} (${navn})`);
    // Lange navn brytes til neste linje, uten draktnr: "Sigve Alexander Wergeland" / "Strand"
    const forrige = spillere.at(-1);
    if (draktnr === null && forrige && forrige.start === (section === 'start')) {
      forrige.navn = cleanText(`${forrige.navn} ${spillerNavn}`);
      forrige.posisjon ??= posisjon;
      if (kaptein) forrige.kaptein = true;
      continue;
    }
    const skjult = erSkjultNavn(spillerNavn);
    spillere.push({ draktnr, navn: spillerNavn, posisjon, start: section === 'start', kaptein, ...(skjult ? { skjult } : {}) });
  }
  // Hovedtrener kan mangle i rapporten (feltet er tomt) – det er ikke en feil
  return { navn, spillere, hovedtrener, formasjon: formasjon(spillere) };
}

/**
 * Formasjon fra startelleveren uten keeper og strøkne, f.eks. "4-3-3".
 * Har laget ført opp flere enn 10 utespillere med posisjon (hele troppen), finnes ingen formasjon.
 */
export function formasjon(spillere: MediaSpiller[]): string | null {
  const start = spillere.filter((s) => s.start && s.posisjon && s.posisjon !== 'Strøket');
  const count = (p: string) => start.filter((s) => s.posisjon === p).length;
  const linjer = [count('Forsvar'), count('Midtbane'), count('Angrep')];
  const utespillere = linjer.reduce((a, b) => a + b, 0);
  if (utespillere === 0 || utespillere > 10 || count('Keeper') > 1) return null;
  return linjer.filter((n) => n > 0).join('-');
}
