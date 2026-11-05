// src/content/scenes/anomalies-signaux.js — Anomalies physiques et signaux (balises, émissions, chants).
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'anomalie_silence',
    titre: 'La zone de silence',
    lieux: "(corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']) && corps.atmosphere != 'aucune'",
    poids: 3,
    texte: "Une zone de silence parfait. Le vent s'arrête à une frontière nette. À l'intérieur, on n'entend même pas sa propre voix.",
    choix: [
      {
        label: 'Traverser rapidement',
        test: {
          carac: 'sangfroid',
          difficulte: 6,
          reussite: [
            { texte: "De l'autre côté, les capteurs ont enregistré des données précieuses." },
            { gain: { datacubes: 10 } },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'trauma_psy' } }],
        },
      },
      {
        label: 'Contourner',
        effets: [{ texte: 'Le détour fait perdre du temps mais évite le risque.' }],
      },
      {
        label: 'Envoyer notre drone éclaireur',
        requiert: 'equipe.objet.drone_eclaireur',
        effets: [
          { texte: "Le drone enregistre l'anomalie sans danger pour l'équipage." },
          { gain: { datacubes: 14 } },
        ],
      },
      {
        label: "Envoyer un drone d'appoint",
        requiert: 'equipe.pilotage >= 2',
        effets: [
          { texte: "Le drone improvisé enregistre l'anomalie sans danger." },
          { gain: { datacubes: 6 } },
        ],
      },
    ],
  }),

  scene({
    id: 'anomalie_double',
    titre: 'Le double',
    lieux: "(corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']) && corps.type dans ['planete', 'lune']",
    poids: 2,
    texte: "Au détour d'une crête, un membre de l'équipe en aperçoit un autre — eux-mêmes — en train de regarder dans la direction opposée. Ça ne dure qu'une seconde.",
    choix: [
      {
        label: "Faire comme si de rien n'était",
        effets: [
          { texte: "L'équipe avance sans en parler. Mais personne ne l'a oublié." },
          { moral: -2 },
        ],
      },
      {
        label: 'Enregistrer et analyser',
        requiert: 'equipe.science >= 3',
        effets: [
          { texte: "L'enregistrement contient des artefacts temporels mesurables." },
          { gain: { datacubes: 15 } },
        ],
      },
    ],
  }),

  scene({
    id: 'signal_balise',
    titre: 'La balise',
    lieux: "corps.signal == 'sos'",
    poids: 5,
    texte: "La balise est encore active. À côté d'elle, des restes humanoïdes en combinaison ancienne. La date d'émission remonte à plus de cent ans.",
    choix: [
      {
        label: 'Récupérer la balise',
        effets: [
          { texte: 'La balise contient un message complet, archivé.' },
          { gain: { datacubes: 8 } },
          { objet: 'disque_memoire' },
        ],
      },
      {
        label: 'Récupérer aussi les effets personnels',
        test: {
          carac: 'sangfroid',
          difficulte: 5,
          reussite: [
            { texte: "Tout est récupéré. C'est lourd." },
            { gain: { datacubes: 12, metal: 10 } },
            { objet: 'disque_memoire' },
            { moral: -1 },
          ],
          echec: [
            { texte: "L'équipe ressort secouée. La balise est toute la récolte." },
            { moral: -2 },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'signal_crypte_emetteur',
    titre: "L'émetteur enterré",
    lieux: "corps.signal == 'crypte' && corps.type dans ['planete', 'lune', 'asteroide_g']",
    poids: 3,
    texte: "L'émetteur est une boîte enterrée dans le sol, à peine plus grosse qu'un poing. Aucune indication d'origine. La transmission continue sans interruption.",
    choix: [
      {
        label: 'Désactiver et emporter',
        requiert: 'equipe.ingenierie >= 2',
        effets: [
          { texte: "L'émetteur cesse d'émettre. On l'embarque." },
          { gain: { datacubes: 10 } },
          { objet: 'bobine_filaments' },
        ],
      },
      {
        label: 'Tenter de décoder la transmission sur place',
        requiert: 'equipe.linguistique >= 3',
        effets: [
          { texte: 'Le message est partiellement compris. Inquiétant.' },
          { gain: { datacubes: 20 } },
        ],
      },
      {
        label: "Relayer la transmission vers l'avant-poste",
        requiert: 'equipe.objet.noeud_comm',
        effets: [
          { texte: "Le nœud de communication capte le flux brut et le relaie. Les analystes de l'avant-poste s'en chargeront." },
          { gain: { datacubes: 16 } },
        ],
      },
      { label: 'Laisser tel quel', effets: [] },
    ],
  }),

  scene({
    id: 'anomalie_temps',
    titre: 'Les heures fausses',
    lieux: "corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']",
    affinites: [{ si: "corps.signal == 'echo_temporel'", facteur: 3 }],
    poids: 2,
    texte: "Les montres montrent des heures différentes selon l'endroit où on se trouve. Au centre du phénomène, elles tournent à l'envers.",
    choix: [
      {
        label: 'Mesurer avec capteur xeno',
        requiert: 'equipe.objet.capteur_xeno',
        effets: [
          { texte: 'Anomalie temporelle quantifiée. Données rares.' },
          { gain: { datacubes: 25 } },
        ],
      },
      {
        label: "Étudier l'épicentre",
        requiert: 'equipe.science >= 3',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'Étude réussie. Les données sont cohérentes après recalibration.' },
            { gain: { datacubes: 18 } },
          ],
          echec: [
            { texte: 'Perte temporaire de continuité personnelle.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
      { label: 'Cartographier les frontières', effets: [{ gain: { datacubes: 8 } }] },
    ],
  }),

  scene({
    id: 'anomalie_gravite',
    titre: 'La gravité inversée',
    lieux: "(corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']) && corps.type dans ['planete', 'lune', 'asteroide_g']",
    poids: 2,
    texte: "Une zone où la gravité s'inverse. Des galets flottent à hauteur de visière. Quelqu'un essaie de marcher au plafond.",
    choix: [
      {
        label: 'Étudier le phénomène',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Mesures précieuses. Anomalie répertoriée.' },
          { gain: { datacubes: 15, cristal: 10 } },
        ],
      },
      {
        label: "Traverser en s'accrochant",
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [{ texte: 'Traversée acrobatique réussie.' }, { gain: { datacubes: 8 } }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }],
        },
      },
      { label: 'Contourner', effets: [] },
    ],
  }),

  scene({
    id: 'trait_voix_murmure',
    titre: 'La voix',
    lieux: "corps.danger == 'anomalie' || corps.signal dans ['bruit_blanc', 'echo_temporel']",
    affinites: [{ si: "corps.signal == 'bruit_blanc'", facteur: 2 }],
    poids: 2,
    texte: "L'un d'entre vous se fige soudain. « Je l'entends », chuchote-t-il. Personne d'autre n'entend rien.",
    choix: [
      {
        label: "Suivre ce qu'il décrit",
        requiert: 'equipe.trait.voix_murmurent',
        effets: [
          { texte: "La voix le guide vers une cache. Quelqu'un savait qu'il viendrait." },
          { gain: { datacubes: 22, cristal: 15 } },
          { objet: 'fragment_cristallin' },
        ],
      },
      {
        label: 'Le ramener au vaisseau pour examen',
        effets: [{ texte: "Décision prudente. L'équipe rebrousse chemin." }, { moral: -1 }],
      },
      {
        label: 'Ignorer et continuer',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [{ texte: "L'équipe avance. La voix s'éloigne." }],
          echec: [
            { texte: 'Le porteur se prend la tête entre les mains.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
            { moral: -2 },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'signal_chant',
    titre: "Le chant dans l'air",
    lieux: "corps.signal != 'aucun' && corps.atmosphere != 'aucune'",
    affinites: [{ si: "corps.signal == 'bruit_blanc'", facteur: 3 }],
    poids: 2,
    texte: "Le signal n'est pas électronique. Il est porté par l'air. Quelque chose chante, quelque part, en boucle.",
    choix: [
      {
        label: 'Trianguler la source',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Source localisée : un dispositif organique enterré. Récupéré.' },
          { gain: { datacubes: 12 } },
        ],
      },
      {
        label: 'Enregistrer et partir',
        effets: [{ texte: 'Le chant est archivé pour analyse.' }, { gain: { datacubes: 6 } }],
      },
      {
        label: 'Suivre le chant',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'Le chant menait à un sanctuaire. Trouvaille rare.' },
            { gain: { datacubes: 15 } },
            { objet: 'anneau_scelle' },
          ],
          echec: [
            { texte: 'Le chant ne devait pas être suivi.' },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'combat_signal_piege',
    titre: "L'appât",
    lieux: "corps.signal == 'sos'",
    poids: 2,
    texte: "La balise de détresse émet toujours, mais le site autour d'elle est trop propre. Une silhouette en armure lourde émerge des abris, arme levée ; d'autres bougent plus loin. Le signal était un appât, et l'équipe vient d'y mordre.",
    choix: [
      {
        label: 'Forcer le passage',
        effets: [{ combat: { ennemis: ['garde_elite'], butin: { metal: 20, energie: 10 } } }],
      },
      {
        label: 'Parlementer',
        test: {
          carac: 'charisme',
          difficulte: 7,
          reussite: [
            { texte: "Le chef de bande hésite, puis abaisse son arme : un équipage qui ne cherche pas d'ennuis vaut mieux vivant." },
          ],
          echec: [
            { texte: 'Les négociations tournent court.' },
            {
              combat: {
                ennemis: ['garde_elite', 'mercenaire'],
                butin: { metal: 25, energie: 10 },
              },
            },
          ],
        },
      },
      {
        label: 'Battre en retraite',
        effets: [
          { texte: 'Demi-tour immédiat vers le vaisseau. Le piège se referme sur du vide.' },
          { retraite: true },
        ],
      },
    ],
  }),
];
