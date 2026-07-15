const CATEGORY_CONFIG = {
  "punto qubi": { label: "Punti QuBì", color: "#2A81CB" },
  "ospedale": { label: "Ospedali e salute", color: "#CB2B3E" },
  "casa di quartiere": { label: "Case di quartiere", color: "#2AAD27" },
  "scuola": { label: "Scuole", color: "#CB8427" },
  "servizio educativo": { label: "Servizi educativi", color: "#c98742" },
  "biblioteca": { label: "Biblioteche", color: "#9C2BCB" },
  "cultura": { label: "Cultura", color: "#6F42C1" },
  "sport": { label: "Sport", color: "#006400" },
  "servizio sociale": { label: "Servizi sociali", color: "#436978" },
  "associazione": { label: "Associazioni", color: "#3D8DAE" },
  "altro": { label: "Altri luoghi", color: "#777777" }
};

const MUNICIPIO_COLORS = {
  1: "#e41a1c", 2: "#377eb8", 3: "#4daf4a",
  4: "#984ea3", 5: "#ff7f00", 6: "#a65628",
  7: "#d95f9f", 8: "#666666", 9: "#17a2b8"
};

const OFFICIAL_MUNICIPI_URL =
  "https://dati.comune.milano.it/dataset/36ba21c2-8b48-43ce-bbe1-e236a8a49ff6/resource/99ecd085-0b04-4fb2-a66e-9795694d4fc4/download/ds379_municipi_label.geojson";

const STORAGE_KEY = "qubi-custom-services-v1";
const ALL_MUNICIPI = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
  "costo",
  "latitudine",
  "longitudine",
  "fonte",
  "stato_verifica",
  "municipio"
];

const REQUIRED_CSV_COLUMNS = [
  "nome_servizio",
  "tipo_luogo",
  "latitudine",
  "longitudine"
];

let services = [];
let filteredServices = [];
let markers = [];
let municipioLayers = {};
let activeMunicipi = new Set(ALL_MUNICIPI);
let selectedType = "tutti";
let userPosition = null;
let userMarker = null;
let nearestMarker = null;
let nearestLine = null;
let manualPickMode = false;
let pointPickMode = false;
let geocodePreviewMarker = null;
let lastGeocodeRequestAt = 0;
let installPrompt = null;
let municipiLoaded = false;
let municipiLoading = false;
let dataSource = "initial";

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true
}).setView([45.4642, 9.1900], 11);

const tileLayer = L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    minZoom: 3,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }
).addTo(map);

let tileRetryScheduled = false;
tileLayer.on("tileerror", () => {
  if (tileRetryScheduled) return;
  tileRetryScheduled = true;
  window.setTimeout(() => {
    tileRetryScheduled = false;
    map.invalidateSize({ pan: false });
    tileLayer.redraw();
  }, 1200);
});

const serviceType = document.getElementById("serviceType");
const municipioButtons = document.getElementById("municipioButtons");
const nearestResult = document.getElementById("nearestResult");
const locationStatus = document.getElementById("locationStatus");
const manualHint = document.getElementById("manualHint");
const serviceList = document.getElementById("serviceList");
const serviceCount = document.getElementById("serviceCount");
const showBoundaries = document.getElementById("showBoundaries");
const showAllMarkers = document.getElementById("showAllMarkers");
const dataStatus = document.getElementById("dataStatus");

const csvDialog = document.getElementById("csvDialog");
const csvFileInput = document.getElementById("csvFileInput");
const csvImportStatus = document.getElementById("csvImportStatus");

const pointDialog = document.getElementById("pointDialog");
const pointForm = document.getElementById("pointForm");
const pointFormStatus = document.getElementById("pointFormStatus");
const pointAddress = document.getElementById("pointAddress");
const geocodeAddressButton = document.getElementById("geocodeAddressButton");
const geocodeResult = document.getElementById("geocodeResult");
const pointLatitude = document.getElementById("pointLatitude");
const pointLongitude = document.getElementById("pointLongitude");
const pointType = document.getElementById("pointType");

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
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

  if (raw.includes(",") && !raw.includes(".")) {
    return Number(raw.replace(",", "."));
  }

  return Number(raw);
}


function clearGeocodePreview() {
  if (geocodePreviewMarker && map.hasLayer(geocodePreviewMarker)) {
    map.removeLayer(geocodePreviewMarker);
  }
  geocodePreviewMarker = null;
}

function clearGeocodeResult({ clearCoordinates = false } = {}) {
  geocodeResult.innerHTML = "";
  geocodeResult.className = "geocode-result hidden";
  clearGeocodePreview();

  if (clearCoordinates) {
    pointLatitude.value = "";
    pointLongitude.value = "";
  }
}

function geocodeQueryText() {
  const address = clean(pointAddress.value);
  const neighbourhood = clean(pointForm.elements.quartiere?.value);
  const pieces = [address, neighbourhood];

  if (!/milano/i.test(`${address} ${neighbourhood}`)) {
    pieces.push("Milano");
  }

  pieces.push("Italia");
  return pieces.filter(Boolean).join(", ");
}

function setGeocodeResult(result, allResults = []) {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  pointLatitude.value = latitude.toFixed(6);
  pointLongitude.value = longitude.toFixed(6);

  clearGeocodePreview();
  geocodePreviewMarker = L.circleMarker([latitude, longitude], {
    radius: 11,
    color: "#111",
    weight: 3,
    fillColor: "#39a96b",
    fillOpacity: 1
  }).addTo(map).bindTooltip("Punto trovato dall’indirizzo");

  geocodeResult.className = "geocode-result success";
  geocodeResult.innerHTML = `
    <h3>Indirizzo trovato</h3>
    <p>${escapeHtml(result.display_name)}</p>
    <p><strong>Il punto è pronto per essere salvato.</strong></p>
    ${allResults.length > 1 ? '<p>Se non è quello corretto, scegli una delle alternative:</p>' : ''}
    <div class="geocode-candidates"></div>
  `;

  const container = geocodeResult.querySelector(".geocode-candidates");

  allResults.slice(0, 5).forEach(candidate => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "address-result-button";
    button.textContent = candidate.display_name;

    if (candidate.place_id === result.place_id) {
      button.classList.add("selected");
      button.setAttribute("aria-current", "true");
    }

    button.addEventListener("click", () => {
      setGeocodeResult(candidate, allResults);
    });

    container.appendChild(button);
  });
}

async function waitForGeocodeRateLimit() {
  const elapsed = Date.now() - lastGeocodeRequestAt;
  const minimumInterval = 1100;

  if (elapsed < minimumInterval) {
    await new Promise(resolve =>
      window.setTimeout(resolve, minimumInterval - elapsed)
    );
  }

  lastGeocodeRequestAt = Date.now();
}

async function geocodePointAddress({ showAlternatives = true } = {}) {
  const address = clean(pointAddress.value);

  if (!address) {
    geocodeResult.textContent = "Inserisci prima un indirizzo, compreso il numero civico quando disponibile.";
    geocodeResult.className = "geocode-result error";
    pointAddress.focus();
    return false;
  }

  geocodeAddressButton.disabled = true;
  geocodeAddressButton.textContent = "Ricerca in corso…";
  geocodeResult.textContent = "Sto cercando l’indirizzo sulla mappa…";
  geocodeResult.className = "geocode-result";

  try {
    await waitForGeocodeRateLimit();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", geocodeQueryText());
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "it");
    url.searchParams.set("accept-language", "it");
    url.searchParams.set("viewbox", "9.04,45.56,9.33,45.36");
    url.searchParams.set("bounded", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Il servizio di ricerca non è disponibile in questo momento.");
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("Indirizzo non trovato. Controlla il numero civico oppure scegli il punto manualmente sulla mappa.");
    }

    setGeocodeResult(results[0], showAlternatives ? results : []);
    return true;
  } catch (error) {
    clearGeocodePreview();
    pointLatitude.value = "";
    pointLongitude.value = "";
    geocodeResult.textContent = error.message;
    geocodeResult.className = "geocode-result error";
    return false;
  } finally {
    geocodeAddressButton.disabled = false;
    geocodeAddressButton.textContent = "Trova questo indirizzo";
  }
}

function normalizeType(value) {
  const raw = clean(value).toLowerCase();

  const aliases = {
    "qubi": "punto qubi",
    "punto qubì": "punto qubi",
    "punti qubi": "punto qubi",
    "ospedali": "ospedale",
    "salute": "ospedale",
    "casa quartiere": "casa di quartiere",
    "case di quartiere": "casa di quartiere",
    "scuole": "scuola",
    "educazione": "servizio educativo",
    "centro educativo": "servizio educativo",
    "biblioteche": "biblioteca",
    "centro sportivo": "sport",
    "servizi sociali": "servizio sociale",
    "ente": "associazione"
  };

  const result = aliases[raw] || raw;
  return CATEGORY_CONFIG[result] ? result : "altro";
}

function municipioNumber(value) {
  const match = clean(value).match(/(?:^|\D)([1-9])(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function normalizeService(service) {
  const normalized = {};

  CSV_COLUMNS.forEach(column => {
    normalized[column] = clean(service[column]);
  });

  normalized.nome_servizio = clean(service.nome_servizio);
  normalized.tipo_luogo = normalizeType(service.tipo_luogo);
  normalized.tipo_normalizzato = normalized.tipo_luogo;
  normalized.municipio_numero = municipioNumber(service.municipio);
  normalized.latitudine = parseCoordinate(service.latitudine);
  normalized.longitudine = parseCoordinate(service.longitudine);

  return normalized;
}

function isValidService(service) {
  return Boolean(
    service.nome_servizio &&
    Number.isFinite(service.latitudine) &&
    Number.isFinite(service.longitudine) &&
    service.latitudine >= -90 &&
    service.latitudine <= 90 &&
    service.longitudine >= -180 &&
    service.longitudine <= 180
  );
}

function serializableService(service) {
  const result = {};
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
    clean(service.nome_servizio).toLowerCase(),
    clean(service.indirizzo).toLowerCase(),
    Number(service.latitudine).toFixed(6),
    Number(service.longitudine).toFixed(6)
  ].join("|");
}

function readSavedServices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.services;
    if (!Array.isArray(list)) return null;

    const normalized = list.map(normalizeService).filter(isValidService);
    return normalized.length ? normalized : null;
  } catch (error) {
    console.warn("Dati locali non leggibili:", error);
    return null;
  }
}

function saveServices() {
  try {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      services: services.map(serializableService)
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    dataSource = "saved";
    updateDataStatus();
    return true;
  } catch (error) {
    console.error("Salvataggio locale non riuscito:", error);
    alert("Il browser non è riuscito a salvare le modifiche. Lo spazio disponibile potrebbe essere esaurito.");
    return false;
  }
}

function updateDataStatus(customMessage = "") {
  if (customMessage) {
    dataStatus.textContent = customMessage;
    return;
  }

  if (dataSource === "saved") {
    dataStatus.textContent =
      `${services.length} servizi salvati in questo browser. Le modifiche resteranno dopo la chiusura del sito, finché non premi “Ripristina i dati iniziali” o cancelli i dati del browser.`;
  } else {
    dataStatus.textContent =
      `${services.length} servizi caricati dai dati iniziali del sito. Le modifiche future saranno salvate soltanto in questo browser.`;
  }
}

function refreshMapSize() {
  window.requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
  });
}

window.addEventListener("load", () => {
  refreshMapSize();
  window.setTimeout(refreshMapSize, 250);
  window.setTimeout(refreshMapSize, 900);
});

window.addEventListener("resize", refreshMapSize);

if ("ResizeObserver" in window) {
  const mapResizeObserver = new ResizeObserver(refreshMapSize);
  mapResizeObserver.observe(document.getElementById("map"));
}

function buildCategoryOptions() {
  const availableTypes = [...new Set(services.map(service => service.tipo_normalizzato))]
    .sort((a, b) =>
      CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it")
    );

  serviceType.innerHTML = '<option value="tutti">Tutti i servizi</option>';

  availableTypes.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = CATEGORY_CONFIG[type].label;
    serviceType.appendChild(option);
  });

  if (!availableTypes.includes(selectedType)) {
    selectedType = "tutti";
  }
  serviceType.value = selectedType;
}

function buildPointTypeOptions() {
  pointType.innerHTML = "";

  Object.entries(CATEGORY_CONFIG)
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, "it"))
    .forEach(([value, config]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = config.label;
      pointType.appendChild(option);
    });
}

function buildLegend() {
  const container = document.getElementById("legendItems");
  container.innerHTML = "";

  [...new Set(services.map(service => service.tipo_normalizzato))]
    .sort((a, b) =>
      CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it")
    )
    .forEach(type => {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML =
        `<span class="legend-dot" style="background:${CATEGORY_CONFIG[type].color}"></span>` +
        `<span>${escapeHtml(CATEGORY_CONFIG[type].label)}</span>`;
      container.appendChild(row);
    });
}

function buildMunicipioButtons() {
  municipioButtons.innerHTML = "";

  ALL_MUNICIPI.forEach(number => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "municipio-button active";
    button.style.setProperty("--municipio-color", MUNICIPIO_COLORS[number]);
    button.dataset.municipio = String(number);
    button.textContent = `M${number}`;
    button.setAttribute("aria-pressed", "true");

    button.addEventListener("click", () => {
      if (activeMunicipi.has(number)) {
        activeMunicipi.delete(number);
      } else {
        activeMunicipi.add(number);
      }

      syncMunicipioButtons();
      refreshView();
      zoomToActiveMunicipi();
    });

    municipioButtons.appendChild(button);
  });
}

function syncMunicipioButtons() {
  document.querySelectorAll(".municipio-button").forEach(button => {
    const number = Number(button.dataset.municipio);
    const active = activeMunicipi.has(number);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  updateMunicipioLayers();
}

function servicePassesFilters(service) {
  const typeMatches =
    selectedType === "tutti" ||
    service.tipo_normalizzato === selectedType;

  const municipioMatches =
    service.municipio_numero === null ||
    activeMunicipi.has(service.municipio_numero);

  return typeMatches && municipioMatches;
}

function linkRow(label, value, href) {
  if (!clean(value)) return "";
  return `<p><strong>${label}:</strong> <a href="${href}">${escapeHtml(value)}</a></p>`;
}

function textRow(label, value) {
  if (!clean(value)) return "";
  return `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

function popupHtml(service) {
  const phoneHref = `tel:${clean(service.telefono).replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${encodeURIComponent(clean(service.email))}`;

  return [
    `<div class="service-popup">`,
    `<h3>${escapeHtml(service.nome_servizio)}</h3>`,
    textRow("Tipo", CATEGORY_CONFIG[service.tipo_normalizzato].label),
    textRow("Ente", service.ente_gestore),
    textRow("Descrizione", service.descrizione),
    textRow("Destinatari", service.destinatari),
    textRow("Indirizzo", service.indirizzo),
    textRow("Quartiere", service.quartiere),
    textRow("Orari", service.giorni_orari),
    textRow("Accesso", service.modalita_accesso),
    textRow("Costo", service.costo),
    linkRow("Telefono", service.telefono, phoneHref),
    linkRow("E-mail", service.email, mailHref),
    textRow("Municipio", service.municipio),
    `</div>`
  ].join("");
}

function markerForService(service) {
  const config = CATEGORY_CONFIG[service.tipo_normalizzato];

  return L.circleMarker(
    [service.latitudine, service.longitudine],
    {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: config.color,
      fillOpacity: 1
    }
  )
    .bindTooltip(service.nome_servizio)
    .bindPopup(popupHtml(service), { maxWidth: 420 });
}

function clearServiceMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function renderMarkers() {
  clearServiceMarkers();

  if (!showAllMarkers.checked) return;

  filteredServices.forEach(service => {
    const marker = markerForService(service).addTo(map);
    markers.push(marker);
  });
}

function renderServiceList() {
  serviceList.innerHTML = "";
  serviceCount.textContent =
    `${filteredServices.length} ${filteredServices.length === 1 ? "servizio" : "servizi"}`;

  if (filteredServices.length === 0) {
    serviceList.innerHTML =
      "<p>Nessun servizio corrisponde ai filtri selezionati.</p>";
    return;
  }

  filteredServices.forEach(service => {
    const card = document.createElement("article");
    card.className = "service-card";
    const config = CATEGORY_CONFIG[service.tipo_normalizzato];

    card.innerHTML = `
      <p class="service-type">${escapeHtml(config.label)}</p>
      <h3>${escapeHtml(service.nome_servizio)}</h3>
      ${clean(service.indirizzo) ? `<p><strong>Indirizzo:</strong> ${escapeHtml(service.indirizzo)}</p>` : ""}
      ${clean(service.giorni_orari) ? `<p><strong>Orari:</strong> ${escapeHtml(service.giorni_orari)}</p>` : ""}
      ${clean(service.telefono) ? `<p><a href="tel:${escapeHtml(clean(service.telefono).replace(/[^\d+]/g, ""))}">Chiama ${escapeHtml(service.telefono)}</a></p>` : ""}
    `;

    card.addEventListener("click", event => {
      if (event.target.closest("a")) return;

      map.setView([service.latitudine, service.longitudine], 16);
      const temporaryMarker = markerForService(service).addTo(map).openPopup();
      window.setTimeout(() => map.removeLayer(temporaryMarker), 10000);
    });

    serviceList.appendChild(card);
  });
}

function refreshView() {
  filteredServices = services.filter(servicePassesFilters);
  renderMarkers();
  renderServiceList();
  findNearest();
}

function rebuildDataUi() {
  buildCategoryOptions();
  buildLegend();
  refreshView();
  updateDataStatus();
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1
    ? `${Math.round(km * 1000)} metri`
    : `${km.toFixed(1).replace(".", ",")} km`;
}

function clearNearestGraphics() {
  if (nearestMarker) map.removeLayer(nearestMarker);
  if (nearestLine) map.removeLayer(nearestLine);
  nearestMarker = null;
  nearestLine = null;
}

function findNearest() {
  clearNearestGraphics();

  if (!userPosition) {
    nearestResult.className = "result-empty";
    nearestResult.textContent =
      "Indica la tua posizione per vedere il risultato.";
    return;
  }

  if (filteredServices.length === 0) {
    nearestResult.className = "result-empty";
    nearestResult.textContent =
      "Non ci sono servizi con i filtri selezionati.";
    return;
  }

  let nearest = null;
  let minimum = Infinity;

  filteredServices.forEach(service => {
    const distance = haversineKm(
      userPosition.lat,
      userPosition.lon,
      service.latitudine,
      service.longitudine
    );

    if (distance < minimum) {
      minimum = distance;
      nearest = service;
    }
  });

  nearestResult.className = "";
  nearestResult.innerHTML = [
    `<h3>${escapeHtml(nearest.nome_servizio)}</h3>`,
    `<p><strong>${formatDistance(minimum)}</strong> in linea d’aria</p>`,
    textRow("Indirizzo", nearest.indirizzo),
    textRow("Orari", nearest.giorni_orari),
    clean(nearest.telefono)
      ? `<p><a href="tel:${escapeHtml(clean(nearest.telefono).replace(/[^\d+]/g, ""))}">Chiama ${escapeHtml(nearest.telefono)}</a></p>`
      : ""
  ].join("");

  nearestMarker = L.circleMarker(
    [nearest.latitudine, nearest.longitudine],
    {
      radius: 14,
      color: "#111",
      weight: 4,
      fillColor: "#ff4d4d",
      fillOpacity: 0.95
    }
  )
    .addTo(map)
    .bindPopup(popupHtml(nearest))
    .openPopup();

  nearestLine = L.polyline(
    [
      [userPosition.lat, userPosition.lon],
      [nearest.latitudine, nearest.longitudine]
    ],
    { color: "#222", weight: 4, dashArray: "8,8" }
  ).addTo(map);

  map.fitBounds(
    [
      [userPosition.lat, userPosition.lon],
      [nearest.latitudine, nearest.longitudine]
    ],
    { padding: [50, 50], maxZoom: 15 }
  );
}

function setUserPosition(lat, lon, label) {
  userPosition = { lat, lon };

  if (userMarker) map.removeLayer(userMarker);

  userMarker = L.circleMarker(
    [lat, lon],
    {
      radius: 11,
      color: "#111",
      weight: 3,
      fillColor: "#ffd400",
      fillOpacity: 1
    }
  )
    .addTo(map)
    .bindTooltip("La tua posizione");

  locationStatus.textContent = `Posizione impostata (${label}).`;
  findNearest();
}

function clearUserPosition() {
  userPosition = null;
  manualPickMode = false;
  pointPickMode = false;
  manualHint.classList.add("hidden");
  map.getContainer().style.cursor = "";

  if (userMarker) map.removeLayer(userMarker);
  userMarker = null;

  clearNearestGraphics();
  locationStatus.textContent = "Nessuna posizione selezionata.";
  nearestResult.className = "result-empty";
  nearestResult.textContent =
    "Indica la tua posizione per vedere il risultato.";

  map.setView([45.4642, 9.1900], 11);
}

function requestLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent =
      "Questo browser non supporta la posizione. Usa la scelta sulla mappa.";
    return;
  }

  locationStatus.textContent = "Sto cercando la tua posizione…";

  navigator.geolocation.getCurrentPosition(
    position => {
      setUserPosition(
        position.coords.latitude,
        position.coords.longitude,
        "telefono o computer"
      );
    },
    error => {
      const messages = {
        1: "Permesso negato. Autorizza la posizione oppure scegli un punto sulla mappa.",
        2: "Posizione non disponibile. Scegli un punto sulla mappa.",
        3: "Tempo scaduto. Riprova oppure scegli un punto sulla mappa."
      };

      locationStatus.textContent =
        messages[error.code] ||
        "Non è stato possibile leggere la posizione.";
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    }
  );
}

function toggleManualPick() {
  pointPickMode = false;
  manualPickMode = !manualPickMode;
  manualHint.textContent = "Tocca la mappa nel punto in cui ti trovi.";
  manualHint.classList.toggle("hidden", !manualPickMode);
  map.getContainer().style.cursor = manualPickMode ? "crosshair" : "";
}

function beginPointPick() {
  manualPickMode = false;
  pointPickMode = true;
  pointDialog.close();
  manualHint.textContent =
    "Tocca la mappa nel punto in cui vuoi aggiungere il servizio.";
  manualHint.classList.remove("hidden");
  map.getContainer().style.cursor = "crosshair";
}

map.on("click", event => {
  if (pointPickMode) {
    pointLatitude.value = event.latlng.lat.toFixed(6);
    pointLongitude.value = event.latlng.lng.toFixed(6);
    clearGeocodePreview();
    geocodeResult.innerHTML = `<h3>Punto scelto sulla mappa</h3><p>Coordinate impostate manualmente.</p>`;
    geocodeResult.className = "geocode-result success";
    pointPickMode = false;
    manualHint.classList.add("hidden");
    map.getContainer().style.cursor = "";
    pointDialog.showModal();
    pointFormStatus.textContent = "Coordinate inserite dalla mappa.";
    pointFormStatus.className = "form-status success";
    return;
  }

  if (!manualPickMode) return;

  setUserPosition(
    event.latlng.lat,
    event.latlng.lng,
    "scelta sulla mappa"
  );

  manualPickMode = false;
  manualHint.classList.add("hidden");
  map.getContainer().style.cursor = "";
});

function featureMunicipioNumber(feature) {
  const properties = feature.properties || {};

  for (const [key, value] of Object.entries(properties)) {
    if (key.toLowerCase().includes("municip")) {
      const number = municipioNumber(value);
      if (number) return number;
    }
  }

  for (const value of Object.values(properties)) {
    const number = municipioNumber(value);
    if (number) return number;
  }

  return null;
}

async function loadMunicipi() {
  if (municipiLoaded || municipiLoading) return municipiLoaded;

  municipiLoading = true;
  let data = null;

  try {
    const localResponse = await fetch("./data/municipi.geojson", {
      cache: "force-cache"
    });

    if (localResponse.ok) {
      const localData = await localResponse.json();
      if (
        Array.isArray(localData.features) &&
        localData.features.length > 0
      ) {
        data = localData;
      }
    }
  } catch (_) {
    data = null;
  }

  if (!data) {
    try {
      const remoteResponse = await fetch(OFFICIAL_MUNICIPI_URL, {
        mode: "cors",
        cache: "force-cache"
      });

      if (remoteResponse.ok) {
        data = await remoteResponse.json();
      }
    } catch (_) {
      data = null;
    }
  }

  if (!data || !Array.isArray(data.features)) {
    municipiLoading = false;
    showBoundaries.checked = false;
    alert(
      "Non è stato possibile caricare i confini. I servizi restano comunque disponibili."
    );
    return false;
  }

  ALL_MUNICIPI.forEach(number => {
    const features = data.features.filter(
      feature => featureMunicipioNumber(feature) === number
    );

    if (features.length === 0) return;

    municipioLayers[number] = L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: {
          color: MUNICIPIO_COLORS[number],
          weight: 4,
          fillColor: MUNICIPIO_COLORS[number],
          fillOpacity: 0.14
        },
        onEachFeature: (_, layer) =>
          layer.bindTooltip(`Municipio ${number}`, { sticky: true })
      }
    );
  });

  municipiLoaded = true;
  municipiLoading = false;
  updateMunicipioLayers();
  return true;
}

function updateMunicipioLayers() {
  Object.entries(municipioLayers).forEach(([numberText, layer]) => {
    const number = Number(numberText);
    const shouldShow =
      showBoundaries.checked &&
      activeMunicipi.has(number);

    const visible = map.hasLayer(layer);

    if (shouldShow && !visible) layer.addTo(map);
    if (!shouldShow && visible) map.removeLayer(layer);
  });
}

function zoomToActiveMunicipi() {
  const layers = [...activeMunicipi]
    .map(number => municipioLayers[number])
    .filter(Boolean);

  if (layers.length === 0) return;

  const group = L.featureGroup(layers);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [20, 20] });
  }
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      count += 1;
    }
  }

  return count;
}

function detectCsvDelimiter(text) {
  const firstMeaningfulLine =
    text.split(/\r?\n/).find(line => line.trim()) || "";

  const commaCount = countDelimiter(firstMeaningfulLine, ",");
  const semicolonCount = countDelimiter(firstMeaningfulLine, ";");

  return semicolonCount > commaCount ? ";" : ",";
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

      if (row.some(value => clean(value))) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some(value => clean(value))) {
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("Il file deve contenere una riga di intestazioni e almeno un servizio.");
  }

  const headers = rows[0].map(header =>
    clean(header).replace(/^\uFEFF/, "")
  );

  const missingRequired = REQUIRED_CSV_COLUMNS.filter(
    required => !headers.includes(required)
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `Mancano le colonne obbligatorie: ${missingRequired.join(", ")}.`
    );
  }

  return rows.slice(1).map((values, rowIndex) => {
    const record = { __rowNumber: rowIndex + 2 };

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record;
  });
}

function importMode() {
  return document.querySelector(
    'input[name="csvImportMode"]:checked'
  )?.value || "add";
}

function addServiceSet(incoming) {
  const known = new Set(services.map(serviceIdentity));
  const newServices = [];
  let skipped = 0;

  incoming.forEach(service => {
    const key = serviceIdentity(service);

    if (known.has(key)) {
      skipped += 1;
      return;
    }

    known.add(key);
    newServices.push(service);
  });

  services = [...services, ...newServices];
  saveServices();
  selectedType = "tutti";
  rebuildDataUi();

  return {
    added: newServices.length,
    skipped
  };
}

function replaceServiceSet(incoming) {
  services = incoming;
  saveServices();
  selectedType = "tutti";
  activeMunicipi = new Set(ALL_MUNICIPI);
  syncMunicipioButtons();
  rebuildDataUi();
}

function csvEscape(value, delimiter = ";") {
  const text = clean(value);
  const mustQuote =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");

  const escaped = text.replaceAll('"', '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function downloadCsvTemplate() {
  const example = {
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
    costo: "Gratuito",
    latitudine: "45.4642",
    longitudine: "9.1900",
    fonte: "Sito dell’ente",
    stato_verifica: "Da verificare",
    municipio: "Municipio 1"
  };

  const delimiter = ";";
  const content = [
    CSV_COLUMNS.map(value => csvEscape(value, delimiter)).join(delimiter),
    CSV_COLUMNS.map(column => csvEscape(example[column], delimiter)).join(delimiter)
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modello_servizi_qubi.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleCsvFile(file) {
  csvImportStatus.textContent = "";
  csvImportStatus.className = "form-status";

  try {
    const text = await file.text();
    const parsedRows = parseCsv(text);

    const valid = [];
    const invalidRows = [];

    parsedRows.forEach(row => {
      const service = normalizeService(row);

      if (isValidService(service)) {
        valid.push(service);
      } else {
        invalidRows.push(row.__rowNumber);
      }
    });

    if (valid.length === 0) {
      throw new Error(
        "Non è stato trovato nessun servizio valido. Controlla nome, latitudine e longitudine."
      );
    }

    const mode = importMode();

    if (mode === "replace") {
      const confirmed = window.confirm(
        `Stai per sostituire tutti i ${services.length} servizi attuali con i ${valid.length} servizi del file. Continuare?`
      );

      if (!confirmed) {
        csvFileInput.value = "";
        return;
      }

      replaceServiceSet(valid);

      csvImportStatus.textContent =
        `Importazione completata: ${valid.length} servizi hanno sostituito l’elenco precedente.` +
        (invalidRows.length
          ? ` Righe ignorate perché non valide: ${invalidRows.join(", ")}.`
          : "");
    } else {
      const result = addServiceSet(valid);

      csvImportStatus.textContent =
        `Importazione completata: ${result.added} servizi aggiunti.` +
        (result.skipped
          ? ` ${result.skipped} duplicati non sono stati aggiunti.`
          : "") +
        (invalidRows.length
          ? ` Righe non valide ignorate: ${invalidRows.join(", ")}.`
          : "");
    }

    csvImportStatus.className = "form-status success";
    csvFileInput.value = "";
  } catch (error) {
    csvImportStatus.textContent =
      `Importazione non riuscita: ${error.message}`;
    csvImportStatus.className = "form-status error";
    csvFileInput.value = "";
  }
}

function openPointDialog() {
  pointPickMode = false;
  pointFormStatus.textContent = "";
  pointFormStatus.className = "form-status";
  clearGeocodeResult();
  pointDialog.showModal();
}

function pointFromForm() {
  const formData = new FormData(pointForm);
  const raw = {};

  CSV_COLUMNS.forEach(column => {
    raw[column] = formData.get(column) || "";
  });

  raw.fonte = "Inserimento manuale dal sito";
  raw.stato_verifica = raw.stato_verifica || "Da verificare";

  return normalizeService(raw);
}

function resetToInitialData() {
  const confirmed = window.confirm(
    "Questa operazione elimina dal browser tutti i punti aggiunti o importati e ripristina i dati iniziali del sito. Continuare?"
  );

  if (!confirmed) return;

  localStorage.removeItem(STORAGE_KEY);
  loadInitialServices(true)
    .then(() => {
      alert("I dati iniziali sono stati ripristinati.");
    })
    .catch(error => {
      alert(`Ripristino non riuscito: ${error.message}`);
    });
}

async function loadDefaultServices() {
  const response = await fetch("./data/services.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Non è stato possibile caricare i servizi iniziali.");
  }

  const data = await response.json();
  return data.map(normalizeService).filter(isValidService);
}

async function loadInitialServices(forceDefault = false) {
  if (!forceDefault) {
    const saved = readSavedServices();

    if (saved) {
      services = saved;
      dataSource = "saved";
      rebuildDataUi();
      return;
    }
  }

  services = await loadDefaultServices();
  dataSource = "initial";
  selectedType = "tutti";
  activeMunicipi = new Set(ALL_MUNICIPI);
  syncMunicipioButtons();
  rebuildDataUi();
}

serviceType.addEventListener("change", () => {
  selectedType = serviceType.value;
  refreshView();
});

document.getElementById("locationButton")
  .addEventListener("click", requestLocation);

document.getElementById("mapPickButton")
  .addEventListener("click", toggleManualPick);

document.getElementById("clearLocationButton")
  .addEventListener("click", clearUserPosition);

document.getElementById("allMunicipiButton")
  .addEventListener("click", () => {
    activeMunicipi = new Set(ALL_MUNICIPI);
    syncMunicipioButtons();
    refreshView();
    zoomToActiveMunicipi();
  });

document.getElementById("noMunicipiButton")
  .addEventListener("click", () => {
    activeMunicipi.clear();
    syncMunicipioButtons();
    refreshView();
  });

showBoundaries.addEventListener("change", async () => {
  if (showBoundaries.checked && !municipiLoaded) {
    showBoundaries.disabled = true;
    const loaded = await loadMunicipi();
    showBoundaries.disabled = false;

    if (!loaded) {
      showBoundaries.checked = false;
      return;
    }
  }

  updateMunicipioLayers();

  if (showBoundaries.checked) {
    zoomToActiveMunicipi();
  }
});

showAllMarkers.addEventListener("change", renderMarkers);

document.getElementById("loadCsvButton")
  .addEventListener("click", () => {
    csvImportStatus.textContent = "";
    csvImportStatus.className = "form-status";
    csvDialog.showModal();
  });

document.getElementById("closeCsvDialogButton")
  .addEventListener("click", () => csvDialog.close());

document.getElementById("chooseCsvFileButton")
  .addEventListener("click", () => csvFileInput.click());

document.getElementById("downloadCsvTemplateButton")
  .addEventListener("click", downloadCsvTemplate);

csvFileInput.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) handleCsvFile(file);
});

document.getElementById("addPointButton")
  .addEventListener("click", openPointDialog);

document.getElementById("closePointDialogButton")
  .addEventListener("click", () => pointDialog.close());

document.getElementById("cancelPointButton")
  .addEventListener("click", () => pointDialog.close());

document.getElementById("pickPointOnMapButton")
  .addEventListener("click", beginPointPick);

geocodeAddressButton.addEventListener("click", () => {
  geocodePointAddress({ showAlternatives: true });
});

pointAddress.addEventListener("input", () => {
  clearGeocodeResult({ clearCoordinates: true });
});

document.getElementById("useCurrentPositionForPointButton")
  .addEventListener("click", () => {
    if (!userPosition) {
      pointFormStatus.textContent =
        "Prima seleziona la tua posizione nella sezione “Dove ti trovi?”.";
      pointFormStatus.className = "form-status error";
      return;
    }

    pointLatitude.value = userPosition.lat.toFixed(6);
    pointLongitude.value = userPosition.lon.toFixed(6);
    clearGeocodePreview();
    geocodeResult.innerHTML = `<h3>Posizione selezionata</h3><p>Sono state usate le coordinate già indicate nella mappa.</p>`;
    geocodeResult.className = "geocode-result success";
    pointFormStatus.textContent =
      "Sono state inserite le coordinate della posizione selezionata.";
    pointFormStatus.className = "form-status success";
  });

pointForm.addEventListener("submit", async event => {
  event.preventDefault();

  pointFormStatus.textContent = "";
  pointFormStatus.className = "form-status";

  const currentLatitude = parseCoordinate(pointLatitude.value);
  const currentLongitude = parseCoordinate(pointLongitude.value);

  if (!Number.isFinite(currentLatitude) || !Number.isFinite(currentLongitude)) {
    const found = await geocodePointAddress({ showAlternatives: true });
    if (!found) return;
  }

  const service = pointFromForm();

  if (!isValidService(service)) {
    pointFormStatus.textContent =
      "Non è stato possibile stabilire la posizione. Controlla l’indirizzo oppure scegli manualmente il punto sulla mappa.";
    pointFormStatus.className = "form-status error";
    return;
  }

  const result = addServiceSet([service]);

  if (result.added === 0) {
    pointFormStatus.textContent =
      "Questo punto risulta già presente.";
    pointFormStatus.className = "form-status error";
    return;
  }

  pointDialog.close();
  pointForm.reset();
  clearGeocodeResult();
  map.setView([service.latitudine, service.longitudine], 16);

  const temporaryMarker =
    markerForService(service).addTo(map).openPopup();

  window.setTimeout(() => {
    if (map.hasLayer(temporaryMarker)) {
      map.removeLayer(temporaryMarker);
    }
  }, 10000);

  alert("Il punto è stato aggiunto e salvato in questo browser.");
});

document.getElementById("resetDataButton")
  .addEventListener("click", resetToInitialData);

const privacyDialog = document.getElementById("privacyDialog");

document.getElementById("privacyButton")
  .addEventListener("click", () => privacyDialog.showModal());

document.getElementById("closePrivacyButton")
  .addEventListener("click", () => privacyDialog.close());

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  document.getElementById("installButton").classList.remove("hidden");
});

document.getElementById("installButton")
  .addEventListener("click", async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    document.getElementById("installButton").classList.add("hidden");
  });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js",
        { updateViaCache: "none" }
      );
      await registration.update();
    } catch (error) {
      console.warn("Service worker non disponibile:", error);
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("qubi-sw-reloaded-v6") === "1") return;
    sessionStorage.setItem("qubi-sw-reloaded-v6", "1");
    window.location.reload();
  });
}

buildMunicipioButtons();
buildPointTypeOptions();

loadInitialServices()
  .then(() => {
    requestAnimationFrame(() => map.invalidateSize());
  })
  .catch(error => {
    console.error(error);
    nearestResult.textContent =
      "Si è verificato un problema nel caricamento dei dati.";
    updateDataStatus("Non è stato possibile caricare i servizi.");
  });
