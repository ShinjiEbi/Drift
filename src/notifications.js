// notifications.js — Système de notifications PUSH UNIQUEMENT (0.27.3)
//
// L'ancienne version (0.26) gérait aussi un panneau inline. Retiré dans 0.27.3
// car redondant avec le journal de bord. Cette version conserve l'API publique
// (les helpers notif.*) pour ne pas casser les 18 hooks placés dans le code,
// mais ne fait plus que :
//   1. Envoyer une push native quand l'app est en arrière-plan (et que l'utilisateur l'a activé)
//   2. Rien d'autre — pas de stockage, pas de panneau, pas de badge
//
// Les événements importants restent visibles dans le journal de bord
// (via log()) et le bandeau d'alertes (via collectAlerts()).

import { S } from './state.js';

// ============================================================
//   CONFIGURATION
// ============================================================

const PUSH_MIN_INTERVAL_MS = 5000;
let lastPushTimestamp = 0;

export const NOTIF_TYPES = {
  economy:    { label: 'Économie',     icon: '⚙' },
  crew:       { label: 'Équipage',     icon: '👥' },
  expedition: { label: 'Expédition',   icon: '🛰' },
  research:   { label: 'Recherche',    icon: '🔬' },
  event:      { label: 'Événement',    icon: '⚠' },
  chronicle:  { label: 'Chronique',    icon: '📜' }
};

export const NOTIF_SEVERITIES = {
  info:     { label: 'Info',     prio: 1 },
  success:  { label: 'Succès',   prio: 2 },
  warn:     { label: 'Attention',prio: 3 },
  critical: { label: 'Critique', prio: 4 }
};

// ============================================================
//   API PUBLIQUE
// ============================================================

export function pushNotif(opts) {
  if (!opts || !opts.title) return null;
  if (!opts.skipPush) {
    tryPushSystemNotification({
      type: opts.type || 'event',
      severity: opts.severity || 'info',
      title: opts.title,
      body: opts.body || '',
      action: opts.action || null,
      timestamp: Date.now()
    });
  }
  return null;
}

// ============================================================
//   PUSH NATIVES
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

function tryPushSystemNotification(notif) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!isPushEnabled()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  if (notif.severity === 'info') return;
  const now = Date.now();
  if (now - lastPushTimestamp < PUSH_MIN_INTERVAL_MS) return;
  lastPushTimestamp = now;

  try {
    const typeLabel = NOTIF_TYPES[notif.type]?.label || '';
    const opts = {
      body: notif.title + (notif.body ? '\n' + notif.body : ''),
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: notif.type,
      timestamp: notif.timestamp,
      silent: notif.severity === 'success',
      requireInteraction: notif.severity === 'critical',
      data: { target: notif.action?.target || null }
    };
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(`DRIFT — ${typeLabel}`, opts);
      });
    } else {
      new Notification(`DRIFT — ${typeLabel}`, opts);
    }
  } catch (e) {
    console.warn('[NOTIFS] Erreur push :', e);
  }
}

// ============================================================
//   Helpers haut-niveau (compatibilité avec les 18 hooks existants)
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

// ============================================================
//   No-ops conservés pour compatibilité d'imports
// ============================================================

export function markNotifRead() {}
export function markAllNotifsRead() {}
export function dismissNotif() {}
export function dismissAllNotifs() {}
export function unreadNotifsCount() { return 0; }
export function getNotifs() { return []; }
export function purgeOldNotifs() {}
