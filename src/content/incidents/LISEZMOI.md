# Incidents de module (vague 2)

Un fichier par module (`mine.js`, `hydroponie.js`…), chacun exportant une liste
d'`incident({...})`. Les 17 incidents d'`INCIDENTS` (app.js) y seront migrés,
puis ajoutés au sommaire `../index.js` (`INCIDENTS`).

Champs prévus : ceux d'un événement de colonie, plus `module`, `niveauMin`,
`gravite` (`'mineur'` : résolu seul pendant une absence ; `'grave'` : attend le
joueur). La victime est l'acteur `victime` (`{victime}` dans les textes,
`cible: 'victime'` dans les effets). Effets propres aux incidents, déjà dans le
vocabulaire commun : `module { id, horsService: '6h' }`, `effetTemporaire`,
`incident { id, dans: '2h' }` (incident en chaîne), `perte`. Les montants sont
écrits tels qu'appliqués (fini le ×3 caché).
