# CHANGELOG

## 0.26.1 — Polish notifications + tier 2 visibles + synthétiseur

Cycle de finition qui boucle proprement les deux features récentes
(notifications 0.26 + modules tier 2 0.25) et débloque le module
synthétiseur quantique qui attendait depuis 0.25.

### 5 nouveaux hooks notifs

- **Blueprint découvert** (`success`) : "Schéma découvert : Module de stockage"
- **Séquelle gagnée** (`warn`) : "Voronova : séquelle permanente — Cécité partielle"
- **Réputation seuil** (`success`/`warn`/`critical` selon sens) : "Pèlerins est désormais Ami"
- **Événement de colonie** (`warn`) : "Banquet de fortune" (notif en plus de la modale)
- **Capacité saturée** (`warn`) : "Stocks saturés : Métal" — avec anti-spam intelligent

L'anti-spam capacité saturée : dès qu'on atteint le plafond avec une
production positive, une notif est envoyée. Plus aucune notification
de saturation pour cette ressource pendant 12h-jeu, sauf si le stock
redescend sous 90% du cap puis resature (cycle complet).

### Modules tier 2 enfin visibles dans l'UI

- **Badge "TIER 2"** : pastille ambrée dans le titre du module
- **Verrouillage tech visuel** : `🔒 Requiert : Confinement à fusion` à la
  place du bouton Construire
- **Support coût `datacubes_alien`** : affichage correct du coût en
  datacubes alien (mémoire cristalline) avec lecture depuis `S.alienDatacubes`

### Synthétiseur quantique opérationnel

Quand tu construis le module (débloqué par `tech_stockage_quantique`),
un bandeau ambré apparaît sous la liste des modules. Bouton "Convertir"
→ modale dédiée avec liste des conversions.

**Recettes disponibles** :
- Niveau 1 (3 recettes) :
  - 20 Métal → 10 Cristal (−5 énergie)
  - 20 Cristal → 30 Métal (−5 énergie)
  - 15 Biomasse → 25 Métal (−8 énergie)
- Niveau 2 (3 recettes en plus) :
  - 25 Biomasse → 5 Datacubes (−12 énergie)
  - 5 Datacubes → 60 Cristal (−10 énergie)
  - 20 Cristal → 25 Biomasse (−10 énergie)

Chaque conversion respecte le cap de stockage. Recettes désactivées
visuellement si tu n'as pas les ressources ou l'énergie.

### Son discret pour notifs critiques

Web Audio API natif (pas de fichier audio à charger) :
- **Critique** : 2 bips sci-fi (660Hz → 440Hz, courts et descendants)
- **Warn** : 1 bip aigu doux (880Hz, très court)
- **Info / Success** : silencieux

Le son ne joue que si l'utilisateur a déjà interagi avec la page
(politique navigateur). Aucune permission supplémentaire requise.

### Tests

✓ 5 nouveaux hooks notifs validés en runtime
✓ Anti-spam capacité saturée : 1 notif par épisode de saturation
✓ Modules tier 2 affichent bien le badge et le verrouillage tech
✓ Synthétiseur : modale fonctionnelle, conversions appliquées, cap respecté
✓ 1440 ticks (24h jeu) sans erreur
✓ Tous les modules JS syntaxiquement valides

### Statut hooks notifs

Le système couvre maintenant **18 événements** :
- 5 ajoutés en 0.26.1 (blueprint, séquelle, réputation, événement, cap)
- 13 préexistants en 0.26.0 (construction, recherche, formation, soin,
  mort, candidat, recrutement, retour expé, incident, 3 hooks chroniques)

## 0.26.0 — Système de notifications + push natives
## 0.25.0 — Rééquilibrage économique + 6 modules tier 2
## 0.24.2 — Fix critique horloge + 3 passes hardening
## 0.24.1 — PWA installable
## 0.24.0 — Chroniques planétaires
