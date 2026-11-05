// src/content/lore/colonie.js — pages d'archives : l'avant-poste lui-même.
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'plateau',
    titre: 'Le plateau',
    categorie: 'colonie',
    ordre: 1,
    si: 'vrai',
    resume: 'Le site d’atterrissage de {colonie}.',
    texte: [
      "Un plateau rocheux balayé par le vent, assez plat pour poser une capsule, assez haut pour voir venir. Le soleil local est petit et distant, mais il suffit aux voilures. Le sol cache du métal, et l'eau n'est pas loin.",
      "Le module de commandement s'est déplié en douze minutes, comme prévu. Le reste ne s'est jamais passé comme prévu.",
    ],
  }),

  lore({
    id: 'premiere_mission',
    titre: 'La première mission',
    categorie: 'colonie',
    ordre: 2,
    si: 'expeditions.total >= 1',
    resume: "Le jour où la vedette est revenue.",
    texte: [
      "Une expédition, c'est un vaisseau, une équipe, des vivres comptés et une destination choisie sur une carte qu'on comprend à moitié. On la suit au relais, scène après scène, et on décide à distance de ce que l'équipe fera.",
      "La première est revenue avec peu de chose dans la soute et beaucoup à raconter. C'est ainsi que commencent les colonies : par des récits plus que par des cargaisons.",
    ],
  }),
];
