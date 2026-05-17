# CHANGELOG

## 0.27.0 — L'Anneau Tracé (4ème chronique)

Première chronique narrative depuis 0.24. Ton volontairement très
différent des 3 précédentes : pas d'ennemi, pas de PNJ vivants à
sauver. Juste une **présence géométrique inexplicable** qui défie la
physique. Plus contemplatif, plus inquiétant.

### Pitch

Un cercle parfait, immobile, qui change de place quand on ne le
regarde pas. Ne réagit ni à la chaleur, ni au radar, ni au son.

Selon les choix du joueur, le récit révèle l'anneau comme :
- **Instrument** : un compas cosmique, partie d'un système plus vaste
  (3 anneaux dans la galaxie convergent vers un point unique)
- **Verrou** : quelque chose est emprisonné de l'autre côté
- **Porte** : un seuil ouvrable, mais on ne sait pas vers où

### Structure

- **Apparition** : planètes avec atmosphere `anormale` ou `exotique`,
  biome varié (désert, glace, volcanique, jungle, exotique, astéroïde)
- **Spawn** : 30%
- **3 épisodes** :
  1. La géométrie (3 scènes : approche, observation, motif)
  2. Les régularités (3 scènes : retour, écho, classification)
  3. L'autre côté (1 scène finale avec 5 choix vers les 5 fins)
- **7 scènes spécialisées** au total
- **5 fins distinctes** :
  - `science_pure` : observation pure, ramène le compas cosmique
  - `obsession_elie` : Élie reste, on emporte ses notes et le compas
  - `porte_ouverte` : franchissement, quelque chose passe (sens incertain)
  - `verrou_brise` : destruction, quelque chose se libère
  - `silence_respecte` : refus de comprendre, départ les mains vides

### Personnage récurrent

**Dr. Élie Calvet** (39 ans, physicienne théoricienne) — voix précise,
inquiète. Embarquée comme spécialiste. Peut :
- Devenir alliée permanente (si on l'embarque dans le retour)
- Mourir (rare, dans les pires fins)
- Sombrer dans l'obsession (si elie_obsession ≥ 3 à la fin)

L'obsession augmente quand le joueur appuie sur les choix scientifiques
extrêmes (transe d'observation, communication active avec l'anneau).

### Nouveaux items

- **Compas cosmique** (`compas_cosmique`) : aiguille qui pointe toujours
  vers le même point de la galaxie. Récupéré dans les fins favorables
  de l'Anneau. Mécaniquement présent dans l'inventaire — usage futur
  potentiel pour débloquer d'autres anomalies.
- **Fragment d'anneau** (`fragment_anneau`) : éclat de matière dont la
  densité change selon l'observation. Récupéré dans la scène "Écho" si
  on a trouvé l'ancien anneau au préalable.
- **Origine `anomalie`** ajoutée à `ITEM_ORIGINS` (couleur violette
  `#a26fbb`).

### Mécaniques narratives spécifiques

- **Flag `observations`** (0-5) : compte les observations rigoureuses,
  influence subtilement les textes
- **Flag `elie_obsession`** (0-3) : seuil pour fin "obsession"
- **Flag `anneau_classifie`** : `instrument` | `verrou` | `porte`
  — détermine quels choix de fin sont disponibles
- **Flag `autre_anneau`** : débloque la scène du fragment ancien
- **Flag `gardien_eveille`** : modifie les intros et textes des
  épisodes suivants
- **Flag `contact_etabli`** : prérequis pour classer "porte"

### Tests

✓ 7 scènes, tous les liens `next` et `endChronicle` valides
✓ Tous les items référencés (compas, fragment) existent dans le catalog
✓ `req.flag` corrigés (utilise `equals:` et `min:`, comme le moteur)
✓ Items utilisent `item:` (singulier), pas `addItem`
✓ Parcours complet simulé fonctionne (3 épisodes, fin atteinte)
✓ 1440 ticks (24h) sans erreur — pas de régression
✓ Compatibilité saves : aucune migration nécessaire

### Statut chroniques

| ID | Nom | Type cible | Spawn | Scènes | Fins |
|---|---|---|---|---|---|
| pulsar_silencieux | Le Pulsar Silencieux | ruines humaines | 35% | 8 | 5 |
| sanctuaire_vert | Le Sanctuaire Vert | ruines alien_a | 30% | 12 | 5 |
| couvee_dormante | La Couvée Dormante | ruines alien_b | 45% | 8 | 6 |
| **anneau_trace** | **L'Anneau Tracé** | **atm. anormale/exotique** | **30%** | **7** | **5** |

**Total** : 4 chroniques, 35 scènes spécialisées, 21 fins distinctes,
10 personnages incarnés.

### À venir

- `veilleurs_beth` : 5ème chronique (civilisation humaine perdue,
  alternative aux ruines humaines)
- `marche_etrange` : 6ème chronique (fusion de cultures alien)
- Combat narratif scénarisé (0.28)

## 0.26.1 — Polish notifications + tier 2 visibles + synthétiseur
## 0.26.0 — Système de notifications + push natives
## 0.25.0 — Rééquilibrage économique + 6 modules tier 2
## 0.24.2 — Fix critique horloge + 3 passes hardening
## 0.24.1 — PWA installable
## 0.24.0 — Chroniques planétaires
