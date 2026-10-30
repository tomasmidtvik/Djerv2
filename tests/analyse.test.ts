import { describe, expect, it } from 'vitest';
import {
  bilanse,
  disiplin,
  dommere,
  favoritter,
  hatTricks,
  kampFakta,
  kontaktpersoner,
  lengsteRekke,
  medOgUten,
  motstandere,
  omganger,
  pauseStilling,
  rekorder,
  resultatFordeling,
  sesongRader,
  spillerPar,
  tidspunkt,
  trenere,
  troppRader,
} from '../src/lib/analyse.ts';
import { buildDb } from '../src/lib/db.ts';
import { forsteKort, forsteMal, malTett, medianFraKurve, overlevelse, scorerForst, tilKampData, type KampData } from '../src/lib/maltid.ts';
import { kamp, lag, leder, raw, spiller } from './helpers.ts';

const POENG = { seier: 3, uavgjort: 1, tap: 0 };

// Seks handlagde kamper: 2025 (7. div.) og 2026 (6. div.)
const dj = (spillere: Parameters<typeof lag>[1], ledere: Parameters<typeof lag>[2] = []) => lag('Djerv 2', spillere, ledere);
const A = spiller('Ola Nordmann', { mal: [10, 20, 30], gule: [40] });
const K = [
  kamp('1', '2025-05-05', dj([A, spiller('Kari Hansen')], [leder('Tor Trener', 'Trener'), leder('Kim Kontakt', 'Kontaktperson')]), lag('Baune 2', [spiller('X Scorer', { mal: [60] })]), [3, 1], {
    turnering: '7. div. Menn avd. 01',
    pause: { hjemme: 3, borte: 0 },
    dommer: { navn: 'Dag Dommer', klubb: 'K' },
  }),
  kamp('2', '2025-06-01', lag('Neptun', [spiller('Y Scorer', { mal: [5, 80] })]), dj([spiller('Ola Nordmann', { mal: [50], rodeDirekte: [70] })], [leder('Tor Trener', 'Trener')]), [2, 1], {
    turnering: '7. div. Menn avd. 01',
    pause: { hjemme: 1, borte: 0 },
    dommer: { navn: 'Dag Dommer', klubb: 'K' },
  }),
  kamp('3', '2026-04-01', dj([spiller('Kari Hansen', { mal: [40, 44] })], [leder('Una Trener', 'Trener')]), lag('Baune 2', [spiller('X Scorer', { mal: [1, 2] })]), [2, 2], {
    turnering: '6. div. menn avd. 02',
    pause: { hjemme: 2, borte: 2 },
    dommer: { navn: 'Eva Dommer', klubb: 'L' },
  }),
  kamp('4', '2026-04-15', lag('Baune 2', [spiller('X Scorer', { mal: [15] })]), dj([spiller('Ola Nordmann', { mal: [60, 62] }), spiller('Ny Spiller')], [leder('Tor Trener', 'Trener')]), [1, 2], {
    turnering: '6. div. menn avd. 02',
    pause: { hjemme: 1, borte: 0 },
    avspark: '18:30',
    dommer: { navn: 'Eva Dommer', klubb: 'L' },
  }),
  kamp('5', '2026-05-01', dj([spiller('Ola Nordmann', { mal: [90] }), spiller('Kari Hansen')], [leder('Tor Trener', 'Trener')]), lag('Neptun', []), [1, 0], {
    turnering: '6. div. menn avd. 02',
    pause: null,
    dommer: null,
  }),
  // Motstanderens mål mangler i rapporten
  kamp('6', '2026-05-20', dj([spiller('Ola Nordmann')]), lag('Neptun', []), [0, 3], { turnering: '6. div. menn avd. 02', pause: null, dommer: null }),
];
const db = buildDb(raw(K));
const ks = db.kamper;

describe('lag', () => {
  it('regner bilanse med snitt, poeng og seiersprosent', () => {
    expect(bilanse(ks, POENG)).toMatchObject({ kamper: 6, seire: 3, uavgjort: 1, tap: 2, poeng: 10, malFor: 9, malMot: 9, seierProsent: 50 });
    expect(bilanse(ks).poengPerKamp).toBeCloseTo(10 / 6);
    expect(bilanse([]).seierProsent).toBeNull();
  });

  it('teller resultatfordeling fra vårt ståsted', () => {
    expect(resultatFordeling(ks).find((r) => r.resultat === '2–1')?.antall).toBe(1);
    expect(resultatFordeling(ks).find((r) => r.resultat === '1–2')?.antall).toBe(1);
    expect(resultatFordeling(ks).map((r) => r.antall).reduce((a, b) => a + b)).toBe(6);
  });

  it('snur pausestillingen for bortekamper og utleder den når rapporten mangler den', () => {
    expect(pauseStilling(db.kampMap.get('2')!)).toEqual({ for: 0, mot: 1 });
    expect(pauseStilling(db.kampMap.get('5')!)).toEqual({ for: 0, mot: 0 });
    expect(pauseStilling(db.kampMap.get('6')!)).toBeNull();
  });

  it('finner mål per omgang, snuoperasjoner og tapt ledelse', () => {
    const o = omganger(ks);
    expect([o.for1, o.for2]).toEqual([5, 4]);
    expect([o.mot1, o.mot2]).toEqual([4, 2]);
    expect(o.utenOmgang).toBe(3);
    expect(o.grunnlag).toBe(5);
    expect(o.pause.ledet).toEqual({ kamper: 1, S: 1, U: 0, T: 0 });
    expect(o.pause.bak).toEqual({ kamper: 2, S: 1, U: 0, T: 1 });
    expect(o.snu.map((k) => k.kampnr)).toEqual(['4']);
    expect(o.tapt).toEqual([]);
  });

  it('finner lengste rekke, og om den pågår', () => {
    const seier = lengsteRekke(ks, (k) => k.utfall === 'S');
    expect([seier.lengde, seier.fra?.kampnr, seier.til?.kampnr, seier.paagaar]).toEqual([2, '4', '5', false]);
    expect(lengsteRekke(ks, (k) => k.utfall === 'T').paagaar).toBe(true);
    expect(lengsteRekke(ks, () => false).lengde).toBe(0);
  });

  it('finner rekorder', () => {
    const r = rekorder(ks);
    expect(r.storsteSeier?.verdi).toBe(2);
    expect(r.storsteTap?.kamper[0].kampnr).toBe('6');
    expect(r.flestMal?.verdi).toBe(4);
    expect(r.raskesteMal?.e.minutt).toBe(10);
    expect(r.senesteMal?.e.minutt).toBe(90);
    expect(r.raskesteBaklengs?.e.minutt).toBe(1);
  });

  it('utleder opprykk fra divisjonsnummeret', () => {
    const rader = sesongRader(db);
    expect(rader.map((r) => [r.sesong, r.rykk])).toEqual([
      [2026, 'Opprykk'],
      [2025, null],
    ]);
  });
});

describe('spillere og tropp', () => {
  it('finner hat-tricks og innbytterbidrag', () => {
    expect(hatTricks(db.personer).map((h) => [h.person.navn, h.antall])).toEqual([['Ola Nordmann', 3]]);
    expect(hatTricks(db.personer, 2026)).toEqual([]);
  });

  it('viser "med og uten" bare med nok kamper', () => {
    const ola = db.personer.find((p) => p.navn === 'Kari Hansen')!;
    expect(medOgUten(ola, ks, POENG)).toBeNull();
    const r = medOgUten(ola, ks, POENG, 2);
    expect(r?.med.kamper).toBe(3);
    expect(r?.uten.kamper).toBe(3);
  });

  it('teller nye, sluttede og tropp per sesong', () => {
    const [s2026, s2025] = troppRader(db);
    expect(s2025).toMatchObject({ sesong: 2025, spillere: 2, nye: null, sluttet: null });
    expect(s2026).toMatchObject({ sesong: 2026, spillere: 3, nye: 1, sluttet: 0, tilbake: 0, kamper: 4 });
  });

  it('finner spillerpar', () => {
    expect(spillerPar(ks)[0]).toEqual({ a: 'kari-hansen', b: 'ola-nordmann', kamper: 2 });
  });
});

describe('motstandere, dommere, tid og trenere', () => {
  it('regner møtehistorikk og favoritter', () => {
    const r = motstandere(ks, POENG);
    expect(r.map((x) => [x.navn, x.b.kamper])).toEqual([
      ['Baune 2', 3],
      ['Neptun', 3],
    ]);
    const f = favoritter(r, 1);
    expect(f.favoritter[0].navn).toBe('Baune 2');
    expect(f.skrekk[0].navn).toBe('Neptun');
  });

  it('regner kort per dommer og hjemme/borte', () => {
    const d = dommere(ks, POENG).find((x) => x.navn === 'Dag Dommer')!;
    expect([d.b.kamper, d.kortOss, d.kortMot, d.hjemme.kamper, d.borte.kamper]).toEqual([2, 2, 0, 1, 1]);
  });

  it('grupperer på ukedag, måned, klokkeslett og bane', () => {
    const t = tidspunkt(ks, POENG);
    expect(t.baner[0]).toMatchObject({ navn: 'Testbanen' });
    expect(t.maneder.map((g) => g.navn)).toEqual(['April', 'Mai', 'Juni']);
    expect(t.klokkeslett.map((g) => g.navn)).toEqual(['15:00–15:59', '18:00–18:59']);
    expect(t.ukedager.reduce((n, g) => n + g.b.kamper, 0)).toBe(6);
  });

  it('samler trenere med perioder, og teller kamper uten trener', () => {
    const t = trenere(ks, POENG);
    expect(t.utenTrener).toBe(1);
    const tor = t.rader.find((r) => r.navn === 'Tor Trener')!;
    expect(tor.b.kamper).toBe(4);
    expect(tor.perioder).toEqual([
      { fra: '2025-05-05', til: '2025-06-01', kamper: 2 },
      { fra: '2026-04-15', til: '2026-05-01', kamper: 2 },
    ]);
    expect(kontaktpersoner(ks)[0]).toMatchObject({ navn: 'Kim Kontakt', kamper: 1 });
  });

  it('regner disiplin for oss og motstanderen', () => {
    const d = disiplin(ks);
    expect([d.oss.gule, d.oss.rode, d.mot.gule]).toEqual([1, 1, 0]);
    expect(d.oss.bolker).toEqual([0, 0, 1, 0, 1, 0]);
  });

  it('lager fakta om én kamp', () => {
    const f = kampFakta(db.kampMap.get('1')!);
    expect([f.forste?.minutt, f.siste?.minutt, f.margin, f.totalt, f.ulikeScorere]).toEqual([10, 60, 2, 4, 1]);
    expect(f.malOmgang).toEqual({ for: [3, 0], mot: [0, 1] });
    expect(f.hatTricks.map((s) => s.navn)).toEqual(['Ola Nordmann']);
  });
});

describe('tid til første mål', () => {
  const data = ks.map((k) => tilKampData(k, POENG));

  it('holder kamper uten mål igjen i kurven, ikke som minutt 90', () => {
    const kurve = overlevelse(data, 'for');
    // Kamp 6 har ingen Djerv-mål og blir stående igjen. Mål i minutt 90 teller som mål.
    expect(kurve[0]).toBe(1);
    expect(kurve[90]).toBeCloseTo(1 / 6);
    // Første mål: 10, 40, 50, 60, 90 og ingen. Halvparten har scoret etter minutt 50.
    expect(medianFraKurve(kurve)).toBe(50);
    expect(medianFraKurve([1, 0.8, 0.6])).toBeNull();
  });

  it('holder kamper med ukjente mål utenfor', () => {
    const m = forsteMal(data, 'mot');
    expect(m.grunnlag).toBe(5);
    expect(m.medMal).toBe(4);
    expect(m.utenMal).toBe(1);
    const f = forsteMal(data, 'for');
    expect(f.grunnlag).toBe(6);
    expect(f.utenMal).toBe(1);
    expect(f.snitt).toBeCloseTo((10 + 50 + 40 + 60 + 90) / 5);
    expect(f.innen[0]).toEqual({ minutt: 10, andel: 1 / 6 });
  });

  it('regner hvem som scorer først og poeng etter det', () => {
    const s = scorerForst(data);
    expect(s.grunnlag).toBe(5);
    expect([s.vi, s.de, s.likt]).toEqual([2, 3, 0]);
    expect(s.poengVi).toBe(3);
    expect(s.poengDe).toBeCloseTo((0 + 1 + 3) / 3);
  });

  it('regner tid mellom mål, to mål innen 5 minutter og første kort', () => {
    const t = malTett(data);
    expect(t.kamperMedFlere).toBe(3);
    expect(t.toInnen5).toBe(2);
    const d: KampData[] = data;
    const k = forsteKort(d);
    expect([k.medKort, k.median, k.grunnlag]).toEqual([2, 40, 6]);
  });
});
