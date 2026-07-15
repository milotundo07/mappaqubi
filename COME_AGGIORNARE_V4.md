# Correzione mappa bianca — versione 4

Il problema era il foglio di stile Leaflet caricato da un CDN esterno.

Questa versione include localmente le regole CSS indispensabili della
mappa, quindi la disposizione delle tessere non dipende più dal CDN.

## Sostituisci questi quattro file su GitHub

- index.html
- styles.css
- app.js
- service-worker.js

Caricali con Add file > Upload files e conferma Commit changes.

Dopo la pubblicazione:

1. attendi 1-2 minuti;
2. chiudi tutte le schede del sito;
3. riapri il sito;
4. premi Ctrl + F5.

La nuova cache si chiama qubi-pwa-v4.
