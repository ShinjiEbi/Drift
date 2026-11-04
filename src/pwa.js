// pwa.js — intégration PWA : service worker, bandeau de mise à jour,
// navigation depuis une notification (?tab=…), bouton d'installation.
//
// Chargé par index.html dans son propre <script type="module">, SANS import
// statique du jeu : si une version du jeu est cassée (module introuvable,
// erreur d'import…), ce fichier fonctionne quand même et permet de recevoir
// la version corrigée via le bandeau « Nouvelle version disponible ».
//
// Les modules sont différés : ce code s'exécute une fois le HTML analysé,
// juste avant DOMContentLoaded — le DOM est donc disponible.

const UPDATE_CHECK_EVERY_MS = 30 * 60 * 1000; // vérif. de mise à jour au retour au premier plan
let registration = null;
let lastUpdateCheck = Date.now();
let updateAccepted = false;   // le joueur a cliqué « Recharger »
let reloading = false;

// ------------------------------------------------------------
//   Navigation vers un onglet (?tab=…, clic sur notification)
// ------------------------------------------------------------
// Le nom d'onglet vient de l'URL ou d'un message : on ne l'insère jamais dans
// un sélecteur CSS, on le compare aux onglets existants (liste blanche).
function goToTab(name) {
  if (typeof name !== 'string') return false;
  const btn = Array.from(document.querySelectorAll('nav.tabs button[data-tab]'))
    .find((b) => b.dataset.tab === name);
  if (!btn) return false;
  btn.click();
  return true;
}

function onDomReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

onDomReady(() => {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab === null) return;
  // Laisse le jeu démarrer (boot différé) avant de changer d'onglet.
  setTimeout(() => {
    goToTab(tab);
    // Nettoie l'URL pour ne pas garder le paramètre
    const url = new URL(window.location.href);
    url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, 500);
});

// ------------------------------------------------------------
//   Bandeau « Nouvelle version disponible »
// ------------------------------------------------------------
const BANNER_ID = 'pwa-update';
const BANNER_CSS = `
#${BANNER_ID} {
  position: fixed; z-index: 95;
  left: 50%; transform: translateX(-50%);
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  width: max-content; max-width: calc(100vw - 24px);
  display: flex; align-items: center; gap: 12px;
  padding: 10px 10px 10px 16px;
  background: var(--surface-2, #161c22); color: var(--text, #d8d2c4);
  border: 1px solid var(--amber, #d4a056);
  box-shadow: 0 4px 18px rgba(0,0,0,0.5);
  font-family: var(--mono, monospace); font-size: 12px; letter-spacing: 0.04em;
}
/* Mobile : au-dessus de la barre d'onglets fixe (70 px + zone de sécurité) */
@media (max-width: 640px) {
  #${BANNER_ID} { bottom: calc(70px + 10px + env(safe-area-inset-bottom, 0px)); }
}
#${BANNER_ID} button {
  font: inherit; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  background: var(--amber, #d4a056); color: var(--bg-deep, #06080a);
  border: none; padding: 8px 12px; min-height: 36px;
}
#${BANNER_ID} button.pwa-later {
  background: transparent; color: var(--text-dim, #9a9388); padding: 8px; min-width: 36px;
}
#${BANNER_ID} button:disabled { opacity: 0.6; cursor: default; }
`;

function showUpdateBanner(text = 'Nouvelle version disponible') {
  let bar = document.getElementById(BANNER_ID);
  if (bar) return bar;
  if (!document.getElementById(BANNER_ID + '-style')) {
    const style = document.createElement('style');
    style.id = BANNER_ID + '-style';
    style.textContent = BANNER_CSS;
    document.head.appendChild(style);
  }
  bar = document.createElement('div');
  bar.id = BANNER_ID;
  bar.setAttribute('role', 'status');
  const label = document.createElement('span');
  label.textContent = text;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'pwa-reload';
  reload.textContent = 'Recharger';
  reload.addEventListener('click', () => {
    reload.disabled = true;
    reload.textContent = 'Mise à jour…';
    applyUpdate();
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'pwa-later';
  later.setAttribute('aria-label', 'Plus tard');
  later.title = 'Plus tard (la mise à jour se fera au prochain lancement)';
  later.textContent = '✕';
  later.addEventListener('click', () => bar.remove());
  bar.append(label, reload, later);
  document.body.appendChild(bar);
  return bar;
}

// Sauvegarde la partie en cours (si le jeu est démarré).
async function saveGame() {
  try {
    const st = await import('./state.js');
    // Ne pas toucher à lastTickRealMs : avec l'accumulateur de temps, il marque
    // le temps déjà simulé ; le temps restant sera rattrapé au redémarrage.
    if (st.S && st.S.meta) st.save();
  } catch (e) {
    console.warn('[PWA] Sauvegarde avant mise à jour impossible :', e);
  }
}

function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

async function applyUpdate() {
  updateAccepted = true;
  await saveGame();
  const waiting = registration && registration.waiting;
  if (waiting) {
    // Le nouveau SW prend la main → 'controllerchange' → rechargement.
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Filet de sécurité si 'controllerchange' n'arrive pas.
    setTimeout(reloadOnce, 4000);
  } else {
    // La nouvelle version contrôle déjà la page : il suffit de recharger.
    reloadOnce();
  }
}

// ------------------------------------------------------------
//   Service worker
// ------------------------------------------------------------
function watchInstalling(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // 'installed' + une version déjà en service = mise à jour en attente.
    // (À la première installation il n'y a pas de contrôleur : rien à faire.)
    if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
  });
}

function checkForUpdate() {
  if (!registration) return;
  lastUpdateCheck = Date.now();
  registration.update().catch(() => { /* hors-ligne : on réessaiera */ });
}

async function registerServiceWorker() {
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  } catch (err) {
    console.warn('[PWA] Échec d\'enregistrement du service worker :', err);
    return;
  }
  if (!registration) return; // SW bloqués (navigateur de test, mode privé…)
  // Une version téléchargée lors d'une visite précédente attend déjà.
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner();
  watchInstalling(registration.installing);
  registration.addEventListener('updatefound', () => watchInstalling(registration.installing));

  // Une PWA iOS peut rester ouverte des jours : on vérifie les mises à jour
  // au retour au premier plan (au plus toutes les 30 min).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > UPDATE_CHECK_EVERY_MS) {
      checkForUpdate();
    }
  });
}

if ('serviceWorker' in navigator) {
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const previous = controller;
    controller = navigator.serviceWorker.controller;
    // Première installation : le SW prend la main sur une page déjà chargée
    // depuis le réseau → aucun rechargement.
    if (!previous) return;
    if (updateAccepted) reloadOnce();
    // Mise à jour activée ailleurs (autre onglet) : la page tourne encore
    // sur l'ancien code, on propose de recharger.
    else showUpdateBanner('Nouvelle version installée');
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data || {};
    // Clic sur une notification système alors que l'app est ouverte
    // (voir 'notificationclick' dans sw.js).
    if (data.type === 'NOTIF_NAVIGATE') {
      // Petit délai pour que l'UI soit prête
      setTimeout(() => goToTab(data.target), 300);
    }
  });

  // Enregistrement après le chargement complet pour ne pas concurrencer
  // le démarrage du jeu.
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}

// ------------------------------------------------------------
//   Bouton d'installation (Android/Chrome : beforeinstallprompt)
// ------------------------------------------------------------
let deferredPrompt = null;
const installBtn = () => document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = installBtn();
  if (btn) btn.hidden = false;
});

onDomReady(() => {
  const btn = installBtn();
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    console.log('[PWA] Résultat installation :', result.outcome);
    deferredPrompt = null;
    btn.hidden = true;
  });
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] DRIFT a été installé.');
  const btn = installBtn();
  if (btn) btn.hidden = true;
});
