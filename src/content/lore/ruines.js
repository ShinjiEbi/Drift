// src/content/lore/ruines.js — pages d'archives : les quatre types de ruines,
// ouvertes par la première expédition rentrée de chacune.
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'ruines_humaines',
    titre: 'Ruines humaines',
    categorie: 'ruines',
    si: 'expeditions.ruines.humaines >= 1',
    resume: 'Nos semblables, partis en hâte.',
    texte: [
      "On les reconnaît de loin : modules préfabriqués, logos corporatifs à demi effacés, panneaux de signalisation dans des langues que nous parlons encore. Les ruines humaines sont les plus faciles à fouiller et les plus difficiles à regarder.",
      "Partout, la même hâte : des portes soudées de l'intérieur, des réserves entamées, des messages griffonnés sur les murs à l'intention de ceux qui viendraient après. Nous sommes ceux qui viennent après.",
    ],
  }),

  lore({
    id: 'ruines_cristallines',
    titre: 'Ruines cristallines',
    categorie: 'ruines',
    si: 'expeditions.ruines.alien_a >= 1',
    resume: 'Une géométrie qui pense.',
    texte: [
      "Les ruines de type A ne sont pas bâties : elles ont poussé, comme des cristaux, selon des angles qui ne doivent rien au hasard. Chaque facette porte un motif, chaque motif semble répondre à un autre, parfois à des kilomètres.",
      "Les équipes rapportent des maux de tête, des rêves de couloirs infinis, une impression d'être mesurées. Les scientifiques parlent de protocole plutôt que de langue. Personne n'a encore trouvé qui l'écrit.",
    ],
  }),

  lore({
    id: 'ruines_organiques',
    titre: 'Ruines organiques',
    categorie: 'ruines',
    si: 'expeditions.ruines.alien_b >= 1',
    resume: 'Des cités qui respirent encore.',
    texte: [
      "Les ruines de type B sont tièdes au toucher. Leurs parois ressemblent à de l'écorce, à du cartilage, parfois à de la peau. Rien n'y est assemblé : tout y a été cultivé.",
      "On les dit mortes. Les capteurs disent autre chose : un pouls lent, très lent, à peine un battement par heure. Une civilisation endormie, peut-être. Ou une seule créature, aussi vaste qu'une ville.",
    ],
  }),

  lore({
    id: 'ruines_melees',
    titre: 'Ruines mêlées',
    categorie: 'ruines',
    si: 'expeditions.ruines.fusion >= 1',
    resume: "Là où l'humain et l'étranger ont vécu ensemble.",
    texte: [
      "Certaines ruines mêlent tout : des modules humains enchâssés dans du cristal, des couloirs organiques équipés de nos éclairages. Quelqu'un, quelque part, a tenté de vivre avec eux plutôt qu'à côté.",
      "Ces lieux sont rares. Ce sont aussi les seuls où l'on trouve des inscriptions dans deux écritures à la fois, comme des pierres de traduction abandonnées en chemin.",
    ],
  }),
];
