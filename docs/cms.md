# Nyheter og arrangementer i Pages CMS

Nettsiden bruker [hosted Pages CMS](https://app.pagescms.org) til redigering. Det finnes ingen lokal innlogging, passorddatabase eller Express-server. Nyheter lagres som Markdown i `src/content/articles/`; klubbsidene redigeres i Astro-koden.

## Eier: koble til repositoryet

1. Åpne [algardsbu/SGSSL_Webpage](https://github.com/algardsbu/SGSSL_Webpage). Nettstedet og `.pages.yml` ligger i roten på `setup/astro-pages-cms`. Velg denne grenen i CMS-et for å kontrollere oppsettet før endringen innlemmes i `main`.
2. Eieren logger inn på [app.pagescms.org](https://app.pagescms.org), installerer Pages CMS sin GitHub App for dette repositoryet og åpner repositoryet og ønsket gren i CMS-et. Etter at oppsettsendringen er innlemmet, velges `main` som produksjonsgren. Installasjonen må godkjennes av en bruker som kan administrere repositoryet. Se [Pages CMS quick start](https://pagescms.org/docs/quick-start/).
3. Kontroller at **Nyheter**, **Arrangementer** og **Bilder** vises. `.pages.yml` definerer norske feltnavn, publiseringsstatus i listen og tillatte bildeformater.
4. Inviter redaktører via e-post fra Pages CMS sin samarbeidsfunksjon. Bruk en separat testinvitasjon til kontrollen nedenfor før faktisk publisering.
5. Sett valgfritt repository-variabelen `PUBLIC_CMS_URL` til den HTTPS-adressen som CMS-et viser for dette repositoryet. Ellers går «Admin Login» til `https://app.pagescms.org`. CMS-adressen er offentlig og må ikke inneholde innloggingstokens.

[Pages CMS sine dokumenterte samarbeidstillatelser](https://pagescms.org/docs/configuration/collaborators/) lar inviterte redaktører redigere innhold og medier uten GitHub-konto. Administrasjon av `.pages.yml` og invitasjoner forblir hos GitHub-brukere med repositorytilgang. Denne løsningen bruker disse tillatelsene uten egendefinerte roller. Invitasjoner lagres i Pages CMS, ikke i `.pages.yml`.

## Arrangementer og kalender

Åpne **Arrangementer** i Pages CMS og legg til en oppføring. Fyll inn tittel,
dato, eventuelt klokkeslett (for eksempel `18:00` eller `14:00-16:00`), sted og en kort beskrivelse.
Klokkeslett er norsk lokal tid; tomt klokkeslett betyr hele dagen. Hver oppføring
får en fast UUID automatisk. Nye arrangementer er upubliserte til **Publisert**
slås på. Lagre listen når du er ferdig.

De samme publiserte arrangementene brukes på forsiden og på `/events/`.
Forsiden viser en kompakt kalender og de neste arrangementene; arrangementssiden
har en større månedskalender. Velg en dag for tid, sted og beskrivelse, bruk
pilene eller månedsvelgeren for å bytte måned, og **I dag** for å gå tilbake.
Gamle arrangementer er fortsatt tilgjengelige på sin dato, men utelates fra
listen over kommende arrangementer. Slå av **Publisert** for å skjule en oppføring.

Kalenderdata lagres i `src/data/events.json`. Det finnes ingen fiktive arrangementer
i startoppsettet. CMS-endringer må hentes lokalt eller bygges og rulles ut før de
vises på nettsiden, på samme måte som nyheter.

## Se CMS-endringer lokalt

Pages CMS lagrer endringer som commits på den valgte GitHub-grenen. En side på
`localhost` viser filene i mappen der `npm run dev` ble startet; CMS-et oppdaterer
ikke denne mappen automatisk. Hent endringene med `git pull --ff-only` i klonen av
`algardsbu/SGSSL_Webpage`, på samme gren som er valgt i CMS-et. En kjørende
utviklingsserver oppdaterer deretter innholdet. Ved `npm run preview` må
`npm run build` kjøres på nytt.

Den opprinnelige `Webteknologi-IT2805/sgssl`-mappen tilhører et annet repository.
Å trekke inn endringer der henter ikke CMS-innholdet fra GitHub; bruk den dedikerte
GitHub-klonen til videre utvikling. På det offentlige nettstedet kreves et
vellykket bygg og aktivert utrulling før endringen vises.

## Første artikkel

1. Åpne **Nyheter**, velg ny artikkel, og skriv en reell tittel og kort beskrivelse. La **Publisert**, **Ønskes delt på Facebook** og **Ønskes delt på Instagram** stå av.
2. Kontroller publiseringsdatoen. Den bestemmer synlig dato og rekkefølge, ikke tidspunktet for publisering. En fremtidig dato utsetter ikke en artikkel som er merket publisert.
3. Last opp et JPEG-, PNG- eller WebP-bilde via **Hovedbilde**, og fyll inn en beskrivende alternativ tekst. Skriv artikkelen i **Artikkeltekst**. Bilder inne i teksten settes inn med CMS-editoren/Markdown, ikke HTML. Eksterne bilde-URL-er og SVG er ikke tillatt.
4. Lagre utkastet. Filnavnet genereres fra tittelen ved opprettelse; filnavnet blir den faste `/news/<filnavn>/`-adressen. En automatisk UUID identifiserer artikkelen uavhengig av tittel og filnavn. UUID er skrivebeskyttet, og CMS-et tillater ikke omdøping av artikler. Senere tittelendringer beholder URL-en.
5. Se over innholdet. Slå på **Publisert** og lagre. Når utrulling er aktivert, bygger en commit på `main` nettstedet. Artikkelen blir synlig først etter vellykket bygging og utrulling. Kontroller GitHub Actions hvis endringen ikke vises.
6. Kontroller artikkelsiden, nyhetslisten og forsiden. For å avpublisere slår du av **Publisert** og lagrer. Neste vellykkede utrulling fjerner artikkelsiden og lenkene; manifestet fjerner den tidligere opplastede HTML-filen. Gamle nettleser-/mellomlagerkopier kan fortsatt finnes.

`eksempel-utkast.md` er et tydelig merket, upublisert redaktøreksempel. Ikke publiser dette som en klubbnyhet. Det er trygt å slette eksempelet når redaktørene er kjent med CMS-et.

Utkast blir ikke generert som artikkelsider, oppføringer på forsiden eller sitemap-lenker. **Alle bilder i `public/images/` er offentlige, også bilder vedlagt utkast.** Repositoryet og CMS-et er ikke et fortrolig dokumentlager. Slett heller ikke et bilde som brukes av en annen artikkel; valideringen stopper byggingen ved manglende bilder.

Facebook-/Instagram-bryterne og tekstfeltene lagrer bare metadata til en senere versjon. Denne utgaven sender ingen innlegg og har ingen Meta- eller Zapier-tilkobling.

## Akseptansetest etter tilkobling

Dette krever det faktiske repositoryet og hosted CMS-et og er derfor ikke kjørt lokalt:

- En invitert redaktør uten GitHub-konto kan logge inn via invitasjonen, lage et utkast og laste opp et bilde.
- Ny artikkel får en UUID automatisk, og UUID/filnavn kan ikke endres i redigeringsbildet.
- Tittelendring beholder eksisterende filnavn og URL.
- Utkast vises med avslått publiseringsindikator og vises ikke på nettstedet.
- Publisering gir en artikkel etter vellykket Actions-kjøring; avpublisering fjerner siden etter neste kjøring.
- Redaktøren kan ikke administrere `.pages.yml` eller andre samarbeidspartnere.

Kilder for konfigurasjonen: [redigerbare lister](https://pagescms.org/docs/configuration/content/), [filnavn](https://pagescms.org/docs/configuration/content/filename/), [UUID](https://pagescms.org/docs/configuration/fields/uuid/), [operasjoner](https://pagescms.org/docs/configuration/content/operations/), [listevisning](https://pagescms.org/docs/configuration/content/view/) og [medier](https://pagescms.org/docs/configuration/media/).
