# Fils rouges (vague 2)

Un fichier par fil rouge (`effondrement.js`…), exportant un `arc({...})`. Les 4
arcs de `data-arcs-factions.js` y seront migrés, puis ajoutés au sommaire
`../index.js` (`ARCS`).

Champs prévus : `id`, `titre`, `ouverture` (condition), `etapes: [{ id, titre,
texte, quand }]` où `quand` est une condition du mini-langage (`compteur.*`,
`colonie.*`, `histoire.*`, `monde.*`), `recompense` (liste d'effets). Le moteur
tient déjà les compteurs `compteur.expeditions`, `compteur.scenes`,
`compteur.combats_gagnes` et `compteur.chroniques_terminees`.
