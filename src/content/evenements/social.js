// src/content/evenements/social.js — la vie de l'équipage : anniversaires,
// deuils, disputes, attachements. Migrés de COLONY_EVENTS (0.33).
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'anniversaire',
    titre: 'Anniversaire',
    theme: 'Anniversaire',
    ton: 'positif',
    acteurs: { colon: { filtre: 'acteur.age_rond' } },
    delai: '1j',
    delaiActeur: '7j',        // un même colon n'est fêté qu'une fois par année d'âge
    texte: "C'est l'anniversaire de {colon}. {colon.age} ans. L'équipage attend de voir si on marque le coup.",
    choix: [
      { label: 'Organiser une vraie fête', cout: { biomasse: 75 },
        effets: [{ texte: 'Soirée mémorable. {colon} sourit toute la nuit.' }, { moral: { cible: 'colonie', valeur: 12 } }] },
      { label: 'Geste discret entre amis',
        effets: [{ texte: 'Cadeau modeste, sincère. {colon} apprécie.' }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: "Ne pas s'en occuper",
        effets: [{ texte: "Personne n'a rien dit. {colon} a remarqué." }, { moral: { cible: 'colonie', valeur: -6 } }] },
    ],
  }),

  evenement({
    id: 'hommage',
    titre: 'Hommage aux disparus',
    theme: 'Hommage',
    ton: 'negatif',
    acteurs: { defunt: { parmi: 'morts', filtre: 'acteur.mort_depuis < 3j' } },
    delai: '3j',
    delaiActeur: '30j',       // un défunt n'est honoré qu'une fois
    texte: "L'équipage propose une cérémonie en mémoire de {defunt}. Une pause dans la routine.",
    choix: [
      { label: 'Tenir la cérémonie',
        effets: [{ texte: "L'hommage rend du courage à l'équipage." }, { moral: { cible: 'colonie', valeur: 9 } }] },
      { label: 'Une minute de silence simple',
        effets: [{ texte: 'Geste sobre. Mais sincère.' }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Refuser, focus sur le présent',
        effets: [{ texte: "L'équipage murmure. La présence des morts pèse plus encore." }, { moral: { cible: 'colonie', valeur: -9 } }] },
    ],
  }),

  evenement({
    id: 'conflit_rivaux',
    titre: 'Dispute entre rivaux',
    theme: 'Conflit',
    ton: 'negatif',
    acteurs: { colon: {}, autre: { filtre: 'acteur.affinite <= -50' } },
    delai: '36h',
    texte: 'Une dispute éclate entre {colon} et {autre}. Les autres assistent en silence. Ça pourrait empirer.',
    choix: [
      { label: 'Médiation officielle', requiert: 'equipe.linguistique >= 2',
        effets: [{ texte: 'La médiation calme les esprits. Les deux acceptent un statu quo.' }, { affinite: { a: 'colon', b: 'autre', delta: 25 } }] },
      { label: 'Sanction stricte des deux',
        effets: [{ texte: 'Discipline rétablie. Mais les ressentiments restent.' }, { moral: { cible: 'colonie', valeur: -6 } }, { affinite: { a: 'colon', b: 'autre', delta: -10 } }] },
      { label: 'Séparer leurs affectations',
        effets: [{ texte: 'Les deux ne se croisent plus. Tension désamorcée.' }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Laisser faire',
        effets: [{ texte: "Le conflit s'envenime. L'équipe s'inquiète." }, { moral: { cible: 'colonie', valeur: -9 } }, { affinite: { a: 'colon', b: 'autre', delta: -15 } }] },
    ],
  }),

  evenement({
    id: 'romance',
    titre: 'Romance naissante',
    theme: 'Romance',
    ton: 'positif',
    acteurs: { colon: {}, autre: { filtre: 'acteur.affinite >= 75 && acteur.affinite < 95' } },
    delai: '36h',
    texte: "Quelque chose d'évident pour tout le monde sauf eux-mêmes : {colon} et {autre} se cherchent. L'équipage prend les paris.",
    choix: [
      { label: 'Encourager discrètement',
        effets: [{ texte: "{colon} et {autre} osent enfin. L'équipage applaudit." }, { affinite: { a: 'colon', b: 'autre', delta: 20 } }, { moral: { cible: 'colonie', valeur: 6 } }] },
      { label: 'Ne rien dire et laisser faire',
        effets: [{ texte: "L'équipage observe, en silence." }, { affinite: { a: 'colon', b: 'autre', delta: 5 } }] },
    ],
  }),
];
