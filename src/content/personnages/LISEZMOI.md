# Personnages partagés (vague 2)

Un fichier par personnage récurrent qui apparaît dans plusieurs contenus
(histoire, événements de colonie, factions), exportant un `personnage({...})`.
Un PNJ propre à une seule histoire reste déclaré dans cette histoire
(`personnages: { adele: {...} }`) ; on y fait référence ailleurs avec
`'pulsar_silencieux/adele'`.

Champs : `id`, `nom`, `age`, `pronoms` (`'il'`, `'elle'`, `'iel'`), `role`,
`voix` (une phrase qui guide l'écriture de ses répliques), `recrue`
(`{ competences, caracs, traits }` s'il peut rejoindre la colonie).
