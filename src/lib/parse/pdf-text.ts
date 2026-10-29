// Leser tekst med posisjoner fra en PDF via pdfjs-dist.
// Koordinatene gjøres om til "skjermkoordinater": origo øverst til venstre, y øker nedover.
import { readFile } from 'node:fs/promises';

export interface TextToken {
  text: string;
  /** venstre kant */
  x0: number;
  /** høyre kant */
  x1: number;
  /** øvre kant */
  y0: number;
  /** nedre kant */
  y1: number;
  /** grunnlinje-y for vannrett tekst (brukes til å gruppere linjer) */
  y: number;
  /** true hvis teksten er rotert (loddrett kolonneoverskrift) */
  rotated: boolean;
}

export interface PdfPage {
  width: number;
  height: number;
  tokens: TextToken[];
}

/**
 * Henter alle tekstbiter fra PDF-en, delt opp i enkeltord.
 * pdfjs kan levere flere ord i samme bit; vi deler dem og fordeler bredden
 * proporsjonalt med antall tegn, slik at hvert ord får en egen x-posisjon.
 */
export async function readPdf(input: string | Uint8Array): Promise<PdfPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = typeof input === 'string' ? new Uint8Array(await readFile(input)) : input;
  const task = pdfjs.getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const tokens: TextToken[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform as number[];
      const rotated = Math.abs(b) > 0.01 || Math.abs(c) > 0.01;
      const fontSize = Math.hypot(c, d) || Math.hypot(a, b);
      if (rotated) {
        // Loddrett tekst (lest nedenfra og opp). Bredden går langs y-aksen.
        const len = item.width as number;
        const yBase = viewport.height - f;
        const up = b > 0; // tekst som går oppover
        tokens.push({
          text: item.str.trim(),
          x0: e - fontSize,
          x1: e,
          y0: up ? yBase - len : yBase,
          y1: up ? yBase : yBase + len,
          y: yBase,
          rotated: true,
        });
        continue;
      }
      const baseY = viewport.height - f;
      const width = item.width as number;
      const str = item.str as string;
      // Del opp i ord og fordel bredden
      const totalChars = str.length;
      let offset = 0;
      for (const part of str.split(/(\s+)/)) {
        const partWidth = totalChars ? (width * part.length) / totalChars : 0;
        if (part.trim()) {
          tokens.push({
            text: part,
            x0: e + offset,
            x1: e + offset + partWidth,
            y0: baseY - fontSize,
            y1: baseY,
            y: baseY,
            rotated: false,
          });
        }
        offset += partWidth;
      }
    }
    pages.push({ width: viewport.width, height: viewport.height, tokens });
  }
  await task.destroy();
  return pages;
}
