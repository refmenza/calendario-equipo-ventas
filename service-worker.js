// service-worker.js
const VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// Archivos "estáticos" que queremos cachear en instalación
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',       // por si lo usás en el header
  './icon-192.png',
  './icon-512.png'
];

// URL del CSV (ajústala si cambia)
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQh4OOFKU2Z9YU3nTYLeSngPXFAPqADgO_HeT1JVYlLwmPpCnV0aZE-XAlVTEqytac4rOkjX34hD5Rw/pub?output=csv';

// --- Install: precache de assets básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- Estrategias de fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Navegación (HTML): App Shell -> cache first con fallback a red
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached =>
        cached || fetch(req).then(res => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put('./index.html', resClone));
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
    return;
  }

  const url = new URL(req.url);

  // 2) CSV remoto: network-first con fallback a caché (última conocida)
  if (req.url === CSV_URL) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) Mis mismos orígenes (CSS/JS/img): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 4) Resto (CDNs, etc.) -> try network, fallback cache
  event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // último recurso: algo local
    return caches.match('./index.html');
  }
}
