// src/content/incidents/atelier.js — incidents de l'Atelier.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'atelier_accident',
    titre: "Accident à l'atelier",
    module: 'atelier',
    gravite: 'serieux',
    texte: 'Un accident de fabrication. {victime} était sur le poste.',
    choix: [
      { label: 'Soigner et reprendre',
        effets: [
          { texte: '{victime} est légèrement blessé{victime.e}. La fabrication a perdu des composants.' },
          { statut: { cible: 'victime', id: 'blessure_legere' } },
          { perte: { metal: 30 } },
        ] },
      { label: 'Audit de sécurité', requiert: 'equipe.ingenierie >= 2',
        effets: [{ texte: 'Audit effectué. Cause identifiée. Reprise propre.' }, { perte: { metal: 15 } }] },
      { label: 'Évacuer la pièce immédiatement',
        effets: [{ texte: 'Évacuation préventive. Aucune blessure mais perte matérielle.' }, { perte: { metal: 75, cristal: 30 } }] },
    ],
  }),

  incident({
    id: 'atelier_innovation',
    titre: 'Innovation de procédé',
    module: 'atelier',
    gravite: 'mineur',
    ton: 'positif',
    texte: 'Le Maître-artisan propose une amélioration de procédé.',
    choix: [
      { label: "Tester l'idée", requiert: 'equipe.ingenierie >= 3',
        effets: [{ texte: "L'amélioration fonctionne. Procédé adopté." }, { gain: { datacubes: 24, metal: 45 } }] },
      { label: 'Garder la procédure standard',
        effets: [{ texte: 'Statu quo préservé.' }, { gain: { metal: 15 } }] },
    ],
  }),
];
