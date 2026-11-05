// src/content/evenements/decouvertes.js — visiteurs, intuitions, archives, songes.
// Migrés de COLONY_EVENTS (0.33).
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'visiteur_isole',
    titre: 'Visiteur isolé',
    theme: 'Visiteur',
    ton: 'positif',
    // Accueillir un colon est une décision : seulement s'il reste une couchette
    // et que les vivres suivent (biomasse en stock, bilan horaire positif)
    si: 'colonie.vivres_ok',
    delai: '4j',
    texte: "Une silhouette inconnue se présente à l'avant-poste. Sans vaisseau, sans escorte. Elle dit avoir voyagé seule longtemps.",
    choix: [
      { label: "L'accueillir comme colon",
        effets: [{ texte: "Un nouveau visage rejoint l'avant-poste. L'équipage est curieux." }, { recrute: { inconnu: true } }] },
      { label: "L'interroger d'abord", requiert: 'equipe.linguistique >= 2',
        effets: [{ texte: 'Histoire vérifiée. Le visiteur rejoint la colonie sereinement.' }, { recrute: { inconnu: true, bonus: 1 } }, { gain: { datacubes: 24 } }] },
      { label: 'La renvoyer poliment',
        effets: [{ texte: "La silhouette s'éloigne. Personne ne sait ce qu'elle est devenue." }, { moral: { cible: 'colonie', valeur: -3 } }] },
    ],
  }),

  evenement({
    id: 'insight_labo',
    titre: 'Intuition au laboratoire',
    theme: 'Découverte',
    ton: 'positif',
    si: 'colonie.module.laboratoire >= 2 && (colonie.recherches >= 1 || colonie.techs >= 2)',
    acteurs: { colon: { prefere: "acteur.poste == 'laboratoire'" } },
    delai: '36h',
    texte: '{colon} relit ses notes pour la dixième fois. Cette fois, quelque chose lui saute aux yeux.',
    choix: [
      { label: "L'autoriser à publier",
        effets: [{ texte: '{colon} formalise une découverte mineure. Un palier intellectuel.' }, { gain: { datacubes: 54 } }, { moral: { cible: 'colonie', valeur: 3 } }] },
      { label: 'Garder confidentiel',
        effets: [{ texte: 'Les données restent dans le coffre. Pour plus tard.' }, { gain: { datacubes: 36 } }] },
    ],
  }),

  evenement({
    id: 'decouverte_archive',
    titre: 'Archive retrouvée',
    theme: 'Découverte',
    ton: 'positif',
    acteurs: { colon: { filtre: 'acteur.linguistique >= 2' } },
    delai: '36h',
    texte: '{colon} retombe sur une vieille archive numérique de la colonie. Il y a quelque chose dedans.',
    choix: [
      // « Insight historique » : anglicisme remplacé ; la page d'archives « Ceux d'avant » s'ouvre
      { label: 'Décrypter en profondeur',
        effets: [{ texte: 'Données pré-Effondrement décryptées. Un éclairage historique.' }, { gain: { datacubes: 45 } }, { monde: { archive_colonie: true } }] },
      { label: 'Survol rapide',
        effets: [{ texte: 'Quelques bribes intéressantes.' }, { gain: { datacubes: 15 } }] },
    ],
  }),

  evenement({
    id: 'songe',
    titre: 'Songe collectif',
    theme: 'Songe',
    ton: 'negatif',
    si: 'colonie.colons >= 3 && (colonie.schemas.alien_a >= 1 || colonie.schemas.alien_b >= 1 || colonie.schemas.fusion >= 1)',
    acteurs: { colon: {} },
    delai: '36h',
    texte: "Plusieurs colons font le même rêve cette nuit. {colon} l'évoque le lendemain. Une grande forme qui regarde. Aucun visage.",
    choix: [
      { label: 'Documenter pour étude', requiert: 'equipe.science >= 2',
        effets: [{ texte: 'Le rêve collectif est consigné. Étrange. Précieux.' }, { gain: { datacubes: 30 } }, { monde: { songe_consigne: true } }] },
      { label: "Faire comme si de rien n'était",
        effets: [{ texte: 'Tout le monde se tait. Mais quelque chose plane.' }, { moral: { cible: 'colonie', valeur: -6 } }] },
      { label: 'Renforcer les heures de sommeil',
        effets: [{ texte: "Repos forcé. Les rêves s'estompent." }, { moral: { cible: 'colonie', valeur: 3 } }] },
    ],
  }),
];
