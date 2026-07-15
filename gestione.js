(function () {
  "use strict";

  const {
    CATEGORY_CONFIG,
    CSV_COLUMNS,
    clean,
    normalizeText,
    escapeHtml,
    parseCoordinate,
    normalizeService,
    isValidService,
    loadServices,
    loadDefaultServices,
    saveServices,
    resetServices,
    parseCsv,
    mergeServices,
    downloadCsv,
    downloadJson,
    templateService,
    validateService,
    validateServices,
    geocodeAddress
  } = window.QubiData;

  const COLUMN_DESCRIPTIONS = {
    nome_servizio: "Nome del luogo o servizio (obbligatorio)",
    tipo_luogo: "Categoria: punto qubi, ospedale, scuola, sport ecc. (obbligatorio)",
    ente_gestore: "Ente responsabile",
    macroarea: "Bisogno o area tematica",
    descrizione: "Breve spiegazione del servizio",
    destinatari: "Persone a cui è rivolto",
    indirizzo: "Via, civico e città",
    quartiere: "Quartiere",
    giorni_orari: "Giorni e orari di apertura",
    modalita_accesso: "Accesso libero, prenotazione, iscrizione ecc.",
    telefono: "Numero di telefono",
    email: "Indirizzo e-mail",
    sito_web: "Pagina web del servizio",
    costo: "Gratuito, quota o tariffa",
    latitudine: "Coordinata decimale, es. 45.4642 (obbligatoria nel CSV)",
    longitudine: "Coordinata decimale, es. 9.1900 (obbligatoria nel CSV)",
    fonte: "Origine dell’informazione",
    stato_verifica: "Verificato, da verificare, demo ecc.",
    data_verifica: "Data in formato AAAA-MM-GG",
    municipio: "Municipio 1 … Municipio 9"
  };

  const elements = {
    totalServices: document.getElementById("totalServices"),
    verifiedServices: document.getElementById("verifiedServices"),
    warningServices: document.getElementById("warningServices"),
    managementSearch: document.getElementById("managementSearch"),
    managementStatus: document.getElementById("managementStatus"),
    validationSummary: document.getElementById("validationSummary"),
    managementServiceList: document.getElementById("managementServiceList"),
    serviceDialog: document.getElementById("serviceDialog"),
    serviceDialogTitle: document.getElementById("serviceDialogTitle"),
    serviceForm: document.getElementById("serviceForm"),
    serviceFormStatus: document.getElementById("serviceFormStatus"),
    editorType: document.getElementById("editorType"),
    editorAddress: document.getElementById("editorAddress"),
    editorGeocodeButton: document.getElementById("editorGeocodeButton"),
    editorGeocodeResults: document.getElementById("editorGeocodeResults"),
    editorLatitude: document.getElementById("editorLatitude"),
    editorLongitude: document.getElementById("editorLongitude"),
    editorMapWrap: document.getElementById("editorMapWrap"),
    csvDialog: document.getElementById("csvDialog"),
    csvFileInput: document.getElementById("csvFileInput"),
    csvImportStatus: document.getElementById("csvImportStatus")
  };

  let services = [];
  let dataSource = "initial";
  let editorMap = null;
  let editorMapMarker = null;
  let editorMapPickMode = false;

  function populateTypeOptions() {
    elements.editorType.innerHTML = "";
    Object.entries(CATEGORY_CONFIG)
      .sort(([, a], [, b]) => a.label.localeCompare(b.label, "it"))
      .forEach(([value, config]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = config.label;
        elements.editorType.appendChild(option);
      });
  }

  function buildCsvGuide() {
    const body = document.getElementById("csvGuideBody");
    body.innerHTML = "";
    CSV_COLUMNS.forEach((column, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${index + 1}</td><td><code>${escapeHtml(column)}</code></td><td>${escapeHtml(COLUMN_DESCRIPTIONS[column] || "")}</td>`;
      body.appendChild(row);
    });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return clean(value) || "Non indicata";
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  }

  function statusMessage() {
    if (dataSource === "saved") {
      return `${services.length} servizi salvati in questo browser. Esporta services.json per pubblicarli sul sito per tutti.`;
    }
    return `${services.length} servizi caricati dal file pubblico data/services.json. Le modifiche saranno salvate in questo browser.`;
  }

  function updateSummary() {
    const validation = validateServices(services);
    elements.totalServices.textContent = String(services.length);
    elements.verifiedServices.textContent = String(services.filter(service => clean(service.data_verifica)).length);
    elements.warningServices.textContent = String(validation.affectedCount);
    elements.managementStatus.textContent = statusMessage();

    if (!validation.affectedCount) {
      elements.validationSummary.className = "validation-summary success";
      elements.validationSummary.textContent = "Controllo completato: non risultano problemi evidenti nei dati.";
    } else {
      elements.validationSummary.className = "validation-summary warning";
      elements.validationSummary.textContent = `${validation.affectedCount} servizi richiedono attenzione: ${validation.errorCount} errori e ${validation.warningCount} avvisi complessivi.`;
    }
  }

  function serviceWarningsHtml(service) {
    const report = validateService(service);
    const items = [...report.errors.map(item => `Errore: ${item}`), ...report.warnings.map(item => `Avviso: ${item}`)];
    if (!items.length) return '<span class="data-quality good">Dati completi</span>';
    return `<details class="data-quality warning"><summary>${items.length} controlli da fare</summary><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`;
  }

  function visibleServices() {
    const query = normalizeText(elements.managementSearch.value);
    if (!query) return services;
    return services.filter(service => normalizeText([
      service.nome_servizio,
      service.indirizzo,
      service.ente_gestore,
      service.quartiere,
      service.municipio,
      service.tipo_luogo
    ].join(" ")).includes(query));
  }

  function renderServices() {
    updateSummary();
    const list = visibleServices();
    elements.managementServiceList.innerHTML = "";

    if (!list.length) {
      elements.managementServiceList.innerHTML = '<p class="empty-state">Nessun servizio corrisponde alla ricerca.</p>';
      return;
    }

    list
      .slice()
      .sort((a, b) => a.nome_servizio.localeCompare(b.nome_servizio, "it"))
      .forEach(service => {
        const item = document.createElement("article");
        item.className = "management-service-item";
        item.innerHTML = `
          <div class="management-service-main">
            <p class="service-type" style="background:${CATEGORY_CONFIG[service.tipo_normalizzato].color}">${escapeHtml(CATEGORY_CONFIG[service.tipo_normalizzato].label)}</p>
            <h3>${escapeHtml(service.nome_servizio)}</h3>
            <p>${escapeHtml(service.indirizzo || "Indirizzo non indicato")}</p>
            <p class="helper">${escapeHtml(service.ente_gestore || "Ente non indicato")} · ${escapeHtml(service.municipio || "Municipio non indicato")}</p>
            <p class="helper">Verifica: ${escapeHtml(formatDate(service.data_verifica))}</p>
            ${serviceWarningsHtml(service)}
          </div>
          <div class="management-item-actions">
            <button class="button compact secondary" type="button" data-admin-action="edit" data-service-id="${escapeHtml(service.id)}">Modifica</button>
            <button class="button compact ghost" type="button" data-admin-action="duplicate" data-service-id="${escapeHtml(service.id)}">Duplica</button>
            <button class="button compact ghost danger-button" type="button" data-admin-action="delete" data-service-id="${escapeHtml(service.id)}">Elimina</button>
          </div>`;
        elements.managementServiceList.appendChild(item);
      });
  }

  function serviceById(id) {
    return services.find(service => service.id === id);
  }

  function clearEditorStatus() {
    elements.serviceFormStatus.textContent = "";
    elements.serviceFormStatus.className = "form-status";
    elements.editorGeocodeResults.textContent = "";
    elements.editorGeocodeResults.className = "geocode-result hidden";
  }

  function formField(name) {
    return elements.serviceForm.elements[name];
  }

  function setFormService(service) {
    formField("id").value = service?.id || "";
    CSV_COLUMNS.forEach(column => {
      const input = formField(column);
      if (!input) return;
      const value = service ? service[column] : "";
      input.value = Number.isFinite(value) ? String(value) : clean(value);
    });
    if (!service) {
      formField("stato_verifica").value = "Da verificare";
      formField("data_verifica").value = new Date().toISOString().slice(0, 10);
    }
  }

  function openServiceDialog(service = null, duplicate = false) {
    clearEditorStatus();
    elements.serviceForm.reset();
    let working = service;
    if (service && duplicate) {
      working = { ...service, id: "", nome_servizio: `${service.nome_servizio} (copia)` };
    }
    setFormService(working);
    elements.serviceDialogTitle.textContent = service && !duplicate ? "Modifica il servizio" : "Aggiungi un servizio";
    elements.editorMapWrap.classList.add("hidden");
    editorMapPickMode = false;
    elements.serviceDialog.showModal();
  }

  function ensureEditorMap() {
    if (!editorMap) {
      editorMap = L.map("editorMap", { zoomControl: true }).setView([45.4642, 9.19], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(editorMap);
      editorMap.on("click", event => {
        if (!editorMapPickMode) return;
        setEditorCoordinates(event.latlng.lat, event.latlng.lng, "Punto scelto sulla mappa.");
        editorMapPickMode = false;
      });
    }
    elements.editorMapWrap.classList.remove("hidden");
    window.setTimeout(() => editorMap.invalidateSize(), 50);
    const lat = parseCoordinate(elements.editorLatitude.value);
    const lon = parseCoordinate(elements.editorLongitude.value);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      editorMap.setView([lat, lon], 16);
      setEditorMarker(lat, lon);
    }
  }

  function setEditorMarker(lat, lon) {
    if (!editorMap) return;
    if (editorMapMarker) editorMap.removeLayer(editorMapMarker);
    editorMapMarker = L.circleMarker([lat, lon], {
      radius: 10, color: "#111", weight: 3, fillColor: "#39a96b", fillOpacity: 1
    }).addTo(editorMap);
  }

  function setEditorCoordinates(lat, lon, message) {
    elements.editorLatitude.value = Number(lat).toFixed(6);
    elements.editorLongitude.value = Number(lon).toFixed(6);
    setEditorMarker(Number(lat), Number(lon));
    elements.editorGeocodeResults.innerHTML = `<p><strong>${escapeHtml(message)}</strong></p>`;
    elements.editorGeocodeResults.className = "geocode-result success";
  }

  function showGeocodeCandidates(results) {
    elements.editorGeocodeResults.innerHTML = '<p><strong>Scegli l’indirizzo corretto:</strong></p><div class="geocode-candidates"></div>';
    elements.editorGeocodeResults.className = "geocode-result success";
    const container = elements.editorGeocodeResults.querySelector(".geocode-candidates");
    results.forEach(result => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "address-result-button";
      button.textContent = result.display_name;
      button.addEventListener("click", () => {
        elements.editorAddress.value = result.display_name;
        setEditorCoordinates(result.lat, result.lon, `Indirizzo trovato: ${result.display_name}`);
        if (editorMap) editorMap.setView([Number(result.lat), Number(result.lon)], 16);
      });
      container.appendChild(button);
    });
  }

  async function geocodeEditorAddress() {
    const address = clean(elements.editorAddress.value);
    if (!address) {
      elements.editorGeocodeResults.textContent = "Inserisci prima un indirizzo.";
      elements.editorGeocodeResults.className = "geocode-result error";
      elements.editorAddress.focus();
      return false;
    }
    elements.editorGeocodeButton.disabled = true;
    elements.editorGeocodeButton.textContent = "Ricerca…";
    elements.editorGeocodeResults.textContent = "Sto cercando l’indirizzo…";
    elements.editorGeocodeResults.className = "geocode-result";
    try {
      const results = await geocodeAddress(address, clean(formField("quartiere").value));
      if (results.length === 1) {
        elements.editorAddress.value = results[0].display_name;
        setEditorCoordinates(results[0].lat, results[0].lon, `Indirizzo trovato: ${results[0].display_name}`);
      } else {
        showGeocodeCandidates(results);
      }
      return true;
    } catch (error) {
      elements.editorGeocodeResults.textContent = error.message;
      elements.editorGeocodeResults.className = "geocode-result error";
      return false;
    } finally {
      elements.editorGeocodeButton.disabled = false;
      elements.editorGeocodeButton.textContent = "Trova questo indirizzo";
    }
  }

  function serviceFromForm() {
    const raw = { id: clean(formField("id").value) };
    CSV_COLUMNS.forEach(column => {
      const input = formField(column);
      raw[column] = input ? input.value : "";
    });
    return normalizeService(raw);
  }

  async function saveFormService(event) {
    event.preventDefault();
    elements.serviceFormStatus.textContent = "";
    let lat = parseCoordinate(elements.editorLatitude.value);
    let lon = parseCoordinate(elements.editorLongitude.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      elements.serviceFormStatus.textContent = "Ricavo le coordinate dall’indirizzo…";
      const found = await geocodeEditorAddress();
      if (!found) {
        elements.serviceFormStatus.textContent = "Non posso salvare il servizio senza un indirizzo riconosciuto o coordinate valide.";
        elements.serviceFormStatus.className = "form-status error";
        return;
      }
      lat = parseCoordinate(elements.editorLatitude.value);
      lon = parseCoordinate(elements.editorLongitude.value);
    }

    const service = serviceFromForm();
    if (!isValidService(service)) {
      elements.serviceFormStatus.textContent = "Controlla nome e coordinate del servizio.";
      elements.serviceFormStatus.className = "form-status error";
      return;
    }

    const existingIndex = services.findIndex(item => item.id === service.id);
    if (existingIndex >= 0) services.splice(existingIndex, 1, service);
    else services.push(service);

    saveServices(services);
    dataSource = "saved";
    elements.serviceDialog.close();
    renderServices();
  }

  function deleteService(service) {
    const confirmed = window.confirm(`Eliminare “${service.nome_servizio}”? La modifica resterà in questo browser finché non ripristini i dati iniziali.`);
    if (!confirmed) return;
    services = services.filter(item => item.id !== service.id);
    saveServices(services);
    dataSource = "saved";
    renderServices();
  }

  function importMode() {
    return document.querySelector('input[name="csvImportMode"]:checked')?.value || "add";
  }

  async function handleCsvFile(file) {
    elements.csvImportStatus.textContent = "";
    elements.csvImportStatus.className = "form-status";
    try {
      const rows = parseCsv(await file.text());
      const valid = [];
      const invalidRows = [];
      rows.forEach(row => {
        const service = normalizeService(row);
        if (isValidService(service)) valid.push(service);
        else invalidRows.push(row.__rowNumber);
      });
      if (!valid.length) throw new Error("Nessuna riga valida. Controlla nome, latitudine e longitudine.");

      if (importMode() === "replace") {
        const confirmed = window.confirm(`Sostituire i ${services.length} servizi attuali con ${valid.length} servizi del file?`);
        if (!confirmed) return;
        services = valid;
      } else {
        const merged = mergeServices(services, valid);
        services = merged.services;
        elements.csvImportStatus.textContent = `${merged.added} servizi aggiunti. ${merged.skipped} duplicati ignorati.${invalidRows.length ? ` Righe non valide: ${invalidRows.join(", ")}.` : ""}`;
      }

      saveServices(services);
      dataSource = "saved";
      if (importMode() === "replace") {
        elements.csvImportStatus.textContent = `${valid.length} servizi importati e archivio precedente sostituito.${invalidRows.length ? ` Righe non valide: ${invalidRows.join(", ")}.` : ""}`;
      }
      elements.csvImportStatus.className = "form-status success";
      renderServices();
    } catch (error) {
      elements.csvImportStatus.textContent = `Importazione non riuscita: ${error.message}`;
      elements.csvImportStatus.className = "form-status error";
    } finally {
      elements.csvFileInput.value = "";
    }
  }

  async function resetToInitial() {
    const confirmed = window.confirm("Eliminare tutte le modifiche locali e ripristinare i dati pubblici iniziali?");
    if (!confirmed) return;
    resetServices();
    services = await loadDefaultServices();
    dataSource = "initial";
    renderServices();
  }

  document.getElementById("newServiceButton").addEventListener("click", () => openServiceDialog());
  document.getElementById("closeServiceDialogButton").addEventListener("click", () => elements.serviceDialog.close());
  document.getElementById("cancelServiceButton").addEventListener("click", () => elements.serviceDialog.close());
  elements.serviceForm.addEventListener("submit", saveFormService);
  elements.editorGeocodeButton.addEventListener("click", geocodeEditorAddress);
  document.getElementById("editorMapPickButton").addEventListener("click", () => {
    ensureEditorMap();
    editorMapPickMode = true;
    elements.editorGeocodeResults.textContent = "Tocca la mappa nel punto corretto.";
    elements.editorGeocodeResults.className = "geocode-result";
  });

  elements.managementSearch.addEventListener("input", renderServices);
  elements.managementServiceList.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-action][data-service-id]");
    if (!button) return;
    const service = serviceById(button.dataset.serviceId);
    if (!service) return;
    if (button.dataset.adminAction === "edit") openServiceDialog(service);
    if (button.dataset.adminAction === "duplicate") openServiceDialog(service, true);
    if (button.dataset.adminAction === "delete") deleteService(service);
  });

  document.getElementById("importCsvButton").addEventListener("click", () => {
    elements.csvImportStatus.textContent = "";
    elements.csvImportStatus.className = "form-status";
    elements.csvDialog.showModal();
  });
  document.getElementById("closeCsvDialogButton").addEventListener("click", () => elements.csvDialog.close());
  document.getElementById("chooseCsvButton").addEventListener("click", () => elements.csvFileInput.click());
  elements.csvFileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) handleCsvFile(file);
  });
  document.getElementById("downloadTemplateButton").addEventListener("click", () => downloadCsv([templateService()], "modello_servizi_qubi.csv"));
  document.getElementById("exportCsvButton").addEventListener("click", () => downloadCsv(services, "servizi_qubi_backup.csv"));
  document.getElementById("exportJsonButton").addEventListener("click", () => downloadJson(services, "services.json"));
  document.getElementById("resetServicesButton").addEventListener("click", resetToInitial);

  async function init() {
    try {
      populateTypeOptions();
      buildCsvGuide();
      const loaded = await loadServices();
      services = loaded.services;
      dataSource = loaded.source;
      renderServices();
    } catch (error) {
      console.error(error);
      elements.managementStatus.textContent = `Errore: ${error.message}`;
    }
  }

  init();
})();
