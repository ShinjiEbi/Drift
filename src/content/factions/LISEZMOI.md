# Factions (vague 2)

Types de factions (aujourd'hui `FACTION_TYPES` dans `data-arcs-factions.js`) et
leur porte-parole : un `faction({...})` par fichier, avec un personnage qui
donne un visage à la faction dans les scènes et les événements.
Conditions déjà disponibles : `faction.existe`, `faction.reputation` (faction
du lieu visité). Effet : `{ reputation: 10 }` ou `{ reputation: { faction, delta } }`.
