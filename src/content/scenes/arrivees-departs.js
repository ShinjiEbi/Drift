// src/content/scenes/arrivees-departs.js — Scènes d'arrivée (première scène) et de départ (dernière scène) d'une expédition.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'intro_atterrissage',
    titre: 'Premiers pas',
    moment: 'arrivee',
    lieux: "corps.type != 'epave'",
    poids: 5,
    texte: '{vaisseau} se pose dans un grondement étouffé. Les voilures se déploient. Au-dehors, {lieu}: {decor.biome} {decor.atmosphere}',
    choix: [
      { label: 'Sortie en reconnaissance prudente', effets: [] },
      {
        label: 'Sortie groupée, armes prêtes',
        effets: [{ texte: "L'équipe avance en formation serrée." }],
      },
    ],
  }),

  scene({
    id: 'intro_signal',
    titre: 'Une émission régulière',
    moment: 'arrivee',
    lieux: "corps.signal != 'aucun'",
    poids: 8,
    texte: "À peine posés, les capteurs captent une émission régulière. {decor.signal} L'équipage attend une consigne.",
    choix: [
      { label: 'Triangulation et approche', effets: [] },
      {
        label: 'Ignorer et explorer ailleurs',
        effets: [{ texte: "Le signal est laissé de côté pour l'instant." }],
      },
    ],
  }),

  scene({
    id: 'intro_silence',
    titre: 'Le silence',
    moment: 'arrivee',
    lieux: "corps.vie == 'aucune' && corps.atmosphere != 'aucune' && corps.type dans ['planete', 'lune']",
    poids: 4,
    texte: "Aucun mouvement, aucun son hormis le vent contre les visières. {vaisseau} s'est posé sur un sol rocailleux. {decor.biome}",
    choix: [
      { label: 'Établir un périmètre et commencer la prospection', effets: [] },
      {
        label: "Drone en éclaireur d'abord",
        requiert: 'equipe.pilotage >= 2',
        effets: [{ texte: 'Le drone repère un passage sûr.' }],
      },
    ],
  }),

  scene({
    id: 'intro_orage',
    titre: "L'orage",
    moment: 'arrivee',
    lieux: "corps.danger == 'tempetes' && corps.atmosphere != 'aucune' && corps.type dans ['planete', 'lune']",
    poids: 3,
    texte: "{vaisseau} se pose sous un ciel chargé. À peine les sas ouverts, l'orage éclate. Le tonnerre roule étrangement, plus long qu'il ne devrait.",
    choix: [
      { label: "S'abriter sous le vaisseau", effets: [] },
      {
        label: 'Partir en mission immédiatement',
        effets: [{ texte: "L'équipe affronte la pluie et avance, déterminée." }],
      },
    ],
  }),

  scene({
    id: 'intro_observation',
    titre: "Des silhouettes à l'horizon",
    moment: 'arrivee',
    lieux: "corps.vie == 'civ_active' && corps.type dans ['planete', 'lune']",
    poids: 3,
    texte: "{vaisseau} se pose. À l'horizon, plusieurs silhouettes s'attroupent. Elles regardent. Aucune n'approche, aucune ne fuit.",
    choix: [
      {
        label: 'Sortir avec lenteur, mains visibles',
        requiert: 'equipe.linguistique >= 1',
        effets: [{ texte: "Geste pacifique. Un protocole semble s'établir." }],
      },
      {
        label: 'Sortir armes au flanc',
        effets: [{ texte: "Les silhouettes s'éloignent. La méfiance est désormais mutuelle." }],
      },
    ],
  }),

  scene({
    id: 'intro_vide',
    titre: 'La dérive',
    moment: 'arrivee',
    lieux: "corps.type == 'epave'",
    poids: 3,
    texte: "{vaisseau} se rapproche de l'épave. Les sas tournent dans le vide. Pas de gravité, pas d'air. Juste la dérive lente d'un cadavre métallique.",
    choix: [
      { label: "EVA jusqu'à la passerelle", effets: [] },
      {
        label: "Drone éclaireur d'abord",
        requiert: 'equipe.objet.drone_eclaireur',
        effets: [{ texte: "Le drone repère un risque structurel. L'équipe choisit un sas plus stable." }],
      },
    ],
  }),

  scene({
    id: 'outro_marquage',
    titre: 'Marquer le site',
    moment: 'depart',
    lieux: 'vrai',
    poids: 2,
    texte: "Avant de remonter à bord, l'équipe prend un moment pour marquer le site. Ce n'est pas la dernière visite.",
    choix: [
      {
        label: 'Poser une balise',
        consomme: 'balise_signal',
        effets: [
          { texte: 'Balise posée. Le site reste ouvert pour de futures missions.' },
          { gain: { datacubes: 5 } },
          { rentrer: true },
        ],
      },
      {
        label: 'Embarquer simplement',
        effets: [{ texte: "L'équipe regagne le vaisseau." }, { rentrer: true }],
      },
    ],
  }),

  scene({
    id: 'outro_souvenir',
    titre: 'Un souvenir',
    moment: 'depart',
    lieux: "corps.vie == 'civ_active'",
    poids: 2,
    texte: "Avant de remonter, quelqu'un ramasse un objet anodin. Une pierre, un éclat. Quelque chose pour se rappeler.",
    choix: [
      {
        label: 'Embarquer',
        effets: [{ texte: "L'équipe rentre, plus soudée qu'avant." }, { moral: 1 }, { rentrer: true }],
      },
    ],
  }),

  scene({
    id: 'outro_retour',
    titre: 'Fin de fenêtre',
    moment: 'depart',
    lieux: 'vrai',
    poids: 5,
    texte: "Les capteurs du vaisseau bipent : fin de la fenêtre d'exploration. Il est temps de plier bagage.",
    choix: [
      {
        label: 'Remballer et embarquer',
        effets: [{ texte: 'Sas refermé. Vol de retour engagé.' }, { rentrer: true }],
      },
      {
        label: 'Une dernière inspection',
        test: {
          carac: 'intellect',
          difficulte: 6,
          reussite: [
            { texte: 'Une trouvaille de dernière minute.' },
            { gain: { metal: 15, cristal: 10, datacubes: 4 } },
            { rentrer: true },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }, { rentrer: true }],
        },
      },
    ],
  }),

  scene({
    id: 'outro_decouverte',
    titre: 'Une marque oubliée',
    moment: 'depart',
    lieux: "corps.ruines != 'aucune'",
    poids: 3,
    texte: "À mesure qu'on regagne le vaisseau, l'un de nous remarque quelque chose qu'on avait raté à l'aller — une marque, un symbole.",
    choix: [
      {
        label: 'Y retourner brièvement',
        test: {
          carac: 'sangfroid',
          difficulte: 5,
          reussite: [
            { texte: 'Trouvaille embarquée juste avant le décollage.' },
            { gain: { datacubes: 8 } },
            { objet: 'fragment_cristallin' },
            { rentrer: true },
          ],
          echec: [
            { texte: "L'aller-retour s'est mal passé." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
            { rentrer: true },
          ],
        },
      },
      {
        label: 'Embarquer sans regarder en arrière',
        effets: [{ texte: "Le retour s'amorce." }, { rentrer: true }],
      },
    ],
  }),
];
