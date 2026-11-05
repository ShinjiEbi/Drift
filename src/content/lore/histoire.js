// src/content/lore/histoire.js — pages d'archives : l'exode et ce qui l'a précédé.
// Une page s'ouvre quand sa condition `si` devient vraie (vérifiée par le jeu
// toutes les quelques secondes) ; elle reste ouverte ensuite.
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'exode',
    titre: "L'exode",
    categorie: 'histoire',
    ordre: 1,
    si: 'vrai',
    resume: 'Pourquoi nous sommes partis, et ce que nous avons laissé.',
    texte: [
      "On ne part pas pour les étoiles par goût de l'aventure. On part parce que chez soi, il n'y a plus de place, plus d'eau, ou plus de patience. Les capsules de l'exode ont été lancées par vagues, chacune avec un équipage de fondation, une vedette et un module de commandement replié comme une graine.",
      "Aucune capsule ne sait où les autres se sont posées. C'était voulu : une colonie qui échoue n'entraîne pas les autres dans sa chute. On appelle ça la dispersion. Ceux qui l'ont conçue ne l'ont pas vécue.",
      "*Consigne n° 1 de l'équipage de fondation : survivre d'abord. Comprendre ensuite.*",
    ],
  }),

  lore({
    id: 'effondrement',
    titre: "L'Effondrement",
    categorie: 'histoire',
    ordre: 2,
    si: 'colonie.objet.disque_memoire >= 1 || fil.arc_effondrement.etape >= 1',
    resume: "D'autres humains sont venus avant nous. Ils sont repartis.",
    texte: [
      "Nous ne sommes pas les premiers. Les disques mémoire le disent à mots couverts : une vague plus ancienne, des colonies prospères, un réseau de relais entre les systèmes. Puis, en quelques années, plus rien.",
      "Les ruines ne racontent pas une guerre. Pas d'impacts, pas de fosses. Des portes laissées ouvertes, des repas sur les tables, des archives qu'on n'a pas pris le temps de brûler. Les voix des disques appellent ça l'Effondrement, avec une majuscule, comme on nomme une saison.",
    ],
  }),

  lore({
    id: 'premiere_colonie',
    titre: "Ceux d'avant",
    categorie: 'histoire',
    ordre: 3,
    si: 'monde.maud_recit || monde.archive_colonie',
    resume: 'Une colonie entière sur notre plateau, quarante personnes, un ordre de départ.',
    texte: [
      "Ils étaient quarante, sur ce même plateau. Leur module de commandement est enterré sous nos pieds : nous avons construit sur leurs fondations sans le savoir. Leurs registres s'arrêtent sur un ordre bref, transmis par relais : *tout le monde repart, on laisse tout*.",
      { si: 'monde.maud_recit', texte: "Maud Kessler a refusé l'ordre. Elle dit qu'ils ne fuyaient pas la planète, mais ce qui venait. Elle ne sait pas ce que c'était. Elle n'a jamais voulu savoir." },
      { si: '!monde.maud_recit', texte: "Une dernière entrée, d'une autre main : *Une de nous reste. Elle dit que quelqu'un doit garder la porte.*" },
    ],
  }),

  lore({
    id: 'programme',
    titre: 'Le programme',
    categorie: 'histoire',
    ordre: 4,
    si: 'fil.arc_effondrement.etape >= 3',
    resume: "Les colonies d'avant n'étaient pas isolées : elles obéissaient à un plan.",
    texte: [
      "En croisant deux disques, les noms s'alignent : mêmes indicatifs, mêmes formats, mêmes signatures de commandement. Les colonies de la première vague faisaient partie d'un programme, avec un centre, une hiérarchie, des rapports réguliers.",
      "Le programme avait un mot pour l'événement qu'il redoutait : le *Contact*. Les procédures étaient prêtes. Elles n'ont pas suffi.",
    ],
  }),
];
