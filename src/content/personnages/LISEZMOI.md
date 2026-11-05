# Personnages partagés

Un fichier par personnage récurrent qui apparaît dans plusieurs contenus
(événements, histoires), exportant un `personnage({...})`, ajouté au sommaire
`../index.js` (`PERSONNAGES`). Un PNJ propre à une seule histoire reste déclaré
dans cette histoire (`personnages: { adele: {...} }`).

Champs : `id`, `nom`, `age`, `pronoms` (`'il'`, `'elle'`, `'iel'`), `role`,
`voix` (une phrase qui guide l'écriture de ses répliques), `portrait`, `faction`
(type de faction pour qui il parle), `recrue` (`{ competences, caracs, traits }`
s'il peut rejoindre la colonie : `{ recrute: 'id' }`).

Dans un événement : `personnage: 'ilya'` et `{pnj:ilya}`. Sa mémoire passe par
`monde.*` : noter en tête du fichier les drapeaux employés.

Personnages actuels : Ilya Brenner (marchand), Seren Adebayo (émissaire des
Enclaves), Maud Kessler (l'ancienne du plateau). Guide : section 12.
