# Événements de colonie (vague 2)

Un fichier par thème (`social.js`, `visiteurs.js`, `naissances.js`…), chacun
exportant une liste d'`evenement({...})` (voir `../dsl.js`). Les 14 événements
de `COLONY_EVENTS` (app.js) y seront migrés en vague 2, puis ajoutés au
sommaire `../index.js` (`EVENEMENTS`).

Champs prévus : `id`, `titre`, `theme`, `ton`, `si` (condition), `acteurs`
(`{ nom: { parmi: 'colons', filtre: "acteur.age >= 60", present: true } }` ou
`{ personnage: 'pulsar_silencieux/adele' }`), `delai` (`'7j'`) ou `unique`,
`poids`, `texte`, `choix` — mêmes choix et mêmes effets que les scènes.
Gabarits : `{nom_de_l_acteur}`, `{colonie}`. Guide : `docs/ecrire-pour-drift.md`.
