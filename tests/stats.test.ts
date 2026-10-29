import { describe, expect, it } from 'vitest';
import { buildDb } from '../src/lib/db.ts';
import { linkMedia, skjulNavn, skjulteSpillere } from '../src/lib/link.ts';
import { foreslaDuplikater, malSjekk } from '../src/lib/review.ts';
import { filtrerSesong, lagStat, plasseringer, spillerStat, toppliste } from '../src/lib/stats.ts';
import type { Mediarapport } from '../src/lib/types.ts';
import { kamp, lag, leder, raw, spiller } from './helpers.ts';

// Fire handlagde kamper over to sesonger
const K1 = kamp(
  '1001',
  '2026-04-01',
  lag(
    'Djerv 2',
    [
      spiller('Ola Nordmann', { mal: [10, 80], gule: [30] }),
      spiller('Kari Hansen'),
      spiller('Per Innbytter', { innbytter: true }),
    ],
    [leder('Trude Trener', 'Trener')],
  ),
  lag('Motstander A', [spiller('Xavier Scorer', { mal: [55] })]),
  [2, 1],
);
const K2 = kamp(
  '1002',
  '2026-05-01',
  lag('Motstander B', [spiller('Yngve Y')]),
  lag('Djerv 2', [
    spiller('Ola Nordmann', { rodeDirekte: [70] }),
    spiller('Kari Hansen', { kaptein: true }),
    spiller('Per Innbytter', { spilt: false, draktnr: 0 }),
  ]),
  [0, 0],
);
const K3 = kamp(
  '1003',
  '2025-06-01',
  lag('Djerv 2', [spiller('Ola Nordman', { gule: [40], rodeAdv2: [85] }), spiller('Per Innbytter', { innbytter: true, mal: [60] })], [
    leder('Kari Hansen', 'Kontaktperson'),
  ]),
  lag('Motstander A', [spiller('Xavier Scorer', { mal: [5, 15, 25] })]),
  [1, 3],
);
const K4 = kamp(
  '1004',
  '2025-07-01',
  lag('Djerv 2', [spiller('Kari Hansen', { mal: [20] }), spiller('Ola Nordmann')]),
  lag('Motstander C', [spiller('Zorro Z')]),
  [2, 0],
);
const meta = {
  '1001': { brukte_innbyttere: [{ navn: 'Per Innbytter', minutt: 60 }] },
  '1004': { selvmal: [{ minutt: 50, til: 'djerv' as const, spiller: 'Zorro Z' }] },
};
const alias = { alias: { 'Ola Nordman': 'Ola Nordmann' } };
const db = buildDb(raw([K1, K2, K3, K4], { meta, alias }));
const person = (navn: string) => db.personer.find((p) => p.navn === navn)!;

describe('lagStat', () => {
  it('teller seire, uavgjort, tap, mål, poeng og kort fra vårt ståsted', () => {
    expect(lagStat(db.kamper)).toEqual({
      kamper: 4,
      seire: 2,
      uavgjort: 1,
      tap: 1,
      malFor: 5,
      malMot: 4,
      malforskjell: 1,
      poeng: 7,
      gule: 2,
      rode: 2,
    });
  });

  it('håndterer bortekamper og sesongfilter', () => {
    const s2026 = db.kamper.filter((k) => k.sesong === 2026);
    expect(lagStat(s2026)).toMatchObject({ kamper: 2, seire: 1, uavgjort: 1, malFor: 2, malMot: 1, poeng: 4 });
    expect(db.kampMap.get('1002')!.side).toBe('borte');
    expect(db.kampMap.get('1002')!.motstander).toBe('Motstander B');
  });

  it('bruker poengregelen fra innstillingene', () => {
    expect(lagStat(db.kamper, { seier: 2, uavgjort: 1, tap: 0 }).poeng).toBe(5);
  });
});

describe('spillerStat', () => {
  it('summerer kamper i troppen, mål og kort (Adv. 2 og direkte hver for seg)', () => {
    const st = spillerStat(person('Ola Nordmann').spillerKamper);
    expect(st).toMatchObject({
      kamper: 4,
      startet: 4,
      innbytter: 0,
      mal: 2,
      gule: 2,
      rodeAdv2: 1,
      rodeDirekte: 1,
      rode: 2,
      seire: 2,
      uavgjort: 1,
      tap: 1,
      seiersprosent: 50,
      sesonger: [2025, 2026],
    });
    expect(st.forste!.kampnr).toBe('1003');
    expect(st.siste!.kampnr).toBe('1002');
  });

  it('teller ikke spiller uten kryss i "Spilt"', () => {
    const st = spillerStat(person('Per Innbytter').spillerKamper);
    expect(st.kamper).toBe(2);
    expect(st.innbytter).toBe(2);
    expect(st.startet).toBe(0);
    expect(st.innbyttet).toBe(1); // registrert i metadata for kamp 1001
    expect(st.mal).toBe(1);
  });

  it('teller kamper som kaptein og filtrerer på sesong', () => {
    const kari = person('Kari Hansen');
    expect(spillerStat(kari.spillerKamper).kaptein).toBe(1);
    expect(spillerStat(filtrerSesong(kari.spillerKamper, 2025)).kamper).toBe(1);
  });
});

describe('personer', () => {
  it('slår sammen alias til én person med navnevarianter', () => {
    const ola = person('Ola Nordmann');
    expect(ola.varianter).toEqual(['Ola Nordman', 'Ola Nordmann']);
    expect(db.personer.filter((p) => p.navn.startsWith('Ola'))).toHaveLength(1);
    expect(ola.slug).toBe('ola-nordmann');
  });

  it('samme person kan være spiller og leder', () => {
    const kari = person('Kari Hansen');
    expect(kari.spillerKamper).toHaveLength(3);
    expect(kari.lederKamper.map((l) => l.l.funksjon)).toEqual(['Kontaktperson']);
  });

  it('gir ikke motstandere egne personsider', () => {
    expect(db.personer.some((p) => p.navn === 'Xavier Scorer')).toBe(false);
  });

  it('foreslår duplikater uten alias, men slår ikke sammen', () => {
    const uten = buildDb(raw([K1, K3]));
    expect(uten.personer.filter((p) => p.navn.startsWith('Ola'))).toHaveLength(2);
    const d = foreslaDuplikater(uten, raw([K1, K3]));
    expect(d.map((x) => [x.a.navn, x.b.navn].sort())).toContainEqual(['Ola Nordman', 'Ola Nordmann']);
  });

  it('foreslår navn der det ene er en del av det andre, og respekterer ikke_samme_person', () => {
    const a = kamp('2001', '2025-01-01', lag('Djerv 2', [spiller('Kay Magne Pedersen')]), lag('X', []), [0, 0]);
    const b = kamp('2002', '2026-01-01', lag('Djerv 2', [spiller('Kay-Magne Larsen Pedersen')]), lag('X', []), [0, 0]);
    const r = raw([a, b]);
    expect(foreslaDuplikater(buildDb(r), r)).toHaveLength(1);
    const r2 = raw([a, b], { alias: { ikke_samme_person: [['Kay Magne Pedersen', 'Kay-Magne Larsen Pedersen']] } });
    expect(foreslaDuplikater(buildDb(r2), r2)).toHaveLength(0);
  });
});

describe('hendelser og målsjekk', () => {
  it('sorterer hendelser og regner ut stillingen', () => {
    const k = db.kampMap.get('1001')!;
    expect(k.hendelser.map((e) => [e.minutt, e.type, e.navn])).toEqual([
      [10, 'mal', 'Ola Nordmann'],
      [30, 'gult', 'Ola Nordmann'],
      [55, 'mal', 'Xavier Scorer'],
      [80, 'mal', 'Ola Nordmann'],
    ]);
    expect(k.hendelser.filter((e) => e.type === 'mal').map((e) => e.stilling)).toEqual([
      [1, 0],
      [1, 1],
      [2, 1],
    ]);
  });

  it('selvmål fra metadata teller for laget som fikk det, men ikke som spillermål', () => {
    const k = db.kampMap.get('1004')!;
    const sm = k.hendelser.find((e) => e.selvmal)!;
    expect([sm.side, sm.minutt, sm.navn]).toEqual(['hjemme', 50, 'Zorro Z']);
    expect(k.ukjenteMal).toEqual({ hjemme: 0, borte: 0 });
    expect(malSjekk(K4, meta['1004'])).toEqual([]);
    expect(malSjekk(K4)).toHaveLength(1);
  });

  it('viser ukjent målscorer i stedet for å gjette', () => {
    const d = buildDb(raw([K4]));
    expect(d.kamper[0].ukjenteMal.hjemme).toBe(1);
    expect(d.kamper[0].hendelser.some((e) => e.type === 'mal' && e.navn === null)).toBe(true);
  });

  it('godtar mål etter 90 minutter', () => {
    const k = kamp('3001', '2025-01-01', lag('Djerv 2', [spiller('Sen Scorer', { mal: [94] })]), lag('X', []), [1, 0]);
    expect(malSjekk(k)).toEqual([]);
  });

  it('ikke_spilt i metadata fjerner spilleren fra troppen', () => {
    const d = buildDb(raw([K1], { meta: { '1001': { ikke_spilt: ['Kari Hansen'] } } }));
    expect(d.kamper[0].hjemme.spillere.map((s) => s.navn)).not.toContain('Kari Hansen');
  });
});

describe('topplister', () => {
  it('rangerer med delte plasser, og færre kamper først ved likt', () => {
    const rader = toppliste(db.personer, 'mal');
    expect(rader.map((r) => [r.person.navn, r.verdi])).toEqual([
      ['Ola Nordmann', 2],
      ['Per Innbytter', 1],
      ['Kari Hansen', 1],
    ]);
    expect(plasseringer(rader, (r) => r.verdi)).toEqual([1, 2, 2]);
  });

  it('filtrerer på sesong og utelater spillere med 0', () => {
    expect(toppliste(db.personer, 'mal', 2026).map((r) => r.person.navn)).toEqual(['Ola Nordmann']);
    expect(toppliste(db.personer, 'rode', 2025).map((r) => [r.person.navn, r.stat.rodeAdv2, r.stat.rodeDirekte])).toEqual([
      ['Ola Nordmann', 1, 0],
    ]);
  });

  it('beregner kort per kamp med minimum antall kamper', () => {
    const rader = toppliste(db.personer, 'kortPerKamp', null, 3);
    expect(rader.map((r) => [r.person.navn, r.verdi])).toEqual([['Ola Nordmann', 1]]);
  });
});

describe('kobling av mediarapport', () => {
  const media = (over: Partial<Mediarapport> = {}): Mediarapport => ({
    type: 'mediarapport',
    versjon: 1,
    id: 'm1',
    turnering: null,
    dato: '2026-04-01',
    avspark: '15:00',
    bane: 'Testbanen',
    dommer: null,
    hjemmelag: { navn: 'Djerv 2', spillere: [], hovedtrener: null, formasjon: null },
    bortelag: { navn: 'Motstander A', spillere: [], hovedtrener: null, formasjon: null },
    kampnrHint: null,
    advarsler: [],
    kilde: 'test',
    ...over,
  });

  it('kobler på dato, avspark og lagnavn', () => {
    expect(linkMedia([media()], [K1, K2], {})[0].kampnr).toBe('1001');
  });

  it('legger den i review når ingen kamp passer (f.eks. kamprapporten kommer senere)', () => {
    const l = linkMedia([media({ avspark: '18:00' })], [K1], {})[0];
    expect(l.kampnr).toBeNull();
    expect(l.problem).toMatch(/Fant ingen kamp/);
  });

  it('legger den i review når flere kamper passer', () => {
    const dobbel = { ...K1, kampnr: '1009' };
    const l = linkMedia([media({ bane: null })], [K1, dobbel], {})[0];
    expect(l.kampnr).toBeNull();
    expect(l.problem).toMatch(/Flere kamper/);
  });

  it('kan tvinges via matches-meta.yaml', () => {
    expect(linkMedia([media({ avspark: '18:00' })], [K1], { '1001': { mediarapport: 'm1' } })[0].kampnr).toBe('1001');
  });

  it('skjuler navn som NFF har skjult ("Personinfo ikke tilgjengelig"), koblet på draktnr', () => {
    const k = structuredClone(K1);
    k.bortelag.spillere[0].draktnr = 20;
    k.advarsler = ['Noe om Xavier Scorer'];
    const m = media({
      bortelag: {
        navn: 'Motstander A',
        spillere: [{ draktnr: 20, navn: 'Personinfo ikke tilgjengelig', posisjon: 'Forsvar', start: true, kaptein: false, skjult: true }],
        hovedtrener: null,
        formasjon: null,
      },
    });
    const skjulte = skjulteSpillere([m], [k], {});
    expect(skjulte.get('1001')).toEqual([{ side: 'borte', draktnr: 20 }]);
    expect(skjulNavn(k, skjulte.get('1001')!)).toBe(1);
    const p = k.bortelag.spillere[0];
    expect([p.navn, p.fornavn, p.etternavn, p.skjult]).toEqual(['Navn ikke tilgjengelig', '', '', true]);
    expect(JSON.stringify(k)).not.toContain('Xavier');
    // Målet teller fortsatt, men uten navn og uten koblingsmerknader
    const d = buildDb(raw([k], { media: [m] }));
    const e = d.kamper[0].hendelser.find((h) => h.side === 'borte' && h.type === 'mal')!;
    expect([e.navn, e.slug]).toEqual(['Navn ikke tilgjengelig', null]);
    expect(d.lineupMerknader.get('1001') ?? []).not.toContainEqual(expect.stringContaining('Navn ikke tilgjengelig'));
    expect(skjulNavn(k, skjulte.get('1001')!)).toBe(0);
  });

  it('skjuler egne spillere via "skjul" i metadata, uten egen spillerside', () => {
    const k = structuredClone(K1);
    k.hjemmelag.spillere[1].draktnr = 5;
    const meta = { '1001': { skjul: [{ lag: 'djerv' as const, draktnr: 5 }] } };
    skjulNavn(k, skjulteSpillere([], [k], meta).get('1001')!);
    const d = buildDb(raw([k], { meta }));
    expect(d.personer.map((p) => p.navn)).not.toContain('Kari Hansen');
    expect(d.personer.map((p) => p.navn)).not.toContain('Navn ikke tilgjengelig');
    expect(d.kamper[0].hjemme.spillere.find((s) => s.skjult)?.slug).toBeNull();
  });
});
