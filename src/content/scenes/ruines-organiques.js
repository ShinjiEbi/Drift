// src/content/scenes/ruines-organiques.js — Ruines alien de type B : cités organiques, coulées comme du corail.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'ruine_b_galerie',
    titre: 'La galerie tiède',
    lieux: "corps.ruines == 'alien_b'",
    poids: 5,
    texte: 'Les murs ne semblent pas construits — coulés, comme un nautile géant figé. La surface est tiède au toucher, et faiblement humide.',
    choix: [
      {
        label: 'Prélever un échantillon de paroi',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [
            { texte: "L'échantillon réagit bizarrement aux solvants standards." },
            { gain: { biomasse: 15, datacubes: 8 } },
          ],
          echec: [
            { texte: "Le contact direct n'a pas été aussi inerte qu'espéré." },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Prélever sous protection sérum',
        consomme: 'serum_xeno',
        effets: [
          { texte: 'Le sérum neutralise les pathogènes au contact. Échantillon précieux.' },
          { gain: { biomasse: 25, datacubes: 12 } },
        ],
      },
      {
        label: 'Dissoudre une paroi aux enzymes',
        consomme: 'enzymes_dissolution',
        effets: [
          { texte: 'Les enzymes ouvrent la paroi comme une cire tiède. Derrière, une alcôve scellée intacte.' },
          { gain: { biomasse: 20, datacubes: 15 } },
        ],
      },
      { label: 'Avancer sans rien toucher', effets: [] },
    ],
  }),

  scene({
    id: 'ruine_b_chambre_oeuf',
    titre: "La chambre de l'œuf",
    lieux: "corps.ruines == 'alien_b'",
    poids: 3,
    texte: "Une chambre voûtée. Au centre, une structure en forme d'œuf, plus haute qu'un homme. Elle palpite très lentement, à la cadence d'une respiration.",
    choix: [
      {
        label: 'Approcher avec déférence',
        requiert: 'equipe.trait.sang_froid',
        effets: [
          { texte: "Au contact, l'œuf laisse couler une substance argentée. Récoltée avec soin." },
          { gain: { datacubes: 20 } },
          { objet: 'anneau_scelle' },
        ],
      },
      {
        label: 'Frapper la coquille',
        test: {
          carac: 'vigueur',
          difficulte: 8,
          reussite: [
            { texte: "La coquille cède. L'intérieur est inerte mais riche." },
            { gain: { datacubes: 25, biomasse: 30 } },
          ],
          echec: [
            { texte: "Une vapeur âcre s'échappe et se diffuse." },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Prélever en sécurité avec sérum xeno',
        consomme: 'serum_xeno',
        effets: [
          { texte: 'Le sérum neutralise les défenses de la coquille. Récolte propre.' },
          { gain: { datacubes: 30, biomasse: 20 } },
          { objet: 'anneau_scelle' },
        ],
      },
      { label: "Sortir d'ici sans demander son reste", effets: [{ texte: 'Sage décision.' }] },
    ],
  }),

  scene({
    id: 'boss_essaim_organique',
    titre: "L'essaim",
    lieux: "corps.ruines == 'alien_b'",
    affinites: [{ si: "corps.danger == 'pathogene'", facteur: 2 }],
    poids: 1,
    texte: "Des milliers de créatures translucides, à peine plus grosses qu'un poing, surgissent des galeries. Elles convergent.",
    choix: [
      {
        label: 'Tout brûler',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: "Le lance-flammes tient l'essaim à distance. L'équipe se replie en récoltant les restes." },
          { gain: { biomasse: 80, datacubes: 15 } },
        ],
      },
      {
        label: 'Sérum xeno en aérosol',
        consomme: 'serum_xeno',
        effets: [
          { texte: 'Le sérum dispersé désactive les créatures sans les détruire. Étude possible.' },
          { gain: { datacubes: 30, biomasse: 40 } },
          { schema: 'alien_b' },
        ],
      },
      {
        label: "Déclencher la balise de retour d'urgence",
        consomme: 'balise_retour',
        effets: [
          { texte: "La balise déclenche l'extraction. L'équipe est hissée à bord avant que l'essaim ne referme le passage." },
          { retraite: true },
        ],
      },
      {
        label: 'Fuir en courant',
        test: {
          carac: 'vigueur',
          difficulte: 8,
          reussite: [
            { texte: "Sortie de justesse. Le sas s'est refermé à quelques mètres derrière eux." },
            { retraite: true },
          ],
          echec: [
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
            { retraite: true },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'schema_alien_b_chambre_couvee',
    titre: "Les poches d'écriture",
    lieux: "corps.ruines == 'alien_b'",
    poids: 2,
    texte: "Une cavité tiède et humide. Sur les parois, des poches translucides contenant des spirales d'écriture organique. Vivantes ?",
    choix: [
      {
        label: 'Décrypter une poche',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Les motifs sont en fait une formule biochimique.' },
          { gain: { datacubes: 12 } },
          { schema: 'alien_b' },
        ],
      },
      {
        label: 'Prélever une poche entière',
        requiert: 'equipe.medecine >= 1',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [
            { texte: 'Prélèvement clinique.' },
            { gain: { biomasse: 20 } },
            { schema: 'alien_b' },
          ],
          echec: [
            { texte: "La poche s'est rompue au mauvais moment." },
            { statut: { cible: 'equipe_hasard', id: 'pathogene_alien' } },
          ],
        },
      },
      {
        label: 'Ne rien toucher et repartir',
        effets: [{ texte: "L'équipe laisse les poches à leur lente respiration." }],
      },
    ],
  }),

  scene({
    id: 'combat_nid_xenoforme',
    titre: 'Le nid',
    lieux: "corps.ruines == 'alien_b'",
    affinites: [{ si: "corps.danger == 'pathogene'", facteur: 2 }],
    poids: 1,
    texte: 'La galerie débouche sur une chambre tiède, tapissée de membranes. Des sacs translucides palpitent au plafond. Au centre, quelque chose de grand se redresse lentement — la reine du nid, entourée de spores qui flottent comme une neige lourde.',
    choix: [
      {
        label: 'Attaquer la reine',
        effets: [
          {
            combat: {
              ennemis: ['xenoforme_reine', 'spore_toxique', 'spore_toxique'],
              butin: { cristal: 15, datacubes: 8, biomasse: 15 },
            },
          },
        ],
      },
      {
        label: 'Incendier le nid',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: "Les membranes s'embrasent d'un coup. Ce qui reste du nid se rétracte en sifflant." },
          { gain: { biomasse: 25, datacubes: 4 } },
        ],
      },
      {
        label: 'Reculer sans un bruit',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [{ texte: "Pas à pas, l'équipe regagne la galerie. Rien ne la suit." }],
          echec: [
            { texte: "Une botte glisse sur une membrane. Les gardiens du nid se jettent sur l'équipe." },
            {
              combat: {
                ennemis: ['spore_toxique', 'spore_toxique', 'xenoforme_alpha'],
                butin: { biomasse: 10, cristal: 6 },
              },
            },
          ],
        },
      },
    ],
  }),

  scene({
    id: 'combat_drones_bio',
    titre: 'Les drones de la canopée',
    lieux: "corps.vie == 'flore_agressive' || (corps.ruines == 'alien_b' && corps.biome == 'jungle')",
    affinites: [{ si: "corps.ruines == 'alien_b'", facteur: 2 }],
    poids: 2,
    texte: "Un bourdonnement grave monte des frondaisons. Deux formes ailées, mi-insectes mi-graines, se détachent de la canopée et piquent droit sur l'équipe : des drones biologiques, cultivés pour défendre ce lieu.",
    choix: [
      {
        label: 'Les abattre en vol',
        effets: [
          {
            combat: {
              ennemis: ['drone_bio', 'drone_bio'],
              butin: { biomasse: 15, datacubes: 3 },
            },
          },
        ],
      },
      {
        label: 'Les dissoudre aux enzymes',
        consomme: 'enzymes_dissolution',
        effets: [
          { texte: "Le nuage d'enzymes les prend de plein fouet. Ils retombent en pluie de fibres." },
          { gain: { biomasse: 20, datacubes: 4 } },
        ],
      },
      {
        label: 'Se fondre dans la végétation',
        test: {
          carac: 'dexterite',
          difficulte: 6,
          reussite: [
            { texte: "Immobiles sous les feuilles, les colons laissent passer l'essaim." },
          ],
          echec: [
            { texte: "Un dard traverse une combinaison avant que l'équipe ne disparaisse sous le couvert." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
          ],
        },
      },
    ],
  }),
];
