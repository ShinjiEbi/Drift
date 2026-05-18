// DRIFT — script principal
// Extrait de drift.html lors de la phase de modularisation

import { MODULES, MODULE_JOBS, VESSELS, ITEMS, ITEM_TYPES, ITEM_ORIGINS, ITEM_NAME_TO_ID, BLUEPRINTS, TECH_TREE, TECH_BRANCHES, FABRICATIONS, SCENES, TREATMENTS, BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS, TRAITS } from './catalog.js';
import { VERSION, SAVE_KEY, TICK_MS, MIN_PER_TICK, AUTOSAVE_EVERY, BUILD_TIME_MULT, PROD_MULT, OFFLINE_MAX_HOURS, OFFLINE_INCIDENT_RATE, RESOURCES, RES_LABELS, START_RESOURCES, CAP, JOB_BASE_FRACTION, JOB_BIOMASSE_MULT, SKILL_LIST, SKILL_LABELS, STAT_LABELS, YEAR_IN_GAME_MIN, REL_LOVE, REL_FRIEND, REL_RIVAL, REL_RANCUNE } from './constants.js';
import { ARCS, FACTION_TYPES } from './data-arcs-factions.js';
import { CHRONICLES, CHRONICLE_SCENES } from './chronicles.js';
import { fmt, fmtMin, hashSeed, mulberry32, rngFor, rPick, rWeighted, rInt, $, $$ } from './util.js';
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

// Affecte un membre à un poste (gère désaffectation préalable)
export function assignMember(memberId, modKey, slotIdx) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok: false, reason: 'Colon introuvable' };
  if (member.statut === 'mort') return { ok: false, reason: 'Décédé' };
  if (member.statut === 'expedition') return { ok: false, reason: 'En expédition' };
  if (member.statut === 'formation') return { ok: false, reason: 'En formation' };
  if (member.statut === 'infirmerie') return { ok: false, reason: 'À l\'infirmerie' };

  const jobs = jobsForModule(modKey);
  const job = jobs[slotIdx];
  if (!job) return { ok: false, reason: 'Poste inexistant' };
  if (!isEligibleForJob(member, job)) return { ok: false, reason: 'Prérequis non remplis' };

  // Désaffecte le membre de son poste précédent (s'il en avait un)
  const prev = memberAssignment(memberId);
  if (prev) delete S.assignments[jobKey(prev.modKey, prev.slotIdx)];

  // Si un autre colon occupait ce poste, le désaffecter
  const occupant = memberAt(modKey, slotIdx);
  if (occupant) {
    occupant.statut = 'libre';
  }

  // Affecte
  S.assignments[jobKey(modKey, slotIdx)] = memberId;
  member.statut = 'travail';
  return { ok: true };
}

// Désaffecte un membre (le laisse libre)
export function unassignMember(memberId) {
  const a = memberAssignment(memberId);
  if (!a) return;
  delete S.assignments[jobKey(a.modKey, a.slotIdx)];
  const member = S.crew.find(m => m.id === memberId);
  if (member && member.statut === 'travail') member.statut = 'libre';
}

// Désaffecte un poste précis (utile si bâtiment supprimé/dégradé — pas encore d'usage)
export function unassignSlot(modKey, slotIdx) {
  const k = jobKey(modKey, slotIdx);
  const id = S.assignments[k];
  if (!id) return;
  delete S.assignments[k];
  const member = S.crew.find(m => m.id === id);
  if (member && member.statut === 'travail') member.statut = 'libre';
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
  if (!S.autoAssign) return;
  // Trie les colons libres par "force" décroissante (somme skills) pour donner
  // les meilleurs postes aux meilleurs colons
  const free = S.crew
    .filter(m => m.statut === 'libre')
    .map(m => ({ m, score: SKILL_LIST.reduce((s, k) => s + (m.skills[k] || 0), 0) }))
    .sort((a, b) => b.score - a.score);
  for (const { m } of free) autoAssignMember(m.id);
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

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const occ = S.assignments[jobKey(modKey, i)];
    const occMember = occ ? S.crew.find(m => m.id === occ) : null;
    // Un membre en infirmerie/expédition mais "officiellement affecté" ne compte pas
    const reallyOnPost = occMember && occMember.statut === 'travail';
    if (j.role === 'production') prodCount++;
    if (reallyOnPost) {
      filled++;
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
  // Production : mode automatisé à JOB_BASE_FRACTION, ou
  //   (prodFilled / prodCount) × 1.0 si tous les postes prod sont pourvus, +30% bonus chaque qualité
  let prodMult;
  if (prodCount === 0) {
    // pas de poste prod → fillFraction comme proxy
    prodMult = JOB_BASE_FRACTION + (1 - JOB_BASE_FRACTION) * fillFraction;
  } else {
    const prodRatio = prodFilled / prodCount;
    prodMult = JOB_BASE_FRACTION + (1 - JOB_BASE_FRACTION) * prodRatio;
    prodMult += qualityFilled * 0.20;   // chaque qualité = +20%
    prodMult += cmdFilled * 0.05;       // commandement bonus modeste
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

// Bonus global de la colonie : somme des cmd partout
export function globalCommandBonus() {
  let n = 0;
  for (const k in S.assignments) {
    const [modKey, idxStr] = k.split(':');
    const job = MODULE_JOBS[modKey]?.[parseInt(idxStr, 10)];
    if (!job || job.role !== 'commandement') continue;
    const m = S.crew.find(c => c.id === S.assignments[k]);
    if (m && m.statut === 'travail') n++;
  }
  return n;
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
const TRAINING_PROGRAMS = {
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
  const candidates = Object.keys(BLUEPRINTS).filter(id => {
    const bp = BLUEPRINTS[id];
    return originPool.includes(bp.origin);
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
    id: 'r_' + Date.now().toString(36),
    techId,
    startedAt: S.meta.gameMin,
    totalMin: r.cost.time * BUILD_TIME_MULT,
    doneMin: 0
  });
  log('neutral', `Recherche engagée : <em>${r.tech.nom}</em>. Durée : ${fmtMin(r.cost.time * BUILD_TIME_MULT)}.`);
  render();
}

export function cancelResearch(researchId) {
  if (!S.research) return;
  const idx = S.research.findIndex(r => r.id === researchId);
  if (idx < 0) return;
  const r = S.research[idx];
  const tech = TECH_TREE[r.techId];
  // Rembourse 50% des datacubes
  if (tech) {
    S.res.datacubes = Math.min(CAP.datacubes || Infinity, S.res.datacubes + Math.floor(tech.cost.datacubes * 0.5));
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
  // Mode automatisé sans Chercheur : 30% de la vitesse normale
  const autoMult = lb.activeProd ? 1.0 : JOB_BASE_FRACTION;
  
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

// Renvoie un objet agrégé de tous les effets actifs des techs complétées
export function techEffectsAccumulated() {
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
    id: 'f_' + Date.now().toString(36),
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
    for (const k in fab.cost) {
      S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + Math.floor(fab.cost[k] * 0.5));
    }
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
  // Mode automatisé sans Artisan : 30% de la vitesse
  const autoMult = bonuses.hasArtisan ? 1.0 : JOB_BASE_FRACTION;
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
  if (requires.ruines && body.ruines !== requires.ruines) return false;
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
  
  const candidates = [];
  for (const id in CHRONICLES) {
    const c = CHRONICLES[id];
    if (bodyMatchesChronicleReqs(body, c.requires)) {
      candidates.push(c);
    }
  }
  if (candidates.length === 0) return;
  
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
      if (v != null && ep.introByFlag[flagKey][v] != null) {
        return ep.introByFlag[flagKey][v];
      }
    }
  }
  return ep.defaultIntro || ep.intro || '';
}

// Vérifie qu'un req de scène est satisfait pour la chronique
function checkChronicleReq(req, body, exp) {
  if (!req) return true;
  if (req.flag) {
    const flags = body.chronicle?.flags || {};
    const v = flags[req.flag.key];
    if (req.flag.equals !== undefined && v !== req.flag.equals) return false;
    if (req.flag.min !== undefined && (v == null || v < req.flag.min)) return false;
    if (req.flag.max !== undefined && (v == null || v > req.flag.max)) return false;
  }
  return true;
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

// Récupère le texte d'une scène de chronique (peut être fonction)
export function resolveChronicleText(scene, body) {
  if (typeof scene.text === 'function') {
    return scene.text(body.chronicle?.flags || {});
  }
  return scene.text || '';
}

// Marque l'épisode courant comme terminé et passe au suivant
function endChronicleEpisode(body) {
  if (!body.chronicle) return;
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
  if (!body.chronicle) return;
  body.chronicle.completed = true;
  body.chronicle.ending = endingId;
  const c = CHRONICLES[body.chronicle.id];
  if (c) {
    const endingText = c.endings?.[endingId] || 'Fin de la chronique.';
    log('success', `<em>${c.nom}</em> — ${endingText}`);
    // 0.26 : notification dédiée
    notif.chronicleDone(c.nom);
  }
}

// Construit la séquence de scènes pour l'épisode courant d'une chronique.
// La séquence démarre par une scène-intro synthétique, puis pose la première
// scène de l'épisode. Les scènes suivantes seront résolues dynamiquement par
// le moteur d'expédition via les outcome.next.
function buildChronicleEpisodeScenes(body, episode) {
  const introText = chronicleEpisodeIntro(body);
  // Scène-intro synthétique (générée à la volée)
  const introScene = {
    id: '__chron_intro__',
    tags: ['__chronicle_intro__'],
    text: introText,
    choices: [
      { label: "Avancer", outcome: { log: '', next: episode.firstScene } }
    ]
  };
  // Marque la chronique pour qu'on sache la première scène à charger
  body.chronicle.currentSceneId = '__chron_intro__';
  // La séquence ne contient que l'intro — la suite est résolue dynamiquement
  return [introScene];
}


// ---- Sélection des scènes pour une expédition ----
// Détermine les tags actifs d'une planète et tire 5-10 scènes cohérentes
function selectExpeditionScenes(body, rng) {
  // 0.24 — D'abord, on tente d'attribuer une chronique si pas déjà fait
  tryAssignChronicle(body);
  
  // Si la planète a une chronique active avec un épisode à jouer,
  // on remplace la sélection normale par la séquence de l'épisode.
  const chronEp = currentChronicleEpisode(body);
  if (chronEp) {
    return buildChronicleEpisodeScenes(body, chronEp);
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
  const outros = SCENES.filter(s => s.tags.includes('outro') &&
    s.tags.every(t => t === 'outro' || tags.includes(t) || t === 'ruines'));

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
function fillTemplate(text, ctx) {
  return text
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
// onCured     : { sequelChance, sequels: [...] } — séquelles potentielles
// moralImpact : impact passif sur moral / jour
const STATUTS = {
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
const SEQUELS = {
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
function canTrain(memberId, skill) {
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
    id: 't_' + Date.now().toString(36),
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
  for (const k in s.cost) {
    const refund = Math.floor(s.cost[k] / 2);
    S.res[k] = Math.min(capOf(k), S.res[k] + refund);
  }
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
function infirmaryBeds() {
  return (S.modules.infirmerie?.level || 0) * 2;
}

// Lits actuellement occupés (= patients en cours de traitement OU en attente sur place)
function bedsInUse() {
  // un patient en infirmerie occupe un lit dès qu'il y est admis
  return S.crew.filter(m => m.statut === 'infirmerie').length;
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

// Inflige un statut à un membre. Si caché, pose "Anomalie suspecte" jusqu'au diagnostic.
export function inflictStatus(member, statutKey, source = '') {
  if (!member || member.statut === 'mort') return;
  const def = STATUTS[statutKey];
  if (!def) return;
  // Évite les doublons exacts
  if (member.statuts.some(s => s.key === statutKey)) return;
  // Survivant résiste 50% du temps
  if (member.traits.includes('survivant') && Math.random() < 0.5) {
    log('neutral', `<em>${member.name}</em> évite ${def.nom.toLowerCase()} grâce à son instinct.`);
    return;
  }
  const status = {
    key: statutKey,
    since: S.meta.gameMin,
    revealed: !def.hidden,        // visible direct si pas hidden
    revealAt: def.revealAfter ? S.meta.gameMin + def.revealAfter : null,
    diagnosed: !def.hidden,
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
  const noun = def.hidden ? "un état suspect" : `<em>${def.nom}</em>`;
  log('warn', `<em>${member.name}</em> présente ${noun}${source ? ' — ' + source : ''}.`);
}

// Le membre se présente à l'infirmerie (admission)
function admitToInfirmary(memberId) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return;
  if (member.statut === 'mort') return;
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

function dischargeMember(memberId) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return;
  // Annule traitements en cours
  S.treatments = S.treatments.filter(t => {
    if (t.memberId === memberId) {
      // rembourse 30%
      for (const k in t.cost) {
        S.res[k] = Math.min(capOf(k), S.res[k] + Math.floor(t.cost[k] * 0.3));
      }
      return false;
    }
    return true;
  });
  returnToBase(member);
  log('neutral', `<em>${member.name}</em> sort de l'infirmerie.`);
  render();
}

// Lance un diagnostic actif sur un statut caché
function startDiagnostic(memberId, statusIdx) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return;
  if (member.statut !== 'infirmerie') {
    toast("Le patient doit être admis avant.");
    return;
  }
  const status = member.statuts[statusIdx];
  if (!status || status.diagnosed) return;
  const def = STATUTS[status.key];
  // Conditions
  if (def.detect.needLab && !S.flags.recherche) {
    toast("Laboratoire requis pour ce diagnostic.");
    return;
  }
  const doctor = bestAvailableDoctor();
  if (!doctor) {
    toast("Aucun médecin disponible.");
    return;
  }
  // Coût simple : 2 datacubes pour usage labo, sinon 0
  const cost = def.detect.needLab ? { datacubes: 2 } : {};
  for (const k in cost) {
    if (S.res[k] < cost[k]) { toast(`Ressources insuffisantes (${RES_LABELS[k]})`); return; }
  }
  for (const k in cost) S.res[k] -= cost[k];
  doctor.statut = 'expedition';   // bloqué temporaire (réutilise le statut, géré dans render)
  doctor.statut = 'libre';        // simplification : diagnostic instantané narratif

  const success = rollDiagnostic(memberId, status.key, doctor);
  if (success) {
    status.diagnosed = true;
    status.revealed = true;
    log('success', `Diagnostic posé par <em>${doctor.name}</em> : <em>${member.name}</em> souffre de <em>${def.nom}</em>.`);
  } else {
    log('warn', `Diagnostic non concluant pour <em>${member.name}</em>. À retenter.`);
  }
  render();
}

// Vérifie qu'un traitement est lançable
function canTreat(memberId, statusIdx) {
  const member = S.crew.find(m => m.id === memberId);
  if (!member) return { ok:false, reason:"Patient introuvable" };
  if (member.statut !== 'infirmerie') return { ok:false, reason:"Patient non admis" };
  const status = member.statuts[statusIdx];
  if (!status) return { ok:false, reason:"Statut introuvable" };
  if (!status.diagnosed) return { ok:false, reason:"Diagnostic requis avant traitement" };
  // Déjà en cours ?
  if (S.treatments.some(t => t.memberId === memberId && t.statusIdx === statusIdx)) {
    return { ok:false, reason:"Traitement déjà en cours" };
  }
  const def = STATUTS[status.key];
  const infLvl = S.modules.infirmerie?.level || 0;
  if (infLvl < def.medLvlReq) {
    return { ok:false, reason:`Infirmerie niv ${def.medLvlReq} requise (actuelle : ${infLvl})` };
  }
  const tdef = TREATMENTS[status.key]?.[0];
  if (!tdef) return { ok:false, reason:"Aucun traitement disponible" };
  const doctor = bestAvailableDoctor();
  if ((doctor?.skills.medecine || 0) < tdef.requiresMedSkill) {
    return { ok:false, reason:`Médecin avec Médecine ≥ ${tdef.requiresMedSkill} requis` };
  }
  for (const k in tdef.cost) {
    if (S.res[k] < tdef.cost[k]) return { ok:false, reason:`Ressources insuffisantes (${RES_LABELS[k]})` };
  }
  return { ok:true, treatment:tdef, doctor, def };
}

function startTreatment(memberId, statusIdx) {
  const r = canTreat(memberId, statusIdx);
  if (!r.ok) { toast(r.reason); return; }
  const member = S.crew.find(m => m.id === memberId);
  // Débite ressources
  for (const k in r.treatment.cost) S.res[k] -= r.treatment.cost[k];
  // Modifie durée selon skill du médecin et trait Médecin né
  let duration = r.treatment.durationMin;
  const medSkill = r.doctor.skills.medecine || 0;
  duration *= Math.max(0.5, 1 - (medSkill - r.treatment.requiresMedSkill) * 0.1);
  if (r.doctor.traits.includes('medic_ne')) duration *= 0.75;
  // Bonus du staff de l'infirmerie (Spécialiste, Infirmier, etc.)
  const bonuses = infirmaryBonuses();
  duration *= bonuses.speedMult;
  if (bonuses.traitMedecinNe && !r.doctor.traits.includes('medic_ne')) duration *= 0.85;
  // Bonus de tech (pharmacopée)
  duration *= techEffectsAccumulated().treatmentSpeedMult;
  duration = Math.round(duration);
  S.treatments.push({
    id: 'tr_' + Date.now().toString(36),
    memberId,
    statusIdx,
    statutKey: member.statuts[statusIdx].key,
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
  if (!member) return;
  const status = member.statuts[treatment.statusIdx];
  if (!status) return;
  const def = STATUTS[status.key];
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
  member.statuts.splice(treatment.statusIdx, 1);
  // Retire les autres traitements pointant vers cet index ou réajuste
  // (par sécurité, on ré-indexe les traitements restants)
  for (const t of S.treatments) {
    if (t.memberId === member.id && t.statusIdx > treatment.statusIdx) {
      t.statusIdx--;
    }
  }
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
  // Libère le poste s'il en avait un
  unassignMember(member.id);
  member.statut = 'mort';
  member.diedAt = S.meta.gameMin;
  // Retire les traitements en cours
  S.treatments = S.treatments.filter(t => t.memberId !== member.id);
  // Retire les sessions de formation
  const tIdx = S.training.findIndex(t => t.memberId === member.id);
  if (tIdx >= 0) S.training.splice(tIdx, 1);
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
      log('warn', `<em>${member.name}</em> : <em>${STATUTS[s.key].nom}</em> apparente.`);
    }
  }
  // Auto-guérison & complications
  for (let i = member.statuts.length - 1; i >= 0; i--) {
    const s = member.statuts[i];
    const def = STATUTS[s.key];
    if (!def.untreated) continue;
    const elapsed = S.meta.gameMin - s.since;
    // En traitement actif → on ne déclenche pas la complication
    const inTreatment = S.treatments.some(t => t.memberId === member.id && t.statusIdx === i);
    if (inTreatment) continue;

    if (def.untreated.selfCure && elapsed >= def.untreated.afterMin) {
      member.statuts.splice(i, 1);
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
        inflictStatus(member, 'pathogene_alien', "éclosion parasitaire");
      }
    }
  }
  // Contagion : si statut contagieux non traité, propage à un autre membre proche
  for (const s of member.statuts) {
    const def = STATUTS[s.key];
    if (!def.contagion) continue;
    const inTreatment = S.treatments.some(t => t.memberId === member.id && t.statutKey === s.key);
    // Diviseur : si en quarantaine (en infirmerie + statut contagieux), contagion ÷ 4
    let rate = def.contagion.perDay;
    if (member.statut === 'infirmerie') rate /= 4;
    if (inTreatment) rate /= 2;
    // Bonus de tech (immunologie)
    rate *= techEffectsAccumulated().contagionMult;
    // Convertir taux/jour en taux/min
    const ratePerMin = rate / (24 * 60);
    if (Math.random() < ratePerMin * MIN_PER_TICK) {
      // Tire une victime parmi les autres membres sains
      const pool = S.crew.filter(m =>
        m.id !== member.id &&
        m.statut !== 'mort' &&
        !m.statuts.some(ss => ss.key === s.key)
      );
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
//   choices: [{ label, req?, consume?, outcome }]
//
// Outcome de choix :
//   loss: { metal: N, ... }      ressources perdues
//   status: 'blessure_legere'    inflige un statut à un colon
//   target: 'random' | 'staff'   cible (random parmi vivants, staff = du bâtiment)
//   moralAll: -N | +N            moral global
//   delayMin: N                  retard sur recherche/fabrication en cours du bâtiment
//   itemLoss: 'random'           perd un item de l'inventaire
//   log: string                   ligne narrative

const INCIDENTS = {
  // ===== MINE DE SURFACE =====
  mine_eboulement: {
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
    modKey: 'generateur_solaire',
    severity: 1,
    text: "Une voilure se met à dériver. Production en chute libre.",
    choices: [
      { label: "Réparation d'urgence", req: { skill: { key: 'ingenierie', min: 1 } },
        outcome: { loss: { energie: 20 }, log: "Réparation rapide. Production relancée." } },
      { label: "Remplacer la voilure", outcome: { loss: { metal: 15, cristal: 10, energie: 10 }, log: "Voilure neuve installée. Plus durable." } },
      { label: "Patcher avec un kit", consume: { item: 'kit_reparation' },
        outcome: { gain: { energie: 5 }, log: "Le kit fait des merveilles. Aucun temps perdu." } }
    ]
  },
  solaire_surcharge: {
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
    modKey: 'habitat',
    severity: 2,
    text: "La climatisation d'une partie de l'habitat tombe en panne. Les colons se plaignent.",
    choices: [
      { label: "Réparer immédiatement", req: { skill: { key: 'ingenierie', min: 1 } },
        outcome: { loss: { metal: 10, energie: 15 }, log: "Climatisation rétablie. L'équipage apprécie." } },
      { label: "Distribuer des rations supplémentaires", consume: { item: 'ration_concentree' },
        outcome: { moralAll: +1, log: "Geste apprécié. L'équipe tient le coup." } },
      { label: "Ignorer (attendre une réparation prévue)", outcome: { moralAll: -2, log: "L'équipage a chaud. Et ne se prive pas de le dire." } }
    ]
  },
  habitat_anniversaire: {
    modKey: 'habitat',
    severity: 1,
    positive: true,
    text: "C'est l'anniversaire d'un colon. L'équipage propose une petite célébration.",
    choices: [
      { label: "Organiser une fête", outcome: { loss: { biomasse: 20 }, moralAll: +3, log: "Soirée mémorable. Le moral grimpe." } },
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
  if (!S.crew || S.crew.length < 2) return;
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
    if (exp.crewIds.length < 2) continue;
    for (let i = 0; i < exp.crewIds.length; i++) {
      for (let j = i+1; j < exp.crewIds.length; j++) {
        adjustAffinity(exp.crewIds[i], exp.crewIds[j], 0.06 * MIN_PER_TICK);
      }
    }
  }
  // Soin : patient ↔ médecin staff
  for (const t of S.treatments || []) {
    const doc = bestAvailableDoctor();
    if (doc && doc.id !== t.memberId) {
      adjustAffinity(doc.id, t.memberId, 0.10 * MIN_PER_TICK);
    }
  }
  // Formation : élève ↔ instructeur
  for (const tr of S.training || []) {
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
        if (!m1 || !m2) continue;
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
        // Mort de cause naturelle
        memberDies(m, "vieillesse");
        log('warn', `<em>${m.name}</em> s'est éteint(e) paisiblement, à ${age} ans.`);
        // Trauma sur les amis proches
        triggerGriefOnFriends(m);
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
    if (m.id === memberId) continue;
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

// Tirage par tick : pour chaque bâtiment, tente un incident
export function tickIncidents(silent = false) {
  // 0.28 : déclencher d'abord les incidents en chaîne en attente (déclenchés par d'autres choix)
  if (Array.isArray(S.queuedIncidents) && S.queuedIncidents.length > 0) {
    const queued = S.queuedIncidents.shift();
    triggerIncident(queued, silent);
    return;
  }

  // Si on est en mode silent (rattrapage offline), on saute les incidents qui demandent une décision
  if (S.meta.gameMin < S.nextIncidentMin) return;

  // Cooldown global : pas d'incident trop rapproché
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

// Déclenche un incident (en silent : applique automatiquement le choix par défaut)
export function triggerIncident(incidentId, silent = false) {
  const inc = INCIDENTS[incidentId];
  if (!inc) return;
  const def = MODULES[inc.modKey];
  if (!def) return;

  // Trouve un colon "victime" — préfère le staff du bâtiment, sinon un libre, sinon n'importe qui vivant
  const staff = staffOf(inc.modKey).map(s => s.member);
  let victim = staff[Math.floor(Math.random() * staff.length)];
  if (!victim) {
    const free = aliveCrew().filter(m => m.statut === 'libre');
    victim = free[Math.floor(Math.random() * free.length)];
  }
  if (!victim) {
    victim = aliveCrew()[Math.floor(Math.random() * aliveCrew().length)];
  }
  if (!victim) return;

  // Si silent : applique le choix avec moins de pertes (le moins coûteux)
  if (silent) {
    // Choix le moins risqué : prend le premier non-risky avec moins de perte
    const safeChoice = inc.choices.find(c => !c.risky) || inc.choices[0];
    applyIncidentChoice(inc, safeChoice, victim);
    return;
  }

  // Affiche la modale d'incident
  showIncidentModal(incidentId, victim);
  // 0.26 : notification dédiée (critique, pour qu'on la voie même si on est ailleurs)
  notif.incident(inc.titre || incidentId);
}

// Applique l'outcome d'un choix d'incident
export function applyIncidentChoice(inc, choice, victim) {
  // Vérifications de prérequis (skill, item)
  if (choice.req) {
    if (choice.req.skill) {
      const team = staffOf(inc.modKey).map(s => s.member).concat(aliveCrew().filter(m => m.statut === 'libre'));
      const found = team.find(m => (m.skills[choice.req.skill.key] || 0) >= choice.req.skill.min);
      if (!found) { toast(`Personne ne remplit : ${SKILL_LABELS[choice.req.skill.key]} ≥ ${choice.req.skill.min}`); return false; }
    }
  }
  if (choice.consume?.item) {
    const itemId = choice.consume.item;
    if ((S.inventory?.[itemId] || 0) <= 0) {
      toast(`Stock insuffisant : ${ITEMS[itemId]?.nom || itemId}`);
      return false;
    }
    S.inventory[itemId]--;
    if (S.inventory[itemId] <= 0) delete S.inventory[itemId];
  }

  // Détermine outcome (gestion risky)
  let outcome = choice.outcome;
  if (choice.risky) {
    const team = staffOf(inc.modKey).map(s => s.member).concat(aliveCrew().filter(m => m.statut === 'libre'));
    const bestStat = team.length > 0 ? Math.max(...team.map(m => m.stats[choice.risky.stat] || 5)) : 5;
    const roll = 1 + Math.floor(Math.random() * 10);
    const total = roll + Math.floor((bestStat - 5) / 2);
    const success = total >= choice.risky.dc;
    outcome = success ? choice.risky.success : choice.risky.fail;
  }
  if (!outcome) return true;

  // 0.28 : multiplicateur d'impact pour rendre les choix mémorables (×3)
  const OUTCOME_MULT = 3;

  // Applique
  if (outcome.loss) {
    for (const k in outcome.loss) {
      S.res[k] = Math.max(0, (S.res[k] || 0) - outcome.loss[k] * OUTCOME_MULT);
    }
  }
  if (outcome.gain) {
    for (const k in outcome.gain) {
      S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + outcome.gain[k] * OUTCOME_MULT);
    }
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
    const mod = S.modules[inc.modKey];
    if (mod && mod.level > 1) {
      mod.level--;
      log('warn', `<em>${MODULES[inc.modKey].nom}</em> est endommagé : niveau ramené à ${mod.level}.`);
    } else if (mod && mod.level === 1) {
      log('warn', `<em>${MODULES[inc.modKey].nom}</em> a subi des dégâts mais reste fonctionnel au minimum.`);
    }
  }
  // — disableModule : module hors service pendant N minutes-jeu
  if (outcome.disableModule && inc.modKey) {
    const duration = outcome.disableModule;
    const mod = S.modules[inc.modKey];
    if (mod) {
      mod.disabledUntil = (S.meta.gameMin || 0) + duration;
      log('warn', `<em>${MODULES[inc.modKey].nom}</em> hors service pour ${Math.round(duration/60)}h jeu.`);
    }
  }
  // — debuff : pénalité globale temporaire (ex: { type: 'prodMult', value: 0.8, duration: 1440 })
  if (outcome.debuff) {
    if (!S.activeBuffs) S.activeBuffs = [];
    S.activeBuffs.push({
      ...outcome.debuff,
      sourceLabel: inc.text || 'Incident',
      startedAt: S.meta.gameMin,
      expiresAt: (S.meta.gameMin || 0) + (outcome.debuff.duration || 720)
    });
    log('warn', `Effet en cours : ${outcome.debuff.label || 'modulation temporaire'}.`);
  }
  // — generateRivalry : crée une rivalité durable entre la victime et un autre colon
  if (outcome.generateRivalry && victim) {
    const others = aliveCrew().filter(m => m.id !== victim.id);
    if (others.length > 0) {
      const other = others[Math.floor(Math.random() * others.length)];
      const key = [victim.id, other.id].sort().join('|');
      if (!S.relations) S.relations = {};
      S.relations[key] = Math.min(-30, (S.relations[key] || 0) - 25);
      log('warn', `<em>${victim.name}</em> et <em>${other.name}</em> se brouillent durablement.`);
    }
  }
  // — chainIncident : déclenche un autre incident plus tard
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

  if (outcome.log) {
    const cleanLog = outcome.log.replace(/\{worker\}/g, victim ? `<em>${victim.name}</em>` : 'un colon');
    log(inc.positive ? 'success' : 'warn', cleanLog);
  }
  return true;
}

// Modale d'incident interactive (UI)
let _activeIncident = null;
function showIncidentModal(incidentId, victim) {
  const inc = INCIDENTS[incidentId];
  if (!inc) return;
  _activeIncident = { incidentId, victimId: victim?.id };
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('incident-modal');
  m.innerHTML = renderIncidentContent();
  bg.classList.add('show');
  hookIncidentModal();
}

function renderIncidentContent() {
  const inc = INCIDENTS[_activeIncident.incidentId];
  const victim = S.crew.find(c => c.id === _activeIncident.victimId);
  const def = MODULES[inc.modKey];
  const text = inc.text.replace(/\{worker\}/g, victim ? victim.name : 'un colon');
  const severityLabel = ['', 'Mineur', 'Sérieux', 'Critique'][inc.severity || 1];
  const severityClass = ['', 'ok', 'warn', 'rust'][inc.severity || 1];

  // Liste des choix avec évaluation
  const choicesHTML = inc.choices.map((ch, i) => {
    let extras = [];
    let available = true;

    // Vérif req skill
    if (ch.req?.skill) {
      const team = staffOf(inc.modKey).map(s => s.member).concat(aliveCrew().filter(m => m.statut === 'libre'));
      const has = team.some(m => (m.skills[ch.req.skill.key] || 0) >= ch.req.skill.min);
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
    if (ch.risky) {
      extras.push(`<span class="risk">RISQUÉ · jet de ${STAT_LABELS[ch.risky.stat]} (DC ${ch.risky.dc})</span>`);
    }

    return `<button class="incident-choice" data-incident-choice="${i}" ${available ? '' : 'disabled'}>
      ${ch.label}
      ${extras.join('')}
    </button>`;
  }).join('');

  return `
    <div class="incident-eyebrow ${inc.positive ? 'positive' : ''}">
      ${inc.positive ? 'Événement' : 'Incident'} · <span class="${severityClass}">${severityLabel}</span> · ${def.nom}
    </div>
    <h3 class="incident-title">${inc.positive ? 'Bonne nouvelle' : 'Quelque chose s\'est passé'}</h3>
    <p class="incident-body">${text}</p>
    <div class="incident-choices">${choicesHTML}</div>
  `;
}

function hookIncidentModal() {
  const m = $('#modal');
  m.querySelectorAll('button[data-incident-choice]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.incidentChoice, 10);
      const inc = INCIDENTS[_activeIncident.incidentId];
      const victim = S.crew.find(c => c.id === _activeIncident.victimId);
      const choice = inc.choices[idx];
      const ok = applyIncidentChoice(inc, choice, victim);
      if (ok !== false) {
        $('#modalBg').classList.remove('show');
        m.classList.remove('incident-modal');
        _activeIncident = null;
        render();
      }
    });
  });
}

// Compatibilité : ancien rollColonyIncident remplacé par tickIncidents
export function rollColonyIncident() {
  tickIncidents(false);
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
//   choices: [...] comme les incidents

const COLONY_EVENTS = {
  // ===== ÉVÉNEMENTS SOCIAUX =====
  event_anniversaire: {
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
      { label: "Organiser une vraie fête", outcome: { loss: { biomasse: 25 }, moralAll: +4, log: "Soirée mémorable. {primary} sourit toute la nuit.", markBirthday: true } },
      { label: "Geste discret entre amis", outcome: { moralAll: +1, log: "Cadeau modeste, sincère. {primary} apprécie.", markBirthday: true } },
      { label: "Ne pas s'en occuper", outcome: { moralAll: -2, log: "Personne n'a rien dit. {primary} a remarqué.", markBirthday: true } }
    ]
  },

  event_hommage: {
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
    theme: 'Initiative',
    positive: true,
    condition: () => S.modules.hydroponie?.level >= 2 && aliveCrew().some(m => (m.skills.survie || 0) >= 2),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => (m.skills.survie || 0) >= 2);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} propose une nouvelle technique de culture. Elle nécessite un peu de temps.",
    choices: [
      { label: "Lui donner les moyens", outcome: { loss: { biomasse: 15 }, gain: { biomasse: 50, datacubes: 4 }, log: "{primary} double le rendement de la cuve d'essai." } },
      { label: "Plus tard", outcome: { moralAll: -1, log: "{primary} comprend. Mais l'élan est passé." } }
    ]
  },

  event_initiative_atelier: {
    theme: 'Initiative',
    positive: true,
    condition: () => S.modules.atelier?.level >= 2 && aliveCrew().some(m => (m.skills.ingenierie || 0) >= 3),
    pickActors: () => {
      const candidates = aliveCrew().filter(m => (m.skills.ingenierie || 0) >= 3);
      return { primary: candidates[Math.floor(Math.random() * candidates.length)] };
    },
    text: "{primary} a une idée pour optimiser l'atelier. Elle pense pouvoir doubler la précision de fabrication.",
    choices: [
      { label: "L'autoriser à expérimenter", outcome: { loss: { metal: 20, cristal: 10 }, gain: { datacubes: 12 }, log: "{primary} valide son hypothèse. Données techniques précieuses." } },
      { label: "Demander un mémo détaillé d'abord", req: { skill: { key: 'science', min: 2 } },
        outcome: { gain: { datacubes: 8 }, log: "{primary} produit un dossier rigoureux. La méthode est intégrée sans coût." } },
      { label: "Refuser, trop coûteux", outcome: { moralAll: -1, log: "{primary} se replie sur ses tâches. Un peu déçu." } }
    ]
  },

  // ===== PLAINTES & DEMANDES COLLECTIVES =====
  event_plainte_repas: {
    theme: 'Plainte',
    positive: false,
    condition: () => aliveCrew().length >= 4 && (S.res.biomasse || 0) < (capOf('biomasse') * 0.3),
    pickActors: () => ({ primary: aliveCrew()[Math.floor(Math.random() * aliveCrew().length)] }),
    text: "L'équipage se plaint des rations. Plusieurs colons mangent à peine. {primary} parle au nom des autres.",
    choices: [
      { label: "Augmenter les portions à court terme", outcome: { loss: { biomasse: 30 }, moralAll: +3, log: "L'équipage est apaisé. Les estomacs sont pleins ce soir." } },
      { label: "Distribuer une ration concentrée", consume: { item: 'ration_concentree' },
        outcome: { moralAll: +2, log: "La ration est partagée. Geste apprécié." } },
      { label: "Promettre une amélioration future", outcome: { moralAll: -2, log: "{primary} hoche la tête, peu convaincu." } },
      { label: "Refuser sèchement", outcome: { moralAll: -5, log: "Le silence retombe. La rancœur monte." } }
    ]
  },

  event_plainte_logement: {
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
    theme: 'Visiteur',
    positive: true,
    condition: () => (S.meta.gameMin - (S.lastMerchantMin || -99999)) > 21 * 24 * 60 && (S.res.metal || 0) > 100,
    pickActors: () => ({ primary: null }),
    text: "Un vaisseau marchand se pose pour quelques heures. Le pilote propose un échange unique.",
    choices: [
      { label: "Échanger 80 métal contre 30 datacubes", outcome: { loss: { metal: 80 }, gain: { datacubes: 30 }, log: "L'échange est conclu.", markMerchant: true } },
      { label: "Échanger 50 cristal contre 1 schéma humain", outcome: { loss: { cristal: 50 }, randomBlueprint: 'humain', log: "Un plan technique change de mains.", markMerchant: true } },
      { label: "Rien d'intéressant", outcome: { markMerchant: true, log: "Le marchand repart sans rien vendre." } }
    ]
  },

  // ===== DÉCOUVERTES & INSIGHTS =====
  event_insight_labo: {
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
  const eligible = Object.entries(COLONY_EVENTS).filter(([id, ev]) => {
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

  if (silent) {
    // Applique le premier choix (le plus simple)
    triggerColonyEvent(eventId, true);
  } else {
    triggerColonyEvent(eventId, false);
  }
}

let _activeColonyEvent = null;
function triggerColonyEvent(eventId, silent = false) {
  const ev = COLONY_EVENTS[eventId];
  if (!ev) return;
  let actors;
  try { actors = ev.pickActors(); } catch (e) { return; }
  if (!actors) return;

  if (silent) {
    // Choix le moins risqué : premier choix sans req
    const safe = ev.choices.find(c => !c.req && !c.consume) || ev.choices[0];
    applyColonyEventChoice(eventId, safe, actors);
    S.lastColonyEventId = eventId;
    return;
  }

  _activeColonyEvent = { eventId, actors };
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('incident-modal');  // Réutilise le style
  m.innerHTML = renderColonyEventContent();
  bg.classList.add('show');
  hookColonyEventModal();
  // 0.26.1 : notification dédiée (warn — événement en attente de décision)
  notif.colonyEvent(ev.titre || eventId);
}

function renderColonyEventContent() {
  const { eventId, actors } = _activeColonyEvent;
  const ev = COLONY_EVENTS[eventId];
  const primaryName = actors.primary?.name || '';
  const secondaryName = actors.secondary?.name || '';
  const age = actors.primary ? currentAge(actors.primary) : '';
  const text = ev.text
    .replace(/\{primary\}/g, primaryName ? `<em>${primaryName}</em>` : 'un colon')
    .replace(/\{secondary\}/g, secondaryName ? `<em>${secondaryName}</em>` : '')
    .replace(/\{age\}/g, age);

  const choicesHTML = ev.choices.map((ch, i) => {
    let extras = [];
    let available = true;
    if (ch.req?.skill) {
      const team = aliveCrew();
      const has = team.some(m => (m.skills[ch.req.skill.key] || 0) >= ch.req.skill.min);
      extras.push(`<span class="req ${has ? '' : 'locked'}">REQUIERT : ${SKILL_LABELS[ch.req.skill.key]} ≥ ${ch.req.skill.min}</span>`);
      if (!has) available = false;
    }
    if (ch.consume?.item) {
      const itDef = ITEMS[ch.consume.item];
      const has = (S.inventory?.[ch.consume.item] || 0) > 0;
      extras.push(`<span class="cost ${has ? '' : 'ko'}" style="${has ? 'color:#b09bd0' : ''}">CONSOMME : ${itDef?.nom || ch.consume.item}</span>`);
      if (!has) available = false;
    }
    return `<button class="incident-choice" data-event-choice="${i}" ${available ? '' : 'disabled'}>
      ${ch.label.replace(/\{primary\}/g, primaryName)}
      ${extras.join('')}
    </button>`;
  }).join('');

  const themeColor = ev.positive ? 'var(--moss)' : 'var(--amber)';
  return `
    <div class="incident-eyebrow ${ev.positive ? 'positive' : ''}">
      Événement · <span style="color:${themeColor}">${ev.theme}</span>
    </div>
    <h3 class="incident-title">${ev.positive ? 'Une bonne nouvelle' : 'Quelque chose se passe'}</h3>
    <p class="incident-body">${text}</p>
    <div class="incident-choices">${choicesHTML}</div>
  `;
}

function hookColonyEventModal() {
  const m = $('#modal');
  m.querySelectorAll('button[data-event-choice]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.eventChoice, 10);
      const { eventId, actors } = _activeColonyEvent;
      const ev = COLONY_EVENTS[eventId];
      const choice = ev.choices[idx];
      const ok = applyColonyEventChoice(eventId, choice, actors);
      if (ok !== false) {
        S.lastColonyEventId = eventId;
        $('#modalBg').classList.remove('show');
        m.classList.remove('incident-modal');
        _activeColonyEvent = null;
        render();
      }
    });
  });
}

export function applyColonyEventChoice(eventId, choice, actors) {
  const ev = COLONY_EVENTS[eventId];
  const primary = actors.primary;
  const secondary = actors.secondary;
  const primaryName = primary?.name || 'un colon';
  const secondaryName = secondary?.name || '';

  // Consume item
  if (choice.consume?.item) {
    if (!S.inventory?.[choice.consume.item]) {
      toast(`Stock insuffisant : ${ITEMS[choice.consume.item]?.nom}`);
      return false;
    }
    S.inventory[choice.consume.item]--;
    if (S.inventory[choice.consume.item] <= 0) delete S.inventory[choice.consume.item];
  }

  const o = choice.outcome || {};
  
  // 0.28 : multiplicateur d'impact
  const OUTCOME_MULT = 3;

  // Pertes / gains de ressources
  if (o.loss) {
    for (const k in o.loss) S.res[k] = Math.max(0, (S.res[k] || 0) - o.loss[k] * OUTCOME_MULT);
  }
  if (o.gain) {
    for (const k in o.gain) S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + o.gain[k] * OUTCOME_MULT);
  }
  // Moral collectif — 0.28 : impact durable (×3)
  if (o.moralAll) {
    for (const m of aliveCrew()) {
      m.moral = Math.max(0, Math.min(100, m.moral + o.moralAll * 3));
    }
  }
  // Ajustement d'affinité ciblé
  if (o.adjustAffinity) {
    const a = o.adjustAffinity.a === 'primary' ? primary?.id : (o.adjustAffinity.a === 'secondary' ? secondary?.id : null);
    const b = o.adjustAffinity.b === 'primary' ? primary?.id : (o.adjustAffinity.b === 'secondary' ? secondary?.id : null);
    if (a && b) adjustAffinity(a, b, o.adjustAffinity.delta);
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
        id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36),
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
    }
  }
  // Schéma aléatoire
  if (o.randomBlueprint) {
    const bpId = rollBlueprint([o.randomBlueprint]);
    if (bpId) addBlueprintToInventory(bpId, 'événement');
  }

  // 0.28 : NOUVEAUX EFFETS DURABLES (mêmes que pour les incidents)
  // — debuff : pénalité globale temporaire
  if (o.debuff) {
    if (!S.activeBuffs) S.activeBuffs = [];
    S.activeBuffs.push({
      ...o.debuff,
      sourceLabel: ev.titre || ev.id || 'Événement',
      startedAt: S.meta.gameMin,
      expiresAt: (S.meta.gameMin || 0) + (o.debuff.duration || 720)
    });
    log('warn', `Effet en cours : ${o.debuff.label || 'modulation temporaire'}.`);
  }
  // — generateRivalry entre primary et secondary
  if (o.generateRivalry && primary && secondary) {
    const key = [primary.id, secondary.id].sort().join('|');
    if (!S.relations) S.relations = {};
    S.relations[key] = Math.min(-30, (S.relations[key] || 0) - 25);
    log('warn', `<em>${primary.name}</em> et <em>${secondary.name}</em> se brouillent durablement.`);
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

  // Log final
  if (o.log) {
    const cleanLog = o.log
      .replace(/\{primary\}/g, primary ? `<em>${primary.name}</em>` : 'un colon')
      .replace(/\{secondary\}/g, secondary ? `<em>${secondary.name}</em>` : '');
    log(ev.positive ? 'success' : 'warn', cleanLog);
  }
  return true;
}

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

    // Progression des étapes (dans l'ordre)
    for (const step of arc.steps) {
      if (isStepComplete(arcId, step.id)) continue;
      try {
        if (step.condition()) {
          state.completedSteps.push(step.id);
          log('success', `<em>${arc.nom} :</em> ${step.title}.`);
        }
      } catch (e) {}
      // On n'arrête pas la boucle, plusieurs étapes peuvent se compléter en même temps si conditions remplies
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
    // Marque la tech comme "débloquée par chronique" (devient visible/disponible)
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


// Statut diplomatique selon réputation
export function factionStatus(rep) {
  if (rep >= 60) return { key: 'allie',    label: 'Allié',    color: 'var(--moss)' };
  if (rep >= 25) return { key: 'cordial',  label: 'Cordial',  color: 'var(--amber)' };
  if (rep > -25) return { key: 'neutre',   label: 'Neutre',   color: 'var(--text-mute)' };
  if (rep > -60) return { key: 'mefiant',  label: 'Méfiant',  color: 'var(--rust)' };
  return { key: 'hostile', label: 'Hostile', color: 'var(--rust)' };
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
  const id = 'fac_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 9999).toString(36);
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
    const ft = FACTION_TYPES[f.type];
    log(delta > 0 ? 'success' : 'warn',
      `<em>${f.name}</em> est désormais <b>${factionStatus(f.reputation).label}</b>.`);
    // 0.26.1 : notification dédiée
    notif.reputationSeuil(f.name, factionStatus(f.reputation).label.toLowerCase());
  }
}

// Détermine si une faction proposera une caravane à ce tick
export function tickFactions() {
  if (!S.factions) return;
  for (const id in S.factions) {
    const f = S.factions[id];
    if (f.reputation < 40) continue;       // Pas de commerce sous 40
    if (!f.tradeActive) continue;          // Le joueur a activé le commerce
    const cycle = 15 * 24 * 60;            // 15 jours jeu
    if (!f.lastCaravan) f.lastCaravan = f.metAt;
    if (S.meta.gameMin - f.lastCaravan < cycle) continue;
    // Caravane !
    triggerCaravan(f);
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
  if (f.reputation < 40 && !f.tradeActive) {
    toast("Réputation trop faible (40+ requis).");
    return;
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
  if ((m.skills.linguistique || 0) < 3) {
    toast("Linguistique 3+ requise.");
    return;
  }
  if (m.statut !== 'libre') {
    toast(`${m.name} n'est pas disponible.`);
    return;
  }
  // 0.29 — Limite de missions parallèles selon niveau d'Ambassade
  // niv 0 : 1 mission (legacy fallback) ; niv N : N missions //
  const ambassadeLvl = S.modules?.ambassade?.level || 0;
  const maxParallel = Math.max(1, ambassadeLvl);
  const active = (S.diplomaticMissions || []).length;
  if (active >= maxParallel) {
    if (ambassadeLvl === 0) {
      toast("Mission en cours. Construis l'Ambassade pour en gérer plusieurs en parallèle.");
    } else {
      toast(`Limite atteinte : ${maxParallel} mission(s) // (Ambassade niv ${ambassadeLvl}).`);
    }
    return;
  }
  // Coût provisions
  const cost = 25;
  if ((S.res.biomasse || 0) < cost) {
    toast(`Provisions insuffisantes (${cost} biomasse).`);
    return;
  }
  S.res.biomasse -= cost;
  // 0.22 — Le poste reste réservé pendant la mission, le colon le reprendra au retour.
  m.statut = 'diplomatie';
  // Crée la mission
  if (!S.diplomaticMissions) S.diplomaticMissions = [];
  const duration = 24 * 60 + Math.floor(Math.random() * 24 * 60);  // 24-48h jeu
  S.diplomaticMissions.push({
    id: 'dipl_' + Date.now().toString(36),
    factionId,
    memberId,
    startedAt: S.meta.gameMin,
    duration
  });
  log('neutral', `<em>${m.name}</em> est parti(e) en mission diplomatique vers <em>${f.name}</em>. Retour dans ${fmtMin(duration)}.`);
  render();
}

// Tick : avance les missions diplomatiques
export function tickDiplomaticMissions() {
  if (!S.diplomaticMissions || S.diplomaticMissions.length === 0) return;
  const finished = [];
  for (const mis of S.diplomaticMissions) {
    if (S.meta.gameMin - mis.startedAt >= mis.duration) finished.push(mis);
  }
  for (const mis of finished) {
    completeDiplomaticMission(mis);
  }
}

function completeDiplomaticMission(mis) {
  const member = S.crew.find(c => c.id === mis.memberId);
  const faction = S.factions?.[mis.factionId];
  // Retire la mission
  S.diplomaticMissions = S.diplomaticMissions.filter(m => m.id !== mis.id);
  if (!member) return;
  // Libère le colon (0.22 — reprend son poste s'il en a un)
  if (member.statut === 'diplomatie') returnToBase(member);
  if (!faction) return;
  // Jet : succès basé sur Linguistique + Charisme
  const skill = (member.skills.linguistique || 0);
  const stat = (member.stats.charisme || 5);
  const roll = 1 + Math.floor(Math.random() * 10);
  const total = roll + skill + Math.floor((stat - 5) / 2);
  const dc = 8;
  
  // 0.29 — calcul du bonus diplomatique cumulé
  let diploMult = 1.0;
  // Bonus Ambassade : +10% par niveau au-dessus du 1er
  const ambassadeLvl = S.modules?.ambassade?.level || 0;
  if (ambassadeLvl >= 2) diploMult += (ambassadeLvl - 1) * 0.10;
  // Bonus techs diplomatiques
  const tech = techEffectsAccumulated();
  if (tech.diplomaticBonus) diploMult *= tech.diplomaticBonus;
  // Bonus Émissaire : ×1.5 si la mission a été lancée avec ce vaisseau
  if (mis.vesselType === 'emissaire') diploMult *= 1.5;
  
  if (total >= dc) {
    // Succès : +20 à +30 réputation, modulé par diploMult
    const baseGain = 20 + Math.floor(Math.random() * 11);
    const gain = Math.round(baseGain * diploMult);
    adjustReputation(faction.id, gain);
    const bonusLabel = diploMult > 1.05 ? ` (×${diploMult.toFixed(2)})` : '';
    log('success', `<em>${member.name}</em> revient de mission diplomatique. <em>${faction.name}</em> : réputation +${gain}${bonusLabel}.`);
    // Bonus : petit moral pour le colon
    member.moral = Math.min(100, member.moral + 5);
  } else {
    // Échec mineur : pas de gain, parfois -5 réputation
    const malus = roll <= 3 ? -10 : 0;
    if (malus !== 0) adjustReputation(faction.id, malus);
    log('warn', `<em>${member.name}</em> revient de mission diplomatique. ${malus !== 0 ? `Malentendu culturel : ${malus} de réputation.` : 'Aucun progrès notable.'}`);
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
    cuirasse: ['Sentinelle','Hégémon','Lance','Meute','Chambellan']
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
    id: 'v_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36),
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

  // Tous les membres doivent être libres et vivants
  for (const id of crewIds) {
    const m = S.crew.find(c => c.id === id);
    if (!m) return { ok:false, why:'Membre introuvable' };
    if (m.statut !== 'libre') return { ok:false, why:`${m.name} : ${m.statut}` };
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
    id: 'e_' + Date.now().toString(36),
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
  S.expeditions.push(exp);
  const equipNote = equipUnits > 0 ? ` · ${equipUnits} équipement(s) embarqué(s)` : '';
  log('neutral', `Décollage : <em>${r.vessel.name}</em> en route vers <em>${r.body.name}</em>. Voyage : ${fmtMin(r.oneWayMin)}${equipNote}.`);
  render();
}

// Avance toutes les expéditions d'un tick
export function tickExpeditions() {
  if (S.expeditions.length === 0) return;
  const completed = [];
  for (const exp of S.expeditions) {
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
  sys.explored = true;
  log('neutral', `<em>${vesselNameOf(exp)}</em> arrive sur <em>${body.name}</em>. Exploration en cours.`);
  // Active la première scène
  exp.sceneIdx = 0;
  exp.awaitingChoice = true;
}

// Départ après scènes : finit la mission et programme le retour
function startReturn(exp) {
  exp.phase = 'retour';
  exp.elapsedMin = 0;
  exp.awaitingChoice = false;
  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  const body = sys?.bodies.find(b => b.id === exp.bodyId);
  if (body) body.looted = true;
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
    for (const recruit of exp.pendingChronicleRecruits) {
      const def = recruit.characterDef;
      // Construit un colon spécial à partir du characterDef
      const member = {
        id: 'chronchar_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36),
        name: def.name,
        age: def.age,
        origine: 'humaine',
        sante: 80,
        moral: 60,
        loyaute: 55,
        statut: 'libre',
        statuts: [],
        traits: ['chronique_' + recruit.characterId], // marqueur unique
        stats: { vigueur: 4, dexterite: 4, intellect: 6, sangfroid: 6, charisme: 5 },
        skills: { combat: 1, science: def.role === 'Biologiste' ? 3 : 1, ingenierie: def.role === 'Mécanicien' ? 3 : 1, medecine: 1, pilotage: 1, linguistique: 2, survie: 2 },
        birthGameMin: S.meta.gameMin - (def.age * YEAR_IN_GAME_MIN),
        chronicleOrigin: recruit.chronicleId
      };
      S.crew.push(member);
      log('success', `<em>${member.name}</em> rejoint l'avant-poste.`);
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
  // 0.24 — Support des scènes de chronique : exp.chronicleSceneId peut
  // pointer vers une scène spécifique (résolue dynamiquement par next)
  if (exp.chronicleSceneId) {
    const cs = CHRONICLE_SCENES.find(s => s.id === exp.chronicleSceneId);
    if (cs) return cs;
  }
  if (exp.sceneIdx < 0 || exp.sceneIdx >= exp.scenes.length) return null;
  const sceneId = exp.scenes[exp.sceneIdx];
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
  if (scene.id === '__chron_intro__') return true;
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
      if (S.res[k] < choice.consume[k]) {
        return { available: false, reason: `Manque ${RES_LABELS[k]} (${choice.consume[k]})` };
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
  if (choice.risky) {
    // Jet : 1d10 + meilleur stat dans l'équipe ≥ dc
    const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
    const bestStat = Math.max(...team.map(m => m.stats[choice.risky.stat] || 5));
    const rng = rngFor(`${exp.seed}|sc${exp.sceneIdx}|${choiceIdx}|${S.meta.gameMin}`);
    const roll = 1 + Math.floor(rng() * 10);
    const total = roll + Math.floor((bestStat - 5) / 2);
    const success = total >= choice.risky.dc;
    outcome = success ? choice.risky.success : choice.risky.fail;
    exp.accumulatedLog.push(`Jet ${STAT_LABELS[choice.risky.stat]} : ${roll}+${Math.floor((bestStat-5)/2)} = ${total} vs ${choice.risky.dc} → ${success ? 'réussi' : 'échec'}`);
  }

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
      const amount = Math.floor(outcome.loot[k] * alienMult);
      exp.accumulatedLoot[k] = (exp.accumulatedLoot[k] || 0) + amount;
    }
    // Sur ruines alien, une fraction des datacubes obtenus est aussi crédité en datacubes_alien
    if (isAlienRuins && outcome.loot.datacubes) {
      const alienShare = Math.ceil(outcome.loot.datacubes * alienMult * 0.4);
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
  // Item
  if (outcome.item) {
    exp.accumulatedItems.push(outcome.item);
  }
  // Blueprint : tire un schéma de l'origine demandée et l'ajoute aux items + bibliothèque
  if (outcome.blueprint) {
    const rng = rngFor(`${exp.seed}|sc${exp.sceneIdx}|${choiceIdx}|bp`);
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
    if (faction) {
      adjustReputation(faction.id, outcome.reputation);
      exp.accumulatedLog.push(`${faction.name} : réputation ${outcome.reputation > 0 ? '+' : ''}${outcome.reputation}.`);
    }
  }
  // Log
  if (outcome.log) {
    exp.accumulatedLog.push(outcome.log);
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
        endChronicleEpisode(body);
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
    // L'outcome ne contenait pas de next : on considère que l'épisode est fini.
    exp.awaitingChoice = true;
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

// Abandon manuel : le joueur peut décider de retraiter à tout moment
export function abandonExpedition(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp) return;
  if (exp.phase !== 'sur_place') {
    toast("Possible uniquement sur place.");
    return;
  }
  exp.accumulatedLog.push("Retraite décidée par le commandement.");
  startReturn(exp);
  render();
}

// Résolution procédurale d'une expédition : phase 2b simule sans scènes.
// Génère récompenses (ressources + items éventuels), blessures, casualties.
// La phase 2c remplacera ça par des scènes interactives.
function resolveExpedition(exp, body, sys) {
  const rng = rngFor(`${S.meta.seed}|exp${exp.id}`);
  const def = VESSELS[S.fleet.find(v => v.id === exp.vesselId)?.type] || VESSELS.vedette;
  const threat = bodyThreatLevel(body);
  const reward = bodyRewardLevel(body);

  // --- Récompenses de base ---
  const rewards = {};
  // Ressources brutes selon biome
  if (body.biome === 'asteroide' || body.type === 'asteroide_g') {
    rewards.metal = Math.round((40 + rng() * 60) * (1 + reward * 0.3));
    rewards.cristal = Math.round((20 + rng() * 30) * (1 + reward * 0.3));
  } else if (body.biome === 'volcanique' || body.biome === 'irradie') {
    rewards.metal = Math.round((20 + rng() * 50) * (1 + reward * 0.2));
    rewards.cristal = Math.round((30 + rng() * 60) * (1 + reward * 0.3));
  } else if (body.biome === 'glace' || body.biome === 'toundra') {
    rewards.cristal = Math.round((30 + rng() * 50) * (1 + reward * 0.2));
    rewards.biomasse = Math.round((10 + rng() * 30));
  } else {
    rewards.metal = Math.round(20 + rng() * 40);
    rewards.cristal = Math.round(15 + rng() * 30);
  }
  if (['microbienne','flore_agressive','faune'].includes(body.vie)) {
    rewards.biomasse = (rewards.biomasse || 0) + Math.round(20 + rng() * 50);
  }
  // Datacubes selon ruines / signaux
  let dc = 0;
  if (body.ruines !== 'aucune') dc += Math.round(5 + rng() * 15);
  if (['alien_a','alien_b','fusion'].includes(body.ruines)) dc += Math.round(10 + rng() * 20);
  if (body.signal !== 'aucun') dc += Math.round(2 + rng() * 8);
  if (['echo_temporel','bruit_blanc','crypte'].includes(body.signal)) dc += Math.round(5 + rng() * 15);
  if (dc > 0) rewards.datacubes = dc;

  // Cap par cargo
  const cargoCap = def.cargo;
  let totalLoot = Object.values(rewards).reduce((s,v) => s+v, 0);
  if (totalLoot > cargoCap) {
    const ratio = cargoCap / totalLoot;
    for (const k in rewards) rewards[k] = Math.floor(rewards[k] * ratio);
  }

  // --- Casualties / statuts ---
  const statuses = [];
  const casualties = [];
  // Calcul d'un score de "résistance" de l'équipe contre la menace
  const team = exp.crewIds.map(id => S.crew.find(c => c.id === id)).filter(Boolean);
  const teamCombat = team.reduce((s,m) => s + (m.skills.combat || 0), 0);
  const teamSurvie = team.reduce((s,m) => s + (m.skills.survie || 0), 0);
  const teamMed    = team.reduce((s,m) => s + (m.skills.medecine || 0), 0);
  const teamScore  = teamCombat + teamSurvie + teamMed * 0.5 + team.length * 1.5;

  // Probabilité d'incident proportionnelle à threat / teamScore
  const incidentProb = Math.min(0.95, (threat * 0.18) / Math.max(1, teamScore / 5));

  for (const member of team) {
    if (rng() < incidentProb) {
      // Choix du type d'incident selon danger principal
      let pool;
      if (body.danger === 'predateurs')      pool = ['blessure_legere','blessure_legere','blessure_grave'];
      else if (body.danger === 'pathogene')  pool = ['infection','infection','pathogene_alien'];
      else if (body.danger === 'tempetes')   pool = ['blessure_legere','blessure_grave'];
      else if (body.danger === 'faille')     pool = ['blessure_grave','trauma_psy'];
      else if (body.danger === 'ia_hostile') pool = ['blessure_grave','blessure_grave','trauma_psy'];
      else if (body.danger === 'anomalie')   pool = ['trauma_psy','pathogene_alien','mutation'];
      else                                   pool = ['blessure_legere'];
      const k = pool[Math.floor(rng() * pool.length)];
      // Combattant aguerri / Survivant : 50% de réduction de gravité
      const lucky = member.traits.includes('combattant_aguerri') || member.traits.includes('survivant');
      const finalKey = (lucky && k === 'blessure_grave') ? 'blessure_legere' : k;
      // Mort directe rare : seulement si threat 5 et incident très mauvais
      if (threat >= 4 && rng() < 0.06 && !lucky) {
        casualties.push(member.id);
        memberDies(member, `Disparu(e) en mission sur ${body.name}.`);
      } else {
        statuses.push({ memberId: member.id, statutKey: finalKey });
      }
    }
  }

  // --- Items ---
  const items = [];
  if (body.ruines !== 'aucune' && rng() < 0.25 + reward * 0.05) {
    const itemNames = ['fragment_cristallin','disque_memoire','outil_etrange','plaque_gravee','lentille_noire','bobine_filaments','anneau_scelle'];
    items.push(itemNames[Math.floor(rng() * itemNames.length)]);
  }

  // --- Outcome global ---
  const survivorCount = team.length - casualties.length;
  let outcomeKind = 'success';
  if (casualties.length > 0) outcomeKind = 'warn';
  else if (statuses.length === 0 && Object.keys(rewards).length > 0) outcomeKind = 'success';

  // Résumé narratif
  const lootSummary = Object.entries(rewards).map(([k,v]) => `${v} ${RES_LABELS[k]}`).join(', ');
  const summary = casualties.length > 0
    ? `Pertes : ${casualties.length}. Récupéré : ${lootSummary || 'rien'}.`
    : statuses.length > 0
      ? `${statuses.length} blessé(s). Récupéré : ${lootSummary || 'rien'}.`
      : `Aucun incident. Récupéré : ${lootSummary || 'rien'}.`;

  const returnSummary = items.length > 0
    ? `Cargaison : ${lootSummary || 'rien'}${items.length > 0 ? ` + items : ${items.join(', ')}` : ''}.`
    : `Cargaison : ${lootSummary || 'rien'}.`;

  return {
    rewards, items, statuses, casualties,
    outcomeKind, summary, returnSummary
  };
}

// ============================================================
// 8. UI — rendu DOM
// ============================================================


function setupHandlers() {
  // 0.26 : installer les handlers du panneau de notifications
  try { setupNotifHandlers(); } catch (e) { console.warn('[BOOT] setupNotifHandlers:', e); }

  $('#btnRename').addEventListener('click', () => {
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
  $('#btnReset').addEventListener('click', resetGame);

  // Bouton "Lancer une formation" (onglet Équipage > Formation)
  $('#btnNewTraining').addEventListener('click', showTrainingModal);

  // Pause auto si onglet caché : on accélère pas, mais on évite la dérive
  // (en phase 0 on garde simple, le timer tourne quoi qu'il arrive)
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

// Rattrapage du temps écoulé hors-ligne
// Renvoie { simulatedMin, realElapsedHours, capped, summary } pour affichage
function catchUpOffline() {
  const lastReal = S.meta.lastTickRealMs || S.meta.lastSave || Date.now();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastReal);

  // En dessous de 10 secondes, rien à faire (la page vient d'être ouverte/refresh)
  if (elapsedMs < 10000) {
    S.meta.lastTickRealMs = now;
    return null;
  }

  const elapsedMin = elapsedMs / 60000;          // minutes réelles
  const elapsedHours = elapsedMin / 60;
  // Dans le jeu, 1 seconde réelle = 1 minute jeu, donc N min réelles → N×60 min jeu.
  // Mais pour limiter l'inflation, on cap à OFFLINE_MAX_HOURS heures réelles.
  const capped = elapsedHours > OFFLINE_MAX_HOURS;
  const cappedHours = Math.min(elapsedHours, OFFLINE_MAX_HOURS);
  // Conversion : 1s réelle → 1 min jeu, donc cappedHours réelles → cappedHours*3600 min jeu
  const ticksToSim = Math.floor(cappedHours * 3600 / MIN_PER_TICK);

  if (ticksToSim < 1) {
    S.meta.lastTickRealMs = now;
    return null;
  }

  const before = snapshotForCatchup();

  // Simule en silencieux. On laisse tourner mais sans render.
  for (let i = 0; i < ticksToSim; i++) {
    tickOnce({ silent: true });
  }
  S.meta.lastTickRealMs = now;

  const after = snapshotForCatchup();
  const summary = diffSnapshot(before, after);

  // Une seule entrée de journal pour résumer la période
  const realLabel = elapsedHours < 1
    ? `${Math.round(elapsedMin)} min`
    : elapsedHours < 24
      ? `${elapsedHours.toFixed(1)} h`
      : `${(elapsedHours / 24).toFixed(1)} jours`;
  const cappedNote = capped ? ` (simulation plafonnée à ${OFFLINE_MAX_HOURS}h)` : '';
  log('neutral', `Reprise du contact après ${realLabel}${cappedNote}.${summary.length ? ' ' + summary.join(' · ') + '.' : ''}`);

  return {
    realElapsedHours: elapsedHours,
    simulatedHours: cappedHours,
    capped,
    summary
  };
}

function boot() {
  // Chaque étape critique est protégée par try/catch.
  // L'objectif : que setInterval(tick) se lance TOUJOURS, même si une étape
  // antérieure échoue. Sans ça, l'horloge se bloque définitivement.
  
  let isFresh = false;
  let catchupReport = null;
  
  try {
    setS(load());
    isFresh = !S;
    if (isFresh) {
      setS(freshState());
      seedJournal();
      save();
    }
  } catch (err) {
    console.error('[BOOT] Erreur load/init :', err);
    // Si le load a planté (save corrompue par ex), repartir sur un fresh
    try {
      setS(freshState());
      seedJournal();
      save();
      isFresh = true;
    } catch (err2) {
      console.error('[BOOT] Erreur sur fresh state :', err2);
      alert("DRIFT : impossible d'initialiser le jeu.\n" + err2.message);
      return; // sans state on ne peut rien faire
    }
  }
  
  if (!isFresh) {
    try {
      catchupReport = catchUpOffline();
    } catch (err) {
      console.error('[BOOT] Erreur catchUpOffline :', err);
      // Pas grave, on continue sans rattrapage
    }
  }
  
  try {
    autoAssignAllFreeMembers();
  } catch (err) {
    console.error('[BOOT] Erreur autoAssign :', err);
  }
  
  try {
    setupHandlers();
  } catch (err) {
    console.error('[BOOT] Erreur setupHandlers :', err);
  }
  
  try {
    render();
  } catch (err) {
    console.error('[BOOT] Erreur render initial :', err);
  }
  
  if (catchupReport) {
    try { showCatchupModal(catchupReport); }
    catch (err) { console.error('[BOOT] Erreur catchup modal :', err); }
  }
  
  // ============================================================
  // DÉMARRAGE DU TICK — protégé pour ne jamais s'arrêter
  // ============================================================
  // Wrapper qui capture les exceptions du tick, sinon une seule erreur
  // tue tout le système.
  function safeTick() {
    try {
      tick();
    } catch (err) {
      console.error('[TICK] Erreur dans tick() :', err);
      // On essaye au moins d'avancer le temps minimal et de sauvegarder
      try {
        if (S?.meta) {
          S.meta.gameMin = (S.meta.gameMin || 0) + (MIN_PER_TICK || 1);
          S.meta.lastTickRealMs = Date.now();
        }
      } catch (e) {}
    }
  }
  // Lance le tick principal
  let tickIntervalId = setInterval(safeTick, TICK_MS);
  
  // Watchdog : surveille que le tick tourne toujours.
  // Si gameMin n'a pas bougé depuis 5 secondes alors que la PWA est visible,
  // on relance le tick.
  let lastWatchdogCheck = { time: Date.now(), gameMin: S?.meta?.gameMin || 0 };
  setInterval(() => {
    if (!S || !S.meta) return;
    if (document.visibilityState !== 'visible') return;
    
    const now = Date.now();
    const elapsed = now - lastWatchdogCheck.time;
    const advanced = (S.meta.gameMin || 0) - lastWatchdogCheck.gameMin;
    
    // Si > 5 sec se sont écoulées et gameMin n'a pas bougé d'une seule minute,
    // c'est que le tick est mort. On le relance.
    if (elapsed > 5000 && advanced === 0) {
      console.warn('[WATCHDOG] Tick gelé détecté — redémarrage');
      try { clearInterval(tickIntervalId); } catch (e) {}
      tickIntervalId = setInterval(safeTick, TICK_MS);
      // Force aussi un render() pour rafraîchir l'UI
      try { render(); } catch (e) {}
    }
    
    lastWatchdogCheck = { time: now, gameMin: S.meta.gameMin || 0 };
  }, 5000);
  
  // Rattrapage à chaque retour au premier plan
  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.visibilityState === 'hidden') {
      S.meta.lastTickRealMs = Date.now();
      try { save(); } catch (e) {}
      return;
    }
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      const elapsedMs = now - (S.meta.lastTickRealMs || now);
      // Au-delà de 30s d'écart, on rattrape silencieusement
      if (elapsedMs > 30000) {
        const ticksToSim = Math.min(
          Math.floor(elapsedMs / TICK_MS),
          OFFLINE_MAX_HOURS * 3600
        );
        try {
          for (let i = 0; i < ticksToSim; i++) {
            tickOnce({ silent: true });
          }
          S.meta.lastTickRealMs = now;
          save();
          render();
        } catch (err) {
          console.error('[VISIBILITY] Erreur rattrapage :', err);
        }
      }
      // S'assurer aussi que le tick principal tourne après reprise
      lastWatchdogCheck = { time: Date.now(), gameMin: S.meta.gameMin || 0 };
    }
  });
  
  // Sauvegarde aussi avant fermeture
  window.addEventListener('pagehide', () => {
    if (S) {
      S.meta.lastTickRealMs = Date.now();
      try { save(); } catch (e) {}
    }
  });
  
  console.log('[BOOT] DRIFT démarré, version', VERSION);
}

// Modale "bon retour" qui résume ce qui s'est passé pendant l'absence
function showCatchupModal(report) {
  // En dessous de 5 minutes réelles, on ne montre rien (zéro friction)
  if (report.realElapsedHours < 5/60) return;

  const realLabel = report.realElapsedHours < 1
    ? `${Math.round(report.realElapsedHours * 60)} minutes`
    : report.realElapsedHours < 24
      ? `${report.realElapsedHours.toFixed(1)} heures`
      : `${(report.realElapsedHours / 24).toFixed(1)} jours`;

  const summaryHTML = report.summary.length > 0
    ? `<ul style="list-style:none;padding:0;margin:14px 0 0;">${
        report.summary.map(line =>
          `<li style="font-family:var(--mono);font-size:12px;color:var(--text-dim);padding:5px 0;border-bottom:1px dashed var(--border);">${line}</li>`
        ).join('')
      }</ul>`
    : '<p style="font-style:italic;color:var(--text-mute);margin-top:10px">L\'avant-poste a tenu sans encombre.</p>';

  const cappedHTML = report.capped
    ? `<p style="font-family:var(--mono);font-size:11px;color:var(--amber);margin-top:14px;letter-spacing:0.04em;">
         Note : simulation plafonnée à ${OFFLINE_MAX_HOURS}h pour préserver l'équilibre.
       </p>`
    : '';

  showModal({
    title: 'Reprise du contact',
    body: `
      <span style="display:block;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;margin-bottom:4px;">
        Absence : ${realLabel}
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

// Différer le démarrage pour éviter les problèmes de Temporal Dead Zone
// avec les dépendances circulaires app.js ↔ state.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  // Document déjà chargé : différer d'un tick
  setTimeout(boot, 0);
}
