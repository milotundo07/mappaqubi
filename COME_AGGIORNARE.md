# Correzione delle tessere vuote

Sostituisci nel repository GitHub questi tre file:

- index.html
- app.js
- service-worker.js

Puoi caricarli direttamente con Add file > Upload files:
GitHub sostituirà i file esistenti perché hanno lo stesso nome.

Dopo il commit:

1. attendi la pubblicazione di GitHub Pages;
2. apri il sito;
3. premi Ctrl + F5;
4. se la mappa resta vecchia, chiudi tutte le schede del sito e riaprilo.

La nuova versione usa la cache `qubi-pwa-v3` e non intercetta più
le tessere di OpenStreetMap con il service worker.
