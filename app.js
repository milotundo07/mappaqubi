const CATEGORY_CONFIG = {
  "punto qubi": { label: "Punti QuBì", color: "#2A81CB", marker: "blue" },
  "ospedale": { label: "Ospedali e salute", color: "#CB2B3E", marker: "red" },
  "casa di quartiere": { label: "Case di quartiere", color: "#2AAD27", marker: "green" },
  "scuola": { label: "Scuole", color: "#CB8427", marker: "orange" },
  "servizio educativo": { label: "Servizi educativi", color: "#c98742", marker: "orange" },
  "biblioteca": { label: "Biblioteche", color: "#9C2BCB", marker: "violet" },
  "cultura": { label: "Cultura", color: "#6F42C1", marker: "violet" },
  "sport": { label: "Sport", color: "#006400", marker: "green" },
  "servizio sociale": { label: "Servizi sociali", color: "#436978", marker: "blue" },
  "associazione": { label: "Associazioni", color: "#3D8DAE", marker: "blue" },
  "altro": { label: "Altri luoghi", color: "#777777", marker: "gray" }
};

const MUNICIPIO_COLORS = {
  1: "#e41a1c", 2: "#377eb8", 3: "#4daf4a",
  4: "#984ea3", 5: "#ff7f00", 6: "#a65628",
  7: "#d95f9f", 8: "#666666", 9: "#17a2b8"
};

const OFFICIAL_MUNICIPI_URL =
  "https://dati.comune.milano.it/dataset/36ba21c2-8b48-43ce-bbe1-e236a8a49ff6/resource/99ecd085-0b04-4fb2-a66e-9795694d4fc4/download/ds379_municipi_label.geojson";

let services = [];
let filteredServices = [];
let markers = [];
let municipioLayers = {};
let activeMunicipi = new Set([1,2,3,4,5,6,7,8,9]);
let selectedType = "tutti";
let userPosition = null;
let userMarker = null;
let nearestMarker = null;
let nearestLine = null;
let manualPickMode = false;
let installPrompt = null;
let municipiLoaded = false;
let municipiLoading = false;

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
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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

const serviceType = document.getElementById("serviceType");
const municipioButtons = document.getElementById("municipioButtons");
const nearestResult = document.getElementById("nearestResult");
const locationStatus = document.getElementById("locationStatus");
const manualHint = document.getElementById("manualHint");
const serviceList = document.getElementById("serviceList");
const serviceCount = document.getElementById("serviceCount");
const showBoundaries = document.getElementById("showBoundaries");
const showAllMarkers = document.getElementById("showAllMarkers");

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
  return {
    ...service,
    nome_servizio: clean(service.nome_servizio),
    tipo_normalizzato: normalizeType(service.tipo_luogo),
    municipio_numero: municipioNumber(service.municipio),
    latitudine: Number(service.latitudine),
    longitudine: Number(service.longitudine)
  };
}

function isValidService(service) {
  return service.nome_servizio &&
    Number.isFinite(service.latitudine) &&
    Number.isFinite(service.longitudine);
}

function buildCategoryOptions() {
  const types = [...new Set(services.map(s => s.tipo_normalizzato))]
    .sort((a, b) => CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it"));

  serviceType.innerHTML = '<option value="tutti">Tutti i servizi</option>';
  types.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = CATEGORY_CONFIG[type].label;
    serviceType.appendChild(option);
  });
}

function buildLegend() {
  const container = document.getElementById("legendItems");
  container.innerHTML = "";

  [...new Set(services.map(s => s.tipo_normalizzato))]
    .sort((a, b) => CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it"))
    .forEach(type => {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `
        <span class="legend-dot" style="background:${CATEGORY_CONFIG[type].color}"></span>
        <span>${escapeHtml(CATEGORY_CONFIG[type].label)}</span>
      `;
      container.appendChild(row);
    });
}

function buildMunicipioButtons() {
  municipioButtons.innerHTML = "";
  for (let number = 1; number <= 9; number += 1) {
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
  }
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
  const typeMatches = selectedType === "tutti" || service.tipo_normalizzato === selectedType;
  const municipioMatches = service.municipio_numero === null || activeMunicipi.has(service.municipio_numero);
  return typeMatches && municipioMatches;
}

function popupHtml(service) {
  const parts = [
    `<div style="font-size:18px;font-weight:800;margin-bottom:6px">${escapeHtml(service.nome_servizio)}</div>`
  ];
  if (clean(service.indirizzo)) parts.push(`<div><b>Indirizzo:</b> ${escapeHtml(service.indirizzo)}</div>`);
  if (clean(service.giorni_orari)) parts.push(`<div><b>Orari:</b> ${escapeHtml(service.giorni_orari)}</div>`);
  if (clean(service.modalita_accesso)) parts.push(`<div><b>Accesso:</b> ${escapeHtml(service.modalita_accesso)}</div>`);
  if (clean(service.telefono)) {
    const phone = escapeHtml(service.telefono);
    parts.push(`<div><b>Telefono:</b> <a href="tel:${phone}">${phone}</a></div>`);
  }
  return parts.join("");
}

function markerForService(service) {
  const config = CATEGORY_CONFIG[service.tipo_normalizzato];
  return L.circleMarker([service.latitudine, service.longitudine], {
    radius: 9,
    color: "#ffffff",
    weight: 2,
    fillColor: config.color,
    fillOpacity: 1
  })
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
  serviceCount.textContent = `${filteredServices.length} ${filteredServices.length === 1 ? "servizio" : "servizi"}`;

  if (filteredServices.length === 0) {
    serviceList.innerHTML = "<p>Nessun servizio corrisponde ai filtri selezionati.</p>";
    return;
  }

  filteredServices.forEach(service => {
    const card = document.createElement("article");
    card.className = "service-card";
    const config = CATEGORY_CONFIG[service.tipo_normalizzato];
    card.innerHTML = `
      <span class="service-type" style="background:${config.color}">${escapeHtml(config.label)}</span>
      <h3>${escapeHtml(service.nome_servizio)}</h3>
      ${clean(service.indirizzo) ? `<p><b>Indirizzo:</b> ${escapeHtml(service.indirizzo)}</p>` : ""}
      ${clean(service.giorni_orari) ? `<p><b>Orari:</b> ${escapeHtml(service.giorni_orari)}</p>` : ""}
      ${clean(service.telefono) ? `<p><a href="tel:${escapeHtml(service.telefono)}">Chiama ${escapeHtml(service.telefono)}</a></p>` : ""}
    `;
    card.addEventListener("click", () => {
      map.setView([service.latitudine, service.longitudine], 16);
      const marker = markerForService(service).addTo(map).openPopup();
      setTimeout(() => map.removeLayer(marker), 10000);
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

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} metri` : `${km.toFixed(1).replace(".", ",")} km`;
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
    nearestResult.textContent = "Indica la tua posizione per vedere il risultato.";
    return;
  }

  if (filteredServices.length === 0) {
    nearestResult.className = "result-empty";
    nearestResult.textContent = "Non ci sono servizi con i filtri selezionati.";
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

  const resultParts = [
    `<div class="result-name">${escapeHtml(nearest.nome_servizio)}</div>`,
    `<div class="result-distance">${formatDistance(minimum)} in linea d’aria</div>`
  ];
  if (clean(nearest.indirizzo)) resultParts.push(`<div><b>Indirizzo:</b> ${escapeHtml(nearest.indirizzo)}</div>`);
  if (clean(nearest.giorni_orari)) resultParts.push(`<div><b>Orari:</b> ${escapeHtml(nearest.giorni_orari)}</div>`);
  if (clean(nearest.telefono)) {
    resultParts.push(`<a class="result-link" href="tel:${escapeHtml(nearest.telefono)}">Chiama ${escapeHtml(nearest.telefono)}</a>`);
  }

  nearestResult.className = "";
  nearestResult.innerHTML = resultParts.join("");

  nearestMarker = L.circleMarker(
    [nearest.latitudine, nearest.longitudine],
    {
      radius: 14,
      color: "#111",
      weight: 4,
      fillColor: "#ff4d4d",
      fillOpacity: .95
    }
  ).addTo(map).bindPopup(popupHtml(nearest)).openPopup();

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
  userMarker = L.circleMarker([lat, lon], {
    radius: 11,
    color: "#111",
    weight: 3,
    fillColor: "#ffd400",
    fillOpacity: 1
  }).addTo(map).bindTooltip("La tua posizione");

  locationStatus.textContent = `Posizione impostata (${label}).`;
  findNearest();
}

function clearUserPosition() {
  userPosition = null;
  manualPickMode = false;
  manualHint.classList.add("hidden");
  map.getContainer().style.cursor = "";

  if (userMarker) map.removeLayer(userMarker);
  userMarker = null;
  clearNearestGraphics();

  locationStatus.textContent = "Nessuna posizione selezionata.";
  nearestResult.className = "result-empty";
  nearestResult.textContent = "Indica la tua posizione per vedere il risultato.";
  map.setView([45.4642, 9.1900], 11);
}

function requestLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Questo browser non supporta la posizione. Usa la scelta sulla mappa.";
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
      locationStatus.textContent = messages[error.code] || "Non è stato possibile leggere la posizione.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

function toggleManualPick() {
  manualPickMode = !manualPickMode;
  manualHint.classList.toggle("hidden", !manualPickMode);
  map.getContainer().style.cursor = manualPickMode ? "crosshair" : "";
}

map.on("click", event => {
  if (!manualPickMode) return;
  setUserPosition(event.latlng.lat, event.latlng.lng, "scelta sulla mappa");
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

function municipioNumber(value) {
  const match = clean(value).match(/(?:^|\D)([1-9])(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

async function loadMunicipi() {
  if (municipiLoaded || municipiLoading) return municipiLoaded;

  municipiLoading = true;
  let data = null;

  try {
    const localResponse = await fetch("./data/municipi.geojson", { cache: "force-cache" });
    if (localResponse.ok) {
      const localData = await localResponse.json();
      if (Array.isArray(localData.features) && localData.features.length > 0) {
        data = localData;
      }
    }
  } catch (_) {}

  if (!data) {
    try {
      const remoteResponse = await fetch(OFFICIAL_MUNICIPI_URL, {
        mode: "cors",
        cache: "force-cache"
      });
      if (remoteResponse.ok) data = await remoteResponse.json();
    } catch (_) {}
  }

  if (!data || !Array.isArray(data.features)) {
    municipiLoading = false;
    showBoundaries.checked = false;
    alert("Non è stato possibile caricare i confini. I servizi restano comunque disponibili.");
    return false;
  }

  for (let number = 1; number <= 9; number += 1) {
    const features = data.features.filter(
      feature => featureMunicipioNumber(feature) === number
    );
    if (features.length === 0) continue;

    municipioLayers[number] = L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: {
          color: MUNICIPIO_COLORS[number],
          weight: 4,
          fillColor: MUNICIPIO_COLORS[number],
          fillOpacity: .14
        },
        onEachFeature: (_, layer) =>
          layer.bindTooltip(`Municipio ${number}`, { sticky: true })
      }
    );
  }

  municipiLoaded = true;
  municipiLoading = false;
  updateMunicipioLayers();
  return true;
}

function updateMunicipioLayers() {
  Object.entries(municipioLayers).forEach(([numberText, layer]) => {
    const number = Number(numberText);
    const shouldShow = showBoundaries.checked && activeMunicipi.has(number);
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
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
}

function parseCsv(text) {
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
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some(value => value !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map(header => header.replace(/^\uFEFF/, "").trim());

  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

async function loadInitialServices() {
  const response = await fetch("./data/services.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Non è stato possibile caricare i servizi.");
  const data = await response.json();
  services = data.map(normalizeService).filter(isValidService);
  buildCategoryOptions();
  buildLegend();
  refreshView();
}

serviceType.addEventListener("change", () => {
  selectedType = serviceType.value;
  refreshView();
});

document.getElementById("locationButton").addEventListener("click", requestLocation);
document.getElementById("mapPickButton").addEventListener("click", toggleManualPick);
document.getElementById("clearLocationButton").addEventListener("click", clearUserPosition);

document.getElementById("allMunicipiButton").addEventListener("click", () => {
  activeMunicipi = new Set([1,2,3,4,5,6,7,8,9]);
  syncMunicipioButtons();
  refreshView();
  zoomToActiveMunicipi();
});

document.getElementById("noMunicipiButton").addEventListener("click", () => {
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

document.getElementById("loadCsvButton").addEventListener("click", () => {
  document.getElementById("csvFileInput").click();
});

document.getElementById("csvFileInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const loaded = parseCsv(text).map(normalizeService).filter(isValidService);
    if (loaded.length === 0) {
      alert("Il CSV non contiene servizi validi con latitudine e longitudine.");
      return;
    }
    services = loaded;
    selectedType = "tutti";
    buildCategoryOptions();
    buildLegend();
    refreshView();
    alert(`Caricati ${services.length} servizi. Il file resta soltanto nel dispositivo.`);
  } catch (error) {
    alert(`Errore nella lettura del CSV: ${error.message}`);
  }
});

const privacyDialog = document.getElementById("privacyDialog");
document.getElementById("privacyButton").addEventListener("click", () => privacyDialog.showModal());
document.getElementById("closePrivacyButton").addEventListener("click", () => privacyDialog.close());

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  document.getElementById("installButton").classList.remove("hidden");
});

document.getElementById("installButton").addEventListener("click", async () => {
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
    if (sessionStorage.getItem("qubi-sw-reloaded") === "1") return;

    sessionStorage.setItem("qubi-sw-reloaded", "1");
    window.location.reload();
  });
}

buildMunicipioButtons();

loadInitialServices()
  .then(() => {
    requestAnimationFrame(() => map.invalidateSize());
  })
  .catch(error => {
    console.error(error);
    nearestResult.textContent =
      "Si è verificato un problema nel caricamento dei dati.";
  });
