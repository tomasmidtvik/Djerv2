// Kort, lesbar oppsummering av en parset rapport (brukes av `npm run parse -- --kort`).
import type { Hendelser, Kamprapport, Mediarapport, RapportLag } from '../../src/lib/types.ts';

const min = (xs: number[]) => xs.map((m) => `${m}'`).join(', ');

function events(p: Hendelser & { mal?: number[] }): string {
  const out: string[] = [];
  if (p.mal?.length) out.push(`mål ${min(p.mal)}`);
  if (p.gule.length) out.push(`gult ${min(p.gule)}`);
  if (p.rodeAdv2.length) out.push(`rødt (2 gule) ${min(p.rodeAdv2)}`);
  if (p.rodeDirekte.length) out.push(`direkte rødt ${min(p.rodeDirekte)}`);
  return out.join(', ');
}

function lag(l: RapportLag, side: string): string[] {
  const out = [`  ${side}: ${l.navn}`];
  for (const s of l.spillere) {
    const flags = [s.kaptein && 'K', s.innbytter && 'innbytter', !s.spilt && 'IKKE SPILT'].filter(Boolean).join(', ');
    const ev = events(s);
    out.push(`    ${String(s.draktnr ?? '?').padStart(3)} ${s.navn}${flags ? ` [${flags}]` : ''}${ev ? ` – ${ev}` : ''}`);
  }
  for (const l2 of l.ledere) {
    const ev = events(l2);
    out.push(`    leder: ${l2.navn} (${l2.funksjon})${ev ? ` – ${ev}` : ''}`);
  }
  return out;
}

export function summarize(r: Kamprapport | Mediarapport): string {
  const out: string[] = [];
  if (r.type === 'kamprapport') {
    out.push(
      `Kamp ${r.kampnr}: ${r.hjemmelag.navn} ${r.resultat.hjemme}-${r.resultat.borte} ${r.bortelag.navn}` +
        (r.pause ? `, pause ${r.pause.hjemme}-${r.pause.borte}` : ''),
      `  ${r.dato} kl. ${r.avspark}, ${r.bane}, ${r.turnering} (sesong ${r.sesong})`,
      `  Dommer: ${r.dommer ? `${r.dommer.navn} (${r.dommer.klubb ?? 'ukjent klubb'})` : '–'}`,
      `  Dommerveileder: ${r.dommerveileder ? `${r.dommerveileder.navn} (${r.dommerveileder.klubb ?? 'ukjent klubb'})` : 'ingen'}`,
      `  Kampvert tilstede: ${r.kampvertTilstede ?? '–'}, tilskuere: ${r.tilskuere ?? '–'}, e.e.o: ${r.eeo ?? 'nei'}, straffekonk.: ${r.straffekonk ?? 'nei'}`,
      `  Djerv spilte: ${r.djerv ?? 'IKKE FUNNET'}`,
      ...lag(r.hjemmelag, 'Hjemme'),
      ...lag(r.bortelag, 'Borte'),
    );
  } else {
    out.push(`Mediarapport ${r.id}: ${r.dato} kl. ${r.avspark ?? '?'}, ${r.bane ?? '?'}, ${r.turnering ?? '?'}`);
    out.push(`  Dommer: ${r.dommer ?? '–'}, kampnr-hint fra filnavn: ${r.kampnrHint ?? '–'}`);
    for (const [l, side] of [
      [r.hjemmelag, 'Venstre/hjemme'],
      [r.bortelag, 'Høyre/borte'],
    ] as const) {
      out.push(`  ${side}: ${l.navn} – formasjon ${l.formasjon ?? '?'}, hovedtrener ${l.hovedtrener ?? '?'}`);
      for (const s of l.spillere) {
        out.push(
          `    ${String(s.draktnr ?? '?').padStart(3)} ${s.navn} – ${s.start ? s.posisjon ?? '?' : 'innbytter'}${s.kaptein ? ' [K]' : ''}`,
        );
      }
    }
  }
  if (r.advarsler.length) out.push('  Advarsler:', ...r.advarsler.map((a) => `    ! ${a}`));
  else out.push('  Ingen advarsler');
  return out.join('\n');
}
