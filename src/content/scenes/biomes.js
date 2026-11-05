// src/content/scenes/biomes.js — Scènes propres à un biome (jungle, désert, glace, volcan, astéroïdes).
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'jungle_canopee',
    titre: 'Sous la canopée',
    lieux: "corps.biome == 'jungle'",
    poids: 4,
    texte: 'La canopée filtre la lumière en bandes vertes. À chaque pas, des choses se déplacent dans les feuillages, juste hors de vue.',
    choix: [
      {
        label: 'Avancer en file indienne',
        test: {
          carac: 'sangfroid',
          difficulte: 5,
          reussite: [
            { texte: "L'équipe traverse sans incident notable." },
            { gain: { biomasse: 25 } },
          ],
          echec: [
            { texte: "Une racine, une branche, ou autre chose. Quelqu'un a saigné." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
          ],
        },
      },
      {
        label: 'Brûler un passage',
        requiert: 'equipe.objet.lance_flammes',
        effets: [{ texte: 'Le lance-flammes ouvre un sentier net.' }, { gain: { biomasse: 40 } }],
      },
      {
        label: 'Déployer le drone éclaireur',
        requiert: 'equipe.objet.drone_eclaireur',
        effets: [
          { texte: 'Le drone cartographie les passages sûrs.' },
          { gain: { biomasse: 20, datacubes: 6 } },
        ],
      },
    ],
  }),

  scene({
    id: 'jungle_arbre_sage',
    titre: "L'arbre qui respire",
    lieux: "corps.biome == 'jungle'",
    poids: 2,
    texte: "Au cœur de la jungle, un arbre seul, dix fois plus haut que les autres. Son tronc est creusé de cavités symétriques. On dirait qu'il respire.",
    choix: [
      {
        label: "Étudier l'arbre",
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: "L'arbre est un organisme cognitif. Données précieuses." },
          { gain: { datacubes: 14, biomasse: 20 } },
        ],
      },
      {
        label: 'Prélever du tissu',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [
            { texte: "Tissu récupéré. L'arbre n'a pas réagi." },
            { gain: { biomasse: 35 } },
          ],
          echec: [
            { texte: "Quelque chose dans la sève s'accroche à la peau." },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Passer son chemin',
        effets: [{ texte: "Personne n'a touché. Personne ne le regrette." }, { moral: 1 }],
      },
    ],
  }),

  scene({
    id: 'desert_oasis',
    titre: "L'oasis",
    lieux: "corps.biome == 'desert'",
    poids: 3,
    texte: "Au creux des dunes, un point d'eau saumâtre. Autour, des squelettes alignés comme s'ils s'y étaient traînés.",
    choix: [
      {
        label: "Analyser l'eau",
        requiert: 'equipe.medecine >= 1',
        effets: [
          { texte: "L'eau est piégée chimiquement. On comprend les squelettes." },
          { gain: { datacubes: 6 } },
        ],
      },
      {
        label: 'Ramener un échantillon',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [
            { texte: "Échantillon scellé. La curiosité l'emporte." },
            { gain: { biomasse: 15, datacubes: 4 } },
          ],
          echec: [
            { texte: "Quelque chose dans l'eau a traversé le scellé." },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Poser une balise et continuer',
        requiert: 'equipe.objet.balise_signal',
        effets: [{ texte: 'Site marqué pour études futures.' }, { gain: { datacubes: 8 } }],
      },
    ],
  }),

  scene({
    id: 'desert_carcasse',
    titre: 'La carcasse',
    lieux: "corps.biome dans ['desert', 'irradie'] && corps.atmosphere != 'aucune'",
    poids: 3,
    texte: "Une carcasse métallique à demi enfouie. Un véhicule d'exploration ancien, marqué d'un sigle corporate effacé par les vents.",
    choix: [
      {
        label: 'Démonter pour les pièces',
        requiert: 'equipe.ingenierie >= 1',
        effets: [
          { texte: "L'épave livre ses dernières ressources." },
          { gain: { metal: 35, cristal: 15 } },
        ],
      },
      {
        label: 'Fouiller le poste de pilotage',
        effets: [
          { texte: "Un journal de bord récupéré. Le pilote n'a pas été récupéré." },
          { gain: { datacubes: 5 } },
          { objet: 'disque_memoire' },
        ],
      },
    ],
  }),

  scene({
    id: 'glace_silhouette',
    titre: 'La silhouette dans la glace',
    lieux: "corps.biome dans ['glace', 'toundra']",
    poids: 3,
    texte: 'Quelque chose est figé dans la glace, à un mètre de profondeur. Une silhouette humanoïde. Très grande. Très ancienne.',
    choix: [
      {
        label: 'Découper un bloc autour',
        requiert: 'equipe.ingenierie >= 2',
        effets: [
          { texte: 'Le bloc est extrait avec son contenu. Trouvaille majeure.' },
          { gain: { datacubes: 18, cristal: 20 } },
        ],
      },
      {
        label: 'Photographier et marquer le site',
        requiert: 'equipe.objet.balise_signal',
        effets: [
          { texte: 'Site marqué. Une expédition scientifique reviendra.' },
          { gain: { datacubes: 10 } },
        ],
      },
      {
        label: 'Tenter de dégager à la chaleur',
        cout: { energie: 8 },
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'La chaleur révèle des détails troublants.' },
            { gain: { datacubes: 12 } },
          ],
          echec: [
            { texte: 'Sous la glace, quelque chose a bougé.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
      {
        label: 'Laisser la silhouette à sa glace',
        effets: [
          { texte: 'Personne ne touche à la glace. La silhouette reste où elle est depuis toujours.' },
        ],
      },
    ],
  }),

  scene({
    id: 'glace_geyser',
    titre: 'Les geysers',
    lieux: "corps.biome == 'glace'",
    poids: 3,
    texte: "Le sol s'ouvre brusquement et un geyser d'eau bouillante jaillit à dix mètres. Puis un autre. Puis un autre.",
    choix: [
      {
        label: 'Reculer rapidement',
        effets: [{ texte: "L'équipe se met à l'abri. Spectacle impressionnant." }],
      },
      {
        label: "Capter l'énergie thermique",
        requiert: 'equipe.ingenierie >= 2',
        effets: [
          { texte: "Improvisation géniale. Le vaisseau récupère l'énergie." },
          { gain: { energie: 25, datacubes: 5 } },
        ],
      },
      {
        label: 'Poser une sonde',
        requiert: 'equipe.objet.capteur_xeno',
        effets: [
          { texte: 'Le capteur révèle une activité géothermique cohérente avec une vie souterraine.' },
          { gain: { datacubes: 18 } },
        ],
      },
    ],
  }),

  scene({
    id: 'volcan_coulee',
    titre: 'La coulée',
    lieux: "corps.biome == 'volcanique'",
    poids: 4,
    texte: "Une coulée de lave fraîche bloque la route. Les abords sont brûlants, l'air sature les filtres.",
    choix: [
      {
        label: 'Contourner par les hauts',
        test: {
          carac: 'vigueur',
          difficulte: 6,
          reussite: [{ texte: 'Détour épuisant mais sans dommage.' }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }, { moral: -1 }],
        },
      },
      {
        label: 'Récupérer du verre volcanique',
        requiert: 'equipe.science >= 1',
        effets: [{ texte: 'Cristaux thermo-formés récupérés.' }, { gain: { cristal: 30, datacubes: 4 } }],
      },
      { label: 'Faire demi-tour', effets: [{ texte: 'Le détour est trop long. On rebrousse chemin.' }] },
    ],
  }),

  scene({
    id: 'volcan_sphere',
    titre: 'La sphère froide',
    lieux: "corps.biome == 'volcanique'",
    affinites: [{ si: "corps.ruines dans ['alien_a', 'fusion']", facteur: 3 }],
    poids: 2,
    texte: 'Une sphère parfaite de pierre noire émerge de la cendre, bizarrement froide au toucher malgré la chaleur ambiante.',
    choix: [
      {
        label: 'Scanner avec capteur xeno',
        requiert: 'equipe.objet.capteur_xeno',
        effets: [
          { texte: 'La sphère est une matrice de données. Lecture partielle.' },
          { gain: { datacubes: 18 } },
          { schema: 'alien_a' },
        ],
      },
      {
        label: 'Étudier longuement',
        requiert: 'equipe.science >= 3',
        effets: [
          { texte: 'Étude approfondie. La sphère résiste à toutes les fréquences sauf une.' },
          { gain: { datacubes: 15, cristal: 20 } },
        ],
      },
      {
        label: "L'embarquer entière",
        test: {
          carac: 'vigueur',
          difficulte: 7,
          reussite: [
            { texte: 'Lourde mais transportable.' },
            { gain: { datacubes: 8 } },
            { objet: 'lentille_noire' },
          ],
          echec: [
            { texte: "La sphère est plus dense qu'elle n'en a l'air." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'asteroide_filon',
    titre: 'Le filon',
    lieux: "corps.biome == 'asteroide'",
    poids: 5,
    texte: "Le rocher est creux d'un filon dense. Les capteurs s'emballent : métal pur, presque sans impuretés.",
    choix: [
      {
        label: 'Extraire avec les outils standards',
        effets: [{ texte: 'Filon exploité.' }, { gain: { metal: 50, cristal: 10 } }],
      },
      {
        label: 'Cartographier le filon au scanner géologique',
        requiert: 'equipe.objet.scanner_geologique',
        effets: [
          { texte: 'Le scanner révèle les poches les plus riches. Extraction ciblée.' },
          { gain: { metal: 70, cristal: 20 } },
        ],
      },
      {
        label: "Monter un système d'extraction avec le kit de réparation",
        consomme: 'kit_reparation',
        effets: [
          { texte: 'Le système improvisé double le rendement.' },
          { gain: { metal: 80, cristal: 25 } },
        ],
      },
    ],
  }),

  scene({
    id: 'asteroide_fossile',
    titre: 'Les cristaux réguliers',
    lieux: "corps.biome == 'asteroide'",
    poids: 2,
    texte: 'Dans une fissure profonde du rocher, des structures cristallines régulières. Ce ne sont pas des cristaux naturels.',
    choix: [
      {
        label: 'Scanner au capteur xeno',
        requiert: 'equipe.objet.capteur_xeno',
        effets: [
          { texte: 'Vestige technologique fossilisé. Capté.' },
          { gain: { datacubes: 16, cristal: 20 } },
          { schema: 'alien_a' },
        ],
      },
      {
        label: 'Extraire avec précaution',
        requiert: 'equipe.science >= 2',
        effets: [{ texte: 'Échantillons préservés.' }, { gain: { cristal: 40, datacubes: 10 } }],
      },
      {
        label: 'Noter la position et continuer',
        effets: [
          { texte: 'La fissure est relevée sur la carte. Une autre équipe, mieux équipée, reviendra.' },
        ],
      },
    ],
  }),
];
