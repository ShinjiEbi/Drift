// src/content/scenes/civilisations.js — Civilisations actives ou déchues, factions hostiles.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'civ_active_rencontre',
    titre: 'La silhouette qui attend',
    lieux: "corps.vie == 'civ_active'",
    poids: 4,
    texte: "Une silhouette se tient à découvert. Elle ne porte pas d'arme. Elle attend.",
    choix: [
      {
        label: 'Tenter le contact',
        requiert: 'equipe.linguistique >= 1',
        test: {
          carac: 'charisme',
          difficulte: 6,
          reussite: [
            { texte: "Échange réussi. La silhouette offre un objet en signe d'accord." },
            { gain: { datacubes: 15 } },
            { objet: 'plaque_gravee' },
            { reputation: 10 },
          ],
          echec: [
            { texte: 'Le contact tourne mal sans dégénérer. La silhouette se retire.' },
            { moral: -1 },
            { reputation: -5 },
          ],
        },
      },
      {
        label: 'Se retirer en silence',
        effets: [{ texte: "Personne ne tire. Personne ne bouge. Et puis, c'est fini." }],
      },
    ],
  }),

  scene({
    id: 'civ_dechue_temple',
    titre: 'Le temple effondré',
    lieux: "corps.vie == 'civ_dechue'",
    poids: 4,
    texte: "Un temple, peut-être. Ou un mausolée. Les statues sont à demi affaissées dans la roche, érodées au point d'être méconnaissables.",
    choix: [
      {
        label: "Inspecter l'autel",
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: "L'autel contient un dispositif technologique camouflé en pierre." },
          { gain: { datacubes: 14 } },
          { objet: 'plaque_gravee' },
        ],
      },
      {
        label: 'Profaner pour récupérer le métal',
        test: {
          carac: 'sangfroid',
          difficulte: 6,
          reussite: [
            { texte: "Métal récupéré, mais l'équipe ne se regarde plus pareil." },
            { gain: { metal: 50, cristal: 20 } },
            { moral: -2 },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'trauma_psy' } }, { moral: -3 }],
        },
      },
      { label: 'Repartir en respectant les lieux', effets: [{ moral: 1 }] },
    ],
  }),

  scene({
    id: 'civ_troc',
    titre: 'Une proposition',
    lieux: "corps.vie == 'civ_active'",
    poids: 4,
    texte: "Un groupe se présente avec des objets en évidence. Pas d'armes apparentes. C'est clairement une proposition.",
    choix: [
      {
        label: 'Échanger des datacubes contre leurs offrandes',
        cout: { datacubes: 15 },
        effets: [
          { texte: "L'échange est équitable. Geste de bonne foi établi." },
          { gain: { biomasse: 25 } },
          { objet: 'plaque_gravee' },
          { reputation: 8 },
        ],
      },
      {
        label: 'Échanger une ration contre un objet',
        consomme: 'ration_concentree',
        effets: [
          { texte: "La ration est bien reçue. On obtient un fragment d'information." },
          { gain: { datacubes: 8 } },
          { reputation: 5 },
        ],
      },
      {
        label: 'Tenter de comprendre leur monnaie',
        requiert: 'equipe.linguistique >= 2',
        effets: [
          { texte: "Système d'échange compris. Connaissance précieuse." },
          { gain: { datacubes: 12 } },
          { reputation: 3 },
        ],
      },
      { label: 'Décliner poliment', effets: [{ texte: "L'équipe se retire avec respect." }] },
      {
        label: 'Saisir leurs offrandes par la force',
        test: {
          carac: 'vigueur',
          difficulte: 5,
          reussite: [
            { texte: 'Les offrandes sont prises. Les regards aussi.' },
            { gain: { biomasse: 30, datacubes: 8 } },
            { moral: -2 },
            { reputation: -25 },
          ],
          echec: [
            { texte: "Le groupe ripostait mieux qu'attendu." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
            { reputation: -35 },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'civ_negociation',
    titre: 'La délégation',
    lieux: "corps.vie == 'civ_active'",
    poids: 3,
    texte: "Une délégation, manifestement officielle. L'un d'eux porte un emblème. Ils veulent négocier quelque chose.",
    choix: [
      {
        label: 'Mener la négociation',
        requiert: 'equipe.linguistique >= 2',
        test: {
          carac: 'charisme',
          difficulte: 7,
          reussite: [
            { texte: 'Accord conclu. Échange de plans techniques en signe de paix.' },
            { gain: { datacubes: 20 } },
            { schema: ['humain', 'fusion'] },
            { reputation: 15 },
          ],
          echec: [
            { texte: 'Malentendu culturel. La délégation se retire, vexée.' },
            { reputation: -10 },
          ],
        },
      },
      {
        label: 'Offrir un sérum xeno comme cadeau',
        consomme: 'serum_xeno',
        effets: [
          { texte: 'Le sérum impressionne. La délégation offre un cadeau réciproque.' },
          { gain: { datacubes: 18 } },
          { objet: 'plaque_gravee' },
          { reputation: 20 },
        ],
      },
      {
        label: 'Saluer et prendre congé',
        effets: [
          { texte: 'Geste respectueux apprécié des deux côtés.' },
          { moral: 1 },
          { reputation: 2 },
        ],
      },
    ],
  }),

  scene({
    id: 'civ_dechue_oracle',
    titre: "L'oracle",
    lieux: "corps.vie == 'civ_dechue'",
    poids: 2,
    texte: "Une silhouette ancienne, dernière représentante d'une civilisation effondrée. Elle attend dans l'embrasure d'un sanctuaire.",
    choix: [
      {
        label: 'Écouter sa parole',
        requiert: 'equipe.linguistique >= 2',
        effets: [
          { texte: "Mémoire d'une civilisation transmise. Geste sacré." },
          { gain: { datacubes: 18 } },
          { schema: ['humain', 'fusion'] },
          { moral: 2 },
          { reputation: 10 },
        ],
      },
      {
        label: 'Lui apporter du réconfort',
        requiert: 'equipe.trait.charisma',
        effets: [
          { texte: "L'oracle remet un objet en signe de gratitude." },
          { gain: { datacubes: 10 } },
          { objet: 'plaque_gravee' },
          { moral: 1 },
          { reputation: 5 },
        ],
      },
      {
        label: "S'en aller respectueusement",
        effets: [{ texte: "L'oracle hoche la tête. Une dernière fois." }, { moral: 1 }],
      },
    ],
  }),

  scene({
    id: 'embuscade_faction',
    titre: "L'embuscade",
    moment: 'embuscade',
    lieux: 'faction.reputation <= -60',
    poids: 8,
    texte: "L'équipe est encerclée. Pas de surprise — ils nous attendaient. Notre dernière visite ici n'avait pas été oubliée.",
    choix: [
      {
        label: 'Combattre',
        test: {
          carac: 'dexterite',
          difficulte: 7,
          reussite: [
            { texte: "L'embuscade est repoussée. Mais le souvenir s'aggrave." },
            { gain: { biomasse: 20, datacubes: 5 } },
            { reputation: -5 },
          ],
          echec: [
            { texte: 'Repli forcé. Plusieurs blessés.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
            { retraite: true },
          ],
        },
      },
      {
        label: 'Négocier en urgence',
        requiert: 'equipe.linguistique >= 3',
        test: {
          carac: 'charisme',
          difficulte: 8,
          reussite: [
            { texte: 'Échange tendu. Mais la voix porte. Réputation reconstruite.' },
            { reputation: 15 },
          ],
          echec: [
            { texte: 'Les mots ne suffisent plus. Repli.' },
            { reputation: -10 },
            { retraite: true },
          ],
        },
      },
      {
        label: 'Battre en retraite',
        effets: [
          { texte: "L'équipe se replie. La faction observe." },
          { reputation: -3 },
          { retraite: true },
        ],
      },
    ],
  }),

  scene({
    id: 'combat_embuscade_pillards',
    titre: 'Les pillards',
    lieux: "corps.vie == 'civ_dechue'",
    poids: 3,
    texte: 'Des silhouettes en combinaison rapiécée surgissent des décombres. Des pillards — armés, affamés, et très peu enclins à négocier.',
    choix: [
      {
        label: 'Engager le combat',
        effets: [{ combat: { ennemis: ['pillard', 'pillard'], butin: { metal: 20, biomasse: 10 } } }],
      },
      {
        label: 'Tenter de négocier',
        test: {
          carac: 'charisme',
          difficulte: 7,
          reussite: [
            { texte: 'Accord conclu. Ils laissent passer en échange de quelques matériaux.' },
            { gain: { metal: 10 } },
          ],
          echec: [{ combat: { ennemis: ['pillard', 'mercenaire'], butin: { metal: 25 } } }],
        },
      },
      {
        label: 'Battre en retraite',
        effets: [{ texte: 'Demi-tour. La zone est trop dangereuse.' }, { retraite: true }],
      },
    ],
  }),
];
