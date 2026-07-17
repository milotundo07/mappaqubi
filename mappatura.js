(function () {
  "use strict";

  const clean = value => value === null || value === undefined ? "" : String(value).trim();
  const norm = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const esc = value => clean(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const splitValues = value => clean(value).split(/[;|]/).map(v => v.trim()).filter(Boolean);
  const first = (...values) => values.map(clean).find(Boolean) || "";

  const fields = {
    direction: ["direzione"],
    area: ["area"],
    theme: ["area_tematica", "macroarea"],
    service: ["servizio", "nome_servizio"],
    project: ["progetto"],
    partner: ["partner", "ente_gestore"],
    space: ["spazio", "nome_spazio", "nome_servizio"],
    territory: ["territorio_coinvolto", "quartiere", "municipio"],
    municipality: ["municipio"]
  };

  const controls = {
    search: document.getElementById("institutionalSearch"),
    direction: document.getElementById("directionFilter"),
    area: document.getElementById("areaFilter"),
    theme: document.getElementById("themeFilter"),
    service: document.getElementById("institutionalServiceFilter"),
    project: document.getElementById("projectFilter"),
    partner: document.getElementById("partnerFilter"),
    space: document.getElementById("spaceFilter"),
    territory: document.getElementById("territoryFilter"),
    municipality: document.getElementById("municipalityFilter")
  };

  const map = L.map("institutionalMap", { preferCanvas: true }).setView([45.4642, 9.19], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  let records = [];
  let visible = [];
  let markers = [];

  function valueFor(record, key) {
    return first(...fields[key].map(name => record[name]));
  }

  function allValuesFor(record, key) {
    const values = fields[key].flatMap(name => splitValues(record[name]));
    return [...new Set(values)];
  }

  function normalizeRecord(raw) {
    const lat = Number(String(raw.latitudine ?? raw.lat ?? "").replace(",", "."));
    const lng = Number(String(raw.longitudine ?? raw.lng ?? raw.lon ?? "").replace(",", "."));
    return { ...raw, _lat: lat, _lng: lng, _valid: Number.isFinite(lat) && Number.isFinite(lng) };
  }

  function distinct(key) {
    return [...new Set(records.flatMap(record => allValuesFor(record, key)))].sort((a,b) => a.localeCompare(b, "it"));
  }

  function fillSelect(select, label, values) {
    select.innerHTML = `<option value="">${esc(label)}</option>` + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
  }

  function populateFilters() {
    fillSelect(controls.direction, "Tutte le direzioni", distinct("direction"));
    fillSelect(controls.area, "Tutte le aree", distinct("area"));
    fillSelect(controls.theme, "Tutte le aree tematiche", distinct("theme"));
    fillSelect(controls.service, "Tutti i servizi", distinct("service"));
    fillSelect(controls.project, "Tutti i progetti", distinct("project"));
    fillSelect(controls.partner, "Tutti i partner", distinct("partner"));
    fillSelect(controls.space, "Tutti gli spazi", distinct("space"));
    fillSelect(controls.territory, "Tutti i territori", distinct("territory"));
    fillSelect(controls.municipality, "Tutti i Municipi", distinct("municipality"));
  }

  function searchText(record) {
    return norm(Object.values(record).filter(value => typeof value === "string" || typeof value === "number").join(" "));
  }

  function matches(record, key, selected) {
    if (!selected) return true;
    return allValuesFor(record, key).some(value => norm(value) === norm(selected));
  }

  function applyFilters() {
    const query = norm(controls.search.value);
    visible = records.filter(record => {
      if (!record._valid) return false;
      return (!query || query.split(/\s+/).every(part => searchText(record).includes(part)))
        && matches(record, "direction", controls.direction.value)
        && matches(record, "area", controls.area.value)
        && matches(record, "theme", controls.theme.value)
        && matches(record, "service", controls.service.value)
        && matches(record, "project", controls.project.value)
        && matches(record, "partner", controls.partner.value)
        && matches(record, "space", controls.space.value)
        && matches(record, "territory", controls.territory.value)
        && matches(record, "municipality", controls.municipality.value);
    });
    render();
  }

  function row(label, value) {
    return clean(value) ? `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>` : "";
  }

  function details(record, compact=false) {
    return `<article class="${compact ? "institutional-popup" : "institutional-card"}">
      <p class="institutional-kicker">${esc(valueFor(record,"theme") || "Area tematica non specificata")}</p>
      <h3>${esc(valueFor(record,"space") || valueFor(record,"service") || "Spazio senza denominazione")}</h3>
      ${row("Direzione", valueFor(record,"direction"))}
      ${row("Area", valueFor(record,"area"))}
      ${row("Servizio", valueFor(record,"service"))}
      ${row("Progetto", valueFor(record,"project"))}
      ${row("Partner", valueFor(record,"partner"))}
      ${row("Territorio coinvolto", valueFor(record,"territory"))}
      ${row("Indirizzo", record.indirizzo)}
      ${row("Destinatari", record.destinatari)}
      ${row("Descrizione", record.descrizione)}
      ${row("Stato verifica", record.stato_verifica)}
    </article>`;
  }

  function renderMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = visible.map(record => {
      const marker = L.circleMarker([record._lat, record._lng], {
        radius: 9, color: "#fff", weight: 2, fillColor: "#173b57", fillOpacity: .92
      }).bindTooltip(valueFor(record,"space") || valueFor(record,"service") || "Spazio")
        .bindPopup(details(record,true), {maxWidth: 430})
        .addTo(map);
      return marker;
    });
  }

  function uniqueCount(key) {
    return new Set(visible.flatMap(record => allValuesFor(record,key)).map(norm).filter(Boolean)).size;
  }

  function updateSummary() {
    document.getElementById("visibleSpaces").textContent = uniqueCount("space");
    document.getElementById("visibleProjects").textContent = uniqueCount("project");
    document.getElementById("visiblePartners").textContent = uniqueCount("partner");
    document.getElementById("visibleDirections").textContent = uniqueCount("direction");
    document.getElementById("institutionalCount").textContent = `${visible.length} ${visible.length === 1 ? "risultato" : "risultati"}`;

    const required = ["direction","area","theme","service","project","partner","space","territory"];
    const total = records.length * required.length;
    const filled = records.reduce((sum, record) => sum + required.filter(key => valueFor(record,key)).length, 0);
    const percent = total ? Math.round(filled / total * 100) : 0;
    document.getElementById("dataQualityText").textContent = `${percent}% dei campi istituzionali risulta compilato nell’archivio attuale.`;
    document.getElementById("dataQualityBar").style.width = `${percent}%`;
  }

  function updateActiveFilters() {
    const labels = [];
    if (controls.search.value) labels.push(`Ricerca: ${controls.search.value}`);
    Object.entries(controls).forEach(([key, el]) => {
      if (key !== "search" && el.value) labels.push(el.options[el.selectedIndex].text);
    });
    document.getElementById("institutionalActiveFilters").textContent = labels.length ? `Filtri attivi: ${labels.join(" · ")}` : "Nessun filtro attivo.";
  }

  function renderList() {
    const list = document.getElementById("institutionalList");
    list.innerHTML = visible.length ? visible.map(record => details(record)).join("") : '<p class="result-empty">Nessun punto corrisponde ai filtri selezionati.</p>';
  }

  function render() {
    renderMarkers();
    renderList();
    updateSummary();
    updateActiveFilters();
  }

  function fitResults() {
    if (!visible.length) return;
    const bounds = L.latLngBounds(visible.map(record => [record._lat, record._lng]));
    map.fitBounds(bounds, {padding:[30,30], maxZoom:15});
  }

  async function init() {
    try {
      const response = await fetch("./data/services.json", {cache:"no-store"});
      if (!response.ok) throw new Error("Archivio non disponibile");
      const data = await response.json();
      records = data.map(normalizeRecord);
      populateFilters();
      applyFilters();
    } catch (error) {
      document.getElementById("institutionalList").innerHTML = `<p class="result-empty">Errore nel caricamento dei dati: ${esc(error.message)}</p>`;
    }
  }

  Object.values(controls).forEach(control => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", applyFilters));
  document.getElementById("resetInstitutionalFilters").addEventListener("click", () => {
    controls.search.value = "";
    Object.entries(controls).forEach(([key, control]) => { if (key !== "search") control.value = ""; });
    applyFilters();
  });
  document.getElementById("fitInstitutionalResults").addEventListener("click", fitResults);
  window.addEventListener("resize", () => map.invalidateSize(false));
  init();
})();