// src/content/arcs/avant-poste.js — « L'Avant-poste », fil rouge principal de la colonie.
// Migré de data-arcs-factions.js (0.33) : mêmes ids d'étapes (sauvegardes),
// conditions en mini-langage. Ses étapes fournissent l'objectif « fil rouge »
// du tableau de bord (src/objectives.js).
import { arc } from '../dsl.js';

const PRIMAIRES = ['mine_surface', 'hydroponie', 'generateur_solaire', 'habitat'];

export default arc({
  id: 'arc_avant_poste',
  titre: "L'Avant-poste",
  surtitre: 'Chronique de la colonie',
  couleur: '#e9b76a',
  principal: true,
  intro: "Nous ne sommes plus des survivants. Nous sommes des fondateurs. Cet avant-poste deviendra ce que nous en ferons — peut-être un point de départ, peut-être une fin.",
  ouverture: 'vrai',   // toujours actif dès le début
  etapes: [
    {
      id: 'ap_1',
      titre: 'Seuil de stabilité',
      texte: 'Dix colons vivants. Une masse critique. La colonie dépasse le statut de campement.',
      quand: 'colonie.colons >= 10',
      indice: 'Compter dix colons vivants.',
      objectif: { titre: 'Réunir dix colons', progression: { valeur: 'colonie.colons', total: 10, unite: 'colons' },
        action: { onglet: 'equipage', sousOnglet: 'recrutement', label: 'Recruter' } },
    },
    {
      id: 'ap_2',
      titre: 'Maturité industrielle',
      texte: 'Tous les bâtiments primaires ont atteint le niveau 3. La production est cohérente, les chaînes sont stables.',
      quand: 'colonie.module.mine_surface >= 3 && colonie.module.hydroponie >= 3 && colonie.module.generateur_solaire >= 3 && colonie.module.habitat >= 3',
      indice: 'Mine, hydroponie, générateur solaire et habitat au niveau 3.',
      objectif: { titre: 'Bâtiments primaires au niveau 3', modules: PRIMAIRES, niveau: 3,
        action: { onglet: 'base', sousOnglet: 'construction' } },
    },
    {
      id: 'ap_3',
      titre: 'Projection',
      texte: "Une flotte de trois vaisseaux. L'avant-poste n'est plus un point — c'est un nœud. Nous portons quelque chose, et ce quelque chose voyage.",
      quand: 'colonie.flotte >= 3',
      indice: 'Posséder trois vaisseaux.',
      objectif: { titre: 'Une flotte de trois vaisseaux', progression: { valeur: 'colonie.flotte', total: 3, unite: 'vaisseaux' },
        action: { onglet: 'expeditions', sousOnglet: 'vaisseaux', label: 'Hangar' } },
    },
    {
      id: 'ap_4',
      titre: 'Croissance',
      texte: 'Vingt-cinq colons. Une vraie communauté. Des amitiés, des rivalités, des routines. Une vie quotidienne.',
      quand: 'colonie.colons >= 25',
      indice: 'Compter vingt-cinq colons vivants.',
      objectif: { titre: 'Atteindre vingt-cinq colons', progression: { valeur: 'colonie.colons', total: 25, unite: 'colons' },
        action: { onglet: 'equipage', sousOnglet: 'recrutement', label: 'Recruter' } },
    },
    {
      id: 'ap_5',
      titre: 'Maîtrise',
      texte: "Les bâtiments primaires sont au niveau 5. Nous avons atteint un palier que peu d'avant-postes humains ont jamais touché.",
      quand: 'colonie.module.mine_surface >= 5 && colonie.module.hydroponie >= 5 && colonie.module.generateur_solaire >= 5 && colonie.module.habitat >= 5 && colonie.module.laboratoire >= 5',
      indice: 'Mine, hydroponie, générateur, habitat et laboratoire au niveau 5.',
      objectif: { titre: 'Bâtiments primaires au niveau 5', modules: [...PRIMAIRES, 'laboratoire'], niveau: 5,
        action: { onglet: 'base', sousOnglet: 'construction' } },
    },
  ],
  recompense: {
    titre: 'Bonus permanent : +10 % sur toute production',
    texte: "L'Avant-poste est désormais autonome. La colonie est officiellement reconnue. Bonus permanent : +10 % sur toute production.",
    effets: [
      { bonusPermanent: 'avant_poste_autonome' },
      { annales: '{colonie} est reconnue comme une colonie autonome.' },
    ],
  },
});
