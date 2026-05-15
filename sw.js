// sw.js — Service Worker DRIFT
// Stratégie : cache-first pour les assets statiques, network-first pour le reste.
// La version doit être bumpée à chaque release pour invalider le cache.

const VERSION = 'drift-v0.24.1';
const CACHE_NAME = VERSION + '-cache';

// Liste des assets à mettre en cache au démarrage
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './favicon.ico',
  './src/app.js',
  './src/state.js',
  './src/ui.js',
  './src/catalog.js',
  './src/chronicles.js',
  './src/data-arcs-factions.js',
  './src/constants.js',
  './src/util.js',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Installation : mise en cache initiale
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll est atomique : si un fichier échoue, tout échoue.
      // On utilise add() individuellement pour être tolérant.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Echec cache pour', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyer les vieux caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch : cache-first pour les assets dont on a la version cachée,
// sinon network avec fallback cache si réseau indispo
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // On ne cache que les GET
  if (req.method !== 'GET') return;
  // Ignore les requêtes hors-origine
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Tente de mettre à jour en background mais retourne le cache immédiatement
        fetch(req)
          .then((fresh) => {
            if (fresh && fresh.ok) {
              caches.open(CACHE_NAME).then((c) => c.put(req, fresh.clone()));
            }
          })
          .catch(() => {}); // offline OK
        return cached;
      }
      // Pas en cache → réseau, puis met en cache
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Si réseau indispo et pas en cache, on retourne au moins quelque chose
        // pour les navigations (fallback vers la racine)
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // Sinon on laisse échouer
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Permet une mise à jour propre quand on push une nouvelle version
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
