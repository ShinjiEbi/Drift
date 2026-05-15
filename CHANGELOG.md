# CHANGELOG

## 0.24.2 — Fix critique + 3 passes de hardening

### Bug critique corrigé (passe 0)
**Régression de modularisation** : 17 fonctions `tickXxx` / `finishXxx`
définies dans `app.js` étaient appelées depuis `state.js` sans être ni
exportées ni importées. Sur PC ça marchait par chance ; sur PWA installée,
le tick plantait silencieusement → horloge bloquée, bâtiments figés.
Toutes exportées et importées proprement.

### Passe 1 — Régressions de modularisation similaires
5 références fragiles supplémentaires détectées et corrigées :
- `state.js` → `autoAssignAllFreeMembers`, `autoAssignMember`, `showModal`
- `data-arcs-factions.js` → `S`, `BLUEPRINTS`, `isTechCompleted`, `aliveCrew`

### Passe 2 — Stress tests
- 1440 ticks consécutifs (24h jeu) : 0 erreur
- 1000 ticks en conditions dégradées : 0 erreur
- Watchdog n'a pas eu à intervenir

### Passe 3 — Robustesse aux données dégradées
- `progressMemberStatuts` sécurisé contre `member.statuts === undefined`
  (auto-initialisation `member.statuts = []`)
- `ui.js` sécurisé : `(m.statuts || [])` au lieu de `m.statuts` à 2 endroits

### Robustesse globale
- Boot avec try/catch sur chaque étape critique
- `safeTick` wrapper qui capture les exceptions
- Watchdog 5sec : relance le tick si gel détecté
- Logs explicites au démarrage et en cas d'erreur

## 0.24.1 — PWA installable
## 0.24.0 — Chroniques planétaires
