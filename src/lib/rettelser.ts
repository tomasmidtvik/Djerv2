// Manuelle rettelser fra matches-meta.yaml. Filene importen skriver endres ikke, så rettelsene overlever ny import.
import { normName, sameParts } from './names.ts';
import type { KampMeta, Kamprapport, RapportSpiller, Rettelse } from './types.ts';

const felt = (s: RapportSpiller, type: Rettelse['type']): number[] => {
  if (type === 'mal') return s.mal;
  if (type === 'selvmal') return (s.selvmal ??= []);
  if (type === 'gult') return s.gule;
  if (type === 'rodt2') return s.rodeAdv2;
  return s.rodeDirekte;
};

/** Returnerer en kopi av rapporten med rettelsene brukt, og det som ikke lot seg rette. */
export function medRettelser(k: Kamprapport, meta: KampMeta = {}): { rapport: Kamprapport; problemer: string[] } {
  if (!meta.rettelser?.length && !meta.pause) return { rapport: k, problemer: [] };
  const rapport = structuredClone(k);
  const problemer: string[] = [];
  if (meta.pause) rapport.pause = meta.pause;
  for (const r of meta.rettelser ?? []) {
    const alle = [...rapport.hjemmelag.spillere, ...rapport.bortelag.spillere];
    const s = alle.find((p) => normName(p.navn) === normName(r.spiller)) ?? alle.find((p) => sameParts(p.navn, r.spiller));
    if (!s) {
      problemer.push(`Rettelse: fant ikke spilleren "${r.spiller}" i kampen`);
      continue;
    }
    const liste = felt(s, r.type);
    if (r.fra !== undefined) {
      const i = liste.indexOf(r.fra);
      if (i < 0) {
        problemer.push(`Rettelse: ${r.spiller} har ingen hendelse "${r.type}" i minutt ${r.fra}`);
        continue;
      }
      liste.splice(i, 1);
    }
    if (r.til !== undefined) liste.push(r.til);
    liste.sort((a, b) => a - b);
  }
  return { rapport, problemer };
}
