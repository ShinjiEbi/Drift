# Événements de colonie

Un fichier par thème ou par personnage (`social.js`, `plaintes.js`, `ilya.js`…),
chacun exportant une liste d'`evenement({...})` (voir `../dsl.js`), ajoutée au
sommaire `../index.js` (`EVENEMENTS`).

Champs : `id`, `titre`, `theme`, `ton`, `si`, `acteurs` (`{ colon: { parmi,
filtre: "acteur.age >= 60", prefere } }`), `personnage` (personnage partagé),
`delai` (`'36h'` par défaut), `delaiActeur`, `unique`, `spontane` (`false` : scène
réservée à un fil rouge), `poids`, `texte`, `choix` — mêmes choix et mêmes effets
que les scènes. Gabarits : `{colon}`, `{colon.age}`, `{pnj:ilya}`, `{colonie}`,
`{recrue}`. Un choix qui fait entrer un colon exige `colonie.vivres_ok`.

`prologue.js` contient les trois scènes du prologue « L'atterrissage »
(ouvertes par `../arcs/atterrissage.js`).

Guide : `docs/ecrire-pour-drift.md`, section 9. Relire : `npm run histoire -- <id> --tout`.
