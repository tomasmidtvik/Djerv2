// Leser datafilene i data/. Brukes både av importen og av nettsiden ved bygging.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { AliasFil, Kamprapport, MatchesMeta, Mediarapport } from './types.ts';

export interface Settings {
  /** lag som starter med dette navnet regnes som oss */
  lagnavn: string;
  /** tittel på nettsiden */
  sidetittel: string;
  poeng: { seier: number; uavgjort: number; tap: number };
}

export const DEFAULT_SETTINGS: Settings = {
  lagnavn: 'Djerv 2',
  sidetittel: 'Djerv 2',
  poeng: { seier: 3, uavgjort: 1, tap: 0 },
};

export interface RawData {
  settings: Settings;
  matches: Kamprapport[];
  media: Mediarapport[];
  meta: MatchesMeta;
  alias: AliasFil;
  /** filnavn i public/spillere/ */
  bilder: string[];
}

export const PATHS = {
  matches: 'data/matches',
  media: 'data/mediarapporter',
  meta: 'data/matches-meta.yaml',
  alias: 'data/spiller-alias.yaml',
  settings: 'data/innstillinger.yaml',
  importLog: 'data/import-logg.json',
  review: 'data/review.md',
  bilder: 'public/spillere',
};

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = parse(readFileSync(path, 'utf8'));
  return (raw ?? fallback) as T;
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T);
}

export function loadSettings(root = '.'): Settings {
  const s = readYaml<Partial<Settings>>(join(root, PATHS.settings), {});
  return { ...DEFAULT_SETTINGS, ...s, poeng: { ...DEFAULT_SETTINGS.poeng, ...(s.poeng ?? {}) } };
}

export function loadRaw(root = '.'): RawData {
  const metaRaw = readYaml<Record<string, unknown>>(join(root, PATHS.meta), {});
  const meta: MatchesMeta = {};
  for (const [k, v] of Object.entries(metaRaw)) if (v && typeof v === 'object') meta[String(k)] = v as any;
  const bildeDir = join(root, PATHS.bilder);
  return {
    settings: loadSettings(root),
    matches: readJsonDir<Kamprapport>(join(root, PATHS.matches)),
    media: readJsonDir<Mediarapport>(join(root, PATHS.media)),
    meta,
    alias: readYaml<AliasFil>(join(root, PATHS.alias), {}),
    bilder: existsSync(bildeDir) ? readdirSync(bildeDir) : [],
  };
}
