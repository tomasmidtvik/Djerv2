// Hjelpefunksjoner for å jobbe med tekstposisjoner.
import { cleanText } from '../names.ts';
import type { TextToken } from './pdf-text.ts';

export interface Line {
  y: number;
  tokens: TextToken[];
}

/** Grupperer vannrette tokens i linjer etter grunnlinje (y), sortert ovenfra og ned. */
export function toLines(tokens: TextToken[], tol = 2): Line[] {
  const sorted = tokens.filter((t) => !t.rotated).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: Line[] = [];
  for (const t of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(t.y - last.y) <= tol) last.tokens.push(t);
    else lines.push({ y: t.y, tokens: [t] });
  }
  for (const l of lines) l.tokens.sort((a, b) => a.x0 - b.x0);
  return lines;
}

export function joinText(tokens: TextToken[]): string {
  return cleanText(
    [...tokens]
      .sort((a, b) => a.x0 - b.x0)
      .map((t) => t.text)
      .join(' '),
  );
}

export function center(t: TextToken): number {
  return (t.x0 + t.x1) / 2;
}

/** Tall, minutter ("29,", "45+2") eller avkrysning ("X"). */
export function isValueToken(t: TextToken): boolean {
  return /^[\dXx✓✔+,.\s]+$/.test(t.text);
}

export interface Column {
  key: string;
  x0: number;
}

/**
 * Fordeler tokens i en rad på kolonner. Kolonnene er definert av venstrekanten til overskriften.
 * Tall og kryss plasseres etter midtpunktet (de står midt i/til høyre for overskriften),
 * tekst plasseres etter venstrekanten.
 */
export function assignColumns(tokens: TextToken[], columns: Column[], tol = 2) {
  const cols = [...columns].sort((a, b) => a.x0 - b.x0);
  const out = new Map<string, TextToken[]>();
  const unassigned: TextToken[] = [];
  for (const t of tokens) {
    const pos = isValueToken(t) ? center(t) : t.x0;
    let chosen: Column | undefined;
    for (const c of cols) if (c.x0 - tol <= pos) chosen = c;
    if (!chosen) {
      unassigned.push(t);
      continue;
    }
    if (!out.has(chosen.key)) out.set(chosen.key, []);
    out.get(chosen.key)!.push(t);
  }
  return { cells: out, unassigned };
}

/**
 * Leser minutter fra en celle: "29, 80" -> [29, 80].
 * "45+2" lagres som 45 (med advarsel), siden overtid i 1. omgang ellers havner i 2. omgang.
 */
export function parseMinutes(text: string, warn: (msg: string) => void): number[] {
  const out: number[] = [];
  const s = cleanText(text);
  if (!s) return out;
  for (const part of s.split(/[,;]+/)) {
    const p = part.trim();
    if (!p) continue;
    const plus = p.match(/^(\d{1,3})\s*\+\s*(\d{1,2})$/);
    if (plus) {
      out.push(Number(plus[1]));
      warn(`Minutt "${p}" lagret som ${plus[1]}`);
      continue;
    }
    const m = p.match(/^(\d{1,3})'?$/);
    if (m) out.push(Number(m[1]));
    else warn(`Kunne ikke lese minutt "${p}"`);
  }
  return out;
}

/**
 * Leser målkolonnen. NFF markerer selvmål med "(s)": "11 (s)" betyr at spilleren scoret selvmål i 11'
 * (målet teller for det andre laget). "29, 11 (s)" gir mal [29] og selvmal [11].
 */
export function parseGoals(text: string, warn: (msg: string) => void): { mal: number[]; selvmal: number[] } {
  const mal: string[] = [];
  const selvmal: number[] = [];
  for (const part of cleanText(text).split(/[,;]+/)) {
    const p = part.trim();
    const sm = p.match(/^(\d{1,3})\s*\(\s*s\s*\)$/i);
    if (sm) selvmal.push(Number(sm[1]));
    else if (p) mal.push(p);
  }
  return { mal: parseMinutes(mal.join(', '), warn), selvmal };
}

/**
 * Mønstre som ligner telefonnummer (8 sifre, ev. med mellomrom og +47) eller e-post.
 * Slike opplysninger skal aldri lagres. Datoer (med punktum) og kampnummer (11 sifre) slipper gjennom.
 */
const PHONE = /(?<![\d.])(?:\+\d{2}\s?)?\d(?:[ -]?\d){7}(?![\d.])/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function looksPrivate(s: string): boolean {
  return PHONE.test(s) || EMAIL.test(s);
}

/** Fjerner telefonnummer/e-post fra en tekst og varsler. */
export function scrub(s: string, warn: (msg: string) => void, what: string): string {
  if (!looksPrivate(s)) return s;
  warn(`Fjernet noe som ligner telefonnummer/e-post fra ${what}`);
  return cleanText(s.replace(new RegExp(PHONE, 'g'), '').replace(new RegExp(EMAIL, 'g'), ''));
}
