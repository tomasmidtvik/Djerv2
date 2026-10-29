// npm run import            – importerer nye PDF-er fra kamprapporter/ og mediarapporter/
// npm run import -- --force – importerer alle PDF-er på nytt
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadRaw, loadSettings, PATHS } from '../src/lib/data.ts';
import { buildDb } from '../src/lib/db.ts';
import { foreslaDuplikater, reviewList, type Duplikat, type ReviewItem } from '../src/lib/review.ts';
import type { Kamprapport, Mediarapport } from '../src/lib/types.ts';
import { parsePdfFile } from './lib/parse-file.ts';

const force = process.argv.includes('--force');

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

interface LogEntry {
  sha256: string;
  type: 'kamprapport' | 'mediarapport';
  output: string;
  importert: string;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.toLowerCase().endsWith('.pdf')) out.push(p);
  }
  return out.sort();
}

const posix = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/');

const settings = loadSettings();
const log: Record<string, LogEntry> = existsSync(PATHS.importLog) ? JSON.parse(readFileSync(PATHS.importLog, 'utf8')) : {};
mkdirSync(PATHS.matches, { recursive: true });
mkdirSync(PATHS.media, { recursive: true });

const nyeKamper: Kamprapport[] = [];
const nyeMedia: Mediarapport[] = [];
const hoppetOver: string[] = [];
const feil: { fil: string; melding: string }[] = [];
const merknader: string[] = [];

const files = [
  ...walk('kamprapporter').map((f) => ({ f, folder: 'kamprapport' as const })),
  ...walk('mediarapporter').map((f) => ({ f, folder: 'mediarapport' as const })),
];

for (const { f, folder } of files) {
  const rel = posix(f);
  const sha256 = createHash('sha256').update(readFileSync(f)).digest('hex');
  const entry = log[rel];
  if (!force && entry && entry.sha256 === sha256 && existsSync(entry.output)) {
    hoppetOver.push(rel);
    continue;
  }
  if (!force) {
    const dup = Object.entries(log).find(([p, e]) => p !== rel && e.sha256 === sha256 && existsSync(e.output));
    if (dup) {
      hoppetOver.push(`${rel} ${c.dim(`(samme fil som ${dup[0]})`)}`);
      continue;
    }
  }
  if (entry && entry.sha256 !== sha256) merknader.push(`${rel} er endret siden forrige import – leses på nytt`);

  let result: Kamprapport | Mediarapport;
  try {
    result = await parsePdfFile(f, rel, settings);
  } catch (e: any) {
    feil.push({ fil: rel, melding: e?.message ?? String(e) });
    continue;
  }

  if (result.type !== folder) {
    merknader.push(`${rel} ligger i ${folder}er-mappen, men er en ${result.type} – importert som ${result.type}`);
  }
  const yearFolder = rel.match(/\/(\d{4})\//)?.[1];
  const year = result.type === 'kamprapport' ? result.sesong : Number(result.dato.slice(0, 4));
  if (yearFolder && Number(yearFolder) !== year) {
    merknader.push(`${rel} ligger i mappen ${yearFolder}, men kampen er fra ${year} (sesong = kampdato, så den regnes til ${year})`);
  }

  const output =
    result.type === 'kamprapport' ? `${PATHS.matches}/${result.kampnr}.json` : `${PATHS.media}/${result.id}.json`;
  const owner = Object.entries(log).find(([p, e]) => p !== rel && e.output === output && existsSync(e.output));
  if (owner && !force) {
    merknader.push(`${rel}: ${output} finnes allerede fra ${owner[0]} – hoppet over (bruk --force for å overskrive)`);
    hoppetOver.push(rel);
    continue;
  }
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  log[rel] = { sha256, type: result.type, output, importert: new Date().toISOString() };
  if (owner) delete log[owner[0]];
  if (result.type === 'kamprapport') nyeKamper.push(result);
  else nyeMedia.push(result);
}

writeFileSync(PATHS.importLog, JSON.stringify(log, null, 2) + '\n', 'utf8');

// ---- Kontroll av alle data (ikke bare de nye) ----
const raw = loadRaw();
const db = buildDb(raw);
const review = reviewList(raw, db);
const duplikater = foreslaDuplikater(db, raw);
writeFileSync(PATHS.review, reviewMarkdown(review, duplikater), 'utf8');

// ---- Oppsummering ----
const out: string[] = [];
out.push('', c.bold('Import ferdig'), '');
out.push(c.bold(`Nye kamper (${nyeKamper.length})`));
for (const k of nyeKamper.sort((a, b) => a.dato.localeCompare(b.dato))) {
  out.push(`  ${c.green('+')} ${k.kampnr}  ${k.dato}  ${k.hjemmelag.navn} ${k.resultat.hjemme}-${k.resultat.borte} ${k.bortelag.navn}`);
}
out.push(c.bold(`Nye mediarapporter (${nyeMedia.length})`));
for (const m of nyeMedia) {
  const l = db.mediaLinks.find((x) => x.media.id === m.id);
  out.push(
    `  ${c.green('+')} ${m.id}  ` + (l?.kampnr ? `koblet til kamp ${l.kampnr}` : c.yellow(`ikke koblet: ${l?.problem ?? 'ukjent'}`)),
  );
}
out.push(c.bold(`Hoppet over, allerede importert (${hoppetOver.length})`));
for (const h of hoppetOver) out.push(`  ${c.dim('=')} ${h}`);
if (feil.length) {
  out.push(c.bold(c.red(`Feil (${feil.length})`)));
  for (const e of feil) out.push(`  ${c.red('x')} ${e.fil}: ${e.melding}`);
}
if (merknader.length) {
  out.push(c.bold(c.yellow(`Advarsler (${merknader.length})`)));
  for (const m of merknader) out.push(`  ${c.yellow('!')} ${m}`);
}
out.push('');
if (review.length) {
  out.push(c.bold(c.yellow(`Review-liste (${review.length}) – lagret i ${PATHS.review}`)));
  for (const r of review) {
    out.push(`  ${c.yellow('•')} ${r.tittel}`);
    for (const p of r.punkter) out.push(`      - ${p}`);
  }
} else out.push(c.green('Review-liste: ingenting å sjekke'));
out.push('');
if (duplikater.length) {
  out.push(c.bold(`Mulige duplikater (${duplikater.length}) – slå sammen i ${PATHS.alias} hvis det er samme person`));
  for (const d of duplikater) out.push(`  ${c.yellow('?')} "${d.a.navn}" og "${d.b.navn}" – ${d.grunn}`);
  out.push('');
}
out.push(
  c.dim(`Totalt ${db.kamper.length} kamper, ${db.personer.length} personer, ${raw.media.length} mediarapporter.`),
  c.dim('Neste steg: sjekk review-listen, kjør "npm run dev" for å se siden, og commit + push.'),
  '',
);
console.log(out.join('\n'));
if (feil.length) process.exitCode = 1;

function reviewMarkdown(items: ReviewItem[], dups: Duplikat[]): string {
  const lines = [
    '# Review-liste',
    '',
    `Generert av \`npm run import\` ${new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}. Filen skrives på nytt ved hver import.`,
    '',
    'Når du har sjekket en kamp og alt stemmer, sett `godkjent: true` på kampen i `data/matches-meta.yaml`.',
    '',
  ];
  if (!items.length) lines.push('Ingenting å sjekke.', '');
  for (const it of items) {
    lines.push(`## ${it.tittel}`, '', ...it.punkter.map((p) => `- ${p}`), '');
  }
  lines.push('# Mulige duplikater', '');
  if (!dups.length) lines.push('Ingen forslag.', '');
  else {
    lines.push(
      'Er det samme person, legg til en linje under `alias:` i `data/spiller-alias.yaml`.',
      'Er det ulike personer, legg paret under `ikke_samme_person:` så forsvinner forslaget.',
      '',
    );
    for (const d of dups) lines.push(`- "${d.a.navn}" og "${d.b.navn}" – ${d.grunn}`);
    lines.push('');
  }
  return lines.join('\n');
}
