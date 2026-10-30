// Statistikkberegninger. Rene funksjoner over visningsmodellen (testes i tests/stats.test.ts).
import type { Db, Kamp, Person, PersonKamp, Utfall } from './db.ts';

export interface Poengregel {
  seier: number;
  uavgjort: number;
  tap: number;
}

export interface LagStat {
  kamper: number;
  seire: number;
  uavgjort: number;
  tap: number;
  malFor: number;
  malMot: number;
  malforskjell: number;
  poeng: number;
  gule: number;
  rode: number;
}

const DEFAULT_POENG: Poengregel = { seier: 3, uavgjort: 1, tap: 0 };

export function lagStat(kamper: Kamp[], poeng: Poengregel = DEFAULT_POENG): LagStat {
  const s: LagStat = { kamper: 0, seire: 0, uavgjort: 0, tap: 0, malFor: 0, malMot: 0, malforskjell: 0, poeng: 0, gule: 0, rode: 0 };
  for (const k of kamper) {
    s.kamper++;
    s.malFor += k.malFor;
    s.malMot += k.malMot;
    if (k.utfall === 'S') s.seire++;
    else if (k.utfall === 'U') s.uavgjort++;
    else s.tap++;
    for (const e of k.hendelser) {
      if (e.side !== k.side) continue;
      if (e.type === 'gult') s.gule++;
      if (e.type === 'rodt' || e.type === 'rodt2') s.rode++;
    }
  }
  s.malforskjell = s.malFor - s.malMot;
  s.poeng = s.seire * poeng.seier + s.uavgjort * poeng.uavgjort + s.tap * poeng.tap;
  return s;
}

export interface SpillerStat {
  /** kamper i troppen (krysset av som spilt i rapporten) */
  kamper: number;
  startet: number;
  /** i troppen som innbytter */
  innbytter: number;
  /** registrert innbyttet i matches-meta.yaml */
  innbyttet: number;
  mal: number;
  gule: number;
  rodeAdv2: number;
  rodeDirekte: number;
  rode: number;
  kaptein: number;
  seire: number;
  uavgjort: number;
  tap: number;
  /** kamper med minst 3 mål */
  hatTricks: number;
  /** mål og kort i kamper der spilleren stod som innbytter */
  malInnbytter: number;
  kortInnbytter: number;
  /** mål fordelt på posisjon spilleren var oppstilt i */
  malPosisjon: Record<string, number>;
  /** lagets seiersprosent i kampene spilleren var i troppen (0–100) */
  seiersprosent: number | null;
  forste: Kamp | null;
  siste: Kamp | null;
  sesonger: number[];
}

export function filtrerSesong<T extends { kamp: Kamp }>(xs: T[], sesong?: number | null): T[] {
  return sesong ? xs.filter((x) => x.kamp.sesong === sesong) : xs;
}

export function spillerStat(kamper: PersonKamp[]): SpillerStat {
  const st: SpillerStat = {
    kamper: 0,
    startet: 0,
    innbytter: 0,
    innbyttet: 0,
    mal: 0,
    gule: 0,
    rodeAdv2: 0,
    rodeDirekte: 0,
    rode: 0,
    kaptein: 0,
    seire: 0,
    uavgjort: 0,
    tap: 0,
    hatTricks: 0,
    malInnbytter: 0,
    kortInnbytter: 0,
    malPosisjon: {},
    seiersprosent: null,
    forste: null,
    siste: null,
    sesonger: [],
  };
  const sesonger = new Set<number>();
  for (const { kamp, s } of kamper) {
    st.kamper++;
    if (s.innbytter) st.innbytter++;
    else st.startet++;
    if (s.innbyttet) st.innbyttet++;
    st.mal += s.mal.length;
    st.gule += s.gule.length;
    st.rodeAdv2 += s.rodeAdv2.length;
    st.rodeDirekte += s.rodeDirekte.length;
    if (s.kaptein) st.kaptein++;
    if (s.mal.length >= 3) st.hatTricks++;
    if (s.innbytter) {
      st.malInnbytter += s.mal.length;
      st.kortInnbytter += s.gule.length + s.rodeAdv2.length + s.rodeDirekte.length;
    }
    if (s.posisjon && s.mal.length) st.malPosisjon[s.posisjon] = (st.malPosisjon[s.posisjon] ?? 0) + s.mal.length;
    const u: Utfall = kamp.utfall;
    if (u === 'S') st.seire++;
    else if (u === 'U') st.uavgjort++;
    else st.tap++;
    sesonger.add(kamp.sesong);
    if (!st.forste || kamp.dato < st.forste.dato) st.forste = kamp;
    if (!st.siste || kamp.dato > st.siste.dato) st.siste = kamp;
  }
  st.rode = st.rodeAdv2 + st.rodeDirekte;
  st.seiersprosent = st.kamper ? Math.round((st.seire / st.kamper) * 1000) / 10 : null;
  st.sesonger = [...sesonger].sort((a, b) => a - b);
  return st;
}

export interface Rad {
  person: Person;
  stat: SpillerStat;
  verdi: number;
}

export type Nokkel = 'mal' | 'gule' | 'rode' | 'rodeAdv2' | 'rodeDirekte' | 'kamper' | 'kortPerKamp' | 'kaptein' | 'hatTricks' | 'malInnbytter';

/** Toppliste for en nøkkel, med sesongfilter (null = alle tider). Spillere med 0 utelates. */
export function toppliste(personer: Person[], nokkel: Nokkel, sesong: number | null = null, minKamper = 0): Rad[] {
  const rader: Rad[] = [];
  for (const person of personer) {
    const pk = filtrerSesong(person.spillerKamper, sesong);
    if (!pk.length) continue;
    const stat = spillerStat(pk);
    if (stat.kamper < minKamper) continue;
    const verdi =
      nokkel === 'kortPerKamp'
        ? Math.round(((stat.gule + stat.rode) / stat.kamper) * 100) / 100
        : (stat[nokkel] as number);
    if (verdi > 0) rader.push({ person, stat, verdi });
  }
  // Ved likt: færre kamper først (mest effektiv), deretter navn
  return rader.sort((a, b) => b.verdi - a.verdi || a.stat.kamper - b.stat.kamper || a.person.navn.localeCompare(b.person.navn, 'nb'));
}

/** Plassering med delte plasser: [1, 2, 2, 4] */
export function plasseringer<T>(rader: T[], verdi: (r: T) => number): number[] {
  const out: number[] = [];
  rader.forEach((r, i) => {
    out.push(i > 0 && verdi(r) === verdi(rader[i - 1]) ? out[i - 1] : i + 1);
  });
  return out;
}

export function kamperISesong(db: Db, sesong: number | null): Kamp[] {
  return sesong ? db.kamper.filter((k) => k.sesong === sesong) : db.kamper;
}

/** Lederroller for en person: funksjon -> antall kamper. */
export function lederRoller(person: Person, sesong: number | null = null): { funksjon: string; kamper: number }[] {
  const map = new Map<string, number>();
  for (const { l } of filtrerSesong(person.lederKamper, sesong)) {
    const f = l.funksjon || 'Leder';
    map.set(f, (map.get(f) ?? 0) + 1);
  }
  return [...map.entries()].map(([funksjon, kamper]) => ({ funksjon, kamper })).sort((a, b) => b.kamper - a.kamper);
}

export function prosent(n: number, total: number): string {
  if (!total) return '–';
  return `${Math.round((n / total) * 100)} %`;
}
