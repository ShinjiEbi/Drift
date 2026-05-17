// notifications.js — Système de notifications (0.26)
// Architecture en 3 couches :
//   1. Stockage : S.notifications = [{ id, timestamp, gameMin, type, severity, ... }]
//   2. UI inline : cloche dans header + panneau coulissant
//   3. Push natives : Notification API (PWA en arrière-plan)

import { S, setS } from './state.js';

// ============================================================
//   CONSTANTES
// ============================================================

export const NOTIF_TYPES = {
  economy:    { label: 'Économie',     icon: '⚙' },
  crew:       { label: 'Équipage',     icon: '👥' },
  expedition: { label: 'Expédition',   icon: '🛰' },
  research:   { label: 'Recherche',    icon: '🔬' },
  event:      { label: 'Événement',    icon: '⚠' },
  chronicle:  { label: 'Chronique',    icon: '📜' }
};

export const NOTIF_SEVERITIES = {
  info:     { label: 'Info',     color: 'text-mute',   prio: 1 },
  success:  { label: 'Succès',   color: 'moss',         prio: 2 },
  warn:     { label: 'Attention',color: 'amber',        prio: 3 },
  critical: { label: 'Critique', color: 'rust',         prio: 4 }
};

// Limites
const MAX_NOTIFS = 100;                 // plafond du panier
const AUTO_PURGE_DAYS = 7;              // jours-jeu après lesquels les notifs info lues sont effacées
const PUSH_MIN_INTERVAL_MS = 5000;      // anti-spam push : pas plus d'une toutes les 5 secondes

let lastPushTimestamp = 0;

// ============================================================
//   API : push d'une notification
// ============================================================

/**
 * Ajoute une notification au state.
 * @param {Object} opts
 *   - type: 'economy'|'crew'|'expedition'|'research'|'event'|'chronicle'
 *   - severity: 'info'|'success'|'warn'|'critical'  (défaut 'info')
 *   - title: string (titre court)
 *   - body: string (description plus longue, optionnel)
 *   - action: { label, target } (optionnel — target peut être un nom d'onglet ou un objet { tab, focus })
 *   - skipPush: boolean — si true, n'envoie pas de notification système (juste inline)
 */
export function pushNotif(opts) {
  if (!opts || !opts.title) return null;
  if (!S) return null;
  // Initialisation paresseuse
  if (!Array.isArray(S.notifications)) S.notifications = [];

  const notif = {
    id: 'notif_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 9999).toString(36),
    timestamp: Date.now(),
    gameMin: S.meta?.gameMin || 0,
    type: opts.type || 'event',
    severity: opts.severity || 'info',
    title: opts.title,
    body: opts.body || '',
    action: opts.action || null,
    read: false,
    dismissed: false
  };

  S.notifications.unshift(notif);  // plus récente en tête

  // Plafond : on coupe à MAX_NOTIFS
  if (S.notifications.length > MAX_NOTIFS) {
    S.notifications.length = MAX_NOTIFS;
  }

  // Envoi push système si applicable (et pas trop souvent)
  if (!opts.skipPush) {
    tryPushSystemNotification(notif);
  }

  // Hook UI : repeindre la cloche / le panneau si visible
  try {
    if (typeof window !== 'undefined' && window.__notifsRefresh) {
      window.__notifsRefresh();
    }
  } catch (e) {}

  // 0.26.1 : son discret pour les notifs critiques (Web Audio, pas de fichier)
  if (notif.severity === 'critical' || notif.severity === 'warn') {
    try { playNotifSound(notif.severity); } catch (e) {}
  }

  return notif;
}

// Audio context partagé (initialisé au premier son pour respecter les politiques navigateur)
let _audioCtx = null;
function playNotifSound(severity) {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    // Fallback : webkitAudioContext sur Safari, ou rien
    if (typeof window === 'undefined') return;
    if (typeof window.webkitAudioContext === 'undefined') return;
  }
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      _audioCtx = new Ctx();
    }
    // Si l'utilisateur n'a pas encore interagi, le contexte sera 'suspended' et le son ne jouera pas
    // C'est OK : on tente quand même au cas où.
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    
    // Son sci-fi : 2 oscillateurs courts avec enveloppe rapide
    if (severity === 'critical') {
      // Critique : 2 bips graves, descendants
      playBip(ctx, 660, 0.15, now + 0.00, 0.10);
      playBip(ctx, 440, 0.20, now + 0.18, 0.10);
    } else {
      // Warn : 1 bip aigu doux
      playBip(ctx, 880, 0.18, now + 0.00, 0.07);
    }
  } catch (e) {
    // Permission refusée ou autre — silencieux
  }
}

function playBip(ctx, freq, duration, startTime, gain) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  // Enveloppe : attaque rapide, decay exponentiel
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Marque une notification comme lue.
 */
export function markNotifRead(id) {
  if (!S?.notifications) return;
  const n = S.notifications.find(x => x.id === id);
  if (n) n.read = true;
}

/**
 * Marque toutes les notifications comme lues.
 */
export function markAllNotifsRead() {
  if (!S?.notifications) return;
  for (const n of S.notifications) n.read = true;
}

/**
 * Efface (dismiss) une notification.
 */
export function dismissNotif(id) {
  if (!S?.notifications) return;
  const idx = S.notifications.findIndex(x => x.id === id);
  if (idx >= 0) S.notifications.splice(idx, 1);
}

/**
 * Efface toutes les notifications sauf les critiques non lues.
 */
export function dismissAllNotifs() {
  if (!S?.notifications) return;
  S.notifications = S.notifications.filter(n => n.severity === 'critical' && !n.read);
}

/**
 * Compte les notifications non lues, optionnellement par type.
 */
export function unreadNotifsCount(type = null) {
  if (!S?.notifications) return 0;
  return S.notifications.filter(n => !n.read && (!type || n.type === type)).length;
}

/**
 * Renvoie les notifications, optionnellement filtrées par type.
 */
export function getNotifs(filter = null) {
  if (!S?.notifications) return [];
  if (!filter) return S.notifications.slice();
  return S.notifications.filter(n => n.type === filter);
}

/**
 * Purge auto : retire les notifs info lues de plus de N jours-jeu.
 * À appeler depuis le tick.
 */
export function purgeOldNotifs() {
  if (!S?.notifications) return;
  const now = S.meta?.gameMin || 0;
  const cutoff = now - AUTO_PURGE_DAYS * 24 * 60;
  S.notifications = S.notifications.filter(n => {
    // Garde toujours les critiques (lues ou non)
    if (n.severity === 'critical') return true;
    // Garde les non-lues
    if (!n.read) return true;
    // Retire les info/success lues anciennes
    return n.gameMin > cutoff;
  });
}

// ============================================================
//   PUSH NOTIFICATIONS NATIVES (0.26.1)
// ============================================================

/**
 * État de la permission de notification.
 * @returns 'default' | 'granted' | 'denied' | 'unsupported'
 */
export function getNotifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * Demande la permission pour les notifications système.
 * @returns Promise<'granted'|'denied'|'default'>
 */
export async function requestNotifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (e) {
    console.warn('[NOTIFS] Permission denied :', e);
    return 'denied';
  }
}

/**
 * Active ou désactive les notifs push pour cette session.
 */
export function setPushEnabled(enabled) {
  if (!S.flags) S.flags = {};
  S.flags.pushNotifications = !!enabled;
}

export function isPushEnabled() {
  return S?.flags?.pushNotifications === true;
}

/**
 * Envoie une notification système si :
 *   - Permission accordée
 *   - Push activé dans les paramètres
 *   - PWA pas au premier plan (sinon ça spamme l'utilisateur)
 *   - Sévérité au moins 'success' (les 'info' ne génèrent pas de push)
 *   - Pas trop tôt depuis la dernière (anti-spam)
 */
function tryPushSystemNotification(notif) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!isPushEnabled()) return;
  // Ne pas envoyer si l'app est visible (l'utilisateur voit déjà la notif inline)
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  // Pas les 'info' (trop bruyant)
  if (notif.severity === 'info') return;
  // Anti-spam
  const now = Date.now();
  if (now - lastPushTimestamp < PUSH_MIN_INTERVAL_MS) return;
  lastPushTimestamp = now;

  try {
    const icon = './icons/icon-192.png';
    const badge = './icons/icon-96.png';
    const typeLabel = NOTIF_TYPES[notif.type]?.label || '';
    const sev = NOTIF_SEVERITIES[notif.severity];
    const opts = {
      body: notif.body || '',
      icon,
      badge,
      tag: notif.type,            // regroupement par type (la dernière remplace la précédente du même type)
      timestamp: notif.timestamp,
      silent: notif.severity === 'success',  // pas de son pour les success, son discret pour warn/critical
      requireInteraction: notif.severity === 'critical',  // critique reste affichée jusqu'à interaction
    };
    // Préférence : utiliser le SW pour avoir le badge custom et la persistance
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(`DRIFT — ${typeLabel}`, {
          ...opts,
          body: notif.title + (notif.body ? '\n' + notif.body : ''),
          data: { notifId: notif.id, target: notif.action?.target || null }
        });
      });
    } else {
      // Fallback : Notification directe
      new Notification(`DRIFT — ${typeLabel}`, {
        ...opts,
        body: notif.title + (notif.body ? '\n' + notif.body : '')
      });
    }
  } catch (e) {
    console.warn('[NOTIFS] Erreur push :', e);
  }
}

// ============================================================
//   Helpers haut-niveau : raccourcis par type
// ============================================================

export const notif = {
  // Économie
  buildDone:     (modNom, level)  => pushNotif({ type:'economy', severity:'info',    title:`${modNom} niv ${level} terminé`, action:{ label:'Voir', target:'modules' } }),
  capReached:    (resLabel)       => pushNotif({ type:'economy', severity:'warn',    title:`Stocks saturés : ${resLabel}`, body:'Tu perds de la production. Augmente la capacité ou consomme.' }),
  // Équipage
  candidate:     (nom, origine)   => pushNotif({ type:'crew',    severity:'success', title:'Nouveau candidat', body:`${nom} (${origine}) propose ses services.`, action:{ label:'Voir', target:'crew' } }),
  recruited:     (nom)            => pushNotif({ type:'crew',    severity:'info',    title:`${nom} rejoint la colonie`, action:{ label:'Voir', target:'crew' } }),
  death:         (nom, cause)     => pushNotif({ type:'crew',    severity:'critical',title:`${nom} est mort`, body: cause || '', action:{ label:'Voir', target:'crew' } }),
  injury:        (nom, sev)       => pushNotif({ type:'crew',    severity: sev==='grave'||sev==='critique'?'critical':'warn', title:`${nom} : blessure ${sev}`, action:{ label:'Infirmerie', target:'crew' } }),
  trainingDone:  (nom, skill)     => pushNotif({ type:'crew',    severity:'success', title:`Formation terminée`, body:`${nom} a progressé en ${skill}.`, action:{ label:'Voir', target:'crew' } }),
  treatmentDone: (nom)            => pushNotif({ type:'crew',    severity:'success', title:`${nom} est rétabli`, action:{ label:'Voir', target:'crew' } }),
  sequel:        (nom, sequelNom) => pushNotif({ type:'crew',    severity:'warn',    title:`${nom} : séquelle permanente`, body: sequelNom, action:{ label:'Voir', target:'crew' } }),
  capReached:    (resLabel)       => pushNotif({ type:'economy', severity:'warn',    title:`Stocks saturés : ${resLabel}`, body:'Tu perds de la production. Augmente la capacité ou consomme.' }),
  reputationSeuil: (factionNom, sens) => pushNotif({ type:'event', severity: sens==='hostile'?'critical':sens==='ami'?'success':'warn', title:`Réputation : ${factionNom}`, body: `Nouveau statut diplomatique : ${sens}.`, action:{ label:'Diplomatie', target:'arcs' } }),
  colonyEventDone: (titre)        => pushNotif({ type:'event', severity:'success', title:`${titre}`, body:'Événement de colonie résolu.' }),
  // Expédition
  expReturn:     (sysName, summary) => pushNotif({ type:'expedition', severity:'info', title:`Retour de ${sysName}`, body: summary || '', action:{ label:'Résumé', target:'galaxy' } }),
  // Recherche
  researchDone:  (techNom)        => pushNotif({ type:'research', severity:'success', title:`Recherche terminée`, body:techNom, action:{ label:'Tech tree', target:'crew' } }),
  blueprint:     (nom)            => pushNotif({ type:'research', severity:'success', title:`Schéma découvert`, body:nom, action:{ label:'Inventaire', target:'stocks' } }),
  // Événement
  incident:      (titre)          => pushNotif({ type:'event', severity:'critical', title:'Incident en attente', body: titre, action:{ label:'Décider', target:'overview' } }),
  colonyEvent:   (titre)          => pushNotif({ type:'event', severity:'warn',     title:'Événement de colonie', body: titre, action:{ label:'Voir', target:'overview' } }),
  arcProgress:   (arcNom, etape)  => pushNotif({ type:'event', severity:'success', title:`Arc avance : ${arcNom}`, body: etape, action:{ label:'Voir', target:'arcs' } }),
  // Chronique
  chronicleStart:(nom, planete)   => pushNotif({ type:'chronicle', severity:'success', title:`Chronique : ${nom}`, body:`Se révèle sur ${planete}.`, action:{ label:'Voir planète', target:'galaxy' } }),
  episodeDone:   (chronNom, ep)   => pushNotif({ type:'chronicle', severity:'success', title:`Épisode terminé`, body:`${chronNom} — ${ep}. Reviens pour la suite.`, action:{ label:'Galaxie', target:'galaxy' } }),
  chronicleDone: (chronNom)       => pushNotif({ type:'chronicle', severity:'success', title:`Chronique achevée`, body:chronNom, action:{ label:'Journal', target:'journal' } })
};
