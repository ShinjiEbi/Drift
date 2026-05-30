// constants.js — constantes globales (versions, multiplicateurs, libellés)
// Extrait depuis app.js lors de la modularisation

export const VERSION = '0.32.0';

export const SAVE_KEY = 'drift_save_v1';

export const TICK_MS = 1000;

export const MIN_PER_TICK = 1;

export const AUTOSAVE_EVERY = 10;

// --- Multiplicateurs de rythme (ajustables) ---
// Facteur sur la durée des chantiers : 1 = rapide, 3 = posé, 5 = contemplatif
export const BUILD_TIME_MULT = 3;

// Facteur sur la production ET la consommation des modules.
// Diminue les deux en parallèle, donc préserve les ratios prod/upkeep.
// 1 = original, 0.5 = moitié plus lent, 0.3 = très lent
export const PROD_MULT = 0.5;

// --- Temps réel (offline progression) ---
// Plafond de rattrapage à la reprise : si tu reviens après 5 jours,
// on ne simule que les N dernières heures pour éviter inflation et avalanche.
export const OFFLINE_MAX_HOURS = 12;

// Pendant le rattrapage, on peut éventuellement réduire les évènements.
// 1.0 = identique au temps réel, 0.5 = deux fois moins de stress.
export const OFFLINE_INCIDENT_RATE = 0.5;

export const RESOURCES = ['metal', 'cristal', 'energie', 'biomasse', 'datacubes']

export const RES_LABELS = {
  metal:     'Métal',
  cristal:   'Cristal',
  energie:   'Énergie',
  biomasse:  'Biomasse',
  datacubes: 'Datacubes'
}

// Stocks de départ : de quoi construire le premier vrai module
export const START_RESOURCES = {
  metal: 220, cristal: 90, energie: 100, biomasse: 100, datacubes: 0
}

// Capacité de stockage (modulable plus tard via modules de stockage)
export const CAP = {
  metal: 1000, cristal: 800, energie: 400, biomasse: 300, datacubes: 200
}

// Coefficient minimum quand un bâtiment n'a aucun colon affecté (mode automatisé)
export const JOB_BASE_FRACTION = 0.30;

// Multiplicateur de biomasse consommée par un colon affecté à un poste
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
// Constantes
export const YEAR_IN_GAME_MIN = 30 * 24 * 60;

// Seuils de relations
export const REL_LOVE     = 80;

export const REL_FRIEND   = 40;

export const REL_RIVAL    = -40;

export const REL_RANCUNE  = -70;
