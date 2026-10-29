// Skriver ut hva parseren leser fra én eller flere PDF-er, uten å lagre noe.
// Bruk: npm run parse -- sti/til/fil.pdf          (full JSON)
//       npm run parse -- --kort sti/til/fil.pdf   (kort oppsummering)
import { relative } from 'node:path';
import { parsePdfFile } from './lib/parse-file.ts';
import { loadSettings } from './lib/settings.ts';
import { summarize } from './lib/summary.ts';

const args = process.argv.slice(2);
const kort = args.includes('--kort');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Bruk: npm run parse -- [--kort] sti/til/fil.pdf');
  process.exit(1);
}
const settings = await loadSettings();
for (const f of files) {
  const result = await parsePdfFile(f, relative(process.cwd(), f).replace(/\\/g, '/'), settings);
  console.log(kort ? summarize(result) + '\n' : JSON.stringify(result, null, 2));
}
