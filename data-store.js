(function () {
  "use strict";

  const STORAGE_KEY = "qubi-custom-services-v2";
  const LEGACY_STORAGE_KEY = "qubi-custom-services-v1";
  const FAVORITES_KEY = "qubi-favorites-v1";
  const SIMPLE_MODE_KEY = "qubi-simple-mode-v1";

  const CATEGORY_CONFIG = {
    "punto qubi": { label: "Punti QuBì", color: "#2A81CB" },
    ospedale: { label: "Ospedali e salute", color: "#CB2B3E" },
    "casa di quartiere": { label: "Case di quartiere", color: "#2AAD27" },
    scuola: { label: "Scuole", color: "#CB8427" },
    "servizio educativo": { label: "Servizi educativi", color: "#c98742" },
    biblioteca: { label: "Biblioteche", color: "#9C2BCB" },
    cultura: { label: "Cultura", color: "#6F42C1" },
    sport: { label: "Sport", color: "#006400" },
    "servizio sociale": { label: "Servizi sociali", color: "#436978" },
    associazione: { label: "Associazioni", color: "#3D8DAE" },
    altro: { label: "Altri luoghi", color: "#777777" }
  };

  const NEED_CONFIG = {
    tutti: { label: "Tutti i bisogni", keywords: [] },
    orientamento: {
      label: "Orientamento e accesso ai servizi",
      keywords: ["orientamento", "accesso", "sportello", "informazione", "documenti", "qubi"]
    },
    scuola: {
      label: "Scuola e aiuto allo studio",
      keywords: ["scuola", "educazione", "doposcuola", "studio", "compiti", "formazione"]
    },
    salute: {
      label: "Salute e benessere",
      keywords: ["salute", "ospedale", "medico", "sanitario", "psicologico", "benessere"]
    },
    economico: {
      label: "Sostegno economico e sociale",
      keywords: ["economico", "sociale", "povertà", "sostegno", "aiuto", "contributo"]
    },
    genitori: {
      label: "Supporto a genitori e famiglie",
      keywords: ["genitori", "famiglie", "genitorialità", "mediazione", "consulenza"]
    },
    sport: {
      label: "Sport e attività fisica",
      keywords: ["sport", "palestra", "calcio", "nuoto", "attività fisica"]
    },
    cultura: {
      label: "Cultura, socialità e tempo libero",
      keywords: ["cultura", "biblioteca", "laboratorio", "socialità", "aggregazione", "tempo libero"]
    }
  };

  const TARGET_CONFIG = {
    tutti: { label: "Tutti i destinatari", keywords: [] },
    bambini: { label: "Bambini", keywords: ["bambin", "infanzia", "minori", "6-", "0-"] },
    adolescenti: { label: "Adolescenti e giovani", keywords: ["adolescent", "ragazz", "giovani", "teen"] },
    genitori: { label: "Genitori", keywords: ["genitor", "mamme", "padri"] },
    famiglie: { label: "Famiglie", keywords: ["famigli", "nuclei"] },
    tutti_cittadini: { label: "Tutta la cittadinanza", keywords: ["tutta la cittadinanza", "tutti", "adulti"] }
  };

  const CSV_COLUMNS = [
    "nome_servizio",
    "tipo_luogo",
    "ente_gestore",
    "macroarea",
    "descrizione",
    "destinatari",
    "indirizzo",
    "quartiere",
    "giorni_orari",
    "modalita_accesso",
    "telefono",
    "email",
    "sito_web",
    "costo",
    "latitudine",
    "longitudine",
    "fonte",
    "stato_verifica",
    "data_verifica",
    "municipio"
  ];

  const REQUIRED_CSV_COLUMNS = ["nome_servizio", "tipo_luogo"];
  let lastGeocodeRequestAt = 0;

  function clean(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeText(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeHtml(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseCoordinate(value) {
    const raw = clean(value).replace(/\s/g, "");
    if (!raw) return NaN;
    if (raw.includes(",") && !raw.includes(".")) return Number(raw.replace(",", "."));
    return Number(raw);
  }

  function normalizeType(value) {
    const raw = normalizeText(value);
    const aliases = {
      qubi: "punto qubi",
      "punto qubi": "punto qubi",
      "punti qubi": "punto qubi",
      ospedali: "ospedale",
      salute: "ospedale",
      "casa quartiere": "casa di quartiere",
      "case di quartiere": "casa di quartiere",
      scuole: "scuola",
      educazione: "servizio educativo",
      "centro educativo": "servizio educativo",
      biblioteche: "biblioteca",
      "centro sportivo": "sport",
      "servizi sociali": "servizio sociale",
      ente: "associazione"
    };
    const result = aliases[raw] || raw;
    return CATEGORY_CONFIG[result] ? result : "altro";
  }

  function municipioNumber(value) {
    const match = clean(value).match(/(?:^|\D)([1-9])(?:\D|$)/);
    return match ? Number(match[1]) : null;
  }

  function hashString(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function makeServiceId(service) {
    const basis = [
      normalizeText(service.nome_servizio),
      normalizeText(service.indirizzo),
      Number(service.latitudine || 0).toFixed(6),
      Number(service.longitudine || 0).toFixed(6)
    ].join("|");
    return `svc_${hashString(basis)}`;
  }

  function normalizeDate(value) {
    const text = clean(value);
    if (!text) return "";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toISOString().slice(0, 10);
  }

  function normalizeService(service) {
    const normalized = {};
    CSV_COLUMNS.forEach(column => {
      normalized[column] = clean(service[column]);
    });

    normalized.tipo_luogo = normalizeType(service.tipo_luogo);
    normalized.tipo_normalizzato = normalized.tipo_luogo;
    normalized.municipio_numero = municipioNumber(service.municipio);
    normalized.latitudine = parseCoordinate(service.latitudine);
    normalized.longitudine = parseCoordinate(service.longitudine);
    normalized.data_verifica = normalizeDate(service.data_verifica);
    normalized.id = clean(service.id) || makeServiceId(normalized);
    return normalized;
  }

  function isValidService(service) {
    return Boolean(
      clean(service.nome_servizio) &&
      Number.isFinite(service.latitudine) &&
      Number.isFinite(service.longitudine) &&
      service.latitudine >= -90 && service.latitudine <= 90 &&
      service.longitudine >= -180 && service.longitudine <= 180
    );
  }

  function serializableService(service) {
    const result = { id: clean(service.id) || makeServiceId(service) };
    CSV_COLUMNS.forEach(column => {
      if (column === "latitudine" || column === "longitudine") {
        result[column] = Number(service[column]);
      } else {
        result[column] = clean(service[column]);
      }
    });
    return result;
  }

  function serviceIdentity(service) {
    return [
      normalizeText(service.nome_servizio),
      normalizeText(service.indirizzo),
      Number(service.latitudine).toFixed(6),
      Number(service.longitudine).toFixed(6)
    ].join("|");
  }

  async function loadDefaultServices() {
    const response = await fetch("./data/services.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Non è stato possibile caricare i servizi iniziali.");
    const data = await response.json();
    return data.map(normalizeService).filter(isValidService);
  }

  function readStoredPayload(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.services;
      return Array.isArray(list) ? list : null;
    } catch (error) {
      console.warn("Dati locali non leggibili:", error);
      return null;
    }
  }

  async function loadServices() {
    const stored = readStoredPayload(STORAGE_KEY) || readStoredPayload(LEGACY_STORAGE_KEY);
    if (stored) {
      const normalized = stored.map(normalizeService).filter(isValidService);
      if (normalized.length) {
        if (!localStorage.getItem(STORAGE_KEY)) saveServices(normalized);
        return { services: normalized, source: "saved" };
      }
    }
    return { services: await loadDefaultServices(), source: "initial" };
  }

  function saveServices(services) {
    const payload = {
      version: 2,
      updatedAt: new Date().toISOString(),
      services: services.map(serializableService)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return payload;
  }

  function resetServices() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  function readFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  }

  function readSimpleMode() {
    return localStorage.getItem(SIMPLE_MODE_KEY) === "1";
  }

  function saveSimpleMode(enabled) {
    localStorage.setItem(SIMPLE_MODE_KEY, enabled ? "1" : "0");
  }

  function countDelimiter(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && quoted && next === '"') index += 1;
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    return count;
  }

  function detectCsvDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find(line => line.trim()) || "";
    return countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
  }

  function parseCsv(text) {
    const delimiter = detectCsvDelimiter(text);
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field);
        if (row.some(value => clean(value))) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some(value => clean(value))) rows.push(row);
    if (rows.length < 2) throw new Error("Il CSV deve avere una riga di intestazioni e almeno un servizio.");

    const headers = rows[0].map(header => clean(header).replace(/^\uFEFF/, ""));
    const missing = REQUIRED_CSV_COLUMNS.filter(column => !headers.includes(column));
    if (missing.length) throw new Error(`Mancano le colonne obbligatorie: ${missing.join(", ")}.`);

    return rows.slice(1).map((values, index) => {
      const record = { __rowNumber: index + 2 };
      headers.forEach((header, valueIndex) => {
        record[header] = values[valueIndex] ?? "";
      });
      return record;
    });
  }

  function mergeServices(existing, incoming) {
    const known = new Set(existing.map(serviceIdentity));
    const added = [];
    let skipped = 0;
    incoming.forEach(service => {
      const key = serviceIdentity(service);
      if (known.has(key)) skipped += 1;
      else {
        known.add(key);
        added.push(service);
      }
    });
    return { services: [...existing, ...added], added: added.length, skipped };
  }

  function csvEscape(value, delimiter = ";") {
    const text = clean(value);
    const escaped = text.replaceAll('"', '""');
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${escaped}"` : escaped;
  }

  function csvText(services) {
    const delimiter = ";";
    const lines = [CSV_COLUMNS.map(value => csvEscape(value, delimiter)).join(delimiter)];
    services.forEach(service => {
      lines.push(CSV_COLUMNS.map(column => csvEscape(service[column], delimiter)).join(delimiter));
    });
    return `\uFEFF${lines.join("\r\n")}`;
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCsv(services, filename = "servizi_qubi.csv") {
    downloadBlob(filename, csvText(services), "text/csv;charset=utf-8");
  }

  function downloadJson(services, filename = "services.json") {
    const text = JSON.stringify(services.map(serializableService), null, 2);
    downloadBlob(filename, text, "application/json;charset=utf-8");
  }

  function templateService() {
    return normalizeService({
      nome_servizio: "ESEMPIO – Punto QuBì",
      tipo_luogo: "punto qubi",
      ente_gestore: "Nome ente",
      macroarea: "Accesso e orientamento",
      descrizione: "Breve descrizione del servizio",
      destinatari: "Famiglie con minori",
      indirizzo: "Via Esempio 1, Milano",
      quartiere: "Quartiere",
      giorni_orari: "Lunedì 10:00-13:00",
      modalita_accesso: "Accesso libero",
      telefono: "02 0000 0000",
      email: "esempio@example.org",
      sito_web: "https://example.org",
      costo: "Gratuito",
      latitudine: 45.4642,
      longitudine: 9.19,
      fonte: "Sito dell’ente",
      stato_verifica: "Verificato",
      data_verifica: new Date().toISOString().slice(0, 10),
      municipio: "Municipio 1"
    });
  }

  function validateService(service) {
    const errors = [];
    const warnings = [];
    if (!clean(service.nome_servizio)) errors.push("nome mancante");
    if (!Number.isFinite(service.latitudine) || !Number.isFinite(service.longitudine)) errors.push("coordinate mancanti o non valide");
    if (!clean(service.indirizzo)) warnings.push("indirizzo mancante");
    if (!clean(service.telefono) && !clean(service.email) && !clean(service.sito_web)) warnings.push("nessun contatto");
    if (!clean(service.fonte)) warnings.push("fonte mancante");
    if (!clean(service.data_verifica)) warnings.push("data di verifica mancante");
    else {
      const date = new Date(service.data_verifica);
      if (!Number.isNaN(date.getTime())) {
        const ageDays = (Date.now() - date.getTime()) / 86400000;
        if (ageDays > 180) warnings.push("verifica più vecchia di 6 mesi");
      }
    }
    if (/demo|non reale/i.test(clean(service.stato_verifica))) warnings.push("servizio dimostrativo");
    return { errors, warnings };
  }

  function validateServices(services) {
    const reports = services.map(service => ({ service, ...validateService(service) }));
    return {
      reports,
      errorCount: reports.reduce((total, report) => total + report.errors.length, 0),
      warningCount: reports.reduce((total, report) => total + report.warnings.length, 0),
      affectedCount: reports.filter(report => report.errors.length || report.warnings.length).length
    };
  }

  async function waitForGeocodeRateLimit() {
    const elapsed = Date.now() - lastGeocodeRequestAt;
    const minimumInterval = 1100;
    if (elapsed < minimumInterval) {
      await new Promise(resolve => window.setTimeout(resolve, minimumInterval - elapsed));
    }
    lastGeocodeRequestAt = Date.now();
  }

  async function geocodeAddress(address, neighbourhood = "") {
    const addressText = clean(address);
    if (!addressText) throw new Error("Inserisci un indirizzo.");
    const pieces = [addressText, clean(neighbourhood)];
    if (!/milano/i.test(`${addressText} ${neighbourhood}`)) pieces.push("Milano");
    pieces.push("Italia");

    await waitForGeocodeRateLimit();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", pieces.filter(Boolean).join(", "));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "it");
    url.searchParams.set("accept-language", "it");
    url.searchParams.set("viewbox", "9.04,45.56,9.33,45.36");
    url.searchParams.set("bounded", "1");

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Il servizio di ricerca degli indirizzi non è disponibile.");
    const results = await response.json();
    if (!Array.isArray(results) || !results.length) throw new Error("Indirizzo non trovato. Controlla il civico oppure scegli il punto sulla mappa.");
    return results;
  }

  window.QubiData = {
    STORAGE_KEY,
    FAVORITES_KEY,
    SIMPLE_MODE_KEY,
    CATEGORY_CONFIG,
    NEED_CONFIG,
    TARGET_CONFIG,
    CSV_COLUMNS,
    clean,
    normalizeText,
    escapeHtml,
    parseCoordinate,
    normalizeType,
    municipioNumber,
    normalizeService,
    serializableService,
    isValidService,
    serviceIdentity,
    loadDefaultServices,
    loadServices,
    saveServices,
    resetServices,
    readFavorites,
    saveFavorites,
    readSimpleMode,
    saveSimpleMode,
    parseCsv,
    mergeServices,
    csvText,
    downloadCsv,
    downloadJson,
    templateService,
    validateService,
    validateServices,
    geocodeAddress
  };
})();
