// sw.js — Service Worker DRIFT (hors-ligne + mises à jour atomiques)
//
// Stratégie :
//   • Installation : TOUS les fichiers de PRECACHE_URLS sont téléchargés en
//     contournant le cache HTTP (cache: 'reload') et ajoutés d'un bloc
//     (cache.addAll). Un seul échec fait échouer l'installation : la version
//     précédente reste en service, complète, et le navigateur réessaiera.
//   • Fetch : chaque fichier de l'app est servi depuis le cache de CETTE
//     version — jamais de revalidation fichier par fichier, donc jamais de
//     mélange de deux versions. Les navigations vers l'app (./, index.html,
//     index.html?tab=…) reçoivent l'index.html de la même version. Ce qui
//     n'est pas pré-caché passe par le réseau.
//   • Mise à jour : une nouvelle version s'installe en arrière-plan puis
//     ATTEND ; la page (src/pwa.js) affiche « Nouvelle version disponible —
//     Recharger » et envoie SKIP_WAITING quand le joueur accepte. Seule la
//     toute première installation (aucune version active) prend la main
//     immédiatement, sans rechargement.
//   • Activation : supprime uniquement les caches DRIFT (préfixe « drift- »)
//     des autres versions — l'origine shinjiebi.github.io est partagée avec
//     d'autres projets.
//
// Le bloc « généré » ci-dessous (version, empreinte du contenu, liste des
// fichiers) est écrit par `npm run sw:write` (tools/sw-version.mjs) : ne pas
// le modifier à la main. `npm run sw:check` (inclus dans `npm test`) échoue
// s'il n'est pas à jour. L'empreinte dépend du contenu de tous les fichiers
// pré-cachés et du reste de ce fichier : toute modification publiée crée un
// nouveau cache, même si on oublie de changer la version.

// @generated-start — tools/sw-version.mjs (npm run sw:write)
const APP_VERSION = '0.33.0';
const CONTENT_HASH = '6e4cacf8f681';
const PRECACHE_URLS = [
  './index.html',
  './favicon.ico',
  './fonts/fonts.css',
  './fonts/jetbrains-mono-greek.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './fonts/newsreader-italic-latin-ext.woff2',
  './fonts/newsreader-italic-latin.woff2',
  './fonts/newsreader-latin-ext.woff2',
  './fonts/newsreader-latin.woff2',
  './icons/icon-120.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-16.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-32.png',
  './icons/icon-384.png',
  './icons/icon-48.png',
  './icons/icon-512.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './manifest.json',
  './src/app.js',
  './src/catalog.js',
  './src/chronicles.js',
  './src/constants.js',
  './src/content/dsl.js',
  './src/content/histoires/anneau-trace.js',
  './src/content/histoires/couvee-dormante.js',
  './src/content/histoires/marche-etrange.js',
  './src/content/histoires/pulsar-silencieux.js',
  './src/content/histoires/sanctuaire-vert.js',
  './src/content/histoires/veilleurs-beth.js',
  './src/content/index.js',
  './src/content/scenes/anomalies-signaux.js',
  './src/content/scenes/arrivees-departs.js',
  './src/content/scenes/biomes.js',
  './src/content/scenes/civilisations.js',
  './src/content/scenes/dangers.js',
  './src/content/scenes/epaves-stations.js',
  './src/content/scenes/faune-flore.js',
  './src/content/scenes/haltes.js',
  './src/content/scenes/ruines-cristallines.js',
  './src/content/scenes/ruines-humaines.js',
  './src/content/scenes/ruines-melees.js',
  './src/content/scenes/ruines-organiques.js',
  './src/content/vocabulaire.js',
  './src/data-arcs-factions.js',
  './src/engine/ancien-format.js',
  './src/engine/narration.js',
  './src/notifications.js',
  './src/objectives.js',
  './src/pwa.js',
  './src/state.js',
  './src/ui.js',
  './src/util.js',
  './src/views/base.js',
  './src/views/common.js',
  './src/views/equipage.js',
  './src/views/expeditions.js',
  './src/views/labo.js',
  './src/views/recits.js',
  './styles.css'
];
// @generated-end

const CACHE_PREFIX = 'drift-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}-${CONTENT_HASH}`;
// Caches des versions ≤ 0.32 (« drift-v0.32.0-cache ») : leurs pages
// rechargent d'elles-mêmes sur le message SW_UPDATED.
const LEGACY_CACHE_RE = /^drift-v[\d.]+-cache$/;
const SHELL_URL = new URL('./index.html', self.location).href;

async function hasLegacyCache() {
  const keys = await caches.keys();
  return keys.some((k) => LEGACY_CACHE_RE.test(k));
}

// ------------------------------------------------------------
//   Installation : pré-cache atomique, hors cache HTTP
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    } catch (err) {
      // Rien n'a été ajouté (addAll est atomique) : on retire le cache vide
      // et on fait échouer l'installation. L'ancienne version reste active.
      await caches.delete(CACHE_NAME);
      throw err;
    }
    // Première installation (ou remplacement d'un SW ≤ 0.32 qui ne sait pas
    // afficher le bandeau) : prise de contrôle immédiate. Sinon on attend
    // que le joueur accepte la mise à jour (message SKIP_WAITING).
    if (!self.registration.active || await hasLegacyCache()) {
      await self.skipWaiting();
    }
  })());
});

// ------------------------------------------------------------
//   Activation : ménage des anciens caches DRIFT uniquement
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const replacedLegacy = keys.some((k) => LEGACY_CACHE_RE.test(k));
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
    if (replacedLegacy) {
      // Les pages ≤ 0.32 ne savent que recharger sur SW_UPDATED.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: APP_VERSION }));
    }
  })());
});

// ------------------------------------------------------------
//   Fetch : cache de la version courante, sinon réseau
// ------------------------------------------------------------
function isAppShellNavigation(req, url) {
  if (req.mode !== 'navigate') return false;
  const scopePath = new URL(self.registration.scope).pathname;
  return url.pathname === scopePath || url.pathname === scopePath + 'index.html';
}

async function respond(req, url) {
  const cache = await caches.open(CACHE_NAME);
  const key = isAppShellNavigation(req, url) ? SHELL_URL : req;
  // ignoreVary : une seule réponse par URL et par version.
  const cached = await cache.match(key, { ignoreVary: true });
  if (cached) return cached;
  try {
    return await fetch(req);
  } catch (err) {
    // Hors-ligne et pas en cache : une navigation interne reçoit l'app.
    if (req.mode === 'navigate') {
      const shell = await cache.match(SHELL_URL);
      if (shell) return shell;
    }
    return new Response('Hors ligne', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Seulement ce qui relève de DRIFT (pas les autres projets de l'origine).
  if (!req.url.startsWith(self.registration.scope)) return;
  event.respondWith(respond(req, new URL(req.url)));
});

// ------------------------------------------------------------
//   Messages de la page
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    // Le joueur a accepté la mise à jour (bandeau de src/pwa.js).
    self.skipWaiting();
  } else if (type === 'GET_VERSION') {
    const reply = { type: 'VERSION', version: APP_VERSION, hash: CONTENT_HASH, cache: CACHE_NAME };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

// ------------------------------------------------------------
//   Notifications système (src/notifications.js)
// ------------------------------------------------------------
// Clic sur une notification : on focalise la fenêtre DRIFT existante et on
// lui demande d'afficher l'onglet cible (NOTIF_NAVIGATE) ; sinon on ouvre
// l'app sur cet onglet (?tab=…).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.target;
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Fenêtre de CETTE app (même portée), pas d'un autre projet de l'origine.
    const client = allClients.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      try { await client.focus(); } catch (e) { /* focus refusé : on navigue quand même */ }
      if (target) client.postMessage({ type: 'NOTIF_NAVIGATE', target });
      return;
    }
    const urlSuffix = target ? `?tab=${encodeURIComponent(target)}` : '';
    await self.clients.openWindow('./index.html' + urlSuffix);
  })());
});
