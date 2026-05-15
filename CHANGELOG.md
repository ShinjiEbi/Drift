# CHANGELOG

## 0.25.0 — Rééquilibrage économique + 6 modules tier 2

Refonte complète des coûts et productions, et ajout d'un mid-game profond
via 6 nouveaux modules débloqués par recherches.

### Nouvelles formules de progression

**Courbe triangulaire au lieu de quadratique** :
- Coût ancien : `cost = base * l²` (ratio niv 1→6 : ×36)
- Coût nouveau : `cost = base * l*(l+1)/2` (ratio niv 1→6 : ×21)

**Bonus de paliers** (production effective) :
- Niv 1-2 : ×1.0 (base)
- Niv 3-4 : ×1.2 (+20% bonus palier)
- Niv 5-6 : ×1.4 (+40% bonus palier)
- Niv 7+   : ×1.6 (+60% bonus palier)

Résultat concret pour la mine de surface :
- Niv 1 : coût 50M → prod 5M/min (amorti en 17 min jeu, au lieu de 26)
- Niv 6 : coût 1050M → prod 42M/min (amorti en 37 min jeu, au lieu de 160)

**Monter en niveau redevient rentable à toutes les étapes.**

### Corrections de déséquilibres ressources

- **Cristal** : mine produit `4*l` au lieu de `2*l` (doublé)
- **Énergie** : générateur solaire passe de `6*l+2*(l-1)` à `8*l+2*(l-1)` (+33%)
- **Datacubes** : labo passe de `1*l` à `1.5*l` brut (+50%)
- **Coût cristal du labo** : divisé par 2 (était hors-norme : 3600 cristal niv 6)

### 6 NOUVEAUX MODULES TIER 2 (débloqués par recherches)

**Mine profonde** (tech_mining_advanced)
- Prereq : commandement 3, mine_surface 3, atelier 1
- Coût base : 267M 133C 100E · 72min
- Prod : +25 metal/min, +15 cristal/min (3x une mine niv 1)
- Conso : -15 energie/min, -5 biomasse/min
- Niveau max : 4

**Réacteur à fusion** (nouvelle tech_fusion)
- Prereq : commandement 3, generateur_solaire 4
- Coût base : 333M 267C 30D · 108min
- Prod : +50 energie/min (5x un gé. solaire niv 1)
- Conso : -10 biomasse, -2 cristal /min (eau lourde + réfrigérant)
- Niveau max : 3
- **Résout définitivement le goulot énergie**

**Bioréacteur** (nouvelle tech_bioreacteur)
- Prereq : commandement 3, hydroponie 3, laboratoire 2
- Coût base : 200M 167C 30B · 90min
- Prod : +20 biomasse/min, +1 datacube/min (production hybride)
- Conso : -10 energie/min
- Niveau max : 3

**Synthétiseur quantique** (tech_stockage_quantique existante)
- Prereq : commandement 4, atelier 3, laboratoire 3
- Coût base : 1200M 1000C 50D · 144min
- Effet : conversion ressources via UI (à implémenter en 0.25.1)
- Conso : -20 energie/min
- Niveau max : 2

**Silo cryogénique** (tech_stockage_cryo existante)
- Prereq : commandement 2
- Coût base : 133M 67C · 54min
- Effet : +500 cap metal, +400 cap cristal, +200 cap biomasse (par niveau)
- Conso : -2 energie/min
- Niveau max : 4
- **Résout le goulot stockage**

**Mémoire cristalline** (nouvelle tech_memoire_cristalline)
- Prereq : commandement 3, laboratoire 3
- Coût base : 167M 200C 20 datacubes alien · 90min
- Effet : +200 cap datacubes, +10% vitesse recherche (par niveau)
- Conso : -5 energie/min
- Niveau max : 3
- **Accélère la recherche en endgame**

### 3 nouvelles techs tier 3 (pour débloquer)

| Tech | Branche | Coût | Prereq | Débloque |
|---|---|---|---|---|
| tech_fusion | ingénierie | 150 DC | eff. solaire + batteries | Réacteur à fusion |
| tech_bioreacteur | bio | 120 DC | nutrition + hydro avancée | Bioréacteur |
| tech_memoire_cristalline | exotique | 150 DC + 15 alien | xeno + voilure cristal | Mémoire cristalline |

Total : **31 techs** au lieu de 28.

### Nouvelles propriétés MODULES

Pour soutenir les modules tier 2, le format MODULES gère :
- `tier: 2` — marqueur visuel (UI à enrichir)
- `requireTech: 'tech_xxx'` — verrouille jusqu'à recherche complétée
- `capBonus: l => {...}` — augmente cap stockage (silo, mémoire)
- `researchSpeedBonus: l => 0.10` — accélère recherche (mémoire)

Nouvelles propriétés cost :
- `datacubes_alien` — ressource exotique (S.alienDatacubes)

### Câblage technique

- `canBuild()` : checks `requireTech` + ressource `datacubes_alien`
- `startBuild()` : consomme `datacubes_alien` correctement
- `capOf()` : agrège les `capBonus` de tous les modules construits
- `tickResearch()` : multiplie progress par `researchSpeedBonus` cumulé

### Compatibilité

Aucune migration nécessaire. Les saves restent compatibles :
- Modules construits gardent leur niveau actuel
- Coûts des prochaines constructions/upgrades suivent les nouvelles formules
- Modules tier 2 deviennent disponibles si vous avez déjà les techs requises

### Tests

✓ 18 modules total (12 tier 1 + 6 tier 2)
✓ 31 techs total (28 + 3 nouvelles)
✓ canBuild bloque sans tech, ouvre avec tech
✓ Silo : +500 cap métal validé
✓ Mine niv 1→6 : courbe douce confirmée (×21 coût pour ×8.5 prod)
✓ Tick fonctionnel sans erreur
✓ Régression chroniques : 0 lien cassé

### À venir (0.25.1+)

- UI dédiée pour le synthétiseur quantique (échange de ressources)
- Indicateurs visuels "tier 2" dans la liste des modules
- Badge "verrouillé jusqu'à : Tech X" sur les modules tier 2 non débloqués

## 0.24.2 — Hardening (3 passes debug)
## 0.24.1 — PWA installable
## 0.24.0 — Chroniques planétaires
