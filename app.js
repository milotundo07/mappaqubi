(function () {
  "use strict";

  const {
    CATEGORY_CONFIG,
    NEED_CONFIG,
    TARGET_CONFIG,
    clean,
    normalizeText,
    escapeHtml,
    loadServices,
    readFavorites,
    saveFavorites,
    readSimpleMode,
    saveSimpleMode,
    geocodeAddress
  } = window.QubiData;

  const MUNICIPIO_COLORS = {
    1: "#e41a1c", 2: "#377eb8", 3: "#4daf4a",
    4: "#984ea3", 5: "#ff7f00", 6: "#a65628",
    7: "#d95f9f", 8: "#666666", 9: "#17a2b8"
  };
  const ALL_MUNICIPI = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const OFFICIAL_MUNICIPI_URL = "https://dati.comune.milano.it/dataset/36ba21c2-8b48-43ce-bbe1-e236a8a49ff6/resource/99ecd085-0b04-4fb2-a66e-9795694d4fc4/download/ds379_municipi_label.geojson";

  const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([45.4642, 9.19], 11);
  const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    minZoom: 3,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const elements = {
    serviceSearch: document.getElementById("serviceSearch"),
    needFilter: document.getElementById("needFilter"),
    serviceType: document.getElementById("serviceType"),
    targetFilter: document.getElementById("targetFilter"),
    freeOnly: document.getElementById("freeOnly"),
    favoritesOnly: document.getElementById("favoritesOnly"),
    municipioButtons: document.getElementById("municipioButtons"),
    nearestResult: document.getElementById("nearestResult"),
    locationStatus: document.getElementById("locationStatus"),
    locationAddress: document.getElementById("locationAddress"),
    locationAddressButton: document.getElementById("locationAddressButton"),
    locationAddressResults: document.getElementById("locationAddressResults"),
    manualHint: document.getElementById("manualHint"),
    serviceList: document.getElementById("serviceList"),
    serviceCount: document.getElementById("serviceCount"),
    activeFilterSummary: document.getElementById("activeFilterSummary"),
    showBoundaries: document.getElementById("showBoundaries"),
    showAllMarkers: document.getElementById("showAllMarkers"),
    simpleModeButton: document.getElementById("simpleModeButton")
  };

  let services = [];
  let filteredServices = [];
  let markers = [];
  let municipioLayers = {};
  let activeMunicipi = new Set(ALL_MUNICIPI);
  let userPosition = null;
  let userMarker = null;
  let nearestMarker = null;
  let nearestLine = null;
  let manualPickMode = false;
  let favorites = readFavorites();
  let simpleMode = readSimpleMode();
  let installPrompt = null;
  let municipiLoaded = false;
  let municipiLoading = false;
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
    window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  window.addEventListener("load", () => {
    refreshMapSize();
    window.setTimeout(refreshMapSize, 250);
    window.setTimeout(refreshMapSize, 900);
  });
  window.addEventListener("resize", refreshMapSize);
  if ("ResizeObserver" in window) {
    new ResizeObserver(refreshMapSize).observe(document.getElementById("map"));
  }

  function setSimpleMode(enabled) {
    simpleMode = enabled;
    document.body.classList.toggle("simple-mode", enabled);
    elements.simpleModeButton.setAttribute("aria-pressed", String(enabled));
    elements.simpleModeButton.textContent = enabled ? "Mostra tutte le opzioni" : "Modalità semplice";
    saveSimpleMode(enabled);
    refreshMapSize();
  }

  function populateFilters() {
    elements.needFilter.innerHTML = "";
    Object.entries(NEED_CONFIG).forEach(([value, config]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = config.label;
      elements.needFilter.appendChild(option);
    });

    elements.targetFilter.innerHTML = "";
    Object.entries(TARGET_CONFIG).forEach(([value, config]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = config.label;
      elements.targetFilter.appendChild(option);
    });

    const types = [...new Set(services.map(service => service.tipo_normalizzato))]
      .sort((a, b) => CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it"));
    elements.serviceType.innerHTML = '<option value="tutti">Tutti i servizi</option>';
    types.forEach(type => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = CATEGORY_CONFIG[type].label;
      elements.serviceType.appendChild(option);
    });
  }

  function buildLegend() {
    const container = document.getElementById("legendItems");
    container.innerHTML = "";
    [...new Set(services.map(service => service.tipo_normalizzato))]
      .sort((a, b) => CATEGORY_CONFIG[a].label.localeCompare(CATEGORY_CONFIG[b].label, "it"))
      .forEach(type => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="legend-dot" style="background:${CATEGORY_CONFIG[type].color}"></span><span>${escapeHtml(CATEGORY_CONFIG[type].label)}</span>`;
        container.appendChild(row);
      });
  }

  function buildMunicipioButtons() {
    elements.municipioButtons.innerHTML = "";
    ALL_MUNICIPI.forEach(number => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "municipio-button active";
      button.style.setProperty("--municipio-color", MUNICIPIO_COLORS[number]);
      button.dataset.municipio = String(number);
      button.textContent = `M${number}`;
      button.setAttribute("aria-pressed", "true");
      button.addEventListener("click", () => {
        if (activeMunicipi.has(number)) activeMunicipi.delete(number);
        else activeMunicipi.add(number);
        syncMunicipioButtons();
        refreshView();
        zoomToActiveMunicipi();
      });
      elements.municipioButtons.appendChild(button);
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

  function combinedSearchText(service) {
    return normalizeText([
      service.nome_servizio,
      service.tipo_luogo,
      service.ente_gestore,
      service.macroarea,
      service.descrizione,
      service.destinatari,
      service.indirizzo,
      service.quartiere,
      service.modalita_accesso,
      service.costo,
      service.municipio
    ].join(" "));
  }

  function matchesKeywords(text, keywords) {
    return !keywords.length || keywords.some(keyword => text.includes(normalizeText(keyword)));
  }

  function servicePassesFilters(service) {
    const text = combinedSearchText(service);
    const query = normalizeText(elements.serviceSearch.value);
    const need = NEED_CONFIG[elements.needFilter.value] || NEED_CONFIG.tutti;
    const target = TARGET_CONFIG[elements.targetFilter.value] || TARGET_CONFIG.tutti;
    const typeValue = elements.serviceType.value;

    const queryMatches = !query || query.split(/\s+/).every(part => text.includes(part));
    const needMatches = matchesKeywords(text, need.keywords);
    const targetMatches = matchesKeywords(normalizeText(service.destinatari), target.keywords);
    const typeMatches = typeValue === "tutti" || service.tipo_normalizzato === typeValue;
    const municipioMatches = service.municipio_numero === null || activeMunicipi.has(service.municipio_numero);
    const freeMatches = !elements.freeOnly.checked || /gratuit|senza costo|€\s*0|^0$/i.test(clean(service.costo));
    const favoriteMatches = !elements.favoritesOnly.checked || favorites.has(service.id);

    return queryMatches && needMatches && targetMatches && typeMatches && municipioMatches && freeMatches && favoriteMatches;
  }

  function directionsUrl(service) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${service.latitudine},${service.longitudine}`)}&travelmode=walking`;
  }

  function websiteUrl(value) {
    const text = clean(value);
    if (!text) return "";
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return clean(value);
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function verificationHtml(service) {
    const pieces = [];
    if (clean(service.stato_verifica)) pieces.push(escapeHtml(service.stato_verifica));
    if (clean(service.data_verifica)) pieces.push(`verifica del ${escapeHtml(formatDate(service.data_verifica))}`);
    if (!pieces.length) return '<p class="verification-badge stale">Informazioni da verificare</p>';

    const date = new Date(service.data_verifica);
    const stale = !Number.isNaN(date.getTime()) && (Date.now() - date.getTime()) / 86400000 > 180;
    const demo = /demo|non reale/i.test(clean(service.stato_verifica));
    return `<p class="verification-badge ${stale || demo ? "stale" : "verified"}">${pieces.join(" · ")}</p>`;
  }

  function actionButtonsHtml(service, compact = false) {
    const favorite = favorites.has(service.id);
    return `
      <div class="service-actions ${compact ? "compact-actions" : ""}">
        <a class="button compact primary" href="${directionsUrl(service)}" target="_blank" rel="noopener">Indicazioni</a>
        <button class="button compact ghost" type="button" data-action="favorite" data-service-id="${escapeHtml(service.id)}" aria-pressed="${favorite}">${favorite ? "Rimuovi preferito" : "Salva preferito"}</button>
        <button class="button compact ghost" type="button" data-action="share" data-service-id="${escapeHtml(service.id)}">Condividi</button>
        <button class="button compact ghost" type="button" data-action="report" data-service-id="${escapeHtml(service.id)}">Segnala dato errato</button>
      </div>`;
  }

  function textRow(label, value) {
    if (!clean(value)) return "";
    return `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
  }

  function linkRow(label, value, href) {
    if (!clean(value)) return "";
    return `<p><strong>${label}:</strong> <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></p>`;
  }

  function serviceDetailsHtml(service, includeActions = true) {
    const phone = clean(service.telefono);
    const email = clean(service.email);
    const site = websiteUrl(service.sito_web);
    return [
      `<div class="service-popup">`,
      `<h3>${escapeHtml(service.nome_servizio)}</h3>`,
      verificationHtml(service),
      textRow("Tipo", CATEGORY_CONFIG[service.tipo_normalizzato].label),
      textRow("Ente", service.ente_gestore),
      textRow("Descrizione", service.descrizione),
      textRow("Destinatari", service.destinatari),
      textRow("Indirizzo", service.indirizzo),
      textRow("Quartiere", service.quartiere),
      textRow("Orari", service.giorni_orari),
      textRow("Accesso", service.modalita_accesso),
      textRow("Costo", service.costo),
      phone ? linkRow("Telefono", phone, `tel:${phone.replace(/[^\d+]/g, "")}`) : "",
      email ? linkRow("E-mail", email, `mailto:${email}`) : "",
      site ? linkRow("Sito", service.sito_web, site) : "",
      textRow("Municipio", service.municipio),
      textRow("Fonte", service.fonte),
      includeActions ? actionButtonsHtml(service, true) : "",
      `</div>`
    ].join("");
  }

  function markerForService(service) {
    const config = CATEGORY_CONFIG[service.tipo_normalizzato];
    return L.circleMarker([service.latitudine, service.longitudine], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: config.color,
      fillOpacity: 1
    }).bindTooltip(service.nome_servizio).bindPopup(serviceDetailsHtml(service), { maxWidth: 430 });
  }

  function clearServiceMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
  }

  function renderMarkers() {
    clearServiceMarkers();
    if (!elements.showAllMarkers.checked) return;
    filteredServices.forEach(service => {
      const marker = markerForService(service).addTo(map);
      markers.push(marker);
    });
  }

  function renderServiceList() {
    elements.serviceList.innerHTML = "";
    elements.serviceCount.textContent = `${filteredServices.length} ${filteredServices.length === 1 ? "servizio" : "servizi"}`;

    if (!filteredServices.length) {
      elements.serviceList.innerHTML = '<p class="empty-state">Nessun servizio corrisponde ai filtri selezionati.</p>';
      return;
    }

    filteredServices.forEach(service => {
      const card = document.createElement("article");
      card.className = "service-card expanded-service-card";
      card.dataset.serviceId = service.id;
      card.innerHTML = `
        <div class="service-card-heading">
          <div>
            <p class="service-type" style="background:${CATEGORY_CONFIG[service.tipo_normalizzato].color}">${escapeHtml(CATEGORY_CONFIG[service.tipo_normalizzato].label)}</p>
            <h3>${escapeHtml(service.nome_servizio)}</h3>
          </div>
          <button class="favorite-star" type="button" data-action="favorite" data-service-id="${escapeHtml(service.id)}" aria-label="${favorites.has(service.id) ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}" aria-pressed="${favorites.has(service.id)}">${favorites.has(service.id) ? "★" : "☆"}</button>
        </div>
        ${verificationHtml(service)}
        ${textRow("Indirizzo", service.indirizzo)}
        ${textRow("Orari", service.giorni_orari)}
        ${textRow("Destinatari", service.destinatari)}
        ${textRow("Accesso", service.modalita_accesso)}
        ${textRow("Costo", service.costo)}
        ${actionButtonsHtml(service)}
        <button class="text-button show-on-map" type="button" data-action="show-map" data-service-id="${escapeHtml(service.id)}">Mostra sulla mappa</button>`;
      elements.serviceList.appendChild(card);
    });
  }

  function updateFilterSummary() {
    const labels = [];
    const query = clean(elements.serviceSearch.value);
    if (query) labels.push(`ricerca “${query}”`);
    if (elements.needFilter.value !== "tutti") labels.push(NEED_CONFIG[elements.needFilter.value].label);
    if (elements.serviceType.value !== "tutti") labels.push(CATEGORY_CONFIG[elements.serviceType.value].label);
    if (elements.targetFilter.value !== "tutti") labels.push(TARGET_CONFIG[elements.targetFilter.value].label);
    if (elements.freeOnly.checked) labels.push("solo gratuiti");
    if (elements.favoritesOnly.checked) labels.push("solo preferiti");
    if (activeMunicipi.size !== 9) labels.push(activeMunicipi.size ? `Municipi ${[...activeMunicipi].join(", ")}` : "nessun Municipio");
    elements.activeFilterSummary.textContent = labels.length ? `Filtri attivi: ${labels.join(" · ")}` : "Nessun filtro aggiuntivo.";
  }

  function refreshView() {
    filteredServices = services.filter(servicePassesFilters);
    renderMarkers();
    renderServiceList();
    updateFilterSummary();
    findNearest();
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const radius = 6371;
    const toRad = degrees => degrees * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
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
      elements.nearestResult.className = "result-empty";
      elements.nearestResult.textContent = "Indica la tua posizione per vedere il risultato.";
      return;
    }
    if (!filteredServices.length) {
      elements.nearestResult.className = "result-empty";
      elements.nearestResult.textContent = "Non ci sono servizi con i filtri selezionati.";
      return;
    }

    let nearest = null;
    let minimum = Infinity;
    filteredServices.forEach(service => {
      const distance = haversineKm(userPosition.lat, userPosition.lon, service.latitudine, service.longitudine);
      if (distance < minimum) {
        minimum = distance;
        nearest = service;
      }
    });

    elements.nearestResult.className = "";
    elements.nearestResult.innerHTML = `
      <h3>${escapeHtml(nearest.nome_servizio)}</h3>
      <p class="result-distance">${formatDistance(minimum)} in linea d’aria</p>
      ${textRow("Indirizzo", nearest.indirizzo)}
      ${textRow("Orari", nearest.giorni_orari)}
      ${verificationHtml(nearest)}
      ${actionButtonsHtml(nearest)}`;

    nearestMarker = L.circleMarker([nearest.latitudine, nearest.longitudine], {
      radius: 14, color: "#111", weight: 4, fillColor: "#ff4d4d", fillOpacity: 0.95
    }).addTo(map).bindPopup(serviceDetailsHtml(nearest)).openPopup();
    nearestLine = L.polyline([[userPosition.lat, userPosition.lon], [nearest.latitudine, nearest.longitudine]], {
      color: "#222", weight: 4, dashArray: "8,8"
    }).addTo(map);
    map.fitBounds([[userPosition.lat, userPosition.lon], [nearest.latitudine, nearest.longitudine]], { padding: [50, 50], maxZoom: 15 });
  }

  function setUserPosition(lat, lon, label) {
    userPosition = { lat: Number(lat), lon: Number(lon) };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([userPosition.lat, userPosition.lon], {
      radius: 11, color: "#111", weight: 3, fillColor: "#ffd400", fillOpacity: 1
    }).addTo(map).bindTooltip("La tua posizione");
    elements.locationStatus.textContent = `Posizione impostata (${label}).`;
    findNearest();
  }

  function clearAddressResults() {
    elements.locationAddressResults.innerHTML = "";
    elements.locationAddressResults.classList.add("hidden");
  }

  function clearUserPosition() {
    userPosition = null;
    manualPickMode = false;
    elements.manualHint.classList.add("hidden");
    map.getContainer().style.cursor = "";
    if (userMarker) map.removeLayer(userMarker);
    userMarker = null;
    clearNearestGraphics();
    clearAddressResults();
    elements.locationStatus.textContent = "Nessuna posizione selezionata.";
    elements.nearestResult.className = "result-empty";
    elements.nearestResult.textContent = "Indica la tua posizione per vedere il risultato.";
    map.setView([45.4642, 9.19], 11);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      elements.locationStatus.textContent = "Questo browser non supporta la posizione. Inserisci un indirizzo oppure scegli un punto sulla mappa.";
      return;
    }
    elements.locationStatus.textContent = "Sto cercando la tua posizione…";
    navigator.geolocation.getCurrentPosition(
      position => setUserPosition(position.coords.latitude, position.coords.longitude, "telefono o computer"),
      error => {
        const messages = {
          1: "Permesso negato. Inserisci un indirizzo oppure scegli un punto sulla mappa.",
          2: "Posizione non disponibile. Inserisci un indirizzo oppure scegli un punto sulla mappa.",
          3: "Tempo scaduto. Riprova oppure inserisci un indirizzo."
        };
        elements.locationStatus.textContent = messages[error.code] || "Non è stato possibile leggere la posizione.";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function showAddressCandidates(results) {
    elements.locationAddressResults.innerHTML = '<p><strong>Scegli l’indirizzo corretto:</strong></p>';
    results.forEach(result => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "address-result-button";
      button.textContent = result.display_name;
      button.addEventListener("click", () => {
        setUserPosition(Number(result.lat), Number(result.lon), result.display_name);
        elements.locationAddress.value = result.display_name;
        clearAddressResults();
      });
      elements.locationAddressResults.appendChild(button);
    });
    elements.locationAddressResults.classList.remove("hidden");
  }

  async function searchLocationAddress() {
    const address = clean(elements.locationAddress.value);
    if (!address) {
      elements.locationStatus.textContent = "Scrivi prima un indirizzo.";
      elements.locationAddress.focus();
      return;
    }
    elements.locationAddressButton.disabled = true;
    elements.locationAddressButton.textContent = "Ricerca…";
    elements.locationStatus.textContent = "Sto cercando l’indirizzo…";
    clearAddressResults();
    try {
      const results = await geocodeAddress(address);
      if (results.length === 1) {
        setUserPosition(Number(results[0].lat), Number(results[0].lon), results[0].display_name);
      } else {
        elements.locationStatus.textContent = "Ho trovato più risultati. Scegli quello corretto.";
        showAddressCandidates(results);
      }
    } catch (error) {
      elements.locationStatus.textContent = error.message;
    } finally {
      elements.locationAddressButton.disabled = false;
      elements.locationAddressButton.textContent = "Trova indirizzo";
    }
  }

  function toggleManualPick() {
    manualPickMode = !manualPickMode;
    elements.manualHint.textContent = "Tocca la mappa nel punto in cui ti trovi.";
    elements.manualHint.classList.toggle("hidden", !manualPickMode);
    map.getContainer().style.cursor = manualPickMode ? "crosshair" : "";
  }

  map.on("click", event => {
    if (!manualPickMode) return;
    setUserPosition(event.latlng.lat, event.latlng.lng, "scelta sulla mappa");
    manualPickMode = false;
    elements.manualHint.classList.add("hidden");
    map.getContainer().style.cursor = "";
  });

  function featureMunicipioNumber(feature) {
    const properties = feature.properties || {};
    for (const [key, value] of Object.entries(properties)) {
      if (key.toLowerCase().includes("municip")) {
        const number = window.QubiData.municipioNumber(value);
        if (number) return number;
      }
    }
    for (const value of Object.values(properties)) {
      const number = window.QubiData.municipioNumber(value);
      if (number) return number;
    }
    return null;
  }

  async function loadMunicipi() {
    if (municipiLoaded || municipiLoading) return municipiLoaded;
    municipiLoading = true;
    let data = null;
    try {
      const localResponse = await fetch("./data/municipi.geojson", { cache: "force-cache" });
      if (localResponse.ok) {
        const localData = await localResponse.json();
        if (Array.isArray(localData.features) && localData.features.length) data = localData;
      }
    } catch (_) {
      data = null;
    }
    if (!data) {
      try {
        const remoteResponse = await fetch(OFFICIAL_MUNICIPI_URL, { mode: "cors", cache: "force-cache" });
        if (remoteResponse.ok) data = await remoteResponse.json();
      } catch (_) {
        data = null;
      }
    }
    if (!data || !Array.isArray(data.features)) {
      municipiLoading = false;
      elements.showBoundaries.checked = false;
      alert("Non è stato possibile caricare i confini. I servizi restano disponibili.");
      return false;
    }

    ALL_MUNICIPI.forEach(number => {
      const features = data.features.filter(feature => featureMunicipioNumber(feature) === number);
      if (!features.length) return;
      municipioLayers[number] = L.geoJSON({ type: "FeatureCollection", features }, {
        style: { color: MUNICIPIO_COLORS[number], weight: 4, fillColor: MUNICIPIO_COLORS[number], fillOpacity: 0.14 },
        onEachFeature: (_, layer) => layer.bindTooltip(`Municipio ${number}`, { sticky: true })
      });
    });
    municipiLoaded = true;
    municipiLoading = false;
    updateMunicipioLayers();
    return true;
  }

  function updateMunicipioLayers() {
    Object.entries(municipioLayers).forEach(([numberText, layer]) => {
      const shouldShow = elements.showBoundaries.checked && activeMunicipi.has(Number(numberText));
      if (shouldShow && !map.hasLayer(layer)) layer.addTo(map);
      if (!shouldShow && map.hasLayer(layer)) map.removeLayer(layer);
    });
  }

  function zoomToActiveMunicipi() {
    const layers = [...activeMunicipi].map(number => municipioLayers[number]).filter(Boolean);
    if (!layers.length) return;
    const bounds = L.featureGroup(layers).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }

  function serviceById(id) {
    return services.find(service => service.id === id);
  }

  async function shareService(service) {
    const text = [service.nome_servizio, service.indirizzo, service.giorni_orari, directionsUrl(service)].filter(Boolean).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: service.nome_servizio, text });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("Informazioni copiate. Ora puoi incollarle in WhatsApp o in un messaggio.");
    } catch (_) {
      window.prompt("Copia queste informazioni:", text);
    }
  }

  function reportService(service) {
    const title = `Segnalazione dati: ${service.nome_servizio}`;
    const body = [
      `Servizio: ${service.nome_servizio}`,
      `Indirizzo: ${service.indirizzo || "non indicato"}`,
      "",
      "Informazione da correggere:",
      "",
      "Fonte della correzione:"
    ].join("\n");
    const url = `https://github.com/milotundo07/mappaqubi/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");
  }

  function toggleFavorite(service) {
    if (favorites.has(service.id)) favorites.delete(service.id);
    else favorites.add(service.id);
    saveFavorites(favorites);
    refreshView();
  }

  function showServiceOnMap(service) {
    map.setView([service.latitudine, service.longitudine], 16);
    const temporaryMarker = markerForService(service).addTo(map).openPopup();
    window.setTimeout(() => {
      if (map.hasLayer(temporaryMarker)) map.removeLayer(temporaryMarker);
    }, 12000);
    document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("click", event => {
    const actionElement = event.target.closest("[data-action][data-service-id]");
    if (!actionElement) return;
    const service = serviceById(actionElement.dataset.serviceId);
    if (!service) return;
    const action = actionElement.dataset.action;
    if (action === "favorite") toggleFavorite(service);
    if (action === "share") shareService(service);
    if (action === "report") reportService(service);
    if (action === "show-map") showServiceOnMap(service);
  });

  const filterEvents = [
    [elements.serviceSearch, "input"],
    [elements.needFilter, "change"],
    [elements.serviceType, "change"],
    [elements.targetFilter, "change"],
    [elements.freeOnly, "change"],
    [elements.favoritesOnly, "change"]
  ];
  filterEvents.forEach(([element, eventName]) => element.addEventListener(eventName, refreshView));

  document.getElementById("locationButton").addEventListener("click", requestLocation);
  elements.locationAddressButton.addEventListener("click", searchLocationAddress);
  elements.locationAddress.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchLocationAddress();
    }
  });
  document.getElementById("mapPickButton").addEventListener("click", toggleManualPick);
  document.getElementById("clearLocationButton").addEventListener("click", clearUserPosition);
  document.getElementById("allMunicipiButton").addEventListener("click", () => {
    activeMunicipi = new Set(ALL_MUNICIPI);
    syncMunicipioButtons();
    refreshView();
    zoomToActiveMunicipi();
  });
  document.getElementById("noMunicipiButton").addEventListener("click", () => {
    activeMunicipi.clear();
    syncMunicipioButtons();
    refreshView();
  });
  elements.showAllMarkers.addEventListener("change", renderMarkers);
  elements.showBoundaries.addEventListener("change", async () => {
    if (elements.showBoundaries.checked && !municipiLoaded) {
      elements.showBoundaries.disabled = true;
      const loaded = await loadMunicipi();
      elements.showBoundaries.disabled = false;
      if (!loaded) return;
    }
    updateMunicipioLayers();
    if (elements.showBoundaries.checked) zoomToActiveMunicipi();
  });
  elements.simpleModeButton.addEventListener("click", () => setSimpleMode(!simpleMode));

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
        const registration = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
        await registration.update();
      } catch (error) {
        console.warn("Service worker non disponibile:", error);
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("qubi-sw-reloaded-v7") === "1") return;
      sessionStorage.setItem("qubi-sw-reloaded-v7", "1");
      window.location.reload();
    });
  }

  async function init() {
    try {
      const loaded = await loadServices();
      services = loaded.services;
      populateFilters();
      buildLegend();
      buildMunicipioButtons();
      setSimpleMode(simpleMode);
      refreshView();
      requestAnimationFrame(refreshMapSize);
    } catch (error) {
      console.error(error);
      elements.nearestResult.textContent = "Si è verificato un problema nel caricamento dei dati.";
    }
  }

  init();
})();
