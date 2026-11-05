// src/content/incidents/habitat.js — incidents de l'Habitat.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'habitat_panne_climatisation',
    titre: 'Climatisation en panne',
    module: 'habitat',
    gravite: 'serieux',
    texte: "La climatisation d'une partie de l'habitat tombe en panne. Les colons se plaignent.",
    choix: [
      { label: 'Réparer immédiatement', requiert: 'equipe.ingenierie >= 1', cout: { metal: 30, energie: 45 },
        effets: [{ texte: "Climatisation rétablie. L'équipage apprécie." }] },
      { label: 'Distribuer des rations supplémentaires', consomme: 'ration_concentree',
        effets: [{ texte: "Geste apprécié. L'équipe tient le coup." }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Ignorer (attendre une réparation prévue)',
        effets: [{ texte: "L'équipage a chaud. Et ne se prive pas de le dire." }, { moral: { cible: 'colonie', valeur: -6 } }] },
    ],
  }),

  incident({
    id: 'habitat_anniversaire',
    titre: 'Anniversaire',
    module: 'habitat',
    gravite: 'mineur',
    ton: 'positif',
    // Le colon fêté est nommé (il était anonyme en 0.33)
    texte: "C'est l'anniversaire de {victime}. L'équipage propose une petite célébration.",
    choix: [
      { label: 'Organiser une fête', cout: { biomasse: 60 },
        effets: [{ texte: 'Soirée mémorable. Le moral grimpe.' }, { moral: { cible: 'colonie', valeur: 9 } }] },
      { label: 'Geste discret',
        effets: [{ texte: 'Cadeau modeste mais sincère.' }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Trop occupés cette fois',
        effets: [{ texte: "Personne ne dit rien. Mais quelque chose s'éteint un peu." }, { moral: { cible: 'colonie', valeur: -3 } }] },
    ],
  }),
];
