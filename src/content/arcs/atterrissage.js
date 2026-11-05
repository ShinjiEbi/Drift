// src/content/arcs/atterrissage.js — prologue « L'atterrissage ».
//
// Fil rouge des premières minutes d'une partie neuve (ouvert par freshState() ;
// jamais sur une sauvegarde existante : ouverture 'faux'). Chaque étape ouvre
// une scène de décision (evenements/prologue.js) quand elle devient l'étape en
// cours ; l'étape se valide quand sa scène est résolue ET que sa condition est
// vraie. L'objectif de l'étape en cours est affiché sur le tableau de bord avec
// un bouton qui mène à l'action. Le choix « passer » (monde.prologue_passe)
// valide toutes les étapes : le prologue ne bloque jamais la partie.
import { arc } from '../dsl.js';

export default arc({
  id: 'prologue',
  titre: "L'atterrissage",
  surtitre: 'Prologue',
  couleur: '#d4a056',
  principal: true,
  intro: "La capsule est posée. Trois colons, une vedette, un module de commandement. Le reste est à construire.",
  ouverture: 'faux',
  etapes: [
    {
      id: 'pro_chantier',
      titre: 'Premier chantier',
      scene: 'prologue_atterrissage',
      texte: 'Le premier module sort de terre. Le plateau a désormais un bruit de fond : le nôtre.',
      quand: 'colonie.batiments >= 2 || monde.prologue_passe',
      indice: 'Construire un premier module.',
      objectif: [
        { si: "monde.premier_chantier == 'hydroponie'", titre: 'Construire : Hydroponie', detail: 'Ouvre la construction et lance le chantier des cultures.',
          action: { onglet: 'base', sousOnglet: 'construction', cible: 'hydroponie', label: 'Construire' } },
        { si: "monde.premier_chantier == 'mine_surface'", titre: 'Construire : Mine de surface', detail: 'Ouvre la construction et lance le chantier de la mine.',
          action: { onglet: 'base', sousOnglet: 'construction', cible: 'mine_surface', label: 'Construire' } },
        { titre: 'Construire : Générateur solaire', detail: 'Ouvre la construction et lance le chantier du générateur.',
          action: { onglet: 'base', sousOnglet: 'construction', cible: 'generateur_solaire', label: 'Construire' } },
      ],
    },
    {
      id: 'pro_postes',
      titre: 'Chacun à son poste',
      scene: 'prologue_postes',
      texte: 'Chaque colon a trouvé sa place. Les modules tournent à plein régime.',
      quand: 'colonie.en_poste >= 2 || monde.prologue_passe',
      indice: 'Affecter deux colons à un poste.',
      objectif: { titre: 'Affecter un colon à un poste', detail: 'Un colon en poste fait tourner son module à plein régime.',
        progression: { valeur: 'colonie.en_poste', total: 2, unite: 'colons en poste' },
        action: { onglet: 'base', sousOnglet: 'postes', label: 'Postes' } },
    },
    {
      id: 'pro_depart',
      titre: 'Premier départ',
      scene: 'prologue_depart',
      texte: "La vedette a décollé. Quelque part, une équipe découvre un monde que personne n'a jamais foulé.",
      quand: 'expeditions.en_cours >= 1 || expeditions.total >= 1 || monde.prologue_passe',
      indice: 'Envoyer une équipe en expédition.',
      objectif: { titre: 'Envoyer une équipe', detail: "La vedette attend à quai : choisis une destination proche sur la carte.",
        action: { onglet: 'expeditions', sousOnglet: 'carte', label: 'Carte' } },
    },
  ],
  recompense: {
    titre: 'Récompense : 60 métal, 30 cristal',
    texte: "Le prologue est terminé : l'avant-poste tient debout. La suite est entre tes mains.",
    effets: [{ gain: { metal: 60, cristal: 30 } }],
  },
});
