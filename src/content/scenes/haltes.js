// src/content/scenes/haltes.js — Haltes : courtes scènes de transition, possibles sur la plupart des lieux.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'filler_repos',
    titre: 'La halte',
    lieux: "corps.atmosphere dans ['respirable', 'tenue']",
    poids: 3,
    texte: "L'équipe fait halte. Le casque retiré, on respire — autant que l'air le permet. Quelqu'un partage une ration. Le silence est presque confortable.",
    choix: [
      { label: 'Repartir', effets: [] },
      { label: 'Discuter du retour', effets: [{ texte: "L'équipage est plus soudé." }, { moral: 1 }] },
    ],
  }),

  scene({
    id: 'filler_panorama',
    titre: 'Le panorama',
    lieux: "corps.type dans ['planete', 'lune'] && corps.biome dans ['desert', 'irradie', 'volcanique', 'toundra', 'glace', 'exotique']",
    poids: 2,
    texte: "Au détour d'une dune, le paysage s'ouvre. {decor.biome} Quelqu'un sort un appareil et prend une photo, comme un touriste.",
    choix: [
      { label: 'Continuer', effets: [] },
      {
        label: 'Faire un détour pour relever des données',
        requiert: 'equipe.science >= 1',
        effets: [{ gain: { datacubes: 4 } }],
      },
    ],
  }),

  scene({
    id: 'filler_cache',
    titre: 'Le compartiment enterré',
    lieux: "corps.type dans ['planete', 'lune', 'asteroide_g']",
    poids: 3,
    texte: "Quelqu'un trébuche sur quelque chose dans le sol. En grattant, un compartiment apparaît, scellé sommairement.",
    choix: [
      { label: 'Ouvrir', effets: [{ gain: { metal: 20, cristal: 10 } }] },
      {
        label: 'Forcer rapidement',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [{ gain: { metal: 30, cristal: 20, datacubes: 3 } }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }],
        },
      },
    ],
  }),

  scene({
    id: 'filler_etoiles',
    titre: 'Ciel inconnu',
    lieux: "corps.atmosphere == 'respirable' && corps.type dans ['planete', 'lune']",
    poids: 2,
    texte: "Une nuit étoilée sur cette planète. Les constellations sont méconnaissables. Quelqu'un, casque ouvert, lève les yeux.",
    choix: [
      { label: 'Continuer', effets: [] },
      {
        label: 'Cartographier le ciel',
        requiert: 'equipe.pilotage >= 1',
        effets: [
          { texte: 'Cartographie céleste. Utile pour la navigation future.' },
          { gain: { datacubes: 5 } },
        ],
      },
    ],
  }),

  scene({
    id: 'filler_fossile',
    titre: 'Le fossile',
    lieux: "corps.type dans ['planete', 'lune', 'asteroide_g']",
    poids: 2,
    texte: "Un fossile dans la roche. Forme troublante : ni terrestre, ni alien-A, ni alien-B. Quelque chose d'autre.",
    choix: [
      {
        label: 'Ramener',
        effets: [{ texte: 'Le fossile rejoint la cargaison.' }, { gain: { datacubes: 6 } }],
      },
      {
        label: 'Étudier',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Espèce inconnue de toutes les bases de données.' },
          { gain: { datacubes: 12 } },
        ],
      },
    ],
  }),

  scene({
    id: 'filler_reflet',
    titre: 'Le reflet',
    lieux: "corps.type dans ['planete', 'lune'] && corps.atmosphere != 'aucune' && corps.biome != 'asteroide'",
    poids: 2,
    texte: "Dans une flaque, un reflet. Quelqu'un a juré qu'il y avait deux silhouettes en plus de la sienne. Personne d'autre n'a vu.",
    choix: [
      { label: 'Hausser les épaules', effets: [] },
      { label: 'Photographier la flaque', effets: [{ gain: { datacubes: 3 } }] },
    ],
  }),
];
