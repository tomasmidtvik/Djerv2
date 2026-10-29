// Kontroll av data: målsjekk, advarsler og forslag til duplikater. Brukes av importen.
import type { RawData } from './data.ts';
import type { Db, Person } from './db.ts';
import { editDistance, isSubsetName, normName, sameParts } from './names.ts';
import type { KampMeta, Kamprapport } from './types.ts';

export interface ReviewItem {
  /** kampnr eller mediarapport-id */
  ref: string;
  tittel: string;
  punkter: string[];
}

/** Sjekker at antall registrerte mål (inkl. selvmål i metadata) stemmer med sluttresultatet. */
export function malSjekk(r: Kamprapport, meta: KampMeta = {}): string[] {
  const problems: string[] = [];
  for (const side of ['hjemme', 'borte'] as const) {
    const lag = side === 'hjemme' ? r.hjemmelag : r.bortelag;
    const spillerMal = lag.spillere.reduce((n, p) => n + p.mal.length, 0);
    const selvmal = (meta.selvmal ?? []).filter((s) => {
      if (!r.djerv) return false;
      const til = s.til === 'djerv' ? r.djerv : r.djerv === 'hjemme' ? 'borte' : 'hjemme';
      return til === side;
    }).length;
    const fasit = r.resultat[side];
    if (spillerMal + selvmal !== fasit) {
      problems.push(
        `Mål stemmer ikke for ${lag.navn}: ${spillerMal} registrert på spillere` +
          (selvmal ? ` + ${selvmal} selvmål` : '') +
          `, men resultatet er ${r.resultat.hjemme}-${r.resultat.borte}. ` +
          (spillerMal + selvmal < fasit
            ? 'Selvmål? Legg det inn under "selvmal" i data/matches-meta.yaml.'
            : 'Sjekk minuttene i PDF-en.'),
      );
    }
  }
  return problems;
}

export function reviewList(raw: RawData, db: Db): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const r of raw.matches) {
    const meta = raw.meta[r.kampnr] ?? {};
    if (meta.godkjent) continue;
    const punkter = [...malSjekk(r, meta), ...r.advarsler, ...(db.lineupMerknader.get(r.kampnr) ?? [])];
    if (!r.djerv) punkter.unshift(`Fant ikke ${raw.settings.lagnavn} i kampen – den vises ikke på siden`);
    if (punkter.length) {
      items.push({
        ref: r.kampnr,
        tittel: `Kamp ${r.kampnr}: ${r.hjemmelag.navn} - ${r.bortelag.navn} (${r.dato})`,
        punkter,
      });
    }
  }
  for (const l of db.mediaLinks) {
    const punkter = [...(l.problem ? [l.problem] : []), ...l.media.advarsler];
    if (l.kampnr && (raw.meta[l.kampnr]?.godkjent)) continue;
    if (punkter.length) {
      items.push({
        ref: l.media.id,
        tittel: `Mediarapport ${l.media.id} (${l.media.kilde})`,
        punkter,
      });
    }
  }
  return items;
}

export interface Duplikat {
  a: Person;
  b: Person;
  grunn: string;
}

/** Foreslår personer som kan være samme person. Slår aldri sammen automatisk. */
export function foreslaDuplikater(db: Db, raw: RawData): Duplikat[] {
  const ikke = new Set(
    (raw.alias.ikke_samme_person ?? [])
      .filter((p) => Array.isArray(p) && p.length === 2)
      .map((p) => [normName(p[0]), normName(p[1])].sort().join('|')),
  );
  const out: Duplikat[] = [];
  const ps = db.personer;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      if (ikke.has([normName(a.navn), normName(b.navn)].sort().join('|'))) continue;
      let grunn: string | null = null;
      if (sameParts(a.navn, b.navn)) grunn = 'samme navnedeler (bindestrek/mellomrom/rekkefølge)';
      else if (isSubsetName(a.navn, b.navn) || isSubsetName(b.navn, a.navn)) grunn = 'det ene navnet er en del av det andre';
      else {
        const d = editDistance(normName(a.navn), normName(b.navn));
        if (d <= 2 && Math.min(a.navn.length, b.navn.length) >= 6) grunn = `nesten likt navn (${d} tegn forskjell)`;
      }
      if (grunn) out.push({ a, b, grunn });
    }
  }
  return out;
}
