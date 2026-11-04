# CHANGELOG

## 0.33.0 — Grande réparation

Version de correction issue d'un audit complet du jeu (54 problèmes
relevés). Aucune nouvelle mécanique majeure : tout ce qui existait marche
enfin comme prévu. Les sauvegardes 0.32 se chargent et se réparent
d'elles-mêmes.

### Bloquants corrigés

- **Chroniques** : une expédition vers une planète à chronique restait
  bloquée pour toujours (vaisseau et équipage perdus). Les 6 chroniques se
  jouent maintenant jusqu'à leur fin ; une expédition déjà bloquée dans une
  sauvegarde repart seule. « Le Marché Étrange » peut enfin apparaître.
- **Infirmerie** : une séquelle médicale figeait la moitié de l'interface.
- **Sauvegarde** : une sauvegarde illisible n'est plus jamais écrasée par
  une partie neuve ; une copie de secours est gardée et le joueur choisit.
- **Soins** : un patient en cours de traitement pouvait mourir « non traité »
  quand un autre de ses statuts guérissait.

### Temps de jeu et décisions

- Onglet en arrière-plan : le temps n'est plus perdu (avant : environ 98 %).
- Rattrapage hors-ligne par tranches avec barre de progression, au lieu de
  geler l'appli jusqu'à 15 s sur mobile.
- Les incidents survenus hors-ligne sont résolus automatiquement avec le
  choix le plus prudent (avant : ils disparaissaient sans effet).
- Incidents et événements attendent dans une file sauvegardée : ils ne
  s'écrasent plus entre eux et ne disparaissent plus au rechargement.
- Deux onglets ouverts ne s'écrasent plus la sauvegarde.
- Les coûts des événements (marchand, échanges) sont vérifiés et affichés
  au montant réel ; un choix trop cher est grisé.

### Équipage et médical

- Affectations : un médecin ne devient plus « libre » en gardant son poste,
  un colon en expédition ne peut plus repartir dans une deuxième.
- Ancienneté (0.32) : active pour les colons déjà en poste, et plus remise à
  zéro en recliquant sur son propre poste.
- Les colons morts ne réagissent plus aux événements, ne terminent plus de
  mission diplomatique, et leur mort de vieillesse ne compte plus double.
- Contagion limitée aux colons présents au même endroit.
- Annuler une recherche, une fabrication ou une formation ne détruit plus
  de ressources.

### Combat, diplomatie, contenu

- Combat : l'étourdissement n'est plus permanent, l'équipement est porté
  par un seul colon, le bonus IEM et les trousses de soin marchent, les jets
  ne se répètent plus à l'identique, fuir a un coût, le butin respecte la
  soute. Combats rééquilibrés (3 à 4 rounds en moyenne). 5 nouvelles scènes
  de combat font enfin apparaître les 7 ennemis jamais rencontrés.
- 7 technologies qui n'avaient aucun effet sont branchées (automatisation,
  relais unifié, blindage, camouflage, armure composite, résonance armée,
  membranes adaptives). Commerce interstellaire et Traités formels sont
  requis pour les routes commerciales et les alliances.
- Bonus du vaisseau Émissaire appliqué ; compétences toujours entières.
- Arcs : étapes validées dans l'ordre, étape « survivant de la Couvée »
  validée au bon moment.
- Chroniques : branches narratives débloquées (mort d'Inara, pacte de la
  Couvée, Adèle et Élie recrutables), paiements réellement débités, une
  chronique par planète. Les 15 objets fabricables sans usage en ont un.
- Une planète déjà pillée ne redonne qu'une partie de son butin, qui se
  reconstitue en 30 jours.

### Interface, mobile, PWA

- Seule la vue affichée est reconstruite chaque seconde : fin des clics
  perdus, du focus et de la sélection qui sautent.
- iPhone : boutons Exporter/Importer visibles, encoche respectée, zoom
  autorisé, contrastes et tailles de texte relevés, cibles tactiles agrandies.
- Fenêtres utilisables au clavier et avec un lecteur d'écran.
- Mise à jour : plus de rechargement forcé ; un bandeau propose
  « Recharger ». Le cache hors-ligne est versionné par le contenu et ne
  mélange plus deux versions.
- Polices hébergées localement (plus de requête vers Google), politique de
  sécurité (CSP) et échappement de toutes les données affichées.

### Outillage

- `npm test` : ESLint, vérification des données, cohérence du cache
  hors-ligne, test de fumée dans Chromium et 27 tests de non-régression.
  CI GitHub Actions à chaque push.
- Sauvegarde : numéro de schéma, migrations ordonnées, copies de secours.

## 0.28 à 0.32 — résumé

- **0.32** : expansion de la population, carrière permanente (ancienneté).
- **0.31b** : armement étendu (types d'armes, boucliers, butin ennemi).
- **0.31** : combat au tour par tour en exploration.
- **0.30** : refonte de la diplomatie ; 21 objets, 20 schémas, 8 technologies
  et 20 fabrications ; écran de conséquences des événements de colonie.
- **0.29** : refonte majeure (chroniques, catalogue, notifications, interface).

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
