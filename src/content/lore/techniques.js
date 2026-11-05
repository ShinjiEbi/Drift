// src/content/lore/techniques.js — pages d'archives : les techniques anciennes,
// ouvertes par les schémas déchiffrés et les rêves de l'équipage.
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'resonance',
    titre: 'La résonance',
    categorie: 'techniques',
    si: 'colonie.schemas.alien_a >= 1',
    resume: 'Les schémas cristallins ne décrivent pas des machines, mais des accords.',
    texte: [
      "Un schéma cristallin ne montre ni pièces ni assemblage. Il montre des fréquences, des intervalles, des rapports entre les angles. Le construire, c'est accorder un matériau jusqu'à ce qu'il fasse de lui-même ce qu'on attend.",
      "Nos ingénieurs parlent de résonance faute de mieux. Les anciens habitants des ruines, eux, n'avaient peut-être pas de mot du tout.",
    ],
  }),

  lore({
    id: 'croissance',
    titre: 'Croître plutôt qu’assembler',
    categorie: 'techniques',
    si: 'colonie.schemas.alien_b >= 1',
    resume: 'Les schémas organiques sont des recettes, pas des plans.',
    texte: [
      "Un schéma organique se lit comme une recette : une souche, un milieu, une température, une patience. Ce qu'il produit n'est jamais tout à fait identique d'une fois sur l'autre, et c'est voulu.",
      'Les biologistes de la colonie appellent ça une technique vivante. Les ingénieurs, une technique qui ne tient pas ses promesses. Les deux ont raison.',
    ],
  }),

  lore({
    id: 'grande_forme',
    titre: 'La grande forme',
    categorie: 'techniques',
    si: 'monde.songe_consigne',
    resume: "Le rêve que font plusieurs colons, la même nuit.",
    texte: [
      "Le rêve revient, consigné par plusieurs dormeurs à des nuits d'écart : une grande forme qui regarde, aucun visage, une immobilité qui n'est pas de la patience. Les détails changent ; la sensation, jamais.",
      "Il ne survient qu'après le déchiffrement d'un schéma étranger. Coïncidence, écho, ou réponse : le laboratoire n'a pas tranché.",
    ],
  }),
];
