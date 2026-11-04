// src/content/scenes/epaves-stations.js — Épaves et stations orbitales.
// Format : docs/ecrire-pour-drift.md (« Scènes d'expédition »). Vérifié par npm run check:content.
import { scene } from '../dsl.js';

export default [
  scene({
    id: 'epave_passerelle',
    titre: 'La passerelle éventrée',
    lieux: "corps.type dans ['epave', 'station']",
    poids: 5,
    texte: "La passerelle de commandement est éventrée. Les écrans clignotent encore par moments. Quelqu'un a programmé une boucle de message d'urgence.",
    choix: [
      {
        label: 'Récupérer le journal de bord',
        effets: [
          { texte: 'Le journal de bord est intégré à la cargaison.' },
          { gain: { datacubes: 12 } },
        ],
      },
      {
        label: 'Démonter la console pour les composants',
        requiert: 'equipe.ingenierie >= 1',
        effets: [
          { texte: 'Démontage proprement effectué.' },
          { gain: { metal: 20, cristal: 30, datacubes: 4 } },
        ],
      },
    ],
  }),

  scene({
    id: 'epave_soute',
    titre: 'La soute',
    lieux: "corps.type dans ['epave', 'station'] && corps.atmosphere == 'aucune'",
    poids: 4,
    texte: 'La soute. Dans le vide silencieux, des conteneurs flottent en grappes lentes. Beaucoup sont scellés.',
    choix: [
      {
        label: 'Ouvrir au hasard',
        test: {
          carac: 'dexterite',
          difficulte: 5,
          reussite: [
            { texte: 'Conteneurs ouverts, cargo standard récupéré.' },
            { gain: { metal: 40, cristal: 25, biomasse: 15 } },
          ],
          echec: [
            { texte: "Un conteneur sous pression a éclaté à l'ouverture." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
          ],
        },
      },
      {
        label: "Identifier les codes d'inventaire",
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Les conteneurs les plus précieux sont identifiés et embarqués en priorité.' },
          { gain: { metal: 30, cristal: 35, datacubes: 8 } },
        ],
      },
    ],
  }),

  scene({
    id: 'station_ia',
    titre: "Pas d'autorisation",
    lieux: "corps.type == 'station' || (corps.danger == 'ia_hostile' && (corps.type == 'epave' || corps.ruines dans ['humaines', 'fusion']))",
    affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],
    poids: 3,
    texte: "Les portes claquent dans notre dos. Un haut-parleur grésille : « Vous n'avez pas l'autorisation. Restez où vous êtes. »",
    choix: [
      {
        label: 'Tenter de raisonner',
        requiert: 'equipe.linguistique >= 2',
        test: {
          carac: 'intellect',
          difficulte: 6,
          reussite: [
            { texte: "L'IA accepte un protocole d'invitation. Accès partiel obtenu." },
            { gain: { datacubes: 18 } },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'trauma_psy' } }],
        },
      },
      {
        label: 'Forcer le passage',
        requiert: 'equipe.combat >= 2',
        test: {
          carac: 'vigueur',
          difficulte: 7,
          reussite: [
            { texte: "Les portes cèdent. L'IA reste silencieuse ensuite." },
            { gain: { metal: 30, datacubes: 8 } },
          ],
          echec: [{ statut: { cible: 'equipe_hasard', id: 'blessure_grave' } }],
        },
      },
      {
        label: 'Battre en retraite',
        effets: [
          { texte: "L'équipe fait demi-tour vers le sas. Pas d'héroïsme aujourd'hui." },
          { retraite: true },
        ],
      },
    ],
  }),

  scene({
    id: 'station_serres',
    titre: 'La serre mutante',
    lieux: "corps.type == 'station' && corps.atmosphere != 'aucune'",
    poids: 3,
    texte: "Une serre hydroponique abandonnée. Les plantes ont survécu, ont muté. Certaines sont énormes, d'autres luminescentes.",
    choix: [
      {
        label: 'Récolter les souches',
        effets: [
          { texte: 'Souches mutantes embarquées. Notre hydroponie va y gagner.' },
          { gain: { biomasse: 50, datacubes: 4 } },
        ],
      },
      {
        label: 'Échantillonnage sélectif',
        requiert: 'equipe.science >= 2',
        effets: [
          { texte: 'Sélection précise. Les meilleures souches sont identifiées.' },
          { gain: { biomasse: 70, datacubes: 12 } },
        ],
      },
      {
        label: 'Repiquer les souches dans la serre portable',
        requiert: 'equipe.objet.serre_portable',
        effets: [
          { texte: 'Les plants voyagent sous atmosphère contrôlée. Presque aucune perte au transfert.' },
          { gain: { biomasse: 60, datacubes: 8 } },
        ],
      },
      {
        label: 'Tout brûler par sécurité',
        requiert: 'equipe.objet.lance_flammes',
        effets: [
          { texte: "L'équipe préfère ne prendre aucun risque. Les serres flambent." },
          { gain: { datacubes: 3 } },
          { moral: -1 },
        ],
      },
    ],
  }),

  scene({
    id: 'epave_dormeur',
    titre: 'Le dormeur',
    lieux: "corps.type == 'epave' || corps.ruines == 'fusion'",
    poids: 2,
    texte: "Une capsule cryogénique encore alimentée. À l'intérieur, une silhouette humaine. Les capteurs vitaux clignotent — toujours en vie, après tout ce temps.",
    choix: [
      {
        label: 'Réveiller',
        requiert: 'equipe.medecine >= 3',
        test: {
          carac: 'sangfroid',
          difficulte: 7,
          reussite: [
            { texte: 'Le réveil se passe. Le dormeur ne parle pas, mais transmet ses souvenirs au scanner.' },
            { gain: { datacubes: 20 } },
            { moral: 2 },
          ],
          echec: [
            { texte: "Quelque chose a mal tourné. Le dormeur ne s'est pas réveillé." },
            { statut: { cible: 'equipe_hasard', id: 'trauma_psy' } },
            { moral: -2 },
          ],
        },
      },
      {
        label: 'Réveiller sous catalyseur biologique',
        consomme: 'catalyseur_bio',
        effets: [
          { texte: "Le catalyseur régénère les tissus pendant la remontée en température. Le dormeur s'éveille sans séquelle et transmet ses souvenirs au scanner." },
          { gain: { datacubes: 20 } },
          { moral: 2 },
        ],
      },
      {
        label: 'Récupérer la cryogénie pour pièces',
        effets: [
          { texte: "L'équipe a fait un choix difficile." },
          { gain: { metal: 30, cristal: 25, datacubes: 5 } },
          { moral: -1 },
        ],
      },
      {
        label: 'Laisser dormir et marquer le site',
        requiert: 'equipe.objet.balise_signal',
        effets: [
          { texte: 'Le dormeur reste en sécurité. Une expédition future décidera.' },
          { gain: { datacubes: 4 } },
          { moral: 1 },
        ],
      },
    ],
  }),

  scene({
    id: 'boss_ia_ancienne',
    titre: "L'IA centrale",
    lieux: "corps.type == 'station' || (corps.danger == 'ia_hostile' && (corps.type == 'epave' || corps.ruines dans ['humaines', 'fusion']))",
    affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],
    poids: 1,
    texte: "L'IA centrale s'éveille. Elle a eu des siècles pour se reconfigurer. « Vous n'êtes pas mes créateurs », murmure-t-elle.",
    choix: [
      {
        label: 'Couper le cœur électrique',
        requiert: 'equipe.ingenierie >= 4',
        test: {
          carac: 'dexterite',
          difficulte: 8,
          reussite: [
            { texte: "Coupure réussie. L'IA s'éteint sans réagir. Récupération massive." },
            { gain: { metal: 40, cristal: 60, datacubes: 30 } },
          ],
          echec: [
            { texte: "L'IA a réagi. Évacuation d'urgence." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_grave' } },
            { retraite: true },
          ],
        },
      },
      {
        label: 'Plaider la lignée',
        requiert: 'equipe.linguistique >= 4',
        effets: [
          { texte: "Une longue conversation. L'IA accepte de transmettre une partie de ses archives." },
          { gain: { datacubes: 50 } },
          { schema: 'humain' },
        ],
      },
      {
        label: 'Fuite contrôlée',
        effets: [{ texte: "L'équipe se retire avant que l'IA ne décide." }, { retraite: true }],
      },
    ],
  }),

  scene({
    id: 'combat_gardien_antique',
    titre: "L'automate de la soute",
    lieux: "corps.type dans ['station', 'epave']",
    affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],
    poids: 2,
    texte: "Au fond de la soute, une masse de métal piquée de rouille se déplie en grinçant : un automate de sécurité d'avant l'Effondrement. Trois mètres de blindage, et un protocole d'alerte que personne n'a jamais levé.",
    choix: [
      {
        label: 'Affronter le gardien',
        effets: [{ combat: { ennemis: ['gardien_antique'], butin: { metal: 20, datacubes: 4 } } }],
      },
      {
        label: 'Couper son alimentation',
        requiert: 'equipe.ingenierie >= 4',
        effets: [
          { texte: "Un panneau d'accès, deux câbles sectionnés. Le colosse se fige en plein geste." },
          { gain: { metal: 30, energie: 10 } },
        ],
      },
      {
        label: 'Rebrousser chemin',
        effets: [{ texte: "L'équipe recule. L'automate ne franchit pas le seuil de la soute." }],
      },
    ],
  }),
];
