// DRIFT — script principal
// Extrait de drift.html lors de la phase de modularisation

import { MODULES, MODULE_JOBS, VESSELS, ITEMS, ITEM_TYPES, ITEM_ORIGINS, ITEM_NAME_TO_ID, BLUEPRINTS, TECH_TREE, TECH_BRANCHES, FABRICATIONS, SCENES, TREATMENTS, BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS, TRAITS, ENEMY_TYPES } from './catalog.js';
import { VERSION, SAVE_KEY, TICK_MS, MIN_PER_TICK, AUTOSAVE_EVERY, BUILD_TIME_MULT, PROD_MULT, OFFLINE_MAX_HOURS, OFFLINE_INCIDENT_RATE, RESOURCES, RES_LABELS, START_RESOURCES, JOB_BASE_FRACTION, JOB_BIOMASSE_MULT, SKILL_LIST, SKILL_LABELS, STAT_LABELS, YEAR_IN_GAME_MIN, REL_LOVE, REL_FRIEND, REL_RIVAL, REL_RANCUNE } from './constants.js';
import { ARCS, FACTION_TYPES } from './data-arcs-factions.js';
import { CHRONICLES, CHRONICLE_SCENES } from './chronicles.js';
import { fmt, fmtMin, hashSeed, mulberry32, rngFor, rPick, rWeighted, rInt, $, $$, esc, uid } from './util.js';
import { S, setS, freshState, computeRates, capOf, buildTime, crewCap, canBuild, startBuild, finishBuild, GRAVITES, VIES, BODY_TYPES, SYS_PREFIXES, GREEK, CONSTELL, genSystemName, POETIC_NAMES, genBodyName, genBody, genSystem, genGalaxy, describeBody, bodyThreatLevel, bodyRewardLevel, FIRST_NAMES, LAST_NAMES, ORIGINS, rollPick, rollWeighted, gaussInt, genName, genStats, genSkills, genTraits, genCandidate, crewUsage, aliveCrew, tickCount, tickOnce, tick, acceptCandidate, refuseCandidate, traitDesc, traitNom, traitKind, trainingTargetLevel, findInstructor, formationBonuses, save, load, exportSave, importSave, resetGame } from './state.js';
import { render, toast, log, seedJournal, showLaunchModal, showTrainingModal, showModal, setupNotifHandlers } from './ui.js';
import { notif } from './notifications.js';
'use strict';

// ============================================================
// 1. CONST — tables, équilibrage
// ============================================================



          // 1s réelle
        // 1 minute jeu par tick
     // toutes les 10 ticks → 10s







;
;

;

;

/* Définition des modules.
   - prod        : production par minute jeu (par niveau)
   - upkeep      : conso par minute jeu (par niveau)
   - cost(lvl)   : coût pour passer de lvl-1 → lvl
   - time(lvl)   : durée en minutes jeu
   - prereq      : exigences { module: niveau }
   - capCrew     : capacité d'équipage débloquée (par niveau)
   - flag        : effet débloqué (laboratoire, atelier, etc.)
*/

// Identifiants uniques des recherches, fabrications, formations et traitements
// (import séparé et renommé pour ne pas entrer en conflit avec la ligne d'import
// principale de util.js).

// ============================================================
//   POSTES & RÔLES — la vie de la base
// ============================================================
// Chaque bâtiment génère des postes selon son niveau. Un poste a un rôle
// avec des prérequis et un effet sur le rendement du bâtiment.

// Imports propres à la zone rythme / économie / équipage (V1), sur des lignes
// séparées pour ne pas toucher aux imports du haut du fichier.
import { PACING, PROD_INDEX } from './constants.js';
import { refundCost, energyRatio } from './state.js';
import { fmtDuree } from './util.js';

export const ROLES = {
  production:  { nom: 'Production',   color: '#c8a878', desc: "Augmente le rendement principal du bâtiment." },
  securite:    { nom: 'Sécurité',     color: '#a8493b', desc: "Réduit le risque d'incident sur le bâtiment." },
  qualite:     { nom: 'Qualité',      color: '#7a9b6e', desc: "Bonus de précision : meilleurs résultats, plus de datacubes." },
  logistique:  { nom: 'Logistique',   color: '#5a8ba8', desc: "Réduit l'upkeep en énergie et biomasse." },
  support:     { nom: 'Support',      color: '#b09bd0', desc: "Améliore moral et efficacité des soins." },
  commandement:{ nom: 'Commandement', color: '#e9b76a', desc: "Bonus global modeste sur l'ensemble de la colonie." }
};





// Renvoie tous les postes ouverts d'un bâtiment selon son niveau actuel.
// Ex. Mine niv 3 → renvoie les 3 premiers postes de la liste.
export function jobsForModule(modKey) {
  const lvl = S.modules[modKey]?.level || 0;
  if (lvl === 0) return [];
  const pool = MODULE_JOBS[modKey] || [];
  return pool.slice(0, lvl);
}

// Vérifie si un membre est éligible à un poste (skill / trait)
export function isEligibleForJob(member, job) {
  if (!member || member.statut === 'mort') return false;
  if (job.req?.skill) {
    if ((member.skills[job.req.skill.key] || 0) < job.req.skill.min) return false;
  }
  if (job.req?.trait) {
    if (!member.traits.includes(job.req.trait)) return false;
  }
  return true;
}

// Texte court de prérequis
export function jobReqText(job) {
  const parts = [];
  if (job.req?.skill) parts.push(`${SKILL_LABELS[job.req.skill.key]} ≥ ${job.req.skill.min}`);
  if (job.req?.trait) parts.push(`Trait : ${TRAITS[job.req.trait]?.nom || job.req.trait}`);
  return parts.join(' · ') || 'Aucun prérequis';
}

// Clé d'affectation : "modKey:slotIdx"
export function jobKey(modKey, slotIdx) {
  return `${modKey}:${slotIdx}`;
}

// Trouve à quel poste un membre est affecté (renvoie {modKey, slotIdx} ou null)
export function memberAssignment(memberId) {
  for (const k in S.assignments) {
    if (S.assignments[k] === memberId) {
      const [modKey, idx] = k.split(':');
      return { modKey, slotIdx: parseInt(idx, 10) };
    }
  }
  return null;
}

// Membre actuellement affecté à un poste
export function memberAt(modKey, slotIdx) {
  const id = S.assignments[jobKey(modKey, slotIdx)];
  if (!id) return null;
  return S.crew.find(m => m.id === id) || null;
}

// Motifs de refus d'affectation selon le statut du colon
const UNAVAILABLE_REASONS = {
  mort: 'Décédé',
  expedition: 'En expédition',
  formation: 'En formation',
  infirmerie: 'À l\'infirmerie',
  diplomatie: 'En mission diplomatique'
};

// Affecte un membre à un poste (gère désaffectation préalable).
// opts.auto : affectation décidée par l'auto-affectation (et non par le joueur) ;
// seules celles-là peuvent être revues automatiquement (cf. staffInfirmary).
export function assignMember(memberId, modKey, slotIdx, opts = {}) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok: false, reason: 'Colon introuvable' };
  // Seul un colon présent et disponible (libre ou déjà en poste) peut être affecté
  if (member.statut !== 'libre' && member.statut !== 'travail') {
    return { ok: false, reason: UNAVAILABLE_REASONS[member.statut] || `Indisponible (${member.statut})` };
  }

  const jobs = jobsForModule(modKey);
  const job = jobs[slotIdx];
  if (!job) return { ok: false, reason: 'Poste inexistant' };

  const prev = memberAssignment(memberId);
  // Déjà à ce poste : rien à changer (l'ancienneté n'est pas remise à zéro
  // et l'historique de carrière ne reçoit pas d'entrée en double)
  if (prev && prev.modKey === modKey && prev.slotIdx === slotIdx) {
    member.statut = 'travail';
    return { ok: true };
  }
  if (!isEligibleForJob(member, job)) return { ok: false, reason: 'Prérequis non remplis' };

  // Reprise du poste décrit par posteInfo (ex. après une remise à plat de
  // toutes les affectations) : l'ancienneté continue.
  const keepTenure = member.posteInfo?.modKey === modKey && member.posteInfo?.slotIdx === slotIdx
    && typeof member.posteInfo.depuis === 'number';
  // Archive le poste précédent dans l'historique de carrière
  if (member.posteInfo && !keepTenure) {
    if (!member.posteHistorique) member.posteHistorique = [];
    member.posteHistorique.push({ ...member.posteInfo, jusqua: S.meta?.gameMin || 0 });
    delete member.posteInfo;
  }
  // Désaffecte le membre de son poste précédent (s'il en avait un)
  if (prev) delete S.assignments[jobKey(prev.modKey, prev.slotIdx)];

  // Si un autre colon occupait ce poste, le désaffecter
  const occupant = memberAt(modKey, slotIdx);
  if (occupant) {
    if (occupant.posteInfo) {
      if (!occupant.posteHistorique) occupant.posteHistorique = [];
      occupant.posteHistorique.push({ ...occupant.posteInfo, jusqua: S.meta?.gameMin || 0 });
      delete occupant.posteInfo;
    }
    delete S.assignments[jobKey(modKey, slotIdx)];
    // Seul un occupant présent au poste redevient libre. Un occupant absent
    // (expédition, soins, formation, mission) garde son statut : il perd
    // seulement la réservation et sera « libre » à son retour (returnToBase).
    if (occupant.statut === 'travail') occupant.statut = 'libre';
  }

  // Affecte et enregistre le poste actuel
  S.assignments[jobKey(modKey, slotIdx)] = memberId;
  member.statut = 'travail';
  delete member.libreVolontaire;
  if (!keepTenure) {
    member.posteInfo = {
      modKey,
      slotIdx,
      titre: job.label,
      role: job.role,
      depuis: S.meta?.gameMin || 0
    };
  }
  if (member.posteInfo) {
    if (opts.auto) member.posteInfo.auto = true;
    else delete member.posteInfo.auto;
  }
  return { ok: true };
}

// Désaffecte un membre (le laisse libre). Par défaut c'est un choix du joueur :
// le colon reste libre (libreVolontaire) et l'auto-affectation ne le replace pas
// d'elle-même ; opts.auto pour une désaffectation décidée par le jeu.
export function unassignMember(memberId, opts = {}) {
  const a = memberAssignment(memberId);
  if (!a) return;
  const member = S.crew.find(m => m.id === memberId);
  if (member && !opts.auto && member.statut !== 'mort') member.libreVolontaire = true;
  // Archive career history
  if (member?.posteInfo) {
    if (!member.posteHistorique) member.posteHistorique = [];
    member.posteHistorique.push({ ...member.posteInfo, jusqua: S.meta?.gameMin || 0 });
    delete member.posteInfo;
  }
  delete S.assignments[jobKey(a.modKey, a.slotIdx)];
  if (member && member.statut === 'travail') member.statut = 'libre';
}

// Désaffecte un poste précis (utile si bâtiment supprimé/dégradé — pas encore d'usage)
export function unassignSlot(modKey, slotIdx) {
  const k = jobKey(modKey, slotIdx);
  const id = S.assignments[k];
  if (!id) return;
  const member = S.crew.find(m => m.id === id);
  if (member?.posteInfo) {
    if (!member.posteHistorique) member.posteHistorique = [];
    member.posteHistorique.push({ ...member.posteInfo, jusqua: S.meta?.gameMin || 0 });
    delete member.posteInfo;
  }
  delete S.assignments[k];
  if (member && member.statut === 'travail') member.statut = 'libre';
}

// Bonus de production lié à l'ancienneté dans le poste actuel.
// Un colon qui reste longtemps sur son poste devient plus efficace.
// posteInfo peut manquer (colon affecté avant 0.32) : pas de bonus, pas d'erreur.
export function ancienneteBonus(member) {
  if (!member?.posteInfo || typeof member.posteInfo.depuis !== 'number') return { mult: 1.0, label: null, annees: 0 };
  const dureeMin = (S.meta?.gameMin || 0) - (member.posteInfo.depuis || 0);
  const annees = dureeMin / YEAR_IN_GAME_MIN;
  if (annees < 1)  return { mult: 1.0,  label: null,          annees };
  if (annees < 3)  return { mult: 1.05, label: 'Confirmé',    annees };
  if (annees < 7)  return { mult: 1.12, label: 'Expérimenté', annees };
  if (annees < 15) return { mult: 1.20, label: 'Vétéran',     annees };
  return               { mult: 1.30, label: 'Légendaire',  annees };
}

// 0.22 — Retour à la base après expédition / soins / formation / mission diplo.
// Si le colon a toujours un poste assigné, il reprend son travail.
// Sinon, il devient libre et tente une auto-affectation.
export function returnToBase(member) {
  if (!member || member.statut === 'mort') return;
  const assignment = memberAssignment(member.id);
  if (assignment) {
    // Le poste est toujours là — reprise immédiate du travail
    member.statut = 'travail';
  } else {
    // Pas de poste : devient libre, tente l'auto-assign
    member.statut = 'libre';
    autoAssignMember(member.id);
  }
}

// Postes médicaux : ceux de l'infirmerie qui demandent de la médecine (ou le trait medic_ne)
const isMedicalJob = (modKey, job) => modKey === 'infirmerie' && (job.req?.skill?.key === 'medecine' || job.req?.trait === 'medic_ne');
const isMedic = m => (m?.skills?.medecine || 0) >= 1;

// Postes vacants auxquels un colon est éligible : [{ modKey, slotIdx, job }]
function openPostsFor(member) {
  const out = [];
  for (const modKey in MODULE_JOBS) {
    const jobs = jobsForModule(modKey);
    for (let i = 0; i < jobs.length; i++) {
      if (S.assignments[jobKey(modKey, i)]) continue;          // occupé ou réservé
      if (isEligibleForJob(member, jobs[i])) out.push({ modKey, slotIdx: i, job: jobs[i] });
    }
  }
  return out;
}

// Auto-affecte un membre nouvellement disponible vers le meilleur poste libre éligible.
// V1 : un soignant va d'abord à l'infirmerie ; un colon libéré par le joueur
// (libreVolontaire) n'est pas replacé sans opts.force.
export function autoAssignMember(memberId, opts = {}) {
  if (!S.autoAssign) return;
  const member = S.crew.find(m => m.id === memberId);
  if (!member || member.statut !== 'libre') return;
  if (member.libreVolontaire && !opts.force) return;

  // Liste tous les postes libres éligibles, scoré par "qualité du match"
  const candidates = [];
  for (const { modKey, slotIdx, job } of openPostsFor(member)) {
    // Score : skill demandé × marge
    let score = 1;
    if (job.req?.skill) {
      const v = member.skills[job.req.skill.key] || 0;
      score = v * 2 - job.req.skill.min + 1;
    }
    // Bonus rôle / commandement plus important
    if (job.role === 'commandement') score += 5;
    // V1 : les soignants vont en priorité aux postes médicaux de l'infirmerie
    if (isMedicalJob(modKey, job)) score += 20;
    candidates.push({ modKey, slotIdx, score });
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  assignMember(memberId, best.modKey, best.slotIdx, { auto: true });
}

// V1 : l'infirmerie a toujours son médecin si la colonie en compte un. Si le poste
// de Médecin chef (ou d'Infirmier) est vacant, le meilleur soignant placé AILLEURS
// par l'auto-affectation y est muté (jamais un colon placé par le joueur, jamais
// un colon absent). L'auto-affectation ne retire jamais personne de l'infirmerie.
function staffInfirmary() {
  if (!S.autoAssign || !(S.modules.infirmerie?.level > 0)) return;
  const jobs = jobsForModule('infirmerie');
  for (let i = 0; i < jobs.length; i++) {
    if (!isMedicalJob('infirmerie', jobs[i]) || S.assignments[jobKey('infirmerie', i)]) continue;
    const pick = S.crew
      .filter(m => m.statut === 'travail' && isEligibleForJob(m, jobs[i]) && isMedic(m))
      .filter(m => { const a = memberAssignment(m.id); return a && a.modKey !== 'infirmerie' && m.posteInfo?.auto; })
      .sort((a, b) => (b.skills.medecine || 0) - (a.skills.medecine || 0))[0];
    if (pick) assignMember(pick.id, 'infirmerie', i, { auto: true });
  }
}

// Lance l'auto-affectation pour tous les colons libres (démarrage, fin de chantier,
// « Réoptimiser »). opts.respectChoice : laisse libres les colons que le joueur a
// libérés (fin de chantier, démarrage) ; sans option (Réoptimiser), tout le monde est placé.
export function autoAssignAllFreeMembers(opts = {}) {
  ensureCrewIntegrity();
  if (!S.autoAssign) return;
  if (!opts.respectChoice) for (const m of S.crew) delete m.libreVolontaire;
  // Trie les colons libres par "force" décroissante (somme skills) pour donner
  // les meilleurs postes aux meilleurs colons ; les soignants d'abord (infirmerie)
  const free = S.crew
    .filter(m => m.statut === 'libre')
    .map(m => ({ m, score: SKILL_LIST.reduce((s, k) => s + (m.skills[k] || 0), 0) + (isMedic(m) && S.modules.infirmerie?.level ? 100 : 0) }))
    .sort((a, b) => b.score - a.score);
  for (const { m } of free) autoAssignMember(m.id);
  staffInfirmary();
  // Un colon muté à l'infirmerie a libéré un poste : on le repourvoit
  for (const m of S.crew) if (m.statut === 'libre') autoAssignMember(m.id);
}

// V1 — un colon libre l'est-il « volontairement » (sans qu'il y ait lieu d'alerter) ?
// Vrai si le joueur l'a libéré lui-même, ou s'il n'existe aucun poste vacant
// auquel il soit éligible. Faux pour un colon absent ou en poste.
export function isVoluntarilyFree(member) {
  if (!member || member.statut !== 'libre') return false;
  if (member.libreVolontaire) return true;
  return openPostsFor(member).length === 0;
}

// Colons libres qui pourraient occuper un poste vacant (l'alerte « sans poste » utile)
export function freeMembersWithOpenPost() {
  return S.crew.filter(m => m.statut === 'libre' && !isVoluntarilyFree(m));
}

// ---- Réparation des sauvegardes ----
// Remet en cohérence l'équipage d'une sauvegarde abîmée par d'anciens bugs
// (0.32 et avant). Idempotente : sans effet sur un état sain.
// Appelée automatiquement une fois par objet d'état (ensureCrewIntegrity, depuis
// le tick et l'auto-affectation) ; peut aussi être appelée juste après load().
export function repairCrewState() {
  if (!S || !Array.isArray(S.crew)) return;
  const byId = new Map(S.crew.map(m => [m.id, m]));
  const alive = id => { const m = byId.get(id); return !!m && m.statut !== 'mort'; };
  // Affectations vers un colon disparu ou mort
  if (S.assignments) {
    for (const k of Object.keys(S.assignments)) {
      if (!alive(S.assignments[k])) delete S.assignments[k];
    }
  }
  // Statut de présence : un colon embarqué dans une expédition ou une mission
  // diplomatique en cours doit en porter le statut (anciens bugs : remplacement
  // d'un occupant absent, diagnostic qui « libérait » le médecin…).
  const inExpedition = new Set();
  for (const exp of S.expeditions || []) for (const id of exp.crewIds || []) inExpedition.add(id);
  const inMission = new Set((S.diplomaticMissions || []).map(d => d.memberId));
  const inTraining = new Set((S.training || []).map(t => t.memberId));
  for (const m of S.crew) {
    if (m.statut === 'mort') continue;
    const present = m.statut === 'libre' || m.statut === 'travail';
    if (inExpedition.has(m.id)) { if (present) m.statut = 'expedition'; continue; }
    if (inMission.has(m.id)) { if (present) m.statut = 'diplomatie'; continue; }
    const hasPost = !!memberAssignment(m.id);
    // Absence qui n'existe plus (expédition/mission/formation disparue) : retour à la base
    const stuck = m.statut === 'expedition' || m.statut === 'diplomatie'
      || (m.statut === 'formation' && !inTraining.has(m.id));
    if (stuck || present) m.statut = hasPost ? 'travail' : 'libre';
  }
  // Traitements : statut visé identifié par sa clé, index recalé, orphelins et doublons retirés
  if (Array.isArray(S.treatments)) {
    S.treatments = S.treatments.filter(t => alive(t.memberId));
    for (const m of S.crew) syncTreatmentIndexes(m);
    const seen = new Set();
    S.treatments = S.treatments.filter(t => {
      const k = t.memberId + '|' + t.statutKey;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}

const _checkedStates = new WeakSet();
// Lance repairCrewState une seule fois par objet d'état (chargement, import, reset)
export function ensureCrewIntegrity() {
  if (!S || typeof S !== 'object' || _checkedStates.has(S)) return;
  _checkedStates.add(S);
  try { repairCrewState(); } catch (e) { console.error('[repairCrewState]', e); }
}

// Plancher de rendement d'un poste vacant (mode automatisé) : JOB_BASE_FRACTION,
// relevé par les techs (baseFractionDelta : Automatisation, Relais unifié), borné à 1.
export function automationFloor() {
  return Math.min(1, JOB_BASE_FRACTION + (techEffectsAccumulated().baseFractionDelta || 0));
}

// Calcule le coefficient d'efficacité d'un bâtiment selon ses postes pourvus
// Renvoie { fillFraction (0–1), prodMult, qualityBonus, upkeepMult, securityBonus, supportBonus, jobsTotal, jobsFilled }
export function moduleEfficiency(modKey) {
  // 0.28 : si module désactivé temporairement, ne produit rien et ne consomme rien
  const mod = S.modules?.[modKey];
  if (mod?.disabledUntil && mod.disabledUntil > (S.meta?.gameMin || 0)) {
    return { fillFraction: 0, prodMult: 0, qualityBonus: 0, upkeepMult: 0, securityBonus: 0, supportBonus: 0, jobsTotal: 0, jobsFilled: 0, disabled: true };
  }
  // Si le timer est expiré, on nettoie
  if (mod?.disabledUntil && mod.disabledUntil <= (S.meta?.gameMin || 0)) {
    delete mod.disabledUntil;
    try { log('success', `<em>${MODULES[modKey].nom}</em> de nouveau opérationnel.`); } catch(e) {}
  }

  const jobs = jobsForModule(modKey);
  if (jobs.length === 0) {
    // Pas de niveau / pas de postes → mode automatisé
    return { fillFraction: 1, prodMult: 1, qualityBonus: 0, upkeepMult: 1, securityBonus: 0, supportBonus: 0, jobsTotal: 0, jobsFilled: 0 };
  }
  let filled = 0;
  let prodCount = 0, prodFilled = 0;
  let qualityFilled = 0;
  let logFilled = 0;
  let secFilled = 0;
  let supFilled = 0;
  let cmdFilled = 0;
  let tenureBonus = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const occ = S.assignments[jobKey(modKey, i)];
    const occMember = occ ? S.crew.find(m => m.id === occ) : null;
    // Un membre en infirmerie/expédition mais "officiellement affecté" ne compte pas
    const reallyOnPost = occMember && occMember.statut === 'travail';
    if (j.role === 'production') prodCount++;
    if (reallyOnPost) {
      filled++;
      if (j.role === 'production') tenureBonus += ancienneteBonus(occMember).mult - 1.0;
      switch (j.role) {
        case 'production':   prodFilled++; break;
        case 'qualite':      qualityFilled++; break;
        case 'logistique':   logFilled++; break;
        case 'securite':     secFilled++; break;
        case 'support':      supFilled++; break;
        case 'commandement': cmdFilled++; break;
      }
    }
  }

  const fillFraction = filled / jobs.length;
  // Production : mode automatisé au plancher (JOB_BASE_FRACTION + techs), ou
  //   (prodFilled / prodCount) × 1.0 si tous les postes prod sont pourvus, +qualité/ancienneté
  const floor = automationFloor();
  let prodMult;
  if (prodCount === 0) {
    // pas de poste prod → fillFraction comme proxy
    prodMult = floor + (1 - floor) * fillFraction;
  } else {
    const prodRatio = prodFilled / prodCount;
    prodMult = floor + (1 - floor) * prodRatio;
    prodMult += qualityFilled * 0.20;   // chaque qualité = +20%
    prodMult += cmdFilled * 0.05;       // commandement bonus modeste
    prodMult += tenureBonus;            // ancienneté des producteurs
  }
  // Upkeep : chaque logistique réduit l'upkeep de 15%, plancher à 50%
  let upkeepMult = 1 - logFilled * 0.15;
  if (upkeepMult < 0.5) upkeepMult = 0.5;
  // Sécurité : nombre de postes Sécurité pourvus
  const securityBonus = secFilled;
  const supportBonus = supFilled;
  const qualityBonus = qualityFilled;

  return { fillFraction, prodMult, qualityBonus, upkeepMult, securityBonus, supportBonus, jobsTotal: jobs.length, jobsFilled: filled };
}

// Bonus global de la colonie : somme des cmd partout.
// Comme staffOf, ne compte que les postes ouverts au niveau actuel du module
// (cf. jobsForModule) : un officier resté sur un poste supprimé (module
// endommagé/rétrogradé) ne compte plus.
export function globalCommandBonus() {
  let n = 0;
  for (const k in S.assignments) {
    const [modKey, idxStr] = k.split(':');
    const idx = parseInt(idxStr, 10);
    if (!(idx < (S.modules[modKey]?.level || 0))) continue;
    const job = MODULE_JOBS[modKey]?.[idx];
    if (!job || job.role !== 'commandement') continue;
    const m = S.crew.find(c => c.id === S.assignments[k]);
    if (m && m.statut === 'travail') n++;
  }
  // Le Centre de commandement ne produit rien : son multiplicateur de tech
  // (moduleProdMult.commandement, Relais unifié) renforce le poids de tous les
  // postes de commandement de la colonie.
  return n * (techEffectsAccumulated().moduleProdMult.commandement || 1);
}

// Récupère tous les colons affectés à un bâtiment (en travail effectif).
// Renvoie [{ member, job, slotIdx }]
export function staffOf(modKey) {
  const out = [];
  const jobs = jobsForModule(modKey);
  for (let i = 0; i < jobs.length; i++) {
    const id = S.assignments[jobKey(modKey, i)];
    if (!id) continue;
    const m = S.crew.find(c => c.id === id);
    if (m && m.statut === 'travail') out.push({ member: m, job: jobs[i], slotIdx: i });
  }
  return out;
}

// Compte les rôles présents dans un bâtiment
export function staffRoleCount(modKey, role) {
  return staffOf(modKey).filter(s => s.job.role === role).length;
}

// Programmes de formation (cf. doc d'archi §8.4.2)
// Chaque programme cible un skill. Coût final = base × (skillCible).
// Durée finale = baseHours × √(skillCible) × modificateurs traits.
export const TRAINING_PROGRAMS = {
  medecine:     { nom:'Médecine',     baseCost:{ biomasse:20 },           baseHours:8,  extra:{ datacubes:5 }, extraFromLevel:3 },
  ingenierie:   { nom:'Ingénierie',   baseCost:{ metal:30, cristal:10 },  baseHours:6,  extra:{ datacubes:5 }, extraFromLevel:3 },
  science:      { nom:'Science',      baseCost:{ cristal:15, datacubes:5 },baseHours:10, extra:{ datacubes:5 }, extraFromLevel:4 },
  pilotage:     { nom:'Pilotage',     baseCost:{ energie:10, cristal:20 },baseHours:8,  extra:{ datacubes:5 }, extraFromLevel:3 },
  combat:       { nom:'Combat',       baseCost:{ metal:25, energie:5 },   baseHours:6,  extra:{ metal:30 },     extraFromLevel:4 },
  linguistique: { nom:'Linguistique', baseCost:{ datacubes:10 },          baseHours:12, extra:{ datacubes:10 }, extraFromLevel:4 },
  survie:       { nom:'Survie',       baseCost:{ biomasse:20, metal:10 }, baseHours:8,  extra:null,             extraFromLevel:99 }
};

// Mapping skill → trait débloqué automatiquement à skill 5
const SKILL_SPECIALIZATION = {
  medecine:'medic_ne', ingenierie:'mecano', science:'savant_eclaire',
  pilotage:'pilote_inne', combat:'combattant_aguerri',
  linguistique:'linguiste', survie:'survivant'
};


// Constantes d'expédition (V1 : en secondes réelles, cf. PACING)
export const EXPED_TIME_PER_PC = PACING.EXPED_PER_PC;   // par parsec à vitesse 1.0 (puis ×vessel.speed), + EXPED_BASE
export const EXPED_ONSITE_MIN = PACING.EXPED_ONSITE;    // temps estimé sur place (les scènes attendent le joueur)
export const EXPED_BIOMASSE_PER_HOUR = PACING.EXPED_BIO_PER_MEMBER_HOUR * PROD_INDEX;  // vivres par membre et par heure réelle

// ============================================================
//   CATALOGUE D'ITEMS — fondation de l'inventaire (0.11)
// ============================================================
// Types :
//   narrative  : artefacts trouvés en expé (valeur scientifique/historique)
//   consumable : items à usage unique (kit médical, ration, grenade...)  → 0.13
//   tool       : outils réutilisables (lance-flammes, scanner...)         → 0.13
//   weapon     : armement embarqué                                        → 0.13
//   blueprint  : schémas de construction                                  → 0.12
//
// Origines (pour les visuels et regroupement) :
//   humain, alien_a (cristallin), alien_b (organique), mixte, exotique




// ============================================================
//   SCHÉMAS DE CONSTRUCTION (BLUEPRINTS) — phase 0.12
// ============================================================
// Un schéma est un type d'item particulier (type='blueprint') qui débloque :
//   - une fabrication d'atelier (équipement, outil, arme)         → 0.13
//   - une amélioration de module (palier max+1)                   → 0.13
//   - un palier d'un arbre techno                                  → 0.13
//
// Une fois trouvé, le schéma est PERMANENT dans la bibliothèque de la colonie.
// Posséder 1+ exemplaires en inventaire est nécessaire pour CONSOMMER (0.13),
// mais le schéma reste connu même quand l'inventaire revient à 0.
//
// Champs :
//   nom, origin, rarity (1=commun, 2=peu commun, 3=rare, 4=très rare)
//   unlocks : { kind: 'fab'|'module'|'tech', target: 'id_du_truc', label: 'Combinaison renforcée' }
//   desc : description narrative


// Ajoute les blueprints au catalogue ITEMS pour qu'ils héritent de toute l'infra inventaire
for (const id in BLUEPRINTS) {
  const bp = BLUEPRINTS[id];
  ITEMS[id] = {
    nom: bp.nom,
    type: 'blueprint',
    origin: bp.origin,
    desc: bp.desc,
    rarity: bp.rarity,
    unlocks: bp.unlocks
  };
}

// ---- Découverte de schémas ----
// Une découverte enregistre que la colonie a connu ce schéma au moins une fois.
// (les copies en stock sont gérées via S.inventory comme tout item)
// S.discoveries = { blueprintId: { firstFoundAt: gameMin } }

export function discoverBlueprint(bpId, source = 'expédition') {
  if (!BLUEPRINTS[bpId]) return false;
  if (!S.discoveries) S.discoveries = {};
  const isNew = !S.discoveries[bpId];
  if (isNew) {
    S.discoveries[bpId] = { firstFoundAt: S.meta.gameMin, source };
    log('success', `Nouveau schéma découvert : <em>${BLUEPRINTS[bpId].nom}</em>.`);
    // 0.26.1 : notification dédiée
    notif.blueprint(BLUEPRINTS[bpId].nom);
  }
  return isNew;
}

// Ajoute un schéma à la fois en inventaire ET dans la bibliothèque permanente
export function addBlueprintToInventory(bpId, source) {
  if (!BLUEPRINTS[bpId]) return;
  discoverBlueprint(bpId, source);
  if (!S.inventory) S.inventory = {};
  S.inventory[bpId] = (S.inventory[bpId] || 0) + 1;
}

// Tirage d'un schéma compatible avec l'origine d'un loot (ruines)
// origins: 'humain' | 'alien_a' | 'alien_b' | 'fusion'
// rng: PRNG seedé
function rollBlueprint(originPool, rng = Math.random) {
  const pool = [].concat(originPool || []);
  // Les schémas légendaires et les récompenses d'arc ne tombent jamais au hasard
  const arcRewards = new Set(Object.values(ARCS).filter(a => a.reward?.kind === 'blueprint').map(a => a.reward.value));
  const candidates = Object.keys(BLUEPRINTS).filter(id => {
    const bp = BLUEPRINTS[id];
    return pool.includes(bp.origin) && !bp.legendary && !arcRewards.has(id);
  });
  if (candidates.length === 0) return null;
  // Pondération par rareté inverse : commun = poids 4, peu commun = 3, rare = 2, très rare = 1
  const weighted = candidates.map(id => ({ id, w: 5 - (BLUEPRINTS[id].rarity || 1) }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = (typeof rng === 'function' ? rng() : Math.random()) * total;
  for (const x of weighted) { r -= x.w; if (r <= 0) return x.id; }
  return weighted[weighted.length - 1].id;
}

// ============================================================
//   TECH TREE — phase 0.13
// ============================================================
// Trois branches :
//   ingenierie  : modules améliorés, vaisseaux, automatisation
//   bio         : médecine, hydroponie, mutations contrôlées
//   exotique    : verrouillée par défaut, ouverte par découverte d'un schéma alien_a OU alien_b
//
// Une recherche débloquée applique ses effets immédiatement (bonus passifs, max+1 sur un module,
// déblocage de fabrications atelier en 0.14, etc.).
//
// Champs d'un nœud techno :
//   nom, branch, tier (1-5)
//   cost: { datacubes, datacubes_alien_a?, datacubes_alien_b?, time }
//   prereq: { tech: [...], blueprint?: '...' }
//   effects: { ... } voir applyTechEffect()
//   desc



// ---- Helpers tech tree ----

// Vrai si la branche exotique est débloquée (au moins un schéma alien découvert)
export function isExoticUnlocked() {
  if (!S.discoveries) return false;
  for (const id in S.discoveries) {
    const bp = BLUEPRINTS[id];
    if (bp && (bp.origin === 'alien_a' || bp.origin === 'alien_b' || bp.origin === 'fusion')) return true;
  }
  return false;
}

// Vrai si une tech est complétée
export function isTechCompleted(techId) {
  return !!(S.techCompleted && S.techCompleted[techId]);
}

// Vrai si une tech est en cours de recherche
export function isTechResearching(techId) {
  return (S.research || []).some(r => r.techId === techId);
}

// V1 — vrai si une tech attend dans la file du laboratoire
export function isTechQueued(techId) {
  return (S.researchQueue || []).includes(techId);
}

// Places de recherche simultanées du laboratoire
export function researchSlots() {
  const labLvl = S.modules.laboratoire?.level || 0;
  return labLvl ? Math.max(1, Math.ceil(labLvl / 2)) : 0;   // niv 1-2 → 1, 3-4 → 2, 5-6 → 3
}

// Durée nominale d'une recherche en ticks (avec un Chercheur en poste, sans bonus)
export function researchDuration(techId) {
  const t = TECH_TREE[techId];
  return t ? t.cost.time * BUILD_TIME_MULT : 0;
}

// Vitesse actuelle du laboratoire (ticks de recherche par tick réel) : plancher
// d'automatisation sans Chercheur, bonus du personnel et des modules, pénurie d'énergie.
function researchSpeed(tech) {
  const lb = laboratoryBonuses();
  const autoMult = lb.activeProd ? 1.0 : automationFloor();
  let modBonus = 1.0;
  for (const id of Object.keys(S.modules || {})) {
    const def = MODULES[id];
    const m = S.modules[id];
    if (def?.researchSpeedBonus && m?.level > 0) modBonus += def.researchSpeedBonus(m.level);
  }
  let speed = MIN_PER_TICK * autoMult * modBonus / lb.speedMult * energyRatio();
  if (tech?.branch === 'bio') speed *= lb.bioBonus;
  return speed;
}

// V1 — temps restant (ticks) avant la fin d'une recherche, à la vitesse actuelle
// du laboratoire (personnel, énergie) : en cours → reste ; en file → attente
// comprise ; sinon durée qu'elle prendrait si on la lançait maintenant.
// Infinity si le laboratoire est à l'arrêt.
export function researchEta(techId) {
  const tech = TECH_TREE[techId];
  if (!tech) return null;
  const speed = researchSpeed(tech);
  if (!(speed > 0)) return Infinity;
  const running = (S.research || []).find(r => r.techId === techId);
  if (running) return Math.ceil(Math.max(0, running.totalMin - running.doneMin) / speed);
  const own = Math.ceil(researchDuration(techId) / speed);
  const qi = (S.researchQueue || []).indexOf(techId);
  if (qi >= 0) {
    // attend la première place libérée (au plus tôt la recherche en cours la plus avancée)
    const remain = (S.research || []).map(r => Math.max(0, r.totalMin - r.doneMin) / researchSpeed(TECH_TREE[r.techId]));
    const wait = remain.length >= researchSlots() && remain.length ? Math.min(...remain) : 0;
    return Math.ceil(wait) + own;
  }
  return own;
}

// Évalue si une tech peut être lancée (ou mise en file). Renvoie { ok, reason, cost, queued }.
export function canResearch(techId) {
  const tech = TECH_TREE[techId];
  if (!tech) return { ok: false, reason: 'Tech inconnue' };
  if (isTechCompleted(techId)) return { ok: false, reason: 'Déjà complétée' };
  if (isTechResearching(techId)) return { ok: false, reason: 'Déjà en cours' };
  if (isTechQueued(techId)) return { ok: false, reason: 'Déjà en file' };
  // Branche exotique nécessite déblocage
  if (tech.branch === 'exotique' && !isExoticUnlocked()) {
    return { ok: false, reason: "Branche verrouillée — découvre d'abord un schéma alien" };
  }
  // Prérequis : techs précédentes complétées — ou en cours : la tech attend alors en file
  let prereqPending = false;
  for (const t of (tech.prereq?.tech || [])) {
    if (isTechCompleted(t)) continue;
    if (isTechResearching(t)) { prereqPending = true; continue; }
    return { ok: false, reason: `Requiert : ${TECH_TREE[t]?.nom || t}` };
  }
  // Places du laboratoire : au-delà, file d'attente (RESEARCH_QUEUE_MAX)
  const slotsFull = (S.research || []).length >= researchSlots() || prereqPending;
  // Prérequis : schéma spécifique
  if (tech.prereq?.blueprint && !S.discoveries?.[tech.prereq.blueprint]) {
    return { ok: false, reason: `Requiert le schéma : ${BLUEPRINTS[tech.prereq.blueprint]?.nom || tech.prereq.blueprint}` };
  }
  // Prérequis : n'importe quel schéma alien
  if (tech.prereq?.requireAnyAlienBlueprint && !isExoticUnlocked()) {
    return { ok: false, reason: 'Requiert un schéma alien découvert' };
  }
  // Prérequis : arc narratif complété (techs légendaires)
  if (tech.prereq?.requireArc) {
    const state = getArcState(tech.prereq.requireArc);
    if (!state.rewardClaimed) {
      return { ok: false, reason: `Requiert : compléter la chronique « ${ARCS[tech.prereq.requireArc]?.nom || tech.prereq.requireArc} »` };
    }
  }
  // Capacité du laboratoire
  const slots = researchSlots();
  if (slots === 0) return { ok: false, reason: 'Laboratoire requis' };
  if (slotsFull && (S.researchQueue || []).length >= PACING.RESEARCH_QUEUE_MAX) {
    return { ok: false, reason: `Toutes les places de recherche sont prises (${slots}) et la file est pleine` };
  }
  // Coût
  const cost = tech.cost;
  if ((S.res.datacubes || 0) < cost.datacubes) {
    return { ok: false, reason: `Manque datacubes (${cost.datacubes} requis)` };
  }
  // Datacubes alien : on les puise dans S.res.datacubes_alien (si présent) ou stock virtuel via découvertes
  if (cost.datacubes_alien && (S.alienDatacubes || 0) < cost.datacubes_alien) {
    return { ok: false, reason: `Manque datacubes alien (${cost.datacubes_alien} requis)` };
  }
  return { ok: true, cost, tech, queued: slotsFull };
}

function beginResearch(techId) {
  if (!S.research) S.research = [];
  S.research.push({
    id: uid('r'),
    techId,
    startedAt: S.meta.gameMin,
    totalMin: researchDuration(techId),
    doneMin: 0
  });
}

// V1 — lance la recherche, ou la met en file si toutes les places sont prises
// (coût débité à l'ajout). → { ok, why, queued }
export function enqueueResearch(techId) {
  const r = canResearch(techId);
  if (!r.ok) return { ok: false, why: r.reason };
  // Débite
  S.res.datacubes -= r.cost.datacubes;
  if (r.cost.datacubes_alien) {
    S.alienDatacubes = (S.alienDatacubes || 0) - r.cost.datacubes_alien;
  }
  if (r.queued) {
    if (!Array.isArray(S.researchQueue)) S.researchQueue = [];
    S.researchQueue.push(techId);
    log('neutral', `Recherche mise en file : <em>${r.tech.nom}</em>.`);
  } else {
    beginResearch(techId);
    log('neutral', `Recherche engagée : <em>${r.tech.nom}</em>. Durée : ${fmtDuree(researchEta(techId))}.`);
  }
  render();
  return { ok: true, why: '', queued: !!r.queued };
}

// Compatibilité : l'interface historique appelle startResearch
export function startResearch(techId) {
  const r = enqueueResearch(techId);
  if (!r.ok) toast(r.why);
  return r;
}

// Retire une recherche de la file : datacubes rendus en totalité (dans la limite du stockage).
export function cancelQueuedResearch(index) {
  const q = S.researchQueue || [];
  const techId = q[index];
  if (!techId) return { ok: false, why: 'Recherche introuvable' };
  q.splice(index, 1);
  const tech = TECH_TREE[techId];
  if (tech) refundCost({ datacubes: tech.cost.datacubes, ...(tech.cost.datacubes_alien ? { datacubes_alien: tech.cost.datacubes_alien } : {}) });
  log('neutral', `Recherche retirée de la file : <em>${tech?.nom || techId}</em>. Datacubes rendus.`);
  render();
  return { ok: true, why: '' };
}

// Démarre les recherches en file tant qu'il y a des places (prérequis revérifiés :
// une recherche devenue impossible est remboursée).
function startQueuedResearch() {
  const q = S.researchQueue || [];
  while (q.length && (S.research || []).length < researchSlots()) {
    const techId = q.shift();
    const tech = TECH_TREE[techId];
    const missing = (tech?.prereq?.tech || []).find(t => !isTechCompleted(t) && !isTechResearching(t));
    if (!tech || isTechCompleted(techId) || isTechResearching(techId) || missing) {
      if (tech) refundCost({ datacubes: tech.cost.datacubes, ...(tech.cost.datacubes_alien ? { datacubes_alien: tech.cost.datacubes_alien } : {}) });
      continue;
    }
    // Prérequis encore en cours : on la remet en tête et on attend
    if ((tech.prereq?.tech || []).some(t => !isTechCompleted(t))) { q.unshift(techId); break; }
    beginResearch(techId);
    log('neutral', `Recherche suivante engagée : <em>${tech.nom}</em>.`);
  }
}

// Rembourse `amount` d'une ressource dans la limite de la capacité réelle
// (capOf : techs et modules compris). Ne réduit jamais un stock existant.
function refundRes(k, amount) {
  const cur = S.res[k] || 0;
  S.res[k] = Math.max(cur, Math.min(capOf(k), cur + amount));
}

export function cancelResearch(researchId) {
  if (!S.research) return;
  const idx = S.research.findIndex(r => r.id === researchId);
  if (idx < 0) return;
  const r = S.research[idx];
  const tech = TECH_TREE[r.techId];
  // Rembourse 50% des datacubes
  if (tech) {
    refundRes('datacubes', Math.floor(tech.cost.datacubes * 0.5));
    if (tech.cost.datacubes_alien) {
      S.alienDatacubes = (S.alienDatacubes || 0) + Math.floor(tech.cost.datacubes_alien * 0.5);
    }
  }
  S.research.splice(idx, 1);
  log('warn', `Recherche interrompue : <em>${tech?.nom || '?'}</em>. 50% des ressources récupérées.`);
  startQueuedResearch();
  render();
}

function finishResearch(researchId) {
  if (!S.research) return;
  const idx = S.research.findIndex(r => r.id === researchId);
  if (idx < 0) return;
  const r = S.research[idx];
  S.research.splice(idx, 1);
  if (!S.techCompleted) S.techCompleted = {};
  S.techCompleted[r.techId] = { at: S.meta.gameMin };
  const tech = TECH_TREE[r.techId];
  log('success', `Recherche complétée : <em>${tech?.nom || '?'}</em>.`);
  // 0.26 : notification dédiée
  notif.researchDone(tech?.nom || r.techId);
  // V1 : la file prend le relais
  startQueuedResearch();
}

// Bonus du staff laboratoire (Chercheur senior, Bio-spécialiste)
export function laboratoryBonuses() {
  const staff = staffOf('laboratoire');
  let speedMult = 1.0;
  let qualityChance = 0;  // chance de gagner +1 datacube en bonus à chaque jalon
  let bioBonus = 1.0;     // multiplicateur supplémentaire pour la branche bio
  let activeProd = false; // au moins un Chercheur (Production) en poste
  for (const { member, job } of staff) {
    if (job.role === 'production') activeProd = true;
    if (job.role === 'qualite') {
      // Chercheur senior ou Bio-spécialiste : -25% durée + 5% chance bonus
      speedMult *= 0.75;
      qualityChance += 0.05;
      // Bio-spécialiste = bonus spécifique sur branche bio
      if ((member.skills.medecine || 0) >= 2) bioBonus *= 1.10;
    }
  }
  if (speedMult < 0.4) speedMult = 0.4;
  return { speedMult, qualityChance, bioBonus, activeProd };
}

// Avance les recherches en cours d'un tick.
// Sans Chercheur : plancher d'automatisation (30 % + techs) ; bonus du personnel
// et des modules (mémoire cristalline) ; V1 : ralentie par une pénurie d'énergie.
export function tickResearch() {
  if ((S.researchQueue || []).length && (S.research || []).length < researchSlots()) startQueuedResearch();
  if (!S.research || S.research.length === 0) return;
  const finished = [];
  for (const r of S.research) {
    r.doneMin += researchSpeed(TECH_TREE[r.techId]);
    if (r.doneMin >= r.totalMin) finished.push(r);
  }
  for (const r of finished) finishResearch(r.id);
}

// ---- Application des effets de tech ----
// Toutes les fonctions du jeu qui veulent connaître un bonus appellent
// techEffectsAccumulated() ou des helpers spécifiques.

// Renvoie un objet agrégé de tous les effets actifs des techs complétées.
// Appelée plusieurs fois par tick (capOf, computeRates, contagion…) : le
// résultat est mis en cache et recalculé seulement quand l'ensemble des techs
// terminées change (nouvelle tech) ou que l'objet d'état est remplacé
// (chargement, import, reset). L'objet renvoyé est partagé : ne pas le modifier.
let _techFx = null, _techFxState = null, _techFxDone = null, _techFxCount = -1;
export function techEffectsAccumulated() {
  const done = S?.techCompleted;
  const n = done ? Object.keys(done).length : 0;
  if (_techFx && _techFxState === S && _techFxDone === done && _techFxCount === n) return _techFx;
  _techFx = computeTechEffects();
  _techFxState = S;
  _techFxDone = done;
  _techFxCount = n;
  return _techFx;
}

function computeTechEffects() {
  const acc = {
    resourceMult:        { metal:1, cristal:1, energie:1, biomasse:1, datacubes:1 },
    moduleProdMult:      {},   // par modKey
    moduleMaxLevelDelta: {},   // par modKey
    capacityMult:        { metal:1, cristal:1, energie:1, biomasse:1, datacubes:1 },
    baseFractionDelta:   0,
    treatmentSpeedMult:  1,
    contagionMult:       1,
    sequelChanceMult:    1,
    trainingSpeedMult:   1,
    workerBiomasseMult:  1,
    expeditionBiomasseMult: 1,
    expeditionAlienLootMult: 1,
    expeditionThreatBonus: 0,
    expeditionCombatBonus: 0,
    expeditionToxicImmune: false,
    vesselFuelMult:      1,
    vesselSpeedMult:     1,
    scanRangeBonus:      0,
    // 0.29 — bonus diplomatique cumulé (multiplicateur, défaut 1.0)
    diplomaticBonus:     1.0
  };
  if (!S.techCompleted) return acc;
  for (const id in S.techCompleted) {
    const e = TECH_TREE[id]?.effects;
    if (!e) continue;
    if (e.resourceMult) {
      for (const k in e.resourceMult) acc.resourceMult[k] = (acc.resourceMult[k] || 1) * e.resourceMult[k];
    }
    if (e.moduleProdMult) {
      for (const k in e.moduleProdMult) acc.moduleProdMult[k] = (acc.moduleProdMult[k] || 1) * e.moduleProdMult[k];
    }
    if (e.moduleMaxLevelDelta) {
      for (const k in e.moduleMaxLevelDelta) acc.moduleMaxLevelDelta[k] = (acc.moduleMaxLevelDelta[k] || 0) + e.moduleMaxLevelDelta[k];
    }
    if (e.capacityMult) {
      for (const k in e.capacityMult) acc.capacityMult[k] = (acc.capacityMult[k] || 1) * e.capacityMult[k];
    }
    if (typeof e.baseFractionDelta === 'number') acc.baseFractionDelta += e.baseFractionDelta;
    if (e.treatmentSpeedMult) acc.treatmentSpeedMult *= e.treatmentSpeedMult;
    if (e.contagionMult) acc.contagionMult *= e.contagionMult;
    if (e.sequelChanceMult) acc.sequelChanceMult *= e.sequelChanceMult;
    if (e.trainingSpeedMult) acc.trainingSpeedMult *= e.trainingSpeedMult;
    if (e.workerBiomasseMult) acc.workerBiomasseMult *= e.workerBiomasseMult;
    if (e.expeditionBiomasseMult) acc.expeditionBiomasseMult *= e.expeditionBiomasseMult;
    if (e.expeditionAlienLootMult) acc.expeditionAlienLootMult *= e.expeditionAlienLootMult;
    if (typeof e.expeditionThreatBonus === 'number') acc.expeditionThreatBonus += e.expeditionThreatBonus;
    if (typeof e.expeditionCombatBonus === 'number') acc.expeditionCombatBonus += e.expeditionCombatBonus;
    if (e.expeditionToxicImmune) acc.expeditionToxicImmune = true;
    if (e.vesselFuelMult) acc.vesselFuelMult *= e.vesselFuelMult;
    if (e.vesselSpeedMult) acc.vesselSpeedMult *= e.vesselSpeedMult;
    if (typeof e.scanRangeBonus === 'number') acc.scanRangeBonus += e.scanRangeBonus;
    // 0.29 — diplomaticBonus en multiplicatif
    if (typeof e.diplomaticBonus === 'number') acc.diplomaticBonus *= e.diplomaticBonus;
  }
  return acc;
}

// ============================================================
//   FABRICATIONS — Atelier (phase 0.14)
// ============================================================
// Chaque fabrication produit un item donné. Conditions :
//   - cost: { ressources... } débité au lancement
//   - time: durée en minutes-jeu (avec BUILD_TIME_MULT)
//   - prereq.blueprint: schéma requis (le posséder dans la bibliothèque)
//   - prereq.tech: liste de techs complétées requises
//   - prereq.workshopLevel: niveau atelier minimum
//
// Les fabrications de base (sans prereq.blueprint) sont disponibles dès
// l'atelier niveau 1, pour donner quelque chose à faire au démarrage.


// ---- Helpers atelier ----

// Capacité de la file (parallélisme) selon niveau
export function workshopSlots() {
  const lvl = S.modules.atelier?.level || 0;
  if (lvl === 0) return 0;
  return Math.max(1, Math.ceil(lvl / 2));   // 1-2 → 1, 3-4 → 2, 5+ → 3
}

// Bonus du staff atelier
// Renvoie { speedMult, qualityChance, hasArtisan }
export function workshopBonuses() {
  const staff = staffOf('atelier');
  let speedMult = 1.0;
  let qualityChance = 0;
  let hasArtisan = false;
  for (const { job } of staff) {
    if (job.role === 'production') {
      hasArtisan = true;
      // Maître-artisan a Ingénierie ≥ 3 : on regarde via le label
      // Apprenti a Ingénierie ≥ 1, Artisan a Ingénierie ≥ 2 — tous "production"
    }
    if (job.role === 'qualite') {
      // Maître-artisan : -20% durée, +10% chance bonus
      speedMult *= 0.80;
      qualityChance += 0.10;
    }
  }
  if (speedMult < 0.4) speedMult = 0.4;
  return { speedMult, qualityChance, hasArtisan };
}

export function isFabAvailable(fabId) {
  const fab = FABRICATIONS[fabId];
  if (!fab) return false;
  const lvl = S.modules.atelier?.level || 0;
  if (lvl < (fab.prereq?.workshopLevel || 1)) return false;
  if (fab.prereq?.blueprint && !S.discoveries?.[fab.prereq.blueprint]) return false;
  if (fab.prereq?.tech) {
    for (const t of fab.prereq.tech) {
      if (!isTechCompleted(t)) return false;
    }
  }
  return true;
}

export function canFabricate(fabId) {
  const fab = FABRICATIONS[fabId];
  if (!fab) return { ok: false, reason: 'Fabrication inconnue' };
  if (!isFabAvailable(fabId)) {
    if (!S.modules.atelier) return { ok: false, reason: 'Atelier requis' };
    if ((S.modules.atelier.level || 0) < (fab.prereq?.workshopLevel || 1)) {
      return { ok: false, reason: `Atelier niveau ${fab.prereq.workshopLevel} requis` };
    }
    if (fab.prereq?.blueprint && !S.discoveries?.[fab.prereq.blueprint]) {
      return { ok: false, reason: `Schéma manquant : ${BLUEPRINTS[fab.prereq.blueprint]?.nom}` };
    }
    if (fab.prereq?.tech) {
      for (const t of fab.prereq.tech) {
        if (!isTechCompleted(t)) {
          return { ok: false, reason: `Tech requise : ${TECH_TREE[t]?.nom || t}` };
        }
      }
    }
  }
  // Slot libre
  const slots = workshopSlots();
  if ((S.fabrication || []).length >= slots) {
    return { ok: false, reason: `File pleine (${slots})` };
  }
  // Coût
  for (const k in fab.cost) {
    if ((S.res[k] || 0) < fab.cost[k]) {
      return { ok: false, reason: `Manque ${RES_LABELS[k]} (${fab.cost[k]} requis)` };
    }
  }
  return { ok: true, fab };
}

export function startFabrication(fabId) {
  const r = canFabricate(fabId);
  if (!r.ok) { toast(r.reason); return; }
  const fab = r.fab;
  // Débite ressources
  for (const k in fab.cost) S.res[k] -= fab.cost[k];
  if (!S.fabrication) S.fabrication = [];
  S.fabrication.push({
    id: uid('f'),
    fabId,
    startedAt: S.meta.gameMin,
    totalMin: fab.time * BUILD_TIME_MULT,
    doneMin: 0
  });
  log('neutral', `Fabrication engagée : <em>${fab.nom}</em>. Durée : ${fmtDuree(fab.time * BUILD_TIME_MULT)}.`);
  render();
}

export function cancelFabrication(fId) {
  if (!S.fabrication) return;
  const idx = S.fabrication.findIndex(f => f.id === fId);
  if (idx < 0) return;
  const f = S.fabrication[idx];
  const fab = FABRICATIONS[f.fabId];
  // Rembourse 50% des ressources
  if (fab) {
    for (const k in fab.cost) refundRes(k, Math.floor(fab.cost[k] * 0.5));
  }
  S.fabrication.splice(idx, 1);
  log('warn', `Fabrication interrompue : <em>${fab?.nom || '?'}</em>. 50% des ressources récupérées.`);
  render();
}

function finishFabrication(fId) {
  if (!S.fabrication) return;
  const idx = S.fabrication.findIndex(f => f.id === fId);
  if (idx < 0) return;
  const f = S.fabrication[idx];
  const fab = FABRICATIONS[f.fabId];
  S.fabrication.splice(idx, 1);
  if (!fab) return;
  // Dépose l'item dans l'inventaire
  addToInventory([fab.produces]);
  // Bonus qualité : chance de produire 1 exemplaire de plus
  const bonuses = workshopBonuses();
  if (bonuses.qualityChance > 0 && Math.random() < bonuses.qualityChance) {
    addToInventory([fab.produces]);
    log('success', `Fabrication réussie avec brio : <em>${fab.nom}</em> (×2 grâce au Maître-artisan).`);
  } else {
    log('success', `Fabrication terminée : <em>${fab.nom}</em>.`);
  }
}

// Avance les fabrications d'un tick
export function tickFabrication() {
  if (!S.fabrication || S.fabrication.length === 0) return;
  const bonuses = workshopBonuses();
  // Mode automatisé sans Artisan : plancher d'automatisation (30% + techs)
  const autoMult = bonuses.hasArtisan ? 1.0 : automationFloor();
  const finished = [];
  const energy = energyRatio();   // V1 : l'atelier ralentit en pénurie d'énergie
  for (const f of S.fabrication) {
    f.doneMin += MIN_PER_TICK * autoMult / bonuses.speedMult * energy;
    if (f.doneMin >= f.totalMin) finished.push(f);
  }
  for (const f of finished) finishFabrication(f.id);
}


// Résout un identifiant ou un nom-string vers une définition d'item
export function itemDef(idOrName) {
  if (!idOrName) return null;
  if (ITEMS[idOrName]) return { id: idOrName, ...ITEMS[idOrName] };
  const id = ITEM_NAME_TO_ID[idOrName];
  if (id && ITEMS[id]) return { id, ...ITEMS[id] };
  // Fallback : item inconnu, on génère un placeholder pour ne pas tout casser
  return { id: '__unknown__', nom: idOrName, type: 'narrative', origin: 'humain', desc: "Item non répertorié." };
}

// Ajoute des items à l'inventaire de la colonie. items = ['fragment_cristallin', 'disque_memoire'] (mix supporté)
export function addToInventory(items) {
  if (!items || items.length === 0) return;
  if (!S.inventory) S.inventory = {};
  for (const raw of items) {
    const def = itemDef(raw);
    if (!def || def.id === '__unknown__') continue;
    S.inventory[def.id] = (S.inventory[def.id] || 0) + 1;
    // Découverte permanente si c'est un schéma
    if (def.type === 'blueprint' && BLUEPRINTS[def.id]) {
      discoverBlueprint(def.id, 'expédition');
    }
  }
}

// Compte total d'items dans l'inventaire
export function inventoryCount() {
  if (!S.inventory) return 0;
  return Object.values(S.inventory).reduce((s, n) => s + n, 0);
}

// ============================================================
//   SCÈNES D'EXPÉDITION — bibliothèque
// ============================================================
// Chaque scène a :
//   id        : unique
//   tags      : ['ruines','alien_a','intro','danger',...] — utilisés pour le matching
//   weight    : poids de tirage si plusieurs scènes matchent
//   text      : narratif (peut contenir {planete}, {vaisseau}, {membre}, {membreCombat}, etc.)
//   choices[] : 2-4 options
//
// Choice = {
//   label    : texte du bouton
//   req      : { trait?, skill?{key,min}, item? } (sinon désactivé)
//   risky    : { stat:'sangfroid', dc:6, success:..., fail:... }   (jet de dés)
//   consume  : { datacubes:N, energie:N, ... } (à débiter)
//   outcome  : 'next' | 'retreat' | { loot, status, log, dropItem }
// }
//
// Outcome objet :
//   loot      : { metal, cristal, datacubes, ... }  (ressources gagnées)
//   item      : 'fragment_cristallin' | string      (un item ajouté à la cargaison)
//   status    : 'blessure_legere' | ...             (statut infligé à un membre random ou ciblé)
//   target    : 'random' | 'specific'                (qui reçoit le statut)
//   threat    : +N                                   (modifie la menace globale de l'expé)
//   morale    : +N|-N                                (sur tous les membres présents)
//   log       : string (loggé au journal)
//   end       : true → l'expédition s'arrête là (succès)
//   retreat   : true → retraite anticipée (équipe rentre)


// ============================================================
//   CHRONIQUES PLANÉTAIRES (0.24)
// ============================================================
// Mini-sagas attachées à une planète, avec épisodes séquentiels,
// personnages persistants, flags, choix qui modifient la suite.
// ============================================================

// Vérifie si une planète remplit les conditions d'une chronique
function bodyMatchesChronicleReqs(body, requires) {
  if (!requires) return true;
  if (requires.ruines) {
    const allowed = Array.isArray(requires.ruines) ? requires.ruines : [requires.ruines];
    if (!allowed.includes(body.ruines)) return false;
  }
  if (requires.biome) {
    const allowed = Array.isArray(requires.biome) ? requires.biome : [requires.biome];
    if (!allowed.includes(body.biome)) return false;
  }
  if (requires.atmosphere) {
    const allowed = Array.isArray(requires.atmosphere) ? requires.atmosphere : [requires.atmosphere];
    if (!allowed.includes(body.atmosphere)) return false;
  }
  if (requires.vie) {
    const allowed = Array.isArray(requires.vie) ? requires.vie : [requires.vie];
    if (!allowed.includes(body.vie)) return false;
  }
  if (requires.danger) {
    const allowed = Array.isArray(requires.danger) ? requires.danger : [requires.danger];
    if (!allowed.includes(body.danger)) return false;
  }
  return true;
}

// À la première arrivée sur une planète, tente d'y attribuer une chronique
function tryAssignChronicle(body) {
  if (body.chronicle) return; // déjà attribuée (ou refusée)
  if (body.chronicleChecked) return; // déjà vérifiée, pas la peine de rejouer la roulette
  body.chronicleChecked = true;
  
  // Une chronique est une saga unique : on exclut celles déjà attribuées à un autre corps
  const taken = new Set();
  for (const sys of S.galaxy?.systems || []) {
    for (const b of sys.bodies || []) if (b !== body && b.chronicle?.id) taken.add(b.chronicle.id);
  }
  const candidates = [];
  for (const id in CHRONICLES) {
    const c = CHRONICLES[id];
    if (!taken.has(c.id) && bodyMatchesChronicleReqs(body, c.requires)) {
      candidates.push(c);
    }
  }
  if (candidates.length === 0) return;
  // Ordre aléatoire : sinon la première chronique compatible est toujours favorisée
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Tirage avec la spawnChance de chaque chronique
  for (const c of candidates) {
    if (Math.random() < (c.spawnChance || 0.2)) {
      body.chronicle = {
        id: c.id,
        episodeIdx: 0,        // 0 = ép. 1 pas encore joué
        flags: { ...c.initialFlags },
        completed: false,
        currentSceneId: null  // scène en cours dans l'épisode courant
      };
      log('success', `<em>${c.nom}</em> — Une chronique se révèle sur ${body.name}.`);
      // 0.26 : notification dédiée
      notif.chronicleStart(c.nom, body.name);
      return;
    }
  }
}

// Retourne la chronique active sur une planète, ou null
export function activeChronicle(body) {
  if (!body || !body.chronicle || body.chronicle.completed) return null;
  return CHRONICLES[body.chronicle.id] || null;
}

// Retourne l'épisode courant à jouer pour cette planète
export function currentChronicleEpisode(body) {
  const c = activeChronicle(body);
  if (!c) return null;
  const idx = body.chronicle.episodeIdx;
  if (idx >= c.episodes.length) return null;
  return c.episodes[idx];
}

// Retourne le texte d'intro de l'épisode courant (texte dynamique selon flags)
export function chronicleEpisodeIntro(body) {
  const ep = currentChronicleEpisode(body);
  if (!ep) return null;
  const flags = body.chronicle.flags;
  // Priorité : intro spécifique selon flag
  if (ep.introByFlag) {
    for (const flagKey in ep.introByFlag) {
      const v = flags[flagKey];
      const table = ep.introByFlag[flagKey];
      if (v != null && table[v] != null) {
        return table[v];
      }
      // Flag numérique au-delà des paliers prévus (ex. tone_compris 5) : palier le plus proche en dessous
      if (typeof v === 'number') {
        const steps = Object.keys(table).map(Number).filter(n => Number.isFinite(n) && n <= v);
        if (steps.length) return table[Math.max(...steps)];
      }
    }
  }
  return ep.defaultIntro || ep.intro || '';
}


// Applique setFlags : valeur directe OU "+1"/"-1" pour incrément
function applyFlagChanges(body, changes) {
  if (!body.chronicle || !changes) return;
  for (const k in changes) {
    const v = changes[k];
    if (typeof v === 'string' && (v.startsWith('+') || v.startsWith('-'))) {
      const delta = parseInt(v, 10);
      if (!isNaN(delta)) {
        body.chronicle.flags[k] = (body.chronicle.flags[k] || 0) + delta;
        continue;
      }
    }
    body.chronicle.flags[k] = v;
  }
}

// Trouve une scène de chronique par id
function findChronicleScene(id) {
  return CHRONICLE_SCENES.find(s => s.id === id) || null;
}


// Marque l'épisode courant comme terminé et passe au suivant.
// exp (optionnel) : l'expédition qui a joué l'épisode — évite de sauter un épisode
// si une autre expédition a déjà conclu le même entre-temps.
function endChronicleEpisode(body, exp) {
  if (!body.chronicle || body.chronicle.completed) return;
  const playedIdx = exp?.chronicleRef?.episodeIdx;
  if (typeof playedIdx === 'number' && playedIdx !== body.chronicle.episodeIdx) return;
  body.chronicle.episodeIdx++;
  body.chronicle.currentSceneId = null;
  const c = CHRONICLES[body.chronicle.id];
  if (!c) return;
  if (body.chronicle.episodeIdx >= c.episodes.length) {
    body.chronicle.completed = true;
    body.chronicle.ending = body.chronicle.ending || 'completed';
    log('success', `Chronique <em>${c.nom}</em> achevée sur ${body.name}.`);
    // 0.26 : notification dédiée
    notif.chronicleDone(c.nom);
  } else {
    const epTitle = c.episodes[body.chronicle.episodeIdx-1].title;
    log('neutral', `Épisode <em>${epTitle}</em> achevé. Reviens pour la suite.`);
    // 0.26 : notification dédiée
    notif.episodeDone(c.nom, epTitle);
  }
}

// Marque la chronique comme terminée avec une fin spécifique
function endChronicleWith(body, endingId) {
  if (!body.chronicle || body.chronicle.completed) return;
  body.chronicle.completed = true;
  body.chronicle.currentSceneId = null;
  body.chronicle.ending = endingId;
  const c = CHRONICLES[body.chronicle.id];
  if (c) {
    const endingText = c.endings?.[endingId] || 'Fin de la chronique.';
    log('success', `<em>${c.nom}</em> — ${endingText}`);
    // 0.26 : notification dédiée
    notif.chronicleDone(c.nom);
  }
}

// Id de la scène-intro synthétique d'un épisode de chronique. Elle n'existe ni
// dans SCENES ni dans CHRONICLE_SCENES : l'expédition ne stocke que cet id et
// currentScene() la reconstruit à partir du corps céleste (y compris pour les
// sauvegardes faites avant ce correctif).
const CHRON_INTRO_ID = '__chron_intro__';

// Construit la scène-intro de l'épisode courant d'une chronique (ou null)
function chronicleIntroScene(body) {
  const episode = currentChronicleEpisode(body);
  if (!episode) return null;
  return {
    id: CHRON_INTRO_ID,
    tags: ['__chronicle_intro__'],
    text: chronicleEpisodeIntro(body) || episode.title || '',
    choices: [
      { label: "Avancer", outcome: { next: episode.firstScene } }
    ]
  };
}

// Vrai si l'expédition joue (ou va jouer) un épisode de chronique
function isChronicleExpedition(exp) {
  return !!exp && (!!exp.chronicleSceneId || exp.scenes?.[0] === CHRON_INTRO_ID);
}

// Construit la séquence de scènes pour l'épisode courant d'une chronique.
// La séquence ne contient que la scène-intro synthétique : la première scène
// de l'épisode puis les suivantes sont résolues dynamiquement par le moteur
// d'expédition via les outcome.next (exp.chronicleSceneId).
function buildChronicleEpisodeScenes(body) {
  const introScene = chronicleIntroScene(body);
  if (!introScene) return null;
  body.chronicle.currentSceneId = CHRON_INTRO_ID;
  return [introScene];
}


// ---- Sélection des scènes pour une expédition ----
// Détermine les tags actifs d'une planète et tire 5-10 scènes cohérentes
function selectExpeditionScenes(body, rng, opts = {}) {
  // 0.24 — D'abord, on tente d'attribuer une chronique si pas déjà fait
  if (!opts.skipChronicle) tryAssignChronicle(body);
  
  // Si la planète a une chronique active avec un épisode à jouer,
  // on remplace la sélection normale par la séquence de l'épisode.
  const chronScenes = opts.skipChronicle ? null : buildChronicleEpisodeScenes(body);
  if (chronScenes) {
    return chronScenes;
  }
  
  const tags = [];
  // Tags du biome
  if (body.biome) tags.push('biome_' + body.biome);
  // Tags d'atmosphère
  if (body.atmosphere === 'toxique') tags.push('atm_toxique');
  if (body.atmosphere === 'aucune')  tags.push('atm_vide');
  if (body.atmosphere === 'anormale') tags.push('atm_anormale');
  // Tags vie
  if (body.vie === 'aucune') tags.push('aucune_vie');
  if (body.vie === 'flore_agressive') tags.push('flore_agressive');
  if (body.vie === 'faune') tags.push('faune');
  if (body.vie === 'civ_active') tags.push('civ_active');
  if (body.vie === 'civ_dechue') tags.push('civ_dechue');
  if (body.signal === 'sos') tags.push('signal_sos', 'signal');
  if (body.signal === 'crypte') tags.push('signal_crypte', 'signal');
  if (['bruit_blanc','echo_temporel'].includes(body.signal)) tags.push('signal', 'anomalie');
  if (body.ruines === 'humaines') tags.push('ruines', 'ruines_humaines');
  if (body.ruines === 'alien_a') tags.push('ruines', 'ruines_alien_a');
  if (body.ruines === 'alien_b') tags.push('ruines', 'ruines_alien_b');
  if (body.ruines === 'fusion') tags.push('ruines', 'ruines_humaines', 'ruines_alien_a', 'sombre');
  if (body.danger === 'predateurs') tags.push('predateurs');
  if (body.danger === 'tempetes') tags.push('tempetes');
  if (body.danger === 'faille') tags.push('faille');
  if (body.danger === 'ia_hostile') tags.push('ia_hostile');
  if (body.danger === 'anomalie') tags.push('anomalie');
  if (body.danger === 'pathogene') tags.push('pathogene');
  if (body.type === 'epave') tags.push('epave', 'sombre');
  if (body.type === 'station') tags.push('station');

  // Découpe : intro + corps (3-7) + outro
  const intros = SCENES.filter(s => s.tags.includes('intro') &&
    s.tags.every(t => t === 'intro' || tags.includes(t) || t === 'signal' && body.signal !== 'aucun'));
  // (le tag 'ruines' est présent dans tags dès que le corps a des ruines)
  const outros = SCENES.filter(s => s.tags.includes('outro') &&
    s.tags.every(t => t === 'outro' || tags.includes(t)));

  const bodyScenes = SCENES.filter(s => {
    if (s.tags.includes('intro') || s.tags.includes('outro')) return false;
    // Scènes "fusion only" : seulement sur ruines de type 'fusion'
    if (s.requireFusion && body.ruines !== 'fusion') return false;
    if (s.tags.includes('filler')) return true;  // filler matche partout
    return s.tags.some(t => tags.includes(t));
  });

  // Sélection
  const picks = [];
  // Intro
  if (intros.length > 0) {
    picks.push(weightedPick(intros, rng));
  } else {
    picks.push(SCENES.find(s => s.id === 'intro_atterrissage'));
  }
  // Corps : 3 à 7 scènes uniques
  const numBody = 3 + Math.floor(rng() * 5);
  const used = new Set([picks[0].id]);
  let attempts = 0;
  while (picks.length - 1 < numBody && attempts < 30 && bodyScenes.length > 0) {
    const s = weightedPick(bodyScenes, rng);
    if (!used.has(s.id)) {
      picks.push(s);
      used.add(s.id);
    }
    attempts++;
  }
  // Outro
  if (outros.length > 0) {
    picks.push(weightedPick(outros, rng));
  } else {
    picks.push(SCENES.find(s => s.id === 'outro_retour'));
  }
  // 0.21 — Embuscade prioritaire si faction hostile sur ce body
  if (body.factionId && S.factions?.[body.factionId]) {
    const f = S.factions[body.factionId];
    if (f.reputation <= -60) {
      const embuscade = SCENES.find(s => s.id === 'embuscade_faction');
      if (embuscade) {
        // Insère après l'intro (donc à index 1 du tableau picks final)
        picks.splice(1, 0, embuscade);
      }
    }
  }
  return picks;
}

function weightedPick(arr, rng) {
  const total = arr.reduce((s,o) => s + (o.weight || 1), 0);
  let r = rng() * total;
  for (const o of arr) { r -= (o.weight || 1); if (r <= 0) return o; }
  return arr[arr.length - 1];
}

// Substitue les variables dans le texte d'une scène
export function fillTemplate(text, ctx = {}) {
  return String(text ?? '')
    .replace(/\{vaisseau\}/g, ctx.vesselName || 'le vaisseau')
    .replace(/\{planete\}/g, ctx.bodyName || 'la planète')
    .replace(/\{biomeFrag\}/g, BIOMES[ctx.body?.biome]?.frag || '')
    .replace(/\{atmFrag\}/g, ATMOSPHERES[ctx.body?.atmosphere]?.frag || '')
    .replace(/\{signalFrag\}/g, SIGNAUX[ctx.body?.signal]?.frag || '')
    .replace(/\{ruinesFrag\}/g, RUINES[ctx.body?.ruines]?.frag || '');
}

// ============================================================
// Catalogue des statuts médicaux (cf. doc d'archi §8.5.2)
// ============================================================
// kind        : famille (mecanique, biologique, psy, exotique)
// detect      : 'auto' (visible immédiatement) | { needSkill, dc, needLab }
// hidden      : si vrai, le statut apparaît comme "Anomalie suspecte" avant diagnostic
// medLvlReq   : niveau d'infirmerie minimum pour traiter
// contagion   : { perDay (0–1), kind: même kind contagieux } ou null
// untreated   : { afterMin: action } — ce qui se passe si non traité
//               (V1 : délais en secondes réelles — afterMin garde son nom historique)
// onCured     : { sequelChance, sequels: [...] } — séquelles potentielles
// moralImpact : impact passif sur moral / jour
export const STATUTS = {
  blessure_legere: {
    nom: 'Blessure légère',
    short: "Coupure, contusion, entorse mineure.",
    kind: 'mecanique',
    severity: 1,
    detect: 'auto',
    medLvlReq: 1,
    statMod: { vigueur:-1, dexterite:-1 },
    moralImpact: -0.5,
    untreated: { afterMin: 24*3600, become: null, selfCure: true },  // guérit seul en 24 h réelles
    onCured: { sequelChance: 0 }
  },
  blessure_grave: {
    nom: 'Blessure grave',
    short: "Fracture ouverte, hémorragie, plaie profonde.",
    kind: 'mecanique',
    severity: 4,
    detect: 'auto',
    medLvlReq: 1,
    statMod: { vigueur:-3 },
    moralImpact: -2,
    untreated: { afterMin: 12*3600, become: 'mort' },  // mortelle sans soin en 12 h réelles
    onCured: { sequelChance: 0.4, sequels: ['boiteux', 'cicatrice'] }
  },
  infection: {
    nom: 'Infection',
    short: "Plaie infectée, fièvre, sueurs.",
    kind: 'biologique',
    severity: 3,
    detect: 'auto',
    medLvlReq: 2,
    statMod: { vigueur:-2 },
    moralImpact: -1,
    contagion: { perDay: 0.05 },
    untreated: { afterMin: 36*3600, become: 'mort' },  // 36 h réelles
    onCured: { sequelChance: 0.1, sequels: ['fragile_pulm'] }
  },
  pathogene_alien: {
    nom: 'Pathogène alien',
    short: "Symptômes erratiques, fièvre, mutations cellulaires.",
    kind: 'exotique',
    severity: 5,
    detect: { needSkill: 'medecine', dc: 3, needLab: true },
    hidden: true,
    medLvlReq: 3,
    statMod: { vigueur:-2, intellect:-1 },
    moralImpact: -2,
    contagion: { perDay: 0.10 },
    untreated: { afterMin: 48*3600, become: 'mort' },  // 48 h réelles
    onCured: { sequelChance: 0.5, sequels: ['mutation_xeno', 'cicatrice_xeno'] }
  },
  trauma_psy: {
    nom: 'Trauma psychologique',
    short: "Cauchemars, sursauts, repli sur soi.",
    kind: 'psy',
    severity: 3,
    detect: { needSkill: 'medecine', dc: 2 },
    hidden: true,
    medLvlReq: 4,
    statMod: { sangfroid:-3 },
    moralImpact: -3,
    untreated: { afterMin: 60*3600, become: 'mutinerie' },  // 60 h réelles
    onCured: { sequelChance: 0.2, sequels: ['esprit_fele'] }
  },
  parasite: {
    nom: 'Parasite',
    short: "Fatigue, perte d'appétit, signes corporels discrets.",
    kind: 'biologique',
    severity: 4,
    detect: { needSkill: 'medecine', dc: 4, needLab: true },
    hidden: true,
    medLvlReq: 3,
    statMod: { vigueur:-1 },
    moralImpact: -0.5,
    untreated: { afterMin: 84*3600, become: 'eclosion' },  // 3,5 jours réels
    onCured: { sequelChance: 0.3, sequels: ['cicatrice'] }
  },
  mutation: {
    nom: 'Mutation',
    short: "Modifications physiologiques observables.",
    kind: 'exotique',
    severity: 3,
    detect: 'auto',  // apparente après quelques heures
    revealAfter: 12*3600,   // apparente après 12 h réelles
    medLvlReq: 5,
    statMod: {},   // déterminé au moment de l'apparition (positif ou négatif)
    moralImpact: -1,
    untreated: { afterMin: -1, become: 'permanent' },  // reste, devient un trait
    onCured: { sequelChance: 0.1 }
  }
};


// Catalogue des séquelles permanentes (traits négatifs ou ambigus)
export const SEQUELS = {
  boiteux:        { nom:'Boiteux',          desc:"Démarche entravée, -2 Dextérité." },
  cicatrice:      { nom:'Marqué',           desc:"Cicatrice visible, -1 Charisme." },
  cicatrice_xeno: { nom:'Cicatrice xeno',   desc:"-1 Charisme, +1 résistance pathogène alien." },
  fragile_pulm:   { nom:'Souffle court',    desc:"-2 Vigueur après effort prolongé." },
  esprit_fele:    { nom:'Esprit fêlé',      desc:"-2 Sang-froid, hallucinations rares." },
  mutation_xeno:  { nom:'Mutation xeno',    desc:"Effet aléatoire (positif ou négatif). Permanent." }
};

// Diagnostic d'un statut caché : test contre DC, modulé par skill du médecin
function rollDiagnostic(memberId, statutKey, doctor) {
  const statut = STATUTS[statutKey];
  if (!statut.detect || statut.detect === 'auto') return true;
  const det = statut.detect;
  const skill = doctor ? (doctor.skills[det.needSkill] || 0) : 0;
  const intel = doctor ? doctor.stats.intellect : 5;
  // Bonus Spécialiste de l'infirmerie
  const bonus = infirmaryBonuses().diagBonus;
  // Roll 1d6 + skill + (intel-5)/2 + bonus vs DC
  const roll = 1 + Math.floor(Math.random() * 6);
  const total = roll + skill + Math.floor((intel - 5) / 2) + bonus;
  return total >= det.dc;
}

// ============================================================
// 3. STATE — structure d'état + reducers

// Bonus apportés par le staff du Hangar aux expéditions
// Renvoie { fuelMult, speedMult } — appliqués au calcul de coût/durée
export function hangarBonuses() {
  const staff = staffOf('hangar');
  let fuelMult = 1.0;     // Mécano de bord (Production) → -10% chacun
  let speedMult = 1.0;    // Chef pilote (Qualité) → -10% durée chacun
  for (const { job } of staff) {
    if (job.role === 'production') fuelMult *= 0.90;
    else if (job.role === 'qualite') speedMult *= 0.90;
  }
  if (fuelMult < 0.6) fuelMult = 0.6;
  if (speedMult < 0.6) speedMult = 0.6;
  return { fuelMult, speedMult };
}

// Calcule la durée en minutes-jeu de la formation
function computeTrainingDuration(member, skill, targetLvl) {
  const base = TRAINING_PROGRAMS[skill].baseHours * PACING.TRAINING_UNIT; // en secondes réelles
  let mult = Math.sqrt(targetLvl);
  // Modificateurs liés aux traits
  if (member.traits.includes('memoire_eidetique')) mult *= 0.7;
  if (member.traits.includes('lent'))              mult *= 1.5;
  if (member.traits.includes('reveur'))            mult *= 1.1;
  if (member.traits.includes('insomniaque'))       mult *= 1.15;
  // Bonus Centre de formation (Pédagogue, Assistant)
  mult *= formationBonuses().speedMult;
  // Bonus de tech (génétique appliquée)
  mult *= techEffectsAccumulated().trainingSpeedMult;
  return Math.round(base * mult);
}

// Calcule le coût total ressources
function computeTrainingCost(skill, targetLvl) {
  const prog = TRAINING_PROGRAMS[skill];
  const total = {};
  for (const k in prog.baseCost) total[k] = prog.baseCost[k] * targetLvl;
  if (prog.extra && targetLvl >= prog.extraFromLevel) {
    for (const k in prog.extra) total[k] = (total[k] || 0) + prog.extra[k];
  }
  return total;
}

// Chance d'échec (0–1)
function computeFailChance(member) {
  let chance = 0.05;
  const sf = member.stats.sangfroid || 5;
  chance += (5 - sf) * 0.01;       // sangfroid 8 → -3%, sangfroid 3 → +2%
  if (member.traits.includes('distrait')) chance += 0.05;
  if (member.traits.includes('beni'))     chance -= 0.03;
  // Bonus Pédagogue de formation
  chance += formationBonuses().failChanceDelta;
  return Math.max(0, Math.min(0.5, chance));
}

// Vérifie si l'on peut lancer une formation. Renvoie { ok, reason, cost, duration, instructor, failChance }.
export function canTrain(memberId, skill) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Colon introuvable" };
  // V1 : un colon en poste peut se former sans être désaffecté (son poste lui reste réservé)
  if (member.statut !== 'libre' && member.statut !== 'travail') return { ok:false, reason:`Colon ${member.statut}` };
  if (isTreatingDoctor(member.id)) return { ok:false, reason:"Assure un traitement en cours" };
  const target = trainingTargetLevel(member, skill);
  if (target === null) {
    const cur = member.skills[skill] || 0;
    if (cur >= 5) return { ok:false, reason:"Skill déjà au maximum (5)" };
    const centerLvl = S.modules.formation?.level || 0;
    return { ok:false, reason:`Centre niv ${centerLvl} : plafond skill ${centerLvl+1}` };
  }
  // Places dispo dans le centre
  const cap = (S.modules.formation?.level || 0);
  const inUse = S.training.length;
  if (inUse >= cap) return { ok:false, reason:`Toutes les places (${cap}) sont occupées` };
  // Instructeur si target ≥ 3
  let instructor = null;
  if (target >= 3) {
    instructor = findInstructor(skill, target, memberId);
    if (!instructor) return { ok:false, reason:`Aucun instructeur disponible (skill ${SKILL_LABELS[skill]} ≥ ${target} requis)` };
  }
  // Coût
  const cost = computeTrainingCost(skill, target);
  for (const k in cost) {
    if (S.res[k] < cost[k]) return { ok:false, reason:`Ressources insuffisantes (${RES_LABELS[k]})` };
  }
  return {
    ok: true,
    target,
    cost,
    duration: computeTrainingDuration(member, skill, target),
    instructor,
    failChance: computeFailChance(member)
  };
}

export function startTraining(memberId, skill) {
  const r = canTrain(memberId, skill);
  if (!r.ok) { toast(r.reason); return; }
  const member = S.crew.find(m => m.id === memberId);
  // 0.22 — Le poste reste réservé pendant la formation, le colon le reprendra au retour.
  // Débite ressources
  for (const k in r.cost) S.res[k] -= r.cost[k];
  // Ouvre la session
  const session = {
    id: uid('t'),
    memberId,
    skill,
    targetLvl: r.target,
    totalMin: r.duration,
    doneMin: 0,
    cost: r.cost,
    failChance: r.failChance,
    instructorId: r.instructor?.id || null
  };
  S.training.push(session);
  member.statut = 'formation';
  log('neutral', `<em>${member.name}</em> entre en formation : ${TRAINING_PROGRAMS[skill].nom} (→ niv ${r.target}). Durée : ${fmtDuree(r.duration)}.`);
  render();
}

export function finishTraining(session) {
  const member = S.crew.find(m => m.id === session.memberId);
  if (!member) {
    // Membre disparu (mort en parallèle ?), on ferme silencieusement
    return;
  }
  // Tirage d'échec
  const failed = Math.random() < session.failChance;
  if (failed) {
    member.moral = Math.max(0, member.moral - 10);
    log('warn', `Formation échouée : <em>${member.name}</em> (${TRAINING_PROGRAMS[session.skill].nom}). Moral entamé.`);
  } else {
    member.skills[session.skill] = session.targetLvl;
    let extra = '';
    // Bonus Curieux : +1 sur un skill aléatoire (différent)
    if (member.traits.includes('curieux')) {
      const others = SKILL_LIST.filter(s => s !== session.skill && (member.skills[s] || 0) < 5);
      if (others.length > 0) {
        const pick = others[Math.floor(Math.random() * others.length)];
        member.skills[pick] = (member.skills[pick] || 0) + 1;
        extra = ` Curiosité : +1 ${SKILL_LABELS[pick]}.`;
      }
    }
    // Spécialisation au skill 5
    let specMsg = '';
    if (session.targetLvl === 5) {
      const trait = SKILL_SPECIALIZATION[session.skill];
      if (trait && !member.traits.includes(trait)) {
        member.traits.push(trait);
        specMsg = ` Trait débloqué : <em>${TRAITS[trait].nom}</em>.`;
      }
    }
    log('success', `<em>${member.name}</em> achève sa formation en ${TRAINING_PROGRAMS[session.skill].nom} (niv ${session.targetLvl}).${extra}${specMsg}`);
    // 0.26 : notification dédiée
    notif.trainingDone(member.name, TRAINING_PROGRAMS[session.skill].nom);
  }
  // 0.22 — Reprend son poste s'il en a un, sinon devient libre + auto-assign
  returnToBase(member);
}

export function cancelTraining(sessionId) {
  const idx = S.training.findIndex(t => t.id === sessionId);
  if (idx < 0) return;
  const s = S.training[idx];
  const member = S.crew.find(m => m.id === s.memberId);
  // Rembourse 50% des ressources
  for (const k in s.cost) refundRes(k, Math.floor(s.cost[k] / 2));
  S.training.splice(idx, 1);
  if (member) {
    returnToBase(member);
  }
  log('warn', `Formation interrompue : <em>${member?.name || 'colon disparu'}</em>. 50% des ressources récupérées.`);
  render();
}

// ============================================================
//   INFIRMERIE — système de soins
// ============================================================

// Capacité de lits selon niveau d'infirmerie
export function infirmaryBeds() {
  return (S.modules.infirmerie?.level || 0) * 2;
}

// Lits actuellement occupés (= patients en cours de traitement OU en attente sur place)
export function bedsInUse() {
  // un patient en infirmerie occupe un lit dès qu'il y est admis
  return S.crew.filter(m => m.statut === 'infirmerie').length;
}

// ---- Référencement des statuts traités ----
// Un traitement vise un statut par sa clé (`statutKey`), unique par colon
// puisque inflictStatus dédoublonne. `statusIdx` (index dans member.statuts)
// est conservé pour l'UI, mais il est recalé après chaque retrait de statut :
// une auto-guérison ou une éclosion décale les index suivants.

// Retrouve un statut par son index (API historique de l'UI) ou par sa clé.
// Renvoie { status, idx } ou null.
function findMemberStatus(member, ref) {
  if (!member || !Array.isArray(member.statuts)) return null;
  const idx = typeof ref === 'string'
    ? member.statuts.findIndex(s => s.key === ref)
    : (Number.isInteger(ref) ? ref : -1);
  const status = idx >= 0 ? member.statuts[idx] : null;
  return status ? { status, idx } : null;
}

// Traitement en cours sur le statut `statutKey` d'un colon (ou null)
export function treatmentOf(memberId, statutKey) {
  return (S.treatments || []).find(t => t.memberId === memberId && t.statutKey === statutKey) || null;
}

// Recale statusIdx des traitements d'un colon sur l'état actuel de member.statuts.
// À appeler après tout retrait de statut. Un traitement dont le statut a disparu est retiré.
export function syncTreatmentIndexes(member) {
  if (!member || !Array.isArray(S.treatments) || !Array.isArray(member.statuts)) return;
  for (let i = S.treatments.length - 1; i >= 0; i--) {
    const t = S.treatments[i];
    if (t.memberId !== member.id) continue;
    if (!t.statutKey) t.statutKey = member.statuts[t.statusIdx]?.key;  // sauvegarde antérieure
    const idx = t.statutKey ? member.statuts.findIndex(s => s.key === t.statutKey) : -1;
    if (idx < 0) S.treatments.splice(i, 1);
    else t.statusIdx = idx;
  }
}

// Trouve le meilleur médecin disponible.
// Priorité 1 : staff de l'infirmerie avec skill Médecine > 0 (en `travail`)
// Priorité 2 : tout colon libre avec skill Médecine > 0 (fallback si pas de staff)
export function bestAvailableDoctor(excludeId = null) {
  // Priorité au staff infirmerie en service
  const infirmaryStaff = staffOf('infirmerie')
    .map(s => s.member)
    .filter(m => m.id !== excludeId && (m.skills.medecine || 0) > 0)
    .sort((a, b) => (b.skills.medecine || 0) - (a.skills.medecine || 0));
  if (infirmaryStaff.length > 0) return infirmaryStaff[0];
  // Fallback : un colon libre avec Médecine
  return S.crew
    .filter(m => m.id !== excludeId && m.statut === 'libre' && (m.skills.medecine || 0) > 0)
    .sort((a, b) => (b.skills.medecine || 0) - (a.skills.medecine || 0))[0] || null;
}

// Bonus apportés par le staff de l'infirmerie aux soins
// Renvoie { treatmentSpeedMult, diagBonus, traitMedecinNe }
export function infirmaryBonuses() {
  const staff = staffOf('infirmerie');
  let speedMult = 1.0;
  let diagBonus = 0;
  let traitMedecinNe = false;
  for (const { member, job } of staff) {
    if (job.role === 'qualite') {
      // Spécialiste : -25% durée, +1 au jet de diag
      speedMult *= 0.75;
      diagBonus += 1;
    } else if (job.role === 'support') {
      // Infirmier / Aide-soignant / Médecin de campagne : -10% durée chacun, plancher 50%
      speedMult *= 0.90;
    }
    if (member.traits.includes('medic_ne')) traitMedecinNe = true;
  }
  // Plancher
  if (speedMult < 0.5) speedMult = 0.5;
  return { speedMult, diagBonus, traitMedecinNe };
}

// Statuts « contaminants » bloqués en expédition par tech_membrane_adaptive
const EXPEDITION_CONTAMINANTS = ['pathogene_alien', 'infection', 'parasite'];

// Inflige un statut à un membre. Si caché, pose "Anomalie suspecte" jusqu'au diagnostic.
// opts.internal : évolution d'un mal déjà présent (ex. éclosion d'un parasite),
// et non une exposition : ni l'instinct du Survivant ni les membranes ne l'évitent.
export function inflictStatus(member, statutKey, source = '', opts = {}) {
  if (!member || member.statut === 'mort') return;
  const def = STATUTS[statutKey];
  if (!def) return;
  if (!Array.isArray(member.statuts)) member.statuts = [];
  // Évite les doublons exacts
  if (member.statuts.some(s => s.key === statutKey)) return;
  // Membranes adaptives (expeditionToxicImmune) : l'équipe d'expédition est
  // immunisée contre les contaminations biologiques du terrain
  if (!opts.internal && EXPEDITION_CONTAMINANTS.includes(statutKey)
      && (member.statut === 'expedition' || /^exp[ée]dition/i.test(source))
      && techEffectsAccumulated().expeditionToxicImmune) {
    log('neutral', `La membrane adaptive de <em>${member.name}</em> bloque la contamination.`);
    return;
  }
  // Survivant résiste 50% du temps
  if (!opts.internal && (member.traits || []).includes('survivant') && Math.random() < 0.5) {
    log('neutral', `<em>${member.name}</em> évite ${def.nom.toLowerCase()} grâce à son instinct.`);
    return;
  }
  // Un statut à révélation différée (revealAfter, ex. mutation) reste une
  // « anomalie » jusqu'à son apparition (progressMemberStatuts) ou un diagnostic
  const visible = !def.hidden && !def.revealAfter;
  const status = {
    key: statutKey,
    since: S.meta.gameMin,
    revealed: visible,
    revealAt: def.revealAfter ? S.meta.gameMin + def.revealAfter : null,
    diagnosed: visible,
    statMod: def.statMod || {}
  };
  // Cas mutation : déterminer le mod (50/50 positif / négatif)
  if (statutKey === 'mutation') {
    if (Math.random() < 0.5) {
      status.statMod = { vigueur: +1, charisme: -1 };
      status.flavor = 'positive';
    } else {
      status.statMod = { vigueur: -2, sangfroid: -1 };
      status.flavor = 'negative';
    }
  }
  member.statuts.push(status);
  member.sante = Math.max(0, member.sante - def.severity * 5);
  const noun = visible ? `<em>${def.nom}</em>` : "un état suspect";
  log('warn', `<em>${member.name}</em> présente ${noun}${source ? ' — ' + source : ''}.`);
}

// Le membre se présente à l'infirmerie (admission)
export function admitToInfirmary(memberId) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return;
  if (member.statut === 'mort' || member.statut === 'infirmerie') return;
  // Seul un colon présent à la base peut être admis (pas en expédition ni en mission)
  if (!['libre', 'travail', 'formation'].includes(member.statut)) {
    toast(`${member.name} n'est pas à la base.`);
    return;
  }
  if (infirmaryBeds() <= bedsInUse()) {
    toast("Infirmerie pleine — choisir un triage.");
    return;
  }
  // Si en formation, on annule la formation
  if (member.statut === 'formation') {
    const t = S.training.find(t => t.memberId === memberId);
    if (t) cancelTraining(t.id);
  }
  // 0.22 — Le poste reste réservé pendant les soins, le colon le reprendra au retour.
  member.statut = 'infirmerie';
  log('neutral', `<em>${member.name}</em> est admis(e) à l'infirmerie.`);
  render();
}

export function dischargeMember(memberId) {
  const member = S.crew.find(m => m.id === memberId);
  // Ne concerne qu'un patient admis : ne « rapatrie » pas un colon absent
  if (!member || member.statut !== 'infirmerie') return;
  // Annule traitements en cours
  S.treatments = S.treatments.filter(t => {
    if (t.memberId === memberId) {
      // rembourse 30%
      for (const k in t.cost) refundRes(k, Math.floor(t.cost[k] * 0.3));
      return false;
    }
    return true;
  });
  returnToBase(member);
  log('neutral', `<em>${member.name}</em> sort de l'infirmerie.`);
  render();
}

// Délai minimal entre deux examens d'un même statut après un échec (ticks, cf. PACING)
export const DIAG_RETRY_MIN = PACING.DIAG_RETRY;

// Vérifie qu'un diagnostic est lançable. statusRef : index (UI) ou clé du statut.
// Renvoie { ok, reason, cost, doctor, waitMin? } — utilisable par l'UI pour le bouton.
// opts.assumeAdmitted : évalue comme si le patient était déjà admis (soins en un geste).
export function canDiagnose(memberId, statusRef, opts = {}) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Patient introuvable" };
  if (member.statut !== 'infirmerie' && !opts.assumeAdmitted) return { ok:false, reason:"Le patient doit être admis avant." };
  const found = findMemberStatus(member, statusRef);
  if (!found) return { ok:false, reason:"Statut introuvable" };
  const { status, idx: statusIdx } = found;
  if (status.diagnosed) return { ok:false, reason:"Déjà diagnostiqué" };
  const def = STATUTS[status.key];
  if (!def) return { ok:false, reason:"Statut inconnu" };
  const det = (def.detect && typeof def.detect === 'object') ? def.detect : {};
  if (det.needLab && !S.flags.recherche) return { ok:false, reason:"Laboratoire requis pour ce diagnostic." };
  const doctor = bestAvailableDoctor(member.statut === 'infirmerie' ? null : memberId);
  if (!doctor) return { ok:false, reason:"Aucun médecin disponible." };
  // Un examen non concluant ne peut être refait qu'après un délai
  const waitMin = typeof status.lastDiagAt === 'number' ? status.lastDiagAt + DIAG_RETRY_MIN - S.meta.gameMin : 0;
  if (waitMin > 0) return { ok:false, reason:`Nouvel examen possible dans ${fmtDuree(waitMin)}`, waitMin };
  // Coût simple : 2 datacubes pour usage labo, sinon 0
  const cost = det.needLab ? { datacubes: 2 } : {};
  for (const k in cost) {
    if ((S.res[k] || 0) < cost[k]) return { ok:false, reason:`Ressources insuffisantes (${RES_LABELS[k]})` };
  }
  return { ok:true, member, status, statusIdx, def, doctor, cost };
}

// Lance un diagnostic actif sur un statut caché (statusRef : index ou clé)
export function startDiagnostic(memberId, statusRef) {
  const r = canDiagnose(memberId, statusRef);
  if (!r.ok) {
    if (r.reason !== "Déjà diagnostiqué") toast(r.reason);
    return;
  }
  const { member, status, def, doctor, cost } = r;
  for (const k in cost) S.res[k] -= cost[k];
  // Diagnostic instantané : le médecin garde son statut (et son poste)
  const success = rollDiagnostic(member.id, status.key, doctor);
  if (success) {
    status.diagnosed = true;
    status.revealed = true;
    delete status.lastDiagAt;
    log('success', `Diagnostic posé par <em>${doctor.name}</em> : <em>${member.name}</em> souffre de <em>${def.nom}</em>.`);
  } else {
    // Échec : nouvel examen possible seulement après DIAG_RETRY_MIN
    status.lastDiagAt = S.meta.gameMin;
    log('warn', `Diagnostic non concluant pour <em>${member.name}</em>. Nouvel examen possible dans ${fmtDuree(DIAG_RETRY_MIN)}.`);
  }
  render();
}

// Vérifie qu'un traitement est lançable.
// statusRef : index dans member.statuts (UI) ou clé du statut.
// opts.assumeAdmitted : évalue comme si le patient était déjà admis (soins en un geste).
export function canTreat(memberId, statusRef, opts = {}) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Patient introuvable" };
  if (member.statut !== 'infirmerie' && !opts.assumeAdmitted) return { ok:false, reason:"Patient non admis" };
  const found = findMemberStatus(member, statusRef);
  if (!found) return { ok:false, reason:"Statut introuvable" };
  const { status, idx: statusIdx } = found;
  if (!status.diagnosed) return { ok:false, reason:"Diagnostic requis avant traitement" };
  // Déjà en cours ? (par clé : l'index d'un statut peut changer)
  if (treatmentOf(memberId, status.key)) {
    return { ok:false, reason:"Traitement déjà en cours" };
  }
  const def = STATUTS[status.key];
  if (!def) return { ok:false, reason:"Statut inconnu" };
  const infLvl = S.modules.infirmerie?.level || 0;
  if (infLvl < def.medLvlReq) {
    return { ok:false, reason:`Infirmerie niv ${def.medLvlReq} requise (actuelle : ${infLvl})` };
  }
  const tdef = TREATMENTS[status.key]?.[0];
  if (!tdef) return { ok:false, reason:"Aucun traitement disponible" };
  const doctor = bestAvailableDoctor(member.statut === 'infirmerie' ? null : memberId);
  // Même un soin bénin (requiresMedSkill 0) demande quelqu'un pour le prodiguer
  if (!doctor) return { ok:false, reason:"Aucun médecin disponible" };
  if ((doctor.skills.medecine || 0) < tdef.requiresMedSkill) {
    return { ok:false, reason:`Médecin avec Médecine ≥ ${tdef.requiresMedSkill} requis` };
  }
  for (const k in tdef.cost) {
    if (S.res[k] < tdef.cost[k]) return { ok:false, reason:`Ressources insuffisantes (${RES_LABELS[k]})` };
  }
  return { ok:true, treatment:tdef, doctor, def, status, statusIdx };
}

// statusRef : index dans member.statuts (UI) ou clé du statut
export function startTreatment(memberId, statusRef) {
  const r = canTreat(memberId, statusRef);
  if (!r.ok) { toast(r.reason); return; }
  const member = S.crew.find(m => m.id === memberId);
  // Modifie durée selon skill du médecin et trait Médecin né
  let duration = r.treatment.durationMin;
  const medSkill = r.doctor.skills.medecine || 0;
  duration *= Math.max(0.5, 1 - (medSkill - r.treatment.requiresMedSkill) * 0.1);
  if ((r.doctor.traits || []).includes('medic_ne')) duration *= 0.75;
  // Bonus du staff de l'infirmerie (Spécialiste, Infirmier, etc.)
  const bonuses = infirmaryBonuses();
  duration *= bonuses.speedMult;
  if (bonuses.traitMedecinNe && !(r.doctor.traits || []).includes('medic_ne')) duration *= 0.85;
  // Bonus de tech (pharmacopée)
  duration *= techEffectsAccumulated().treatmentSpeedMult;
  duration = Math.round(duration);
  // Débite les ressources une fois tous les calculs faits (rien n'est perdu en cas d'erreur)
  for (const k in r.treatment.cost) S.res[k] -= r.treatment.cost[k];
  S.treatments.push({
    id: uid('tr'),
    memberId,
    statusIdx: r.statusIdx,      // pour l'UI ; recalé par syncTreatmentIndexes
    statutKey: r.status.key,     // référence fiable du statut traité
    doctorId: r.doctor.id,
    totalMin: duration,
    doneMin: 0,
    cost: r.treatment.cost
  });
  log('neutral', `<em>${r.doctor.name}</em> entreprend le traitement de <em>${member.name}</em> (${r.def.nom}). Durée : ${fmtDuree(duration)}.`);
  render();
}

export function finishTreatment(treatment) {
  const member = S.crew.find(m => m.id === treatment.memberId);
  if (!member || member.statut === 'mort') return;
  // Le statut traité est retrouvé par sa clé (son index a pu changer depuis le début du soin)
  const found = findMemberStatus(member, treatment.statutKey || treatment.statusIdx);
  if (!found) return;
  const { status, idx: statusIdx } = found;
  const def = STATUTS[status.key];
  if (!def) return;
  // Tirage de séquelle
  let sequelMsg = '';
  if (def.onCured && def.onCured.sequelChance > 0 && Math.random() < def.onCured.sequelChance * techEffectsAccumulated().sequelChanceMult) {
    const pool = def.onCured.sequels || [];
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      member.sequels.push({ key: pick, since: S.meta.gameMin });
      sequelMsg = ` Séquelle : <em>${SEQUELS[pick].nom}</em>.`;
      // 0.26.1 : notification dédiée
      notif.sequel(member.name, SEQUELS[pick].nom);
    }
  }
  // Cas spécial mutation : "soigner" = annuler la mutation, mais peut laisser une séquelle
  // Retire le statut
  member.statuts.splice(statusIdx, 1);
  // Recale les index des autres traitements de ce colon (et retire celui-ci)
  syncTreatmentIndexes(member);
  // Récupération de santé partielle
  member.sante = Math.min(100, member.sante + def.severity * 8);
  log('success', `<em>${member.name}</em> est rétabli(e) de ${def.nom.toLowerCase()}.${sequelMsg}`);
  // 0.26 : notification dédiée
  notif.treatmentDone(member.name);
  // Si plus aucun statut actif, sortie automatique
  if (member.statuts.length === 0) {
    returnToBase(member);
    log('neutral', `<em>${member.name}</em> sort de l'infirmerie, en état de service.`);
  }
}

// ---- V1 : soins en un geste et soins automatiques ----

// Ce qui est faisable tout de suite pour un statut (sans admission préalable) :
// 'diag' | 'treat' | null, avec la raison du blocage.
function careStep(member, st) {
  if (!st.diagnosed) {
    const r = canDiagnose(member.id, st.key, { assumeAdmitted: true });
    return r.ok ? { step: 'diag' } : { step: null, why: r.reason, wait: !!r.waitMin };
  }
  if (treatmentOf(member.id, st.key)) return { step: null, why: 'Traitement en cours', running: true };
  const r = canTreat(member.id, st.key, { assumeAdmitted: true });
  return r.ok ? { step: 'treat' } : { step: null, why: r.reason };
}

// Soins en un geste (contrat V1) : admission si besoin, diagnostic des statuts
// cachés, puis traitement de chaque statut soignable.
// → { ok, why, admis, diagnostics, traitements }
export function soigner(memberId) {
  const m = S.crew.find(c => c.id === memberId);
  if (!m || m.statut === 'mort') return { ok: false, why: 'Colon introuvable' };
  if (!(m.statuts || []).length) return { ok: false, why: `${m.name} n'a besoin d'aucun soin.` };
  if (!(S.modules.infirmerie?.level > 0)) return { ok: false, why: 'Infirmerie requise' };
  const plan = m.statuts.map(st => careStep(m, st));
  if (!plan.some(p => p.step || p.running || p.wait)) {
    return { ok: false, why: plan.find(p => p.why)?.why || 'Aucun soin possible pour le moment' };
  }
  let admis = false;
  if (m.statut !== 'infirmerie') {
    if (!['libre', 'travail', 'formation'].includes(m.statut)) return { ok: false, why: `${m.name} n'est pas à la base.` };
    if (infirmaryBeds() <= bedsInUse()) return { ok: false, why: 'Infirmerie pleine' };
    admitToInfirmary(memberId);
    if (m.statut !== 'infirmerie') return { ok: false, why: 'Admission impossible' };
    admis = true;
  }
  let diagnostics = 0, traitements = 0;
  for (const st of [...m.statuts]) {
    if (!m.statuts.includes(st)) continue;
    if (!st.diagnosed && canDiagnose(memberId, st.key).ok) { startDiagnostic(memberId, st.key); diagnostics++; }
    if (st.diagnosed && !treatmentOf(memberId, st.key) && canTreat(memberId, st.key).ok) { startTreatment(memberId, st.key); traitements++; }
  }
  render();
  const why = traitements ? '' : (m.statuts.map(st => careStep(m, st)).find(p => p.why && !p.running)?.why || '');
  return { ok: diagnostics + traitements > 0 || (S.treatments || []).some(t => t.memberId === memberId), why, admis, diagnostics, traitements };
}

// Soins automatiques (V1) : si l'infirmerie a un soignant en poste (Médecine ≥ 1),
// chaque colon présent à la base qui a un statut est soigné sans clic — y compris
// pendant les absences du joueur. Un soignant ne quitte pas son poste pour se faire
// soigner s'il est le seul (personne ne le remplacerait).
export function tickAutoCare() {
  if ((S.meta.gameMin || 0) % PACING.AUTO_CARE_EVERY !== 0) return;
  if (!(S.modules.infirmerie?.level > 0)) return;
  const carers = staffOf('infirmerie').filter(s => (s.member.skills.medecine || 0) > 0).map(s => s.member);
  if (!carers.length) return;
  for (const m of S.crew) {
    if (m.statut === 'mort' || !(m.statuts || []).length) continue;
    const severe = m.statuts.some(st => (STATUTS[st.key]?.severity || 0) >= 3);
    if (!['libre', 'travail', 'infirmerie'].includes(m.statut) && !(m.statut === 'formation' && severe)) continue;
    if (carers.length === 1 && carers[0].id === m.id && m.statut !== 'infirmerie') continue;
    const plan = m.statuts.map(st => careStep(m, st));
    if (!plan.some(p => p.step)) {
      // Admis mais plus rien à faire (statut hors de portée de l'infirmerie) : il
      // retourne à son poste, sauf s'il est contagieux (quarantaine).
      if (m.statut === 'infirmerie' && !plan.some(p => p.running || p.wait)
          && !m.statuts.some(st => STATUTS[st.key]?.contagion)) dischargeMember(m.id);
      continue;   // rien de faisable (évite d'admettre pour rien)
    }
    if (m.statut !== 'infirmerie' && infirmaryBeds() <= bedsInUse()) continue;
    soigner(m.id);
  }
}

// Mort d'un membre
function memberDies(member, cause = 'cause inconnue') {
  if (member.statut === 'mort') return;
  // Libère le poste s'il en avait un (archive la carrière), puis toute
  // affectation résiduelle qui pointerait encore vers lui
  unassignMember(member.id, { auto: true });
  for (const k of Object.keys(S.assignments || {})) {
    if (S.assignments[k] === member.id) delete S.assignments[k];
  }
  member.statut = 'mort';
  member.diedAt = S.meta.gameMin;
  member.deathCause = cause;     // V1 : raconté dans le rapport de retour
  // Retire les traitements en cours
  S.treatments = (S.treatments || []).filter(t => t.memberId !== member.id);
  // Retire ses sessions de formation (en place : la boucle de tick garde la référence)
  for (let i = (S.training || []).length - 1; i >= 0; i--) {
    if (S.training[i].memberId === member.id) S.training.splice(i, 1);
  }
  // Impact moral collectif
  for (const m of S.crew) {
    if (m.id !== member.id && m.statut !== 'mort') {
      m.moral = Math.max(0, m.moral - 8);
    }
  }
  log('warn', `<em>${member.name}</em> est décédé(e). ${cause} L'équipage est en deuil.`);
  // 0.26 : notification dédiée (critique)
  notif.death(member.name, cause);
  // 0.18 — Trauma psy sur amis proches, baume pour les rivaux
  triggerGriefOnFriends(member);
}

// Où se trouve physiquement un colon (pour la contagion) :
// 'base', 'exp:<id>' pour l'équipage d'une même expédition, null s'il est isolé
// (mission diplomatique) ou mort.
// Un médecin qui assure un traitement en cours ne peut pas quitter la base :
// le soin ne continue pas sans lui.
export function isTreatingDoctor(memberId) {
  return (S.treatments || []).some(t => t.doctorId === memberId);
}

function memberLocation(member) {
  switch (member.statut) {
    case 'libre': case 'travail': case 'infirmerie': case 'formation':
      return 'base';
    case 'expedition': {
      const exp = (S.expeditions || []).find(e => (e.crewIds || []).includes(member.id));
      return exp ? 'exp:' + exp.id : null;
    }
    default:
      return null;
  }
}

// Fait évoluer les statuts d'un membre (appelé chaque tick)
export function progressMemberStatuts(member) {
  if (member.statut === 'mort') return;
  // Robustesse : si un colon a été créé sans statuts (legacy save), on les initialise
  if (!Array.isArray(member.statuts)) member.statuts = [];
  if (!Array.isArray(member.sequels)) member.sequels = [];
  // Révélation auto après délai (ex. mutation)
  for (const s of member.statuts) {
    if (!s.revealed && s.revealAt && S.meta.gameMin >= s.revealAt) {
      s.revealed = true;
      s.diagnosed = true;
      log('warn', `<em>${member.name}</em> : <em>${STATUTS[s.key]?.nom || s.key}</em> apparente.`);
    }
  }
  // Auto-guérison & complications
  for (let i = member.statuts.length - 1; i >= 0; i--) {
    const s = member.statuts[i];
    const def = STATUTS[s.key];
    if (!def?.untreated) continue;
    const elapsed = S.meta.gameMin - s.since;
    // En traitement actif → on ne déclenche pas la complication
    // (recherche par clé : l'index d'un statut change quand un autre est retiré)
    if (treatmentOf(member.id, s.key)) continue;

    if (def.untreated.selfCure && elapsed >= def.untreated.afterMin) {
      member.statuts.splice(i, 1);
      syncTreatmentIndexes(member);
      log('neutral', `<em>${member.name}</em> guérit naturellement (${def.nom.toLowerCase()}).`);
      if (member.statut === 'infirmerie' && member.statuts.length === 0) {
        returnToBase(member);
      }
      continue;
    }
    if (def.untreated.afterMin > 0 && elapsed >= def.untreated.afterMin) {
      const become = def.untreated.become;
      if (become === 'mort') {
        memberDies(member, `${def.nom} non traité(e).`);
        return;
      }
      if (become === 'mutinerie') {
        member.loyaute = Math.max(0, member.loyaute - 30);
        log('warn', `Loyauté de <em>${member.name}</em> en chute libre — risque de mutinerie.`);
        s.since = S.meta.gameMin;  // retarde le prochain trigger
      }
      if (become === 'eclosion') {
        // Convertit en pathogene_alien
        member.statuts.splice(i, 1);
        inflictStatus(member, 'pathogene_alien', "éclosion parasitaire", { internal: true });
        syncTreatmentIndexes(member);
      }
    }
  }
  // Contagion : si statut contagieux non traité, propage à un autre membre proche
  for (const s of member.statuts) {
    const def = STATUTS[s.key];
    if (!def?.contagion) continue;
    const inTreatment = !!treatmentOf(member.id, s.key);
    // Diviseur : si en quarantaine (en infirmerie + statut contagieux), contagion ÷ 4
    let rate = def.contagion.perDay;
    if (member.statut === 'infirmerie') rate /= 4;
    if (inTreatment) rate /= 2;
    // Bonus de tech (immunologie)
    rate *= techEffectsAccumulated().contagionMult;
    // Taux par période (PACING.CONTAGION_PERIOD) → probabilité par tick
    const ratePerTick = rate / PACING.CONTAGION_PERIOD;
    if (Math.random() < ratePerTick * MIN_PER_TICK) {
      // Tire une victime parmi les autres membres sains présents au même endroit
      const here = memberLocation(member);
      const pool = here ? S.crew.filter(m =>
        m.id !== member.id &&
        m.statut !== 'mort' &&
        !(m.statuts || []).some(ss => ss.key === s.key) &&
        memberLocation(m) === here
      ) : [];
      if (pool.length > 0) {
        const victim = pool[Math.floor(Math.random() * pool.length)];
        inflictStatus(victim, s.key, `contagion depuis ${member.name}`);
      }
    }
  }
}

// ============================================================
//   INCIDENTS LOCALISÉS PAR BÂTIMENT (0.17)
// ============================================================
// Chaque bâtiment peut générer des incidents à intervalle aléatoire.
// La probabilité dépend du niveau, du taux de sécurité (postes Sécurité pourvus),
// du taux d'occupation, et du bonus de commandement global.
//
// Format d'un incident :
//   id, modKey, severity (1-3), narrative
//   tagsRequired? : tags du bâtiment requis (pour incidents conditionnels)
//   titre : libellé lisible (notifications, file des décisions)
//   choices: [{ label, req?, consume?, pay?, outcome }]
//   pay: true → la perte (loss) est un paiement volontaire : le choix n'est
//                proposé que si le stock suffit (sinon perte subie, plafonnée au stock)
//
// Outcome de choix :
//   loss: { metal: N, ... }      ressources perdues
//   status: 'blessure_legere'    inflige un statut à un colon
//   target: 'random' | 'staff'   cible (random parmi vivants, staff = du bâtiment)
//   moralAll: -N | +N            moral global
//   delayMin: N                  retard sur recherche/fabrication en cours du bâtiment
//   itemLoss: 'random'           perd un item de l'inventaire
//   log: string                   ligne narrative

// Imports propres à la zone incidents / événements / sauvegarde / démarrage.
// Alias pour ne pas entrer en collision avec les imports du haut du fichier.
import { MAX_PENDING_DECISIONS } from './constants.js';
import { loadSave, exportRawSave, lockSaves, unlockSaves, setSimPaused, isSimPaused, isCatchingUp, runCatchUp, markSessionStart, reportTickError } from './state.js';

export const INCIDENTS = {
  // ===== MINE DE SURFACE =====
  mine_eboulement: {
    titre: "Éboulement dans la mine",
    modKey: 'mine_surface',
    severity: 2,
    text: "Une galerie de la mine s'effondre partiellement. {worker} était à proximité.",
    choices: [
      {
        label: "Évacuer immédiatement",
        outcome: {
          loss: { metal: 30, cristal: 15 },
          disableModule: 360,  // 0.28 : mine HS pendant 6h jeu
          log: "Évacuation rapide. La mine est mise hors service le temps de la sécurisation."
        }
      },
      {
        label: "Tenter de stabiliser et continuer",
        req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: {
          loss: { metal: 10 },
          log: "L'équipe stabilise le boyau. Le travail reprend rapidement."
        }
      },
      {
        label: "Sauver d'abord la victime",
        outcome: {
          status: 'blessure_legere',
          target: 'staff',
          loss: { metal: 50, cristal: 25 },
          moralAll: 1,  // 0.28 : ×3 → +3 moral pour tous (acte humain reconnu)
          historicalMark: "{worker} a été sauvé d'un éboulement au prix de matériel.",
          log: "{worker} est dégagé. Le geste a marqué l'équipage."
        }
      },
      {
        label: "Forcer la reprise immédiate, ignorer les risques",
        outcome: {
          status: 'blessure_grave', target: 'staff',
          damageModule: true,  // 0.28 : mine perd un niveau
          moralAll: -2,  // ×3 = -6 moral collectif
          generateRivalry: true,
          chainIncident: { id: 'mine_eboulement', delay: 1440 },  // un autre éboulement dans 24h
          historicalMark: "Le commandement a forcé une reprise dans une galerie instable. {worker} y est resté.",
          log: "{worker} est gravement blessé. La structure souffre. L'équipage murmure."
        }
      }
    ]
  },
  mine_filon_riche: {
    titre: "Filon inattendu",
    modKey: 'mine_surface',
    severity: 1,
    positive: true,
    text: "Les foreurs tombent sur un filon inattendu. Plus pur que la moyenne. Mais l'extraction est risquée.",
    choices: [
      { label: "Exploiter prudemment", outcome: { gain: { metal: 40 }, log: "Filon exploité sans incident." } },
      { label: "Forer agressivement", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { gain: { metal: 80, cristal: 30 }, log: "Pari gagnant. Récolte exceptionnelle." } },
      { label: "Reporter à plus tard", outcome: { log: "Le filon est marqué pour exploitation différée." } }
    ]
  },
  mine_predateur: {
    titre: "Créature dans la mine",
    modKey: 'mine_surface',
    severity: 3,
    requireMinLevel: 3,
    text: "Une créature inconnue émerge des profondeurs de la mine. {worker} la voit en premier.",
    choices: [
      {
        label: "Repousser à coups de pioche",
        risky: {
          stat: 'vigueur', dc: 6,
          success: { loss: { metal: 15 }, log: "La créature retraite. Travail interrompu, mais rien de plus." },
          fail: {
            status: 'blessure_grave', target: 'staff',
            loss: { metal: 30 },
            disableModule: 480,  // 8h HS
            historicalMark: "Une créature a surgi de la mine et blessé {worker}.",
            log: "{worker} a été blessé sérieusement. La galerie est temporairement abandonnée."
          }
        }
      },
      {
        label: "Sceller la galerie",
        outcome: {
          loss: { metal: 20, cristal: 10 },
          damageModule: true,  // perd un niveau définitivement
          historicalMark: "Une galerie de la mine a été scellée — une créature inconnue y dort encore.",
          log: "Galerie scellée définitivement. La créature est prisonnière en bas. La mine est diminuée."
        }
      },
      {
        label: "Attaquer en groupe armé",
        req: { skill: { key: 'combat', min: 2 } },
        outcome: {
          gain: { biomasse: 30 },
          moralAll: 1,  // ×3 = +3
          historicalMark: "L'équipage a abattu une créature des profondeurs.",
          log: "La créature est abattue. Sa carcasse fournit de la matière organique. L'équipage en parle longtemps."
        }
      }
    ]
  },

  // ===== HYDROPONIE =====
  hydro_contamination: {
    titre: "Contamination hydroponique",
    modKey: 'hydroponie',
    severity: 2,
    text: "Une cuve d'hydroponie présente des signes de contamination. Couleur, odeur, mucus en surface.",
    choices: [
      {
        label: "Vider et désinfecter",
        outcome: {
          loss: { biomasse: 40 },
          disableModule: 240,  // 4h jeu HS
          log: "Cuve sauvée mais récolte perdue. L'hydroponie reste arrêtée le temps du nettoyage."
        }
      },
      {
        label: "Identifier l'agent",
        req: { skill: { key: 'medecine', min: 2 } },
        outcome: {
          loss: { biomasse: 15 },
          gain: { datacubes: 8 },
          log: "Diagnostic rapide. Pertes minimisées et données récoltées."
        }
      },
      {
        label: "Ignorer et espérer",
        risky: {
          stat: 'sangfroid', dc: 5,
          success: { loss: { biomasse: 5 }, log: "La contamination se résorbe d'elle-même. Coup de chance." },
          fail: {
            loss: { biomasse: 80 },
            status: 'pathogene_alien', target: 'staff',
            debuff: { type: 'prodMult', value: 0.7, duration: 720, label: 'Hydroponie contaminée' },
            damageModule: true,
            moralAll: -2,  // ×3 = -6
            historicalMark: "L'hydroponie a été abandonnée à la contamination. {worker} en a payé le prix.",
            log: "La contamination s'est étendue. {worker} est touché. La production souffre durablement."
          }
        }
      }
    ]
  },
  hydro_recolte_abondante: {
    titre: "Récolte abondante",
    modKey: 'hydroponie',
    severity: 1,
    positive: true,
    text: "Une variété montre un rendement inattendu. Le Bio-technicien suggère une sélection.",
    choices: [
      { label: "Conserver les graines", req: { skill: { key: 'science', min: 1 } },
        outcome: { gain: { biomasse: 30, datacubes: 5 }, log: "Souche améliorée intégrée à l'hydroponie." } },
      { label: "Récolter tout maintenant", outcome: { gain: { biomasse: 50 }, log: "Récolte exceptionnelle, mais la souche est perdue." } }
    ]
  },

  // ===== GÉNÉRATEUR SOLAIRE =====
  solaire_panne: {
    titre: "Voilure à la dérive",
    modKey: 'generateur_solaire',
    severity: 1,
    text: "Une voilure se met à dériver. Production en chute libre.",
    choices: [
      { label: "Réparation d'urgence", req: { skill: { key: 'ingenierie', min: 1 } },
        outcome: { loss: { energie: 20 }, log: "Réparation rapide. Production relancée." } },
      { label: "Remplacer la voilure", pay: true, outcome: { loss: { metal: 15, cristal: 10, energie: 10 }, log: "Voilure neuve installée. Plus durable." } },
      { label: "Patcher avec un kit", consume: { item: 'kit_reparation' },
        outcome: { gain: { energie: 5 }, log: "Le kit fait des merveilles. Aucun temps perdu." } },
      // 0.33 : choix de repli, toujours disponible (les autres demandent compétence, objet ou stock)
      { label: "Attendre la prochaine maintenance", outcome: { disableModule: 180, log: "La voilure reste repliée en attendant la maintenance." } }
    ]
  },
  solaire_surcharge: {
    titre: "Surcharge solaire",
    modKey: 'generateur_solaire',
    severity: 2,
    requireMinLevel: 3,
    text: "Une éruption locale crée un pic électrique. Les régulateurs saturent.",
    choices: [
      {
        label: "Couper le réseau immédiatement",
        outcome: {
          loss: { energie: 30 },
          log: "Réseau coupé à temps. Stocks préservés."
        }
      },
      {
        label: "Tenter de canaliser",
        risky: {
          stat: 'sangfroid', dc: 6,
          success: {
            gain: { energie: 50 },
            log: "Pic canalisé en stockage. Bonus inattendu."
          },
          fail: {
            loss: { energie: 60, cristal: 20 },
            status: 'blessure_legere',
            target: 'staff',
            damageModule: true,  // 0.28 : générateur perd 1 niveau
            historicalMark: "Le générateur solaire a brûlé sous une éruption. Un opérateur a été blessé.",
            log: "L'opérateur a pris une décharge. Les panneaux sont partiellement détruits."
          }
        }
      }
    ]
  },

  // ===== HANGAR =====
  hangar_sabotage: {
    titre: "Sabotage au hangar",
    modKey: 'hangar',
    severity: 3,
    requireMinLevel: 2,
    text: "Un de nos vaisseaux a été saboté pendant la nuit. Coque rayée, conduits trafiqués.",
    choices: [
      {
        label: "Enquêter sérieusement",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          gain: { datacubes: 8 },
          historicalMark: "Une enquête a mis au jour un saboteur dans nos rangs.",
          log: "Indices recueillis. Le saboteur a peut-être laissé une signature."
        }
      },
      {
        label: "Réparer en urgence",
        pay: true,
        outcome: {
          loss: { metal: 50, cristal: 20 },
          log: "Réparations effectuées. Origine du sabotage non identifiée."
        }
      },
      {
        label: "Renforcer la sécurité — couvre-feu généralisé",
        outcome: {
          loss: { metal: 20 },
          moralAll: -2,  // ×3 = -6 moral durable
          debuff: {
            type: 'prodMult',
            value: 0.85,
            duration: 2880,  // 48h jeu (2 jours)
            label: "Climat de méfiance — prod -15%"
          },
          historicalMark: "Un couvre-feu a été imposé après un sabotage. L'équipage en garde le souvenir.",
          log: "Patrouille renforcée et couvre-feu. La méfiance s'installe pour quelques jours."
        }
      }
    ]
  },
  hangar_decouverte: {
    titre: "Trouvaille au hangar",
    modKey: 'hangar',
    severity: 1,
    positive: true,
    text: "Un mécano de bord trouve une amélioration inutilisée dans un coffre oublié.",
    choices: [
      { label: "L'installer sur un vaisseau", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { gain: { datacubes: 6, cristal: 15 }, log: "L'amélioration est intégrée à un vaisseau de la flotte." } },
      { label: "L'archiver", outcome: { gain: { datacubes: 4 }, log: "Le composant est documenté pour usage futur." } }
    ]
  },

  // ===== LABORATOIRE =====
  labo_fuite_donnees: {
    titre: "Données corrompues",
    modKey: 'laboratoire',
    severity: 2,
    text: "Une partie des données de recherche s'est corrompue. Cause inconnue.",
    choices: [
      { label: "Récupérer ce qui peut l'être", req: { skill: { key: 'science', min: 2 } },
        outcome: { loss: { datacubes: 10 }, log: "Récupération partielle. Pertes limitées." } },
      { label: "Tout recommencer", outcome: { loss: { datacubes: 30 }, delayResearch: 60, log: "Recherche en cours retardée d'une heure jeu." } },
      { label: "Suspendre temporairement", outcome: { loss: { datacubes: 5 }, log: "Pause stratégique. Le labo investigue." } }
    ]
  },
  labo_etude_inattendue: {
    titre: "Corrélation inattendue",
    modKey: 'laboratoire',
    severity: 1,
    positive: true,
    text: "Une corrélation inattendue est repérée dans les données existantes.",
    choices: [
      { label: "Approfondir", req: { skill: { key: 'science', min: 3 } },
        outcome: { gain: { datacubes: 25 }, log: "Découverte mineure mais réelle. Données précieuses." } },
      { label: "Documenter et continuer", outcome: { gain: { datacubes: 10 }, log: "Note ajoutée au registre du labo." } }
    ]
  },

  // ===== ATELIER =====
  atelier_accident: {
    titre: "Accident à l'atelier",
    modKey: 'atelier',
    severity: 2,
    text: "Un accident de fabrication. {worker} était sur le poste.",
    choices: [
      { label: "Soigner et reprendre", outcome: { status: 'blessure_legere', target: 'staff', loss: { metal: 10 }, log: "{worker} est légèrement blessé. La fabrication a perdu des composants." } },
      { label: "Audit de sécurité", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { loss: { metal: 5 }, log: "Audit effectué. Cause identifiée. Reprise propre." } },
      { label: "Évacuer la pièce immédiatement", outcome: { loss: { metal: 25, cristal: 10 }, log: "Évacuation préventive. Aucune blessure mais perte matérielle." } }
    ]
  },
  atelier_innovation: {
    titre: "Innovation de procédé",
    modKey: 'atelier',
    severity: 1,
    positive: true,
    text: "Le Maître-artisan propose une amélioration de procédé.",
    choices: [
      { label: "Tester l'idée", req: { skill: { key: 'ingenierie', min: 3 } },
        outcome: { gain: { datacubes: 8, metal: 15 }, log: "L'amélioration fonctionne. Procédé adopté." } },
      { label: "Garder la procédure standard", outcome: { gain: { metal: 5 }, log: "Statu quo préservé." } }
    ]
  },

  // ===== INFIRMERIE =====
  infirmerie_patient_fuit: {
    titre: "Patient en fuite",
    modKey: 'infirmerie',
    severity: 2,
    text: "Un patient a quitté l'infirmerie sans autorisation.",
    choices: [
      { label: "Le retrouver et le ramener", outcome: { log: "Patient retrouvé. Soins repris." } },
      { label: "Le laisser. Il sait ce qu'il fait.", outcome: { moralAll: -1, log: "L'équipage commente. Le moral en pâtit." } },
      { label: "Enquête disciplinaire", outcome: { moralAll: -2, log: "Mesure ferme. Le patient est rappelé. Mais l'ambiance pèse." } }
    ]
  },
  infirmerie_remede: {
    titre: "Nouvelle formule de soin",
    modKey: 'infirmerie',
    severity: 1,
    positive: true,
    text: "Un Spécialiste a synthétisé une nouvelle formule de soin à partir de réserves.",
    choices: [
      { label: "Documenter et stocker", outcome: { gain: { datacubes: 6 }, log: "La formule rejoint les protocoles standard." } }
    ]
  },

  // ===== HABITAT =====
  habitat_panne_climatisation: {
    titre: "Climatisation en panne",
    modKey: 'habitat',
    severity: 2,
    text: "La climatisation d'une partie de l'habitat tombe en panne. Les colons se plaignent.",
    choices: [
      { label: "Réparer immédiatement", req: { skill: { key: 'ingenierie', min: 1 } }, pay: true,
        outcome: { loss: { metal: 10, energie: 15 }, log: "Climatisation rétablie. L'équipage apprécie." } },
      { label: "Distribuer des rations supplémentaires", consume: { item: 'ration_concentree' },
        outcome: { moralAll: +1, log: "Geste apprécié. L'équipe tient le coup." } },
      { label: "Ignorer (attendre une réparation prévue)", outcome: { moralAll: -2, log: "L'équipage a chaud. Et ne se prive pas de le dire." } }
    ]
  },
  habitat_anniversaire: {
    titre: "Anniversaire",
    modKey: 'habitat',
    severity: 1,
    positive: true,
    text: "C'est l'anniversaire d'un colon. L'équipage propose une petite célébration.",
    choices: [
      { label: "Organiser une fête", pay: true, outcome: { loss: { biomasse: 20 }, moralAll: +3, log: "Soirée mémorable. Le moral grimpe." } },
      { label: "Geste discret", outcome: { moralAll: +1, log: "Cadeau modeste mais sincère." } },
      { label: "Trop occupés cette fois", outcome: { moralAll: -1, log: "Personne ne dit rien. Mais quelque chose s'éteint un peu." } }
    ]
  }
};

  // 1 an jeu = 30 jours jeu






// Clé canonique pour une paire de membres (ordre lexico pour unicité)
function relKey(a, b) {
  if (a === b) return null;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Renvoie l'affinité actuelle entre deux colons (-100 à +100)
export function affinityBetween(a, b) {
  const k = relKey(a, b);
  if (!k) return 0;
  return S.relations?.[k] || 0;
}

// Modifie l'affinité par delta (cap -100/+100)
function adjustAffinity(a, b, delta) {
  const k = relKey(a, b);
  if (!k) return;
  if (!S.relations) S.relations = {};
  const cur = S.relations[k] || 0;
  S.relations[k] = Math.max(-100, Math.min(100, cur + delta));
}

// Type de relation selon affinité
export function relationType(affinity) {
  if (affinity >= REL_LOVE)    return { key: 'aime',    label: 'Aimé(e)',    color: '#e9b76a' };
  if (affinity >= 70)          return { key: 'proche',  label: 'Ami proche', color: '#7a9b6e' };
  if (affinity >= REL_FRIEND)  return { key: 'ami',     label: 'Ami',        color: '#7a9b6e' };
  if (affinity > REL_RIVAL)    return { key: 'neutre',  label: 'Neutre',     color: 'var(--text-mute)' };
  if (affinity > REL_RANCUNE)  return { key: 'rival',   label: 'Rival',      color: 'var(--rust)' };
  return { key: 'rancune', label: 'Rancune', color: 'var(--rust)' };
}

// Âge actuel d'un colon en années (calculé dynamiquement)
export function currentAge(member) {
  if (typeof member.birthGameMin !== 'number') return member.age || 30;
  const minutesAlive = (member.diedAt ?? S.meta.gameMin) - member.birthGameMin;
  return Math.floor(minutesAlive / YEAR_IN_GAME_MIN);
}

// Santé maximale selon âge (décroît après 60)
export function maxHealthOf(member) {
  const age = currentAge(member);
  if (age < 60) return 100;
  // -2 par année au-delà de 60, plancher à 40
  return Math.max(40, 100 - (age - 60) * 2);
}

// Tick : évolution lente des affinités selon proximité
// - Postés ensemble dans le même bâtiment : +0.03/tick (~1/jour)
// - Ensemble en expédition : +0.06/tick
// - Soigné par un autre : +0.10/tick (lien fort qui se crée)
// - Élève/Instructeur en formation : +0.05/tick
// La désaffectation et les ruptures n'érodent pas naturellement (pour l'instant)
export function tickRelations() {
  ensureCrewIntegrity();   // répare une fois les sauvegardes chargées (cf. repairCrewState)
  if (!S.crew || S.crew.length < 2) return;
  // Les morts ne tissent plus de liens
  const living = new Set();
  for (const m of S.crew) if (m.statut !== 'mort') living.add(m.id);
  // Même bâtiment
  for (const modKey in MODULE_JOBS) {
    const staff = staffOf(modKey);
    if (staff.length < 2) continue;
    for (let i = 0; i < staff.length; i++) {
      for (let j = i+1; j < staff.length; j++) {
        adjustAffinity(staff[i].member.id, staff[j].member.id, 0.03 * MIN_PER_TICK);
      }
    }
  }
  // Même expédition
  for (const exp of S.expeditions || []) {
    const ids = (exp.crewIds || []).filter(id => living.has(id));
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i+1; j < ids.length; j++) {
        adjustAffinity(ids[i], ids[j], 0.06 * MIN_PER_TICK);
      }
    }
  }
  // Soin : patient ↔ médecin qui le soigne (celui du traitement, sans
  // recalculer bestAvailableDoctor() pour chaque traitement à chaque tick)
  for (const t of S.treatments || []) {
    if (!living.has(t.memberId) || !living.has(t.doctorId) || t.doctorId === t.memberId) continue;
    adjustAffinity(t.doctorId, t.memberId, 0.10 * MIN_PER_TICK);
  }
  // Formation : élève ↔ instructeur
  for (const tr of S.training || []) {
    if (!living.has(tr.memberId) || !living.has(tr.instructorId)) continue;
    if (tr.instructorId && tr.instructorId !== tr.memberId) {
      adjustAffinity(tr.instructorId, tr.memberId, 0.05 * MIN_PER_TICK);
    }
  }
}

// Effets passifs des relations sur le moral (à chaque tick)
export function tickRelationMoraleEffects() {
  if (!S.crew) return;
  // Pour chaque expédition active, applique +/- moral selon affinités
  for (const exp of S.expeditions || []) {
    if (exp.crewIds.length < 2) continue;
    for (let i = 0; i < exp.crewIds.length; i++) {
      for (let j = i+1; j < exp.crewIds.length; j++) {
        const aff = affinityBetween(exp.crewIds[i], exp.crewIds[j]);
        if (Math.abs(aff) < REL_FRIEND) continue;
        const m1 = S.crew.find(c => c.id === exp.crewIds[i]);
        const m2 = S.crew.find(c => c.id === exp.crewIds[j]);
        if (!m1 || !m2 || m1.statut === 'mort' || m2.statut === 'mort') continue;
        // Effet par tick : très petit, mais cumulatif
        const moralDelta = aff > 0 ? 0.005 : -0.008;
        const factor = MIN_PER_TICK;
        m1.moral = Math.max(0, Math.min(100, m1.moral + moralDelta * factor));
        m2.moral = Math.max(0, Math.min(100, m2.moral + moralDelta * factor));
      }
    }
  }
}

// Vieillissement et mort naturelle
export function tickAging() {
  if (!S.crew) return;
  for (const m of S.crew) {
    if (m.statut === 'mort') continue;
    const age = currentAge(m);
    // Cap santé selon âge
    const cap = maxHealthOf(m);
    if (m.sante > cap) m.sante = cap;
    // Mort naturelle après 70 : ~1% par an
    if (age >= 70) {
      const yearlyDeathProb = (age - 70) * 0.01 + 0.01;  // 1% à 70, 2% à 71...
      const tickProb = yearlyDeathProb * MIN_PER_TICK / YEAR_IN_GAME_MIN;
      if (Math.random() < tickProb) {
        // Mort de cause naturelle (memberDies journalise et déclenche le deuil des proches)
        memberDies(m, `Mort naturelle, paisible, à ${age} ans.`);
      }
    }
  }
}

// Quand un colon meurt, ses amis proches risquent un trauma psy
function triggerGriefOnFriends(deceased) {
  if (!S.crew || !deceased) return;
  for (const m of S.crew) {
    if (m.id === deceased.id || m.statut === 'mort') continue;
    const aff = affinityBetween(deceased.id, m.id);
    if (aff < 70) continue;  // Seuls les amis proches sont touchés
    // 50% chance de trauma_psy
    if (Math.random() < 0.5) {
      inflictStatus(m, 'trauma_psy', `deuil de ${deceased.name}`);
    } else {
      m.moral = Math.max(0, m.moral - 15);
    }
  }
  // Mort d'un rival : petit + de moral pour les rivaux
  for (const m of S.crew) {
    if (m.id === deceased.id || m.statut === 'mort') continue;
    const aff = affinityBetween(deceased.id, m.id);
    if (aff <= REL_RIVAL && aff > -100) {
      m.moral = Math.min(100, m.moral + 3);
    }
  }
}

// Renvoie la liste des relations significatives d'un colon (top 3 amis, top 3 rivaux)
export function significantRelations(memberId) {
  if (!S.relations) return { friends: [], rivals: [] };
  const out = [];
  for (const m of (S.crew || [])) {
    // Les défunts ne « réagissent » plus aux événements et ne sont plus listés
    if (m.id === memberId || m.statut === 'mort') continue;
    const aff = affinityBetween(memberId, m.id);
    if (Math.abs(aff) >= REL_FRIEND) {
      out.push({ memberId: m.id, member: m, affinity: aff });
    }
  }
  out.sort((a, b) => b.affinity - a.affinity);
  const friends = out.filter(o => o.affinity >= REL_FRIEND).slice(0, 3);
  const rivals = out.filter(o => o.affinity <= REL_RIVAL).reverse().slice(0, 3);
  return { friends, rivals };
}

// ============================================================
//   INCIDENTS LOCALISÉS (0.17) — suite
// ============================================================
// 0.28 : multiplicateur d'impact des choix d'incident ET d'événement (×3)
const OUTCOME_MULT = 3;

// V1 : les durées écrites dans le contenu hérité (incidents, événements) sont en
// « minutes de jeu » (360 = « 6 h jeu ») → secondes réelles × PACING.LEGACY_GAME_MIN.
const legacyDuration = d => Math.round((Number(d) || 0) * PACING.LEGACY_GAME_MIN);

// Libellés lisibles (notifications, file des décisions, résumé de rattrapage)
function incidentTitle(incidentId) {
  return INCIDENTS[incidentId]?.titre || 'Incident';
}
function colonyEventTitle(eventId) {
  const ev = COLONY_EVENTS[eventId];
  return ev?.titre || ev?.theme || 'Événement';
}

// Montants réels (multiplicateur compris) d'un bloc loss/gain, en texte
function amountsText(block) {
  return Object.entries(block || {})
    .map(([k, v]) => `${Math.round(v * OUTCOME_MULT)} ${RES_LABELS[k] || k}`)
    .join(' · ');
}

// Remplace {loss.metal}, {gain.datacubes}… d'un libellé par les montants réels
function fillAmounts(label, outcome) {
  return String(label || '').replace(/\{(loss|gain)\.(\w+)\}/g, (_, kind, res) => {
    const v = outcome?.[kind]?.[res];
    return typeof v === 'number' ? String(Math.round(v * OUTCOME_MULT)) : '?';
  });
}

// Choix « payant » (achat, échange, don — pay:true) : le stock doit couvrir
// le coût AVANT de choisir. Les pertes subies (dégâts) restent plafonnées au stock.
function choiceAffordable(choice) {
  if (!choice?.pay || !choice.outcome?.loss) return true;
  for (const k in choice.outcome.loss) {
    if ((S.res[k] || 0) < choice.outcome.loss[k] * OUTCOME_MULT) return false;
  }
  return true;
}

// Équipe mobilisable pour un incident : staff du bâtiment + colons libres
function incidentTeam(inc) {
  return staffOf(inc.modKey).map(s => s.member).concat(aliveCrew().filter(m => m.statut === 'libre'));
}
function skillReqMet(req, team) {
  if (!req?.skill) return true;
  return team.some(m => (m.skills?.[req.skill.key] || 0) >= req.skill.min);
}

// Applique un gain plafonné à la capacité (sans jamais réduire un stock
// déjà au-dessus). Renvoie la quantité réellement gagnée.
function addResourceCapped(k, amt) {
  const before = S.res[k] || 0;
  S.res[k] = Math.max(before, Math.min(capOf(k), before + amt));
  return S.res[k] - before;
}
// Applique une perte plafonnée au stock. Renvoie la quantité réellement perdue.
function removeResourceCapped(k, amt) {
  const before = S.res[k] || 0;
  S.res[k] = Math.max(0, before - amt);
  return before - S.res[k];
}

// Score d'un résultat pour le choix automatique : on évite d'abord les dégâts
// durables (niveau perdu, blessure, incident en chaîne), puis ce qui coûte.
function outcomeScore(o) {
  let s = 0;
  for (const k in o.loss || {}) s -= o.loss[k] * OUTCOME_MULT * 0.1;
  for (const k in o.gain || {}) s += o.gain[k] * OUTCOME_MULT * 0.1;
  if (o.moralAll) s += o.moralAll * 5;
  if (o.status) s -= 30;
  if (o.damageModule) s -= 100;
  if (o.chainIncident) s -= 50;
  if (o.debuff) s -= 20;
  if (o.disableModule) s -= o.disableModule / 60;
  if (o.generateRivalry) s -= 15;
  if (o.delayResearch) s -= o.delayResearch * OUTCOME_MULT / 30;
  if (o.spawnVisitor) s += 10;
  if (o.randomBlueprint) s += 10;
  if (o.adjustAffinity) s += (o.adjustAffinity.delta || 0) * 0.2;
  return s;
}

// Choix automatique « sûr » (rattrapage hors ligne, file de décisions pleine) :
// ni prérequis, ni objet consommé, ni coût impayable ; un choix non risqué
// est préféré, au meilleur score.
function pickAutoChoice(choices) {
  const eligible = (choices || []).filter(c => !c.req && !c.consume && choiceAffordable(c));
  const safe = eligible.filter(c => !c.risky);
  const pool = safe.length ? safe : eligible;
  let best = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const sc = c.risky ? 0 : outcomeScore(c.outcome || {});
    if (sc > bestScore) { best = c; bestScore = sc; }
  }
  return best;
}

// Liste les bâtiments construits qui peuvent générer un incident
function eligibleIncidentBuildings() {
  const out = [];
  for (const modKey in S.modules) {
    if (!S.modules[modKey] || !S.modules[modKey].level) continue;
    const candidates = Object.entries(INCIDENTS).filter(([_, inc]) => {
      if (inc.modKey !== modKey) return false;
      if (inc.requireMinLevel && S.modules[modKey].level < inc.requireMinLevel) return false;
      return true;
    });
    if (candidates.length > 0) out.push({ modKey, candidates: candidates.map(([id]) => id) });
  }
  return out;
}

// Probabilité par tick d'incident pour un bâtiment donné (0-1)
function incidentProbability(modKey) {
  const lvl = S.modules[modKey]?.level || 0;
  if (lvl === 0) return 0;
  const eff = moduleEfficiency(modKey);
  // Base : ~1 incident toutes les 12-24h selon niveau
  // V1 : une fois l'espacement écoulé, l'incident survient en quelques minutes ;
  // la sécurité et le commandement retardent son arrivée.
  const baseHourlyRate = 0.04 + 0.01 * lvl;       // niv 1 = 5 %, niv 5 = 9 % (par minute réelle)
  const securityFactor = 1 - (eff.securityBonus * 0.30);  // chaque poste sécurité = -30%
  const cmdFactor = 1 - globalCommandBonus() * 0.08;  // chaque cmd = -8% global
  const hourlyRate = Math.max(0.005, baseHourlyRate * securityFactor * cmdFactor);
  return hourlyRate * (MIN_PER_TICK / 60);
}

// Tirage par tick : pour chaque bâtiment, tente un incident.
// V1 : espacement de 1 à 2,5 h réelles (PACING.INCIDENT_GAP_*) ; pas de nouveau
// tirage tant que PACING.INCIDENT_QUEUE_MAX incidents attendent le joueur.
// silent (rattrapage) : seuls les incidents mineurs sont résolus automatiquement.
export function tickIncidents(silent = false) {
  // Cooldown global : pas d'incident trop rapproché
  if (S.meta.gameMin < S.nextIncidentMin) return;
  const waiting = (S.pendingDecisions || []).filter(d => d.kind === 'incident').length;
  if (waiting >= PACING.INCIDENT_QUEUE_MAX) {
    S.nextIncidentMin = S.meta.gameMin + PACING.INCIDENT_GAP_MIN / 2;
    return;
  }

  const elig = eligibleIncidentBuildings();
  if (elig.length === 0) return;

  // Pour chaque bâtiment, tente de tirer un incident
  for (const { modKey, candidates } of elig) {
    if (Math.random() < incidentProbability(modKey)) {
      // Choisit aléatoirement un incident parmi les candidats du bâtiment
      const id = candidates[Math.floor(Math.random() * candidates.length)];
      triggerIncident(id, silent);
      S.nextIncidentMin = S.meta.gameMin + PACING.INCIDENT_GAP_MIN
        + Math.floor(Math.random() * (PACING.INCIDENT_GAP_MAX - PACING.INCIDENT_GAP_MIN));
      return;
    }
  }
}

// Colon « victime » : préfère le staff du bâtiment, sinon un libre, sinon n'importe quel vivant
function pickIncidentVictim(inc) {
  const staff = staffOf(inc.modKey).map(s => s.member);
  if (staff.length) return rPick(staff);
  const free = aliveCrew().filter(m => m.statut === 'libre');
  if (free.length) return rPick(free);
  // Dernier repli : n'importe quel colon présent à la base (jamais un absent)
  const atBase = aliveCrew().filter(m => memberLocation(m) === 'base');
  return atBase.length ? rPick(atBase) : null;
}

// Incident mineur : gravité 1 (résolu automatiquement pendant une absence)
function isMinorIncident(incidentId) {
  return (INCIDENTS[incidentId]?.severity || 1) <= 1;
}

// Déclenche un incident : en direct, il rejoint la file des décisions du
// joueur ; en silencieux (rattrapage), V1 : seul un incident mineur est résolu
// automatiquement, les autres attendent le retour du joueur dans la file.
export function triggerIncident(incidentId, silent = false) {
  const inc = INCIDENTS[incidentId];
  if (!inc) return;
  if (!MODULES[inc.modKey]) return;
  const victim = pickIncidentVictim(inc);
  if (!victim) return;

  if (silent && isMinorIncident(incidentId)) {
    autoResolveIncident(incidentId, victim);
    return;
  }
  enqueueDecision({ kind: 'incident', refId: incidentId, victimId: victim.id, offline: silent || undefined });
  // 0.26 : notification dédiée (critique, pour qu'on la voie même si on est ailleurs)
  if (!silent) notif.incident(incidentTitle(incidentId));
}

function autoResolveIncident(incidentId, victim) {
  const inc = INCIDENTS[incidentId];
  if (!inc) return;
  const choice = pickAutoChoice(inc.choices);
  if (!choice) return;
  if (applyIncidentChoice(inc, choice, victim, { auto: true }) !== false) {
    recordAutoResolution('incident', incidentTitle(incidentId), fillAmounts(choice.label, choice.outcome));
  }
}

// Dégâts sur un module : perd un niveau (minimum 1). Les postes au-delà du
// nouveau niveau disparaissent : leurs occupants sont libérés (et réaffectés
// si possible). Un chantier en cours sur ce module reconstruit le niveau perdu
// au lieu de sauter un niveau. Renvoie la ligne de journal.
function damageModule(modKey) {
  const mod = S.modules[modKey];
  if (!mod) return null;
  const nom = MODULES[modKey]?.nom || modKey;
  if (mod.level <= 1) return `<em>${nom}</em> a subi des dégâts mais reste fonctionnel au minimum.`;
  mod.level--;
  const freed = [];
  for (const key of Object.keys(S.assignments || {})) {
    const [k, idxStr] = key.split(':');
    const idx = parseInt(idxStr, 10);
    if (k !== modKey || !(idx >= mod.level)) continue;
    freed.push(S.assignments[key]);
    unassignSlot(modKey, idx);
  }
  for (const id of freed) autoAssignMember(id);
  if (S.build?.id === modKey && S.build.targetLevel > mod.level + 1) S.build.targetLevel = mod.level + 1;
  return `<em>${nom}</em> est endommagé : niveau ramené à ${mod.level}.`;
}

// Applique l'outcome d'un choix d'incident. Renvoie false si le choix est
// impossible (prérequis, objet, stock). opts.auto : décision automatique —
// pas de toast, et une seule ligne de journal résume tout.
export function applyIncidentChoice(inc, choice, victim, opts = {}) {
  const auto = !!opts.auto;
  const notes = [];
  const say = (kind, txt) => { if (auto) notes.push(txt); else log(kind, txt); };
  const team = incidentTeam(inc);

  // Vérifications de prérequis (skill, stock, item)
  if (choice.req?.skill && !skillReqMet(choice.req, team)) {
    if (!auto) toast(`Personne ne remplit : ${SKILL_LABELS[choice.req.skill.key]} ≥ ${choice.req.skill.min}`);
    return false;
  }
  if (!choiceAffordable(choice)) {
    if (!auto) toast(`Stock insuffisant : ${amountsText(choice.outcome.loss)}`);
    return false;
  }
  if (choice.consume?.item) {
    const itemId = choice.consume.item;
    if ((S.inventory?.[itemId] || 0) <= 0) {
      if (!auto) toast(`Stock insuffisant : ${ITEMS[itemId]?.nom || itemId}`);
      return false;
    }
    S.inventory[itemId]--;
    if (S.inventory[itemId] <= 0) delete S.inventory[itemId];
  }

  // Détermine outcome (gestion risky)
  let outcome = choice.outcome;
  if (choice.risky) {
    const bestStat = team.length > 0 ? Math.max(...team.map(m => m.stats?.[choice.risky.stat] || 5)) : 5;
    const roll = 1 + Math.floor(Math.random() * 10);
    const total = roll + Math.floor((bestStat - 5) / 2);
    const success = total >= choice.risky.dc;
    outcome = success ? choice.risky.success : choice.risky.fail;
  }
  if (!outcome) return true;

  const workerHTML = victim ? `<em>${esc(victim.name)}</em>` : 'un colon';
  if (outcome.log) say(inc.positive ? 'success' : 'warn', outcome.log.replace(/\{worker\}/g, workerHTML));

  // Applique (pertes plafonnées au stock ; gains plafonnés à la capacité)
  if (outcome.loss) {
    for (const k in outcome.loss) removeResourceCapped(k, outcome.loss[k] * OUTCOME_MULT);
  }
  if (outcome.gain) {
    for (const k in outcome.gain) addResourceCapped(k, outcome.gain[k] * OUTCOME_MULT);
  }
  if (outcome.status) {
    let target = victim;
    if (outcome.target === 'random') {
      const pool = aliveCrew();
      target = pool[Math.floor(Math.random() * pool.length)] || victim;
    }
    if (target) inflictStatus(target, outcome.status, "incident");
  }
  if (outcome.moralAll) {
    // 0.28 : moral durable — la valeur est × 3 pour avoir un impact ressenti
    // (était souvent -2/+2 jusqu'ici, donc devient -6/+6, et ça affecte TOUS les colons)
    for (const m of aliveCrew()) {
      m.moral = Math.max(0, Math.min(100, m.moral + outcome.moralAll * 3));
    }
  }
  if (outcome.delayResearch && S.research?.length > 0) {
    for (const r of S.research) r.doneMin = Math.max(0, r.doneMin - legacyDuration(outcome.delayResearch * OUTCOME_MULT));
  }

  // 0.28 : NOUVEAUX EFFETS DURABLES
  // — damageModule : module perd un niveau (effet sévère, permanent jusqu'à reconstruction)
  if (outcome.damageModule && inc.modKey) {
    const msg = damageModule(inc.modKey);
    if (msg) say('warn', msg);
  }
  // — disableModule : module hors service pendant N minutes-jeu
  if (outcome.disableModule && inc.modKey) {
    const duration = legacyDuration(outcome.disableModule);
    const mod = S.modules[inc.modKey];
    if (mod) {
      mod.disabledUntil = (S.meta.gameMin || 0) + duration;
      say('warn', `<em>${MODULES[inc.modKey].nom}</em> hors service pour ${fmtDuree(duration)}.`);
    }
  }
  // — debuff : pénalité globale temporaire (ex: { type: 'prodMult', value: 0.8, duration: 1440 })
  if (outcome.debuff) {
    if (!S.activeBuffs) S.activeBuffs = [];
    S.activeBuffs.push({
      ...outcome.debuff,
      sourceLabel: inc.titre || 'Incident',
      startedAt: S.meta.gameMin,
      expiresAt: (S.meta.gameMin || 0) + legacyDuration(outcome.debuff.duration || 720)
    });
    say('warn', `Effet en cours : ${outcome.debuff.label || 'modulation temporaire'}.`);
  }
  // — generateRivalry : crée une rivalité durable entre la victime et un autre colon
  if (outcome.generateRivalry && victim) {
    const others = aliveCrew().filter(m => m.id !== victim.id);
    if (others.length > 0) {
      const other = others[Math.floor(Math.random() * others.length)];
      const key = [victim.id, other.id].sort().join('|');
      if (!S.relations) S.relations = {};
      S.relations[key] = Math.min(-30, (S.relations[key] || 0) - 25);
      say('warn', `<em>${esc(victim.name)}</em> et <em>${esc(other.name)}</em> se brouillent durablement.`);
    }
  }
  // — chainIncident : déclenche un autre incident plus tard (cf. tickOnce)
  if (outcome.chainIncident) {
    if (!S.pendingChainIncidents) S.pendingChainIncidents = [];
    S.pendingChainIncidents.push({
      incidentId: outcome.chainIncident.id,
      triggerAt: (S.meta.gameMin || 0) + legacyDuration(outcome.chainIncident.delay || 720)
    });
  }
  // — historicalMark : entrée dans le journal historique de la colonie
  if (outcome.historicalMark) {
    if (!S.historicalMarks) S.historicalMarks = [];
    S.historicalMarks.push({
      at: S.meta.gameMin,
      text: outcome.historicalMark,
      victim: victim?.name || null
    });
  }

  if (auto) {
    log(inc.positive ? 'success' : 'warn',
      `<b>${esc(inc.titre || 'Incident')}</b> — décision automatique : « ${esc(fillAmounts(choice.label, choice.outcome))} ». ${notes.join(' ')}`.trim());
  }
  return true;
}

// ============================================================
//   FILE DES DÉCISIONS (0.33) — incidents et événements en attente
// ============================================================
// Une seule fenêtre de décision à la fois. Les incidents et événements « en
// direct » rejoignent S.pendingDecisions (persistée : recharger la page ne les
// fait pas disparaître). pumpDecisions(), appelée à chaque tick, affiche la
// plus ancienne dès qu'aucune autre fenêtre (modale, scène) n'est ouverte ;
// la suivante attend que la courante soit résolue. Au-delà de
// MAX_PENDING_DECISIONS, les plus anciennes sont résolues automatiquement.
// S.pendingIncident / S.pendingColonyEvent (lus par le bandeau d'alertes)
// reflètent la file.

let _shownDecisionId = null;     // décision actuellement affichée dans #modal
const _autoResolved = [];         // résolutions automatiques récentes (résumé de rattrapage)
let _autoSeq = 0;

function recordAutoResolution(kind, titre, choiceLabel) {
  _autoResolved.push({ seq: ++_autoSeq, kind, titre, choiceLabel });
  if (_autoResolved.length > 500) _autoResolved.splice(0, _autoResolved.length - 500);
}
function autoResolvedSince(seq) {
  return _autoResolved.filter(r => r.seq > seq);
}

function syncPendingFlags() {
  const q = Array.isArray(S.pendingDecisions) ? S.pendingDecisions : [];
  S.pendingIncident = q.find(d => d.kind === 'incident')?.refId || null;
  S.pendingColonyEvent = q.find(d => d.kind === 'event')?.refId || null;
}

function enqueueDecision(dec) {
  if (!Array.isArray(S.pendingDecisions)) S.pendingDecisions = [];
  S.pendingDecisions.push({ id: uid('dec'), createdAt: S.meta.gameMin, ...dec });
  while (S.pendingDecisions.length > MAX_PENDING_DECISIONS) {
    // V1 : la plus ancienne décision MINEURE (incident de gravité 1) qui n'est pas
    // à l'écran est tranchée automatiquement ; à défaut, la plus ancienne.
    const q = S.pendingDecisions;
    let idx = q.findIndex(d => d.id !== _shownDecisionId && d.kind === 'incident' && isMinorIncident(d.refId));
    if (idx < 0) idx = q.findIndex(d => d.id !== _shownDecisionId);
    const [old] = q.splice(idx, 1);
    autoResolveDecision(old);
  }
  syncPendingFlags();
  save();
}

function removeDecision(id) {
  const i = (S.pendingDecisions || []).findIndex(d => d.id === id);
  if (i >= 0) S.pendingDecisions.splice(i, 1);
  if (_shownDecisionId === id) _shownDecisionId = null;
  syncPendingFlags();
}

function autoResolveDecision(dec) {
  if (dec.kind === 'incident') {
    if (INCIDENTS[dec.refId]) autoResolveIncident(dec.refId, resolveIncidentVictim(dec));
  } else if (dec.kind === 'event') {
    const actors = resolveEventActors(dec);
    if (actors) autoResolveColonyEvent(dec.refId, actors);
  }
}

// Victime d'un incident en attente, revalidée : morte ou partie de la base
// entre-temps (expédition, mission) → un autre colon présent
function resolveIncidentVictim(dec) {
  const v = S.crew.find(m => m.id === dec.victimId);
  if (v && v.statut !== 'mort' && memberLocation(v) === 'base') return v;
  const inc = INCIDENTS[dec.refId];
  const nv = inc ? pickIncidentVictim(inc) : null;
  if (nv) dec.victimId = nv.id;
  return nv;
}

// Acteurs d'un événement en attente, revalidés : un acteur vivant à la
// création et mort depuis (ou disparu) rend l'événement caduc → nouveaux
// acteurs si l'événement est toujours d'actualité, sinon null.
function resolveEventActors(dec) {
  const ev = COLONY_EVENTS[dec.refId];
  if (!ev) return null;
  const ids = dec.actorIds || {};
  const wasDead = dec.actorsDead || {};
  const get = role => (ids[role] ? S.crew.find(m => m.id === ids[role]) || null : null);
  const valid = role => {
    if (!ids[role]) return true;
    const m = get(role);
    // Un acteur mort à la création reste valable (deuil…) ; sinon il doit
    // être vivant et présent à la base au moment de la décision.
    return !!m && (wasDead[role] || (m.statut !== 'mort' && memberLocation(m) === 'base'));
  };
  if (valid('primary') && valid('secondary')) return { primary: get('primary'), secondary: get('secondary') };
  try {
    if (ev.condition()) {
      const a = ev.pickActors();
      if (a) {
        Object.assign(dec, decisionActors(a));
        return a;
      }
    }
  } catch (e) { /* événement plus d'actualité */ }
  return null;
}

function decisionActors(actors) {
  return {
    actorIds: { primary: actors?.primary?.id || null, secondary: actors?.secondary?.id || null },
    actorsDead: { primary: actors?.primary?.statut === 'mort', secondary: actors?.secondary?.statut === 'mort' }
  };
}

// Une fenêtre est-elle déjà ouverte (modale, scène d'expédition) ?
function decisionUiBusy() {
  return !!($('#modalBg')?.classList.contains('show') || $('#sceneOverlay')?.classList.contains('show'));
}

function openDecisionModal(html, hook) {
  const m = $('#modal');
  m.className = 'modal incident-modal';
  m.innerHTML = html;
  $('#modalBg').classList.add('show');
  hook();
}

function closeDecisionModal() {
  $('#modalBg').classList.remove('show');
  $('#modal').className = 'modal';
}

// Affiche la plus ancienne décision en attente si rien d'autre n'est ouvert.
// Appelée à chaque tick (et au démarrage).
export function pumpDecisions() {
  if (!S?.meta || isSimPaused() || isCatchingUp()) return;
  const q = S.pendingDecisions;
  if (!Array.isArray(q) || q.length === 0) return;
  if (decisionUiBusy()) return;
  let changed = false;
  while (q.length > 0) {
    if (showDecision(q[0])) break;
    q.shift();   // décision caduque ou résolue automatiquement
    changed = true;
  }
  if (changed) {
    syncPendingFlags();
    save();
    try { render(); } catch (e) { reportTickError('render', e); }
  }
}

function showDecision(dec) {
  if (dec.kind === 'incident') {
    const inc = INCIDENTS[dec.refId];
    if (!inc) return false;
    const victim = resolveIncidentVictim(dec);
    if (!victim) {
      // Plus personne pour y faire face : résolu automatiquement
      autoResolveIncident(dec.refId, null);
      return false;
    }
    _shownDecisionId = dec.id;
    openDecisionModal(renderIncidentContent(inc, victim), () => hookIncidentModal(dec.id));
    return true;
  }
  if (dec.kind === 'event') {
    if (!COLONY_EVENTS[dec.refId]) return false;
    const actors = resolveEventActors(dec);
    if (!actors) return false;   // événement caduc
    _shownDecisionId = dec.id;
    openDecisionModal(renderColonyEventContent(dec.refId, actors), () => hookColonyEventModal(dec.id));
    return true;
  }
  return false;
}

function renderIncidentContent(inc, victim) {
  const def = MODULES[inc.modKey];
  const text = inc.text.replace(/\{worker\}/g, victim ? esc(victim.name) : 'un colon');
  const severityLabel = ['', 'Mineur', 'Sérieux', 'Critique'][inc.severity || 1];
  const severityClass = ['', 'ok', 'warn', 'rust'][inc.severity || 1];
  const team = incidentTeam(inc);

  // Liste des choix avec évaluation
  const choicesHTML = inc.choices.map((ch, i) => {
    let extras = [];
    let available = true;

    // Vérif req skill
    if (ch.req?.skill) {
      const has = skillReqMet(ch.req, team);
      extras.push(`<span class="req ${has ? '' : 'locked'}">REQUIERT : ${SKILL_LABELS[ch.req.skill.key]} ≥ ${ch.req.skill.min}</span>`);
      if (!has) available = false;
    }
    // Vérif item
    if (ch.consume?.item) {
      const itDef = ITEMS[ch.consume.item];
      const has = (S.inventory?.[ch.consume.item] || 0) > 0;
      extras.push(`<span class="cost ${has ? '' : 'ko'}" style="${has ? 'color:#b09bd0' : ''}">CONSOMME : ${itDef?.nom || ch.consume.item}</span>`);
      if (!has) available = false;
    }
    // Vérif coût (choix payant)
    if (ch.pay && ch.outcome?.loss) {
      const ok = choiceAffordable(ch);
      extras.push(`<span class="cost ${ok ? '' : 'ko'}">COÛT : ${amountsText(ch.outcome.loss)}${ok ? '' : ' — stock insuffisant'}</span>`);
      if (!ok) available = false;
    }
    if (ch.risky) {
      extras.push(`<span class="risk">RISQUÉ · jet de ${STAT_LABELS[ch.risky.stat]} (DC ${ch.risky.dc})</span>`);
    }

    return `<button class="incident-choice" data-incident-choice="${i}" ${available ? '' : 'disabled'}>
      ${fillAmounts(ch.label, ch.outcome)}
      ${extras.join('')}
    </button>`;
  }).join('');

  return `
    <div class="incident-eyebrow ${inc.positive ? 'positive' : ''}">
      ${inc.positive ? 'Événement' : 'Incident'} · <span class="${severityClass}">${severityLabel}</span> · ${def.nom}
    </div>
    <h3 class="incident-title">${inc.titre || (inc.positive ? 'Bonne nouvelle' : 'Quelque chose s\'est passé')}</h3>
    <p class="incident-body">${text}</p>
    <div class="incident-choices">${choicesHTML}</div>
  `;
}

function hookIncidentModal(decId) {
  const m = $('#modal');
  m.querySelectorAll('button[data-incident-choice]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const dec = (S.pendingDecisions || []).find(d => d.id === decId);
      if (!dec) { closeDecisionModal(); return; }   // déjà résolue (double clic…)
      const inc = INCIDENTS[dec.refId];
      const victim = resolveIncidentVictim(dec);
      const choice = inc.choices[parseInt(btn.dataset.incidentChoice, 10)];
      const ok = applyIncidentChoice(inc, choice, victim);
      if (ok === false) return;
      removeDecision(decId);
      closeDecisionModal();
      save();
      render();
    });
  });
}

// Compatibilité : ancien rollColonyIncident remplacé par tickIncidents
export function rollColonyIncident(silent = false) {
  tickIncidents(silent);
}

// ============================================================
//   ÉVÉNEMENTS DE COLONIE (0.19)
// ============================================================
// Distinction avec les incidents :
//   - Incidents : causés par les choix du joueur (sécurité), liés à un bâtiment
//   - Événements : organiques, indépendants de la sécurité, conditions globales
//
// Format :
//   id, theme, positive (bool)
//   condition: () => bool    — peut-il se déclencher maintenant ?
//   pickActors: () => { primary, secondary? } — qui est concerné
//   text: "..." (peut référencer {primary} et {secondary})
//   titre : libellé lisible (notifications, effets temporaires)
//   choices: [...] comme les incidents (pay, req, consume) ; un libellé peut
//            citer les montants réels via {loss.metal}, {gain.datacubes}…

export const COLONY_EVENTS = {
  // ===== ÉVÉNEMENTS SOCIAUX =====
  event_anniversaire: {
    titre: "Anniversaire",
    theme: 'Anniversaire',
    positive: true,
    condition: () => aliveCrew().some(m => {
      const age = currentAge(m);
      return age > 0 && age % 5 === 0 && (S.meta.gameMin - (m.lastBirthdayCelebrated || -99999)) > 30 * 24 * 60;
    }),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => {
        const age = currentAge(m);
        return age > 0 && age % 5 === 0 && (S.meta.gameMin - (m.lastBirthdayCelebrated || -99999)) > 30 * 24 * 60;
      });
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "C'est l'anniversaire de {primary}. {age} ans. L'équipage attend de voir si on marque le coup.",
    choices: [
      { label: "Organiser une vraie fête", pay: true, outcome: { loss: { biomasse: 25 }, moralAll: +4, log: "Soirée mémorable. {primary} sourit toute la nuit.", markBirthday: true } },
      { label: "Geste discret entre amis", outcome: { moralAll: +1, log: "Cadeau modeste, sincère. {primary} apprécie.", markBirthday: true } },
      { label: "Ne pas s'en occuper", outcome: { moralAll: -2, log: "Personne n'a rien dit. {primary} a remarqué.", markBirthday: true } }
    ]
  },

  event_hommage: {
    titre: "Hommage aux disparus",
    theme: 'Hommage',
    positive: false,
    condition: () => {
      const recent = (S.crew || []).filter(m => m.statut === 'mort' && m.diedAt && (S.meta.gameMin - m.diedAt) < 7 * 24 * 60);
      return recent.length > 0 && (S.meta.gameMin - (S.lastHommageMin || -99999)) > 7 * 24 * 60;
    },
    pickActors: () => {
      const recent = S.crew.filter(m => m.statut === 'mort' && m.diedAt && (S.meta.gameMin - m.diedAt) < 7 * 24 * 60);
      return { primary: recent[Math.floor(Math.random() * recent.length)] };
    },
    text: "L'équipage propose une cérémonie en mémoire de {primary}. Une pause dans la routine.",
    choices: [
      { label: "Tenir la cérémonie", outcome: { moralAll: +3, log: "L'hommage rend du courage à l'équipage.", markHommage: true } },
      { label: "Une minute de silence simple", outcome: { moralAll: +1, log: "Geste sobre. Mais sincère.", markHommage: true } },
      { label: "Refuser, focus sur le présent", outcome: { moralAll: -3, log: "L'équipage murmure. La présence des morts pèse plus encore.", markHommage: true } }
    ]
  },

  event_conflit_rivaux: {
    titre: "Dispute entre rivaux",
    theme: 'Conflit',
    positive: false,
    condition: () => {
      // Au moins une paire avec affinité ≤ -50
      const all = aliveCrew();
      for (let i = 0; i < all.length; i++) {
        for (let j = i+1; j < all.length; j++) {
          if (affinityBetween(all[i].id, all[j].id) <= -50) return true;
        }
      }
      return false;
    },
    pickActors: () => {
      const all = aliveCrew();
      const pairs = [];
      for (let i = 0; i < all.length; i++) {
        for (let j = i+1; j < all.length; j++) {
          if (affinityBetween(all[i].id, all[j].id) <= -50) {
            pairs.push([all[i], all[j]]);
          }
        }
      }
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      return { primary: pair[0], secondary: pair[1] };
    },
    text: "Une dispute éclate entre {primary} et {secondary}. Les autres assistent en silence. Ça pourrait empirer.",
    choices: [
      { label: "Médiation officielle", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { adjustAffinity: { a: 'primary', b: 'secondary', delta: +25 }, log: "La médiation calme les esprits. Les deux acceptent un statu quo." } },
      { label: "Sanction stricte des deux", outcome: { moralAll: -2, adjustAffinity: { a: 'primary', b: 'secondary', delta: -10 }, log: "Discipline rétablie. Mais les ressentiments restent." } },
      { label: "Séparer leurs affectations", outcome: { moralAll: +1, log: "Les deux ne se croisent plus. Tension désamorcée." } },
      { label: "Laisser faire", outcome: { moralAll: -3, adjustAffinity: { a: 'primary', b: 'secondary', delta: -15 }, log: "Le conflit s'envenime. L'équipe s'inquiète." } }
    ]
  },

  event_romance: {
    titre: "Romance naissante",
    theme: 'Romance',
    positive: true,
    condition: () => {
      const all = aliveCrew();
      for (let i = 0; i < all.length; i++) {
        for (let j = i+1; j < all.length; j++) {
          const aff = affinityBetween(all[i].id, all[j].id);
          if (aff >= 75 && aff < 95) return true;
        }
      }
      return false;
    },
    pickActors: () => {
      const all = aliveCrew();
      const pairs = [];
      for (let i = 0; i < all.length; i++) {
        for (let j = i+1; j < all.length; j++) {
          const aff = affinityBetween(all[i].id, all[j].id);
          if (aff >= 75 && aff < 95) pairs.push([all[i], all[j]]);
        }
      }
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      return { primary: pair[0], secondary: pair[1] };
    },
    text: "Quelque chose d'évident pour tout le monde sauf eux-mêmes : {primary} et {secondary} se cherchent. L'équipage prend les paris.",
    choices: [
      { label: "Encourager discrètement", outcome: { adjustAffinity: { a: 'primary', b: 'secondary', delta: +20 }, moralAll: +2, log: "{primary} et {secondary} osent enfin. L'équipage applaudit." } },
      { label: "Ne rien dire et laisser faire", outcome: { adjustAffinity: { a: 'primary', b: 'secondary', delta: +5 }, log: "L'équipage observe, en silence." } }
    ]
  },

  // ===== INITIATIVES INDIVIDUELLES =====
  event_initiative_jardin: {
    titre: "Nouvelle technique de culture",
    theme: 'Initiative',
    positive: true,
    condition: () => S.modules.hydroponie?.level >= 2 && aliveCrew().some(m => (m.skills.survie || 0) >= 2),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => (m.skills.survie || 0) >= 2);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} propose une nouvelle technique de culture. Elle nécessite un peu de temps.",
    choices: [
      { label: "Lui donner les moyens", pay: true, outcome: { loss: { biomasse: 15 }, gain: { biomasse: 50, datacubes: 4 }, log: "{primary} double le rendement de la cuve d'essai." } },
      { label: "Plus tard", outcome: { moralAll: -1, log: "{primary} comprend. Mais l'élan est passé." } }
    ]
  },

  event_initiative_atelier: {
    titre: "Idée pour l'atelier",
    theme: 'Initiative',
    positive: true,
    condition: () => S.modules.atelier?.level >= 2 && aliveCrew().some(m => (m.skills.ingenierie || 0) >= 3),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => (m.skills.ingenierie || 0) >= 3);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} a une idée pour optimiser l'atelier. Elle pense pouvoir doubler la précision de fabrication.",
    choices: [
      { label: "L'autoriser à expérimenter", pay: true, outcome: { loss: { metal: 20, cristal: 10 }, gain: { datacubes: 12 }, log: "{primary} valide son hypothèse. Données techniques précieuses." } },
      { label: "Demander un mémo détaillé d'abord", req: { skill: { key: 'science', min: 2 } },
        outcome: { gain: { datacubes: 8 }, log: "{primary} produit un dossier rigoureux. La méthode est intégrée sans coût." } },
      { label: "Refuser, trop coûteux", outcome: { moralAll: -1, log: "{primary} se replie sur ses tâches. Un peu déçu." } }
    ]
  },

  // ===== PLAINTES & DEMANDES COLLECTIVES =====
  event_plainte_repas: {
    titre: "Plainte sur les rations",
    theme: 'Plainte',
    positive: false,
    condition: () => aliveCrew().length >= 4 && (S.res.biomasse || 0) < (capOf('biomasse') * 0.3),
    pickActors: () => ({ primary: aliveCrew()[Math.floor(Math.random() * aliveCrew().length)] }),
    text: "L'équipage se plaint des rations. Plusieurs colons mangent à peine. {primary} parle au nom des autres.",
    choices: [
      { label: "Augmenter les portions à court terme", pay: true, outcome: { loss: { biomasse: 30 }, moralAll: +3, log: "L'équipage est apaisé. Les estomacs sont pleins ce soir." } },
      { label: "Distribuer une ration concentrée", consume: { item: 'ration_concentree' },
        outcome: { moralAll: +2, log: "La ration est partagée. Geste apprécié." } },
      { label: "Promettre une amélioration future", outcome: { moralAll: -2, log: "{primary} hoche la tête, peu convaincu." } },
      { label: "Refuser sèchement", outcome: { moralAll: -5, log: "Le silence retombe. La rancœur monte." } }
    ]
  },

  event_plainte_logement: {
    titre: "Plainte sur le logement",
    theme: 'Plainte',
    positive: false,
    condition: () => aliveCrew().length >= 3 && crewUsage().used >= crewUsage().total - 1 && (S.modules.habitat?.level || 0) < 4,
    pickActors: () => ({ primary: aliveCrew()[Math.floor(Math.random() * aliveCrew().length)] }),
    text: "L'habitat est saturé. {primary} évoque l'inconfort, le manque d'intimité, le bruit constant.",
    choices: [
      { label: "Promettre une expansion prioritaire", outcome: { moralAll: +1, log: "L'équipage attend des actes." } },
      { label: "Distribuer des kits de réparation pour bricoler", consume: { item: 'kit_reparation' },
        outcome: { moralAll: +2, log: "Les colons aménagent leurs espaces. C'est mieux." } },
      { label: "Trop occupé pour ça", outcome: { moralAll: -3, log: "L'équipe note. La frustration grandit." } }
    ]
  },

  // ===== VISITEURS / RECRUTEMENTS RARES =====
  event_visiteur_isole: {
    titre: "Visiteur isolé",
    theme: 'Visiteur',
    positive: true,
    condition: () => crewUsage().used < crewUsage().total && (S.meta.gameMin - (S.lastVisitorMin || -99999)) > 14 * 24 * 60,
    pickActors: () => ({ primary: null }),  // Pas d'acteur préexistant
    text: "Une silhouette inconnue se présente à l'avant-poste. Sans vaisseau, sans escorte. Elle dit avoir voyagé seule longtemps.",
    choices: [
      { label: "L'accueillir comme colon", outcome: { spawnVisitor: true, log: "Un nouveau visage rejoint l'avant-poste. L'équipage est curieux.", markVisitor: true } },
      { label: "L'interroger d'abord", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { spawnVisitor: 'safe', gain: { datacubes: 8 }, log: "Histoire vérifiée. Le visiteur rejoint la colonie sereinement.", markVisitor: true } },
      { label: "La renvoyer poliment", outcome: { moralAll: -1, log: "La silhouette s'éloigne. Personne ne sait ce qu'elle est devenue.", markVisitor: true } }
    ]
  },

  event_marchand: {
    titre: "Marchand de passage",
    theme: 'Visiteur',
    positive: true,
    // 0.33 : le marchand ne vient que si au moins un échange est payable (montants ×OUTCOME_MULT)
    condition: () => (S.meta.gameMin - (S.lastMerchantMin || -99999)) > 21 * 24 * 60
      && ((S.res.metal || 0) >= 80 * OUTCOME_MULT || (S.res.cristal || 0) >= 50 * OUTCOME_MULT),
    pickActors: () => ({ primary: null }),
    text: "Un vaisseau marchand se pose pour quelques heures. Le pilote propose un échange unique.",
    choices: [
      { label: "Échanger {loss.metal} métal contre {gain.datacubes} datacubes", pay: true, outcome: { loss: { metal: 80 }, gain: { datacubes: 30 }, log: "L'échange est conclu.", markMerchant: true } },
      { label: "Échanger {loss.cristal} cristal contre 1 schéma humain", pay: true, outcome: { loss: { cristal: 50 }, randomBlueprint: 'humain', log: "Un plan technique change de mains.", markMerchant: true } },
      { label: "Rien d'intéressant", outcome: { markMerchant: true, log: "Le marchand repart sans rien vendre." } }
    ]
  },

  // ===== DÉCOUVERTES & INSIGHTS =====
  event_insight_labo: {
    titre: "Intuition au laboratoire",
    theme: 'Découverte',
    positive: true,
    condition: () => S.modules.laboratoire?.level >= 2 && (S.research?.length > 0 || Object.keys(S.techCompleted || {}).length >= 2),
    pickActors: () => {
      const staff = staffOf('laboratoire').map(s => s.member);
      if (staff.length > 0) return { primary: staff[Math.floor(Math.random() * staff.length)] };
      return { primary: aliveCrew()[Math.floor(Math.random() * aliveCrew().length)] };
    },
    text: "{primary} relit ses notes pour la dixième fois. Cette fois, quelque chose lui saute aux yeux.",
    choices: [
      { label: "L'autoriser à publier", outcome: { gain: { datacubes: 18 }, moralAll: +1, log: "{primary} formalise une découverte mineure. Un palier intellectuel." } },
      { label: "Garder confidentiel", outcome: { gain: { datacubes: 12 }, log: "Les données restent dans le coffre. Pour plus tard." } }
    ]
  },

  event_decouverte_archive: {
    titre: "Archive retrouvée",
    theme: 'Découverte',
    positive: true,
    condition: () => aliveCrew().some(m => (m.skills.linguistique || 0) >= 2),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => (m.skills.linguistique || 0) >= 2);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} retombe sur une vieille archive numérique de la colonie. Il y a quelque chose dedans.",
    choices: [
      { label: "Décrypter en profondeur", outcome: { gain: { datacubes: 15 }, log: "Données pré-Effondrement décryptées. Insight historique." } },
      { label: "Survol rapide", outcome: { gain: { datacubes: 5 }, log: "Quelques bribes intéressantes." } }
    ]
  },

  // ===== SONGES COLLECTIFS =====
  event_songe: {
    titre: "Songe collectif",
    theme: 'Songe',
    positive: false,
    condition: () => aliveCrew().length >= 3 && Object.keys(S.discoveries || {}).some(id => {
      const bp = BLUEPRINTS[id];
      return bp && (bp.origin === 'alien_a' || bp.origin === 'alien_b' || bp.origin === 'fusion');
    }),
    pickActors: () => ({ primary: aliveCrew()[Math.floor(Math.random() * aliveCrew().length)] }),
    text: "Plusieurs colons font le même rêve cette nuit. {primary} l'évoque le lendemain. Une grande forme qui regarde. Aucun visage.",
    choices: [
      { label: "Documenter pour étude", req: { skill: { key: 'science', min: 2 } },
        outcome: { gain: { datacubes: 10 }, log: "Le rêve collectif est consigné. Étrange. Précieux." } },
      { label: "Faire comme si de rien n'était", outcome: { moralAll: -2, log: "Tout le monde se tait. Mais quelque chose plane." } },
      { label: "Renforcer les heures de sommeil", outcome: { moralAll: +1, log: "Repos forcé. Les rêves s'estompent." } }
    ]
  },

  // ===== PROPOSITION D'EXPLORATION =====
  event_volontaire: {
    titre: "Volontaire pour patrouiller",
    theme: 'Initiative',
    positive: true,
    condition: () => aliveCrew().some(m => m.statut === 'libre' && (m.skills.combat || 0) >= 2),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => m.statut === 'libre' && (m.skills.combat || 0) >= 2);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} demande à former une patrouille de reconnaissance autour de la colonie.",
    choices: [
      { label: "L'autoriser pour 12h", outcome: { gain: { biomasse: 20, datacubes: 4 }, log: "{primary} ramène quelques échantillons et une cartographie locale." } },
      { label: "Demander un planning précis", req: { skill: { key: 'science', min: 1 } },
        outcome: { gain: { datacubes: 10 }, log: "Mission cadrée. Données utiles, sans perte de temps." } },
      { label: "Refuser. Trop risqué.", outcome: { moralAll: -1, log: "{primary} comprend. Frustration discrète." } }
    ]
  }
};

// Trouve un événement éligible pondéré
function pickColonyEvent() {
  // Un événement déjà en attente du joueur n'est pas re-tiré
  const pending = new Set((S.pendingDecisions || []).filter(d => d.kind === 'event').map(d => d.refId));
  // V1 : un même événement ne revient pas avant PACING.EVENT_REPEAT_GAP
  const lastAt = S.flags.eventLastAt || {};
  const eligible = Object.entries(COLONY_EVENTS).filter(([id, ev]) => {
    if (pending.has(id)) return false;
    if (typeof lastAt[id] === 'number' && S.meta.gameMin - lastAt[id] < PACING.EVENT_REPEAT_GAP) return false;
    try { return ev.condition(); } catch (e) { return false; }
  });
  if (eligible.length === 0) return null;
  // Évite la répétition immédiate
  if (S.lastColonyEventId) {
    const filtered = eligible.filter(([id]) => id !== S.lastColonyEventId);
    if (filtered.length > 0) return filtered[Math.floor(Math.random() * filtered.length)][0];
  }
  return eligible[Math.floor(Math.random() * eligible.length)][0];
}

// V1 : un événement toutes les 3 à 6 h réelles (PACING.EVENT_GAP_*). Pendant une
// absence, il n'est plus tranché à la place du joueur : il attend dans la file
// (PACING.EVENT_QUEUE_MAX au plus).
export function tickColonyEvents(silent = false) {
  if (S.meta.gameMin < (S.nextEventMin || 0)) return;
  S.nextEventMin = S.meta.gameMin + PACING.EVENT_GAP_MIN + Math.random() * (PACING.EVENT_GAP_MAX - PACING.EVENT_GAP_MIN);
  if ((S.pendingDecisions || []).filter(d => d.kind === 'event').length >= PACING.EVENT_QUEUE_MAX) return;

  const eventId = pickColonyEvent();
  if (!eventId) return;
  triggerColonyEvent(eventId, silent);
}

// V1 : au retour d'une absence de plus de PACING.EVENT_ON_RETURN_AFTER, un
// événement est garanti (s'il y en a un d'éligible et pas déjà un en attente).
// Renvoie l'identifiant de l'événement déclenché, ou null.
export function guaranteeReturnEvent() {
  if ((S.pendingDecisions || []).some(d => d.kind === 'event')) return null;
  const eventId = pickColonyEvent();
  if (!eventId) return null;
  if (!triggerColonyEvent(eventId, false)) return null;
  S.nextEventMin = Math.max(S.nextEventMin || 0, S.meta.gameMin + PACING.EVENT_GAP_MIN);
  return eventId;
}

function triggerColonyEvent(eventId, silent = false) {
  const ev = COLONY_EVENTS[eventId];
  if (!ev) return false;
  let actors;
  try { actors = ev.pickActors(); } catch (e) { return false; }
  if (!actors) return false;
  S.lastColonyEventId = eventId;
  if (!S.flags.eventLastAt) S.flags.eventLastAt = {};
  S.flags.eventLastAt[eventId] = S.meta.gameMin;
  enqueueDecision({ kind: 'event', refId: eventId, ...decisionActors(actors), offline: silent || undefined });
  // 0.26.1 : notification dédiée (warn — événement en attente de décision)
  if (!silent) notif.colonyEvent(colonyEventTitle(eventId));
  return true;
}

function autoResolveColonyEvent(eventId, actors) {
  const ev = COLONY_EVENTS[eventId];
  if (!ev) return;
  const choice = pickAutoChoice(ev.choices);
  if (!choice) return;
  if (applyColonyEventChoice(eventId, choice, actors, { auto: true }) !== false) {
    recordAutoResolution('event', colonyEventTitle(eventId), fillAmounts(choice.label, choice.outcome));
  }
}

// Libellé d'un choix d'événement : montants réels et nom du protagoniste (échappé)
function eventChoiceLabelHTML(ch, actors) {
  return esc(fillAmounts(ch.label, ch.outcome)).replace(/\{primary\}/g, esc(actors?.primary?.name || ''));
}

function renderColonyEventContent(eventId, actors) {
  const ev = COLONY_EVENTS[eventId];
  const primaryName = actors.primary?.name || '';
  const secondaryName = actors.secondary?.name || '';
  const age = actors.primary ? currentAge(actors.primary) : '';
  const text = ev.text
    .replace(/\{primary\}/g, primaryName ? `<em>${esc(primaryName)}</em>` : 'un colon')
    .replace(/\{secondary\}/g, secondaryName ? `<em>${esc(secondaryName)}</em>` : '')
    .replace(/\{age\}/g, age);

  const choicesHTML = ev.choices.map((ch, i) => {
    let extras = [];
    let available = true;
    if (ch.req?.skill) {
      const has = skillReqMet(ch.req, aliveCrew());
      extras.push(`<span class="req ${has ? '' : 'locked'}">REQUIERT : ${SKILL_LABELS[ch.req.skill.key]} ≥ ${ch.req.skill.min}</span>`);
      if (!has) available = false;
    }
    if (ch.consume?.item) {
      const itDef = ITEMS[ch.consume.item];
      const has = (S.inventory?.[ch.consume.item] || 0) > 0;
      extras.push(`<span class="cost ${has ? '' : 'ko'}" style="${has ? 'color:#b09bd0' : ''}">CONSOMME : ${itDef?.nom || ch.consume.item}</span>`);
      if (!has) available = false;
    }
    if (ch.pay && ch.outcome?.loss) {
      const ok = choiceAffordable(ch);
      extras.push(`<span class="cost ${ok ? '' : 'ko'}">COÛT : ${amountsText(ch.outcome.loss)}${ok ? '' : ' — stock insuffisant'}</span>`);
      if (!ok) available = false;
    }
    return `<button class="incident-choice" data-event-choice="${i}" ${available ? '' : 'disabled'}>
      ${eventChoiceLabelHTML(ch, actors)}
      ${extras.join('')}
    </button>`;
  }).join('');

  const themeColor = ev.positive ? 'var(--moss)' : 'var(--amber)';
  return `
    <div class="incident-eyebrow ${ev.positive ? 'positive' : ''}">
      Événement · <span style="color:${themeColor}">${ev.theme}</span>
    </div>
    <h3 class="incident-title">${ev.titre || (ev.positive ? 'Une bonne nouvelle' : 'Quelque chose se passe')}</h3>
    <p class="incident-body">${text}</p>
    <div class="incident-choices">${choicesHTML}</div>
  `;
}

function hookColonyEventModal(decId) {
  const m = $('#modal');
  m.querySelectorAll('button[data-event-choice]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const dec = (S.pendingDecisions || []).find(d => d.id === decId);
      if (!dec) { closeDecisionModal(); return; }   // déjà résolue (double clic…)
      const ev = COLONY_EVENTS[dec.refId];
      const actors = resolveEventActors(dec);
      if (!ev || !actors) {
        // Devenu caduc entre l'affichage et le clic
        removeDecision(decId);
        closeDecisionModal();
        render();
        return;
      }
      const choice = ev.choices[parseInt(btn.dataset.eventChoice, 10)];
      const result = applyColonyEventChoice(dec.refId, choice, actors);
      if (result === false) return;   // échec (ex : stock insuffisant) — on laisse choisir
      S.lastColonyEventId = dec.refId;
      removeDecision(decId);
      save();
      // 0.30 — Affiche l'écran de conséquences avant de fermer.
      m.innerHTML = renderColonyConsequence(result, choice, actors);
      hookColonyConsequence();
      // Met à jour l'arrière-plan (ressources, etc.) tout de suite
      render();
    });
  });
}

// 0.30 — Écran de conséquences : ce que le choix a réellement provoqué.
function renderColonyConsequence(result, choice, actors) {
  const label = eventChoiceLabelHTML(choice, actors);
  const effectsHTML = (result.effects || []).map(e => {
    const cls = e.kind === 'good' ? 'good' : e.kind === 'bad' ? 'bad' : 'neutral';
    const sign = e.kind === 'good' ? '▲' : e.kind === 'bad' ? '▼' : '•';
    return `<li class="cons-effect ${cls}"><span class="cons-icon">${sign}</span><span>${esc(e.text)}</span></li>`;
  }).join('');
  const narrativeHTML = result.narrative
    ? `<p class="incident-body">${result.narrative}</p>`
    : '';
  return `
    <div class="incident-eyebrow ${result.positive ? 'positive' : ''}">Conséquences</div>
    <h3 class="incident-title">« ${label} »</h3>
    ${narrativeHTML}
    <ul class="cons-list">${effectsHTML}</ul>
    <div class="incident-choices">
      <button class="incident-choice" id="consContinue" style="text-align:center">Continuer</button>
    </div>
  `;
}

function hookColonyConsequence() {
  $('#consContinue')?.addEventListener('click', () => {
    closeDecisionModal();
    render();
  });
}

// Applique un choix d'événement. Renvoie false si impossible (prérequis,
// objet, stock), sinon { ok, narrative (HTML), effects (texte brut), positive }.
// opts.auto : décision automatique — pas de toast, une seule ligne de journal.
export function applyColonyEventChoice(eventId, choice, actors, opts = {}) {
  const ev = COLONY_EVENTS[eventId];
  const auto = !!opts.auto;
  const notes = [];
  const say = (kind, txt) => { if (auto) notes.push(txt); else log(kind, txt); };
  const primary = actors.primary;
  const secondary = actors.secondary;

  // Prérequis et coût vérifiés AVANT tout effet
  if (choice.req?.skill && !skillReqMet(choice.req, aliveCrew())) {
    if (!auto) toast(`Personne ne remplit : ${SKILL_LABELS[choice.req.skill.key]} ≥ ${choice.req.skill.min}`);
    return false;
  }
  if (!choiceAffordable(choice)) {
    if (!auto) toast(`Stock insuffisant : ${amountsText(choice.outcome.loss)}`);
    return false;
  }
  // Consume item
  if (choice.consume?.item) {
    if (!S.inventory?.[choice.consume.item]) {
      if (!auto) toast(`Stock insuffisant : ${ITEMS[choice.consume.item]?.nom}`);
      return false;
    }
    S.inventory[choice.consume.item]--;
    if (S.inventory[choice.consume.item] <= 0) delete S.inventory[choice.consume.item];
  }

  const o = choice.outcome || {};

  // 0.30 — Conséquences concrètes recensées et renvoyées à l'UI.
  // Elles varient selon l'équipage et les ententes (réactions des proches, climat moral).
  const effects = [];   // { kind:'good'|'bad'|'neutral', text } — texte brut (échappé au rendu)
  const team = aliveCrew();

  // Climat moral de la colonie : module l'intensité des conséquences négatives.
  // Une colonie déjà à cran encaisse plus mal les mauvaises décisions.
  const avgMoral = team.length ? team.reduce((s, m) => s + (m.moral || 0), 0) / team.length : 50;
  let moodMult = 1;
  let moodNote = null;
  if ((o.moralAll || 0) < 0) {
    if (avgMoral < 35) { moodMult = 1.5; moodNote = "L'équipage est déjà à bout : le coup porte plus fort."; }
    else if (avgMoral > 75) { moodMult = 0.6; moodNote = "L'équipage est soudé : il encaisse sans broncher."; }
  } else if ((o.moralAll || 0) > 0) {
    if (avgMoral < 35) { moodMult = 1.4; moodNote = "Après les jours difficiles, ce répit fait d'autant plus de bien."; }
  }

  // Pertes / gains de ressources — montants RÉELLEMENT appliqués
  if (o.loss) {
    for (const k in o.loss) {
      const lost = removeResourceCapped(k, o.loss[k] * OUTCOME_MULT);
      if (lost > 0) effects.push({ kind: 'bad', text: `−${Math.round(lost)} ${RES_LABELS[k] || k}` });
    }
  }
  if (o.gain) {
    for (const k in o.gain) {
      const amt = o.gain[k] * OUTCOME_MULT;
      const got = addResourceCapped(k, amt);
      effects.push({ kind: 'good', text: `+${Math.round(got)} ${RES_LABELS[k] || k}${got < amt ? ' (stock plein)' : ''}` });
    }
  }
  // Moral collectif — 0.28 : impact durable (×3), 0.30 : modulé par le climat
  if (o.moralAll) {
    const delta = Math.round(o.moralAll * 3 * moodMult);
    for (const m of team) {
      m.moral = Math.max(0, Math.min(100, m.moral + delta));
    }
    effects.push({
      kind: delta >= 0 ? 'good' : 'bad',
      text: `Moral de l'équipage ${delta >= 0 ? '+' : ''}${delta} (${team.length} colon${team.length > 1 ? 's' : ''})`
    });
    if (moodNote) effects.push({ kind: 'neutral', text: moodNote });
  }
  // Ajustement d'affinité ciblé
  if (o.adjustAffinity) {
    const a = o.adjustAffinity.a === 'primary' ? primary?.id : (o.adjustAffinity.a === 'secondary' ? secondary?.id : null);
    const b = o.adjustAffinity.b === 'primary' ? primary?.id : (o.adjustAffinity.b === 'secondary' ? secondary?.id : null);
    if (a && b) {
      adjustAffinity(a, b, o.adjustAffinity.delta);
      const an = S.crew.find(m => m.id === a)?.name || '?';
      const bn = S.crew.find(m => m.id === b)?.name || '?';
      const rel = relationType(affinityBetween(a, b));
      effects.push({
        kind: o.adjustAffinity.delta >= 0 ? 'good' : 'bad',
        text: `Entente ${an} ↔ ${bn} ${o.adjustAffinity.delta >= 0 ? '+' : ''}${o.adjustAffinity.delta} → ${rel.label}`
      });
    }
  }

  // 0.30 — RÉACTIONS DES PROCHES : le cœur de "ça dépend des ententes".
  // Ce qui arrive au protagoniste touche émotionnellement ses proches (et réjouit ses rivaux).
  // La tonalité vient du signe de moralAll, sinon du caractère positif/négatif de l'événement.
  if (primary) {
    let tone = 0;
    if (typeof o.moralAll === 'number' && o.moralAll !== 0) tone = o.moralAll > 0 ? 1 : -1;
    else if (o.gain || o.spawnVisitor || o.randomBlueprint) tone = 1;
    else if (o.loss || o.debuff || o.generateRivalry) tone = -1;
    else tone = ev.positive ? 1 : -1;

    const { friends, rivals } = significantRelations(primary.id);
    // Les proches (hors secondary déjà traité) ressentent le contrecoup
    const reactingFriends = friends.filter(f => f.memberId !== secondary?.id);
    if (reactingFriends.length > 0 && tone !== 0) {
      const fDelta = tone > 0 ? 4 : -5;
      for (const f of reactingFriends) {
        f.member.moral = Math.max(0, Math.min(100, f.member.moral + fDelta));
      }
      const names = reactingFriends.map(f => f.member.name).join(', ');
      effects.push({
        kind: tone > 0 ? 'good' : 'bad',
        text: tone > 0
          ? `Ses proches (${names}) partagent le moment — moral +${fDelta}`
          : `Ses proches (${names}) encaissent avec lui — moral ${fDelta}`
      });
    }
    // Les rivaux savourent (ou compatissent à peine) — effet inverse, plus discret
    if (tone < 0 && rivals.length > 0) {
      const rNames = rivals.map(r => r.member.name).join(', ');
      for (const r of rivals) {
        r.member.moral = Math.max(0, Math.min(100, r.member.moral + 2));
      }
      effects.push({ kind: 'neutral', text: `${rNames} ne cache${rivals.length > 1 ? 'nt' : ''} pas une certaine satisfaction.` });
    }
  }

  // Marqueurs (pour cooldown spécifique)
  if (o.markBirthday && primary) primary.lastBirthdayCelebrated = S.meta.gameMin;
  if (o.markHommage) S.lastHommageMin = S.meta.gameMin;
  if (o.markVisitor) S.lastVisitorMin = S.meta.gameMin;
  if (o.markMerchant) S.lastMerchantMin = S.meta.gameMin;
  // Spawn d'un nouveau colon (visiteur)
  if (o.spawnVisitor) {
    const cap = crewUsage();
    if (cap.used < cap.total) {
      const cand = genCandidate();
      // Visiteur "safe" : un peu meilleur
      if (o.spawnVisitor === 'safe') {
        // Boost léger : +1 à un skill aléatoire
        const skills = SKILL_LIST;
        const k = skills[Math.floor(Math.random() * skills.length)];
        cand.skills[k] = Math.min(5, (cand.skills[k] || 0) + 1);
      }
      const member = {
        ...cand,
        id: uid('m'),
        joinedAt: S.meta.gameMin,
        birthGameMin: S.meta.gameMin - (cand.age || 30) * YEAR_IN_GAME_MIN,
        statut: 'libre',
        sante: 100,
        statuts: [],
        sequels: [],
        blessures: []
      };
      S.crew.push(member);
      autoAssignMember(member.id);
      effects.push({ kind: 'good', text: `${member.name} rejoint la colonie (${cap.used + 1}/${cap.total})` });
    } else {
      effects.push({ kind: 'bad', text: `Habitat plein : impossible d'accueillir le visiteur.` });
    }
  }
  // Schéma aléatoire
  if (o.randomBlueprint) {
    const bpId = rollBlueprint([o.randomBlueprint]);
    if (bpId) {
      addBlueprintToInventory(bpId, 'événement');
      effects.push({ kind: 'good', text: `Schéma acquis : ${BLUEPRINTS[bpId]?.nom || bpId}` });
    }
  }

  // 0.28 : NOUVEAUX EFFETS DURABLES (mêmes que pour les incidents)
  // — debuff : pénalité globale temporaire
  if (o.debuff) {
    if (!S.activeBuffs) S.activeBuffs = [];
    S.activeBuffs.push({
      ...o.debuff,
      sourceLabel: colonyEventTitle(eventId),
      startedAt: S.meta.gameMin,
      expiresAt: (S.meta.gameMin || 0) + legacyDuration(o.debuff.duration || 720)
    });
    say('warn', `Effet en cours : ${o.debuff.label || 'modulation temporaire'}.`);
    effects.push({ kind: 'bad', text: `Effet en cours : ${o.debuff.label || 'modulation temporaire'}` });
  }
  // — generateRivalry entre primary et secondary
  if (o.generateRivalry && primary && secondary) {
    const key = [primary.id, secondary.id].sort().join('|');
    if (!S.relations) S.relations = {};
    S.relations[key] = Math.min(-30, (S.relations[key] || 0) - 25);
    say('warn', `<em>${esc(primary.name)}</em> et <em>${esc(secondary.name)}</em> se brouillent durablement.`);
    effects.push({ kind: 'bad', text: `${primary.name} et ${secondary.name} se brouillent durablement.` });
  }
  // — historicalMark : entrée dans le journal historique de la colonie
  if (o.historicalMark) {
    if (!S.historicalMarks) S.historicalMarks = [];
    S.historicalMarks.push({
      at: S.meta.gameMin,
      text: o.historicalMark,
      victim: primary?.name || null
    });
  }

  // Log final + narratif renvoyé à l'UI (HTML : noms échappés)
  let narrative = '';
  if (o.log) {
    narrative = o.log
      .replace(/\{primary\}/g, primary ? `<em>${esc(primary.name)}</em>` : 'un colon')
      .replace(/\{secondary\}/g, secondary ? `<em>${esc(secondary.name)}</em>` : '');
  }
  if (auto) {
    log(ev.positive ? 'success' : 'warn',
      `<b>${esc(colonyEventTitle(eventId))}</b> — décision automatique : « ${eventChoiceLabelHTML(choice, actors)} ». ${[narrative, ...notes].filter(Boolean).join(' ')}`.trim());
  } else if (narrative) {
    log(ev.positive ? 'success' : 'warn', narrative);
  }
  if (effects.length === 0) {
    effects.push({ kind: 'neutral', text: 'Aucune conséquence notable.' });
  }
  return { ok: true, narrative, effects, positive: ev.positive };
}

// Identifiants uniques (factions, missions, vaisseaux) — import local et aliasé
// pour ne pas entrer en conflit avec l'import principal de util.js.

// ============================================================
//   ARCS NARRATIFS (0.20)
// ============================================================
// Quatre arcs longs qui donnent une direction au jeu.
// Chaque arc a des étapes (steps) vérifiées automatiquement à chaque tick.
// Une étape se complète quand sa condition() devient true.
// Les arcs se débloquent quand leur unlock() devient true.
//
// Format :
//   id, nom, eyebrow, color, intro
//   unlock: () => bool
//   steps: [{ id, title, narrative, condition: () => bool }]
//   reward: { kind, value, log } — appliqué à la fin


// État d'un arc : { unlocked, completedSteps: [stepId], completedAt, rewardClaimed }
export function getArcState(arcId) {
  if (!S.arcs) S.arcs = {};
  if (!S.arcs[arcId]) {
    S.arcs[arcId] = { unlocked: false, completedSteps: [], rewardClaimed: false };
  }
  return S.arcs[arcId];
}

export function isArcComplete(arcId) {
  const arc = ARCS[arcId];
  if (!arc) return false;
  const state = getArcState(arcId);
  return state.completedSteps.length >= arc.steps.length;
}

export function isStepComplete(arcId, stepId) {
  const state = getArcState(arcId);
  return state.completedSteps.includes(stepId);
}

// Tente de débloquer/avancer tous les arcs
export function tickArcs() {
  for (const arcId in ARCS) {
    const arc = ARCS[arcId];
    const state = getArcState(arcId);

    // Suivi passif : une étape peut déclarer track(state) pour mémoriser un fait
    // passager (ex. un colon infecté) avant que sa condition ne soit évaluée.
    // Appelé à chaque tick, même si l'arc n'est pas encore débloqué.
    for (const step of arc.steps) {
      if (!step.track || isStepComplete(arcId, step.id)) continue;
      try { step.track(state); } catch (e) {}
    }

    // Déblocage
    if (!state.unlocked) {
      try {
        if (arc.unlock()) {
          state.unlocked = true;
          state.unlockedAt = S.meta.gameMin;
          log('success', `<em>Chronique ouverte :</em> ${arc.nom}.`);
        }
      } catch (e) {}
      continue;
    }

    // Progression des étapes, dans l'ordre : on s'arrête à la première étape
    // non remplie. Plusieurs étapes consécutives peuvent se valider au même tick.
    // Les étapes déjà validées (y compris hors ordre par une version antérieure)
    // restent acquises et sont simplement sautées.
    for (const step of arc.steps) {
      if (isStepComplete(arcId, step.id)) continue;
      let met = false;
      try { met = !!step.condition(state); } catch (e) { met = false; }
      if (!met) break;
      state.completedSteps.push(step.id);
      log('success', `<em>${arc.nom} :</em> ${step.title}.`);
    }

    // Récompense si arc complet et pas encore claim
    if (isArcComplete(arcId) && !state.rewardClaimed) {
      claimArcReward(arcId);
    }
  }
}

function claimArcReward(arcId) {
  const arc = ARCS[arcId];
  const state = getArcState(arcId);
  if (state.rewardClaimed) return;
  const r = arc.reward;
  if (!r) return;

  if (r.kind === 'blueprint') {
    addBlueprintToInventory(r.value, 'récompense de chronique');
  } else if (r.kind === 'tech') {
    // Trace informative uniquement : le déblocage effectif de la tech légendaire
    // est vérifié par canResearch() via prereq.requireArc (state.rewardClaimed).
    // S.unlockedLegendaryTechs n'est lu nulle part ; conservé pour les sauvegardes.
    if (!S.unlockedLegendaryTechs) S.unlockedLegendaryTechs = {};
    S.unlockedLegendaryTechs[r.value] = true;
  } else if (r.kind === 'permanent_bonus') {
    if (!S.permanentBonuses) S.permanentBonuses = {};
    S.permanentBonuses[r.value] = true;
  }
  state.rewardClaimed = true;
  state.completedAt = S.meta.gameMin;
  log('success', `<em>Chronique achevée : ${arc.nom}.</em> ${r.log}`);
}

// Récupère les bonus permanents actifs (étend techEffectsAccumulated)
export function permanentBonusesAccumulated() {
  const acc = { resourceMult: { metal:1, cristal:1, energie:1, biomasse:1, datacubes:1 } };
  if (!S.permanentBonuses) return acc;
  if (S.permanentBonuses.avant_poste_autonome) {
    for (const k in acc.resourceMult) acc.resourceMult[k] *= 1.10;
  }
  return acc;
}

// ============================================================
//   DIPLOMATIE & FACTIONS (0.21)
// ============================================================
// Quand une expédition rencontre une civilisation pour la première fois,
// une faction est créée pour la planète. Les choix dans les scènes civ_*
// modifient la réputation de la faction. À haute réputation, commerce
// automatique. À faible réputation, embuscades.


// Statut diplomatique selon réputation (0.30 — 6 paliers)
export function factionStatus(rep) {
  if (rep >= 75) return { key: 'allie',   label: 'Allié',    color: '#6aad8a' };
  if (rep >= 50) return { key: 'ami',     label: 'Ami',      color: 'var(--moss)' };
  if (rep >= 20) return { key: 'cordial', label: 'Cordial',  color: 'var(--amber)' };
  if (rep > -20) return { key: 'neutre',  label: 'Neutre',   color: 'var(--text-mute)' };
  if (rep > -60) return { key: 'mefiant', label: 'Méfiant',  color: 'var(--rust)' };
  return             { key: 'hostile',  label: 'Hostile',  color: '#c53030' };
}

// 0.30 — Offrir un cadeau à une faction
export function offerGift(factionId, giftIdx) {
  const f = S.factions?.[factionId];
  if (!f) return;
  const ft = FACTION_TYPES[f.type];
  const gift = ft.giftOptions?.[giftIdx];
  if (!gift) return;
  // Cooldown
  const cooldown = ft.giftCooldown || PACING.GIFT_COOLDOWN;
  if (f.lastGift && (S.meta.gameMin - f.lastGift) < cooldown) {
    const wait = cooldown - (S.meta.gameMin - f.lastGift);
    toast(`Cadeau récent. Réessaie dans ${fmtDuree(wait)}.`);
    return;
  }
  if ((S.res[gift.resource] || 0) < gift.amount) {
    toast(`Ressources insuffisantes (${RES_LABELS[gift.resource]}).`);
    return;
  }
  S.res[gift.resource] -= gift.amount;
  f.lastGift = S.meta.gameMin;
  adjustReputation(factionId, gift.repGain);
  log('success', `Cadeau offert à <em>${f.name}</em> — ${gift.label} (−${gift.amount} ${RES_LABELS[gift.resource]}) : réputation +${gift.repGain}.`);
  render();
}

// Génère un nom de faction selon le type
function genFactionName(type, rng = Math.random) {
  const t = FACTION_TYPES[type];
  if (!t) return 'Faction inconnue';
  const p = t.namePrefixes[Math.floor(rng() * t.namePrefixes.length)];
  const s = t.nameSuffixes[Math.floor(rng() * t.nameSuffixes.length)];
  return `${p} ${s}`;
}

// Crée une faction depuis une rencontre
function createFaction(type, body) {
  const ft = FACTION_TYPES[type];
  if (!ft) return null;
  const id = uid('fac');
  const faction = {
    id,
    type,
    name: genFactionName(type),
    bodyId: body?.id || null,
    bodyName: body?.name || 'Inconnu',
    systemId: body?.systemId || null,
    reputation: ft.initialReputation,
    metAt: S.meta.gameMin,
    tradeActive: false,
    lastCaravan: null
  };
  if (!S.factions) S.factions = {};
  S.factions[id] = faction;
  log('success', `Faction rencontrée : <em>${faction.name}</em> (${ft.label}) sur ${faction.bodyName}.`);
  return faction;
}

// Trouve ou crée la faction associée à une planète selon son type de civilisation
function findOrCreateFactionForBody(body) {
  if (!body) return null;
  // Si le body a déjà une factionId connue, retourne
  if (body.factionId && S.factions?.[body.factionId]) return S.factions[body.factionId];
  // Détermine le type selon les caractéristiques du corps
  let type = null;
  if (body.ruines === 'fusion') type = 'fusion';
  else if (body.ruines === 'alien_a') type = 'alien_a';
  else if (body.ruines === 'alien_b') type = 'alien_b';
  else if (body.vie === 'civ_active') type = 'humain';      // Civ active sans ruines = humaine par défaut
  else if (body.vie === 'civ_dechue') type = 'humain';
  if (!type) return null;
  const faction = createFaction(type, body);
  body.factionId = faction.id;
  return faction;
}

// Modifie la réputation d'une faction (cap -100/+100)
export function adjustReputation(factionId, delta) {
  if (!S.factions?.[factionId]) return;
  const f = S.factions[factionId];
  const oldStatus = factionStatus(f.reputation).key;
  f.reputation = Math.max(-100, Math.min(100, f.reputation + delta));
  const newStatus = factionStatus(f.reputation).key;
  if (oldStatus !== newStatus) {
    log(delta > 0 ? 'success' : 'warn',
      `<em>${f.name}</em> est désormais <b>${factionStatus(f.reputation).label}</b>.`);
    // 0.26.1 : notification dédiée
    notif.reputationSeuil(f.name, factionStatus(f.reputation).label.toLowerCase());
  }
}

// 0.32.1 — Les technologies diplomatiques conditionnent le commerce et l'alliance.
// Les seuils de réputation sont inchangés ; la technologie est requise EN PLUS.
// Compatibilité : une route déjà ouverte ou une alliance déjà nouée (lastAllianceGift
// posé) dans une sauvegarde antérieure reste active (droits acquis).
const TRADE_REP_MIN = 40, ALLIANCE_REP_MIN = 75;
const TRADE_TECH = 'tech_commerce_interstellaire', ALLIANCE_TECH = 'tech_traites_formels';
const techLabel = id => TECH_TREE[id]?.nom || id;

// Peut-on ouvrir une route commerciale avec cette faction ? → { ok, why }
export function tradeRequirement(f) {
  if (!f) return { ok: false, why: 'Faction inconnue.' };
  if (f.reputation < TRADE_REP_MIN) return { ok: false, why: `Réputation trop faible (${TRADE_REP_MIN}+ requis).` };
  if (!isTechCompleted(TRADE_TECH)) return { ok: false, why: `Requiert la technologie ${techLabel(TRADE_TECH)}.` };
  return { ok: true, why: '' };
}

// L'alliance (dons automatiques) est-elle active avec cette faction ? → { ok, why }
export function allianceRequirement(f) {
  if (!f) return { ok: false, why: 'Faction inconnue.' };
  if (f.reputation < ALLIANCE_REP_MIN) return { ok: false, why: `Réputation ${ALLIANCE_REP_MIN}+ requise.` };
  if (!isTechCompleted(ALLIANCE_TECH) && !f.lastAllianceGift) return { ok: false, why: `Requiert la technologie ${techLabel(ALLIANCE_TECH)}.` };
  return { ok: true, why: '' };
}

// Compatibilité 0.31b : la ressource fantôme « composants » (butin de combat)
// n'existe pas. Les sauvegardes qui en contiennent la voient convertie en métal.
function purgeLegacyComposants() {
  if (S.res && S.res.composants !== undefined) {
    const n = Math.max(0, Math.floor(Number(S.res.composants) || 0));
    delete S.res.composants;
    if (n > 0) S.res.metal = Math.min(capOf('metal'), (S.res.metal || 0) + n);
  }
  for (const exp of S.expeditions || []) {
    const loot = exp.accumulatedLoot;
    if (!loot || loot.composants === undefined) continue;
    const n = Math.max(0, Math.floor(Number(loot.composants) || 0));
    delete loot.composants;
    if (n > 0) loot.metal = (loot.metal || 0) + n;
  }
}

// Détermine si une faction proposera une caravane à ce tick
export function tickFactions() {
  purgeLegacyComposants();
  if (!S.factions) return;
  for (const id in S.factions) {
    const f = S.factions[id];
    const ft = FACTION_TYPES[f.type];
    // Commerce auto (rep ≥ 40 et activé par le joueur — l'activation exige la tech,
    // cf. toggleFactionTrade ; une route ouverte avant 0.32.1 reste active)
    if (f.reputation >= TRADE_REP_MIN && f.tradeActive) {
      const cycle = PACING.CARAVAN_CYCLE;
      if (!f.lastCaravan) f.lastCaravan = f.metAt;
      if (S.meta.gameMin - f.lastCaravan >= cycle) triggerCaravan(f);
    }
    // 0.30 — Don d'alliance (rep ≥ 75, automatique) — 0.32.1 : requiert Traités formels
    if (f.reputation >= ALLIANCE_REP_MIN && ft?.allianceGift && !allianceRequirement(f).ok) {
      if (!f.allianceTechWarned) {
        f.allianceTechWarned = true;
        log('neutral', `<em>${f.name}</em> serait prête à sceller une alliance formelle. ${allianceRequirement(f).why}`);
      }
    } else if (f.reputation >= ALLIANCE_REP_MIN && ft?.allianceGift) {
      const ag = ft.allianceGift;
      if (!f.lastAllianceGift) f.lastAllianceGift = f.metAt || S.meta.gameMin;
      if (S.meta.gameMin - f.lastAllianceGift >= ag.interval) {
        S.res[ag.resource] = Math.min(capOf(ag.resource), (S.res[ag.resource] || 0) + ag.amount);
        f.lastAllianceGift = S.meta.gameMin;
        log('success', `<em>${f.name}</em> (Allié) envoie un don : +${ag.amount} ${RES_LABELS[ag.resource]}.`);
        notif.colonyEvent(f.name + ' — don allié');
      }
    }
  }
}

function triggerCaravan(faction) {
  const ft = FACTION_TYPES[faction.type];
  if (!ft) return;
  // Vérifie qu'on a de quoi payer
  for (const k in ft.tradeAsk) {
    if ((S.res[k] || 0) < ft.tradeAsk[k]) {
      log('warn', `Caravane de <em>${faction.name}</em> repartie sans échange : ${RES_LABELS[k]} insuffisant.`);
      faction.lastCaravan = S.meta.gameMin;
      return;
    }
  }
  // Échange
  for (const k in ft.tradeAsk) {
    S.res[k] = Math.max(0, (S.res[k] || 0) - ft.tradeAsk[k]);
  }
  for (const k in ft.tradeOffer) {
    S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + ft.tradeOffer[k]);
  }
  faction.lastCaravan = S.meta.gameMin;
  const offerStr = Object.entries(ft.tradeOffer).map(([k,v]) => `+${v} ${RES_LABELS[k]}`).join(', ');
  const askStr = Object.entries(ft.tradeAsk).map(([k,v]) => `-${v} ${RES_LABELS[k]}`).join(', ');
  log('success', `Caravane de <em>${faction.name}</em> : ${offerStr} contre ${askStr}.`);
}

// Active / désactive le commerce avec une faction
export function toggleFactionTrade(factionId) {
  const f = S.factions?.[factionId];
  if (!f) return;
  // Suspendre est toujours possible ; ouvrir exige réputation + technologie.
  if (!f.tradeActive) {
    const req = tradeRequirement(f);
    if (!req.ok) { toast(req.why); return; }
  }
  f.tradeActive = !f.tradeActive;
  if (f.tradeActive) {
    f.lastCaravan = S.meta.gameMin;
    log('success', `Commerce ouvert avec <em>${f.name}</em>. Première caravane dans ${fmtDuree(PACING.CARAVAN_CYCLE)}.`);
  } else {
    log('neutral', `Commerce suspendu avec <em>${f.name}</em>.`);
  }
}

// ============================================================
//   MISSIONS DIPLOMATIQUES (0.21)
// ============================================================

// Lance une mission diplomatique
export function launchDiplomaticMission(factionId, memberId) {
  const f = S.factions?.[factionId];
  if (!f) return;
  const m = S.crew.find(c => c.id === memberId);
  if (!m) return;
  const ft = FACTION_TYPES[f.type];

  // 0.30 — prérequis selon le type de faction
  const reqSkill  = ft.missionReqSkill  || 'linguistique';
  const reqMin    = ft.missionReqMin    || 3;
  const reqAlt    = ft.missionReqAlt;
  const meetsReq  = (m.skills[reqSkill] || 0) >= reqMin ||
                    (reqAlt && (m.skills[reqAlt.skill] || 0) >= reqAlt.min);
  if (!meetsReq) {
    const altLabel = reqAlt ? ` ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : '';
    toast(`${SKILL_LABELS[reqSkill]} ${reqMin}+${altLabel} requis pour cette faction.`);
    return;
  }
  // Seul un colon libre ou en poste peut partir (son poste lui reste réservé,
  // comme pour une expédition) — jamais un colon déjà en mission, en expédition,
  // en formation, à l'infirmerie, ni mort.
  if ((m.statut !== 'libre' && m.statut !== 'travail') ||
      (S.diplomaticMissions || []).some(d => d.memberId === m.id)) {
    toast(`${m.name} n'est pas disponible.`);
    return;
  }
  if (isTreatingDoctor(m.id)) {
    toast(`${m.name} assure un traitement en cours.`);
    return;
  }
  if ((S.diplomaticMissions || []).some(d => d.factionId === factionId)) {
    toast(`Une mission est déjà en cours auprès de ${f.name}.`);
    return;
  }
  const ambassadeLvl = S.modules?.ambassade?.level || 0;
  const maxParallel = Math.max(1, ambassadeLvl);
  const active = (S.diplomaticMissions || []).length;
  if (active >= maxParallel) {
    toast(ambassadeLvl === 0
      ? "Mission en cours. Construis l'Ambassade pour en gérer plusieurs en parallèle."
      : `Limite atteinte : ${maxParallel} mission(s) (Ambassade niv ${ambassadeLvl}).`);
    return;
  }
  const cost = ft.missionCost ?? 25;
  if ((S.res.biomasse || 0) < cost) {
    toast(`Provisions insuffisantes (${cost} biomasse).`);
    return;
  }
  S.res.biomasse -= cost;
  m.statut = 'diplomatie';
  if (!S.diplomaticMissions) S.diplomaticMissions = [];
  const duration = PACING.DIPLO_MISSION_MIN + Math.floor(Math.random() * (PACING.DIPLO_MISSION_MAX - PACING.DIPLO_MISSION_MIN));
  // 0.29 — Un Émissaire disponible (à quai) porte la délégation : bonus de réputation.
  // Le vaisseau n'est pas immobilisé : il reste utilisable pour les expéditions.
  const envoy = (S.fleet || []).find(v => v.type === 'emissaire' && v.available);
  S.diplomaticMissions.push({
    id: uid('dipl'),
    factionId,
    memberId,
    startedAt: S.meta.gameMin,
    duration,
    vesselType: envoy ? 'emissaire' : null,
    vesselId: envoy ? envoy.id : null
  });
  const envoyNote = envoy ? ` à bord de l'Émissaire <em>${envoy.name}</em> (réputation ×${VESSELS.emissaire.diplomaticBonus || 1.5})` : '';
  log('neutral', `<em>${m.name}</em> est parti(e) en mission diplomatique vers <em>${f.name}</em>${envoyNote}. Retour dans ${fmtDuree(duration)}.`);
  render();
}

// Tick : avance les missions diplomatiques
export function tickDiplomaticMissions() {
  if (!S.diplomaticMissions || S.diplomaticMissions.length === 0) return;
  const finished = [];
  for (const mis of S.diplomaticMissions) {
    const member = S.crew.find(c => c.id === mis.memberId);
    // Un diplomate mort ou disparu met fin à la mission sans attendre son terme
    const lost = !member || member.statut === 'mort';
    if (lost || S.meta.gameMin - mis.startedAt >= mis.duration) finished.push(mis);
  }
  for (const mis of finished) {
    completeDiplomaticMission(mis);
  }
}

// Succès critiques nécessaires pour gagner +1 dans la compétence de mission
const DIPLO_CRITS_PER_SKILL = 5;

function completeDiplomaticMission(mis) {
  const member = S.crew.find(c => c.id === mis.memberId);
  const faction = S.factions?.[mis.factionId];
  S.diplomaticMissions = S.diplomaticMissions.filter(m => m.id !== mis.id);
  // Diplomate mort ou absent : la mission échoue, sans récompense
  if (!member || member.statut === 'mort') {
    const who = member ? `<em>${member.name}</em>` : 'Le diplomate';
    log('warn', `Mission diplomatique vers <em>${faction?.name || 'une faction'}</em> perdue : ${who} n'en reviendra pas.`);
    return;
  }
  if (member.statut === 'diplomatie') returnToBase(member);
  if (!faction) return;

  const ft = FACTION_TYPES[faction.type];

  // 0.30 — Jet sur compétence primaire de la faction + linguistique en soutien
  const primarySkill = ft.missionSkill || 'linguistique';
  // 0.32.1 — Les compétences sont entières. Une ancienne version ajoutait +0.1 par
  // succès critique : on ramène la valeur à l'entier inférieur et on convertit
  // la fraction en succès critiques déjà acquis (0.1 = 1 succès).
  const rawSkill = Number(member.skills[primarySkill]) || 0;
  if (!Number.isInteger(rawSkill)) {
    member.skills[primarySkill] = Math.floor(rawSkill);
    member.diploCrits = (member.diploCrits || 0) + Math.round((rawSkill - Math.floor(rawSkill)) * 10);
    while (member.diploCrits >= DIPLO_CRITS_PER_SKILL && member.skills[primarySkill] < 5) {
      member.diploCrits -= DIPLO_CRITS_PER_SKILL;
      member.skills[primarySkill]++;
    }
  }
  if (!Number.isInteger(member.skills.linguistique || 0)) member.skills.linguistique = Math.round(member.skills.linguistique);
  const primaryScore = member.skills[primarySkill] || 0;
  const lingScore = primarySkill !== 'linguistique' ? (member.skills.linguistique || 0) : 0;
  const charisme = member.stats?.charisme || 5;
  const roll = 1 + Math.floor(Math.random() * 10);
  const total = roll + primaryScore * 2 + Math.floor(lingScore * 0.6) + Math.floor((charisme - 5) / 2);
  const dc = 10;
  const critDc = dc + 5;

  // Multiplicateurs cumulés
  let diploMult = 1.0;
  const ambassadeLvl = S.modules?.ambassade?.level || 0;
  if (ambassadeLvl >= 2) diploMult += (ambassadeLvl - 1) * 0.10;
  const tech = techEffectsAccumulated();
  if (tech.diplomaticBonus) diploMult *= tech.diplomaticBonus;
  if (mis.vesselType && VESSELS[mis.vesselType]?.diplomaticBonus) diploMult *= VESSELS[mis.vesselType].diplomaticBonus;

  if (total >= dc) {
    const isCrit = total >= critDc;
    const baseGain = isCrit ? (25 + Math.floor(Math.random() * 11)) : (15 + Math.floor(Math.random() * 11));
    const gain = Math.round(baseGain * diploMult);
    adjustReputation(faction.id, gain);
    const multLabel = diploMult > 1.05 ? ` (×${diploMult.toFixed(2)})` : '';
    let extraLog = '';
    // Succès critique : bonus selon le type de faction
    if (isCrit) {
      if (faction.type === 'alien_a' || faction.type === 'fusion') {
        const bpId = rollBlueprint([faction.type === 'fusion' ? 'fusion' : 'alien_a']);
        if (bpId) {
          addBlueprintToInventory(bpId, 'diplomatie');
          extraLog = ` Schéma partagé : <em>${BLUEPRINTS[bpId]?.nom || bpId}</em>.`;
        }
      } else if (faction.type === 'alien_b') {
        const bonusAmt = Math.round(60 * diploMult);
        S.res.biomasse = Math.min(capOf('biomasse'), (S.res.biomasse || 0) + bonusAmt);
        extraLog = ` Don biologique : +${bonusAmt} biomasse.`;
      } else {
        const bonusAmt = Math.round(40 * diploMult);
        S.res.metal = Math.min(capOf('metal'), (S.res.metal || 0) + bonusAmt);
        extraLog = ` Don culturel : +${bonusAmt} métal.`;
      }
    }
    const critLabel = isCrit ? ' ★ Succès exceptionnel.' : '';
    log('success', `<em>${member.name}</em> revient de mission diplomatique.${critLabel} <em>${faction.name}</em> : réputation +${gain}${multLabel}.${extraLog}`);
    member.moral = Math.min(100, member.moral + (isCrit ? 10 : 5));
    // Progression compétence : chaque succès critique compte ; +1 (entier) au bout
    // de DIPLO_CRITS_PER_SKILL succès critiques.
    if (isCrit && primaryScore < 5) {
      member.diploCrits = (member.diploCrits || 0) + 1;
      if (member.diploCrits >= DIPLO_CRITS_PER_SKILL) {
        member.diploCrits -= DIPLO_CRITS_PER_SKILL;
        member.skills[primarySkill] = Math.min(5, primaryScore + 1);
        log('success', `<em>${member.name}</em> progresse : ${SKILL_LABELS[primarySkill] || primarySkill} ${member.skills[primarySkill]}.`);
      }
    }
  } else {
    const malus = roll <= 2 ? -10 : (roll <= 4 ? -5 : 0);
    if (malus !== 0) adjustReputation(faction.id, malus);
    log('warn', `<em>${member.name}</em> revient de mission diplomatique. ${malus < 0 ? `Malentendu culturel : ${malus} réputation.` : 'Aucun progrès notable.'}`);
    member.moral = Math.max(0, member.moral - 3);
  }
}

// ============================================================
//   FIN DIPLOMATIE — Helpers d'expédition
// ============================================================

// Appelé au début d'une scène civ_* : tente de créer/récupérer la faction
function noteFactionForExpedition(exp) {
  const sys = S.galaxy?.systems?.find(s => s.id === exp.systemId);
  const body = sys?.bodies?.find(b => b.id === exp.bodyId);
  if (!body) return null;
  if (!body.systemId) body.systemId = sys.id;
  return findOrCreateFactionForBody(body);
}

// Renvoie la faction associée à une expédition (si présente)
function factionForExpedition(exp) {
  const sys = S.galaxy?.systems?.find(s => s.id === exp.systemId);
  const body = sys?.bodies?.find(b => b.id === exp.bodyId);
  if (!body || !body.factionId) return null;
  return S.factions?.[body.factionId] || null;
}

// ============================================================
//   FLOTTE — construction et gestion de vaisseaux
// ============================================================

export function genVesselName(typeKey) {
  // Préfixe selon type
  const prefixes = {
    vedette:  ['Furet','Faucon','Aiguille','Gypaète','Effraie','Saiga','Vif'],
    navette:  ['Bouvreuil','Mousson','Cabestan','Rhéa','Albatros','Truite'],
    cargo:    ['Ourse','Mastodon','Kraken','Charrette','Bourdon','Wapiti'],
    cuirasse: ['Sentinelle','Hégémon','Lance','Meute','Chambellan'],
    emissaire: ['Héraut','Colombe','Concorde','Messager','Iris','Passerelle']
  };
  const list = prefixes[typeKey] || ['Vaisseau'];
  const num = Math.floor(Math.random() * 89) + 11; // 11–99
  return `${list[Math.floor(Math.random() * list.length)]}-${num}`;
}

// Places de la flotte : l'aire de fortune (1) + 1 par niveau de hangar
export function fleetCapacity() {
  return 1 + (S.modules.hangar?.level || 0);
}

// Durée de construction d'un vaisseau (ticks)
export function vesselBuildDuration(typeKey) {
  const def = VESSELS[typeKey];
  return def ? def.buildHours * 60 * BUILD_TIME_MULT : 0;
}

export function canBuildVessel(typeKey) {
  const def = VESSELS[typeKey];
  if (!def) return { ok:false, why:'Modèle inconnu' };
  if (S.vesselBuild) return { ok:false, why:'Chantier vaisseau déjà en cours' };
  const hangarLvl = S.modules.hangar?.level || 0;
  if (hangarLvl < def.hangarReq) return { ok:false, why:`Hangar niv ${def.hangarReq} requis` };
  // Capacité : 1 vaisseau par niveau de hangar + l'aire de fortune (V1 : la vedette de départ)
  const fleetCount = S.fleet.length;
  if (fleetCount >= fleetCapacity()) return { ok:false, why:`Capacité de la flotte atteinte (${fleetCapacity()})` };
  
  // 0.29 — check prérequis tech (ex. Émissaire requiert tech_diplomatie_cosmopolite)
  if (def.requireTech) {
    if (!S.techCompleted || !S.techCompleted[def.requireTech]) {
      const techNom = TECH_TREE[def.requireTech]?.nom || def.requireTech;
      return { ok:false, why:`Requiert la tech ${techNom}` };
    }
  }
  // 0.29 — check prérequis modules (ex. Émissaire requiert Ambassade niv 3)
  if (def.requireModule) {
    for (const modId in def.requireModule) {
      const reqLvl = def.requireModule[modId];
      const curLvl = S.modules[modId]?.level || 0;
      if (curLvl < reqLvl) {
        const modNom = MODULES[modId]?.nom || modId;
        return { ok:false, why:`Requiert ${modNom} niv ${reqLvl}` };
      }
    }
  }
  
  for (const k in def.cost) {
    if (S.res[k] < def.cost[k]) return { ok:false, why:`Ressources insuffisantes (${RES_LABELS[k]})` };
  }
  return { ok:true, def };
}

export function startVesselBuild(typeKey) {
  const r = canBuildVessel(typeKey);
  if (!r.ok) { toast(r.why); return; }
  for (const k in r.def.cost) S.res[k] -= r.def.cost[k];
  S.vesselBuild = {
    type: typeKey,
    totalMin: vesselBuildDuration(typeKey),
    doneMin: 0,
    cost: { ...r.def.cost }
  };
  log('neutral', `Mise sur cale : <em>${r.def.nom}</em>. Livraison estimée : ${fmtDuree(S.vesselBuild.totalMin)}.`);
  render();
}

export function finishVesselBuild() {
  const b = S.vesselBuild;
  if (!b) return;
  const def = VESSELS[b.type];
  const vessel = {
    id: uid('v'),
    type: b.type,
    name: genVesselName(b.type),
    available: true   // false quand affecté à une expé en cours
  };
  S.fleet.push(vessel);
  log('success', `Sortie d'usine : <em>${def.nom} ${vessel.name}</em>. Prêt au décollage.`);
  S.vesselBuild = null;
}

// ============================================================
//   EXPÉDITIONS — phase 2b : voyage + résolution auto
//                 phase 2c remplacera onsite par scènes interactives
// ============================================================

// Pré-vol : valide qu'on peut lancer une expédition
export function canLaunchExpedition({ vesselId, bodyId, crewIds }) {
  const vessel = S.fleet.find(v => v.id === vesselId);
  if (!vessel) return { ok:false, why:'Vaisseau introuvable' };
  if (!vessel.available) return { ok:false, why:'Vaisseau déjà engagé' };
  const def = VESSELS[vessel.type];

  // Trouve la planète et son système
  let body = null, sys = null;
  for (const s of S.galaxy.systems) {
    const b = s.bodies.find(b => b.id === bodyId);
    if (b) { body = b; sys = s; break; }
  }
  if (!body) return { ok:false, why:'Destination introuvable' };
  if (!sys.scanned) return { ok:false, why:'Système non cartographié' };

  if (!Array.isArray(crewIds) || crewIds.length === 0) return { ok:false, why:'Aucun équipage sélectionné' };
  if (crewIds.length > def.places) return { ok:false, why:`Max ${def.places} membres pour ce vaisseau` };

  // Tous les membres doivent être disponibles et vivants : libres, ou en poste
  // (0.22 — le poste reste réservé pendant l'expédition, cf. launchExpedition ;
  // c'est aussi ce que propose l'écran de lancement).
  for (const id of crewIds) {
    const m = S.crew.find(c => c.id === id);
    if (!m) return { ok:false, why:'Membre introuvable' };
    if (m.statut !== 'libre' && m.statut !== 'travail') return { ok:false, why:`${m.name} : ${m.statut}` };
    if (isTreatingDoctor(m.id)) return { ok:false, why:`${m.name} assure un traitement en cours` };
  }

  // Calcul coûts (avec bonus Hangar et tech) — V1 : durées en secondes réelles
  // (décollage + trajet), carburant et vivres indexés sur la production (PROD_INDEX)
  const hb = hangarBonuses();
  const tech = techEffectsAccumulated();
  const oneWaySec = PACING.EXPED_BASE + sys.distance * EXPED_TIME_PER_PC * def.speed * hb.speedMult * tech.vesselSpeedMult;
  const totalHours = (oneWaySec * 2 + EXPED_ONSITE_MIN) / 3600;
  const fuel = Math.ceil(sys.distance * def.fuelPerPc * 2 * hb.fuelMult * tech.vesselFuelMult * PACING.FUEL_SCALE * PROD_INDEX);
  const bio  = Math.ceil(totalHours * EXPED_BIOMASSE_PER_HOUR * crewIds.length * tech.expeditionBiomasseMult);

  if (S.res.energie < fuel) return { ok:false, why:`Carburant insuffisant (${fuel} énergie requis)` };
  if (S.res.biomasse < bio) return { ok:false, why:`Biomasse insuffisante (${bio} requis)` };

  return {
    ok: true,
    vessel, def, body, sys,
    oneWayMin: Math.round(oneWaySec),
    onSiteMin: EXPED_ONSITE_MIN,
    fuel, bio,
    totalMin: Math.round(totalHours * 3600)
  };
}

export function launchExpedition(args) {
  const r = canLaunchExpedition(args);
  if (!r.ok) { toast(r.why); return; }
  // Vérifier capacité d'équipement
  const def = VESSELS[r.vessel.type];
  const equipment = args.equipment || {};
  const equipUnits = Object.values(equipment).reduce((s, n) => s + n, 0);
  if (equipUnits > (def.equipSlots || 0)) {
    toast(`Trop d'équipement (${equipUnits}/${def.equipSlots})`);
    return;
  }
  // Vérifier que les items sont en stock
  for (const itemId in equipment) {
    if ((S.inventory?.[itemId] || 0) < equipment[itemId]) {
      toast(`Stock insuffisant : ${ITEMS[itemId]?.nom || itemId}`);
      return;
    }
  }
  // Débite ressources
  S.res.energie -= r.fuel;
  S.res.biomasse -= r.bio;
  // Débite items de l'inventaire colonie
  for (const itemId in equipment) {
    S.inventory[itemId] -= equipment[itemId];
    if (S.inventory[itemId] <= 0) delete S.inventory[itemId];
  }
  // Marque vaisseau et équipage
  r.vessel.available = false;
  for (const id of args.crewIds) {
    const m = S.crew.find(c => c.id === id);
    // 0.22 — Le poste reste réservé pendant l'expédition, le colon le reprendra au retour.
    m.statut = 'expedition';
  }
  // Génère la séquence de scènes
  const expSeed = `${S.meta.seed}|exp${Date.now()}|${args.bodyId}`;
  const sceneRng = rngFor(expSeed);
  const scenes = selectExpeditionScenes(r.body, sceneRng);
  // Crée l'expédition
  const exp = {
    id: 'e_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36) + S.expeditions.length,
    vesselId: args.vesselId,
    bodyId: args.bodyId,
    systemId: r.sys.id,
    crewIds: [...args.crewIds],
    phase: 'aller',
    elapsedMin: 0,
    oneWayMin: r.oneWayMin,
    onSiteMin: r.onSiteMin,
    cost: { fuel: r.fuel, bio: r.bio },
    bodyDistance: r.sys.distance,
    seed: expSeed,
    scenes: scenes.map(s => s.id),
    sceneIdx: -1,
    awaitingChoice: false,
    accumulatedLoot: {},
    accumulatedItems: [],
    accumulatedLog: [],
    sceneThreatMod: 0,
    equipment: { ...equipment }   // 0.15 — items embarqués
  };
  // Épisode de chronique : on retient lequel, pour ne pas en sauter un si
  // plusieurs expéditions visent le même corps
  if (exp.scenes[0] === CHRON_INTRO_ID) {
    exp.chronicleRef = { id: r.body.chronicle.id, episodeIdx: r.body.chronicle.episodeIdx };
  }
  S.expeditions.push(exp);
  const equipNote = equipUnits > 0 ? ` · ${equipUnits} équipement(s) embarqué(s)` : '';
  log('neutral', `Décollage : <em>${r.vessel.name}</em> en route vers <em>${r.body.name}</em>. Voyage : ${fmtDuree(r.oneWayMin)}${equipNote}.`);
  render();
}

// Avance toutes les expéditions d'un tick
let _chronRecruitsCheckedFor = null;
export function tickExpeditions() {
  // Répare une fois par partie chargée les colons de chronique créés par les versions ≤ 0.32
  if (_chronRecruitsCheckedFor !== S) {
    _chronRecruitsCheckedFor = S;
    normalizeChronicleRecruits(S);
  }
  if (S.expeditions.length === 0) return;
  const completed = [];
  for (const exp of [...S.expeditions]) {
    if (exp.phase === 'sur_place' && !exp.combat?.active) {
      // Sur place, l'expédition ne peut qu'attendre une décision
      if (!exp.awaitingChoice) exp.awaitingChoice = true;
      // Scène introuvable (données changées, sauvegarde ancienne…) : plutôt que de
      // bloquer vaisseau et équipage pour toujours, l'équipe rentre.
      if (!currentScene(exp)) {
        exp.accumulatedLog.push("Plus rien à explorer ici : l'équipe regagne le vaisseau.");
        log('warn', `<em>${vesselNameOf(exp)}</em> : mission interrompue sur <em>${bodyOfExpedition(exp)?.name || 'site inconnu'}</em>, retour à l'avant-poste.`);
        startReturn(exp);
        continue;
      }
    }
    // On ne fait pas avancer le temps quand on attend un choix joueur
    if (exp.phase === 'sur_place' && exp.awaitingChoice) continue;

    exp.elapsedMin += MIN_PER_TICK;
    // Transitions de phase
    if (exp.phase === 'aller' && exp.elapsedMin >= exp.oneWayMin) {
      exp.phase = 'sur_place';
      exp.elapsedMin = 0;
      onArrival(exp);
    } else if (exp.phase === 'retour' && exp.elapsedMin >= exp.oneWayMin) {
      completed.push(exp);
    }
    // Note : la phase 'sur_place' ne se termine plus par timer
    // mais par les scènes (outcome.end ou outcome.retreat)
  }
  for (const exp of completed) {
    grantRuinDiscovery(exp);
    onReturn(exp);
    const idx = S.expeditions.indexOf(exp);
    if (idx >= 0) S.expeditions.splice(idx, 1);
  }
}

// ---- V1 : découvertes déterministes des ruines ----
// Les schémas dont dépendent des techs ne sont plus tirés au hasard : la n-ième
// expédition qui rentre d'un type de ruines rapporte le n-ième schéma de la piste
// de ce type (s'il n'est pas déjà connu). La 1re visite de ruines alien ouvre donc
// la branche exotique, et la suite de la branche suit l'exploration.
export const RUIN_DISCOVERY_TRACK = {
  humaines: ['bp_kit_medical', 'bp_extraction_avancee', 'bp_module_stockage'],
  alien_a:  ['bp_voilure_cristal', 'bp_arme_resonance'],
  alien_b:  ['bp_culture_xeno', 'bp_membrane_adaptive'],
  fusion:   ['bp_propulsion_pliee', 'bp_relais_quantique'],
};

function grantRuinDiscovery(exp) {
  const body = bodyOfExpedition(exp);
  const track = RUIN_DISCOVERY_TRACK[body?.ruines];
  if (!track) return;
  if (!S.flags.ruinVisits) S.flags.ruinVisits = {};
  const n = S.flags.ruinVisits[body.ruines] = (S.flags.ruinVisits[body.ruines] || 0) + 1;
  // Premier schéma de la piste pas encore connu, dans la limite du rang de la visite
  const bp = track.slice(0, n).find(id => BLUEPRINTS[id] && !S.discoveries?.[id]);
  if (!bp) return;
  if (!Array.isArray(exp.accumulatedItems)) exp.accumulatedItems = [];
  exp.accumulatedItems.push(bp);
  if (Array.isArray(exp.accumulatedLog)) exp.accumulatedLog.push(`Relevés des ruines : schéma ${BLUEPRINTS[bp].nom}.`);
}

function onArrival(exp) {
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  const body = sys?.bodies.find(b => b.id === exp.bodyId);
  if (!body) return;
  body.visited = true;
  sys.explored = true;
  log('neutral', `<em>${vesselNameOf(exp)}</em> arrive sur <em>${body.name}</em>. Exploration en cours.`);
  // Épisode de chronique prévu au départ : on vérifie qu'il est toujours jouable
  // (une autre expédition a pu le conclure ou être en train de le jouer).
  if (exp.scenes[0] === CHRON_INTRO_ID) {
    const busy = S.expeditions.some(o => o !== exp && o.bodyId === exp.bodyId && o.phase === 'sur_place' && isChronicleExpedition(o));
    if (currentChronicleEpisode(body) && !busy) {
      exp.chronicleRef = { id: body.chronicle.id, episodeIdx: body.chronicle.episodeIdx };
    } else {
      exp.scenes = selectExpeditionScenes(body, rngFor(`${exp.seed}|arrivee`), { skipChronicle: true }).map(s => s.id);
      delete exp.chronicleRef;
    }
  }
  // Site déjà fouillé récemment : butin réduit pour toute la mission (hors chronique)
  exp.lootMult = isChronicleExpedition(exp) ? 1 : bodyLootMult(body);
  if (exp.lootMult < 1) {
    exp.accumulatedLog.push(`Site déjà fouillé récemment : butin réduit (≈${Math.round(exp.lootMult * 100)} %), aucun gain de réputation.`);
  }
  // Active la première scène
  exp.sceneIdx = 0;
  exp.awaitingChoice = true;
}

// ---- Épuisement des sites pillés ----
// Un site fouillé ne rend que LOOT_DEPLETED_MULT de son butin, puis se
// reconstitue linéairement en PACING.LOOT_RECOVERY (3 jours réels).
const LOOT_DEPLETED_MULT = 0.25;
function bodyLootMult(body) {
  if (!body || typeof body.lootedAt !== 'number') return 1;
  const t = Math.max(0, S.meta.gameMin - body.lootedAt);
  if (t >= PACING.LOOT_RECOVERY) return 1;
  return LOOT_DEPLETED_MULT + (1 - LOOT_DEPLETED_MULT) * t / PACING.LOOT_RECOVERY;
}

// Départ après scènes : finit la mission et programme le retour
function startReturn(exp) {
  exp.phase = 'retour';
  exp.elapsedMin = 0;
  exp.awaitingChoice = false;
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  const body = sys?.bodies.find(b => b.id === exp.bodyId);
  if (body) {
    body.looted = true;
    // Le site est épuisé s'il a été fouillé (les épisodes de chronique ne comptent pas)
    const tookSomething = Object.values(exp.accumulatedLoot).some(v => v > 0) || exp.accumulatedItems.length > 0;
    if (!isChronicleExpedition(exp) && tookSomething) body.lootedAt = S.meta.gameMin;
  }
  // Calcul résumé pour le journal
  const lootSummary = Object.entries(exp.accumulatedLoot).map(([k,v]) => `${v} ${RES_LABELS[k]}`).join(', ') || 'rien';
  const itemsSummary = exp.accumulatedItems.length > 0
    ? ` + ${exp.accumulatedItems.map(i => itemDef(i)?.nom || i).join(', ')}`
    : '';
  log('neutral', `Départ de <em>${body?.name || 'mission'}</em>. Récupéré : ${lootSummary}${itemsSummary}.`);
}

function onReturn(exp) {
  // Vaisseau libéré
  const vessel = S.fleet.find(v => v.id === exp.vesselId);
  if (vessel) vessel.available = true;
  // Libère équipage survivant
  for (const id of exp.crewIds) {
    const m = S.crew.find(c => c.id === id);
    if (!m || m.statut === 'mort') continue;
    returnToBase(m);
  }
  // 0.28 : crédite ressources accumulées avec OVERFLOW
  // Le surplus au-delà du cap normal va dans S.overflow (limite : 2× cap).
  if (!S.overflow) S.overflow = { metal: 0, cristal: 0, energie: 0, biomasse: 0, datacubes: 0 };
  for (const k in exp.accumulatedLoot) {
    const amount = exp.accumulatedLoot[k];
    if (amount <= 0) continue;
    const cap = capOf(k) || Infinity;
    const overflowCap = cap * 2;  // limite overflow à 2× cap normal
    const totalAvailable = (S.res[k] || 0) + (S.overflow[k] || 0);
    const totalAfter = totalAvailable + amount;
    
    if (totalAfter <= cap) {
      // Tout rentre dans le stock normal
      S.res[k] = totalAfter;
    } else if (totalAfter <= overflowCap) {
      // Remplit le cap normal, le reste va en overflow
      S.res[k] = cap;
      S.overflow[k] = totalAfter - cap;
    } else {
      // Dépasse même l'overflow : on plafonne, le reste est perdu
      S.res[k] = cap;
      S.overflow[k] = cap;  // cap overflow = cap normal
      const lost = totalAfter - overflowCap;
      log('warn', `Surplus de ${RES_LABELS[k]} perdu : ${lost} (capacité dépassée).`);
    }
  }
  // Crédite datacubes alien (ressource virtuelle, pas cappée)
  if (exp.accumulatedAlienDatacubes) {
    S.alienDatacubes = (S.alienDatacubes || 0) + exp.accumulatedAlienDatacubes;
  }
  // Récupère les outils et armes encore embarqués (les consommables ont été utilisés ou perdus)
  if (exp.equipment) {
    for (const itemId in exp.equipment) {
      const itDef = ITEMS[itemId];
      if (!itDef) continue;
      // Seuls les tools et weapons reviennent. Les consumables non-utilisés sont perdus (logique : usage prévu, gaspillés).
      // En fait on peut être généreux : les consumables non-utilisés reviennent aussi.
      if (exp.equipment[itemId] > 0) {
        if (!S.inventory) S.inventory = {};
        S.inventory[itemId] = (S.inventory[itemId] || 0) + exp.equipment[itemId];
      }
    }
  }
  // Dépose les items dans l'inventaire de la colonie
  if (exp.accumulatedItems && exp.accumulatedItems.length > 0) {
    addToInventory(exp.accumulatedItems);
  }
  // Outcome global pour le log
  const body = S.galaxy.systems.find(s => s.id === exp.systemId)?.bodies.find(b => b.id === exp.bodyId);
  const survivors = exp.crewIds.filter(id => S.crew.find(c => c.id === id)?.statut !== 'mort').length;
  const lost = exp.crewIds.length - survivors;
  let outcomeKind = 'success';
  if (lost > 0) outcomeKind = 'warn';
  const lootStr = Object.entries(exp.accumulatedLoot).map(([k,v]) => `${v} ${RES_LABELS[k]}`).join(', ') || 'rien';
  // Affichage propre des items via leurs noms
  const itemsStr = exp.accumulatedItems.length > 0
    ? ` + items : ${exp.accumulatedItems.map(i => itemDef(i)?.nom || i).join(', ')}`
    : '';
  const summary = lost > 0
    ? `Pertes : ${lost}. Cargaison : ${lootStr}${itemsStr}.`
    : `Cargaison : ${lootStr}${itemsStr}.`;
  log(outcomeKind, `<em>${vesselNameOf(exp)}</em> rentre de <em>${body?.name || 'mission'}</em>. ${summary}`);
  // 0.26 : notification dédiée (sévérité selon pertes)
  const sysName = S.galaxy.systems.find(s => s.id === exp.systemId)?.name || '?';
  notif.expReturn(`${sysName} · ${body?.name || '?'}`, summary);
  // Historique
  S.expHistory.unshift({
    finishedAt: S.meta.gameMin,
    bodyName: body?.name || '?',
    body: body ? { biome: body.biome, ruines: body.ruines, vie: body.vie, type: body.type, atmosphere: body.atmosphere } : null,
    systemName: S.galaxy.systems.find(s => s.id === exp.systemId)?.name || '?',
    vesselName: vesselNameOf(exp),
    crewCount: exp.crewIds.length,
    scenesPlayed: exp.scenesPlayed || [],
    itemsConsumed: exp.itemsConsumed || [],
    result: {
      rewards: exp.accumulatedLoot,
      items: exp.accumulatedItems,
      casualties: lost > 0 ? Array(lost) : [],
      outcomeKind,
      summary
    }
  });
  if (S.expHistory.length > 20) S.expHistory = S.expHistory.slice(0, 20);
  
  // 0.24 — Recruter les PNJ ramenés des chroniques planétaires
  if (exp.pendingChronicleRecruits && exp.pendingChronicleRecruits.length > 0) {
    for (const recruit of exp.pendingChronicleRecruits) recruitChronicleCharacter(recruit);
  }
}

// ---- PNJ de chronique ramenés à l'avant-poste ----
// Le PNJ est construit comme un candidat ordinaire (genCandidate) dont on
// surcharge l'identité, puis accepté via acceptCandidate (même conversion
// candidat → membre que le recrutement normal). Habitat plein : il reste
// dans la liste des candidats jusqu'à ce qu'une place se libère.
function chronicleOriginOf(chronicleId, def) {
  return { id: 'chronique', label: CHRONICLES[chronicleId]?.nom || 'Chronique planétaire', notes: def?.role && def.role !== '?' ? def.role : 'Rencontré·e lors d\'une chronique' };
}

function recruitChronicleCharacter({ characterId, chronicleId, characterDef }) {
  const def = CHRONICLES[chronicleId]?.characters?.[characterId] || characterDef;
  if (!def) return;
  const already = [...S.crew, ...S.candidates].some(p => p.chronicleOrigin === chronicleId && p.chronicleCharacter === characterId);
  if (already) return;
  const c = genCandidate();
  c.name = def.name;
  if (typeof def.age === 'number' && def.age > 0) c.age = def.age;
  c.origin = chronicleOriginOf(chronicleId, def);
  if (def.stats) Object.assign(c.stats, def.stats);
  if (def.skills) Object.assign(c.skills, def.skills);
  if (Array.isArray(def.traits)) c.traits = def.traits.filter(t => TRAITS[t]);
  c.salary = Math.max(1, 1 + Math.max(...Object.values(c.skills)));
  c.chronicleOrigin = chronicleId;
  c.chronicleCharacter = characterId;
  S.candidates.push(c);
  const cap = crewUsage();
  if (cap.used < cap.total) {
    acceptCandidate(c.id);
  } else {
    log('warn', `<em>${c.name}</em> est arrivé·e à l'avant-poste, mais l'habitat est plein : sa candidature attend une place libre.`);
  }
}

// Sauvegardes ≤ 0.32 : les PNJ de chronique étaient créés sans `origin`
// (champ `origine: 'humaine'`), sans séquelles ni salaire, avec un faux trait
// « chronique_xxx ». On les remet au format d'un colon normal.
// state : l'état à réparer (S par défaut ; load() peut l'appeler sur la sauvegarde brute).
export function normalizeChronicleRecruits(state = S) {
  if (!state) return;
  const crew = state.crew || [];
  const people = [...crew, ...(state.candidates || [])];
  for (const p of people) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p.traits)) {
      const isFake = t => typeof t === 'string' && t.startsWith('chronique_') && !TRAITS[t];
      const fake = p.traits.find(isFake);
      if (fake) {
        if (!p.chronicleCharacter) p.chronicleCharacter = fake.slice('chronique_'.length);
        p.traits = p.traits.filter(t => !isFake(t));
      }
    } else {
      p.traits = [];
    }
    if (!p.origin || typeof p.origin !== 'object' || !p.origin.label) {
      const chronId = p.chronicleOrigin;
      const def = chronId ? CHRONICLES[chronId]?.characters?.[p.chronicleCharacter] : null;
      // Un faux trait « chronique_x » suffit à reconnaître un personnage de chronique,
      // même si sa chronique d'origine n'a pas été enregistrée.
      p.origin = (chronId || p.chronicleCharacter) ? chronicleOriginOf(chronId, def) : { id: 'inconnue', label: 'Origine inconnue', notes: '' };
      delete p.origine;
    }
    if (!p.stats) p.stats = { vigueur: 5, dexterite: 5, intellect: 5, sangfroid: 5, charisme: 5 };
    if (!p.skills) p.skills = {};
    if (typeof p.salary !== 'number') p.salary = Math.max(1, 1 + Math.max(0, ...Object.values(p.skills).filter(v => typeof v === 'number')));
    if (crew.includes(p)) {
      if (!Array.isArray(p.statuts)) p.statuts = [];
      if (!Array.isArray(p.sequels)) p.sequels = [];
      if (!Array.isArray(p.blessures)) p.blessures = [];
      if (typeof p.joinedAt !== 'number') p.joinedAt = state.meta?.gameMin || 0;
    }
  }
}

function vesselNameOf(exp) {
  const v = S.fleet.find(f => f.id === exp.vesselId);
  return v ? v.name : 'Vaisseau perdu';
}

// ============================================================
//   MOTEUR DE SCÈNES — résolution des choix
// ============================================================

// Récupère la scène active d'une expédition
export function currentScene(exp) {
  if (!exp) return null;
  // 0.24 — Support des scènes de chronique : exp.chronicleSceneId peut
  // pointer vers une scène spécifique (résolue dynamiquement par next)
  if (exp.chronicleSceneId) return findChronicleScene(exp.chronicleSceneId);
  if (!Array.isArray(exp.scenes) || exp.sceneIdx < 0 || exp.sceneIdx >= exp.scenes.length) return null;
  const sceneId = exp.scenes[exp.sceneIdx];
  // Scène-intro synthétique d'un épisode de chronique : reconstruite à partir du corps
  if (sceneId === CHRON_INTRO_ID) return chronicleIntroScene(bodyOfExpedition(exp));
  // Chercher d'abord dans CHRONICLE_SCENES (pour les ID qui y sont)
  const cs = CHRONICLE_SCENES.find(s => s.id === sceneId);
  if (cs) return cs;
  // Sinon dans le pool normal
  return SCENES.find(s => s.id === sceneId) || null;
}

// Indique si une scène est une scène de chronique (pour rendu spécifique UI)
export function isChronicleScene(scene) {
  if (!scene) return false;
  if (scene.chronicleEpisode) return true;
  if (scene.id === CHRON_INTRO_ID) return true;
  return false;
}

// Trouve le body lié à une expédition
export function bodyOfExpedition(exp) {
  if (!exp || !S.galaxy) return null;
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  return sys?.bodies?.find(b => b.id === exp.bodyId) || null;
}

// Vérifie si un choix est disponible pour l'équipage présent
export function evaluateChoice(exp, choice) {
  const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
  if (team.length === 0) return { available: false, reason: 'Équipage indisponible' };

  // Requirement de trait
  if (choice.req?.trait) {
    const found = team.find(m => m.traits.includes(choice.req.trait));
    if (!found) return { available: false, reason: `Requiert : ${TRAITS[choice.req.trait]?.nom || choice.req.trait}` };
  }
  // Requirement de skill
  if (choice.req?.skill) {
    const { key, min } = choice.req.skill;
    const found = team.find(m => (m.skills[key] || 0) >= min);
    if (!found) return { available: false, reason: `Requiert : ${SKILL_LABELS[key]} ≥ ${min}` };
  }
  // Requirement d'item embarqué (présence simple)
  if (choice.req?.item) {
    const itemId = choice.req.item;
    if (!exp.equipment || (exp.equipment[itemId] || 0) <= 0) {
      const itDef = ITEMS[itemId];
      return { available: false, reason: `Requiert : ${itDef?.nom || itemId}` };
    }
  }
  // 0.24 — Requirement de stat (au moins un membre avec cette stat ≥ min)
  if (choice.req?.stat) {
    const { key, min } = choice.req.stat;
    const found = team.find(m => (m.stats?.[key] || 0) >= min);
    if (!found) return { available: false, reason: `Requiert : ${STAT_LABELS?.[key] || key} ≥ ${min}` };
  }
  // 0.24 — Requirement de flag de chronique (vérifié si on est dans une chronique)
  if (choice.req?.flag) {
    const body = bodyOfExpedition(exp);
    if (!body || !body.chronicle) return { available: false, reason: 'Chronique non active' };
    const flags = body.chronicle.flags || {};
    const { key, equals, min, max } = choice.req.flag;
    const v = flags[key];
    if (equals !== undefined && v !== equals) return { available: false, reason: 'Conditions non remplies' };
    if (min !== undefined && (v == null || v < min)) return { available: false, reason: 'Conditions non remplies' };
    if (max !== undefined && (v == null || v > max)) return { available: false, reason: 'Conditions non remplies' };
  }
  // Coût ressources
  if (choice.consume) {
    for (const k in choice.consume) {
      // L'item est traité plus bas
      if (k === 'item') continue;
      if ((S.res[k] || 0) < choice.consume[k]) {
        return { available: false, reason: `Manque ${RES_LABELS[k] || k} (${choice.consume[k]})` };
      }
    }
  }
  // Coût item embarqué
  if (choice.consume?.item) {
    const itemId = choice.consume.item;
    if (!exp.equipment || (exp.equipment[itemId] || 0) <= 0) {
      const itDef = ITEMS[itemId];
      return { available: false, reason: `Consomme : ${itDef?.nom || itemId} (aucun en stock)` };
    }
  }
  return { available: true };
}

// Joue un choix : exécute l'outcome (avec jet de risque éventuel)
export function playChoice(expId, choiceIdx) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp || !exp.awaitingChoice) return;
  const scene = currentScene(exp);
  if (!scene) return;
  const choice = scene.choices[choiceIdx];
  if (!choice) return;
  const evalResult = evaluateChoice(exp, choice);
  if (!evalResult.available) {
    toast(evalResult.reason);
    return;
  }
  // Tracking pour les arcs narratifs (0.20)
  if (!exp.scenesPlayed) exp.scenesPlayed = [];
  if (!exp.scenesPlayed.includes(scene.id)) exp.scenesPlayed.push(scene.id);
  if (!exp.itemsConsumed) exp.itemsConsumed = [];

  // Débite consume (ressources et items)
  if (choice.consume) {
    for (const k in choice.consume) {
      if (k === 'item') {
        // Consomme un item embarqué
        const itemId = choice.consume.item;
        if (exp.equipment && exp.equipment[itemId] > 0) {
          exp.equipment[itemId]--;
          if (exp.equipment[itemId] <= 0) delete exp.equipment[itemId];
          const itDef = ITEMS[itemId];
          exp.accumulatedLog.push(`${itDef?.nom || itemId} consommé.`);
          if (!exp.itemsConsumed.includes(itemId)) exp.itemsConsumed.push(itemId);
        }
      } else {
        S.res[k] -= choice.consume[k];
      }
    }
  }

  // Détermine l'outcome final
  let outcome = choice.outcome;
  // Clé de scène pour les tirages (les scènes de chronique gardent toutes sceneIdx = 0)
  const sceneKey = exp.chronicleSceneId || `sc${exp.sceneIdx}`;
  if (choice.risky) {
    // Jet : 1d10 + bonus de la meilleure caractéristique de l'équipe ≥ dc
    const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
    const key = choice.risky.stat;
    let bonus, label;
    if (!STAT_LABELS[key] && SKILL_LABELS[key]) {
      // Donnée erronée (compétence à la place d'une caractéristique) : on utilise la compétence
      bonus = Math.floor(Math.max(0, ...team.map(m => m.skills?.[key] || 0)) / 2);
      label = SKILL_LABELS[key];
    } else {
      const bestStat = Math.max(...team.map(m => m.stats?.[key] || 5));
      bonus = Math.floor((bestStat - 5) / 2);
      label = STAT_LABELS[key] || key;
    }
    const rng = rngFor(`${exp.seed}|${sceneKey}|${choiceIdx}|${S.meta.gameMin}`);
    const roll = 1 + Math.floor(rng() * 10);
    const total = roll + bonus;
    const success = total >= choice.risky.dc;
    outcome = success ? choice.risky.success : choice.risky.fail;
    exp.accumulatedLog.push(`Jet ${label} : ${roll}${bonus >= 0 ? '+' : ''}${bonus} = ${total} vs ${choice.risky.dc} → ${success ? 'réussi' : 'échec'}`);
  }
  // Site déjà fouillé : butin réduit (jamais pour les scènes de chronique)
  const lootMult = isChronicleScene(scene) ? 1 : (typeof exp.lootMult === 'number' ? exp.lootMult : 1);
  const depletionRng = rngFor(`${exp.seed}|${sceneKey}|${choiceIdx}|epuise`);

  // Applique l'outcome
  if (outcome === 'next' || !outcome) {
    advanceScene(exp);
    return;
  }

  // Loot
  if (outcome.loot) {
    // Multiplicateur de loot alien si scène sur ruines alien (tech_principes_xeno)
    const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
    const body = sys?.bodies.find(b => b.id === exp.bodyId);
    const isAlienRuins = body && (body.ruines === 'alien_a' || body.ruines === 'alien_b' || body.ruines === 'fusion');
    const alienMult = isAlienRuins ? techEffectsAccumulated().expeditionAlienLootMult : 1;
    for (const k in outcome.loot) {
      // Les montants négatifs ne sont pas des gains (un coût s'exprime avec consume)
      if (!(outcome.loot[k] > 0)) continue;
      const amount = Math.floor(outcome.loot[k] * alienMult * lootMult);
      exp.accumulatedLoot[k] = (exp.accumulatedLoot[k] || 0) + amount;
    }
    // Sur ruines alien, une fraction des datacubes obtenus est aussi crédité en datacubes_alien
    if (isAlienRuins && outcome.loot.datacubes > 0) {
      const alienShare = Math.ceil(outcome.loot.datacubes * alienMult * lootMult * 0.4);
      exp.accumulatedAlienDatacubes = (exp.accumulatedAlienDatacubes || 0) + alienShare;
    }
    // Cap par cargo du vaisseau
    const vessel = S.fleet.find(v => v.id === exp.vesselId);
    const cargoCap = vessel ? VESSELS[vessel.type].cargo : 999;
    let total = Object.values(exp.accumulatedLoot).reduce((s,v) => s+v, 0);
    if (total > cargoCap) {
      const ratio = cargoCap / total;
      for (const k in exp.accumulatedLoot) exp.accumulatedLoot[k] = Math.floor(exp.accumulatedLoot[k] * ratio);
      exp.accumulatedLog.push("Cargaison à saturation : la suite ne pourra pas être emportée.");
    }
  }
  // Site déjà fouillé : les objets et schémas ne se retrouvent qu'avec une chance réduite
  const keepFinds = lootMult >= 1 || depletionRng() < lootMult;
  if (!keepFinds && (outcome.item || outcome.blueprint)) {
    exp.accumulatedLog.push("Quelqu'un est déjà passé par là : il ne reste rien de précieux.");
  }
  // Item
  if (outcome.item && keepFinds) {
    exp.accumulatedItems.push(outcome.item);
  }
  // Blueprint : tire un schéma de l'origine demandée et l'ajoute aux items + bibliothèque
  if (outcome.blueprint && keepFinds) {
    const rng = rngFor(`${exp.seed}|${sceneKey}|${choiceIdx}|bp`);
    let originPool;
    if (outcome.blueprint === 'auto') {
      // tire selon les ruines du corps
      const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
      const body = sys?.bodies.find(b => b.id === exp.bodyId);
      if (body?.ruines === 'humaines') originPool = ['humain'];
      else if (body?.ruines === 'alien_a') originPool = ['alien_a'];
      else if (body?.ruines === 'alien_b') originPool = ['alien_b'];
      else if (body?.ruines === 'fusion') originPool = ['fusion'];
      else originPool = ['humain'];
    } else if (Array.isArray(outcome.blueprint)) {
      originPool = outcome.blueprint;
    } else {
      originPool = [outcome.blueprint];
    }
    const bpId = rollBlueprint(originPool, rng);
    if (bpId) {
      exp.accumulatedItems.push(bpId);
      const isNew = !S.discoveries?.[bpId];
      exp.accumulatedLog.push(isNew
        ? `Schéma inédit récupéré : ${BLUEPRINTS[bpId].nom}`
        : `Schéma récupéré : ${BLUEPRINTS[bpId].nom}`);
    }
  }
  // Statut infligé
  if (outcome.status) {
    const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
    if (team.length > 0) {
      const target = team[Math.floor(Math.random() * team.length)];
      inflictStatus(target, outcome.status, "expédition");
    }
  }
  // Moral
  if (outcome.morale) {
    for (const id of exp.crewIds) {
      const m = S.crew.find(c => c.id === id);
      if (m) m.moral = Math.max(0, Math.min(100, m.moral + outcome.morale));
    }
  }
  // Threat
  if (outcome.threat) {
    exp.sceneThreatMod = (exp.sceneThreatMod || 0) + outcome.threat;
  }
  // Réputation faction (0.21)
  if (outcome.reputation) {
    const faction = factionForExpedition(exp);
    if (faction && outcome.reputation > 0 && lootMult < 1) {
      // Revisite d'un site récemment fouillé : pas de réputation à regagner
      exp.accumulatedLog.push(`${faction.name} : déjà rencontrés récemment, réputation inchangée.`);
    } else if (faction) {
      adjustReputation(faction.id, outcome.reputation);
      exp.accumulatedLog.push(`${faction.name} : réputation ${outcome.reputation > 0 ? '+' : ''}${outcome.reputation}.`);
    }
  }
  // Log
  if (outcome.log) {
    exp.accumulatedLog.push(outcome.log);
  }

  // Rencontre de combat (0.31)
  if (outcome.combat) {
    const { enemies, lootOnWin, onDefeat } = outcome.combat;
    initCombat(exp, enemies, lootOnWin || {}, onDefeat || 'retreat');
    exp.accumulatedLog.push("Contact ennemi !");
    render();
    return;
  }

  // Résolution finale
  if (outcome.retreat) {
    exp.accumulatedLog.push("Retraite anticipée.");
    startReturn(exp);
    render();
    return;
  }
  if (outcome.end) {
    startReturn(exp);
    render();
    return;
  }

  // 0.24 — Handling des chroniques planétaires
  // Si l'outcome contient setFlags / next / endChronicleEpisode / endChronicle, on les traite
  if (outcome.setFlags || outcome.next || outcome.endChronicleEpisode || outcome.endChronicle || outcome.addCandidate) {
    const body = bodyOfExpedition(exp);
    if (body) {
      // Appliquer les flags
      if (outcome.setFlags) {
        applyFlagChanges(body, outcome.setFlags);
      }
      // Ajouter un candidat (pour les chroniques qui ramènent un PNJ)
      if (outcome.addCandidate && body.chronicle) {
        const chron = CHRONICLES[body.chronicle.id];
        const characterDef = chron?.characters?.[outcome.addCandidate];
        if (characterDef) {
          // Marque qu'à la fin de l'expé, on doit ajouter ce personnage comme colon
          exp.pendingChronicleRecruits = exp.pendingChronicleRecruits || [];
          exp.pendingChronicleRecruits.push({
            characterId: outcome.addCandidate,
            chronicleId: body.chronicle.id,
            characterDef
          });
        }
      }
      // Naviguer vers une scène spécifique (chaînage par next)
      if (outcome.next) {
        exp.chronicleSceneId = outcome.next;
        exp.awaitingChoice = true;
        render();
        return;
      }
      // Terminer l'épisode (passer au suivant à la prochaine visite)
      if (outcome.endChronicleEpisode) {
        endChronicleEpisode(body, exp);
        // Fin de l'expé : on rentre
        startReturn(exp);
        render();
        return;
      }
      // Terminer la chronique avec une fin spécifique
      if (outcome.endChronicle) {
        endChronicleWith(body, outcome.endChronicle);
        startReturn(exp);
        render();
        return;
      }
    }
  }

  advanceScene(exp);
}

// Avance à la scène suivante (ou termine la mission si fin de séquence)
function advanceScene(exp) {
  // 0.24 — Si on était sur une scène de chronique (chronicleSceneId), on n'avance pas
  // l'index automatiquement : c'est le moteur de choix qui gère via "next".
  // Si on arrive ici sans next, c'est qu'on est sur une scène intro de chronique
  // ou qu'on doit terminer (cas géré ailleurs).
  if (exp.chronicleSceneId) {
    // L'outcome ne contenait pas de next : on considère que l'épisode est fini
    // (rejouer la même scène bloquerait l'équipe dans une boucle).
    const body = bodyOfExpedition(exp);
    if (body) endChronicleEpisode(body, exp);
    startReturn(exp);
    render();
    return;
  }
  
  exp.sceneIdx++;
  if (exp.sceneIdx >= exp.scenes.length) {
    // Plus de scènes → départ
    startReturn(exp);
  } else {
    exp.awaitingChoice = true;
    // 0.21 : si on entre dans une scène civ_*, on note la faction
    const sc = currentScene(exp);
    if (sc && (sc.tags?.includes('civ_active') || sc.tags?.includes('civ_dechue'))) {
      noteFactionForExpedition(exp);
    }
  }
  render();
}

// ============================================================
//   SYSTÈME DE COMBAT AU TOUR PAR TOUR (0.31)
// ============================================================

// Objets de combat « consommés par une action » (explosifs de zone, soins) : ils
// restent dans la réserve commune de l'expédition et ne sont jamais portés.
const isActionCombatItem = c => !!(c && (c.aoe || c.heal));
// Explosifs utilisables par l'action « grenade », par ordre de priorité.
const COMBAT_AOE_ITEMS = ['mine_eclats', 'grenade_concussion', 'grenade_iem'];
// Trousses utilisables par l'action « Soigner », par ordre de priorité.
const COMBAT_HEAL_KITS = ['nanobots_reparation', 'kit_medical'];
const COMBAT_KIT_HEAL_DEFAULT = 8;   // trousse sans champ combat.heal (Kit médical avancé)
// Ressources de butin héritées des anciennes données → ressource réelle.
const COMBAT_LOOT_ALIASES = { composants: 'metal' };

// Calcule les stats de combat d'un membre selon ses attributs + l'équipement qu'il PORTE.
// `gear` : { itemId: n } attribué à ce membre (cf. allocateCombatGear) — et non la
// soute entière de l'expédition. Les techs complétées s'appliquent à tout l'équipage.
export function memberCombatStats(member, gear) {
  const vigueur    = member.stats?.vigueur    || 5;
  const dexterite  = member.stats?.dexterite  || 5;
  const sangfroid  = member.stats?.sangfroid  || 5;
  const combatSk   = member.skills?.combat    || 0;
  const medecine   = member.skills?.medecine  || 0;
  // Trait combattant_aguerri : +2 combat effectif
  const traitBonus = (member.traits || []).includes('combattant_aguerri') ? 2 : 0;
  // Techs : Résonance armée (expeditionCombatBonus) = +N en compétence de combat ;
  // Blindage / Camouflage / Armure composite (expeditionThreatBonus < 0, menace
  // réduite) = protection : +4 % d'esquive par point, +1 armure tous les 2 points.
  const tech       = techEffectsAccumulated();
  const techCombat = Math.max(0, tech.expeditionCombatBonus || 0);
  const threatCut  = Math.max(0, -(tech.expeditionThreatBonus || 0));
  const effCombat  = combatSk + traitBonus + techCombat;

  // Base HP selon Vigueur + exo-armure (bonus de vigueur → PV supplémentaires)
  let maxHp  = Math.max(3, 8 + (vigueur - 5) * 3);
  const maxPa  = 2 + Math.floor(sangfroid / 4);

  // Scan de l'équipement porté : meilleure arme + meilleures défenses
  let bestWeapon = null;    // { combat def } de la meilleure arme
  let armorBonus = 0, dodgeBonus = 0, armorPen = 0, shieldHp = 0;

  for (const [itemId, count] of Object.entries(gear || {})) {
    if (count <= 0) continue;
    const c = ITEMS[itemId]?.combat;
    // Explosifs et soins ne sont pas des armes portées
    if (!c || isActionCombatItem(c)) continue;
    // Meilleure arme = plus gros dégâts de base
    if ((c.damage || 0) > (bestWeapon?.damage || 0)) bestWeapon = c;
    if (c.armor) armorBonus = Math.max(armorBonus, c.armor);
    if (c.dodge) dodgeBonus = Math.max(dodgeBonus, c.dodge);
    if (c.shieldHp) shieldHp = Math.max(shieldHp, c.shieldHp);
    // Exo-armure : +2 HP par point de Vigueur au-dessus de 5
    if (c.type === 'exo') maxHp += Math.max(0, (vigueur - 5)) * 2;
  }
  maxHp = Math.max(3, maxHp);
  armorBonus += Math.floor(threatCut / 2);
  dodgeBonus += threatCut * 4;

  // Dégâts de base : arme + skill combat
  const weaponDmg  = bestWeapon?.damage  || 0;
  const weaponAcc  = bestWeapon?.accuracy || 0;
  armorPen = Math.max(armorPen, bestWeapon?.armorPen || 0);

  // V1 : dégâts de base relevés (2-4 à mains nues au lieu de 1-3) — cf. armorReduce
  let dmgMin = Math.max(2, 2 + effCombat + weaponDmg);
  let dmgMax = Math.max(3, 4 + effCombat * 2 + weaponDmg);
  let accuracy = 55 + dexterite * 3 + effCombat * 4 + weaponAcc;

  // Bonus de stat selon type d'arme
  const wType = bestWeapon?.type;
  if (wType === 'melee' || !bestWeapon) {
    // Corps-à-corps (ou poings nus) : Vigueur → dégâts bonus
    const vigBonus = Math.floor((vigueur - 5) / 2);
    dmgMin += vigBonus;
    dmgMax += vigBonus * 2;
  }
  if (wType === 'precision') {
    // Fusil de précision : Sang-froid → précision bonus
    accuracy += (sangfroid - 5) * 3;
  }
  if (wType === 'ranged') {
    // Distance : Dextérité → précision bonus (en plus du bonus de base)
    accuracy += Math.floor((dexterite - 5) * 1.5);
  }

  accuracy = Math.min(95, Math.max(20, accuracy));
  dmgMin = Math.max(1, dmgMin);
  dmgMax = Math.max(dmgMin, dmgMax);

  return {
    maxHp, maxPa,
    damage: [dmgMin, dmgMax],
    accuracy,
    armor: armorBonus,
    dodge: Math.min(60, dodgeBonus),
    armorPen,
    shieldHp,
    medecine,
    weaponType: wType || 'melee'
  };
}

// Répartit l'équipement de combat embarqué entre les membres : chaque unité d'objet
// est portée par UN seul membre, qui garde au plus une arme et une protection.
// - Armes : la plus puissante d'abord, au meilleur porteur (compétence de combat
//   + caractéristique liée au type d'arme) ; à égalité, au premier de l'équipe.
// - Protections : l'exo-armure au plus vigoureux, les autres aux plus fragiles.
// Explosifs (aoe) et soins (heal) restent en réserve commune : ils sont consommés
// par les actions « grenade » et « Soigner ».
function allocateCombatGear(team, equipment) {
  const gear = Object.fromEntries(team.map(m => [m.id, {}]));
  const weapons = [], protections = [];
  for (const [itemId, count] of Object.entries(equipment || {})) {
    const c = ITEMS[itemId]?.combat;
    if (!c || isActionCombatItem(c) || !(count > 0)) continue;
    for (let i = 0; i < count; i++) {
      if ((c.damage || 0) > 0) weapons.push(itemId);
      else if (c.armor || c.shieldHp || c.dodge || c.type === 'exo') protections.push(itemId);
    }
  }
  const cdef = id => ITEMS[id].combat;
  const protScore = c => (c.armor || 0) * 3 + (c.shieldHp || 0) + (c.dodge || 0) / 4;
  weapons.sort((a, b) => (cdef(b).damage || 0) - (cdef(a).damage || 0) || (cdef(b).accuracy || 0) - (cdef(a).accuracy || 0));
  protections.sort((a, b) => protScore(cdef(b)) - protScore(cdef(a)));

  const statFor = { melee: 'vigueur', ranged: 'dexterite', precision: 'sangfroid' };
  const skill = m => (m.skills?.combat || 0) + ((m.traits || []).includes('combattant_aguerri') ? 2 : 0);
  const stat = (m, k) => m.stats?.[k] || 5;
  const pickBest = (cands, score) => cands.reduce((a, b) => (score(b) > score(a) ? b : a));
  const armed = new Set(), protectedIds = new Set();

  for (const id of weapons) {
    const cands = team.filter(m => !armed.has(m.id));
    if (!cands.length) break;
    const k = statFor[cdef(id).type] || 'dexterite';
    const best = pickBest(cands, m => skill(m) * 2 + stat(m, k));
    gear[best.id][id] = (gear[best.id][id] || 0) + 1;
    armed.add(best.id);
  }
  for (const id of protections) {
    const cands = team.filter(m => !protectedIds.has(m.id));
    if (!cands.length) break;
    const best = cdef(id).type === 'exo'
      ? pickBest(cands, m => stat(m, 'vigueur'))
      : pickBest(cands, m => -stat(m, 'vigueur'));
    gear[best.id][id] = (gear[best.id][id] || 0) + 1;
    protectedIds.add(best.id);
  }
  return gear;
}

// Initialise l'état de combat sur une expédition (exportée pour les outils de test)
export function initCombat(exp, enemyTypeIds, lootOnWin, onDefeat) {
  const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
  const gear = allocateCombatGear(team, exp.equipment);

  const allies = team.map(m => {
    const cs = memberCombatStats(m, gear[m.id]);
    return {
      id: m.id,
      name: m.name,
      hp: cs.maxHp, maxHp: cs.maxHp,
      shieldHp: cs.shieldHp, maxShieldHp: cs.shieldHp,
      pa: cs.maxPa, maxPa: cs.maxPa,
      armor: cs.armor, dodge: cs.dodge,
      armorPen: cs.armorPen,
      damage: cs.damage, accuracy: cs.accuracy,
      weaponType: cs.weaponType,
      medecine: cs.medecine,
      gear: Object.keys(gear[m.id]),
      effects: []
    };
  });

  const enemies = enemyTypeIds.map((typeId, idx) => {
    const def = ENEMY_TYPES[typeId];
    if (!def) return null;
    return {
      idx, type: typeId, nom: def.nom,
      category: def.category || null,
      hp: def.hp, maxHp: def.hp,
      armor: def.armor || 0,
      damage: def.damage || [1, 3],
      accuracy: def.accuracy || 65,
      loot: def.loot || {},
      effects: []
    };
  }).filter(Boolean);

  // Aucun ennemi valide (données corrompues) : pas de combat, on poursuit la mission
  if (enemies.length === 0 || allies.length === 0) {
    exp.combat = null;
    advanceScene(exp);
    return;
  }

  const gearLines = allies.filter(a => a.gear.length)
    .map(a => `${a.name} : ${a.gear.map(id => ITEMS[id]?.nom || id).join(', ')}`);
  exp.combat = {
    active: true,
    round: 1,
    phase: 'player',
    seq: 0,            // compteur d'actions : entre dans la graine de chaque jet
    allies,
    enemies,
    log: [`⚔ Contact ennemi — ${enemies.map(e => e.nom).join(', ')}`]
      .concat(gearLines.length ? [`Équipement — ${gearLines.join(' · ')}`] : []),
    lootOnWin: lootOnWin || {},
    onDefeat: onDefeat || 'retreat',
    outcome: null,
    selectedAllyId: allies[0]?.id || null
  };
}

// RNG d'un jet de combat. Le compteur cbt.seq (absent des sauvegardes antérieures,
// d'où le `|| 0`) rend chaque jet unique, même pour deux actions identiques
// effectuées dans la même minute de jeu.
function combatRng(exp, ...parts) {
  const cbt = exp.combat;
  cbt.seq = (cbt.seq || 0) + 1;
  return rngFor(`${exp.seed}|cbt${cbt.round}|${cbt.seq}|${parts.join('|')}|${S.meta.gameMin}`);
}

const isStunned = enemy => (enemy.effects || []).some(e => e.type === 'stunned' && e.turnsLeft > 0);

// V1 : l'armure absorbe au plus la moitié d'un coup (fini les combats à coups de 1)
const armorReduce = (raw, armor) => Math.max(1, Math.ceil(raw / 2), raw - Math.max(0, armor || 0));

// Action d'un allié (appelée par l'UI)
export function combatAllyAction(expId, allyId, action, targetIdx) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp?.combat?.active || exp.combat.phase !== 'player') return;

  const cbt = exp.combat;
  const ally = cbt.allies.find(a => a.id === allyId);
  if (!ally || ally.hp <= 0) return;

  const rng = combatRng(exp, allyId, action, targetIdx);

  if (action === 'attack' || action === 'precise') {
    const paCost = action === 'precise' ? 2 : 1;
    if (ally.pa < paCost) return;
    const target = cbt.enemies[targetIdx];
    if (!target || target.hp <= 0) return;

    ally.pa -= paCost;
    const accBonus = action === 'precise' ? 20 : 0;
    const dmgBonus = action === 'precise' ? 2 : 0;
    const roll = Math.floor(rng() * 100);
    const hit = roll < (ally.accuracy + accBonus);

    if (hit) {
      const [dmin, dmax] = ally.damage;
      const rawDmg = dmin + Math.floor(rng() * (dmax - dmin + 1)) + dmgBonus;
      // armorPen réduit l'armure effective
      const effectiveArmor = Math.max(0, target.armor - (ally.armorPen || 0));
      const effectiveDmg = armorReduce(rawDmg, effectiveArmor);
      target.hp = Math.max(0, target.hp - effectiveDmg);
      const penNote = (ally.armorPen || 0) > 0 ? ` (pénètre ${ally.armorPen})` : '';
      cbt.log.push(`${ally.name} → ${target.nom} : ${effectiveDmg} dégâts${penNote}${target.hp <= 0 ? ' — neutralisé !' : '.'}`);
    } else {
      cbt.log.push(`${ally.name} vise ${target.nom} : raté !`);
    }
  }
  else if (action === 'cover') {
    if (ally.pa < 1) return;
    ally.pa -= 1;
    ally.effects = ally.effects.filter(e => e.type !== 'cover');
    ally.effects.push({ type: 'cover', turnsLeft: 1, armor: 3 });
    cbt.log.push(`${ally.name} se met à couvert (+3 armure ce round).`);
  }
  else if (action === 'heal') {
    if (ally.pa < 2) return;
    // Il faut une compétence en médecine ou une trousse embarquée
    const kit = COMBAT_HEAL_KITS.find(id => (exp.equipment?.[id] || 0) > 0);
    if (!kit && !(ally.medecine > 0)) {
      toast('Soigner requiert la compétence Médecine ou une trousse de soins embarquée.');
      return;
    }
    const wounded = cbt.allies
      .filter(a => a.hp > 0 && (a.hp < a.maxHp || (a.shieldHp || 0) < (a.maxShieldHp || 0)))
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    const healTarget = wounded[0];
    if (!healTarget) { toast("Personne n'a besoin de soins."); return; }
    ally.pa -= 2;
    // Soin = savoir-faire du soigneur (3 + Médecine×2) + effet de la trousse utilisée
    const kitHeal = kit ? (ITEMS[kit]?.combat?.heal ?? COMBAT_KIT_HEAL_DEFAULT) : 0;
    if (kit) _consumeCombatItem(exp, kit);
    const healAmt = (ally.medecine > 0 ? 3 + ally.medecine * 2 : 0) + kitHeal;
    const hpBefore = healTarget.hp;
    healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmt);
    // Restaure aussi le bouclier si partiellement entamé
    let shieldNote = '';
    if (healTarget.maxShieldHp > 0 && healTarget.shieldHp < healTarget.maxShieldHp) {
      const sBefore = healTarget.shieldHp;
      healTarget.shieldHp = Math.min(healTarget.maxShieldHp, healTarget.shieldHp + Math.floor(healAmt / 2));
      if (healTarget.shieldHp > sBefore) shieldNote = `, bouclier +${healTarget.shieldHp - sBefore}`;
    }
    cbt.log.push(`${ally.name} soigne ${healTarget.name} : +${healTarget.hp - hpBefore} PV${shieldNote}${kit ? ` (${ITEMS[kit]?.nom || kit} utilisé)` : ''}.`);
  }
  else if (action === 'grenade') {
    if (ally.pa < 1) return;
    // Priorité : mine_eclats, sinon grenade_concussion, sinon grenade_iem
    const aoeItem = COMBAT_AOE_ITEMS.find(id => (exp.equipment?.[id] || 0) > 0);
    if (!aoeItem) { toast('Aucun explosif AoE disponible !'); return; }
    const grDef = ITEMS[aoeItem]?.combat || {};
    _consumeCombatItem(exp, aoeItem);
    ally.pa -= 1;
    const baseDmg = 4 + (grDef.damage || 0) + Math.floor(rng() * 4);
    const hits = [];
    for (const e of cbt.enemies.filter(e => e.hp > 0)) {
      let dmg = baseDmg;
      // Grenade IEM : bonus vs machines (category absente des combats sauvegardés en 0.31b)
      const category = e.category || ENEMY_TYPES[e.type]?.category;
      if (grDef.machineBonus && category === 'machine') dmg += grDef.machineBonus;
      const dealt = Math.max(1, dmg - (e.armor || 0));
      e.hp = Math.max(0, e.hp - dealt);
      // Grenade concussion : l'ennemi saute sa prochaine attaque (stun = nb d'attaques)
      let stunNote = '';
      if ((grDef.stun || 0) > 0 && e.hp > 0) {
        e.effects = (e.effects || []).filter(x => x.type !== 'stunned');
        e.effects.push({ type: 'stunned', turnsLeft: grDef.stun });
        stunNote = ', étourdi';
      }
      hits.push(`${e.nom} ${dealt}${e.hp <= 0 ? ' — neutralisé' : stunNote}`);
    }
    const itemNom = ITEMS[aoeItem]?.nom || aoeItem;
    cbt.log.push(`${ally.name} lance ${itemNom} : ${hits.join(' · ')} (dégâts après armure).`);
  }
  else if (action === 'end_turn') {
    ally.pa = 0;
    cbt.log.push(`${ally.name} passe son tour.`);
  }
  else if (action === 'retreat') {
    // F3 — Décrocher a un prix : chaque ennemi encore actif (non étourdi)
    // porte une attaque d'opportunité avant que l'équipe ne rompe le contact.
    const chasers = cbt.enemies.filter(e => e.hp > 0 && !isStunned(e));
    if (chasers.length > 0) {
      cbt.log.push(`Retraite sous le feu : ${chasers.length} attaque${chasers.length > 1 ? 's' : ''} d'opportunité !`);
      for (const enemy of chasers) _enemyAttack(cbt, enemy, rng);
    }
    cbt.phase = 'ended';
    if (cbt.allies.every(a => a.hp <= 0)) {
      cbt.outcome = 'defeat';
      cbt.log.push("💀 Défaite — l'équipe est fauchée pendant la retraite.");
    } else {
      cbt.outcome = 'retreat';
      cbt.log.push("Retraite ! L'équipe rompt le contact.");
    }
    resolveCombatEnd(exp);
    render();
    return;
  }

  // Victoire immédiate si tous les ennemis sont à 0
  if (cbt.enemies.every(e => e.hp <= 0)) {
    cbt.phase = 'ended';
    cbt.outcome = 'victory';
    cbt.log.push("🏆 Victoire ! Tous les ennemis neutralisés.");
    resolveCombatEnd(exp);
    render();
  }
}

// V1 — résolution automatique (contrat docs/V1.md) : joue le combat jusqu'au bout
// avec une IA simple — soin si un allié est sous 40 % de ses PV (compétence ou
// trousse), explosif s'il reste plusieurs ennemis, sinon attaque de l'ennemi le
// plus entamé. → { ok, why, outcome, rounds, resume: [lignes] }
export function combatAutoResolve(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp?.combat?.active) return { ok: false, why: 'Aucun combat en cours' };
  const cbt = exp.combat;
  const firstRound = cbt.round;
  const logStart = cbt.log.length;
  let guard = 0;
  while (cbt.active && cbt.phase === 'player' && guard++ < 60) {
    for (const ally of cbt.allies) {
      let g = 0;
      while (cbt.active && cbt.phase === 'player' && ally.hp > 0 && ally.pa > 0 && g++ < 8) {
        const live = cbt.enemies.map((e, i) => [e, i]).filter(([e]) => e.hp > 0);
        if (!live.length) break;
        const paBefore = ally.pa;
        const wounded = cbt.allies.some(a => a.hp > 0 && a.hp < a.maxHp * 0.4);
        const canHeal = ally.pa >= 2 && wounded && (ally.medecine > 0 || COMBAT_HEAL_KITS.some(id => (exp.equipment?.[id] || 0) > 0));
        const hasAoe = COMBAT_AOE_ITEMS.some(id => (exp.equipment?.[id] || 0) > 0);
        if (canHeal) combatAllyAction(exp.id, ally.id, 'heal');
        else if (live.length >= 2 && hasAoe) combatAllyAction(exp.id, ally.id, 'grenade');
        else {
          live.sort((a, b) => a[0].hp - b[0].hp);
          combatAllyAction(exp.id, ally.id, 'attack', live[0][1]);
        }
        if (ally.pa === paBefore) break;   // action refusée : on passe au suivant
      }
    }
    if (cbt.active && cbt.phase === 'player') combatEndTurn(exp.id);
  }
  // Combat interminable (garde-fou) : l'équipe rompt le contact
  if (cbt.active && cbt.phase === 'player') {
    const a = cbt.allies.find(x => x.hp > 0);
    if (a) combatAllyAction(exp.id, a.id, 'retreat');
  }
  render();
  return {
    ok: true, why: '',
    outcome: cbt.outcome,
    rounds: cbt.round - firstRound + 1,
    resume: cbt.log.slice(logStart).filter(l => /Victoire|Défaite|Retraite|neutralisé|à terre/.test(l)).slice(-8)
  };
}

// Fin de tour joueur → phase ennemie (appelée par l'UI)
export function combatEndTurn(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp?.combat?.active || exp.combat.phase !== 'player') return;
  const cbt = exp.combat;
  for (const a of cbt.allies) { if (a.hp > 0) a.pa = 0; }
  _processEnemyPhase(exp);
  render();
}

function _consumeCombatItem(exp, itemId) {
  if ((exp.equipment?.[itemId] || 0) <= 0) return false;
  exp.equipment[itemId]--;
  if (exp.equipment[itemId] <= 0) delete exp.equipment[itemId];
  return true;
}

// Une attaque d'un ennemi : cible l'allié vivant le plus entamé (ratio PV le plus bas).
function _enemyAttack(cbt, enemy, rng) {
  const aliveAllies = cbt.allies.filter(a => a.hp > 0);
  if (aliveAllies.length === 0) return;
  const target = aliveAllies.reduce((a, b) => (a.hp / a.maxHp) < (b.hp / b.maxHp) ? a : b);
  const coverArmor = (target.effects || []).find(e => e.type === 'cover')?.armor || 0;
  const effectiveArmor = (target.armor || 0) + coverArmor;
  const dodgeChance = target.dodge || 0;
  const roll = Math.floor(rng() * 100);
  const hit = roll >= dodgeChance && roll < enemy.accuracy;

  if (hit) {
    const [dmin, dmax] = enemy.damage;
    const rawDmg = dmin + Math.floor(rng() * (dmax - dmin + 1));
    const effectiveDmg = armorReduce(rawDmg, effectiveArmor);
    // Les dégâts frappent le bouclier d'abord, puis les PV
    if ((target.shieldHp || 0) > 0) {
      const shieldAbsorb = Math.min(target.shieldHp, effectiveDmg);
      target.shieldHp -= shieldAbsorb;
      const overflow = effectiveDmg - shieldAbsorb;
      if (overflow > 0) target.hp = Math.max(0, target.hp - overflow);
      cbt.log.push(`${enemy.nom} → ${target.name} : ${effectiveDmg} dégâts (bouclier ${shieldAbsorb > 0 ? `absorbe ${shieldAbsorb}` : 'brisé'})${target.hp <= 0 ? ' — à terre !' : '.'}`);
    } else {
      target.hp = Math.max(0, target.hp - effectiveDmg);
      cbt.log.push(`${enemy.nom} → ${target.name} : ${effectiveDmg} dégâts${target.hp <= 0 ? ' — à terre !' : '.'}`);
    }
  } else {
    cbt.log.push(`${enemy.nom} attaque ${target.name} : ${dodgeChance > 0 && roll < dodgeChance ? 'esquivé !' : 'raté !'}`);
  }
}

function _processEnemyPhase(exp) {
  const cbt = exp.combat;
  cbt.phase = 'enemy';
  cbt.log.push(`— Phase ennemie (Round ${cbt.round}) —`);

  const rng = combatRng(exp, 'enemy');

  for (const enemy of cbt.enemies.filter(e => e.hp > 0)) {
    // Ennemi étourdi → passe son attaque
    if (isStunned(enemy)) {
      cbt.log.push(`${enemy.nom} est étourdi — passe son attaque.`);
      continue;
    }
    if (!cbt.allies.some(a => a.hp > 0)) break;
    _enemyAttack(cbt, enemy, rng);
  }

  // Décompte des effets ennemis (étourdissement…) : un stun de N fait sauter
  // N phases ennemies, puis l'effet est purgé.
  for (const e of cbt.enemies) {
    if (!e.effects?.length) continue;
    e.effects = e.effects.map(x => ({ ...x, turnsLeft: (x.turnsLeft || 0) - 1 })).filter(x => x.turnsLeft > 0);
  }

  // Défaite ?
  if (cbt.allies.every(a => a.hp <= 0)) {
    cbt.phase = 'ended';
    cbt.outcome = 'defeat';
    cbt.log.push("💀 Défaite — toute l'équipe est à terre.");
    resolveCombatEnd(exp);
    return;
  }

  // Nouveau round
  cbt.round++;
  cbt.phase = 'player';
  for (const a of cbt.allies) {
    if (a.hp <= 0) continue;
    a.pa = a.maxPa;
    a.effects = a.effects.map(e => ({ ...e, turnsLeft: e.turnsLeft - 1 })).filter(e => e.turnsLeft > 0);
  }
  cbt.log.push(`— Round ${cbt.round} · Tour des alliés —`);
}

// Ajoute un butin de combat { ressource: n } à `into`, en ignorant les ressources
// inconnues (les alias hérités, ex. « composants », sont convertis).
function _addCombatLoot(into, loot) {
  for (const [k, v] of Object.entries(loot || {})) {
    const res = COMBAT_LOOT_ALIASES[k] || k;
    if (!RESOURCES.includes(res) || !(v > 0)) continue;
    into[res] = (into[res] || 0) + v;
  }
}

function resolveCombatEnd(exp) {
  const cbt = exp.combat;
  cbt.active = false;

  if (cbt.outcome === 'victory') {
    // Butin : récompense de la scène + dépouilles des ennemis vaincus
    const gained = {};
    _addCombatLoot(gained, cbt.lootOnWin);
    for (const enemy of cbt.enemies) _addCombatLoot(gained, enemy.loot);
    // Site déjà fouillé : butin réduit (exp.lootMult, posé au lancement de l'expédition)
    const lootMult = exp.lootMult ?? 1;
    if (lootMult !== 1) for (const k in gained) gained[k] = Math.floor(gained[k] * lootMult);
    // Plafonné par la place restante dans la soute (même règle que le butin des scènes)
    const vessel = S.fleet.find(v => v.id === exp.vesselId);
    const cargoCap = vessel ? (VESSELS[vessel.type]?.cargo ?? 999) : 999;
    const carried = Object.values(exp.accumulatedLoot).reduce((s, v) => s + v, 0);
    const room = Math.max(0, cargoCap - carried);
    const gainedTotal = Object.values(gained).reduce((s, v) => s + v, 0);
    const ratio = gainedTotal > room ? room / gainedTotal : 1;
    const taken = {};
    for (const [k, v] of Object.entries(gained)) {
      const n = Math.floor(v * ratio);
      if (n <= 0) continue;
      taken[k] = n;
      exp.accumulatedLoot[k] = (exp.accumulatedLoot[k] || 0) + n;
    }
    const left = gainedTotal - Object.values(taken).reduce((s, v) => s + v, 0);
    if (left > 0) exp.accumulatedLog.push(`Soute pleine : ${left} unité(s) de butin abandonnée(s) sur place.`);
    // Loot d'items (chance-based)
    const rng = combatRng(exp, 'loot');
    for (const enemy of cbt.enemies) {
      const def = ENEMY_TYPES[enemy.type];
      for (const drop of (def?.itemLoot || [])) {
        if (rng() < drop.chance) {
          exp.accumulatedItems.push(drop.item);
          exp.accumulatedLog.push(`Loot : ${ITEMS[drop.item]?.nom || drop.item} récupéré sur ${enemy.nom}.`);
        }
      }
    }
    for (const id of exp.crewIds) {
      const m = S.crew.find(c => c.id === id);
      if (m) m.moral = Math.min(100, m.moral + 5);
    }
    const lootDesc = Object.entries(taken).map(([k, v]) => `+${v} ${RES_LABELS[k]}`).join(', ');
    exp.accumulatedLog.push(`Combat gagné${lootDesc ? ' : ' + lootDesc : ' — zone sécurisée'}.`);
    advanceScene(exp);
  } else {
    // Blessures selon état des alliés
    for (const allyState of cbt.allies) {
      const m = S.crew.find(c => c.id === allyState.id);
      if (!m) continue;
      if (allyState.hp <= 0) {
        inflictStatus(m, 'blessure_grave', 'combat');
        m.sante = Math.max(5, m.sante - 30);
      } else if (allyState.hp < allyState.maxHp * 0.4) {
        inflictStatus(m, 'blessure_legere', 'combat');
        m.sante = Math.max(20, m.sante - 15);
      }
    }
    exp.accumulatedLog.push(cbt.outcome === 'defeat'
      ? "Combat perdu — retraite forcée avec blessés."
      : "Retraite tactique.");
    startReturn(exp);
  }
}

// Abandon manuel : le joueur peut décider de retraiter à tout moment
export function abandonExpedition(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp) return;
  if (exp.phase !== 'sur_place') {
    toast("Possible uniquement sur place.");
    return;
  }
  exp.accumulatedLog.push("Retraite décidée par le commandement.");
  if (isChronicleExpedition(exp) && currentChronicleEpisode(bodyOfExpedition(exp))) {
    log('neutral', `Chronique interrompue : l'épisode reprendra à la prochaine expédition sur <em>${bodyOfExpedition(exp).name}</em>.`);
  }
  startReturn(exp);
  render();
}


// ============================================================
//   V1 — ÉCONOMIE : salaires, pénuries
// ============================================================

// Salaire d'un colon (ou d'un candidat) : biomasse prélevée par jour réel.
// `salary` garde sa valeur historique (points de prétention, 1 à 8).
export function salaryPerDay(p) {
  const pts = Number(p?.salary);
  return (Number.isFinite(pts) && pts > 0 ? pts : 0) * PACING.SALARY_PER_POINT;
}

// Pénuries en cours, pour l'alerte de l'interface : [{ res, effet }]
//  - énergie : la demande n'est plus couverte → modules consommateurs ralentis ;
//  - biomasse : stock vide → vivres rationnés, salaires impayés, moral en baisse ;
//  - autre ressource à zéro alors qu'elle baisse.
export function shortages() {
  if (!S?.res) return [];
  const out = [];
  const rate = computeRates();   // met aussi à jour energyRatio()
  const ratio = energyRatio();
  if (ratio < 0.999) {
    out.push({ res: 'energie', effet: `Pénurie d'énergie : les modules consommateurs (mine, hydroponie, laboratoire, atelier…) tournent à ${Math.round(ratio * 100)} %.` });
  }
  if ((S.res.biomasse || 0) <= 0.5 && rate.biomasse < 0) {
    out.push({ res: 'biomasse', effet: "Plus de biomasse : vivres rationnés et salaires impayés, le moral de l'équipage baisse." });
  }
  for (const k of ['metal', 'cristal', 'datacubes']) {
    if ((S.res[k] || 0) <= 0.5 && rate[k] < 0) out.push({ res: k, effet: `${RES_LABELS[k]} épuisé : la consommation n'est plus couverte.` });
  }
  return out;
}

// Production nette par heure réelle (pour l'affichage : computeRates() est par tick)
export function ratesPerHour() {
  const r = computeRates();
  const out = {};
  for (const k of RESOURCES) out[k] = r[k] * PACING.HEURE;
  return out;
}


// ============================================================
// 8. UI — rendu DOM
// ============================================================


function setupHandlers() {
  // 0.26 : installer les handlers du panneau de notifications
  try { setupNotifHandlers(); } catch (e) { console.warn('[BOOT] setupNotifHandlers:', e); }

  $('#btnRename').addEventListener('click', () => {
    if (!S?.meta) return;
    showModal({
      title: 'Renommer la colonie',
      body: "Comment cet avant-poste sera-t-il connu ?",
      withInput: true,
      inputValue: S.meta.colonyName,
      inputPlaceholder: 'Avant-poste...',
      primaryLabel: 'Valider',
      onPrimary: v => {
        if (v && v.trim()) {
          S.meta.colonyName = v.trim().slice(0, 40);
          render();
          save();
        }
      }
    });
  });

  $('#btnExport').addEventListener('click', exportSave);
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importSave(f);
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', () => { if (S?.meta) resetGame(); });

  // Bouton "Lancer une formation" (onglet Équipage > Formation)
  $('#btnNewTraining').addEventListener('click', () => { if (S?.meta) showTrainingModal(); });
}

// Instantané de l'état avant un rattrapage hors ligne, pour raconter au retour
// ce qui s'est passé (noms, décès et leur cause, faits marquants).
function snapshotForCatchup() {
  return {
    res: { ...S.res },
    crew: new Map(S.crew.map(m => [m.id, {
      statut: m.statut,
      statuts: (m.statuts || []).map(s => s.key),
      skills: { ...(m.skills || {}) }
    }])),
    candidates: new Set(S.candidates.map(c => c.id)),
    modules: Object.fromEntries(Object.entries(S.modules).map(([k, v]) => [k, v?.level || 0])),
    techs: new Set(Object.keys(S.techCompleted || {})),
    discoveries: new Set(Object.keys(S.discoveries || {})),
    expHistoryTop: S.expHistory[0] || null,
    fleet: new Set(S.fleet.map(v => v.id)),
    journalLen: S.journal.length,
    pending: (S.pendingDecisions || []).length,
    // compatibilité (anciens compteurs)
    buildDone: S.build ? S.build.doneMin : null,
    vesselBuildDone: S.vesselBuild ? S.vesselBuild.doneMin : null
  };
}

const statutNom = key => STATUTS[key]?.nom || key;

// Compare l'état à un instantané : données du rapport de retour.
// → { deces, arrivees, candidats, chantiers, recherches, expeditions, vaisseaux,
//     soins, blessures, formations, decouvertes, ressources, enAttente }
function diffSnapshot(before) {
  const r = {
    deces: [], arrivees: [], candidats: [], chantiers: [], recherches: [], expeditions: [],
    vaisseaux: [], soins: [], blessures: [], formations: [], decouvertes: [], ressources: {},
    enAttente: (S.pendingDecisions || []).length
  };
  for (const k of RESOURCES) {
    const d = Math.round((S.res[k] || 0) - (before.res[k] || 0));
    if (Math.abs(d) >= 5) r.ressources[k] = d;
  }
  for (const m of S.crew) {
    const b = before.crew.get(m.id);
    if (!b) { if (m.statut !== 'mort') r.arrivees.push({ nom: m.name }); continue; }
    if (m.statut === 'mort') {
      if (b.statut !== 'mort') r.deces.push({ nom: m.name, cause: (m.deathCause || 'cause inconnue').replace(/\.$/, '') });
      continue;
    }
    const now = (m.statuts || []).map(s => s.key);
    for (const k of b.statuts) if (!now.includes(k)) r.soins.push({ nom: m.name, statut: statutNom(k) });
    for (const k of now) if (!b.statuts.includes(k)) {
      const st = m.statuts.find(s => s.key === k);
      r.blessures.push({ nom: m.name, statut: st?.revealed === false ? 'un état suspect' : statutNom(k) });
    }
    for (const sk of SKILL_LIST) {
      if ((m.skills?.[sk] || 0) > (b.skills[sk] || 0)) r.formations.push({ nom: m.name, competence: SKILL_LABELS[sk], niveau: m.skills[sk] });
    }
  }
  for (const c of S.candidates) if (!before.candidates.has(c.id)) r.candidats.push({ nom: c.name, origine: c.origin?.label || '' });
  for (const [id, m] of Object.entries(S.modules)) {
    const lvl = m?.level || 0;
    if (lvl > (before.modules[id] || 0)) r.chantiers.push({ module: MODULES[id]?.nom || id, niveau: lvl });
  }
  for (const id of Object.keys(S.techCompleted || {})) if (!before.techs.has(id)) r.recherches.push(TECH_TREE[id]?.nom || id);
  for (const id of Object.keys(S.discoveries || {})) if (!before.discoveries.has(id)) r.decouvertes.push(BLUEPRINTS[id]?.nom || id);
  for (const h of S.expHistory) {
    if (h === before.expHistoryTop) break;
    r.expeditions.push({ vaisseau: h.vesselName, lieu: h.bodyName, resume: h.result?.summary || '' });
  }
  r.expeditions.reverse();
  for (const v of S.fleet) if (!before.fleet.has(v.id)) r.vaisseaux.push(`${VESSELS[v.type]?.nom || v.type} ${v.name}`);
  return r;
}

const listeFr = arr => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} et ${arr[arr.length - 1]}`;

// Récit du rapport : phrases courtes, au présent, avec les noms (texte brut)
function narrateReport(r) {
  const faits = [];
  for (const d of r.deces) faits.push(`${d.nom} nous a quittés — ${d.cause.charAt(0).toLowerCase() + d.cause.slice(1)}.`);
  if (r.chantiers.length) faits.push(`Le chantier a livré ${listeFr(r.chantiers.map(c => `${c.module} (niv ${c.niveau})`))}.`);
  if (r.recherches.length) faits.push(`Le laboratoire a achevé ${listeFr(r.recherches)}.`);
  for (const e of r.expeditions) faits.push(`${e.vaisseau} est rentré de ${e.lieu}. ${e.resume}`.trim());
  if (r.vaisseaux.length) faits.push(`Sortie d'usine : ${listeFr(r.vaisseaux)}.`);
  if (r.decouvertes.length) faits.push(`Schémas découverts : ${listeFr(r.decouvertes)}.`);
  for (const f of r.formations) faits.push(`${f.nom} progresse en ${f.competence} (niv ${f.niveau}).`);
  if (r.soins.length) faits.push(`Rétablis : ${listeFr(r.soins.map(s => `${s.nom} (${s.statut.toLowerCase()})`))}.`);
  if (r.blessures.length) faits.push(`À surveiller : ${listeFr(r.blessures.map(s => `${s.nom} (${s.statut.toLowerCase()})`))}.`);
  if (r.arrivees.length) faits.push(`${listeFr(r.arrivees.map(a => a.nom))} ${r.arrivees.length > 1 ? 'ont rejoint' : 'a rejoint'} l'avant-poste.`);
  if (r.candidats.length) faits.push(`${r.candidats.length > 1 ? 'Candidatures reçues' : 'Candidature reçue'} : ${listeFr(r.candidats.map(c => c.nom))}.`);
  return faits;
}

// Lignes de synthèse (journal) : ressources, décisions automatiques, décisions en attente
function summaryLines(r, autoEntries) {
  const lines = [];
  const res = Object.entries(r.ressources).map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${RES_LABELS[k]}`);
  if (res.length) lines.push(`Ressources : ${res.join(' · ')}`);
  lines.push(...autoResolvedLines(autoEntries));
  if (r.enAttente) lines.push(`${r.enAttente} décision${r.enAttente > 1 ? 's' : ''} t'attend${r.enAttente > 1 ? 'ent' : ''}`);
  return lines;
}

// Résumé des décisions prises automatiquement pendant le rattrapage
function autoResolvedLines(entries) {
  const lines = [];
  for (const kind of ['incident', 'event']) {
    const list = entries.filter(e => e.kind === kind);
    if (!list.length) continue;
    const counts = {};
    for (const e of list) counts[e.titre] = (counts[e.titre] || 0) + 1;
    const detail = Object.entries(counts).slice(0, 4).map(([t, n]) => n > 1 ? `${t} ×${n}` : t).join(', ');
    const more = Object.keys(counts).length > 4 ? '…' : '';
    lines.push(`${kind === 'incident' ? 'Incidents gérés automatiquement' : 'Événements gérés automatiquement'} : ${list.length} (${detail}${more})`);
  }
  return lines;
}

// Libellé d'une durée réelle (heures → « 45 min », « 9 h 20 », « 1 j 3 h »)
function realDurationLabel(hours) {
  return fmtDuree(hours * 3600);
}

// ---- Rattrapage du temps écoulé (hors ligne, page gelée, retour d'onglet) ----
// Appelée par tick() quand l'écart avec l'horloge réelle est grand. Simule
// par morceaux (page réactive, barre de progression si c'est long), incidents
// et événements résolus automatiquement, puis affiche « Reprise du contact ».
const CATCHUP_PROGRESS_MIN_TICKS = 900;   // ~15 min d'absence et plus : barre de progression
const CATCHUP_REPORT_MIN_HOURS = 5 / 60;  // en dessous de 5 min réelles : ni modale ni journal

export function catchUpOffline() {
  if (!S?.meta || isCatchingUp()) return false;
  const now = Date.now();
  const elapsedMs = Math.max(0, now - S.meta.lastTickRealMs);
  const elapsedHours = elapsedMs / 3600000;
  const due = Math.floor(elapsedMs / TICK_MS);
  const maxTicks = Math.floor(OFFLINE_MAX_HOURS * 3600);
  const ticks = Math.min(due, maxTicks);
  const capped = due > maxTicks;
  const before = snapshotForCatchup();
  const seqStart = _autoSeq;
  const progress = ticks >= CATCHUP_PROGRESS_MIN_TICKS && !decisionUiBusy() ? openCatchupProgress() : null;
  const started = runCatchUp(ticks, {
    onProgress: (done, total) => progress?.update(done, total),
    onDone: done => {
      progress?.close();
      finishCatchUp({ before, seqStart, elapsedHours, simulatedHours: done * MIN_PER_TICK / 3600, capped });
    }
  });
  if (!started) progress?.close();
  return started;
}

// Dernier rapport de retour (pour l'interface : getLastReturnReport)
let _lastReturnReport = null;
export function getLastReturnReport() { return _lastReturnReport; }

function finishCatchUp({ before, seqStart, elapsedHours, simulatedHours, capped }) {
  // V1 : un événement garanti au retour d'une longue absence (s'il y en a un d'éligible)
  let retourEvent = null;
  if (elapsedHours * 3600 >= PACING.EVENT_ON_RETURN_AFTER) {
    try { retourEvent = guaranteeReturnEvent(); } catch (e) { reportTickError('événement de retour', e); }
  }
  const data = diffSnapshot(before);
  const autoEntries = autoResolvedSince(seqStart);
  const faits = narrateReport(data);
  const summary = summaryLines(data, autoEntries);
  syncPendingFlags();
  if (elapsedHours >= CATCHUP_REPORT_MIN_HOURS) {
    // Une seule entrée de journal pour résumer la période
    const cappedNote = capped ? ` (simulation plafonnée à ${OFFLINE_MAX_HOURS} h)` : '';
    const all = faits.concat(summary);
    log('neutral', esc(`Reprise du contact après ${realDurationLabel(elapsedHours)}${cappedNote}.${all.length ? ' ' + all.join(' · ') : ''}`));
  }
  save();
  try { render(); } catch (e) { reportTickError('render', e); }
  if (elapsedHours >= CATCHUP_REPORT_MIN_HOURS) {
    // Rapport de retour : données structurées (pour l'interface) + récit
    const report = {
      realElapsedHours: elapsedHours, simulatedHours, capped,
      ...data,
      incidentsAuto: autoEntries.map(e => ({ type: e.kind, titre: e.titre, choix: e.choiceLabel })),
      evenementRetour: retourEvent ? colonyEventTitle(retourEvent) : null,
      faits, summary
    };
    _lastReturnReport = report;
    if (!decisionUiBusy()) showCatchupModal(report);
    else toast('Reprise du contact : le résumé est dans le journal.');
  }
}

// Barre de progression du rattrapage (dans #modal, sans bouton : elle se
// ferme d'elle-même). Renvoie { update, close } ou null.
function openCatchupProgress() {
  const m = $('#modal');
  const bg = $('#modalBg');
  if (!m || !bg) return null;
  m.className = 'modal incident-modal';
  m.innerHTML = `
    <div class="incident-eyebrow">Reprise du contact</div>
    <h3 class="incident-title">Synchronisation de l'avant-poste…</h3>
    <p class="incident-body">L'avant-poste a continué de tourner pendant ton absence. Simulation en cours : <span id="catchupPct">0</span> %</p>
    <div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin-top:12px">
      <div id="catchupBar" style="height:100%;width:0%;background:var(--amber);transition:width .15s linear"></div>
    </div>
  `;
  bg.classList.add('show');
  let lastPaint = 0;
  return {
    update(done, total) {
      const t = performance.now();
      if (t - lastPaint < 100 && done < total) return;
      lastPaint = t;
      const pct = total ? Math.floor(done * 100 / total) : 100;
      const p = $('#catchupPct');
      const b = $('#catchupBar');
      if (p) p.textContent = String(pct);
      if (b) b.style.width = pct + '%';
    },
    close() {
      if (!$('#catchupBar')) return;   // remplacée entre-temps par une autre fenêtre
      bg.classList.remove('show');
      m.className = 'modal';
    }
  };
}

// Modale « Reprise du contact » : récit de l'absence (noms, décès racontés,
// faits marquants), puis la synthèse (ressources, décisions).
function showCatchupModal(report) {
  // En dessous de 5 minutes réelles, on ne montre rien (zéro friction)
  if (report.realElapsedHours < CATCHUP_REPORT_MIN_HOURS) return;
  const faits = report.faits || [];
  const lignes = report.summary || [];
  const deathCount = (report.deces || []).length;
  const recitHTML = faits.length
    ? faits.map((f, i) => `<p style="margin:8px 0;${i < deathCount ? 'color:var(--rust)' : ''}">${esc(f)}</p>`).join('')
    : '<p style="font-style:italic;color:var(--text-mute);margin-top:10px">L\'avant-poste a tenu sans encombre.</p>';
  const summaryHTML = lignes.length > 0
    ? `<ul style="list-style:none;padding:0;margin:14px 0 0;">${
        lignes.map(line =>
          `<li style="font-family:var(--mono);font-size:12px;color:var(--text-dim);padding:5px 0;border-bottom:1px dashed var(--border);">${esc(line)}</li>`
        ).join('')
      }</ul>`
    : '';
  const cappedHTML = report.capped
    ? `<p style="font-family:var(--mono);font-size:11px;color:var(--amber);margin-top:14px;letter-spacing:0.04em;">
         Note : simulation plafonnée à ${OFFLINE_MAX_HOURS} h.
       </p>`
    : '';

  $('#modal').className = 'modal';   // pas de classe héritée d'une autre fenêtre (incident-modal…)
  showModal({
    title: 'Reprise du contact',
    body: `
      <span style="display:block;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;margin-bottom:4px;">
        Absence : ${realDurationLabel(report.realElapsedHours, true)}
      </span>
      <span style="display:block;color:var(--text-dim);margin-bottom:4px;">
        L'avant-poste a continué de tourner pendant ton absence.
      </span>
      ${recitHTML}
      ${summaryHTML}
      ${cappedHTML}
    `,
    bodyIsHTML: true,
    hideCancel: true,
    primaryLabel: "Reprendre",
    onPrimary: () => {}
  });
}

// ============================================================
// 10. DÉMARRAGE — verrou d'onglet, chargement, boucle de jeu
// ============================================================

const TICK_POLL_MS = 250;   // tick() est appelé 4×/s ; il ne simule que les secondes écoulées
let _loopStarted = false;

// Un tick protégé : une erreur ne tue jamais la boucle. tick() gère lui-même
// l'avance du temps, la sauvegarde automatique et le rendu (isolés).
function safeTick() {
  try { tick(); } catch (err) { reportTickError('tick', err); }
  try { pumpDecisions(); } catch (err) { reportTickError('décisions', err); }
}

// ---- Verrou d'onglet : une seule partie active par navigateur ----
// Deux onglets ouverts s'écraseraient mutuellement la sauvegarde. Le premier
// prend un verrou (Web Locks) ; les suivants affichent une modale et ne
// simulent ni ne sauvegardent, jusqu'à « Utiliser cet onglet » : l'onglet actif
// sauvegarde, se met en pause et rend le verrou. Repli sans Web Locks :
// BroadcastChannel (ping/pong). Filet de sécurité : l'événement « storage ».
const TAB_LOCK_NAME = 'drift_tab_lock';
let _tabRole = 'unknown';      // 'primary' | 'yielded' | 'secondary'
let _tabChannel = null;
let _releaseTabLock = null;

function tabChannel() {
  if (_tabChannel || typeof BroadcastChannel === 'undefined') return _tabChannel;
  try {
    _tabChannel = new BroadcastChannel('drift_tabs');
    _tabChannel.addEventListener('message', e => {
      if (_tabRole !== 'primary') return;
      const type = e.data?.type;
      if (type === 'ping') _tabChannel.postMessage({ type: 'pong' });
      else if (type === 'takeover') yieldToOtherTab(true);
    });
  } catch (e) {
    _tabChannel = null;
  }
  return _tabChannel;
}

// Résout true si cet onglet obtient la main (attente max waitMs ; steal :
// reprend de force un verrou tenu par un onglet qui ne répond plus).
function acquireTabLock(waitMs = 1500, steal = false) {
  tabChannel();
  if (navigator.locks?.request) {
    return new Promise(resolve => {
      const ctrl = new AbortController();
      const timer = steal ? null : setTimeout(() => ctrl.abort(), waitMs);
      let granted = false;
      navigator.locks.request(TAB_LOCK_NAME, steal ? { steal: true } : { signal: ctrl.signal }, () => {
        granted = true;
        clearTimeout(timer);
        _tabRole = 'primary';
        resolve(true);
        return new Promise(release => { _releaseTabLock = release; });   // verrou gardé jusqu'à release
      }).catch(() => {
        clearTimeout(timer);
        if (!granted) resolve(false);                          // délai dépassé : un autre onglet a la main
        else if (_tabRole === 'primary') yieldToOtherTab(false);  // verrou repris de force ailleurs
      });
    });
  }
  const ch = _tabChannel;
  if (!ch) { _tabRole = 'primary'; return Promise.resolve(true); }
  return new Promise(resolve => {
    let answered = false;
    const onMsg = e => { if (e.data?.type === 'pong') answered = true; };
    ch.addEventListener('message', onMsg);
    ch.postMessage({ type: 'ping' });
    setTimeout(() => {
      ch.removeEventListener('message', onMsg);
      if (!answered) _tabRole = 'primary';
      resolve(!answered);
    }, 400);
  });
}

// Un autre onglet prend la main : on sauvegarde (si on nous l'a demandé
// poliment), on se met en pause et on rend le verrou.
function yieldToOtherTab(saveFirst) {
  if (_tabRole !== 'primary') return;
  _tabRole = 'yielded';
  if (saveFirst) { try { save(); } catch (e) { /* stockage inaccessible */ } }
  lockSaves('autre-onglet');
  setSimPaused(true);
  if (_releaseTabLock) { _releaseTabLock(); _releaseTabLock = null; }
  showOtherTabModal(true);
}

function showOtherTabModal(yielded) {
  $('#modal').className = 'modal';
  showModal({
    title: 'DRIFT est déjà ouvert dans un autre onglet',
    body: (yielded
      ? "La partie a été reprise dans un autre onglet. "
      : "La partie tourne déjà dans un autre onglet. ")
      + "Pour éviter que les deux onglets ne s'écrasent mutuellement la sauvegarde, celui-ci reste en pause.",
    hideCancel: true,
    primaryLabel: 'Utiliser cet onglet',
    onPrimary: () => takeOverTab(yielded)
  });
}

function takeOverTab(reloadAfter) {
  toast('Reprise de la partie dans cet onglet…');
  tabChannel()?.postMessage({ type: 'takeover' });
  acquireTabLock(4000)
    .then(ok => ok || acquireTabLock(0, true))
    .then(ok => {
      if (!ok) { showOtherTabModal(reloadAfter); return; }
      // Onglet mis en pause : son état en mémoire est périmé → rechargement
      if (reloadAfter) { location.reload(); return; }
      startSession();
    });
}

// ---- Sauvegarde illisible ----
// Rien n'est écrasé tant que le joueur n'a pas choisi : la chaîne brute est
// copiée sous une clé de secours, et on propose de l'exporter, d'importer
// une autre sauvegarde ou de recommencer.
function showCorruptSaveModal(res) {
  $('#modal').className = 'modal';
  const backupNote = res.backupKey
    ? `Une copie de secours est gardée dans ce navigateur (<code>${esc(res.backupKey)}</code>).`
    : `⚠ Aucune copie de secours n'a pu être créée (stockage plein ?) : exporte la sauvegarde avant de recommencer.`;
  showModal({
    title: 'Sauvegarde illisible',
    body: `
      <p>La sauvegarde de ta colonie n'a pas pu être chargée : ${esc(res.error?.message || 'erreur inconnue')}.</p>
      <p>Rien n'a été effacé. ${backupNote}</p>
      <p>Tu peux l'exporter (pour la réparer ou la transmettre), importer une autre sauvegarde, ou recommencer une partie.</p>
      <div class="btn-row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:12px">
        <button id="corruptExport">Exporter la sauvegarde endommagée</button>
        <button id="corruptImport">Importer une sauvegarde…</button>
      </div>`,
    bodyIsHTML: true,
    hideCancel: true,
    primaryLabel: res.backupKey ? 'Recommencer une partie' : 'Recommencer quand même',
    primaryClass: 'danger',
    onPrimary: () => {
      unlockSaves();
      setS(freshState());
      seedJournal();
      save();
      toast('Nouvelle fondation établie');
      startGameLoop();
    }
  });
  $('#corruptExport')?.addEventListener('click', () => exportRawSave(res.raw));
  $('#corruptImport')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) importSave(f, { onCancel: () => showCorruptSaveModal(res) });
    });
    input.click();
  });
}

// ---- Démarrage ----
function boot() {
  try { setupHandlers(); } catch (err) { console.error('[BOOT] Erreur setupHandlers :', err); }
  acquireTabLock()
    .then(ok => {
      if (ok) startSession();
      else { _tabRole = 'secondary'; showOtherTabModal(false); }
    })
    .catch(err => {
      console.error('[BOOT] Verrou d\'onglet :', err);
      _tabRole = 'primary';
      startSession();
    });
}

// Charge la sauvegarde (ou crée une partie) puis lance la boucle de jeu.
function startSession() {
  let res;
  try { res = loadSave(); } catch (err) { res = { status: 'error', error: err, raw: null }; }
  if (res.status === 'error') {
    lockSaves('sauvegarde-illisible');
    showCorruptSaveModal(res);
    return;
  }
  try {
    if (res.status === 'ok') {
      setS(res.data);
      if (res.newer) toast(`Sauvegarde d'une version plus récente du jeu : certaines données peuvent être ignorées.`);
      else if (res.warnings?.length) toast(`Sauvegarde chargée avec ${res.warnings.length} avertissement(s) (détails dans la console).`);
    } else {
      setS(freshState());
      seedJournal();
      save();
    }
  } catch (err) {
    console.error('[BOOT] Erreur init :', err);
    alert("DRIFT : impossible d'initialiser le jeu.\n" + err.message);
    return;   // sans state on ne peut rien faire
  }
  startGameLoop();
}

function startGameLoop() {
  if (_loopStarted) return;
  _loopStarted = true;
  markSessionStart();   // l'horloge « session » repart de zéro

  try {
    autoAssignAllFreeMembers({ respectChoice: true });
  } catch (err) {
    console.error('[BOOT] Erreur autoAssign :', err);
  }
  try {
    render();
  } catch (err) {
    console.error('[BOOT] Erreur render initial :', err);
  }

  // Premier tick tout de suite : rattrape l'absence (par morceaux si elle
  // est longue) puis réaffiche la décision en attente éventuelle.
  safeTick();
  let tickIntervalId = setInterval(safeTick, TICK_POLL_MS);

  // Watchdog : surveille que le tick tourne toujours.
  // Si gameMin n'a pas bougé depuis 5 secondes alors que la PWA est visible
  // (et qu'aucun rattrapage / pause n'est en cours), on relance le tick.
  let lastWatchdogCheck = { time: Date.now(), gameMin: S?.meta?.gameMin || 0 };
  setInterval(() => {
    if (!S || !S.meta) return;
    const now = Date.now();
    if (document.visibilityState !== 'visible' || isSimPaused() || isCatchingUp()) {
      lastWatchdogCheck = { time: now, gameMin: S.meta.gameMin || 0 };
      return;
    }
    const elapsed = now - lastWatchdogCheck.time;
    const advanced = (S.meta.gameMin || 0) - lastWatchdogCheck.gameMin;
    if (elapsed > 5000 && advanced === 0) {
      console.warn('[WATCHDOG] Tick gelé détecté — redémarrage');
      try { clearInterval(tickIntervalId); } catch (e) { /* rien */ }
      tickIntervalId = setInterval(safeTick, TICK_POLL_MS);
      try { render(); } catch (e) { /* rien */ }
    }
    lastWatchdogCheck = { time: now, gameMin: S.meta.gameMin || 0 };
  }, 5000);

  // Onglet caché : on sauvegarde (sans toucher à lastTickRealMs : tick()
  // simulera tout ce qui est dû). Retour au premier plan : tick() tout de
  // suite, qui rattrape l'écart (par morceaux s'il est grand).
  document.addEventListener('visibilitychange', () => {
    if (!S?.meta || isSimPaused()) return;
    if (document.visibilityState === 'hidden') {
      try { save(); } catch (e) { /* rien */ }
      return;
    }
    safeTick();
    lastWatchdogCheck = { time: Date.now(), gameMin: S.meta.gameMin || 0 };
  });

  // Sauvegarde aussi avant fermeture
  window.addEventListener('pagehide', () => {
    if (S?.meta) { try { save(); } catch (e) { /* rien */ } }
  });

  // Filet de sécurité multi-onglets : un autre onglet écrit la sauvegarde
  // alors que celui-ci se croit seul → on se met en pause sans écraser.
  window.addEventListener('storage', e => {
    if (e.key === SAVE_KEY && e.newValue !== null && _tabRole === 'primary') yieldToOtherTab(false);
  });

  console.log('[BOOT] DRIFT démarré, version', VERSION);
}

// Différer le démarrage pour éviter les problèmes de Temporal Dead Zone
// avec les dépendances circulaires app.js ↔ state.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  // Document déjà chargé : différer d'un tick
  setTimeout(boot, 0);
}
