// src/content/incidents/laboratoire.js — incidents du Laboratoire.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'labo_fuite_donnees',
    titre: 'Données corrompues',
    module: 'laboratoire',
    gravite: 'serieux',
    texte: "Une partie des données de recherche s'est corrompue. Cause inconnue.",
    choix: [
      { label: "Récupérer ce qui peut l'être", requiert: 'equipe.science >= 2',
        effets: [{ texte: 'Récupération partielle. Pertes limitées.' }, { perte: { datacubes: 30 } }] },
      { label: 'Tout recommencer',
        effets: [
          { texte: "Recherche en cours retardée d'une demi-heure." },
          { perte: { datacubes: 90 } },
          { retardRecherche: '30min' },
        ] },
      { label: 'Suspendre temporairement',
        effets: [{ texte: 'Pause stratégique. Le labo investigue.' }, { perte: { datacubes: 15 } }] },
    ],
  }),

  incident({
    id: 'labo_etude_inattendue',
    titre: 'Corrélation inattendue',
    module: 'laboratoire',
    gravite: 'mineur',
    ton: 'positif',
    texte: 'Une corrélation inattendue est repérée dans les données existantes.',
    choix: [
      { label: 'Approfondir', requiert: 'equipe.science >= 3',
        effets: [{ texte: 'Découverte mineure mais réelle. Données précieuses.' }, { gain: { datacubes: 75 } }] },
      { label: 'Documenter et continuer',
        effets: [{ texte: 'Note ajoutée au registre du labo.' }, { gain: { datacubes: 30 } }] },
    ],
  }),
];
