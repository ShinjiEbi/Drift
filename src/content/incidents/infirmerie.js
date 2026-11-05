// src/content/incidents/infirmerie.js — incidents de l'Infirmerie.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'infirmerie_patient_fuit',
    titre: 'Patient en fuite',
    module: 'infirmerie',
    gravite: 'serieux',
    texte: "Un patient a quitté l'infirmerie sans autorisation.",
    choix: [
      { label: 'Le retrouver et le ramener',
        effets: [{ texte: 'Patient retrouvé. Soins repris.' }] },
      { label: "Le laisser. Il sait ce qu'il fait.",
        effets: [{ texte: "L'équipage commente. Le moral en pâtit." }, { moral: { cible: 'colonie', valeur: -3 } }] },
      { label: 'Enquête disciplinaire',
        effets: [{ texte: "Mesure ferme. Le patient est rappelé. Mais l'ambiance pèse." }, { moral: { cible: 'colonie', valeur: -6 } }] },
    ],
  }),

  incident({
    id: 'infirmerie_remede',
    titre: 'Nouvelle formule de soin',
    module: 'infirmerie',
    gravite: 'mineur',
    ton: 'positif',
    texte: 'Un Spécialiste a synthétisé une nouvelle formule de soin à partir de réserves.',
    choix: [
      { label: 'Documenter et stocker',
        effets: [{ texte: 'La formule rejoint les protocoles standard.' }, { gain: { datacubes: 18 } }] },
    ],
  }),
];
