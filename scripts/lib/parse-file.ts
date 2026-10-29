import { basename } from 'node:path';
import { isKamprapport, parseKamprapport } from '../../src/lib/parse/kamprapport.ts';
import { isMediarapport, parseMediarapport } from '../../src/lib/parse/mediarapport.ts';
import { readPdf } from '../../src/lib/parse/pdf-text.ts';
import type { Kamprapport, Mediarapport } from '../../src/lib/types.ts';
import type { Settings } from './settings.ts';

/** Leser en PDF og avgjør selv om det er en kamprapport eller mediarapport (ut fra innholdet). */
export async function parsePdfFile(path: string, kilde: string, settings: Settings): Promise<Kamprapport | Mediarapport> {
  const pages = await readPdf(path);
  const page = pages[0];
  if (!page) throw new Error('PDF-en har ingen sider');
  if (pages.length > 1) {
    // Rapportene har alltid vært én side. Flere sider leses ikke ennå.
    throw new Error(`PDF-en har ${pages.length} sider – bare én side støttes`);
  }
  if (isKamprapport(page)) return parseKamprapport(page, { lagPrefix: settings.lagnavn, kilde });
  if (isMediarapport(page)) {
    const hint = basename(path).match(/(\d{11})/)?.[1] ?? null;
    return parseMediarapport(page, { kilde, kampnrHint: hint });
  }
  throw new Error('Kjenner ikke igjen PDF-en som kamprapport eller mediarapport');
}
