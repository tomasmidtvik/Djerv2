// Små byggeklosser for handlagde testdata.
import { DEFAULT_SETTINGS, type RawData } from '../src/lib/data.ts';
import type { Kamprapport, RapportLag, RapportLeder, RapportSpiller } from '../src/lib/types.ts';

export function spiller(navn: string, extra: Partial<RapportSpiller> = {}): RapportSpiller {
  const parts = navn.split(' ');
  const etternavn = parts.pop()!;
  return {
    draktnr: 1,
    etternavn,
    fornavn: parts.join(' '),
    navn,
    spilt: true,
    kaptein: false,
    innbytter: false,
    mal: [],
    gule: [],
    rodeAdv2: [],
    rodeDirekte: [],
    ...extra,
  };
}

export function leder(navn: string, funksjon: string, extra: Partial<RapportLeder> = {}): RapportLeder {
  const parts = navn.split(' ');
  const etternavn = parts.pop()!;
  return { nr: 1, etternavn, fornavn: parts.join(' '), navn, funksjon, gule: [], rodeAdv2: [], rodeDirekte: [], ...extra };
}

export function lag(navn: string, spillere: RapportSpiller[], ledere: RapportLeder[] = []): RapportLag {
  return { navn, spillere, ledere };
}

export function kamp(
  kampnr: string,
  dato: string,
  hjemmelag: RapportLag,
  bortelag: RapportLag,
  resultat: [number, number],
  extra: Partial<Kamprapport> = {},
): Kamprapport {
  const djerv = hjemmelag.navn.startsWith('Djerv 2') ? 'hjemme' : bortelag.navn.startsWith('Djerv 2') ? 'borte' : null;
  return {
    type: 'kamprapport',
    versjon: 1,
    kampnr,
    dato,
    avspark: '15:00',
    sesong: Number(dato.slice(0, 4)),
    turnering: '6. div. menn avd. 01',
    bane: 'Testbanen',
    resultat: { hjemme: resultat[0], borte: resultat[1] },
    pause: { hjemme: 0, borte: 0 },
    eeo: null,
    straffekonk: null,
    tilskuere: 0,
    kampvertTilstede: 'Ja',
    dommer: { navn: 'Ola Dommer', klubb: 'Klubb' },
    dommerveileder: null,
    hjemmelag,
    bortelag,
    djerv,
    advarsler: [],
    kilde: 'test',
    ...extra,
  };
}

export function raw(matches: Kamprapport[], extra: Partial<RawData> = {}): RawData {
  return { settings: DEFAULT_SETTINGS, matches, media: [], meta: {}, alias: {}, bilder: [], ...extra };
}
