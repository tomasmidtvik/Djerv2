// Navnehåndtering: normalisering, sammenligning og URL-slugs.

/** Alle varianter av bindestrek/tankestrek som forekommer i PDF-ene. */
const DASHES = /[‐‑‒–—―−­﹘﹣－]/g;

/** Normaliserer Unicode, bindestreker og mellomrom, men beholder store/små bokstaver. */
export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(DASHES, '-')
    .replace(/[  -​  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nøkkel for sammenligning: renset tekst i små bokstaver. */
export function normName(s: string): string {
  return cleanText(s).toLocaleLowerCase('nb-NO');
}

/** Navnedeler som mengde (bindestrek og mellomrom skiller deler). */
export function nameParts(s: string): Set<string> {
  return new Set(
    normName(s)
      .split(/[\s-]+/)
      .filter(Boolean),
  );
}

export function sameParts(a: string, b: string): boolean {
  const pa = nameParts(a);
  const pb = nameParts(b);
  if (pa.size !== pb.size) return false;
  for (const p of pa) if (!pb.has(p)) return false;
  return true;
}

/** true hvis alle navnedelene i a finnes i b (og a har færre deler). */
export function isSubsetName(a: string, b: string): boolean {
  const pa = nameParts(a);
  const pb = nameParts(b);
  if (pa.size >= pb.size) return false;
  for (const p of pa) if (!pb.has(p)) return false;
  return true;
}

/** Fullt navn fra kamprapportens "Etternavn" + "Fornavn". */
export function fullName(fornavn: string, etternavn: string): string {
  return cleanText(`${fornavn} ${etternavn}`);
}

/** URL-vennlig slug: "Arne Ravnå" -> "arne-ravna". */
export function slugify(s: string): string {
  return normName(s)
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Initialer til plassholderbilde: "Ole Askevold Vaaler" -> "OV". */
export function initials(name: string): string {
  const parts = cleanText(name).split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('nb-NO');
}

/** Levenshtein-avstand (for å foreslå skrivefeil som mulige duplikater). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Lag-navn sammenlignes uten store/små bokstaver og bindestrekvarianter. */
export function sameTeam(a: string, b: string): boolean {
  return normName(a) === normName(b);
}

/** Er dette vårt lag? Lagnavnet må starte med prefikset, etterfulgt av slutt eller ikke-siffer. */
export function isOurTeam(teamName: string, prefix: string): boolean {
  const n = normName(teamName);
  const p = normName(prefix);
  if (!n.startsWith(p)) return false;
  const rest = n.slice(p.length);
  return rest === '' || !/^\d/.test(rest);
}
