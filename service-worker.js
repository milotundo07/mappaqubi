const CACHE_NAME = "qubi-pwa-v4";

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=4",
  "./app.js?v=4",
  "./manifest.webmanifest",
  "./data/services.json",
  "./data/services.csv",
  "./data/municipi.geojson",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          LOCAL_ASSETS.map(asset => cache.add(asset))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Non intercetta risorse esterne:
  // OpenStreetMap e Leaflet vengono caricati direttamente dal browser.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Le pagine HTML usano prima la rete, poi la cache.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() =>
          caches.match("./index.html")
        )
    );
    return;
  }

  // Gli altri file locali usano la cache, con fallback alla rete.
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, copy));
            }
            return response;
          });
      })
  );
});
