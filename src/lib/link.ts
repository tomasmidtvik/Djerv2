// Kobler mediarapporter til kamper, og spillere i mediarapporten til spillere i kamprapporten.
import { isSubsetName, normName, sameParts, sameTeam } from './names.ts';
import { erSkjultNavn } from './parse/mediarapport.ts';
import type { Kamprapport, MatchesMeta, MediaLag, MediaSpiller, Mediarapport, RapportLag } from './types.ts';

export const SKJULT_VISNING = 'Navn ikke tilgjengelig';

export interface MediaLink {
  media: Mediarapport;
  /** kampnummer den er koblet til, eller null */
  kampnr: string | null;
  /** lagene står i motsatt rekkefølge av kamprapporten */
  byttet: boolean;
  problem: string | null;
  merknader: string[];
}

function teamsMatch(m: Mediarapport, k: Kamprapport): { ok: boolean; byttet: boolean } {
  if (sameTeam(m.hjemmelag.navn, k.hjemmelag.navn) && sameTeam(m.bortelag.navn, k.bortelag.navn)) return { ok: true, byttet: false };
  if (sameTeam(m.hjemmelag.navn, k.bortelag.navn) && sameTeam(m.bortelag.navn, k.hjemmelag.navn)) return { ok: true, byttet: true };
  return { ok: false, byttet: false };
}

/** Finner kampen en mediarapport hører til: dato + avspark + lagnavn (+ bane). */
export function linkMedia(media: Mediarapport[], matches: Kamprapport[], meta: MatchesMeta): MediaLink[] {
  // Manuelle koblinger i matches-meta.yaml går foran
  const forced = new Map<string, string>();
  const ignored = new Set<string>();
  for (const [kampnr, m] of Object.entries(meta)) {
    if (typeof m.mediarapport === 'string') forced.set(m.mediarapport, kampnr);
    if (m.mediarapport === false) ignored.add(kampnr);
  }

  const links: MediaLink[] = media.map((m) => {
    const merknader: string[] = [];
    if (forced.has(m.id)) {
      const kampnr = forced.get(m.id)!;
      const k = matches.find((x) => x.kampnr === kampnr);
      if (!k) return { media: m, kampnr: null, byttet: false, problem: `matches-meta.yaml kobler til kamp ${kampnr}, som ikke finnes`, merknader };
      return { media: m, kampnr, byttet: teamsMatch(m, k).byttet, problem: null, merknader: ['koblet manuelt i matches-meta.yaml'] };
    }
    let cands = matches
      .filter((k) => !ignored.has(k.kampnr) && k.dato === m.dato && (!m.avspark || k.avspark === m.avspark))
      .map((k) => ({ k, ...teamsMatch(m, k) }))
      .filter((c) => c.ok);
    if (cands.length > 1 && m.bane) {
      const sameBane = cands.filter((c) => normName(c.k.bane) === normName(m.bane!));
      if (sameBane.length) cands = sameBane;
    }
    if (cands.length > 1 && m.kampnrHint) {
      const hinted = cands.filter((c) => c.k.kampnr === m.kampnrHint);
      if (hinted.length) cands = hinted;
    }
    if (cands.length === 0) {
      return {
        media: m,
        kampnr: null,
        byttet: false,
        problem: `Fant ingen kamp ${m.dato} kl. ${m.avspark ?? '?'} ${m.hjemmelag.navn} - ${m.bortelag.navn} (venter på kamprapport?)`,
        merknader,
      };
    }
    if (cands.length > 1) {
      return {
        media: m,
        kampnr: null,
        byttet: false,
        problem: `Flere kamper passer: ${cands.map((c) => c.k.kampnr).join(', ')}. Sett "mediarapport: ${m.id}" på riktig kamp i matches-meta.yaml`,
        merknader,
      };
    }
    const { k, byttet } = cands[0];
    if (byttet) merknader.push('lagene står i motsatt rekkefølge i mediarapporten');
    if (m.bane && normName(m.bane) !== normName(k.bane)) merknader.push(`bane i mediarapporten (${m.bane}) er ulik kamprapporten (${k.bane})`);
    if (m.kampnrHint && m.kampnrHint !== k.kampnr) merknader.push(`kampnummer i filnavnet (${m.kampnrHint}) er ulikt kampen den ble koblet til (${k.kampnr})`);
    return { media: m, kampnr: k.kampnr, byttet, problem: null, merknader };
  });

  // To mediarapporter til samme kamp: koble ingen av dem
  const count = new Map<string, number>();
  for (const l of links) if (l.kampnr) count.set(l.kampnr, (count.get(l.kampnr) ?? 0) + 1);
  for (const l of links) {
    if (l.kampnr && count.get(l.kampnr)! > 1 && !forced.has(l.media.id)) {
      l.problem = `Flere mediarapporter passer til kamp ${l.kampnr}. Sett "mediarapport: <id>" i matches-meta.yaml`;
      l.kampnr = null;
    }
  }
  return links;
}

/**
 * Finner spillere som ikke skal vises med navn:
 * - NFF skriver "Personinfo ikke tilgjengelig" i mediarapporten (personen er reservert mot publisering)
 * - eller de står under "skjul" (lag + draktnr) i matches-meta.yaml
 */
export function skjulteSpillere(media: Mediarapport[], matches: Kamprapport[], meta: MatchesMeta) {
  const out = new Map<string, { side: 'hjemme' | 'borte'; draktnr: number }[]>();
  const add = (kampnr: string, side: 'hjemme' | 'borte', draktnr: number | null) => {
    if (draktnr === null) return;
    if (!out.has(kampnr)) out.set(kampnr, []);
    out.get(kampnr)!.push({ side, draktnr });
  };
  for (const l of linkMedia(media, matches, meta)) {
    if (!l.kampnr) continue;
    for (const [mside, mlag] of [
      ['hjemme', l.media.hjemmelag],
      ['borte', l.media.bortelag],
    ] as const) {
      const side = l.byttet ? (mside === 'hjemme' ? 'borte' : 'hjemme') : mside;
      for (const s of mlag.spillere) if (s.skjult || erSkjultNavn(s.navn)) add(l.kampnr, side, s.draktnr);
    }
  }
  for (const k of matches) {
    for (const s of meta[k.kampnr]?.skjul ?? []) {
      if (!k.djerv) continue;
      const side = s.lag === 'djerv' ? k.djerv : k.djerv === 'hjemme' ? 'borte' : 'hjemme';
      add(k.kampnr, side, Number(s.draktnr));
    }
  }
  return out;
}

/** Fjerner navnet på skjulte spillere fra kampdataene. Returnerer antall spillere som ble skjult nå. */
export function skjulNavn(k: Kamprapport, skjulte: { side: 'hjemme' | 'borte'; draktnr: number }[]): number {
  let n = 0;
  for (const { side, draktnr } of skjulte) {
    const lag = side === 'hjemme' ? k.hjemmelag : k.bortelag;
    for (const p of lag.spillere) {
      if (p.draktnr !== draktnr || p.skjult) continue;
      const navn = p.navn;
      k.advarsler = k.advarsler.map((a) => a.split(navn).join(SKJULT_VISNING));
      p.navn = SKJULT_VISNING;
      p.fornavn = '';
      p.etternavn = '';
      p.skjult = true;
      n++;
    }
  }
  return n;
}

export interface LineupMatch {
  /** indeks i RapportLag.spillere -> spiller i mediarapporten */
  koblet: Map<number, MediaSpiller>;
  merknader: string[];
}

/** Kobler spillere på draktnr + navnedeler innenfor samme lag. */
export function matchLineup(lag: RapportLag, mlag: MediaLag): LineupMatch {
  const koblet = new Map<number, MediaSpiller>();
  const merknader: string[] = [];
  const used = new Set<number>();
  const pick = (pred: (i: number) => boolean) => {
    const i = lag.spillere.findIndex((_, idx) => !used.has(idx) && pred(idx));
    return i >= 0 ? i : null;
  };
  for (const ms of mlag.spillere) {
    const sp = lag.spillere;
    // Navnet er skjult av NFF: koble bare på draktnr
    if (erSkjultNavn(ms.navn) || ms.skjult) {
      const i = pick((x) => sp[x].draktnr === ms.draktnr);
      if (i === null) merknader.push(`Skjult spiller (nr. ${ms.draktnr ?? '?'}) i mediarapporten finnes ikke i kamprapporten for ${lag.navn}`);
      else {
        used.add(i);
        koblet.set(i, ms);
      }
      continue;
    }
    let i = pick((x) => sp[x].draktnr === ms.draktnr && sameParts(sp[x].navn, ms.navn));
    if (i === null) {
      i = pick((x) => sameParts(sp[x].navn, ms.navn));
      if (i !== null) merknader.push(`${ms.navn}: draktnr ${ms.draktnr} i mediarapporten, ${sp[i].draktnr} i kamprapporten`);
    }
    if (i === null) {
      i = pick(
        (x) => sp[x].draktnr === ms.draktnr && (isSubsetName(sp[x].navn, ms.navn) || isSubsetName(ms.navn, sp[x].navn)),
      );
      if (i !== null) merknader.push(`${ms.navn} koblet til ${sp[i].navn} (samme draktnr, delvis likt navn)`);
    }
    if (i === null) {
      merknader.push(`${ms.navn} (nr. ${ms.draktnr ?? '?'}) i mediarapporten finnes ikke i kamprapporten for ${lag.navn}`);
      continue;
    }
    used.add(i);
    koblet.set(i, ms);
  }
  // Sjekk at startelleveren stemmer
  lag.spillere.forEach((s, i) => {
    const ms = koblet.get(i);
    if (!s.spilt) return;
    if (!ms) {
      merknader.push(`${s.navn} (${lag.navn}) står i kamprapporten, men ikke i mediarapporten`);
      return;
    }
    if (ms.posisjon === 'Strøket') {
      merknader.push(`${s.navn} (${lag.navn}) er krysset av som spilt, men står som strøket i mediarapporten`);
    } else if (ms.start === s.innbytter) {
      merknader.push(
        `${s.navn} (${lag.navn}) er ${s.innbytter ? 'innbytter' : 'i startelleveren'} i kamprapporten, men ${ms.start ? 'i startelleveren' : 'innbytter'} i mediarapporten`,
      );
    }
  });
  return { koblet, merknader };
}
