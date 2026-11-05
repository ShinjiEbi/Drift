// src/content/arcs/couvee.js — « La Couvée », chronique alien-B.
// Migré de data-arcs-factions.js (0.33), mêmes ids d'étapes.
import { arc } from '../dsl.js';

export default arc({
  id: 'arc_couvee',
  titre: 'La Couvée',
  surtitre: 'Chronique alien-B',
  couleur: '#7a9b6e',
  intro: 'Là où les Cristaux étaient géométrie, eux sont chair. Une biologie qui pense, qui respire, qui se souvient. Et qui nous regarde, depuis bien avant nous.',
  ouverture: 'colonie.schemas.alien_b >= 1',
  indiceOuverture: 'Se révèle avec un premier schéma alien-B.',
  etapes: [
    { id: 'cou_1', titre: 'Premier contact',
      texte: "Un schéma alien-B traduit. Ce n'est pas un schéma au sens classique — c'est une recette de croissance. La technique vient en faisant pousser, pas en assemblant.",
      quand: 'colonie.schemas.alien_b >= 1',
      indice: 'Déchiffrer un schéma alien-B.' },
    { id: 'cou_2', titre: 'Système immunitaire',
      texte: 'Un colon a survécu à un pathogène alien. Son corps a appris quelque chose. Notre médecine commence à intégrer leur biochimie.',
      // Colon vivant guéri du pathogène, ou porteur d'une de ses séquelles
      quand: 'colonie.gueris.pathogene_alien >= 1',
      indice: "Qu'un colon survive à un pathogène alien." },
    { id: 'cou_3', titre: "L'anneau",
      texte: "Un anneau scellé a été ramené. Il pulse. Il ne s'ouvre pas. Mais quand un médecin entraîné le tient, il le ressent — comme un cœur dans une autre poitrine.",
      quand: 'colonie.objet.anneau_scelle >= 1',
      indice: 'Rapporter un anneau scellé.' },
    { id: 'cou_4', titre: 'Compréhension',
      texte: "Une expédition revient d'une ruine alien-B avec des échantillons préservés grâce au sérum xeno. La biologie s'éclaire. Ce n'était pas une civilisation perdue — c'est une civilisation endormie.",
      quand: 'expeditions.ruines.alien_b.objet.serum_xeno >= 1',
      indice: 'Explorer une ruine alien-B en emportant du sérum xéno.' },
    { id: 'cou_5', titre: 'Équilibre',
      texte: "Un Essaim a été affronté. Les choix faits ce jour-là résonnent maintenant dans toute la chronique. Il y avait une autre voie possible. Nous l'avons prise — ou pas.",
      quand: 'expeditions.scene.boss_essaim_organique >= 1',
      indice: 'Affronter un essaim organique.' },
    { id: 'cou_6', titre: 'Symbiose',
      texte: "Le médecin-chef expose ses conclusions : si nous voulons vivre durablement avec leur biologie, il faut accepter qu'elle nous transforme aussi.",
      quand: 'colonie.tech.tech_genetique || colonie.schemas.alien_b >= 3',
      indice: 'Rechercher « Génétique appliquée » ou déchiffrer trois schémas alien-B.' },
  ],
  recompense: {
    titre: 'Technologie légendaire : Symbiose biologique',
    texte: 'La Symbiose biologique devient accessible. Une voie thérapeutique sans précédent.',
    effets: [{ technologie: 'tech_symbiose_bio' }],
  },
});
