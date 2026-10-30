import { describe, expect, it } from 'vitest';
import {
  alleForlop,
  antallKolonner,
  baller,
  fordeling,
  forlop,
  kolonne,
  malNokkel,
  median,
  rullerende,
  scorere,
  sesongKurver,
  varmeSesong,
  varmeSpillere,
} from '../src/lib/figurdata.ts';
import type { KampData, MalPunkt } from '../src/lib/maltid.ts';

const p = (m: number, n: string | null = 'Ola', extra: Partial<MalPunkt> = {}): MalPunkt => ({ m, n, o: m <= 45 ? 1 : 2, ...extra });
function kamp(id: string, dato: string, f: MalPunkt[], m: MalPunkt[], extra: Partial<KampData> = {}): KampData {
  return {
    id,
    dato,
    sesong: Number(dato.slice(0, 4)),
    sted: 'hjemme',
    mot: 'Neptun',
    motSlug: 'neptun',
    trener: null,
    poeng: f.length > m.length ? 3 : f.length === m.length ? 1 : 0,
    tittel: id,
    antallFor: f.length,
    antallMot: m.length,
    for: f,
    motMal: m,
    forKomplett: true,
    motKomplett: true,
    kortFor: [],
    kortMot: [],
    ...extra,
  };
}
const A = kamp('a', '2025-05-01', [p(10), p(92, 'Kari')], [p(10, 'X')]);
const B = kamp('b', '2026-05-01', [p(10, 'Kari'), p(46)], []);
const C = kamp('c', '2026-06-01', [], [p(45, 'X'), p(47, 'Y')]);

describe('ballediagram', () => {
  it('legger minutt i kolonner, og tilleggstid i egen kolonne', () => {
    expect(antallKolonner(1)).toBe(91);
    expect(antallKolonner(3)).toBe(31);
    expect([kolonne(1, 1), kolonne(90, 1), kolonne(91, 1), kolonne(94, 1)]).toEqual([0, 89, 90, 90]);
    expect([kolonne(1, 3), kolonne(3, 3), kolonne(4, 3), kolonne(90, 3), kolonne(92, 3)]).toEqual([0, 0, 1, 29, 30]);
  });

  it('stabler kronologisk fra midtlinjen, hver side for seg, og merker første mål', () => {
    const { baller: b, maksFor, maksMot } = baller([B, A, C], 1);
    expect([maksFor, maksMot]).toEqual([2, 1]);
    const ti = b.filter((x) => x.kol === 9 && x.side === 'for');
    expect(ti.map((x) => [x.kamp.id, x.rad, x.forste])).toEqual([
      ['a', 0, true],
      ['b', 1, true],
    ]);
    expect(b.find((x) => x.m === 92)).toMatchObject({ kol: 90, forste: false });
    expect(b.map((x) => x.orden)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('regner nøkkeltall', () => {
    expect(malNokkel([A, B, C])).toEqual({ antallFor: 4, antallMot: 3, medianFor: 10, medianMot: 45, andreFor: 0.5, andreMot: 1 / 3 });
    expect(median([])).toBeNull();
    expect(median([1, 2, 3])).toBe(2);
    expect(malNokkel([])).toMatchObject({ medianFor: null, andreFor: null });
  });
});

describe('fordeling og forløp', () => {
  it('fordeler mål på bolker med tilleggstid i siste bolk', () => {
    const f = fordeling([A, B, C], 15);
    expect(f.map((x) => x.navn)).toEqual(['0–15', '16–30', '31–45', '46–60', '61–75', '76–90+']);
    expect(f[0]).toMatchObject({ for: 2, mot: 1 });
    expect(f[5]).toMatchObject({ for: 1, mot: 0 });
    expect(f[3]).toMatchObject({ for: 1, mot: 1 });
    expect(fordeling([A], 5)).toHaveLength(18);
    expect(fordeling([], 5)[0].navn).toBe('0–5');
    expect(fordeling([], 5)[1].navn).toBe('6–10');
  });

  it('følger målforskjellen minutt for minutt', () => {
    const l = forlop(A);
    expect([l[0], l[9], l[10], l[89], l[90]]).toEqual([0, 0, 0, 0, 1]);
    const c = forlop(C);
    expect([c[44], c[45], c[47], c[90]]).toEqual([0, -1, -2, -2]);
  });

  it('holder kamper med manglende mål utenfor snittet', () => {
    const r = alleForlop([A, C, kamp('d', '2026-07-01', [p(1)], [], { motKomplett: false })]);
    expect(r.grunnlag).toBe(2);
    expect(r.snitt[90]).toBe((1 - 2) / 2);
  });

  it('regner rullerende snitt med mål uten minutt medregnet', () => {
    const d = kamp('d', '2026-07-01', [], [], { antallFor: 4, antallMot: 1 });
    const r = rullerende([A, B, C, d], 2);
    expect(r.map((x) => x.kamp.id)).toEqual(['b', 'c', 'd']);
    expect(r[2]).toMatchObject({ for: 2, mot: 1.5 });
    expect(rullerende([A], 5)).toEqual([]);
  });
});

describe('sesong og varmekart', () => {
  it('regner sesongkurver', () => {
    expect(sesongKurver([A, B, C])).toEqual([
      { sesong: 2025, kamper: 1, malFor: 2, malMot: 1, poeng: 3 },
      { sesong: 2026, kamper: 2, malFor: 1, malMot: 1, poeng: 1.5 },
    ]);
  });

  it('lager varmekart per sesong og spiller, uten selvmål', () => {
    expect(varmeSesong([A, B, C], 'mot')).toEqual([
      { navn: '2026', verdier: [0, 0, 1, 1, 0, 0] },
      { navn: '2025', verdier: [1, 0, 0, 0, 0, 0] },
    ]);
    const med = kamp('e', '2026-01-01', [p(5, 'X', { s: 1 }), p(5, 'Ola')], []);
    const v = varmeSpillere([A, med]);
    expect(v.map((x) => [x.navn, x.sum])).toEqual([['Ola', 2], ['Kari', 1]]);
    expect(v[1].verdier).toEqual([0, 0, 0, 0, 0, 1]);
    expect(scorere([A, med])[0]).toEqual({ navn: 'Ola', mal: 2 });
  });
});
