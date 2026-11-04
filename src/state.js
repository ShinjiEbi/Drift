// state.js — état courant du jeu, sauvegarde, chargement, migrations
// Le state S est exposé via live binding ES module : toute modification
// de propriétés (S.crew.push, S.res.metal--) est visible partout.
// Les ré-assignations complètes (S = ...) passent par setS().

import { VERSION, SAVE_KEY, SAVE_SCHEMA_VERSION, SAVE_BACKUP_MAX, TICK_MS, MIN_PER_TICK, AUTOSAVE_EVERY, BUILD_TIME_MULT, PROD_MULT, OFFLINE_MAX_HOURS, OFFLINE_INCIDENT_RATE, RESOURCES, RES_LABELS, START_RESOURCES, CAP, SKILL_LIST, PACING, YEAR_IN_GAME_MIN } from './constants.js';
import { MODULES, MODULE_JOBS, ITEMS, ITEM_NAME_TO_ID, BLUEPRINTS, BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS, TRAITS, TECH_TREE, FABRICATIONS, VESSELS } from './catalog.js';
import { rngFor, rPick, rWeighted, rInt, fmtDuree, esc, uid } from './util.js';
import { globalCommandBonus, moduleEfficiency, permanentBonusesAccumulated, staffOf, techEffectsAccumulated, tickExpeditions, tickResearch, tickFabrication, tickRelations, tickRelationMoraleEffects, tickAging, tickColonyEvents, tickArcs, tickFactions, tickDiplomaticMissions, finishVesselBuild, finishTraining, finishTreatment, progressMemberStatuts, rollColonyIncident, triggerIncident, catchUpOffline, autoAssignAllFreeMembers, autoAssignMember, normalizeChronicleRecruits, tickAutoCare, genVesselName, salaryPerDay } from './app.js';
import { render, toast, log, seedJournal, showModal } from './ui.js';
import { notif } from './notifications.js';

// ============================================================

export var S = null;
export function setS(newS) { S = newS; }  // état courant

// Équipage de départ (V1) : trois colons complémentaires, tirés comme des
// candidats ordinaires puis ajustés à leur rôle. startRole permet au contenu
// (prologue, scènes) de les désigner : 'pilote', 'ingenieur', 'medecin'.
const STARTING_CREW = [
  { startRole: 'pilote',    skills: { pilotage: 2, combat: 1, survie: 1 } },
  { startRole: 'ingenieur', skills: { ingenierie: 2, science: 2 } },
  { startRole: 'medecin',   skills: { medecine: 2, survie: 1 } },
];

// Candidat → membre d'équipage (même conversion pour le recrutement et le départ)
function candidateToMember(c, gameMin) {
  return {
    ...c,
    id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36) + Math.floor(Math.random()*1296).toString(36),
    joinedAt: gameMin,
    birthGameMin: gameMin - (c.age || 30) * YEAR_IN_GAME_MIN,  // 0.18 — vieillissement
    statut: 'libre',          // libre | travail | formation | infirmerie | expedition | diplomatie | mort
    sante: 100,
    statuts: [],              // [{ key, since, revealed, severityNow }]
    sequels: [],              // séquelles permanentes [{ key, since }]
    blessures: []             // legacy, gardé pour compat
  };
}

function genStartingCrew() {
  return STARTING_CREW.map(spec => {
    const c = genCandidate();
    for (const k of SKILL_LIST) c.skills[k] = spec.skills[k] || 0;
    c.age = 26 + Math.floor(Math.random() * 16);
    c.startRole = spec.startRole;
    c.origin = { ...c.origin };
    c.moral = 75;
    c.loyaute = 70;
    c.salary = Math.max(1, 1 + Math.max(...Object.values(c.skills)));
    return candidateToMember(c, 0);
  });
}

export function freshState() {
  // Génère une seed maître stable et lisible
  const masterSeed = 'drift-' + Date.now().toString(36) + '-' + Math.floor(Math.random()*1e6).toString(36);
  return {
    meta: {
      version: VERSION,
      schemaVersion: SAVE_SCHEMA_VERSION,  // format de sauvegarde (cf. migrate)
      created: Date.now(),
      colonyName: 'Avant-poste',
      gameMin: 0,           // minutes jeu écoulées
      sessionMs: 0,         // ms réelles écoulées cette session
      lastSave: 0,
      lastTickRealMs: Date.now(),  // horloge wall pour calculer l'écart à la reprise
      seed: masterSeed
    },
    res: { ...START_RESOURCES },
    modules: {
      commandement: { level: 1 }    // pré-construit
    },
    build: null,            // { id, targetLevel, totalMin, doneMin, cost } ou null
    buildQueue: [],         // V1 — chantiers en attente : [{ id, targetLevel, cost }] (coût déjà payé)
    researchQueue: [],      // V1 — recherches en attente : [techId] (coût déjà payé)
    crew: genStartingCrew(), // V1 — trois colons au départ (cf. STARTING_CREW)
    candidates: [],         // candidats en attente d'acceptation
    training: [],           // sessions de formation en cours
    treatments: [],         // soins en cours
    // V1 — une vedette en état de marche, posée sur l'aire de fortune
    fleet: [{ id: uid('v'), type: 'vedette', name: genVesselName('vedette'), available: true }],
    vesselBuild: null,      // chantier vaisseau en cours
    expeditions: [],        // expéditions en cours
    expHistory: [],         // historique des expéditions
    // 0.11 — inventaire de colonie : map { itemId: count }
    inventory: {},
    // 0.12 — bibliothèque de schémas découverts (permanente) : { bpId: { firstFoundAt, source } }
    discoveries: {},
    // 0.13 — tech tree
    techCompleted: {},      // { techId: { at } }
    research: [],           // [{ id, techId, totalMin, doneMin, startedAt }]
    alienDatacubes: 0,      // ressource virtuelle obtenue depuis ruines alien
    // 0.28 — overflow : ressources d'expédition au-delà du cap
    // Se vide quand le cap se libère. Limite : 2× cap normal.
    overflow: { metal: 0, cristal: 0, energie: 0, biomasse: 0, datacubes: 0 },
    // 0.28 — effets temporaires actifs (debuffs, buffs)
    activeBuffs: [],
    // 0.28 — marques historiques de la colonie (entrées du journal de longue durée)
    historicalMarks: [],
    // 0.28 — incidents en chaîne en attente : [{ incidentId, triggerAt }]
    pendingChainIncidents: [],
    // 0.33 — décisions (incidents / événements) en attente du joueur, persistées :
    // [{ id, kind:'incident'|'event', refId, victimId?, actorIds?, createdAt }]
    pendingDecisions: [],
    pendingIncident: null,     // miroir lu par le bandeau d'alertes (ui.js)
    pendingColonyEvent: null,  // idem
    // 0.14 — atelier (file de fabrications)
    fabrication: [],        // [{ id, fabId, totalMin, doneMin, startedAt }]
    // 0.18 — relations sociales : { "id1|id2": affinity }
    relations: {},
    // 0.19 — cooldowns événements de colonie
    nextEventMin: PACING.EVENT_FIRST,
    lastHommageMin: -99999,
    lastVisitorMin: -99999,
    lastMerchantMin: -99999,
    // 0.20 — arcs narratifs
    arcs: {},                 // { arcId: { unlocked, completedSteps, rewardClaimed } }
    unlockedLegendaryTechs: {},
    permanentBonuses: {},
    // 0.21 — diplomatie
    factions: {},             // { factionId: { id, type, name, reputation, ... } }
    diplomaticMissions: [],   // [{ id, factionId, memberId, startedAt, duration }]
    // 0.9.0 — affectations aux postes : map "modKey:slotIdx" → memberId
    assignments: {},
    autoAssign: true,       // auto-affecte les nouveaux colons aux postes éligibles
    galaxy: genGalaxy(masterSeed),
    nextRecruitMin: 0,
    nextIncidentMin: PACING.INCIDENT_FIRST,
    journal: [],
    flags: {},
    ui: {
      galaxyView: 'list',           // 'list' | 'system' | 'body'
      galaxySubtab: 'cartographie', // 'cartographie' | 'fleet' | 'expeditions'
      currentSystemId: null,
      currentBodyId: null
    }
  };
}

// Part de la demande d'énergie couverte au dernier calcul (1 = pas de pénurie).
// Valeur liée à l'objet d'état : un autre état (chargement, test) repart de 1.
let _energyRatio = 1, _energyRatioFor = null;
export function energyRatio() { return _energyRatioFor === S ? _energyRatio : 1; }

// Calcule prod/upkeep nets PAR TICK (seconde réelle) pour chaque ressource.
// Tient compte de l'efficacité de chaque bâtiment selon ses postes pourvus.
// V1 :
//  - un module sans personnel tourne au ralenti et CONSOMME COMME IL PRODUIT
//    (entretien × rendement, plafonné à 1) — sauf les logements (habitat, quartiers) ;
//  - pénurie d'énergie : si le stock ne couvre plus la demande, les modules qui
//    consomment de l'énergie tournent à la part couverte (production et entretien) ;
//  - vivres des colons en poste et salaires de tout l'équipage (biomasse).
export function computeRates() {
  const rate = { metal:0, cristal:0, energie:0, biomasse:0, datacubes:0 };
  const cmdBonus = globalCommandBonus();
  const cmdMult = 1 + cmdBonus * 0.03;   // +3% par poste commandement pourvu
  const tech = techEffectsAccumulated();
  const perm = permanentBonusesAccumulated();  // calculé une seule fois (et non par module)

  const contribs = [];
  let energyIn = 0, energyDemand = 0;
  for (const id of Object.keys(S.modules)) {
    const m = S.modules[id];
    const def = MODULES[id];
    if (!def || !m) continue;  // 0.29 : skip si module entry est undefined/null
    // 0.28 : module désactivé temporairement (disabledUntil) — pas de prod, pas d'upkeep
    if (m.disabledUntil && m.disabledUntil > (S.meta?.gameMin || 0)) continue;
    const eff = moduleEfficiency(id);
    // Bonus de tech ciblé sur ce module
    const moduleTechMult = tech.moduleProdMult[id] || 1;
    const prod = {}, up = {};
    // Production fixe en unités par heure réelle, sans personnel requis
    // (filet du Centre de commandement : jamais de partie bloquée)
    if (def.prodFixed) {
      const p = def.prodFixed(m.level);
      for (const k in p) prod[k] = (prod[k] || 0) + p[k] / 3600 * cmdMult;
    }
    if (def.prod) {
      const p = def.prod(m.level);
      for (const k in p) {
        // Bonus global par ressource (ex. tech_metallurgie sur metal)
        const resMult = tech.resourceMult[k] || 1;
        const permMult = perm.resourceMult[k] || 1;
        prod[k] = (prod[k] || 0) + p[k] * PROD_MULT * eff.prodMult * cmdMult * moduleTechMult * resMult * permMult;
      }
    }
    if (def.upkeep) {
      const u = def.upkeep(m.level);
      const staffFactor = def.capCrew ? 1 : Math.min(1, eff.prodMult);
      for (const k in u) up[k] = u[k] * PROD_MULT * eff.upkeepMult * staffFactor;
    }
    energyIn += prod.energie || 0;
    energyDemand += up.energie || 0;
    contribs.push({ prod, up });
  }
  // Pénurie d'énergie : part de la demande couverte par le stock + la production
  const stock = Math.max(0, S.res?.energie || 0);
  let ratio = 1;
  if (energyDemand > 0 && stock + energyIn < energyDemand) ratio = Math.max(0, Math.min(1, (stock + energyIn) / energyDemand));
  _energyRatio = ratio;
  _energyRatioFor = S;
  for (const c of contribs) {
    const f = (c.up.energie || 0) > 0 ? ratio : 1;
    for (const k in c.prod) rate[k] += c.prod[k] * f;
    for (const k in c.up) rate[k] -= c.up[k] * f;
  }

  // Vivres des colons en poste (indexés sur la production)
  const activeWorkers = S.crew.filter(m => m.statut === 'travail').length;
  rate.biomasse -= activeWorkers * PACING.FOOD_PER_WORKER * PROD_MULT * tech.workerBiomasseMult;
  // Salaires (biomasse par jour réel) de tout l'équipage vivant
  let salaries = 0;
  for (const m of S.crew) if (m.statut !== 'mort') salaries += salaryPerDay(m);
  rate.biomasse -= salaries / PACING.JOUR;

  // 0.28 : applique buffs/debuffs actifs (prodMult global)
  if (Array.isArray(S.activeBuffs) && S.activeBuffs.length > 0) {
    let prodMult = 1;
    for (const b of S.activeBuffs) {
      if (b.type === 'prodMult' && typeof b.value === 'number') {
        prodMult *= b.value;
      }
    }
    if (prodMult !== 1) {
      for (const k of RESOURCES) {
        if (rate[k] > 0) rate[k] *= prodMult;  // n'affecte que la prod, pas la conso
      }
    }
  }

  return rate;
}

// Capacités de toutes les ressources en un seul passage (bonus de tech
// calculés une fois) — utilisé par tickOnce pour éviter 5 recalculs par tick.
export function capsAll() {
  const tech = techEffectsAccumulated();
  const caps = {};
  for (const k of RESOURCES) caps[k] = (CAP[k] || 0) * (tech.capacityMult[k] || 1);
  for (const id of Object.keys(S.modules || {})) {
    const def = MODULES[id];
    const m = S.modules[id];
    if (def?.capBonus && m?.level > 0) {
      const bonus = def.capBonus(m.level);
      for (const k of RESOURCES) if (bonus[k]) caps[k] += bonus[k];
    }
  }
  for (const k of RESOURCES) caps[k] = Math.floor(caps[k]);
  return caps;
}

// Capacité d'un type de ressource : base × techs + bonus des modules (capBonus :
// mine, hydroponie, générateur, laboratoire, silo, mémoire cristalline)
export function capOf(k) {
  return capsAll()[k] || 0;
}

// Durée réelle (ticks = secondes) du chantier d'un module au niveau lvl (cf. PACING)
export const buildTime = (id, lvl) => MODULES[id].time(lvl);

// Calendrier affiché : « Jour N » = jours réels depuis la fondation (temps simulé).
// → { jour, heure, minute } ; jour commence à 1.
export function calendarOf(gameMin) {
  const t = Math.max(0, Math.floor(Number(gameMin) || 0));
  return {
    jour: Math.floor(t / PACING.JOUR) + 1,
    heure: Math.floor((t % PACING.JOUR) / PACING.HEURE),
    minute: Math.floor((t % PACING.HEURE) / PACING.MINUTE)
  };
}

// Capacité équipage totale (utilisée plus tard)
export function crewCap() {
  let c = 0;
  for (const id of Object.keys(S.modules)) {
    const def = MODULES[id]; const m = S.modules[id];
    if (def?.capCrew) c += def.capCrew(m.level);
  }
  return c;
}

// ---- Chantiers et file d'attente (V1) ----
// S.build = chantier en cours ; S.buildQueue = chantiers suivants (BUILD_QUEUE_MAX au
// plus), coût débité à l'ajout, remboursé à l'annulation dans la limite du stockage.
// Un niveau en file compte pour les prérequis et le niveau suivant proposé.
export const BUILD_QUEUE_MAX = PACING.BUILD_QUEUE_MAX;

// Niveau qu'aura un module une fois le chantier en cours et la file terminés
export function plannedLevel(id) {
  let lvl = S.modules[id]?.level || 0;
  if (S.build?.id === id) lvl = Math.max(lvl, S.build.targetLevel);
  for (const q of S.buildQueue || []) if (q.id === id) lvl = Math.max(lvl, q.targetLevel);
  return lvl;
}

function payCost(cost) {
  for (const k in cost) {
    if (k === 'datacubes_alien') S.alienDatacubes = (S.alienDatacubes || 0) - cost[k];
    else S.res[k] -= cost[k];
  }
}

// Rembourse un coût dans la limite du stockage (ne réduit jamais un stock existant)
export function refundCost(cost, frac = 1) {
  const caps = capsAll();
  for (const k in cost || {}) {
    const amount = Math.floor((cost[k] || 0) * frac);
    if (amount <= 0) continue;
    if (k === 'datacubes_alien') { S.alienDatacubes = (S.alienDatacubes || 0) + amount; continue; }
    const cur = S.res[k] || 0;
    S.res[k] = Math.max(cur, Math.min(caps[k] ?? Infinity, cur + amount));
  }
}

// Vérifie si le niveau suivant (après le chantier en cours et la file) peut être
// lancé ou mis en file. → { ok, why } ou { ok, cost, time, nextLevel, queued }
export function canBuild(id) {
  const def = MODULES[id];
  if (!def) return { ok:false, why:'Module inconnu' };
  const next = plannedLevel(id) + 1;
  const maxLvl = def.maxLevel + (techEffectsAccumulated().moduleMaxLevelDelta[id] || 0);
  if (next > maxLvl) return { ok:false, why: plannedLevel(id) > (S.modules[id]?.level || 0) ? 'Niveau max atteint (en file)' : 'Niveau max atteint' };
  const busy = !!S.build;
  if (busy && (S.buildQueue || []).length >= BUILD_QUEUE_MAX) {
    return { ok:false, why:`File de chantiers pleine (${BUILD_QUEUE_MAX})` };
  }

  // 0.25 : module tier 2 — requiert une tech débloqueuse
  if (def.requireTech) {
    if (!S.techCompleted || !S.techCompleted[def.requireTech]) {
      const techNom = TECH_TREE[def.requireTech]?.nom || def.requireTech;
      return { ok:false, why:`Requiert la tech ${techNom}` };
    }
  }

  const req = def.prereq(next);
  for (const k in req) {
    if (plannedLevel(k) < req[k]) {
      return { ok:false, why:`Requiert ${MODULES[k].nom} niv ${req[k]}` };
    }
  }
  const cost = def.cost(next);
  for (const k in cost) {
    // 0.25 : support des datacubes_alien (ressource séparée S.alienDatacubes)
    if (k === 'datacubes_alien') {
      if ((S.alienDatacubes || 0) < cost[k]) {
        return { ok:false, why:`Ressources insuffisantes (datacubes alien)` };
      }
      continue;
    }
    if (S.res[k] < cost[k]) {
      return { ok:false, why:`Ressources insuffisantes (${RES_LABELS[k]})` };
    }
  }
  return { ok:true, cost, time: buildTime(id, next), nextLevel: next, queued: busy };
}

function beginBuild(id, targetLevel, cost) {
  S.build = { id, targetLevel, totalMin: buildTime(id, targetLevel), doneMin: 0, cost: { ...cost } };
}

// Lance le chantier, ou le met en file si un chantier est en cours. → { ok, why, queued }
export function enqueueBuild(id) {
  const r = canBuild(id);
  if (!r.ok) return { ok: false, why: r.why };
  payCost(r.cost);
  const nom = MODULES[id].nom;
  if (!S.build) {
    beginBuild(id, r.nextLevel, r.cost);
    const action = r.nextLevel === 1 ? 'Construction' : 'Amélioration';
    log('neutral', `${action} engagée : <em>${nom}</em> (niv ${r.nextLevel}). Durée estimée : ${fmtDuree(r.time)}.`);
  } else {
    if (!Array.isArray(S.buildQueue)) S.buildQueue = [];
    S.buildQueue.push({ id, targetLevel: r.nextLevel, cost: { ...r.cost } });
    log('neutral', `Chantier mis en file : <em>${nom}</em> (niv ${r.nextLevel}), ${S.buildQueue.length}ᵉ en attente.`);
  }
  render();
  return { ok: true, why: '', queued: r.queued };
}

// Compatibilité : l'interface historique appelle startBuild (qui met en file si besoin)
export function startBuild(id) {
  const r = enqueueBuild(id);
  if (!r.ok) toast(r.why);
  return r;
}

// Retire un chantier de la file (et les niveaux suivants du même module, qui en
// dépendent) ; coût remboursé dans la limite du stockage. → { ok, why }
export function cancelQueuedBuild(index) {
  const q = S.buildQueue || [];
  const item = q[index];
  if (!item) return { ok: false, why: 'Chantier introuvable' };
  const removed = q.filter((x, i) => i === index || (i > index && x.id === item.id && x.targetLevel > item.targetLevel));
  S.buildQueue = q.filter(x => !removed.includes(x));
  for (const x of removed) refundCost(x.cost);
  log('neutral', `Chantier retiré de la file : <em>${MODULES[item.id]?.nom || item.id}</em> (niv ${item.targetLevel}). Ressources rendues.`);
  render();
  return { ok: true, why: '' };
}

// Annule le chantier en cours (remboursé dans la limite du stockage) ; la file
// passe au suivant. Les niveaux suivants du même module en file sont annulés aussi.
export function cancelBuild() {
  const b = S.build;
  if (!b) return { ok: false, why: 'Aucun chantier en cours' };
  refundCost(b.cost || MODULES[b.id]?.cost(b.targetLevel) || {});
  const later = (S.buildQueue || []).filter(x => x.id === b.id && x.targetLevel > b.targetLevel);
  S.buildQueue = (S.buildQueue || []).filter(x => !later.includes(x));
  for (const x of later) refundCost(x.cost);
  S.build = null;
  log('warn', `Chantier annulé : <em>${MODULES[b.id]?.nom || b.id}</em> (niv ${b.targetLevel}). Ressources rendues.`);
  startNextQueuedBuild();
  render();
  return { ok: true, why: '' };
}

// Démarre le premier chantier valide de la file. Un chantier devenu impossible
// (prérequis perdus, niveau max) est remboursé ; un module endommagé entre-temps
// reconstruit d'abord son niveau perdu.
function startNextQueuedBuild() {
  const q = S.buildQueue || [];
  while (!S.build && q.length) {
    const item = q.shift();
    const def = MODULES[item.id];
    const cur = S.modules[item.id]?.level || 0;
    const target = Math.min(item.targetLevel, cur + 1);
    const maxLvl = (def?.maxLevel || 0) + (techEffectsAccumulated().moduleMaxLevelDelta[item.id] || 0);
    const req = def ? def.prereq(target) : {};
    const missing = def ? Object.keys(req).find(k => (S.modules[k]?.level || 0) < req[k]) : 'module';
    if (!def || target <= cur || target > maxLvl || missing) {
      refundCost(item.cost);
      log('warn', `Chantier en file abandonné : <em>${def?.nom || item.id}</em> (niv ${item.targetLevel})${missing && def ? ` — requiert ${MODULES[missing]?.nom || missing} niv ${req[missing]}` : ''}. Ressources rendues.`);
      continue;
    }
    beginBuild(item.id, target, item.cost);
    log('neutral', `Chantier suivant engagé : <em>${def.nom}</em> (niv ${target}). Durée estimée : ${fmtDuree(S.build.totalMin)}.`);
  }
}

// Termine la construction en cours
export function finishBuild() {
  const b = S.build;
  if (!b) return;
  if (!S.modules[b.id]) S.modules[b.id] = { level: 0 };
  S.modules[b.id].level = b.targetLevel;
  const def = MODULES[b.id];
  if (def.flag) S.flags[def.flag] = true;
  // Init du compteur de recrutement à la première construction de la Balise
  if (b.id === 'balise_recrutement' && b.targetLevel === 1) {
    S.nextRecruitMin = S.meta.gameMin + 30 * PACING.MINUTE;  // premier candidat dans ~30 min
    log('success', "<em>Balise de recrutement</em> en ligne. Premier signal attendu sous peu.");
  } else {
    log('success', `<em>${def.nom}</em> opérationnel au niveau ${b.targetLevel}.`);
  }
  // 0.26 : notification dédiée
  notif.buildDone(def.nom, b.targetLevel);
  S.build = null;
  // Nouveau bâtiment / niveau supérieur = nouveaux postes ouverts → tente l'auto-affectation
  autoAssignAllFreeMembers({ respectChoice: true });
  // V1 : la file prend le relais
  startNextQueuedBuild();
}

// ============================================================
// 4. PROCGEN — génération de candidats à l'engagement
//              + génération galactique (systèmes, corps célestes)
// ============================================================



export const GRAVITES = {
  micro:     { nom:'Microgravité', weight:3, frag:"Pas même un dixième de g. Tout flotte, le moindre élan compte." },
  faible:    { nom:'Faible',       weight:5, frag:"Gravité réduite, sauts faciles, fatigue lente." },
  standard:  { nom:'Standard',     weight:6, frag:"Proche de Terre. Confortable pour l'équipage." },
  lourde:    { nom:'Lourde',       weight:5, frag:"1.5 à 2 g. L'effort se paie vite." },
  ecrasante: { nom:'Écrasante',    weight:2, frag:"Plus de 2.5 g. Tout déplacement est un calvaire." }
};

export const VIES = {
  aucune:        { nom:'Aucune',                   weight:8, frag:"Aucun signal biologique détecté." },
  microbienne:   { nom:'Microbienne',              weight:6, frag:"Microbiote pré-biotique ou primitif. Échantillons prudents recommandés." },
  flore_agressive:{ nom:'Flore agressive',        weight:4, frag:"Végétation prédatrice. Spores, lianes mobiles, contacts à éviter." },
  faune:         { nom:'Faune indigène',           weight:4, frag:"Créatures autochtones, taille et tempérament variables." },
  civ_dechue:    { nom:'Civilisation déchue',      weight:2, frag:"Traces d'une intelligence éteinte. Plus aucun signal." },
  civ_active:    { nom:'Civilisation active',      weight:1, frag:"Présence intelligente actuelle. Trafic radio détecté." }
};




// Types de corps célestes (poids relatifs)
export const BODY_TYPES = {
  planete:      { nom:'Planète',      weight:6 },
  lune:         { nom:'Lune',         weight:3 },
  station:      { nom:'Station',      weight:1 },
  epave:        { nom:'Épave',        weight:1 },
  asteroide_g:  { nom:'Champ d\'astéroïdes', weight:2 }
};

// ---- Génération de noms de systèmes ----
export const SYS_PREFIXES = ['HD','HR','HIP','BD','TYC','GJ','LHS','RX','LP','UCAC','2MASS','Kepler','TRAPPIST','TOI','Wolf','Ross','Gliese','Lalande'];
export const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
export const CONSTELL = ['Boötis','Persei','Octantis','Cassiopeiæ','Lyræ','Cygni','Carinæ','Aquilae','Hydræ','Tucanæ','Eridani','Reticuli','Ophiuchi','Centauri','Indi','Pavonis'];

export function genSystemName(rng) {
  const styleRoll = rng();
  if (styleRoll < 0.55) {
    // Catalogue : "HD-2891", "TYC-5872-1"
    const prefix = rPick(SYS_PREFIXES, rng);
    const num = rInt(100, 9999, rng);
    if (rng() < 0.3) return `${prefix}-${num}-${rInt(1, 9, rng)}`;
    return `${prefix}-${num}`;
  } else if (styleRoll < 0.85) {
    // Grec : "ξ-Octantis", "α-Persei B"
    const greek = rPick(GREEK, rng);
    const constell = rPick(CONSTELL, rng);
    if (rng() < 0.3) return `${greek}-${constell} ${rPick(['A','B','C'], rng)}`;
    return `${greek}-${constell}`;
  } else {
    // Codé : "RX-J0712", "ESO-451-3"
    const num = String(rInt(1000, 9999, rng));
    return `RX-J${num}` + (rng() < 0.4 ? `+${rInt(10,89,rng)}` : '');
  }
}

// Adjectifs poétiques pour parfois nommer les corps remarquables
export const POETIC_NAMES = [
  'Sépulture','Veilleuse','Aubépine','Cendrée','Murmure','Faïence','Nocturne',
  'Carmin','Tessère','Arroyo','Sablier','Rouille','Chiffre','Bréchet','Houle',
  'Givre','Verdure','Émissaire','Marbre','Litanie','Solstice','Naufrage'
];

export function genBodyName(systemName, idx, rng) {
  // 80% : système + lettre. 20% : nom poétique.
  if (rng() < 0.2) {
    return `${systemName} · ${rPick(POETIC_NAMES, rng)}`;
  }
  const letter = String.fromCharCode(97 + idx);  // a, b, c...
  return `${systemName} ${letter}`;
}

// ---- Génération d'un corps céleste ----
export function genBody(systemName, systemSeed, idx) {
  const rng = rngFor(systemSeed, 'body', idx);
  const typeKey = rWeighted(Object.entries(BODY_TYPES).map(([k,v]) => [k, v.weight]), rng);
  const body = {
    id: systemSeed + '_' + idx,
    name: genBodyName(systemName, idx, rng),
    type: typeKey,
    visited: false,
    looted: false
  };

  // Champ d'astéroïdes / station / épave : génération simplifiée
  if (typeKey === 'asteroide_g') {
    body.biome = 'asteroide';
    body.atmosphere = 'aucune';
    body.gravite = 'micro';
    body.vie = 'aucune';
    body.signal = rng() < 0.15 ? 'sos' : 'aucun';
    body.ruines = 'aucune';
    body.danger = rng() < 0.3 ? 'anomalie' : 'aucun';
    body.flavor = "Une nuée de roches en lente cascade. Métaux et glace prêts à être moissonnés.";
    return body;
  }
  if (typeKey === 'station') {
    body.biome = 'exotique';
    body.atmosphere = rng() < 0.7 ? 'respirable' : 'aucune';
    body.gravite = rng() < 0.5 ? 'standard' : 'faible';
    body.vie = rng() < 0.2 ? 'civ_active' : 'aucune';
    body.signal = rng() < 0.6 ? rWeighted([['sos',3],['crypte',4],['bruit_blanc',1]], rng) : 'aucun';
    body.ruines = 'aucune';
    body.danger = rng() < 0.3 ? rWeighted([['ia_hostile',3],['pathogene',1]], rng) : 'aucun';
    body.flavor = "Structure orbitale silencieuse. Quelques modules tournent encore, d'autres dérivent.";
    return body;
  }
  if (typeKey === 'epave') {
    body.biome = 'exotique';
    body.atmosphere = 'aucune';
    body.gravite = 'micro';
    body.vie = 'aucune';
    body.signal = rng() < 0.4 ? 'sos' : 'aucun';
    body.ruines = rng() < 0.6 ? 'humaines' : 'aucune';
    body.danger = rng() < 0.4 ? rWeighted([['anomalie',2],['ia_hostile',1]], rng) : 'aucun';
    body.flavor = "Vaisseau éventré, arrimage forcé impossible. La carcasse est massive.";
    return body;
  }

  // Planète ou lune : tirage complet
  body.biome      = rWeighted(Object.entries(BIOMES).map(([k,v]) => [k, v.weight]), rng);
  body.atmosphere = rWeighted(Object.entries(ATMOSPHERES).map(([k,v]) => [k, v.weight]), rng);
  body.gravite    = rWeighted(Object.entries(GRAVITES).map(([k,v]) => [k, v.weight]), rng);
  body.vie        = rWeighted(Object.entries(VIES).map(([k,v]) => [k, v.weight]), rng);
  body.signal     = rWeighted(Object.entries(SIGNAUX).map(([k,v]) => [k, v.weight]), rng);
  body.ruines     = rWeighted(Object.entries(RUINES).map(([k,v]) => [k, v.weight]), rng);
  body.danger     = rWeighted(Object.entries(DANGERS).map(([k,v]) => [k, v.weight]), rng);

  // Cohérences : si vie = aucune et atmosphère respirable, parfois on bascule en ténue (logique)
  if (body.vie === 'aucune' && body.atmosphere === 'respirable' && rng() < 0.5) {
    body.atmosphere = 'tenue';
  }
  // Lune : pas de civilisation active
  if (typeKey === 'lune' && body.vie === 'civ_active') body.vie = 'aucune';

  return body;
}

// ---- Génération d'un système ----
export function genSystem(masterSeed, idx, gridSize = 8) {
  const rng = rngFor(masterSeed, 'sys', idx);
  // Position en grille avec jitter, l'avant-poste au centre (4,4 sur 8x8)
  const gx = idx % gridSize;
  const gy = Math.floor(idx / gridSize);
  const homeX = (gridSize - 1) / 2, homeY = (gridSize - 1) / 2;
  const jitterX = (rng() - 0.5) * 0.6;
  const jitterY = (rng() - 0.5) * 0.6;
  const x = gx + jitterX;
  const y = gy + jitterY;
  const dx = x - homeX, dy = y - homeY;
  const distance = Math.sqrt(dx*dx + dy*dy);

  const sysName = genSystemName(rng);
  const seed = `${masterSeed}|sys${idx}|${sysName}`;
  const bodyCount = 1 + Math.floor(rng() * 6);    // 1-6 corps
  const bodies = [];
  for (let i = 0; i < bodyCount; i++) {
    bodies.push(genBody(sysName, seed, i));
  }

  return {
    id: 'sys_' + idx,
    idx,
    name: sysName,
    pos: { x, y },
    distance,
    seed,
    scanned: distance < 0.8,    // l'avant-poste se trouve dans son propre système, déjà connu
    explored: false,
    bodies
  };
}

// ---- Génération de la galaxie complète ----
export function genGalaxy(masterSeed) {
  const gridSize = 8;
  const total = gridSize * gridSize;   // 64 systèmes
  const systems = [];
  for (let i = 0; i < total; i++) {
    systems.push(genSystem(masterSeed, i, gridSize));
  }
  // Trie par distance pour l'affichage
  systems.sort((a, b) => a.distance - b.distance);
  ensureStartingNeighbours(systems, masterSeed);
  return { seed: masterSeed, systems };
}

// V1 — voisinage de départ garanti (déterministe pour une graine donnée) :
//  - au moins un système cartographié dès l'atterrissage (première expédition) ;
//  - une civilisation active à portée de la vedette (anneau 0,8-1,8 pc), dont le
//    système est connu d'emblée (signal capté à l'atterrissage) : une faction est
//    rencontrable sans antenne.
function ensureStartingNeighbours(systems, masterSeed) {
  if (!systems.length) return;
  const rng = rngFor(masterSeed, 'voisinage');
  if (!systems.some(s => s.scanned)) systems[0].scanned = true;
  const near = systems.filter(s => s.distance <= 1.8);
  const civ = near.find(s => s.bodies.some(b => b.vie === 'civ_active'));
  if (civ) { civ.scanned = true; return; }
  const ring = systems.filter(s => s.distance >= 0.8 && s.distance <= 1.8);
  const pool = ring.length ? ring : systems.slice(1, 4);
  const sys = pool[Math.floor(rng() * Math.min(3, pool.length))] || systems[0];
  let body = sys.bodies.find(b => b.type === 'planete') || sys.bodies[0];
  if (body.type !== 'planete') {
    // Une station, une épave ou une lune deviennent une planète tempérée habitée
    body.type = 'planete';
    if (!BIOMES[body.biome]) body.biome = 'toundra';
    body.gravite = 'standard';
    delete body.flavor;
  }
  body.vie = 'civ_active';
  body.atmosphere = 'respirable';
  if (body.danger === 'ia_hostile' || body.danger === 'anomalie' || body.danger === 'pathogene') body.danger = 'aucun';
  sys.scanned = true;
}

// ---- Composition de description narrative ----
export function describeBody(body) {
  const fragments = [];
  if (BIOMES[body.biome]?.frag)       fragments.push(BIOMES[body.biome].frag);
  if (ATMOSPHERES[body.atmosphere]?.frag) fragments.push(ATMOSPHERES[body.atmosphere].frag);
  if (GRAVITES[body.gravite]?.frag)   fragments.push(GRAVITES[body.gravite].frag);
  if (VIES[body.vie]?.frag)           fragments.push(VIES[body.vie].frag);
  if (SIGNAUX[body.signal]?.frag)     fragments.push(SIGNAUX[body.signal].frag);
  if (RUINES[body.ruines]?.frag)      fragments.push(RUINES[body.ruines].frag);
  if (DANGERS[body.danger]?.frag)     fragments.push(DANGERS[body.danger].frag);
  if (body.flavor)                    fragments.unshift(body.flavor);
  return fragments.filter(f => f).join(' ');
}

// Niveau de menace global (1 à 5, basé sur danger + autres)
export function bodyThreatLevel(body) {
  let t = 1;
  const d = DANGERS[body.danger]?.weight;  // poids inverse = rareté = dangerosité
  if (body.danger !== 'aucun') t += 1;
  if (['ia_hostile','anomalie','pathogene'].includes(body.danger)) t += 1;
  if (body.atmosphere === 'toxique' || body.atmosphere === 'anormale') t += 1;
  if (body.gravite === 'ecrasante') t += 1;
  if (body.vie === 'civ_active') t += 1;
  return Math.min(5, t);
}

// Niveau de récompense potentielle (1 à 5)
export function bodyRewardLevel(body) {
  let r = 1;
  if (body.signal !== 'aucun') r += 1;
  if (body.ruines !== 'aucune') r += 1;
  if (['alien_a','alien_b','fusion'].includes(body.ruines)) r += 1;
  if (['echo_temporel','bruit_blanc'].includes(body.signal)) r += 1;
  return Math.min(5, r);
}

// ============================================================
// 4b. Génération de candidats à l'engagement
// ============================================================

// Tables de prénoms regroupées par origine culturelle (variété)
export const FIRST_NAMES = {
  fr: ['Antoine','Bastien','Camille','Damien','Étienne','Faustine','Garance','Hugo','Iris','Julien','Killian','Léa','Maxime','Noémie','Olivier','Pauline','Quentin','Romane','Sébastien','Théo','Ulysse','Violette','Yann','Zoé','Adèle','Bérénice','Diane','Élodie','Margaux','Salomé'],
  slave: ['Aleksei','Anastasia','Boris','Daria','Dmitri','Elena','Fyodor','Galina','Igor','Larissa','Marina','Mikhail','Natasha','Nikolai','Pavel','Polina','Sergei','Svetlana','Tatiana','Vasili'],
  jp: ['Aiko','Daisuke','Haruki','Hiroshi','Kenji','Mei','Naoko','Ren','Saya','Takeshi','Yui','Yuki','Akira','Sora','Mirai'],
  arabe: ['Amir','Bilal','Dalia','Farid','Hassan','Karim','Layla','Mariam','Nadia','Omar','Rania','Yasmin','Zayd','Salim','Noor'],
  africain: ['Adwoa','Chiamaka','Eze','Folake','Kwame','Makena','Nkechi','Obi','Sade','Tariku','Wanjiru','Zola','Kofi','Aïssata'],
  scandinave: ['Astrid','Bjorn','Elin','Freya','Gunnar','Inger','Lars','Ragnhild','Sven','Tove','Ulla','Henrik','Linnea'],
  hispanique: ['Adriana','Bruno','Camila','Diego','Esteban','Inés','Mateo','Renata','Soledad','Tomás','Valeria','Xavi'],
  asie_sud: ['Anjali','Devika','Hari','Indira','Kavita','Manish','Nikhil','Priya','Ravi','Sanjay','Tara','Vikram']
};

export const LAST_NAMES = [
  'Bernard','Dubois','Lefebvre','Martin','Moreau','Petit','Roux','Vincent','Durand','Lambert',
  'Volkov','Sokolov','Petrov','Ivanov','Kozlov','Morozov','Novikov','Lebedev','Kuznetsov','Smirnov',
  'Tanaka','Suzuki','Yamada','Watanabe','Kobayashi','Saito','Mori','Sato','Ito','Nakamura',
  'Al-Khoury','Hassan','Aziz','Rahman','El-Sayed','Habibi','Mansour',
  'Okoye','Mensah','Adebayo','Diallo','Coulibaly','Mwangi','Achebe','Sow',
  'Singh','Kapoor','Banerjee','Reddy','Patel','Iyer','Khan','Sharma',
  'Andersson','Larsen','Eriksson','Nielsen','Olafsson','Lindqvist','Bergman',
  'Cruz','Reyes','Mendoza','Vargas','Castillo','Ramirez','Ortega','Soto',
  'Volkov-Hayashi','Diallo-Petrov','Singh-Bernard'  // métis, contexte spatial
];

// Origines : lieu, contexte fluffy
export const ORIGINS = [
  { id:'mars-tharsis',     label:'Mars · Tharsis',           notes:"Plateaux volcaniques, mineurs durs au mal." },
  { id:'mars-noachis',     label:'Mars · Noachis',           notes:"Plaines glacées du sud, taciturnes." },
  { id:'lune-shackleton',  label:'Lune · Shackleton',        notes:"Cratère du pôle sud, exploitation de glace." },
  { id:'ceinture-pallas',  label:'Ceinture · Pallas',        notes:"Habitat tournant ancien, culture rugueuse." },
  { id:'ceinture-vesta',   label:'Ceinture · Vesta',         notes:"Plateformes minières, gravité quasi-nulle." },
  { id:'titan-anaxim',     label:'Titan · Stn. Anaximandre', notes:"Cryogénistes et chimistes patients." },
  { id:'l4-novgorod',      label:'L4 · Novgorod',            notes:"Tore d'habitation russophone, traditions." },
  { id:'l5-meridian',      label:'L5 · Meridian',            notes:"Tore commercial, sociolectes mêlés." },
  { id:'terre-europe',     label:'Terre · Europe-Nord',      notes:"Vétérans des guerres climatiques." },
  { id:'terre-saharel',    label:'Terre · Saharel',          notes:"Spécialistes survie en milieu aride." },
  { id:'terre-pacifique',  label:'Terre · Arc Pacifique',    notes:"Marins, plongeurs, ingénieurs océan." },
  { id:'europa-deep',      label:'Europa · Sub-glace',       notes:"Biologistes des fosses, peu loquaces." },
  { id:'enceladus-rim',    label:'Encelade · Anneau-Sud',    notes:"Géologues isolationnistes." },
  { id:'station-orphee',   label:'Station Orphée',           notes:"Avant-poste perdu. Aucun ne sait pourquoi ils sont partis." },
  { id:'belt-anonyme',     label:'Ceinture · sans matricule',notes:"Refuse de préciser. Documents falsifiés ?" }
];


;
;
;

// Helpers de tirage
export function rollPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function rollWeighted(entries) {
  // entries : array de [key, {weight,...}]
  const total = entries.reduce((s, [_, v]) => s + (v.weight || 1), 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) { r -= (v.weight || 1); if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}
export function gaussInt(mean=5, sd=1.5, min=1, max=10) {
  const u = Math.random() || 0.0001, v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, Math.round(mean + z * sd)));
}

export function genName() {
  const groups = Object.keys(FIRST_NAMES);
  const first = rollPick(FIRST_NAMES[rollPick(groups)]);
  const last = rollPick(LAST_NAMES);
  return `${first} ${last}`;
}

export function genStats() {
  return {
    vigueur:   gaussInt(5, 1.6),
    dexterite: gaussInt(5, 1.6),
    intellect: gaussInt(5, 1.6),
    sangfroid: gaussInt(5, 1.6),
    charisme:  gaussInt(5, 1.6)
  };
}

export function genSkills() {
  const skills = {};
  for (const s of SKILL_LIST) skills[s] = 0;
  // 1 ou 2 skills "natifs" à 2-4
  const nb = Math.random() < 0.4 ? 2 : 1;
  const picked = new Set();
  while (picked.size < nb) picked.add(rollPick(SKILL_LIST));
  for (const s of picked) skills[s] = Math.max(skills[s], gaussInt(3, 0.8, 2, 4));
  return skills;
}

export function genTraits() {
  const nb = 1 + Math.floor(Math.random() * 3);  // 1 à 3
  const entries = Object.entries(TRAITS);
  const picked = new Set();
  let attempts = 0;
  while (picked.size < nb && attempts < 30) {
    picked.add(rollWeighted(entries));
    attempts++;
  }
  return Array.from(picked);
}

export function genCandidate() {
  const stats = genStats();
  const skills = genSkills();
  const traits = genTraits();
  // Salaire : basé sur le meilleur skill + ajusté par traits
  const bestSkill = Math.max(...Object.values(skills));
  let salary = 1 + bestSkill;
  // Petit modifier selon traits
  if (traits.includes('ambitieux')) salary += 1;
  if (traits.includes('cynique'))   salary += 1;
  if (traits.includes('curieux'))   salary -= 1;  // ils veulent juste partir
  salary = Math.max(1, salary);
  return {
    id: 'c_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36),
    name: genName(),
    age: 22 + Math.floor(Math.random() * 36),
    origin: rollPick(ORIGINS),
    stats, skills, traits,
    salary,                  // points de prétention : salaryPerDay() = biomasse par jour réel
    spawnedAt: S?.meta?.gameMin || 0,
    moral: 70 + Math.floor(Math.random() * 20),
    loyaute: 40 + Math.floor(Math.random() * 30)
  };
}

// Capacité d'équipage utilisée vs totale (les morts ne comptent pas)
export function crewUsage() {
  const alive = S.crew.filter(m => m.statut !== 'mort').length;
  return { used: alive, total: crewCap() };
}

// Liste des membres vivants (raccourci pratique)
export function aliveCrew() {
  return S.crew.filter(m => m.statut !== 'mort');
}

// ============================================================
// 5. SIM — boucle de tick
// ============================================================

export let tickCount = 0;

// ---- Robustesse : erreurs pendant la simulation ----
// Chaque sous-système de tickOnce est isolé : une erreur dans l'un n'empêche
// ni les autres de tourner, ni la sauvegarde automatique. Les erreurs sont
// comptées ; au-delà de quelques-unes, un toast unique prévient le joueur.
const _tickErrors = {};
let _tickErrorTotal = 0;
let _tickErrorToastShown = false;
export function reportTickError(where, err) {
  _tickErrorTotal++;
  const n = (_tickErrors[where] = (_tickErrors[where] || 0) + 1);
  if (n <= 3 || n % 1000 === 0) console.error(`[TICK] Erreur dans « ${where} » (×${n}) :`, err);
  if (!_tickErrorToastShown && _tickErrorTotal >= 3) {
    _tickErrorToastShown = true;
    try { toast("Une erreur est survenue dans la simulation. Le jeu continue ; exporte ta sauvegarde par précaution."); } catch (e) { /* UI indisponible */ }
  }
}
function step(where, fn, arg) {
  try { fn(arg); } catch (e) { reportTickError(where, e); }
}

// ---- Sous-systèmes de tickOnce ----
function tickResources(silent) {
  const rate = computeRates();
  const caps = capsAll();   // une seule évaluation des bonus de capacité par tick
  let energyShortfall = false;
  if (!S.flags.capWarned) S.flags.capWarned = {};  // 0.26.1 — dédoublonne les notifs cap saturé
  if (!S.overflow) S.overflow = { metal: 0, cristal: 0, energie: 0, biomasse: 0, datacubes: 0 };  // 0.28
  for (const k of RESOURCES) {
    let next = (S.res[k] || 0) + rate[k];
    if (next < 0) {
      if (k === 'energie') energyShortfall = true;
      next = 0;
    }
    const cap = caps[k];
    if (next > cap) {
      // 0.26.1 : notification quand on commence à perdre de la prod par saturation
      if (rate[k] > 0 && !silent) {
        const lastWarnedAt = S.flags.capWarned[k] || -99999;
        if (S.meta.gameMin - lastWarnedAt > 720) {
          S.flags.capWarned[k] = S.meta.gameMin;
          notif.capReached(RES_LABELS[k]);
        }
      }
      next = cap;
    } else if (next < cap * 0.9) {
      delete S.flags.capWarned[k];
    }
    // 0.28 : si on a de l'overflow ET de la place dans le cap normal, on transfère
    if (S.overflow[k] > 0 && next < cap) {
      const space = cap - next;
      const transfer = Math.min(space, S.overflow[k]);
      next += transfer;
      S.overflow[k] -= transfer;
    }
    S.res[k] = next;
  }
  // V1 : la pénurie d'énergie a un effet réel (computeRates : modules consommateurs
  // ralentis) ; on le signale au journal une fois par épisode de pénurie.
  if (energyRatio() < 0.999) {
    if (!S.flags.energyShortSince) {
      S.flags.energyShortSince = S.meta.gameMin;
      if (!silent) log('warn', `Pénurie d'énergie : les modules consommateurs tournent à ${Math.round(_energyRatio * 100)} %.`);
    }
  } else if (S.flags.energyShortSince && (S.res.energie || 0) > 1) {
    delete S.flags.energyShortSince;
  }
  void energyShortfall;
  // V1 : biomasse à zéro alors que la colonie consomme → vivres et salaires
  // impayés : le moral baisse peu à peu.
  if ((S.res.biomasse || 0) <= 0.001 && rate.biomasse < 0) {
    if (!S.flags.unpaidSince) {
      S.flags.unpaidSince = S.meta.gameMin;
      if (!silent) log('warn', "Plus de biomasse : vivres rationnés et salaires impayés. Le moral de l'équipage baisse.");
    }
    const loss = PACING.UNPAID_MORAL_PER_HOUR / PACING.HEURE;
    for (const m of S.crew) if (m.statut !== 'mort') m.moral = Math.max(0, (m.moral || 0) - loss);
  } else if (S.flags.unpaidSince && (S.res.biomasse || 0) > 1) {
    delete S.flags.unpaidSince;
  }
}

function tickBuild() {
  if (!S.build) return;
  S.build.doneMin += MIN_PER_TICK;
  if (S.build.doneMin >= S.build.totalMin) finishBuild();
}

function tickVesselBuild() {
  if (!S.vesselBuild) return;
  S.vesselBuild.doneMin += MIN_PER_TICK;
  if (S.vesselBuild.doneMin >= S.vesselBuild.totalMin) finishVesselBuild();
}

function tickTraining() {
  if (S.training.length === 0) return;
  const finished = [];
  for (const t of S.training) {
    t.doneMin += MIN_PER_TICK;
    if (t.doneMin >= t.totalMin) finished.push(t);
  }
  for (const t of finished) {
    finishTraining(t);
    const idx = S.training.indexOf(t);
    if (idx >= 0) S.training.splice(idx, 1);
  }
}

function tickTreatments() {
  if (S.treatments.length === 0) return;
  const finished = [];
  for (const t of S.treatments) {
    t.doneMin += MIN_PER_TICK;
    if (t.doneMin >= t.totalMin) finished.push(t);
  }
  for (const t of finished) {
    finishTreatment(t);
    const idx = S.treatments.indexOf(t);
    if (idx >= 0) S.treatments.splice(idx, 1);
  }
}

// Statuts (révélations, complications, contagion)
function tickMemberStatuts() {
  for (const m of S.crew) progressMemberStatuts(m);
}

// Incidents — taux réduit en mode silencieux (rattrapage)
function tickIncidentRoll(silent) {
  if (!S.modules.habitat || !S.crew.some(m => m.statut !== 'mort')) return;
  const incidentRate = silent ? OFFLINE_INCIDENT_RATE : 1.0;
  if (Math.random() < incidentRate) rollColonyIncident(silent);
}

// Scan toutes les 60 min jeu
function tickScan(silent) {
  if (!S.modules.antenne || tickCount % 60 !== 0) return;
  const lvl = S.modules.antenne.level;
  const range = 1 + lvl * 1.4 + (techEffectsAccumulated().scanRangeBonus || 0);
  let newlyScanned = 0;
  for (const sys of S.galaxy.systems) {
    if (!sys.scanned && sys.distance <= range) {
      sys.scanned = true;
      newlyScanned++;
    }
  }
  if (newlyScanned > 0 && !silent) {
    log('neutral', `Antenne : <em>${newlyScanned}</em> nouveau(x) système(s) cartographié(s).`);
  }
}

// Recrutement (V1) : lent — ~1 candidat toutes les 5 h au niveau 1 de la balise,
// plus vite aux niveaux supérieurs ; 2 à 3 candidats en attente au plus.
export function recruitIntervalTicks(lvl = S?.modules?.balise_recrutement?.level || 1) {
  return Math.round(PACING.RECRUIT_INTERVAL / (1 + PACING.RECRUIT_LEVEL_SPEEDUP * (Math.max(1, lvl) - 1)));
}
export function recruitQueueMax(lvl = S?.modules?.balise_recrutement?.level || 1) {
  const t = PACING.RECRUIT_QUEUE;
  return t[Math.max(1, Math.min(t.length - 1, lvl))];
}
function tickRecruitment(silent) {
  if (!S.modules.balise_recrutement || !S.flags.recrutement) return;
  const lvl = S.modules.balise_recrutement.level;
  const interval = recruitIntervalTicks(lvl);
  const maxQueue = recruitQueueMax(lvl);
  if (S.candidates.length < maxQueue && S.meta.gameMin >= S.nextRecruitMin) {
    const c = genCandidate();
    S.candidates.push(c);
    if (!silent) {
      log('neutral', `Signal reçu : <em>${esc(c.name)}</em> (${esc(c.origin.label)}) propose ses services.`);
      notif.candidate(c.name, c.origin.label);
    }
    const variance = interval * PACING.RECRUIT_JITTER * (Math.random() * 2 - 1);
    S.nextRecruitMin = S.meta.gameMin + interval + variance;
  }
  if (S.nextRecruitMin < S.meta.gameMin && S.candidates.length >= maxQueue) {
    S.nextRecruitMin = S.meta.gameMin + interval;
  }
}

// 0.28 : nettoyage des buffs/debuffs expirés
function tickBuffs(silent) {
  if (!Array.isArray(S.activeBuffs) || S.activeBuffs.length === 0) return;
  const now = S.meta.gameMin || 0;
  const before = S.activeBuffs.length;
  S.activeBuffs = S.activeBuffs.filter(b => b.expiresAt > now);
  if (S.activeBuffs.length < before && !silent) {
    log('neutral', "Un effet temporaire s'est dissipé.");
  }
}

// 0.28 : incidents en chaîne arrivés à échéance.
// En direct, l'incident rejoint la file des décisions du joueur ;
// en silencieux (rattrapage), il est résolu automatiquement.
function tickChainIncidents(silent) {
  if (!Array.isArray(S.pendingChainIncidents) || S.pendingChainIncidents.length === 0) return;
  const now = S.meta.gameMin || 0;
  const due = S.pendingChainIncidents.filter(p => p.triggerAt <= now);
  if (due.length === 0) return;
  S.pendingChainIncidents = S.pendingChainIncidents.filter(p => p.triggerAt > now);
  for (const p of due) step('incident en chaîne', id => triggerIncident(id, silent), p.incidentId);
}

// tickOnce — exécute UNE minute de simulation. Sans render.
// opts.silent=true → réduit/coupe les logs et ralentit certains événements
// pour les sessions de rattrapage hors ligne (évite l'inflation) ; les
// incidents et événements y sont résolus automatiquement.
export function tickOnce(opts = {}) {
  const silent = !!opts.silent;

  // Avance le temps en premier : une erreur plus loin ne bloque pas l'horloge
  // (et l'horloge n'avance qu'une fois par tick).
  S.meta.gameMin += MIN_PER_TICK;

  step('ressources', tickResources, silent);
  step('chantier', tickBuild);
  step('chantier vaisseau', tickVesselBuild);
  step('expéditions', tickExpeditions);
  step('recherche', tickResearch);                      // 0.13
  step('atelier', tickFabrication);                     // 0.14
  step('relations', tickRelations);                     // 0.18
  step('moral relationnel', tickRelationMoraleEffects);
  step('vieillissement', tickAging);
  step('événements de colonie', tickColonyEvents, silent);  // 0.19
  step('arcs', tickArcs);                               // 0.20
  step('factions', tickFactions);                       // 0.21
  step('missions diplomatiques', tickDiplomaticMissions);
  step('formations', tickTraining);
  step('traitements', tickTreatments);
  step('soins automatiques', tickAutoCare);            // V1 : infirmerie avec soignant
  step('statuts médicaux', tickMemberStatuts);
  step('incidents', tickIncidentRoll, silent);
  step('antenne', tickScan, silent);
  step('recrutement', tickRecruitment, silent);
  step('effets temporaires', tickBuffs, silent);
  step('incidents en chaîne', tickChainIncidents, silent);

  tickCount++;
}

// ============================================================
// 5b. HORLOGE — temps réel → temps de jeu, rattrapage
// ============================================================
// 1 seconde réelle = 1 tick = MIN_PER_TICK minute(s) de jeu.
// S.meta.lastTickRealMs = instant réel jusqu'auquel la simulation est à jour.
// C'est la SEULE référence : tick(), le retour au premier plan et le
// rattrapage hors ligne la lisent et l'avancent, jamais deux fois le même tick.

const LIVE_TICKS_MAX = 5;            // ticks dus simulés « en direct » par appel ; le surplus en silencieux
const SYNC_TICKS_MAX = 60;           // onglet visible : au-delà, rattrapage par morceaux (page réactive)
const SYNC_TICKS_MAX_HIDDEN = 1800;  // onglet caché : bloquer quelques centaines de ms ne gêne personne
let _ticksSinceSave = 0;
let _sessionStartMs = Date.now();
let _simPaused = false;              // onglet secondaire, sauvegarde illisible, import en cours…
let _catchUp = null;                 // rattrapage en cours : { total, done, timer, … }

export function markSessionStart() {
  _sessionStartMs = Date.now();
  if (S?.meta) S.meta.sessionMs = 0;
}
export function setSimPaused(v) {
  _simPaused = !!v;
  if (_simPaused) cancelCatchUp();
}
export function isSimPaused() { return _simPaused; }
export function isCatchingUp() { return _catchUp !== null; }

function pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// Un tick protégé : si tickOnce échoue AVANT d'avoir avancé l'horloge,
// on l'avance quand même (sinon le jeu se fige) — jamais deux fois.
function runTick(silent) {
  const before = S.meta.gameMin;
  try {
    tickOnce({ silent });
  } catch (e) {
    reportTickError('tickOnce', e);
    if (S?.meta && S.meta.gameMin === before) S.meta.gameMin = (before || 0) + MIN_PER_TICK;
  }
}

// tick — appelé par le minuteur (plusieurs fois par seconde). Simule tous
// les ticks dus depuis lastTickRealMs (accumulateur) : un onglet en
// arrière-plan dont le minuteur est ralenti à 1 appel/min ne perd plus de temps.
// Renvoie le nombre de ticks simulés.
export function tick() {
  if (!S?.meta || _simPaused || _catchUp) return 0;
  const now = Date.now();
  S.meta.sessionMs = Math.max(0, now - _sessionStartMs);
  if (!Number.isFinite(S.meta.lastTickRealMs)) S.meta.lastTickRealMs = now;
  const elapsed = now - S.meta.lastTickRealMs;
  if (elapsed < 0) {
    // Horloge système reculée : on recale sans simuler
    S.meta.lastTickRealMs = now;
    return 0;
  }
  const n = Math.floor(elapsed / TICK_MS);
  if (n === 0) return 0;
  const hidden = pageHidden();
  if (n > (hidden ? SYNC_TICKS_MAX_HIDDEN : SYNC_TICKS_MAX)) {
    // Gros écart (reprise, page gelée puis réveillée…) : rattrapage par
    // morceaux avec résumé. Onglet caché : on attend son retour au premier plan.
    if (!hidden) {
      try { catchUpOffline(); }
      catch (e) { reportTickError('rattrapage', e); S.meta.lastTickRealMs = now; }
    }
    return 0;
  }
  for (let i = 0; i < n; i++) runTick(i < n - LIVE_TICKS_MAX);
  S.meta.lastTickRealMs += n * TICK_MS;   // += et non = now : on garde les fractions de seconde
  _ticksSinceSave += n;
  if (_ticksSinceSave >= AUTOSAVE_EVERY) {
    _ticksSinceSave = 0;
    save();
  }
  try { render(); } catch (e) { reportTickError('render', e); }
  return n;
}

// Rattrapage par morceaux : simule `ticks` ticks en silencieux, par tranches
// de ~12 ms (onglet visible) pour garder la page réactive. lastTickRealMs
// avance avec chaque tranche : une sauvegarde faite pendant le rattrapage
// reste cohérente, et tick() ne fait rien tant qu'il n'est pas terminé.
// Si l'écart dépasse `ticks` (plafond OFFLINE_MAX_HOURS), le surplus est abandonné.
export function runCatchUp(ticks, { onProgress, onDone } = {}) {
  if (_catchUp || !S?.meta) return false;
  const now = Date.now();
  const due = Math.max(0, Math.floor((now - S.meta.lastTickRealMs) / TICK_MS));
  const total = Math.max(0, Math.min(ticks, due, OFFLINE_MAX_HOURS * 3600));
  if (due > total) S.meta.lastTickRealMs = now - total * TICK_MS;
  const job = { total, done: 0, savedAt: 0, timer: null };
  _catchUp = job;
  const slice = () => {
    if (_catchUp !== job) return;   // annulé (onglet repris ailleurs, nouvelle partie…)
    const budget = pageHidden() ? 200 : 12;
    const t0 = performance.now();
    while (job.done < job.total) {
      const batch = Math.min(20, job.total - job.done);
      for (let i = 0; i < batch; i++) runTick(true);
      job.done += batch;
      S.meta.lastTickRealMs += batch * TICK_MS;
      if (performance.now() - t0 >= budget) break;
    }
    if (job.done - job.savedAt >= 3600) { job.savedAt = job.done; save(); }
    try { onProgress?.(job.done, job.total); } catch (e) { reportTickError('rattrapage (progression)', e); }
    if (job.done >= job.total) {
      _catchUp = null;
      _ticksSinceSave = 0;
      save();
      try { onDone?.(job.done); } catch (e) { reportTickError('rattrapage (fin)', e); }
      return;
    }
    job.timer = setTimeout(slice, 0);
  };
  job.timer = setTimeout(slice, 0);
  return true;
}

export function cancelCatchUp() {
  if (!_catchUp) return;
  clearTimeout(_catchUp.timer);
  _catchUp = null;
}

// ============================================================
// 6. NET — vide en phase 0 (Trystero arrive phase 3)
// ============================================================

// ============================================================
// 7. CREW — gestion équipage et recrutement
//    (la section EXPEDITION proprement dite arrive en phase 2)
// ============================================================

// Accepter un candidat → devient membre d'équipage
export function acceptCandidate(id) {
  const idx = S.candidates.findIndex(c => c.id === id);
  if (idx < 0) return;
  const c = S.candidates[idx];
  const cap = crewUsage();
  if (cap.used >= cap.total) {
    toast("Pas de place dans l'habitat.");
    return;
  }
  S.candidates.splice(idx, 1);
  // Conversion candidat → membre actif
  const member = candidateToMember(c, S.meta.gameMin);
  S.crew.push(member);
  log('success', `<em>${esc(member.name)}</em> rejoint l'avant-poste. Origine : ${esc(member.origin?.label || 'inconnue')}.`);
  // 0.26 : notification dédiée
  notif.recruited(member.name);
  // Auto-affectation au meilleur poste libre éligible
  autoAssignMember(member.id);
  render();
}

export function refuseCandidate(id) {
  const idx = S.candidates.findIndex(c => c.id === id);
  if (idx < 0) return;
  const c = S.candidates[idx];
  S.candidates.splice(idx, 1);
  log('neutral', `Candidature de <em>${esc(c.name)}</em> écartée.`);
  render();
}

// Description courte d'un trait
export function traitDesc(traitId) {
  return TRAITS[traitId]?.desc || '';
}
export function traitNom(traitId) {
  return TRAITS[traitId]?.nom || traitId;
}
export function traitKind(traitId) {
  return TRAITS[traitId]?.kind || 'ambigu';
}

// ---- Système de formation ----

// Niveau cible = niveau actuel + 1. Renvoie null si déjà au max ou au plafond du centre.
export function trainingTargetLevel(member, skill) {
  const cur = member.skills[skill] || 0;
  if (cur >= 5) return null;
  const centerLvl = S.modules.formation?.level || 0;
  if (centerLvl === 0) return null;
  // Plafond enseignable : level + 1 (cf. doc 8.4.1)
  const cap = centerLvl + 1;
  if (cur >= cap) return null;  // bloqué tant qu'on n'a pas amélioré le centre
  return cur + 1;
}

// Cherche un instructeur compétent pour le skill et le niveau cible.
// Priorité 1 : staff du Centre de formation (Instructeur, Pédagogue) avec skill suffisant
// Priorité 2 : tout colon libre avec skill suffisant
export function findInstructor(skill, targetLvl, learnerId) {
  // Priorité au staff de formation en service
  const formationStaff = staffOf('formation')
    .filter(s => s.member.id !== learnerId && (s.member.skills[skill] || 0) >= targetLvl)
    .sort((a, b) => (b.member.skills[skill] || 0) - (a.member.skills[skill] || 0));
  if (formationStaff.length > 0) return formationStaff[0].member;
  // Fallback : libre avec skill ≥ targetLvl
  return S.crew.find(m =>
    m.id !== learnerId &&
    m.statut === 'libre' &&
    (m.skills[skill] || 0) >= targetLvl
  ) || null;
}

// Bonus apportés par le staff du Centre de formation aux sessions
// Renvoie { speedMult, failChanceDelta }
export function formationBonuses() {
  const staff = staffOf('formation');
  let speedMult = 1.0;
  let failChanceDelta = 0;
  for (const { job } of staff) {
    if (job.role === 'qualite') {
      // Pédagogue : -20% durée, -3% chance d'échec
      speedMult *= 0.80;
      failChanceDelta -= 0.03;
    } else if (job.role === 'support') {
      // Assistant : -10% durée
      speedMult *= 0.90;
    }
  }
  if (speedMult < 0.5) speedMult = 0.5;
  return { speedMult, failChanceDelta };
}

// ============================================================
// 9. PERSISTANCE — sauvegarde, chargement, migrations, import/export
// ============================================================

const BACKUP_PREFIX = SAVE_KEY + '_backup_';
let _saveLock = null;          // raison du verrou : 'autre-onglet', 'sauvegarde-illisible', 'import'…
let _saveFailNotified = false;

// Verrou d'écriture : tant qu'il est posé, save() n'écrit rien (onglet
// secondaire, sauvegarde illisible en attente du choix du joueur, import en cours).
export function lockSaves(reason) { _saveLock = reason || 'verrou'; }
export function unlockSaves() { _saveLock = null; }
export function savesLocked() { return _saveLock; }

export function save() {
  if (!S?.meta || _saveLock) return false;
  S.meta.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    _saveFailNotified = false;
    return true;
  } catch (e) {
    console.warn('Sauvegarde échouée', e);
    // Quota dépassé, stockage bloqué (SecurityError)… : on prévient une fois
    // (de nouveau seulement après une sauvegarde réussie).
    if (!_saveFailNotified) {
      _saveFailNotified = true;
      try { toast("⚠ Sauvegarde impossible (stockage plein ou bloqué). Exporte ta partie pour ne rien perdre."); } catch (e2) { /* UI indisponible */ }
    }
    return false;
  }
}

// ---- Copies de secours (clés SAVE_KEY_backup_<horodatage>) ----
export function listBackups() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(BACKUP_PREFIX)) out.push({ key, at: Number(key.slice(BACKUP_PREFIX.length)) || 0 });
    }
  } catch (e) { /* stockage inaccessible */ }
  return out.sort((a, b) => a.at - b.at);
}

// Copie une sauvegarde brute sous une clé de secours. Garde au plus
// SAVE_BACKUP_MAX copies (les plus anciennes sont supprimées) et ne duplique
// pas une copie identique. Renvoie la clé, ou null si la copie a échoué.
export function backupRaw(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const existing = listBackups();
    for (const b of existing) if (localStorage.getItem(b.key) === raw) return b.key;
    let at = Date.now();
    while (existing.some(b => b.at === at)) at++;
    while (existing.length >= SAVE_BACKUP_MAX) localStorage.removeItem(existing.shift().key);
    const key = BACKUP_PREFIX + at;
    localStorage.setItem(key, raw);
    return key;
  } catch (e) {
    console.warn('[SAVE] Copie de secours impossible', e);
    return null;
  }
}

export function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// ---- Chargement ----
// Distingue « pas de sauvegarde » et « sauvegarde illisible » :
//   { status:'none' }
//   { status:'ok', data, warnings, newer, fromVersion }
//   { status:'error', raw, error, backupKey }   ← rien n'est écrasé : au joueur de choisir
export function loadSave() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    // Stockage bloqué : on joue sans sauvegarde (save() préviendra le joueur)
    console.warn('[SAVE] Stockage local inaccessible', e);
    return { status: 'none', storageError: e };
  }
  if (raw === null || raw === '') return { status: 'none' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return loadFailure(raw, new Error('sauvegarde tronquée ou illisible (' + e.message + ')'));
  }
  try {
    const schema = Number.isInteger(data?.meta?.schemaVersion) ? data.meta.schemaVersion : 0;
    // Avant de migrer une sauvegarde d'un format antérieur, on en garde une copie
    if (schema < SAVE_SCHEMA_VERSION) backupRaw(raw);
    const info = migrate(data);
    return { status: 'ok', data: info.data, warnings: info.errors, newer: info.newer, fromVersion: info.fromVersion };
  } catch (e) {
    return loadFailure(raw, e);
  }
}

function loadFailure(raw, error) {
  console.error('[SAVE] Sauvegarde illisible :', error);
  return { status: 'error', raw, error, backupKey: backupRaw(raw) };
}

// Compatibilité : renvoie l'état chargé, ou null (absente OU illisible).
// Ne jamais enchaîner sur une sauvegarde après un null sans vérifier
// loadSave().status — on écraserait une sauvegarde illisible.
export function load() {
  const r = loadSave();
  return r.status === 'ok' ? r.data : null;
}

// ---- Migrations ----
// migrate(data) est appelée au chargement ET à l'import. Elle :
//   1. valide la forme minimale (sinon lève une erreur) ;
//   2. normalise l'état (NORMALIZE, idempotent, à chaque chargement) ;
//   3. applique les migrations ordonnées dont le schéma cible dépasse celui
//      de la sauvegarde (MIGRATIONS) ;
//   4. assainit les chaînes (XSS : la sauvegarde peut venir d'un fichier importé).
// Chaque étape est isolée : un champ qui ne se migre pas n'empêche pas de
// charger le reste ; les erreurs sont renvoyées dans `errors`.
// Une sauvegarde d'un schéma PLUS RÉCENT est chargée telle quelle (champs
// inconnus conservés) avec newer=true pour avertir le joueur.

const STAT_KEYS = ['vigueur', 'dexterite', 'intellect', 'sangfroid', 'charisme'];

function normalizeContainers(d) {
  const gm = d.meta.gameMin;
  for (const k of ['crew', 'candidates', 'training', 'treatments', 'fleet', 'expeditions', 'expHistory',
    'research', 'fabrication', 'diplomaticMissions', 'activeBuffs', 'historicalMarks',
    'pendingChainIncidents', 'pendingDecisions', 'journal', 'buildQueue', 'researchQueue']) {
    if (!Array.isArray(d[k])) d[k] = [];
  }
  for (const k of ['flags', 'modules', 'assignments', 'discoveries', 'techCompleted', 'relations', 'arcs',
    'unlockedLegendaryTechs', 'permanentBonuses', 'factions']) {
    if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) d[k] = {};
  }
  for (const k of RESOURCES) {
    const v = Number(d.res[k]);
    d.res[k] = Number.isFinite(v) ? v : 0;
  }
  if (!d.overflow || typeof d.overflow !== 'object') d.overflow = {};
  for (const k of RESOURCES) if (!Number.isFinite(d.overflow[k])) d.overflow[k] = 0;
  if (d.build === undefined) d.build = null;
  if (d.vesselBuild === undefined) d.vesselBuild = null;
  if (typeof d.autoAssign !== 'boolean') d.autoAssign = true;
  if (typeof d.nextRecruitMin !== 'number') d.nextRecruitMin = 0;
  if (typeof d.nextIncidentMin !== 'number') d.nextIncidentMin = gm + 60 * 8;
  if (typeof d.alienDatacubes !== 'number') d.alienDatacubes = 0;
  // 0.19 : événements de colonie — cooldowns
  if (typeof d.nextEventMin !== 'number') d.nextEventMin = gm + PACING.EVENT_FIRST;
  if (typeof d.lastHommageMin !== 'number') d.lastHommageMin = -99999;
  if (typeof d.lastVisitorMin !== 'number') d.lastVisitorMin = -99999;
  if (typeof d.lastMerchantMin !== 'number') d.lastMerchantMin = -99999;
}

function normalizeMeta(d) {
  const m = d.meta;
  if (!Number.isFinite(m.gameMin)) m.gameMin = Number(m.gameMin) || 0;
  // 0.7.0 : temps réel
  if (!Number.isFinite(m.lastTickRealMs)) m.lastTickRealMs = Number.isFinite(m.lastSave) && m.lastSave > 0 ? m.lastSave : Date.now();
  if (!Number.isFinite(m.sessionMs)) m.sessionMs = 0;
  if (typeof m.colonyName !== 'string' || !m.colonyName.trim()) m.colonyName = 'Avant-poste';
  if (!m.created) m.created = Date.now();
}

// Colons et candidats : forme minimale (E11 : un personnage de chronique créé
// par une version antérieure n'a pas d'objet `origin`).
function normalizePerson(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (typeof p.name !== 'string') p.name = String(p.name ?? 'Inconnu');
  if (!Array.isArray(p.statuts)) p.statuts = [];
  if (!Array.isArray(p.sequels)) p.sequels = [];
  if (!Array.isArray(p.traits)) p.traits = [];
  if (!p.skills || typeof p.skills !== 'object' || Array.isArray(p.skills)) p.skills = {};
  for (const k of SKILL_LIST) if (typeof p.skills[k] !== 'number') p.skills[k] = 0;
  if (!p.stats || typeof p.stats !== 'object' || Array.isArray(p.stats)) p.stats = {};
  for (const k of STAT_KEYS) if (typeof p.stats[k] !== 'number') p.stats[k] = 5;
  if (typeof p.origin === 'string') {
    const known = ORIGINS.find(o => o.id === p.origin);
    p.origin = known ? { ...known } : null;
  }
  if (!p.origin || typeof p.origin !== 'object') p.origin = { id: 'chronique', label: 'Chronique', notes: '' };
  if (typeof p.origin.label !== 'string') p.origin.label = 'Chronique';
  if (typeof p.origin.notes !== 'string') p.origin.notes = '';
  if (typeof p.moral !== 'number') p.moral = 60;
  if (typeof p.loyaute !== 'number') p.loyaute = 50;
  return true;
}

function normalizeCrew(d) {
  // Personnages de chronique créés par une version ≤ 0.32 : leur origine vient de
  // leur chronique. À faire avant normalizePerson, qui poserait une origine générique.
  try { normalizeChronicleRecruits(d); } catch (e) { console.warn('[MIGRATION] Recrues de chronique :', e); }
  d.crew = d.crew.filter(normalizePerson);
  d.candidates = d.candidates.filter(normalizePerson);
  const gm = d.meta.gameMin;
  for (const m of d.crew) {
    if (typeof m.sante !== 'number') m.sante = 100;
    // 0.18 : vieillissement (échelle de l'année propre au format de la sauvegarde :
    // l'étape de migration « temps réel » convertit ensuite les anciennes années)
    if (typeof m.birthGameMin !== 'number') m.birthGameMin = gm - (m.age || 30) * yearScaleOf(d);
  }
}

// Durée d'une année dans le format de la sauvegarde : 30 jours de jeu (43 200 ticks)
// avant le schéma 2, 7 jours réels ensuite.
const LEGACY_YEAR = 30 * 24 * 60;
function yearScaleOf(d) {
  const schema = Number.isInteger(d?.meta?.schemaVersion) ? d.meta.schemaVersion : 0;
  return schema < 2 ? LEGACY_YEAR : YEAR_IN_GAME_MIN;
}

// Galaxie : générée la première fois qu'on charge une save antérieure à 0.5
function normalizeGalaxy(d) {
  if (d.galaxy && Array.isArray(d.galaxy.systems)) return;
  if (!d.meta.seed) d.meta.seed = 'drift-legacy-' + (Number(d.meta.created) || Date.now()).toString(36);
  d.galaxy = genGalaxy(d.meta.seed);
}

function normalizeUi(d) {
  if (!d.ui || typeof d.ui !== 'object' || Array.isArray(d.ui)) d.ui = {};
  if (!['list', 'system', 'body'].includes(d.ui.galaxyView)) d.ui.galaxyView = 'list';
  if (!d.ui.galaxySubtab) d.ui.galaxySubtab = 'cartographie';
  if (d.ui.currentSystemId === undefined) d.ui.currentSystemId = null;
  if (d.ui.currentBodyId === undefined) d.ui.currentBodyId = null;
  // Une vue système/corps pointant vers un système inconnu planterait au rendu
  const sys = d.ui.currentSystemId ? d.galaxy.systems.find(s => s.id === d.ui.currentSystemId) : null;
  if ((d.ui.currentSystemId && !sys) || (d.ui.galaxyView !== 'list' && !sys)) {
    d.ui.galaxyView = 'list';
    d.ui.currentSystemId = null;
    d.ui.currentBodyId = null;
  } else if (d.ui.galaxyView === 'body' && !(sys.bodies || []).some(bd => bd.id === d.ui.currentBodyId)) {
    d.ui.galaxyView = 'system';
    d.ui.currentBodyId = null;
  }
}

// 0.11 : inventaire — pré-rempli depuis l'historique d'expéditions pour les vieilles saves
function normalizeInventory(d) {
  if (d.inventory && typeof d.inventory === 'object' && !Array.isArray(d.inventory)) return;
  d.inventory = {};
  for (const h of d.expHistory) {
    const items = h?.result?.items;
    if (!Array.isArray(items)) continue;
    for (const rawItem of items) {
      const id = ITEM_NAME_TO_ID[rawItem] || (ITEMS[rawItem] ? rawItem : null);
      if (id) d.inventory[id] = (d.inventory[id] || 0) + 1;
    }
  }
}

// 0.12 : un schéma présent dans l'inventaire est forcément découvert
function normalizeDiscoveries(d) {
  for (const id in d.inventory) {
    if (BLUEPRINTS[id] && !d.discoveries[id]) {
      d.discoveries[id] = { firstFoundAt: d.meta.gameMin || 0, source: 'récupéré' };
    }
  }
}

// 0.33 : file des décisions — entrées valides seulement, miroirs pour ui.js
function normalizeDecisions(d) {
  d.pendingDecisions = d.pendingDecisions.filter(x =>
    x && typeof x === 'object' && (x.kind === 'incident' || x.kind === 'event') && typeof x.refId === 'string');
  for (const x of d.pendingDecisions) if (!x.id) x.id = 'dec_' + Math.random().toString(36).slice(2, 10);
  d.pendingIncident = d.pendingDecisions.find(x => x.kind === 'incident')?.refId || null;
  d.pendingColonyEvent = d.pendingDecisions.find(x => x.kind === 'event')?.refId || null;
}

const NORMALIZE = [
  ['méta', normalizeMeta],
  ['conteneurs', normalizeContainers],
  ['équipage', normalizeCrew],
  ['galaxie', normalizeGalaxy],
  ['interface', normalizeUi],
  ['inventaire', normalizeInventory],
  ['bibliothèque de schémas', normalizeDiscoveries],
  ['décisions en attente', normalizeDecisions],
];

// ---- Étapes de migration ordonnées (schéma 0 → 1 → …) ----

// 0.28 → 0.33 : S.queuedIncidents (mécanique quasi morte) est remplacée par
// pendingChainIncidents (échéance) + pendingDecisions (file du joueur).
function migrateQueuedIncidents(d) {
  if (Array.isArray(d.queuedIncidents)) {
    for (const id of d.queuedIncidents) {
      if (typeof id === 'string') d.pendingChainIncidents.push({ incidentId: id, triggerAt: d.meta.gameMin || 0 });
    }
  }
  delete d.queuedIncidents;
}

// Champs jamais lus (0.26 notifications → push uniquement ; 0.29 diplomacy préparatoire)
function migrateDeadFields(d) {
  delete d.notifications;
  delete d.diplomacy;
}

// 0.32 : posteInfo (ancienneté) n'était créé qu'à l'affectation : les colons
// déjà en poste dans une vieille sauvegarde n'en avaient pas.
function migratePosteInfo(d) {
  const gm = d.meta.gameMin || 0;
  for (const key in d.assignments) {
    const m = d.crew.find(c => c.id === d.assignments[key]);
    if (!m || m.posteInfo) continue;
    const [modKey, idxStr] = key.split(':');
    const slotIdx = parseInt(idxStr, 10);
    const job = MODULE_JOBS[modKey]?.[slotIdx];
    if (!job) continue;
    m.posteInfo = {
      modKey,
      slotIdx,
      titre: job.label,
      role: job.role,
      depuis: typeof m.joinedAt === 'number' ? m.joinedAt : gm
    };
  }
}

// ---- Schéma 2 (V1) : rythme en temps réel ----
// Les travaux en cours gardent leur avancement (fraction faite) et prennent la
// durée de la V1 ; rien n'est perdu. Âges et ancienneté sont conservés en années.
const scaleWork = (w, newTotal) => {
  if (!w || !Number.isFinite(newTotal) || newTotal <= 0) return;
  const total = Number(w.totalMin) || 0;
  const frac = total > 0 ? Math.max(0, Math.min(1, (Number(w.doneMin) || 0) / total)) : 0;
  w.totalMin = Math.round(newTotal);
  w.doneMin = frac * w.totalMin;
};

function migrateRealTimeWork(d) {
  const gm = d.meta.gameMin || 0;
  // Chantier de module
  if (d.build && MODULES[d.build.id]) {
    scaleWork(d.build, MODULES[d.build.id].time(d.build.targetLevel));
    if (!d.build.cost) d.build.cost = MODULES[d.build.id].cost(d.build.targetLevel);
  }
  // Recherches, fabrications : unités du catalogue × TIME_UNIT (au lieu de × 3)
  for (const r of d.research) { const t = TECH_TREE[r?.techId]; if (t) scaleWork(r, t.cost.time * BUILD_TIME_MULT); }
  for (const f of d.fabrication) { const fab = FABRICATIONS[f?.fabId]; if (fab) scaleWork(f, fab.time * BUILD_TIME_MULT); }
  // Vaisseau en chantier
  if (d.vesselBuild && VESSELS[d.vesselBuild.type]) scaleWork(d.vesselBuild, VESSELS[d.vesselBuild.type].buildHours * 60 * BUILD_TIME_MULT);
  // Formations (heures du programme × 60 → × TRAINING_UNIT) et soins (catalogue × 10)
  for (const t of d.training) if (t) scaleWork(t, (Number(t.totalMin) || 0) * PACING.TRAINING_UNIT / 60);
  for (const t of d.treatments) if (t) scaleWork(t, (Number(t.totalMin) || 0) * 10);
  // Expéditions en vol : nouvelle durée du trajet pour la même distance, avancement gardé
  for (const e of d.expeditions) {
    if (!e || !(Number(e.oneWayMin) > 0)) continue;
    const vessel = d.fleet.find(v => v.id === e.vesselId);
    const speed = VESSELS[vessel?.type]?.speed || 1;
    const dist = Number(e.bodyDistance) || 0;
    const oldOneWay = Number(e.oneWayMin);
    const bonus = dist > 0 ? oldOneWay / (dist * 180 * speed) : 1;   // bonus du hangar et des techs de l'époque
    const newOneWay = Math.round(PACING.EXPED_BASE + dist * PACING.EXPED_PER_PC * speed * (Number.isFinite(bonus) && bonus > 0 ? bonus : 1));
    if (e.phase === 'aller' || e.phase === 'retour') e.elapsedMin = (Number(e.elapsedMin) || 0) * newOneWay / oldOneWay;
    e.oneWayMin = newOneWay;
    e.onSiteMin = PACING.EXPED_ONSITE;
  }
  // Missions diplomatiques : 1-2 jours de jeu → 4-8 h réelles, avancement gardé
  for (const mis of d.diplomaticMissions) {
    if (!mis || !(Number(mis.duration) > 0)) continue;
    const frac = Math.max(0, Math.min(1, (gm - (Number(mis.startedAt) || gm)) / mis.duration));
    mis.duration = Math.round(mis.duration * 10);
    mis.startedAt = gm - frac * mis.duration;
  }
}

function migrateRealTimeCrew(d) {
  const gm = d.meta.gameMin || 0;
  for (const m of d.crew) {
    // Âge conservé : années de 30 jours de jeu → années de 7 jours réels
    // (un défunt garde l'âge qu'il avait à sa mort)
    if (typeof m.birthGameMin === 'number') {
      const ref = (m.statut === 'mort' && typeof m.diedAt === 'number') ? m.diedAt : gm;
      m.birthGameMin = ref - ((ref - m.birthGameMin) / LEGACY_YEAR) * YEAR_IN_GAME_MIN;
    }
    // Ancienneté conservée (années dans le poste)
    if (m.posteInfo && typeof m.posteInfo.depuis === 'number') {
      m.posteInfo.depuis = gm - ((gm - m.posteInfo.depuis) / LEGACY_YEAR) * YEAR_IN_GAME_MIN;
    }
  }
}

// Minuteries remises à l'échelle réelle (l'ancien rythme les plaçait à quelques minutes)
function migrateRealTimeTimers(d) {
  const gm = d.meta.gameMin || 0;
  d.nextIncidentMin = gm + PACING.INCIDENT_GAP_MIN / 2;
  d.nextEventMin = gm + PACING.HEURE;
  if ((d.modules?.balise_recrutement?.level || 0) > 0) d.nextRecruitMin = gm + 30 * PACING.MINUTE;
}

const MIGRATIONS = [
  { to: 1, steps: [
    ['incidents en file', migrateQueuedIncidents],
    ['champs obsolètes', migrateDeadFields],
    ['ancienneté des postes', migratePosteInfo],
  ] },
  { to: 2, steps: [
    ['travaux en cours (temps réel)', migrateRealTimeWork],
    ['âges et ancienneté (temps réel)', migrateRealTimeCrew],
    ['minuteries (temps réel)', migrateRealTimeTimers],
  ] },
];

// ---- Assainissement (XSS) ----
// L'interface insère beaucoup de chaînes de l'état en innerHTML. Une sauvegarde
// importée peut contenir n'importe quoi : on neutralise < > " dans toutes les
// chaînes (et clés), sauf le texte du journal, qui est du HTML légitime (<em>…) :
// on n'y garde que quelques balises sans attribut et on échappe le reste.
// Idempotent (appelé à chaque chargement).
const NEUTRAL_CHARS = { '<': '‹', '>': '›', '"': '”' };
const neutralize = s => (/[<>"]/.test(s) ? s.replace(/[<>"]/g, c => NEUTRAL_CHARS[c]) : s);
const escAngles = s => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const JOURNAL_ALLOWED_TAGS = /<\/?(?:em|strong|b|i)>|<br\s*\/?>/gi;

export function sanitizeJournalHTML(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  if (!/[<>]/.test(s)) return s;
  let out = '';
  let last = 0;
  for (const m of s.matchAll(JOURNAL_ALLOWED_TAGS)) {
    out += escAngles(s.slice(last, m.index)) + m[0].toLowerCase().replace(/\s+/g, '');
    last = m.index + m[0].length;
  }
  return out + escAngles(s.slice(last));
}

function sanitizeDeep(v, depth) {
  if (typeof v === 'string') return neutralize(v);
  if (!v || typeof v !== 'object') return v;
  if (depth > 40) return null;   // imbrication anormale
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = sanitizeDeep(v[i], depth + 1);
    return v;
  }
  for (const k of Object.keys(v)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') { delete v[k]; continue; }
    const val = sanitizeDeep(v[k], depth + 1);
    if (/[<>"]/.test(k)) {
      delete v[k];
      const nk = neutralize(k);
      if (!Object.prototype.hasOwnProperty.call(v, nk)) v[nk] = val;
    } else {
      v[k] = val;
    }
  }
  return v;
}

export function sanitizeState(d) {
  const journal = Array.isArray(d.journal) ? d.journal : [];
  d.journal = [];
  sanitizeDeep(d, 0);
  d.journal = journal.filter(e => e && typeof e === 'object' && !Array.isArray(e)).map(e => {
    const txt = sanitizeJournalHTML(e.txt);
    delete e.txt;
    sanitizeDeep(e, 1);
    e.txt = txt;
    return e;
  });
  return d;
}

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('format invalide (objet attendu)');
  if (!data.meta || typeof data.meta !== 'object' || Array.isArray(data.meta)) throw new Error('format invalide (meta manquant)');
  if (!data.res || typeof data.res !== 'object' || Array.isArray(data.res)) throw new Error('format invalide (ressources manquantes)');
  const errors = [];
  const run = (label, fn) => {
    try { fn(data); } catch (e) {
      console.warn(`[SAVE] Migration « ${label} » échouée :`, e);
      errors.push(`${label} : ${e?.message || e}`);
    }
  };
  const fromSchema = Number.isInteger(data.meta.schemaVersion) ? data.meta.schemaVersion : 0;
  const fromVersion = typeof data.meta.version === 'string' ? data.meta.version : null;
  const newer = fromSchema > SAVE_SCHEMA_VERSION;

  for (const [label, fn] of NORMALIZE) run(label, fn);
  for (const mig of MIGRATIONS) {
    if (mig.to <= fromSchema) continue;
    for (const [label, fn] of mig.steps) run(label, fn);
  }
  run('assainissement', sanitizeState);

  // Version : on garde la trace de la version d'origine
  if (fromVersion && fromVersion !== VERSION) data.meta.previousVersion = fromVersion;
  data.meta.version = VERSION;
  data.meta.schemaVersion = Math.max(fromSchema, SAVE_SCHEMA_VERSION);
  return { data, errors, newer, fromVersion, fromSchema };
}

// ---- Export / import ----
export function exportSave() {
  if (!S?.meta) { toast('Aucune partie à exporter'); return; }
  save();
  downloadText(JSON.stringify(S, null, 2), `drift_save_${fileStamp()}.json`);
  toast('Sauvegarde exportée');
}

// Télécharge une sauvegarde brute (illisible) telle quelle.
export function exportRawSave(raw) {
  downloadText(String(raw ?? ''), `drift_save_endommagee_${fileStamp()}.json`);
}

function describeSave(d) {
  const day = calendarOf(d.meta?.gameMin || 0).jour;
  const alive = (d.crew || []).filter(m => m && m.statut !== 'mort').length;
  return `« ${esc(d.meta?.colonyName || 'Avant-poste')} » — jour ${day}, ${alive} colon${alive > 1 ? 's' : ''}`;
}

// Importe un fichier : validation + migration, puis confirmation avant de
// remplacer la partie, puis rechargement propre de la page.
// opts.onCancel : appelé si le joueur renonce (écran de sauvegarde illisible).
export function importSave(file, opts = {}) {
  const reader = new FileReader();
  reader.onerror = () => toast('Échec import : fichier illisible');
  reader.onload = e => {
    let info;
    try {
      info = migrate(JSON.parse(e.target.result));
    } catch (err) {
      toast('Échec import : ' + (err?.message || err));
      return;
    }
    const d = info.data;
    const parts = [`<p>Sauvegarde importée : ${describeSave(d)}${info.fromVersion ? ` (version ${esc(info.fromVersion)})` : ''}.</p>`];
    parts.push(S?.meta
      ? `<p>Elle remplacera la partie en cours : ${describeSave(S)}. Une copie de secours de la partie en cours restera dans ce navigateur.</p>`
      : `<p>Elle remplacera la sauvegarde actuelle (une copie de secours en est gardée).</p>`);
    if (info.newer) parts.push(`<p style="color:var(--amber)">⚠ Cette sauvegarde vient d'une version plus récente du jeu : certaines données pourraient ne pas être prises en compte.</p>`);
    if (info.errors.length) parts.push(`<p style="color:var(--amber)">⚠ ${info.errors.length} élément(s) n'ont pas pu être convertis (${esc(info.errors.slice(0, 3).join(' ; '))}).</p>`);
    try { document.getElementById('modal').className = 'modal'; } catch (e2) { /* pas de DOM */ }
    showModal({
      title: 'Remplacer la partie en cours ?',
      body: parts.join(''),
      bodyIsHTML: true,
      primaryLabel: 'Remplacer',
      primaryClass: 'danger',
      onPrimary: () => commitImport(d)
    });
    if (opts.onCancel) document.getElementById('modalCancel')?.addEventListener('click', opts.onCancel);
  };
  reader.readAsText(file);
}

function commitImport(d) {
  // Copie de secours de la partie actuelle (à jour) avant de la remplacer
  try {
    save();
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) backupRaw(cur);
  } catch (e) { /* stockage inaccessible : l'écriture ci-dessous échouera aussi */ }
  d.meta.lastTickRealMs = Date.now();   // pas de rattrapage de la période export → import
  d.meta.lastSave = Date.now();
  d.journal.push({ t: d.meta.gameMin || 0, kind: 'neutral', txt: 'Mémoire restaurée depuis archive externe.' });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch (err) {
    toast('Échec import : stockage plein ou indisponible');
    return;
  }
  // La partie en mémoire ne doit plus rien écrire (pagehide) : on recharge
  lockSaves('import');
  setSimPaused(true);
  toast('Sauvegarde restaurée');
  setTimeout(() => location.reload(), 300);
}

export function resetGame() {
  showModal({
    title: 'Tout recommencer ?',
    body: "Cette action efface l'avant-poste actuel et redémarre une nouvelle fondation. Aucun retour possible.",
    primaryLabel: 'Confirmer',
    primaryClass: 'danger',
    onPrimary: () => {
      cancelCatchUp();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* stockage inaccessible */ }
      S = freshState();
      autoAssignAllFreeMembers();   // V1 : l'équipage de départ prend ses postes
      seedJournal();
      _ticksSinceSave = 0;
      markSessionStart();
      save();
      render();
      toast('Nouvelle fondation établie');
    }
  });
}
