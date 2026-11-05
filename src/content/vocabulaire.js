// src/content/vocabulaire.js — vocabulaire commun du contenu narratif (V1).
//
// Source unique des noms qu'un auteur peut employer dans le contenu :
// ressources, compétences, caractéristiques, statuts, attributs de lieu, cibles,
// effets, issues, gabarits et espaces de noms des conditions. Le moteur
// (src/engine/narration.js) et le validateur (tools/check-content.mjs) s'y
// réfèrent ; le validateur vérifie aussi que ces listes correspondent aux tables
// du jeu (catalog.js, constants.js, state.js, app.js).
//
// Données pures : aucun import, aucune fonction.

// ---- Ressources (genre : accord de « requis/requise ») ----
export const RESSOURCES = {
  metal:     { nom: 'Métal',     genre: 'm' },
  cristal:   { nom: 'Cristal',   genre: 'm' },
  energie:   { nom: 'Énergie',   genre: 'f' },
  biomasse:  { nom: 'Biomasse',  genre: 'f' },
  datacubes: { nom: 'Datacubes', genre: 'mp' },
};

// ---- Compétences (0 à 5) : `equipe.science`, test { competence } ----
export const COMPETENCES = {
  medecine:     { nom: 'Médecine',     genre: 'f' },
  ingenierie:   { nom: 'Ingénierie',   genre: 'f' },
  science:      { nom: 'Science',      genre: 'f' },
  pilotage:     { nom: 'Pilotage',     genre: 'm' },
  combat:       { nom: 'Combat',       genre: 'm' },
  linguistique: { nom: 'Linguistique', genre: 'f' },
  survie:       { nom: 'Survie',       genre: 'f' },
};

// ---- Caractéristiques (1 à 10, 5 = moyenne) : `equipe.carac.vigueur`, test { carac } ----
export const CARACS = {
  vigueur:   { nom: 'Vigueur',    genre: 'f' },
  dexterite: { nom: 'Dextérité',  genre: 'f' },
  intellect: { nom: 'Intellect',  genre: 'm' },
  sangfroid: { nom: 'Sang-froid', genre: 'm' },
  charisme:  { nom: 'Charisme',   genre: 'm' },
};

// ---- Statuts médicaux (effet `statut`) ----
export const STATUTS = ['blessure_legere', 'blessure_grave', 'infection', 'pathogene_alien', 'trauma_psy', 'parasite', 'mutation'];

// ---- Attributs d'un lieu (corps céleste) : `corps.<attribut>` ----
// Valeurs générées par state.js (genBody) ; à comparer entre apostrophes :
//   lieux: "corps.biome == 'jungle' && corps.atmosphere != 'aucune'"
export const LIEU = {
  type:       ['planete', 'lune', 'station', 'epave', 'asteroide_g'],
  biome:      ['toundra', 'desert', 'ocean', 'jungle', 'volcanique', 'glace', 'irradie', 'asteroide', 'exotique'],
  atmosphere: ['respirable', 'tenue', 'toxique', 'aucune', 'anormale'],
  gravite:    ['micro', 'faible', 'standard', 'lourde', 'ecrasante'],
  vie:        ['aucune', 'microbienne', 'flore_agressive', 'faune', 'civ_dechue', 'civ_active'],
  signal:     ['aucun', 'sos', 'crypte', 'bruit_blanc', 'echo_temporel'],
  ruines:     ['aucune', 'humaines', 'alien_a', 'alien_b', 'fusion'],
  danger:     ['aucun', 'tempetes', 'predateurs', 'pathogene', 'faille', 'ia_hostile', 'anomalie'],
};

// ---- Moments d'une expédition (scènes génériques) ----
export const MOMENTS = {
  arrivee:     "Première scène, à l'atterrissage (une seule par expédition).",
  exploration: 'Scènes du corps de la mission (2 à 4 par expédition). Valeur par défaut.',
  depart:      'Dernière scène, avant de remonter à bord (une seule par expédition).',
  embuscade:   "Insérée juste après l'arrivée chaque fois que son lieu est vrai (ex. faction hostile).",
};

// ---- Cibles des effets (statut, moral…) ----
// Dans un événement de colonie, le nom d'un acteur déclaré ({ acteurs: { colon: … } })
// est aussi une cible : { moral: { cible: 'colon', valeur: 3 } }.
export const CIBLES = {
  equipe:         "Toute l'équipe de l'expédition (ou, à la colonie, les colons mobilisables).",
  equipe_hasard:  "Un membre de l'équipe tiré au hasard.",
  chef:           "Le chef d'équipe (premier membre de l'équipe).",
  acteur:         'Le colon qui agit pour ce choix (meilleur au test, ou celui qui remplit la condition).',
  secondaire:     "Le second acteur déclaré d'un événement (sinon un second membre de l'équipe).",
  victime:        "La victime d'un incident, ou le dernier colon touché par un statut.",
  colonie:        'Tous les colons présents à la colonie.',
  colonie_hasard: "Un colon de la colonie tiré au hasard (pour une brouille : jamais le colon « a »).",
};

// ---- Effets : liste ordonnée d'objets à UNE clé ----
// Le même vocabulaire sert aux scènes, histoires, événements, incidents et fils rouges.
export const EFFETS = {
  texte:           "{ texte: '…' } — récit de la conséquence, affiché après le choix (et dans le bilan).",
  gain:            '{ gain: { metal: 30 } } — ressources gagnées (en expédition : dans la soute ; à la colonie : dans la limite du stockage).',
  perte:           '{ perte: { energie: 10 } } — ressources perdues par la colonie (plancher 0).',
  objet:           "{ objet: 'disque_memoire' } — un objet rapporté (ou { objet: { id, n } }) ; à la colonie, il rejoint l'inventaire.",
  schema:          "{ schema: 'humain' } — tire un schéma de cette origine ('auto' = selon les ruines du lieu, ou liste) ; ou un schéma précis : { schema: 'bp_relais_unifie' }.",
  statut:          "{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } } — inflige un statut médical.",
  moral:           "{ moral: -2 } (toute l'équipe ; à la colonie : tous les colons) ou { moral: { cible, valeur } }.",
  affinite:        "{ affinite: { a: 'colon', b: 'autre', delta: 20 } } — relation entre deux colons.",
  brouille:        "{ brouille: { a: 'victime', b: 'colonie_hasard' } } — brouille durable : entente ramenée à −30 au plus.",
  drapeau:         "{ drapeau: { confiance: '+1', maelle: 'rencontree' } } — drapeaux de l'histoire ('+n'/'-n' : nombres seulement).",
  monde:           "{ monde: { phare_allume: true, ilya_confiance: '+1' } } — drapeaux globaux, lisibles par tout le contenu (monde.x) ; '+n'/'-n' comptent.",
  recrute:         "{ recrute: 'adele' } — un personnage (d'histoire, ou partagé : 'maud') rejoint la colonie ; { recrute: { inconnu: true, bonus: 1 } } : un visiteur.",
  reputation:      "{ reputation: 10 } (faction du lieu) ou { reputation: { faction: 'humain', delta } } (id de faction, ou type : la faction connue de ce type).",
  journal:         "{ journal: '…' } — une ligne dans le journal de la colonie.",
  annales:         "{ annales: '…' } — une ligne dans les Annales (mémoire de la partie).",
  module:          "{ module: { id: 'hydroponie', horsService: '6h' } } — module hors service ; { module: { niveau: -1 } } : il perd un niveau (id : module de l'incident par défaut).",
  effetTemporaire: "{ effetTemporaire: { titre, prod: 0.8, duree: '12h' } } — multiplie toute la production pendant la durée.",
  incident:        "{ incident: { id, dans: '2h' } } — déclenche un incident plus tard.",
  retardRecherche: "{ retardRecherche: '30min' } — la recherche en cours perd ce temps d'avancement.",
  bonusPermanent:  "{ bonusPermanent: 'avant_poste_autonome' } — bonus permanent (fils rouges ; liste : BONUS_PERMANENTS d'app.js).",
  technologie:     "{ technologie: 'tech_resonance_pure' } — rend une technologie légendaire accessible (fils rouges).",
  combat:          "{ combat: { ennemis: ['pillard'], butin: { metal: 20 }, victoire: [...], defaite: [...] } } — issue : la suite est déclarée.",
  // Issues (une seule, en dernier) :
  aller:           "{ aller: 'scene' } — histoire : scène suivante.",
  finEpisode:      "{ finEpisode: true } — histoire : fin de l'épisode (la suite viendra plus tard).",
  fin:             "{ fin: 'id_de_fin' } — histoire : fin définitive.",
  retraite:        "{ retraite: true } — l'équipe rentre aussitôt (retraite).",
  rentrer:         "{ rentrer: true } — l'expédition se termine normalement.",
};
export const ISSUES = ['aller', 'finEpisode', 'fin', 'retraite', 'rentrer', 'combat'];

// Effets permis dans une décision de colonie (événement, incident) et dans la
// récompense d'un fil rouge : ni issue, ni drapeau d'histoire.
export const EFFETS_COLONIE = ['texte', 'gain', 'perte', 'objet', 'schema', 'statut', 'moral', 'affinite', 'brouille', 'monde',
  'recrute', 'reputation', 'journal', 'annales', 'module', 'effetTemporaire', 'incident', 'retardRecherche', 'bonusPermanent', 'technologie'];

// ---- Incidents : gravité ----
export const GRAVITES = {
  mineur:   { niveau: 1, nom: 'Mineur',   aide: 'Résolu seul pendant une absence (choix le plus sûr).' },
  serieux:  { niveau: 2, nom: 'Sérieux',  aide: 'Attend le joueur dans la file des décisions.' },
  critique: { niveau: 3, nom: 'Critique', aide: 'Attend le joueur dans la file des décisions.' },
};

// ---- Acteurs d'un événement : lecture « acteur.x » dans un filtre ----
export const CHAMPS_ACTEUR = {
  age:            'Âge en années.',
  age_rond:       "Vrai si l'âge est un multiple de 5 (anniversaire rond).",
  moral:          'Moral (0 à 100).',
  sante:          'Santé (0 à 100).',
  role:           "Rôle de départ : 'pilote', 'ingenieur', 'medecin' (colons fondateurs), sinon nul.",
  libre:          "Vrai si le colon n'a ni poste ni mission.",
  poste:          "Module où il travaille ('laboratoire'…), sinon nul.",
  mort:           "Vrai pour un défunt (acteur déclaré avec parmi: 'morts').",
  mort_depuis:    'Temps écoulé depuis le décès (à comparer à une durée : acteur.mort_depuis < 3j).',
  affinite:       "Entente avec l'acteur déclaré juste avant (−100 à 100).",
  '<competence>': 'Niveau de compétence (acteur.science, acteur.survie…).',
  'carac.<x>':    'Caractéristique (acteur.carac.vigueur…).',
  'trait.<x>':    'Vrai si le colon a ce trait.',
};

// ---- Archives : catégories des pages de lore (ordre d'affichage) ----
export const CATEGORIES_LORE = {
  histoire:     "L'exode et ce qui l'a précédé",
  colonie:      "L'avant-poste et ses voisins",
  mondes:       'Les mondes',
  ruines:       'Les ruines',
  peuples:      'Les peuples',
  techniques:   'Les techniques anciennes',
};

// ---- Gabarits utilisables dans les textes ----
export const GABARITS = {
  vaisseau:         "Nom du vaisseau de l'expédition.",
  lieu:             'Nom du corps céleste visité.',
  systeme:          'Nom du système stellaire.',
  colonie:          'Nom de la colonie.',
  module:           "Nom du module d'un incident (« Mine de surface »).",
  'equipe.chef':    "Chef d'équipe (premier membre).",
  'equipe.medecin': "Meilleur médecin de l'équipe (sinon le chef).",
  'equipe.hasard':  "Un membre de l'équipe (le même pendant toute la scène).",
  acteur:           'Colon qui agit pour ce choix.',
  secondaire:       "Second acteur d'un événement.",
  victime:          'Dernier colon touché par un statut, ou colon concerné par l’incident.',
  '<acteur>':       "Acteur déclaré d'un événement : {colon}, {colon.age}, {colon|il|elle}, {colon.e}.",
  'pnj:id':         "Nom d'un personnage : de l'histoire ({pnj:adele}) ou partagé ({pnj:ilya}).",
  'decor.biome':    'Phrase de décor du biome (aussi atmosphere, signal, ruines, danger).',
};

// ---- Espaces de noms des conditions ----
export const ESPACES = {
  '(nu)':      "Drapeau de l'histoire courante : confiance >= 1, maelle == 'rencontree'.",
  equipe:      'equipe.science (meilleure compétence), equipe.carac.vigueur, equipe.trait.sang_froid, equipe.objet.lance_flammes (nombre embarqué), equipe.taille. À la colonie : les colons mobilisables.',
  colonie:     'colonie.colons, colonie.jour, colonie.res.biomasse, colonie.reserve.biomasse (part du stockage, 0 à 1), colonie.module.infirmerie (niveau), colonie.tech.tech_x, colonie.objet.disque_memoire, colonie.batiments, colonie.en_poste, colonie.couchettes_libres, colonie.flotte, colonie.techs, colonie.recherches, colonie.schemas.alien_a, colonie.datacubes_alien, colonie.competence.linguistique (meilleur colon vivant), colonie.gueris.pathogene_alien, colonie.morts.',
  corps:       'corps.type, corps.biome, corps.atmosphere, corps.gravite, corps.vie, corps.signal, corps.ruines, corps.danger, corps.visites.',
  faction:     'faction.existe, faction.reputation — faction locale du lieu visité.',
  factions:    'factions.total, factions.humain (factions connues de ce type), factions.allies.',
  histoire:    'histoire.pulsar_silencieux.fin, histoire.x.episode, histoire.x.terminee, histoire.x.drapeau.y.',
  monde:       'monde.x — drapeaux globaux posés par l’effet monde.',
  compteur:    'compteur.expeditions, compteur.scenes, compteur.combats_gagnes, compteur.chroniques_terminees.',
  expeditions: 'expeditions.total, expeditions.en_cours, expeditions.ruines.humaines, expeditions.biome.glace, expeditions.type.station, expeditions.scene.boss_x, expeditions.objet.serum_xeno — expéditions rentrées ; les filtres se combinent : expeditions.ruines.alien_b.objet.serum_xeno.',
  evenement:   'evenement.marchand.fois (nombre de fois résolu), evenement.marchand.depuis (temps écoulé ; nul si jamais).',
  fil:         'fil.arc_effondrement.etape (étapes franchies), fil.arc_effondrement.termine.',
  archives:    'archives.exode (page débloquée), archives.total.',
  acteur:      'acteur.age, acteur.moral… — filtres des acteurs d’un événement (voir CHAMPS_ACTEUR).',
};

// Mots réservés du mini-langage de conditions
export const MOTS_RESERVES = ['et', 'ou', 'non', 'dans', 'vrai', 'faux', 'true', 'false', 'null', 'nul'];
