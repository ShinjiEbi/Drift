// src/content/evenements/plaintes.js — l'équipage réclame. Migrés de COLONY_EVENTS (0.33).
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'plainte_repas',
    titre: 'Plainte sur les rations',
    theme: 'Plainte',
    ton: 'negatif',
    si: 'colonie.colons >= 4 && colonie.reserve.biomasse < 0.3',
    acteurs: { colon: {} },
    delai: '36h',
    texte: "L'équipage se plaint des rations. Plusieurs colons mangent à peine. {colon} parle au nom des autres.",
    choix: [
      { label: 'Augmenter les portions à court terme', cout: { biomasse: 90 },
        effets: [{ texte: "L'équipage est apaisé. Les estomacs sont pleins ce soir." }, { moral: { cible: 'colonie', valeur: 9 } }] },
      { label: 'Distribuer une ration concentrée', consomme: 'ration_concentree',
        effets: [{ texte: 'La ration est partagée. Geste apprécié.' }, { moral: { cible: 'colonie', valeur: 6 } }] },
      { label: 'Promettre une amélioration future',
        effets: [{ texte: '{colon} hoche la tête, peu convaincu{colon.e}.' }, { moral: { cible: 'colonie', valeur: -6 } }] },
      { label: 'Refuser sèchement',
        effets: [{ texte: 'Le silence retombe. La rancœur monte.' }, { moral: { cible: 'colonie', valeur: -15 } }] },
    ],
  }),

  evenement({
    id: 'plainte_logement',
    titre: 'Plainte sur le logement',
    theme: 'Plainte',
    ton: 'negatif',
    // L'habitat doit exister : le texte en parle
    si: 'colonie.colons >= 3 && colonie.couchettes_libres <= 1 && colonie.module.habitat >= 1 && colonie.module.habitat < 4',
    acteurs: { colon: {} },
    delai: '36h',
    texte: "L'habitat est saturé. {colon} évoque l'inconfort, le manque d'intimité, le bruit constant.",
    choix: [
      { label: 'Promettre une expansion prioritaire',
        effets: [{ texte: "L'équipage attend des actes." }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Distribuer des kits de réparation pour bricoler', consomme: 'kit_reparation',
        effets: [{ texte: "Les colons aménagent leurs espaces. C'est mieux." }, { moral: { cible: 'colonie', valeur: 6 } }] },
      { label: 'Trop occupé pour ça',
        effets: [{ texte: "L'équipe note. La frustration grandit." }, { moral: { cible: 'colonie', valeur: -9 } }] },
    ],
  }),
];
