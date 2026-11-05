// src/content/lore/peuples.js — pages d'archives : les peuples, ouvertes au
// premier contact avec une faction de chaque type (et par les PNJ récurrents).
import { lore } from '../dsl.js';

export default [
  lore({
    id: 'enclaves',
    titre: 'Les Enclaves',
    categorie: 'peuples',
    si: 'factions.humain >= 1',
    resume: "Les descendants de l'Effondrement.",
    texte: [
      "Tous les humains n'ont pas obéi à l'ordre de départ. Certains sont restés, par refus ou par oubli, et leurs enfants ont fondé les Enclaves : des communautés méfiantes, reliées par des relais qu'elles entretiennent avec un soin religieux.",
      { si: 'monde.seren_carte', texte: "La carte de Seren Adebayo montre ce qu'elles savent des anciens : des relais éteints, des routes coupées, et au centre, une zone vide où personne n'ose aller." },
    ],
  }),

  lore({
    id: 'conclaves',
    titre: 'Les géométries',
    categorie: 'peuples',
    si: 'factions.alien_a >= 1',
    resume: 'Les peuples cristallins, et leur politesse impénétrable.',
    texte: [
      "Les factions cristallines se nomment par des formes : Conclave, Prisme, Spire. Leurs émissaires parlent par gestes et par tonalités, et ne répondent jamais deux fois à la même question.",
      "Elles valorisent la rigueur. Un scientifique patient obtient d'elles ce qu'aucun diplomate n'arrache.",
    ],
  }),

  lore({
    id: 'couvees',
    titre: 'Les couvées',
    categorie: 'peuples',
    si: 'factions.alien_b >= 1',
    resume: 'Les peuples organiques, qui pensent en saisons.',
    texte: [
      "Les factions organiques ne pensent pas en jours, mais en cycles. Une négociation peut durer une génération ; un affront, se payer trois générations plus tard.",
      "Elles comprennent le soin mieux que la parole. Un médecin les approche plus facilement qu'un ambassadeur.",
    ],
  }),

  lore({
    id: 'routes_marchandes',
    titre: "Les routes d'Ilya",
    categorie: 'peuples',
    si: 'monde.ilya_route || monde.ilya_confiance >= 3',
    resume: 'Les marchands itinérants, et leurs carnets.',
    texte: [
      "Entre les Enclaves, les géométries et les couvées circulent des marchands sans faction, comme Ilya Brenner. Ils vont où l'on paie, notent tout, n'oublient rien. Leur réseau n'a ni centre ni chef : seulement des relais où l'on peut se poser sans être volé.",
      "Ils tiennent leurs carnets à jour comme d'autres tiennent des comptes de famille. Être noté en bien dans le carnet d'un marchand vaut une alliance.",
    ],
  }),
];
