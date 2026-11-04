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

// Affecte un membre à un poste (gère désaffectation préalable)
export function assignMember(memberId, modKey, slotIdx) {
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
  if (!keepTenure) {
    member.posteInfo = {
      modKey,
      slotIdx,
      titre: job.label,
      role: job.role,
      depuis: S.meta?.gameMin || 0
    };
  }
  return { ok: true };
}

// Désaffecte un membre (le laisse libre)
export function unassignMember(memberId) {
  const a = memberAssignment(memberId);
  if (!a) return;
  const member = S.crew.find(m => m.id === memberId);
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

// Auto-affecte un membre nouvellement disponible vers le meilleur poste libre éligible
export function autoAssignMember(memberId) {
  if (!S.autoAssign) return;
  const member = S.crew.find(m => m.id === memberId);
  if (!member || member.statut !== 'libre') return;

  // Liste tous les postes libres éligibles, scoré par "qualité du match"
  const candidates = [];
  for (const modKey in MODULE_JOBS) {
    const jobs = jobsForModule(modKey);
    for (let i = 0; i < jobs.length; i++) {
      const k = jobKey(modKey, i);
      if (S.assignments[k]) continue;          // déjà occupé
      const job = jobs[i];
      if (!isEligibleForJob(member, job)) continue;
      // Score : skill demandé × marge
      let score = 1;
      if (job.req?.skill) {
        const v = member.skills[job.req.skill.key] || 0;
        score = v * 2 - job.req.skill.min + 1;
      }
      // Bonus rôle / commandement plus important
      if (job.role === 'commandement') score += 5;
      candidates.push({ modKey, slotIdx: i, score });
    }
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  assignMember(memberId, best.modKey, best.slotIdx);
}

// Lance l'auto-affectation pour tous les colons libres (utilisé au démarrage et à la construction)
export function autoAssignAllFreeMembers() {
  ensureCrewIntegrity();
  if (!S.autoAssign) return;
  // Trie les colons libres par "force" décroissante (somme skills) pour donner
  // les meilleurs postes aux meilleurs colons
  const free = S.crew
    .filter(m => m.statut === 'libre')
    .map(m => ({ m, score: SKILL_LIST.reduce((s, k) => s + (m.skills[k] || 0), 0) }))
    .sort((a, b) => b.score - a.score);
  for (const { m } of free) autoAssignMember(m.id);
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


// Constantes d'expédition
export const EXPED_TIME_PER_PC = 180;   // 3h jeu par parsec à vitesse 1.0 (puis ×vessel.speed)
export const EXPED_ONSITE_MIN = 240;    // 4h jeu sur place (phase 2b — sera variable en 2c avec scènes)
export const EXPED_BIOMASSE_PER_HOUR = 0.2;  // par membre, par heure de mission

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

// Évalue si une tech peut être lancée. Renvoie { ok, reason, cost }.
export function canResearch(techId) {
  const tech = TECH_TREE[techId];
  if (!tech) return { ok: false, reason: 'Tech inconnue' };
  if (isTechCompleted(techId)) return { ok: false, reason: 'Déjà complétée' };
  if (isTechResearching(techId)) return { ok: false, reason: 'Déjà en cours' };
  // Branche exotique nécessite déblocage
  if (tech.branch === 'exotique' && !isExoticUnlocked()) {
    return { ok: false, reason: "Branche verrouillée — découvre d'abord un schéma alien" };
  }
  // Prérequis : techs précédentes complétées
  for (const t of (tech.prereq?.tech || [])) {
    if (!isTechCompleted(t)) {
      return { ok: false, reason: `Requiert : ${TECH_TREE[t]?.nom || t}` };
    }
  }
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
  const labLvl = S.modules.laboratoire?.level || 0;
  if (labLvl === 0) return { ok: false, reason: 'Laboratoire requis' };
  const slots = Math.max(1, Math.ceil(labLvl / 2));   // niv 1-2 → 1 slot, 3-4 → 2, 5-6 → 3
  if ((S.research || []).length >= slots) {
    return { ok: false, reason: `Toutes les places de recherche sont prises (${slots})` };
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
  return { ok: true, cost, tech };
}

export function startResearch(techId) {
  const r = canResearch(techId);
  if (!r.ok) { toast(r.reason); return; }
  // Débite
  S.res.datacubes -= r.cost.datacubes;
  if (r.cost.datacubes_alien) {
    S.alienDatacubes = (S.alienDatacubes || 0) - r.cost.datacubes_alien;
  }
  if (!S.research) S.research = [];
  S.research.push({
    id: uid('r'),
    techId,
    startedAt: S.meta.gameMin,
    totalMin: r.cost.time * BUILD_TIME_MULT,
    doneMin: 0
  });
  log('neutral', `Recherche engagée : <em>${r.tech.nom}</em>. Durée : ${fmtMin(r.cost.time * BUILD_TIME_MULT)}.`);
  render();
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

// Avance les recherches en cours d'un tick
export function tickResearch() {
  if (!S.research || S.research.length === 0) return;
  const lb = laboratoryBonuses();
  // Mode automatisé sans Chercheur : plancher d'automatisation (30% + techs)
  const autoMult = lb.activeProd ? 1.0 : automationFloor();
  
  // 0.25 : bonus de vitesse depuis modules avec researchSpeedBonus (mémoire cristalline)
  let modBonus = 1.0;
  for (const id of Object.keys(S.modules || {})) {
    const def = MODULES[id];
    const m = S.modules[id];
    if (def?.researchSpeedBonus && m?.level > 0) {
      modBonus += def.researchSpeedBonus(m.level);
    }
  }
  
  const finished = [];
  for (const r of S.research) {
    const tech = TECH_TREE[r.techId];
    let progress = MIN_PER_TICK * autoMult * modBonus / lb.speedMult;
    if (tech?.branch === 'bio') progress *= lb.bioBonus;
    r.doneMin += progress;
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
  log('neutral', `Fabrication engagée : <em>${fab.nom}</em>. Durée : ${fmtMin(fab.time * BUILD_TIME_MULT)}.`);
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
  for (const f of S.fabrication) {
    f.doneMin += MIN_PER_TICK * autoMult / bonuses.speedMult;
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
//   MOTEUR NARRATIF V1 — histoires (chroniques) et scènes d'expédition
// ============================================================
// Le contenu est de la donnée pure dans src/content/ (format décrit dans
// docs/ecrire-pour-drift.md), interprété par src/engine/narration.js. Cette
// section fait le lien avec l'état du jeu (S) : lecture des conditions,
// attribution des histoires aux planètes, rythme des épisodes, tirage des scènes.
//   SCENES (catalog.js)      → src/content/scenes/*.js
//   CHRONICLES (chronicles.js) → src/content/histoires/*.js (= HISTOIRES)
import * as N from './engine/narration.js';
import { sceneDepuisAncienne, estAncienneScene, choixDepuisAncien } from './engine/ancien-format.js';
import { fmtDuree } from './util.js';

const HISTOIRES = CHRONICLES;
// Id de la scène-intro synthétique d'un épisode : l'expédition ne stocke que cet
// id ; la scène est reconstruite à partir du corps céleste (texte de l'épisode).
const CHRON_INTRO_ID = '__chron_intro__';
const RYTHME_DEFAUT = '18h';             // délai entre deux épisodes si l'histoire n'en fixe pas
const PORTEE_ANTENNE_DEPART = 2.4;       // portée de l'antenne niveau 1 (state.js : 1 + 1 × 1.4)
// Préfixes des anciens ids de scène de chronique (0.24-0.33) : « chron_pulsar_ep1_sas »
const PREFIXES_033 = { pulsar: 'pulsar_silencieux', sanc: 'sanctuaire_vert', couv: 'couvee_dormante', anneau: 'anneau_trace', veilleurs: 'veilleurs_beth', marche: 'marche_etrange' };

// ---- Accès au contenu ----
const _scenesV1 = new Map();
// Scène d'expédition par id. Une scène encore au format 0.33 (outil de test qui en
// injecte une dans SCENES) est convertie à la volée.
function sceneParId(id) {
  const hit = _scenesV1.get(id);
  if (hit) return hit;
  const s = SCENES.find(x => x && x.id === id);
  if (!s) return null;
  const v = estAncienneScene(s) ? sceneDepuisAncienne(s) : s;
  _scenesV1.set(id, v);
  return v;
}

// Id d'une scène d'histoire (« histoire/scene », ou ancien id 0.33) → { histoire, cle } | null
function idSceneHistoire(id) {
  if (typeof id !== 'string') return null;
  let m = /^(\w+)\/(\w+)$/.exec(id);
  if (m && HISTOIRES[m[1]]?.scenes?.[m[2]]) return { histoire: m[1], cle: m[2] };
  m = /^chron_([a-z]+)_(\w+)$/.exec(id);
  const h = m && PREFIXES_033[m[1]];
  if (h && HISTOIRES[h]?.scenes?.[m[2]]) return { histoire: h, cle: m[2] };
  return null;
}

// État de l'histoire `id` dans la partie (porté par un corps céleste)
function corpsDeHistoire(id) {
  for (const sys of S.galaxy?.systems || []) for (const b of sys.bodies || []) if (b.chronicle?.id === id) return { body: b, sys };
  return null;
}

// Valeur d'un identifiant du mini-langage de conditions (espaces de noms :
// src/content/vocabulaire.js, ESPACES). ctx : { drapeaux, equipe, exp, body }.
function lireEtat(id, ctx = {}) {
  const parts = id.split('.');
  if (parts.length === 1) return ctx.drapeaux ? ctx.drapeaux[id] : undefined;
  const [ns, a, b, c] = parts;
  const equipe = ctx.equipe || [];
  switch (ns) {
    case 'equipe':
      if (a === 'taille') return equipe.length;
      if (a === 'chef') return equipe[0]?.name ?? null;
      if (a === 'carac') return equipe.length ? Math.max(...equipe.map(m => m.stats?.[b] ?? 5)) : 0;
      if (a === 'trait') return equipe.some(m => (m.traits || []).includes(b));
      if (a === 'objet') return ctx.exp?.equipment?.[b] || 0;
      return equipe.length ? Math.max(0, ...equipe.map(m => m.skills?.[a] || 0)) : 0;
    case 'colonie':
      if (a === 'colons') return aliveCrew().length;
      if (a === 'jour') return Math.floor((S.meta?.gameMin || 0) / 86400) + 1;
      if (a === 'res') return S.res?.[b] ?? 0;
      if (a === 'module') return S.modules?.[b]?.level || 0;
      if (a === 'tech') return !!S.techCompleted?.[b];
      if (a === 'objet') return S.inventory?.[b] || 0;
      return undefined;
    case 'corps':
      if (!ctx.body) return undefined;
      return a === 'visites' ? (ctx.body.visites || 0) : ctx.body[a];
    case 'faction': {
      const f = ctx.body?.factionId ? S.factions?.[ctx.body.factionId] : null;
      if (a === 'existe') return !!f;
      return f ? f[a] : undefined;
    }
    case 'histoire': {
      const ch = corpsDeHistoire(a)?.body.chronicle;
      if (b === 'fin') return ch?.completed ? (ch.ending || null) : null;
      if (b === 'terminee') return !!ch?.completed;
      if (b === 'episode') return ch ? ch.episodeIdx : 0;   // épisodes terminés
      if (b === 'drapeau') return ch?.flags?.[c];
      return undefined;
    }
    case 'monde': return S.monde?.[parts.slice(1).join('.')];
    case 'compteur': return S.compteurs?.[parts.slice(1).join('.')] || 0;
  }
  return undefined;
}

// Condition évaluée sans jamais interrompre le jeu (une erreur de contenu est signalée en console)
function conditionSure(src, lire, ou = false) {
  try { return N.condition(src, lire); } catch (e) { console.warn('[NARRATION]', e.message); return ou; }
}

function compter(nom, n = 1) {
  if (!S.compteurs || typeof S.compteurs !== 'object') S.compteurs = {};
  S.compteurs[nom] = (S.compteurs[nom] || 0) + n;
}

// Ligne des Annales (mémoire de la partie) : marques historiques de la colonie
function noterAnnales(texte) {
  if (!S.historicalMarks) S.historicalMarks = [];
  S.historicalMarks.push({ at: S.meta.gameMin, text: texte, kind: 'annales' });
}

// ============================================================
//   CHRONIQUES PLANÉTAIRES — attribution, épisodes, fins
// ============================================================
// État d'une histoire, porté par le corps céleste :
//   body.chronicle = { id, episodeIdx, flags, completed, ending, currentSceneId,
//                      pretAt (tick où l'épisode suivant devient jouable),
//                      annoncee (connue du joueur), suiteAnnoncee }

// Le corps remplit-il les conditions d'apparition de l'histoire ?
function bodyMatchesChronicleReqs(body, histoire) {
  const ap = histoire?.apparition || {};
  const lire = id => lireEtat(id, { body });
  return conditionSure(ap.lieu ?? true, lire) && conditionSure(ap.si, lire);
}

function attribuerHistoire(body, h, { annoncee = true } = {}) {
  body.chronicle = { id: h.id, episodeIdx: 0, flags: { ...h.drapeaux }, completed: false, currentSceneId: null, pretAt: 0, annoncee: false };
  body.chronicleChecked = true;
  if (annoncee) annoncerHistoire(body);
}

function annoncerHistoire(body) {
  const h = HISTOIRES[body.chronicle?.id];
  if (!h || body.chronicle.annoncee) return;
  body.chronicle.annoncee = true;
  log('success', `<em>${esc(h.titre)}</em> — Une chronique se révèle sur ${esc(body.name)}.${h.accroche ? ' ' + esc(h.accroche) : ''}`);
  notif.chronicleStart(h.titre, body.name);
}

// À la première expédition vers une planète, tente d'y attribuer une histoire
function tryAssignChronicle(body) {
  if (body.chronicle) return;           // déjà attribuée
  if (body.chronicleChecked) return;    // déjà tirée : pas de seconde roulette
  body.chronicleChecked = true;
  // Une histoire est unique : on exclut celles déjà attribuées à un autre corps
  const taken = new Set();
  for (const sys of S.galaxy?.systems || []) for (const b of sys.bodies || []) if (b !== body && b.chronicle?.id) taken.add(b.chronicle.id);
  const candidates = Object.values(HISTOIRES).filter(h => !taken.has(h.id) && bodyMatchesChronicleReqs(body, h));
  // Ordre aléatoire : sinon la première histoire compatible serait toujours favorisée
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const h of candidates) {
    if (Math.random() < (h.apparition?.chance ?? 0.2)) { attribuerHistoire(body, h); return; }
  }
}

// Apparition garantie : tant qu'aucune histoire n'est en cours ni à découvrir, on en
// place une sur le corps compatible le plus proche, de préférence à portée de
// l'antenne de départ (sans toucher à la génération de la galaxie).
function garantirHistoire() {
  const systems = S.galaxy?.systems || [];
  const bodies = systems.flatMap(sys => (sys.bodies || []).map(body => ({ sys, body })));
  if (bodies.some(({ body }) => body.chronicle?.id && !body.chronicle.completed && HISTOIRES[body.chronicle.id])) return;
  const prises = new Set(bodies.map(({ body }) => body.chronicle?.id).filter(Boolean));
  const colonie = id => lireEtat(id, {});
  const libres = Object.values(HISTOIRES).filter(h => !prises.has(h.id) && conditionSure(h.apparition?.si, colonie));
  if (!libres.length) return;
  const rng = rngFor(S.meta.seed, 'histoire-garantie', prises.size);
  for (let i = libres.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [libres[i], libres[j]] = [libres[j], libres[i]];
  }
  const parDistance = [...bodies].filter(({ body }) => !body.chronicle).sort((a, b) => a.sys.distance - b.sys.distance);
  for (const { sys, body } of parDistance) {
    const h = libres.find(x => bodyMatchesChronicleReqs(body, x));
    if (!h) continue;
    // Hors de portée de l'antenne de départ : le système est cartographié d'office
    if (sys.distance > PORTEE_ANTENNE_DEPART) sys.scanned = true;
    attribuerHistoire(body, h, { annoncee: !!sys.scanned });
    return;
  }
}

// Histoire active sur une planète (format V1, avec les noms de champs 0.33 nom/title
// pour l'interface actuelle), ou null
const _vueHistoire = new Map();
function vueCompatHistoire(h) {
  let v = _vueHistoire.get(h);
  if (!v) {
    v = { ...h, nom: h.titre, episodes: h.episodes.map(ep => ({ ...ep, title: ep.titre, firstScene: ep.debut })) };
    _vueHistoire.set(h, v);
  }
  return v;
}
export function activeChronicle(body) {
  if (!body || !body.chronicle || body.chronicle.completed) return null;
  const h = HISTOIRES[body.chronicle.id];
  return h ? vueCompatHistoire(h) : null;
}

// Épisode courant (à jouer) de l'histoire d'une planète
export function currentChronicleEpisode(body) {
  const c = activeChronicle(body);
  if (!c) return null;
  const idx = body.chronicle.episodeIdx;
  return idx < c.episodes.length ? c.episodes[idx] : null;
}

// L'épisode courant est-il jouable maintenant (délai entre épisodes écoulé) ?
function episodeJouable(body) {
  return !!currentChronicleEpisode(body) && (body.chronicle.pretAt || 0) <= (S.meta?.gameMin || 0);
}

// Texte d'introduction de l'épisode courant (texte brut, variantes selon les drapeaux)
export function chronicleEpisodeIntro(body) {
  const ep = currentChronicleEpisode(body);
  if (!ep) return null;
  const flags = body.chronicle.flags || {};
  return N.rendreTexte(ep.intro, { condition: src => conditionSure(src, id => lireEtat(id, { drapeaux: flags, body })) }).brut;
}

// Applique { drapeau: {...} } : '+1' / '-2' incrémentent, toute autre valeur remplace
function applyFlagChanges(body, changes) {
  if (!body.chronicle || !changes) return;
  if (!body.chronicle.flags) body.chronicle.flags = {};
  N.appliquerDrapeaux(body.chronicle.flags, changes);
}

// Scène d'histoire par id global (« histoire/scene » ou ancien id) → { histoire, cle, scene }
function findChronicleScene(id) {
  const r = idSceneHistoire(id);
  if (!r) return null;
  return CHRONICLE_SCENES.find(s => s.histoire === r.histoire && s.cle === r.cle) || null;
}

// Termine l'épisode courant ; l'épisode suivant ne sera jouable qu'après le délai
// de l'histoire (rythme.entreEpisodes). exp (facultatif) : l'expédition qui a joué
// l'épisode — évite de sauter un épisode si une autre l'a déjà conclu.
function endChronicleEpisode(body, exp) {
  if (!body.chronicle || body.chronicle.completed) return;
  const playedIdx = exp?.chronicleRef?.episodeIdx;
  if (typeof playedIdx === 'number' && playedIdx !== body.chronicle.episodeIdx) return;
  const h = HISTOIRES[body.chronicle.id];
  const fini = h?.episodes[body.chronicle.episodeIdx];
  body.chronicle.episodeIdx++;
  body.chronicle.currentSceneId = null;
  if (!h) return;
  if (body.chronicle.episodeIdx >= h.episodes.length) {
    body.chronicle.completed = true;
    body.chronicle.ending = body.chronicle.ending || 'completed';
    compter('chroniques_terminees');
    log('success', `Chronique <em>${esc(h.titre)}</em> achevée sur ${esc(body.name)}.`);
    noterAnnales(`Chronique « ${h.titre} » achevée sur ${body.name}.`);
    notif.chronicleDone(h.titre);
  } else {
    let delai = N.parseDuree(h.rythme?.entreEpisodes ?? RYTHME_DEFAUT);
    if (!Number.isFinite(delai)) delai = N.parseDuree(RYTHME_DEFAUT);
    body.chronicle.pretAt = (S.meta.gameMin || 0) + delai;
    body.chronicle.suiteAnnoncee = false;
    log('neutral', `Épisode <em>${esc(fini?.titre || '')}</em> achevé. La suite de <em>${esc(h.titre)}</em> sera prête dans ${fmtDuree(delai)}.`);
    notif.episodeDone(h.titre, fini?.titre || '');
  }
  if (exp) exp.faits?.push(`Épisode « ${fini?.titre || ''} » de ${h.titre} terminé.`);
}

// Termine l'histoire avec une fin donnée (et ses effets éventuels)
function endChronicleWith(body, endingId, exp) {
  if (!body.chronicle || body.chronicle.completed) return;
  body.chronicle.completed = true;
  body.chronicle.currentSceneId = null;
  body.chronicle.ending = endingId;
  const h = HISTOIRES[body.chronicle.id];
  if (!h) return;
  const fin = h.fins?.[endingId];
  compter('chroniques_terminees');
  const texte = fin ? N.rendreTexte(fin.texte, envTexte(exp, { body, histoire: h })).brut : 'Fin de la chronique.';
  log('success', `<em>${esc(h.titre)}</em> — <b>${esc(fin?.titre || 'Fin')}</b>. ${esc(texte)}`);
  noterAnnales(`${h.titre} — ${fin?.titre || 'fin'} (${body.name}).`);
  notif.chronicleDone(h.titre);
  if (exp) {
    exp.faits?.push(`${h.titre} : ${fin?.titre || 'fin'}.`);
    if (fin?.effets?.length) appliquerEffets(fin.effets, { exp, body, histoire: h, scene: null, sceneKey: 'fin', choiceIdx: 0, lootMult: 1 });
  }
}

// Scène-intro synthétique de l'épisode courant (format V1), ou null
function chronicleIntroScene(body) {
  const episode = currentChronicleEpisode(body);
  if (!episode) return null;
  return { id: CHRON_INTRO_ID, titre: episode.titre, texte: episode.intro || episode.titre, choix: [{ label: 'Avancer', effets: [{ aller: episode.debut }] }] };
}

// Vrai si l'expédition joue (ou va jouer) un épisode de chronique
function isChronicleExpedition(exp) {
  return !!exp && (!!exp.chronicleSceneId || exp.scenes?.[0] === CHRON_INTRO_ID);
}

// Séquence de scènes d'un épisode : la seule scène-intro ; la suite est résolue
// par les choix (exp.chronicleSceneId). null si l'épisode n'est pas encore jouable.
function buildChronicleEpisodeScenes(body) {
  if (!episodeJouable(body)) return null;
  const introScene = chronicleIntroScene(body);
  if (!introScene) return null;
  body.chronicle.currentSceneId = CHRON_INTRO_ID;
  return [introScene];
}

// Une fois par minute de jeu : histoires à annoncer, apparition garantie,
// « La suite est prête ». Appelé par tickExpeditions.
let _chronTickFor = null, _chronTickAt = -Infinity;
export function tickChronicles() {
  if (!S?.galaxy?.systems || !S.meta) return;
  const now = S.meta.gameMin || 0;
  if (_chronTickFor === S && now - _chronTickAt < 60 && now >= _chronTickAt) return;
  const premier = _chronTickFor !== S;
  _chronTickFor = S;
  _chronTickAt = now;
  for (const sys of S.galaxy.systems) for (const body of sys.bodies || []) {
    const ch = body.chronicle;
    if (!ch?.id || !HISTOIRES[ch.id]) continue;
    // Sauvegardes ≤ 0.33 : histoires déjà connues, épisode suivant jouable tout de suite
    if (premier && ch.annoncee === undefined) ch.annoncee = true;
    if (premier && ch.pretAt === undefined) { ch.pretAt = 0; ch.suiteAnnoncee = true; }
    if (!ch.annoncee && sys.scanned) annoncerHistoire(body);
    if (!ch.completed && ch.annoncee && ch.episodeIdx > 0 && !ch.suiteAnnoncee && (ch.pretAt || 0) <= now) {
      ch.suiteAnnoncee = true;
      const h = HISTOIRES[ch.id];
      const ep = h.episodes[ch.episodeIdx];
      log('success', `<em>${esc(h.titre)}</em> — La suite est prête sur ${esc(body.name)} : épisode ${ch.episodeIdx + 1}, « ${esc(ep?.titre || '')} ».`);
      notif.episodeReady?.(h.titre, ep?.titre || '');
    }
  }
  garantirHistoire();
}

// Liste des chroniques connues du joueur, pour l'interface (onglet Récits).
// etat : 'decouverte' (rien joué) | 'en_cours' (expédition en route ou sur place)
//      | 'prete' (épisode suivant jouable) | 'en_attente' (délai) | 'terminee'
export function listChronicles(state = S) {
  const out = [];
  const now = state?.meta?.gameMin || 0;
  for (const sys of state?.galaxy?.systems || []) for (const body of sys.bodies || []) {
    const ch = body.chronicle;
    const h = ch?.id && HISTOIRES[ch.id];
    if (!h || ch.annoncee === false) continue;
    const enCours = (state.expeditions || []).some(e => e.bodyId === body.id && (e.phase === 'aller' || e.phase === 'sur_place') && isChronicleExpedition(e));
    const etat = ch.completed ? 'terminee' : enCours ? 'en_cours' : ch.episodeIdx === 0 ? 'decouverte' : (ch.pretAt || 0) > now ? 'en_attente' : 'prete';
    const n = h.episodes.length;
    const idx = Math.min(ch.episodeIdx, n - 1);
    const fin = ch.completed ? { id: ch.ending || null, titre: h.fins?.[ch.ending]?.titre || 'Fin', texte: h.fins?.[ch.ending] ? N.rendreTexte(h.fins[ch.ending].texte).brut : '' } : null;
    out.push({
      id: h.id, titre: h.titre, accroche: h.accroche || '',
      lieu: { systemId: sys.id, bodyId: body.id, nom: body.name, systeme: sys.name },
      etat, episode: ch.completed ? n : idx + 1, episodes: n, titreEpisode: h.episodes[idx]?.titre || '',
      prochainDans: etat === 'en_attente' ? Math.max(0, (ch.pretAt || 0) - now) : 0,
      fin,
    });
  }
  const ordre = { prete: 0, decouverte: 1, en_cours: 2, en_attente: 3, terminee: 4 };
  return out.sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.prochainDans - b.prochainDans);
}

// ============================================================
//   SÉLECTION DES SCÈNES D'UNE EXPÉDITION
// ============================================================
// Lieu obligatoire (scene.lieux, condition sur le corps) + affinités (le poids est
// multiplié quand une affinité est vraie) + mémoire de la colonie (S.scenesVues) :
// une scène n'est reproposée qu'une fois toutes les autres scènes compatibles du
// même moment vues autant de fois. 1 arrivée, 2 à 4 scènes d'exploration, 1 départ.
const momentDe = s => s.moment || 'exploration';

function poidsScene(s, lire) {
  let p = s.poids ?? 1;
  for (const a of s.affinites || []) if (conditionSure(a.si, lire)) p *= a.facteur ?? 1;
  return Math.max(0, p);
}

function tirerPondere(list, poids, rng) {
  const ws = list.map(poids);
  const total = ws.reduce((s, w) => s + w, 0);
  if (!(total > 0)) return list[Math.floor(rng() * list.length)] || null;
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

// Scènes génériques compatibles avec un corps céleste (lieu obligatoire)
export function scenesCompatibles(body) {
  const lire = id => lireEtat(id, { body });
  const out = [];
  for (const raw of SCENES) {
    const s = raw && estAncienneScene(raw) ? sceneParId(raw.id) : raw;
    if (!s || !Array.isArray(s.choix)) continue;
    if (conditionSure(s.lieux ?? true, lire)) out.push(s);
  }
  return out;
}

function selectExpeditionScenes(body, rng, opts = {}) {
  // D'abord, on tente d'attribuer une histoire si ce n'est pas déjà fait
  if (!opts.skipChronicle) tryAssignChronicle(body);
  // Épisode d'histoire jouable : il remplace la sélection normale
  const chronScenes = opts.skipChronicle ? null : buildChronicleEpisodeScenes(body);
  if (chronScenes) return chronScenes;

  const lire = id => lireEtat(id, { body });
  const compatibles = scenesCompatibles(body);
  const vues = S.scenesVues || {};
  const poids = s => poidsScene(s, lire);
  const used = new Set();
  const tirer = moment => {
    const pool = compatibles.filter(s => momentDe(s) === moment && !used.has(s.id));
    if (!pool.length) return null;
    const min = Math.min(...pool.map(s => vues[s.id] || 0));
    const s = tirerPondere(pool.filter(x => (vues[x.id] || 0) === min), poids, rng);
    if (s) used.add(s.id);
    return s;
  };
  const picks = [tirer('arrivee') || sceneParId('intro_atterrissage')];
  // Embuscade (faction hostile…) : juste après l'arrivée
  for (const s of compatibles) if (momentDe(s) === 'embuscade' && !used.has(s.id)) { picks.push(s); used.add(s.id); }
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = tirer('exploration');
    if (!s) break;
    picks.push(s);
  }
  picks.push(tirer('depart') || sceneParId('outro_retour'));
  return picks.filter(Boolean);
}

// Substitue les gabarits historiques dans un texte déjà rendu (interface 0.33).
// Le moteur V1 remplit lui-même les gabarits : cette fonction ne sert plus qu'aux
// textes encore écrits à l'ancienne.
export function fillTemplate(text, ctx = {}) {
  return String(text ?? '')
    .replace(/\{vaisseau\}/g, ctx.vesselName || 'le vaisseau')
    .replace(/\{(?:planete|lieu)\}/g, ctx.bodyName || 'la planète')
    .replace(/\{(?:biomeFrag|decor\.biome)\}/g, BIOMES[ctx.body?.biome]?.frag || '')
    .replace(/\{(?:atmFrag|decor\.atmosphere)\}/g, ATMOSPHERES[ctx.body?.atmosphere]?.frag || '')
    .replace(/\{(?:signalFrag|decor\.signal)\}/g, SIGNAUX[ctx.body?.signal]?.frag || '')
    .replace(/\{(?:ruinesFrag|decor\.ruines)\}/g, RUINES[ctx.body?.ruines]?.frag || '');
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
    untreated: { afterMin: 60*48, become: null, selfCure: true },  // guérit seul en 48h
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
    untreated: { afterMin: 60*24, become: 'mort' },  // mort en 24h
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
    untreated: { afterMin: 60*72, become: 'mort' },
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
    untreated: { afterMin: 60*96, become: 'mort' },
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
    untreated: { afterMin: 60*120, become: 'mutinerie' },
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
    untreated: { afterMin: 60*24*7, become: 'eclosion' },  // 7 jours
    onCured: { sequelChance: 0.3, sequels: ['cicatrice'] }
  },
  mutation: {
    nom: 'Mutation',
    short: "Modifications physiologiques observables.",
    kind: 'exotique',
    severity: 3,
    detect: 'auto',  // apparente après quelques heures
    revealAfter: 60*24,
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
  const base = TRAINING_PROGRAMS[skill].baseHours * 60; // en min
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
  if (member.statut !== 'libre') return { ok:false, reason:`Colon ${member.statut}` };
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
  log('neutral', `<em>${member.name}</em> entre en formation : ${TRAINING_PROGRAMS[skill].nom} (→ niv ${r.target}). Durée : ${fmtMin(r.duration)}.`);
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
export function bestAvailableDoctor() {
  // Priorité au staff infirmerie en service
  const infirmaryStaff = staffOf('infirmerie')
    .map(s => s.member)
    .filter(m => (m.skills.medecine || 0) > 0)
    .sort((a, b) => (b.skills.medecine || 0) - (a.skills.medecine || 0));
  if (infirmaryStaff.length > 0) return infirmaryStaff[0];
  // Fallback : un colon libre avec Médecine
  return S.crew
    .filter(m => m.statut === 'libre' && (m.skills.medecine || 0) > 0)
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

// Délai minimal entre deux examens d'un même statut après un échec (minutes de jeu)
export const DIAG_RETRY_MIN = 60;

// Vérifie qu'un diagnostic est lançable. statusRef : index (UI) ou clé du statut.
// Renvoie { ok, reason, cost, doctor, waitMin? } — utilisable par l'UI pour le bouton.
export function canDiagnose(memberId, statusRef) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Patient introuvable" };
  if (member.statut !== 'infirmerie') return { ok:false, reason:"Le patient doit être admis avant." };
  const found = findMemberStatus(member, statusRef);
  if (!found) return { ok:false, reason:"Statut introuvable" };
  const { status, idx: statusIdx } = found;
  if (status.diagnosed) return { ok:false, reason:"Déjà diagnostiqué" };
  const def = STATUTS[status.key];
  if (!def) return { ok:false, reason:"Statut inconnu" };
  const det = (def.detect && typeof def.detect === 'object') ? def.detect : {};
  if (det.needLab && !S.flags.recherche) return { ok:false, reason:"Laboratoire requis pour ce diagnostic." };
  const doctor = bestAvailableDoctor();
  if (!doctor) return { ok:false, reason:"Aucun médecin disponible." };
  // Un examen non concluant ne peut être refait qu'après un délai
  const waitMin = typeof status.lastDiagAt === 'number' ? status.lastDiagAt + DIAG_RETRY_MIN - S.meta.gameMin : 0;
  if (waitMin > 0) return { ok:false, reason:`Nouvel examen possible dans ${fmtMin(waitMin)}`, waitMin };
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
    log('warn', `Diagnostic non concluant pour <em>${member.name}</em>. Nouvel examen possible dans ${fmtMin(DIAG_RETRY_MIN)}.`);
  }
  render();
}

// Vérifie qu'un traitement est lançable.
// statusRef : index dans member.statuts (UI) ou clé du statut.
export function canTreat(memberId, statusRef) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Patient introuvable" };
  if (member.statut !== 'infirmerie') return { ok:false, reason:"Patient non admis" };
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
  const doctor = bestAvailableDoctor();
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
  log('neutral', `<em>${r.doctor.name}</em> entreprend le traitement de <em>${member.name}</em> (${r.def.nom}). Durée : ${fmtMin(duration)}.`);
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

// Mort d'un membre
function memberDies(member, cause = 'cause inconnue') {
  if (member.statut === 'mort') return;
  // Libère le poste s'il en avait un (archive la carrière), puis toute
  // affectation résiduelle qui pointerait encore vers lui
  unassignMember(member.id);
  for (const k of Object.keys(S.assignments || {})) {
    if (S.assignments[k] === member.id) delete S.assignments[k];
  }
  member.statut = 'mort';
  member.diedAt = S.meta.gameMin;
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
    // Convertir taux/jour en taux/min
    const ratePerMin = rate / (24 * 60);
    if (Math.random() < ratePerMin * MIN_PER_TICK) {
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
  const baseHourlyRate = 0.04 + 0.01 * lvl;       // niv 1 = 5%/h, niv 5 = 9%/h
  const securityFactor = 1 - (eff.securityBonus * 0.30);  // chaque poste sécurité = -30%
  const cmdFactor = 1 - globalCommandBonus() * 0.08;  // chaque cmd = -8% global
  const hourlyRate = Math.max(0.005, baseHourlyRate * securityFactor * cmdFactor);
  return hourlyRate * (MIN_PER_TICK / 60);
}

// Tirage par tick : pour chaque bâtiment, tente un incident.
// silent (rattrapage) : l'incident est résolu automatiquement.
export function tickIncidents(silent = false) {
  // Cooldown global : pas d'incident trop rapproché
  if (S.meta.gameMin < S.nextIncidentMin) return;

  const elig = eligibleIncidentBuildings();
  if (elig.length === 0) return;

  // Pour chaque bâtiment, tente de tirer un incident
  for (const { modKey, candidates } of elig) {
    if (Math.random() < incidentProbability(modKey)) {
      // Choisit aléatoirement un incident parmi les candidats du bâtiment
      const id = candidates[Math.floor(Math.random() * candidates.length)];
      triggerIncident(id, silent);
      // Cooldown : 4-8h jeu avant prochain incident global
      S.nextIncidentMin = S.meta.gameMin + 60 * 4 + Math.floor(Math.random() * 60 * 4);
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

// Déclenche un incident : en direct, il rejoint la file des décisions du
// joueur ; en silencieux (rattrapage), il est résolu automatiquement.
export function triggerIncident(incidentId, silent = false) {
  const inc = INCIDENTS[incidentId];
  if (!inc) return;
  if (!MODULES[inc.modKey]) return;
  const victim = pickIncidentVictim(inc);
  if (!victim) return;

  if (silent) {
    autoResolveIncident(incidentId, victim);
    return;
  }
  enqueueDecision({ kind: 'incident', refId: incidentId, victimId: victim.id });
  // 0.26 : notification dédiée (critique, pour qu'on la voie même si on est ailleurs)
  notif.incident(incidentTitle(incidentId));
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
    for (const r of S.research) r.doneMin = Math.max(0, r.doneMin - outcome.delayResearch * OUTCOME_MULT);
  }

  // 0.28 : NOUVEAUX EFFETS DURABLES
  // — damageModule : module perd un niveau (effet sévère, permanent jusqu'à reconstruction)
  if (outcome.damageModule && inc.modKey) {
    const msg = damageModule(inc.modKey);
    if (msg) say('warn', msg);
  }
  // — disableModule : module hors service pendant N minutes-jeu
  if (outcome.disableModule && inc.modKey) {
    const duration = outcome.disableModule;
    const mod = S.modules[inc.modKey];
    if (mod) {
      mod.disabledUntil = (S.meta.gameMin || 0) + duration;
      say('warn', `<em>${MODULES[inc.modKey].nom}</em> hors service pour ${Math.round(duration/60)}h jeu.`);
    }
  }
  // — debuff : pénalité globale temporaire (ex: { type: 'prodMult', value: 0.8, duration: 1440 })
  if (outcome.debuff) {
    if (!S.activeBuffs) S.activeBuffs = [];
    S.activeBuffs.push({
      ...outcome.debuff,
      sourceLabel: inc.titre || 'Incident',
      startedAt: S.meta.gameMin,
      expiresAt: (S.meta.gameMin || 0) + (outcome.debuff.duration || 720)
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
      triggerAt: (S.meta.gameMin || 0) + (outcome.chainIncident.delay || 720)
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
    // La plus ancienne qui n'est pas à l'écran est résolue automatiquement
    const idx = S.pendingDecisions[0].id === _shownDecisionId ? 1 : 0;
    const [old] = S.pendingDecisions.splice(idx, 1);
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
  const eligible = Object.entries(COLONY_EVENTS).filter(([id, ev]) => {
    if (pending.has(id)) return false;
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

export function tickColonyEvents(silent = false) {
  // Cooldown : 2-5 jours jeu entre événements
  if (S.meta.gameMin < (S.nextEventMin || 0)) return;
  S.nextEventMin = S.meta.gameMin + (2 + Math.random() * 3) * 24 * 60;

  const eventId = pickColonyEvent();
  if (!eventId) return;
  // silent (rattrapage) : résolu automatiquement ; sinon file des décisions
  triggerColonyEvent(eventId, silent);
}

function triggerColonyEvent(eventId, silent = false) {
  const ev = COLONY_EVENTS[eventId];
  if (!ev) return;
  let actors;
  try { actors = ev.pickActors(); } catch (e) { return; }
  if (!actors) return;
  S.lastColonyEventId = eventId;

  if (silent) {
    autoResolveColonyEvent(eventId, actors);
    return;
  }
  enqueueDecision({ kind: 'event', refId: eventId, ...decisionActors(actors) });
  // 0.26.1 : notification dédiée (warn — événement en attente de décision)
  notif.colonyEvent(colonyEventTitle(eventId));
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
        birthGameMin: S.meta.gameMin - (cand.age || 30) * 43200,
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
      expiresAt: (S.meta.gameMin || 0) + (o.debuff.duration || 720)
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
  const cooldown = ft.giftCooldown || 3 * 24 * 60;
  if (f.lastGift && (S.meta.gameMin - f.lastGift) < cooldown) {
    const wait = cooldown - (S.meta.gameMin - f.lastGift);
    toast(`Cadeau récent. Réessaie dans ${fmtMin(wait)}.`);
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
      const cycle = 15 * 24 * 60;
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
    log('success', `Commerce ouvert avec <em>${f.name}</em>. Première caravane dans ~15 jours jeu.`);
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
  const duration = 24 * 60 + Math.floor(Math.random() * 24 * 60);
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
  log('neutral', `<em>${m.name}</em> est parti(e) en mission diplomatique vers <em>${f.name}</em>${envoyNote}. Retour dans ${fmtMin(duration)}.`);
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

function genVesselName(typeKey) {
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

export function canBuildVessel(typeKey) {
  const def = VESSELS[typeKey];
  if (!def) return { ok:false, why:'Modèle inconnu' };
  if (S.vesselBuild) return { ok:false, why:'Chantier vaisseau déjà en cours' };
  const hangarLvl = S.modules.hangar?.level || 0;
  if (hangarLvl < def.hangarReq) return { ok:false, why:`Hangar niv ${def.hangarReq} requis` };
  // Capacité hangar : 1 vaisseau par niveau
  const fleetCount = S.fleet.length;
  if (fleetCount >= hangarLvl) return { ok:false, why:`Capacité hangar atteinte (${hangarLvl})` };
  
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
    totalMin: r.def.buildHours * 60 * BUILD_TIME_MULT,
    doneMin: 0,
    cost: { ...r.def.cost }
  };
  log('neutral', `Mise sur cale : <em>${r.def.nom}</em>. Livraison estimée : ${fmtMin(S.vesselBuild.totalMin)}.`);
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

  // Calcul coûts (avec bonus Hangar et tech)
  const hb = hangarBonuses();
  const tech = techEffectsAccumulated();
  const oneWayHours = sys.distance * EXPED_TIME_PER_PC * def.speed * hb.speedMult * tech.vesselSpeedMult / 60;
  const totalHours = oneWayHours * 2 + EXPED_ONSITE_MIN / 60;
  const fuel = Math.ceil(sys.distance * def.fuelPerPc * 2 * hb.fuelMult * tech.vesselFuelMult);
  const bio  = Math.ceil(totalHours * EXPED_BIOMASSE_PER_HOUR * crewIds.length * tech.expeditionBiomasseMult);

  if (S.res.energie < fuel) return { ok:false, why:`Carburant insuffisant (${fuel} énergie requis)` };
  if (S.res.biomasse < bio) return { ok:false, why:`Biomasse insuffisante (${bio} requis)` };

  return {
    ok: true,
    vessel, def, body, sys,
    oneWayMin: Math.round(oneWayHours * 60),
    onSiteMin: EXPED_ONSITE_MIN,
    fuel, bio,
    totalMin: Math.round(totalHours * 60)
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
    equipment: { ...equipment },  // 0.15 — items embarqués
    departAt: S.meta.gameMin      // V1 — durée du bilan d'expédition
  };
  // Épisode de chronique : on retient lequel, pour ne pas en sauter un si
  // plusieurs expéditions visent le même corps
  if (exp.scenes[0] === CHRON_INTRO_ID) {
    exp.chronicleRef = { id: r.body.chronicle.id, episodeIdx: r.body.chronicle.episodeIdx };
  }
  S.expeditions.push(exp);
  const equipNote = equipUnits > 0 ? ` · ${equipUnits} équipement(s) embarqué(s)` : '';
  log('neutral', `Décollage : <em>${r.vessel.name}</em> en route vers <em>${r.body.name}</em>. Voyage : ${fmtMin(r.oneWayMin)}${equipNote}.`);
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
  tickChronicles();
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
    onReturn(exp);
    const idx = S.expeditions.indexOf(exp);
    if (idx >= 0) S.expeditions.splice(idx, 1);
  }
}

function onArrival(exp) {
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  const body = sys?.bodies.find(b => b.id === exp.bodyId);
  if (!body) return;
  body.visited = true;
  body.visites = (body.visites || 0) + 1;
  sys.explored = true;
  log('neutral', `<em>${vesselNameOf(exp)}</em> arrive sur <em>${body.name}</em>. Exploration en cours.`);
  // Épisode de chronique prévu au départ : on vérifie qu'il est toujours jouable
  // (une autre expédition a pu le conclure ou être en train de le jouer).
  if (exp.scenes[0] === CHRON_INTRO_ID) {
    const busy = S.expeditions.some(o => o !== exp && o.bodyId === exp.bodyId && o.phase === 'sur_place' && isChronicleExpedition(o));
    if (episodeJouable(body) && !busy) {
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
// reconstitue linéairement en LOOT_RECOVERY_DAYS jours de jeu.
const LOOT_DEPLETED_MULT = 0.25;
const LOOT_RECOVERY_DAYS = 30;
function bodyLootMult(body) {
  if (!body || typeof body.lootedAt !== 'number') return 1;
  const days = Math.max(0, (S.meta.gameMin - body.lootedAt) / 1440);
  if (days >= LOOT_RECOVERY_DAYS) return 1;
  return LOOT_DEPLETED_MULT + (1 - LOOT_DEPLETED_MULT) * days / LOOT_RECOVERY_DAYS;
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
  // Combat perdu sur une scène V1 : sa suite déclarée (drapeaux, fin d'épisode…)
  if (exp.suiteCombat) appliquerSuiteCombat(exp, 'defaite');
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
  exp.bilan = construireBilan(exp, true);
  compter('expeditions');
  S.expHistory.unshift({
    expId: exp.id,
    bilan: exp.bilan,
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
  const role = def?.role && def.role !== '?' ? def.role : null;
  return { id: 'chronique', label: CHRONICLES[chronicleId]?.titre || 'Chronique planétaire', notes: role || 'Rencontré·e lors d\'une chronique' };
}

// Personnage d'histoire au format V1 (nom, recrue {competences, caracs, traits}),
// ou ancienne définition 0.33 gardée dans une expédition en cours (name, skills…)
function recruitChronicleCharacter({ characterId, chronicleId, characterDef }) {
  const def = CHRONICLES[chronicleId]?.personnages?.[characterId] || characterDef;
  if (!def) return;
  const already = [...S.crew, ...S.candidates].some(p => p.chronicleOrigin === chronicleId && p.chronicleCharacter === characterId);
  if (already) return;
  const recrue = def.recrue || { competences: def.skills, caracs: def.stats, traits: def.traits };
  const c = genCandidate();
  c.name = def.nom || def.name;
  if (typeof def.age === 'number' && def.age > 0) c.age = def.age;
  if (def.pronoms) c.pronoms = def.pronoms;
  c.origin = chronicleOriginOf(chronicleId, def);
  if (recrue.caracs) Object.assign(c.stats, recrue.caracs);
  if (recrue.competences) Object.assign(c.skills, recrue.competences);
  if (Array.isArray(recrue.traits)) c.traits = recrue.traits.filter(t => TRAITS[t]);
  c.salary = Math.max(1, 1 + Math.max(...Object.values(c.skills)));
  c.chronicleOrigin = chronicleId;
  c.chronicleCharacter = characterId;
  S.candidates.push(c);
  const cap = crewUsage();
  if (cap.used < cap.total) {
    acceptCandidate(c.id);
  } else {
    log('warn', `<em>${esc(c.name)}</em> est arrivé·e à l'avant-poste, mais l'habitat est plein : sa candidature attend une place libre.`);
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
      const def = chronId ? CHRONICLES[chronId]?.personnages?.[p.chronicleCharacter] : null;
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
//   MOTEUR DE SCÈNES — résolution des choix (V1)
// ============================================================
// Une expédition est sur une scène générique (exp.scenes[exp.sceneIdx]), sur
// l'intro d'un épisode (CHRON_INTRO_ID) ou sur une scène d'histoire
// (exp.chronicleSceneId = « histoire/scene »). Le contenu est lu par
// src/engine/narration.js ; ici on l'applique à l'état du jeu.

// Trouve le corps céleste lié à une expédition
export function bodyOfExpedition(exp) {
  if (!exp || !S.galaxy) return null;
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  return sys?.bodies?.find(b => b.id === exp.bodyId) || null;
}

const equipeVivante = exp => (exp?.crewIds || []).map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
const personne = m => (m ? { nom: m.name ?? m.nom, pronoms: m.pronoms, id: m.id } : null);
const colonV1 = m => ({ id: m.id, nom: m.name, pronoms: m.pronoms, competences: m.skills || {}, caracs: m.stats || {}, traits: m.traits || [] });

// Scène courante d'une expédition, décrite pour le moteur :
// { type: 'expedition' | 'intro' | 'histoire', id, scene (V1), titre, histoire, cle, body }
function sceneCourante(exp) {
  if (!exp) return null;
  const body = bodyOfExpedition(exp);
  if (exp.chronicleSceneId) {
    const cs = findChronicleScene(exp.chronicleSceneId);
    if (!cs) return null;
    const h = CHRONICLES[cs.histoire];
    return { type: 'histoire', id: cs.id, scene: cs.scene, titre: cs.scene.titre || h.titre, histoire: h, cle: cs.cle, body };
  }
  if (!Array.isArray(exp.scenes) || exp.sceneIdx < 0 || exp.sceneIdx >= exp.scenes.length) return null;
  const sceneId = exp.scenes[exp.sceneIdx];
  if (sceneId === CHRON_INTRO_ID) {
    const intro = chronicleIntroScene(body);
    if (!intro) return null;
    return { type: 'intro', id: CHRON_INTRO_ID, scene: intro, titre: intro.titre, histoire: CHRONICLES[body.chronicle.id], cle: null, body };
  }
  const cs = findChronicleScene(sceneId);
  if (cs) return { type: 'histoire', id: cs.id, scene: cs.scene, titre: cs.scene.titre, histoire: CHRONICLES[cs.histoire], cle: cs.cle, body };
  const s = sceneParId(sceneId);
  return s ? { type: 'expedition', id: s.id, scene: s, titre: s.titre || String(s.id).replace(/_/g, ' '), histoire: null, cle: null, body } : null;
}

// Environnement de lecture (conditions) d'une scène pour une expédition
function lecteur(exp, sc) {
  const ctx = { exp, body: sc?.body || bodyOfExpedition(exp), equipe: equipeVivante(exp), drapeaux: sc?.histoire ? (sc.body?.chronicle?.flags || {}) : null };
  return id => lireEtat(id, ctx);
}

// Gabarits des textes : {vaisseau}, {lieu}, {equipe.chef}, {acteur}, {pnj:id}, {decor.biome}…
function envTexte(exp, sc = {}, extra = {}) {
  const body = sc.body || (exp ? bodyOfExpedition(exp) : null);
  const equipe = exp ? equipeVivante(exp) : [];
  const chef = equipe[0] || null;
  const lire = exp ? lecteur(exp, sc) : (id => lireEtat(id, { body, drapeaux: body?.chronicle?.flags || null }));
  const DECORS = { biome: BIOMES, atmosphere: ATMOSPHERES, signal: SIGNAUX, ruines: RUINES, danger: DANGERS };
  return {
    condition: src => conditionSure(src, lire),
    inconnu: () => '',
    gabarit: nom => {
      switch (nom) {
        case 'vaisseau': return exp ? vesselNameOf(exp) : 'le vaisseau';
        case 'lieu': case 'planete': return body?.name || 'la planète';
        case 'systeme': return S.galaxy?.systems?.find(s => s.id === (exp?.systemId || body?.systemId))?.name || '';
        case 'colonie': return S.meta?.colonyName || 'Avant-poste';
        case 'equipe.chef': return personne(chef) || 'l’équipe';
        case 'equipe.medecin': {
          const best = [...equipe].sort((a, b) => (b.skills?.medecine || 0) - (a.skills?.medecine || 0))[0];
          return personne(best && (best.skills?.medecine || 0) > 0 ? best : chef) || 'l’équipe';
        }
        case 'equipe.hasard': {
          if (!equipe.length) return 'quelqu’un';
          const r = rngFor(`${exp?.seed || ''}|${exp?.chronicleSceneId || exp?.sceneIdx}|hasard`)();
          return personne(equipe[Math.floor(r * equipe.length)]);
        }
        case 'acteur': return personne(extra.acteur) || personne(chef) || 'quelqu’un';
        case 'victime': return personne(extra.victime) || personne(extra.acteur) || personne(chef) || 'quelqu’un';
        case 'secondaire': return personne(extra.secondaire) || personne(equipe[1]) || personne(chef) || 'quelqu’un';
      }
      if (nom.startsWith('pnj:')) {
        const ref = nom.slice(4);
        const [hId, pId] = ref.includes('/') ? ref.split('/') : [sc.histoire?.id || body?.chronicle?.id, ref];
        const p = CHRONICLES[hId]?.personnages?.[pId];
        return p ? { nom: p.nom, pronoms: p.pronoms } : null;
      }
      if (nom.startsWith('decor.')) return DECORS[nom.slice(6)]?.[body?.[nom.slice(6)]]?.frag ?? '';
      return null;
    },
  };
}

// Environnement d'analyse d'un choix (disponibilité, raison, chance, acteur)
function envChoix(exp, sc) {
  return {
    lire: lecteur(exp, sc),
    equipe: equipeVivante(exp).map(colonV1),
    objetEmbarque: id => exp.equipment?.[id] || 0,
    peutPayer: cout => Object.keys(cout || {}).filter(k => (S.res[k] || 0) < cout[k]),
    nom: (genre, id) => genre === 'objet' ? itemDef(id)?.nom : genre === 'trait' ? TRAITS[id]?.nom
      : genre === 'module' ? MODULES[id]?.nom : genre === 'tech' ? TECH_TREE[id]?.nom : id,
  };
}

// Libellé d'un choix (les gabarits y sont permis)
const libelleChoix = (c, exp, sc) => N.rendreTexte(c.label, envTexte(exp, sc)).brut;

// Choix au format 0.33 pour l'interface actuelle (ui.js lit req / consume / risky)
function choixCompat(c, i, exp, sc) {
  const out = { label: libelleChoix(c, exp, sc), _v1: c, _idx: i };
  const req = {};
  if (c.requiert) {
    let ast = null;
    try { ast = N.compiler(c.requiert); } catch { ast = null; }
    const atomes = [];
    const visit = n => { if (n?.k === 'op' && n.op === '&&') { visit(n.a); visit(n.b); } else if (n) atomes.push(n); };
    visit(ast);
    for (const n of atomes) {
      const ident = n.k === 'id' ? n.v : (n.k === 'op' && n.a?.k === 'id' && n.b?.k === 'lit' ? n.a.v : null);
      const val = n.k === 'op' ? n.b?.v : null;
      let m;
      if (!ident) continue;
      if ((m = /^equipe\.objet\.(\w+)$/.exec(ident))) req.item = m[1];
      else if ((m = /^equipe\.trait\.(\w+)$/.exec(ident))) req.trait = m[1];
      else if ((m = /^equipe\.carac\.(\w+)$/.exec(ident)) && typeof val === 'number') req.stat = { key: m[1], min: val };
      else if ((m = /^equipe\.(\w+)$/.exec(ident)) && SKILL_LABELS[m[1]] && typeof val === 'number') req.skill = { key: m[1], min: val };
    }
  }
  if (Object.keys(req).length) out.req = req;
  if (c.cout || c.consomme) out.consume = { ...(c.cout || {}), ...(c.consomme ? { item: [].concat(c.consomme)[0] } : {}) };
  if (c.test) out.risky = { stat: c.test.carac || c.test.competence, dc: c.test.difficulte };
  return out;
}

// Récupère la scène active d'une expédition, au format attendu par l'interface 0.33 :
// { id, titre, text (HTML), choices: [{ label, req, consume, risky }], chronicleEpisode }.
// Les choix cachés (`si` faux) y figurent, mais evaluateChoice les dit indisponibles :
// l'index d'un choix reste celui du contenu (celui qu'attend playChoice).
export function currentScene(exp) {
  const sc = sceneCourante(exp);
  if (!sc) return null;
  const rendu = N.rendreTexte(sc.scene.texte, envTexte(exp, sc));
  const out = {
    id: sc.id,
    titre: sc.titre,
    text: rendu.paragraphes.map(p => p.html).join('<br><br>'),
    choices: sc.scene.choix.map((c, i) => choixCompat(c, i, exp, sc)),
    _v1: sc,
  };
  if (sc.histoire) out.chronicleEpisode = { chronicle: sc.histoire.id, episode: (sc.body?.chronicle?.episodeIdx ?? 0) + 1 };
  return out;
}

// Indique si une scène est une scène de chronique (pour rendu spécifique UI)
export function isChronicleScene(scene) {
  if (!scene) return false;
  if (scene.chronicleEpisode) return true;
  if (scene.id === CHRON_INTRO_ID) return true;
  return !!scene._v1?.histoire;
}

// Choix d'une scène V1 à partir d'un choix au format de l'interface (ou d'un ancien choix)
const choixV1 = c => (c?._v1 ? c._v1 : (c && (c.outcome !== undefined || c.risky || c.req || c.consume) && !c.effets && !c.test ? choixDepuisAncien(c) : c));

// Vérifie si un choix est disponible pour l'équipage présent.
// { available, reason, hidden, chance, acteur } — reason est lisible (« Science 2 requise dans l'équipe »).
export function evaluateChoice(exp, choice) {
  const sc = sceneCourante(exp);
  const a = N.analyserChoix(choixV1(choice) || {}, envChoix(exp, sc));
  if (!a.visible) return { available: false, reason: 'Conditions non remplies', hidden: true, chance: null, acteur: null };
  return { available: a.disponible, reason: a.raison || '', hidden: false, chance: a.chance, acteur: a.acteur?.nom || null };
}

// ---- Effets (vocabulaire unique, src/content/vocabulaire.js) appliqués à une expédition ----
// ctx : { exp, body, histoire, scene, sceneKey, choiceIdx, lootMult, acteur, victime,
//         textes: [source], gains: [], pertes: [] }
function cibles(cible, ctx) {
  const equipe = equipeVivante(ctx.exp);
  switch (cible) {
    case 'equipe': return equipe;
    case 'chef': return equipe.slice(0, 1);
    case 'acteur': return [ctx.acteur ? S.crew.find(m => m.id === ctx.acteur.id) : equipe[0]].filter(Boolean);
    case 'victime': return [ctx.victime || (ctx.acteur && S.crew.find(m => m.id === ctx.acteur.id)) || equipe[0]].filter(Boolean);
    case 'secondaire': return [equipe[1] || equipe[0]].filter(Boolean);
    case 'colonie': return aliveCrew().filter(m => m.statut !== 'expedition');
    case 'colonie_hasard': { const c = aliveCrew().filter(m => m.statut !== 'expedition'); return c.length ? [c[Math.floor(Math.random() * c.length)]] : []; }
    case 'equipe_hasard':
    default: return equipe.length ? [equipe[Math.floor(Math.random() * equipe.length)]] : [];
  }
}

function gagnerButin(ctx, loot) {
  const { exp, body } = ctx;
  const isAlienRuins = !!body && ['alien_a', 'alien_b', 'fusion'].includes(body.ruines);
  const alienMult = isAlienRuins ? (techEffectsAccumulated().expeditionAlienLootMult || 1) : 1;
  for (const k in loot) {
    // Les montants négatifs ne sont pas des gains (un coût s'écrit `cout`)
    if (!(loot[k] > 0)) continue;
    const amount = Math.floor(loot[k] * alienMult * ctx.lootMult);
    exp.accumulatedLoot[k] = (exp.accumulatedLoot[k] || 0) + amount;
  }
  // Sur ruines alien, une part des datacubes est aussi créditée en datacubes alien
  if (isAlienRuins && loot.datacubes > 0) {
    exp.accumulatedAlienDatacubes = (exp.accumulatedAlienDatacubes || 0) + Math.ceil(loot.datacubes * alienMult * ctx.lootMult * 0.4);
  }
  // Plafond de la soute du vaisseau
  const vessel = S.fleet.find(v => v.id === exp.vesselId);
  const cargoCap = vessel ? (VESSELS[vessel.type]?.cargo ?? 999) : 999;
  const total = Object.values(exp.accumulatedLoot).reduce((s, v) => s + v, 0);
  if (total > cargoCap) {
    const ratio = cargoCap / total;
    for (const k in exp.accumulatedLoot) exp.accumulatedLoot[k] = Math.floor(exp.accumulatedLoot[k] * ratio);
    exp.accumulatedLog.push('Cargaison à saturation : la suite ne pourra pas être emportée.');
  }
}

// Site déjà fouillé : les objets et schémas ne se retrouvent qu'avec une chance réduite
function trouvailleGardee(ctx) {
  if (ctx.keepFinds === undefined) {
    const rng = rngFor(`${ctx.exp.seed}|${ctx.sceneKey}|${ctx.choiceIdx}|epuise`);
    ctx.keepFinds = ctx.lootMult >= 1 || rng() < ctx.lootMult;
    if (!ctx.keepFinds) ctx.exp.accumulatedLog.push("Quelqu'un est déjà passé par là : il ne reste rien de précieux.");
  }
  return ctx.keepFinds;
}

// Applique une liste d'effets ; renvoie l'issue (dernier effet) ou null
function appliquerEffets(effets, ctx) {
  const { exp } = ctx;
  ctx.textes ||= []; ctx.gains ||= []; ctx.pertes ||= [];
  const issue = N.issueDe(effets);
  for (const brut of effets || []) {
    const e = N.normaliserEffet(brut);
    switch (e.type) {
      case 'texte': ctx.textes.push(e.valeur); break;
      case 'gain': gagnerButin(ctx, e.valeurs); break;
      case 'perte':
        for (const [k, n] of Object.entries(e.valeurs)) {
          if (!(n > 0)) continue;
          const pris = Math.min(S.res[k] || 0, n);
          S.res[k] = (S.res[k] || 0) - pris;
          if (pris > 0) ctx.pertes.push({ type: 'ressource', id: k, nom: RES_LABELS[k] || k, n: pris });
        }
        break;
      case 'objet':
        if (trouvailleGardee(ctx)) for (let i = 0; i < e.n; i++) exp.accumulatedItems.push(e.id);
        break;
      case 'schema': {
        if (!trouvailleGardee(ctx)) break;
        const rng = rngFor(`${exp.seed}|${ctx.sceneKey}|${ctx.choiceIdx}|bp`);
        const r = ctx.body?.ruines;
        const pool = e.origines === 'auto' ? [['humaines', 'alien_a', 'alien_b', 'fusion'].includes(r) ? (r === 'humaines' ? 'humain' : r) : 'humain'] : e.origines;
        const bpId = rollBlueprint(pool, rng);
        if (bpId) {
          exp.accumulatedItems.push(bpId);
          exp.accumulatedLog.push(!S.discoveries?.[bpId] ? `Schéma inédit récupéré : ${BLUEPRINTS[bpId].nom}` : `Schéma récupéré : ${BLUEPRINTS[bpId].nom}`);
        }
        break;
      }
      case 'statut':
        for (const m of cibles(e.cible, ctx)) {
          inflictStatus(m, e.id, 'expédition');
          ctx.victime = m;
          ctx.pertes.push({ type: 'statut', id: e.id, nom: STATUTS[e.id]?.nom || e.id, colon: m.name });
          (exp.blesses ||= []).push({ nom: m.name, statut: STATUTS[e.id]?.nom || e.id });
        }
        break;
      case 'moral': {
        const ms = cibles(e.cible, ctx);
        for (const m of ms) m.moral = Math.max(0, Math.min(100, (m.moral || 0) + e.valeur));
        if (ms.length && e.valeur) (e.valeur > 0 ? ctx.gains : ctx.pertes).push({ type: 'moral', id: 'moral', nom: 'Moral', n: Math.abs(e.valeur) });
        break;
      }
      case 'affinite': {
        const v = brut.affinite || {};
        const [a] = cibles(v.a, ctx), [b] = cibles(v.b, ctx);
        if (a && b && a !== b) adjustAffinity(a.id, b.id, v.delta || 0);
        break;
      }
      case 'drapeau':
        if (ctx.body?.chronicle && ctx.histoire) applyFlagChanges(ctx.body, e.valeurs);
        break;
      case 'monde':
        if (!S.monde || typeof S.monde !== 'object') S.monde = {};
        Object.assign(S.monde, e.valeurs);
        break;
      case 'recrute': {
        const ref = String(e.valeur);
        const [hId, pId] = ref.includes('/') ? ref.split('/') : [ctx.histoire?.id || ctx.body?.chronicle?.id, ref];
        const def = CHRONICLES[hId]?.personnages?.[pId];
        if (def) {
          exp.pendingChronicleRecruits = exp.pendingChronicleRecruits || [];
          exp.pendingChronicleRecruits.push({ characterId: pId, chronicleId: hId });
          ctx.gains.push({ type: 'recrue', id: pId, nom: def.nom, n: 1 });
        }
        break;
      }
      case 'reputation': {
        const faction = e.faction ? S.factions?.[e.faction] : factionForExpedition(exp);
        if (faction && e.delta > 0 && ctx.lootMult < 1) {
          // Revisite d'un site récemment fouillé : pas de réputation à regagner
          exp.accumulatedLog.push(`${faction.name} : déjà rencontrés récemment, réputation inchangée.`);
        } else if (faction) {
          adjustReputation(faction.id, e.delta);
          exp.accumulatedLog.push(`${faction.name} : réputation ${e.delta > 0 ? '+' : ''}${e.delta}.`);
          (e.delta > 0 ? ctx.gains : ctx.pertes).push({ type: 'reputation', id: faction.id, nom: faction.name, n: Math.abs(e.delta) });
        }
        break;
      }
      case 'journal':
        log('neutral', N.rendreTexte(e.valeur, envTexte(exp, ctx, ctx)).html.replace(/<\/?p>/g, ' ').trim());
        break;
      case 'annales':
        noterAnnales(N.rendreTexte(e.valeur, envTexte(exp, ctx, ctx)).brut);
        break;
      case 'module': {
        const v = brut.module || {};
        const mod = S.modules?.[v.id];
        const duree = N.parseDuree(v.horsService);
        if (mod && Number.isFinite(duree)) {
          mod.disabledUntil = (S.meta.gameMin || 0) + duree;
          log('warn', `<em>${esc(MODULES[v.id]?.nom || v.id)}</em> hors service pendant ${fmtDuree(duree)}.`);
        }
        break;
      }
      case 'effetTemporaire': {
        const v = brut.effetTemporaire || {};
        const duree = N.parseDuree(v.duree);
        if (typeof v.prod === 'number' && Number.isFinite(duree)) {
          if (!S.activeBuffs) S.activeBuffs = [];
          S.activeBuffs.push({ type: 'prodMult', value: v.prod, label: v.titre || 'Effet temporaire', sourceLabel: v.titre || 'Expédition', duration: duree, startedAt: S.meta.gameMin, expiresAt: (S.meta.gameMin || 0) + duree });
        }
        break;
      }
      case 'incident': {
        const v = brut.incident || {};
        const dans = N.parseDuree(v.dans ?? '1h');
        if (v.id && Number.isFinite(dans)) {
          if (!S.pendingChainIncidents) S.pendingChainIncidents = [];
          S.pendingChainIncidents.push({ incidentId: v.id, triggerAt: (S.meta.gameMin || 0) + dans });
        }
        break;
      }
      // Issues : traitées par suivreIssue (une seule, en dernier)
    }
  }
  return issue;
}

// L'équipe quitte le site : départ, puis bilan provisoire de l'expédition
function partir(exp) {
  startReturn(exp);
  exp.bilan = construireBilan(exp);
}

// Suite d'un choix : scène suivante, fin d'épisode, combat…
function suivreIssue(exp, issue, ctx) {
  const body = ctx.body;
  if (!issue) {
    // Issue implicite : scène suivante (une scène d'histoire sans issue termine l'épisode)
    advanceScene(exp);
    return;
  }
  switch (issue.type) {
    case 'aller': {
      const hId = ctx.histoire?.id || body?.chronicle?.id;
      if (hId && CHRONICLES[hId]?.scenes?.[issue.valeur]) {
        exp.chronicleSceneId = `${hId}/${issue.valeur}`;
        exp.awaitingChoice = true;
        if (body?.chronicle) body.chronicle.currentSceneId = exp.chronicleSceneId;
      } else {
        advanceScene(exp);
      }
      return;
    }
    case 'finEpisode':
      if (body) endChronicleEpisode(body, exp);
      partir(exp);
      return;
    case 'fin':
      if (body) endChronicleWith(body, issue.valeur, exp);
      partir(exp);
      return;
    case 'retraite':
      exp.accumulatedLog.push('Retraite anticipée.');
      partir(exp);
      return;
    case 'rentrer':
      partir(exp);
      return;
    case 'combat':
      // La suite (victoire / défaite) est déclarée : on la garde pour la fin du combat
      exp.suiteCombat = { victoire: issue.victoire, defaite: issue.defaite, sceneKey: ctx.sceneKey, choiceIdx: ctx.choiceIdx, histoire: ctx.histoire?.id || null };
      exp.accumulatedLog.push('Contact ennemi !');
      initCombat(exp, issue.ennemis, issue.butin || {}, 'retreat');
      return;
  }
  advanceScene(exp);
}

// Gains d'un choix, par différence de la cargaison (multiplicateurs et soute compris)
function gainsDepuis(avant, exp) {
  const gains = [];
  for (const [k, v] of Object.entries(exp.accumulatedLoot)) {
    const d = v - (avant.loot[k] || 0);
    if (d > 0) gains.push({ type: 'ressource', id: k, nom: RES_LABELS[k] || k, n: d });
  }
  for (const id of exp.accumulatedItems.slice(avant.items)) {
    gains.push(BLUEPRINTS[id] ? { type: 'schema', id, nom: BLUEPRINTS[id].nom, n: 1 } : { type: 'objet', id, nom: itemDef(id)?.nom || id, n: 1 });
  }
  return gains;
}

// Joue un choix : coût, test éventuel, effets, résultat (exp.dernierResultat), suite.
// choiceIdx est l'index du choix dans la scène (celui des vues currentScene / getSceneView).
export function playChoice(expId, choiceIdx) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp || !exp.awaitingChoice || exp.combat?.active) return;
  const sc = sceneCourante(exp);
  if (!sc) return;
  const choix = sc.scene.choix[choiceIdx];
  if (!choix) return;
  const env = envChoix(exp, sc);
  const a = N.analyserChoix(choix, env);
  if (!a.visible || !a.disponible) {
    toast(a.raison || 'Choix indisponible');
    return;
  }
  // Suivi (fils rouges, mémoire des scènes vues, compteurs)
  if (!exp.scenesPlayed) exp.scenesPlayed = [];
  if (!exp.itemsConsumed) exp.itemsConsumed = [];
  if (!exp.faits) exp.faits = [];
  if (!exp.scenesPlayed.includes(sc.id)) {
    exp.scenesPlayed.push(sc.id);
    compter('scenes');
    if (sc.type === 'expedition') {
      if (!S.scenesVues || typeof S.scenesVues !== 'object') S.scenesVues = {};
      S.scenesVues[sc.id] = (S.scenesVues[sc.id] || 0) + 1;
    }
  }
  if (sc.type === 'histoire') exp.histoireEtape = (exp.histoireEtape || 0) + 1;
  const avant = { loot: { ...exp.accumulatedLoot }, items: exp.accumulatedItems.length };
  const pertes = [];

  // Coûts : ressources de la colonie, objets embarqués
  for (const [k, n] of Object.entries(choix.cout || {})) {
    S.res[k] -= n;
    pertes.push({ type: 'ressource', id: k, nom: RES_LABELS[k] || k, n });
  }
  for (const itemId of [].concat(choix.consomme || [])) {
    if (exp.equipment && exp.equipment[itemId] > 0) {
      exp.equipment[itemId]--;
      if (exp.equipment[itemId] <= 0) delete exp.equipment[itemId];
      const nom = itemDef(itemId)?.nom || itemId;
      exp.accumulatedLog.push(`${nom} consommé.`);
      if (!exp.itemsConsumed.includes(itemId)) exp.itemsConsumed.push(itemId);
      pertes.push({ type: 'objet', id: itemId, nom, n: 1 });
    }
  }

  // Clé de scène pour les tirages (les scènes d'histoire gardent toutes sceneIdx = 0)
  const sceneKey = exp.chronicleSceneId || `sc${exp.sceneIdx}`;
  let jet = null;
  if (choix.test) {
    // Jet : 1d10 + bonus du meilleur colon de l'équipe ≥ difficulté
    const rng = rngFor(`${exp.seed}|${sceneKey}|${choiceIdx}|${S.meta.gameMin}`);
    jet = N.lancerTest(choix.test, env.equipe, rng);
    exp.accumulatedLog.push(`Jet ${jet.libelle} : ${jet.jet}${jet.bonus >= 0 ? '+' : ''}${jet.bonus} = ${jet.total} vs ${jet.difficulte} → ${jet.reussite ? 'réussi' : 'échec'}`);
  }
  const effets = N.brancheDe(choix, jet);
  // Site déjà fouillé : butin réduit (jamais pour les scènes d'histoire)
  const lootMult = sc.histoire ? 1 : (typeof exp.lootMult === 'number' ? exp.lootMult : 1);
  const acteur = jet?.colon || a.acteur || null;
  const ctx = { exp, body: sc.body, histoire: sc.histoire, scene: sc, sceneKey, choiceIdx, lootMult, acteur, textes: [], gains: [], pertes };
  const issue = appliquerEffets(effets, ctx);

  // Récit de la conséquence (après les effets : {victime} est connue)
  const envT = envTexte(exp, sc, ctx);
  const rendus = ctx.textes.map(t => N.rendreTexte(t, envT));
  const source = rendus.flatMap(r => r.paragraphes.map(p => p.source));
  for (const r of rendus) if (r.brut) { exp.accumulatedLog.push(r.brut.replace(/\n+/g, ' ')); exp.faits.push(r.brut.replace(/\n+/g, ' ')); }
  if (exp.faits.length > 30) exp.faits.splice(0, exp.faits.length - 30);
  exp.dernierResultat = {
    sceneId: sc.id, titre: sc.titre, label: libelleChoix(choix, exp, sc), at: S.meta.gameMin,
    texte: source,
    gains: [...gainsDepuis(avant, exp), ...ctx.gains],
    pertes: ctx.pertes,
    jet: jet ? { stat: jet.libelle, jet: jet.jet, bonus: jet.bonus, valeur: jet.total, difficulte: jet.difficulte, reussite: jet.reussite, chance: jet.chance, colon: jet.colon?.nom || null } : null,
    acteur: acteur?.nom || null,
  };

  suivreIssue(exp, issue, ctx);
  render();
}

// Suite déclarée d'un combat (victoire au retour de resolveCombatEnd via advanceScene,
// défaite appliquée au retour du vaisseau) ; renvoie true si elle a été traitée.
function appliquerSuiteCombat(exp, cas) {
  const suite = exp.suiteCombat;
  if (!suite) return false;
  delete exp.suiteCombat;
  const body = bodyOfExpedition(exp);
  const histoire = suite.histoire ? CHRONICLES[suite.histoire] : null;
  const effets = suite[cas] || [];
  if (cas === 'victoire') compter('combats_gagnes');
  const ctx = { exp, body, histoire, scene: null, sceneKey: suite.sceneKey, choiceIdx: suite.choiceIdx, lootMult: histoire ? 1 : (exp.lootMult ?? 1), textes: [], gains: [], pertes: [] };
  const issue = appliquerEffets(effets, ctx);
  const envT = envTexte(exp, { body, histoire }, ctx);
  for (const t of ctx.textes) {
    const brut = N.rendreTexte(t, envT).brut.replace(/\n+/g, ' ');
    if (brut) { exp.accumulatedLog.push(brut); (exp.faits ||= []).push(brut); }
  }
  if (cas === 'defaite') {
    // L'équipe rentre de toute façon ; seule la suite de l'histoire est appliquée
    if (issue?.type === 'finEpisode' && body) endChronicleEpisode(body, exp);
    if (issue?.type === 'fin' && body) endChronicleWith(body, issue.valeur, exp);
    return true;
  }
  if (issue) { suivreIssue(exp, issue, ctx); return true; }
  return false;
}

// Avance à la scène suivante (ou termine la mission en fin de séquence)
function advanceScene(exp) {
  // Victoire d'un combat déclaré par une scène V1 : on applique sa suite
  if (exp.suiteCombat && (!exp.combat || exp.combat.outcome === 'victory')) {
    if (appliquerSuiteCombat(exp, 'victoire')) { render(); return; }
  }
  // Sur une scène d'histoire, une suite sans issue termine l'épisode
  // (rejouer la même scène bloquerait l'équipe dans une boucle).
  if (exp.chronicleSceneId) {
    const body = bodyOfExpedition(exp);
    if (body) endChronicleEpisode(body, exp);
    partir(exp);
    render();
    return;
  }
  exp.sceneIdx++;
  if (exp.sceneIdx >= exp.scenes.length) {
    // Plus de scènes → départ
    partir(exp);
  } else {
    exp.awaitingChoice = true;
    // Scène de civilisation : on note la faction du lieu (réputation)
    const sc = sceneCourante(exp);
    if (sc?.type === 'expedition' && /civ_(?:active|dechue)/.test(sc.scene.lieux || '')) noteFactionForExpedition(exp);
  }
  render();
}

// ---- Vue d'une scène pour l'interface (contrat docs/V1.md, « Scènes ») ----
// { id, titre, texteHTML, chronique: { id, titre, episode, episodes, titreEpisode } | null,
//   progression: { i, n }, resultat: { texteHTML, titre, label, gains, pertes, jet, acteur } | null,
//   choix: [{ index, label, disponible, raison, chance, acteur, test, cout, consomme }], combat }
// Les choix cachés (`si` faux) ne figurent pas dans la liste ; `index` est à passer à playChoice.
export function getSceneView(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp || exp.phase !== 'sur_place') return null;
  const sc = sceneCourante(exp);
  const resultat = exp.dernierResultat ? { ...exp.dernierResultat, texteHTML: N.htmlDepuisSource(exp.dernierResultat.texte || []) } : null;
  const h = sc?.histoire || null;
  const chronique = h ? {
    id: h.id, titre: h.titre,
    episode: Math.min((sc.body?.chronicle?.episodeIdx ?? 0) + 1, h.episodes.length), episodes: h.episodes.length,
    titreEpisode: h.episodes[Math.min(sc.body?.chronicle?.episodeIdx ?? 0, h.episodes.length - 1)]?.titre || '',
  } : null;
  const progression = h ? { i: (exp.histoireEtape || 0) + 1, n: null } : { i: exp.sceneIdx + 1, n: exp.scenes.length };
  if (exp.combat?.active) return { id: sc?.id || null, titre: 'Combat', texteHTML: '', chronique, progression, resultat, choix: [], combat: true };
  if (!sc) return null;
  const env = envChoix(exp, sc);
  const choix = [];
  sc.scene.choix.forEach((c, index) => {
    const a = N.analyserChoix(c, env);
    if (!a.visible) return;
    choix.push({
      index, label: libelleChoix(c, exp, sc), disponible: a.disponible, raison: a.raison || null,
      chance: a.chance, acteur: a.acteur?.nom || null, test: a.test,
      cout: c.cout ? Object.entries(c.cout).map(([k, n]) => ({ id: k, nom: RES_LABELS[k] || k, n, manque: (S.res[k] || 0) < n })) : [],
      consomme: [].concat(c.consomme || []).map(id => ({ id, nom: itemDef(id)?.nom || id, embarque: (exp.equipment?.[id] || 0) > 0 })),
    });
  });
  return { id: sc.id, titre: sc.titre, texteHTML: N.rendreTexte(sc.scene.texte, envTexte(exp, sc)).html, chronique, progression, resultat, choix, combat: false };
}

// ---- Bilan d'expédition (contrat docs/V1.md) ----
// { lieu, systeme, duree (ticks), equipe: [noms], gains: { ressource: n }, objets: [noms],
//   schemas: [noms], blesses: [{ nom, statut }], morts: [noms], chronique, faits: [texte], final }
function construireBilan(exp, final = false) {
  const body = bodyOfExpedition(exp);
  const sys = S.galaxy?.systems?.find(s => s.id === exp.systemId);
  const membres = (exp.crewIds || []).map(id => S.crew.find(c => c.id === id)).filter(Boolean);
  const now = S.meta?.gameMin || 0;
  const duree = typeof exp.departAt === 'number'
    ? (now - exp.departAt) + (final ? 0 : (exp.phase === 'retour' ? Math.max(0, exp.oneWayMin - exp.elapsedMin) : exp.oneWayMin))
    : 2 * (exp.oneWayMin || 0);
  const gains = {};
  for (const [k, v] of Object.entries(exp.accumulatedLoot || {})) if (v > 0) gains[k] = v;
  const items = exp.accumulatedItems || [];
  const ch = exp.chronicleRef && CHRONICLES[exp.chronicleRef.id];
  return {
    expId: exp.id,
    lieu: body?.name || '?', systeme: sys?.name || '?', duree,
    equipe: membres.map(m => m.name),
    gains,
    objets: items.filter(id => !BLUEPRINTS[id]).map(id => itemDef(id)?.nom || id),
    schemas: items.filter(id => BLUEPRINTS[id]).map(id => BLUEPRINTS[id].nom),
    blesses: [...(exp.blesses || [])],
    morts: membres.filter(m => m.statut === 'mort').map(m => m.name),
    chronique: ch ? { id: ch.id, titre: ch.titre, episode: exp.chronicleRef.episodeIdx + 1, fin: body?.chronicle?.completed ? (ch.fins?.[body.chronicle.ending]?.titre || null) : null } : null,
    faits: [...(exp.faits || [])].slice(-12),
    final,
  };
}

// Bilan d'une expédition (en cours de retour ou rentrée : cherché dans l'historique)
export function expeditionSummary(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (exp) return exp.bilan || construireBilan(exp);
  return (S.expHistory || []).find(h => h.expId === expId)?.bilan || null;
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

  let dmgMin = Math.max(1, 1 + effCombat + weaponDmg);
  let dmgMax = Math.max(2, 3 + effCombat * 2 + weaponDmg);
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

// Initialise l'état de combat sur une expédition
function initCombat(exp, enemyTypeIds, lootOnWin, onDefeat) {
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
      const effectiveDmg = Math.max(1, rawDmg - effectiveArmor);
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
    const effectiveDmg = Math.max(1, rawDmg - effectiveArmor);
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

// Snapshot de l'état "important" avant rattrapage offline,
// pour pouvoir afficher un récap propre au joueur après.
function snapshotForCatchup() {
  return {
    res: { ...S.res },
    crewAlive: S.crew.filter(m => m.statut !== 'mort').length,
    crewDead: S.crew.filter(m => m.statut === 'mort').length,
    candidates: S.candidates.length,
    expActive: S.expeditions.length,
    expHistory: S.expHistory.length,
    journalLen: S.journal.length,
    buildDone: S.build ? S.build.doneMin : null,
    vesselBuildDone: S.vesselBuild ? S.vesselBuild.doneMin : null,
    trainingCount: S.training.length,
    treatmentCount: S.treatments.length,
    statusCount: S.crew.reduce((s,m) => s + (m.statuts?.length || 0), 0)
  };
}

// Compare deux snapshots et produit un résumé textuel des évolutions
function diffSnapshot(before, after) {
  const lines = [];
  // Ressources
  const resDelta = {};
  for (const k of RESOURCES) {
    const d = Math.round(after.res[k] - before.res[k]);
    if (Math.abs(d) >= 5) resDelta[k] = d;
  }
  if (Object.keys(resDelta).length > 0) {
    const resStr = Object.entries(resDelta)
      .map(([k,v]) => `${v >= 0 ? '+' : ''}${v} ${RES_LABELS[k]}`)
      .join(' · ');
    lines.push(`Ressources : ${resStr}`);
  }
  // Pertes
  if (after.crewDead > before.crewDead) {
    lines.push(`Pertes : ${after.crewDead - before.crewDead} membre(s) décédé(s)`);
  }
  // Candidats
  if (after.candidates > before.candidates) {
    lines.push(`Candidats reçus : ${after.candidates - before.candidates}`);
  }
  // Expéditions terminées
  if (after.expHistory > before.expHistory) {
    lines.push(`Expéditions terminées : ${after.expHistory - before.expHistory}`);
  }
  // Chantiers
  if (before.buildDone !== null && S.build === null) {
    lines.push(`Chantier de bâtiment achevé`);
  }
  if (before.vesselBuildDone !== null && S.vesselBuild === null) {
    lines.push(`Vaisseau livré du chantier`);
  }
  // Formations
  if (before.trainingCount > after.trainingCount) {
    lines.push(`Formations achevées : ${before.trainingCount - after.trainingCount}`);
  }
  // Soins
  if (before.treatmentCount > after.treatmentCount) {
    lines.push(`Traitements terminés : ${before.treatmentCount - after.treatmentCount}`);
  }
  // Statuts apparus
  if (after.statusCount > before.statusCount) {
    lines.push(`Nouveaux incidents médicaux : ${after.statusCount - before.statusCount}`);
  }
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

// Libellé d'une durée réelle
function realDurationLabel(hours, long = false) {
  if (hours < 1) return `${Math.round(hours * 60)} ${long ? 'minutes' : 'min'}`;
  if (hours < 24) return `${hours.toFixed(1)} ${long ? 'heures' : 'h'}`;
  return `${(hours / 24).toFixed(1)} jours`;
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
      finishCatchUp({ before, seqStart, elapsedHours, simulatedHours: done * MIN_PER_TICK / 60, capped });
    }
  });
  if (!started) progress?.close();
  return started;
}

function finishCatchUp({ before, seqStart, elapsedHours, simulatedHours, capped }) {
  const summary = diffSnapshot(before, snapshotForCatchup()).concat(autoResolvedLines(autoResolvedSince(seqStart)));
  syncPendingFlags();
  if (elapsedHours >= CATCHUP_REPORT_MIN_HOURS) {
    // Une seule entrée de journal pour résumer la période
    const cappedNote = capped ? ` (simulation plafonnée à ${OFFLINE_MAX_HOURS}h)` : '';
    log('neutral', esc(`Reprise du contact après ${realDurationLabel(elapsedHours)}${cappedNote}.${summary.length ? ' ' + summary.join(' · ') + '.' : ''}`));
  }
  save();
  try { render(); } catch (e) { reportTickError('render', e); }
  if (elapsedHours >= CATCHUP_REPORT_MIN_HOURS) {
    const report = { realElapsedHours: elapsedHours, simulatedHours, capped, summary };
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

// Modale "bon retour" qui résume ce qui s'est passé pendant l'absence
function showCatchupModal(report) {
  // En dessous de 5 minutes réelles, on ne montre rien (zéro friction)
  if (report.realElapsedHours < CATCHUP_REPORT_MIN_HOURS) return;

  const summaryHTML = report.summary.length > 0
    ? `<ul style="list-style:none;padding:0;margin:14px 0 0;">${
        report.summary.map(line =>
          `<li style="font-family:var(--mono);font-size:12px;color:var(--text-dim);padding:5px 0;border-bottom:1px dashed var(--border);">${esc(line)}</li>`
        ).join('')
      }</ul>`
    : '<p style="font-style:italic;color:var(--text-mute);margin-top:10px">L\'avant-poste a tenu sans encombre.</p>';

  const cappedHTML = report.capped
    ? `<p style="font-family:var(--mono);font-size:11px;color:var(--amber);margin-top:14px;letter-spacing:0.04em;">
         Note : simulation plafonnée à ${OFFLINE_MAX_HOURS}h pour préserver l'équilibre.
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
        L'avant-poste a continué de tourner pendant ton absence. Voici ce qu'il s'est passé :
      </span>
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
    autoAssignAllFreeMembers();
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
