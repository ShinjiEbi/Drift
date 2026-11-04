// src/content/scenes/ruines-melees.js — Ruines « fusion » : humain et alien mêlés, et murs de glyphes.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'trait_eidetique',
    titre: 'Le mur de glyphes',
    lieux: "corps.ruines != 'aucune' && corps.type dans ['planete', 'lune']",
    affinites: [{ si: "corps.ruines == 'fusion'", facteur: 2 }],
    poids: 2,
    texte: 'Les murs sont couverts de glyphes, gravés sur dix mètres de haut. Personne ne pourrait tout retenir.',
    choix: [
      {
        label: 'Mémoriser intégralement',
        requiert: 'equipe.trait.memoire_eidetique',
        effets: [
          { texte: 'Tout est dans une seule mémoire. Précieux.' },
          { gain: { datacubes: 28 } },
          { schema: 'auto' },
        ],
      },
      {
        label: 'Photographier méthodiquement',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: "Documentation systématique. Suffisant pour l'analyse." },
          { gain: { datacubes: 14 } },
        ],
      },
      {
        label: 'Mémoriser sous stimulant cognitif',
        consomme: 'stimulant_cognitif',
        effets: [
          { texte: "Le stimulant aiguise la mémoire : l'essentiel des glyphes est retenu avant que l'effet ne retombe." },
          { gain: { datacubes: 20 } },
        ],
      },
      { label: 'Échantillon partiel', effets: [{ gain: { datacubes: 5 } }] },
    ],
  }),

  scene({
    id: 'schema_fusion_chambre_silence',
    titre: 'La chambre du silence',
    lieux: "corps.ruines == 'fusion'",
    poids: 1,
    texte: "Une salle où l'humain et l'alien se mêlent dans une géométrie qui ne devrait pas exister. Au centre, un dispositif intact. Quelque chose de fonctionnel.",
    choix: [
      {
        label: 'Étudier longuement',
        requiert: 'equipe.science >= 3',
        effets: [
          { texte: "Une heure d'analyse. Les schémas sont compris." },
          { gain: { datacubes: 25 } },
          { schema: 'fusion' },
        ],
      },
      {
        label: "Interfacer l'implant synaptique avec le dispositif",
        requiert: 'equipe.objet.implant_synaptique',
        effets: [
          { texte: "L'implant traduit ce que l'œil ne suit pas. Les schémas se déposent directement dans la mémoire du porteur." },
          { gain: { datacubes: 15 } },
          { schema: 'fusion' },
        ],
      },
      {
        label: 'Embarquer le dispositif entier',
        test: {
          carac: 'vigueur',
          difficulte: 8,
          reussite: [
            { texte: "L'objet est emporté avec précaution." },
            { gain: { datacubes: 15 } },
            { objet: 'plaque_gravee' },
            { schema: 'fusion' },
          ],
          echec: [
            { texte: "Quelque chose s'est passé. Personne ne veut en parler." },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
            { moral: -3 },
          ],
        },
      },
      {
        label: "Sortir d'ici sans rien toucher",
        effets: [{ texte: "Sage décision. L'équipe fait demi-tour." }, { moral: 1 }],
      },
    ],
  }),
];
