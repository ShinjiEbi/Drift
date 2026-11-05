# Lore : Archives

Pages d'« Archives » débloquées par les découvertes : un fichier par catégorie,
exportant des `lore({...})`, ajouté au sommaire `../index.js` (`LORE`).

Champs : `id`, `titre`, `categorie` (`'histoire'`, `'colonie'`, `'mondes'`,
`'ruines'`, `'peuples'`, `'techniques'`), `ordre`, `si` (condition de déblocage :
`expeditions.ruines.alien_a >= 1`, `factions.humain >= 1`, `monde.maud_recit`,
`fil.arc_effondrement.etape >= 3`, `vrai`…), `resume` (une ligne), `texte`
(mêmes règles que les scènes : paragraphes, `*italique*`, pas de HTML).

Les « Annales » ne s'écrivent pas à l'avance : elles se remplissent pendant la
partie (fondation, arrivées, morts, contacts, chantiers, fins de chroniques et
de fils) et avec l'effet `{ annales: '…' }`.
Guide : `docs/ecrire-pour-drift.md`, section 13.
