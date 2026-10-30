// Regner ut det figurene viser. Ingen tegning her, så alt kan testes (tests/figurdata.test.ts).
import type { KampData, MalPunkt, MalSide } from './maltid.ts';

const SIDER: MalSide[] = ['for', 'mot'];
const mal = (d: KampData, s: MalSide) => (s === 'for' ? d.for : d.motMal);

/** Median av tall (for partall: den laveste av de to midterste, så verdien alltid er et faktisk minutt). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** Kolonne for et minutt. Bolk 1: minutt 1 = kolonne 0. Minutt over 90 samles i egen kolonne ("90+"). */
export const antallKolonner = (bolk: number) => Math.ceil(90 / bolk) + 1;
export const kolonne = (m: number, bolk: number) => (m > 90 ? antallKolonner(bolk) - 1 : Math.max(0, Math.ceil(m / bolk) - 1));

export interface Ball {
  kol: number;
  /** plass i stabelen, 0 er nærmest midtlinjen */
  rad: number;
  side: MalSide;
  m: number;
  navn: string | null;
  selvmal: boolean;
  forste: boolean;
  kamp: KampData;
  /** kronologisk rekkefølge, brukes av animasjonen */
  orden: number;
}

export function baller(data: KampData[], bolk: number) {
  const ut: Ball[] = [];
  const hoyde = { for: new Map<number, number>(), mot: new Map<number, number>() };
  const sortert = [...data].sort((a, b) => a.dato.localeCompare(b.dato));
  let orden = 0;
  for (const d of sortert) {
    for (const side of SIDER) {
      mal(d, side).forEach((p: MalPunkt, i) => {
        const kol = kolonne(p.m, bolk);
        const rad = hoyde[side].get(kol) ?? 0;
        hoyde[side].set(kol, rad + 1);
        ut.push({ kol, rad, side, m: p.m, navn: p.n, selvmal: Boolean(p.s), forste: i === 0, kamp: d, orden: orden++ });
      });
    }
  }
  const maks = (s: MalSide) => Math.max(0, ...hoyde[s].values());
  return { baller: ut, maksFor: maks('for'), maksMot: maks('mot') };
}

export function malNokkel(data: KampData[]) {
  const alle = (s: MalSide) => data.flatMap((d) => mal(d, s));
  const andre = (xs: MalPunkt[]) => (xs.length ? xs.filter((p) => p.o === 2).length / xs.length : null);
  const f = alle('for');
  const m = alle('mot');
  return {
    antallFor: f.length,
    antallMot: m.length,
    medianFor: median(f.map((p) => p.m)),
    medianMot: median(m.map((p) => p.m)),
    andreFor: andre(f),
    andreMot: andre(m),
  };
}

export interface Bolk {
  navn: string;
  for: number;
  mot: number;
}

/** Mål for og mot per 5- eller 15-minuttersbolk. Tilleggstid ligger i siste bolk. */
export function fordeling(data: KampData[], storrelse: number): Bolk[] {
  const n = Math.ceil(90 / storrelse);
  const ut: Bolk[] = Array.from({ length: n }, (_, i) => ({
    navn: `${i ? i * storrelse + 1 : 0}–${(i + 1) * storrelse}${i === n - 1 ? '+' : ''}`,
    for: 0,
    mot: 0,
  }));
  const plass = (m: number) => Math.min(n - 1, Math.max(0, Math.ceil(m / storrelse) - 1));
  for (const d of data) {
    for (const p of d.for) ut[plass(p.m)].for++;
    for (const p of d.motMal) ut[plass(p.m)].mot++;
  }
  return ut;
}

/** Målforskjell (for minus mot) etter hvert minutt 0–90. Tilleggstid regnes som minutt 90. */
export function forlop(d: KampData): number[] {
  const steg = Array.from({ length: 91 }, () => 0);
  for (const p of d.for) steg[Math.min(90, p.m)]++;
  for (const p of d.motMal) steg[Math.min(90, p.m)]--;
  let sum = 0;
  return steg.map((x) => (sum += x));
}

/** Forløp for alle kamper med fullstendige mål, og snittet per minutt. */
export function alleForlop(data: KampData[]) {
  const med = data.filter((d) => d.forKomplett && d.motKomplett);
  const linjer = med.map(forlop);
  const snitt = Array.from({ length: 91 }, (_, t) => (linjer.length ? linjer.reduce((n, l) => n + l[t], 0) / linjer.length : 0));
  return { linjer, snitt, grunnlag: med.length };
}

/** Rullerende snitt over de siste n kampene. Starter når n kamper er spilt. */
export function rullerende(data: KampData[], n = 5) {
  const s = [...data].sort((a, b) => a.dato.localeCompare(b.dato));
  return s.flatMap((d, i) => {
    if (i + 1 < n) return [];
    const v = s.slice(i + 1 - n, i + 1);
    return [{ i, kamp: d, for: v.reduce((x, k) => x + k.antallFor, 0) / n, mot: v.reduce((x, k) => x + k.antallMot, 0) / n }];
  });
}

export function sesongKurver(data: KampData[]) {
  const sesonger = [...new Set(data.map((d) => d.sesong))].sort((a, b) => a - b);
  return sesonger.map((sesong) => {
    const ks = data.filter((d) => d.sesong === sesong);
    const sum = (f: (d: KampData) => number) => ks.reduce((n, d) => n + f(d), 0) / ks.length;
    return { sesong, kamper: ks.length, malFor: sum((d) => d.antallFor), malMot: sum((d) => d.antallMot), poeng: sum((d) => d.poeng) };
  });
}

export const VARME_BOLKER = ['0–15', '16–30', '31–45', '46–60', '61–75', '76–90+'];
const varmeBolk = (m: number) => Math.min(5, Math.max(0, Math.ceil(m / 15) - 1));

/** Sesong mot 15-minuttersbolker. */
export function varmeSesong(data: KampData[], side: MalSide) {
  const sesonger = [...new Set(data.map((d) => d.sesong))].sort((a, b) => b - a);
  return sesonger.map((s) => {
    const verdier = VARME_BOLKER.map(() => 0);
    for (const d of data) if (d.sesong === s) for (const p of mal(d, side)) verdier[varmeBolk(p.m)]++;
    return { navn: String(s), verdier };
  });
}

/** Spiller mot 15-minuttersbolker: de som har scoret flest mål. Selvmål av motstanderen er ikke med. */
export function varmeSpillere(data: KampData[], antall = 12) {
  const map = new Map<string, number[]>();
  for (const d of data) {
    for (const p of d.for) {
      if (p.s || !p.n) continue;
      if (!map.has(p.n)) map.set(p.n, VARME_BOLKER.map(() => 0));
      map.get(p.n)![varmeBolk(p.m)]++;
    }
  }
  return [...map]
    .map(([navn, verdier]) => ({ navn, verdier, sum: verdier.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.sum - a.sum || a.navn.localeCompare(b.navn, 'nb'))
    .slice(0, antall);
}

/** Målscorere i utvalget, flest mål først (til "Fremhev målscorer"). */
export function scorere(data: KampData[]) {
  const c = new Map<string, number>();
  for (const d of data) for (const p of d.for) if (p.n && !p.s) c.set(p.n, (c.get(p.n) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nb')).map(([navn, mal]) => ({ navn, mal }));
}
