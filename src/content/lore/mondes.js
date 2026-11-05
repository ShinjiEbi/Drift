// src/content/lore/mondes.js — pages d'archives : les mondes, ouvertes par la
// première expédition rentrée d'un type de biome.
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'mondes_froids',
    titre: 'Glace et toundra',
    categorie: 'mondes',
    si: 'expeditions.biome.glace >= 1 || expeditions.biome.toundra >= 1',
    resume: 'Des mondes qui conservent tout, même ce qu’on voudrait oublier.',
    texte: [
      "Le froid conserve. Sous la glace, les équipes retrouvent des structures intactes, des corps parfois, des machines qui redémarrent quand on les réchauffe. La toundra est plus clémente : un sol dur, une flore rase, des vents réguliers qui font tourner les éoliennes de fortune.",
      "Règle de terrain : sur un monde froid, ne jamais dormir seul. Et ne jamais réchauffer ce qu'on ne comprend pas.",
    ],
  }),

  lore({
    id: 'mondes_ardents',
    titre: 'Déserts et volcans',
    categorie: 'mondes',
    si: 'expeditions.biome.desert >= 1 || expeditions.biome.volcanique >= 1',
    resume: 'Des mondes qui effacent les traces.',
    texte: [
      "Le sable recouvre tout en quelques saisons ; la lave, en quelques heures. Les mondes ardents n'ont pas de mémoire, ce qui en fait de bons endroits pour cacher quelque chose, et de mauvais endroits pour le retrouver.",
      'Les minerais y affleurent pourtant comme nulle part ailleurs. Les foreurs aiment ces mondes. Les médecins, beaucoup moins.',
    ],
  }),

  lore({
    id: 'mondes_vivants',
    titre: 'Jungles et océans',
    categorie: 'mondes',
    si: 'expeditions.biome.jungle >= 1 || expeditions.biome.ocean >= 1',
    resume: 'La vie, partout, et pas toujours celle qu’on attendait.',
    texte: [
      "Là où l'eau abonde, la vie a pris toutes les places. Les jungles respirent par saccades ; les océans montent et descendent sans lune pour les tirer. Les biologistes de bord y trouvent de quoi remplir dix carnets par expédition.",
      'Sur ces mondes, le danger ne vient presque jamais de la planète. Il vient de ce qui y vit, et qui nous voit arriver bien avant que nous le voyions.',
    ],
  }),
];
