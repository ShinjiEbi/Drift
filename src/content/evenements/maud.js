// src/content/evenements/maud.js — Maud Kessler, l'ancienne du plateau (personnages/maud.js).
// Elle vivait là avant l'atterrissage. Trois rencontres, espacées : la première,
// le récit de « ceux d'avant » (ouvre une page d'archives), puis l'adieu.
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'maud_rencontre',
    titre: "L'ancienne du plateau",
    theme: 'Rencontre',
    ton: 'neutre',
    personnage: 'maud',
    si: 'colonie.jour >= 2',
    unique: true,
    acteurs: { colon: { prefere: 'acteur.survie >= 1' } },
    texte: [
      "{colon} revient d'un relevé à pied, essoufflé{colon.e}. À deux kilomètres, sous un surplomb, une porte de sas enterrée. Et derrière, quelqu'un.",
      "Une vieille femme sort, une couverture de survie nouée en châle. « Vous avez fait du bruit en arrivant. {pnj:maud}. J'étais là avant vous. »",
    ],
    choix: [
      { label: 'La faire entrer au commandement',
        effets: [
          { texte: "Elle examine le module de commandement en connaisseuse, tapote une cloison. « Bon acier. Le nôtre rouillait. » Elle reste jusqu'au soir." },
          { moral: { cible: 'colonie', valeur: 3 } },
          { monde: { maud: 'amie' } },
        ] },
      { label: 'Lui laisser des vivres devant sa porte', cout: { biomasse: 30 },
        effets: [{ texte: "Le lendemain, les caisses vides sont empilées devant notre sas. Propres. Une façon de dire merci." }, { monde: { maud: 'distante' } }] },
      { label: 'Garder nos distances',
        effets: [{ texte: "{colon} note la position du sas sur la carte. Personne n'y retourne." }, { monde: { maud: 'ignoree' } }] },
    ],
  }),

  evenement({
    id: 'maud_recit',
    titre: "Ceux d'avant",
    theme: 'Rencontre',
    ton: 'neutre',
    personnage: 'maud',
    si: "monde.maud == 'amie' || monde.maud == 'distante'",
    unique: true,
    texte: [
      { unParmi: [
        { si: "monde.maud == 'amie'", texte: "{pnj:maud} a pris l'habitude de passer à la tombée du jour. Ce soir, elle s'assoit sans qu'on l'invite et sort une photo pliée en quatre." },
        { texte: "{pnj:maud} frappe au sas, pour la première fois. Elle tient une photo pliée en quatre et ne sait pas par où commencer." },
      ] },
      "« On était quarante. Une colonie, comme vous. Un jour, les ordres ont changé : tout le monde repart, on laisse tout. J'ai refusé. »",
    ],
    choix: [
      { label: "L'écouter jusqu'au bout",
        effets: [
          { texte: "Elle parle jusqu'au milieu de la nuit. Des noms, des pannes, un départ précipité. Et une phrase qu'elle répète : « Ils ne fuyaient pas la planète. Ils fuyaient ce qui venait. »" },
          { gain: { datacubes: 20 } },
          { monde: { maud_recit: true } },
        ] },
      { label: 'Enregistrer son récit pour les archives', requiert: 'equipe.linguistique >= 1',
        effets: [
          { texte: "{acteur} enregistre tout, recoupe les dates, retrouve les noms dans nos propres fichiers. Les archives de {colonie} ont désormais un chapitre de plus." },
          { gain: { datacubes: 45 } },
          { monde: { maud_recit: true } },
        ] },
      { label: "Abréger : le travail n'attend pas",
        effets: [{ texte: "Elle replie la photo. « Une autre fois. » Il n'y en aura peut-être pas." }] },
    ],
  }),

  evenement({
    id: 'maud_adieu',
    titre: "L'hiver de Maud",
    theme: 'Rencontre',
    ton: 'neutre',
    personnage: 'maud',
    si: 'monde.maud_recit',
    unique: true,
    texte: [
      "{pnj:maud} tousse depuis des jours. Son abri n'a plus de chauffage : la dernière cellule a lâché. Elle ne demande rien. Elle ne l'a jamais fait.",
    ],
    choix: [
      { label: 'Lui offrir une couchette parmi nous', requiert: 'colonie.vivres_ok', raison: 'Ni couchette ni vivres pour une bouche de plus',
        effets: [
          { recrute: 'maud' },
          { texte: "Elle arrive avec un seul sac et une boîte à outils plus vieille que la colonie. « Je ne cuisine pas. Je répare. »" },
          { annales: "{pnj:maud}, dernière de la colonie d'avant, a rejoint {colonie}." },
        ] },
      { label: 'Réparer son abri', cout: { metal: 40, energie: 30 },
        effets: [
          { texte: "La cellule neuve ronronne. {pnj:maud} reste chez elle, comme elle l'a toujours voulu, à deux kilomètres de nous." },
          { moral: { cible: 'colonie', valeur: 3 } },
          { monde: { maud_partie: false } },
        ] },
      { label: 'La laisser à son choix',
        effets: [
          { texte: "Un matin, la porte du sas est ouverte et l'abri vide. Sur la table, la photo pliée en quatre, à notre intention." },
          { monde: { maud_partie: true } },
          { annales: "{pnj:maud}, la dernière de ceux d'avant, a quitté le plateau." },
        ] },
    ],
  }),
];
