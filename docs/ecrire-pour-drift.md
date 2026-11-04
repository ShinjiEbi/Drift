# Écrire pour DRIFT

Guide d'écriture du contenu narratif : histoires (chroniques planétaires),
scènes d'expédition, et bientôt événements, incidents, fils rouges et lore.
On écrit des **fichiers de données** dans `src/content/`, jamais du code : le
moteur (`src/engine/narration.js`) les lit, le validateur
(`npm run check:content`) les vérifie, le lecteur (`npm run histoire`) permet de
les jouer dans un terminal.

> En bref : on écrit un fichier, on l'ajoute au sommaire `src/content/index.js`,
> on lance `npm run check:content`, puis `npm run histoire -- <id> --tout` pour
> relire chaque chemin. Quand tout est vert, on lance `npm run sw:write` et
> `npm test`, puis on publie.

## Sommaire

1. [La voix de DRIFT](#1-la-voix-de-drift)
2. [Où vit le contenu](#2-où-vit-le-contenu)
3. [Les textes](#3-les-textes)
4. [Les choix](#4-les-choix)
5. [Les effets](#5-les-effets)
6. [Les conditions](#6-les-conditions)
7. [Scènes d'expédition](#7-scènes-dexpédition)
8. [Histoires (chroniques)](#8-histoires-chroniques)
9. [Pas à pas : ajouter une histoire ou une scène](#9-pas-à-pas)
10. [Tester](#10-tester)
11. [Checklist avant publication](#11-checklist-avant-publication)
12. [Lore : Archives et Annales](#12-lore--archives-et-annales)
13. [Exemple complet](#13-exemple-complet--le-phare-noyé)
14. [Pièges et compatibilité](#14-pièges-et-compatibilité)
15. [Annexe : vocabulaire](#15-annexe--vocabulaire)

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
  evenements/ incidents/ arcs/ personnages/ factions/ lore/   (vague 2, voir leur LISEZMOI.md)
src/engine/narration.js  le moteur : conditions, textes, effets, choix
tools/check-content.mjs  le validateur        →  npm run check:content
tools/lire-histoire.mjs  le lecteur terminal  →  npm run histoire -- <id>
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
| `{pnj:adele}` | nom d'un personnage de l'histoire (`{pnj:pulsar_silencieux/adele}` ailleurs) |
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
même vocabulaire sert partout (scènes, histoires, et en vague 2 événements,
incidents, fils rouges).

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
| `drapeau` | `{ drapeau: { confiance: '+1', maelle: 'rencontree' } }` | drapeaux de l'histoire ; `'+1'`/`'-2'` seulement sur un nombre |
| `monde` | `{ monde: { phare_allume: true } }` | drapeau global, lisible partout (`monde.phare_allume`) |
| `recrute` | `{ recrute: 'adele' }` | le personnage rejoint la colonie au retour (ou attend une place) |
| `reputation` | `{ reputation: 10 }` ou `{ reputation: { faction, delta } }` | faction du lieu visité |
| `journal` | `{ journal: '…' }` | une ligne du journal de la colonie |
| `annales` | `{ annales: 'La gardienne du Phare noyé a rejoint {colonie}.' }` | mémoire de la partie (voir Lore) |
| `module` | `{ module: { id: 'hydroponie', horsService: '6h' } }` | module hors service |
| `effetTemporaire` | `{ effetTemporaire: { titre: 'Climat de méfiance', prod: 0.85, duree: '2j' } }` | multiplie la production |
| `incident` | `{ incident: { id: 'fuite_reacteur', dans: '2h' } }` | incident plus tard |
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

## 9. Pas à pas

### Ajouter une histoire

1. Copier l'exemple de la section 13 dans `src/content/histoires/mon-histoire.js`
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

## 10. Tester

- **`npm run check:content`** — le validateur. Il affiche :
  - les **erreurs** (bloquantes) : clé inconnue (une coquille dans un nom de
    champ ne passe plus en silence), référence inconnue (objet, statut, ennemi,
    scène, fin, drapeau…), condition invalide, issue mal placée, scène ou fin
    inatteignable, impasse (aucun choix visible dans un état de drapeaux),
    texte avec `"` ou HTML, libellé > 60 caractères, paragraphe > 900 ;
  - les **avertissements** : 5 choix ou un seul, variante par défaut manquante… ;
  - les **notes** (`--notes`) : drapeaux jamais lus ou jamais écrits ;
  - la **couverture** (`--couverture` pour le détail) : scènes compatibles par
    type de lieu, sur des galaxies générées par le vrai générateur.
- **`npm run histoire`** — liste des histoires ; `-- <id>` pour jouer ;
  `--tout` pour tous les chemins groupés par fin ; `--choix 1,2,1` pour rejouer
  une suite précise ; `--equipe science=1,sangfroid=8` pour une équipe
  différente (par défaut 3 en compétences, 6 en caractéristiques) ;
  `--objets lance_flammes` ; `--drapeaux` pour suivre les drapeaux.
- **`npm test`** — tout (lint, données, contenu, test de fumée, non-régression).

## 11. Checklist avant publication

- [ ] `npm run check:content` : aucune erreur ; avertissements lus.
- [ ] Chaque fin relue avec `npm run histoire -- <id> --tout`.
- [ ] Chaque scène : titre, lieu juste, 2 à 4 choix, un choix toujours possible.
- [ ] Les choix à prérequis sont meilleurs ou différents, jamais des pièges.
- [ ] Les textes nomment l'équipage (`{equipe.chef}`, `{acteur}`) là où c'est naturel.
- [ ] Typographie : « », pas de `"`, italique rare, phrases courtes.
- [ ] Les montants (gains, coûts) restent dans l'ordre de grandeur des scènes voisines.
- [ ] Aucun id publié n'a été renommé (voir section 14).
- [ ] `npm run sw:write` puis `npm test` verts ; `CHANGELOG.md` complété.

## 12. Lore : Archives et Annales

Le lore arrive en vague 2 ; sa place est déjà prévue.

- **Archives** (`src/content/lore/`) : des pages écrites à l'avance (le monde,
  l'Effondrement, la xénologie, la colonie…), débloquées par une condition du
  mini-langage : une fin d'histoire (`histoire.pulsar_silencieux.terminee`), un
  drapeau global (`monde.phare_allume`), un compteur
  (`compteur.chroniques_terminees >= 3`). Même format de texte que les scènes.
  Écrire une page = un fichier `lore({ id, titre, categorie, si, texte })`
  ajouté au sommaire (`LORE`). Voir `src/content/lore/LISEZMOI.md`.
- **Annales** : la mémoire de *cette* partie, qui se remplit toute seule —
  fondations, morts, fins de chroniques (le moteur y écrit la fin de chaque
  histoire) — et par l'effet `{ annales: '…' }`. Une bonne ligne d'Annales est
  une phrase au passé, datée par le jeu : « La gardienne du Phare noyé a rejoint
  l'Avant-poste. »
- **Cohérence** : avant d'écrire, relire les accroches et fins des histoires
  existantes ; un fait établi (l'Effondrement, les ruines de type A cristallines
  et de type B organiques, les « Présents » de Beth) ne se contredit pas. Une
  histoire peut faire écho à une autre avec `histoire.<id>.fin` ou `monde.*`.

## 13. Exemple complet : le Phare noyé

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

Une **suite** dans un événement de colonie (vague 2) pourra s'écrire avec
`si: "histoire.phare_noye.fin == 'gardienne_sauvee'"` et le personnage
`'phare_noye/maelle'` comme acteur.

## 14. Pièges et compatibilité

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
- **Les anciens ids de chronique** (`chron_pulsar_ep1_sas`, format 0.33) restent
  lus par le moteur pour les sauvegardes : ils correspondent aux ids actuels
  (`ep1_sas` dans `pulsar_silencieux`).

## 15. Annexe : vocabulaire

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
- **Objets, traits, ennemis, modules, technologies** : leurs ids sont ceux de
  `src/catalog.js` (`ITEMS`, `TRAITS`, `ENEMY_TYPES`, `MODULES`, `TECH_TREE`).
