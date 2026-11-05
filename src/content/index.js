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

// ---- Incidents de module, un fichier par module ----
import incidentsMine from './incidents/mine.js';
import incidentsHydroponie from './incidents/hydroponie.js';
import incidentsSolaire from './incidents/solaire.js';
import incidentsHangar from './incidents/hangar.js';
import incidentsLaboratoire from './incidents/laboratoire.js';
import incidentsAtelier from './incidents/atelier.js';
import incidentsInfirmerie from './incidents/infirmerie.js';
import incidentsHabitat from './incidents/habitat.js';

// ---- Événements de colonie, par thème ou par personnage ----
import evPrologue from './evenements/prologue.js';
import evSocial from './evenements/social.js';
import evInitiatives from './evenements/initiatives.js';
import evPlaintes from './evenements/plaintes.js';
import evDecouvertes from './evenements/decouvertes.js';
import evIlya from './evenements/ilya.js';
import evSeren from './evenements/seren.js';
import evMaud from './evenements/maud.js';

// ---- Fils rouges, un fichier par fil ----
import arcAtterrissage from './arcs/atterrissage.js';
import arcAvantPoste from './arcs/avant-poste.js';
import arcEffondrement from './arcs/effondrement.js';
import arcCristaux from './arcs/cristaux.js';
import arcCouvee from './arcs/couvee.js';

// ---- Personnages partagés (PNJ récurrents), un fichier par personnage ----
import ilya from './personnages/ilya.js';
import seren from './personnages/seren.js';
import maud from './personnages/maud.js';

// ---- Archives (lore), par catégorie ----
import loreHistoire from './lore/histoire.js';
import loreColonie from './lore/colonie.js';
import loreMondes from './lore/mondes.js';
import loreRuines from './lore/ruines.js';
import lorePeuples from './lore/peuples.js';
import loreTechniques from './lore/techniques.js';

const parId = list => Object.fromEntries(list.map(x => [x.id, x]));

// Histoires par id (l'ordre de la liste est l'ordre d'affichage par défaut)
export const HISTOIRES = parId([pulsarSilencieux, sanctuaireVert, couveeDormante, anneauTrace, veilleursBeth, marcheEtrange]);

// Scènes d'expédition (tableau : catalog.js le réexporte sous le nom SCENES)
export const SCENES = [
  ...arriveesDeparts, ...ruinesHumaines, ...ruinesCristallines, ...ruinesOrganiques, ...ruinesMelees,
  ...fauneFlore, ...anomaliesSignaux, ...epavesStations, ...dangers, ...civilisations, ...biomes, ...haltes,
];

// Incidents de module (tableau ; app.js les indexe par id sous le nom INCIDENTS)
export const INCIDENTS = [
  ...incidentsMine, ...incidentsHydroponie, ...incidentsSolaire, ...incidentsHangar,
  ...incidentsLaboratoire, ...incidentsAtelier, ...incidentsInfirmerie, ...incidentsHabitat,
];

// Événements de colonie (tableau ; app.js les indexe par id sous le nom COLONY_EVENTS)
export const EVENEMENTS = [
  ...evPrologue, ...evSocial, ...evInitiatives, ...evPlaintes, ...evDecouvertes,
  ...evIlya, ...evSeren, ...evMaud,
];

// Fils rouges (ordre d'affichage : le prologue, le fil principal, puis les autres)
export const ARCS = [arcAtterrissage, arcAvantPoste, arcEffondrement, arcCristaux, arcCouvee];

// Personnages partagés par id ({ personnage: 'ilya' }, {pnj:ilya}, { recrute: 'maud' })
export const PERSONNAGES = parId([ilya, seren, maud]);

// Pages d'archives (lore)
export const LORE = [...loreHistoire, ...loreColonie, ...loreMondes, ...loreRuines, ...lorePeuples, ...loreTechniques];

// ---- Dossier prêt, encore vide (voir son LISEZMOI) ----
export const FACTIONS = [];     // ./factions/    types de factions et porte-parole
