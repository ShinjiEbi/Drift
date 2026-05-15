# CHANGELOG

## 0.24.1 — PWA installable

DRIFT est maintenant une **Progressive Web App** installable sur Android,
iOS et desktop. Une fois installé, le jeu apparaît comme une vraie app
dans le menu, démarre en plein écran (sans barre de navigateur), et
fonctionne **hors ligne** une fois chargé une fois.

### Comment installer

**Android (Chrome, Edge, Samsung Internet)** :
- Une fois sur la page, un bouton ⤓ apparaît dans le bandeau du haut
- Sinon, menu navigateur ⋮ → "Installer l'application" ou "Ajouter à l'écran d'accueil"
- L'icône DRIFT apparaît sur l'écran d'accueil
- Premier lancement nécessite la connexion, ensuite tout marche offline

**iOS (Safari)** :
- Bouton Partager 🔝 → "Sur l'écran d'accueil"
- L'icône DRIFT apparaît avec le titre

**Desktop (Chrome, Edge)** :
- Icône d'installation dans la barre d'adresse (à droite de l'URL)

### Nouveautés techniques

- `manifest.json` : déclaration PWA avec 10 tailles d'icônes (16 → 512 px)
  + 2 versions "maskable" pour Android
- `sw.js` (Service Worker) : cache-first sur les assets statiques + fallback
  offline. La version du cache est `drift-v0.24.1`, à bump à chaque release
  pour invalider les caches obsolètes
- Meta tags iOS complets : `apple-touch-icon`, `apple-mobile-web-app-capable`,
  status bar translucide
- Favicons multi-résolutions (16/32/48 + ICO)
- Bouton ⤓ dans le header pour proposer l'installation sur les navigateurs
  qui supportent `beforeinstallprompt`
- Safe area iOS gérée (`env(safe-area-inset-bottom)`) pour les iPhones
  avec encoche

### Icône

Icône DRIFT 2D générée à partir de l'illustration fournie : station/colonie
en premier plan, planète à anneaux + vaisseau en vol, palette nuit/ambre.
Compatible Android adaptive icon (zone de sécurité 80%) et iOS rounded.

## 0.24.0 — Chroniques planétaires (voir précédentes notes)
