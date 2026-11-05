// src/content/personnages/ilya.js — Ilya Brenner, marchand itinérant.
// Apparaît dans : marchand, ilya_service, ilya_retour (evenements/ilya.js).
// Mémoire : monde.ilya_confiance (nombre), monde.ilya_service ('gardee' | 'ouverte' | 'refusee').
import { personnage } from '../dsl.js';

export default personnage({
  id: 'ilya',
  nom: 'Ilya Brenner',
  age: 52,
  pronoms: 'il',
  role: 'Marchand itinérant',
  voix: 'affable, calculateur ; parle des prix comme on parle de la météo',
  portrait: "Un homme rond dans une combinaison rapiécée de partout. Il note tout dans un carnet relié de cuir, et ne l'ouvre jamais devant toi.",
});
