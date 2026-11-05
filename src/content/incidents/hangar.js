// src/content/incidents/hangar.js — incidents du Hangar.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'hangar_sabotage',
    titre: 'Sabotage au hangar',
    module: 'hangar',
    niveauMin: 2,
    gravite: 'critique',
    texte: 'Un de nos vaisseaux a été saboté pendant la nuit. Coque rayée, conduits trafiqués.',
    choix: [
      { label: 'Enquêter sérieusement', requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Indices recueillis. Le saboteur a peut-être laissé une signature.' },
          { gain: { datacubes: 24 } },
          { annales: 'Une enquête a mis au jour un saboteur dans nos rangs.' },
        ] },
      { label: 'Réparer en urgence', cout: { metal: 150, cristal: 60 },
        effets: [{ texte: 'Réparations effectuées. Origine du sabotage non identifiée.' }] },
      { label: 'Renforcer la sécurité — couvre-feu généralisé',
        effets: [
          // « pour quelques jours » devient « pour la journée » : l'effet dure 8 h réelles
          { texte: "Patrouille renforcée et couvre-feu. La méfiance s'installe pour la journée." },
          { perte: { metal: 60 } },
          { moral: { cible: 'colonie', valeur: -6 } },
          { effetTemporaire: { titre: 'Climat de méfiance : production −15 %', prod: 0.85, duree: '8h' } },
          { annales: "Un couvre-feu a été imposé après un sabotage. L'équipage en garde le souvenir." },
        ] },
    ],
  }),

  incident({
    id: 'hangar_decouverte',
    titre: 'Trouvaille au hangar',
    module: 'hangar',
    gravite: 'mineur',
    ton: 'positif',
    texte: 'Un mécano de bord trouve une amélioration inutilisée dans un coffre oublié.',
    choix: [
      { label: "L'installer sur un vaisseau", requiert: 'equipe.ingenierie >= 2',
        effets: [{ texte: "L'amélioration est intégrée à un vaisseau de la flotte." }, { gain: { datacubes: 18, cristal: 45 } }] },
      { label: "L'archiver",
        effets: [{ texte: 'Le composant est documenté pour usage futur.' }, { gain: { datacubes: 12 } }] },
    ],
  }),
];
