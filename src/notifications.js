// notifications.js — notifications système (push natives) de DRIFT
//
// Depuis 0.27.3 il n'y a plus de panneau de notifications dans l'interface :
// les événements restent visibles dans le journal de bord (log()) et le
// bandeau d'alertes (collectAlerts()). Ce module se contente d'envoyer une
// notification système quand l'app est en arrière-plan, si le joueur l'a
// activé (bouton du pied de page, voir setupNotifHandlers dans ui.js).
//
// API utilisée par le jeu :
//   • notif.* — un helper par type d'événement (appelés depuis app.js/state.js)
//   • getNotifPermission, requestNotifPermission, isPushEnabled, setPushEnabled (ui.js)
//
// Affichage : via le service worker (registration.showNotification — seul
// moyen sur Android et dans une PWA iOS) ; le clic est géré par
// 'notificationclick' dans sw.js. Si aucun service worker n'est disponible
// (enregistrement échoué, navigateur sans SW), repli sur new Notification().

import { S } from './state.js';

// ============================================================
//   CONFIGURATION
// ============================================================

// Anti-rafale : après une notification, celles de même importance ou moins
// importantes sont ignorées pendant ce délai. Une notification PLUS
// importante (ou critique) passe toujours.
const PUSH_MIN_INTERVAL_MS = 5000;
// Délai maximal d'attente d'un service worker actif avant le repli.
const SW_READY_TIMEOUT_MS = 3000;

let lastPush = { at: 0, prio: 0 };

const NOTIF_TYPES = {
  economy:    { label: 'Économie' },
  crew:       { label: 'Équipage' },
  expedition: { label: 'Expédition' },
  research:   { label: 'Recherche' },
  event:      { label: 'Événement' },
  chronicle:  { label: 'Chronique' }
};

const NOTIF_SEVERITIES = {
  info:     { prio: 1 },
  success:  { prio: 2 },
  warn:     { prio: 3 },
  critical: { prio: 4 }
};

// ============================================================
//   PERMISSION ET RÉGLAGE
// ============================================================

export function getNotifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch (e) {
    console.warn('[NOTIFS] Permission refusée :', e);
    return 'denied';
  }
}

export function setPushEnabled(enabled) {
  if (!S) return;
  if (!S.flags) S.flags = {};
  S.flags.pushNotifications = !!enabled;
}

export function isPushEnabled() {
  return S?.flags?.pushNotifications === true;
}

// ============================================================
//   ENVOI
// ============================================================

function pushNotif(opts) {
  if (!opts || !opts.title) return;
  tryPushSystemNotification({
    type: opts.type || 'event',
    severity: opts.severity || 'info',
    title: opts.title,
    body: opts.body || '',
    action: opts.action || null,
    timestamp: Date.now()
  });
}

function tryPushSystemNotification(notif) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!isPushEnabled()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  if (notif.severity === 'info') return;

  const prio = NOTIF_SEVERITIES[notif.severity]?.prio || 1;
  const critical = prio >= NOTIF_SEVERITIES.critical.prio;
  const now = Date.now();
  if (!critical && now - lastPush.at < PUSH_MIN_INTERVAL_MS && prio <= lastPush.prio) return;
  lastPush = { at: now, prio };

  const typeLabel = NOTIF_TYPES[notif.type]?.label || '';
  const title = `DRIFT — ${typeLabel}`;
  const target = notif.action?.target || null;
  const opts = {
    body: notif.title + (notif.body ? '\n' + notif.body : ''),
    icon: './icons/icon-192.png',
    badge: './icons/icon-96.png',
    // Même tag = remplace la précédente du même type. Une critique (mort,
    // incident…) a son propre tag pour ne jamais être écrasée.
    tag: critical ? `${notif.type}-critical-${now}` : notif.type,
    timestamp: notif.timestamp,
    silent: notif.severity === 'success',
    requireInteraction: critical,
    data: { target }
  };
  showSystemNotification(title, opts, target).catch((e) => console.warn('[NOTIFS] Erreur push :', e));
}

// Registration du service worker si un SW actif est (ou devient vite) disponible.
async function activeRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    if (reg.active) return reg;
    // Installation en cours : on attend 'ready', mais pas indéfiniment
    // ('ready' ne se résout jamais si l'installation échoue).
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS))
    ]);
  } catch (e) {
    return null;
  }
}

async function showSystemNotification(title, opts, target) {
  const reg = await activeRegistration();
  if (reg) {
    try {
      await reg.showNotification(title, opts);
      return;
    } catch (e) {
      console.warn('[NOTIFS] showNotification a échoué, repli :', e);
    }
  }
  // Repli sans service worker. (Lève une TypeError sur Android Chrome, où
  // seul le SW peut notifier : rien de plus à faire dans ce cas.)
  const n = new Notification(title, opts);
  n.onclick = () => {
    n.close();
    try { window.focus(); } catch (e) { /* ignoré */ }
    if (target) goToTab(target);
  };
}

// Affiche l'onglet demandé (nom comparé aux onglets existants, jamais
// injecté dans un sélecteur).
function goToTab(name) {
  const btn = Array.from(document.querySelectorAll('nav.tabs button[data-tab]'))
    .find((b) => b.dataset.tab === name);
  if (btn) btn.click();
}

// ============================================================
//   Helpers par type d'événement (appelés depuis app.js et state.js)
// ============================================================

export const notif = {
  buildDone:     (modNom, level)  => pushNotif({ type:'economy', severity:'info',    title:`${modNom} niv ${level} terminé`, action:{ label:'Voir', target:'modules' } }),
  capReached:    (resLabel)       => pushNotif({ type:'economy', severity:'warn',    title:`Stocks saturés : ${resLabel}` }),
  candidate:     (nom, origine)   => pushNotif({ type:'crew',    severity:'success', title:'Nouveau candidat', body:`${nom} (${origine}) propose ses services.`, action:{ label:'Voir', target:'crew' } }),
  recruited:     (nom)            => pushNotif({ type:'crew',    severity:'info',    title:`${nom} rejoint la colonie`, action:{ label:'Voir', target:'crew' } }),
  death:         (nom, cause)     => pushNotif({ type:'crew',    severity:'critical',title:`${nom} est mort`, body: cause || '', action:{ label:'Voir', target:'crew' } }),
  injury:        (nom, sev)       => pushNotif({ type:'crew',    severity: sev==='grave'||sev==='critique'?'critical':'warn', title:`${nom} : blessure ${sev}`, action:{ label:'Infirmerie', target:'crew' } }),
  trainingDone:  (nom, skill)     => pushNotif({ type:'crew',    severity:'success', title:`Formation terminée`, body:`${nom} a progressé en ${skill}.` }),
  treatmentDone: (nom)            => pushNotif({ type:'crew',    severity:'success', title:`${nom} est rétabli` }),
  sequel:        (nom, sequelNom) => pushNotif({ type:'crew',    severity:'warn',    title:`${nom} : séquelle permanente`, body: sequelNom }),
  expReturn:     (sysName, summary) => pushNotif({ type:'expedition', severity:'info', title:`Retour de ${sysName}`, body: summary || '', action:{ label:'Résumé', target:'galaxy' } }),
  researchDone:  (techNom)        => pushNotif({ type:'research', severity:'success', title:`Recherche terminée`, body:techNom }),
  blueprint:     (nom)            => pushNotif({ type:'research', severity:'success', title:`Schéma découvert`, body:nom }),
  incident:      (titre)          => pushNotif({ type:'event', severity:'critical', title:'Incident en attente', body: titre, action:{ label:'Décider', target:'overview' } }),
  colonyEvent:   (titre)          => pushNotif({ type:'event', severity:'warn',     title:'Événement de colonie', body: titre }),
  arcProgress:   (arcNom, etape)  => pushNotif({ type:'event', severity:'success', title:`Arc avance : ${arcNom}`, body: etape }),
  reputationSeuil: (factionNom, sens) => pushNotif({ type:'event', severity: sens==='hostile'?'critical':sens==='ami'?'success':'warn', title:`Réputation : ${factionNom}`, body: `Nouveau statut : ${sens}.` }),
  chronicleStart:(nom, planete)   => pushNotif({ type:'chronicle', severity:'success', title:`Chronique : ${nom}`, body:`Se révèle sur ${planete}.` }),
  episodeDone:   (chronNom, ep)   => pushNotif({ type:'chronicle', severity:'success', title:`Épisode terminé`, body:`${chronNom} — ${ep}.` }),
  chronicleDone: (chronNom)       => pushNotif({ type:'chronicle', severity:'success', title:`Chronique achevée`, body:chronNom })
};
