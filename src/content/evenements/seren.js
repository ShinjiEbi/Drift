// src/content/evenements/seren.js — Seren Adebayo, émissaire des Enclaves (personnages/seren.js).
// Arrive après le premier contact avec une faction humaine. Se souvient de
// l'accueil reçu (monde.seren) et du sort des réfugiés (monde.seren_refus).
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'seren_contact',
    titre: 'Une émissaire',
    theme: 'Diplomatie',
    ton: 'neutre',
    personnage: 'seren',
    si: 'factions.humain >= 1',
    unique: true,
    texte: [
      "Une navette aux couleurs délavées des Enclaves se pose en bordure du plateau. Une seule passagère en descend, les mains bien visibles.",
      "« {pnj:seren}, émissaire. On parle de vous dans les relais. Je viens voir si c'est vrai. »",
    ],
    choix: [
      { label: "L'inviter à la table du commandement", cout: { biomasse: 30 },
        effets: [
          { texte: "Elle mange lentement, comme quelqu'un qui a appris à ne rien laisser. Elle parle peu, écoute beaucoup, et remercie deux fois." },
          { reputation: { faction: 'humain', delta: 10 } },
          { monde: { seren: 'accueillie' } },
        ] },
      { label: "L'écouter, sans rien promettre",
        effets: [{ texte: "« Prudents. C'est bien. » Elle repart avant la nuit, en promettant de revenir." }, { monde: { seren: 'ecoutee' } }] },
      { label: 'La prier de repartir',
        effets: [
          { texte: "Elle hoche la tête, sans surprise. « Les Enclaves s'en souviendront. Moi aussi. »" },
          { reputation: { faction: 'humain', delta: -10 } },
          { monde: { seren: 'renvoyee' } },
        ] },
    ],
  }),

  evenement({
    id: 'seren_refugies',
    titre: 'Une famille à la dérive',
    theme: 'Diplomatie',
    ton: 'neutre',
    personnage: 'seren',
    // Un nouveau colon : seulement si la colonie peut le loger et le nourrir
    si: "(monde.seren == 'accueillie' || monde.seren == 'ecoutee') && colonie.vivres_ok",
    unique: true,
    texte: [
      "{pnj:seren} revient, et cette fois elle n'est pas seule : dans la soute, une famille d'un relais qui a perdu son générateur. Ils ont froid. Ils ont peu dormi.",
      "« Je n'ai pas le droit de vous le demander. Je vous le demande quand même. »",
    ],
    choix: [
      { label: 'Accueillir un des leurs comme colon', requiert: 'colonie.vivres_ok', raison: 'Ni couchette ni vivres pour une bouche de plus',
        effets: [
          { recrute: { inconnu: true } },
          { texte: "{recrue}, l'aîné{recrue.e} de la famille, descend {recrue|le premier|la première}. Des mains d'électricien, et un sourire qui revient lentement." },
          { reputation: { faction: 'humain', delta: 15 } },
          { annales: '{colonie} a recueilli une famille des Enclaves, à la demande de {pnj:seren}.' },
        ] },
      { label: 'Leur donner des vivres pour la route', cout: { biomasse: 60 },
        effets: [{ texte: "Les caisses passent de main en main. Personne ne parle. {pnj:seren} serre des mains, une à une." }, { reputation: { faction: 'humain', delta: 5 } }] },
      { label: '« Nous ne pouvons pas. »',
        effets: [{ texte: "{pnj:seren} referme la soute elle-même. « Je comprends. » Elle ne le pense pas." }, { reputation: { faction: 'humain', delta: -5 } }, { monde: { seren_refus: true } }] },
    ],
  }),

  evenement({
    id: 'seren_bilan',
    titre: 'Les comptes de Seren',
    theme: 'Diplomatie',
    ton: 'neutre',
    personnage: 'seren',
    si: 'evenement.seren_refugies.fois >= 1',
    unique: true,
    texte: [
      { unParmi: [
        { si: 'monde.seren_refus', texte: "{pnj:seren} revient une dernière fois. Elle ne descend pas de la passerelle. « La famille a trouvé un autre relais. Deux sont morts en route. Je ne vous en veux pas. Je voulais que vous le sachiez. »" },
        { texte: "{pnj:seren} revient, détendue pour la première fois. « Les Enclaves ont parlé de vous en séance. En bien. Ça n'arrive pas souvent. »" },
      ] },
      "Elle pose une carte sur la table : des relais, des routes, des noms barrés. « Ce que nous savons des anciens. C'est à vous. »",
    ],
    choix: [
      { label: 'Étudier la carte avec elle', requiert: 'equipe.linguistique >= 1',
        effets: [{ texte: "{acteur} et {pnj:seren} y passent la nuit. Au matin, trois ruines de plus figurent sur nos relevés." }, { gain: { datacubes: 50 } }, { monde: { seren_carte: true } }] },
      { label: 'Garder la carte et la remercier',
        effets: [{ texte: 'Elle repart avant l’aube. La carte reste punaisée au mur du commandement.' }, { monde: { seren_carte: true } }] },
    ],
  }),
];
