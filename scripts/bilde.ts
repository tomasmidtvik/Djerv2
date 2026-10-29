// Legger inn et spillerbilde: npm run bilde -- "Fornavn Etternavn" sti/til/bilde.jpg
// Bildet skaleres ned (maks 600 px), lagres som WebP uten EXIF, og får riktig filnavn i public/spillere/.
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { loadRaw, PATHS } from '../src/lib/data.ts';
import { buildDb } from '../src/lib/db.ts';
import { normName, slugify } from '../src/lib/names.ts';
import { lagSpillerbilde } from './lib/bilde.ts';

const [navn, kilde] = process.argv.slice(2);
if (!navn || !kilde) {
  console.error('Bruk: npm run bilde -- "Fornavn Etternavn" sti/til/bilde.jpg');
  process.exit(1);
}
if (!existsSync(kilde)) {
  console.error(`Fant ikke filen ${kilde}`);
  process.exit(1);
}

const db = buildDb(loadRaw());
const n = normName(navn);
const person = db.personer.find((p) => normName(p.navn) === n || p.varianter.some((v) => normName(v) === n));
const slug = person?.slug ?? slugify(navn);
if (!person) {
  console.warn(`Advarsel: fant ingen spiller som heter "${navn}". Bildet lagres som ${slug}.webp likevel.`);
  const lignende = db.personer.filter((p) => p.navn.toLowerCase().includes(navn.split(' ')[0].toLowerCase())).slice(0, 5);
  if (lignende.length) console.warn(`Mente du: ${lignende.map((p) => `"${p.navn}"`).join(', ')}?`);
}

mkdirSync(PATHS.bilder, { recursive: true });
// Flytt gamle bilder av samme spiller (andre filtyper) ut av public/
for (const f of readdirSync(PATHS.bilder)) {
  if (f.startsWith(`${slug}.`) && f !== `${slug}.webp`) {
    mkdirSync('bilder-originaler', { recursive: true });
    renameSync(join(PATHS.bilder, f), join('bilder-originaler', f));
  }
}
const out = join(PATHS.bilder, `${slug}.webp`);
const { width, height } = await lagSpillerbilde(kilde, out);
console.log(`Lagret ${out} (${width}×${height}, uten EXIF) for ${person?.navn ?? navn}.`);
console.log('Husk: ha samtykke fra spilleren før bildet publiseres.');
