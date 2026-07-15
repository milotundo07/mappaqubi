const CACHE_NAME = "qubi-pwa-v7";
const LOCAL_ASSETS = [
  "./", "./index.html", "./gestione.html", "./privacy.html",
  "./styles.css?v=6", "./admin.css?v=7", "./data-store.js?v=7",
  "./app.js?v=7", "./gestione.js?v=7", "./manifest.webmanifest",
  "./data/services.json", "./data/services.csv", "./data/municipi.geojson",
  "./icons/icon-192.png", "./icons/icon-512.png"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.allSettled(LOCAL_ASSETS.map(asset=>cache.add(asset)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin){event.respondWith(fetch(request));return}if(request.mode==="navigate"){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}return response}).catch(async()=>await caches.match(request)||url.pathname.endsWith("gestione.html")&&await caches.match("./gestione.html")||url.pathname.endsWith("privacy.html")&&await caches.match("./privacy.html")||await caches.match("./index.html")||await caches.match("./")));return}event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}return response}).catch(()=>caches.match(request).then(cached=>cached||Response.error()))) });
