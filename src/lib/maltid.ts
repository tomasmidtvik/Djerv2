// Tid til første mål. Regnes ut både ved bygging og i nettleseren (filtrene), så modulen har ingen Node-avhengigheter.
import type { Kamp } from './db.ts';
import { slugify } from './names.ts';

export interface MalPunkt {
  /** minutt */
  m: number;
  /** målscorer */
  n: string | null;
  /** selvmål */
  s?: 1;
}

/** Kompakt kampdata som sendes til nettleseren. */
export interface KampData {
  id: string;
  dato: string;
  sesong: number;
  sted: 'hjemme' | 'borte';
  mot: string;
  motSlug: string;
  trener: string | null;
  poeng: number;
  tittel: string;
  for: MalPunkt[];
  motMal: MalPunkt[];
  /** alle egne/motstanderens mål har minutt */
  forKomplett: boolean;
  motKomplett: boolean;
  kortFor: number[];
  kortMot: number[];
}

const sortert = (xs: MalPunkt[]) => [...xs].sort((a, b) => a.m - b.m);

export function tilKampData(k: Kamp, poeng: { seier: number; uavgjort: number; tap: number }): KampData {
  const punkt = (ossSide: boolean) =>
    sortert(
      k.hendelser
        .filter((e) => e.type === 'mal' && e.minutt !== null && (e.side === k.side) === ossSide)
        .map((e) => ({ m: e.minutt!, n: e.navn, ...(e.selvmal ? { s: 1 as const } : {}) })),
    );
  const kort = (ossSide: boolean) =>
    k.hendelser.filter((e) => e.type !== 'mal' && e.minutt !== null && (e.side === k.side) === ossSide).map((e) => e.minutt!).sort((a, b) => a - b);
  const motSide = k.side === 'hjemme' ? 'borte' : 'hjemme';
  return {
    id: k.kampnr,
    dato: k.dato,
    sesong: k.sesong,
    sted: k.side,
    mot: k.motstander,
    motSlug: slugify(k.motstander),
    trener: k.trener?.navn ?? null,
    poeng: k.utfall === 'S' ? poeng.seier : k.utfall === 'U' ? poeng.uavgjort : poeng.tap,
    tittel: `${k.hjemme.navn} ${k.resultat.hjemme}–${k.resultat.borte} ${k.borte.navn}`,
    for: punkt(true),
    motMal: punkt(false),
    forKomplett: k.ukjenteMal[k.side] === 0,
    motKomplett: k.ukjenteMal[motSide] === 0,
    kortFor: kort(true),
    kortMot: kort(false),
  };
}

export type MalSide = 'for' | 'mot';
const mal = (d: KampData, s: MalSide) => (s === 'for' ? d.for : d.motMal);
const komplett = (d: KampData, s: MalSide) => (s === 'for' ? d.forKomplett : d.motKomplett);

/**
 * Overlevelseskurve: andel kamper uten mål etter minutt 0–90.
 * Kamper uten mål telles ikke som mål i minutt 90: de blir stående igjen i kurven.
 * Mål i tilleggstid regnes som minutt 90.
 */
export function overlevelse(data: KampData[], side: MalSide): number[] {
  const med = data.filter((d) => komplett(d, side));
  const kurve: number[] = [];
  for (let t = 0; t <= 90; t++) {
    const uten = med.filter((d) => {
      const f = mal(d, side)[0];
      return !f || Math.min(f.m, 90) > t;
    }).length;
    kurve.push(med.length ? uten / med.length : 1);
  }
  return kurve;
}

/** Medianen leses av der kurven krysser 50 %. Null hvis under halvparten av kampene har mål. */
export function medianFraKurve(kurve: number[]): number | null {
  const t = kurve.findIndex((x) => x <= 0.5);
  return t < 0 ? null : t;
}

export interface ForsteMal {
  grunnlag: number;
  medMal: number;
  utenMal: number;
  /** snitt for kamper med mål */
  snitt: number | null;
  median: number | null;
  /** andel av kampene med mål innen 10, 15, 30 og 45 minutter */
  innen: { minutt: number; andel: number }[];
}

export function forsteMal(data: KampData[], side: MalSide): ForsteMal {
  const med = data.filter((d) => komplett(d, side));
  const min = med.map((d) => mal(d, side)[0]?.m ?? null);
  const verdier = min.filter((x): x is number => x !== null);
  return {
    grunnlag: med.length,
    medMal: verdier.length,
    utenMal: med.length - verdier.length,
    snitt: verdier.length ? verdier.reduce((a, b) => a + b, 0) / verdier.length : null,
    median: medianFraKurve(overlevelse(data, side)),
    innen: [10, 15, 30, 45].map((m) => ({ minutt: m, andel: med.length ? verdier.filter((x) => x <= m).length / med.length : 0 })),
  };
}

/** Hvem scorer først, og poeng etter det. Krever at alle mål i kampen er kjent. */
export function scorerForst(data: KampData[]) {
  const med = data.filter((d) => d.forKomplett && d.motKomplett && d.for.length + d.motMal.length > 0);
  const vi: KampData[] = [];
  const de: KampData[] = [];
  let likt = 0;
  for (const d of med) {
    const f = d.for[0]?.m ?? Infinity;
    const m = d.motMal[0]?.m ?? Infinity;
    if (f < m) vi.push(d);
    else if (m < f) de.push(d);
    else likt++;
  }
  const snitt = (xs: KampData[]) => (xs.length ? xs.reduce((n, d) => n + d.poeng, 0) / xs.length : null);
  return { grunnlag: med.length, vi: vi.length, de: de.length, likt, poengVi: snitt(vi), poengDe: snitt(de) };
}

/** Tid mellom egne mål i samme kamp, og hvor ofte vi scorer to mål innen 5 minutter. */
export function malTett(data: KampData[]) {
  const diff: number[] = [];
  let kamper = 0;
  let toInnen5 = 0;
  for (const d of data) {
    if (d.for.length > 1) kamper++;
    let tett = false;
    for (let i = 1; i < d.for.length; i++) {
      const x = d.for[i].m - d.for[i - 1].m;
      diff.push(x);
      if (x <= 5) tett = true;
    }
    if (tett) toInnen5++;
  }
  return { kamperMedFlere: kamper, snittMellom: diff.length ? diff.reduce((a, b) => a + b, 0) / diff.length : null, toInnen5 };
}

/** Minutt for første kort for oss, for kamper med kort. */
export function forsteKort(data: KampData[]) {
  const min = data.map((d) => d.kortFor[0]).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  return {
    grunnlag: data.length,
    medKort: min.length,
    snitt: min.length ? min.reduce((a, b) => a + b, 0) / min.length : null,
    median: min.length ? min[Math.floor((min.length - 1) / 2)] : null,
  };
}
