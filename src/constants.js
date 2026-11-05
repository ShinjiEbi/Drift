// constants.js — constantes globales (versions, rythme, multiplicateurs, libellés)
// Extrait depuis app.js lors de la modularisation

export const VERSION = '0.33.0';

export const SAVE_KEY = 'drift_save_v1';

// Version du FORMAT de sauvegarde (entier). Incrémentée à chaque migration
// de données. Les sauvegardes ≤ 0.32 n'en ont pas (= schéma 0).
//   1 : 0.33 (file des décisions, ancienneté des postes)
//   2 : V1 (rythme en temps réel : durées converties, files de chantiers et de recherche)
export const SAVE_SCHEMA_VERSION = 2;

// Copies de secours gardées dans localStorage (clés SAVE_KEY + '_backup_<horodatage>')
export const SAVE_BACKUP_MAX = 3;

// ============================================================
//   RYTHME EN TEMPS RÉEL — table PACING (source unique des durées)
// ============================================================
// 1 tick = 1 seconde réelle. S.meta.gameMin (nom historique) compte les ticks.
// Toutes les durées ci-dessous sont en ticks, donc en secondes réelles.
// Pour régler le rythme du jeu, c'est ici (et seulement ici) qu'on intervient.
const MIN = 60, HEURE = 3600, JOUR = 86400;

export const PACING = {
  MINUTE: MIN, HEURE, JOUR,

  // ---- Chantiers de modules ----
  // durée(niveau) = BUILD_BASE[module] × BUILD_GROWTH^(niveau − 1)
  // Ex. Mine de surface (80 s) : niv 1 ≈ 1 min 20 · niv 4 ≈ 16 min · niv 6 ≈ 1 h 25 · niv 8 ≈ 7 h 30.
  BUILD_GROWTH: 2.3,
  BUILD_BASE: {
    commandement: 120, generateur_solaire: 60,  mine_surface: 80,  hydroponie: 75,
    habitat: 80,       laboratoire: 100,        atelier: 100,      hangar: 150,
    antenne: 100,      balise_recrutement: 90,  quartiers_residentiels: 400,
    formation: 150,    infirmerie: 100,         ambassade: 200,    silo_cryogenique: 200,
    // modules tier 2 (débloqués par la recherche) : 20 min à 1 h au niveau 1
    mine_profonde: 1200, reacteur_fusion: 1800, bioreacteur: 1500,
    synthetiseur_quantique: 3600, memoire_cristalline: 1800,
  },
  BUILD_BASE_DEFAULT: 90,
  // Coût des modules : barème du catalogue × COST_GROWTH^(niveau − 1) (niv 5 ×2,1 · niv 8 ×3,6)
  COST_GROWTH: 1.2,
  BUILD_QUEUE_MAX: 3,          // chantiers en attente derrière le chantier en cours

  // ---- Recherche, atelier, vaisseaux ----
  // Les durées du catalogue (tech.cost.time, fab.time, vaisseau.buildHours × 60)
  // sont des « unités » héritées, converties en secondes réelles × TIME_UNIT.
  // Recherche : tier 1 (180-240) ≈ 36-48 min · tier 2 (360) ≈ 1 h 12 · tier 4 (960-1440) ≈ 3 h 12-4 h 48.
  // Atelier : 60 → 12 min · 840 → 2 h 48. Vaisseaux : vedette (24 h) → 4 h 48 · cargo (48 h) → 9 h 36.
  TIME_UNIT: 12,
  RESEARCH_QUEUE_MAX: 1,       // recherches en attente derrière les places du laboratoire

  // ---- Formation ----
  // durée = programme.baseHours × √(niveau visé) × TRAINING_UNIT (× traits et bonus)
  // Médecine niv 2 (8 h) ≈ 1 h 53 · Linguistique niv 4 (12 h) = 4 h.
  TRAINING_UNIT: 600,

  // ---- Soins (valeurs du catalogue déjà en secondes réelles) ----
  // Durées des traitements : sutures 40 min, antibiotiques 1 h 20, chirurgie 2 h, thérapie longue 6 h.
  // Délais des statuts non traités : blessure grave mortelle en 12 h, infection 36 h,
  // pathogène 48 h, parasite 3,5 jours, blessure légère guérie seule en 24 h.
  DIAG_RETRY: 10 * MIN,        // nouvel examen après un diagnostic non concluant
  CONTAGION_PERIOD: 12 * HEURE, // le taux de contagion d'un statut (perDay) vaut par période
  AUTO_CARE_EVERY: 30,         // soins automatiques (infirmerie avec soignant) : vérification /30 s

  // ---- Expéditions ----
  // aller = EXPED_BASE + distance × EXPED_PER_PC × vitesse du vaisseau
  // Vedette, système d'origine (0,6 pc) ≈ 11 min l'aller ; navette à 3 pc ≈ 37 min l'aller.
  EXPED_BASE: 420,
  EXPED_PER_PC: 600,
  EXPED_ONSITE: 10 * MIN,      // temps estimé sur place (scènes), pour l'affichage et les vivres
  EXPED_BIO_PER_MEMBER_HOUR: 30, // vivres nominaux (× indice de production, cf. prodIndex)
  FUEL_SCALE: 2,               // carburant nominal (× indice de production)
  LOOT_RECOVERY: 3 * JOUR,     // un site fouillé se reconstitue en 3 jours
  // Scènes d'exploration par expédition, entre l'arrivée et le départ
  EXP_SCENES_MIN: 2,
  EXP_SCENES_MAX: 4,

  // ---- Incidents et événements ----
  INCIDENT_FIRST: 25 * MIN,    // premier incident possible (partie neuve)
  INCIDENT_GAP_MIN: 1 * HEURE, // espacement entre deux incidents
  INCIDENT_GAP_MAX: 2.5 * HEURE,
  INCIDENT_QUEUE_MAX: 2,       // incidents en attente au plus (au-delà, plus de tirage)
  EVENT_FIRST: 45 * MIN,       // premier événement de colonie (partie neuve)
  EVENT_GAP_MIN: 3 * HEURE,
  EVENT_GAP_MAX: 6 * HEURE,
  EVENT_QUEUE_MAX: 2,          // événements en attente au plus
  EVENT_ON_RETURN_AFTER: 2 * HEURE, // absence au-delà : un événement garanti au retour
  EVENT_REPEAT_GAP: 36 * HEURE, // un même événement ne revient pas avant 36 h
  DECISIONS_MAX: 3,            // file des décisions : au-delà, la plus ancienne mineure est tranchée
  // Contenu hérité (incidents, événements de 0.33) : ses durées sont écrites en
  // « minutes de jeu » (360 = « 6 h jeu ») ; le moteur les multiplie par ce facteur.
  LEGACY_GAME_MIN: 10,

  // ---- Recrutement et équipage ----
  // Recrutement lent : 3 candidats par jour au niveau 1 de la balise, 5 au niveau 6.
  // (Simulation : à 5 h ÷ (1 + 0,3 × (niv − 1)), un joueur régulier comptait 172 colons
  // au 21e jour et les noms perdaient leur poids.)
  RECRUIT_INTERVAL: 8 * HEURE, // un candidat toutes les ~8 h au niveau 1 de la balise
  RECRUIT_LEVEL_SPEEDUP: 0.12, // intervalle ÷ (1 + 0,12 × (niveau − 1)) : niv 6 = 5 h
  RECRUIT_QUEUE: [0, 2, 2, 2, 3, 3, 3], // candidats en attente au plus, par niveau de balise
  RECRUIT_JITTER: 0.25,        // ± 25 % sur l'intervalle
  SALARY_PER_POINT: 40,        // salaire : biomasse par jour réel et par point de prétention
  FOOD_PER_WORKER: 0.6,        // vivres d'un colon en poste : biomasse nominale par minute
  UNPAID_MORAL_PER_HOUR: 2,    // biomasse à zéro : moral perdu par heure (salaires impayés)
  YEAR: 7 * JOUR,              // vieillissement : 1 an = 7 jours réels

  // ---- Diplomatie ----
  GIFT_COOLDOWN: 12 * HEURE,
  CARAVAN_CYCLE: 2 * JOUR,
  DIPLO_MISSION_MIN: 4 * HEURE,
  DIPLO_MISSION_MAX: 8 * HEURE,

  // ---- Chroniques (moteur narratif) ----
  CHRONICLE_GAP_MIN: 12 * HEURE, // délai entre deux épisodes d'une chronique (« La suite est prête »)
  CHRONICLE_GAP_MAX: 24 * HEURE,

  // ---- Absence ----
  OFFLINE_MAX: 12 * HEURE,     // rattrapage hors ligne : au plus 12 h simulées
};

// File des décisions (incidents / événements) en attente du joueur :
// au-delà, la plus ancienne mineure est résolue automatiquement.
export const MAX_PENDING_DECISIONS = PACING.DECISIONS_MAX;

export const TICK_MS = 1000;

// Historique : un tick avance S.meta.gameMin de 1 (une seconde réelle).
export const MIN_PER_TICK = 1;

export const AUTOSAVE_EVERY = 10;

// Unité des durées héritées du catalogue (recherche, atelier, vaisseaux) : cf. PACING.TIME_UNIT.
// Conservé pour l'interface : durée réelle = tech.cost.time × BUILD_TIME_MULT,
// fab.time × BUILD_TIME_MULT, vaisseau.buildHours × 60 × BUILD_TIME_MULT.
export const BUILD_TIME_MULT = PACING.TIME_UNIT;

// Facteur de production PAR TICK (seconde réelle) appliqué aux valeurs du catalogue
// (production et entretien des modules, « par minute » nominale). 1/720 : une valeur
// nominale de 12/min rapporte 1 unité par minute réelle (60 par heure).
// Le carburant, les vivres d'expédition et des colons y sont indexés (PROD_INDEX).
export const PROD_MULT = 1 / 720;

// Indice de production : valeur nominale « par minute » → unités par minute réelle.
export const PROD_INDEX = PROD_MULT * 60;

// --- Temps réel (offline progression) ---
// Plafond de rattrapage à la reprise (heures).
export const OFFLINE_MAX_HOURS = PACING.OFFLINE_MAX / 3600;

// Pendant le rattrapage, probabilité de tirage des incidents (l'espacement
// PACING.INCIDENT_GAP_* domine de toute façon).
export const OFFLINE_INCIDENT_RATE = 0.5;

export const RESOURCES = ['metal', 'cristal', 'energie', 'biomasse', 'datacubes']

export const RES_LABELS = {
  metal:     'Métal',
  cristal:   'Cristal',
  energie:   'Énergie',
  biomasse:  'Biomasse',
  datacubes: 'Datacubes'
}

// Stocks de départ : de quoi poser les premiers modules et lancer la première expédition
export const START_RESOURCES = {
  metal: 500, cristal: 250, energie: 200, biomasse: 250, datacubes: 30
}

// Capacité de stockage de base. Elle augmente avec les modules (capBonus :
// mine, hydroponie, générateur, laboratoire, silo…) et les techs de stockage.
export const CAP = {
  metal: 1000, cristal: 800, energie: 400, biomasse: 400, datacubes: 200
}

// Coefficient minimum quand un bâtiment n'a aucun colon affecté (mode automatisé)
export const JOB_BASE_FRACTION = 0.30;

// Multiplicateur de vivres d'un colon affecté à un poste (cf. PACING.FOOD_PER_WORKER)
export const JOB_BIOMASSE_MULT = 1.5;

export const SKILL_LIST = ['medecine','ingenierie','science','pilotage','combat','linguistique','survie']

export const SKILL_LABELS = {
  medecine:'Médecine', ingenierie:'Ingénierie', science:'Science',
  pilotage:'Pilotage', combat:'Combat', linguistique:'Linguistique', survie:'Survie'
}

export const STAT_LABELS = {
  vigueur:'Vigueur', dexterite:'Dextérité', intellect:'Intellect',
  sangfroid:'Sang-froid', charisme:'Charisme'
}

// ============================================================
//   RELATIONS SOCIALES & VIEILLISSEMENT (0.18)
// ============================================================
// Durée d'une année de vie des colons, en ticks (V1 : 7 jours réels).
export const YEAR_IN_GAME_MIN = PACING.YEAR;

// Seuils de relations
export const REL_LOVE     = 80;

export const REL_FRIEND   = 40;

export const REL_RIVAL    = -40;

export const REL_RANCUNE  = -70;
