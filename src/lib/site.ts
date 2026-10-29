// Felles hjelpere for sidene: data, lenker og formatering.
import { loadRaw } from './data.ts';
import { buildDb, type Db, type Kamp } from './db.ts';

let cached: Db | null = null;

/** Datamodellen. Under utvikling bygges den på nytt hver gang, så endringer i data/ vises med en gang. */
export function getDb(): Db {
  if (import.meta.env.DEV) return buildDb(loadRaw());
  cached ??= buildDb(loadRaw());
  return cached;
}

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Lenke innenfor siden, med riktig base-sti (f.eks. /djerv2/). */
export function url(path = ''): string {
  return BASE + path.replace(/^\/+/, '');
}

export const kampUrl = (kampnr: string) => url(`kamp/${kampnr}/`);
export const spillerUrl = (slug: string) => url(`spiller/${slug}/`);

const dateOf = (dato: string) => new Date(`${dato}T12:00:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', ...o });

/** 18.10.2026 */
export const datoKort = (dato: string) => fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateOf(dato));
/** søndag 18. oktober 2026 */
export const datoLang = (dato: string) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateOf(dato));
/** Stor forbokstav: "søndag 18. oktober" -> "Søndag 18. oktober" */
export const stor = (s: string) => s.charAt(0).toLocaleUpperCase('nb-NO') + s.slice(1);
/** søn. 18. okt. */
export const datoUkedag = (dato: string) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(dateOf(dato));

export const tall = (n: number, des = 0) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: des, maximumFractionDigits: des }).format(n);

export const prosent = (n: number | null) => (n === null ? '–' : `${tall(n, n % 1 ? 1 : 0)} %`);

export const utfallTekst = { S: 'Seier', U: 'Uavgjort', T: 'Tap' } as const;

/** "Djerv 2 5-3 Kvernbit 2" */
export const kampTittel = (k: Kamp) => `${k.hjemme.navn} ${k.resultat.hjemme}-${k.resultat.borte} ${k.borte.navn}`;
