import sharp from 'sharp';

export const MAKS_PX = 600;

/** Skalerer ned til maks 600 px, lagrer som WebP og fjerner EXIF/metadata (sharp tar ikke med metadata som standard). */
export async function lagSpillerbilde(input: string | Buffer, output: string): Promise<{ width: number; height: number }> {
  const info = await sharp(input)
    .rotate() // bruk EXIF-retningen før metadata fjernes
    .resize({ width: MAKS_PX, height: MAKS_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(output);
  return { width: info.width, height: info.height };
}

/** Er bildet allerede ferdig behandlet (WebP, liten nok og uten EXIF)? */
export async function erFerdig(path: string): Promise<boolean> {
  if (!path.toLowerCase().endsWith('.webp')) return false;
  const m = await sharp(path).metadata();
  return (m.width ?? 0) <= MAKS_PX && (m.height ?? 0) <= MAKS_PX && !m.exif && !m.xmp && !m.iptc;
}
