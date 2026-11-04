// src/content/scenes/ruines-humaines.js — Ruines humaines pré-Effondrement.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'ruine_h_porte',
    titre: 'La porte soudée',
    lieux: "corps.ruines dans ['humaines', 'fusion']",
    poids: 5,
    texte: "Une porte blindée scellée, gravure d'un logo corporate à demi effacé. Quelqu'un a tenté de la souder de l'intérieur.",
    choix: [
      {
        label: "Forcer l'ouverture",
        test: {
          carac: 'vigueur',
          difficulte: 6,
          reussite: [
            { texte: 'La porte cède dans un grincement. Local de stockage.' },
            { gain: { metal: 30, cristal: 15 } },
          ],
          echec: [
            { texte: 'Un éclat de métal vient blesser un membre.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
          ],
        },
      },
      {
        label: 'Couper avec un chalumeau',
        requiert: 'equipe.ingenierie >= 2',
        cout: { energie: 8 },
        effets: [
          { texte: "L'ingénieur découpe proprement la cloison." },
          { gain: { metal: 40, cristal: 20, datacubes: 3 } },
        ],
      },
      {
        label: 'Poser une charge de démolition',
        consomme: 'explosif_demolition',
        effets: [
          { texte: "La charge directionnelle souffle la porte d'un bloc. Le local de stockage est intact." },
          { gain: { metal: 45, cristal: 20, datacubes: 3 } },
        ],
      },
      { label: 'Passer son chemin', effets: [] },
    ],
  }),

  scene({
    id: 'ruine_h_journal',
    titre: 'Le dernier journal',
    lieux: "corps.ruines dans ['humaines', 'fusion']",
    poids: 4,
    texte: "Au sol, un terminal portable encore alimenté. Un journal personnel défile. La dernière entrée est paniquée — quelqu'un parle de « choses dans les murs ».",
    choix: [
      {
        label: 'Tout copier sur nos disques',
        effets: [{ texte: 'Le journal est archivé pour analyse.' }, { gain: { datacubes: 8 } }],
      },
      {
        label: 'Ne lire que les coordonnées mentionnées',
        test: {
          carac: 'intellect',
          difficulte: 5,
          reussite: [
            { texte: 'Cache repéré dans les fragments de texte.' },
            { gain: { datacubes: 4 } },
          ],
          echec: [{ texte: 'Les passages utiles restent indéchiffrables.' }],
        },
      },
      {
        label: 'Laisser le terminal en place',
        effets: [{ texte: 'Personne ne dit rien, mais les visages se sont fermés.' }, { moral: -1 }],
      },
    ],
  }),

  scene({
    id: 'ruine_h_charnier',
    titre: 'Le charnier',
    lieux: "corps.ruines dans ['humaines', 'fusion'] || corps.type == 'epave'",
    poids: 2,
    texte: 'Une salle entière. Des corps en combinaison, alignés. Pas une trace de violence visible.',
    choix: [
      {
        label: 'Récupérer leur équipement',
        test: {
          carac: 'sangfroid',
          difficulte: 6,
          reussite: [
            { texte: "L'équipement est en bon état." },
            { gain: { metal: 40, cristal: 30 } },
            { objet: 'outil_etrange' },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'trauma_psy' } }, { moral: -2 }],
        },
      },
      {
        label: 'Photographier et partir',
        effets: [{ texte: 'Personne ne sait quoi dire.' }, { moral: -1 }],
      },
      {
        label: "Vérifier les badges d'identité",
        requiert: 'equipe.science >= 1',
        effets: [
          { texte: "Une corporation pré-Effondrement, comme on s'en doutait." },
          { gain: { datacubes: 5 } },
          { moral: -1 },
        ],
      },
    ],
  }),

  scene({
    id: 'irradie_silos',
    titre: 'Les silos',
    lieux: "corps.ruines dans ['humaines', 'fusion'] && corps.type dans ['planete', 'lune']",
    affinites: [{ si: "corps.biome == 'irradie'", facteur: 3 }],
    poids: 3,
    texte: "Une rangée de silos en béton, certains éventrés. Des compteurs Geiger qui crachotent. Quelqu'un a stocké quelque chose ici, longtemps.",
    choix: [
      {
        label: 'Inspecter avec combinaisons normales',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'Inspection rapide. Quelques découvertes mais le compteur est devenu hystérique.' },
            { gain: { metal: 20, datacubes: 8 } },
          ],
          echec: [
            { texte: 'Doses absorbées trop élevées.' },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Inspecter avec combinaison adaptive',
        requiert: 'equipe.objet.combinaison_xeno',
        effets: [
          { texte: 'La combinaison filtre tout. Inspection thorough sans risque.' },
          { gain: { metal: 30, datacubes: 14 } },
        ],
      },
      {
        label: 'Inspecter avec combinaison renforcée',
        requiert: 'equipe.objet.combinaison_renforcee',
        effets: [
          { texte: 'Le blindage tient bon. Récupération efficace.' },
          { gain: { metal: 25, datacubes: 10 } },
        ],
      },
      {
        label: 'Inspecter en armure composite',
        requiert: 'equipe.objet.armure_composite',
        effets: [
          { texte: "L'alliage stratifié arrête tout. L'équipe fouille les silos jusqu'au fond." },
          { gain: { metal: 35, datacubes: 16 } },
        ],
      },
      { label: 'Trop dangereux. On contourne.', effets: [{ texte: 'Sage décision.' }] },
    ],
  }),

  scene({
    id: 'schema_humain_archives',
    titre: 'Les archives ignifugées',
    lieux: "corps.ruines dans ['humaines', 'fusion']",
    poids: 2,
    texte: "Une salle d'archives. Dans une armoire ignifugée, des microfilms intacts. Quelqu'un les a soigneusement protégés avant de partir.",
    choix: [
      {
        label: 'Embarquer la totalité',
        requiert: 'equipe.science >= 1',
        effets: [
          { texte: 'Les archives techniques sont précieuses.' },
          { gain: { datacubes: 10 } },
          { schema: 'humain' },
        ],
      },
      {
        label: 'Sélectionner les plus prometteurs',
        test: {
          carac: 'intellect',
          difficulte: 6,
          reussite: [
            { texte: 'Tri rapide effectué.' },
            { gain: { datacubes: 5 } },
            { schema: 'humain' },
          ],
          echec: [{ texte: "Le tri à la hâte s'avère décevant." }, { gain: { datacubes: 3 } }],
        },
      },
    ],
  }),

  scene({
    id: 'combat_drone_gardien',
    titre: 'Le drone gardien',
    lieux: "corps.ruines dans ['humaines', 'fusion']",
    affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],
    poids: 3,
    texte: 'Une sphère métallique descend du plafond en ronronnant. Son œil rouge balaie la salle. Protocole de sécurité encore actif après des siècles.',
    choix: [
      {
        label: 'Neutraliser le drone',
        effets: [{ combat: { ennemis: ['drone_gardien'], butin: { metal: 20, cristal: 3 } } }],
      },
      {
        label: 'Pirater le protocole',
        requiert: 'equipe.ingenierie >= 3',
        effets: [
          { texte: "Le drone s'arrête. Ses composants sont récupérables." },
          { gain: { metal: 25, cristal: 5 } },
        ],
      },
      {
        label: 'Contourner en silence',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [{ texte: 'Le drone ne détecte rien. Passage libre.' }],
          echec: [
            {
              combat: { ennemis: ['drone_gardien', 'drone_gardien'], butin: { metal: 20 } },
            },
          ],
        },
      },
    ],
  }),
];
