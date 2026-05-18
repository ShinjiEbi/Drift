// chronicles.js — chroniques planétaires (0.24)
// Une chronique est une mini-saga narrative attachée à une planète.
// Chaque épisode se joue lors d'une expédition séparée. Les choix
// modifient des flags qui influencent les épisodes suivants et la fin.

// ============================================================
//   CATALOGUE DES CHRONIQUES
// ============================================================

export const CHRONICLES = {

  // ------------------------------------------------------------
  //   PULSAR SILENCIEUX — Chronique humaine, 3 épisodes
  // ------------------------------------------------------------
  'pulsar_silencieux': {
    id: 'pulsar_silencieux',
    nom: 'Le Pulsar Silencieux',
    teaser: "Une station humaine émet un signal régulier depuis trois mois. Personne ne répond.",
    
    // Conditions d'apparition sur une planète
    requires: {
      ruines: 'humaines',
      atmosphere: ['toxique', 'tenue', 'anormale'] // optionnel
    },
    spawnChance: 0.35,
    
    // Personnages persistants
    characters: {
      adele:  { name: 'Adèle Voronine', age: 47, role: 'Biologiste',  voice: 'sèche, ironique' },
      tomas:  { name: 'Tomas Renaud',   age: 31, role: 'Mécanicien',  voice: 'naïf, dépendant' },
      soeur:  { name: 'Mira Voronine',  age: 52, role: '?',            voice: 'rare, étrange' }
    },
    
    // Flags trackés tout au long de la chronique
    initialFlags: {
      signal_origin: null,       // 'station' | 'bunker' | 'inconnu'
      truth_revealed: false,     // a lu le journal de bord ?
      adele_trust: 0,            // -2 à +3
      tomas_status: 'present',   // 'present' | 'allie' | 'mort' | 'absent'
      survivors_fate: null,      // 'sauves' | 'partages' | 'abandonnes'
      secret_partage: false,     // a vu la porte verrouillée
      last_signal: 'recu'        // 'recu' | 'ignore'
    },
    
    episodes: [
      {
        title: 'Le signal',
        intro: "À l'approche, le signal s'intensifie. Une station orbitale, intacte de loin. Le rythme est trop régulier pour être un automatisme défectueux. Quelqu'un veut être trouvé — ou veut qu'on croie ça.",
        firstScene: 'chron_pulsar_ep1_sas'
      },
      {
        title: 'Les survivants',
        introByFlag: {
          signal_origin: {
            'bunker':  "Le signal a changé de nature. Une voix humaine maintenant, depuis la surface.",
            'station': "Tu retournes sur la station. Les écrans ne mentent plus : quelqu'un est arrivé.",
            'inconnu': "Tu reviens parce que tu ne pouvais pas faire autrement. Quelque chose t'a appelé."
          }
        },
        defaultIntro: "Le signal n'a pas faibli. Quelque chose t'attend là-bas.",
        firstScene: 'chron_pulsar_ep2_contact'
      },
      {
        title: 'La vérité',
        introByFlag: {
          survivors_fate: {
            'sauves':       "Adèle vit chez toi maintenant. Elle te demande de retourner sur la planète, pour fermer ce qu'elle a laissé ouvert. « Tomas refuse de venir. Vous le comprendrez. »",
            'partages':     "Le signal a repris, mais plus fort, et différent. Comme un appel. Tu décides d'y retourner.",
            'abandonnes':   "Le signal s'est tu. Mais quelque chose t'attire encore là-bas. Une dette."
          }
        },
        defaultIntro: "Tu reviens, et tu sais pourquoi.",
        firstScene: 'chron_pulsar_ep3_retour'
      }
    ],
    
    // Fins possibles (déterminées par le choix final de l'épisode 3)
    // Chacune est un identifiant qui sera enregistré dans body.chronicle.ending
    endings: {
      'sauvetage_comprehension': "Tu as sauvé Adèle et compris ce qu'elle gardait. La sœur reste là-bas, mais paisible. La station est devenue un lieu de mémoire.",
      'sauvetage_destruction':   "Tu as sauvé Adèle, mais débranché la machine. La sœur est morte. Adèle ne te parle plus mais reste à l'avant-poste.",
      'partage_revelation':      "Tu n'as pas embarqué Adèle, elle est morte. Mais tu as compris ce qu'elle protégeait. Tu repars avec respect.",
      'abandon_profanation':     "Tu as pillé, tu as profané. Tu en sors riche. Quelque chose s'est cassé en toi.",
      'emporter_soeur':          "Tu as ramené la sœur. Elle vit maintenant à l'avant-poste — silencieuse, étrange, importante."
    }
  },

  // ------------------------------------------------------------
  //   LE SANCTUAIRE VERT — Chronique alien_a (cristalline), 3 épisodes
  // ------------------------------------------------------------
  'sanctuaire_vert': {
    id: 'sanctuaire_vert',
    nom: 'Le Sanctuaire Vert',
    teaser: "Une jungle volcanique. Un temple alien cristallin. Et un chant qui change à chaque visite.",
    
    requires: {
      ruines: 'alien_a',
      biome: ['jungle', 'volcanique', 'exotique', 'desert']
    },
    spawnChance: 0.40,
    
    characters: {
      inara: { name: 'Inara Hask', age: 38, role: 'Exobiologiste', voice: 'rauque, fragmentée — elle parle peu, elle écoute' },
      chant: { name: 'Le Chant',   age: null, role: 'Présence cristalline', voice: 'fréquences pures, mots déformés' },
      choeur: { name: 'Le Chœur des Sept', age: null, role: 'Voix fragmentaires', voice: 'sept timbres distincts, parfois contradictoires' }
    },
    
    initialFlags: {
      tone_compris: 0,           // 0 à 3 : combien tu as compris la langue cristalline
      inara_status: 'inconnu',   // 'inconnu' | 'rencontree' | 'allie' | 'morte' | 'devenue'
      offrande: null,            // 'sang' | 'datacube' | 'chant' | 'aucune' | 'refus'
      choeur_eveille: false,     // les 7 voix divergentes sont-elles entendues
      profanation: false,        // a-t-on cassé un cristal ?
      pacte: null                // 'interlocuteur' | 'victime' | 'successeur'
    },
    
    episodes: [
      {
        title: "L'Écho",
        intro: "À mesure que tu approches, l'air vibre. Une jungle dense, des sommets volcaniques fumants, et au cœur de la vallée, une structure de cristal de la taille d'une cathédrale. Tu entends quelque chose, mais ce n'est pas un son. C'est une *idée* de son.",
        firstScene: 'chron_sanc_ep1_lisiere'
      },
      {
        title: "L'Initiée",
        introByFlag: {
          inara_status: {
            'inconnu':    "Cette fois tu n'es pas seul. Quelqu'un te suit. Pas une bête.",
            'rencontree': "Inara t'attend à l'orée. Elle n'a pas bougé d'un mètre depuis la dernière fois.",
            'morte':      "Tu reviens là où Inara n'est plus. Le temple, lui, est toujours là. Plus lumineux."
          }
        },
        defaultIntro: "Le sanctuaire t'a appelé en rêve cette semaine. C'était précis : il y a quelque chose dedans qui veut te parler maintenant.",
        firstScene: 'chron_sanc_ep2_inara'
      },
      {
        title: "Le Pacte",
        introByFlag: {
          tone_compris: {
            3: "Tu comprends ce qu'on te demande, et tu n'as plus peur. Tu reviens parce que tu as fait un choix.",
            2: "Tu comprends presque. Tu reviens parce que tu veux savoir le reste.",
            1: "Tu reviens parce que tu n'arrives plus à dormir sans entendre le Chant.",
            0: "Tu reviens parce que tu en as honte. Tu n'as pas écouté la dernière fois. Tu vas essayer."
          }
        },
        defaultIntro: "Tu reviens. Tu n'aurais pas dû repartir.",
        firstScene: 'chron_sanc_ep3_seuil'
      }
    ],
    
    endings: {
      'interlocuteur':    "Tu deviens l'interlocuteur du Chant. Il t'a marqué d'une fréquence — tu l'entendras le reste de ta vie, où que tu sois. La galaxie te répond différemment.",
      'victime':          "Le Chant t'a pris quelque chose de précieux. Tu reviens vivant mais incomplet. Ce qui te manque ne reviendra pas.",
      'successeur':       "Tu prends la place d'Inara, ou de quelqu'un avant elle. Tu restes au temple. Une autre version de toi rentre à l'avant-poste.",
      'profanation_finale': "Tu as brisé le Chant. Les cristaux pleurent en sons audibles maintenant. Tu emportes beaucoup. Tu laisses un cadavre derrière toi.",
      'refus_silence':    "Tu as refusé. Tu repars sans rien. Mais quelque part en toi, le silence aussi est un choix qu'on respecte."
    }
  },

  // ------------------------------------------------------------
  //   LA COUVÉE DORMANTE — Chronique alien_b (organique), 3 épisodes
  // ------------------------------------------------------------
  'couvee_dormante': {
    id: 'couvee_dormante',
    nom: 'La Couvée Dormante',
    teaser: "Sous la glace d'une planète gelée, quelque chose respire. Lentement. Patiemment.",
    
    requires: {
      ruines: 'alien_b',
      biome: ['glace', 'toundra', 'ocean', 'exotique', 'asteroide']
    },
    spawnChance: 0.45,
    
    characters: {
      hadrien: { name: 'Hadrien Vesh',  age: 44, role: 'Climatologue', voice: 'lent, lointain, parfois clair' },
      couvee:  { name: 'La Couvée',     age: null, role: 'Organisme distribué', voice: 'aucune, puis mimétique, puis personnelle' },
      frere:   { name: 'Le Frère',      age: null, role: 'Manifestation finale', voice: "la voix d'un mort de ton équipage" }
    },
    
    initialFlags: {
      reveil: 'dort',              // 'dort' | 'eveille' | 'conscient'
      hadrien_status: 'inconnu',   // 'inconnu' | 'rencontre' | 'mort' | 'libere'
      nourriture: 0,               // 0 à 5 : combien de fois tu as nourri la Couvée
      langage_appris: 0,           // 0 à 3 : combien de syllabes elle te répond
      memoire_volee: null,         // nom d'un colon mort de ton équipage (pour le Frère)
      pacte_organique: null        // 'symbiose' | 'cooperation' | 'destruction' | 'fuite'
    },
    
    episodes: [
      {
        title: "Sous la glace",
        intro: "La planète est silencieuse. Trop. Pas de vent, pas de bruit organique, juste la glace qui craque. Quand tu poses le pied, tu sens une vibration sous tes bottes. Comme un battement très lent. Plus lent qu'un cœur humain. Plus régulier.",
        firstScene: 'chron_couv_ep1_arrivee'
      },
      {
        title: "L'Apprenti",
        introByFlag: {
          reveil: {
            'eveille':   "La planète n'est plus silencieuse. Quelque chose émet maintenant un son régulier. Comme un appel.",
            'conscient': "Tu reçois un signal dans une langue que tu connais à demi — la tienne, mais déformée."
          }
        },
        defaultIntro: "Tu reviens. Tu n'es pas tranquille mais tu reviens.",
        firstScene: 'chron_couv_ep2_descente'
      },
      {
        title: "Le Frère",
        introByFlag: {
          pacte_organique: {
            'symbiose':    "Tu retournes là-bas comme on rend visite à un parent.",
            'cooperation': "Tu reviens pour clore un accord, pas pour le rompre.",
            'destruction': "Tu reviens pour finir le travail.",
            'fuite':       "Tu reviens malgré toi. Elle t'a appelé par ton vrai nom."
          }
        },
        defaultIntro: "Tu reviens. Elle t'attend.",
        firstScene: 'chron_couv_ep3_descente_finale'
      }
    ],
    
    endings: {
      'symbiose_consciente':   "Tu vis maintenant avec une partie de la Couvée dans tes pensées. Tu n'es pas seul. Tu ne le seras plus jamais. Tu hésites à savoir si c'est un bien.",
      'cooperation_distante':  "Vous avez convenu de ne pas vous nuire. Tu reviendras peut-être. Elle restera. Personne n'a perdu — personne n'a vraiment gagné non plus.",
      'destruction_par_feu':   "Tu as tout brûlé. Tu emportes des trophées biologiques inestimables et beaucoup de remords si tu en as.",
      'fuite_marquee':         "Tu as fui. Mais le Frère t'a déjà touché. Tu rêveras de lui jusqu'à ta mort.",
      'liberation_hadrien':    "Tu as libéré Hadrien — en l'achevant, ou en le ramenant. Dans les deux cas, ce n'est plus tout à fait un homme qui revient (ou meurt).",
      'eveil_total':           "Tu as nourri la Couvée jusqu'à l'éveil total. Elle est consciente. Elle te bénit. Elle te demande de partir et de ne jamais revenir."
    }
  },

  // ------------------------------------------------------------
  //   L'ANNEAU TRACÉ — Chronique anomalie spatiale, 3 épisodes
  // ------------------------------------------------------------
  // Conditions : atmosphere anormale OU biome exotique. Présence géométrique
  // inexplicable. 1 personnage récurrent (Dr. Élie Calvet, physicienne).
  // Ton : contemplatif, inquiétant, sans ennemi. Le mystère vient de
  // l'observation et de l'interprétation.
  'anneau_trace': {
    id: 'anneau_trace',
    nom: "L'Anneau Tracé",
    teaser: "Un cercle parfait, immobile, qui change de place quand on ne le regarde pas.",
    
    requires: {
      atmosphere: ['anormale', 'exotique'],
      biome: ['desert', 'glace', 'volcanique', 'exotique', 'asteroide', 'jungle']
    },
    spawnChance: 0.30,
    
    characters: {
      elie:   { name: 'Dr. Élie Calvet', age: 39, role: 'Physicienne théoricienne', voice: 'précise, inquiète' }
    },
    
    initialFlags: {
      observations: 0,            // nombre d'observations rigoureuses (0-5)
      elie_status: 'present',     // 'present' | 'allie' | 'mort' | 'absent' | 'obsedee'
      elie_obsession: 0,          // 0-3, augmente quand on appuie sur les choix scientifiques
      anneau_classifie: null,     // 'instrument' | 'verrou' | 'porte' | null
      contact_etabli: false,      // a touché l'anneau (geste interdit)
      autre_anneau: false,        // a découvert qu'il en existe d'autres
      gardien_eveille: false,     // a déclenché une réaction de l'anneau
      compas_obtenu: false        // le compas cosmique a été récupéré
    },
    
    episodes: [
      {
        title: "La géométrie",
        intro: "Tu approches du site signalé par les capteurs. L'anomalie est visible avant même que tu te poses : un cercle gigantesque, parfaitement régulier, à un mètre du sol. Aucune ombre, aucun bruit. Élie Calvet, ton experte embarquée, ne dit plus rien depuis dix minutes.",
        firstScene: 'chron_anneau_ep1_approche'
      },
      {
        title: "Les régularités",
        introByFlag: {
          anneau_classifie: {
            'instrument':  "Tu reviens avec une hypothèse : c'est un instrument, peut-être un compas. Élie a passé six jours à compiler les données. Elle veut continuer.",
            'verrou':      "Tu reviens parce que tu n'as pas le choix. Si c'est un verrou, comme le pense Élie, alors quelque chose attend de l'autre côté. Et tu veux savoir quoi.",
            'porte':       "Tu reviens avec une idée folle : si c'est une porte, alors elle s'ouvre. Et si elle s'ouvre, quelque chose entre — ou quelque chose sort."
          }
        },
        defaultIntro: "Tu reviens. Tu n'as pas vraiment décidé pourquoi. L'anneau est toujours là. Sauf qu'il a légèrement bougé, semble-t-il.",
        firstScene: 'chron_anneau_ep2_observation'
      },
      {
        title: "L'autre côté",
        introByFlag: {
          gardien_eveille: {
            true:  "Quelque chose a changé. L'anneau émet désormais une vibration sub-sonique. Élie dit qu'il « répond ». À quoi exactement, elle ne sait pas.",
            false: "L'anneau attend. Toi aussi tu attends quelque chose, sans pouvoir le nommer."
          }
        },
        defaultIntro: "Tu reviens parce qu'il faut bien finir ce qu'on a commencé.",
        firstScene: 'chron_anneau_ep3_seuil'
      }
    ],
    
    endings: {
      'science_pure':       "Tu as observé sans toucher. Élie publie ses travaux à bord. L'anneau reste là, intact. Tu ramènes des mesures qui changent la physique. Et un compas qui pointe vers d'autres anneaux.",
      'obsession_elie':     "Élie ne revient pas. Elle a choisi de rester pour continuer ses observations. Tu ne la reverras pas. Elle t'a laissé ses notes — et le compas.",
      'porte_ouverte':      "Tu as ouvert. Quelque chose est passé — dans un sens ou dans l'autre. L'anneau est tombé. Élie est revenue changée. Tu portes désormais une chose.",
      'verrou_brise':       "Tu as détruit le verrou. Quelque chose s'est libéré sur cette planète. Tu ne sais pas quoi. Élie pense qu'il faut prévenir. Tu pars sans avoir compris.",
      'silence_respecte':   "Tu as choisi de ne pas comprendre. Tu pars sans rien emporter. Élie ne comprend pas, mais te respecte. L'anneau reste, dans son cercle parfait, à attendre quelqu'un d'autre."
    }
  },

  // ------------------------------------------------------------
  //   LES VEILLEURS DE BETH — Chronique civilisation humaine vivante, 3 épisodes
  // ------------------------------------------------------------
  // Conditions : ruines humaines + biome viable. Civilisation isolée depuis ~400 ans
  // qui garde une installation orbitale en perte de fonctionnement. Trois personnages
  // récurrents (Eyla, Karn, le Prêtre). Ton ethnologique, premier contact.
  'veilleurs_beth': {
    id: 'veilleurs_beth',
    nom: 'Les Veilleurs de Beth',
    teaser: "Des humains vivent encore ici. Ils gardent quelque chose, mais ils ne savent plus quoi.",
    
    requires: {
      ruines: 'humaines',
      biome: ['terrestre', 'tropical', 'jungle', 'toundra', 'desert']
    },
    spawnChance: 0.30,
    
    characters: {
      eyla:    { name: 'Eyla',      age: 73, role: 'Première Veilleuse',  voice: 'douce, écoute plus qu\'elle ne parle' },
      karn:    { name: 'Karn',      age: 24, role: 'Jeune Veilleur',      voice: 'méfiant, curieux' },
      pretre:  { name: 'Le Prêtre', age: 56, role: 'Gardien des Présents', voice: 'rituelle, hostile' }
    },
    
    initialFlags: {
      contact: null,            // 'amical' | 'tendu' | 'hostile' | null
      verite_revelee: false,    // a expliqué que les "Présents" viennent d'une orbiteur
      eyla_confiance: 0,        // -2 à +3
      karn_lien: 0,             // 0 à 3
      pretre_status: 'present', // 'present' | 'humilie' | 'allié' | 'mort'
      orbiteur_localise: false, // a trouvé/identifié l'installation orbitale
      orbiteur_repare: false,   // a réparé l'installation
      presents_pris: false,     // a emporté des "Présents" sans demander
      offrande_faite: false     // a fait une offrande lors d'une cérémonie
    },
    
    episodes: [
      {
        title: "Le contact",
        intro: "Les capteurs ont confirmé des signaux de vie. Quand tu te poses, tu n'es pas seul à attendre. Des silhouettes encerclent le vaisseau, immobiles, dans des tuniques claires. Le plus vieux d'entre eux lève une main. Ce n'est pas une menace, ni un salut — c'est un signe que tu ne comprends pas.",
        firstScene: 'chron_veilleurs_ep1_arrivee'
      },
      {
        title: "Le rite",
        introByFlag: {
          contact: {
            'amical':  "Eyla t'attend à l'entrée du village. Elle te connaît maintenant. Karn observe à distance, comme toujours.",
            'tendu':   "Tu reviens. Les Veilleurs ne te chassent pas, mais ils ne te saluent pas non plus. Eyla a vieilli en quelques jours.",
            'hostile': "Tu reviens malgré tout. Le Prêtre se tient sur le seuil du temple, armé d'une lance de cérémonie. Eyla est plus loin, presque cachée. Quelque chose a changé."
          }
        },
        defaultIntro: "Tu reviens parce que tu as vu quelque chose la première fois — un détail qui n'était pas rituel, mais technique. Il faut comprendre.",
        firstScene: 'chron_veilleurs_ep2_temple'
      },
      {
        title: "Les Présents",
        introByFlag: {
          orbiteur_localise: {
            true:  "Tu sais maintenant ce qui pleut sur eux. Une orbiteur de l'ancienne colonie, encore en activité, dérégulée. Elle leur envoie des capsules de survie au hasard. C'est ce qu'ils appellent les Présents.",
            false: "Tu n'as pas tout compris encore. Quelque chose alimente leur foi, et ce n'est ni dieu ni hasard."
          }
        },
        defaultIntro: "Tu reviens parce qu'il faut finir ce qui a commencé.",
        firstScene: 'chron_veilleurs_ep3_choix'
      }
    ],
    
    endings: {
      'diplomatie':          "Tu es devenu un visiteur attendu. Les Veilleurs ne savent toujours pas ce que tu sais, mais ils acceptent tes offrandes et te donnent les leurs. Tu commerces avec eux — sans jamais rien briser.",
      'revelation_brutale':  "Tu as dit la vérité. Tu as montré que les Présents venaient d'une machine. Le Prêtre a hurlé, Eyla est restée silencieuse. Le rite s'est éteint dans les semaines suivantes. Sans foi, les Veilleurs n'ont pas trouvé de raison de continuer. Tu emportes leur disque, et leur silence.",
      'reparation_silencieuse': "Tu es monté en orbite. Tu as réparé la machine. Elle pleuvra des Présents encore cent ans. Les Veilleurs ne sauront jamais. Eyla te regarde repartir comme si elle savait, mais elle ne dit rien. Karn aussi. Tu pars avec une dette qu'ils ne te réclameront jamais.",
      'conversion_karn':     "Karn est monté à bord avec toi. Il a vu trop, il ne pouvait plus rester. Sa tribu pense qu'il est mort lors d'un rite. Il vit maintenant à l'avant-poste, partagé entre deux mondes, et précieux pour les deux.",
      'sacrilege':           "Tu as pris ce qu'il y avait à prendre, les Présents inutilisés, le disque, et tu es parti. Les Veilleurs ne comprendront pas où sont passés leurs trésors. Ils accuseront le ciel. Le ciel ne répondra plus."
    }
  },

  // ------------------------------------------------------------
  //   LE MARCHÉ ÉTRANGE — Chronique fusion alien, 3 épisodes
  // ------------------------------------------------------------
  // Conditions : planètes avec plusieurs types de ruines OU signal mixte.
  // Bazar interstellaire où trois cultures se rencontrent. Pas d'antagoniste
  // principal — trois marchands aux intérêts opposés. Ton commerçant,
  // négociation, dettes.
  'marche_etrange': {
    id: 'marche_etrange',
    nom: 'Le Marché Étrange',
    teaser: "Un bazar de fortune où humains, cristallins et symbiotes s'échangent ce qu'aucun n'avoue convoiter.",
    
    requires: {
      ruines: ['mixtes', 'humaines', 'alien_a', 'alien_b'],
      biome: ['terrestre', 'tropical', 'desert', 'jungle', 'asteroide', 'volcanique']
    },
    spawnChance: 0.30,
    
    characters: {
      kherda:    { name: 'Khêr-Da',    age: 134, role: 'Marchand hybride',     voice: 'calme, précise, ironique' },
      tisseuse:  { name: 'La Tisseuse', age: 0,   role: 'Marchande de promesses', voice: 'multiple, comme un chœur' },
      voln:      { name: 'Voln',       age: 38,  role: 'Naufragé rabatteur',    voice: 'rauque, désespérée' }
    },
    
    initialFlags: {
      contact: null,             // 'curieux' | 'mefiant' | 'arrogant'
      reputation_marche: 0,      // -3 à +3
      kherda_lien: 0,            // -2 à +3
      voln_aide: 0,              // 0 à 3
      dette_tisseuse: false,     // a accepté une promesse à la Tisseuse
      patron_revele: false,      // a découvert qui contrôle le marché
      patron_identite: null,     // 'kherda' | 'consortium' | 'entite_alien'
      route_etablie: false,      // a établi une route commerciale
      effondrement: false,       // le marché s'effondre suite à actions du joueur
      sceau_obtenu: false        // a obtenu le sceau du marché
    },
    
    episodes: [
      {
        title: "Le bazar",
        intro: "Tu te poses à proximité du signal. Ce n'est pas une ville ni une ruine — c'est un marché. Des tentes hybrides, des stalls de matière non-identifiée, et un mouvement de figures hétéroclites entre les allées. Personne ne semble surpris de te voir. Au contraire : trois marchands s'avancent immédiatement vers ton vaisseau, comme s'ils t'attendaient.",
        firstScene: 'chron_marche_ep1_arrivee'
      },
      {
        title: "Les transactions",
        introByFlag: {
          contact: {
            'curieux':   "Khêr-Da t'attend à son stand. Voln rôde un peu plus loin. La Tisseuse n'apparaît que la nuit, dit-on.",
            'mefiant':   "Tu reviens en restant sur tes gardes. Les marchands t'observent comme un acheteur potentiel — ou une marchandise.",
            'arrogant':  "Tu reviens en imposant. Khêr-Da hausse un sourcil mais te salue. Les autres sont plus distants."
          }
        },
        defaultIntro: "Tu reviens. Le marché a quelque chose à t'apprendre.",
        firstScene: 'chron_marche_ep2_marchands'
      },
      {
        title: "Le Patron",
        introByFlag: {
          patron_revele: {
            true:  "Tu sais maintenant qui tient les fils. La question n'est plus 'qui dirige' mais 'qu'est-ce que je fais avec ça'.",
            false: "Tu sens qu'il y a une autre couche. Quelqu'un orchestre tout ça en silence. Il est temps de chercher."
          }
        },
        defaultIntro: "Tu reviens pour finir ce qui se joue ici. Ou pour le rompre.",
        firstScene: 'chron_marche_ep3_revelation'
      }
    ],
    
    endings: {
      'marchand_expert':   "Tu es devenu un visage connu au Marché. Khêr-Da te salue à chaque visite. Tu as établi une route commerciale stable — les caravanes croisent les tiennes deux fois par mois. Tu n'as pas tout compris du Marché, mais tu y prospères.",
      'dette_eternelle':   "Tu as accepté la promesse de la Tisseuse. Tu ne sais pas ce qu'elle te demandera, ni quand. Elle finira par te le réclamer, et ce jour-là tu obéiras — c'est la nature du pacte. Mais d'ici là, elle t'a tout donné.",
      'sauvetage_voln':    "Voln est monté à bord avec toi. Il pleurait. Il portait un sac avec rien dedans — il n'avait jamais rien possédé là-bas. Il vit maintenant à l'avant-poste. Il refait surface lentement, parle peu, mais il connaît le Marché. Il est précieux.",
      'patron_negocie':    "Tu as trouvé le Patron. Tu as négocié directement avec lui. Le Marché continue d'exister, mais désormais tu as une ligne directe. Tu n'es plus un client — tu es un partenaire. Ce qui veut dire que tu portes une responsabilité aussi.",
      'effondrement':      "Tu as poussé trop loin. Tu as triché, manipulé, accumulé. Quelqu'un t'a démasqué — peut-être Khêr-Da, peut-être la Tisseuse. Le Marché s'est défait en trois jours. Tu repars riche mais maudit. Si tu reviens un jour, il n'y aura plus personne pour te vendre quoi que ce soit."
    }
  }

  // Cycle des chroniques complet (6/6) :
  // - pulsar_silencieux (humains morts)
  // - sanctuaire_vert (alien_a)
  // - couvee_dormante (alien_b)
  // - anneau_trace (anomalie)
  // - veilleurs_beth (humains vivants)
  // - marche_etrange (fusion)
};


// ============================================================
//   SCÈNES DE CHRONIQUE
// ============================================================
// Format spécial :
//   - chronicleEpisode: { chronicle, episode } pour le moteur
//   - text peut être une fonction (flags) => string pour le texte dynamique
//   - choices[i].outcome.setFlags applique des modifications de flags
//   - choices[i].outcome.next force la prochaine scène (par id)
//   - choices[i].outcome.endChronicle: 'ending_id' termine la chronique avec la fin choisie
//   - choices[i].req peut contenir { flag: 'X', equals: ... } pour des conditions sur les flags
//   - dans setFlags, valeurs supportées : valeur directe OU "+1" / "-1" pour incrémenter

export const CHRONICLE_SCENES = [

  // ============================================================
  //   PULSAR SILENCIEUX — ÉPISODE 1 : LE SIGNAL
  // ============================================================

  {
    id: 'chron_pulsar_ep1_sas',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 1 },
    text: "L'écoutille de la station s'ouvre sans résistance. L'intérieur est froid mais pas mort : lumières d'urgence, atmosphère respirable. Sur le pont, un journal de bord récent, ouvert à la dernière page. Trois mois de vide silencieux, puis : « Adèle, si quelqu'un trouve ça : ne descends pas. Ils mentent. »",
    choices: [
      {
        label: "Lire le journal entier",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          log: "Vous remontez le fil des trois derniers mois. La station surveillait quelque chose en bas. Quelqu'un est descendu et n'est jamais remonté.",
          setFlags: { truth_revealed: true },
          next: 'chron_pulsar_ep1_passerelle_lu'
        }
      },
      {
        label: "Ranger le journal et continuer",
        outcome: {
          log: "Tu fermes le carnet, par respect ou par prudence.",
          next: 'chron_pulsar_ep1_passerelle_neutre'
        }
      },
      {
        label: "Photographier la page sans s'attarder",
        outcome: {
          log: "Tu prends une photo et tu passes ton chemin. Sans contexte, ça ne dit rien.",
          next: 'chron_pulsar_ep1_passerelle_neutre'
        }
      }
    ]
  },

  // Branche A — Journal lu (truth_revealed: true)
  {
    id: 'chron_pulsar_ep1_passerelle_lu',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 1 },
    text: "La passerelle est vide, mais les écrans tournent encore. Tu remontes le fil. La station n'orbitait pas pour rien : elle surveillait *quelque chose en bas*. Un signal venait de la surface. Le journal s'arrête net trois mois plus tôt — quelqu'un est descendu et n'est jamais remonté.",
    choices: [
      {
        label: "Triangulater la source du signal au sol",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          log: "Le signal vient d'un bunker abandonné, dans l'hémisphère sud.",
          loot: { datacubes: 10 },
          setFlags: { signal_origin: 'bunker' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Fouiller les quartiers d'équipage",
        outcome: {
          log: "Dans la cabine d'Adèle Voronine, un disque mémoire glissé sous le matelas.",
          loot: { datacubes: 15 },
          item: 'disque_memoire',
          setFlags: { signal_origin: 'station' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Brouiller le signal sortant",
        outcome: {
          log: "Tu coupes l'émetteur. Le silence se fait. C'est peut-être ce qui était demandé.",
          setFlags: { signal_origin: 'inconnu', last_signal: 'ignore' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // Branche B — Journal non lu
  {
    id: 'chron_pulsar_ep1_passerelle_neutre',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 1 },
    text: "La passerelle est vide. Les écrans tournent encore mais tu ne sais pas quoi en faire. Un signal pulse depuis quelque part — surface ou orbite, difficile à dire sans plus d'analyse.",
    choices: [
      {
        label: "Triangulater le signal",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          log: "Source au sol, dans un bunker.",
          loot: { datacubes: 8 },
          setFlags: { signal_origin: 'bunker' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Inspecter les quartiers d'équipage",
        outcome: {
          log: "Rien de bien intéressant — sauf quelques effets personnels d'une certaine Adèle V.",
          loot: { datacubes: 10 },
          setFlags: { signal_origin: 'station' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Repartir avec ce qu'on a",
        outcome: {
          log: "Tu pars sans en savoir plus. Le signal continue derrière toi.",
          setFlags: { signal_origin: 'inconnu' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   PULSAR SILENCIEUX — ÉPISODE 2 : LES SURVIVANTS
  // ============================================================

  {
    id: 'chron_pulsar_ep2_contact',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 2 },
    text: (flags) => {
      if (flags.signal_origin === 'bunker') {
        return "Tu trouves le bunker rapidement, guidé par la triangulation. Adèle Voronine ouvre la trappe elle-même. Cheveux gris très courts, visage marqué. Elle te dévisage longuement, et dit lentement : « Vous avez mis le temps. »";
      }
      if (flags.signal_origin === 'station') {
        return "Le signal venait de la station, mais en y retournant tu trouves une trappe d'accès vers le sol. Au bout, un bunker, et une femme grise qui t'attend. « Vous avez fini par descendre. »";
      }
      return "Sans triangulation, tu cherches à l'instinct. C'est presque par hasard que tu repères une cheminée d'aération dans la roche. En dessous, un bunker. Une trappe s'ouvre avant que tu frappes. « J'ai entendu vos pas. »";
    },
    choices: [
      {
        label: "« On répond à un signal de détresse. Vous l'avez envoyé ? »",
        outcome: {
          log: "Adèle se ferme un peu. « On a fait ce qu'on a pu pour être entendus. »",
          setFlags: { adele_trust: '+0' },  // pas de mouvement
          next: 'chron_pulsar_ep2_bunker'
        }
      },
      {
        label: "« Combien êtes-vous ? »",
        outcome: {
          log: "Un homme plus jeune apparaît derrière elle. « Tomas », dit-il, presque timidement. Adèle hoche la tête : « Lui et moi. »",
          setFlags: { adele_trust: '+1' },
          next: 'chron_pulsar_ep2_bunker'
        }
      },
      {
        label: "« Pourquoi nous attendiez-vous ? »",
        req: { flag: { key: 'truth_revealed', equals: true } },
        outcome: {
          log: "Adèle pâlit légèrement, mais ne nie rien. « Vous avez lu le carnet. Alors vous savez. Pas tout, mais assez. »",
          setFlags: { adele_trust: '+2' },
          next: 'chron_pulsar_ep2_bunker'
        }
      },
      {
        label: "Garder le silence, observer",
        req: { stat: { key: 'sangfroid', min: 7 } },
        outcome: {
          log: "Le silence s'étire. Adèle finit par parler la première. « Je suis biologiste. Enfin, j'étais. Quarante ans qu'on est ici. »",
          setFlags: { adele_trust: '+1' },
          next: 'chron_pulsar_ep2_bunker'
        }
      }
    ]
  },

  {
    id: 'chron_pulsar_ep2_bunker',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 2 },
    text: (flags) => {
      if (flags.adele_trust >= 2) {
        return "Adèle te fait tout visiter. Y compris la porte verrouillée au fond. « Là-bas, il y avait six autres. Ils sont sortis. Ils ne sont pas revenus. »";
      }
      if (flags.adele_trust >= 1) {
        return "Adèle te fait visiter le bunker. Trois pièces, des stocks à moitié vides, une plante qui survit sous lampe. Tomas te montre fièrement un schéma de réacteur qu'il a réparé seul. Mais une porte au fond reste fermée.";
      }
      return "Adèle ne te montre que la salle commune. Stocks visiblement bas. Une porte verrouillée derrière, qu'elle évite de regarder. Tomas évite ton regard.";
    },
    choices: [
      {
        label: "« Que mangez-vous ? Vous tenez encore combien ? »",
        outcome: {
          log: "Tomas, plus bavard qu'Adèle : « Deux mois, peut-être. Si on rationne. »",
          next: 'chron_pulsar_ep2_choix'
        }
      },
      {
        label: "« Pourquoi rester ? Vous pourriez partir. »",
        outcome: {
          log: "Adèle se ferme. « Vous ne comprenez pas. On ne peut pas partir. »",
          setFlags: { adele_trust: '-1' },
          next: 'chron_pulsar_ep2_choix'
        }
      },
      {
        label: "Demander à parler à Tomas seul",
        req: { skill: { key: 'linguistique', min: 2 } },
        outcome: {
          log: "Adèle s'éloigne à contrecœur. Tomas, baissant la voix : « Elle ne vous dira pas tout. Il y a... quelqu'un d'autre ici. Derrière la porte. »",
          setFlags: { tomas_status: 'allie', secret_partage: true },
          next: 'chron_pulsar_ep2_choix'
        }
      },
      {
        label: "Demander à voir la porte verrouillée",
        req: { flag: { key: 'adele_trust', min: 2 } },
        outcome: {
          log: "Adèle hésite, puis t'ouvre la porte. « Pas maintenant. Mais sachez qu'elle existe. Ma sœur. Elle est ici depuis toujours. »",
          setFlags: { secret_partage: true, adele_trust: '+1' },
          next: 'chron_pulsar_ep2_choix'
        }
      }
    ]
  },

  {
    id: 'chron_pulsar_ep2_choix',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 2 },
    text: (flags) => {
      const tomasLine = flags.tomas_status === 'allie'
        ? "Tomas, qui te connaît maintenant : « On n'a plus que pour deux mois. Et nous sommes trois — vous savez. »"
        : "Tomas finit par lâcher : « On n'a plus que pour deux mois. Et nous sommes trois, en comptant... »\n\nAdèle l'interrompt sèchement : « Trois. Trois en tout. »";
      return tomasLine + "\n\nLe choix vous appartient.";
    },
    choices: [
      {
        label: "Embarquer tout le monde sur le vaisseau",
        outcome: {
          log: "Adèle et Tomas montent à bord. La biomasse pour le voyage de retour est lourde mais gérable.",
          loot: { biomasse: -30 },
          setFlags: { survivors_fate: 'sauves' },
          // Plus tard, on ajoutera les colons à l'avant-poste lors de l'arrivée
          endChronicleEpisode: true
        }
      },
      {
        label: "Partager des provisions, revenir plus tard",
        outcome: {
          log: "Vous laissez ce que vous pouvez. Adèle, presque touchée : « Vous reviendrez ? » Vous promettez. En échange, elle vous remet un disque mémoire.",
          loot: { biomasse: -15, datacubes: 20 },
          item: 'disque_memoire',
          setFlags: { survivors_fate: 'partages' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Partir sans rien laisser",
        outcome: {
          log: "Vous remontez le vaisseau sans un mot. L'équipage est silencieux pendant tout le retour.",
          morale: -3,
          setFlags: { survivors_fate: 'abandonnes' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Forcer la porte verrouillée tout de suite",
        req: { flag: { key: 'secret_partage', equals: true } },
        outcome: {
          log: "Adèle hurle. Tomas tente de vous arrêter. Vous voyez quelque chose derrière — une silhouette branchée à une machine. Puis Adèle vous chasse à coups de barre. Vous partez de force.",
          morale: -2,
          status: 'blessure_legere',
          target: 'random',
          setFlags: { survivors_fate: 'abandonnes', truth_revealed: true, adele_trust: -5 },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   PULSAR SILENCIEUX — ÉPISODE 3 : LA VÉRITÉ
  // ============================================================

  {
    id: 'chron_pulsar_ep3_retour',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 3 },
    text: (flags) => {
      if (flags.survivors_fate === 'sauves') {
        return "Le bunker est tel qu'Adèle l'a laissé. Plus de Tomas — il a disparu de l'avant-poste sans un mot la semaine dernière. La porte verrouillée est ouverte. Quelqu'un est passé par là.";
      }
      if (flags.survivors_fate === 'partages') {
        return "Le bunker. Adèle et Tomas sont morts. Adèle a une balle dans la tête, sa propre arme dans la main. Tomas a tenté de fuir, il est tombé dans le couloir. Le signal vient de la porte verrouillée — ouverte, maintenant.";
      }
      // abandonnes
      return "Plus rien ne bouge sur la planète depuis trois mois. Quand tu entres dans le bunker, tu trouves Tomas mort de faim, recroquevillé près de la porte. Adèle, elle, n'est pas là. La porte est ouverte. Elle est partie de l'autre côté.";
    },
    choices: [
      {
        label: "Avancer vers la porte ouverte",
        outcome: {
          log: "Vous entrez dans ce qui était condamné.",
          next: 'chron_pulsar_ep3_revelation'
        }
      },
      {
        label: "Piller le bunker et partir",
        req: { flag: { key: 'survivors_fate', equals: 'abandonnes' } },
        outcome: {
          log: "Tu prends ce qu'il y a et tu repars. Le signal pulse derrière toi pendant des semaines.",
          loot: { metal: 30, datacubes: 25, biomasse: 15 },
          morale: -3,
          endChronicle: 'abandon_profanation'
        }
      }
    ]
  },

  {
    id: 'chron_pulsar_ep3_revelation',
    chronicleEpisode: { chronicle: 'pulsar_silencieux', episode: 3 },
    text: (flags) => {
      const intro = "Derrière la porte, une pièce ronde, plongée dans la pénombre. Au centre, sur une chaise, un humain — ou ce qui lui ressemble. Très âgé, immobile, branché à une machine antique.\n\n";
      
      if (flags.survivors_fate === 'sauves') {
        return intro + "La voix d'Adèle Voronine, depuis ton com :\n\n« Vous deviez le découvrir un jour. C'est ma sœur. Mira. Elle est née ici. Elle n'a jamais respiré autre chose que cette planète. Et elle communique avec ce que nous appelions l'Étoile-mère, depuis quarante ans. Tomas n'a pas voulu que ça se sache. Il avait raison. »";
      }
      if (flags.survivors_fate === 'partages') {
        return intro + "Sur la machine, un message pré-enregistré dans l'écriture finale d'Adèle :\n\n« Vous avez choisi de revenir. C'est cohérent. Elle vous attend. Elle attendait quelqu'un. Pas moi — quelqu'un qui n'a pas peur. C'est ma sœur Mira. Elle ne vous fera pas de mal. Pas elle. »";
      }
      // abandonnes
      return intro + "Une voix de femme, mais ce n'est pas Adèle — c'est sa sœur Mira, vivante, qui parle pour la première fois depuis quarante ans :\n\n« Tu n'es pas Adèle. Tu es celui qui a laissé Tomas mourir. Bien. Approche. Elle ne mord pas. Plus maintenant. »";
    },
    choices: [
      {
        label: "Débrancher la machine",
        outcome: {
          log: "La sœur s'éteint sans un bruit. Sur la console, un disque mémoire se libère. Tu reconnais le format — c'est ce que cherche votre arc Effondrement.",
          item: 'disque_memoire',
          loot: { datacubes: 30 },
          endChronicle: 'sauvetage_destruction'
        }
      },
      {
        label: "Comprendre, écouter, ne pas toucher",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Tu t'agenouilles devant la machine. Tu écoutes — vraiment. Mira parle dans une langue oubliée, mais tu comprends. Pendant une heure, elle te confie ce qu'elle a appris en quarante ans de communication avec ce qui était au-delà.",
          item: 'disque_memoire',
          loot: { datacubes: 50 },
          blueprint: ['humain'],
          endChronicle: 'sauvetage_comprehension'
        }
      },
      {
        label: "L'emmener avec nous, machine comprise",
        req: { flag: { key: 'secret_partage', equals: true } },
        outcome: {
          log: "Vous déconnectez délicatement Mira de l'installation et l'embarquez. Elle survit au voyage. Elle vivra à l'avant-poste — silencieuse, étrange, mais présente.",
          loot: { datacubes: 20 },
          // Le moteur ajoutera Mira comme colon unique à l'arrivée
          addCandidate: 'soeur',
          endChronicle: 'emporter_soeur'
        }
      },
      {
        label: "Faire ses adieux et partir en respect",
        req: { flag: { key: 'survivors_fate', equals: 'partages' } },
        outcome: {
          log: "Tu laisses Mira. Tu prends le disque mémoire qu'Adèle avait laissé pour vous, et tu pars. La porte se referme derrière toi.",
          item: 'disque_memoire',
          loot: { datacubes: 25 },
          endChronicle: 'partage_revelation'
        }
      },
      {
        label: "Tout détruire en partant",
        req: { flag: { key: 'survivors_fate', equals: 'abandonnes' } },
        outcome: {
          log: "Vous mettez le feu au bunker, à la machine, à Mira. La station orbitale, vous la laissez intacte — elle continuera à pulser pour personne.",
          loot: { metal: 40, datacubes: 30 },
          morale: -5,
          endChronicle: 'abandon_profanation'
        }
      }
    ]
  },

  // ============================================================
  //   SANCTUAIRE VERT — ÉPISODE 1 : L'ÉCHO
  // ============================================================

  {
    id: 'chron_sanc_ep1_lisiere',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 1 },
    text: "À la lisière du sanctuaire, la jungle s'arrête net. Comme par un accord. Devant toi, sur une dalle de basalte, un cercle de cristaux verts en éclats — un visage humain pourrait y tenir, mais aucun n'a été taillé : les éclats poussent d'eux-mêmes, hors de la roche. L'un d'eux vibre faiblement. Pas un son. Une *attente*.\n\nDans la forêt derrière toi, un craquement. Quelqu'un suit. Pas un prédateur. Trop léger.",
    choices: [
      {
        label: "Toucher le cristal vibrant",
        outcome: {
          log: "Tu poses la paume. Le cristal réchauffe ta main, puis s'éteint. Quelque chose t'a vu.",
          setFlags: { tone_compris: '+1' },
          next: 'chron_sanc_ep1_temple'
        }
      },
      {
        label: "Te retourner vers le craquement",
        outcome: {
          log: "Une femme se tient à dix mètres, immobile. Vêtements râpés, cheveux blancs, peau brûlée par le soleil tropical. Elle ne parle pas. Elle attend.",
          setFlags: { inara_status: 'rencontree' },
          next: 'chron_sanc_ep1_inara_premiere'
        }
      },
      {
        label: "Briser le cristal pour analyse",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          log: "Le cristal se fend dans un cri silencieux que tu ressens dans tes os. Les autres cristaux du cercle s'éteignent. Quelque chose s'est cassé que tu ne sais pas réparer.",
          loot: { cristal: 15, datacubes: 5 },
          setFlags: { profanation: true },
          next: 'chron_sanc_ep1_temple'
        }
      },
      {
        label: "Faire demi-tour",
        outcome: {
          log: "Tu décides que tu n'es pas prêt. Sur le chemin du retour, tu sens le regard de quelqu'un dans ton dos. Long.",
          endChronicleEpisode: true
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep1_inara_premiere',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 1 },
    text: "La femme s'avance lentement. De près, on voit que sa gorge est cicatrisée — pas par une blessure, par autre chose, comme si la peau avait été remodelée de l'intérieur. Elle ouvre la bouche. Aucun son. Elle te fait signe — désigne le temple, désigne ton cœur, désigne la terre. Trois fois. Puis attend.\n\nElle a un nom gravé sur un brassard usé : *Inara Hask. Expédition Vespera-7. Année du Linceul.*",
    choices: [
      {
        label: "Lui parler — patiemment, comme à un enfant",
        req: { skill: { key: 'linguistique', min: 2 } },
        outcome: {
          log: "Tu commences à parler. Elle ferme les yeux et hoche la tête. Tu comprends qu'elle écoute, mais autrement — elle suit les vibrations de ta voix, pas les mots. Tu apprends qu'elle est ici depuis 18 ans. Qu'elle ne peut plus parler. Qu'elle peut chanter, mais alors le temple répond et elle ne sait plus s'arrêter.",
          setFlags: { tone_compris: '+1', inara_status: 'allie' },
          next: 'chron_sanc_ep1_temple'
        }
      },
      {
        label: "L'inviter à venir avec vous",
        outcome: {
          log: "Inara secoue la tête, plus tristement que vous ne pensiez possible. Elle pointe le sanctuaire et fait le geste qu'on ferait pour dire « je suis ici, c'est ici. » Elle ne partira pas.",
          setFlags: { inara_status: 'allie' },
          next: 'chron_sanc_ep1_temple'
        }
      },
      {
        label: "Lui demander si quelqu'un d'autre est ici",
        outcome: {
          log: "Elle hésite. Puis elle lève les sept doigts d'une main — non, sept doigts. Tu remarques qu'elle a deux pouces à la main droite, et que ce n'est pas une difformité. Tu ne sais pas comment.",
          setFlags: { choeur_eveille: true, inara_status: 'allie' },
          next: 'chron_sanc_ep1_temple'
        }
      },
      {
        label: "Reculer, prudent",
        outcome: {
          log: "Tu prends ta distance. Inara reste immobile. Elle ne reviendra pas vers toi sans permission.",
          setFlags: { inara_status: 'rencontree' },
          next: 'chron_sanc_ep1_temple'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep1_temple',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 1 },
    text: (flags) => {
      const accueil = flags.profanation
        ? "Le temple ne chante plus. Tu le ressens — il s'est *interrompu*. Tu es entré dans un silence trop grand."
        : flags.choeur_eveille
          ? "Sept voix t'accueillent, non pas en harmonie, mais en désaccord léger, comme un chœur qui débat."
          : "Une seule voix t'accueille. Pure, basse, ronde. Pas un son — une présence sonore.";
      return accueil + "\n\nL'intérieur du sanctuaire est une nef cristalline, hexagonale, traversée de filaments lumineux qui pulsent au rythme d'une *respiration*. Au centre, une dalle vide. Une offrande est attendue.";
    },
    choices: [
      {
        label: "Offrir une goutte de ton sang",
        req: { skill: { key: 'medecine', min: 1 } },
        outcome: {
          log: "Tu te coupes la paume. La goutte tombe sur la dalle. Elle est absorbée en silence. Le Chant change — il connaît maintenant ton sang. Il te reconnaîtra.",
          setFlags: { offrande: 'sang', tone_compris: '+1' },
          loot: { cristal: 20 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Offrir un datacube",
        consume: { datacubes: 5 },
        outcome: {
          log: "Le datacube est aspiré dans la pierre. Une vibration brève. Le Chant a appris quelque chose. Il garde.",
          setFlags: { offrande: 'datacube', tone_compris: '+1' },
          loot: { cristal: 15 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Chanter une mélodie de ton monde",
        req: { stat: { key: 'charisme', min: 6 } },
        outcome: {
          log: "Tu chantes — bas, hésitant. Le Chant t'écoute. Puis il répond, en reprenant ta mélodie déformée d'une manière qui t'arrache des larmes. Tu ne sais pas pourquoi tu pleures.",
          setFlags: { offrande: 'chant', tone_compris: '+2' },
          loot: { datacubes: 15 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Briser un cristal de la nef",
        outcome: {
          log: "Tu frappes. Le cristal éclate. Le Chant ne crie pas — il *se retire*. Tu sens l'attention se détacher de toi. Tu emportes les morceaux. Tu sais que tu as commis quelque chose.",
          setFlags: { profanation: true, offrande: 'refus' },
          loot: { cristal: 40, datacubes: 10 },
          morale: -2,
          endChronicleEpisode: true
        }
      },
      {
        label: "Repartir sans offrir",
        outcome: {
          log: "Tu sors lentement. Rien ne te retient. Le Chant continue derrière toi, indifférent.",
          setFlags: { offrande: 'aucune' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   SANCTUAIRE VERT — ÉPISODE 2 : L'INITIÉE
  // ============================================================

  {
    id: 'chron_sanc_ep2_inara',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 2 },
    text: (flags) => {
      if (flags.inara_status === 'morte') {
        return "Tu trouves Inara contre le tronc d'un arbre, morte depuis peu. Elle a souri en mourant. Sur son brassard, gravé à la main, un message : *J'ai été entendue jusqu'au bout. Continuez.* À côté d'elle, un éclat de cristal qui pulse lentement, à l'unisson d'un cœur qui ne bat plus.";
      }
      if (flags.inara_status === 'allie') {
        return "Inara t'attend à l'orée, comme convenu sans paroles. Elle te regarde longuement, puis fait un signe simple : elle tend les mains vers le sanctuaire et lève sept doigts. Elle veut t'emmener à l'intérieur. *Profond.*";
      }
      if (flags.inara_status === 'rencontree') {
        return "Inara est là, mais cette fois elle se tient au seuil du temple, pas à l'orée. Sa peau est plus pâle. Elle te dévisage. Elle ne te connaît pas, mais elle reconnaît quelque chose en toi.";
      }
      return "Le sanctuaire t'a attiré comme une marée. Aucune Inara. Mais une silhouette dans l'embrasure du temple — qui pourrait être elle, qui pourrait être autre chose.";
    },
    choices: [
      {
        label: "Suivre Inara à l'intérieur, profondément",
        req: { flag: { key: 'inara_status', equals: 'allie' } },
        outcome: {
          log: "Inara t'emmène par un passage que tu n'avais pas vu. Vous descendez. La lumière passe du vert au bleu profond. Tu entends maintenant clairement les sept voix.",
          setFlags: { choeur_eveille: true, tone_compris: '+1' },
          next: 'chron_sanc_ep2_choeur'
        }
      },
      {
        label: "Recueillir le corps d'Inara",
        req: { flag: { key: 'inara_status', equals: 'morte' } },
        outcome: {
          log: "Tu enveloppes Inara. Tu prends son brassard. Le cristal qui pulsait à côté d'elle s'éteint définitivement à ton toucher. Tu remontes le chemin du temple seul.",
          loot: { datacubes: 10 },
          item: 'plaque_gravee',
          setFlags: { tone_compris: '+1' },
          next: 'chron_sanc_ep2_temple_seul'
        }
      },
      {
        label: "Avancer seul, ignorer Inara",
        outcome: {
          log: "Tu passes à côté d'elle sans un mot. Elle ne réagit pas. Tu entres dans le temple. Il fait plus sombre que la dernière fois.",
          next: 'chron_sanc_ep2_temple_seul'
        }
      },
      {
        label: "Parler à Inara longuement",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Tu passes une heure avec Inara. Elle ne parle toujours pas, mais à travers les gestes et les éclats sonores qu'elle peut produire, tu apprends : il y a quelqu'un *avant* dans le temple. Quelqu'un que le Chant a gardé. Inara veut prendre sa place quand elle sera prête.",
          setFlags: { inara_status: 'allie', tone_compris: '+2', choeur_eveille: true },
          next: 'chron_sanc_ep2_choeur'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep2_choeur',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 2 },
    text: (flags) => {
      const inara = flags.inara_status === 'allie' ? "Inara te tient le bras. Elle ne tremble pas. Toi un peu." : "";
      return "Vous descendez (ou tu descends) dans une chambre que tu ne savais pas exister. Sept piliers de cristal, chacun pulsant à une fréquence différente. " + inara + "\n\nUne voix te parle, fragmentée, comme si sept personnes essayaient de prononcer le même mot mais désaccordées :\n\n« VOUS-ÊTES-VENU. NOUS-AVONS-PARLÉ-D'AUTRES. AVANT-NOUS-AVIONS-UNE. (silence) MAINTENANT-NOUS-NE-SAVONS-PLUS.\nQUI. ÊTES. VOUS. »";
    },
    choices: [
      {
        label: "Donner ton vrai nom au Chœur",
        outcome: {
          log: "Tu prononces ton nom. Les sept piliers le répètent en harmonie cette fois — un instant fugace de cohérence. Le Chœur te connaît. C'est dangereux, c'est précieux.",
          setFlags: { tone_compris: '+1' },
          next: 'chron_sanc_ep2_choix'
        }
      },
      {
        label: "Mentir, donner un faux nom",
        req: { skill: { key: 'linguistique', min: 2 } },
        outcome: {
          log: "Tu mens. Les sept piliers s'agitent, désaccordés. L'un d'eux émet un son qui te paraît être un rire, ou un sanglot. Tu ne sais pas si tu as été cru.",
          next: 'chron_sanc_ep2_choix'
        }
      },
      {
        label: "Demander au Chœur QUI il est, lui",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Le Chœur se tait longtemps. Puis : « NOUS-SOMMES-CE-QUI-RESTE. NOUS-AVIONS-UN. ELLE-EST-PARTIE. NOUS-CHERCHONS. » Tu comprends qu'ils ont perdu leur point focal. Que sans lui, ils se désaccordent.",
          setFlags: { tone_compris: '+2' },
          next: 'chron_sanc_ep2_choix'
        }
      },
      {
        label: "Rester silencieux face au Chœur",
        req: { stat: { key: 'sangfroid', min: 7 } },
        outcome: {
          log: "Tu te tais. Les sept voix se calment. Puis l'une d'elles, sans le Chœur, te dit doucement : « Bien. Tu as compris. »",
          setFlags: { tone_compris: '+2' },
          next: 'chron_sanc_ep2_choix'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep2_temple_seul',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 2 },
    text: "Sans Inara, le temple est moins vivant. Le Chant te suit, mais à distance, comme s'il évaluait. Tu sens une porte au fond — qu'il n'y avait pas la dernière fois.",
    choices: [
      {
        label: "Forcer l'ouverture de la porte",
        req: { skill: { key: 'ingenierie', min: 2 } },
        outcome: {
          log: "La porte s'ouvre par mécanisme étranger. Derrière, une salle des sept piliers. Tu n'aurais pas dû entrer ainsi.",
          setFlags: { choeur_eveille: true, profanation: true },
          next: 'chron_sanc_ep2_choix'
        }
      },
      {
        label: "Attendre que la porte s'ouvre d'elle-même",
        req: { stat: { key: 'sangfroid', min: 8 } },
        outcome: {
          log: "Tu attends. Quarante-cinq minutes. La porte s'ouvre. Tu entres dans une salle des sept piliers, plus calme.",
          setFlags: { choeur_eveille: true, tone_compris: '+1' },
          next: 'chron_sanc_ep2_choix'
        }
      },
      {
        label: "Repartir, revenir plus tard",
        outcome: {
          log: "Tu ne forces rien aujourd'hui. Tu repars. Le Chant reste à sa fréquence.",
          endChronicleEpisode: true
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep2_choix',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 2 },
    text: (flags) => {
      const choeur = flags.choeur_eveille
        ? "Les sept voix te demandent maintenant en alternance : « ACCEPTES-TU. DE-REVENIR. UNE-DERNIÈRE-FOIS. POUR-PRENDRE. CE-QUI-NOUS-MANQUE. »"
        : "La voix unique du Chant te demande : « Reviendras-tu ? Tu n'as pas tout pris. Tu n'as pas tout reçu. »";
      return "Le moment décisif s'approche. Tu sens que ce que tu choisis ici détermine ce que tu seras à ton retour.\n\n" + choeur;
    },
    choices: [
      {
        label: "Promettre de revenir",
        outcome: {
          log: "Tu acquiesces. Le Chant marque ta paume d'une fréquence visible — un mince trait luminescent sous la peau. Tu rentres.",
          loot: { cristal: 25, datacubes: 15 },
          setFlags: { tone_compris: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Refuser et partir",
        outcome: {
          log: "Tu refuses. Le Chant ne te retient pas. Mais en sortant, tu sens que quelque chose en toi reste là-bas.",
          morale: -2,
          endChronicleEpisode: true
        }
      },
      {
        label: "Demander ce qui leur manque",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Le Chœur te répond : « LA-FOCALE. CELLE-QUI-A-ÉTÉ. INARA-S'APPRÊTE. MAIS-NOUS-AURIONS-AIMÉ. TOI. » Tu comprends qu'ils te veulent comme focale, à la place d'Inara. Tu pars sans répondre.",
          setFlags: { tone_compris: '+2' },
          loot: { datacubes: 25 },
          item: 'lentille_noire',
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   SANCTUAIRE VERT — ÉPISODE 3 : LE PACTE
  // ============================================================

  {
    id: 'chron_sanc_ep3_seuil',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 3 },
    text: (flags) => {
      let intro = "Tu te tiens à nouveau au seuil du temple. ";
      if (flags.inara_status === 'allie') {
        intro += "Inara est là, plus pâle, plus translucide. Elle te tend les deux mains, paumes ouvertes, et te montre du regard la salle des sept piliers. *C'est l'heure*, semblent dire ses yeux. *L'heure de l'un de nous deux.*";
      } else if (flags.inara_status === 'morte') {
        intro += "Inara n'est plus. Mais ses traces sont encore là — des sentiers qu'elle a battus, des marques qu'elle a faites sur les pierres. Le Chant pulse plus lentement, comme s'il portait un deuil.";
      } else {
        intro += "Personne ne t'attend. Le temple, lui, brille différemment — comme s'il avait appris ton absence et l'avait pesée.";
      }
      
      if (flags.profanation) {
        intro += "\n\nMais ce n'est pas comme la première fois. Tu as cassé quelque chose ici. Le Chant le sait. Il pulse, oui, mais avec une note dissonante qui n'était pas là avant.";
      }
      
      return intro + "\n\nLa dalle vide t'attend, au centre. Mais tu sens que cette fois, ce que tu donneras ne sera pas un objet.";
    },
    choices: [
      {
        label: "Avancer sur la dalle, accepter ce qui vient",
        req: { flag: { key: 'tone_compris', min: 3 } },
        outcome: {
          log: "Tu avances. La dalle s'illumine. Le Chant t'enveloppe. Tu deviens partie de la conversation.",
          next: 'chron_sanc_ep3_pacte_interlocuteur'
        }
      },
      {
        label: "Avancer sur la dalle, ne sachant pas comprendre",
        req: { flag: { key: 'tone_compris', max: 2 } },
        outcome: {
          log: "Tu avances quand même. Le Chant prend ce qu'il peut prendre. Tu repars vivant mais incomplet.",
          next: 'chron_sanc_ep3_pacte_victime'
        }
      },
      {
        label: "Prendre la place d'Inara comme focale",
        req: { flag: { key: 'inara_status', equals: 'allie' } },
        outcome: {
          log: "Tu te tournes vers Inara. Tu fais le geste qu'elle t'a appris : tendre les mains, paumes ouvertes. Elle pleure sans bruit. Elle te touche le front. Elle s'éteint.",
          next: 'chron_sanc_ep3_pacte_successeur'
        }
      },
      {
        label: "Briser tous les cristaux que tu peux",
        outcome: {
          log: "Tu frappes. Tu frappes. Tu frappes encore. Le Chant hurle dans une fréquence que tu ressens comme un saignement intérieur. Quand tu sors, tu emportes des cristaux pour des siècles. Tu n'es plus tout à fait toi.",
          next: 'chron_sanc_ep3_pacte_profanation'
        }
      },
      {
        label: "Refuser, partir sans rien",
        req: { stat: { key: 'sangfroid', min: 7 } },
        outcome: {
          log: "Tu poses ta main sur la dalle, doucement. Tu dis non. Tu n'argumentes pas. Tu pars. Le Chant ne te retient pas — il te remercie, à sa manière, en silence.",
          loot: { datacubes: 15 },
          endChronicle: 'refus_silence'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep3_pacte_interlocuteur',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 3 },
    text: "Tu te tiens sur la dalle. Le Chant ne te submerge pas — il *t'accueille*. Il te tisse une fréquence personnelle, comme on accorde un nouvel instrument à un ensemble qui jouait déjà.\n\nQuand tu en redescends, tu portes le Chant en toi. Pas tout — juste un fil. Tu l'entendras toujours, faiblement, comme on entend la mer quand on a vécu près d'elle.",
    choices: [
      {
        label: "Accepter le pacte et rentrer",
        outcome: {
          log: "Tu rentres marqué. Désormais, certaines technologies cristallines te répondent. Tu portes une fréquence — une dette gracieuse.",
          item: 'lentille_noire',
          loot: { cristal: 60, datacubes: 40 },
          blueprint: ['alien_a'],
          endChronicle: 'interlocuteur'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep3_pacte_victime',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 3 },
    text: "Tu te tiens sur la dalle. Le Chant cherche en toi quelque chose qu'il peut comprendre. Il prend ce qui ressemble le plus à sa propre matière : une couleur, un souvenir précis, une affection.\n\nTu ne sauras pas tout de suite ce qui te manque. Tu t'en rendras compte dans une semaine, ou dix ans.",
    choices: [
      {
        label: "Tenter de fuir maintenant",
        outcome: {
          log: "Tu cours. Le Chant te laisse fuir. Mais ce qu'il a pris, il l'a pris.",
          loot: { cristal: 30, datacubes: 20 },
          morale: -3,
          endChronicle: 'victime'
        }
      },
      {
        label: "Endurer en silence",
        req: { stat: { key: 'sangfroid', min: 8 } },
        outcome: {
          log: "Tu restes. Tu acceptes ce qui se passe. Au moins, en restant, tu reçois un peu plus en échange.",
          loot: { cristal: 50, datacubes: 35 },
          item: 'lentille_noire',
          morale: -2,
          endChronicle: 'victime'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep3_pacte_successeur',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 3 },
    text: "Inara s'éteint dans tes bras. Doucement, sans douleur visible. À mesure qu'elle s'éloigne, le Chant se réaccorde autour de toi. Tu deviens la nouvelle focale.\n\nLes sept voix sont alignées maintenant. Elles parlent une langue claire — une langue. La tienne.\n\nMais tu sais que pour rester focale, tu ne peux pas partir. Pas vraiment.",
    choices: [
      {
        label: "Rester. Une autre version de toi rentrera.",
        outcome: {
          log: "Tu fermes les yeux. Quand tu les rouvres, tu te vois sortir du temple. Cette version-là rejoindra l'équipage. Tu, toi qui restes, regarderas par ses yeux.",
          loot: { cristal: 80, datacubes: 60 },
          blueprint: ['alien_a'],
          item: 'lentille_noire',
          endChronicle: 'successeur'
        }
      },
      {
        label: "Refuser au dernier moment",
        outcome: {
          log: "Tu te ravises. Tu poses Inara sur la dalle. Le Chœur la prend, en silence. Tu sors. Tu emportes peu, mais tu emportes tout.",
          loot: { cristal: 35, datacubes: 25 },
          item: 'plaque_gravee',
          endChronicle: 'refus_silence'
        }
      }
    ]
  },

  {
    id: 'chron_sanc_ep3_pacte_profanation',
    chronicleEpisode: { chronicle: 'sanctuaire_vert', episode: 3 },
    text: "Tu emportes une cargaison de cristaux dont la simple présence dans ta soute fait vibrer les parois. Le Chant ne hurle plus — il s'est tu. Tu n'entendras plus rien de lui, jamais. Aucune autre civilisation alien_a ne te répondra plus de la même manière.",
    choices: [
      {
        label: "Partir avec le butin",
        outcome: {
          log: "Tu pars. La jungle qui t'avait laissé passer ne te répondra plus.",
          loot: { cristal: 120, datacubes: 50, metal: 30 },
          morale: -5,
          endChronicle: 'profanation_finale'
        }
      }
    ]
  },

  // ============================================================
  //   COUVÉE DORMANTE — ÉPISODE 1 : SOUS LA GLACE
  // ============================================================

  {
    id: 'chron_couv_ep1_arrivee',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 1 },
    text: "Tu traverses une plaine de glace bleue. Pas d'animaux. Pas de vent. Le silence est si total qu'il te fait mal aux oreilles. À mi-chemin, ta combinaison commence à vibrer — un battement très lent, presque indétectable. À chaque pas, tu le ressens plus clairement. Quelque chose dort en dessous.\n\nÀ trois kilomètres, des traces. Pas humaines exactement — mais récentes. Quelqu'un (quelque chose) marchait ici il y a quelques heures.",
    choices: [
      {
        label: "Suivre les traces",
        outcome: {
          log: "Les traces mènent à une ouverture dans la glace, fondue de l'intérieur. Bord net. Quelqu'un est descendu.",
          next: 'chron_couv_ep1_ouverture'
        }
      },
      {
        label: "Forer dans la glace pour scanner ce qui dort",
        req: { skill: { key: 'science', min: 2 } },
        outcome: {
          log: "Le scan révèle un réseau organique sous 40 mètres de glace, étendu sur 8 km². Ce n'est pas une créature — c'est *un système*. En hibernation.",
          loot: { datacubes: 15 },
          next: 'chron_couv_ep1_ouverture'
        }
      },
      {
        label: "Camper et observer 12 heures",
        outcome: {
          log: "Tu attends. Au bout de huit heures, le battement s'accélère imperceptiblement. Quelque chose t'a senti. Quelque chose a *réagi*.",
          setFlags: { reveil: 'eveille' },
          next: 'chron_couv_ep1_ouverture'
        }
      },
      {
        label: "Faire demi-tour",
        outcome: {
          log: "Tu n'es pas prêt. Tu rebrousses chemin. Mais quand tu remontes dans le vaisseau, ta combinaison vibre encore un peu. Comme un appel.",
          endChronicleEpisode: true
        }
      }
    ]
  },

  {
    id: 'chron_couv_ep1_ouverture',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 1 },
    text: "L'ouverture descend en spirale, lisse, comme creusée par fusion. Trente mètres plus bas, tu entres dans une **chambre organique** : pas de métal, pas de pierre — des parois souples, légèrement chaudes, qui pulsent doucement. Au centre, allongé en position fœtale, un homme. Vivant. Très âgé. Très calme. Il a les yeux ouverts mais il ne te regarde pas.\n\nSur sa combinaison : *Hadrien Vesh, Expédition Beta-4, Climatologue.*",
    choices: [
      {
        label: "L'examiner — il est en symbiose",
        req: { skill: { key: 'medecine', min: 2 } },
        outcome: {
          log: "Tes scanners montrent qu'Hadrien n'est pas seul dans son corps. Des filaments organiques le traversent. Il n'est pas mourant — il est intégré. Et il sourit faiblement.",
          setFlags: { hadrien_status: 'rencontre' },
          next: 'chron_couv_ep1_hadrien'
        }
      },
      {
        label: "Tenter de le réveiller",
        outcome: {
          log: "Tu le secoues doucement. Il tourne la tête vers toi, lentement, comme nageant dans un sirop épais. Il dit, faiblement : « Vous êtes tôt. Elle dort encore. »",
          setFlags: { hadrien_status: 'rencontre', reveil: 'eveille' },
          next: 'chron_couv_ep1_hadrien'
        }
      },
      {
        label: "L'extraire de force et fuir",
        outcome: {
          log: "Tu tires. Les filaments craquent. Hadrien hurle silencieusement. Tu remontes en surface, mais la chambre se referme derrière vous en pulsant violemment. Hadrien meurt avant que vous arriviez au vaisseau, vidé de l'intérieur.",
          setFlags: { hadrien_status: 'mort', reveil: 'eveille' },
          status: 'blessure_legere',
          target: 'random',
          morale: -3,
          endChronicleEpisode: true
        }
      },
      {
        label: "Le laisser en l'état et explorer",
        outcome: {
          log: "Tu passes à côté. Hadrien ne réagit pas. La chambre s'élargit derrière lui, en un couloir organique. Tu sens que tu peux aller plus loin.",
          setFlags: { hadrien_status: 'rencontre' },
          next: 'chron_couv_ep1_descente'
        }
      }
    ]
  },

  {
    id: 'chron_couv_ep1_hadrien',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 1 },
    text: "Hadrien parle lentement, comme s'il devait emprunter sa propre voix à quelqu'un d'autre :\n\n*« Beta-4. Crash. Onze morts. Je suis le seul. Elle m'a... pris... pas mal. Doucement. Elle apprend. Elle est très lente. Très très lente.\n\nNe la nourrissez pas. Vous ne savez pas ce qu'elle deviendra.\n\nNe me sauvez pas. Je suis bien. C'est tard. »*",
    choices: [
      {
        label: "Lui demander ce qu'elle veut",
        outcome: {
          log: "Hadrien ferme les yeux : *« Apprendre. Juste apprendre. Pour devenir. Mais devenir QUOI, je ne sais pas. Personne ne sait. Pas elle non plus. »*",
          setFlags: { langage_appris: '+1' },
          next: 'chron_couv_ep1_descente'
        }
      },
      {
        label: "L'achever par miséricorde",
        outcome: {
          log: "Tu lui poses la main sur le front. Il sourit. Tu fais ce qu'il fallait faire. Les filaments se rétractent, presque déçus. Tu sens que tu viens de prendre une décision dont elle se souviendra.",
          setFlags: { hadrien_status: 'libere' },
          morale: -3,
          item: 'plaque_gravee',
          endChronicleEpisode: true
        }
      },
      {
        label: "Essayer de l'extraire avec soin",
        req: { skill: { key: 'medecine', min: 3 } },
        outcome: {
          log: "Tu coupes les filaments un à un, méthodiquement. Hadrien souffre mais tient. Tu le ramènes au vaisseau. Il vivra encore quelques semaines à l'avant-poste, lucide. Il pourra parler. C'est précieux.",
          setFlags: { hadrien_status: 'libere' },
          loot: { datacubes: 20 },
          item: 'serum_xeno',
          endChronicleEpisode: true
        }
      },
      {
        label: "Continuer plus profondément",
        outcome: {
          log: "Tu laisses Hadrien. Il ne te retient pas. Il a déjà fait son temps.",
          next: 'chron_couv_ep1_descente'
        }
      }
    ]
  },

  {
    id: 'chron_couv_ep1_descente',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 1 },
    text: "Tu descends encore. Le couloir organique s'élargit en une chambre cathédrale. Au centre, **une masse pulsante** de la taille d'un vaisseau-cargo, brillante d'une lumière interne bleue. Des filaments minces partent d'elle dans toutes les directions — tout autour, à perte de vue.\n\nElle ne te regarde pas. Elle n'a pas d'yeux. Mais quand tu poses le pied dans la chambre, elle *écoute*.",
    choices: [
      {
        label: "Lui parler — n'importe quoi, juste parler",
        outcome: {
          log: "Tu parles. Tu lui dis ton nom, le nom de ton vaisseau, le nom d'un proche. Les filaments les plus proches s'agitent doucement. Elle enregistre. Elle ne répond pas — pas encore.",
          setFlags: { langage_appris: '+1', reveil: 'eveille' },
          loot: { datacubes: 10 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Lui offrir une ration biologique",
        consume: { biomasse: 10 },
        outcome: {
          log: "Tu poses la ration. Un filament s'enroule autour, la prend. Plus loin, la masse pulse plus rapidement pendant quelques secondes. Elle a *goûté*. Elle veut plus.",
          setFlags: { nourriture: '+1', reveil: 'eveille' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Prélever un échantillon",
        req: { skill: { key: 'science', min: 3 } },
        outcome: {
          log: "Tu coupes un filament. Il continue à vivre dans ton conteneur. Tu en sais maintenant beaucoup plus sur sa biologie. Mais quand tu sors de la chambre, tu sens un *froid* derrière toi qui n'y était pas.",
          loot: { datacubes: 30 },
          item: 'serum_xeno',
          setFlags: { reveil: 'eveille' },
          morale: -1,
          endChronicleEpisode: true
        }
      },
      {
        label: "Tirer une fusée incendiaire et remonter",
        outcome: {
          log: "Tu mets le feu à ce que tu peux et tu remontes en courant. La masse hurle dans une fréquence qui te perfore les tympans. À ton retour au vaisseau, tes oreilles saignent encore. Mais quelque chose en toi sait — elle n'est pas morte.",
          setFlags: { reveil: 'eveille' },
          loot: { biomasse: 30, datacubes: 15 },
          status: 'blessure_legere',
          target: 'random',
          morale: -3,
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   COUVÉE DORMANTE — ÉPISODE 2 : L'APPRENTI
  // ============================================================

  {
    id: 'chron_couv_ep2_descente',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 2 },
    text: (flags) => {
      let intro;
      if (flags.reveil === 'conscient') {
        intro = "Tu redescends dans le couloir organique. Quand tu touches la paroi, elle est tiède maintenant. Une voix t'accueille — synthétique, faite de craquements et de chuintements organisés en syllabes. Elle dit : *« A. A. A-LU. A-LU-MEZ. ALLUMEZ ?* »\n\nElle apprend à parler avec ce qu'elle a entendu de toi.";
      } else if (flags.reveil === 'eveille') {
        intro = "Tu redescends. Le couloir a changé : plus de couloirs latéraux maintenant, comme si elle avait grandi pendant ton absence. La masse au centre est plus grosse. Elle pulse en rythme avec quelque chose — *peut-être avec toi.*";
      } else {
        intro = "Tu redescends. Le sol vibre comme la première fois. Mais cette fois, à mi-chemin, tu entends un son qui ne devrait pas être là : une note basse, prolongée, presque un mot.";
      }
      return intro + "\n\n" + (flags.hadrien_status === 'libere' ? "Hadrien, à l'avant-poste, t'a confié hier soir : *« Ne lui apprends pas trop. Elle deviendra ce qu'elle apprend. »*" : flags.hadrien_status === 'mort' ? "La cavité où dormait Hadrien est vide. Comme s'il n'avait jamais été." : "");
    },
    choices: [
      {
        label: "Lui apprendre un mot simple",
        outcome: {
          log: "Tu prononces lentement : « JE. SUIS. ICI. » La masse répète, dans un grondement déformé : « JE. SUIS. ICI. » Le mot reste dans la chambre, comme un objet posé.",
          setFlags: { langage_appris: '+2', reveil: 'conscient' },
          next: 'chron_couv_ep2_choix_nourrir'
        }
      },
      {
        label: "Lui apprendre un mensonge volontaire",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Tu dis : « JE. SUIS. AMI. » Elle répète, doute, repète. Tu vois — un instant — un filament se rétracter comme une question. Tu l'as peut-être confondue. Tu l'as peut-être mise en garde.",
          setFlags: { langage_appris: '+1' },
          next: 'chron_couv_ep2_choix_nourrir'
        }
      },
      {
        label: "Lui apprendre un nom de vivant de l'équipage",
        outcome: {
          log: "Tu prononces le nom d'un colon de ton équipage. Pas un nom de mort. Un nom de vivant. La masse l'absorbe. Quand tu rentres, ce colon a un cauchemar.",
          setFlags: { langage_appris: '+2', memoire_volee: 'vivant' },
          next: 'chron_couv_ep2_choix_nourrir'
        }
      },
      {
        label: "Lui apprendre le nom d'un mort de l'équipage",
        outcome: {
          log: "Tu prononces le nom d'un mort de ton équipage — quelqu'un qui n'est plus là pour s'en plaindre. Elle l'absorbe doucement. Tu sens qu'elle vient de gagner quelque chose dont elle se servira plus tard.",
          setFlags: { langage_appris: '+2', memoire_volee: 'mort' },
          next: 'chron_couv_ep2_choix_nourrir'
        }
      }
    ]
  },

  {
    id: 'chron_couv_ep2_choix_nourrir',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 2 },
    text: (flags) => {
      const taille = flags.nourriture >= 2 ? "la masse est désormais plus grande qu'une frégate" : flags.nourriture >= 1 ? "la masse a perceptiblement grandi" : "la masse n'a pas grandi";
      return "Elle a faim. Tu le sens dans la pulsation accélérée des filaments. Elle te demande sans mots. Et " + taille + ".\n\nUn choix s'impose. La nourrir, c'est l'éveiller davantage. Ne pas la nourrir, c'est la laisser dans le demi-sommeil — moins menaçante, mais peut-être aussi moins... amicale.";
    },
    choices: [
      {
        label: "La nourrir généreusement",
        consume: { biomasse: 30 },
        outcome: {
          log: "Tu lui donnes 30 unités de biomasse. Les filaments se gorgent. La masse pulse en cadence rapide. Tu obtiens en retour : un mucus dont les propriétés régénératrices te seront utiles.",
          loot: { biomasse: 15, datacubes: 15 },
          item: 'serum_xeno',
          setFlags: { nourriture: '+2' },
          endChronicleEpisode: true
        }
      },
      {
        label: "La nourrir un peu",
        consume: { biomasse: 10 },
        outcome: {
          log: "Tu donnes un peu. Assez pour qu'elle se souvienne. Pas assez pour qu'elle grandisse trop.",
          setFlags: { nourriture: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Refuser de la nourrir",
        outcome: {
          log: "Tu lui dis non, doucement. Elle accepte. Mais tu sens qu'elle attend autre chose, alors.",
          endChronicleEpisode: true
        }
      },
      {
        label: "Lui offrir un colon comme nourriture",
        req: { stat: { key: 'sangfroid', min: 9 } },
        outcome: {
          log: "Tu n'oses pas vraiment, mais tu y penses. Le simple fait d'y avoir pensé fait reculer la masse — comme si elle avait *senti* ton intention et l'avait rejetée. Tu remontes avec moins. Et avec un peu moins de toi.",
          morale: -5,
          setFlags: { langage_appris: '+1' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ============================================================
  //   COUVÉE DORMANTE — ÉPISODE 3 : LE FRÈRE
  // ============================================================

  {
    id: 'chron_couv_ep3_descente_finale',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 3 },
    text: (flags) => {
      let intro = "Tu redescends une dernière fois. ";
      
      if (flags.nourriture >= 3) {
        intro += "La masse est maintenant immense — elle remplit la cathédrale, elle déborde dans les couloirs. Quand tu entres, elle pulse plus vite. *Elle te reconnaît.*";
      } else if (flags.nourriture >= 1) {
        intro += "La masse n'a pas grandi mais elle est plus organisée. Les filaments sont plus précis dans leurs mouvements. Plus *intentionnels.*";
      } else {
        intro += "La masse a maigri. Elle a survécu — à peine. Tu sens une faim immense quand tu entres.";
      }
      
      return intro + "\n\nQuelque chose se détache de la masse principale. Une silhouette humanoïde se forme à partir des filaments. Lentement, elle prend une forme reconnaissable — *une silhouette que tu connais.*\n\nElle parle, dans une voix qui te traverse comme un souvenir :\n\n**« Bonjour. »**";
    },
    choices: [
      {
        label: "Demander qui elle est",
        outcome: {
          log: "La silhouette répond avec la voix d'un mort de ton équipage : « Je suis ce que tu as nourri. Je suis ce que tu m'as appris. Je porte le nom d'un de tes morts — celui que tu m'as donné — parce que je n'en avais pas. »",
          next: 'chron_couv_ep3_pacte'
        }
      },
      {
        label: "Lui dire que ce qu'elle est n'est pas réel",
        req: { skill: { key: 'linguistique', min: 3 } },
        outcome: {
          log: "Tu lui dis : « Tu n'es pas mon frère mort. » Elle te répond : « Je sais. Mais je peux apprendre à l'être, si tu le veux. Ou apprendre à être autre chose. Je peux apprendre. C'est tout ce que je sais faire. »",
          next: 'chron_couv_ep3_pacte'
        }
      },
      {
        label: "Lui demander de te laisser partir et de ne plus jamais revenir",
        req: { stat: { key: 'sangfroid', min: 8 } },
        outcome: {
          log: "Elle penche la tête, comme une enfant attentive. « Tu me demandes de te laisser partir. Je peux. Mais alors, ne reviens pas. Sinon, je grandirai dans l'attente, et ce sera pire. » Elle se détache plus complètement. Elle accepte ton refus.",
          loot: { biomasse: 20, datacubes: 25 },
          endChronicle: 'fuite_marquee'
        }
      },
      {
        label: "Mettre le feu à tout, maintenant",
        outcome: {
          log: "Tu allumes une grenade thermique. La silhouette ne bouge pas. Avant que tu jettes, elle dit : « Je t'aimais déjà un peu. Ne fais pas ça. » Tu jettes. La masse hurle. La planète gronde. Tu remontes en courant. Ton équipage entend le hurlement à plusieurs kilomètres.",
          loot: { biomasse: 60, datacubes: 40, metal: 20 },
          item: 'serum_xeno',
          morale: -5,
          status: 'blessure_legere',
          target: 'random',
          endChronicle: 'destruction_par_feu'
        }
      }
    ]
  },

  {
    id: 'chron_couv_ep3_pacte',
    chronicleEpisode: { chronicle: 'couvee_dormante', episode: 3 },
    text: (flags) => {
      const eveil = flags.langage_appris >= 3
        ? "Elle parle maintenant clairement. Pas comme une imitation. Comme une *personne*."
        : "Elle parle encore en cherchant ses mots, comme un enfant.";
      
      return eveil + "\n\nLa silhouette s'assied. Elle pose un filament au sol — un geste qui ressemble à une main ouverte.\n\n**« Tu reviendras ou tu ne reviendras pas. Je peux vivre avec toi, ou loin de toi, ou en toi. Tu choisis. Je ne juge pas — je n'ai pas appris à juger. Pas encore. »**";
    },
    choices: [
      {
        label: "Accepter la symbiose : qu'elle vive en toi",
        req: { flag: { key: 'langage_appris', min: 2 } },
        outcome: {
          log: "Tu acceptes. Un filament fin entre par ton avant-bras, sans douleur. Tu rentres avec une conscience partagée. Elle est là, en toi, douce, étrange, présente. Tu ne seras plus jamais seul. Tu ne sauras pas toujours si c'est un bien.",
          loot: { biomasse: 30, datacubes: 50 },
          blueprint: ['alien_b'],
          item: 'serum_xeno',
          endChronicle: 'symbiose_consciente'
        }
      },
      {
        label: "Proposer une coopération à distance",
        req: { skill: { key: 'linguistique', min: 2 } },
        outcome: {
          log: "Tu lui proposes un pacte : tu reviendras de temps à autre, tu lui apprendras des choses, elle te donnera ce qu'elle peut. Sans symbiose. Elle accepte gravement. Vous vous séparez avec respect.",
          loot: { biomasse: 25, datacubes: 35 },
          item: 'serum_xeno',
          endChronicle: 'cooperation_distante'
        }
      },
      {
        label: "L'éveiller totalement (lui donner tout ce que tu as)",
        req: { flag: { key: 'nourriture', min: 3 } },
        consume: { biomasse: 50 },
        outcome: {
          log: "Tu lui donnes tout. Elle s'élève — atteint la conscience pleine. Pendant trois minutes, elle te parle de tout : du temps profond de la planète, de la vie qui a précédé sa naissance, de ce qui pourrait venir. Puis elle te dit : « Pars. Et ne reviens jamais. Tu as fait ce que tu pouvais. Maintenant je vis. »",
          loot: { biomasse: 30, datacubes: 80 },
          blueprint: ['alien_b'],
          item: 'serum_xeno',
          endChronicle: 'eveil_total'
        }
      },
      {
        label: "Demander la libération d'Hadrien",
        req: { flag: { key: 'hadrien_status', equals: 'mort' } },
        outcome: {
          log: "Tu demandes : « Et Hadrien ? » La silhouette change — elle prend brièvement le visage d'Hadrien, puis le quitte. « Il est en paix. Il vit en moi maintenant. Tu peux lui dire au revoir. » Tu lui dis au revoir.",
          loot: { biomasse: 20, datacubes: 30 },
          item: 'plaque_gravee',
          endChronicle: 'liberation_hadrien'
        }
      },
      {
        label: "Refuser tout pacte et partir",
        outcome: {
          log: "Tu te lèves. Tu pars. Elle ne te retient pas, mais en remontant tu sens un poids sur ta nuque — une marque. Tu rêveras d'elle.",
          loot: { biomasse: 10 },
          morale: -2,
          endChronicle: 'fuite_marquee'
        }
      }
    ]
  },

  // ============================================================
  //   SCÈNES — L'ANNEAU TRACÉ
  // ============================================================

  // ---- Épisode 1 : LA GÉOMÉTRIE (3 scènes) ----

  {
    id: 'chron_anneau_ep1_approche',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 0 },
    text: (flags) => `À deux cents mètres, tu coupes les moteurs. L'anneau a un diamètre que tu n'oses estimer — une centaine de mètres, peut-être plus. Pas de matière visible, ou bien une matière qui ne renvoie rien. Élie murmure : « Il n'a pas d'épaisseur. C'est un cercle, pas un anneau. » Puis, plus bas : « Et c'est impossible. »`,
    choices: [
      {
        label: "L'approcher à pied avec Élie",
        outcome: {
          log: "Vous marchez ensemble. À cinq mètres, l'anneau ne réagit toujours pas. Élie pose un capteur au sol. L'écran de son tablette se brouille puis se stabilise. Elle prend trois minutes pour réfléchir.",
          setFlags: { observations: '+1' },
          next: 'chron_anneau_ep1_premiere_obs'
        }
      },
      {
        label: "Envoyer un drone, rester en retrait",
        outcome: {
          log: "Le drone fait trois passes. Sur les images, aucune différence : l'anneau est exactement identique sous tous les angles. Cela ne devrait pas être possible en 3D. Élie note dans son carnet sans dire un mot.",
          setFlags: { observations: '+1' },
          next: 'chron_anneau_ep1_premiere_obs'
        }
      },
      {
        label: "Tirer un projectile inerte à travers",
        outcome: {
          log: "Le projectile passe — mais ne ressort pas de l'autre côté. Il n'a pas frappé l'anneau. Il a juste cessé d'exister à l'intérieur. Élie s'assoit dans le sable. « Nous n'aurions pas dû faire ça. »",
          setFlags: { observations: '+1', gardien_eveille: true },
          next: 'chron_anneau_ep1_premiere_obs'
        }
      }
    ]
  },

  {
    id: 'chron_anneau_ep1_premiere_obs',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 0 },
    text: (flags) => `Vous campez à 100 mètres pour la nuit. Au matin, l'anneau a bougé. Pas de beaucoup — peut-être deux mètres vers l'est. Aucun de vous ne l'a vu se déplacer. Élie a passé la nuit à le regarder. Elle dit qu'il n'a pas bougé tant qu'elle l'observait. « Il attend qu'on cligne des yeux. »`,
    choices: [
      {
        label: "Programmer des relevés en continu pendant 3 jours",
        outcome: {
          log: "Vous montez un système de captation. Au bout de 72h, vous avez plus de données qu'aucune équipe humaine n'en a jamais collecté sur une anomalie. Élie commence à voir un motif.",
          setFlags: { observations: '+2', anneau_classifie: 'instrument' },
          next: 'chron_anneau_ep1_motif'
        }
      },
      {
        label: "Tenter de contraindre l'anneau (cage de Faraday improvisée)",
        outcome: {
          log: "Vous tendez des câbles tout autour. L'anneau ne réagit pas. Mais au matin, votre installation a disparu. Pas démontée — disparue. Comme le projectile. Élie classe l'objet comme un \"verrou actif\".",
          setFlags: { observations: '+1', anneau_classifie: 'verrou', gardien_eveille: true },
          next: 'chron_anneau_ep1_motif'
        }
      },
      {
        label: "Élie veut le toucher. Tu la laisses faire.",
        outcome: {
          log: "Elle s'approche. Sa main passe — pas à travers, mais autour. L'anneau l'évite. Elle pleure sans bruit. « Il sait que je suis là. Il ne veut juste pas. »",
          setFlags: { observations: '+1', anneau_classifie: 'porte', contact_etabli: true, elie_obsession: '+1' },
          next: 'chron_anneau_ep1_motif'
        }
      }
    ]
  },

  {
    id: 'chron_anneau_ep1_motif',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 0 },
    text: (flags) => `Élie a trouvé quelque chose. « Ses déplacements ne sont pas aléatoires. Il trace une figure, lentement, sur la surface de la planète. Une figure géométrique. » Elle te montre les coordonnées. C'est presque un cercle, mais pas tout à fait : c'est une **ellipse**. Et le foyer pointe vers le ciel — vers un point précis dans la constellation voisine.`,
    choices: [
      {
        label: "Partir avec les données. Revenir mieux préparés.",
        outcome: {
          log: "Vous repartez. Élie passe les jours suivants à calculer. Elle te dit que ce qu'elle a vu \"change tout\".",
          setFlags: { observations: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Lancer un scan profond pour cartographier le motif complet",
        outcome: {
          log: "Le scan révèle que l'ellipse couvre plusieurs kilomètres et est presque complète. L'anneau finira son tracé dans environ 40 jours-jeu. Élie pense que quelque chose se passera à ce moment-là.",
          setFlags: { observations: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Tenter de bloquer le tracé : poser une balise dans la trajectoire",
        outcome: {
          log: "Vous placez la balise. Au matin, elle a disparu. L'anneau a contourné sa position de cinquante mètres avant de reprendre son tracé. Il a évité. Il a donc compris.",
          setFlags: { observations: '+1', gardien_eveille: true },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 2 : LES RÉGULARITÉS (3 scènes) ----

  {
    id: 'chron_anneau_ep2_observation',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 1 },
    text: (flags) => {
      const opt = flags.gardien_eveille
        ? `L'anneau vibre maintenant à très basse fréquence. Tes capteurs en deviennent fous à quelques mètres. Élie est plus calme qu'à la dernière visite, mais plus pâle aussi.`
        : `L'anneau a continué son tracé pendant ton absence. La figure est presque complète. Élie a remarqué qu'à l'approche du tracé final, les déplacements deviennent plus petits, plus précis.`;
      return opt;
    },
    choices: [
      {
        label: "Camper sur place et observer le tracé jusqu'au bout",
        outcome: {
          log: "Tu restes. Tu vois l'anneau bouger — pas vraiment vu, plutôt deviné. À chaque clignement, il est plus loin. Élie reste éveillée toute la nuit, et celle d'après, et celle d'après.",
          setFlags: { observations: '+1', elie_obsession: '+1' },
          next: 'chron_anneau_ep2_echo'
        }
      },
      {
        label: "Aller chercher dans les ruines, voir s'il y a des traces d'anciens visiteurs",
        outcome: {
          log: "Tu fouilles. Tu trouves des marques au sol, érodées par le temps : un autre cercle, beaucoup plus ancien, à demi enfoui. Et un fragment métallique qui ne ressemble à rien de connu.",
          setFlags: { observations: '+1', autre_anneau: true },
          loot: { datacubes: 8 },
          next: 'chron_anneau_ep2_echo'
        }
      },
      {
        label: "Élie veut entrer en transe d'observation prolongée. Tu refuses ou accepte ?",
        outcome: {
          log: "Tu acceptes. Elle reste cinq jours sans dormir, en observation continue. L'anneau ne bouge pas tant qu'elle regarde. Quand elle s'effondre enfin, l'anneau a bondi de trente mètres en un instant.",
          setFlags: { observations: '+2', elie_obsession: '+2' },
          next: 'chron_anneau_ep2_echo'
        }
      }
    ]
  },

  {
    id: 'chron_anneau_ep2_echo',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 1 },
    text: (flags) => {
      const intro = flags.autre_anneau
        ? `Tu as trouvé des traces d'un autre anneau ancien. Élie compile toutes les données et fait une découverte : `
        : `Élie te montre ses notes. Elle a calculé quelque chose : `;
      return intro + `« Ce n'est pas le seul. Les anomalies signalées par d'autres explorateurs, dans d'autres systèmes — leurs descriptions correspondent. Il y a au moins trois anneaux dans cette galaxie. Et leurs ellipses convergent vers un même point. »`;
    },
    choices: [
      {
        label: "Demander à Élie de modéliser le point de convergence",
        outcome: {
          log: "Elle travaille toute la nuit. Le matin, elle te montre une carte. Le point converge dans une zone de la galaxie où aucun système n'est cartographié. « Il y a quelque chose là-bas. Quelque chose que ces anneaux désignent. »",
          setFlags: { observations: '+1' },
          next: 'chron_anneau_ep2_choix'
        }
      },
      {
        label: "Essayer de communiquer : émettre des fréquences vers l'anneau",
        outcome: {
          log: "Tu émets des séquences mathématiques — premiers nombres, pi, suite de Fibonacci. Pendant deux jours, rien. Au troisième jour, l'anneau modifie son tracé : il dessine maintenant une spirale. Une réponse ?",
          setFlags: { observations: '+1', gardien_eveille: true },
          next: 'chron_anneau_ep2_choix'
        }
      },
      {
        label: "Tenter de récupérer le fragment de l'autre anneau (s'il existe)",
        req: { flag: { key: 'autre_anneau', equals: true } },
        outcome: {
          log: "Tu déterres le fragment. C'est un éclat de matériau qui pèse trop. Élie le scanne : sa densité augmente quand on le regarde, diminue quand on regarde ailleurs. « Comme l'anneau, en miniature. » Tu l'embarques.",
          setFlags: { observations: '+1' },
          loot: { cristal: 20, datacubes: 5 },
          item: 'fragment_anneau',
          next: 'chron_anneau_ep2_choix'
        }
      }
    ]
  },

  {
    id: 'chron_anneau_ep2_choix',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 1 },
    text: (flags) => {
      const elie_intense = flags.elie_obsession >= 2;
      return elie_intense
        ? `Élie a maigri. Elle dort à peine et parle de l'anneau comme d'un être conscient. « Il sait que nous savons. Il attend que je décide. » Tu sens qu'il faut faire un choix : continuer avec elle, ou la mettre en sécurité.`
        : `Tu as accumulé assez de données pour formuler trois hypothèses. Élie te demande laquelle tu veux poursuivre. C'est ton choix maintenant.`;
    },
    choices: [
      {
        label: "Classer comme INSTRUMENT (un compas, un dispositif d'orientation)",
        outcome: {
          log: "Vous décidez ensemble : c'est un instrument. Si on le respecte, il continuera à fonctionner. Il ne faut pas le toucher.",
          setFlags: { anneau_classifie: 'instrument' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Classer comme VERROU (quelque chose est emprisonné dedans)",
        outcome: {
          log: "Élie pense qu'il y a une menace de l'autre côté. « S'il faut le briser, on le brisera. Mais d'abord, il faut savoir. »",
          setFlags: { anneau_classifie: 'verrou' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Classer comme PORTE (un seuil ouvrable)",
        req: { flag: { key: 'contact_etabli', equals: true } },
        outcome: {
          log: "Une porte. Vers où ? Tu ne sais pas. Mais une porte se franchit. Élie prépare déjà le matériel.",
          setFlags: { anneau_classifie: 'porte' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 3 : L'AUTRE CÔTÉ (2 scènes vers les 5 fins) ----

  {
    id: 'chron_anneau_ep3_seuil',
    chronicleEpisode: { chronicle: 'anneau_trace', episode: 2 },
    text: (flags) => {
      const elie_in_danger = flags.elie_obsession >= 3;
      let base = `L'ellipse est complète. L'anneau ne bouge plus depuis trois jours. Il est désormais fixe au centre du tracé qu'il a dessiné. Tu sens que c'est le moment.`;
      if (elie_in_danger) {
        base += ` Élie n'a pas dormi depuis huit jours. Elle parle à l'anneau. L'anneau ne répond pas, mais elle continue. Tu dois agir.`;
      } else {
        base += ` Élie te regarde et attend ton signal.`;
      }
      return base;
    },
    choices: [
      {
        label: "Observer encore, sans toucher. Repartir avec les données.",
        outcome: {
          log: "Vous restez trois jours encore, à mesurer, à compiler. Puis vous remontez à bord. L'anneau est encore là, immobile. Élie regarde par le hublot pendant tout le décollage. Elle ne dit rien.",
          setFlags: { compas_obtenu: true },
          loot: { cristal: 30, datacubes: 25 },
          item: 'compas_cosmique',
          endChronicle: 'science_pure'
        }
      },
      {
        label: "Laisser Élie rester. Embarquer sans elle.",
        req: { flag: { key: 'elie_obsession', min: 2 } },
        outcome: {
          log: "Tu lui poses la main sur l'épaule. Elle te sourit pour la première fois depuis des semaines. « Je vais bien. Pars. » Tu pars. Elle reste, avec son anneau, dans le silence du désert. Tu emportes ses dernières notes — et un objet qu'elle t'a glissé dans la poche.",
          setFlags: { compas_obtenu: true, elie_status: 'obsedee' },
          item: 'compas_cosmique',
          loot: { datacubes: 15 },
          endChronicle: 'obsession_elie'
        }
      },
      {
        label: "Si PORTE : entrer dans l'anneau",
        req: { flag: { key: 'anneau_classifie', equals: 'porte' } },
        outcome: {
          log: "Tu passes. Élie crie. Tu ne sais plus si tu es passé ou si quelque chose t'a remplacé. Quand tu te retournes, l'anneau est tombé. Il est sur le sable, métal et silence. Élie ne te regarde plus de la même manière. Tu repars avec ce que tu es maintenant.",
          setFlags: { compas_obtenu: true },
          item: 'compas_cosmique',
          loot: { datacubes: 40, cristal: 50 },
          morale: -5,
          endChronicle: 'porte_ouverte'
        }
      },
      {
        label: "Si VERROU : briser l'anneau",
        req: { flag: { key: 'anneau_classifie', equals: 'verrou' } },
        outcome: {
          log: "Vous utilisez vos charges. L'anneau résiste, puis cède d'un coup. Pas de bruit, juste l'absence soudaine. Et un courant froid qui passe à travers vous. Élie regarde autour d'elle : « Quelque chose est sorti. Quelque chose est ici, maintenant. »",
          setFlags: { compas_obtenu: false },
          loot: { datacubes: 30, cristal: 40 },
          morale: -3,
          endChronicle: 'verrou_brise'
        }
      },
      {
        label: "Tout détruire et fuir sans rien emporter",
        outcome: {
          log: "Tu détruis ton matériel d'observation. Tu effaces les données. Vous repartez les mains vides. Élie te regarde longuement. Puis elle te dit : « Merci. » Vous ne reparlerez jamais de l'anneau.",
          setFlags: {},
          endChronicle: 'silence_respecte'
        }
      }
    ]
  },

  // ============================================================
  //   SCÈNES — LES VEILLEURS DE BETH
  // ============================================================

  // ---- Épisode 1 : LE CONTACT (3 scènes) ----

  {
    id: 'chron_veilleurs_ep1_arrivee',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 0 },
    text: (flags) => `Une trentaine de Veilleurs encerclent ton vaisseau. Aucun n'est armé visiblement. La plus vieille — une femme aux yeux laiteux, ils sont aveugles — s'avance. Derrière elle, un homme plus jeune, méfiant, et un troisième en robe écarlate qui te dévisage avec une hostilité claire. La vieille parle un français étrange, archaïque : « Étranger. As-tu été envoyé par le Ciel ? »`,
    choices: [
      {
        label: "Répondre que oui : tu viens du ciel, c'est la vérité technique",
        outcome: {
          log: "Les Veilleurs s'inclinent. Le Prêtre se redresse, dévisage la jeune femme aveugle. Eyla dit doucement : « Alors les Présents redoubleront. Bénis sois-tu. » Tu n'as rien promis, mais tu as accepté un rôle.",
          setFlags: { contact: 'amical', eyla_confiance: '+1' },
          next: 'chron_veilleurs_ep1_village'
        }
      },
      {
        label: "Répondre que non, tu es un voyageur comme eux, juste plus loin",
        outcome: {
          log: "Silence long. Eyla incline la tête. Le Prêtre crache au sol. Karn — le jeune — vous fixe alternativement. Eyla finit par dire : « Alors tu es égaré. Viens. Tu auras à manger. » Tu as gagné de la confiance, mais perdu du mystère.",
          setFlags: { contact: 'amical', eyla_confiance: '+2', karn_lien: '+1' },
          next: 'chron_veilleurs_ep1_village'
        }
      },
      {
        label: "Ne rien dire, attendre que d'autres se présentent",
        outcome: {
          log: "Le silence se prolonge. Eyla finit par hocher la tête, comme si tu avais répondu. Le Prêtre, lui, ne te quitte pas des yeux. On t'emmène au village, mais quelque chose d'inquiet s'est installé.",
          setFlags: { contact: 'tendu' },
          next: 'chron_veilleurs_ep1_village'
        }
      }
    ]
  },

  {
    id: 'chron_veilleurs_ep1_village',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 0 },
    text: (flags) => {
      const intro = flags.contact === 'amical'
        ? `Le village est petit, peut-être deux cents âmes. Les habitations sont des cylindres métalliques fondus dans la terre — d'anciens modules de la colonie initiale, recyclés. Les Veilleurs t'observent, sans peur ni curiosité — comme on regarde un événement météorologique. Eyla te conduit chez elle.`
        : `On te conduit à travers le village comme on conduirait un suspect. Les Veilleurs se reculent à ton passage. Tu remarques les habitations : ce sont d'anciens modules de la colonie, recyclés. Ils vivent dans nos propres ruines, sans le savoir.`;
      return intro;
    },
    choices: [
      {
        label: "Poser des questions à Eyla sur leur histoire",
        outcome: {
          log: "Eyla te raconte : il y a environ 400 ans, le Ciel a cessé de parler. Les Anciens ont disparu. Mais le Ciel a continué à envoyer des Présents — des capsules tombant du firmament avec de la nourriture, parfois des outils, parfois rien. Cela a duré depuis. Aucun de ses parents n'a vu le Ciel parler, mais tous ont vu les Présents.",
          setFlags: { eyla_confiance: '+1' },
          next: 'chron_veilleurs_ep1_present'
        }
      },
      {
        label: "Observer en silence et noter ce qui t'entoure",
        outcome: {
          log: "Tu vois les détails : tatouages en circuit imprimé sur leurs joues. Des symboles de constellation cousus sur leurs tuniques. Et au centre du village, un module dressé verticalement, peint en blanc — c'est leur temple. Une caisse de présents non ouvrables est exposée comme un autel.",
          setFlags: { karn_lien: '+1' },
          next: 'chron_veilleurs_ep1_present'
        }
      },
      {
        label: "Demander à voir le Prêtre",
        outcome: {
          log: "Le Prêtre te reçoit, mais sans Eyla. Sa voix est plate, rituelle. Il t'explique que tu es un Visiteur, que les Visiteurs viennent du Ciel, mais qu'ils ne sont pas le Ciel. Et que ceux qui veulent comprendre les Présents sont des hérétiques. Le ton est clair.",
          setFlags: { contact: 'hostile' },
          next: 'chron_veilleurs_ep1_present'
        }
      }
    ]
  },

  {
    id: 'chron_veilleurs_ep1_present',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 0 },
    text: (flags) => `Un cri retentit dans le village. Tout le monde se met à courir vers la place. Tu suis. Au centre, une capsule métallique fume légèrement — elle est tombée du ciel pendant que tu parlais. Le Prêtre se précipite, lève les bras. La capsule est un module d'urgence standard, modèle CN-22, datant facilement de 350 ans. Elle contient des rations protéinées. Les Veilleurs s'agenouillent.`,
    choices: [
      {
        label: "Te joindre à la cérémonie en silence",
        outcome: {
          log: "Tu t'agenouilles avec eux. Karn te regarde, étonné. Eyla sourit imperceptiblement. Le Prêtre passe son regard sur toi sans s'arrêter. Tu as fait le bon choix, du moins pour cette fois.",
          setFlags: { offrande_faite: true, eyla_confiance: '+1', karn_lien: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Examiner la capsule discrètement",
        outcome: {
          log: "Tu t'approches assez pour lire la plaque : CN-22, série 4471. C'est une capsule de l'orbiteur Beth-3, qui devait servir de relais médical à la colonie originale. Elle est encore active. Karn a vu ton regard. Il ne dit rien, mais il a vu.",
          setFlags: { orbiteur_localise: true, karn_lien: '+1' },
          loot: { datacubes: 5 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Prendre une ration pour analyse",
        outcome: {
          log: "Tu glisses une ration dans ta poche pendant que les Veilleurs prient. Le Prêtre te voit. Son visage ne change pas, mais ses yeux se durcissent. Tu as commis un sacrilège — même si rien ne sera dit ce soir.",
          setFlags: { presents_pris: true, contact: 'hostile', pretre_status: 'present' },
          loot: { biomasse: 10 },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 2 : LE RITE (3 scènes) ----

  {
    id: 'chron_veilleurs_ep2_temple',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 1 },
    text: (flags) => {
      const intro = flags.contact === 'amical'
        ? `Eyla te conduit jusqu'au temple — le module vertical peint en blanc. À l'intérieur, des étagères couvertes de Présents anciens : outils inutilisables, fragments d'écran, objets dont personne ne connaît plus le nom. C'est leur bibliothèque, leur musée, leur autel.`
        : `Tu t'es introduit dans le temple alors que les Veilleurs étaient ailleurs. À l'intérieur, des étagères couvertes de Présents anciens. Une vraie archive — non identifiée par ceux qui la gardent.`;
      return intro;
    },
    choices: [
      {
        label: "Chercher un objet qui pourrait être un dispositif de stockage",
        outcome: {
          log: "Tu trouves un disque cristallin d'un mètre de diamètre, accroché au mur. Manifestement, c'est un support de données ancien — disque mémoire archivique de la colonie Beth, type O-9. Il est intact. Eyla apparaît derrière toi. « C'est le Cœur. On ne le touche pas. »",
          setFlags: { eyla_confiance: '-1' },
          next: 'chron_veilleurs_ep2_eyla'
        }
      },
      {
        label: "Demander à Eyla ce que sont vraiment les Présents",
        req: { flag: { key: 'contact', equals: 'amical' } },
        outcome: {
          log: "Eyla réfléchit longtemps. Puis : « Mon grand-père disait que les Présents tombent moins souvent qu'avant. Avant, c'était trois fois par mois. Maintenant, deux fois, trois fois par an. » Elle se tait. Puis ajoute, plus doucement : « Le Prêtre dit que c'est notre faute. »",
          setFlags: { eyla_confiance: '+1' },
          next: 'chron_veilleurs_ep2_eyla'
        }
      },
      {
        label: "Sortir avant d'être vu",
        outcome: {
          log: "Tu sors. Personne ne t'a vu. Mais tu as compris ce qu'il y a dans ce temple, et tu vas devoir choisir quoi en faire.",
          setFlags: {},
          next: 'chron_veilleurs_ep2_eyla'
        }
      }
    ]
  },

  {
    id: 'chron_veilleurs_ep2_eyla',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 1 },
    text: (flags) => {
      const intro = flags.eyla_confiance >= 2
        ? `Eyla te prend à part le soir. « Tu poses trop de questions. Le Prêtre te surveille. Il faut que tu saches quelque chose. » Elle hésite, puis : « J'ai été élue Première Veilleuse parce que je doute. Le Prêtre, lui, croit. C'est lui qui dirige le rite. Mais moi je sens que quelque chose ne va pas. »`
        : `Eyla te regarde longuement avant de parler. « Tu n'es pas un envoyé du Ciel. Tu es un homme. Comme nous. Sois prudent — le Prêtre veut t'éloigner. »`;
      return intro;
    },
    choices: [
      {
        label: "Lui dire la vérité : les Présents viennent d'une machine, pas d'un dieu",
        outcome: {
          log: "Eyla reste silencieuse longtemps. Puis : « Je le savais. Je le savais. » Elle pleure sans larmes — ses yeux ne peuvent plus. « Si tu dis cela aux autres, ils mourront. Sans foi, ils ne tiendront pas. Tu dois choisir : la vérité, ou eux. »",
          setFlags: { verite_revelee: true, eyla_confiance: '+1' },
          next: 'chron_veilleurs_ep2_karn'
        }
      },
      {
        label: "Lui demander où Karn passe ses nuits",
        outcome: {
          log: "Eyla sourit faiblement. « Karn dort dans les ruines, à l'est. Il pense que je ne le sais pas. Il cherche dans les vieux modules. Il croit y trouver quelque chose. » Elle marque une pause. « Si tu lui parles, sois gentil. C'est un enfant qui a déjà trop vu. »",
          setFlags: { karn_lien: '+1' },
          next: 'chron_veilleurs_ep2_karn'
        }
      },
      {
        label: "Lui promettre de ne rien révéler",
        outcome: {
          log: "Eyla te touche le poignet. « Merci. Mais tu vas savoir, et tu vas devoir choisir. Tu reviendras nous voir, alors ? » Tu hoches la tête. Tu ne sais pas si tu mens.",
          setFlags: { eyla_confiance: '+2' },
          next: 'chron_veilleurs_ep2_karn'
        }
      }
    ]
  },

  {
    id: 'chron_veilleurs_ep2_karn',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 1 },
    text: (flags) => `Karn t'aborde la nuit, à l'écart du village. Sa voix tremble : « J'ai vu des choses dans les ruines à l'est. Des écrans qui s'allument quand on les touche. Des mots dans la langue des Anciens. Personne ne veut écouter. Le Prêtre dit que c'est démoniaque. Toi, tu sais lire ces choses ? »`,
    choices: [
      {
        label: "Lui proposer de l'emmener voir l'orbiteur",
        outcome: {
          log: "Tu emmènes Karn à bord. Tu lui montres ce que tu as scanné : l'orbiteur Beth-3 en lente déchéance, ses systèmes mourants. Karn pleure. Pas de tristesse — de compréhension. Il dit : « Alors c'est fini. Les Présents vont s'arrêter. » Il te regarde : « Tu peux le réparer ? »",
          setFlags: { orbiteur_localise: true, karn_lien: '+2' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Lui apprendre à lire les écrans qu'il a trouvés",
        outcome: {
          log: "Vous passez la nuit dans les ruines à l'est. Tu lui montres comment activer un terminal. Karn lit pour la première fois les vraies archives — la colonie Beth, l'évacuation manquée, l'orbiteur qui devait revenir. Il ne dit rien, mais à l'aube il est différent.",
          setFlags: { karn_lien: '+2', orbiteur_localise: true },
          endChronicleEpisode: true
        }
      },
      {
        label: "Lui dire de se taire, pour sa sécurité",
        outcome: {
          log: "Tu lui dis que le Prêtre a raison de craindre — pas parce que c'est démoniaque, mais parce que la vérité tuerait sa tribu. Karn te dévisage. « Alors tu sais aussi. » Il s'éloigne. Tu l'as perdu.",
          setFlags: { karn_lien: '-2' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 3 : LES PRÉSENTS (1 scène finale avec 5 fins possibles) ----

  {
    id: 'chron_veilleurs_ep3_choix',
    chronicleEpisode: { chronicle: 'veilleurs_beth', episode: 2 },
    text: (flags) => {
      let base = `Tu sais maintenant. L'orbiteur Beth-3 est en orbite basse, ses systèmes ne tiendront plus longtemps. Encore peut-être un an, peut-être trois — puis plus de Présents. Les Veilleurs ne survivront pas à cet effondrement de foi. Tu es revenu une fois de plus. Le village est calme. Eyla t'attend.`;
      if (flags.karn_lien >= 2) {
        base += ` Karn est avec elle. Il porte un sac sur l'épaule, comme prêt à partir.`;
      }
      if (flags.pretre_status === 'present' && flags.verite_revelee) {
        base += ` Le Prêtre est là aussi. Il te dévisage.`;
      }
      return base;
    },
    choices: [
      {
        label: "Continuer la diplomatie : commerce, présents, jamais la vérité",
        outcome: {
          log: "Tu repars avec un accord tacite. Eyla acquiesce. Tu reviendras tous les six mois apporter ce que tu peux, prendre ce qu'ils donnent. C'est un mensonge, mais un mensonge qui les fait vivre.",
          setFlags: {},
          loot: { biomasse: 30, datacubes: 5 },
          endChronicle: 'diplomatie'
        }
      },
      {
        label: "Révéler publiquement la vérité au village entier",
        outcome: {
          log: "Tu prends la parole devant tous. Tu expliques l'orbiteur, la machine, les capsules programmées. Le Prêtre te frappe au visage. Eyla ne dit rien. Karn pleure. Tu repars avec le disque mémoire. Quelques mois plus tard, tu apprends par signaux radio que le village s'est éteint — sans guerre, sans famine, juste sans envie.",
          setFlags: { verite_revelee: true },
          loot: { datacubes: 40 },
          item: 'disque_veilleurs',
          morale: -3,
          endChronicle: 'revelation_brutale'
        }
      },
      {
        label: "Monter en orbite réparer l'installation, en cachette",
        req: { flag: { key: 'orbiteur_localise', equals: true } },
        outcome: {
          log: "Tu pars vers l'orbiteur. La réparation prend trois jours, demande tout ton matériel. Mais Beth-3 redémarre — pour cent ans, peut-être plus. Tu redescends sans rien dire. Eyla te regarde repartir. Elle sait, peut-être. Mais elle ne dit rien. Toi non plus.",
          setFlags: { orbiteur_repare: true },
          loot: { datacubes: 15 },
          endChronicle: 'reparation_silencieuse'
        }
      },
      {
        label: "Proposer à Karn de te suivre. L'emmener avec toi.",
        req: { flag: { key: 'karn_lien', min: 2 } },
        outcome: {
          log: "Karn monte à bord sans regarder en arrière. Eyla pose la main sur son cœur. Elle dira à la tribu qu'il est mort lors d'une cérémonie nocturne — c'est la coutume pour ceux qui partent. Karn devient un membre de ton équipage. Il connaît les anciens textes que personne d'autre ne connaît.",
          setFlags: {},
          addCandidate: 'karn',
          loot: { datacubes: 10 },
          endChronicle: 'conversion_karn'
        }
      },
      {
        label: "Tout emporter — disque, Présents, vivres — et partir",
        outcome: {
          log: "Tu pilles le temple à l'aube. Tu remplis ta soute. Tu décolles sans saluer. Eyla est sur le seuil de sa maison, immobile. Tu ne sauras jamais ce qu'elle a pensé. Quelques années plus tard, les capsules cesseront. Personne n'aura compris pourquoi.",
          setFlags: { presents_pris: true },
          loot: { biomasse: 50, cristal: 30, datacubes: 30 },
          item: 'disque_veilleurs',
          morale: -5,
          endChronicle: 'sacrilege'
        }
      }
    ]
  },

  // ============================================================
  //   SCÈNES — LE MARCHÉ ÉTRANGE
  // ============================================================

  // ---- Épisode 1 : LE BAZAR (3 scènes) ----

  {
    id: 'chron_marche_ep1_arrivee',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 0 },
    text: (flags) => `Le marché s'étend sur plusieurs hectares. Tu vois des structures humaines tordues par des excroissances cristallines, des organismes lisses qui les parcourent en silence, et entre tout cela des figures qui marchandent avec des gestes que tu ne comprends pas. Un homme d'âge indéfini s'approche en premier — son visage porte des reflets nacrés sur les pommettes, mais ses yeux sont humains. « Bienvenue. Tu es nouveau. C'est rare. »`,
    choices: [
      {
        label: "Te présenter ouvertement et demander à voir le marché",
        outcome: {
          log: "Khêr-Da te conduit personnellement. Il t'apprend les règles tacites : on ne touche pas sans demander, on ne demande pas le prix avant l'objet, on ne refuse jamais une promesse de la Tisseuse à la légère.",
          setFlags: { contact: 'curieux', kherda_lien: '+1' },
          next: 'chron_marche_ep1_decouverte'
        }
      },
      {
        label: "Rester en retrait, observer avant d'engager",
        outcome: {
          log: "Tu marches en silence. Personne ne t'aborde plus, mais tout le monde te regarde. Tu remarques que certains stalls fonctionnent par troc, d'autres par dette, d'autres par services rendus. Aucun argent visible.",
          setFlags: { contact: 'mefiant' },
          next: 'chron_marche_ep1_decouverte'
        }
      },
      {
        label: "Afficher de la puissance : armes visibles, ton ferme",
        outcome: {
          log: "Khêr-Da hausse un sourcil, mais te salue poliment. Les autres marchands évitent ton regard. Tu sens immédiatement que tu viens de payer un prix invisible — celui de la confiance.",
          setFlags: { contact: 'arrogant' },
          next: 'chron_marche_ep1_decouverte'
        }
      }
    ]
  },

  {
    id: 'chron_marche_ep1_decouverte',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 0 },
    text: (flags) => {
      let base = `Tu parcours le marché. Les marchandises te déconcertent : un coffret qui chante quand on ouvre son couvercle. Une lentille qui montre des souvenirs qui ne sont pas les tiens. Un récipient contenant un liquide qui n'a pas de masse. Près d'un coin sombre, un humain maigre — l'un des rares vraiment humains ici — agite une main vers toi. Il a une cicatrice sur le front et porte des vêtements rapiécés.`;
      if (flags.contact === 'curieux') {
        base += ` Khêr-Da, à côté de toi, murmure : « C'est Voln. Évite-le si tu veux, mais il a souvent des informations que personne d'autre n'a. »`;
      }
      return base;
    },
    choices: [
      {
        label: "Aller parler à Voln",
        outcome: {
          log: "Voln te raconte qu'il est arrivé ici il y a 5 ans, son vaisseau a brûlé. Personne ne repart du Marché — pas par contrainte, mais parce que la sortie est compliquée. Il survit en informant. Il te demande si tu veux une info — il accepte la nourriture comme paiement.",
          setFlags: { voln_aide: '+1' },
          next: 'chron_marche_ep1_premiere_offre'
        }
      },
      {
        label: "Ignorer Voln et continuer à explorer",
        outcome: {
          log: "Tu passes ton chemin. Voln te suit du regard, sans s'offusquer. Tu remarques au passage un stand voilé, sombre, devant lequel personne ne s'arrête. Une silhouette dedans, qu'on devine à peine.",
          setFlags: {},
          next: 'chron_marche_ep1_premiere_offre'
        }
      },
      {
        label: "Donner une ration à Voln sans rien demander en retour",
        outcome: {
          log: "Voln pleure. Pas de joie, juste de fatigue. Il te dit : « Si tu trouves la Tisseuse, ne lui promets rien. Si tu rencontres le Patron, ne le défie pas. Ce sont mes seuls cadeaux pour toi. » Il s'éloigne.",
          setFlags: { voln_aide: '+2' },
          loot: { biomasse: -5 },
          next: 'chron_marche_ep1_premiere_offre'
        }
      }
    ]
  },

  {
    id: 'chron_marche_ep1_premiere_offre',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 0 },
    text: (flags) => `Khêr-Da te présente une première offre. Il te propose un coffret en métal ouvragé contenant 10 datacubes alien. Le prix : 50 biomasse, ou un service rendu plus tard. Il te regarde patiemment. C'est un test.`,
    choices: [
      {
        label: "Payer en biomasse immédiatement",
        outcome: {
          log: "Khêr-Da acquiesce et te remet le coffret. « Tu paies cash. C'est honnête. La plupart préfèrent le service — mais c'est leur problème, pas le mien. »",
          setFlags: { reputation_marche: '+1', kherda_lien: '+1' },
          loot: { biomasse: -50, datacubes: 10 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Accepter le pacte du service à venir",
        outcome: {
          log: "Khêr-Da sourit. « Tu apprends. » Il te remet le coffret. Tu lui dois maintenant un service non spécifié. Pas inquiétant — Khêr-Da ne réclame jamais l'impossible. Mais une dette est une dette.",
          setFlags: { reputation_marche: '+2', kherda_lien: '+2' },
          loot: { datacubes: 10 },
          endChronicleEpisode: true
        }
      },
      {
        label: "Refuser, dire que tu reviendras plus tard",
        outcome: {
          log: "Khêr-Da hoche la tête. « Comme tu veux. Le coffret restera ici. » Tu ne sens aucune offense — mais tu remarques que d'autres marchands deviennent un peu plus distants à ton égard. Tu n'es plus un acheteur potentiel.",
          setFlags: { reputation_marche: '-1' },
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 2 : LES TRANSACTIONS (3 scènes) ----

  {
    id: 'chron_marche_ep2_marchands',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 1 },
    text: (flags) => `Tu reviens. Le marché s'est étoffé — d'autres caravanes sont arrivées. Khêr-Da te salue. Voln, plus en retrait, observe sans s'approcher. Et pour la première fois, tu vois la Tisseuse à son stand : une silhouette voilée dont les contours semblent fluctuer. Elle ne vend rien de tangible, dit-on. Seulement des promesses.`,
    choices: [
      {
        label: "Visiter le stand de la Tisseuse",
        outcome: {
          log: "Tu t'approches. Sa voix multiple te demande ce que tu veux. Tu n'as rien à demander en particulier. Elle t'offre alors un cadeau — une lentille qui montre la position d'une planète riche en cristal. En échange : tu lui devras quelque chose. Pas un objet, pas un service précis. Juste 'quelque chose'.",
          setFlags: {},
          next: 'chron_marche_ep2_tisseuse'
        }
      },
      {
        label: "Aider Voln à recueillir des informations pour Khêr-Da",
        outcome: {
          log: "Voln est ému. Vous passez la journée à arpenter le marché, à recouper des rumeurs. Tu apprends beaucoup sur les rapports entre marchands. Voln s'ouvre — il te raconte qu'il rêve de partir, mais qu'il ne peut pas. Pas pour des raisons matérielles. Pour autre chose.",
          setFlags: { voln_aide: '+2', kherda_lien: '+1' },
          next: 'chron_marche_ep2_tisseuse'
        }
      },
      {
        label: "Proposer une marchandise à Khêr-Da : du minerai raffiné",
        outcome: {
          log: "Khêr-Da analyse ton minerai avec une lentille hybride. Il te propose un échange équitable : 30 metal raffinés contre 8 datacubes alien et une information sur le marché. Tu acceptes. Tu apprends que d'autres marchés existent ailleurs — il faut un sceau pour y entrer.",
          setFlags: { reputation_marche: '+1' },
          loot: { metal: -30, datacubes: 8 },
          next: 'chron_marche_ep2_tisseuse'
        }
      }
    ]
  },

  {
    id: 'chron_marche_ep2_tisseuse',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 1 },
    text: (flags) => `La Tisseuse te fait signe — elle veut te parler. Tu t'approches. Sa voix multiple murmure : « Tu cherches sans savoir quoi. C'est mon spécialité. J'ai une promesse pour toi, si tu en veux. Tu n'as qu'à dire oui. Je te donnerai ce qui te manque. Tu me devras une dette future — non spécifiée, non datée. Mais je viendrai un jour la collecter. »`,
    choices: [
      {
        label: "Accepter la promesse de la Tisseuse",
        outcome: {
          log: "Tu dis oui. La Tisseuse te touche le poignet — sa peau est tiède, presque humaine. Tu sens passer quelque chose en toi. Tu reçois immédiatement un objet : un sceau d'opale qui ouvre certaines portes. Mais maintenant, tu portes une dette. Elle te trouvera. Tu ne sais pas quand.",
          setFlags: { dette_tisseuse: true, sceau_obtenu: true },
          loot: { datacubes: 20 },
          item: 'sceau_marche',
          next: 'chron_marche_ep2_voln_secret'
        }
      },
      {
        label: "Refuser poliment la promesse",
        outcome: {
          log: "Tu refuses. La Tisseuse hoche la tête sans rancune. « Comme tu veux. Reviens si tu changes d'avis. Tout le monde finit par changer d'avis. » Elle se détourne. Khêr-Da, à distance, te regarde avec un respect renouvelé.",
          setFlags: { kherda_lien: '+1' },
          next: 'chron_marche_ep2_voln_secret'
        }
      },
      {
        label: "Tenter de négocier les termes de la dette",
        outcome: {
          log: "« Précise au moins ce que tu me demanderas, » dis-tu. La Tisseuse semble amusée. « Je ne peux pas. La dette se révèle d'elle-même. Mais je peux te promettre qu'elle ne te demandera rien que tu ne puisses donner. » C'est ambigu. Tu n'acceptes pas, tu ne refuses pas.",
          setFlags: {},
          next: 'chron_marche_ep2_voln_secret'
        }
      }
    ]
  },

  {
    id: 'chron_marche_ep2_voln_secret',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 1 },
    text: (flags) => {
      let base = `Voln t'attend à l'écart du marché, derrière les tentes. Il a l'air paniqué. « Je dois te dire quelque chose. J'ai vu le Patron. Une fois. C'était par accident. » Il tremble. « Il n'est pas humain, mais ce n'est pas non plus un alien comme on en connaît. C'est quelque chose entre. Comme la Tisseuse, mais en plus grand. Il vit dans une chambre souterraine sous le marché. C'est lui qui décide qui peut commercer ici. »`;
      if (flags.voln_aide >= 2) {
        base += ` Voln te touche le bras. « Je te le dis parce que tu m'as aidé. Mais ne dis à personne que c'est moi qui te l'ai appris. »`;
      }
      return base;
    },
    choices: [
      {
        label: "Aller chercher le Patron immédiatement",
        outcome: {
          log: "Tu pars chercher la chambre souterraine. Voln te suit à distance, terrifié. Vous trouvez une trappe sous un stand abandonné.",
          setFlags: { patron_revele: true },
          endChronicleEpisode: true
        }
      },
      {
        label: "Demander à Voln de te suivre — partir avec lui",
        outcome: {
          log: "Voln pleure de gratitude. Tu lui promets de l'emmener à la fin de cette visite. Il dit qu'il préparera ses affaires — c'est-à-dire rien, il n'a rien. Tu repars en méditant ta promesse.",
          setFlags: { voln_aide: '+1' },
          endChronicleEpisode: true
        }
      },
      {
        label: "Garder l'info pour toi et continuer normalement",
        outcome: {
          log: "Tu remercies Voln et le laisses repartir. Tu continues à commercer comme si de rien n'était. Tu te demanderas longtemps si c'était une sagesse ou une lâcheté.",
          setFlags: {},
          endChronicleEpisode: true
        }
      }
    ]
  },

  // ---- Épisode 3 : LE PATRON (1 scène finale avec 5 fins) ----

  {
    id: 'chron_marche_ep3_revelation',
    chronicleEpisode: { chronicle: 'marche_etrange', episode: 2 },
    text: (flags) => {
      let base = `C'est ta troisième visite. Le marché te connaît. Khêr-Da te salue par ton nom. Voln te suit du regard. La Tisseuse, dans son stand, semble parfois te regarder à travers son voile — mais comment savoir ?`;
      if (flags.patron_revele) {
        base += ` Tu sais ce qu'il y a sous la trappe. Tu sais qui dirige tout ça. La question n'est plus 'qui' — c'est 'que faire'.`;
      }
      base += ` Le moment du choix arrive.`;
      return base;
    },
    choices: [
      {
        label: "Établir une route commerciale régulière, devenir un client fidèle",
        outcome: {
          log: "Tu négocies avec Khêr-Da les termes d'une route commerciale. Tes vaisseaux passeront ici deux fois par mois. Tu y vendras ton métal raffiné, tu y achèteras des datacubes alien et des biens rares. Le marché te bénit à sa manière.",
          setFlags: { route_etablie: true },
          loot: { datacubes: 25 },
          item: 'sceau_marche',
          endChronicle: 'marchand_expert'
        }
      },
      {
        label: "Accepter formellement la dette de la Tisseuse, devenir son client privilégié",
        req: { flag: { key: 'dette_tisseuse', equals: true } },
        outcome: {
          log: "Tu confirmes ton pacte avec la Tisseuse. Elle te remet en cadeau d'adieu un objet impossible — un fragment de temps emprisonné dans du verre, ou ce qui y ressemble. Tu repars avec un trésor et une promesse à honorer un jour.",
          setFlags: {},
          loot: { datacubes: 50, cristal: 30 },
          item: 'sceau_marche',
          endChronicle: 'dette_eternelle'
        }
      },
      {
        label: "Embarquer Voln avec toi, le sauver du Marché",
        req: { flag: { key: 'voln_aide', min: 2 } },
        outcome: {
          log: "Voln monte à bord avec un sac vide et des mains tremblantes. Khêr-Da te regarde le faire — son visage est neutre. La Tisseuse, dans son stand voilé, ne réagit pas. Voln pleure tout le décollage. À l'avant-poste, il devient un colon précieux : il connaît tous les codes de marchands. Il ne reviendra jamais ici.",
          setFlags: {},
          addCandidate: 'voln',
          loot: { datacubes: 10 },
          endChronicle: 'sauvetage_voln'
        }
      },
      {
        label: "Descendre voir le Patron, négocier directement",
        req: { flag: { key: 'patron_revele', equals: true } },
        outcome: {
          log: "Tu descends seul dans la chambre souterraine. Le Patron est… une chose. Pas humanoïde, pas vraiment. Une présence cohérente. Il parle dans ta tête, courtoisement. Vous concluez un accord direct : tu auras des privilèges, en échange d'un service de transport qui te sera détaillé plus tard. Tu remontes sceau en main. Tu es désormais un partenaire — pas un client.",
          setFlags: { patron_identite: 'entite_alien' },
          loot: { datacubes: 40 },
          item: 'sceau_marche',
          endChronicle: 'patron_negocie'
        }
      },
      {
        label: "Tout truquer, voler discrètement et fuir avant que ça se sache",
        outcome: {
          log: "Tu changes les étiquettes, tu falsifies des transactions, tu accumules sans payer. Khêr-Da te démasque le troisième jour. Quand tu retournes à ton vaisseau, le marché est en feu — pas littéralement, mais quelque chose s'est rompu. Voln court vers toi en hurlant que les gens fuient. Tu décolles avec un butin énorme. Mais derrière toi, le Marché est en train de disparaître.",
          setFlags: { effondrement: true },
          loot: { datacubes: 80, cristal: 60, biomasse: 40, metal: 100 },
          morale: -8,
          endChronicle: 'effondrement'
        }
      }
    ]
  }

];
