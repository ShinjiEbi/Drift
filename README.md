# DRIFT — Avant-poste

Jeu narratif de gestion de colonie spatiale, single-page app HTML/JS vanilla.

## Structure (modularisée R4)

```
drift/
├── index.html              ← squelette HTML minimal (232 l.)
├── styles.css              ← tout le CSS (3581 l.)
├── src/
│   ├── constants.js        ← VERSION, multiplicateurs, libellés (83 l.)
│   ├── util.js             ← RNG, $, $$, fmt, fmtMin (66 l.)
│   ├── catalog.js          ← MODULES, VESSELS, ITEMS, BLUEPRINTS,
│   │                          TECH_TREE, FABRICATIONS, SCENES,
│   │                          BIOMES, TRAITS, etc. (1912 l.)
│   ├── data-arcs-factions.js  ← ARCS, FACTION_TYPES (253 l.)
│   ├── state.js            ← S, freshState, save, load, migrations,
│   │                          galaxie, candidats, tickOnce (973 l.)
│   ├── ui.js               ← render() et toutes les vues +
│   │                          modales, helpers DOM, log, toast (3136 l.)
│   └── app.js              ← logique de domaine (jobs, modules,
│                              ressources, médical, expéditions,
│                              événements, arcs, factions) (4096 l.)
└── README.md
```

**Modules ES** avec imports/exports propres. Pas de build, pas de
npm, juste un serveur HTTP local pour le dev.

## Lancer en local

**VS Code Live Server** (recommandé)
1. Installer l'extension `Live Server` (Ritwick Dey)
2. Clic droit sur `index.html` → "Open with Live Server"

**Python** (terminal)
```sh
cd drift
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

**Node.js** (terminal)
```sh
npx serve drift
```

## Déploiement

GitHub Pages : pousse le dossier `drift/` tel quel. Les modules ES
sont servis correctement par n'importe quel serveur web statique.

## Sauvegarde

Les saves sont stockées dans `localStorage` sous la clé `drift_save_v1`.
Migration automatique entre versions au chargement.

## Architecture

Découpage final en 7 modules JS :

- **constants.js** — constantes scalaires (VERSION, multiplicateurs,
  libellés)
- **util.js** — helpers purs : PRNG seedé, alias DOM, formatters
- **catalog.js** — données statiques : MODULES, VESSELS, ITEMS,
  BLUEPRINTS, TECH_TREE, FABRICATIONS, SCENES (73), BIOMES, TRAITS, etc.
- **data-arcs-factions.js** — données ARCS et FACTION_TYPES
- **state.js** — état du jeu (S exposé en var pour hoisting compatible
  avec les imports circulaires), persistance, migrations, génération
  de galaxie, candidats, vieillissement, tickOnce
- **ui.js** — render(), toutes les vues (renderOverview, renderModules,
  renderCrew, etc.), modales, log, toast, hookXxx pour les events
- **app.js** — logique de domaine : jobs, modules, ressources,
  fabrication, médical, expéditions, événements, arcs, factions

**Dépendances circulaires** : app.js, state.js et ui.js s'importent
mutuellement. Les modules ES gèrent ça via les *live bindings* — chaque
import est une référence dynamique. `boot()` est différé via
`DOMContentLoaded` ou `setTimeout(boot, 0)` pour s'exécuter après que
tous les modules soient évalués.

## Pour continuer la modularisation

Le module `app.js` (4096 lignes) contient encore plusieurs responsabilités
mélangées qui pourraient être extraites :
- **expedition.js** : lancement, scènes, choices (~1500 l.)
- **events.js** : incidents + colony events (~1500 l.)
- **arcs.js** + **factions.js** : logique narrative (~700 l.)
- **medical.js** : statuts, traitements, séquelles (~400 l.)

Mais l'étape R4 est suffisante pour permettre d'ajouter des features
sans naviguer dans le fichier monolithique d'origine.
