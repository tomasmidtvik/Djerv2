// Byggesteg: gjør alle bilder i public/spillere/ om til WebP (maks 600 px, uten EXIF).
// Originaler flyttes til bilder-originaler/ (ligger ikke i git). Kjøres automatisk av "npm run dev" og "npm run build".
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PATHS } from '../src/lib/data.ts';
import { slugify } from '../src/lib/names.ts';
import { erFerdig, lagSpillerbilde } from './lib/bilde.ts';

const DIR = PATHS.bilder;
const ORIG = 'bilder-originaler';
const BILDER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif']);

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
let behandlet = 0;
for (const fil of readdirSync(DIR)) {
  const ext = extname(fil).toLowerCase();
  if (!BILDER.has(ext)) continue;
  const path = join(DIR, fil);
  const slug = slugify(fil.slice(0, -ext.length));
  const target = join(DIR, `${slug}.webp`);
  if (path === target && (await erFerdig(path))) continue;
  mkdirSync(ORIG, { recursive: true });
  const orig = join(ORIG, fil);
  renameSync(path, orig);
  await lagSpillerbilde(orig, target);
  behandlet++;
  console.log(`Bilde: ${fil} -> ${target} (original flyttet til ${orig})`);
}
if (behandlet) console.log(`${behandlet} bilde(r) behandlet.`);
