// src/content/evenements/ilya.js — Ilya Brenner, marchand itinérant (personnages/ilya.js).
// « marchand » est l'ancien event_marchand de 0.33 : Ilya lui donne un visage.
// La suite se souvient : monde.ilya_confiance compte les échanges honnêtes,
// monde.ilya_service garde la trace de la caisse confiée.
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'marchand',
    titre: 'Marchand de passage',
    theme: 'Visiteur',
    ton: 'positif',
    personnage: 'ilya',
    // Il ne vient que si au moins un échange est payable
    si: 'colonie.res.metal >= 240 || colonie.res.cristal >= 150',
    delai: '3j',
    texte: { unParmi: [
      { si: 'monde.ilya_confiance >= 3', texte: "Le cargo d'{pnj:ilya} se pose sans prévenir, comme chez un vieil ami. « J'ai gardé le meilleur pour vous. Ne le répétez pas. »" },
      { si: 'evenement.marchand.fois >= 1', texte: "Le cargo cabossé d'{pnj:ilya} revient se poser pour quelques heures. Il ouvre son carnet sans le montrer. « Toujours le même tarif. »" },
      { texte: 'Un vaisseau marchand se pose pour quelques heures. Son pilote, un certain {pnj:ilya}, propose un échange unique.' },
    ] },
    choix: [
      { label: 'Échanger 240 métal contre 90 datacubes', cout: { metal: 240 },
        effets: [{ texte: "L'échange est conclu." }, { gain: { datacubes: 90 } }, { monde: { ilya_confiance: '+1' } }] },
      { label: 'Échanger 150 cristal contre 1 schéma humain', cout: { cristal: 150 },
        effets: [{ texte: 'Un plan technique change de mains.' }, { schema: 'humain' }, { monde: { ilya_confiance: '+1' } }] },
      { label: "Rien d'intéressant",
        effets: [{ texte: 'Le marchand repart sans rien vendre.' }] },
    ],
  }),

  evenement({
    id: 'ilya_service',
    titre: 'Une caisse en dépôt',
    theme: 'Visiteur',
    ton: 'neutre',
    personnage: 'ilya',
    si: 'evenement.marchand.fois >= 1',
    unique: true,
    texte: [
      "{pnj:ilya} ne vient pas vendre, cette fois. Il fait débarquer une caisse scellée, pas plus grande qu'une valise, et la pose au pied du mât.",
      "« Gardez-la-moi quelques jours. Ne l'ouvrez pas. Je reviens la chercher, et je sais remercier. »",
    ],
    choix: [
      { label: 'Garder la caisse sans poser de questions',
        effets: [{ texte: "La caisse rejoint la réserve. Elle est tiède au toucher, et personne n'aime passer à côté." }, { monde: { ilya_service: 'gardee', ilya_confiance: '+1' } }] },
      { label: "L'ouvrir dès qu'il est parti", requiert: 'equipe.ingenierie >= 1',
        effets: [
          { texte: "{acteur} force le sceau. À l'intérieur, rangés dans de la mousse : un disque mémoire et une poignée de cristaux bruts. Rien de dangereux, rien d'expliqué." },
          { objet: 'disque_memoire' }, { gain: { cristal: 40 } },
          { monde: { ilya_service: 'ouverte', ilya_confiance: '-2' } },
        ] },
      { label: '« Pas de marchandise sans inventaire. »',
        effets: [{ texte: "{pnj:ilya} hausse les épaules et remonte la caisse à bord. « Comme vous voudrez. »" }, { monde: { ilya_service: 'refusee' } }] },
    ],
  }),

  evenement({
    id: 'ilya_retour',
    titre: 'Le retour du marchand',
    theme: 'Visiteur',
    ton: 'neutre',
    personnage: 'ilya',
    si: "monde.ilya_service == 'gardee' || monde.ilya_service == 'ouverte'",
    unique: true,
    texte: [
      "{pnj:ilya} revient, comme promis. Il ne descend pas tout de suite : il regarde la caisse depuis la passerelle, longtemps.",
      { unParmi: [
        { si: "monde.ilya_service == 'ouverte'", texte: "« Le sceau. » Il le dit sans colère. « Je vous avais demandé une seule chose. » Il ouvre son carnet et y barre une ligne." },
        { texte: "Il soulève la caisse, vérifie le sceau du pouce et sourit pour la première fois. « Vous êtes des gens rares. Je m'en souviendrai. »" },
      ] },
    ],
    choix: [
      { label: 'Accepter son remerciement', si: "monde.ilya_service == 'gardee'",
        effets: [
          { texte: "Il laisse un tube de plans sur la table du commandement, et une adresse : un relais où l'on peut commercer sans se faire voler." },
          { schema: 'humain' }, { gain: { datacubes: 40 } },
          { monde: { ilya_confiance: '+1', ilya_route: true } },
          { annales: "{pnj:ilya}, marchand, a confié une caisse à {colonie}. Elle lui a été rendue intacte." },
        ] },
      { label: 'Lui rendre aussi ce qui était dedans', si: "monde.ilya_service == 'ouverte'", consomme: 'disque_memoire',
        effets: [
          { texte: "Tu poses le disque sur la caisse. Il le reprend sans un mot, puis, au pied de la passerelle : « Au moins, vous ne gardez pas. »" },
          { monde: { ilya_confiance: '+1' } },
        ] },
      { label: 'Le laisser repartir',
        effets: [{ texte: 'Le cargo décolle. Le carnet, lui, a tout noté.' }] },
    ],
  }),
];
