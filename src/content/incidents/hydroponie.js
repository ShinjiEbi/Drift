// src/content/incidents/hydroponie.js — incidents de l'Hydroponie.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'hydro_contamination',
    titre: 'Contamination hydroponique',
    module: 'hydroponie',
    gravite: 'serieux',
    texte: "Une cuve d'hydroponie présente des signes de contamination. Couleur, odeur, mucus en surface.",
    choix: [
      { label: 'Vider et désinfecter',
        effets: [
          { texte: "Cuve sauvée mais récolte perdue. L'hydroponie reste arrêtée le temps du nettoyage." },
          { perte: { biomasse: 120 } },
          { module: { horsService: '40min' } },
        ] },
      { label: "Identifier l'agent", requiert: 'equipe.medecine >= 2',
        effets: [
          { texte: 'Diagnostic rapide. Pertes minimisées et données récoltées.' },
          { perte: { biomasse: 45 } },
          { gain: { datacubes: 24 } },
        ] },
      { label: 'Ignorer et espérer',
        test: { carac: 'sangfroid', difficulte: 5,
          reussite: [
            { texte: "La contamination se résorbe d'elle-même. Coup de chance." },
            { perte: { biomasse: 15 } },
          ],
          echec: [
            { texte: "La contamination s'est étendue. {victime} est touché{victime.e}. La production souffre durablement." },
            { perte: { biomasse: 240 } },
            { statut: { cible: 'victime', id: 'pathogene_alien' } },
            { effetTemporaire: { titre: 'Hydroponie contaminée', prod: 0.7, duree: '2h' } },
            { module: { niveau: -1 } },
            { moral: { cible: 'colonie', valeur: -6 } },
            { annales: "L'hydroponie a été abandonnée à la contamination. {victime} en a payé le prix." },
          ] } },
    ],
  }),

  incident({
    id: 'hydro_recolte_abondante',
    titre: 'Récolte abondante',
    module: 'hydroponie',
    gravite: 'mineur',
    ton: 'positif',
    texte: 'Une variété montre un rendement inattendu. Le Bio-technicien suggère une sélection.',
    choix: [
      { label: 'Conserver les graines', requiert: 'equipe.science >= 1',
        effets: [{ texte: "Souche améliorée intégrée à l'hydroponie." }, { gain: { biomasse: 90, datacubes: 15 } }] },
      { label: 'Récolter tout maintenant',
        effets: [{ texte: 'Récolte exceptionnelle, mais la souche est perdue.' }, { gain: { biomasse: 150 } }] },
    ],
  }),
];
