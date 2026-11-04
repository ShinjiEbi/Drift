// src/content/scenes/dangers.js — Dangers du lieu : tempêtes, failles, atmosphère toxique.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'tempete',
    titre: 'Le mur de poussière',
    lieux: "corps.danger == 'tempetes' && corps.atmosphere != 'aucune' && corps.type dans ['planete', 'lune']",
    poids: 5,
    texte: "Le ciel vire à l'ocre en quelques minutes. L'horizon est avalé par un mur de poussière en approche.",
    choix: [
      {
        label: "S'abriter et attendre",
        effets: [{ texte: "L'équipe se met à l'abri pendant que la tempête passe." }],
      },
      {
        label: 'Tenter de continuer',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [{ texte: "L'équipe traverse la tempête sans dommage majeur." }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }, { moral: -1 }],
        },
      },
      {
        label: 'Renforcer les combinaisons avec un kit de réparation',
        consomme: 'kit_reparation',
        effets: [{ texte: "Les combinaisons tiennent malgré le sable abrasif. L'équipe traverse." }],
      },
      {
        label: 'Replier le campement et regagner le vaisseau',
        effets: [{ texte: "L'équipe choisit la prudence et regagne le bord." }, { retraite: true }],
      },
    ],
  }),

  scene({
    id: 'faille',
    titre: 'La crevasse',
    lieux: "corps.danger == 'faille' && corps.type dans ['planete', 'lune', 'asteroide_g']",
    poids: 3,
    texte: "Le sol s'effondre sans prévenir. Quelqu'un a juste le temps de s'agripper.",
    choix: [
      {
        label: 'Faire la chaîne pour le remonter',
        test: {
          carac: 'vigueur',
          difficulte: 6,
          reussite: [{ texte: "L'équipe le hisse en sécurité. Sueurs froides." }],
          echec: [
            { texte: 'La chute est mal contrôlée.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
          ],
        },
      },
      {
        label: "Descendre voir ce qu'il y a en bas",
        requiert: 'equipe.trait.sang_froid',
        effets: [
          { texte: 'La crevasse abritait un dépôt naturel.' },
          { gain: { metal: 25, cristal: 20, datacubes: 5 } },
        ],
      },
      {
        label: 'Descendre au grappin tactique',
        requiert: 'equipe.objet.grappin_tactique',
        effets: [
          { texte: "Le câble ancré, l'équipe remonte le blessé puis descend explorer : la crevasse abritait un dépôt naturel." },
          { gain: { metal: 25, cristal: 20, datacubes: 5 } },
        ],
      },
    ],
  }),

  scene({
    id: 'atm_toxique_filtre',
    titre: 'Filtres saturés',
    lieux: "corps.atmosphere == 'toxique'",
    poids: 4,
    texte: "Les filtres saturent en moins d'une heure. L'air corrode les soudures. Chaque minute coûte de l'équipement.",
    choix: [
      {
        label: 'Tenir avec combinaison adaptive',
        requiert: 'equipe.objet.combinaison_xeno',
        effets: [
          { texte: "La membrane vit avec l'air. Aucune dégradation." },
          { gain: { datacubes: 12 } },
        ],
      },
      {
        label: 'Tenir avec combinaison renforcée',
        requiert: 'equipe.objet.combinaison_renforcee',
        effets: [{ texte: 'Le blindage tient juste assez longtemps.' }, { gain: { datacubes: 6 } }],
      },
      {
        label: 'Brancher le purificateur atmosphérique sur le sas mobile',
        requiert: 'equipe.objet.purificateur_air',
        effets: [
          { texte: "Le purificateur régénère les filtres entre deux sorties. L'équipe tient le terrain plus longtemps." },
          { gain: { datacubes: 9 } },
        ],
      },
      { label: 'Repli rapide', effets: [{ texte: "L'équipe regagne le sas avant saturation." }] },
      {
        label: "Pousser jusqu'à saturation",
        test: {
          carac: 'sangfroid',
          difficulte: 8,
          reussite: [{ texte: 'Limite atteinte de justesse.' }, { gain: { datacubes: 8 } }],
          echec: [
            { texte: 'Un filtre a lâché. Le porteur a respiré.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'trait_beni',
    titre: 'Un alignement improbable',
    lieux: "corps.danger dans ['predateurs', 'tempetes']",
    poids: 1,
    texte: 'Une situation devrait être catastrophique. Et pourtant, par un alignement improbable, tout se passe bien.',
    choix: [
      {
        label: "Saisir l'occasion",
        requiert: 'equipe.trait.beni',
        effets: [
          { texte: "L'équipe ressort intacte d'un guêpier qui aurait dû la coûter cher." },
          { gain: { metal: 25, cristal: 25, datacubes: 12 } },
          { moral: 2 },
        ],
      },
      { label: 'Reculer prudemment', effets: [{ texte: 'Sage. La situation aurait pu basculer.' }] },
    ],
  }),
];
