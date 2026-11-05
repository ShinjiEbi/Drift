# Incidents de module

Un fichier par module (`mine.js`, `hydroponie.js`…), chacun exportant une liste
d'`incident({...})`, ajoutée au sommaire `../index.js` (`INCIDENTS`).

Champs : ceux d'un événement (`id`, `titre`, `ton`, `si`, `poids`, `texte`,
`choix`), plus `module`, `niveauMin` et `gravite` (`'mineur'` : résolu seul
pendant une absence ; `'serieux'`, `'critique'` : attendent le joueur). La
victime est choisie par le jeu (`{victime}`, `cible: 'victime'`), `{module}`
donne le nom du module ; `{ module: { horsService: '1h' } }` et
`{ module: { niveau: -1 } }` visent le module de l'incident. Les montants sont
écrits tels qu'appliqués.

Guide : `docs/ecrire-pour-drift.md`, section 10.
