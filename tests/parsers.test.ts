import { beforeAll, describe, expect, it } from 'vitest';
import { parseKamprapport } from '../src/lib/parse/kamprapport.ts';
import { parseMediarapport } from '../src/lib/parse/mediarapport.ts';
import { readPdf, type PdfPage, type TextToken } from '../src/lib/parse/pdf-text.ts';
import type { Kamprapport, Mediarapport, RapportLag } from '../src/lib/types.ts';

const FIX = 'tests/fixtures';
const opts = (kilde: string) => ({ lagPrefix: 'Djerv 2', kilde });

const pages: Record<string, PdfPage> = {};
beforeAll(async () => {
  for (const f of [
    'Kamprapport-12120601129',
    'Kamprapport-12120603044',
    'Kamprapport-12120604081',
    'Mediareport_12120604081',
  ]) {
    pages[f] = (await readPdf(`${FIX}/${f}.pdf`))[0];
  }
});

const k = (f: string) => parseKamprapport(pages[f], opts(f));
const spiller = (lag: RapportLag, navn: string) => {
  const s = lag.spillere.find((p) => p.navn === navn);
  if (!s) throw new Error(`Fant ikke ${navn} i ${lag.navn}`);
  return s;
};
const scorers = (lag: RapportLag) =>
  lag.spillere
    .flatMap((p) => p.mal.map((m) => [p.navn, m] as const))
    .sort((a, b) => a[1] - b[1]);
const ledere = (lag: RapportLag) => lag.ledere.map((l) => [l.navn, l.funksjon]);

describe('kamprapport 12120601129 (2023, avd. 01)', () => {
  let r: Kamprapport;
  beforeAll(() => (r = k('Kamprapport-12120601129')));

  it('leser kampinfo', () => {
    expect(r.kampnr).toBe('12120601129');
    expect([r.hjemmelag.navn, r.bortelag.navn]).toEqual(['Djerv 2', 'Sædalen 2']);
    expect(r.resultat).toEqual({ hjemme: 0, borte: 2 });
    expect(r.pause).toEqual({ hjemme: 0, borte: 0 });
    expect([r.dato, r.avspark, r.sesong]).toEqual(['2023-10-28', '13:00', 2023]);
    expect(r.bane).toBe('Møhlenpris idrettsplass');
    expect(r.turnering).toBe('6. div. Menn avd. 01');
    expect(r.dommer).toEqual({ navn: 'Mats Frisk-Olsen', klubb: 'Badebyen Drøbak Fotballklubb' });
    expect(r.dommerveileder).toEqual({ navn: 'Egil Flo', klubb: 'Ny-Krohnborg I.L' });
    expect(r.kampvertTilstede).toBe('Vet ikke');
    expect(r.djerv).toBe('hjemme');
    expect(r.eeo).toBeNull();
    expect(r.straffekonk).toBeNull();
  });

  it('leser kort for Djerv (gult + direkte rødt i samme kamp)', () => {
    const havag = spiller(r.hjemmelag, 'Simen Elias Knutsvik Håvåg');
    expect(havag.draktnr).toBe(2);
    expect(havag.gule).toEqual([23]);
    expect(havag.rodeDirekte).toEqual([66]);
    expect(havag.rodeAdv2).toEqual([]);
    const bull = spiller(r.hjemmelag, 'Peter Schau Bull');
    expect([bull.draktnr, bull.gule]).toEqual([4, [82]]);
    expect(scorers(r.hjemmelag)).toEqual([]);
  });

  it('leser innbyttere', () => {
    const inn = r.hjemmelag.spillere.filter((s) => s.innbytter).map((s) => s.navn);
    expect(inn).toEqual([
      'August Trønnes',
      'Oskar Johann Rasmussen',
      'Lars Lønnebotn Svendsgård',
      'Øystein Emdal Midtvik',
      'Sjur Mjør',
    ]);
    expect(r.hjemmelag.spillere.filter((s) => !s.innbytter)).toHaveLength(11);
    expect(r.hjemmelag.spillere.every((s) => s.spilt)).toBe(true);
  });

  it('leser Sædalen: mål, gule og kaptein', () => {
    expect(scorers(r.bortelag)).toEqual([
      ['Benjamin Bjånesø Baxter', 76],
      ['Magnus Heimdal', 84],
    ]);
    expect(spiller(r.bortelag, 'Benjamin Bjånesø Baxter').gule).toEqual([51]);
    expect(spiller(r.bortelag, 'Julian Øvreeide Clausen').gule).toEqual([80]);
    expect(spiller(r.bortelag, 'Ole Aleksander Rakner').gule).toEqual([82]);
    expect(spiller(r.bortelag, 'Mustaf Said Ahmed').gule).toEqual([34]);
    expect(r.bortelag.spillere.filter((s) => s.kaptein).map((s) => s.navn)).toEqual(['Emil Myklebust Artmeyer']);
    expect(r.hjemmelag.spillere.some((s) => s.kaptein)).toBe(false);
  });

  it('leser ledere', () => {
    expect(ledere(r.hjemmelag)).toEqual([
      ['Mads Didrik Hafstad Storebø', 'Trener'],
      ['Tomas Emdal Midtvik', 'Kontaktperson'],
      ['Ulle Opheim', 'Ass.trener'],
    ]);
  });

  it('gir ingen advarsler', () => expect(r.advarsler).toEqual([]));
});

describe('kamprapport 12120603044 (2025, avd. 03)', () => {
  let r: Kamprapport;
  beforeAll(() => (r = k('Kamprapport-12120603044')));

  it('leser kampinfo uten dommerveileder', () => {
    expect([r.hjemmelag.navn, r.bortelag.navn]).toEqual(['Djerv 2', 'Baune 2']);
    expect(r.resultat).toEqual({ hjemme: 3, borte: 3 });
    expect(r.pause).toEqual({ hjemme: 0, borte: 2 });
    expect([r.dato, r.avspark]).toEqual(['2025-04-05', '16:00']);
    expect(r.turnering).toBe('6. div. menn avd. 03');
    expect(r.dommer).toEqual({ navn: 'Hadi Abdullah', klubb: 'Ørnen idrettslag' });
    expect(r.dommerveileder).toBeNull();
  });

  it('leser mål og kort', () => {
    expect(scorers(r.hjemmelag)).toEqual([
      ['Tord Fares Jonsson Abd Rabo', 46],
      ['Ahmed Attafi', 50],
      ['Isak Wulff Gaasland', 55],
    ]);
    expect(spiller(r.hjemmelag, 'Eirik Flatråker Møgster').gule).toEqual([83]);
    expect(scorers(r.bortelag)).toEqual([
      ['Vebjørn Litsheim Løkkebø', 7],
      ['Marius Ylvisåker', 30],
      ['Halvor Fretland', 94],
    ]);
  });

  it('godtar mål etter 90 minutter', () => {
    expect(spiller(r.bortelag, 'Halvor Fretland').mal).toEqual([94]);
  });

  it('leser ledere med ulike funksjoner', () => {
    expect(ledere(r.hjemmelag)).toEqual([
      ['Håvard Waage Hjelmeland', 'Trener'],
      ['Kay Magne Pedersen', 'Ass.trener'],
      ['Marcus Refvik', 'Keepertrener'],
      ['Øystein Midtvik', 'Kampvert'],
    ]);
  });

  it('draktnr for Even Klubben Sortland er 7 i denne kampen', () => {
    expect(spiller(r.hjemmelag, 'Even Klubben Sortland').draktnr).toBe(7);
  });
});

describe('kamprapport 12120604081 (2026, avd. 04)', () => {
  let r: Kamprapport;
  beforeAll(() => (r = k('Kamprapport-12120604081')));

  it('leser kampinfo', () => {
    expect([r.hjemmelag.navn, r.bortelag.navn]).toEqual(['Djerv 2', 'Kvernbit 2']);
    expect(r.resultat).toEqual({ hjemme: 5, borte: 3 });
    expect(r.pause).toEqual({ hjemme: 4, borte: 1 });
    expect([r.dato, r.avspark]).toEqual(['2026-10-18', '15:00']);
    expect(r.turnering).toBe('6. div. menn avd. 04');
    expect(r.bane).toBe('Møhlenpris idrettsplass');
    expect(r.dommer).toEqual({ navn: 'Andres Diaz Fonseca', klubb: 'I.L. Averøykameratene' });
    expect(r.dommerveileder).toEqual({ navn: 'Leif Inge Harkestad', klubb: 'Varegg Fotball' });
    expect(r.kampvertTilstede).toBe('Ja');
    expect(r.tilskuere).toBe(0);
  });

  it('leser Djerv-mål (to mål på samme spiller) og gule', () => {
    expect(scorers(r.hjemmelag)).toEqual([
      ['Ole Askevold Vaaler', 29],
      ['Bilal Abdiqani Said', 36],
      ['Kasper Lødemel', 44],
      ['Olav Gudmundsen', 45],
      ['Ole Askevold Vaaler', 80],
    ]);
    expect(spiller(r.hjemmelag, 'Ole Askevold Vaaler').mal).toEqual([29, 80]);
    expect(spiller(r.hjemmelag, 'Olav Gudmundsen').gule).toEqual([14]);
    expect(spiller(r.hjemmelag, 'Daniel Strømmen').gule).toEqual([34]);
    expect(spiller(r.hjemmelag, 'Eirik Flatråker Møgster').gule).toEqual([78]);
  });

  it('leser Kvernbit', () => {
    expect(scorers(r.bortelag)).toEqual([
      ['Lars Noah Hopland Bøhn', 13],
      ['Adrian Rød-Jensen', 52],
      ['Adrian Rød-Jensen', 70],
    ]);
    expect(spiller(r.bortelag, 'Lorentz Julian Sæterstøl').gule).toEqual([86]);
  });

  it('strøket spiller (draktnr 0) er ikke spilt, men er samtidig leder', () => {
    const bull = spiller(r.hjemmelag, 'Peter Schau Bull');
    expect(bull.draktnr).toBe(0);
    expect(bull.spilt).toBe(false);
    expect(r.hjemmelag.spillere.filter((s) => s.spilt)).toHaveLength(17);
    expect(ledere(r.hjemmelag)).toEqual([
      ['Peter Schau Bull', 'Kontaktperson'],
      ['Kay-Magne Larsen Pedersen', 'Trener'],
      ['Øystein Emdal Midtvik', 'Trener'],
    ]);
  });

  it('draktnr for Even Klubben Sortland er 22 i denne kampen', () => {
    expect(spiller(r.hjemmelag, 'Even Klubben Sortland').draktnr).toBe(22);
  });
});

/** Lager en kopi av siden med flyttede/ekstra tokens. */
function variant(page: PdfPage, fn: (t: TextToken) => TextToken, extra: TextToken[] = []): PdfPage {
  return { ...page, tokens: [...page.tokens.map(fn), ...extra] };
}

describe('kolonnemapping', () => {
  it('finner kolonnene fra overskriftene selv om layouten forskyves og strekkes', () => {
    const orig = k('Kamprapport-12120604081');
    const shifted = variant(pages['Kamprapport-12120604081'], (t) => ({
      ...t,
      x0: t.x0 * 1.04 + 7,
      x1: t.x1 * 1.04 + 7,
    }));
    const r = parseKamprapport({ ...shifted, width: shifted.width * 1.04 + 7 }, opts('x'));
    expect(r.hjemmelag).toEqual(orig.hjemmelag);
    expect(r.bortelag).toEqual(orig.bortelag);
  });

  it('skiller alle tre kortkolonnene, og varsler om Utv. (Adv. 2)', () => {
    const page = pages['Kamprapport-12120601129'];
    const hdr = (text: string) => page.tokens.find((t) => t.rotated && t.text === text && t.x0 < 400)!;
    const adv1 = hdr('Adv. 1');
    const adv2 = hdr('Utv. (Adv. 2)');
    const dir = hdr('Utv. (Direkte)');
    // Raden til Peter Schau Bull (har gult 82' i Adv. 1)
    const bullRow = page.tokens.find((t) => t.text === 'Bull' && t.x0 < 400)!;
    const cell = (text: string, colX: number, nextX: number): TextToken => {
      const mid = (colX + nextX) / 2 + 3;
      return { text, x0: mid - 3, x1: mid + 3, y0: bullRow.y0, y1: bullRow.y1, y: bullRow.y, rotated: false };
    };
    const r = parseKamprapport(
      variant(page, (t) => t, [cell('88', adv2.x0, dir.x0), cell('90', dir.x0, dir.x0 + 30)]),
      opts('x'),
    );
    const bull = spiller(r.hjemmelag, 'Peter Schau Bull');
    expect(bull.gule).toEqual([82]);
    expect(bull.rodeAdv2).toEqual([88]);
    expect(bull.rodeDirekte).toEqual([90]);
    expect(adv1.x0).toBeLessThan(adv2.x0);
    expect(r.advarsler.some((a) => a.startsWith('KONTROLLER') && a.includes('Peter Schau Bull') && a.includes("88'"))).toBe(true);
  });

  it('godtar overskrifter som kommer som flere roterte biter', () => {
    const page = pages['Kamprapport-12120601129'];
    const split = page.tokens.flatMap((t): TextToken[] => {
      if (!t.rotated || t.text !== 'Utv. (Adv. 2)') return [t];
      const h = (t.y1 - t.y0) / 3;
      return [
        { ...t, text: 'Utv.', y0: t.y1 - h, y1: t.y1 },
        { ...t, text: '(Adv.', y0: t.y1 - 2 * h, y1: t.y1 - h },
        { ...t, text: '2)', y0: t.y0, y1: t.y1 - 2 * h },
      ];
    });
    const r = parseKamprapport({ ...page, tokens: split }, opts('x'));
    expect(r.advarsler).toEqual([]);
    expect(spiller(r.hjemmelag, 'Simen Elias Knutsvik Håvåg').rodeDirekte).toEqual([66]);
  });
});

describe('mediarapport 18.10.2026 (Djerv 2 - Kvernbit 2)', () => {
  let m: Mediarapport;
  beforeAll(() => (m = parseMediarapport(pages['Mediareport_12120604081'], { kilde: 'x', kampnrHint: '12120604081' })));

  it('leser kampinfo', () => {
    expect([m.dato, m.avspark, m.bane]).toEqual(['2026-10-18', '15:00', 'Møhlenpris idrettsplass']);
    expect(m.turnering).toBe('6. div. menn avd. 04');
    expect([m.hjemmelag.navn, m.bortelag.navn]).toEqual(['Djerv 2', 'Kvernbit 2']);
    expect(m.dommer).toBe('Andres Diaz Fonseca');
    expect(m.id).toBe('2026-10-18_djerv-2_kvernbit-2');
  });

  it('beregner formasjon, keeper og hovedtrener for begge lag', () => {
    const keeper = (l: Mediarapport['hjemmelag']) => l.spillere.find((s) => s.start && s.posisjon === 'Keeper')?.navn;
    expect(m.hjemmelag.formasjon).toBe('4-3-3');
    expect(keeper(m.hjemmelag)).toBe('Simen Elias Knutsvik Håvåg');
    expect(m.hjemmelag.hovedtrener).toBe('Øystein Emdal Midtvik');
    expect(m.bortelag.formasjon).toBe('4-5-1');
    expect(keeper(m.bortelag)).toBe('Georg Søgnen-Fjellanger');
    expect(m.bortelag.hovedtrener).toBe('Richard Sherrock');
  });

  it('skiller startellever, strøket og innbyttere', () => {
    const start = m.hjemmelag.spillere.filter((s) => s.start && s.posisjon !== 'Strøket');
    expect(start).toHaveLength(11);
    const bull = m.hjemmelag.spillere.find((s) => s.navn === 'Peter Schau Bull')!;
    expect([bull.draktnr, bull.posisjon]).toEqual([0, 'Strøket']);
    expect(m.hjemmelag.spillere.filter((s) => !s.start).map((s) => s.navn)).toEqual([
      'Marius Claudey',
      'Benjamin Leirvik Nygård',
      'Sondre Sortland Rolfsnes',
      'Abdoulrahmane Diallo',
      'Even Klubben Sortland',
      'Tord Fares Jonsson Abd Rabo',
    ]);
    expect(m.hjemmelag.spillere.find((s) => s.navn === 'Even Klubben Sortland')!.draktnr).toBe(22);
    expect(m.bortelag.spillere.filter((s) => !s.start)).toHaveLength(4);
  });

  it('gir ingen advarsler', () => expect(m.advarsler).toEqual([]));

  it('leser kapteinsmerket "K."', () => {
    const page = pages['Mediareport_12120604081'];
    const name = page.tokens.find((t) => t.text === 'Hjelmeland')!;
    const kTok: TextToken = { ...name, text: 'K.', x0: name.x1 + 4, x1: name.x1 + 12 };
    const r = parseMediarapport({ ...page, tokens: [...page.tokens, kTok] }, { kilde: 'x', kampnrHint: null });
    const p = r.hjemmelag.spillere.find((s) => s.navn === 'Håvard Waage Hjelmeland')!;
    expect(p.kaptein).toBe(true);
    expect(p.posisjon).toBe('Midtbane');
    expect(r.hjemmelag.spillere.filter((s) => s.kaptein)).toHaveLength(1);
  });
});
