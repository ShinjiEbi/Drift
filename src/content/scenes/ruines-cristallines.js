// src/content/scenes/ruines-cristallines.js — Ruines alien de type A : architecture cristalline.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'ruine_a_porte_scellee',
    titre: 'La porte de cristal',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    poids: 6,
    texte: "Une porte de cristal opaque, gravée de motifs concentriques. Elle vibre légèrement quand on s'en approche.",
    choix: [
      {
        label: 'Décoder les motifs',
        requiert: 'equipe.linguistique >= 2',
        effets: [
          { texte: "Une séquence d'ouverture comprise. Salle d'archives à l'intérieur." },
          { gain: { datacubes: 12 } },
        ],
      },
      {
        label: 'Accorder le cristal de mémoire aux motifs',
        requiert: 'equipe.objet.cristal_memoire_alien',
        effets: [
          { texte: "Le cristal entre en résonance avec la porte et enregistre tout. Elle s'ouvre sur une salle d'archives." },
          { gain: { datacubes: 16 } },
        ],
      },
      {
        label: 'Forcer avec un explosif',
        cout: { energie: 15 },
        test: {
          carac: 'dexterite',
          difficulte: 7,
          reussite: [{ texte: 'La porte vole en éclats cristallins.' }, { gain: { datacubes: 6 } }],
          echec: [
            { texte: "L'explosion mal calibrée blesse un opérateur." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
          ],
        },
      },
      { label: 'Reculer', effets: [{ texte: "L'équipe fait demi-tour. Mauvais pressentiment." }] },
    ],
  }),

  scene({
    id: 'ruine_a_artefact',
    titre: "L'objet en suspens",
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    poids: 4,
    texte: "Un objet de la taille d'un poing, en lévitation au centre d'une niche. Aucun support visible. La gravité semble plier autour de lui.",
    choix: [
      {
        label: 'Scanner avec le capteur xeno',
        requiert: 'equipe.objet.capteur_xeno',
        effets: [
          { texte: "Le capteur révèle une signature unique. L'artefact est manipulé en sécurité." },
          { gain: { datacubes: 22 } },
          { objet: 'lentille_noire' },
        ],
      },
      {
        label: 'Le saisir',
        test: {
          carac: 'sangfroid',
          difficulte: 6,
          reussite: [
            { texte: "L'artefact se laisse prendre. Il est plus lourd qu'il n'y paraît." },
            { gain: { datacubes: 5 } },
            { objet: 'lentille_noire' },
          ],
          echec: [
            { texte: 'Quand il est touché, le porteur entend des voix qui ne sont pas là.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
      {
        label: 'Analyser à distance',
        requiert: 'equipe.science >= 3',
        effets: [
          { texte: "L'analyse spectrale révèle des informations précieuses sans contact." },
          { gain: { datacubes: 18 } },
        ],
      },
      { label: 'Photographier et ne pas toucher', effets: [{ gain: { datacubes: 3 } }] },
    ],
  }),

  scene({
    id: 'ruine_a_couloir_chant',
    titre: 'Le couloir qui répète',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    affinites: [
      {
        si: "corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']",
        facteur: 2,
      },
    ],
    poids: 3,
    texte: "Un long couloir de cristal. Quand on parle, la voix revient avec un délai d'une demi-seconde. Comme si quelque chose répétait après nous.",
    choix: [
      { label: 'Avancer en silence', effets: [] },
      {
        label: "Déployer une sonde d'analyse dans le couloir",
        consomme: 'sonde_analyse',
        effets: [
          { texte: "La sonde cartographie les échos sur toute la longueur. Les modulations sont enregistrées sans que personne n'ait à parler." },
          { gain: { datacubes: 14 } },
        ],
      },
      {
        label: "Tester l'écho délibérément",
        test: {
          carac: 'intellect',
          difficulte: 5,
          reussite: [
            { texte: 'Les modulations contiennent un schéma. Encodé pour analyse.' },
            { gain: { datacubes: 8 } },
          ],
          echec: [
            { texte: 'Quelque chose dans les modulations donne mal au crâne.' },
            { moral: -2 },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'boss_alien_gardien',
    titre: 'Le Gardien de cristal',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    affinites: [{ si: "corps.danger == 'predateurs'", facteur: 2 }],
    poids: 1,
    texte: "Au cœur de la ruine cristalline, une chose s'éveille. Trois mètres de haut. Faite de la même matière que les murs. Elle nous regarde.",
    choix: [
      {
        label: "Combattre à l'arme à résonance",
        requiert: 'equipe.objet.arme_resonance',
        test: {
          carac: 'dexterite',
          difficulte: 7,
          reussite: [
            { texte: "Le Gardien s'effondre en éclats lumineux. Trésor inouï." },
            { gain: { datacubes: 50, cristal: 60 } },
            { schema: 'alien_a' },
          ],
          echec: [
            { texte: 'Le combat est trop déséquilibré. Repli en urgence.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
            { retraite: true },
          ],
        },
      },
      {
        label: 'Tenter une négociation rituelle',
        requiert: 'equipe.linguistique >= 4',
        test: {
          carac: 'charisme',
          difficulte: 9,
          reussite: [
            { texte: 'Le Gardien reconnaît un protocole. Il offre un don avant de retourner au sommeil.' },
            { gain: { datacubes: 80 } },
            { objet: 'lentille_noire' },
            { schema: 'alien_a' },
          ],
          echec: [
            { texte: 'Mauvais signe. Le Gardien charge.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
            { retraite: true },
          ],
        },
      },
      {
        label: 'Battre en retraite',
        effets: [{ texte: "L'équipe rebrousse chemin sans bruit." }, { retraite: true }],
      },
    ],
  }),

  scene({
    id: 'schema_alien_a_sanctuaire',
    titre: 'La tablette hexagonale',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    poids: 2,
    texte: 'Au cœur des ruines cristallines, une chambre hexagonale. Au centre, sur un piédestal, une tablette de cristal gravée de motifs concentriques.',
    choix: [
      {
        label: 'Étudier la tablette sur place',
        requiert: 'equipe.linguistique >= 2',
        effets: [
          { texte: 'Le sens des motifs se révèle après analyse.' },
          { gain: { datacubes: 15 } },
          { schema: 'alien_a' },
        ],
      },
      {
        label: 'Emporter la tablette',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'La tablette est descellée et embarquée.' },
            { objet: 'fragment_cristallin' },
            { schema: 'alien_a' },
          ],
          echec: [
            { texte: 'Quelque chose dans les motifs reste accroché à la rétine.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
      {
        label: 'Photographier et partir',
        effets: [{ texte: 'Quelques images. Insuffisant.' }, { gain: { datacubes: 4 } }],
      },
    ],
  }),

  scene({
    id: 'combat_xenoforme',
    titre: 'Ce qui sort des parois',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    poids: 2,
    texte: 'Quelque chose surgit des parois cristallines — pas une créature familière. Des appendices translucides, une bioluminescence pulsante, et une agressivité immédiate.',
    choix: [
      {
        label: 'Combattre la créature',
        effets: [{ combat: { ennemis: ['xenoforme_alpha'], butin: { cristal: 12, datacubes: 5 } } }],
      },
      {
        label: 'Utiliser le résonateur harmonique',
        requiert: 'equipe.objet.resonateur_harmonique',
        effets: [
          { texte: "Le résonateur neutralise la créature en moins d'une seconde." },
          { gain: { cristal: 15, datacubes: 8 } },
        ],
      },
      {
        label: 'Décrocher immédiatement',
        effets: [{ texte: 'Retraite tactique. La créature ne poursuit pas loin.' }],
      },
    ],
  }),

  scene({
    id: 'combat_sentinelles',
    titre: 'La sentinelle',
    lieux: "corps.ruines dans ['alien_a', 'fusion']",
    affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],
    poids: 2,
    texte: "Une colonne de cristal se déplie en silence au milieu du couloir. Des faisceaux violets balaient le sol à hauteur de cheville : une sentinelle, toujours fidèle à un ordre vieux de plusieurs millénaires. Une seconde dort encore dans l'alcôve d'en face.",
    choix: [
      {
        label: 'Abattre la sentinelle éveillée',
        effets: [{ combat: { ennemis: ['sentinelle_alien'], butin: { cristal: 10, datacubes: 4 } } }],
      },
      {
        label: 'Accorder le résonateur harmonique',
        requiert: 'equipe.objet.resonateur_harmonique',
        effets: [
          { texte: "Les faisceaux vacillent puis s'éteignent. La sentinelle se replie dans sa gangue." },
          { gain: { cristal: 12, datacubes: 6 } },
        ],
      },
      {
        label: 'Se glisser entre les faisceaux',
        test: {
          carac: 'dexterite',
          difficulte: 7,
          reussite: [
            { texte: 'Un pas, puis un autre. Les faisceaux passent à un souffle des combinaisons.' },
          ],
          echec: [
            { texte: "Un faisceau accroche une épaule. L'alcôve d'en face s'illumine à son tour." },
            {
              combat: {
                ennemis: ['sentinelle_alien', 'sentinelle_alien'],
                butin: { cristal: 16, datacubes: 6 },
              },
            },
          ],
        },
      },
    ],
  }),
];
