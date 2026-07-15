# QuBì PWA statica

Questa è una web app statica: **gli utenti non devono installare Python**.

Dopo la pubblicazione su GitHub Pages, Cloudflare Pages o un altro hosting statico HTTPS, l’utente apre soltanto un link.

## Funzioni

- mappa dei servizi;
- filtri per tipo di luogo e Municipio;
- evidenziazione dei confini municipali;
- posizione automatica o scelta manuale;
- ricerca del servizio più vicino;
- installazione come PWA sul telefono;
- funzionamento parziale offline dopo il primo utilizzo;
- nessun database;
- nessun account;
- nessun tracciamento incluso;
- posizione elaborata nel browser e non salvata.

## Prova locale

La geolocalizzazione funziona correttamente su HTTPS o localhost. Per una prova semplice puoi pubblicare direttamente il progetto su GitHub Pages.

Aprendo `index.html` con doppio clic la mappa può apparire, ma geolocalizzazione, service worker e caricamento dei file potrebbero essere bloccati dal browser.

## Pubblicazione gratuita con GitHub Pages

1. Crea un account GitHub.
2. Crea un nuovo repository pubblico, per esempio `mappa-qubi`.
3. Carica **il contenuto di questa cartella**, non la cartella contenitore:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.webmanifest`
   - `service-worker.js`
   - cartelle `data`, `icons`, `strumenti`
4. Apri `Settings`.
5. Apri `Pages`.
6. In `Build and deployment`, scegli:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
7. Salva.
8. Dopo la pubblicazione GitHub mostrerà un link simile a:
   `https://nomeutente.github.io/mappa-qubi/`

Gli utenti apriranno soltanto quel link.

## Aggiornare i servizi senza Python

Modifica `data/services.csv` con Excel.

Poi apri:

`strumenti/converti-csv.html`

Seleziona il CSV e scarica il nuovo `services.json`. Sostituisci quindi:

`data/services.json`

nel repository GitHub.

## Confini dei Municipi

La cartella contiene `data/municipi.geojson` come file vuoto di sicurezza.

Per avere confini sempre disponibili e offline, copia il file già creato dal precedente script Python:

`municipi_milano.geojson`

e rinominalo:

`municipi.geojson`

quindi sostituiscilo dentro la cartella `data`.

Se il file locale è vuoto, l’app prova a caricare il dataset ufficiale del Comune di Milano. Se il browser blocca quel collegamento, i servizi e i filtri continueranno a funzionare, ma i poligoni dei Municipi non saranno mostrati.

## Dati dimostrativi

I servizi inclusi sono di prova. Prima della pubblicazione sostituiscili con dati reali, verificati e aggiornati.

## Privacy

La posizione non viene inviata al progetto e non viene salvata.

La cartografia OpenStreetMap e il CDN che distribuisce Leaflet possono ricevere normali dati tecnici di rete, come l’indirizzo IP. Il progetto non include analytics, pubblicità o cookie di profilazione.
