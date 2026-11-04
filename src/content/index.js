// src/content/index.js — sommaire du contenu narratif (V1).
//
// Tout fichier de contenu doit être importé ici pour exister dans le jeu.
// tools/check-content.mjs signale un fichier de src/content/ oublié.
// Données pures : ce module n'importe que des fichiers de contenu.

// ---- Histoires (chroniques planétaires), un fichier par histoire ----
import pulsarSilencieux from './histoires/pulsar-silencieux.js';
import sanctuaireVert from './histoires/sanctuaire-vert.js';
import couveeDormante from './histoires/couvee-dormante.js';
import anneauTrace from './histoires/anneau-trace.js';
import veilleursBeth from './histoires/veilleurs-beth.js';
import marcheEtrange from './histoires/marche-etrange.js';

// ---- Scènes d'expédition génériques, par lieu ou thème ----
import arriveesDeparts from './scenes/arrivees-departs.js';
import ruinesHumaines from './scenes/ruines-humaines.js';
import ruinesCristallines from './scenes/ruines-cristallines.js';
import ruinesOrganiques from './scenes/ruines-organiques.js';
import ruinesMelees from './scenes/ruines-melees.js';
import fauneFlore from './scenes/faune-flore.js';
import anomaliesSignaux from './scenes/anomalies-signaux.js';
import epavesStations from './scenes/epaves-stations.js';
import dangers from './scenes/dangers.js';
import civilisations from './scenes/civilisations.js';
import biomes from './scenes/biomes.js';
import haltes from './scenes/haltes.js';

const parId = list => Object.fromEntries(list.map(x => [x.id, x]));

// Histoires par id (l'ordre de la liste est l'ordre d'affichage par défaut)
export const HISTOIRES = parId([pulsarSilencieux, sanctuaireVert, couveeDormante, anneauTrace, veilleursBeth, marcheEtrange]);

// Scènes d'expédition (tableau : catalog.js le réexporte sous le nom SCENES)
export const SCENES = [
  ...arriveesDeparts, ...ruinesHumaines, ...ruinesCristallines, ...ruinesOrganiques, ...ruinesMelees,
  ...fauneFlore, ...anomaliesSignaux, ...epavesStations, ...dangers, ...civilisations, ...biomes, ...haltes,
];

// ---- Vague 2 : dossiers prêts, encore vides (voir le LISEZMOI de chaque dossier) ----
export const EVENEMENTS = [];   // ./evenements/  événements de colonie
export const INCIDENTS = [];    // ./incidents/   incidents de module
export const ARCS = [];         // ./arcs/        fils rouges
export const PERSONNAGES = {};  // ./personnages/ PNJ partagés entre plusieurs contenus
export const FACTIONS = [];     // ./factions/    types de factions et porte-parole
export const LORE = [];         // ./lore/        pages d'archives
