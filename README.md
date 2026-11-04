# DRIFT — Avant-poste

Jeu narratif de gestion de colonie spatiale. Application web (PWA) en
JavaScript vanilla, modules ES, **sans build** : les fichiers du dépôt sont
servis tels quels.

## Structure

```
index.html               squelette HTML (en-tête, onglets, vues, modale)
styles.css               toute la mise en forme
manifest.json            manifeste PWA
sw.js                    service worker (cache hors-ligne versionné)
fonts/                   polices hébergées localement (Newsreader, JetBrains Mono, licences OFL)
icons/                   icônes PWA
src/
  constants.js           VERSION, multiplicateurs, libellés
  util.js                RNG seedé, $/$$, formats, esc() (échappement HTML), uid()
  catalog.js             données : MODULES, VESSELS, ITEMS, BLUEPRINTS, TECH_TREE,
                         FABRICATIONS, BIOMES, TRAITS, ENEMY_TYPES… (SCENES : réexport du contenu)
  content/               contenu narratif en données pures (histoires, scènes d'expédition ;
                         événements, incidents, fils rouges, lore en vague 2) — voir
                         docs/ecrire-pour-drift.md
  engine/narration.js    moteur narratif : conditions (mini-langage), textes, effets, choix
  chronicles.js          passerelle vers les histoires de content/histoires/
  data-arcs-factions.js  ARCS et FACTION_TYPES
  state.js               état S, temps de jeu, sauvegarde, migrations, galaxie
  app.js                 logique : postes, médical, recherche, incidents, événements,
                         arcs, diplomatie, expéditions, combat, démarrage
  ui.js                  coquille : en-tête, 5 onglets (Base, Équipage, Expéditions,
                         Récits, Labo), alertes, toasts, menu « ⋯ », fenêtres,
                         écran de scène, combat, lancement d'expédition
  views/                 une vue par onglet (base, equipage, expeditions, recits, labo)
                         et common.js (formats, appels tolérants à app.js)
  objectives.js          objectifs du tableau de bord (3 au plus, avec leur action)
  notifications.js       notifications système
  pwa.js                 enregistrement du service worker, bandeau de mise à jour,
                         bouton d'installation
tools/                   outils de développement (voir « Tests »)
```

`app.js`, `state.js` et `ui.js` s'importent mutuellement. Les modules ES le
permettent grâce aux *live bindings* ; `boot()` est différé pour s'exécuter
une fois tous les modules évalués.

La page applique une politique de sécurité (CSP) : pas de script inline, pas
d'attribut `on…=`, pas de ressource externe. Toute chaîne venant de la
sauvegarde (noms de colons, factions, systèmes…) doit passer par `esc()` avant
d'être insérée en HTML.

## Lancer en local

Il faut un serveur HTTP (les modules ES ne marchent pas en `file://`).

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Ou `npx serve`, ou l'extension VS Code « Live Server ».

## Tests

Les outils de développement ont besoin de Node 22 et de `npm ci`
(le jeu lui-même n'en dépend pas).

```sh
npm ci
npm run lint          # ESLint (variables non définies, clés en double…)
npm run check:data    # références croisées des données (items, techs, modules…)
npm run check:content # contenu narratif : schéma, références, graphe des histoires, typographie
npm run sw:check      # le cache hors-ligne correspond bien aux fichiers publiés
npm run smoke         # test de fumée dans Chromium : onglets, 10 jours simulés, rechargement
npm run test:regress  # tests de non-régression (tools/regress/)
npm test              # tout ce qui précède
```

Pour écrire du contenu (histoires, scènes) : `docs/ecrire-pour-drift.md`, et
`npm run histoire -- <id>` pour jouer une histoire dans le terminal (`--tout`
liste tous les chemins jusqu'à chaque fin).

`smoke` et `test:regress` utilisent Playwright, qui n'est pas une dépendance
du projet : installez-le avec `npm i --no-save playwright && npx playwright install chromium`,
ou pointez `NODE_PATH` vers une installation globale.

La CI GitHub (`.github/workflows/tests.yml`) lance `npm test` à chaque push.

## Publier une version

1. Incrémenter `VERSION` dans `src/constants.js` et compléter `CHANGELOG.md`.
2. Lancer `npm run sw:write`. **Obligatoire après toute modification d'un
   fichier publié** (src/, index.html, styles.css, manifeste, icônes, polices) :
   la version du cache hors-ligne est calculée à partir du contenu des fichiers.
   Sans cela, les joueurs gardent l'ancienne version.
3. Lancer `npm test`.
4. Commiter `sw.js` avec le reste, puis pousser.

Côté joueur, la nouvelle version se télécharge en arrière-plan, puis un
bandeau propose « Recharger ». S'il l'ignore, elle s'applique au prochain
lancement complet de l'app.

## Déploiement

GitHub Pages : le dépôt est publié tel quel (https://shinjiebi.github.io/Drift/).

## Sauvegarde

- Stockée dans `localStorage` sous la clé `drift_save_v1`, à chaque fin de
  tick automatique (toutes les 10 s) et à la fermeture de la page.
- `meta.schemaVersion` numérote le format. Les migrations (`migrate()` dans
  `state.js`) sont ordonnées et appliquées au chargement **et** à l'import.
- Avant toute migration, et si une sauvegarde est illisible, une copie brute
  est gardée sous `drift_save_v1_backup_<horodatage>` (3 au plus). Une
  sauvegarde illisible n'est jamais écrasée : le joueur choisit entre
  l'exporter, en importer une autre ou recommencer.
- Les chaînes chargées ou importées sont assainies (pas de `<`, `>`, `"` ;
  le journal ne garde que `em/strong/b/i/br`).
- Un seul onglet peut faire tourner la partie : un deuxième onglet ouvert
  passe en lecture seule.

## Temps de jeu

Le jeu se joue en temps réel : **1 tick = 1 seconde réelle** (`S.meta.gameMin`
compte les ticks, nom historique). Toutes les durées (chantiers, recherche,
expéditions, soins, incidents, recrutement, vieillissement…) sont définies dans
la table `PACING` de `src/constants.js`, source unique du rythme ; « Jour N »
compte les jours réels depuis la fondation (`calendarOf()` dans `state.js`).

Le temps écoulé pendant que l'onglet est caché ou l'app fermée est rattrapé au
retour (12 h au plus), par tranches, avec une barre de progression. Pendant ce
rattrapage, seuls les incidents mineurs sont résolus automatiquement ; les
incidents sérieux et les événements attendent le joueur dans la file des
décisions (3 au plus). Les chantiers (file de 3) et la recherche (1 en file)
continuent, l'infirmerie soigne seule si un soignant est en poste, et un
rapport « Reprise du contact » raconte l'absence.

Outils de réglage :

```sh
node tools/check-economy.mjs                  # aucun coût au-dessus du stockage atteignable
node tools/sim.mjs --scenario regulier --seed 1 --out r.json   # bot joueur (actif, regulier, rare)
node tools/sim.mjs --report r1.json r2.json   # tableau comparatif
```
