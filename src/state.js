// state.js — état courant du jeu, sauvegarde, chargement, migrations
// Le state S est exposé via live binding ES module : toute modification
// de propriétés (S.crew.push, S.res.metal--) est visible partout.
// Les ré-assignations complètes (S = ...) passent par setS().

import { VERSION, SAVE_KEY, TICK_MS, MIN_PER_TICK, AUTOSAVE_EVERY, BUILD_TIME_MULT, PROD_MULT, OFFLINE_INCIDENT_RATE, RESOURCES, RES_LABELS, START_RESOURCES, CAP, JOB_BIOMASSE_MULT, SKILL_LIST } from './constants.js';
import { MODULES, ITEMS, ITEM_NAME_TO_ID, BLUEPRINTS, BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS, TRAITS } from './catalog.js';
import { rngFor, rPick, rWeighted, rInt, fmtMin } from './util.js';
import { globalCommandBonus, moduleEfficiency, permanentBonusesAccumulated, staffOf, techEffectsAccumulated, EXPED_TIME_PER_PC, EXPED_ONSITE_MIN, EXPED_BIOMASSE_PER_HOUR } from './app.js';
import { render, toast, log, seedJournal } from './ui.js';

// ============================================================

export var S = null;
export function setS(newS) { S = newS; }  // état courant

export function freshState() {
  // Génère une seed maître stable et lisible
  const masterSeed = 'drift-' + Date.now().toString(36) + '-' + Math.floor(Math.random()*1e6).toString(36);
  return {
    meta: {
      version: VERSION,
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
    build: null,            // { id, targetLevel, totalMin, doneMin } ou null
    crew: [],               // membres d'équipage actifs
    candidates: [],         // candidats en attente d'acceptation
    training: [],           // sessions de formation en cours
    treatments: [],         // soins en cours
    fleet: [],              // vaisseaux possédés
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
    // 0.14 — atelier (file de fabrications)
    fabrication: [],        // [{ id, fabId, totalMin, doneMin, startedAt }]
    // 0.18 — relations sociales : { "id1|id2": affinity }
    relations: {},
    // 0.19 — cooldowns événements de colonie
    nextEventMin: 24 * 60,    // 1er événement après 1j jeu
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
    nextIncidentMin: 60*8,
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

// Calcule prod/upkeep nets par minute pour chaque ressource
// Tient compte de l'efficacité de chaque bâtiment selon ses postes pourvus.
export function computeRates() {
  const rate = { metal:0, cristal:0, energie:0, biomasse:0, datacubes:0 };
  const cmdBonus = globalCommandBonus();
  const cmdMult = 1 + cmdBonus * 0.03;   // +3% par poste commandement pourvu
  const tech = techEffectsAccumulated();

  for (const id of Object.keys(S.modules)) {
    const m = S.modules[id];
    const def = MODULES[id];
    if (!def) continue;
    const eff = moduleEfficiency(id);
    // Bonus de tech ciblé sur ce module
    const moduleTechMult = tech.moduleProdMult[id] || 1;
    if (def.prod) {
      const p = def.prod(m.level);
      const perm = permanentBonusesAccumulated();
      for (const k in p) {
        // Bonus global par ressource (ex. tech_metallurgie sur metal)
        const resMult = tech.resourceMult[k] || 1;
        const permMult = perm.resourceMult[k] || 1;
        rate[k] += p[k] * PROD_MULT * eff.prodMult * cmdMult * moduleTechMult * resMult * permMult;
      }
    }
    if (def.upkeep) {
      const u = def.upkeep(m.level);
      for (const k in u) rate[k] -= u[k] * PROD_MULT * eff.upkeepMult;
    }
  }

  // Coût biomasse supplémentaire pour les colons affectés (vivres actifs)
  const activeWorkers = S.crew.filter(m => m.statut === 'travail').length;
  rate.biomasse -= activeWorkers * (EXPED_BIOMASSE_PER_HOUR * JOB_BIOMASSE_MULT) / 60 * tech.workerBiomasseMult;

  return rate;
}

// Capacité d'un type de ressource avec bonus de tech
export function capOf(k) {
  const tech = techEffectsAccumulated();
  return Math.floor((CAP[k] || 0) * (tech.capacityMult[k] || 1));
}

// Helper : durée réelle d'un chantier en minutes-jeu (avec multiplicateur)
export const buildTime = (id, lvl) => MODULES[id].time(lvl) * BUILD_TIME_MULT;

// Capacité équipage totale (utilisée plus tard)
export function crewCap() {
  let c = 0;
  for (const id of Object.keys(S.modules)) {
    const def = MODULES[id]; const m = S.modules[id];
    if (def?.capCrew) c += def.capCrew(m.level);
  }
  return c;
}

// Vérifie prérequis pour upgrade vers nextLevel
export function canBuild(id) {
  const def = MODULES[id];
  if (!def) return { ok:false, why:'Module inconnu' };
  const cur = S.modules[id]?.level || 0;
  const next = cur + 1;
  const maxLvl = def.maxLevel + (techEffectsAccumulated().moduleMaxLevelDelta[id] || 0);
  if (next > maxLvl) return { ok:false, why:`Niveau max atteint` };
  if (S.build) return { ok:false, why:'Chantier déjà en cours' };
  const req = def.prereq(next);
  for (const k in req) {
    if ((S.modules[k]?.level || 0) < req[k]) {
      return { ok:false, why:`Requiert ${MODULES[k].nom} niv ${req[k]}` };
    }
  }
  const cost = def.cost(next);
  for (const k in cost) {
    if (S.res[k] < cost[k]) {
      return { ok:false, why:`Ressources insuffisantes (${RES_LABELS[k]})` };
    }
  }
  return { ok:true, cost, time: buildTime(id, next), nextLevel: next };
}

// Lance la construction
export function startBuild(id) {
  const r = canBuild(id);
  if (!r.ok) { toast(r.why); return; }
  for (const k in r.cost) S.res[k] -= r.cost[k];
  S.build = {
    id,
    targetLevel: r.nextLevel,
    totalMin: r.time,
    doneMin: 0
  };
  const action = r.nextLevel === 1 ? 'Construction' : 'Amélioration';
  log('neutral', `${action} engagée : <em>${MODULES[id].nom}</em> (niv ${r.nextLevel}). Durée estimée : ${fmtMin(r.time)}.`);
  render();
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
    S.nextRecruitMin = S.meta.gameMin + 30;  // premier candidat dans 30 min jeu
    log('success', "<em>Balise de recrutement</em> en ligne. Premier signal attendu sous peu.");
  } else {
    log('success', `<em>${def.nom}</em> opérationnel au niveau ${b.targetLevel}.`);
  }
  S.build = null;
  // Nouveau bâtiment / niveau supérieur = nouveaux postes ouverts → tente l'auto-affectation
  autoAssignAllFreeMembers();
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
  return { seed: masterSeed, systems };
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
    salary,                  // bio par cycle (24h jeu)
    spawnedAt: S.meta.gameMin,
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

// tickOnce — exécute UNE minute de simulation. Sans render.
// opts.silent=true → réduit/coupe les logs et ralentit certains événements
// pour les sessions de rattrapage hors ligne (évite l'inflation).
export function tickOnce(opts = {}) {
  const silent = !!opts.silent;
  const incidentRate = silent ? OFFLINE_INCIDENT_RATE : 1.0;

  // Avance temps
  S.meta.gameMin += MIN_PER_TICK;
  if (!silent) S.meta.sessionMs += TICK_MS;

  // Production / consommation
  const rate = computeRates();
  let energyShortfall = false;
  for (const k of RESOURCES) {
    let next = S.res[k] + rate[k];
    if (next < 0) {
      if (k === 'energie') energyShortfall = true;
      next = 0;
    }
    if (next > capOf(k)) next = capOf(k);
    S.res[k] = next;
  }
  if (energyShortfall && !silent && tickCount % 30 === 0) {
    log('warn', "Pénurie d'énergie : modules dépendants en sous-régime.");
  }

  // Avance chantier
  if (S.build) {
    S.build.doneMin += MIN_PER_TICK;
    if (S.build.doneMin >= S.build.totalMin) finishBuild();
  }
  // Avance chantier vaisseau
  if (S.vesselBuild) {
    S.vesselBuild.doneMin += MIN_PER_TICK;
    if (S.vesselBuild.doneMin >= S.vesselBuild.totalMin) finishVesselBuild();
  }
  // Avance les expéditions
  tickExpeditions();
  // Avance recherches en cours (0.13)
  tickResearch();
  // Avance fabrications atelier (0.14)
  tickFabrication();
  // Évolution sociale et vieillissement (0.18)
  tickRelations();
  tickRelationMoraleEffects();
  tickAging();
  // Événements de colonie (0.19)
  tickColonyEvents(opts.silent);
  // Arcs narratifs (0.20)
  tickArcs();
  // Diplomatie (0.21)
  tickFactions();
  tickDiplomaticMissions();

  // Avance formations
  if (S.training.length > 0) {
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
  // Avance traitements
  if (S.treatments.length > 0) {
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
  for (const m of S.crew) {
    progressMemberStatuts(m);
  }
  // Incidents — taux réduit en mode silencieux
  if (S.crew.length > 0 && S.modules.habitat) {
    if (Math.random() < incidentRate) rollColonyIncident();
  }
  // Scan toutes les 60 min jeu
  if (S.modules.antenne && tickCount % 60 === 0) {
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
  // Recrutement
  if (S.modules.balise_recrutement && S.flags.recrutement) {
    const lvl = S.modules.balise_recrutement.level;
    const intervalMin = 1440 / lvl;
    const maxQueue = 2 * lvl;
    if (S.candidates.length < maxQueue && S.meta.gameMin >= S.nextRecruitMin) {
      const c = genCandidate();
      S.candidates.push(c);
      if (!silent) {
        log('neutral', `Signal reçu : <em>${c.name}</em> (${c.origin.label}) propose ses services.`);
      }
      const variance = intervalMin * 0.3 * (Math.random() * 2 - 1);
      S.nextRecruitMin = S.meta.gameMin + intervalMin + variance;
    }
    if (S.nextRecruitMin < S.meta.gameMin && S.candidates.length >= maxQueue) {
      S.nextRecruitMin = S.meta.gameMin + intervalMin;
    }
  }

  tickCount++;
}

// tick — appelé par setInterval, simule 1 minute jeu et render.
export function tick() {
  tickOnce({ silent: false });
  S.meta.lastTickRealMs = Date.now();
  if (tickCount % AUTOSAVE_EVERY === 0) save();
  render();
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
  const member = {
    ...c,
    id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9999).toString(36),
    joinedAt: S.meta.gameMin,
    birthGameMin: S.meta.gameMin - (c.age || 30) * 43200,  // 0.18 — vieillissement
    statut: 'libre',          // libre | formation | infirmerie | expedition | mort
    sante: 100,
    statuts: [],              // [{ key, since, revealed, severityNow }]
    sequels: [],              // séquelles permanentes [{ key, since }]
    blessures: []             // legacy, gardé pour compat
  };
  S.crew.push(member);
  log('success', `<em>${member.name}</em> rejoint l'avant-poste. Origine : ${member.origin.label}.`);
  // Auto-affectation au meilleur poste libre éligible
  autoAssignMember(member.id);
  render();
}

export function refuseCandidate(id) {
  const idx = S.candidates.findIndex(c => c.id === id);
  if (idx < 0) return;
  const c = S.candidates[idx];
  S.candidates.splice(idx, 1);
  log('neutral', `Candidature de <em>${c.name}</em> écartée.`);
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

export function save() {
  S.meta.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch (e) {
    console.warn('Sauvegarde échouée', e);
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Migration douce : champs ajoutés en 0.2.0 / 0.3.0 / 0.4.0 / 0.5.0
    if (!data.crew) data.crew = [];
    if (!data.candidates) data.candidates = [];
    if (!data.training) data.training = [];
    if (!data.treatments) data.treatments = [];
    if (typeof data.nextRecruitMin !== 'number') data.nextRecruitMin = 0;
    if (typeof data.nextIncidentMin !== 'number') data.nextIncidentMin = data.meta.gameMin + 60*8;
    if (!data.flags) data.flags = {};
    // Migration équipage : ajouter statuts[] et sante si manquants
    for (const m of data.crew) {
      if (!m.statuts) m.statuts = [];
      if (typeof m.sante !== 'number') m.sante = 100;
      if (!m.sequels) m.sequels = [];
    }
    // Galaxie : générée la première fois qu'on charge une save antérieure à 0.5
    if (!data.galaxy) {
      if (!data.meta.seed) data.meta.seed = 'drift-legacy-' + (data.meta.created || Date.now()).toString(36);
      data.galaxy = genGalaxy(data.meta.seed);
    }
    if (!data.ui) data.ui = { galaxyView:'list', galaxySubtab:'cartographie', currentSystemId:null, currentBodyId:null };
    if (!data.ui.galaxySubtab) data.ui.galaxySubtab = 'cartographie';
    // 0.6.0
    if (!data.fleet) data.fleet = [];
    if (data.vesselBuild === undefined) data.vesselBuild = null;
    if (!data.expeditions) data.expeditions = [];
    if (!data.expHistory) data.expHistory = [];
    // 0.7.0 : temps réel
    if (!data.meta.lastTickRealMs) data.meta.lastTickRealMs = data.meta.lastSave || Date.now();
    // 0.9.0 : postes
    if (!data.assignments) data.assignments = {};
    if (typeof data.autoAssign !== 'boolean') data.autoAssign = true;
    // 0.11 : inventaire
    if (!data.inventory) {
      data.inventory = {};
      // Optionnel : on peut récupérer les items des expéditions historiques pour pré-remplir l'inventaire
      if (Array.isArray(data.expHistory)) {
        for (const h of data.expHistory) {
          const items = h.result?.items;
          if (Array.isArray(items) && items.length > 0) {
            for (const raw of items) {
              const def = ITEM_NAME_TO_ID[raw] || (ITEMS[raw] ? raw : null);
              if (def) data.inventory[def] = (data.inventory[def] || 0) + 1;
            }
          }
        }
      }
    }
    // 0.12 : bibliothèque de schémas
    if (!data.discoveries) data.discoveries = {};
    // Si la save contenait déjà des blueprints en inventaire (improbable), les marquer comme découverts
    if (data.inventory) {
      for (const id in data.inventory) {
        if (BLUEPRINTS[id] && !data.discoveries[id]) {
          data.discoveries[id] = { firstFoundAt: data.meta.gameMin || 0, source: 'récupéré' };
        }
      }
    }
    // 0.13 : tech tree
    if (!data.techCompleted) data.techCompleted = {};
    if (!data.research) data.research = [];
    if (typeof data.alienDatacubes !== 'number') data.alienDatacubes = 0;
    // 0.14 : atelier
    if (!data.fabrication) data.fabrication = [];
    // 0.18 : relations sociales
    if (!data.relations) data.relations = {};
    // Pour les colons existants, calcule birthGameMin si absent
    if (data.crew) {
      for (const m of data.crew) {
        if (typeof m.birthGameMin !== 'number') {
          m.birthGameMin = (data.meta?.gameMin || 0) - (m.age || 30) * 43200;  // 30j × 24h × 60min
        }
      }
    }
    // 0.19 : événements de colonie — initialise les cooldowns
    if (typeof data.nextEventMin !== 'number') data.nextEventMin = (data.meta?.gameMin || 0) + 24 * 60;
    if (typeof data.lastHommageMin !== 'number') data.lastHommageMin = -99999;
    if (typeof data.lastVisitorMin !== 'number') data.lastVisitorMin = -99999;
    if (typeof data.lastMerchantMin !== 'number') data.lastMerchantMin = -99999;
    // 0.20 : arcs narratifs
    if (!data.arcs) data.arcs = {};
    if (!data.unlockedLegendaryTechs) data.unlockedLegendaryTechs = {};
    if (!data.permanentBonuses) data.permanentBonuses = {};
    // 0.21 : diplomatie
    if (!data.factions) data.factions = {};
    if (!data.diplomaticMissions) data.diplomaticMissions = [];
    // 0.22 : postes persistants — pas de migration de données nécessaire,
    // S.assignments existait déjà. Les colons existants en mission/soin
    // n'avaient pas de poste assigné, ils en obtiendront un au retour via returnToBase.
    // 0.24 : chroniques planétaires — pas de migration nécessaire,
    // body.chronicle est ajouté à la première visite par tryAssignChronicle()
    data.meta.version = VERSION;
    return data;
  } catch (e) { return null; }
}

export function exportSave() {
  save();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
  a.href = url;
  a.download = `drift_save_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Sauvegarde exportée');
}

export function importSave(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data?.meta || !data?.res) throw new Error('Format invalide');
      S = data;
      save();
      render();
      toast('Sauvegarde restaurée');
      log('neutral', 'Mémoire restaurée depuis archive externe.');
    } catch (err) {
      toast('Échec import : ' + err.message);
    }
  };
  reader.readAsText(file);
}

export function resetGame() {
  showModal({
    title: 'Tout recommencer ?',
    body: "Cette action efface l'avant-poste actuel et redémarre une nouvelle fondation. Aucun retour possible.",
    primaryLabel: 'Confirmer',
    primaryClass: 'danger',
    onPrimary: () => {
      localStorage.removeItem(SAVE_KEY);
      S = freshState();
      seedJournal();
      save();
      render();
      toast('Nouvelle fondation établie');
    }
  });
}
