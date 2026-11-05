// src/content/evenements/prologue.js — les trois scènes du prologue « L'atterrissage ».
//
// Ouvertes par le fil rouge arcs/atterrissage.js, une par étape (spontane: false :
// jamais tirées au hasard). Elles nomment l'équipage de départ par son rôle
// (member.startRole) : {pilote}, {ingenieur}, {medecin}, même partis en mission
// (parmi: 'vivants' : une scène n'attend jamais leur retour). Si l'un d'eux manque,
// un autre colon prend sa place (prefere). Chaque scène peut être passée.
import { evenement } from '../dsl.js';

const EQUIPAGE = {
  pilote:    { parmi: 'vivants', prefere: "acteur.role == 'pilote'" },
  ingenieur: { parmi: 'vivants', prefere: "acteur.role == 'ingenieur'" },
  medecin:   { parmi: 'vivants', prefere: "acteur.role == 'medecin'" },
};

export default [
  evenement({
    id: 'prologue_atterrissage',
    titre: "L'atterrissage",
    theme: 'Prologue',
    ton: 'neutre',
    spontane: false,
    unique: true,
    acteurs: EQUIPAGE,
    texte: [
      'La capsule s’est posée de travers sur un plateau rocheux. Le vent siffle dans les haubans. Dans le module de commandement, trois visages se tournent vers toi.',
      '{pilote} a déjà fait le tour de la vedette : intacte, prête à décoller. {ingenieur} déroule les plans des premiers modules sur la table. {medecin} compte les rations, deux fois.',
      '« Par quoi on commence ? »',
    ],
    choix: [
      { label: 'Le générateur, d’abord',
        effets: [
          { texte: '{ingenieur} hoche la tête. « Sans énergie, rien ne tourne. » Le plan du générateur solaire reste en haut de la pile.' },
          { gain: { metal: 30 } },
          { monde: { premier_chantier: 'generateur_solaire' } },
        ] },
      { label: 'Les cultures : il faudra manger',
        effets: [
          { texte: '{medecin} approuve en silence. Les bacs de l’hydroponie sortent de la soute.' },
          { gain: { biomasse: 40 } },
          { monde: { premier_chantier: 'hydroponie' } },
        ] },
      { label: 'La mine : il nous faut du métal',
        effets: [
          { texte: '{pilote} désigne une veine sombre dans la roche, à cent mètres du sas. « Là. On l’a vue en descendant. »' },
          { gain: { cristal: 20 } },
          { monde: { premier_chantier: 'mine_surface' } },
        ] },
      { label: 'Je connais la routine (passer le prologue)',
        effets: [
          { texte: '{pilote} sourit. « Alors au travail. »' },
          { monde: { prologue_passe: true } },
        ] },
    ],
  }),

  evenement({
    id: 'prologue_postes',
    titre: 'Chacun à son poste',
    theme: 'Prologue',
    ton: 'neutre',
    spontane: false,
    unique: true,
    si: '!monde.prologue_passe',
    acteurs: EQUIPAGE,
    texte: [
      'Le premier module tourne. {ingenieur} s’essuie les mains sur sa combinaison : « Une machine sans personne à côté, ça tourne à moitié. »',
      'Chaque module ouvre des postes. Un colon en poste fait tourner le sien à plein régime ; un colon libre peut partir en mission.',
    ],
    choix: [
      { label: 'Chacun là où il est le plus utile',
        effets: [
          { texte: '« Je m’occupe du planning », dit {ingenieur}. Le tableau des postes se couvre de noms.' },
          { moral: { cible: 'colonie', valeur: 3 } },
        ] },
      { label: 'Garder {pilote} prêt pour la vedette',
        effets: [
          { texte: '{pilote} reste au commandement, à portée du sas. La vedette n’attend plus qu’une équipe.' },
          { moral: { cible: 'pilote', valeur: 5 } },
        ] },
      { label: 'Passer la suite du prologue',
        effets: [{ monde: { prologue_passe: true } }] },
    ],
  }),

  evenement({
    id: 'prologue_depart',
    titre: 'Premier départ',
    theme: 'Prologue',
    ton: 'neutre',
    spontane: false,
    unique: true,
    // Passée si une équipe est déjà partie : le joueur a appris seul
    si: '!monde.prologue_passe && expeditions.en_cours == 0 && expeditions.total == 0',
    acteurs: EQUIPAGE,
    texte: [
      '{pilote} a fait le plein de la vedette. Sur la carte, des points lumineux : des mondes à portée, que personne n’a jamais foulés. Peut-être des ruines. Peut-être pire.',
      '« Il me faut une équipe et une destination. Le reste, on le verra sur place. »',
    ],
    choix: [
      { label: 'La destination la plus proche, {pilote}',
        effets: [{ texte: '« La prudence. Ça me va. » {pilote} trace la route la plus courte.' }] },
      { label: 'Emporter des vivres en plus', cout: { biomasse: 20 },
        effets: [
          { texte: '{medecin} charge deux caisses de plus dans la soute. « On ne sait jamais combien de temps on reste. »' },
          { moral: { cible: 'pilote', valeur: 5 } },
        ] },
      { label: '« Ramenez-moi une histoire. »',
        effets: [{ texte: '{pilote} rit. « Ça, je peux. » Le moteur de la vedette se met à chauffer.' }, { moral: { cible: 'colonie', valeur: 2 } }] },
    ],
  }),
];
