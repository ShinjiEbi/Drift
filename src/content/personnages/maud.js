// src/content/personnages/maud.js — Maud Kessler, l'ancienne du plateau.
// Survivante d'une colonie d'avant l'Effondrement, terrée près du site d'atterrissage.
// Apparaît dans : maud_rencontre, maud_recit, maud_adieu (evenements/maud.js).
// Mémoire : monde.maud ('amie' | 'distante' | 'ignoree'), monde.maud_recit, monde.maud_partie.
import { personnage } from '../dsl.js';

export default personnage({
  id: 'maud',
  nom: 'Maud Kessler',
  age: 71,
  pronoms: 'elle',
  role: "Ancienne de la colonie d'avant",
  voix: 'sèche, phrases courtes, aucun regret ; tutoie tout le monde',
  portrait: 'Petite, voûtée, une couverture de survie nouée comme un châle. Des mains de mécanicienne.',
  recrue: { competences: { survie: 4, ingenierie: 2, linguistique: 1 }, caracs: { sangfroid: 8, vigueur: 4 }, traits: ['survivant'] },
});
