# Fils rouges

Un fichier par fil rouge, exportant un `arc({...})`, ajouté au sommaire
`../index.js` (`ARCS`). Les ids des fils et des étapes de 0.33 (`arc_avant_poste`,
`ap_1`…) sont gardés : les sauvegardes et `TECH_TREE` (`prereq.requireArc`) y
font référence.

Champs : `id`, `titre`, `surtitre`, `couleur`, `principal` (fournit l'objectif du
tableau de bord), `intro`, `ouverture` (condition ; `'faux'` : ouvert par le jeu
seulement, comme le prologue), `indiceOuverture`, `etapes: [{ id, titre, texte,
quand, indice, objectif, scene }]`, `recompense: { titre, texte, effets }`.

`atterrissage.js` est le prologue d'une partie neuve : chaque étape ouvre une
scène de `../evenements/prologue.js`.

Guide : `docs/ecrire-pour-drift.md`, section 11.
