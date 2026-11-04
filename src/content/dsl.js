// src/content/dsl.js — marqueurs de type du contenu narratif (V1).
//
// Chaque fichier de contenu exporte des objets créés par ces fonctions. Elles
// ne font qu'ajouter le champ `type` (et figer l'objet) : aucune logique, aucun
// calcul. Le contenu reste de la donnée pure, lisible par le jeu (navigateur)
// et par les outils (Node) sans étape de construction.
//
// Le format de chaque type est décrit dans docs/ecrire-pour-drift.md et vérifié
// par tools/check-content.mjs.

const marquer = type => def => Object.freeze({ ...def, type });

export const histoire   = marquer('histoire');    // chronique planétaire (épisodes, drapeaux, fins)
export const scene      = marquer('scene');       // scène d'expédition générique
export const evenement  = marquer('evenement');   // événement de colonie (vague 2)
export const incident   = marquer('incident');    // incident de module (vague 2)
export const arc        = marquer('arc');         // fil rouge (vague 2)
export const personnage = marquer('personnage');  // PNJ partagé entre plusieurs contenus (vague 2)
export const faction    = marquer('faction');     // type de faction et son porte-parole (vague 2)
export const lore       = marquer('lore');        // page d'archives (vague 2)
