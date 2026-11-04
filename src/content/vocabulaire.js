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
export const CIBLES = {
  equipe:         "Toute l'équipe de l'expédition (ou les acteurs d'un événement).",
  equipe_hasard:  "Un membre de l'équipe tiré au hasard.",
  chef:           "Le chef d'équipe (premier membre de l'équipe).",
  acteur:         'Le colon qui agit pour ce choix (meilleur au test, ou celui qui remplit la condition).',
  secondaire:     "Un second colon d'un événement (vague 2).",
  victime:        "La victime d'un incident, ou le dernier colon touché par un statut.",
  colonie:        'Tous les colons présents à la colonie.',
  colonie_hasard: 'Un colon de la colonie tiré au hasard.',
};

// ---- Effets : liste ordonnée d'objets à UNE clé ----
// Le même vocabulaire sert aux scènes, histoires, événements, incidents et fils rouges.
export const EFFETS = {
  texte:           "{ texte: '…' } — récit de la conséquence, affiché après le choix (et dans le bilan).",
  gain:            '{ gain: { metal: 30 } } — ressources gagnées (en expédition : dans la soute).',
  perte:           '{ perte: { energie: 10 } } — ressources perdues par la colonie (plancher 0).',
  objet:           "{ objet: 'disque_memoire' } — un objet rapporté (ou { objet: { id, n } }).",
  schema:          "{ schema: 'humain' } — tire un schéma de cette origine ('auto' = selon les ruines du lieu, ou liste).",
  statut:          "{ statut: { cible: 'equipe_hasard', id: 'blessure_legere' } } — inflige un statut médical.",
  moral:           "{ moral: -2 } (toute l'équipe) ou { moral: { cible, valeur } }.",
  affinite:        "{ affinite: { a: 'acteur', b: 'secondaire', delta: 20 } } — relation entre deux colons (vague 2).",
  drapeau:         "{ drapeau: { confiance: '+1', maelle: 'rencontree' } } — drapeaux de l'histoire ('+n'/'-n' : nombres seulement).",
  monde:           '{ monde: { phare_allume: true } } — drapeaux globaux, lisibles par tout le contenu (monde.x).',
  recrute:         "{ recrute: 'adele' } — le personnage de l'histoire rejoint la colonie au retour.",
  reputation:      '{ reputation: 10 } (faction du lieu) ou { reputation: { faction, delta } }.',
  journal:         "{ journal: '…' } — une ligne dans le journal de la colonie.",
  annales:         "{ annales: '…' } — une ligne dans les Annales (mémoire de la partie).",
  module:          "{ module: { id: 'hydroponie', horsService: '6h' } } — module hors service (vague 2).",
  effetTemporaire: "{ effetTemporaire: { titre, prod: { biomasse: 0.8 }, duree: '12h' } } — modificateur de production (vague 2).",
  incident:        "{ incident: { id, dans: '2h' } } — déclenche un incident plus tard (vague 2).",
  combat:          "{ combat: { ennemis: ['pillard'], butin: { metal: 20 }, victoire: [...], defaite: [...] } } — issue : la suite est déclarée.",
  // Issues (une seule, en dernier) :
  aller:           "{ aller: 'scene' } — histoire : scène suivante.",
  finEpisode:      "{ finEpisode: true } — histoire : fin de l'épisode (la suite viendra plus tard).",
  fin:             "{ fin: 'id_de_fin' } — histoire : fin définitive.",
  retraite:        "{ retraite: true } — l'équipe rentre aussitôt (retraite).",
  rentrer:         "{ rentrer: true } — l'expédition se termine normalement.",
};
export const ISSUES = ['aller', 'finEpisode', 'fin', 'retraite', 'rentrer', 'combat'];

// ---- Gabarits utilisables dans les textes ----
export const GABARITS = {
  vaisseau:         "Nom du vaisseau de l'expédition.",
  lieu:             'Nom du corps céleste visité.',
  systeme:          'Nom du système stellaire.',
  colonie:          'Nom de la colonie.',
  'equipe.chef':    "Chef d'équipe (premier membre).",
  'equipe.medecin': "Meilleur médecin de l'équipe (sinon le chef).",
  'equipe.hasard':  "Un membre de l'équipe (le même pendant toute la scène).",
  acteur:           'Colon qui agit pour ce choix.',
  secondaire:       "Second colon d'un événement (vague 2).",
  victime:          'Dernier colon touché par un statut, ou victime de l’incident.',
  'pnj:id':         "Nom d'un personnage de l'histoire ({pnj:adele}).",
  'decor.biome':    'Phrase de décor du biome (aussi atmosphere, signal, ruines, danger).',
};

// ---- Espaces de noms des conditions ----
export const ESPACES = {
  '(nu)':     "Drapeau de l'histoire courante : confiance >= 1, maelle == 'rencontree'.",
  equipe:     "equipe.science (meilleure compétence), equipe.carac.vigueur, equipe.trait.sang_froid, equipe.objet.lance_flammes (nombre embarqué), equipe.taille.",
  colonie:    'colonie.colons, colonie.jour, colonie.res.biomasse, colonie.module.infirmerie (niveau), colonie.tech.tech_x, colonie.objet.disque_memoire.',
  corps:      "corps.type, corps.biome, corps.atmosphere, corps.gravite, corps.vie, corps.signal, corps.ruines, corps.danger, corps.visites.",
  faction:    'faction.existe, faction.reputation — faction locale du lieu visité.',
  histoire:   "histoire.pulsar_silencieux.fin, histoire.x.episode, histoire.x.terminee, histoire.x.drapeau.y.",
  monde:      'monde.x — drapeaux globaux posés par l’effet monde.',
  compteur:   'compteur.expeditions, compteur.scenes, compteur.combats_gagnes, compteur.chroniques_terminees.',
  acteur:     'acteur.age, acteur.moral… — filtres des acteurs d’un événement (vague 2).',
};

// Mots réservés du mini-langage de conditions
export const MOTS_RESERVES = ['et', 'ou', 'non', 'dans', 'vrai', 'faux', 'true', 'false', 'null', 'nul'];
