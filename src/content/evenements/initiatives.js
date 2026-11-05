// src/content/evenements/initiatives.js — un colon propose quelque chose.
// Migrés de COLONY_EVENTS (0.33).
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'initiative_jardin',
    titre: 'Nouvelle technique de culture',
    theme: 'Initiative',
    ton: 'positif',
    si: 'colonie.module.hydroponie >= 2',
    acteurs: { colon: { filtre: 'acteur.survie >= 2' } },
    delai: '36h',
    texte: '{colon} propose une nouvelle technique de culture. Elle nécessite un peu de temps.',
    choix: [
      { label: 'Lui donner les moyens', cout: { biomasse: 45 },
        effets: [{ texte: "{colon} double le rendement de la cuve d'essai." }, { gain: { biomasse: 150, datacubes: 12 } }] },
      { label: 'Plus tard',
        effets: [{ texte: "{colon} comprend. Mais l'élan est passé." }, { moral: { cible: 'colonie', valeur: -3 } }] },
    ],
  }),

  evenement({
    id: 'initiative_atelier',
    titre: "Idée pour l'atelier",
    theme: 'Initiative',
    ton: 'positif',
    si: 'colonie.module.atelier >= 2',
    acteurs: { colon: { filtre: 'acteur.ingenierie >= 3' } },
    delai: '36h',
    // « Elle pense » s'accorde désormais avec le colon
    texte: "{colon} a une idée pour optimiser l'atelier. {colon|Il|Elle} pense pouvoir doubler la précision de fabrication.",
    choix: [
      { label: "L'autoriser à expérimenter", cout: { metal: 60, cristal: 30 },
        effets: [{ texte: '{colon} valide son hypothèse. Données techniques précieuses.' }, { gain: { datacubes: 36 } }] },
      { label: "Demander un mémo détaillé d'abord", requiert: 'equipe.science >= 2',
        effets: [{ texte: '{colon} produit un dossier rigoureux. La méthode est intégrée sans coût.' }, { gain: { datacubes: 24 } }] },
      { label: 'Refuser, trop coûteux',
        effets: [{ texte: '{colon} se replie sur ses tâches. Un peu déçu{colon.e}.' }, { moral: { cible: 'colonie', valeur: -3 } }] },
    ],
  }),

  evenement({
    id: 'volontaire',
    titre: 'Volontaire pour patrouiller',
    theme: 'Initiative',
    ton: 'positif',
    acteurs: { colon: { filtre: 'acteur.libre && acteur.combat >= 2' } },
    delai: '36h',
    texte: '{colon} demande à former une patrouille de reconnaissance autour de la colonie.',
    choix: [
      // « L'autoriser pour 12h » : la durée ne correspondait à aucune règle
      { label: "L'autoriser à patrouiller",
        effets: [{ texte: '{colon} ramène quelques échantillons et une cartographie locale.' }, { gain: { biomasse: 60, datacubes: 12 } }] },
      { label: 'Demander un planning précis', requiert: 'equipe.science >= 1',
        effets: [{ texte: 'Mission cadrée. Données utiles, sans perte de temps.' }, { gain: { datacubes: 30 } }] },
      { label: 'Refuser. Trop risqué.',
        effets: [{ texte: '{colon} comprend. Frustration discrète.' }, { moral: { cible: 'colonie', valeur: -3 } }] },
    ],
  }),
];
