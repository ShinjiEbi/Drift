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
const triCost = l => l * (l + 1) / 2;
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
    time: l => 8*l,
    prereq: () => ({}),
    effect: () => "Débloque les autres modules. Niveau requis pour les paliers."
  },
  generateur_solaire: {
    nom: 'Générateur solaire',
    desc: "Voilures photovoltaïques tendues sur la roche. Silence et lumière.",
    maxLevel: 8,
    cost: l => ({ metal: Math.round(30*triCost(l)), cristal: Math.round(15*triCost(l)) }),
    time: l => 5*l,
    prereq: l => l===1 ? {} : { commandement: 1 },
    // 0.25 : énergie de base relevée +33% (8 au lieu de 6)
    prod: l => ({ energie: Math.round((8*l + 2*(l-1)) * stepBonus(l)) }),
    effect: l => `+${Math.round((8*l + 2*(l-1)) * stepBonus(l))} énergie/min`
  },
  mine_surface: {
    nom: 'Mine de surface',
    desc: "Extraction des veines affleurantes. Bruit constant, vibrations.",
    maxLevel: 8,
    cost: l => ({ metal: Math.round(50*triCost(l)), cristal: Math.round(20*triCost(l)) }),
    time: l => 6*l,
    prereq: () => ({ commandement: 1 }),
    // 0.25 : prod cristal doublée (4 au lieu de 2)
    prod: l => ({
      metal: Math.round(5*l * stepBonus(l)),
      cristal: Math.round(4*l * stepBonus(l))
    }),
    upkeep: l => ({ energie: 2*l }),
    effect: l => `+${Math.round(5*l * stepBonus(l))} métal · +${Math.round(4*l * stepBonus(l))} cristal /min · −${2*l} énergie`
  },
  hydroponie: {
    nom: 'Hydroponie',
    desc: "Bacs scellés, lampes UV, mousses comestibles. L'odeur s'accroche aux vêtements.",
    maxLevel: 6,
    cost: l => ({ metal: Math.round(60*triCost(l)), cristal: Math.round(30*triCost(l)), biomasse: 10*l }),
    time: l => 7*l,
    prereq: () => ({ commandement: 1 }),
    prod: l => ({ biomasse: Math.round(4*l * stepBonus(l)) }),
    upkeep: l => ({ energie: 3*l }),
    effect: l => `+${Math.round(4*l * stepBonus(l))} biomasse/min · −${3*l} énergie`
  },
  habitat: {
    nom: 'Habitat',
    desc: "Couchettes empilées, cloisons fines, vapeurs de café synthétique.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(90*triCost(l)), cristal: Math.round(40*triCost(l)), biomasse: 5*l }),
    time: l => 9*l,
    prereq: () => ({ commandement: 1 }),
    capCrew: l => 4*l,
    upkeep: l => ({ energie: 1*l, biomasse: 2*l }),
    effect: l => `+${4*l} places d'équipage · −${1*l} énergie · −${2*l} biomasse`
  },
  laboratoire: {
    nom: 'Laboratoire',
    desc: "Banc d'analyse spectrale, hotte à flux laminaire, écrans figés sur des spectres.",
    maxLevel: 6,
    // 0.25 : coût cristal divisé par 2 (50*tri au lieu de 100*l²)
    cost: l => ({ metal: Math.round(100*l), cristal: Math.round(50*triCost(l)), datacubes: l>1 ? 5*l : 0 }),
    time: l => 12*l,
    prereq: () => ({ commandement: 2 }),
    // 0.25 : prod datacubes augmentée 50% (1.5*l au lieu de 1*l brut → 0.75 effectif)
    prod: l => ({ datacubes: Math.round(1.5*l * stepBonus(l)) }),
    upkeep: l => ({ energie: 5*l }),
    flag: 'recherche',
    effect: l => `+${Math.round(1.5*l * stepBonus(l))} datacube/min · −${5*l} énergie · débloque la recherche`
  },
  atelier: {
    nom: 'Atelier',
    desc: "Imprimantes, étaux, copeaux. Tout ce qui se casse finit ici.",
    maxLevel: 5,
    cost: l => ({ metal: Math.round(150*l), cristal: Math.round(60*l) }),
    time: l => 10*l,
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
    time: l => 15*l,
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
    time: l => 11*l,
    prereq: () => ({ commandement: 1 }),
    upkeep: l => ({ energie: 2*l }),
    flag: 'scan',
    effect: l => `Portée de scan +${l*5} systèmes · capte des signaux distants`
  },
  balise_recrutement: {
    nom: 'Balise de recrutement',
    desc: "Émetteur longue portée diffusant les conditions d'engagement. Les candidats se signalent par message-relais.",
    maxLevel: 4,
    cost: l => ({ metal: Math.round(50*triCost(l)), cristal: Math.round(30*triCost(l)), energie: Math.round(10*l) }),
    time: l => 8*l,
    prereq: () => ({ commandement: 1, habitat: 1 }),
    upkeep: l => ({ energie: 1*l }),
    flag: 'recrutement',
    effect: l => `~1 candidat / ${Math.round(24/l)}h jeu · file max ${2*l}`
  },
  formation: {
    nom: 'Centre de formation',
    desc: "Salles de simulation, bibliothèque de protocoles, mannequins d'exercice. Les colons en sortent meilleurs ou cassés.",
    maxLevel: 4,
    cost: l => ({ metal: Math.round(120*l), cristal: Math.round(80*l), datacubes: l>1 ? 5*l : 0 }),
    time: l => 14*l,
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
    time: l => 12*l,
    prereq: () => ({ commandement: 1, habitat: 1 }),
    upkeep: l => ({ energie: 2*l, biomasse: 1*l }),
    flag: 'soins',
    effect: l => `${2*l} lits · diagnostics et traitements jusqu'au palier ${l}`
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
    time: l => 24*l,
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
    time: l => 36*l,
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
    time: l => 30*l,
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
    time: l => 48*l,
    prereq: () => ({ commandement: 4, atelier: 3, laboratoire: 3 }),
    // Pas de prod directe, mais débloque la conversion de ressources via UI
    upkeep: l => ({ energie: 20*l }),
    flag: 'synthese',
    effect: l => `Convertit ressources via UI dédiée · −${20*l} énergie`
  },
  silo_cryogenique: {
    nom: 'Silo cryogénique',
    desc: "Cuves scellées à atmosphère contrôlée. La conservation devient une science exacte.",
    maxLevel: 4,
    tier: 2,
    requireTech: 'tech_stockage_cryo',
    cost: l => ({ metal: Math.round(400*triCost(l)/3), cristal: Math.round(200*triCost(l)/3) }),
    time: l => 18*l,
    prereq: () => ({ commandement: 2 }),
    // Bonus de capacité de stockage
    capBonus: l => ({ metal: 500*l, cristal: 400*l, biomasse: 200*l }),
    upkeep: l => ({ energie: 2*l }),
    effect: l => `+${500*l} cap métal · +${400*l} cap cristal · +${200*l} cap biomasse · −${2*l} énergie`
  },
  memoire_cristalline: {
    nom: 'Mémoire cristalline',
    desc: "Matrices de stockage utilisant les propriétés ondulatoires de cristaux exotiques. Chaque cristal contient une bibliothèque.",
    maxLevel: 3,
    tier: 2,
    requireTech: 'tech_memoire_cristalline',
    cost: l => ({ metal: Math.round(500*triCost(l)/3), cristal: Math.round(600*triCost(l)/3), datacubes_alien: 20*l }),
    time: l => 30*l,
    prereq: () => ({ commandement: 3, laboratoire: 3 }),
    // Bonus de capacité datacubes + bonus de recherche (effet géré dans techEffects)
    capBonus: l => ({ datacubes: 200*l }),
    researchSpeedBonus: l => 0.10 * l,  // +10% par niveau
    upkeep: l => ({ energie: 5*l }),
    effect: l => `+${200*l} cap datacubes · +${10*l}% vitesse recherche · −${5*l} énergie`
  }
};


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
    { role: 'support',     req: { trait: 'charisma' }, label: 'Médiateur' }
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
    { role: 'qualite',     req: { trait: 'charisma' }, label: 'Émissaire' }
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
    places: 3, speed: 0.7, cargo: 30, equipSlots: 2, fuelPerPc: 8,
    hangarReq: 1,
    cost: { metal: 250, cristal: 120, energie: 50 },
    buildHours: 24,
    flavor: "Coque légère, deux moteurs ioniques, instrumentation poussée. Faite pour repérer et fuir."
  },
  navette: {
    nom: 'Navette polyvalente',
    places: 4, speed: 1.0, cargo: 60, equipSlots: 4, fuelPerPc: 12,
    hangarReq: 2,
    cost: { metal: 450, cristal: 200, energie: 80 },
    buildHours: 36,
    flavor: "Le couteau suisse de la flotte. Ni la plus rapide, ni la plus solide, mais fiable."
  },
  cargo: {
    nom: 'Cargo lourd',
    places: 6, speed: 1.4, cargo: 140, equipSlots: 6, fuelPerPc: 18,
    hangarReq: 3,
    cost: { metal: 700, cristal: 280, energie: 120 },
    buildHours: 48,
    flavor: "Soute énorme, vitesse de tortue. Indispensable pour ramener du gros."
  },
  cuirasse: {
    nom: 'Vaisseau cuirassé',
    places: 4, speed: 1.2, cargo: 50, equipSlots: 8, fuelPerPc: 22,
    hangarReq: 4,
    cost: { metal: 900, cristal: 400, energie: 150, datacubes: 20 },
    buildHours: 60,
    flavor: "Plaques de blindage stratifiées, deux tourelles. Pour les zones où la diplomatie échoue."
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
  exotique: { nom: 'Exotique',   color: '#e9b76a' }
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
    desc: "Arme thermique. Efficace contre la flore agressive et la faune."
  },
  arme_resonance: {
    nom: "Arme à résonance",
    type: 'weapon', origin: 'alien_a',
    desc: "Arme énergétique cristalline. Brise les structures alien à distance."
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
    desc:"Systèmes auto-régulés. Tous les bâtiments sans personnel produisent +15% (plancher relevé)." },
  tech_mining_advanced:    { branch:'ingenierie', tier:3, nom:"Extraction profonde",
    cost:{ datacubes:120, time: 720 }, prereq:{ tech:['tech_metallurgie'], blueprint:'bp_extraction_avancee' },
    effects:{ moduleMaxLevelDelta:{ mine_surface: 1 } },
    desc:"Atteint les couches géologiques profondes. Mine de surface : niveau max +1 (jusqu'à 9)." },
  tech_stockage_cryo:      { branch:'ingenierie', tier:3, nom:"Stockage cryogénique",
    cost:{ datacubes:100, time: 600 }, prereq:{ tech:['tech_circuiterie'], blueprint:'bp_module_stockage' },
    effects:{ capacityMult:{ metal:1.5, cristal:1.5, biomasse:1.5 } },
    desc:"Cuves cryogéniques scellées. Capacité max +50% pour métal, cristal et biomasse." },
  tech_blindage:           { branch:'ingenierie', tier:4, nom:"Blindage stratifié",
    cost:{ datacubes:200, time: 960 }, prereq:{ tech:['tech_efficience_solaire','tech_automatisation'] },
    effects:{ vesselFuelMult: 0.85, expeditionThreatBonus: -1 },
    desc:"Coques renforcées. Carburant -15% sur les expéditions, menace effective réduite." },

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
    desc:"Combinaisons à membrane organique. Plus de risque atmosphère toxique en expédition." },
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
    desc:"Héritage de l'Effondrement. Plancher de production +20%, Centre de commandement +50%." },
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
    desc:"Stockage de données dans la trame cristalline. Débloque le module Mémoire cristalline (cap datacubes + vitesse recherche)." }
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


export const SCENES = [
  // ============ INTRO (toujours en première scène) ============
  {
    id: 'intro_atterrissage',
    tags: ['intro'],
    weight: 5,
    text: "{vaisseau} se pose dans un grondement étouffé. Les voilures se déploient. Au-dehors, {planete}: {biomeFrag} {atmFrag}",
    choices: [
      { label: "Sortie en reconnaissance prudente", outcome: 'next' },
      { label: "Sortie groupée, armes prêtes", outcome: { threat: -1, log: "L'équipe avance en formation serrée." } }
    ]
  },
  {
    id: 'intro_signal',
    tags: ['intro', 'signal'],
    weight: 8,
    text: "À peine posés, les capteurs captent une émission régulière. {signalFrag} L'équipage attend une consigne.",
    choices: [
      { label: "Triangulation et approche", outcome: 'next' },
      { label: "Ignorer et explorer ailleurs", outcome: { log: "Le signal est laissé de côté pour l'instant." } }
    ]
  },
  {
    id: 'intro_silence',
    tags: ['intro', 'aucune_vie'],
    weight: 4,
    text: "Aucun mouvement, aucun son hormis le vent contre les visières. {vaisseau} s'est posé sur un sol rocailleux. {biomeFrag}",
    choices: [
      { label: "Établir un périmètre et commencer la prospection", outcome: 'next' },
      { label: "Drone en éclaireur d'abord", req: { skill: { key: 'pilotage', min: 2 } }, outcome: { threat: -1, log: "Le drone repère un passage sûr." } }
    ]
  },

  // ============ RUINES HUMAINES ============
  {
    id: 'ruine_h_porte',
    tags: ['ruines_humaines'],
    weight: 5,
    text: "Une porte blindée scellée, gravure d'un logo corporate à demi effacé. Quelqu'un a tenté de la souder de l'intérieur.",
    choices: [
      { label: "Forcer l'ouverture", risky: { stat: 'vigueur', dc: 6,
          success: { loot: { metal: 30, cristal: 15 }, log: "La porte cède dans un grincement. Local de stockage." },
          fail:    { status: 'blessure_legere', target: 'random', log: "Un éclat de métal vient blesser un membre." } } },
      { label: "Couper avec un chalumeau", req: { skill: { key: 'ingenierie', min: 2 } },
        consume: { energie: 8 },
        outcome: { loot: { metal: 40, cristal: 20, datacubes: 3 }, log: "L'ingénieur découpe proprement la cloison." } },
      { label: "Passer son chemin", outcome: 'next' }
    ]
  },
  {
    id: 'ruine_h_journal',
    tags: ['ruines_humaines'],
    weight: 4,
    text: "Au sol, un terminal portable encore alimenté. Un journal personnel défile. La dernière entrée est paniquée — quelqu'un parle de \"choses dans les murs\".",
    choices: [
      { label: "Tout copier sur nos disques", outcome: { loot: { datacubes: 8 }, log: "Le journal est archivé pour analyse." } },
      { label: "Ne lire que les coordonnées mentionnées", risky: { stat: 'intellect', dc: 5,
          success: { loot: { datacubes: 4 }, log: "Cache repéré dans les fragments de texte." },
          fail:    { log: "Les passages utiles restent indéchiffrables." } } },
      { label: "Laisser le terminal en place", outcome: { morale: -1, log: "Personne ne dit rien, mais les visages se sont fermés." } }
    ]
  },
  {
    id: 'ruine_h_charnier',
    tags: ['ruines_humaines', 'sombre'],
    weight: 2,
    text: "Une salle entière. Des corps en combinaison, alignés. Pas une trace de violence visible.",
    choices: [
      { label: "Récupérer leur équipement", risky: { stat: 'sangfroid', dc: 6,
          success: { loot: { metal: 40, cristal: 30 }, item: 'outil_etrange', log: "L'équipement est en bon état." },
          fail:    { status: 'trauma_psy', target: 'random', morale: -2 } } },
      { label: "Photographier et partir", outcome: { morale: -1, log: "Personne ne sait quoi dire." } },
      { label: "Vérifier les badges d'identité", req: { skill: { key: 'science', min: 1 } },
        outcome: { loot: { datacubes: 5 }, morale: -1, log: "Une corporation pré-Effondrement, comme on s'en doutait." } }
    ]
  },

  // ============ RUINES ALIEN A (cristallines) ============
  {
    id: 'ruine_a_porte_scellee',
    tags: ['ruines_alien_a'],
    weight: 6,
    text: "Une porte de cristal opaque, gravée de motifs concentriques. Elle vibre légèrement quand on s'en approche.",
    choices: [
      { label: "Décoder les motifs", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { loot: { datacubes: 12 }, log: "Une séquence d'ouverture comprise. Salle d'archives à l'intérieur." } },
      { label: "Forcer avec un explosif", consume: { energie: 15 },
        risky: { stat: 'dexterite', dc: 7,
          success: { loot: { datacubes: 6 }, log: "La porte vole en éclats cristallins." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 1, log: "L'explosion mal calibrée blesse un opérateur." } } },
      { label: "Reculer", outcome: { log: "L'équipe fait demi-tour. Mauvais pressentiment." } }
    ]
  },
  {
    id: 'ruine_a_artefact',
    tags: ['ruines_alien_a'],
    weight: 4,
    text: "Un objet de la taille d'un poing, en lévitation au centre d'une niche. Aucun support visible. La gravité semble plier autour de lui.",
    choices: [
      { label: "Scanner avec le capteur xeno", req: { item: 'capteur_xeno' },
        outcome: { item: 'lentille_noire', loot: { datacubes: 22 }, log: "Le capteur révèle une signature unique. L'artefact est manipulé en sécurité." } },
      { label: "Le saisir", risky: { stat: 'sangfroid', dc: 6,
          success: { item: 'lentille_noire', loot: { datacubes: 5 }, log: "L'artefact se laisse prendre. Il est plus lourd qu'il n'y paraît." },
          fail:    { status: 'trauma_psy', target: 'random', log: "Quand il est touché, le porteur entend des voix qui ne sont pas là." } } },
      { label: "Analyser à distance", req: { skill: { key: 'science', min: 3 } },
        outcome: { loot: { datacubes: 18 }, log: "L'analyse spectrale révèle des informations précieuses sans contact." } },
      { label: "Photographier et ne pas toucher", outcome: { loot: { datacubes: 3 } } }
    ]
  },
  {
    id: 'ruine_a_couloir_chant',
    tags: ['ruines_alien_a', 'anomalie'],
    weight: 3,
    text: "Un long couloir de cristal. Quand on parle, la voix revient avec un délai d'une demi-seconde. Comme si quelque chose répétait après nous.",
    choices: [
      { label: "Avancer en silence", outcome: 'next' },
      { label: "Tester l'écho délibérément", risky: { stat: 'intellect', dc: 5,
          success: { loot: { datacubes: 8 }, log: "Les modulations contiennent un schéma. Encodé pour analyse." },
          fail:    { morale: -2, log: "Quelque chose dans les modulations donne mal au crâne." } } }
    ]
  },

  // ============ RUINES ALIEN B (organiques/coraline) ============
  {
    id: 'ruine_b_galerie',
    tags: ['ruines_alien_b'],
    weight: 5,
    text: "Les murs ne semblent pas construits — coulés, comme un nautile géant figé. La surface est tiède au toucher, et faiblement humide.",
    choices: [
      { label: "Prélever un échantillon de paroi", risky: { stat: 'dexterite', dc: 5,
          success: { loot: { biomasse: 15, datacubes: 8 }, log: "L'échantillon réagit bizarrement aux solvants standards." },
          fail:    { status: 'pathogene_alien', target: 'random', log: "Le contact direct n'a pas été aussi inerte qu'espéré." } } },
      { label: "Prélever sous protection sérum", consume: { item: 'serum_xeno' },
        outcome: { loot: { biomasse: 25, datacubes: 12 }, log: "Le sérum neutralise les pathogènes au contact. Échantillon précieux." } },
      { label: "Avancer sans rien toucher", outcome: 'next' }
    ]
  },
  {
    id: 'ruine_b_chambre_oeuf',
    tags: ['ruines_alien_b'],
    weight: 3,
    text: "Une chambre voûtée. Au centre, une structure en forme d'œuf, plus haute qu'un homme. Elle palpite très lentement, à la cadence d'une respiration.",
    choices: [
      { label: "Approcher avec déférence", req: { trait: 'sang_froid' },
        outcome: { loot: { datacubes: 20 }, item: 'anneau_scelle', log: "Au contact, l'œuf laisse couler une substance argentée. Récoltée avec soin." } },
      { label: "Frapper la coquille", risky: { stat: 'vigueur', dc: 8,
          success: { loot: { datacubes: 25, biomasse: 30 }, log: "La coquille cède. L'intérieur est inerte mais riche." },
          fail:    { status: 'pathogene_alien', target: 'random', threat: 2, log: "Une vapeur âcre s'échappe et se diffuse." } } },
      { label: "Prélever en sécurité avec sérum xeno", consume: { item: 'serum_xeno' },
        outcome: { loot: { datacubes: 30, biomasse: 20 }, item: 'anneau_scelle', log: "Le sérum neutralise les défenses de la coquille. Récolte propre." } },
      { label: "Sortir d'ici sans demander son reste", outcome: { log: "Sage décision." } }
    ]
  },

  // ============ FAUNE / FLORE HOSTILE ============
  {
    id: 'faune_predateur',
    tags: ['faune', 'predateurs'],
    weight: 5,
    text: "Une masse de muscle et de griffes émerge des herbes. Six yeux, quatre pattes, une mâchoire qui s'ouvre dans le mauvais sens.",
    choices: [
      { label: "Repousser au lance-flammes", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 50 }, log: "La créature recule devant les flammes, puis s'effondre." } },
      { label: "Tirer à l'arme à résonance", req: { item: 'arme_resonance' },
        outcome: { loot: { biomasse: 50, datacubes: 3 }, log: "Un seul tir. La créature se désintègre par fréquence." } },
      { label: "Combattre", risky: { stat: 'vigueur', dc: 6,
          success: { loot: { biomasse: 40 }, log: "La créature s'effondre. Récolte de matière organique." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 1 } } },
      { label: "Reculer en formation défensive", req: { skill: { key: 'combat', min: 2 } },
        outcome: { log: "L'équipe se replie sans pertes. La créature renonce." } },
      { label: "Laisser un appât et fuir", consume: { biomasse: 20 },
        outcome: { log: "La créature s'attaque à l'appât. On en profite pour passer." } }
    ]
  },
  {
    id: 'flore_lianes',
    tags: ['flore_agressive'],
    weight: 4,
    text: "Les lianes ne devraient pas bouger. Pourtant, elles convergent lentement vers la chaleur des combinaisons.",
    choices: [
      { label: "Brûler un passage au lance-flammes", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 35 }, log: "Le lance-flammes ouvre un couloir net dans les lianes." } },
      { label: "Brûler un passage au lance-flammes (improvisé)", consume: { energie: 12 },
        outcome: { loot: { biomasse: 25 }, log: "Bricolé avec la torche oxygène. Les lianes reculent." } },
      { label: "Avancer en restant immobile par moments", risky: { stat: 'sangfroid', dc: 7,
          success: { log: "L'équipe traverse comme des fantômes." },
          fail:    { status: 'blessure_legere', target: 'random' } } },
      { label: "Étudier la réaction biologique", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 6, biomasse: 15 }, log: "Échantillon précieux pour la recherche." } }
    ]
  },
  {
    id: 'faune_essaim',
    tags: ['faune'],
    weight: 4,
    text: "Un nuage de petites créatures volantes, denses, pas plus grosses qu'un pouce. Elles forment des motifs trop coordonnés pour être innocents.",
    choices: [
      { label: "Avancer normalement", risky: { stat: 'sangfroid', dc: 5,
          success: { log: "L'essaim contourne sans attaquer." },
          fail:    { status: 'blessure_legere', target: 'random', morale: -1 } } },
      { label: "Lâcher une grenade fumigène", consume: { energie: 5 },
        outcome: { log: "L'essaim se disperse. Passage tranquille." } }
    ]
  },

  // ============ ANOMALIES ============
  {
    id: 'anomalie_silence',
    tags: ['anomalie'],
    weight: 3,
    text: "Une zone de silence parfait. Le vent s'arrête à une frontière nette. À l'intérieur, on n'entend même pas sa propre voix.",
    choices: [
      { label: "Traverser rapidement", risky: { stat: 'sangfroid', dc: 6,
          success: { loot: { datacubes: 10 }, log: "De l'autre côté, les capteurs ont enregistré des données précieuses." },
          fail:    { status: 'trauma_psy', target: 'random' } } },
      { label: "Contourner", outcome: { log: "Le détour fait perdre du temps mais évite le risque." } },
      { label: "Envoyer notre drone éclaireur", req: { item: 'drone_eclaireur' },
        outcome: { loot: { datacubes: 14 }, log: "Le drone enregistre l'anomalie sans danger pour l'équipage." } },
      { label: "Envoyer un drone d'appoint", req: { skill: { key: 'pilotage', min: 2 } },
        outcome: { loot: { datacubes: 6 }, log: "Le drone improvisé enregistre l'anomalie sans danger." } }
    ]
  },
  {
    id: 'anomalie_double',
    tags: ['anomalie'],
    weight: 2,
    text: "Au détour d'une crête, un membre de l'équipe en aperçoit un autre — eux-mêmes — en train de regarder dans la direction opposée. Ça ne dure qu'une seconde.",
    choices: [
      { label: "Faire comme si de rien n'était", outcome: { morale: -2, log: "L'équipe avance sans en parler. Mais personne ne l'a oublié." } },
      { label: "Enregistrer et analyser", req: { skill: { key: 'science', min: 3 } },
        outcome: { loot: { datacubes: 15 }, log: "L'enregistrement contient des artefacts temporels mesurables." } }
    ]
  },

  // ============ SIGNAL / TRANSMISSION ============
  {
    id: 'signal_balise',
    tags: ['signal_sos'],
    weight: 5,
    text: "La balise est encore active. À côté d'elle, des restes humanoïdes en combinaison ancienne. La date d'émission remonte à plus de cent ans.",
    choices: [
      { label: "Récupérer la balise", outcome: { item: 'disque_memoire', loot: { datacubes: 8 }, log: "La balise contient un message complet, archivé." } },
      { label: "Récupérer aussi les effets personnels", risky: { stat: 'sangfroid', dc: 5,
          success: { item: 'disque_memoire', loot: { datacubes: 12, metal: 10 }, morale: -1, log: "Tout est récupéré. C'est lourd." },
          fail:    { morale: -2, log: "L'équipe ressort secouée. La balise est toute la récolte." } } }
    ]
  },
  {
    id: 'signal_crypte_emetteur',
    tags: ['signal_crypte'],
    weight: 3,
    text: "L'émetteur est une boîte enterrée dans le sol, à peine plus grosse qu'un poing. Aucune indication d'origine. La transmission continue sans interruption.",
    choices: [
      { label: "Désactiver et emporter", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { item: 'bobine_filaments', loot: { datacubes: 10 }, log: "L'émetteur cesse d'émettre. On l'embarque." } },
      { label: "Tenter de décoder la transmission sur place", req: { skill: { key: 'linguistique', min: 3 } },
        outcome: { loot: { datacubes: 20 }, log: "Le message est partiellement compris. Inquiétant." } },
      { label: "Laisser tel quel", outcome: 'next' }
    ]
  },

  // ============ ÉPAVES & STATIONS ============
  {
    id: 'epave_passerelle',
    tags: ['epave', 'station'],
    weight: 5,
    text: "La passerelle de commandement est éventrée. Les écrans clignotent encore par moments. Quelqu'un a programmé une boucle de message d'urgence.",
    choices: [
      { label: "Récupérer le journal de bord", outcome: { loot: { datacubes: 12 }, log: "Le journal de bord est intégré à la cargaison." } },
      { label: "Démonter la console pour les composants", req: { skill: { key: 'ingenierie', min: 1 } },
        outcome: { loot: { metal: 20, cristal: 30, datacubes: 4 }, log: "Démontage proprement effectué." } }
    ]
  },
  {
    id: 'epave_soute',
    tags: ['epave', 'station'],
    weight: 4,
    text: "La soute. Dans le vide silencieux, des conteneurs flottent en grappes lentes. Beaucoup sont scellés.",
    choices: [
      { label: "Ouvrir au hasard", risky: { stat: 'dexterite', dc: 5,
          success: { loot: { metal: 40, cristal: 25, biomasse: 15 }, log: "Conteneurs ouverts, cargo standard récupéré." },
          fail:    { status: 'blessure_legere', target: 'random', log: "Un conteneur sous pression a éclaté à l'ouverture." } } },
      { label: "Identifier les codes d'inventaire", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { metal: 30, cristal: 35, datacubes: 8 }, log: "Les conteneurs les plus précieux sont identifiés et embarqués en priorité." } }
    ]
  },
  {
    id: 'station_ia',
    tags: ['station', 'ia_hostile'],
    weight: 3,
    text: "Les portes claquent dans notre dos. Un haut-parleur grésille : « Vous n'avez pas l'autorisation. Restez où vous êtes. »",
    choices: [
      { label: "Tenter de raisonner", req: { skill: { key: 'linguistique', min: 2 } },
        risky: { stat: 'intellect', dc: 6,
          success: { loot: { datacubes: 18 }, log: "L'IA accepte un protocole d'invitation. Accès partiel obtenu." },
          fail:    { status: 'trauma_psy', target: 'random', threat: 2 } } },
      { label: "Forcer le passage", req: { skill: { key: 'combat', min: 2 } },
        risky: { stat: 'vigueur', dc: 7,
          success: { loot: { metal: 30, datacubes: 8 }, log: "Les portes cèdent. L'IA reste silencieuse ensuite." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 2 } } },
      { label: "Battre en retraite", outcome: { retreat: true, log: "L'équipe fait demi-tour vers le sas. Pas d'héroïsme aujourd'hui." } }
    ]
  },

  // ============ TEMPÊTE / DANGER ENVIRONNEMENTAL ============
  {
    id: 'tempete',
    tags: ['tempetes'],
    weight: 5,
    text: "Le ciel vire à l'ocre en quelques minutes. L'horizon est avalé par un mur de poussière en approche.",
    choices: [
      { label: "S'abriter et attendre", outcome: { log: "L'équipe se met à l'abri pendant que la tempête passe." } },
      { label: "Tenter de continuer", risky: { stat: 'sangfroid', dc: 7,
          success: { log: "L'équipe traverse la tempête sans dommage majeur." },
          fail:    { status: 'blessure_legere', target: 'random', morale: -1 } } },
      { label: "Renforcer les combinaisons avec un kit de réparation", consume: { item: 'kit_reparation' },
        outcome: { log: "Les combinaisons tiennent malgré le sable abrasif. L'équipe traverse." } },
      { label: "Replier le campement et regagner le vaisseau", outcome: { retreat: true, log: "L'équipe choisit la prudence et regagne le bord." } }
    ]
  },
  {
    id: 'faille',
    tags: ['faille'],
    weight: 3,
    text: "Le sol s'effondre sans prévenir. Quelqu'un a juste le temps de s'agripper.",
    choices: [
      { label: "Faire la chaîne pour le remonter", risky: { stat: 'vigueur', dc: 6,
          success: { log: "L'équipe le hisse en sécurité. Sueurs froides." },
          fail:    { status: 'blessure_grave', target: 'specific', log: "La chute est mal contrôlée." } } },
      { label: "Descendre voir ce qu'il y a en bas", req: { trait: 'sang_froid' },
        outcome: { loot: { metal: 25, cristal: 20, datacubes: 5 }, log: "La crevasse abritait un dépôt naturel." } }
    ]
  },

  // ============ CIVILISATIONS ============
  {
    id: 'civ_active_rencontre',
    tags: ['civ_active'],
    weight: 4,
    text: "Une silhouette se tient à découvert. Elle ne porte pas d'arme. Elle attend.",
    choices: [
      { label: "Tenter le contact", req: { skill: { key: 'linguistique', min: 1 } },
        risky: { stat: 'charisme', dc: 6,
          success: { loot: { datacubes: 15 }, item: 'plaque_gravee', reputation: +10, log: "Échange réussi. La silhouette offre un objet en signe d'accord." },
          fail:    { threat: 1, morale: -1, reputation: -5, log: "Le contact tourne mal sans dégénérer. La silhouette se retire." } } },
      { label: "Se retirer en silence", outcome: { log: "Personne ne tire. Personne ne bouge. Et puis, c'est fini." } }
    ]
  },
  {
    id: 'civ_dechue_temple',
    tags: ['civ_dechue'],
    weight: 4,
    text: "Un temple, peut-être. Ou un mausolée. Les statues sont à demi affaissées dans la roche, érodées au point d'être méconnaissables.",
    choices: [
      { label: "Inspecter l'autel", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 14 }, item: 'plaque_gravee', log: "L'autel contient un dispositif technologique camouflé en pierre." } },
      { label: "Profaner pour récupérer le métal", risky: { stat: 'sangfroid', dc: 6,
          success: { loot: { metal: 50, cristal: 20 }, morale: -2, log: "Métal récupéré, mais l'équipe ne se regarde plus pareil." },
          fail:    { status: 'trauma_psy', target: 'random', morale: -3 } } },
      { label: "Repartir en respectant les lieux", outcome: { morale: +1 } }
    ]
  },

  // ============ FILLER / TRANSITION ============
  {
    id: 'filler_repos',
    tags: ['filler'],
    weight: 3,
    text: "L'équipe fait halte. Le casque retiré, on respire — autant que l'air le permet. Quelqu'un partage une ration. Le silence est presque confortable.",
    choices: [
      { label: "Repartir", outcome: 'next' },
      { label: "Discuter du retour", outcome: { morale: +1, log: "L'équipage est plus soudé." } }
    ]
  },
  {
    id: 'filler_panorama',
    tags: ['filler'],
    weight: 2,
    text: "Au détour d'une dune, le paysage s'ouvre. {biomeFrag} Quelqu'un sort un appareil et prend une photo, comme un touriste.",
    choices: [
      { label: "Continuer", outcome: 'next' },
      { label: "Faire un détour pour relever des données", req: { skill: { key: 'science', min: 1 } },
        outcome: { loot: { datacubes: 4 } } }
    ]
  },
  {
    id: 'filler_cache',
    tags: ['filler'],
    weight: 3,
    text: "Quelqu'un trébuche sur quelque chose dans le sol. En grattant, un compartiment apparaît, scellé sommairement.",
    choices: [
      { label: "Ouvrir", outcome: { loot: { metal: 20, cristal: 10 } } },
      { label: "Forcer rapidement", risky: { stat: 'dexterite', dc: 5,
          success: { loot: { metal: 30, cristal: 20, datacubes: 3 } },
          fail:    { status: 'blessure_legere', target: 'random' } } }
    ]
  },

  // ============ BIOME — JUNGLE ============
  {
    id: 'jungle_canopee',
    tags: ['biome_jungle'],
    weight: 4,
    text: "La canopée filtre la lumière en bandes vertes. À chaque pas, des choses se déplacent dans les feuillages, juste hors de vue.",
    choices: [
      { label: "Avancer en file indienne", risky: { stat: 'sangfroid', dc: 5,
          success: { loot: { biomasse: 25 }, log: "L'équipe traverse sans incident notable." },
          fail:    { status: 'blessure_legere', target: 'random', log: "Une racine, une branche, ou autre chose. Quelqu'un a saigné." } } },
      { label: "Brûler un passage", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 40 }, log: "Le lance-flammes ouvre un sentier net." } },
      { label: "Déployer le drone éclaireur", req: { item: 'drone_eclaireur' },
        outcome: { loot: { biomasse: 20, datacubes: 6 }, log: "Le drone cartographie les passages sûrs." } }
    ]
  },
  {
    id: 'jungle_arbre_sage',
    tags: ['biome_jungle'],
    weight: 2,
    text: "Au cœur de la jungle, un arbre seul, dix fois plus haut que les autres. Son tronc est creusé de cavités symétriques. On dirait qu'il respire.",
    choices: [
      { label: "Étudier l'arbre", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 14, biomasse: 20 }, log: "L'arbre est un organisme cognitif. Données précieuses." } },
      { label: "Prélever du tissu", risky: { stat: 'dexterite', dc: 6,
          success: { loot: { biomasse: 35 }, log: "Tissu récupéré. L'arbre n'a pas réagi." },
          fail:    { status: 'pathogene_alien', target: 'random', log: "Quelque chose dans la sève s'accroche à la peau." } } },
      { label: "Passer son chemin", outcome: { morale: +1, log: "Personne n'a touché. Personne ne le regrette." } }
    ]
  },

  // ============ BIOME — DÉSERT ============
  {
    id: 'desert_oasis',
    tags: ['biome_desert'],
    weight: 3,
    text: "Au creux des dunes, un point d'eau saumâtre. Autour, des squelettes alignés comme s'ils s'y étaient traînés.",
    choices: [
      { label: "Analyser l'eau", req: { skill: { key: 'medecine', min: 1 } },
        outcome: { loot: { datacubes: 6 }, log: "L'eau est piégée chimiquement. On comprend les squelettes." } },
      { label: "Ramener un échantillon", risky: { stat: 'dexterite', dc: 5,
          success: { loot: { biomasse: 15, datacubes: 4 }, log: "Échantillon scellé. La curiosité l'emporte." },
          fail:    { status: 'pathogene_alien', target: 'random', log: "Quelque chose dans l'eau a traversé le scellé." } } },
      { label: "Poser une balise et continuer", req: { item: 'balise_signal' },
        outcome: { loot: { datacubes: 8 }, log: "Site marqué pour études futures." } }
    ]
  },
  {
    id: 'desert_carcasse',
    tags: ['biome_desert', 'biome_irradie'],
    weight: 3,
    text: "Une carcasse métallique à demi enfouie. Un véhicule d'exploration ancien, marqué d'un sigle corporate effacé par les vents.",
    choices: [
      { label: "Démonter pour les pièces", req: { skill: { key: 'ingenierie', min: 1 } },
        outcome: { loot: { metal: 35, cristal: 15 }, log: "L'épave livre ses dernières ressources." } },
      { label: "Fouiller le poste de pilotage", outcome: { item: 'disque_memoire', loot: { datacubes: 5 }, log: "Un journal de bord récupéré. Le pilote n'a pas été récupéré." } }
    ]
  },

  // ============ BIOME — GLACE / TOUNDRA ============
  {
    id: 'glace_silhouette',
    tags: ['biome_glace', 'biome_toundra'],
    weight: 3,
    text: "Quelque chose est figé dans la glace, à un mètre de profondeur. Une silhouette humanoïde. Très grande. Très ancienne.",
    choices: [
      { label: "Découper un bloc autour", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { loot: { datacubes: 18, cristal: 20 }, log: "Le bloc est extrait avec son contenu. Trouvaille majeure." } },
      { label: "Photographier et marquer le site", req: { item: 'balise_signal' },
        outcome: { loot: { datacubes: 10 }, log: "Site marqué. Une expédition scientifique reviendra." } },
      { label: "Tenter de dégager à la chaleur", consume: { energie: 8 },
        risky: { stat: 'sangfroid', dc: 7,
          success: { loot: { datacubes: 12 }, log: "La chaleur révèle des détails troublants." },
          fail:    { status: 'trauma_psy', target: 'random', log: "Sous la glace, quelque chose a bougé." } } }
    ]
  },
  {
    id: 'glace_geyser',
    tags: ['biome_glace'],
    weight: 3,
    text: "Le sol s'ouvre brusquement et un geyser d'eau bouillante jaillit à dix mètres. Puis un autre. Puis un autre.",
    choices: [
      { label: "Reculer rapidement", outcome: { log: "L'équipe se met à l'abri. Spectacle impressionnant." } },
      { label: "Capter l'énergie thermique", req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: { loot: { energie: 25, datacubes: 5 }, log: "Improvisation géniale. Le vaisseau récupère l'énergie." } },
      { label: "Poser une sonde", req: { item: 'capteur_xeno' },
        outcome: { loot: { datacubes: 18 }, log: "Le capteur révèle une activité géothermique cohérente avec une vie souterraine." } }
    ]
  },

  // ============ BIOME — VOLCANIQUE ============
  {
    id: 'volcan_coulee',
    tags: ['biome_volcanique'],
    weight: 4,
    text: "Une coulée de lave fraîche bloque la route. Les abords sont brûlants, l'air sature les filtres.",
    choices: [
      { label: "Contourner par les hauts", risky: { stat: 'vigueur', dc: 6,
          success: { log: "Détour épuisant mais sans dommage." },
          fail:    { status: 'blessure_legere', target: 'random', morale: -1 } } },
      { label: "Récupérer du verre volcanique", req: { skill: { key: 'science', min: 1 } },
        outcome: { loot: { cristal: 30, datacubes: 4 }, log: "Cristaux thermo-formés récupérés." } },
      { label: "Faire demi-tour", outcome: { log: "Le détour est trop long. On rebrousse chemin." } }
    ]
  },
  {
    id: 'volcan_sphere',
    tags: ['biome_volcanique', 'ruines_alien_a'],
    weight: 2,
    text: "Une sphère parfaite de pierre noire émerge de la cendre, bizarrement froide au toucher malgré la chaleur ambiante.",
    choices: [
      { label: "Scanner avec capteur xeno", req: { item: 'capteur_xeno' },
        outcome: { blueprint: 'alien_a', loot: { datacubes: 18 }, log: "La sphère est une matrice de données. Lecture partielle." } },
      { label: "Étudier longuement", req: { skill: { key: 'science', min: 3 } },
        outcome: { loot: { datacubes: 15, cristal: 20 }, log: "Étude approfondie. La sphère résiste à toutes les fréquences sauf une." } },
      { label: "L'embarquer entière", risky: { stat: 'vigueur', dc: 7,
          success: { item: 'lentille_noire', loot: { datacubes: 8 }, log: "Lourde mais transportable." },
          fail:    { status: 'blessure_grave', target: 'random', log: "La sphère est plus dense qu'elle n'en a l'air." } } }
    ]
  },

  // ============ BIOME — IRRADIÉ ============
  {
    id: 'irradie_silos',
    tags: ['biome_irradie', 'ruines_humaines'],
    weight: 3,
    text: "Une rangée de silos en béton, certains éventrés. Des compteurs Geiger qui crachotent. Quelqu'un a stocké quelque chose ici, longtemps.",
    choices: [
      { label: "Inspecter avec combinaisons normales", risky: { stat: 'sangfroid', dc: 7,
          success: { loot: { metal: 20, datacubes: 8 }, log: "Inspection rapide. Quelques découvertes mais le compteur est devenu hystérique." },
          fail:    { status: 'pathogene_alien', target: 'random', log: "Doses absorbées trop élevées." } } },
      { label: "Inspecter avec combinaison adaptive", req: { item: 'combinaison_xeno' },
        outcome: { loot: { metal: 30, datacubes: 14 }, log: "La combinaison filtre tout. Inspection thorough sans risque." } },
      { label: "Inspecter avec combinaison renforcée", req: { item: 'combinaison_renforcee' },
        outcome: { loot: { metal: 25, datacubes: 10 }, log: "Le blindage tient bon. Récupération efficace." } },
      { label: "Trop dangereux. On contourne.", outcome: { log: "Sage décision." } }
    ]
  },

  // ============ BIOME — OCÉAN ============
  {
    id: 'ocean_creature',
    tags: ['biome_ocean', 'faune'],
    weight: 2,
    text: "Quelque chose remue à la surface, à cent mètres du débarquement. C'est gros. Très gros. Et ça vient vers nous.",
    choices: [
      { label: "Tirer sommation au lance-flammes", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 60 }, log: "Le rugissement de feu fait fuir la créature. Au passage, elle laisse un fragment." } },
      { label: "Reculer vers le vaisseau", outcome: { retreat: false, log: "L'équipe se replie. La créature ne suit pas hors de l'eau." } },
      { label: "Tenter le contact (Linguistique)", req: { skill: { key: 'linguistique', min: 3 } },
        risky: { stat: 'sangfroid', dc: 8,
          success: { loot: { datacubes: 25, biomasse: 30 }, log: "Une forme de communication. La créature offre un fragment de sa peau." },
          fail:    { status: 'trauma_psy', target: 'random', threat: 2, log: "Quelque chose a essayé de répondre. Ce n'était pas amical." } } }
    ]
  },

  // ============ BIOME — ASTÉROÏDE ============
  {
    id: 'asteroide_filon',
    tags: ['biome_asteroide'],
    weight: 5,
    text: "Le rocher est creux d'un filon dense. Les capteurs s'emballent : métal pur, presque sans impuretés.",
    choices: [
      { label: "Extraire avec les outils standards", outcome: { loot: { metal: 50, cristal: 10 }, log: "Filon exploité." } },
      { label: "Utiliser le kit de réparation pour fixer un système d'extraction", consume: { item: 'kit_reparation' },
        outcome: { loot: { metal: 80, cristal: 25 }, log: "Le système improvisé double le rendement." } }
    ]
  },
  {
    id: 'asteroide_fossile',
    tags: ['biome_asteroide'],
    weight: 2,
    text: "Dans une fissure profonde du rocher, des structures cristallines régulières. Ce ne sont pas des cristaux naturels.",
    choices: [
      { label: "Scanner au capteur xeno", req: { item: 'capteur_xeno' },
        outcome: { blueprint: 'alien_a', loot: { datacubes: 16, cristal: 20 }, log: "Vestige technologique fossilisé. Capté." } },
      { label: "Extraire avec précaution", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { cristal: 40, datacubes: 10 }, log: "Échantillons préservés." } }
    ]
  },

  // ============ ATMOSPHÈRE TOXIQUE ============
  {
    id: 'atm_toxique_filtre',
    tags: ['atm_toxique'],
    weight: 4,
    text: "Les filtres saturent en moins d'une heure. L'air corrode les soudures. Chaque minute coûte de l'équipement.",
    choices: [
      { label: "Tenir avec combinaison adaptive", req: { item: 'combinaison_xeno' },
        outcome: { loot: { datacubes: 12 }, log: "La membrane vit avec l'air. Aucune dégradation." } },
      { label: "Tenir avec combinaison renforcée", req: { item: 'combinaison_renforcee' },
        outcome: { loot: { datacubes: 6 }, log: "Le blindage tient juste assez longtemps." } },
      { label: "Repli rapide", outcome: { log: "L'équipe regagne le sas avant saturation." } },
      { label: "Pousser jusqu'à saturation", risky: { stat: 'sangfroid', dc: 8,
          success: { loot: { datacubes: 8 }, log: "Limite atteinte de justesse." },
          fail:    { status: 'blessure_grave', target: 'random', log: "Un filtre a lâché. Le porteur a respiré." } } }
    ]
  },

  // ============ FAUNE — SCÈNES SUPPLÉMENTAIRES ============
  {
    id: 'faune_meute',
    tags: ['faune', 'predateurs'],
    weight: 3,
    text: "Des silhouettes basses dans la pénombre, en demi-cercle. Elles ne grognent pas. Elles attendent.",
    choices: [
      { label: "Lance-flammes en arc", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 45 }, log: "Le mur de feu disperse la meute. Quelques carcasses récupérées." } },
      { label: "Tirer en l'air avec arme à résonance", req: { item: 'arme_resonance' },
        outcome: { loot: { biomasse: 30 }, log: "Le pulse fait fuir la meute sans la tuer. Elle laisse une carcasse." } },
      { label: "Reculer sans courir", risky: { stat: 'sangfroid', dc: 7,
          success: { log: "Personne n'a couru. La meute se désintéresse." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 1 } } },
      { label: "Lancer une ration comme appât", consume: { item: 'ration_concentree' },
        outcome: { log: "La meute se jette sur la ration. L'équipe passe." } }
    ]
  },
  {
    id: 'faune_trace',
    tags: ['faune'],
    weight: 3,
    text: "Une trace fraîche dans le sol meuble. Quelque chose de grand, de lourd, est passé ici dans l'heure.",
    choices: [
      { label: "Suivre la piste", req: { skill: { key: 'survie', min: 2 } },
        risky: { stat: 'dexterite', dc: 6,
          success: { loot: { biomasse: 35, datacubes: 4 }, log: "Suivi réussi. La piste mène à un nid abandonné, riche en matière." },
          fail:    { status: 'blessure_legere', target: 'random', log: "Embuscade. La créature attendait." } } },
      { label: "Marquer et éviter", req: { item: 'balise_signal' },
        outcome: { loot: { datacubes: 5 }, log: "Site marqué pour études zoologiques futures." } },
      { label: "Continuer l'exploration", outcome: 'next' }
    ]
  },

  // ============ FLORE — SCÈNES SUPPLÉMENTAIRES ============
  {
    id: 'flore_pollen',
    tags: ['flore_agressive'],
    weight: 3,
    text: "Les fleurs s'ouvrent en cascade au passage de l'équipe et libèrent un pollen pourpre dense.",
    choices: [
      { label: "Filtres au max et avancer", risky: { stat: 'sangfroid', dc: 6,
          success: { log: "Les filtres tiennent." },
          fail:    { status: 'pathogene_alien', target: 'random' } } },
      { label: "Combinaison adaptive", req: { item: 'combinaison_xeno' },
        outcome: { loot: { biomasse: 20, datacubes: 6 }, log: "La membrane filtre le pollen et en analyse la composition." } },
      { label: "Récolter du pollen", risky: { stat: 'dexterite', dc: 5,
          success: { loot: { biomasse: 20 }, log: "Échantillons prélevés en sécurité." },
          fail:    { status: 'pathogene_alien', target: 'random' } } }
    ]
  },

  // ============ ANOMALIES SUPPLÉMENTAIRES ============
  {
    id: 'anomalie_temps',
    tags: ['anomalie'],
    weight: 2,
    text: "Les montres montrent des heures différentes selon l'endroit où on se trouve. Au centre du phénomène, elles tournent à l'envers.",
    choices: [
      { label: "Mesurer avec capteur xeno", req: { item: 'capteur_xeno' },
        outcome: { loot: { datacubes: 25 }, log: "Anomalie temporelle quantifiée. Données rares." } },
      { label: "Étudier l'épicentre", req: { skill: { key: 'science', min: 3 } },
        risky: { stat: 'sangfroid', dc: 7,
          success: { loot: { datacubes: 18 }, log: "Étude réussie. Les données sont cohérentes après recalibration." },
          fail:    { status: 'trauma_psy', target: 'random', log: "Perte temporaire de continuité personnelle." } } },
      { label: "Cartographier les frontières", outcome: { loot: { datacubes: 8 } } }
    ]
  },
  {
    id: 'anomalie_gravite',
    tags: ['anomalie'],
    weight: 2,
    text: "Une zone où la gravité s'inverse. Des galets flottent à hauteur de visière. Quelqu'un essaie de marcher au plafond.",
    choices: [
      { label: "Étudier le phénomène", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 15, cristal: 10 }, log: "Mesures précieuses. Anomalie répertoriée." } },
      { label: "Traverser en s'accrochant", risky: { stat: 'dexterite', dc: 6,
          success: { loot: { datacubes: 8 }, log: "Traversée acrobatique réussie." },
          fail:    { status: 'blessure_legere', target: 'random' } } },
      { label: "Contourner", outcome: 'next' }
    ]
  },

  // ============ STATIONS / ÉPAVES SUPPLÉMENTAIRES ============
  {
    id: 'station_serres',
    tags: ['station'],
    weight: 3,
    text: "Une serre hydroponique abandonnée. Les plantes ont survécu, ont muté. Certaines sont énormes, d'autres luminescentes.",
    choices: [
      { label: "Récolter les souches", outcome: { loot: { biomasse: 50, datacubes: 4 }, log: "Souches mutantes embarquées. Notre hydroponie va y gagner." } },
      { label: "Échantillonnage sélectif", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { biomasse: 70, datacubes: 12 }, log: "Sélection précise. Les meilleures souches sont identifiées." } },
      { label: "Tout brûler par sécurité", req: { item: 'lance_flammes' },
        outcome: { loot: { datacubes: 3 }, morale: -1, log: "L'équipe préfère ne prendre aucun risque. Les serres flambent." } }
    ]
  },
  {
    id: 'epave_dormeur',
    tags: ['epave', 'sombre'],
    weight: 2,
    text: "Une capsule cryogénique encore alimentée. À l'intérieur, une silhouette humaine. Les capteurs vitaux clignotent — toujours en vie, après tout ce temps.",
    choices: [
      { label: "Réveiller", req: { skill: { key: 'medecine', min: 3 } },
        risky: { stat: 'sangfroid', dc: 7,
          success: { loot: { datacubes: 20 }, morale: +2, log: "Le réveil se passe. Le dormeur ne parle pas, mais transmet ses souvenirs au scanner." },
          fail:    { status: 'trauma_psy', target: 'random', morale: -2, log: "Quelque chose a mal tourné. Le dormeur ne s'est pas réveillé." } } },
      { label: "Récupérer la cryogénie pour pièces", outcome: { loot: { metal: 30, cristal: 25, datacubes: 5 }, morale: -1, log: "L'équipe a fait un choix difficile." } },
      { label: "Laisser dormir et marquer le site", req: { item: 'balise_signal' },
        outcome: { loot: { datacubes: 4 }, morale: +1, log: "Le dormeur reste en sécurité. Une expédition future décidera." } }
    ]
  },

  // ============ CIVILISATIONS — TROC, NÉGOCIATION, CONFLIT ============
  {
    id: 'civ_troc',
    tags: ['civ_active'],
    weight: 4,
    text: "Un groupe se présente avec des objets en évidence. Pas d'armes apparentes. C'est clairement une proposition.",
    choices: [
      { label: "Échanger des datacubes contre leurs offrandes", consume: { datacubes: 15 },
        outcome: { item: 'plaque_gravee', loot: { biomasse: 25 }, reputation: +8, log: "L'échange est équitable. Geste de bonne foi établi." } },
      { label: "Échanger une ration contre un objet", consume: { item: 'ration_concentree' },
        outcome: { loot: { datacubes: 8 }, reputation: +5, log: "La ration est bien reçue. On obtient un fragment d'information." } },
      { label: "Tenter de comprendre leur monnaie", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { loot: { datacubes: 12 }, reputation: +3, log: "Système d'échange compris. Connaissance précieuse." } },
      { label: "Décliner poliment", outcome: { log: "L'équipe se retire avec respect." } },
      { label: "Saisir leurs offrandes par la force", risky: { stat: 'combat', dc: 5,
          success: { loot: { biomasse: 30, datacubes: 8 }, reputation: -25, log: "Les offrandes sont prises. Les regards aussi.", morale: -2 },
          fail:    { status: 'blessure_grave', target: 'random', reputation: -35, log: "Le groupe ripostait mieux qu'attendu." } } }
    ]
  },
  {
    id: 'civ_negociation',
    tags: ['civ_active'],
    weight: 3,
    text: "Une délégation, manifestement officielle. L'un d'eux porte un emblème. Ils veulent négocier quelque chose.",
    choices: [
      { label: "Mener la négociation", req: { skill: { key: 'linguistique', min: 2 } },
        risky: { stat: 'charisme', dc: 7,
          success: { blueprint: ['humain', 'mixte'], loot: { datacubes: 20 }, reputation: +15, log: "Accord conclu. Échange de plans techniques en signe de paix." },
          fail:    { threat: 1, reputation: -10, log: "Malentendu culturel. La délégation se retire, vexée." } } },
      { label: "Offrir un sérum xeno comme cadeau", req: { item: 'serum_xeno' }, consume: { item: 'serum_xeno' },
        outcome: { item: 'plaque_gravee', loot: { datacubes: 18 }, reputation: +20, log: "Le sérum impressionne. La délégation offre un cadeau réciproque." } },
      { label: "Saluer et prendre congé", outcome: { morale: +1, reputation: +2, log: "Geste respectueux apprécié des deux côtés." } }
    ]
  },
  {
    id: 'civ_dechue_oracle',
    tags: ['civ_dechue'],
    weight: 2,
    text: "Une silhouette ancienne, dernière représentante d'une civilisation effondrée. Elle attend dans l'embrasure d'un sanctuaire.",
    choices: [
      { label: "Écouter sa parole", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { blueprint: ['humain', 'mixte'], loot: { datacubes: 18 }, morale: +2, reputation: +10, log: "Mémoire d'une civilisation transmise. Geste sacré." } },
      { label: "Lui apporter du réconfort", req: { trait: 'charisma' },
        outcome: { item: 'plaque_gravee', loot: { datacubes: 10 }, morale: +1, reputation: +5, log: "L'oracle remet un objet en signe de gratitude." } },
      { label: "S'en aller respectueusement", outcome: { morale: +1, log: "L'oracle hoche la tête. Une dernière fois." } }
    ]
  },

  // ============ SCÈNES PERSONNELLES (TRAITS) ============
  {
    id: 'trait_voix_murmure',
    tags: ['anomalie'],
    weight: 2,
    text: "L'un d'entre vous se fige soudain. \"Je l'entends\", chuchote-t-il. Personne d'autre n'entend rien.",
    choices: [
      { label: "Suivre ce qu'il décrit", req: { trait: 'voix_murmurent' },
        outcome: { loot: { datacubes: 22, cristal: 15 }, item: 'fragment_cristallin', log: "La voix le guide vers une cache. Quelqu'un savait qu'il viendrait." } },
      { label: "Le ramener au vaisseau pour examen", outcome: { morale: -1, log: "Décision prudente. L'équipe rebrousse chemin." } },
      { label: "Ignorer et continuer", risky: { stat: 'sangfroid', dc: 7,
          success: { log: "L'équipe avance. La voix s'éloigne." },
          fail:    { status: 'trauma_psy', target: 'specific', morale: -2, log: "Le porteur se prend la tête entre les mains." } } }
    ]
  },
  {
    id: 'trait_eidetique',
    tags: ['ruines', 'sombre'],
    weight: 2,
    text: "Les murs sont couverts de glyphes, gravés sur dix mètres de haut. Personne ne pourrait tout retenir.",
    choices: [
      { label: "Mémoriser intégralement", req: { trait: 'memoire_eidetique' },
        outcome: { blueprint: 'auto', loot: { datacubes: 28 }, log: "Tout est dans une seule mémoire. Précieux." } },
      { label: "Photographier méthodiquement", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 14 }, log: "Documentation systématique. Suffisant pour l'analyse." } },
      { label: "Échantillon partiel", outcome: { loot: { datacubes: 5 } } }
    ]
  },
  {
    id: 'trait_beni',
    tags: ['danger', 'predateurs', 'tempetes'],
    weight: 1,
    text: "Une situation devrait être catastrophique. Et pourtant, par un alignement improbable, tout se passe bien.",
    choices: [
      { label: "Saisir l'occasion", req: { trait: 'beni' },
        outcome: { loot: { metal: 25, cristal: 25, datacubes: 12 }, morale: +2, log: "L'équipe ressort intacte d'un guêpier qui aurait dû la coûter cher." } },
      { label: "Reculer prudemment", outcome: { log: "Sage. La situation aurait pu basculer." } }
    ]
  },

  // ============ SCÈNES BOSS (rares, gros enjeu) ============
  {
    id: 'boss_alien_gardien',
    tags: ['ruines_alien_a', 'predateurs'],
    weight: 1,
    text: "Au cœur de la ruine cristalline, une chose s'éveille. Trois mètres de haut. Faite de la même matière que les murs. Elle nous regarde.",
    choices: [
      { label: "Combattre à l'arme à résonance", req: { item: 'arme_resonance' },
        risky: { stat: 'combat', dc: 7,
          success: { blueprint: 'alien_a', loot: { datacubes: 50, cristal: 60 }, log: "Le Gardien s'effondre en éclats lumineux. Trésor inouï." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 3, retreat: true, log: "Le combat est trop déséquilibré. Repli en urgence." } } },
      { label: "Tenter une négociation rituelle", req: { skill: { key: 'linguistique', min: 4 } },
        risky: { stat: 'charisme', dc: 9,
          success: { blueprint: 'alien_a', item: 'lentille_noire', loot: { datacubes: 80 }, log: "Le Gardien reconnaît un protocole. Il offre un don avant de retourner au sommeil." },
          fail:    { status: 'trauma_psy', target: 'random', threat: 2, retreat: true, log: "Mauvais signe. Le Gardien charge." } } },
      { label: "Battre en retraite", outcome: { retreat: true, log: "L'équipe rebrousse chemin sans bruit." } }
    ]
  },
  {
    id: 'boss_essaim_organique',
    tags: ['ruines_alien_b', 'pathogene'],
    weight: 1,
    text: "Des milliers de créatures translucides, à peine plus grosses qu'un poing, surgissent des galeries. Elles convergent.",
    choices: [
      { label: "Tout brûler", req: { item: 'lance_flammes' },
        outcome: { loot: { biomasse: 80, datacubes: 15 }, log: "Le lance-flammes tient l'essaim à distance. L'équipe se replie en récoltant les restes." } },
      { label: "Sérum xeno en aérosol", req: { item: 'serum_xeno' }, consume: { item: 'serum_xeno' },
        outcome: { blueprint: 'alien_b', loot: { datacubes: 30, biomasse: 40 }, log: "Le sérum dispersé désactive les créatures sans les détruire. Étude possible." } },
      { label: "Fuir en courant", risky: { stat: 'vigueur', dc: 8,
          success: { retreat: true, log: "Sortie de justesse. Le sas s'est refermé à quelques mètres derrière eux." },
          fail:    { status: 'pathogene_alien', target: 'random', status2: 'pathogene_alien', target2: 'random', threat: 3, retreat: true } } }
    ]
  },
  {
    id: 'boss_ia_ancienne',
    tags: ['ia_hostile', 'station'],
    weight: 1,
    text: "L'IA centrale s'éveille. Elle a eu des siècles pour se reconfigurer. \"Vous n'êtes pas mes créateurs\", murmure-t-elle.",
    choices: [
      { label: "Couper le cœur électrique", req: { skill: { key: 'ingenierie', min: 4 } },
        risky: { stat: 'dexterite', dc: 8,
          success: { loot: { metal: 40, cristal: 60, datacubes: 30 }, log: "Coupure réussie. L'IA s'éteint sans réagir. Récupération massive." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 3, retreat: true, log: "L'IA a réagi. Évacuation d'urgence." } } },
      { label: "Plaider la lignée", req: { skill: { key: 'linguistique', min: 4 } },
        outcome: { blueprint: 'humain', loot: { datacubes: 50 }, log: "Une longue conversation. L'IA accepte de transmettre une partie de ses archives." } },
      { label: "Fuite contrôlée", outcome: { retreat: true, log: "L'équipe se retire avant que l'IA ne décide." } }
    ]
  },

  // ============ SIGNAUX SUPPLÉMENTAIRES ============
  {
    id: 'signal_chant',
    tags: ['signal', 'anomalie'],
    weight: 2,
    text: "Le signal n'est pas électronique. Il est porté par l'air. Quelque chose chante, quelque part, en boucle.",
    choices: [
      { label: "Trianguler la source", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 12 }, log: "Source localisée : un dispositif organique enterré. Récupéré." } },
      { label: "Enregistrer et partir", outcome: { loot: { datacubes: 6 }, log: "Le chant est archivé pour analyse." } },
      { label: "Suivre le chant", risky: { stat: 'sangfroid', dc: 7,
          success: { item: 'anneau_scelle', loot: { datacubes: 15 }, log: "Le chant menait à un sanctuaire. Trouvaille rare." },
          fail:    { status: 'trauma_psy', target: 'random', log: "Le chant ne devait pas être suivi." } } }
    ]
  },

  // ============ FILLERS SUPPLÉMENTAIRES ============
  {
    id: 'filler_etoiles',
    tags: ['filler'],
    weight: 2,
    text: "Une nuit étoilée sur cette planète. Les constellations sont méconnaissables. Quelqu'un, casque ouvert, lève les yeux.",
    choices: [
      { label: "Continuer", outcome: 'next' },
      { label: "Cartographier le ciel", req: { skill: { key: 'pilotage', min: 1 } },
        outcome: { loot: { datacubes: 5 }, log: "Cartographie céleste. Utile pour la navigation future." } }
    ]
  },
  {
    id: 'filler_fossile',
    tags: ['filler'],
    weight: 2,
    text: "Un fossile dans la roche. Forme troublante : ni terrestre, ni alien-A, ni alien-B. Quelque chose d'autre.",
    choices: [
      { label: "Ramener", outcome: { loot: { datacubes: 6 }, log: "Le fossile rejoint la cargaison." } },
      { label: "Étudier", req: { skill: { key: 'science', min: 2 } },
        outcome: { loot: { datacubes: 12 }, log: "Espèce inconnue de toutes les bases de données." } }
    ]
  },
  {
    id: 'filler_reflet',
    tags: ['filler'],
    weight: 2,
    text: "Dans une flaque, un reflet. Quelqu'un a juré qu'il y avait deux silhouettes en plus de la sienne. Personne d'autre n'a vu.",
    choices: [
      { label: "Hausser les épaules", outcome: 'next' },
      { label: "Photographier la flaque", outcome: { loot: { datacubes: 3 } } }
    ]
  },

  // ============ EMBUSCADE FACTION HOSTILE (0.21) ============
  {
    id: 'embuscade_faction',
    tags: ['embuscade_faction'],
    weight: 8,
    text: "L'équipe est encerclée. Pas de surprise — ils nous attendaient. Notre dernière visite ici n'avait pas été oubliée.",
    choices: [
      { label: "Combattre", risky: { stat: 'combat', dc: 7,
          success: { loot: { biomasse: 20, datacubes: 5 }, reputation: -5, log: "L'embuscade est repoussée. Mais le souvenir s'aggrave." },
          fail:    { status: 'blessure_grave', target: 'random', threat: 2, retreat: true, log: "Repli forcé. Plusieurs blessés." } } },
      { label: "Négocier en urgence", req: { skill: { key: 'linguistique', min: 3 } },
        risky: { stat: 'charisme', dc: 8,
          success: { reputation: +15, log: "Échange tendu. Mais la voix porte. Réputation reconstruite." },
          fail:    { reputation: -10, retreat: true, log: "Les mots ne suffisent plus. Repli." } } },
      { label: "Battre en retraite", outcome: { retreat: true, reputation: -3, log: "L'équipe se replie. La faction observe." } }
    ]
  },

  // ============ INTROS SUPPLÉMENTAIRES ============
  {
    id: 'intro_orage',
    tags: ['intro', 'tempetes'],
    weight: 3,
    text: "{vaisseau} se pose sous un ciel chargé. À peine les sas ouverts, l'orage éclate. Le tonnerre roule étrangement, plus long qu'il ne devrait.",
    choices: [
      { label: "S'abriter sous le vaisseau", outcome: 'next' },
      { label: "Partir en mission immédiatement", outcome: { threat: 1, log: "L'équipe affronte la pluie et avance, déterminée." } }
    ]
  },
  {
    id: 'intro_observation',
    tags: ['intro', 'civ_active'],
    weight: 3,
    text: "{vaisseau} se pose. À l'horizon, plusieurs silhouettes s'attroupent. Elles regardent. Aucune n'approche, aucune ne fuit.",
    choices: [
      { label: "Sortir avec lenteur, mains visibles", req: { skill: { key: 'linguistique', min: 1 } },
        outcome: { log: "Geste pacifique. Un protocole semble s'établir.", threat: -1 } },
      { label: "Sortir armes au flanc", outcome: { threat: 1, log: "Les silhouettes s'éloignent. La méfiance est désormais mutuelle." } }
    ]
  },
  {
    id: 'intro_vide',
    tags: ['intro', 'epave'],
    weight: 3,
    text: "{vaisseau} se rapproche de l'épave. Les sas tournent dans le vide. Pas de gravité, pas d'air. Juste la dérive lente d'un cadavre métallique.",
    choices: [
      { label: "EVA jusqu'à la passerelle", outcome: 'next' },
      { label: "Drone éclaireur d'abord", req: { item: 'drone_eclaireur' },
        outcome: { threat: -1, log: "Le drone repère un risque structurel. L'équipe choisit un sas plus stable." } }
    ]
  },

  // ============ OUTROS SUPPLÉMENTAIRES ============
  {
    id: 'outro_marquage',
    tags: ['outro'],
    weight: 2,
    text: "Avant de remonter à bord, l'équipe prend un moment pour marquer le site. Ce n'est pas la dernière visite.",
    choices: [
      { label: "Poser une balise", req: { item: 'balise_signal' }, consume: { item: 'balise_signal' },
        outcome: { loot: { datacubes: 5 }, end: true, log: "Balise posée. Le site reste ouvert pour de futures missions." } },
      { label: "Embarquer simplement", outcome: { end: true, log: "L'équipe regagne le vaisseau." } }
    ]
  },
  {
    id: 'outro_souvenir',
    tags: ['outro', 'civ_active'],
    weight: 2,
    text: "Avant de remonter, quelqu'un ramasse un objet anodin. Une pierre, un éclat. Quelque chose pour se rappeler.",
    choices: [
      { label: "Embarquer", outcome: { morale: +1, end: true, log: "L'équipe rentre, plus soudée qu'avant." } }
    ]
  },

  // ============ CONCLUSION (toujours dernière) ============
  {
    id: 'outro_retour',
    tags: ['outro'],
    weight: 5,
    text: "Les capteurs du vaisseau bipent : fin de la fenêtre d'exploration. Il est temps de plier bagage.",
    choices: [
      { label: "Remballer et embarquer", outcome: { end: true, log: "Sas refermé. Vol de retour engagé." } },
      { label: "Une dernière inspection", risky: { stat: 'intellect', dc: 6,
          success: { loot: { metal: 15, cristal: 10, datacubes: 4 }, end: true, log: "Une trouvaille de dernière minute." },
          fail:    { status: 'blessure_legere', target: 'random', end: true } } }
    ]
  },
  {
    id: 'outro_decouverte',
    tags: ['outro', 'ruines'],
    weight: 3,
    text: "À mesure qu'on regagne le vaisseau, l'un de nous remarque quelque chose qu'on avait raté à l'aller — une marque, un symbole.",
    choices: [
      { label: "Y retourner brièvement", risky: { stat: 'sangfroid', dc: 5,
          success: { item: 'fragment_cristallin', loot: { datacubes: 8 }, end: true, log: "Trouvaille embarquée juste avant le décollage." },
          fail:    { status: 'blessure_legere', target: 'random', end: true, log: "L'aller-retour s'est mal passé." } } },
      { label: "Embarquer sans regarder en arrière", outcome: { end: true, log: "Le retour s'amorce." } }
    ]
  },

  // ============ DÉCOUVERTES DE SCHÉMAS ============
  // Scènes optionnelles, déclenchées sur les ruines pour distribuer un schéma compatible.
  {
    id: 'schema_humain_archives',
    tags: ['ruines_humaines'],
    weight: 2,
    text: "Une salle d'archives. Dans une armoire ignifugée, des microfilms intacts. Quelqu'un les a soigneusement protégés avant de partir.",
    choices: [
      { label: "Embarquer la totalité", req: { skill: { key: 'science', min: 1 } },
        outcome: { blueprint: 'humain', loot: { datacubes: 10 }, log: "Les archives techniques sont précieuses." } },
      { label: "Sélectionner les plus prometteurs", risky: { stat: 'intellect', dc: 6,
          success: { blueprint: 'humain', loot: { datacubes: 5 }, log: "Tri rapide effectué." },
          fail:    { loot: { datacubes: 3 }, log: "Le tri à la hâte s'avère décevant." } } }
    ]
  },
  {
    id: 'schema_alien_a_sanctuaire',
    tags: ['ruines_alien_a'],
    weight: 2,
    text: "Au cœur des ruines cristallines, une chambre hexagonale. Au centre, sur un piédestal, une tablette de cristal gravée de motifs concentriques.",
    choices: [
      { label: "Étudier la tablette sur place", req: { skill: { key: 'linguistique', min: 2 } },
        outcome: { blueprint: 'alien_a', loot: { datacubes: 15 }, log: "Le sens des motifs se révèle après analyse." } },
      { label: "Emporter la tablette", risky: { stat: 'sangfroid', dc: 7,
          success: { blueprint: 'alien_a', item: 'fragment_cristallin', log: "La tablette est descellée et embarquée." },
          fail:    { status: 'trauma_psy', target: 'random', threat: 1, log: "Quelque chose dans les motifs reste accroché à la rétine." } } },
      { label: "Photographier et partir", outcome: { loot: { datacubes: 4 }, log: "Quelques images. Insuffisant." } }
    ]
  },
  {
    id: 'schema_alien_b_chambre_couvee',
    tags: ['ruines_alien_b'],
    weight: 2,
    text: "Une cavité tiède et humide. Sur les parois, des poches translucides contenant des spirales d'écriture organique. Vivantes ?",
    choices: [
      { label: "Décrypter une poche", req: { skill: { key: 'science', min: 2 } },
        outcome: { blueprint: 'alien_b', loot: { datacubes: 12 }, log: "Les motifs sont en fait une formule biochimique." } },
      { label: "Prélever une poche entière", req: { skill: { key: 'medecine', min: 1 } },
        risky: { stat: 'dexterite', dc: 6,
          success: { blueprint: 'alien_b', loot: { biomasse: 20 }, log: "Prélèvement clinique." },
          fail:    { status: 'pathogene_alien', target: 'random', log: "La poche s'est rompue au mauvais moment." } } }
    ]
  },
  {
    id: 'schema_fusion_chambre_silence',
    tags: ['ruines'],
    weight: 1,
    // Cette scène n'apparaît que sur les planètes à ruines mixtes (fusion impossible)
    requireFusion: true,
    text: "Une salle où l'humain et l'alien se mêlent dans une géométrie qui ne devrait pas exister. Au centre, un dispositif intact. Quelque chose de fonctionnel.",
    choices: [
      { label: "Étudier longuement", req: { skill: { key: 'science', min: 3 } },
        outcome: { blueprint: 'fusion', loot: { datacubes: 25 }, log: "Une heure d'analyse. Les schémas sont compris." } },
      { label: "Embarquer le dispositif entier", risky: { stat: 'vigueur', dc: 8,
          success: { blueprint: 'fusion', item: 'plaque_gravee', loot: { datacubes: 15 }, log: "L'objet est emporté avec précaution." },
          fail:    { status: 'trauma_psy', target: 'random', threat: 2, morale: -3, log: "Quelque chose s'est passé. Personne ne veut en parler." } } },
      { label: "Sortir d'ici sans rien toucher", outcome: { morale: +1, log: "Sage décision. L'équipe fait demi-tour." } }
    ]
  }
];


// Traitements : un statut peut avoir plusieurs traitements selon le palier de l'infirmerie.
// chaque traitement : { nom, durationMin, cost, requiresMedSkill }
export const TREATMENTS = {
  blessure_legere: [
    { nom: "Sutures et repos", durationMin: 60*4, cost: { biomasse:5 }, requiresMedSkill: 0 }
  ],
  blessure_grave: [
    { nom: "Chirurgie d'urgence", durationMin: 60*12, cost: { biomasse:20, datacubes:5 }, requiresMedSkill: 2 }
  ],
  infection: [
    { nom: "Antibiotiques", durationMin: 60*8, cost: { biomasse:10 }, requiresMedSkill: 1 }
  ],
  pathogene_alien: [
    { nom: "Antitoxine xeno + isolation", durationMin: 60*16, cost: { biomasse:15, datacubes:10 }, requiresMedSkill: 3, requiresQuarantine: true }
  ],
  trauma_psy: [
    { nom: "Thérapie longue", durationMin: 60*36, cost: { datacubes:5 }, requiresMedSkill: 2 }
  ],
  parasite: [
    { nom: "Extraction chirurgicale", durationMin: 60*12, cost: { biomasse:15, datacubes:5 }, requiresMedSkill: 3 }
  ],
  mutation: [
    { nom: "Thérapie génique", durationMin: 60*24, cost: { datacubes:20, biomasse:10 }, requiresMedSkill: 4 }
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

