// src/content/scenes/faune-flore.js — Faune, flore agressive et prédateurs.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'faune_predateur',
    titre: 'Six yeux dans les herbes',
    lieux: "(corps.vie == 'faune' || corps.danger == 'predateurs') && corps.type dans ['planete', 'lune']",
    affinites: [{ si: "corps.danger == 'predateurs'", facteur: 2 }],
    poids: 5,
    texte: "Une masse de muscle et de griffes émerge des herbes. Six yeux, quatre pattes, une mâchoire qui s'ouvre dans le mauvais sens.",
    choix: [
      {
        label: 'Engager le combat',
        effets: [{ combat: { ennemis: ['predateur_lunaire'], butin: { biomasse: 45 } } }],
      },
      {
        label: 'Repousser au lance-flammes',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: "La créature recule devant les flammes, puis s'effondre." },
          { gain: { biomasse: 50 } },
        ],
      },
      {
        label: "Tirer à l'arme à résonance",
        requiert: 'equipe.objet.arme_resonance',
        effets: [
          { texte: 'Un seul tir. La créature se désintègre par fréquence.' },
          { gain: { biomasse: 50, datacubes: 3 } },
        ],
      },
      {
        label: 'Reculer en formation défensive',
        requiert: 'equipe.combat >= 2',
        effets: [{ texte: "L'équipe se replie sans pertes. La créature renonce." }],
      },
      {
        label: 'Laisser un appât et fuir',
        cout: { biomasse: 20 },
        effets: [{ texte: "La créature s'attaque à l'appât. On en profite pour passer." }],
      },
    ],
  }),

  scene({
    id: 'flore_lianes',
    titre: 'Les lianes',
    lieux: "corps.vie == 'flore_agressive'",
    poids: 4,
    texte: 'Les lianes ne devraient pas bouger. Pourtant, elles convergent lentement vers la chaleur des combinaisons.',
    choix: [
      {
        label: 'Brûler un passage au lance-flammes',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: 'Le lance-flammes ouvre un couloir net dans les lianes.' },
          { gain: { biomasse: 35 } },
        ],
      },
      {
        label: 'Brûler un passage au lance-flammes (improvisé)',
        cout: { energie: 12 },
        effets: [
          { texte: 'Bricolé avec la torche oxygène. Les lianes reculent.' },
          { gain: { biomasse: 25 } },
        ],
      },
      {
        label: 'Avancer en restant immobile par moments',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [{ texte: "L'équipe traverse comme des fantômes." }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }],
        },
      },
      {
        label: 'Étudier la réaction biologique',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Échantillon précieux pour la recherche.' },
          { gain: { datacubes: 6, biomasse: 15 } },
        ],
      },
    ],
  }),

  scene({
    id: 'faune_essaim',
    titre: "L'essaim coordonné",
    lieux: "corps.vie == 'faune' && corps.atmosphere != 'aucune'",
    poids: 4,
    texte: "Un nuage de petites créatures volantes, denses, pas plus grosses qu'un pouce. Elles forment des motifs trop coordonnés pour être innocents.",
    choix: [
      {
        label: 'Avancer normalement',
        test: {
          carac: 'sangfroid',
          difficulte: 5,
          reussite: [{ texte: "L'essaim contourne sans attaquer." }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }, { moral: -1 }],
        },
      },
      {
        label: 'Lâcher une grenade fumigène',
        cout: { energie: 5 },
        effets: [{ texte: "L'essaim se disperse. Passage tranquille." }],
      },
    ],
  }),

  scene({
    id: 'ocean_creature',
    titre: 'Sous la surface',
    lieux: "corps.biome == 'ocean' && corps.vie != 'aucune'",
    affinites: [{ si: "corps.vie == 'faune'", facteur: 2 }],
    poids: 2,
    texte: "Quelque chose remue à la surface, à cent mètres du débarquement. C'est gros. Très gros. Et ça vient vers nous.",
    choix: [
      {
        label: 'Tirer sommation au lance-flammes',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: 'Le rugissement de feu fait fuir la créature. Au passage, elle laisse un fragment.' },
          { gain: { biomasse: 60 } },
        ],
      },
      {
        label: 'Reculer vers le vaisseau',
        effets: [{ texte: "L'équipe se replie. La créature ne suit pas hors de l'eau." }],
      },
      {
        label: 'Tenter le contact (Linguistique)',
        requiert: 'equipe.linguistique >= 3',
        test: {
          carac: 'sangfroid',
          difficulte: 8,
          reussite: [
            { texte: 'Une forme de communication. La créature offre un fragment de sa peau.' },
            { gain: { datacubes: 25, biomasse: 30 } },
          ],
          echec: [
            { texte: "Quelque chose a essayé de répondre. Ce n'était pas amical." },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'faune_meute',
    titre: 'Le demi-cercle',
    lieux: "(corps.vie == 'faune' || corps.danger == 'predateurs') && corps.type dans ['planete', 'lune']",
    affinites: [{ si: "corps.danger == 'predateurs'", facteur: 2 }],
    poids: 3,
    texte: 'Des silhouettes basses dans la pénombre, en demi-cercle. Elles ne grognent pas. Elles attendent.',
    choix: [
      {
        label: 'Lance-flammes en arc',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: 'Le mur de feu disperse la meute. Quelques carcasses récupérées.' },
          { gain: { biomasse: 45 } },
        ],
      },
      {
        label: "Tirer en l'air avec arme à résonance",
        requiert: 'equipe.objet.arme_resonance',
        effets: [
          { texte: 'Le pulse fait fuir la meute sans la tuer. Elle laisse une carcasse.' },
          { gain: { biomasse: 30 } },
        ],
      },
      {
        label: 'Reculer sans courir',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [{ texte: "Personne n'a couru. La meute se désintéresse." }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_grave' } }],
        },
      },
      {
        label: 'Lancer une ration comme appât',
        consomme: 'ration_concentree',
        effets: [{ texte: "La meute se jette sur la ration. L'équipe passe." }],
      },
    ],
  }),

  scene({
    id: 'faune_trace',
    titre: 'La trace fraîche',
    lieux: "corps.vie == 'faune' && corps.type dans ['planete', 'lune']",
    poids: 3,
    texte: "Une trace fraîche dans le sol meuble. Quelque chose de grand, de lourd, est passé ici dans l'heure.",
    choix: [
      {
        label: 'Suivre la piste',
        requiert: 'equipe.survie >= 2',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [
            { texte: 'Suivi réussi. La piste mène à un nid abandonné, riche en matière.' },
            { gain: { biomasse: 35, datacubes: 4 } },
          ],
          echec: [
            { texte: 'Embuscade. La créature attendait.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
          ],
        },
      },
      {
        label: 'Marquer et éviter',
        requiert: 'equipe.objet.balise_signal',
        effets: [{ texte: 'Site marqué pour études zoologiques futures.' }, { gain: { datacubes: 5 } }],
      },
      {
        label: 'Tendre le filet de capture sur la piste',
        requiert: 'equipe.objet.filet_capture_xeno',
        effets: [
          { texte: 'La créature revient sur ses pas et se prend dans les filaments. Spécimen vivant, endormi, embarqué.' },
          { gain: { biomasse: 40, datacubes: 8 } },
        ],
      },
      { label: "Continuer l'exploration", effets: [] },
    ],
  }),

  scene({
    id: 'flore_pollen',
    titre: 'Le pollen pourpre',
    lieux: "corps.vie == 'flore_agressive' && corps.atmosphere != 'aucune'",
    poids: 3,
    texte: "Les fleurs s'ouvrent en cascade au passage de l'équipe et libèrent un pollen pourpre dense.",
    choix: [
      {
        label: 'Filtres au max et avancer',
        test: {
          carac: 'sangfroid',
          difficulte: 6,
          reussite: [{ texte: 'Les filtres tiennent.' }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } }],
        },
      },
      {
        label: 'Combinaison adaptive',
        requiert: 'equipe.objet.combinaison_xeno',
        effets: [
          { texte: 'La membrane filtre le pollen et en analyse la composition.' },
          { gain: { biomasse: 20, datacubes: 6 } },
        ],
      },
      {
        label: 'Récolter du pollen',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [{ texte: 'Échantillons prélevés en sécurité.' }, { gain: { biomasse: 20 } }],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } }],
        },
      },
    ],
  }),

  scene({
    id: 'combat_meute',
    titre: 'La meute',
    lieux: "(corps.vie == 'faune' || corps.danger == 'predateurs') && corps.type dans ['planete', 'lune']",
    affinites: [{ si: "corps.danger == 'predateurs'", facteur: 2 }],
    poids: 4,
    texte: 'Pas un prédateur — une meute. Cinq, peut-être six silhouettes rapides qui convergent de plusieurs directions à la fois.',
    choix: [
      {
        label: 'Tenir position et combattre',
        effets: [
          {
            combat: {
              ennemis: ['meute_rapaces', 'meute_rapaces', 'meute_rapaces'],
              butin: { biomasse: 25 },
            },
          },
        ],
      },
      {
        label: 'Brûler un périmètre défensif',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: 'Les flammes forment un mur. La meute recule et se disperse.' },
          { gain: { biomasse: 30 } },
        ],
      },
      {
        label: 'Se replier en courant',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [{ texte: "L'équipe distance la meute. Course serrée." }],
          echec: [
            { texte: 'Le chef de meute coupe la retraite. Il faudra passer sur lui.' },
            { combat: { ennemis: ['predateur_alpha'], butin: { biomasse: 20 } } },
          ],
        },
      },
    ],
  }),
];
