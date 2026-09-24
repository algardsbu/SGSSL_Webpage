# Repository og utrulling

Nettstedet har et dedikert GitHub-repository: [algardsbu/SGSSL_Webpage](https://github.com/algardsbu/SGSSL_Webpage). Prosjektfilene, `.pages.yml` og `.github/workflows/site.yml` ligger i repositoryets rot. Importen er forberedt på `setup/astro-pages-cms`; `main` er produksjonsgrenen. Foreldrerepositoryet til den opprinnelige prosjektmappen og dets remotes er ikke endret.

## Lokal klone og oppsettsgren

Klon `git@github.com:algardsbu/SGSSL_Webpage.git` til en separat mappe. Inntil oppsettsendringen er innlemmet, bytt til `setup/astro-pages-cms` med `git switch setup/astro-pages-cms`. Etter innlemming brukes `main`. Importen inkluderer ikke lokale `.env`-filer, `.data`, SQLite-filer, nøkler, `node_modules`, `.astro`, testresultater eller `dist`. Ikke endre remotes i det opprinnelige foreldrerepositoryet.

Kjør `npm ci`, `npm run check`, `npm test` og `npm run test:browser` i den nye klonen. Nettstedet trenger Node.js 24 kun under utvikling og bygging; Domeneshop mottar statiske filer fra `dist/`.

Arbeidsflyten validerer pull requests og bygger `main`. Den kjører innholdsvalidering, Astro/TypeScript-kontroll, automatiserte tester og Chromium-tester før det siste produksjonsbygget. Bare et vellykket `dist/`-artefakt sendes videre til deployjobben. Artefakter beholdes i 30 dager. Hele arbeidsflyten er serialisert per gren med `cancel-in-progress: false`, slik at en treg eldre bygging ikke innhentes av en nyere utrulling. GitHub-tokenet har bare `contents: read`; checkout beholder ikke tokenet i Git-konfigurasjonen. Actions er låst til verifiserte commit-ID-er med versjonskommentarer, og artefaktnedlasting avbryter ved avvik i kontrollsummen. Opprett gjerne branch protection med påkrevd `build`-sjekk.

Rett før utrulling sjekkes artefaktets commit mot gjeldende `main` via GitHub API. Et utdatert bygg avbrytes, også ved manuell omkjøring av en gammel arbeidsflyt. Bruk alltid siste vellykkede kjøring; tilsiktet tilbakerulling gjøres som beskrevet nederst.

## Domene og hosting

Velg og bekreft det virkelige domenet før produksjon aktiveres. Knytt domenet til riktig Domeneshop-webhotell i kontrollpanelet, følg leverandørens DNS-anvisninger, og aktiver/vent på et gyldig HTTPS-sertifikat. Kontroller at både ønsket domenenavn og eventuelt `www` peker til riktig sted; bruk hostingens domeneinnstillinger for én foretrukket HTTPS-adresse.

[Domeneshop dokumenterer](https://domene.shop/faq?id=56) SFTP-tjeneren `sftp.domeneshop.no` (alternativt `scp.domeneshop.no`), webhotellets FTP-brukernavn/passord og `www` som katalogen for publiserte filer. Bekreft de faktiske opplysningene for klubbens abonnement før de legges inn. Bruk SFTP, ikke ukryptert FTP.

Målkatalogen må allerede finnes og være en virkelig katalog uten symbolske lenker. Typisk `SFTP_REMOTE_DIR=www`; en bekreftet absolutt sti som `/home/bruker/www` eller en undermappe under `www` støttes også. Rotkatalog, hjemmekatalog alene, `..`, skjulte katalogledd og stier med shell-tegn avvises.

## GitHub-innstillinger

La `DEPLOY_ENABLED` være fraværende eller `false` under klargjøring. Opprett GitHub Actions-miljøet `production`. Bruk **repository variables** for verdiene i første tabell, fordi byggejobben ikke kjører i `production`-miljøet.

| Repository variable | Verdi |
| --- | --- |
| `DEPLOY_ENABLED` | Sett til nøyaktig `true` som siste aktiveringstrinn |
| `SITE_URL` | Virkelig produksjonsdomene, f.eks. klubbens `https://…no`, uten sti; eksempel-/lokale domener avvises |
| `PUBLIC_CMS_URL` | Valgfri HTTPS-adresse til hosted Pages CMS; standard `https://app.pagescms.org` |
| `SFTP_HOST` | Bekreftet SFTP-tjener |
| `SFTP_PORT` | Vanligvis `22`; kan utelates |
| `SFTP_REMOTE_DIR` | Bekreftet webkatalog, normalt `www` |

| Actions secret, i `production` eller repositoryet | Verdi |
| --- | --- |
| `SFTP_USERNAME` | Webhotellets SFTP-brukernavn |
| `SFTP_PASSWORD` | Webhotellets SFTP-passord |
| `SFTP_HOST_KEY_SHA256` | Verifisert OpenSSH SHA256-fingeravtrykk, med eller uten `SHA256:`-prefiks |

Bekreft SSH-vertsnøkkelens fingeravtrykk gjennom en uavhengig, betrodd kanal, for eksempel Domeneshop-support eller allerede verifisert administratortilgang. `ssh-keyscan` alene autentiserer ikke en tjener. Deployklienten sammenligner tjenerens SHA256-fingeravtrykk og avbryter ved avvik; ikke bytt verdien uten å bekrefte nøkkelbyttet.

Kontroller at `SITE_URL` er riktig før artefaktet bygges; den brukes i absolutte metadata og sitemap. Det siste bygget bruker repositoryvariablene. Manglende domene er tillatt for lokal utvikling, men deployskriptet krever et reelt HTTPS-domene. Hemmeligheter skal ikke legges i `.pages.yml`, Markdown, arbeidsflytfilen eller artiklenes felter.

## Første aktivering og filansvar

1. Ta sikkerhetskopi av eksisterende hostinginnhold utenfor webkatalogen.
2. Se gjennom `dist/` fra et vellykket bygg og kontroller riktig domene og CMS-lenke. Kontroller skriveadgang til målkatalogen og støtte for OpenSSH sin atomiske `posix-rename`-operasjon på SFTP-tjeneren.
3. Deployverktøyet overtar ikke eksisterende filer automatisk. Hvis eksempelvis `www/index.html` finnes uten å stå i SGSSL-manifestet, stopper det for å beskytte eksisterende innhold. Flytt gamle nettstedfiler som kolliderer med det nye bygget til sikkerhetskopien, etter å ha kontrollert dem. Behold uvedkommende filer på webhotellet. Ikke lag et manifest som påstår eierskap til filer verktøyet ikke har lastet opp.
4. Når domene, mål, innloggingsdetaljer, vertsnøkkel, CMS og bygg er kontrollert, sett `DEPLOY_ENABLED=true` og start arbeidsflyten på `main`.
5. Kontroller hjemmeside, mobilmeny, gamle `.html`-adresser, «Admin Login», nyhetsoversikt og sitemap på det virkelige domenet. Utfør deretter publiserings-/avpubliseringstesten i [CMS-veiledningen](cms.md).

Bare `dist/` lastes opp. `.sgssl-deploy-manifest.json` i målkatalogen inneholder navn på filene deployverktøyet eier; den inneholder ingen hemmeligheter. Første kjøring oppretter manifestet. Senere kjøringer laster først alle nye filer til en unik midlertidig katalog, leser filene tilbake og verifiserer alle byte, skriver en eierskapsjournal, erstatter filene og sletter deretter utdaterte **administrerte filer**. Dette gjør at avpubliserte/slettede artikler forsvinner. Andre filer røres ikke; kataloger ryddes ikke rekursivt.

Feil under opplasting fører ikke til utskifting av eksisterende sider eller sletting av gamle sider. Et avbrudd under selve filbyttet kan gi en blanding av gammel og ny versjon; SFTP støtter ikke én atomisk transaksjon for hele nettstedet. Journalen beholder eierskapet slik at neste kjøring kan fullføre. Hvis sletting feiler, feiler kjøringen og journalen beholdes for nytt forsøk. Midlertidige `.sgssl-stage-*`-kataloger som blir igjen etter nettverksfeil kan gjennomgås og fjernes manuelt når ingen deploy kjører.

## Tilbakerulling

Last ned et tidligere vellykket `site-<commit>`-artefakt før 30-dagersfristen, pakk det ut til `dist/` i en ren lokal prosjektklone, og kjør `node scripts/deploy.mjs` med de samme verifiserte miljøverdiene og hemmelighetene fra en betrodd administratormaskin. Artefaktet må inneholde `index.html` direkte i `dist/`; ikke bygg kildekoden på nytt hvis målet er den nøyaktige gamle versjonen. Deployverktøyets manifest rydder også bort filer som bare finnes i den nyere versjonen. Hold automatiske utrullinger deaktivert mens en manuell tilbakerulling pågår, og gjør deretter en passende revert i `main` før de aktiveres igjen.

Direkte deploy er deaktivert når `DEPLOY_ENABLED` ikke er nøyaktig `true`, også ved lokal kjøring. Ingen live tilkobling er gjennomført som del av migreringen; repository, domene, hosting og eiertilgang må konfigureres først.
