# Mappa QuBì Milano

Una web app gratuita e accessibile per trovare servizi utili a Milano, filtrandoli per tipo, bisogno e Municipio.

Il progetto è pensato per famiglie, operatori sociali, volontari e cittadini che hanno bisogno di individuare rapidamente un servizio vicino.

Funzioni principali

- visualizzazione dei servizi su una mappa interattiva;
- filtro per tipo di servizio e Municipio;
- ricerca per nome, quartiere, ente, descrizione o bisogno;
- ricerca del servizio più vicino;
- posizione automatica tramite dispositivo;
- ricerca della posizione tramite indirizzo;
- apertura delle indicazioni stradali;
- possibilità di salvare servizi tra i preferiti;
- modalità semplice con interfaccia ridotta;
- installazione come PWA su telefono o computer;
- funzionamento parziale offline dopo il primo utilizzo;
- nessun account obbligatorio;
- nessun sistema pubblicitario o di profilazione.

Gestione dei dati

La pagina `gestione.html` permette di:

- aggiungere un singolo servizio;
- modificare o eliminare servizi esistenti;
- duplicare un servizio;
- importare un file CSV;
- scegliere se aggiungere i nuovi dati o sostituire quelli esistenti;
- esportare i dati in CSV;
- scaricare un nuovo `services.json`;
- controllare errori, duplicati e dati mancanti;
- ripristinare i dati iniziali.

Le modifiche effettuate dalla pagina di gestione vengono salvate nel browser tramite `localStorage`.

Per renderle pubbliche a tutti gli utenti bisogna:

1. aprire `gestione.html`;
2. aggiornare i servizi;
3. scaricare il nuovo `services.json`;
4. sostituire il file `data/services.json` nel repository;
5. pubblicare le modifiche su GitHub Pages.

Struttura del progetto

- `index.html` — pagina principale della mappa;
- `app.js` — logica della mappa, filtri e ricerca;
- `styles.css` — stile principale;
- `admin.css` — stile degli strumenti di gestione;
- `data-store.js` — funzioni condivise per lettura, salvataggio e validazione dei dati;
- `gestione.html` — pagina di amministrazione locale;
- `gestione.js` — logica della pagina di gestione;
- `service-worker.js` — cache e funzionamento offline;
- `manifest.webmanifest` — configurazione PWA;
- `privacy.html` — informativa tecnica sulla privacy;
- `data/services.json` — archivio pubblico dei servizi;
- `data/services.csv` — versione CSV dei dati;
- `data/municipi.geojson` — confini dei Municipi;
- `icons/` — icone della PWA.

Formato dei dati

Ogni servizio può contenere questi campi:

- `nome_servizio`
- `tipo_luogo`
- `ente_gestore`
- `macroarea`
- `descrizione`
- `destinatari`
- `indirizzo`
- `quartiere`
- `giorni_orari`
- `modalita_accesso`
- `telefono`
- `email`
- `costo`
- `latitudine`
- `longitudine`
- `fonte`
- `stato_verifica`
- `data_verifica`
- `municipio`

I campi indispensabili per mostrare correttamente un punto sulla mappa sono:

- `nome_servizio`
- `tipo_luogo`
- `latitudine`
- `longitudine`

Pubblicazione con GitHub Pages

1. Apri il repository su GitHub.
2. Vai in `Settings`.
3. Apri la sezione `Pages`.
4. In `Build and deployment` scegli:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Salva.

Il sito sarà disponibile a un indirizzo simile a:

`https://nomeutente.github.io/nome-repository/`

Per questo progetto:

`https://milotundo07.github.io/mappaqubi/`

Privacy

La posizione scelta dall’utente per cercare il servizio più vicino viene elaborata nel browser e non viene salvata nel repository.

Quando viene cercato un indirizzo, il testo può essere inviato al servizio Nominatim basato sui dati OpenStreetMap per ottenere le coordinate.

Le modifiche fatte nella pagina di gestione restano nel browser finché non vengono esportate e pubblicate manualmente.

Il progetto non include:

- account utente;
- pubblicità;
- cookie di profilazione;
- sistemi di analisi;
- database remoto.

Tecnologie utilizzate

- HTML
- CSS
- JavaScript
- Leaflet
- OpenStreetMap
- Nominatim
- GitHub Pages
- Service Worker
- LocalStorage

Stato dei dati

Prima di usare la mappa in un contesto pubblico, i servizi devono essere reali, verificati e aggiornati.

È consigliabile indicare sempre:

- fonte;
- stato della verifica;
- data dell’ultimo controllo;
- recapiti aggiornati;
- modalità di accesso;
- eventuali costi.

Licenza e riuso

Il codice può essere adattato per altri quartieri, Municipi o reti territoriali.

Prima del riuso è opportuno verificare:

- licenza dei dati;
- correttezza delle informazioni;
- condizioni d’uso di OpenStreetMap e Nominatim;
- eventuali obblighi relativi alla privacy.
