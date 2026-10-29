# Djerv 2 – statistikk og kamparkiv

Nettside med resultater, kamparkiv og statistikk for Djerv 2. Dataene hentes fra NFF-kamprapporter (PDF), og siden publiseres gratis på GitHub Pages.

- **Kamprapporter** gir resultat, lagoppstillinger, mål, kort, dommer og ledere.
- **Mediarapporter** (valgfritt) gir posisjoner, formasjon og hovedtrener.
- **data/matches-meta.yaml** er for det du legger inn selv: opptak, kampreferat, selvmål, innbyttere osv.

All data ligger som tekstfiler i `data/`, så alt er versjonert og kan rettes for hånd.

---

## Legg inn en ny kamp (ca. 5 minutter)

1. Last ned kamprapporten (PDF) fra NFF og legg den i `kamprapporter/<år>/`, f.eks. `kamprapporter/2026/`.
   Har du mediarapporten, legg den i `mediarapporter/<år>/`. Rekkefølgen spiller ingen rolle.
2. Åpne en terminal i prosjektmappen og kjør:
   ```bash
   npm run import
   ```
3. Les oppsummeringen. Står det noe under **Review-liste**, sjekk det (se under).
4. Se på siden lokalt (valgfritt):
   ```bash
   npm run dev
   ```
   og åpne http://localhost:4321/
5. Commit og push (f.eks. i GitHub Desktop). Siden bygges og publiseres automatisk etter et par minutter.

Importen hopper over filer som allerede er importert. Vil du lese alle PDF-ene på nytt (f.eks. etter en oppdatering av parseren):
```bash
npm run import -- --force
```

### Hva importen sjekker

- **Antall mål per lag** må stemme med sluttresultatet. Stemmer det ikke (typisk et selvmål), havner kampen i review-listen. Siden viser da målet som «ukjent målscorer» i stedet for å gjette.
- **Mediarapporten** kobles til kampen på dato, avspark og lagnavn (og bane). Finnes ingen eller flere kamper som passer, havner den i review-listen. Kommer mediarapporten før kamprapporten, kobles den automatisk ved neste import.
- **Rødt kort etter to gule** («Utv. (Adv. 2)») er ikke sett i praksis ennå. Havner et kort i den kolonnen, får du en tydelig **KONTROLLER**-advarsel, så du kan sjekke at det stemmer med PDF-en.
- **Mulige duplikater**: navn som ligner (f.eks. «Kay Magne Pedersen» og «Kay-Magne Larsen Pedersen»). Importen slår aldri sammen personer selv.
- Telefonnummer og e-post blir aldri lagret, selv om de skulle stå i en PDF.

Review-listen lagres også i `data/review.md`. Når du har sjekket en kamp og alt er i orden, sett `godkjent: true` på kampen i `data/matches-meta.yaml`, så forsvinner den fra listen.

---

## Ekstra opplysninger per kamp: `data/matches-meta.yaml`

Nøkkelen er kampnummeret (står i URL-en til kampen, f.eks. `/kamp/12120604081/`). Alle felter er valgfrie:

```yaml
"12120604081":
  opptak:
    - type: hel kamp              # hel kamp | høydepunkter | annet
      tittel: Hele kampen
      url: https://www.youtube.com/watch?v=XXXXXXXXXXX
    - type: høydepunkter
      url: https://vimeo.com/123456789
  referat: |
    Fin seier i sesongens siste hjemmekamp.

    Nytt avsnitt etter en tom linje.
  keeper: Simen Elias Knutsvik Håvåg    # bare når mediarapport mangler
  selvmal:
    - minutt: 55
      til: djerv                  # laget som FIKK målet: djerv | motstander
      spiller: Ola Nordmann       # (valgfritt) hvem som scoret selvmålet
  brukte_innbyttere:              # hvilke innbyttere som faktisk kom inn
    - navn: Marius Claudey
      minutt: 60
    - navn: Even Klubben Sortland # minutt er valgfritt
  ikke_spilt:                     # står i rapporten, men spilte ikke i det hele tatt
    - Ola Nordmann
  tilskuere: 40                   # vises bare hvis over 0
  mediarapport: 2026-10-18_djerv-2_kvernbit-2   # tving kobling (eller false for å ignorere)
  godkjent: true                  # fjerner kampen fra review-listen
```

Tips: YAML er følsomt for innrykk. Bruk mellomrom (ikke tab), og like mange mellomrom på samme nivå.

### Opptak

YouTube- og Vimeo-lenker vises som innebygd video på kampsiden (videoen lastes først når man trykker på spill). Andre lenker vises som en knapp. Siden **Opptak** viser alle kamper med opptak, og hvilke som mangler.

---

## Spillerbilder

```bash
npm run bilde -- "Ole Askevold Vaaler" C:\sti\til\bilde.jpg
```

Kommandoen skalerer bildet ned (maks 600 px), lagrer det som WebP uten EXIF-data (f.eks. GPS-posisjon) og gir det riktig navn i `public/spillere/`. Spillere uten bilde får en plassholder med initialer.

Du kan også legge et bilde rett i `public/spillere/` med spillerens navn som filnavn (f.eks. `ole-askevold-vaaler.jpg`). Det gjøres da om til WebP neste gang du kjører `npm run dev` eller `npm run build`, og originalen flyttes til `bilder-originaler/` (som ikke publiseres). Den sikreste måten er likevel `npm run bilde`, for da kommer originalen aldri inn i git.

> **Samtykke:** Ha samtykke fra spilleren før du publiserer bilde av vedkommende. Siden er offentlig. Vis bare fotballrelatert informasjon, ingen kontaktinfo eller andre personopplysninger.

Bare Djerv 2-spillere og -ledere får egen side. Motstanderspillere vises på kampsiden, men får ikke profil eller statistikk.

---

## Slå sammen spillere: `data/spiller-alias.yaml`

Samme person kan stå med ulike stavemåter i rapportene. Importen foreslår mulige duplikater, og du bestemmer:

```yaml
alias:
  "Kay Magne Pedersen": "Kay-Magne Larsen Pedersen"
  "Øystein Midtvik": "Øystein Emdal Midtvik"

ikke_samme_person:
  - ["Ola Nordmann", "Ola Nordmann Hansen"]
```

Venstre side er navnet slik det står i rapporten, høyre side er navnet personen skal vises med. Kjør `npm run import` etterpå for å se at forslaget er borte.

Én person har én side, uansett om vedkommende er spiller, trener, kontaktperson eller kampvert. Draktnummer brukes aldri som identitet (det endres mellom sesonger).

---

## Slik regnes statistikken

- **Sesong** = kalenderåret for kampdatoen.
- **Kamper** = kamper i troppen. Innbyttere er alltid krysset av som «spilt» i rapportene, så vi vet ikke sikkert om de kom inn. Bruk `brukte_innbyttere` i metadata hvis du vil registrere det.
- En spiller uten kryss i «Spilt» (f.eks. draktnr. 0 / «Strøket») teller ikke.
- **Gule kort** = kolonnen «Adv. 1». **Røde kort** vises som «2 gule» (Utv. Adv. 2) og «direkte» (Utv. Direkte), og samlet.
- **Seiersprosent** for en spiller = lagets seire i kampene spilleren var i troppen.
- **Posisjon** fra mediarapporten vises som «oppstilt som», ikke «spilte som».
- Poeng i sesongoversikten: 3 for seier, 1 for uavgjort (kan endres i `data/innstillinger.yaml`).

---

## Publisering på GitHub Pages (første gang)

1. Lag et **offentlig** repo på GitHub, f.eks. `djerv2-statistikk`.
2. Push prosjektet til repoet (GitHub Desktop: *Add existing repository* → *Publish repository*).
3. På GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Gå til fanen **Actions** og se at «Publiser siden» blir grønn. Siden ligger på `https://<brukernavn>.github.io/<repo-navn>/`.

Etter dette publiseres siden automatisk hver gang du pusher til `main`. Adressen (base-stien) settes automatisk, så du trenger ikke endre noe om repoet heter noe annet. Testene kjøres før publisering. Feiler de, publiseres ikke siden.

### PDF-ene

Som standard publiseres **ikke** PDF-ene i `kamprapporter/` og `mediarapporter/`, bare den parsede JSON-en i `data/`. PDF-ene blir liggende på din maskin, så ta gjerne backup av dem. Vil du ha dem i repoet, se innstillingen øverst i `.gitignore`. Testfilene i `tests/fixtures/` ligger alltid i repoet, så testene kan kjøres.

---

## Kjøre lokalt første gang

Du trenger [Node.js](https://nodejs.org/) (LTS) og helst [GitHub Desktop](https://desktop.github.com/) eller Git.

```bash
npm install
```
```bash
npm run dev
```

## Alle kommandoer

| Kommando | Hva den gjør |
| --- | --- |
| `npm run import` | Leser nye PDF-er og lagrer dem i `data/` |
| `npm run import -- --force` | Leser alle PDF-er på nytt |
| `npm run dev` | Starter siden lokalt på http://localhost:4321/ |
| `npm run build` | Bygger den ferdige siden til `dist/` |
| `npm run bilde -- "Navn" fil.jpg` | Legger inn spillerbilde |
| `npm test` | Kjører testene |
| `npm run parse -- --kort fil.pdf` | Viser hva parseren leser fra én PDF, uten å lagre |

## Innstillinger

- `data/innstillinger.yaml`: lagnavnet som regnes som «oss» (`Djerv 2`), sidetittel og poengregel.
- Farger: øverst i `src/styles/global.css` (`--accent`, `--header` osv.), med egne verdier for mørk modus.

## Mappestruktur

```
kamprapporter/<år>/      NFF-kamprapporter (PDF)
mediarapporter/<år>/     mediarapporter (PDF)
data/matches/            én JSON-fil per kamp (laget av importen)
data/mediarapporter/     én JSON-fil per mediarapport (laget av importen)
data/matches-meta.yaml   dine egne opplysninger per kamp
data/spiller-alias.yaml  sammenslåing av navn
data/review.md           review-listen fra siste import
public/spillere/         spillerbilder (WebP)
src/lib/parse/           parserne for PDF-ene
src/pages/               sidene
tests/                   tester, med eksempel-PDF-er i tests/fixtures/
```

## Feilsøking

- **«Fant ikke …» i importen:** NFF kan ha endret layouten. Kjør `npm run parse -- --kort fil.pdf` og se hva som leses. Parseren finner kolonnene ut fra overskriftene, så små endringer går som regel bra.
- **En kamp vises ikke:** sjekk at lagnavnet starter med «Djerv 2» (se `data/innstillinger.yaml`).
- **Feil i en kamp:** rett direkte i `data/matches/<kampnr>.json`. Merk at `npm run import -- --force` overskriver slike rettelser, så bruk heller `matches-meta.yaml` når det går.
