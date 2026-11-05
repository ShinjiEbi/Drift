// catalog.js — données statiques du jeu (modules, vaisseaux, items, schémas, techs, scènes...)
// Extrait depuis app.js lors de la phase de modularisation

// ============================================================
//   FORMULES ÉCONOMIQUES DE PROGRESSION (0.25.0)
// ============================================================
// Courbe TRIANGULAIRE pour les coûts (au lieu de quadratique brutal) :
//   triCost(l) = l*(l+1)/2 → 1, 3, 6, 10, 15, 21 (ratio max ×21 au lieu de ×36)
// Bonus de production par palier :
//   stepBonus(l) = 1.0 si l≤2, 1.2 si l∈[3..4], 1.4 si l∈[5..6], 1.6 si l≥7
//   → monter en niveau devient économiquement intéressant à chaque palier
// Ces formules sont utilisées dans les cost: et prod: ci-dessous.
import { PACING } from './constants.js';
import { fmtDuree } from './util.js';

const triCost = l => l * (l + 1) / 2;
// Durée d'un chantier (secondes réelles) : base × croissance^(niveau − 1), cf. PACING.
const buildCurve = id => l => Math.round((PACING.BUILD_BASE[id] ?? PACING.BUILD_BASE_DEFAULT) * Math.pow(PACING.BUILD_GROWTH, l - 1));
const stepBonus = l => l <= 2 ? 1.0 : l <= 4 ? 1.2 : l <= 6 ? 1.4 : 1.6;

export const MODULES = {
  // ============================================================
  //   MODULES DE BASE (tier 1)
  // ============================================================
  commandement: {
    nom: 'Centre de commandement',
    desc: "Cœur logique de l'avant-poste. Sa survie conditionne la nôtre.",
    maxLevel: 5,
    cost: l => ({ metal: 80*triCost(l), cristal: 40*triCost(l) }),
    time: buildCurve('commandement'),
    prereq: () => ({}),
    // V1 : un filet de métal et de cristal (récupération, recyclage) — aucune
    // ouverture ne peut plus bloquer la partie faute de mine. Pas d'entretien.
    // prodFixed : unités par HEURE RÉELLE (non indexées sur PROD_MULT, sans personnel).
    // Rations de la capsule : 25 biomasse/h couvrent à peu près les salaires de
    // l'équipage de départ. Simulation d'un joueur qui passe deux fois par jour :
    // sans elles, la biomasse tombait à zéro dès le premier jour (moral à 0,
    // soins impayés, morts).
    prodFixed: () => ({ metal: 250, cristal: 150, biomasse: 25 }),
    // V1 : les couchettes de la capsule d'atterrissage logent l'équipage de départ
    // (3 colons) et un premier renfort ; l'Habitat prend le relais.
    capCrew: () => 4,
    effect: () => `+250 métal · +150 cristal · +25 biomasse /h (récupération, rations) · 4 couchettes · débloque les autres modules`
  },
  generateur_solaire: {
    nom: 'Générateur solaire',
    desc: "Voilures photovoltaïques tendues sur la roche. Silence et lumière.",
    maxLevel: 8,
    cost: l => ({ metal: Math.round(30*triCost(l)), cristal: Math.round(15*triCost(l)) }),
    time: buildCurve('generateur_solaire'),
    prereq: l => l===1 ? {} : { commandement: 1 },
    // 0.25 : énergie de base relevée +33% (8 au lieu de 6)
    prod: l => ({ energie: Math.round((8*l + 2*(l-1)) * stepBonus(l)) }),
    // V1 : chaque niveau agrandit les accumulateurs
    capBonus: l => ({ energie: 80*l }),
    effect: l => `+${Math.round((8*l + 2*(l-1)) * stepBonus(l))} énergie/min · +${80*l} stockage d'énergie`
  },
  mine_surface: {
    nom: 'Mine de surface',
    desc: "Extraction des veines affleurantes. Bruit constant, vibrations.",
    maxLevel: 8,
    cost: l => ({ metal: Math.round(50*triCost(l)), cristal: Math.round(20*triCost(l)) }),
    time: buildCurve('mine_surface'),
    prereq: () => ({ commandement: 1 }),
    // 0.25 : prod cristal doublée (4 au lieu de 2)
    prod: l => ({
      metal: Math.round(5*l * stepBonus(l)),
      cristal: Math.round(4*l * stepBonus(l))
    }),
    upkeep: l => ({ energie: 2*l }),
    // V1 : chaque niveau ajoute des aires de stockage du minerai
    capBonus: l => ({ metal: 200*l, cristal: 150*l }),
    effect: l => `+${Math.round(5*l * stepBonus(l))} métal · +${Math.round(4*l * stepBonus(l))} cristal /min · −${2*l} énergie · stockage +${200*l} métal, +${150*l} cristal`
  },
  hydroponie: {
    nom: 'Hydroponie',
    desc: "Bacs scellés, lampes UV, mousses comestibles. L'odeur s'accroche aux vêtements.",
    maxLevel: 6,
    // 0.27.2 : niv 1 gratuit en biomasse (les graines suffisent). Niv 2+ : 10*(l-1) biomasse.
    cost: l => ({
      metal: Math.round(60*triCost(l)),
      cristal: Math.round(30*triCost(l)),
      biomasse: l > 1 ? 10*(l-1) : 0
    }),
    time: buildCurve('hydroponie'),
    prereq: () => ({ commandement: 1 }),
    // 0.27.2 : prod doublée (8*l au lieu de 4*l) pour qu'hydroponie niv 1
    // soit autosuffisante même sans staff affecté (sinon JOB_BASE_FRACTION 30%
    // la rend déficitaire vs upkeep habitat).
    prod: l => ({ biomasse: Math.round(8*l * stepBonus(l)) }),
    upkeep: l => ({ energie: 3*l }),
    capBonus: l => ({ biomasse: 100*l }),
    effect: l => `+${Math.round(8*l * stepBonus(l))} biomasse/min · −${3*l} énergie · stockage +${100*l} biomasse`
  },
  habitat: {
    nom: 'Habitat',
    desc: "Couchettes empilées, cloisons fines, vapeurs de café synthétique. S'agrandit et se densifie à mesure que la colonie prospère.",
    maxLevel: 8,
    cost: l => ({ metal: Math.round(90*triCost(l)), cristal: Math.round(40*triCost(l)), biomasse: 5*l }),
    time: buildCurve('habitat'),
    prereq: () => ({ commandement: 1 }),
    capCrew: l => [0, 8, 20, 36, 56, 80, 108, 140, 176][l] || 0,
    capBonus: l => ({ metal: 100*l, biomasse: 50*l }),   // V1 : réserves et magasins
    upkeep: l => ({ energie: 1*l, biomasse: 2*l }),
    effect: l => `+${[0,8,20,36,56,80,108,140,176][l]||0} places · stockage +${100*l} métal, +${50*l} biomasse · −${1*l} énergie · −${2*l} biomasse`
  },
  laboratoire: {
    nom: 'Laboratoire',
    desc: "Banc d'analyse spectrale, hotte à flux laminaire, écrans figés sur des spectres.",
    maxLevel: 6,
    // 0.25 : coût cristal divisé par 2 (50*tri au lieu de 100*l²)
    cost: l => ({ metal: Math.round(100*l), cristal: Math.round(50*triCost(l)), datacubes: l>1 ? 5*l : 0 }),
    time: buildCurve('laboratoire'),
    prereq: () => ({ commandement: 2 }),
    // 0.25 : prod datacubes augmentée 50% (1.5*l au lieu de 1*l brut → 0.75 effectif)
    prod: l => ({ datacubes: Math.round(1.5*l * stepBonus(l)) }),
    upkeep: l => ({ energie: 5*l }),
    capBonus: l => ({ datacubes: 60*l }),
    flag: 'recherche',
    effect: l => `+${Math.round(1.5*l * stepBonus(l))} datacube/min · −${5*l} énergie · stockage +${60*l} datacubes · débloque la recherche`
  },
  atelier: {
    nom: 'Atelier',
    desc: "Imprimantes, étaux, copeaux. Tout ce qui se casse finit ici.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(150*l), cristal: Math.round(60*l) }),
    time: buildCurve('atelier'),
    prereq: () => ({ commandement: 2 }),
    upkeep: l => ({ energie: 3*l }),
    flag: 'fabrication',
    effect: l => `Permet la fabrication d'items et d'équipement`
  },
  hangar: {
    nom: 'Hangar',
    desc: "Voûte ouverte sur le ciel. Le sas grince à chaque cycle.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(200*l), cristal: Math.round(80*l), energie: Math.round(30*l) }),
    time: buildCurve('hangar'),
    prereq: () => ({ commandement: 2, atelier: 1 }),
    upkeep: l => ({ energie: 2*l }),
    flag: 'expedition',
    effect: l => `Capacité ${l} vaisseau(x) · prérequis aux expéditions`
  },
  antenne: {
    nom: 'Antenne longue portée',
    desc: "Paraboles enchâssées dans le permafrost. Captent ce qu'on n'attendait pas.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(80*l), cristal: Math.round(100*l) }),
    time: buildCurve('antenne'),
    prereq: () => ({ commandement: 1 }),
    upkeep: l => ({ energie: 2*l }),
    flag: 'scan',
    effect: l => `Portée de scan +${l*5} systèmes · capte des signaux distants`
  },
  balise_recrutement: {
    nom: 'Balise de recrutement',
    desc: "Émetteur longue portée diffusant les conditions d'engagement. Les candidats se signalent par message-relais.",
    maxLevel: 6,
    cost: l => ({ metal: Math.round(50*triCost(l)), cristal: Math.round(30*triCost(l)), energie: Math.round(10*l) }),
    time: buildCurve('balise_recrutement'),
    prereq: () => ({ commandement: 1, habitat: 1 }),
    upkeep: l => ({ energie: 1*l }),
    flag: 'recrutement',
    effect: l => `~1 candidat toutes les ${fmtDuree(PACING.RECRUIT_INTERVAL / (1 + PACING.RECRUIT_LEVEL_SPEEDUP * (l - 1)))} · ${PACING.RECRUIT_QUEUE[Math.min(l, PACING.RECRUIT_QUEUE.length - 1)]} en attente au plus`
  },
  quartiers_residentiels: {
    nom: 'Quartiers résidentiels',
    desc: "Blocs de logements modulaires, espaces communs, jardins sous dôme pressurisé. Quand une base devient une vraie colonie.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(300*triCost(l)), cristal: Math.round(120*triCost(l)), biomasse: Math.round(20*l) }),
    time: buildCurve('quartiers_residentiels'),
    prereq: () => ({ commandement: 2, habitat: 3 }),
    capCrew: l => [0, 30, 65, 105, 150, 200][l] || 0,
    upkeep: l => ({ energie: 3*l, biomasse: 5*l }),
    effect: l => `+${[0,30,65,105,150,200][l]||0} places · −${3*l} énergie · −${5*l} biomasse`
  },
  formation: {
    nom: 'Centre de formation',
    desc: "Salles de simulation, bibliothèque de protocoles, mannequins d'exercice. Les colons en sortent meilleurs ou cassés.",
    maxLevel: 4,
    cost: l => ({ metal: Math.round(120*l), cristal: Math.round(80*l), datacubes: l>1 ? 5*l : 0 }),
    time: buildCurve('formation'),
    prereq: () => ({ commandement: 2, habitat: 1 }),
    upkeep: l => ({ energie: 3*l, biomasse: 1*l }),
    flag: 'formation',
    effect: l => `${l} place(s) en parallèle · plafond skill enseignable : ${l+1}`
  },
  infirmerie: {
    nom: 'Infirmerie',
    desc: "Lits suspendus, scanners portables, odeur d'antiseptique. Le silence y est différent.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(100*l), cristal: Math.round(70*l), biomasse: Math.round(10*l) }),
    time: buildCurve('infirmerie'),
    prereq: () => ({ commandement: 1, habitat: 1 }),
    upkeep: l => ({ energie: 2*l, biomasse: 1*l }),
    flag: 'soins',
    effect: l => `${2*l} lits · diagnostics et traitements jusqu'au palier ${l}`
  },

  // 0.29 — Bâtiment diplomatique
  ambassade: {
    nom: 'Ambassade',
    desc: "Salle des Accords, traducteurs cristallins, archives protocolaires. Le seuil où les factions s'écoutent vraiment.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(150*triCost(l)), cristal: Math.round(120*triCost(l)), biomasse: Math.round(30*l) }),
    time: buildCurve('ambassade'),
    prereq: () => ({ commandement: 2, habitat: 1 }),
    upkeep: l => ({ energie: 3*l, biomasse: 1*l }),
    flag: 'diplomatie',
    // Effets par niveau :
    //   niv 1 : débloque diplomatie, 1 mission // (déjà existant comme tickDiplomaticMissions)
    //   niv 2 : 2 missions //, +10% bonus rep
    //   niv 3 : 3 missions, débloque construction Émissaire
    //   niv 4 : 4 missions, débloque routes commerciales (préparé 0.30)
    //   niv 5 : 5 missions, débloque alliances formelles (préparé 0.30+)
    effect: l => {
      const features = [];
      features.push(`${l} mission(s) diplomatique(s) //`);
      if (l >= 2) features.push(`+${(l-1)*10}% rep`);
      if (l >= 3) features.push("Émissaire");
      if (l >= 4) features.push("routes commerciales");
      if (l >= 5) features.push("alliances formelles");
      return features.join(' · ');
    }
  },

  // ============================================================
  //   MODULES TIER 2 (0.25) — débloqués par recherches
  //   Marqués par tier:2 et requireTech: 'tech_xxx'
  // ============================================================
  mine_profonde: {
    nom: 'Mine profonde',
    desc: "Foreuses laser, ascenseurs miniers, tunnels jusqu'au manteau. Les ouvriers en remontent plus vieux.",
    maxLevel: 4,
    tier: 2,
    requireTech: 'tech_mining_advanced',
    cost: l => ({ metal: Math.round(800*triCost(l)/3), cristal: Math.round(400*triCost(l)/3), energie: Math.round(100*l) }),
    time: buildCurve('mine_profonde'),
    prereq: () => ({ commandement: 3, mine_surface: 3, atelier: 1 }),
    // Très forte production, lourdement coûteuse en énergie/biomasse
    prod: l => ({
      metal: Math.round(25*l * stepBonus(l)),
      cristal: Math.round(15*l * stepBonus(l))
    }),
    upkeep: l => ({ energie: 15*l, biomasse: 5*l }),
    effect: l => `+${Math.round(25*l * stepBonus(l))} métal · +${Math.round(15*l * stepBonus(l))} cristal /min · −${15*l} énergie · −${5*l} biomasse`
  },
  reacteur_fusion: {
    nom: 'Réacteur à fusion',
    desc: "Tore magnétique scellé, plasma à 150 millions de degrés. Sa pulsation devient le métronome de la colonie.",
    maxLevel: 3,
    tier: 2,
    requireTech: 'tech_fusion',
    cost: l => ({ metal: Math.round(1000*triCost(l)/3), cristal: Math.round(800*triCost(l)/3), datacubes: 30*l }),
    time: buildCurve('reacteur_fusion'),
    prereq: () => ({ commandement: 3, generateur_solaire: 4 }),
    // Énorme production d'énergie, demande biomasse (algues pour eau lourde) et cristal (réfrigérant)
    prod: l => ({ energie: Math.round(50*l * stepBonus(l)) }),
    upkeep: l => ({ biomasse: 10*l, cristal: 2*l }),
    effect: l => `+${Math.round(50*l * stepBonus(l))} énergie/min · −${10*l} biomasse · −${2*l} cristal`
  },
  bioreacteur: {
    nom: 'Bioréacteur',
    desc: "Cuves de fermentation aux parois translucides, où des cultures cellulaires synthétisent à la fois protéines et données génomiques.",
    maxLevel: 3,
    tier: 2,
    requireTech: 'tech_bioreacteur',
    cost: l => ({ metal: Math.round(600*triCost(l)/3), cristal: Math.round(500*triCost(l)/3), biomasse: 30*l }),
    time: buildCurve('bioreacteur'),
    prereq: () => ({ commandement: 3, hydroponie: 3, laboratoire: 2 }),
    // Production hybride biomasse + datacubes
    prod: l => ({
      biomasse: Math.round(20*l * stepBonus(l)),
      datacubes: Math.round(1*l * stepBonus(l))
    }),
    upkeep: l => ({ energie: 10*l }),
    effect: l => `+${Math.round(20*l * stepBonus(l))} biomasse · +${Math.round(1*l * stepBonus(l))} datacube /min · −${10*l} énergie`
  },
  synthetiseur_quantique: {
    nom: 'Synthétiseur quantique',
    desc: "Chambre de réarrangement atomique. Convertit la matière à la demande, mais demande une énergie obscène.",
    maxLevel: 2,
    tier: 2,
    requireTech: 'tech_stockage_quantique',
    cost: l => ({ metal: Math.round(1200*l), cristal: Math.round(1000*l), datacubes: 50*l }),
    time: buildCurve('synthetiseur_quantique'),
    prereq: () => ({ commandement: 4, atelier: 3, laboratoire: 3 }),
    // Pas de prod directe, mais débloque la conversion de ressources via UI
    upkeep: l => ({ energie: 20*l }),
    flag: 'synthese',
    effect: l => `Convertit ressources via UI dédiée · −${20*l} énergie`
  },
  // V1 : module de base (plus de tech requise) — le stockage n'est jamais un mur.
  silo_cryogenique: {
    nom: 'Silo cryogénique',
    desc: "Cuves scellées à atmosphère contrôlée. La conservation devient une science exacte.",
    maxLevel: 4,
    cost: l => ({ metal: Math.round(400*triCost(l)/3), cristal: Math.round(200*triCost(l)/3) }),
    time: buildCurve('silo_cryogenique'),
    prereq: () => ({ commandement: 2 }),
    // Bonus de capacité de stockage
    capBonus: l => ({ metal: 1500*l, cristal: 1200*l, biomasse: 400*l }),
    upkeep: l => ({ energie: 2*l }),
    effect: l => `+${1500*l} cap métal · +${1200*l} cap cristal · +${400*l} cap biomasse · −${2*l} énergie`
  },
  memoire_cristalline: {
    nom: 'Mémoire cristalline',
    desc: "Matrices de stockage utilisant les propriétés ondulatoires de cristaux exotiques. Chaque cristal contient une bibliothèque.",
    maxLevel: 3,
    tier: 2,
    requireTech: 'tech_memoire_cristalline',
    cost: l => ({ metal: Math.round(500*triCost(l)/3), cristal: Math.round(600*triCost(l)/3), datacubes_alien: 20*l }),
    time: buildCurve('memoire_cristalline'),
    prereq: () => ({ commandement: 3, laboratoire: 3 }),
    // Bonus de capacité datacubes + bonus de recherche (effet géré dans techEffects)
    capBonus: l => ({ datacubes: 200*l }),
    researchSpeedBonus: l => 0.10 * l,  // +10% par niveau
    upkeep: l => ({ energie: 5*l }),
    effect: l => `+${200*l} cap datacubes · +${10*l}% vitesse recherche · −${5*l} énergie`
  }
};


// V1 : les niveaux élevés coûtent proportionnellement plus cher (× PACING.COST_GROWTH
// par niveau au-delà du premier) : la production croît moins vite que les coûts et
// la progression s'étale sur des semaines. Montants arrondis à 5.
for (const def of Object.values(MODULES)) {
  const baseCost = def.cost;
  def.cost = l => {
    const f = Math.pow(PACING.COST_GROWTH, Math.max(0, l - 1));
    const out = {};
    for (const [k, v] of Object.entries(baseCost(l))) out[k] = v > 0 ? Math.max(1, Math.round(v * f / 5) * 5) : v;
    return out;
  };
}

// Définition des postes par bâtiment, par niveau.
// Format : { roleKey, req: {skill?:{key,min}, trait?:'..'} }
// Le poste apparaît au niveau jobs[i] (ordre = ordre d'apparition).
// Plusieurs niveaux du même bâtiment = plusieurs postes au même niveau.
export const MODULE_JOBS = {
  commandement: [
    // niv 1
    { role: 'commandement', req: { skill: { key: 'pilotage', min: 1 } }, label: 'Capitaine' },
    // niv 2
    { role: 'commandement', req: { skill: { key: 'science', min: 2 } }, label: 'Officier scientifique' },
    // niv 3
    { role: 'commandement', req: { skill: { key: 'combat', min: 2 } }, label: 'Officier sécurité' },
    // niv 4
    { role: 'commandement', req: { skill: { key: 'linguistique', min: 2 } }, label: 'Officier diplomatique' },
    // niv 5
    { role: 'commandement', req: { trait: 'sang_froid' }, label: 'Second' }
  ],
  generateur_solaire: [
    { role: 'production',  req: { skill: { key: 'ingenierie', min: 1 } }, label: 'Technicien voilures' },
    { role: 'qualite',     req: { skill: { key: 'science', min: 1 } }, label: 'Optimisateur' },
    { role: 'logistique',  req: { skill: { key: 'ingenierie', min: 2 } }, label: 'Régulateur réseau' }
  ],
  mine_surface: [
    { role: 'production',  req: { skill: { key: 'survie', min: 1 } }, label: 'Foreur' },
    { role: 'securite',    req: { skill: { key: 'combat', min: 1 } }, label: 'Garde de carrière' },
    { role: 'production',  req: { skill: { key: 'ingenierie', min: 1 } }, label: 'Mécano de surface' },
    { role: 'qualite',     req: { skill: { key: 'science', min: 2 } }, label: 'Géologue' },
    { role: 'logistique',  req: { skill: { key: 'pilotage', min: 1 } }, label: 'Conducteur convoyeur' }
  ],
  hydroponie: [
    { role: 'production',  req: { skill: { key: 'survie', min: 1 } }, label: 'Cultivateur' },
    { role: 'qualite',     req: { skill: { key: 'science', min: 1 } }, label: 'Bio-technicien' },
    { role: 'support',     req: { skill: { key: 'medecine', min: 1 } }, label: 'Hygiéniste' }
  ],
  habitat: [
    { role: 'support',     req: {}, label: 'Régisseur' },
    { role: 'logistique',  req: { skill: { key: 'survie', min: 1 } }, label: 'Intendant' },
    { role: 'support',     req: { trait: 'charisma' }, label: 'Médiateur' },
    { role: 'securite',    req: { skill: { key: 'combat', min: 1 } }, label: 'Agent de sécurité' },
    { role: 'logistique',  req: { skill: { key: 'ingenierie', min: 2 } }, label: 'Responsable technique' },
    { role: 'production',  req: { skill: { key: 'science', min: 1 } }, label: 'Coordinateur de vie' },
    { role: 'support',     req: { skill: { key: 'medecine', min: 1 } }, label: 'Conseiller bien-être' },
    { role: 'commandement',req: { skill: { key: 'linguistique', min: 2 } }, label: 'Directeur résidentiel' }
  ],
  laboratoire: [
    { role: 'production',  req: { skill: { key: 'science', min: 2 } }, label: 'Chercheur' },
    { role: 'qualite',     req: { skill: { key: 'science', min: 3 } }, label: 'Chercheur senior' },
    { role: 'production',  req: { skill: { key: 'linguistique', min: 1 } }, label: 'Analyste' },
    { role: 'qualite',     req: { skill: { key: 'medecine', min: 2 } }, label: 'Bio-spécialiste' }
  ],
  atelier: [
    { role: 'production',  req: { skill: { key: 'ingenierie', min: 2 } }, label: 'Artisan' },
    { role: 'qualite',     req: { skill: { key: 'ingenierie', min: 3 } }, label: 'Maître-artisan' },
    { role: 'production',  req: { skill: { key: 'ingenierie', min: 1 } }, label: 'Apprenti' }
  ],
  hangar: [
    { role: 'production',  req: { skill: { key: 'pilotage', min: 1 } }, label: 'Mécano de bord' },
    { role: 'securite',    req: { skill: { key: 'combat', min: 1 } }, label: 'Garde de hangar' },
    { role: 'qualite',     req: { skill: { key: 'pilotage', min: 3 } }, label: 'Chef pilote' }
  ],
  antenne: [
    { role: 'production',  req: { skill: { key: 'science', min: 1 } }, label: 'Opérateur scan' },
    { role: 'qualite',     req: { skill: { key: 'linguistique', min: 2 } }, label: 'Cryptanalyste' },
    { role: 'logistique',  req: { skill: { key: 'ingenierie', min: 1 } }, label: 'Technicien antenne' }
  ],
  balise_recrutement: [
    { role: 'production',  req: { skill: { key: 'linguistique', min: 1 } }, label: 'Recruteur' },
    { role: 'qualite',     req: { trait: 'charisma' }, label: 'Émissaire' },
    { role: 'production',  req: { skill: { key: 'linguistique', min: 2 } }, label: 'Agent réseau' },
    { role: 'logistique',  req: { skill: { key: 'ingenierie', min: 1 } }, label: 'Technicien balise' },
    { role: 'support',     req: { skill: { key: 'medecine', min: 1 } }, label: 'Conseiller intégration' },
    { role: 'commandement',req: { skill: { key: 'pilotage', min: 1 } }, label: 'Directeur recrutement' }
  ],
  quartiers_residentiels: [
    { role: 'support',     req: {}, label: 'Concierge' },
    { role: 'logistique',  req: { skill: { key: 'survie', min: 1 } }, label: 'Gestionnaire ressources' },
    { role: 'support',     req: { skill: { key: 'medecine', min: 1 } }, label: 'Travailleur social' },
    { role: 'production',  req: { skill: { key: 'science', min: 2 } }, label: 'Urbaniste' },
    { role: 'commandement',req: { skill: { key: 'linguistique', min: 2 } }, label: 'Directeur des quartiers' }
  ],
  formation: [
    { role: 'production',  req: { skill: { key: 'science', min: 2 } }, label: 'Instructeur' },
    { role: 'qualite',     req: { skill: { key: 'science', min: 4 } }, label: 'Pédagogue' },
    { role: 'support',     req: {}, label: 'Assistant' }
  ],
  infirmerie: [
    { role: 'production',  req: { skill: { key: 'medecine', min: 2 } }, label: 'Médecin chef' },
    { role: 'support',     req: { skill: { key: 'medecine', min: 1 } }, label: 'Infirmier' },
    { role: 'qualite',     req: { skill: { key: 'medecine', min: 4 } }, label: 'Spécialiste' },
    { role: 'logistique',  req: {}, label: 'Aide-soignant' },
    { role: 'support',     req: { trait: 'medic_ne' }, label: 'Médecin de campagne' }
  ],
  // 0.29 — postes diplomatiques
  ambassade: [
    { role: 'production',  req: { skill: { key: 'linguistique', min: 2 } }, label: 'Ambassadeur' },
    { role: 'qualite',     req: { skill: { key: 'linguistique', min: 4 } }, label: 'Plénipotentiaire' },
    { role: 'support',     req: { skill: { key: 'science', min: 1 } }, label: 'Attaché culturel' },
    { role: 'logistique',  req: { skill: { key: 'linguistique', min: 1 } }, label: 'Interprète' },
    { role: 'securite',    req: { skill: { key: 'combat', min: 2 } }, label: 'Garde du corps' }
  ]
};


// ============================================================
//   Catalogue des vaisseaux
// ============================================================
// places         : capacité équipage
// speed          : multiplicateur durée voyage (1 = ref, <1 = plus rapide)
// cargo          : capacité de loot (unités abstraites)
// fuelPerPc      : énergie consommée par parsec (aller seul, doublé sur retour)
// hangarReq      : niveau Hangar minimum requis pour le construire
// cost           : coût total construction
// buildHours     : durée construction en h jeu
// flavor         : description courte
export const VESSELS = {
  vedette: {
    nom: 'Vedette d\'exploration',
    // 0.28 : cargo ×2 (était 30)
    places: 3, speed: 0.7, cargo: 60, equipSlots: 2, fuelPerPc: 8,
    hangarReq: 1,
    cost: { metal: 250, cristal: 120, energie: 50 },
    buildHours: 24,
    flavor: "Coque légère, deux moteurs ioniques, instrumentation poussée. Faite pour repérer et fuir."
  },
  navette: {
    nom: 'Navette polyvalente',
    // 0.28 : cargo ×2 (était 60)
    places: 4, speed: 1.0, cargo: 120, equipSlots: 4, fuelPerPc: 12,
    hangarReq: 2,
    cost: { metal: 450, cristal: 200, energie: 80 },
    buildHours: 36,
    flavor: "Le couteau suisse de la flotte. Ni la plus rapide, ni la plus solide, mais fiable."
  },
  cargo: {
    nom: 'Cargo lourd',
    // 0.28 : cargo ×2.5 (était 140) — le spécialiste mérite son écart
    places: 6, speed: 1.4, cargo: 350, equipSlots: 6, fuelPerPc: 18,
    hangarReq: 3,
    cost: { metal: 700, cristal: 280, energie: 120 },
    buildHours: 48,
    flavor: "Soute énorme, vitesse de tortue. Indispensable pour ramener du gros."
  },
  cuirasse: {
    nom: 'Vaisseau cuirassé',
    // 0.28 : cargo ×2 (était 50)
    places: 4, speed: 1.2, cargo: 100, equipSlots: 8, fuelPerPc: 22,
    hangarReq: 4,
    cost: { metal: 900, cristal: 400, energie: 150, datacubes: 20 },
    buildHours: 60,
    flavor: "Plaques de blindage stratifiées, deux tourelles. Pour les zones où la diplomatie échoue."
  },
  // 0.29 — Vaisseau diplomatique
  emissaire: {
    nom: 'Émissaire',
    places: 4, speed: 1.2, cargo: 80, equipSlots: 4, fuelPerPc: 14,
    hangarReq: 2,
    cost: { metal: 600, cristal: 280, energie: 100, datacubes: 10 },
    buildHours: 42,
    // 0.29 : prérequis particuliers — Ambassade niv 3 + tech diplomatie cosmopolite
    requireModule: { ambassade: 3 },
    requireTech: 'tech_diplomatie_cosmopolite',
    // Spécialité : bonus de réputation sur missions diplomatiques (×1.5)
    diplomaticBonus: 1.5,
    flavor: "Coque ornée, salon de réception, traducteurs cristallins. Le visiteur arrive en partenaire, pas en visiteur."
  }
};


export const ITEM_TYPES = {
  narrative:  { nom: 'Artefacts',     desc: "Objets de valeur scientifique ou historique." },
  blueprint:  { nom: 'Schémas',       desc: "Plans techniques exploitables (à venir : phase 0.12)." },
  consumable: { nom: 'Consommables',  desc: "Items à usage unique (à venir : phase 0.13)." },
  tool:       { nom: 'Outils',        desc: "Équipements réutilisables (à venir : phase 0.13)." },
  weapon:     { nom: 'Armement',      desc: "Armes embarquées (à venir : phase 0.13)." }
};


export const ITEM_ORIGINS = {
  humain:   { nom: 'Humain',     color: '#c8a878' },
  alien_a:  { nom: 'Alien-A',    color: '#b09bd0' },
  alien_b:  { nom: 'Alien-B',    color: '#7a9b6e' },
  mixte:    { nom: 'Mixte',      color: '#5a8ba8' },
  fusion:   { nom: 'Fusion',     color: '#e07a5f' },
  exotique: { nom: 'Exotique',   color: '#e9b76a' },
  anomalie: { nom: 'Anomalie',   color: '#a26fbb' }  // 0.27 — items uniques de chroniques
};


export const ITEMS = {
  // === Artefacts narratifs (peuplés par les scènes existantes) ===
  fragment_cristallin: {
    nom: "Fragment cristallin",
    type: 'narrative', origin: 'alien_a',
    desc: "Éclat de matière cristalline. Réfléchit la lumière sous des angles impossibles."
  },
  disque_memoire: {
    nom: "Disque de mémoire",
    type: 'narrative', origin: 'humain',
    desc: "Support de stockage pré-Effondrement. Lecture difficile mais pas impossible."
  },
  outil_etrange: {
    nom: "Outil étrange",
    type: 'narrative', origin: 'humain',
    desc: "Appareil portatif d'usage non identifié. Ergonomie indubitablement humaine."
  },
  plaque_gravee: {
    nom: "Plaque gravée",
    type: 'narrative', origin: 'mixte',
    desc: "Inscription en glyphes mêlés. Plusieurs civilisations semblent avoir contribué."
  },
  lentille_noire: {
    nom: "Lentille noire",
    type: 'narrative', origin: 'alien_a',
    desc: "Objet sphérique opaque qui absorbe la lumière. Lourd. Tiède au toucher."
  },
  bobine_filaments: {
    nom: "Bobine de filaments",
    type: 'narrative', origin: 'humain',
    desc: "Conduite de fibres optiques anciennes. Encore conductrices."
  },
  anneau_scelle: {
    nom: "Anneau scellé",
    type: 'narrative', origin: 'alien_b',
    desc: "Anneau organique, refermé sur lui-même. Ne s'ouvre pas. Pulse parfois."
  },

  // ===== Items fabricables — Consommables =====
  ration_concentree: {
    nom: "Ration concentrée",
    type: 'consumable', origin: 'humain',
    desc: "Calories denses, longue conservation. Restaure 30% de biomasse pour un colon en mission."
  },
  kit_reparation: {
    nom: "Kit de réparation",
    type: 'consumable', origin: 'humain',
    desc: "Outils et patchs d'urgence pour combinaisons et matériel."
  },
  kit_medical: {
    nom: "Kit médical avancé",
    type: 'consumable', origin: 'humain',
    desc: "Soins de campagne complets. Stabilise un blessé grave sur le terrain."
  },
  serum_xeno: {
    nom: "Sérum xeno",
    type: 'consumable', origin: 'alien_b',
    desc: "Antitoxine biologique. Neutralise certains pathogènes alien."
  },

  // ===== Items fabricables — Outils =====
  combinaison_renforcee: {
    nom: "Combinaison renforcée",
    type: 'tool', origin: 'humain',
    desc: "EVA blindée. Réduit le risque de blessure en expédition."
  },
  combinaison_xeno: {
    nom: "Combinaison adaptive",
    type: 'tool', origin: 'alien_b',
    desc: "Membrane organique vivante. Immunise contre les atmosphères toxiques."
  },
  drone_eclaireur: {
    nom: "Drone éclaireur",
    type: 'tool', origin: 'humain',
    desc: "Reconnaissance autonome. Détecte les dangers à distance avant l'équipe."
  },
  capteur_xeno: {
    nom: "Capteur xeno",
    type: 'tool', origin: 'alien_a',
    desc: "Détecte les organismes alien et les anomalies cristallines."
  },
  balise_signal: {
    nom: "Balise de signal",
    type: 'tool', origin: 'humain',
    desc: "Émetteur portable pour communiquer ou marquer un site."
  },

  // ===== Items fabricables — Armement =====
  lance_flammes: {
    nom: "Lance-flammes portable",
    type: 'weapon', origin: 'humain',
    desc: "Arme thermique. Efficace contre la flore agressive et la faune.",
    combat: { damage: 4, label: "+4 dégâts" }
  },
  arme_resonance: {
    nom: "Arme à résonance",
    type: 'weapon', origin: 'alien_a',
    desc: "Arme énergétique cristalline. Brise les structures alien à distance.",
    combat: { damage: 3, accuracy: 15, label: "+3 dégâts, +15% précision" }
  },

  // ===== Items uniques de chroniques (0.27) =====
  compas_cosmique: {
    nom: "Compas cosmique",
    type: 'tool', origin: 'anomalie',
    desc: "Aiguille immobile qui pointe vers un point précis de la galaxie. Récupéré au cœur de l'Anneau Tracé. Personne ne sait ce qu'elle désigne — mais elle pointe toujours dans la même direction."
  },
  fragment_anneau: {
    nom: "Fragment d'anneau",
    type: 'tool', origin: 'anomalie',
    desc: "Éclat de matière non-identifiée. Sa densité change selon l'observation. Inutilisable comme matériau, fascinant à étudier."
  },

  // ===== Items uniques de chroniques (0.27.4) =====
  disque_veilleurs: {
    nom: "Disque des Veilleurs",
    type: 'tool', origin: 'humain',
    desc: "Disque mémoire archivique de la colonie Beth. Contient les vraies archives — manifeste d'évacuation, plans techniques de l'orbiteur Beth-3, journaux des derniers Anciens. Lourd à porter."
  },
  sceau_marche: {
    nom: "Sceau du Marché",
    type: 'tool', origin: 'mixte',
    desc: "Médaillon d'opale gravé de motifs entrelacés — humains, cristallins, organiques. Sert de laissez-passer pour les marchés clandestins de la galaxie. Personne ne sait combien il en existe ni qui les distribue vraiment."
  },

  // ===== 0.30 — Nouveaux items fabricables =====

  // — Consommables de mission —
  stimulant_cognitif: {
    nom: "Stimulant cognitif",
    type: 'consumable', origin: 'humain',
    desc: "Injection de nootropiques concentrés. Augmente temporairement l'acuité mentale d'un colon — utile avant un choix technique critique en mission."
  },
  sonde_analyse: {
    nom: "Sonde d'analyse",
    type: 'consumable', origin: 'humain',
    desc: "Petit appareil autonome à déployer sur un site. Transmet des données structurelles détaillées. Rapporte des datacubes bruts depuis les ruines."
  },
  nanobots_reparation: {
    nom: "Nanobots de réparation",
    type: 'consumable', origin: 'humain',
    desc: "Microbots injectables. Réparent les micro-lésions en quelques heures. Stabilise un colon blessé léger sans médecin sur le terrain.",
    combat: { heal: 6, label: "+6 PV (soins combat)" }
  },
  mine_eclats: {
    nom: "Mine à éclats",
    type: 'weapon', origin: 'humain',
    desc: "Dispositif à pression enterré. Dissuade la faune agressive et couvre les retraites. Usage unique, zone d'effet.",
    combat: { aoe: true, damage: 5, label: "+5 dégâts (tous ennemis)" }
  },
  explosif_demolition: {
    nom: "Explosif de démolition",
    type: 'weapon', origin: 'humain',
    desc: "Charge directionnelle à déclenchement distant. Ouvre les accès murés dans les ruines ou disloque les formations rocheuses bloquant l'accès à un site."
  },

  // — Outils de mission —
  scanner_geologique: {
    nom: "Scanner géologique",
    type: 'tool', origin: 'humain',
    desc: "Sonde sismique portable. Détecte les poches minérales et les cavités souterraines. Augmente la qualité du loot minéral sur les planètes rocheuses."
  },
  tenue_camouflage: {
    nom: "Tenue de camouflage",
    type: 'tool', origin: 'humain',
    desc: "Revêtement adaptatif multicouche. Atténue la signature thermique et visuelle. Réduit significativement le risque d'être repéré par la faune ou les factions hostiles.",
    combat: { dodge: 20, label: "+20% esquive" }
  },
  grappin_tactique: {
    nom: "Grappin tactique",
    type: 'tool', origin: 'humain',
    desc: "Lance-câble à ancrage magnétique. Traverse ravins, falaises et structures en ruine. Ouvre des passages que rien d'autre ne permettrait d'emprunter."
  },
  marteau_sonique: {
    nom: "Marteau sonique",
    type: 'weapon', origin: 'humain',
    desc: "Générateur d'ondes de choc focalisées. Brise les structures lithiques et désarticule les exosquelettes. Particulièrement efficace contre les défenses mécaniques alien.",
    combat: { damage: 5, label: "+5 dégâts" }
  },
  balise_retour: {
    nom: "Balise de retour d'urgence",
    type: 'tool', origin: 'humain',
    desc: "Signal de détresse à portée galactique. Déclenche une extraction immédiate. Sauve l'équipage si la mission tourne mal — mais laisse le loot derrière."
  },
  bouclier_plasma: {
    nom: "Bouclier plasma personnel",
    type: 'weapon', origin: 'humain',
    desc: "Générateur de champ électro-magnétique portatif. Absorbe les premiers impacts d'énergie et de projectiles. Recharge passif entre les engagements.",
    combat: { armor: 3, label: "+3 armure" }
  },

  // — Outils pour la colonie —
  purificateur_air: {
    nom: "Purificateur atmosphérique",
    type: 'tool', origin: 'humain',
    desc: "Filtre moléculaire stationnaire. Installez-le dans l'habitat pour réduire les pathogènes en suspension. Contribue à la santé globale de l'équipage."
  },
  noeud_comm: {
    nom: "Nœud de communication local",
    type: 'tool', origin: 'humain',
    desc: "Relais de données à courte portée. Connecte les postes de travail au laboratoire. Accélère les échanges d'informations — utile pour la recherche."
  },
  serre_portable: {
    nom: "Serre portable",
    type: 'tool', origin: 'humain',
    desc: "Module de culture hermétique à déploiement rapide. Peut booster temporairement la production biomasse de la colonie, ou servir de provision de secours en mission longue."
  },

  // — Alien-A (cristallin / énergétique) —
  resonateur_harmonique: {
    nom: "Résonateur harmonique",
    type: 'tool', origin: 'alien_a',
    desc: "Cristal pulsant à fréquence propre. Neutralise les champs de confinement alien-A et déclenche les mécanismes dormants dans les ruines cristallines. Amplifie aussi les équipements énergétiques de la colonie."
  },
  cristal_memoire_alien: {
    nom: "Cristal de mémoire alien",
    type: 'tool', origin: 'alien_a',
    desc: "Réseau cristallin auto-organisé capable d'encoder de l'information. Connecté au laboratoire, il accélère l'analyse de données et augmente la capacité de stockage datacubes."
  },

  // — Alien-B (organique / biotech) —
  enzymes_dissolution: {
    nom: "Enzymes de dissolution",
    type: 'consumable', origin: 'alien_b',
    desc: "Concentré enzymatique alien-B. Dissout les parois organiques et les films biologiques qui obstruent les passages. Neutralise aussi certains venins de la faune locale."
  },
  catalyseur_bio: {
    nom: "Catalyseur biologique",
    type: 'consumable', origin: 'alien_b',
    desc: "Sérum de régénération accélérée. Restaure 40% de santé immédiatement et efface les effets de status légers. Le meilleur soin de terrain disponible."
  },
  filet_capture_xeno: {
    nom: "Filet de capture xeno",
    type: 'tool', origin: 'alien_b',
    desc: "Réseau de filaments bio-actifs qui neutralisent les organismes vivants sans les tuer. Permet de ramener des spécimens vivants — source d'études et de biomasse rare."
  },

  // — Fusion humain-alien —
  implant_synaptique: {
    nom: "Implant synaptique",
    type: 'tool', origin: 'fusion',
    desc: "Interface neuronale micro-invasive combinant nanobots et filaments cristallins. Augmente la vitesse de traitement cognitif du porteur. Accélère l'apprentissage et améliore les performances en situation de stress."
  },
  armure_composite: {
    nom: "Armure composite",
    type: 'tool', origin: 'fusion',
    desc: "Alliage stratifié de métal terrestre, cristal alien-A et membrane organique alien-B. La meilleure protection individuelle existante. Résiste aux menaces thermiques, énergétiques et biologiques."
  },

  // ===== 0.31 — Armement et protection de combat =====

  // — Corps-à-corps —
  matraque_securite: {
    nom: "Matraque de sécurité",
    type: 'weapon', origin: 'humain',
    desc: "Bâton électrifié réglementaire. Simple, efficace, silencieux. La Vigueur du porteur décuple son efficacité.",
    combat: { type: 'melee', damage: 3, statBonus: 'vigueur', label: "+3 dégâts + Vigueur (cac)" }
  },
  lame_vibrante: {
    nom: "Lame vibrante",
    type: 'weapon', origin: 'humain',
    desc: "Lame à oscillation ultrasonique qui traverse la plupart des armures légères. Requiert force et technique. Vigueur amplifiée.",
    combat: { type: 'melee', damage: 5, armorPen: 2, statBonus: 'vigueur', label: "+5 dégâts + Vigueur, pénètre 2 armure" }
  },
  poing_amplifie: {
    nom: "Poing amplifié",
    type: 'weapon', origin: 'humain',
    desc: "Gant motorisé à servo-assistance. Démultiplie la force du porteur. Devastateur contre les structures mécaniques — et les adversaires. Vigueur maximisée.",
    combat: { type: 'melee', damage: 7, armorPen: 3, statBonus: 'vigueur', label: "+7 dégâts + Vigueur, pénètre 3 armure" }
  },

  // — Distance courte —
  pistolet_plasma: {
    nom: "Pistolet plasma",
    type: 'weapon', origin: 'humain',
    desc: "Arme de poing à plasma comprimé. Polyvalente, légère, facile à manier. Idéale en soutien ou en dernier recours.",
    combat: { type: 'ranged', damage: 2, accuracy: 10, label: "+2 dégâts, +10% précision" }
  },
  fusil_assault: {
    nom: "Fusil d'assaut modulaire",
    type: 'weapon', origin: 'humain',
    desc: "Arme semi-automatique haute cadence. Couverture de feu supérieure. Dextérité amplifiée par le système de visée gyro-stabilisé.",
    combat: { type: 'ranged', damage: 3, accuracy: 5, statBonus: 'dexterite', label: "+3 dégâts + Dextérité, +5% précision" }
  },

  // — Distance longue / précision —
  fusil_precision: {
    nom: "Fusil de précision",
    type: 'weapon', origin: 'humain',
    desc: "Sniper à longue portée avec correcteur balistique. Chaque tir compte. Le Sang-froid du tireur est décisif.",
    combat: { type: 'precision', damage: 5, accuracy: 20, statBonus: 'sangfroid', label: "+5 dégâts, +20% précision + Sang-froid" }
  },
  canon_ionique: {
    nom: "Canon ionique alien",
    type: 'weapon', origin: 'alien_a',
    desc: "Émetteur d'ions cristallins focalisés. Pénètre les blindages denses et désorganise les systèmes électroniques. Origine Alien-A.",
    combat: { type: 'ranged', damage: 5, armorPen: 4, accuracy: 5, label: "+5 dégâts, pénètre 4 armure, +5% précision" }
  },

  // — Grenades & explosifs —
  grenade_concussion: {
    nom: "Grenade à concussion",
    type: 'weapon', origin: 'humain',
    desc: "Onde de choc concentrée. Étourdit plusieurs cibles simultanément, les rendant moins réactives pendant un round.",
    combat: { aoe: true, damage: 3, stun: 1, label: "+3 dégâts zone, étourdit (saute sa prochaine attaque)" }
  },
  grenade_iem: {
    nom: "Grenade IEM",
    type: 'weapon', origin: 'humain',
    desc: "Impulsion électromagnétique focalisée. Inutile contre la faune organique, devastatrice contre les machines et drones.",
    combat: { aoe: true, damage: 2, machineBonus: 8, label: "+2 dégâts zone (+10 vs machines/drones)" }
  },

  // — Boucliers & armures —
  bouclier_cinetique: {
    nom: "Bouclier cinétique",
    type: 'weapon', origin: 'humain',
    desc: "Plaque de polymère balistique renforcé. Absorbe les impacts physiques et les projectiles. Réduit significativement les dégâts subis.",
    combat: { armor: 4, type: 'shield_cinetique', label: "+4 armure cinétique" }
  },
  bouclier_energetique: {
    nom: "Bouclier énergétique",
    type: 'weapon', origin: 'humain',
    desc: "Générateur de champ électromagnétique compact. Crée un tampon d'énergie qui encaisse les premiers dégâts avant la chair et les os.",
    combat: { shieldHp: 12, type: 'shield_energetique', label: "Tampon énergie 12 PV (prend les dégâts en premier)" }
  },
  armure_exo: {
    nom: "Exo-armure légère",
    type: 'weapon', origin: 'humain',
    desc: "Combinaison servo-assistée qui amplifie endurance et résistance. La Vigueur du porteur se traduit directement en points de vie supplémentaires.",
    combat: { armor: 3, type: 'exo', statBonus: 'vigueur', label: "+3 armure + Vigueur → PV bonus" }
  },
  bouclier_refractant: {
    nom: "Bouclier réfractant alien",
    type: 'weapon', origin: 'alien_a',
    desc: "Cristal de confinement alien synthétisé en paroi de bouclier. Combine absorption cinétique et tampon énergétique. Technologie Alien-A de pointe.",
    combat: { armor: 3, shieldHp: 10, type: 'shield_refractant', label: "+3 armure + tampon énergie 10 PV" }
  }
};


export const BLUEPRINTS = {
  // ---- Schémas humains pré-Effondrement ----
  bp_combinaison_renforcee: {
    nom: "Schéma : Combinaison renforcée",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'combinaison_renforcee', label: 'Combinaison renforcée' },
    desc: "Plans détaillés d'une combinaison d'EVA blindée. Conception terrienne, pré-Effondrement."
  },
  bp_kit_medical: {
    nom: "Schéma : Kit médical avancé",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'kit_medical', label: 'Kit médical avancé' },
    desc: "Diagrammes d'un kit de soins de campagne. Standard corporate."
  },
  bp_lance_flammes: {
    nom: "Schéma : Lance-flammes portable",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'lance_flammes', label: 'Lance-flammes portable' },
    desc: "Schémas d'une arme thermique. Indispensable contre la flore agressive."
  },
  bp_drone_eclaireur: {
    nom: "Schéma : Drone éclaireur",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'drone_eclaireur', label: 'Drone éclaireur' },
    desc: "Plans d'un drone de reconnaissance autonome. Repère les dangers à distance."
  },
  bp_module_stockage: {
    nom: "Schéma : Module de stockage avancé",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'module', target: 'capacite_stockage', label: 'Capacité de stockage +50%' },
    desc: "Plans de cuves cryogéniques étanches. Augmente drastiquement la capacité de stockage."
  },
  bp_extraction_avancee: {
    nom: "Schéma : Extraction avancée",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'tech', target: 'tech_mining_advanced', label: 'Mines niveau VI' },
    desc: "Procédés industriels pour atteindre les couches profondes. Débloque le palier supérieur des mines."
  },

  // ---- Schémas alien type-A (cristallin / énergétique) ----
  bp_capteur_xeno: {
    nom: "Schéma : Capteur xeno",
    origin: 'alien_a', rarity: 2,
    unlocks: { kind: 'fab', target: 'capteur_xeno', label: 'Capteur xeno' },
    desc: "Pictogrammes cristallins décrivant un appareil de détection d'organismes alien."
  },
  bp_voilure_cristal: {
    nom: "Schéma : Voilure cristalline",
    origin: 'alien_a', rarity: 3,
    unlocks: { kind: 'tech', target: 'tech_solar_xeno', label: 'Générateur solaire VI' },
    desc: "Géométrie de panneaux cristallins captant la lumière sous angles inconnus. Doublerait l'efficacité solaire."
  },
  bp_arme_resonance: {
    nom: "Schéma : Arme à résonance",
    origin: 'alien_a', rarity: 3,
    unlocks: { kind: 'fab', target: 'arme_resonance', label: 'Arme à résonance' },
    desc: "Glyphes décrivant une arme énergétique exploitant la résonance cristalline."
  },

  // ---- Schémas alien type-B (organique / biotech) ----
  bp_serum_xeno: {
    nom: "Schéma : Sérum xeno",
    origin: 'alien_b', rarity: 2,
    unlocks: { kind: 'fab', target: 'serum_xeno', label: 'Sérum xeno' },
    desc: "Recette biochimique organique. Pourrait soigner certains pathogènes alien."
  },
  bp_membrane_adaptive: {
    nom: "Schéma : Membrane adaptive",
    origin: 'alien_b', rarity: 3,
    unlocks: { kind: 'fab', target: 'combinaison_xeno', label: 'Combinaison adaptive' },
    desc: "Membrane organique qui s'adapte aux atmosphères toxiques. Vivante."
  },
  bp_culture_xeno: {
    nom: "Schéma : Culture xeno",
    origin: 'alien_b', rarity: 3,
    unlocks: { kind: 'tech', target: 'tech_hydro_xeno', label: 'Hydroponie xeno' },
    desc: "Souches biologiques alien comestibles. Triple le rendement biomasse."
  },

  // ---- Schémas Fusion (très rares, débloquent du tech tree exotique) ----
  bp_relais_quantique: {
    nom: "Schéma : Relais quantique",
    origin: 'fusion', rarity: 4,
    unlocks: { kind: 'tech', target: 'tech_comm_quantique', label: 'Communication quantique' },
    desc: "Architecture hybride humain-alien. Permettrait des communications instantanées à n'importe quelle distance."
  },
  bp_propulsion_pliee: {
    nom: "Schéma : Propulsion pliée",
    origin: 'fusion', rarity: 4,
    unlocks: { kind: 'tech', target: 'tech_warp', label: 'Voyages × 3' },
    desc: "Plans incompréhensibles d'une propulsion qui plie l'espace. Triplerait la vitesse de tous les vaisseaux."
  },
  bp_relais_unifie: {
    nom: "Schéma : Relais unifié",
    origin: 'fusion', rarity: 4, legendary: true,
    unlocks: { kind: 'tech', target: 'tech_relais_unifie', label: 'Relais unifié' },
    desc: "Hérité de l'Effondrement. Architecture qui synchronise toutes les fréquences de la colonie en un seul point. Plans d'une rare élégance."
  },

  // ===== 0.30 — Nouveaux schémas =====

  // — Humains (mission) —
  bp_stimulant_cognitif: {
    nom: "Schéma : Stimulant cognitif",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'stimulant_cognitif', label: 'Stimulant cognitif' },
    desc: "Formule pharmaceutique pre-Effondrement. Nootropiques concentrés à injection rapide."
  },
  bp_sonde_analyse: {
    nom: "Schéma : Sonde d'analyse",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'sonde_analyse', label: "Sonde d'analyse" },
    desc: "Plans d'un appareil de relevé sismique et chimique autonome. Extraction passive de données."
  },
  bp_nanobots_reparation: {
    nom: "Schéma : Nanobots de réparation",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'nanobots_reparation', label: 'Nanobots de réparation' },
    desc: "Spécifications de micro-robots médicaux auto-guidés. Requiert une nanotech maîtrisée."
  },
  bp_mine_eclats: {
    nom: "Schéma : Mine à éclats",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'mine_eclats', label: 'Mine à éclats' },
    desc: "Plans d'un engin de défense de périmètre. Usage tactique offensif ou défensif."
  },
  bp_explosif_demolition: {
    nom: "Schéma : Explosif de démolition",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'explosif_demolition', label: 'Explosif de démolition' },
    desc: "Charge directionnelle pour démolition contrôlée. Ouvre les sites murés."
  },
  bp_scanner_geologique: {
    nom: "Schéma : Scanner géologique",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'scanner_geologique', label: 'Scanner géologique' },
    desc: "Technologie de sondage sismique miniaturisée. Requiert une géologie avancée maîtrisée."
  },
  bp_tenue_camouflage: {
    nom: "Schéma : Tenue de camouflage",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'tenue_camouflage', label: 'Tenue de camouflage' },
    desc: "Revêtement adaptatif thermique et visuel. Requiert la recherche en camouflage adaptatif."
  },
  bp_grappin_tactique: {
    nom: "Schéma : Grappin tactique",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'grappin_tactique', label: 'Grappin tactique' },
    desc: "Mécanique simple, robuste, éprouvée. Standard de terrain."
  },
  bp_marteau_sonique: {
    nom: "Schéma : Marteau sonique",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'marteau_sonique', label: 'Marteau sonique' },
    desc: "Arme à percussion ultrasonique. Nécessite une compréhension des principes xeno pour calibrer correctement les fréquences."
  },
  bp_balise_retour: {
    nom: "Schéma : Balise de retour",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'balise_retour', label: "Balise de retour d'urgence" },
    desc: "Émetteur galactique à usage unique. Assurance-vie pour toute mission lointaine."
  },
  bp_bouclier_plasma: {
    nom: "Schéma : Bouclier plasma",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'bouclier_plasma', label: 'Bouclier plasma personnel' },
    desc: "Générateur de champ de force personnel. Haute consommation, haute protection."
  },

  // — Humains (colonie) —
  bp_purificateur_air: {
    nom: "Schéma : Purificateur atmosphérique",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'purificateur_air', label: 'Purificateur atmosphérique' },
    desc: "Filtres moléculaires et protocole de circulation d'air. Pour l'habitat de la colonie."
  },
  bp_noeud_comm: {
    nom: "Schéma : Nœud de communication",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'noeud_comm', label: 'Nœud de communication local' },
    desc: "Réseau maillé de relais de données. Connecte laboratoire, ateliers et postes de commandement."
  },
  bp_serre_portable: {
    nom: "Schéma : Serre portable",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'serre_portable', label: 'Serre portable' },
    desc: "Module de culture hermétique compact. Solution de survie biomasse à courte portée."
  },

  // — Alien-A —
  bp_resonateur_harmonique: {
    nom: "Schéma : Résonateur harmonique",
    origin: 'alien_a', rarity: 3,
    unlocks: { kind: 'fab', target: 'resonateur_harmonique', label: 'Résonateur harmonique' },
    desc: "Séquence cristalline gravée décrivant la fréquence propre du réseau alien-A. Incroyablement précis."
  },
  bp_cristal_memoire: {
    nom: "Schéma : Cristal de mémoire alien",
    origin: 'alien_a', rarity: 3,
    unlocks: { kind: 'fab', target: 'cristal_memoire_alien', label: 'Cristal de mémoire alien' },
    desc: "Protocole de croissance cristalline artificielle pour encoder de l'information à densité extreme."
  },

  // — Alien-B —
  bp_enzymes_dissolution: {
    nom: "Schéma : Enzymes de dissolution",
    origin: 'alien_b', rarity: 2,
    unlocks: { kind: 'fab', target: 'enzymes_dissolution', label: 'Enzymes de dissolution' },
    desc: "Séquence enzymatique alien-B. Synthétisable en laboratoire si la xenobiologie est maîtrisée."
  },
  bp_catalyseur_bio: {
    nom: "Schéma : Catalyseur biologique",
    origin: 'alien_b', rarity: 3,
    unlocks: { kind: 'fab', target: 'catalyseur_bio', label: 'Catalyseur biologique' },
    desc: "Protéines de régénération alien-B. Agit sur le métabolisme humain de manière surprenante."
  },
  bp_filet_capture: {
    nom: "Schéma : Filet de capture xeno",
    origin: 'alien_b', rarity: 2,
    unlocks: { kind: 'fab', target: 'filet_capture_xeno', label: 'Filet de capture xeno' },
    desc: "Tissu de filaments bio-actifs alien-B. Immobilise sans tuer. Requiert la xénobiologie."
  },

  // — Fusion —
  bp_implant_synaptique: {
    nom: "Schéma : Implant synaptique",
    origin: 'fusion', rarity: 4,
    unlocks: { kind: 'fab', target: 'implant_synaptique', label: 'Implant synaptique' },
    desc: "Plans d'une interface neuronale combinant nanotech humaine et filaments cristallins alien. Très rare."
  },
  bp_armure_composite: {
    nom: "Schéma : Armure composite",
    origin: 'fusion', rarity: 4,
    unlocks: { kind: 'fab', target: 'armure_composite', label: 'Armure composite' },
    desc: "Alliage triple : métal, cristal, membrane organique. La protection ultime. Plans presque introuvables."
  },

  // ===== 0.31 — Armement de combat =====

  // — Corps-à-corps humain —
  bp_matraque_securite: {
    nom: "Schéma : Matraque de sécurité",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'matraque_securite', label: 'Matraque de sécurité' },
    desc: "Plans d'une arme d'impact électrifiée. Standard des forces de sécurité coloniales."
  },
  bp_lame_vibrante: {
    nom: "Schéma : Lame vibrante",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'lame_vibrante', label: 'Lame vibrante' },
    desc: "Technologie d'oscillation ultrasonique appliquée à une lame. Pénètre les armures légères."
  },
  bp_poing_amplifie: {
    nom: "Schéma : Poing amplifié",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'poing_amplifie', label: 'Poing amplifié' },
    desc: "Gant servo-motorisé à amplification musculaire. Requiert une mécanique fine."
  },

  // — Distance humain —
  bp_pistolet_plasma: {
    nom: "Schéma : Pistolet plasma",
    origin: 'humain', rarity: 1,
    unlocks: { kind: 'fab', target: 'pistolet_plasma', label: 'Pistolet plasma' },
    desc: "Plans d'une arme de poing à plasma comprimé. Compact et polyvalent."
  },
  bp_fusil_assault: {
    nom: "Schéma : Fusil d'assaut",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'fusil_assault', label: "Fusil d'assaut modulaire" },
    desc: "Architecture modulaire à haute cadence. Standard militaire pré-Effondrement."
  },
  bp_fusil_precision: {
    nom: "Schéma : Fusil de précision",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'fusil_precision', label: 'Fusil de précision' },
    desc: "Plans d'un fusil longue portée avec correcteur balistique gyro-stabilisé."
  },

  // — Grenades —
  bp_grenade_concussion: {
    nom: "Schéma : Grenade à concussion",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'grenade_concussion', label: 'Grenade à concussion' },
    desc: "Dispositif de choc concentré à rayon d'effet contrôlé."
  },
  bp_grenade_iem: {
    nom: "Schéma : Grenade IEM",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'grenade_iem', label: 'Grenade IEM' },
    desc: "Impulsion électromagnétique focalisée. Devastating contre les systèmes électroniques."
  },

  // — Boucliers et armures —
  bp_bouclier_cinetique: {
    nom: "Schéma : Bouclier cinétique",
    origin: 'humain', rarity: 2,
    unlocks: { kind: 'fab', target: 'bouclier_cinetique', label: 'Bouclier cinétique' },
    desc: "Plaque balistique légère en polymère composite. Équipement standard de protection."
  },
  bp_bouclier_energetique: {
    nom: "Schéma : Bouclier énergétique",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'bouclier_energetique', label: 'Bouclier énergétique' },
    desc: "Générateur de champ EM compact. Tampon d'énergie absorbant les premiers impacts."
  },
  bp_armure_exo: {
    nom: "Schéma : Exo-armure légère",
    origin: 'humain', rarity: 3,
    unlocks: { kind: 'fab', target: 'armure_exo', label: 'Exo-armure légère' },
    desc: "Combinaison servo-assistée. La Vigueur du porteur se traduit en résistance supplémentaire."
  },

  // — Technologie Alien-A —
  bp_canon_ionique: {
    nom: "Schéma : Canon ionique alien",
    origin: 'alien_a', rarity: 4,
    unlocks: { kind: 'fab', target: 'canon_ionique', label: 'Canon ionique alien' },
    desc: "Émetteur d'ions cristallins. Technologie Alien-A reverse-engineered. Pénètre tous les blindages connus."
  },
  bp_bouclier_refractant: {
    nom: "Schéma : Bouclier réfractant alien",
    origin: 'alien_a', rarity: 4,
    unlocks: { kind: 'fab', target: 'bouclier_refractant', label: 'Bouclier réfractant alien' },
    desc: "Cristal de confinement alien en paroi active. Combine protection physique et énergie."
  }
};


export const TECH_TREE = {
  // ============ BRANCHE INGÉNIERIE (humaine) ============
  tech_metallurgie:        { branch:'ingenierie', tier:1, nom:"Métallurgie raffinée",
    cost:{ datacubes:30, time: 240 }, prereq:{ tech:[] },
    effects:{ resourceMult:{ metal:1.10 } },
    desc:"Procédés de raffinage améliorés. Mines : +10% de métal." },
  tech_circuiterie:        { branch:'ingenierie', tier:1, nom:"Circuiterie",
    cost:{ datacubes:30, time: 240 }, prereq:{ tech:[] },
    effects:{ resourceMult:{ cristal:1.10 } },
    desc:"Optimisation du traitement des cristaux. Mines : +10% de cristal." },
  tech_silos_basiques:     { branch:'ingenierie', tier:1, nom:"Silos pressurisés",
    cost:{ datacubes:25, time: 180 }, prereq:{ tech:[] },
    effects:{ capacityMult:{ metal:1.25, cristal:1.25 } },
    desc:"Conteneurs scellés à atmosphère contrôlée. Capacité max métal et cristal : +25%." },
  tech_efficience_solaire: { branch:'ingenierie', tier:2, nom:"Efficience solaire",
    cost:{ datacubes:60, time: 360 }, prereq:{ tech:['tech_metallurgie'] },
    effects:{ moduleProdMult:{ generateur_solaire:1.15 } },
    desc:"Voilures réajustées dynamiquement. Générateurs solaires : +15% d'énergie." },
  tech_batteries_avancees: { branch:'ingenierie', tier:2, nom:"Batteries avancées",
    cost:{ datacubes:60, time: 360 }, prereq:{ tech:['tech_circuiterie'] },
    effects:{ capacityMult:{ energie:1.30 } },
    desc:"Batteries cristallines à haute densité. Capacité max énergie : +30%." },
  tech_automatisation:     { branch:'ingenierie', tier:2, nom:"Automatisation",
    cost:{ datacubes:80, time: 480 }, prereq:{ tech:['tech_circuiterie'] },
    effects:{ baseFractionDelta: 0.15 },
    desc:"Systèmes auto-régulés. Plancher des postes vacants relevé de 15 points (30% → 45% du rendement), recherche et atelier sans personnel compris." },
  tech_mining_advanced:    { branch:'ingenierie', tier:3, nom:"Extraction profonde",
    cost:{ datacubes:120, time: 720 }, prereq:{ tech:['tech_metallurgie'] },
    effects:{ moduleMaxLevelDelta:{ mine_surface: 1 } },
    desc:"Atteint les couches géologiques profondes. Mine de surface : niveau max +1 (jusqu'à 9)." },
  tech_stockage_cryo:      { branch:'ingenierie', tier:3, nom:"Stockage cryogénique",
    cost:{ datacubes:100, time: 600 }, prereq:{ tech:['tech_circuiterie'] },
    effects:{ capacityMult:{ metal:1.5, cristal:1.5, biomasse:1.5 } },
    desc:"Cuves cryogéniques scellées. Capacité max +50% pour métal, cristal et biomasse." },
  tech_blindage:           { branch:'ingenierie', tier:3, nom:"Blindage stratifié",
    cost:{ datacubes:200, time: 960 }, prereq:{ tech:['tech_efficience_solaire','tech_automatisation'] },
    effects:{ vesselFuelMult: 0.85, expeditionThreatBonus: -1 },
    desc:"Coques renforcées. Carburant -15% sur les expéditions ; en combat, +4% d'esquive (menace -1)." },

  // ============ BRANCHE BIO-SCIENCES ============
  tech_hydroponie_avancee: { branch:'bio', tier:1, nom:"Hydroponie avancée",
    cost:{ datacubes:30, time: 240 }, prereq:{ tech:[] },
    effects:{ moduleProdMult:{ hydroponie:1.20 } },
    desc:"Souches plus productives. Hydroponie : +20% de biomasse." },
  tech_pharmacopee:        { branch:'bio', tier:1, nom:"Pharmacopée standard",
    cost:{ datacubes:30, time: 240 }, prereq:{ tech:[] },
    effects:{ treatmentSpeedMult: 0.85 },
    desc:"Bibliothèque de traitements éprouvés. Tous les soins : -15% de durée." },
  tech_serres_etanches:    { branch:'bio', tier:1, nom:"Serres étanches",
    cost:{ datacubes:25, time: 180 }, prereq:{ tech:[] },
    effects:{ capacityMult:{ biomasse:1.30 } },
    desc:"Cuves hermétiques à conservation prolongée. Capacité max biomasse : +30%." },
  tech_immunologie:        { branch:'bio', tier:2, nom:"Immunologie",
    cost:{ datacubes:60, time: 360 }, prereq:{ tech:['tech_pharmacopee'] },
    effects:{ contagionMult: 0.5 },
    desc:"Protocoles d'isolation systématiques. Risque de contagion divisé par 2." },
  tech_nutrition:          { branch:'bio', tier:2, nom:"Nutrition optimisée",
    cost:{ datacubes:60, time: 360 }, prereq:{ tech:['tech_hydroponie_avancee'] },
    effects:{ workerBiomasseMult: 0.7, expeditionBiomasseMult: 0.8 },
    desc:"Rations concentrées. Coût biomasse : -30% pour les actifs, -20% en expédition." },
  tech_archives_compactes: { branch:'bio', tier:2, nom:"Archives compactes",
    cost:{ datacubes:50, time: 360 }, prereq:{ tech:['tech_pharmacopee'] },
    effects:{ capacityMult:{ datacubes:1.40 } },
    desc:"Compression sémantique des données. Capacité max datacubes : +40%." },
  tech_chirurgie_avancee:  { branch:'bio', tier:3, nom:"Chirurgie avancée",
    cost:{ datacubes:120, time: 720 }, prereq:{ tech:['tech_pharmacopee','tech_immunologie'] },
    effects:{ sequelChanceMult: 0.5 },
    desc:"Techniques de microchirurgie. Probabilité de séquelles permanentes divisée par 2." },
  tech_genetique:          { branch:'bio', tier:4, nom:"Génétique appliquée",
    cost:{ datacubes:200, time: 960 }, prereq:{ tech:['tech_chirurgie_avancee'] },
    effects:{ trainingSpeedMult: 0.85 },
    desc:"Optimisation cognitive ciblée. Toutes les formations : -15% de durée." },

  // ============ BRANCHE EXOTIQUE (alien) ============
  // Le déblocage de la branche se fait via la possession de N'IMPORTE QUEL schéma alien.
  tech_principes_xeno:     { branch:'exotique', tier:1, nom:"Principes xeno-archéologiques",
    cost:{ datacubes:50, datacubes_alien:5, time: 480 },
    prereq:{ tech:[], requireAnyAlienBlueprint: true },
    effects:{ expeditionAlienLootMult: 1.25 },
    desc:"Étude systématique des artefacts alien. Loot des ruines alien : +25%." },
  tech_voilure_cristal:    { branch:'exotique', tier:2, nom:"Voilures cristallines",
    cost:{ datacubes:100, datacubes_alien:10, time: 720 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_voilure_cristal' },
    effects:{ moduleProdMult:{ generateur_solaire:1.40 } },
    desc:"Géométrie alien-A appliquée à nos voilures. Générateurs solaires : +40% (cumulable)." },
  tech_culture_xeno:       { branch:'exotique', tier:2, nom:"Culture xeno",
    cost:{ datacubes:100, datacubes_alien:10, time: 720 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_culture_xeno' },
    effects:{ moduleProdMult:{ hydroponie:1.50 } },
    desc:"Souches comestibles d'origine alien-B. Hydroponie : +50% (cumulable)." },
  tech_membrane_adaptive:  { branch:'exotique', tier:3, nom:"Membranes adaptives",
    cost:{ datacubes:150, datacubes_alien:15, time: 840 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_membrane_adaptive' },
    effects:{ expeditionToxicImmune: true },
    desc:"Combinaisons à membrane organique. En expédition, l'équipe est immunisée contre les contaminations (pathogène alien, infection, parasite)." },
  tech_resonance_armee:    { branch:'exotique', tier:3, nom:"Résonance armée",
    cost:{ datacubes:150, datacubes_alien:15, time: 840 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_arme_resonance' },
    effects:{ expeditionCombatBonus: 2 },
    desc:"Armes à résonance cristalline. Bonus combat équivalent à +2 skill pour toute l'équipe." },
  tech_stockage_quantique: { branch:'exotique', tier:3, nom:"Stockage quantique",
    cost:{ datacubes:200, datacubes_alien:20, time: 960 },
    prereq:{ tech:['tech_principes_xeno'] },
    effects:{ capacityMult:{ metal:2.0, cristal:2.0, energie:2.0, biomasse:2.0, datacubes:2.0 } },
    desc:"Compression d'état quantique. Capacité max × 2 sur toutes les ressources." },
  tech_warp:               { branch:'exotique', tier:4, nom:"Propulsion pliée",
    cost:{ datacubes:300, datacubes_alien:30, time: 1440 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_propulsion_pliee' },
    effects:{ vesselSpeedMult: 0.33 },  // ÷3 sur la durée → ×3 vitesse
    desc:"Voyages × 3 plus rapides. Tous les vaisseaux. Change la donne." },
  tech_comm_quantique:     { branch:'exotique', tier:4, nom:"Communication quantique",
    cost:{ datacubes:300, datacubes_alien:30, time: 1440 },
    prereq:{ tech:['tech_principes_xeno'], blueprint:'bp_relais_quantique' },
    effects:{ scanRangeBonus: 4 },
    desc:"Scanner portée +4 systèmes. La galaxie devient lisible." },

  // ============ TECHS LÉGENDAIRES (récompenses des arcs narratifs) ============
  tech_relais_unifie: { branch:'ingenierie', tier:4, nom:"Relais unifié", legendary: true,
    cost:{ datacubes:200, time: 720 },
    prereq:{ tech:[], blueprint:'bp_relais_unifie' },
    effects:{ baseFractionDelta: 0.20, moduleProdMult:{ commandement:1.50 } },
    desc:"Héritage de l'Effondrement. Plancher des postes vacants relevé de 20 points ; postes de commandement +50% d'efficacité (bonus global de production et de sécurité)." },
  tech_resonance_pure: { branch:'exotique', tier:4, nom:"Résonance pure", legendary: true,
    cost:{ datacubes:250, datacubes_alien:25, time: 960 },
    prereq:{ tech:['tech_principes_xeno'], requireArc:'arc_cristaux' },
    effects:{ resourceMult:{ cristal:1.50, energie:1.30 }, moduleProdMult:{ generateur_solaire:1.30 } },
    desc:"Compréhension cristalline complète. Cristal +50%, énergie +30%, générateurs solaires +30%." },
  tech_symbiose_bio: { branch:'bio', tier:4, nom:"Symbiose biologique", legendary: true,
    cost:{ datacubes:250, time: 960 },
    prereq:{ tech:['tech_genetique'], requireArc:'arc_couvee' },
    effects:{ resourceMult:{ biomasse:1.40 }, treatmentSpeedMult: 0.70, sequelChanceMult: 0.30 },
    desc:"Biologie alien-B intégrée. Biomasse +40%, soins -30%, séquelles divisées par 3." },

  // ============ NOUVELLES TECHS 0.25 — débloquent les modules tier 2 ============

  tech_fusion: { branch:'ingenierie', tier:3, nom:"Confinement à fusion",
    cost:{ datacubes:150, time: 720 },
    prereq:{ tech:['tech_efficience_solaire', 'tech_batteries_avancees'] },
    effects:{ unlockModule: 'reacteur_fusion' },
    desc:"Maîtrise du confinement magnétique à long terme. Débloque le module Réacteur à fusion (énergie massive)." },

  tech_bioreacteur: { branch:'bio', tier:3, nom:"Bioréacteurs intégrés",
    cost:{ datacubes:120, time: 720 },
    prereq:{ tech:['tech_nutrition', 'tech_hydroponie_avancee'] },
    effects:{ unlockModule: 'bioreacteur' },
    desc:"Cultures cellulaires multifonctions. Débloque le module Bioréacteur (biomasse + datacubes)." },

  tech_memoire_cristalline: { branch:'exotique', tier:3, nom:"Mémoire cristalline",
    cost:{ datacubes:150, datacubes_alien:15, time: 840 },
    prereq:{ tech:['tech_principes_xeno', 'tech_voilure_cristal'] },
    effects:{ unlockModule: 'memoire_cristalline' },
    desc:"Stockage de données dans la trame cristalline. Débloque le module Mémoire cristalline (cap datacubes + vitesse recherche)." },

  // ============ 0.29 — TECHS DIPLOMATIQUES (branche bio, axe leadership) ============

  tech_diplomatie_cosmopolite: { branch:'bio', tier:2, nom:"Diplomatie cosmopolite",
    cost:{ datacubes:100, time: 600 },
    prereq:{ tech:['tech_hydroponie_avancee'] },
    effects:{ unlockVessel: 'emissaire', diplomaticBonus: 1.10 },
    desc:"Protocoles de premier contact, traduction culturelle. Débloque la construction de l'Émissaire. +10% gains de réputation diplomatique." },

  tech_commerce_interstellaire: { branch:'bio', tier:3, nom:"Commerce interstellaire",
    cost:{ datacubes:140, time: 720 },
    prereq:{ tech:['tech_diplomatie_cosmopolite'] },
    effects:{ unlockTradeRoutes: true, diplomaticBonus: 1.20 },
    desc:"Conventions de transit, escortes croisées. Requise pour ouvrir une route commerciale (réputation 40+). +20% gains rep." },

  tech_traites_formels: { branch:'bio', tier:4, nom:"Traités formels",
    cost:{ datacubes:180, time: 900 },
    prereq:{ tech:['tech_commerce_interstellaire'] },
    effects:{ unlockAlliances: true, diplomaticBonus: 1.30 },
    desc:"Droit interstellaire, jurisprudence multi-espèces. Requise pour sceller une alliance formelle (réputation 75+, dons automatiques). +30% gains rep." },

  // ============ 0.30 — NOUVELLES TECHS ============

  // — Ingénierie —
  tech_recyclage: { branch:'ingenierie', tier:2, nom:"Recyclage intégré",
    cost:{ datacubes:55, time: 300 },
    prereq:{ tech:['tech_metallurgie'] },
    effects:{ resourceMult:{ metal:1.10, energie:1.10 } },
    desc:"Récupération des déchets industriels et thermiques. Métal +10%, énergie +10%." },

  tech_geologie_avancee: { branch:'ingenierie', tier:2, nom:"Géologie avancée",
    cost:{ datacubes:60, time: 360 },
    prereq:{ tech:['tech_metallurgie'] },
    effects:{ expeditionAlienLootMult: 1.20, resourceMult:{ metal:1.15 } },
    desc:"Analyse sismique et minéralogique de précision. Fouilles des ruines alien +20% de butin, métal +15%." },

  tech_nanotech: { branch:'ingenierie', tier:3, nom:"Nanotechnologie",
    cost:{ datacubes:130, time: 720 },
    prereq:{ tech:['tech_automatisation', 'tech_recyclage'] },
    effects:{ treatmentSpeedMult: 0.75, trainingSpeedMult: 0.90 },
    desc:"Nanorobots polyvalents : soins et réparations internes. Soins -25%, formations -10%." },

  tech_camouflage_adaptatif: { branch:'ingenierie', tier:4, nom:"Camouflage adaptatif",
    cost:{ datacubes:140, time: 780 },
    prereq:{ tech:['tech_blindage'] },
    effects:{ expeditionThreatBonus: -1, expeditionBiomasseMult: 0.85 },
    desc:"Revêtements multicouches actifs. Vivres -15% (équipe plus discrète) ; en combat, +4% d'esquive (menace -1)." },

  // — Bio-sciences —
  tech_toxicologie: { branch:'bio', tier:2, nom:"Toxicologie avancée",
    cost:{ datacubes:65, time: 360 },
    prereq:{ tech:['tech_immunologie'] },
    effects:{ contagionMult: 0.30, expeditionBiomasseMult: 0.90 },
    desc:"Contre-mesures aux toxines biologiques et chimiques. Contagion ×0.3, consommation vivres -10% en terrain hostile." },

  tech_xenobiologie: { branch:'bio', tier:2, nom:"Xénobiologie",
    cost:{ datacubes:70, time: 420 },
    prereq:{ tech:['tech_immunologie'] },
    effects:{ expeditionAlienLootMult: 1.20, moduleProdMult:{ hydroponie:1.15 } },
    desc:"Classification et usage des organismes alien-B. Loot alien +20%, hydroponie +15%." },

  tech_biomecanique: { branch:'bio', tier:3, nom:"Bio-mécanique",
    cost:{ datacubes:130, time: 720 },
    prereq:{ tech:['tech_chirurgie_avancee', 'tech_xenobiologie'] },
    effects:{ treatmentSpeedMult: 0.80, sequelChanceMult: 0.65 },
    desc:"Augmentations biologiques légères. Soins -20%, risque de séquelles -35%." },

  // — Exotique —
  tech_armure_composite: { branch:'exotique', tier:3, nom:"Armure composite",
    cost:{ datacubes:180, datacubes_alien:18, time: 900 },
    prereq:{ tech:['tech_resonance_armee', 'tech_membrane_adaptive'] },
    effects:{ expeditionThreatBonus: -2, vesselFuelMult: 0.85 },
    desc:"Alliage triple : métal humain, cristal alien-A, membrane alien-B. Carburant -15% ; en combat, +8% d'esquive et +1 armure (menace -2)." }
};


export const TECH_BRANCHES = {
  ingenierie: { nom: "Ingénierie",      color: '#c8a878', desc: "Industrie, structure, automatisation." },
  bio:        { nom: "Bio-sciences",    color: '#7a9b6e', desc: "Médecine, agriculture, biotechnologies." },
  exotique:   { nom: "Sciences exotiques", color: '#b09bd0', desc: "Tech alien. Verrouillée jusqu'à la première découverte de schéma alien." }
};


export const FABRICATIONS = {
  // ===== Sans schéma — disponibles dès le départ =====
  fab_ration_concentree: {
    nom: "Ration concentrée",
    produces: 'ration_concentree',
    cost: { biomasse: 8, energie: 2 },
    time: 60,    // 1h jeu
    prereq: { workshopLevel: 1 },
    desc: "Production de rations longue conservation pour expéditions."
  },
  fab_kit_reparation: {
    nom: "Kit de réparation",
    produces: 'kit_reparation',
    cost: { metal: 10, cristal: 5 },
    time: 90,
    prereq: { workshopLevel: 1 },
    desc: "Trousse d'urgence pour combinaisons et matériel de terrain."
  },
  fab_balise_signal: {
    nom: "Balise de signal",
    produces: 'balise_signal',
    cost: { metal: 8, cristal: 12, energie: 5 },
    time: 120,
    prereq: { workshopLevel: 1 },
    desc: "Émetteur portable pour communications longue distance."
  },

  // ===== Avec schéma humain =====
  fab_kit_medical: {
    nom: "Kit médical avancé",
    produces: 'kit_medical',
    cost: { biomasse: 15, cristal: 8, datacubes: 3 },
    time: 180,
    prereq: { workshopLevel: 2, blueprint: 'bp_kit_medical' },
    desc: "Trousse médicale complète. Stabilise un blessé grave en mission."
  },
  fab_combinaison_renforcee: {
    nom: "Combinaison renforcée",
    produces: 'combinaison_renforcee',
    cost: { metal: 35, cristal: 20, biomasse: 5 },
    time: 300,
    prereq: { workshopLevel: 2, blueprint: 'bp_combinaison_renforcee' },
    desc: "EVA blindée pour environnements hostiles."
  },
  fab_lance_flammes: {
    nom: "Lance-flammes portable",
    produces: 'lance_flammes',
    cost: { metal: 25, cristal: 15, energie: 10 },
    time: 240,
    prereq: { workshopLevel: 2, blueprint: 'bp_lance_flammes' },
    desc: "Arme thermique. Indispensable contre la flore agressive."
  },
  fab_drone_eclaireur: {
    nom: "Drone éclaireur",
    produces: 'drone_eclaireur',
    cost: { metal: 20, cristal: 30, energie: 15 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_drone_eclaireur' },
    desc: "Drone autonome de reconnaissance avant l'équipe."
  },

  // ===== Avec schéma alien-A =====
  fab_capteur_xeno: {
    nom: "Capteur xeno",
    produces: 'capteur_xeno',
    cost: { metal: 15, cristal: 40, datacubes: 8 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_capteur_xeno' },
    desc: "Détecteur cristallin d'organismes alien et anomalies."
  },
  fab_arme_resonance: {
    nom: "Arme à résonance",
    produces: 'arme_resonance',
    cost: { metal: 40, cristal: 60, datacubes: 15 },
    time: 540,
    prereq: { workshopLevel: 4, blueprint: 'bp_arme_resonance', tech: ['tech_principes_xeno'] },
    desc: "Arme énergétique cristalline. Tech alien-A maîtrisée."
  },

  // ===== Avec schéma alien-B =====
  fab_serum_xeno: {
    nom: "Sérum xeno",
    produces: 'serum_xeno',
    cost: { biomasse: 25, datacubes: 5 },
    time: 240,
    prereq: { workshopLevel: 3, blueprint: 'bp_serum_xeno' },
    desc: "Antitoxine biologique contre certains pathogènes alien."
  },
  fab_combinaison_xeno: {
    nom: "Combinaison adaptive",
    produces: 'combinaison_xeno',
    cost: { biomasse: 50, cristal: 25, datacubes: 12 },
    time: 480,
    prereq: { workshopLevel: 4, blueprint: 'bp_membrane_adaptive', tech: ['tech_principes_xeno'] },
    desc: "Membrane vivante. Immunise contre atmosphères toxiques."
  },

  // ===== 0.30 — Nouvelles fabrications =====

  // — Consommables de mission (atelier 1-2) —
  fab_stimulant_cognitif: {
    nom: "Stimulant cognitif",
    produces: 'stimulant_cognitif',
    cost: { biomasse: 10, datacubes: 4, cristal: 5 },
    time: 90,
    prereq: { workshopLevel: 2, blueprint: 'bp_stimulant_cognitif' },
    desc: "Nootropiques injectables pour missions à décision critique."
  },
  fab_sonde_analyse: {
    nom: "Sonde d'analyse",
    produces: 'sonde_analyse',
    cost: { metal: 15, cristal: 20, energie: 8 },
    time: 180,
    prereq: { workshopLevel: 2, blueprint: 'bp_sonde_analyse' },
    desc: "Capteur autonome à déployer sur les ruines pour extraire des datacubes."
  },
  fab_mine_eclats: {
    nom: "Mine à éclats",
    produces: 'mine_eclats',
    cost: { metal: 20, cristal: 10, energie: 5 },
    time: 120,
    prereq: { workshopLevel: 2, blueprint: 'bp_mine_eclats' },
    desc: "Engin de défense de périmètre à pression."
  },
  fab_explosif_demolition: {
    nom: "Explosif de démolition",
    produces: 'explosif_demolition',
    cost: { metal: 25, cristal: 15, energie: 10 },
    time: 150,
    prereq: { workshopLevel: 2, blueprint: 'bp_explosif_demolition' },
    desc: "Charge directionnelle pour ouvrir les structures murées."
  },
  fab_grappin_tactique: {
    nom: "Grappin tactique",
    produces: 'grappin_tactique',
    cost: { metal: 18, cristal: 12, energie: 6 },
    time: 150,
    prereq: { workshopLevel: 1, blueprint: 'bp_grappin_tactique' },
    desc: "Lance-câble magnétique standard. Indispensable en terrain accidenté."
  },
  fab_serre_portable: {
    nom: "Serre portable",
    produces: 'serre_portable',
    cost: { metal: 12, biomasse: 8, cristal: 6 },
    time: 120,
    prereq: { workshopLevel: 1, blueprint: 'bp_serre_portable' },
    desc: "Module de culture hermétique déployable rapidement."
  },
  fab_balise_retour: {
    nom: "Balise de retour d'urgence",
    produces: 'balise_retour',
    cost: { metal: 12, cristal: 18, energie: 10 },
    time: 180,
    prereq: { workshopLevel: 2, blueprint: 'bp_balise_retour' },
    desc: "Extraction d'urgence galactique. Usage unique."
  },

  // — Outils avancés (atelier 3, tech requise) —
  fab_nanobots_reparation: {
    nom: "Nanobots de réparation",
    produces: 'nanobots_reparation',
    cost: { metal: 20, cristal: 25, datacubes: 8, energie: 10 },
    time: 300,
    prereq: { workshopLevel: 3, blueprint: 'bp_nanobots_reparation', tech: ['tech_nanotech'] },
    desc: "Microbots médicaux injectables. Soins de terrain sans médecin."
  },
  fab_scanner_geologique: {
    nom: "Scanner géologique",
    produces: 'scanner_geologique',
    cost: { metal: 30, cristal: 40, energie: 15, datacubes: 6 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_scanner_geologique', tech: ['tech_geologie_avancee'] },
    desc: "Sonde sismique portable. Révèle les ressources enfouies."
  },
  fab_purificateur_air: {
    nom: "Purificateur atmosphérique",
    produces: 'purificateur_air',
    cost: { metal: 20, cristal: 15, biomasse: 10, energie: 8 },
    time: 240,
    prereq: { workshopLevel: 2, blueprint: 'bp_purificateur_air' },
    desc: "Filtre moléculaire. Réduit les pathogènes dans l'habitat."
  },
  fab_tenue_camouflage: {
    nom: "Tenue de camouflage",
    produces: 'tenue_camouflage',
    cost: { metal: 25, biomasse: 15, cristal: 20 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_tenue_camouflage', tech: ['tech_camouflage_adaptatif'] },
    desc: "Revêtement adaptatif thermique et visuel."
  },
  fab_noeud_comm: {
    nom: "Nœud de communication local",
    produces: 'noeud_comm',
    cost: { metal: 25, cristal: 45, energie: 20, datacubes: 12 },
    time: 420,
    prereq: { workshopLevel: 3, blueprint: 'bp_noeud_comm', tech: ['tech_circuiterie'] },
    desc: "Relais de données interne. Accélère la recherche au laboratoire."
  },
  fab_marteau_sonique: {
    nom: "Marteau sonique",
    produces: 'marteau_sonique',
    cost: { metal: 35, cristal: 30, energie: 20, datacubes: 8 },
    time: 480,
    prereq: { workshopLevel: 3, blueprint: 'bp_marteau_sonique', tech: ['tech_principes_xeno'] },
    desc: "Onde de choc focalisée. Efficace contre les structures et exosquelettes alien."
  },
  fab_bouclier_plasma: {
    nom: "Bouclier plasma personnel",
    produces: 'bouclier_plasma',
    cost: { metal: 40, cristal: 35, energie: 25, datacubes: 10 },
    time: 540,
    prereq: { workshopLevel: 4, blueprint: 'bp_bouclier_plasma', tech: ['tech_batteries_avancees'] },
    desc: "Champ de force personnel. Protection contre énergie et projectiles."
  },

  // — Alien-B (atelier 2-3, xenobiologie) —
  fab_enzymes_dissolution: {
    nom: "Enzymes de dissolution",
    produces: 'enzymes_dissolution',
    cost: { biomasse: 30, datacubes: 6 },
    time: 180,
    prereq: { workshopLevel: 2, blueprint: 'bp_enzymes_dissolution' },
    desc: "Concentré enzymatique pour obstacles organiques ou venins alien."
  },
  fab_filet_capture: {
    nom: "Filet de capture xeno",
    produces: 'filet_capture_xeno',
    cost: { metal: 10, biomasse: 20, cristal: 8 },
    time: 180,
    prereq: { workshopLevel: 2, blueprint: 'bp_filet_capture', tech: ['tech_xenobiologie'] },
    desc: "Filaments bio-actifs pour capturer des spécimens vivants."
  },
  fab_catalyseur_bio: {
    nom: "Catalyseur biologique",
    produces: 'catalyseur_bio',
    cost: { biomasse: 40, datacubes: 10, cristal: 15 },
    time: 300,
    prereq: { workshopLevel: 3, blueprint: 'bp_catalyseur_bio', tech: ['tech_xenobiologie'] },
    desc: "Sérum de régénération accélérée. Meilleur soin de terrain disponible."
  },

  // — Alien-A (atelier 4, xeno avancé) —
  fab_resonateur_harmonique: {
    nom: "Résonateur harmonique",
    produces: 'resonateur_harmonique',
    cost: { cristal: 50, datacubes: 12, energie: 15 },
    time: 480,
    prereq: { workshopLevel: 4, blueprint: 'bp_resonateur_harmonique', tech: ['tech_principes_xeno'] },
    desc: "Cristal synthétique pulsant. Neutralise défenses alien-A, amplifie équipements énergie."
  },
  fab_cristal_memoire: {
    nom: "Cristal de mémoire alien",
    produces: 'cristal_memoire_alien',
    cost: { cristal: 45, datacubes: 15, energie: 12 },
    time: 420,
    prereq: { workshopLevel: 4, blueprint: 'bp_cristal_memoire', tech: ['tech_memoire_cristalline'] },
    desc: "Réseau cristallin pour stockage de données haute densité."
  },

  // — Fusion (atelier 5, techs multiples) —
  fab_implant_synaptique: {
    nom: "Implant synaptique",
    produces: 'implant_synaptique',
    cost: { metal: 30, cristal: 50, biomasse: 25, datacubes: 20, energie: 20 },
    time: 720,
    prereq: { workshopLevel: 5, blueprint: 'bp_implant_synaptique', tech: ['tech_principes_xeno', 'tech_genetique'] },
    desc: "Interface neuronale fusion. Accélère apprentissage et réactions sous stress."
  },
  fab_armure_composite: {
    nom: "Armure composite",
    produces: 'armure_composite',
    cost: { metal: 60, cristal: 55, biomasse: 20, datacubes: 18, energie: 25 },
    time: 840,
    prereq: { workshopLevel: 5, blueprint: 'bp_armure_composite', tech: ['tech_armure_composite'] },
    desc: "Protection ultime. Résiste à toutes les menaces connues."
  },

  // ===== 0.31 — Fabrications armement de combat =====

  // — Corps-à-corps (niveau 1-3) —
  fab_matraque_securite: {
    nom: "Matraque de sécurité",
    produces: 'matraque_securite',
    cost: { metal: 12, cristal: 5, energie: 4 },
    time: 90,
    prereq: { workshopLevel: 1, blueprint: 'bp_matraque_securite' },
    desc: "Bâton électrifié. Bonus Vigueur. Rapide à fabriquer."
  },
  fab_lame_vibrante: {
    nom: "Lame vibrante",
    produces: 'lame_vibrante',
    cost: { metal: 30, cristal: 15, energie: 10 },
    time: 270,
    prereq: { workshopLevel: 2, blueprint: 'bp_lame_vibrante' },
    desc: "Lame à oscillation ultrasonique. Vigueur amplifiée, pénètre 2 armure."
  },
  fab_poing_amplifie: {
    nom: "Poing amplifié",
    produces: 'poing_amplifie',
    cost: { metal: 45, cristal: 20, energie: 18, datacubes: 5 },
    time: 420,
    prereq: { workshopLevel: 3, blueprint: 'bp_poing_amplifie', tech: ['tech_automatisation'] },
    desc: "Servo-gant à amplification. Vigueur maximisée, pénètre 3 armure."
  },

  // — Distance (niveau 1-3) —
  fab_pistolet_plasma: {
    nom: "Pistolet plasma",
    produces: 'pistolet_plasma',
    cost: { metal: 18, cristal: 10, energie: 6 },
    time: 120,
    prereq: { workshopLevel: 1, blueprint: 'bp_pistolet_plasma' },
    desc: "Arme de poing plasma. Compact, léger, polyvalent."
  },
  fab_fusil_assault: {
    nom: "Fusil d'assaut modulaire",
    produces: 'fusil_assault',
    cost: { metal: 35, cristal: 18, energie: 12 },
    time: 240,
    prereq: { workshopLevel: 2, blueprint: 'bp_fusil_assault' },
    desc: "Fusil semi-auto gyrostabilisé. Dextérité amplifiée par le viseur."
  },
  fab_fusil_precision: {
    nom: "Fusil de précision",
    produces: 'fusil_precision',
    cost: { metal: 40, cristal: 25, energie: 15, datacubes: 5 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_fusil_precision', tech: ['tech_blindage'] },
    desc: "Sniper longue portée. Sang-froid amplifié par le correcteur balistique."
  },

  // — Grenades (niveau 2-3) —
  fab_grenade_concussion: {
    nom: "Grenade à concussion",
    produces: 'grenade_concussion',
    cost: { metal: 20, cristal: 8, energie: 8 },
    time: 150,
    prereq: { workshopLevel: 2, blueprint: 'bp_grenade_concussion' },
    desc: "Onde de choc AoE. Étourdit les ennemis (-1 PA round suivant)."
  },
  fab_grenade_iem: {
    nom: "Grenade IEM",
    produces: 'grenade_iem',
    cost: { metal: 15, cristal: 20, energie: 15, datacubes: 5 },
    time: 210,
    prereq: { workshopLevel: 3, blueprint: 'bp_grenade_iem', tech: ['tech_nanotech'] },
    desc: "Impulsion EM. Devastatrice contre machines et drones."
  },

  // — Boucliers et armures (niveau 2-4) —
  fab_bouclier_cinetique: {
    nom: "Bouclier cinétique",
    produces: 'bouclier_cinetique',
    cost: { metal: 35, cristal: 10, biomasse: 5 },
    time: 210,
    prereq: { workshopLevel: 2, blueprint: 'bp_bouclier_cinetique' },
    desc: "Plaque balistique polymère. +4 armure cinétique."
  },
  fab_bouclier_energetique: {
    nom: "Bouclier énergétique",
    produces: 'bouclier_energetique',
    cost: { metal: 25, cristal: 35, energie: 20 },
    time: 360,
    prereq: { workshopLevel: 3, blueprint: 'bp_bouclier_energetique', tech: ['tech_batteries_avancees'] },
    desc: "Générateur EM compact. Tampon 12 PV qui encaisse avant les PV du colon."
  },
  fab_armure_exo: {
    nom: "Exo-armure légère",
    produces: 'armure_exo',
    cost: { metal: 50, cristal: 20, energie: 15, datacubes: 8 },
    time: 480,
    prereq: { workshopLevel: 3, blueprint: 'bp_armure_exo', tech: ['tech_automatisation'] },
    desc: "+3 armure + PV bonus selon Vigueur du porteur."
  },

  // — Technologie Alien-A (niveau 4-5) —
  fab_canon_ionique: {
    nom: "Canon ionique alien",
    produces: 'canon_ionique',
    cost: { cristal: 65, datacubes: 18, energie: 20, metal: 25 },
    time: 600,
    prereq: { workshopLevel: 4, blueprint: 'bp_canon_ionique', tech: ['tech_principes_xeno', 'tech_batteries_avancees'] },
    desc: "+5 dégâts, pénètre 4 armure. Technologie Alien-A."
  },
  fab_bouclier_refractant: {
    nom: "Bouclier réfractant alien",
    produces: 'bouclier_refractant',
    cost: { cristal: 70, metal: 30, datacubes: 15, energie: 25 },
    time: 660,
    prereq: { workshopLevel: 5, blueprint: 'bp_bouclier_refractant', tech: ['tech_principes_xeno', 'tech_batteries_avancees'] },
    desc: "+3 armure + tampon 10 PV. Combinaison cinétique/énergétique Alien-A."
  }
};


// Map des anciens noms (strings) vers les nouveaux IDs (rétrocompatibilité)
export const ITEM_NAME_TO_ID = {
  "Fragment cristallin": "fragment_cristallin",
  "Disque de mémoire":   "disque_memoire",
  "Outil étrange":       "outil_etrange",
  "Plaque gravée":       "plaque_gravee",
  "Lentille noire":      "lentille_noire",
  "Bobine de filaments": "bobine_filaments",
  "Anneau scellé":       "anneau_scelle"
};


// Scènes d'expédition : contenu en données pures dans src/content/scenes/ (format V1,
// docs/ecrire-pour-drift.md), y compris les scènes de combat. Réexportées ici pour
// le code qui les importe depuis le catalogue.
export { SCENES } from './content/index.js';


// Traitements : un statut peut avoir plusieurs traitements selon le palier de l'infirmerie.
// chaque traitement : { nom, durationMin, cost, requiresMedSkill }
// Durées en secondes réelles (V1). Sans médecin plus compétent ni bonus d'infirmerie.
// V1 : les soins vitaux ne coûtent que de la biomasse (les datacubes, rares, partent
// en recherche : un blessé ne doit pas mourir faute de données).
export const TREATMENTS = {
  blessure_legere: [
    { nom: "Sutures et repos", durationMin: 40*60, cost: { biomasse:5 }, requiresMedSkill: 0 }
  ],
  blessure_grave: [
    { nom: "Chirurgie d'urgence", durationMin: 2*3600, cost: { biomasse:25 }, requiresMedSkill: 2 }
  ],
  infection: [
    { nom: "Antibiotiques", durationMin: 80*60, cost: { biomasse:10 }, requiresMedSkill: 1 }
  ],
  pathogene_alien: [
    { nom: "Antitoxine xeno + isolation", durationMin: 160*60, cost: { biomasse:30 }, requiresMedSkill: 3, requiresQuarantine: true }
  ],
  trauma_psy: [
    { nom: "Thérapie longue", durationMin: 6*3600, cost: { biomasse:10 }, requiresMedSkill: 2 }
  ],
  parasite: [
    { nom: "Extraction chirurgicale", durationMin: 2*3600, cost: { biomasse:20 }, requiresMedSkill: 3 }
  ],
  mutation: [
    { nom: "Thérapie génique", durationMin: 4*3600, cost: { datacubes:20, biomasse:10 }, requiresMedSkill: 4 }
  ]
};


// ---- Tables planétaires ----
// Chaque entrée a un id technique, un libellé, un poids (fréquence), et un fragment narratif.
export const BIOMES = {
  toundra:    { nom:'Toundra',          weight:8, frag:"Plaines de mousses et lichens gelés. Le sol craque sous le pas." },
  desert:     { nom:'Désert',           weight:8, frag:"Étendues d'oxydes ferreux. Les dunes avancent au gré des vents." },
  ocean:      { nom:'Océan',            weight:5, frag:"Surface presque entièrement liquide, de couleur indéterminée." },
  jungle:     { nom:'Jungle',           weight:5, frag:"Canopée dense et humide. Tout y pousse trop vite." },
  volcanique: { nom:'Volcanique',       weight:5, frag:"Coulées récentes et fumerolles. Le sol trahit sa jeunesse." },
  glace:      { nom:'Glacé',            weight:7, frag:"Un seul océan figé, traversé de fractures bleu-noir." },
  irradie:    { nom:'Irradié',          weight:3, frag:"Sable vitrifié, ciel jaune-vert. Compteurs Geiger nerveux." },
  asteroide:  { nom:'Anneau astéroïde', weight:4, frag:"Pas de planète, mais une ceinture de rochers en lente rotation." },
  exotique:   { nom:'Exotique',         weight:2, frag:"Géologie sans précédent. Quelque chose ici contredit nos modèles." }
};


export const ATMOSPHERES = {
  respirable: { nom:'Respirable',       weight:4, frag:"L'air est respirable, parfois même agréable. Une rareté." },
  tenue:      { nom:'Ténue',            weight:6, frag:"Pression minimale. Combinaison sous pression conseillée." },
  toxique:    { nom:'Toxique',          weight:6, frag:"Composés sulfureux ou chlorés. Combinaison étanche obligatoire." },
  aucune:     { nom:'Inexistante',      weight:5, frag:"Vide absolu. EVA et propulseurs requis pour toute manœuvre." },
  anormale:   { nom:'Anormale',         weight:3, frag:"Composition fluctuante. Les analyseurs reviennent à des valeurs différentes selon l'heure." }
};


export const SIGNAUX = {
  aucun:         { nom:'Aucun',                    weight:10, frag:"Silence radio." },
  sos:           { nom:'Balise SOS',               weight:3,  frag:"Une balise de détresse pulse, codage standard humain ancien." },
  crypte:        { nom:'Transmission cryptée',     weight:2,  frag:"Émission régulière, chiffrement non identifié." },
  bruit_blanc:   { nom:'Bruit blanc rituel',       weight:1,  frag:"Fréquence inhabituelle, motif rythmique presque organique." },
  echo_temporel: { nom:'Écho temporel',            weight:1,  frag:"L'émission semble précéder son émetteur. Anomalie causale." }
};


export const RUINES = {
  aucune:           { nom:'Aucune',                  weight:10, frag:"" },
  humaines:         { nom:'Humaines pré-Effondrement', weight:3, frag:"Vestiges d'un avant-poste humain. Peut-être l'un des nôtres, autrefois." },
  alien_a:          { nom:'Alien Type-A',            weight:2,  frag:"Architecture cristalline, blocs trop nets pour être naturels." },
  alien_b:          { nom:'Alien Type-B',            weight:1,  frag:"Cités fluides, comme moulées en un seul bloc d'os ou de corail." },
  fusion:           { nom:'Fusion impossible',       weight:1,  frag:"Bâtiments humains et alien interpénétrés. Contemporains. Comment ?" }
};


export const DANGERS = {
  aucun:        { nom:'Aucun',          weight:5, frag:"" },
  tempetes:     { nom:'Tempêtes',       weight:5, frag:"Tempêtes saisonnières violentes, fenêtres de calme imprévisibles." },
  predateurs:   { nom:'Prédateurs',     weight:3, frag:"Faune hostile recensée. Patrouilles armées recommandées." },
  pathogene:    { nom:'Pathogène',      weight:2, frag:"Présence biologique virulente. Décontamination obligatoire." },
  faille:       { nom:'Faille',         weight:2, frag:"Activité tectonique ou crevasse profonde. Le sol n'est pas fiable." },
  ia_hostile:   { nom:'IA hostile',     weight:1, frag:"Systèmes automatisés actifs et belliqueux." },
  anomalie:     { nom:'Anomalie',       weight:1, frag:"Phénomènes physiques non répertoriés. Prudence maximale." }
};


// Traits : pool riche, weight = fréquence d'apparition
export const TRAITS = {
  // Positifs
  sang_froid:        { nom:'Sang-froid',         kind:'positif', desc:"Immunisé à la panique sous le feu.",                          weight:5, mod:{ stat:{sangfroid:+2} } },
  mecano:            { nom:'Mécano de génie',    kind:'positif', desc:"Formation Ingénierie 30% plus rapide.",                       weight:4, mod:{ skill:{ingenierie:+2} } },
  memoire_eidetique: { nom:'Mémoire eidétique',  kind:'positif', desc:"Toute formation est 30% plus rapide.",                        weight:3 },
  beni:              { nom:'Béni des dieux',     kind:'positif', desc:"Jets de chance favorisés (+10%).",                            weight:2 },
  linguiste:         { nom:'Linguiste',          kind:'positif', desc:"Comprend les xeno-symboles plus vite.",                       weight:3, mod:{ skill:{linguistique:+2} } },
  medic_ne:          { nom:'Médecin né',         kind:'positif', desc:"Soins 25% plus rapides.",                                     weight:3, mod:{ skill:{medecine:+2} } },
  pilote_inne:       { nom:'Pilote inné',        kind:'positif', desc:"Voyages d'expédition 15% plus rapides.",                      weight:3, mod:{ skill:{pilotage:+2} } },
  survivant:         { nom:'Survivant',          kind:'positif', desc:"Résiste aux statuts négatifs (-50%).",                        weight:4, mod:{ skill:{survie:+2} } },
  charisma:          { nom:'Voix qui rassure',   kind:'positif', desc:"Calme l'équipage en crise.",                                  weight:3, mod:{ stat:{charisme:+2} } },
  endurant:          { nom:'Endurant',           kind:'positif', desc:"La fatigue prend plus longtemps à s'installer.",              weight:4, mod:{ stat:{vigueur:+2} } },
  savant_eclaire:    { nom:'Savant éclairé',     kind:'positif', desc:"Recherche scientifique 25% plus rapide.",                     weight:1, mod:{ skill:{science:+2} } },
  combattant_aguerri:{ nom:'Combattant aguerri', kind:'positif', desc:"Initiative en mêlée · résiste aux blessures graves.",        weight:1, mod:{ skill:{combat:+2} } },

  // Négatifs
  claustro:          { nom:'Claustrophobe',      kind:'negatif', desc:"-3 Sang-froid en espace clos (souterrain, vaisseau).",        weight:4 },
  allergique_xeno:   { nom:'Allergique au xeno', kind:'negatif', desc:"Choc anaphylactique au contact d'organismes alien.",          weight:3 },
  insomniaque:       { nom:'Insomniaque',        kind:'negatif', desc:"-1 partout après 16h jeu sans repos.",                        weight:3 },
  lache:             { nom:'Lâche',              kind:'negatif', desc:"Fuit sous le feu sur jet de Sang-froid raté.",                weight:3 },
  foi_obsession:     { nom:'Foi obsessionnelle', kind:'negatif', desc:"Refuse certains choix moraux (au gré de l'événement).",       weight:2 },
  lent:              { nom:'Lent',               kind:'negatif', desc:"Formation 50% plus lente, -1 Dextérité.",                     weight:3 },
  distrait:          { nom:'Distrait',           kind:'negatif', desc:"5% d'échec critique sur action complexe.",                    weight:3 },
  rancunier:         { nom:'Rancunier',          kind:'negatif', desc:"Loyauté chute 2× plus vite après injustice perçue.",          weight:3 },
  fragile:           { nom:'Constitution fragile',kind:'negatif',desc:"-2 Vigueur, blessures aggravées en gravité.",                  weight:3 },
  cynique:           { nom:'Cynique',            kind:'negatif', desc:"-1 moral collectif, immunisé à la propagande positive.",      weight:3 },

  // Ambigus
  curieux:           { nom:'Curieux',            kind:'ambigu',  desc:"Force certains choix risqués · +1 skill aléatoire en formation.", weight:4 },
  ambitieux:         { nom:'Ambitieux',          kind:'ambigu',  desc:"Performances accrues · risque mutinerie si bloqué.",          weight:3 },
  voix_murmurent:    { nom:'Voix-qui-murmurent', kind:'ambigu',  desc:"Entend des choses dans les ruines · perd Sang-froid à long terme.", weight:1 },
  reveur:            { nom:'Rêveur',             kind:'ambigu',  desc:"Idées créatives en recherche · oublis fréquents.",            weight:3 },
  distant:           { nom:'Distant',            kind:'ambigu',  desc:"Immunisé au deuil · isole peu à peu l'équipage.",             weight:3 },
  hyperempathe:      { nom:'Hyper-empathique',   kind:'ambigu',  desc:"+2 Charisme · subit les traumas des autres.",                 weight:2 }
};

// ============================================================
//   TYPES D'ENNEMIS — COMBAT AU TOUR PAR TOUR (0.31)
// ============================================================
// hp: points de vie | armor: réduction dégâts | damage: [min, max] | accuracy: % touché
// pa: indicatif, non utilisé (chaque ennemi attaque une fois par round)
// loot: ressources (metal, cristal, energie, biomasse, datacubes) si victoire
// 0.32.1 — Équilibrage : PV relevés, dégâts/précision légèrement abaissés, pour des
// combats de 3–4 rounds en moyenne (équipe de 3) sans hausse de la létalité.

export const ENEMY_TYPES = {
  // — Faune —
  predateur_lunaire:  { nom: "Prédateur lunaire",    category: 'faune',   hp: 26, armor: 1, damage: [2, 4], accuracy: 60, pa: 2, loot: { biomasse: 8 } },
  meute_rapaces:      { nom: "Meute de rapaces",      category: 'faune',   hp: 13, armor: 0, damage: [1, 3], accuracy: 62, pa: 3, loot: { biomasse: 4 } },
  predateur_alpha:    { nom: "Prédateur alpha",        category: 'faune',   hp: 32, armor: 2, damage: [3, 6], accuracy: 58, pa: 2, loot: { biomasse: 18 } },
  drone_bio:          { nom: "Drone biologique",       category: 'faune',   hp: 18, armor: 1, damage: [2, 4], accuracy: 66, pa: 3, loot: { biomasse: 10 } },

  // — Machines / Gardiens —
  drone_gardien:      { nom: "Drone gardien",          category: 'machine', hp: 22, armor: 3, damage: [2, 5], accuracy: 68, pa: 2,
    loot: { metal: 15, cristal: 2 }, itemLoot: [{ item: 'pistolet_plasma', chance: 0.20 }] },
  gardien_antique:    { nom: "Gardien antique",         category: 'machine', hp: 30, armor: 6, damage: [3, 7], accuracy: 62, pa: 2,
    loot: { metal: 25, cristal: 10 }, itemLoot: [{ item: 'grenade_iem', chance: 0.30 }, { item: 'bouclier_cinetique', chance: 0.15 }] },
  sentinelle_alien:   { nom: "Sentinelle alien",        category: 'machine', hp: 20, armor: 3, damage: [2, 6], accuracy: 64, pa: 2,
    loot: { cristal: 8, datacubes: 4 }, itemLoot: [{ item: 'canon_ionique', chance: 0.10 }] },

  // — Xénoformes —
  xenoforme_alpha:    { nom: "Xénoforme α",            category: 'alien',   hp: 28, armor: 2, damage: [2, 5], accuracy: 62, pa: 2,
    loot: { cristal: 10, datacubes: 4 }, itemLoot: [{ item: 'bouclier_refractant', chance: 0.08 }] },
  xenoforme_reine:    { nom: "Reine xénoforme",         category: 'alien',   hp: 36, armor: 3, damage: [3, 7], accuracy: 60, pa: 2,
    loot: { cristal: 20, datacubes: 10 }, itemLoot: [{ item: 'bouclier_refractant', chance: 0.25 }, { item: 'canon_ionique', chance: 0.12 }] },
  spore_toxique:      { nom: "Spore toxique",           category: 'alien',   hp:  7, armor: 0, damage: [1, 2], accuracy: 75, pa: 3, loot: { biomasse: 6 } },

  // — Humains hostiles —
  pillard:            { nom: "Pillard",                 category: 'humain',  hp: 16, armor: 2, damage: [2, 4], accuracy: 64, pa: 2,
    loot: { metal: 8, biomasse: 5 }, itemLoot: [{ item: 'matraque_securite', chance: 0.25 }, { item: 'pistolet_plasma', chance: 0.15 }] },
  mercenaire:         { nom: "Mercenaire",              category: 'humain',  hp: 18, armor: 3, damage: [2, 5], accuracy: 68, pa: 2,
    loot: { metal: 15, biomasse: 3 }, itemLoot: [{ item: 'fusil_assault', chance: 0.20 }, { item: 'bouclier_cinetique', chance: 0.18 }] },
  garde_elite:        { nom: "Garde d'élite",           category: 'humain',  hp: 22, armor: 4, damage: [3, 6], accuracy: 70, pa: 2,
    loot: { metal: 20 }, itemLoot: [{ item: 'fusil_precision', chance: 0.15 }, { item: 'armure_exo', chance: 0.12 }, { item: 'bouclier_energetique', chance: 0.12 }] },
};

