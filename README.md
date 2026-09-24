# Sandnes og Gjesdal Skiskytterlag

Statisk nettsted med Astro og TypeScript. Eksisterende norsk innhold, bilder og CSS er bevart. Nyheter og arrangementer redigeres i hosted Pages CMS. Nyhetene bygges fra Markdown, og kalenderen bruker en validert arrangementsliste. Node.js trengs bare til utvikling, testing og bygging; webhotellet trenger ingen applikasjonsserver.

## Kom i gang

Bruk Node.js 24 eller nyere (`.node-version` angir 24):

```bash
npm ci
npm run dev
```

Åpne adressen i terminalen. Valgfri lokal konfigurasjon finnes i `.env.example`; kopier til `.env` ved behov. Eksisterende lokale `.env`-/databasefiler fra den gamle innloggingen er ikke endret og skal ikke distribueres.

| Kommando | Formål |
| --- | --- |
| `npm run dev` | Lokal Astro-utviklingsserver |
| `npm run check` | Valider artikler, arrangementer, bilder og Astro/TypeScript |
| `npm run build` | Valider og bygg bare offentlige filer til `dist/` |
| `npm run preview` | Se det ferdige statiske bygget lokalt |
| `npm test` | Bygg og kjør innholds-, sikkerhets-, publiserings- og SFTP-tester |
| `npm run test:browser` | Chromium-tester av desktop og mobil mot `dist/` |
| `npm run deploy` | SFTP-utrulling; deaktivert inntil eksplisitt konfigurert |

Før første nettlesertest kjører du `npx playwright install chromium` (på Linux kan systemavhengigheter kreve `--with-deps`). Et installert Chromium kan brukes med `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/sti/til/chromium`. Hvis utviklingsserveren allerede bruker port 4321, kjør nettlesertestene med `PLAYWRIGHT_PORT=4433 npm run test:browser`. SFTP-testene starter en isolert lokal SSH/SFTP-tjener med midlertidig nøkkel og testdata; de trenger lokal nettverkstilgang, ingen hostingkonto. Astro-telemetri kan deaktiveres med `ASTRO_TELEMETRY_DISABLED=1`.

## Innhold og struktur

- `src/pages/`, `src/layouts/` og `src/components/`: delte sider, navigasjon, metadata og bunntekst. Uferdige informasjonssider forblir merket «Under utvikling».
- `src/styles/global.css`: videreføring av den eksisterende CSS-en; ingen Tailwind.
- `src/content/articles/`: validerte Markdown-artikler. Det medfølgende eksempelet er et upublisert utkast.
- `src/data/events.json`: CMS-styrte arrangementer med dato, valgfritt klokkeslett, sted, beskrivelse og publiseringsstatus. Starter tom.
- `.pages.yml`: norske CMS-felter for nyheter og arrangementer, bildeopplasting og synlig publiseringsstatus.
- `public/images/`: JPEG-, PNG- og WebP-bilder. `public/pictures/` bevarer de gamle bildeadressene.
- `scripts/`: validering, statiske omdirigeringer/sitemap og SFTP-utrulling.
- `.github/workflows/site.yml`: validering av pull requests og bygging/valgfri utrulling fra `main`.

`/news/` viser publiserte artikler, og forsiden viser de tre nyeste. Filnavnet gir den faste `/news/<slug>/`-adressen. Tittelendring endrer ikke adressen eller artikkelens UUID. Publiseringsdato styrer visning og sortering; fremtidige datoer er ikke tidsstyrt publisering. Duplikate ID-er, ugyldige filnavn, manglende bilder og feil metadata stopper byggingen. Markdown renses for aktiv HTML; MDX er ikke aktivert.

`/events/` viser en interaktiv månedskalender med valg av måned og dag, arrangementsdetaljer og de seks neste arrangementene. Forsiden viser en kompakt kalender og de tre neste. Kalenderen bruker norsk tid (Europe/Oslo), mandag som første ukedag og fungerer med tastatur. Bare publiserte arrangementer inkluderes i bygget; tidligere arrangementer kan finnes ved å bla bakover. Uten JavaScript vises en liste fra byggetidspunktet.

Gamle `.html`-adresser får statiske HTML-omdirigeringer med en klikkbar reservelenke. `/index.html` viser fortsatt forsiden. De gamle admin-/login-adressene leder til hosted Pages CMS, og «Admin Login» finnes i bunnteksten. Det finnes ingen lokal innlogging eller passorddatabase i applikasjonen.

`PUBLIC_CMS_URL` må være HTTPS og er som standard `https://app.pagescms.org`. `SITE_URL` settes til det faktiske HTTPS-domenet før produksjon. Når domenet er satt, får nettstedet kanoniske adresser, absolutte delingsmetadata og en sitemap med bare genererte offentlige sider. Uten domene utelates sitemap, og `robots.txt` ber søkemotorer avstå fra indeksering.

Alle opplastede bilder er offentlige, også bilder til utkast. Utkast er ikke et fortrolig dokumentlager. Facebook-/Instagram-feltene lagrer bare metadata; automatisk deling kommer i en senere versjon.

## Videre arbeid og aktivering

Les [CMS-veiledningen](docs/cms.md) for eierens GitHub App-installasjon, invitasjoner og første publisering. [Utrullingsveiledningen](docs/deployment.md) beskriver eget repository, domene, hosting, hemmeligheter, vertsverifisering, filmanifest og tilbakerulling. Nye klubbsider opprettes med [Astro-sidemalen](docs/pages.md).

Dette er det dedikerte repositoryet [algardsbu/SGSSL_Webpage](https://github.com/algardsbu/SGSSL_Webpage), med nettstedet og `.pages.yml` i roten. Oppsettet ligger på grenen `setup/astro-pages-cms` for gjennomgang før innlemming i `main`. Velg denne grenen i Pages CMS for å kontrollere konfigurasjonen; etter innlemming brukes `main` som produksjonsgren. Den opprinnelige prosjektmappen og foreldrerepositoryets remotes er uendret. Live CMS-tilkobling, redaktørtest og hostingutrulling er ikke utført. Opplasting forblir deaktivert til `DEPLOY_ENABLED=true` og alle nødvendige innstillinger er bekreftet.
