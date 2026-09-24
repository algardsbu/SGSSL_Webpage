# Klubbens informasjonssider

Klubbens eksisterende informasjonssider vedlikeholdes i kode. De er fortsatt
merket «Under utvikling» inntil klubben har skrevet innholdet. Nyheter og arrangementer redigeres
i Pages CMS. Arrangementssiden (`/events/`) og kalenderen på forsiden deler
innhold fra `src/data/events.json`; se [CMS-veiledningen](cms.md).

For en ny informasjonsside:

1. Kopier `docs/page-template.astro` til `src/pages/sidenavn.astro`.
2. Skriv sidetittel, beskrivelse og innhold. Adressen blir `/sidenavn/`.
3. Legg eventuelt en lenke i `src/components/Header.astro`.
4. Bruk bilder fra `public/images/` med en beskrivende `alt`-tekst. I HTML brukes
   adressen `/images/filnavn.webp`, uten `public`.
5. Kjør `npm run check` og `npm run build`, og kontroller siden med `npm run preview`.

`SiteLayout.astro` gir siden norsk språk, metadata, hovedmeny, en lenke for å
hoppe til innholdet, og bunntekst. Bruk én `h1` per side og `h2` for avsnitt.
Ikke kopier topptekst og bunntekst inn i den nye siden. Alle sider deler
`src/styles/global.css`; CSS-en bygger på den opprinnelige nettsiden.

`PUBLIC_CMS_URL` kan peke på klubbens side i hosted Pages CMS og må være HTTPS.
Standardverdien er `https://app.pagescms.org`. `SITE_URL` settes til det virkelige
domenet før produksjonssetting, slik at kanoniske adresser og metadata for deling
bruker riktig domene.
