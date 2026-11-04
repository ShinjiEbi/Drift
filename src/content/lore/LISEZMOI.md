# Lore : Archives (vague 2)

Pages d'« Archives » débloquées par les découvertes : un fichier par thème,
exportant des `lore({...})`, puis ajouté au sommaire `../index.js` (`LORE`).

Champs prévus : `id`, `titre`, `categorie` (`'monde'`, `'effondrement'`,
`'xenologie'`, `'colonie'`…), `si` (condition de déblocage, ex.
`"histoire.pulsar_silencieux.terminee"` ou `"monde.phare_allume"`), `texte`
(mêmes règles que les scènes : paragraphes, `*italique*`, pas de HTML).

Les « Annales » ne s'écrivent pas à l'avance : elles se remplissent pendant la
partie avec l'effet `{ annales: '…' }` (stockées dans `S.annales`).
Guide : `docs/ecrire-pour-drift.md`, section « Lore ».
