// Datamodell for filene i data/. Endres formatet, øk `versjon`.

/** Minutter for hendelser. Gule = "Adv. 1", rødeAdv2 = "Utv. (Adv. 2)", rødeDirekte = "Utv. (Direkte)". */
export interface Hendelser {
  gule: number[];
  rodeAdv2: number[];
  rodeDirekte: number[];
}

export interface RapportSpiller extends Hendelser {
  draktnr: number | null;
  etternavn: string;
  fornavn: string;
  /** fornavn + etternavn */
  navn: string;
  /** kryss i "Spilt" (alle innbyttere er krysset av, så dette betyr "i troppen") */
  spilt: boolean;
  kaptein: boolean;
  innbytter: boolean;
  mal: number[];
  /** selvmål scoret av denne spilleren ("11 (s)" i rapporten) – teller for det andre laget */
  selvmal?: number[];
  /** navnet er fjernet fordi personen er reservert mot publisering (se link.ts) */
  skjult?: boolean;
}

export interface RapportLeder extends Hendelser {
  nr: number | null;
  etternavn: string;
  fornavn: string;
  navn: string;
  /** f.eks. "Trener", "Ass.trener", "Kontaktperson", "Kampvert" – lagres som tekst */
  funksjon: string;
}

export interface RapportLag {
  navn: string;
  spillere: RapportSpiller[];
  ledere: RapportLeder[];
}

export interface PersonMedKlubb {
  navn: string;
  klubb: string | null;
}

export interface Score {
  hjemme: number;
  borte: number;
}

/** Innholdet i data/matches/<kampnr>.json */
export interface Kamprapport {
  type: 'kamprapport';
  versjon: 1;
  kampnr: string;
  /** YYYY-MM-DD */
  dato: string;
  /** HH:MM */
  avspark: string;
  /** kalenderår for kampdato */
  sesong: number;
  turnering: string;
  bane: string;
  resultat: Score;
  pause: Score | null;
  /** "Res. e.e.o" er fylt ut */
  eeo: string | null;
  /** "Res. straffekonk." er fylt ut */
  straffekonk: string | null;
  tilskuere: number | null;
  kampvertTilstede: string | null;
  dommer: PersonMedKlubb | null;
  dommerveileder: PersonMedKlubb | null;
  hjemmelag: RapportLag;
  bortelag: RapportLag;
  /** hvilken side Djerv 2 spilte på (null hvis ikke funnet) */
  djerv: 'hjemme' | 'borte' | null;
  /** avkryssede protester (utelates når det ikke er noen) */
  protester?: { side: 'hjemme' | 'borte'; naar: 'for' | 'etter' }[];
  /** advarsler fra parseren (lagres så review-listen kan bygges uten PDF-en) */
  advarsler: string[];
  kilde: string;
}

export type Posisjon = 'Keeper' | 'Forsvar' | 'Midtbane' | 'Angrep' | 'Strøket' | string;

export interface MediaSpiller {
  draktnr: number | null;
  navn: string;
  posisjon: Posisjon | null;
  /** oppført over "Innbyttere" */
  start: boolean;
  kaptein: boolean;
  /** NFF viser "Personinfo ikke tilgjengelig" (personen er reservert mot publisering) */
  skjult?: boolean;
}

export interface MediaLag {
  navn: string;
  spillere: MediaSpiller[];
  hovedtrener: string | null;
  /** f.eks. "4-3-3", beregnet fra startelleveren uten keeper */
  formasjon: string | null;
}

/** Innholdet i data/mediarapporter/<id>.json */
export interface Mediarapport {
  type: 'mediarapport';
  versjon: 1;
  id: string;
  turnering: string | null;
  dato: string;
  avspark: string | null;
  bane: string | null;
  dommer: string | null;
  hjemmelag: MediaLag;
  bortelag: MediaLag;
  /** kampnummer fra filnavnet, hvis det finnes (brukes bare som hint) */
  kampnrHint: string | null;
  advarsler: string[];
  kilde: string;
}

// ---------- data/matches-meta.yaml ----------

export interface Opptak {
  type: 'hel kamp' | 'høydepunkter' | 'annet' | string;
  tittel?: string;
  url: string;
}

export interface Selvmal {
  minutt?: number;
  /** laget som fikk målet: "djerv" eller "motstander" */
  til: 'djerv' | 'motstander';
  /** hvem som scoret selvmålet (valgfritt) */
  spiller?: string;
}

export interface BruktInnbytter {
  navn: string;
  minutt?: number;
}

/** Manuell retting av en hendelse. Uten "fra" legges den til, uten "til" fjernes den. */
export interface Rettelse {
  spiller: string;
  type: 'mal' | 'selvmal' | 'gult' | 'rodt2' | 'rodt';
  fra?: number;
  til?: number;
}

export interface KampMeta {
  /** retter hendelser uten å endre filene importen skriver */
  rettelser?: Rettelse[];
  /** overstyrer pauseresultatet i rapporten */
  pause?: Score;
  opptak?: Opptak[];
  referat?: string;
  /** keeper i kampen – brukes bare hvis mediarapport mangler */
  keeper?: string;
  selvmal?: Selvmal[];
  /** hvilke innbyttere som faktisk kom inn (og når). Satt = de andre innbytterne kom ikke inn. */
  brukte_innbyttere?: BruktInnbytter[];
  /** spillere som står i rapporten, men ikke spilte */
  ikke_spilt?: string[];
  /** skjul navnet på spillere som ikke vil vises (angis med draktnr, så navnet ikke står i repoet) */
  skjul?: { lag: 'djerv' | 'motstander'; draktnr: number }[];
  tilskuere?: number;
  /** tving kobling til en mediarapport-id, eller false for å ignorere */
  mediarapport?: string | false;
  /** fjerner kampen fra review-listen etter at du har sjekket den */
  godkjent?: boolean;
}

export type MatchesMeta = Record<string, KampMeta>;

export interface AliasFil {
  alias?: Record<string, string>;
  ikke_samme_person?: string[][];
}
