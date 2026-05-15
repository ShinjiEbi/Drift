// data-arcs-factions.js — déclarations ARCS et FACTION_TYPES
// Extrait depuis app.js lors de la modularisation

import { S, aliveCrew } from './state.js';
import { BLUEPRINTS } from './catalog.js';
import { isTechCompleted } from './app.js';

export const ARCS = {
  // ===============================================================
  arc_effondrement: {
    nom: "L'Effondrement",
    eyebrow: "Chronique humaine",
    color: '#c8a878',
    intro: "Quelque chose a précédé notre arrivée ici. Une autre colonie. Un autre rêve. Quelque chose qui s'est éteint avant nous, et dont les fragments parsèment la galaxie.",
    unlock: () => (S.crew?.length || 0) >= 5,
    steps: [
      {
        id: 'eff_1',
        title: "Premier signal",
        narrative: "Un disque mémoire récupéré dans une ruine. Les voix sont fragmentaires, mais on reconnaît le timbre humain. Ils étaient là avant.",
        condition: () => (S.inventory?.disque_memoire || 0) >= 1
      },
      {
        id: 'eff_2',
        title: "Vestiges humains",
        narrative: "Une expédition revient d'une ruine humaine. Les bâtiments avaient été abandonnés en hâte. Personne n'a brûlé les archives — ils n'en ont pas eu le temps.",
        condition: () => (S.expHistory || []).some(e => e.body?.ruines === 'humaines')
      },
      {
        id: 'eff_3',
        title: "Pages déchirées",
        narrative: "Un second disque, croisé avec le premier. Les noms s'alignent. Ce n'était pas une simple colonie, c'était un programme. Et il y avait d'autres groupes.",
        condition: () => (S.inventory?.disque_memoire || 0) >= 2
      },
      {
        id: 'eff_4',
        title: "Le déchiffrement",
        narrative: "Un linguiste expérimenté rassemble les pièces. Les enregistrements parlent d'un \"Contact\". Quelque chose qui a basculé. Quelque chose qu'ils n'ont pas su gérer.",
        condition: () => (S.crew || []).some(m => (m.skills?.linguistique || 0) >= 4)
      },
      {
        id: 'eff_5',
        title: "La station mère",
        narrative: "Une plaque gravée révèle des coordonnées. Une station ancienne, jamais visitée. Là-bas, peut-être, l'histoire complète.",
        condition: () => (S.inventory?.plaque_gravee || 0) >= 1 && (S.expHistory || []).some(e => e.body?.type === 'station')
      },
      {
        id: 'eff_6',
        title: "Vérité finale",
        narrative: "L'ensemble s'éclaire. L'Effondrement n'était pas un échec — c'était un choix. Ils sont partis pour ne pas être suivis. Nous savons maintenant ce qu'ils fuyaient.",
        condition: () => Object.keys(S.techCompleted || {}).length >= 8
      }
    ],
    reward: {
      kind: 'blueprint',
      value: 'bp_relais_unifie',
      log: "Une découverte unique émerge de la chronique : les plans d'un Relais unifié, héritage des fondateurs."
    }
  },

  // ===============================================================
  arc_cristaux: {
    nom: "Les Cristaux",
    eyebrow: "Chronique alien-A",
    color: '#9f5fb8',
    intro: "Une civilisation cristalline a précédé toute autre dans cette région. Leurs traces sont partout. Leur logique nous échappe. Mais elle est cohérente.",
    unlock: () => Object.keys(S.discoveries || {}).some(id => BLUEPRINTS[id]?.origin === 'alien_a'),
    steps: [
      {
        id: 'crys_1',
        title: "Éveil",
        narrative: "Premier schéma alien-A déchiffré. Les motifs ne sont pas décoratifs — ils sont fonctionnels. Chaque ornement est une équation.",
        condition: () => Object.keys(S.discoveries || {}).filter(id => BLUEPRINTS[id]?.origin === 'alien_a').length >= 1
      },
      {
        id: 'crys_2',
        title: "Motifs récurrents",
        narrative: "Trois ruines visitées, trois mêmes répétitions. Ce n'est pas du langage — c'est un protocole. Une grammaire de geste.",
        condition: () => (S.expHistory || []).filter(e => e.body?.ruines === 'alien_a').length >= 3
      },
      {
        id: 'crys_3',
        title: "L'artefact clé",
        narrative: "Une lentille noire ramenée d'expédition. Quand on la regarde, on voit des choses qui n'existent pas dans la pièce. Pas une illusion — une autre couche de réel.",
        condition: () => (S.inventory?.lentille_noire || 0) >= 1
      },
      {
        id: 'crys_4',
        title: "Compréhension théorique",
        narrative: "La tech « Principes xeno-archéologiques » formalise nos intuitions. Nous commençons à comprendre la logique cristalline.",
        condition: () => isTechCompleted('tech_principes_xeno')
      },
      {
        id: 'crys_5',
        title: "Confrontation",
        narrative: "Un Gardien éveillé. L'équipe est revenue avec des données — ou des cicatrices. Mais elle est revenue. Nous savons désormais ce qu'ils protègent.",
        condition: () => (S.expHistory || []).some(e => (e.scenesPlayed || []).includes('boss_alien_gardien'))
      },
      {
        id: 'crys_6',
        title: "Résonance pure",
        narrative: "Avec les données accumulées, le laboratoire formule une percée : la résonance cristalline n'est pas seulement de l'énergie, c'est un état de conscience matérielle.",
        condition: () => (S.alienDatacubes || 0) >= 50 && Object.keys(S.discoveries || {}).filter(id => BLUEPRINTS[id]?.origin === 'alien_a').length >= 3
      }
    ],
    reward: {
      kind: 'tech',
      value: 'tech_resonance_pure',
      log: "Percée majeure : la Résonance pure devient accessible dans la branche exotique."
    }
  },

  // ===============================================================
  arc_couvee: {
    nom: "La Couvée",
    eyebrow: "Chronique alien-B",
    color: '#7a9b6e',
    intro: "Là où les Cristaux étaient géométrie, eux sont chair. Une biologie qui pense, qui respire, qui se souvient. Et qui nous regarde, depuis bien avant nous.",
    unlock: () => Object.keys(S.discoveries || {}).some(id => BLUEPRINTS[id]?.origin === 'alien_b'),
    steps: [
      {
        id: 'cou_1',
        title: "Premier contact",
        narrative: "Un schéma alien-B traduit. Ce n'est pas un schéma au sens classique — c'est une recette de croissance. La technique vient en faisant pousser, pas en assemblant.",
        condition: () => Object.keys(S.discoveries || {}).filter(id => BLUEPRINTS[id]?.origin === 'alien_b').length >= 1
      },
      {
        id: 'cou_2',
        title: "Système immunitaire",
        narrative: "Un colon a survécu à un pathogène alien. Son corps a appris quelque chose. Notre médecine commence à intégrer leur biochimie.",
        condition: () => (S.crew || []).some(m =>
          (m.sequels || []).some(s => s.key === 'pathogene_alien') ||
          (m.statuts || []).some(s => s.key === 'pathogene_alien'))
      },
      {
        id: 'cou_3',
        title: "L'anneau",
        narrative: "Un anneau scellé a été ramené. Il pulse. Il ne s'ouvre pas. Mais quand un médecin entraîné le tient, il le ressent — comme un cœur dans une autre poitrine.",
        condition: () => (S.inventory?.anneau_scelle || 0) >= 1
      },
      {
        id: 'cou_4',
        title: "Compréhension",
        narrative: "Une expédition revient d'une ruine alien-B avec des échantillons préservés grâce au sérum xeno. La biologie s'éclaire. Ce n'était pas une civilisation perdue — c'est une civilisation endormie.",
        condition: () => (S.expHistory || []).some(e =>
          e.body?.ruines === 'alien_b' && (e.itemsConsumed || []).includes('serum_xeno'))
      },
      {
        id: 'cou_5',
        title: "Équilibre",
        narrative: "Un Essaim a été affronté. Les choix faits ce jour-là résonnent maintenant dans toute la chronique. Il y avait une autre voie possible. Nous l'avons prise — ou pas.",
        condition: () => (S.expHistory || []).some(e => (e.scenesPlayed || []).includes('boss_essaim_organique'))
      },
      {
        id: 'cou_6',
        title: "Symbiose",
        narrative: "Le médecin-chef expose ses conclusions : si nous voulons vivre durablement avec leur biologie, il faut accepter qu'elle nous transforme aussi.",
        condition: () => isTechCompleted('tech_genetique') || (Object.keys(S.discoveries || {}).filter(id => BLUEPRINTS[id]?.origin === 'alien_b').length >= 3)
      }
    ],
    reward: {
      kind: 'tech',
      value: 'tech_symbiose_bio',
      log: "La Symbiose biologique devient accessible. Une voie thérapeutique sans précédent."
    }
  },

  // ===============================================================
  arc_avant_poste: {
    nom: "L'Avant-poste",
    eyebrow: "Chronique de la colonie",
    color: '#e9b76a',
    intro: "Nous ne sommes plus des survivants. Nous sommes des fondateurs. Cet avant-poste deviendra ce que nous en ferons — peut-être un point de départ, peut-être une fin.",
    unlock: () => true,  // Toujours actif dès le début
    steps: [
      {
        id: 'ap_1',
        title: "Seuil de stabilité",
        narrative: "Dix colons vivants. Une masse critique. La colonie dépasse le statut de campement.",
        condition: () => aliveCrew().length >= 10
      },
      {
        id: 'ap_2',
        title: "Maturité industrielle",
        narrative: "Tous les bâtiments primaires ont atteint le niveau 3. La production est cohérente, les chaînes sont stables.",
        condition: () => ['mine_surface','hydroponie','generateur_solaire','habitat'].every(k => (S.modules[k]?.level || 0) >= 3)
      },
      {
        id: 'ap_3',
        title: "Projection",
        narrative: "Une flotte de trois vaisseaux. L'avant-poste n'est plus un point — c'est un nœud. Nous portons quelque chose, et ce quelque chose voyage.",
        condition: () => (S.fleet?.length || 0) >= 3
      },
      {
        id: 'ap_4',
        title: "Croissance",
        narrative: "Vingt-cinq colons. Une vraie communauté. Des amitiés, des rivalités, des routines. Une vie quotidienne.",
        condition: () => aliveCrew().length >= 25
      },
      {
        id: 'ap_5',
        title: "Maîtrise",
        narrative: "Les bâtiments primaires sont au niveau 5. Nous avons atteint un palier que peu d'avant-postes humains ont jamais touché.",
        condition: () => ['mine_surface','hydroponie','generateur_solaire','habitat','laboratoire'].every(k => (S.modules[k]?.level || 0) >= 5)
      }
    ],
    reward: {
      kind: 'permanent_bonus',
      value: 'avant_poste_autonome',
      log: "L'Avant-poste est désormais autonome. La colonie est officiellement reconnue. Bonus permanent : +10% sur toute production."
    }
  }
};

export const FACTION_TYPES = {
  humain: {
    label: "Humaine",
    color: '#c8a878',
    desc: "Descendants de l'Effondrement. Méfiance partagée, intérêts proches.",
    namePrefixes: ['Enclave', 'Vestige', 'Concorde', 'Refuge', 'Faction', 'Communauté'],
    nameSuffixes: ['de Pénombre', 'de la Cendre', 'd\'Hécate', 'des Veilleurs', 'de Méandre', 'de Linceul', 'des Naufragés', 'de Velden'],
    initialReputation: 10,        // Légèrement positif (humanité partagée)
    tradeOffer: { metal: 30, cristal: 15 },
    tradeAsk:   { biomasse: 40 }
  },
  alien_a: {
    label: "Alien-A · Cristalline",
    color: '#9f5fb8',
    desc: "Civilisation cristalline. Logique impénétrable, gestes précis.",
    namePrefixes: ['Conclave', 'Choeur', 'Géométrie', 'Chant', 'Spire', 'Prisme'],
    nameSuffixes: ['de Resh', 'd\'Astralune', 'de Cithare', 'des Strates', 'de Verre-Long', 'd\'Inversion'],
    initialReputation: -5,        // Méfiance initiale
    tradeOffer: { datacubes: 15, cristal: 25 },
    tradeAsk:   { metal: 50 }
  },
  alien_b: {
    label: "Alien-B · Organique",
    color: '#7a9b6e',
    desc: "Biologie consciente, lente, patiente. Pense en cycles.",
    namePrefixes: ['Couvée', 'Symbiose', 'Filament', 'Chrysalide', 'Murmure', 'Reliquat'],
    nameSuffixes: ['Ondulée', 'des Profondeurs', 'd\'Anthrax', 'de Limbe', 'de Tendre', 'd\'Estran'],
    initialReputation: 0,         // Neutre, observatrice
    tradeOffer: { biomasse: 50, datacubes: 10 },
    tradeAsk:   { cristal: 30 }
  },
  fusion: {
    label: "Hybride",
    color: '#d49bb8',
    desc: "Métissage rare. Communautés à cheval sur deux mondes.",
    namePrefixes: ['Pacte', 'Croisée', 'Hybride', 'Union'],
    nameSuffixes: ['de Boréalys', 'des Deux-Sangs', 'de Méridien', 'de Crépuscule'],
    initialReputation: 5,
    tradeOffer: { datacubes: 20, biomasse: 30 },
    tradeAsk:   { metal: 40, cristal: 15 }
  }
};

