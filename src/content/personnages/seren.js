// src/content/personnages/seren.js — Seren Adebayo, émissaire des Enclaves humaines.
// Apparaît dans : seren_contact, seren_refugies, seren_bilan (evenements/seren.js).
// Mémoire : monde.seren ('accueillie' | 'ecoutee' | 'renvoyee'), monde.seren_refus, monde.seren_carte.
import { personnage } from '../dsl.js';

export default personnage({
  id: 'seren',
  nom: 'Seren Adebayo',
  age: 38,
  pronoms: 'elle',
  role: 'Émissaire des Enclaves',
  faction: 'humain',
  voix: 'formelle, fatiguée, sincère ; finit ses phrases par un silence',
  portrait: "Une femme grande et sèche, l'uniforme des Enclaves élimé aux coudes. Elle porte trois insignes de grade, dont deux ne veulent plus rien dire.",
});
