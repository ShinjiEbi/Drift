# Écrire pour DRIFT

Guide d'écriture du contenu narratif : histoires (chroniques planétaires),
scènes d'expédition, événements et incidents de la colonie, fils rouges,
personnages récurrents et pages d'archives (lore).
On écrit des **fichiers de données** dans `src/content/`, jamais du code : le
moteur (`src/engine/narration.js`) les lit, le validateur
(`npm run check:content`) les vérifie, le lecteur (`npm run histoire`) permet de
les jouer dans un terminal.

> En bref : on écrit un fichier, on l'ajoute au sommaire `src/content/index.js`,
> on lance `npm run check:content`, puis `npm run histoire -- <id> --tout` pour
> relire chaque chemin (une histoire, un événement, un incident, un fil rouge ou
> une page d'archives). Quand tout est vert, on lance `npm run sw:write` et
> `npm test`, puis on publie. Le moteur ne se touche pas.

## Sommaire

1. [La voix de DRIFT](#1-la-voix-de-drift)
2. [Où vit le contenu](#2-où-vit-le-contenu)
3. [Les textes](#3-les-textes)
4. [Les choix](#4-les-choix)
5. [Les effets](#5-les-effets)
6. [Les conditions](#6-les-conditions)
7. [Scènes d'expédition](#7-scènes-dexpédition)
8. [Histoires (chroniques)](#8-histoires-chroniques)
9. [Événements de colonie](#9-événements-de-colonie)
10. [Incidents de module](#10-incidents-de-module)
11. [Fils rouges](#11-fils-rouges)
12. [Personnages partagés](#12-personnages-partagés)
13. [Lore : Archives et Annales](#13-lore--archives-et-annales)
14. [Pas à pas : ajouter une histoire ou une scène](#14-pas-à-pas)
15. [Tester](#15-tester)
16. [Checklist avant publication](#16-checklist-avant-publication)
17. [Exemple complet : une histoire](#17-exemple-complet--le-phare-noyé)
18. [Pièges et compatibilité](#18-pièges-et-compatibilité)
19. [Annexe : vocabulaire](#19-annexe--vocabulaire)

---

## 1. La voix de DRIFT

- **Le joueur est le commandement**, tutoyé : « Tu fermes le carnet, par respect
  ou par prudence. » L'équipe sur place, c'est « vous » ou « l'équipe ».
- **Présent de narration**, phrases courtes, concrètes, sensorielles. Une image
  forte vaut mieux qu'un paragraphe d'exposition : « Une masse de muscle et de
  griffes émerge des herbes. Six yeux, quatre pattes, une mâchoire qui s'ouvre
  dans le mauvais sens. »
- **Sobriété** : pas de point d'exclamation en série, pas de majuscules pour
  crier (sauf une voix étrangère, comme le Chœur des Sept : « QUI. ÊTES. VOUS. »).
  L'horreur et le merveilleux passent par le détail.
- **Montrer l'équipage** : nommer les colons avec `{equipe.chef}`,
  `{equipe.medecin}`, `{acteur}` plutôt que « un membre de l'équipe ».
- **Les personnages ont une voix** (champ `voix` d'un personnage) : Adèle est
  « sèche, ironique », Khêr-Da « calme, précise, ironique ». Relire chaque
  réplique en se demandant si elle sonne comme lui ou elle.
- **Le joueur lit sur un téléphone**, quelques minutes à la fois : une scène fait
  300 à 700 caractères en 1 à 3 paragraphes ; 2 à 4 choix ; un libellé tient en
  60 caractères.

**Typographie française** — le moteur s'occupe d'une partie du travail :

| On écrit | Le joueur voit | Qui s'en charge |
|---|---|---|
| `l'équipe` | l’équipe (apostrophe courbe) | le moteur |
| `Vraiment ?` / `« Oui »` | espaces insécables avant ? ! ; : » et après « | le moteur |
| `« Vous avez mis le temps. »` | guillemets français | l'auteur : **jamais de `"`** (refusé par le validateur) |
| `*respiration*` | *respiration* (italique) | le moteur ; avec parcimonie |
| `**« Bonjour. »**` | **gras** | le moteur ; très rare |

Pas de HTML (`<`, `>` sont refusés), pas d'émoji.

## 2. Où vit le contenu

```
src/content/
  dsl.js              marqueurs : histoire(), scene(), evenement(), incident()… (aucune logique)
  vocabulaire.js      ressources, compétences, statuts, attributs de lieu, effets, gabarits
  index.js            SOMMAIRE : tout fichier de contenu doit y être importé
  histoires/          une histoire par fichier (pulsar-silencieux.js, sanctuaire-vert.js…)
  scenes/             scènes d'expédition, par lieu ou thème (ruines-humaines.js, biomes.js…)
  evenements/         événements de colonie, par thème ou par personnage (social.js, ilya.js…)
  incidents/          incidents, un fichier par module (mine.js, hydroponie.js…)
  arcs/               fils rouges, un par fichier (avant-poste.js, atterrissage.js = prologue)
  personnages/        personnages récurrents partagés (ilya.js, seren.js, maud.js)
  lore/               pages d'archives, par catégorie (histoire.js, ruines.js…)
  factions/           (prévu : types de factions et porte-parole)
src/engine/narration.js  le moteur : conditions, textes, effets, choix
tools/check-content.mjs  le validateur        →  npm run check:content
tools/lire-histoire.mjs  le lecteur terminal  →  npm run histoire -- <id>  (lire-colonie.mjs pour la colonie)
```

Un fichier de contenu est un module JavaScript qui n'exporte que des données :

```js
import { scene } from '../dsl.js';
export default [ scene({ ... }), scene({ ... }) ];   // fichier de scènes

import { histoire } from '../dsl.js';
export default histoire({ ... });                     // fichier d'histoire
```

Des chaînes entre guillemets doubles quand le texte contient une apostrophe
(`"L'écoutille s'ouvre"`), simples sinon. Les commentaires `//` sont bienvenus.
Un fichier oublié dans `index.js` n'existe pas pour le jeu : le validateur le
signale.

## 3. Les textes

Partout où un texte est attendu (texte d'une scène, intro d'épisode, fin,
conséquence d'un choix), on peut écrire :

**Une chaîne.** Une ligne vide sépare deux paragraphes (dans une chaîne entre
`` ` ``) ; on peut aussi donner une **liste de paragraphes** :

```js
texte: [
  "Derrière la porte, une pièce ronde, plongée dans la pénombre.",
  'Une voix te parle, fragmentée :',
],
```

**Un paragraphe conditionnel** `{ si, texte }`, affiché seulement si la
condition est vraie (extrait des *Veilleurs de Beth*) :

```js
texte: [
  "Tu sais maintenant. L'orbiteur Beth-3 est en orbite basse […] Eyla t'attend.",
  { si: 'karn_lien >= 2', texte: "Karn est avec elle. Il porte un sac sur l'épaule, comme prêt à partir." },
  { si: "pretre_status == 'present' && verite_revelee", texte: 'Le Prêtre est là aussi. Il te dévisage.' },
],
```

**Des variantes** `{ unParmi: [...] }` : la **première** variante dont la
condition est vraie est affichée ; la dernière, sans `si`, sert de texte par
défaut (extrait du *Pulsar Silencieux*) :

```js
texte: { unParmi: [
  { si: 'adele_trust >= 2', texte: "Adèle te fait tout visiter. Y compris la porte verrouillée au fond. […]" },
  { si: 'adele_trust >= 1', texte: "Adèle te fait visiter le bunker. Trois pièces, des stocks à moitié vides […]" },
  { texte: "Adèle ne te montre que la salle commune. Stocks visiblement bas. […]" },
] },
```

Ordre des variantes numériques : du plus grand seuil au plus petit (`>= 3`, puis
`>= 2`…), sinon la première attrape tout.

### Gabarits

Entre accolades, remplacés au moment de l'affichage :

| Gabarit | Devient |
|---|---|
| `{vaisseau}` | nom du vaisseau de l'expédition |
| `{lieu}` | nom du corps céleste visité |
| `{systeme}` | nom du système |
| `{colonie}` | nom de la colonie (« Avant-poste ») |
| `{equipe.chef}` | chef d'équipe (premier membre) |
| `{equipe.medecin}` | meilleur médecin de l'équipe (sinon le chef) |
| `{equipe.hasard}` | un membre de l'équipe, le même pendant toute la scène |
| `{acteur}` | le colon qui agit pour ce choix (celui qui passe le test, ou qui remplit la condition) — dans les textes de conséquence |
| `{victime}` | le dernier colon touché par un `statut` (ou la victime d'un incident) |
| `{pnj:adele}` | nom d'un personnage de l'histoire (`{pnj:pulsar_silencieux/adele}` ailleurs) ; `{pnj:ilya}` : un personnage partagé (section 12), dans les événements, incidents et archives |
| `{colon}`, `{colon.age}` | un acteur déclaré d'un événement (section 9), son âge |
| `{module}` | le module d'un incident (« Mine de surface ») |
| `{recrue}` | le colon qu'un choix vient d'accueillir (effet `recrute`) |
| `{decor.biome}` | phrase de décor du lieu (aussi `decor.atmosphere`, `decor.signal`, `decor.ruines`, `decor.danger`) |

**Accords** (pronoms des colons : `il`, `elle`, ou neutre s'ils n'en ont pas) :

- `{acteur|il|elle}` → « il » ou « elle » ; neutre : « il/elle » ;
  `{acteur|il|elle|iel}` donne la forme neutre explicite ;
- `{victime|prêt|prête}` → « prêt », « prête » ou « prêt·e » ;
- `{acteur.e}` → « », « e » ou « ·e » : `{acteur} est arrivé{acteur.e}`.

Un exemple : `{ texte: 'Un joint cède. {victime} s’entaille la main ; {victime|il|elle} serre les dents.' }`.

## 4. Les choix

```js
{ label: 'Lire le journal entier',             // le bouton (60 caractères au plus)
  si: 'truth_revealed',                         // facultatif : choix CACHÉ si faux
  requiert: 'equipe.science >= 2',              // facultatif : choix GRISÉ si faux, avec la raison
  raison: 'Il faut savoir lire ce format',      // facultatif : remplace la raison générée
  cout: { biomasse: 30 },                       // facultatif : payé par la colonie, grisé si impossible
  consomme: 'kit_reparation',                   // facultatif : objet embarqué, consommé
  test: { ... },                                // OU effets
  effets: [ ... ] }
```

- **`si` ou `requiert` ?** `si` cache le choix : pour ce que le joueur ne doit pas
  deviner (un secret, une branche liée à un drapeau). `requiert` le montre grisé
  avec une raison lisible générée par le moteur : « Science 2 requise dans
  l'équipe », « Nécessite : Lance-flammes », « Sang-froid 7 requis dans
  l'équipe ». Pour un objet ou une compétence, préférer `requiert` : le joueur
  apprend quoi emporter la prochaine fois.
- **`test`** : un jet d'1d10 + bonus du meilleur colon de l'équipe contre la
  difficulté. Bonus d'une caractéristique (1-10) : (valeur − 5) / 2 arrondi en
  dessous ; bonus d'une compétence (0-5) : son niveau. L'interface affiche la
  chance et le colon : « 70 % — Sang-froid de Vikram ».

  ```js
  { label: "Forcer l'ouverture",
    test: { carac: 'vigueur', difficulte: 6,
      reussite: [{ texte: 'La porte cède dans un grincement. Local de stockage.' }, { gain: { metal: 30, cristal: 15 } }],
      echec: [{ texte: 'Un éclat de métal vient blesser {victime}.' }, { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }] } },
  ```
  Repères : difficulté 5 = facile (60 % pour un colon moyen), 7 = sérieux (40 %),
  9 = rare (20 %).

**Règles** (vérifiées par le validateur) :

- 2 à 4 choix ; au moins **un choix toujours possible** (sans `si`, `requiert`,
  `cout` ni `consomme`) — sinon l'équipe peut rester coincée ;
- un choix = une conséquence distincte. Un choix à prérequis doit être
  **meilleur ou différent**, jamais un piège ;
- préférer les conséquences différées (un drapeau qui change une scène plus
  tard) au butin immédiat ;
- un libellé commence par un verbe (« Forcer l'ouverture ») ou une réplique
  entre « » (« « Combien êtes-vous ? » »).

Le joueur voit le résultat de son choix (texte de conséquence, gains, pertes,
jet) **avant** la scène suivante.

## 5. Les effets

Une liste **ordonnée** ; chaque effet est un objet à **une seule clé**. Le
même vocabulaire sert partout (scènes, histoires, événements, incidents,
fils rouges).

| Effet | Exemple | Notes |
|---|---|---|
| `texte` | `{ texte: "Le signal vient d'un bunker abandonné." }` | récit de la conséquence, affiché après le choix et gardé dans le bilan |
| `gain` | `{ gain: { metal: 30, datacubes: 4 } }` | en expédition : dans la soute (réduit si le site a déjà été fouillé, bonus des ruines alien) |
| `perte` | `{ perte: { energie: 10 } }` | perdu par la colonie (jamais sous 0) ; un prix à payer s'écrit plutôt `cout` sur le choix |
| `objet` | `{ objet: 'disque_memoire' }` ou `{ objet: { id, n: 2 } }` | objet rapporté |
| `schema` | `{ schema: 'humain' }`, `['humain', 'fusion']`, `'auto'` | tire un schéma de cette origine (`auto` : selon les ruines) |
| `statut` | `{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }` | blessure, trauma… (statuts en annexe) ; la cible devient `{victime}` |
| `moral` | `{ moral: -2 }` ou `{ moral: { cible: 'chef', valeur: 5 } }` | forme courte : toute l'équipe |
| `affinite` | `{ affinite: { a: 'acteur', b: 'secondaire', delta: 20 } }` | relation entre deux colons |
| `brouille` | `{ brouille: { a: 'victime', b: 'colonie_hasard' } }` | brouille durable : entente ramenée à −30 au plus |
| `drapeau` | `{ drapeau: { confiance: '+1', maelle: 'rencontree' } }` | drapeaux de l'histoire ; `'+1'`/`'-2'` seulement sur un nombre |
| `monde` | `{ monde: { phare_allume: true } }`, `{ monde: { ilya_confiance: '+1' } }` | drapeau global, lisible partout (`monde.phare_allume`) ; `'+1'`/`'-2'` comptent |
| `recrute` | `{ recrute: 'adele' }`, `{ recrute: 'maud' }`, `{ recrute: { inconnu: true, bonus: 1 } }` | un personnage (d'histoire : au retour de l'expédition ; partagé : à la colonie) ou un visiteur ; jamais automatique (section 9) |
| `reputation` | `{ reputation: 10 }` ou `{ reputation: { faction: 'humain', delta } }` | faction du lieu visité ; à la colonie, un type de faction (la faction connue de ce type) |
| `journal` | `{ journal: '…' }` | une ligne du journal de la colonie |
| `annales` | `{ annales: 'La gardienne du Phare noyé a rejoint {colonie}.' }` | mémoire de la partie (voir Lore) |
| `module` | `{ module: { id: 'hydroponie', horsService: '6h' } }`, `{ module: { niveau: -1 } }` | module hors service, ou qui perd un niveau (dans un incident, `id` vaut son module) |
| `effetTemporaire` | `{ effetTemporaire: { titre: 'Climat de méfiance', prod: 0.85, duree: '2j' } }` | multiplie la production |
| `incident` | `{ incident: { id: 'mine_eboulement', dans: '2h' } }` | incident plus tard |
| `retardRecherche` | `{ retardRecherche: '30min' }` | la recherche en cours perd ce temps |
| `bonusPermanent` | `{ bonusPermanent: 'avant_poste_autonome' }` | récompense de fil rouge |
| `technologie` | `{ technologie: 'tech_resonance_pure' }` | technologie légendaire rendue accessible (fil rouge) |
| `combat` | voir ci-dessous | issue |

**Issues** — une seule, **en dernier** :

| Issue | Où | Effet |
|---|---|---|
| *(aucune)* | scènes d'expédition | scène suivante |
| `{ aller: 'cloche' }` | histoires | scène suivante de l'histoire |
| `{ finEpisode: true }` | histoires | fin de l'épisode ; la suite sera prête après le délai de l'histoire |
| `{ fin: 'gardienne_sauvee' }` | histoires | fin définitive de l'histoire |
| `{ retraite: true }` | partout | l'équipe rentre aussitôt (dans une histoire, l'épisode reprendra) |
| `{ rentrer: true }` | scènes d'expédition | fin normale de la mission (scènes de départ) |
| `{ combat: {...} }` | partout | combat, avec sa suite déclarée |

```js
{ combat: { ennemis: ['predateur_lunaire'], butin: { biomasse: 45 },
            victoire: [{ gain: { metal: 30 } }, { fin: 'phare_eteint' }],   // dans une histoire : une issue obligatoire
            defaite: [{ retraite: true }] } }                               // par défaut : retraite
```

Les durées s'écrivent **en temps réel** : `'45s'`, `'30min'`, `'18h'`, `'3j'`,
`'1j12h'`, `'2h30'` (1 tick du jeu = 1 seconde réelle).

**À la colonie** (événements, incidents, récompenses de fil rouge), les effets
permis sont : `texte`, `gain` (dans la limite du stockage), `perte`, `objet`
(dans l'inventaire), `schema`, `statut`, `moral` (forme courte : tous les colons
présents), `affinite`, `brouille`, `monde`, `recrute`, `reputation`, `journal`,
`annales`, `module`, `effetTemporaire`, `incident`, `retardRecherche`,
`bonusPermanent`, `technologie` — ni issue ni drapeau d'histoire. Les cibles y
sont celles du tableau plus les noms des acteurs déclarés.

## 6. Les conditions

Les champs `si`, `requiert`, `lieux`, `apparition.lieu`… sont des conditions
écrites dans un **mini-langage** (le jeu ne peut pas exécuter de code : c'est
voulu, et plus sûr).

| Élément | Exemple |
|---|---|
| comparaisons | `confiance >= 2`, `maelle == 'rencontree'`, `contact != 'hostile'` |
| et / ou / non | `a && b` ou `a et b` · `a \|\| b` ou `a ou b` · `!a` ou `non a` |
| parenthèses | `(corps.vie == 'faune' ou corps.danger == 'predateurs') et corps.type == 'planete'` |
| liste | `corps.biome dans ['ocean', 'glace']` |
| littéraux | `12`, `-60`, `'texte entre apostrophes'`, `vrai`, `faux`, `nul` |
| durées | `30min`, `3j`, `1j12h` (en ticks) : `acteur.mort_depuis < 3j` |

**Ce qu'on peut lire :**

| Espace | Exemples | Sens |
|---|---|---|
| *(nom nu)* | `confiance`, `truth_revealed` | drapeau de l'histoire en cours (déclaré) |
| `equipe` | `equipe.science`, `equipe.carac.sangfroid`, `equipe.trait.sang_froid`, `equipe.objet.lance_flammes`, `equipe.taille` | meilleure valeur de l'équipe, trait présent, nombre d'objets embarqués |
| `colonie` | `colonie.colons`, `colonie.jour`, `colonie.res.biomasse`, `colonie.module.infirmerie`, `colonie.tech.tech_fusion`, `colonie.objet.disque_memoire` | état de la colonie |
| `corps` | `corps.biome`, `corps.atmosphere`, `corps.ruines`, `corps.vie`, `corps.signal`, `corps.danger`, `corps.type`, `corps.gravite`, `corps.visites` | le lieu visité |
| `faction` | `faction.existe`, `faction.reputation` | faction du lieu |
| `histoire` | `histoire.pulsar_silencieux.fin == 'emporter_soeur'`, `histoire.x.terminee`, `histoire.x.episode`, `histoire.x.drapeau.adele_trust` | une histoire en lit une autre |
| `monde` | `monde.phare_allume` | drapeaux globaux (effet `monde`) |
| `compteur` | `compteur.expeditions`, `compteur.scenes`, `compteur.combats_gagnes`, `compteur.chroniques_terminees` | statistiques tenues par le moteur |
| `colonie` (suite) | `colonie.batiments`, `colonie.en_poste`, `colonie.couchettes_libres`, `colonie.vivres_ok`, `colonie.flotte`, `colonie.techs`, `colonie.recherches`, `colonie.schemas.alien_a`, `colonie.datacubes_alien`, `colonie.competence.linguistique`, `colonie.reserve.biomasse` (0 à 1), `colonie.gueris.pathogene_alien`, `colonie.morts` | état de la colonie, pour les événements et les fils |
| `expeditions` | `expeditions.total`, `expeditions.en_cours`, `expeditions.ruines.humaines`, `expeditions.biome.glace`, `expeditions.type.station`, `expeditions.scene.boss_alien_gardien`, `expeditions.objet.serum_xeno`, combinés : `expeditions.ruines.alien_b.objet.serum_xeno` | expéditions rentrées |
| `factions` | `factions.total`, `factions.humain`, `factions.allies` | factions connues |
| `evenement` | `evenement.marchand.fois`, `evenement.marchand.depuis` | mémoire des événements |
| `fil` | `fil.arc_effondrement.etape`, `fil.arc_effondrement.termine` | fils rouges |
| `archives` | `archives.exode`, `archives.total` | pages débloquées |
| `acteur` | `acteur.age`, `acteur.role == 'pilote'`… | filtres d'acteurs d'un événement (section 9) |

Le validateur refuse un identifiant inconnu (`equipe.sciense`), une valeur jamais
générée (`corps.biome == 'tropical'`), un drapeau non déclaré, et une valeur de
drapeau comparée mais jamais écrite.

## 7. Scènes d'expédition

Les scènes génériques, tirées pour les expéditions ordinaires. Une expédition :
**1 scène d'arrivée**, **2 à 4 scènes d'exploration**, **1 scène de départ**
(plus une embuscade si une faction locale est hostile).

```js
scene({
  id: 'ruine_h_porte',                          // unique, minuscules et _ ; ne plus le changer une fois publié
  titre: 'La porte soudée',                     // affiché au joueur
  moment: 'exploration',                        // 'arrivee' | 'exploration' (défaut) | 'depart' | 'embuscade'
  lieux: "corps.ruines dans ['humaines', 'fusion']",   // OBLIGATOIRE : où la scène peut arriver
  affinites: [{ si: "corps.danger == 'ia_hostile'", facteur: 2 }],   // facultatif : plus probable si…
  poids: 5,                                     // probabilité relative (défaut 1)
  texte: "Une porte blindée scellée, gravure d'un logo corporate à demi effacé. Quelqu'un a tenté de la souder de l'intérieur.",
  choix: [ /* … */ ],
})
```

**`lieux` est obligatoire et doit être physiquement juste** : la scène ne sera
jamais proposée ailleurs. Relire le texte et se demander ce qu'il suppose :

- du vent, une tempête, un geyser, un essaim qui vole, quelqu'un qui retire son
  casque → `corps.atmosphere != 'aucune'` (ou `== 'respirable'` pour un casque ouvert) ;
- un sol, des herbes, une crevasse → `corps.type dans ['planete', 'lune']`
  (les stations et épaves n'ont pas de sol, les champs d'astéroïdes pas d'herbe) ;
- un bâtiment, une salle, un terminal → des ruines (`corps.ruines …`) ou
  `corps.type dans ['station', 'epave']` ;
- une créature → `corps.vie …`.

Exemple : la tempête de sable (`tempete`) exige
`corps.danger == 'tempetes' && corps.atmosphere != 'aucune' && corps.type dans ['planete', 'lune']`.

**Affinités** : une condition secondaire qui multiplie le poids. Les silos
(`irradie_silos`) peuvent apparaître sur toute planète à ruines humaines, mais
trois fois plus souvent sur un monde irradié.

**Mémoire de la colonie** : une scène vue n'est reproposée qu'une fois toutes
les autres scènes compatibles (du même moment) vues autant de fois. Plus il y a
de scènes pour un type de lieu, moins le joueur voit de répétitions : le
validateur affiche la couverture (nombre moyen de scènes compatibles par
biome, ruines, etc.) et les lieux pauvres.

Scènes de départ : leur dernier choix finit en général par `{ rentrer: true }`.

## 8. Histoires (chroniques)

Une histoire est une saga attachée à une planète, jouée en **épisodes** espacés
dans le temps (par défaut 18 h réelles entre deux épisodes : le joueur voit
« La suite est prête »). C'est la colonne vertébrale du jeu.

```js
histoire({
  id: 'pulsar_silencieux',
  titre: 'Le Pulsar Silencieux',
  accroche: 'Une station humaine émet un signal régulier depuis trois mois. Personne ne répond.',

  apparition: {                                  // où et quand l'histoire peut apparaître
    lieu: "corps.ruines == 'humaines' && corps.atmosphere dans ['toxique', 'tenue', 'anormale']",
    si: 'colonie.colons >= 4',                   // facultatif : condition sur la colonie
    chance: 0.35,                                // chance à la première visite d'un lieu compatible
  },
  rythme: { entreEpisodes: '18h' },              // délai réel entre deux épisodes

  drapeaux: {                                    // TOUS les drapeaux, avec leur valeur de départ
    signal_origin: null,                         // 'station' | 'bunker' | 'inconnu'
    adele_trust: 0,                              // -2 à +3
    secret_partage: false,
  },

  personnages: {
    adele: { nom: 'Adèle Voronine', age: 47, pronoms: 'elle', role: 'Biologiste', voix: 'sèche, ironique',
             recrue: { competences: { science: 3, medecine: 2, survie: 2 }, traits: ['cynique', 'survivant'] } },
  },

  fins: {
    emporter_soeur: { titre: 'La sœur', texte: "Tu as ramené la sœur. Elle vit maintenant à l'avant-poste — silencieuse, étrange, importante." },
    // effets possibles à la fin : effets: [{ monde: {...} }, { annales: '…' }]
  },

  episodes: [
    { titre: 'Le signal', debut: 'ep1_sas', intro: "À l'approche, le signal s'intensifie. […]" },
    { titre: 'Les survivants', debut: 'ep2_contact', intro: { unParmi: [
        { si: "signal_origin == 'bunker'", texte: 'Le signal a changé de nature. Une voix humaine maintenant, depuis la surface.' },
        { texte: "Le signal n'a pas faibli. Quelque chose t'attend là-bas." },
    ] } },
  ],

  scenes: {
    ep1_sas: { titre: 'Le sas', texte: "L'écoutille de la station s'ouvre sans résistance. […]", choix: [ /* … */ ] },
    // …
  },
})
```

**Apparition** : le jeu garantit qu'une histoire est toujours en cours ou à
découvrir — au début de la partie, il en place une sur une planète compatible à
portée de l'antenne. Les autres se révèlent au hasard (`chance`) quand une
expédition visite un lieu compatible.

**Drapeaux** : la mémoire de l'histoire. Déclarés avec leur valeur de départ
(nombre, texte, `true`/`false`, ou `null` = pas encore décidé), nommés en
français, en minuscules. Écrire en commentaire les valeurs possibles. Un drapeau
numérique s'incrémente avec `'+1'` ; un drapeau texte se remplace.

**Épisodes** : 2 ou 3, chacun commence à sa scène `debut`. L'intro peut varier
selon les drapeaux (bloc `unParmi`). Chaque scène d'histoire finit chaque choix
par une issue : `aller`, `finEpisode`, `fin` ou `retraite`. Le dernier épisode
finit par des `fin`.

**Fins** : 3 à 5 ; chacune a un titre court (affiché dans le récit des
chroniques et les Annales) et un écho mécanique si possible : une recrue, un
objet, un drapeau `monde`, une ligne d'Annales.

**Personnages** : nom, âge, `pronoms` (pour les accords), rôle, une `voix` en
quelques mots, et `recrue` s'il peut rejoindre la colonie (compétences 0-5,
caractéristiques 1-10, traits du catalogue). `{ recrute: 'adele' }` l'amène au
retour de l'expédition, comme un colon ordinaire.

**Ids des scènes** : préfixés par l'épisode (`ep2_bunker`) pour s'y retrouver.

## 9. Événements de colonie

Un événement est une **scène de décision à la colonie** : une fenêtre s'ouvre
(titre, texte, 2 à 4 choix), le joueur choisit, puis une seconde fenêtre montre
les **conséquences réellement appliquées** (ressources, moral, blessures,
recrue…). Le jeu en tire un toutes les 3 à 6 heures réelles parmi ceux dont la
condition est vraie, et en garantit un au retour d'une longue absence. Hors
ligne, un événement n'est jamais tranché à la place du joueur : il attend dans
la file des décisions (3 au plus).

Un fichier par thème ou par personnage dans `src/content/evenements/`,
exportant une liste :

```js
// src/content/evenements/mon-theme.js
import { evenement } from '../dsl.js';
export default [ evenement({ ... }), evenement({ ... }) ];
```

| Champ | Rôle |
|---|---|
| `id` | unique, minuscules et `_` ; ne plus le changer une fois publié |
| `titre` | titre de la fenêtre (60 caractères au plus) |
| `theme` | mot affiché au-dessus du titre (« Visiteur », « Conflit »…) |
| `ton` | `'positif'`, `'negatif'` ou `'neutre'` (couleur ; réaction des proches) |
| `si` | condition pour que l'événement puisse survenir |
| `acteurs` | les colons concernés, nommés (voir plus bas) |
| `personnage` | le personnage partagé qui apparaît (`'ilya'`) : son nom s'affiche au-dessus du titre |
| `delai` | délai minimal avant qu'il revienne (`'36h'` par défaut, `'3j'`…) |
| `delaiActeur` | un même colon n'est pas repris comme acteur avant ce délai (`'7j'`) |
| `unique` | `true` : une seule fois par partie |
| `spontane` | `false` : jamais tiré au hasard (scène ouverte par un fil rouge) |
| `poids` | probabilité relative au tirage (1 par défaut) |
| `texte`, `choix` | comme une scène : paragraphes, variantes, `{gabarits}`, choix à `requiert`, `cout`, `consomme`, `test` |

**Acteurs.** On déclare chaque rôle par un nom libre (minuscules), dans l'ordre :

```js
acteurs: {
  colon: { filtre: 'acteur.age_rond' },                       // un colon présent à la base
  autre: { filtre: 'acteur.affinite >= 75' },                 // affinité avec l'acteur précédent
  defunt: { parmi: 'morts', filtre: 'acteur.mort_depuis < 3j' },
  pilote: { parmi: 'vivants', prefere: "acteur.role == 'pilote'" },
}
```

- `parmi` : `'colons'` (défaut : vivants présents à la base), `'vivants'` (même
  partis en mission), `'morts'` ;
- `filtre` : condition obligatoire ; `prefere` : condition souhaitée (si personne
  ne la remplit, un autre colon fait l'affaire) ;
- champs lisibles : `acteur.age`, `acteur.age_rond`, `acteur.moral`,
  `acteur.sante`, `acteur.role` (`'pilote'`, `'ingenieur'`, `'medecin'` pour
  l'équipage fondateur), `acteur.libre`, `acteur.poste` (`'laboratoire'`…),
  `acteur.mort`, `acteur.mort_depuis` (une durée : `< 3j`), `acteur.affinite`
  (avec l'acteur précédent), `acteur.science` (compétences),
  `acteur.carac.vigueur`, `acteur.trait.survivant` ;
- dans les textes : `{colon}`, `{colon.age}`, `{colon|il|elle}`, `{colon.e}` ;
- dans les effets : le nom est une cible, `{ moral: { cible: 'colon', valeur: 3 } }`.

Si un acteur meurt ou quitte la base pendant que l'événement attend, le jeu en
cherche un autre ; s'il n'en trouve pas (ou si la condition `si` est devenue
fausse), l'événement est retiré sans fenêtre.

**L'équipe** d'un événement, c'est tous les colons présents à la base :
`requiert: 'equipe.linguistique >= 2'` affiche « Linguistique 2 requise parmi
les colons présents », et `{acteur}` nomme celui qui agit (le meilleur au test
ou à la condition). `consomme` prend l'objet dans l'inventaire de la colonie.

**Mémoire.** Pour qu'un événement se souvienne d'un autre :
- `evenement.marchand.fois` (résolu combien de fois), `evenement.marchand.depuis` ;
- `monde.x` : un drapeau global posé par `{ monde: { ilya_service: 'gardee' } }`,
  qui peut aussi compter : `{ monde: { ilya_confiance: '+1' } }`.

**Accueillir un colon est une décision.** Un choix qui fait entrer quelqu'un
(`{ recrute: … }`) n'est jamais pris automatiquement (file pleine, absence) ;
il exige la condition **`colonie.vivres_ok`** (une couchette libre, de la
biomasse en stock et un bilan de biomasse qui ne baisse pas), dans le `si` de
l'événement ou le `requiert` du choix ; et l'événement doit garder un choix
toujours possible qui n'ajoute personne. Le validateur le vérifie. La fenêtre
affiche le nom de la recrue et son salaire (« Accueille Lou Varga · salaire
160 biomasse par jour »).

### Exemple complet : la serre de Noor

```js
// src/content/evenements/serre.js — une initiative, puis sa suite.
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'serre_proposition',
    titre: 'Une serre sous la roche',
    theme: 'Initiative',
    ton: 'positif',
    si: 'colonie.module.hydroponie >= 2',
    acteurs: { colon: { filtre: 'acteur.survie >= 2', prefere: "acteur.poste == 'hydroponie'" } },
    delai: '3j',
    texte: [
      "{colon} a trouvé une poche d'air chaud sous le plateau, à vingt mètres du sas. {colon|Il|Elle} veut y installer une serre.",
      '« Il fait vingt-deux degrés là-dessous. Personne ne sait pourquoi. »',
    ],
    choix: [
      { label: 'Lui donner les moyens', cout: { metal: 60 },
        effets: [
          { texte: '{colon} pose les premiers bacs avant la nuit.' },
          { effetTemporaire: { titre: 'Serre souterraine', prod: 1.1, duree: '12h' } },
          { monde: { serre: 'construite' } },
        ] },
      { label: 'Sonder la poche avant tout', requiert: 'equipe.science >= 2',
        test: { competence: 'science', difficulte: 6,
          reussite: [{ texte: "{acteur} relève une source géothermique stable. Rien d'inquiétant." }, { gain: { datacubes: 30 } }, { monde: { serre: 'sondee' } }],
          echec: [{ statut: { cible: 'acteur', id: 'blessure_legere' } }, { texte: 'Une bouffée de gaz : {victime} remonte en toussant.' }] } },
      { label: 'Plus tard',
        effets: [{ texte: "{colon} hausse les épaules. L'idée reviendra." }, { moral: { cible: 'colon', valeur: -3 } }] },
    ],
  }),

  evenement({
    id: 'serre_recolte',
    titre: 'La première récolte',
    theme: 'Initiative',
    ton: 'positif',
    si: "monde.serre == 'construite'",
    unique: true,
    texte: 'La serre a donné. Des tomates, petites et dures, mais rouges. Toute la colonie défile pour les voir.',
    choix: [
      { label: 'Une fête, ce soir', cout: { biomasse: 40 },
        effets: [{ texte: 'On mange les tomates une par une, en silence, comme un sacrement.' }, { moral: { cible: 'colonie', valeur: 9 } }, { annales: 'Première récolte de la serre souterraine.' }] },
      { label: 'Garder les graines',
        effets: [{ gain: { biomasse: 60 } }] },
    ],
  }),
];
```

Puis l'ajouter au sommaire `src/content/index.js` (`EVENEMENTS`), lancer
`npm run check:content`, et le relire avec `npm run histoire -- serre_proposition --tout`.

## 10. Incidents de module

Un incident est un événement **lié à un module** (la mine s'effondre, une cuve
est contaminée) : il ne survient que si le module est construit, au plus un
toutes les 1 à 2,5 heures, et la sécurité de la colonie le retarde. Un fichier
par module dans `src/content/incidents/`, exportant une liste d'`incident({...})`.

Champs : ceux d'un événement (`id`, `titre`, `ton`, `si`, `poids`, `texte`,
`choix`), plus :

| Champ | Rôle |
|---|---|
| `module` | id du module (`'mine_surface'`, `'hydroponie'`… voir `MODULES` dans `src/catalog.js`) |
| `niveauMin` | niveau du module à partir duquel l'incident est possible (1 par défaut) |
| `gravite` | `'mineur'` (résolu seul, au plus sûr, pendant une absence), `'serieux'` ou `'critique'` (attendent le joueur) |

La **victime** est choisie par le jeu : un colon du module, sinon un colon libre,
sinon n'importe qui à la base ; `{victime}` dans les textes, `cible: 'victime'`
dans les effets. L'**équipe** mobilisable, c'est le personnel du module et les
colons libres. `{module}` donne le nom du module. Dans les effets, `module`
s'applique par défaut au module de l'incident :
`{ module: { horsService: '1h' } }`, `{ module: { niveau: -1 } }`.

Les montants s'écrivent **tels qu'ils sont appliqués** (pas de multiplicateur
caché). Repères : une perte courante vaut 30 à 90, une perte grave 150 à 250 ;
un module hors service, 30 min à 1 h 30.

### Exemple complet : la fuite du réacteur

```js
// src/content/incidents/reacteur.js — incidents du Réacteur à fusion.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'reacteur_fuite',
    titre: 'Fuite de plasma',
    module: 'reacteur_fusion',
    gravite: 'critique',
    texte: "Une alarme stridente : le confinement du réacteur faiblit. {victime} est en salle de contrôle, seul{victime.e} devant les jauges.",
    choix: [
      { label: "Couper le réacteur d'urgence",
        effets: [
          { texte: "Le grondement s'éteint. La colonie passe sur batteries." },
          { perte: { energie: 150 } },
          { module: { horsService: '1h30' } },
        ] },
      { label: 'Stabiliser le champ à la main',
        test: { carac: 'sangfroid', difficulte: 7,
          reussite: [{ texte: '{acteur} tient le champ, centimètre par centimètre. La jauge redescend.' }, { annales: '{acteur} a sauvé le réacteur à mains nues.' }],
          echec: [
            { texte: "L'arc touche {victime}. Le réacteur s'arrête de lui-même." },
            { statut: { cible: 'victime', id: 'blessure_grave' } },
            { module: { niveau: -1 } },
            { incident: { id: 'reacteur_fuite', dans: '6h' } },
          ] } },
      { label: 'Utiliser un kit de réparation', consomme: 'kit_reparation',
        effets: [{ texte: 'Le joint de rechange tient. Pour cette fois.' }, { perte: { metal: 30 } }] },
    ],
  }),
];
```

## 11. Fils rouges

Un fil rouge est un **objectif au long cours** fait d'étapes : chaque étape se
valide quand sa condition `quand` devient vraie, dans l'ordre. Les fils
s'affichent dans Récits › Fils rouges ; l'étape en cours d'un fil **principal**
devient un objectif du tableau de bord, avec un bouton qui mène à l'action.
Une étape peut ouvrir une **scène** (un événement `spontane: false`) quand elle
devient l'étape en cours : elle ne se valide qu'une fois la scène résolue
(c'est ainsi qu'est construit le prologue « L'atterrissage »).

```js
arc({
  id: 'arc_avant_poste',                 // ne plus le changer (sauvegardes, TECH_TREE)
  titre: "L'Avant-poste",
  surtitre: 'Chronique de la colonie',
  couleur: '#e9b76a',
  principal: true,                       // fournit l'objectif « fil rouge » du tableau de bord
  intro: '…',
  ouverture: 'vrai',                     // condition d'ouverture ('faux' : ouvert par le jeu seulement)
  indiceOuverture: 'Se révèle quand…',   // affiché tant que le fil est scellé
  etapes: [ { … } ],
  recompense: { titre: 'Bonus permanent : +10 % sur toute production', texte: '…', effets: [ … ] },
})
```

Une **étape** :

| Champ | Rôle |
|---|---|
| `id` | unique dans tout le contenu ; ne plus le changer (sauvegardes) |
| `titre`, `texte` | titre de l'étape, texte affiché une fois franchie |
| `quand` | condition de validation |
| `indice` | ce qu'il faut faire, affiché tant que l'étape n'est pas franchie |
| `scene` | facultatif : id d'un événement ouvert quand l'étape devient l'étape en cours |
| `objectif` | facultatif : l'objectif du tableau de bord (voir ci-dessous) ; une liste de variantes `{ si, … }` est permise |

**Objectif** : `{ titre, detail?, action: { onglet, sousOnglet?, cible?, label? } }`
plus, au choix, `progression: { valeur: 'colonie.colons', total: 10, unite: 'colons' }`
(« 7/10 colons ») ou `modules: ['mine_surface', 'hydroponie'], niveau: 3` (le
bouton vise le module le plus en retard). Onglets : `base` (`afaire`,
`construction`, `postes`), `equipage` (`personnel`, `recrutement`, `formation`,
`soins`), `expeditions` (`missions`, `carte`, `vaisseaux`, `diplomatie`),
`recits`, `labo`. `cible` : un id de module (construction).

**Récompense** : des effets de colonie, plus `{ schema: 'bp_relais_unifie' }`
(un schéma précis), `{ technologie: 'tech_resonance_pure' }` (technologie
légendaire, à relier par `prereq.requireArc` dans `TECH_TREE`),
`{ bonusPermanent: 'avant_poste_autonome' }`.

Conditions utiles aux fils : `colonie.flotte`, `colonie.techs`,
`colonie.schemas.alien_a`, `colonie.competence.linguistique`,
`colonie.gueris.pathogene_alien`, `colonie.datacubes_alien`,
`expeditions.ruines.humaines`, `expeditions.type.station`,
`expeditions.scene.boss_alien_gardien`, `expeditions.ruines.alien_b.objet.serum_xeno`
(les filtres se combinent), `fil.arc_effondrement.etape`.

### Exemple complet : la balise perdue

```js
// src/content/arcs/balise.js — un fil court avec une scène.
import { arc } from '../dsl.js';

export default arc({
  id: 'arc_balise',
  titre: 'La balise perdue',
  surtitre: 'Fil rouge',
  couleur: '#7fa6c8',
  intro: "Un signal faible, à la limite de l'antenne. Il se répète toutes les onze minutes.",
  ouverture: 'colonie.module.antenne >= 2',
  indiceOuverture: "Se révèle avec une antenne de niveau 2.",
  etapes: [
    { id: 'bal_1', titre: 'Le signal',
      texte: 'Le signal est humain. Une balise de détresse, programmée il y a très longtemps.',
      quand: 'expeditions.total >= 3',
      indice: 'Mener trois expéditions.',
      objectif: { titre: 'Mener trois expéditions', progression: { valeur: 'expeditions.total', total: 3, unite: 'expéditions' },
        action: { onglet: 'expeditions', sousOnglet: 'carte', label: 'Carte' } } },
    { id: 'bal_2', titre: 'Le relevé',
      scene: 'balise_releve',              // événement spontane: false, dans evenements/balise.js
      texte: 'Les coordonnées sont relevées. La balise attend.',
      quand: 'monde.balise_localisee',
      indice: 'Décider quoi faire du signal.' },
  ],
  recompense: {
    titre: 'Récompense : un schéma humain',
    texte: 'La balise livre ses plans de construction.',
    effets: [{ schema: 'humain' }, { annales: 'La balise perdue a été retrouvée.' }],
  },
});
```

La scène de l'étape `bal_2`, réservée au fil (`spontane: false`) :

```js
// src/content/evenements/balise.js
import { evenement } from '../dsl.js';

export default [
  evenement({
    id: 'balise_releve',
    titre: 'Onze minutes',
    theme: 'Signal',
    ton: 'neutre',
    spontane: false,
    unique: true,
    acteurs: { operateur: { prefere: 'acteur.science >= 2' } },
    texte: "{operateur} a passé la nuit sur le signal. « Ce n'est pas un appel au secours. C'est un compte à rebours, et il recommence à zéro chaque fois. »",
    choix: [
      { label: 'Relever les coordonnées',
        effets: [{ texte: '{operateur} trace un point sur la carte, loin, très loin.' }, { monde: { balise_localisee: true } }] },
      { label: 'Couper la réception',
        effets: [{ texte: 'Le silence revient. Personne ne dort mieux.' }, { moral: { cible: 'colonie', valeur: -3 } }, { monde: { balise_localisee: true } }] },
    ],
  }),
];
```

## 12. Personnages partagés

Un personnage qui revient dans **plusieurs** contenus (un marchand, une
émissaire, une voisine) a son fichier dans `src/content/personnages/` :

```js
// src/content/personnages/ilya.js — Ilya Brenner, marchand itinérant.
// Apparaît dans : marchand, ilya_service, ilya_retour (evenements/ilya.js).
// Mémoire : monde.ilya_confiance (nombre), monde.ilya_service ('gardee' | 'ouverte' | 'refusee').
import { personnage } from '../dsl.js';

export default personnage({
  id: 'ilya',
  nom: 'Ilya Brenner',
  age: 52,
  pronoms: 'il',                        // 'il', 'elle' ou 'iel' : accords {pnj:ilya|il|elle}
  role: 'Marchand itinérant',
  voix: 'affable, calculateur ; parle des prix comme on parle de la météo',
  portrait: "Un homme rond dans une combinaison rapiécée de partout.",
  // faction: 'humain',                 // s'il parle pour une faction : { reputation: 10 } la vise
  // recrue: { competences: { survie: 3 }, caracs: { sangfroid: 7 }, traits: ['survivant'] },
});
```

- l'ajouter au sommaire (`PERSONNAGES`) ;
- dans un événement : `personnage: 'ilya'` (son nom s'affiche dans la fenêtre)
  et `{pnj:ilya}` dans les textes ;
- s'il peut rejoindre la colonie : `recrue` (compétences 0-5, caractéristiques
  1-10, traits du catalogue) et l'effet `{ recrute: 'ilya' }` (avec
  `colonie.vivres_ok`, voir section 9) ;
- **la mémoire** passe par `monde` : chaque apparition lit ce que les
  précédentes ont écrit. Noter en tête du fichier les drapeaux employés et leurs
  valeurs, comme ci-dessus ;
- un personnage partagé apparaît dans **deux événements au moins** (le
  validateur avertit sinon). Un PNJ propre à une histoire reste déclaré dans
  l'histoire (`personnages: { adele: … }`).

Les trois personnages actuels : **Ilya Brenner** (marchand : `marchand`,
`ilya_service`, `ilya_retour`), **Seren Adebayo** (émissaire des Enclaves :
`seren_contact`, `seren_refugies`, `seren_bilan`), **Maud Kessler**
(l'ancienne du plateau : `maud_rencontre`, `maud_recit`, `maud_adieu`).

## 13. Lore : Archives et Annales

- **Archives** (`src/content/lore/`) : des pages écrites à l'avance, classées
  par catégorie (`histoire`, `colonie`, `mondes`, `ruines`, `peuples`,
  `techniques`), débloquées quand leur condition `si` devient vraie. Une page
  débloquée le reste (sauvegardée) ; le joueur la lit dans Récits › Archives,
  un badge discret signale les pages nouvelles.

  ```js
  // src/content/lore/mondes.js (extrait)
  import { lore } from '../dsl.js';
  export default [
    lore({
      id: 'mondes_froids',
      titre: 'Glace et toundra',
      categorie: 'mondes',
      ordre: 1,                                      // facultatif : rang dans la catégorie
      si: 'expeditions.biome.glace >= 1 || expeditions.biome.toundra >= 1',
      resume: 'Des mondes qui conservent tout, même ce qu’on voudrait oublier.',
      texte: [
        "Le froid conserve. Sous la glace, les équipes retrouvent des structures intactes […]",
        { si: 'monde.maud_recit', texte: 'Maud se souvient d’un hiver où même la glace a fondu.' },
        "Règle de terrain : sur un monde froid, ne jamais dormir seul.",
      ],
    }),
  ];
  ```

  Bonnes conditions de déblocage : une première découverte
  (`expeditions.biome.jungle >= 1`, `expeditions.ruines.alien_a >= 1`), un
  premier contact (`factions.humain >= 1`), un objet (`colonie.objet.disque_memoire >= 1`),
  une étape de fil rouge (`fil.arc_effondrement.etape >= 3`), une fin
  d'histoire (`histoire.pulsar_silencieux.terminee`), un drapeau posé par un
  événement (`monde.maud_recit`), ou `vrai` pour une page ouverte dès le départ.
  Une page fait 2 ou 3 paragraphes ; on peut y lire `{colonie}` et `{pnj:id}`.
- **Annales** : la mémoire de *cette* partie, qui se remplit toute seule —
  fondation, arrivées, morts (avec leur cause), premiers contacts, mises en
  service et grands chantiers, fins de chroniques et de fils rouges — et par
  l'effet `{ annales: '…' }`. Une bonne ligne d'Annales est une phrase au passé,
  datée par le jeu : « La gardienne du Phare noyé a rejoint {colonie}. » Elles
  s'affichent dans Récits › Annales, par « Jour N ».
- **Cohérence** : avant d'écrire, relire les accroches et fins des histoires
  existantes et les pages d'archives ; un fait établi (l'Effondrement, les
  ruines de type A cristallines et de type B organiques, les « Présents » de
  Beth, la colonie d'avant sur le plateau) ne se contredit pas.

## 14. Pas à pas

### Ajouter une histoire

1. Copier l'exemple de la section 17 dans `src/content/histoires/mon-histoire.js`
   (nom de fichier en minuscules avec tirets ; `id` avec des _).
2. L'ajouter au sommaire `src/content/index.js` :
   ```js
   import monHistoire from './histoires/mon-histoire.js';
   export const HISTOIRES = parId([pulsarSilencieux, …, monHistoire]);
   ```
3. Écrire : accroche, apparition, drapeaux, personnages, fins, épisodes, scènes.
4. `npm run check:content` jusqu'à ce qu'il n'y ait plus d'erreur.
5. `npm run histoire -- mon_histoire --tout` : relire chaque chemin et chaque fin.
6. `npm run histoire -- mon_histoire` : jouer au clavier, lire les textes en entier.
7. Dans le jeu (`python3 -m http.server 8000`) : forcer l'histoire sur une
   planète depuis la console du navigateur pour la voir en vrai :
   ```js
   const st = await import('./src/state.js');
   const ch = await import('./src/chronicles.js');
   const b = st.S.galaxy.systems.find(s => s.scanned && s.distance > 0).bodies[0];
   b.chronicle = { id: 'mon_histoire', episodeIdx: 0, flags: { ...ch.CHRONICLES.mon_histoire.drapeaux },
                   completed: false, pretAt: 0, annoncee: true };
   ```
   puis y envoyer une expédition. Pour sauter le délai entre deux épisodes :
   `b.chronicle.pretAt = 0`.
8. `npm run sw:write`, `npm test`, commit.

### Ajouter une scène d'expédition

1. Choisir le fichier de `src/content/scenes/` qui correspond au lieu (ou en
   créer un et l'ajouter à `SCENES` dans `index.js`).
2. Écrire la scène avec un **titre**, un **lieu** physiquement juste, 2 à 4 choix.
3. `npm run check:content` : regarder aussi la ligne de couverture (le type de
   lieu visé gagne-t-il une scène ?).
4. `npm run sw:write`, `npm test`.

### Ajouter un événement, un incident, un fil rouge, un personnage ou une page

1. Écrire le fichier dans le bon dossier (`evenements/`, `incidents/`, `arcs/`,
   `personnages/`, `lore/`), en partant de l'exemple complet de la section 9,
   10, 11, 12 ou 13.
2. L'ajouter au sommaire `src/content/index.js` : un `import`, puis le nom dans
   `EVENEMENTS`, `INCIDENTS`, `ARCS`, `PERSONNAGES` ou `LORE`.
3. `npm run check:content` jusqu'à ce qu'il n'y ait plus d'erreur.
4. `npm run histoire -- <id> --tout` : relire le texte, chaque choix et chaque
   branche (`--monde x=…` pour voir les variantes qui dépendent de la mémoire).
5. Dans le jeu, pour voir la fenêtre tout de suite, depuis la console du navigateur :
   ```js
   const app = await import('./src/app.js');
   app.triggerColonyEvent('serre_proposition');   // un événement (condition et acteurs requis)
   app.triggerIncident('reacteur_fuite');          // un incident (module construit)
   ```
6. `npm run sw:write`, `npm test`.

## 15. Tester

- **`npm run check:content`** — le validateur. Il affiche :
  - les **erreurs** (bloquantes) : clé inconnue (une coquille dans un nom de
    champ ne passe plus en silence), référence inconnue (objet, statut, ennemi,
    scène, fin, drapeau, module, personnage, fil, page…), id en double,
    condition invalide, issue mal placée, scène ou fin inatteignable, impasse
    (aucun choix visible dans un état de drapeaux), effet impossible à la
    colonie, recrue sans `colonie.vivres_ok`, texte avec `"` ou HTML, libellé >
    60 caractères, paragraphe > 900 ;
  - les **avertissements** : 5 choix ou un seul, variante par défaut manquante… ;
  - les **notes** (`--notes`) : drapeaux jamais lus ou jamais écrits ;
  - la **couverture** (`--couverture` pour le détail) : scènes compatibles par
    type de lieu, sur des galaxies générées par le vrai générateur.
- **`npm run histoire`** — liste des histoires et du contenu de la colonie ;
  `-- <id>` pour jouer une histoire, un événement ou un incident (`--tout` :
  tous les choix et toutes les branches ; `--monde ilya_confiance=2,maud=amie`
  pour fixer des drapeaux globaux), ou lire un fil rouge ou une page d'archives ;
  `--tout` pour tous les chemins groupés par fin ; `--choix 1,2,1` pour rejouer
  une suite précise ; `--equipe science=1,sangfroid=8` pour une équipe
  différente (par défaut 3 en compétences, 6 en caractéristiques) ;
  `--objets lance_flammes` ; `--drapeaux` pour suivre les drapeaux.
- **`npm test`** — tout (lint, données, contenu, test de fumée, non-régression).

## 16. Checklist avant publication

- [ ] `npm run check:content` : aucune erreur ; avertissements lus.
- [ ] Chaque fin relue avec `npm run histoire -- <id> --tout`.
- [ ] Chaque scène : titre, lieu juste, 2 à 4 choix, un choix toujours possible.
- [ ] Les choix à prérequis sont meilleurs ou différents, jamais des pièges.
- [ ] Les textes nomment l'équipage (`{equipe.chef}`, `{acteur}`) là où c'est naturel.
- [ ] Typographie : « », pas de `"`, italique rare, phrases courtes.
- [ ] Les montants (gains, coûts) restent dans l'ordre de grandeur des scènes voisines.
- [ ] Événements et incidents : un choix toujours possible ; une recrue avec
      `colonie.vivres_ok` ; un `delai` qui évite les répétitions.
- [ ] Personnages : la même voix d'une apparition à l'autre ; la mémoire
      (`monde.*`) notée en tête du fichier.
- [ ] Archives : rien qui contredise une page ou une histoire existante.
- [ ] Aucun id publié n'a été renommé (voir section 18).
- [ ] `npm run sw:write` puis `npm test` verts ; `CHANGELOG.md` complété.

## 17. Exemple complet : le Phare noyé

Une histoire courte et complète (2 épisodes, 4 scènes, 3 fins, 1 personnage
recrutable). Elle n'est **pas** dans le jeu : c'est un modèle à copier. Elle passe
le validateur et `npm run histoire -- phare_noye --tout` y liste 48 chemins.

```js
// src/content/histoires/phare-noye.js — « Le Phare noyé », chronique courte en 2 épisodes.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'phare_noye',
  titre: 'Le Phare noyé',
  accroche: "Une balise de détresse clignote sous trente mètres d'eau. Elle répond quand on l'appelle.",

  apparition: { lieu: "corps.biome == 'ocean' && corps.signal == 'sos'", si: 'colonie.colons >= 4', chance: 0.5 },
  rythme: { entreEpisodes: '18h' },

  drapeaux: {
    confiance: 0,          // nombre : -2 à +2
    maelle: 'inconnue',    // 'inconnue' | 'rencontree' | 'blessee'
    lanterne: false,       // la lanterne a été réparée
  },

  personnages: {
    maelle: {
      nom: 'Maëlle Ternier', age: 61, pronoms: 'elle', role: 'Gardienne du phare',
      voix: 'calme, phrases courtes, humour sec',
      recrue: { competences: { survie: 3, ingenierie: 2 }, traits: ['survivant'] },
    },
  },

  fins: {
    gardienne_sauvee: { titre: 'La gardienne', texte: "Maëlle vit à {colonie}. Elle allume une lampe à sa fenêtre chaque soir, par habitude.", effets: [{ annales: 'La gardienne du Phare noyé a rejoint {colonie}.' }] },
    phare_rallume: { titre: 'La lumière', texte: 'Le phare tourne de nouveau. Sur les relevés, des épaves remontent lentement vers la surface.', effets: [{ monde: { phare_allume: true } }] },
    phare_eteint: { titre: 'Le silence', texte: "La balise s'est tue. Personne n'a demandé pourquoi." },
  },

  episodes: [
    { titre: "Le signal sous l'eau", debut: 'plateforme',
      intro: "La balise ne pulse pas au hasard : trois courts, trois longs, trois courts. En bas, quelqu'un connaît encore le code." },
    { titre: 'La lanterne', debut: 'retour',
      intro: { unParmi: [
        { si: "maelle == 'rencontree'", texte: "Maëlle t'a laissé une fréquence. Elle répond à la première note." },
        { si: "maelle == 'blessee'", texte: 'La balise s’est tue. Puis, cette nuit, une seule impulsion. Faible.' },
        { texte: "Le phare s'est rallumé seul. Personne ne l'a vu s'éteindre." },
      ] } },
  ],

  scenes: {
    plateforme: {
      titre: 'La plateforme',
      texte: [
        "{vaisseau} se pose sur une plateforme rongée de sel. Sous la surface, une tour s'enfonce dans le noir ; à son sommet immergé, une lumière clignote.",
        'Une voix grésille dans les casques : « Si vous êtes réels, frappez deux fois sur la coque. »',
      ],
      choix: [
        { label: 'Frapper deux fois',
          effets: [{ texte: '{equipe.chef} frappe. Deux coups, nets.' }, { drapeau: { confiance: '+1', maelle: 'rencontree' } }, { aller: 'cloche' }] },
        { label: 'Analyser la fréquence avant de répondre', requiert: 'equipe.science >= 2',
          effets: [{ texte: 'La voix émet depuis une cloche de plongée pressurisée, à vingt-huit mètres.' }, { gain: { datacubes: 8 } }, { drapeau: { maelle: 'rencontree' } }, { aller: 'cloche' }] },
        { label: 'Ignorer la voix et démonter la plateforme',
          effets: [{ gain: { metal: 25 } }, { drapeau: { confiance: '-2' } }, { finEpisode: true }] },
      ],
    },
    cloche: {
      titre: 'La cloche',
      texte: [
        'Dans la cloche, une femme aux cheveux blancs coupés court t’attend, assise sur une caisse. « Maëlle. Gardienne. Le phare guide encore des bateaux qui ne viendront plus. »',
        { si: 'confiance >= 1', texte: '{pnj:maelle} tend un thermos à {equipe.chef}. « Vous avez frappé. Les autres ne frappaient jamais. »' },
      ],
      choix: [
        { label: '« Venez avec nous. »', requiert: 'confiance >= 1', raison: 'Elle ne vous fait pas encore confiance',
          effets: [{ recrute: 'maelle' }, { fin: 'gardienne_sauvee' }] },
        { label: 'Réparer la lanterne avec elle',
          test: { competence: 'ingenierie', difficulte: 6,
            reussite: [{ texte: '{acteur} resserre le dernier joint. La lanterne tourne.' }, { drapeau: { lanterne: true } }, { gain: { cristal: 20 } }, { finEpisode: true }],
            echec: [{ texte: 'Un joint cède. {victime} s’entaille la main sur le verre.' }, { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } }, { drapeau: { maelle: 'blessee' } }, { finEpisode: true }] } },
        { label: 'Lui laisser des vivres et partir', cout: { biomasse: 20 },
          effets: [{ drapeau: { confiance: '+1' } }, { finEpisode: true }] },
        { label: 'Partir sans un mot', effets: [{ finEpisode: true }] },
      ],
    },
    retour: {
      titre: 'La tour',
      texte: 'La tour a changé : des coquillages neufs sur les rambardes, comme si la mer reprenait les lieux plus vite qu’avant.',
      choix: [
        { label: 'Descendre à la lanterne', effets: [{ aller: 'lanterne' }] },
        { label: 'Récupérer ce qui peut l’être et partir', effets: [{ gain: { metal: 40 } }, { fin: 'phare_eteint' }] },
      ],
    },
    lanterne: {
      titre: 'La lanterne',
      texte: [
        { unParmi: [
          { si: 'lanterne', texte: 'La lanterne que vous avez réparée tourne. Sa lumière balaie le fond : des coques, des dizaines, alignées comme dans un port.' },
          { texte: 'La lanterne est morte. Dans le noir, des coques, des dizaines, alignées comme dans un port.' },
        ] },
        { si: "maelle == 'blessee'", texte: 'Maëlle est là, une attelle à la jambe. « Ils attendent la lumière. Moi aussi. »' },
      ],
      choix: [
        { label: 'Rallumer le phare pour de bon', requiert: 'lanterne || equipe.ingenierie >= 3',
          effets: [{ gain: { datacubes: 25 } }, { objet: 'balise_signal' }, { fin: 'phare_rallume' }] },
        { label: 'Fouiller les épaves',
          test: { carac: 'vigueur', difficulte: 7,
            reussite: [{ gain: { metal: 60, cristal: 30 } }, { schema: 'humain' }, { fin: 'phare_eteint' }],
            echec: [{ texte: 'Quelque chose remonte des coques.' }, { combat: { ennemis: ['predateur_lunaire'],
              victoire: [{ gain: { metal: 30 } }, { fin: 'phare_eteint' }],
              defaite: [{ retraite: true }] } }] } },
        { label: 'Emmener Maëlle, cette fois', si: "maelle == 'blessee'",
          effets: [{ recrute: 'maelle' }, { fin: 'gardienne_sauvee' }] },
      ],
    },
  },
});
```

Ce qu'il montre : apparition conditionnée par le lieu et la colonie ; drapeau
numérique (`'+1'`, `'-2'`) et texte ; intro et texte à variantes ; paragraphe
conditionnel ; `requiert` avec raison écrite ; `si` qui cache un choix tant que
Maëlle n'est pas blessée ; test de compétence (le colon qui le passe devient
`{acteur}`) ; `{victime}` après un statut ; combat avec sa suite ; effets de fin
(`annales`, `monde`) ; personnage recrutable.

Une **suite** dans un événement de colonie s'écrit avec
`si: "histoire.phare_noye.fin == 'gardienne_sauvee'"` et `{pnj:phare_noye/maelle}`
dans les textes (section 9).

## 18. Pièges et compatibilité

- **Ne jamais renommer un id publié** (scène d'expédition, histoire, scène
  d'histoire, fin, drapeau, personnage) : les sauvegardes des joueurs les
  référencent (une expédition arrêtée sur une scène, une histoire en cours).
  Pour retirer une scène, la garder en la rendant impossible (`lieux: 'faux'`)
  le temps d'une version.
- **L'issue est le dernier effet** : `[{ aller: 'x' }, { texte: '…' }]` est refusé.
- **`si` n'est pas `requiert`** : `si` cache, `requiert` grise avec une raison.
- **Drapeau texte comparé à une valeur jamais écrite** : la branche est morte ;
  le validateur le signale.
- **`'+1'` sur un drapeau texte** : refusé.
- **Une scène sans choix toujours possible** : l'équipe peut rester coincée ;
  refusé.
- **Les ids d'événements de 0.33** (`event_marchand`) sont convertis au
  chargement d'une sauvegarde (`marchand`) : ne pas réutiliser le préfixe
  `event_`. Les ids d'incidents, de fils rouges et d'étapes (`ap_1`, `eff_3`…)
  sont ceux de 0.33 : ne pas les changer.
- **Accueillir un colon n'est jamais automatique** : un choix `recrute`
  demande `colonie.vivres_ok` et un autre choix, toujours possible, qui
  n'ajoute personne.
- **Une scène de fil rouge** (`scene` d'une étape) se marque `spontane: false`,
  sinon elle peut aussi survenir au hasard.
- **Les anciens ids de chronique** (`chron_pulsar_ep1_sas`, format 0.33) restent
  lus par le moteur pour les sauvegardes : ils correspondent aux ids actuels
  (`ep1_sas` dans `pulsar_silencieux`).

## 19. Annexe : vocabulaire

La source est `src/content/vocabulaire.js` (le validateur vérifie qu'elle
correspond aux tables du jeu).

- **Ressources** : `metal`, `cristal`, `energie`, `biomasse`, `datacubes`.
- **Compétences** (0-5) : `medecine`, `ingenierie`, `science`, `pilotage`,
  `combat`, `linguistique`, `survie`.
- **Caractéristiques** (1-10) : `vigueur`, `dexterite`, `intellect`,
  `sangfroid`, `charisme`.
- **Statuts** : `blessure_legere`, `blessure_grave`, `infection`,
  `pathogene_alien`, `trauma_psy`, `parasite`, `mutation`.
- **Cibles** : `equipe`, `equipe_hasard`, `chef`, `acteur`, `secondaire`,
  `victime`, `colonie`, `colonie_hasard`.
- **Lieux** (`corps.*`) :
  - `type` : `planete`, `lune`, `station`, `epave`, `asteroide_g` ;
  - `biome` : `toundra`, `desert`, `ocean`, `jungle`, `volcanique`, `glace`,
    `irradie`, `asteroide`, `exotique` ;
  - `atmosphere` : `respirable`, `tenue`, `toxique`, `aucune`, `anormale` ;
  - `gravite` : `micro`, `faible`, `standard`, `lourde`, `ecrasante` ;
  - `vie` : `aucune`, `microbienne`, `flore_agressive`, `faune`, `civ_dechue`,
    `civ_active` ;
  - `signal` : `aucun`, `sos`, `crypte`, `bruit_blanc`, `echo_temporel` ;
  - `ruines` : `aucune`, `humaines`, `alien_a` (cristallines), `alien_b`
    (organiques), `fusion` (humain et alien mêlés) ;
  - `danger` : `aucun`, `tempetes`, `predateurs`, `pathogene`, `faille`,
    `ia_hostile`, `anomalie`.
  - Les stations sont de biome `exotique`, sans ruines ; les épaves et
    astéroïdes n'ont pas d'atmosphère.
- **Gravité des incidents** : `mineur`, `serieux`, `critique`.
- **Acteurs d'un événement** (`acteur.x`) : `age`, `age_rond`, `moral`, `sante`,
  `role`, `libre`, `poste`, `mort`, `mort_depuis`, `affinite`, une compétence,
  `carac.x`, `trait.x` ; `parmi` : `colons`, `vivants`, `morts`.
- **Catégories d'archives** : `histoire`, `colonie`, `mondes`, `ruines`,
  `peuples`, `techniques`.
- **Onglets des objectifs** : `base`, `equipage`, `expeditions`, `recits`, `labo`.
- **Objets, traits, ennemis, modules, technologies** : leurs ids sont ceux de
  `src/catalog.js` (`ITEMS`, `TRAITS`, `ENEMY_TYPES`, `MODULES`, `TECH_TREE`).
