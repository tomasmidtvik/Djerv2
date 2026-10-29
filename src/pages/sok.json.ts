// Søkeindeks for /sok/ (spillere, ledere, motstandere og kamper).
import { slugify } from '../lib/names.ts';
import { datoKort, getDb, kampTittel, kampUrl, spillerUrl, url } from '../lib/site.ts';
import { lederRoller, spillerStat } from '../lib/stats.ts';

export function GET() {
  const db = getDb();
  const entries: { t: string; n: string; d: string; u: string; k: string }[] = [];
  for (const p of db.personer) {
    const st = spillerStat(p.spillerKamper);
    const roller = lederRoller(p).map((r) => r.funksjon);
    const d = [st.kamper ? `${st.kamper} ${st.kamper === 1 ? 'kamp' : 'kamper'}, ${st.mal} mål` : null, roller.length ? roller.join(', ') : null]
      .filter(Boolean)
      .join(' · ');
    entries.push({ t: st.kamper ? 'Spiller' : 'Leder', n: p.navn, d, u: spillerUrl(p.slug), k: p.varianter.join(' ') });
  }
  const motstandere = new Map<string, { navn: string; kamper: number }>();
  for (const k of db.kamper) {
    const m = motstandere.get(k.motstander) ?? { navn: k.motstander, kamper: 0 };
    m.kamper++;
    motstandere.set(k.motstander, m);
  }
  for (const m of motstandere.values()) {
    entries.push({
      t: 'Motstander',
      n: m.navn,
      d: `${m.kamper} ${m.kamper === 1 ? 'kamp' : 'kamper'}`,
      u: url(`kamper/?motstander=${slugify(m.navn)}&sesong=alle`),
      k: '',
    });
  }
  for (const k of [...db.kamper].reverse()) {
    entries.push({
      t: 'Kamp',
      n: kampTittel(k),
      d: `${datoKort(k.dato)} · ${k.bane}`,
      u: kampUrl(k.kampnr),
      k: `${k.kampnr} ${k.dato} ${k.sesong} ${datoKort(k.dato)} ${k.bane}`,
    });
  }
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } });
}
