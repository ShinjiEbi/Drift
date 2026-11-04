// src/content/histoires/anneau-trace.js — « L'Anneau Tracé », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- anneau_trace.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'anneau_trace',
  titre: "L'Anneau Tracé",
  accroche: 'Un cercle parfait, immobile, qui change de place quand on ne le regarde pas.',

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: {
    lieu: "corps.atmosphere == 'anormale' && corps.biome dans ['desert', 'glace', 'volcanique', 'exotique', 'asteroide', 'jungle']",
    chance: 0.3,
  },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    observations: 0,             // nombre d'observations rigoureuses (0-5)
    elie_status: 'present',      // 'present' | 'allie' | 'mort' | 'absent' | 'obsedee'
    elie_obsession: 0,           // 0-3, augmente quand on appuie sur les choix scientifiques
    anneau_classifie: null,      // 'instrument' | 'verrou' | 'porte' | null
    contact_etabli: false,       // a touché l'anneau (geste interdit)
    autre_anneau: false,         // a découvert qu'il en existe d'autres
    gardien_eveille: false,      // a déclenché une réaction de l'anneau
    compas_obtenu: false,        // le compas cosmique a été récupéré
  },

  personnages: {
    elie: {
      nom: 'Dr. Élie Calvet',
      age: 39,
      pronoms: 'elle',
      role: 'Physicienne théoricienne',
      voix: 'précise, inquiète',
      recrue: { competences: { science: 4, ingenierie: 2 }, traits: ['savant_eclaire', 'insomniaque'] },
    },
  },

  fins: {
    science_pure: { titre: 'La science', texte: "Tu as observé sans toucher. Élie publie ses travaux à bord. L'anneau reste là, intact. Tu ramènes des mesures qui changent la physique. Et un compas qui pointe vers d'autres anneaux." },
    obsession_elie: { titre: "L'obsession", texte: "Élie ne revient pas. Elle a choisi de rester pour continuer ses observations. Tu ne la reverras pas. Elle t'a laissé ses notes — et le compas." },
    porte_ouverte: { titre: 'La porte', texte: "Tu as ouvert. Quelque chose est passé — dans un sens ou dans l'autre. L'anneau est tombé. Élie est revenue changée. Tu portes désormais une chose." },
    verrou_brise: { titre: 'Le verrou brisé', texte: "Tu as détruit le verrou. Quelque chose s'est libéré sur cette planète. Tu ne sais pas quoi. Élie pense qu'il faut prévenir. Tu pars sans avoir compris." },
    silence_respecte: { titre: 'Le cercle intact', texte: "Tu as choisi de ne pas comprendre. Tu pars sans rien emporter. Élie ne comprend pas, mais te respecte. L'anneau reste, dans son cercle parfait, à attendre quelqu'un d'autre." },
  },

  episodes: [
    {
      titre: 'La géométrie',
      debut: 'ep1_approche',
      intro: "Tu approches du site signalé par les capteurs. L'anomalie est visible avant même que tu te poses : un cercle gigantesque, parfaitement régulier, à un mètre du sol. Aucune ombre, aucun bruit. Élie Calvet, ton experte embarquée, ne dit plus rien depuis dix minutes.",
    },
    {
      titre: 'Les régularités',
      debut: 'ep2_observation',
      intro: {
        unParmi: [
          { si: "anneau_classifie == 'instrument'", texte: "Tu reviens avec une hypothèse : c'est un instrument, peut-être un compas. Élie a passé six jours à compiler les données. Elle veut continuer." },
          { si: "anneau_classifie == 'verrou'", texte: "Tu reviens parce que tu n'as pas le choix. Si c'est un verrou, comme le pense Élie, alors quelque chose attend de l'autre côté. Et tu veux savoir quoi." },
          { si: "anneau_classifie == 'porte'", texte: "Tu reviens avec une idée folle : si c'est une porte, alors elle s'ouvre. Et si elle s'ouvre, quelque chose entre — ou quelque chose sort." },
          { texte: "Tu reviens. Tu n'as pas vraiment décidé pourquoi. L'anneau est toujours là. Sauf qu'il a légèrement bougé, semble-t-il." },
        ],
      },
    },
    {
      titre: "L'autre côté",
      debut: 'ep3_seuil',
      intro: {
        unParmi: [
          { si: 'gardien_eveille', texte: "Quelque chose a changé. L'anneau émet désormais une vibration sub-sonique. Élie dit qu'il « répond ». À quoi exactement, elle ne sait pas." },
          { si: 'gardien_eveille == faux', texte: "L'anneau attend. Toi aussi tu attends quelque chose, sans pouvoir le nommer." },
          { texte: "Tu reviens parce qu'il faut bien finir ce qu'on a commencé." },
        ],
      },
    },
  ],

  scenes: {
    ep1_approche: {
      titre: 'Le cercle',
      texte: "À deux cents mètres, tu coupes les moteurs. L'anneau a un diamètre que tu n'oses estimer — une centaine de mètres, peut-être plus. Pas de matière visible, ou bien une matière qui ne renvoie rien. Élie murmure : « Il n'a pas d'épaisseur. C'est un cercle, pas un anneau. » Puis, plus bas : « Et c'est impossible. »",
      choix: [
        {
          label: "L'approcher à pied avec Élie",
          effets: [
            { texte: "Vous marchez ensemble. À cinq mètres, l'anneau ne réagit toujours pas. Élie pose un capteur au sol. L'écran de son tablette se brouille puis se stabilise. Elle prend trois minutes pour réfléchir." },
            { drapeau: { observations: '+1' } },
            { aller: 'ep1_premiere_obs' },
          ],
        },
        {
          label: 'Envoyer un drone, rester en retrait',
          effets: [
            { texte: "Le drone fait trois passes. Sur les images, aucune différence : l'anneau est exactement identique sous tous les angles. Cela ne devrait pas être possible en 3D. Élie note dans son carnet sans dire un mot." },
            { drapeau: { observations: '+1' } },
            { aller: 'ep1_premiere_obs' },
          ],
        },
        {
          label: 'Tirer un projectile inerte à travers',
          effets: [
            { texte: "Le projectile passe — mais ne ressort pas de l'autre côté. Il n'a pas frappé l'anneau. Il a juste cessé d'exister à l'intérieur. Élie s'assoit dans le sable. « Nous n'aurions pas dû faire ça. »" },
            { drapeau: { observations: '+1', gardien_eveille: true } },
            { aller: 'ep1_premiere_obs' },
          ],
        },
      ],
    },

    ep1_premiere_obs: {
      titre: 'La première nuit',
      texte: "Vous campez à 100 mètres pour la nuit. Au matin, l'anneau a bougé. Pas de beaucoup — peut-être deux mètres vers l'est. Aucun de vous ne l'a vu se déplacer. Élie a passé la nuit à le regarder. Elle dit qu'il n'a pas bougé tant qu'elle l'observait. « Il attend qu'on cligne des yeux. »",
      choix: [
        {
          label: 'Programmer des relevés en continu pendant 3 jours',
          effets: [
            { texte: "Vous montez un système de captation. Au bout de 72h, vous avez plus de données qu'aucune équipe humaine n'en a jamais collecté sur une anomalie. Élie commence à voir un motif." },
            { drapeau: { observations: '+2', anneau_classifie: 'instrument' } },
            { aller: 'ep1_motif' },
          ],
        },
        {
          label: "Tenter de contraindre l'anneau (cage de Faraday improvisée)",
          effets: [
            { texte: "Vous tendez des câbles tout autour. L'anneau ne réagit pas. Mais au matin, votre installation a disparu. Pas démontée — disparue. Comme le projectile. Élie classe l'objet comme un « verrou actif »." },
            {
              drapeau: { observations: '+1', anneau_classifie: 'verrou', gardien_eveille: true },
            },
            { aller: 'ep1_motif' },
          ],
        },
        {
          label: 'Élie veut le toucher. Tu la laisses faire.',
          effets: [
            { texte: "Elle s'approche. Sa main passe — pas à travers, mais autour. L'anneau l'évite. Elle pleure sans bruit. « Il sait que je suis là. Il ne veut juste pas. »" },
            {
              drapeau: {
                observations: '+1',
                anneau_classifie: 'porte',
                contact_etabli: true,
                elie_obsession: '+1',
              },
            },
            { aller: 'ep1_motif' },
          ],
        },
      ],
    },

    ep1_motif: {
      titre: "L'ellipse",
      texte: "Élie a trouvé quelque chose. « Ses déplacements ne sont pas aléatoires. Il trace une figure, lentement, sur la surface de la planète. Une figure géométrique. » Elle te montre les coordonnées. C'est presque un cercle, mais pas tout à fait : c'est une **ellipse**. Et le foyer pointe vers le ciel — vers un point précis dans la constellation voisine.",
      choix: [
        {
          label: 'Partir avec les données. Revenir mieux préparés.',
          effets: [
            { texte: "Vous repartez. Élie passe les jours suivants à calculer. Elle te dit que ce qu'elle a vu « change tout »." },
            { drapeau: { observations: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Lancer un scan profond pour cartographier le motif complet',
          effets: [
            { texte: "Le scan révèle que l'ellipse couvre plusieurs kilomètres et est presque complète. L'anneau finira son tracé dans environ 40 jours-jeu. Élie pense que quelque chose se passera à ce moment-là." },
            { drapeau: { observations: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Bloquer le tracé : une balise dans la trajectoire',
          effets: [
            { texte: "Vous placez la balise. Au matin, elle a disparu. L'anneau a contourné sa position de cinquante mètres avant de reprendre son tracé. Il a évité. Il a donc compris." },
            { drapeau: { observations: '+1', gardien_eveille: true } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_observation: {
      titre: 'Le tracé',
      texte: {
        unParmi: [
          { si: 'gardien_eveille', texte: "L'anneau vibre maintenant à très basse fréquence. Tes capteurs en deviennent fous à quelques mètres. Élie est plus calme qu'à la dernière visite, mais plus pâle aussi." },
          { texte: "L'anneau a continué son tracé pendant ton absence. La figure est presque complète. Élie a remarqué qu'à l'approche du tracé final, les déplacements deviennent plus petits, plus précis." },
        ],
      },
      choix: [
        {
          label: "Camper sur place et observer le tracé jusqu'au bout",
          effets: [
            { texte: "Tu restes. Tu vois l'anneau bouger — pas vraiment vu, plutôt deviné. À chaque clignement, il est plus loin. Élie reste éveillée toute la nuit, et celle d'après, et celle d'après." },
            { drapeau: { observations: '+1', elie_obsession: '+1' } },
            { aller: 'ep2_echo' },
          ],
        },
        {
          label: 'Fouiller les ruines en quête d’anciens visiteurs',
          effets: [
            { texte: 'Tu fouilles. Tu trouves des marques au sol, érodées par le temps : un autre cercle, beaucoup plus ancien, à demi enfoui. Et un fragment métallique qui ne ressemble à rien de connu.' },
            { gain: { datacubes: 8 } },
            { drapeau: { observations: '+1', autre_anneau: true } },
            { aller: 'ep2_echo' },
          ],
        },
        {
          label: "Laisser Élie entrer en transe d'observation",
          effets: [
            { texte: "Tu acceptes. Elle reste cinq jours sans dormir, en observation continue. L'anneau ne bouge pas tant qu'elle regarde. Quand elle s'effondre enfin, l'anneau a bondi de trente mètres en un instant." },
            { drapeau: { observations: '+2', elie_obsession: '+2' } },
            { aller: 'ep2_echo' },
          ],
        },
      ],
    },

    ep2_echo: {
      titre: 'Les autres anneaux',
      texte: {
        unParmi: [
          { si: 'autre_anneau', texte: "Tu as trouvé des traces d'un autre anneau ancien. Élie compile toutes les données et fait une découverte : « Ce n'est pas le seul. Les anomalies signalées par d'autres explorateurs, dans d'autres systèmes — leurs descriptions correspondent. Il y a au moins trois anneaux dans cette galaxie. Et leurs ellipses convergent vers un même point. »" },
          { texte: "Élie te montre ses notes. Elle a calculé quelque chose : « Ce n'est pas le seul. Les anomalies signalées par d'autres explorateurs, dans d'autres systèmes — leurs descriptions correspondent. Il y a au moins trois anneaux dans cette galaxie. Et leurs ellipses convergent vers un même point. »" },
        ],
      },
      choix: [
        {
          label: 'Demander à Élie de modéliser le point de convergence',
          effets: [
            { texte: "Elle travaille toute la nuit. Le matin, elle te montre une carte. Le point converge dans une zone de la galaxie où aucun système n'est cartographié. « Il y a quelque chose là-bas. Quelque chose que ces anneaux désignent. »" },
            { drapeau: { observations: '+1' } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: "Communiquer : émettre des fréquences vers l'anneau",
          effets: [
            { texte: "Tu émets des séquences mathématiques — premiers nombres, pi, suite de Fibonacci. Pendant deux jours, rien. Au troisième jour, l'anneau modifie son tracé : il dessine maintenant une spirale. Une réponse ?" },
            { drapeau: { observations: '+1', gardien_eveille: true } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: "Récupérer le fragment de l'autre anneau",
          si: 'autre_anneau',
          effets: [
            { texte: "Tu déterres le fragment. C'est un éclat de matériau qui pèse trop. Élie le scanne : sa densité augmente quand on le regarde, diminue quand on regarde ailleurs. « Comme l'anneau, en miniature. » Tu l'embarques." },
            { gain: { cristal: 20, datacubes: 5 } },
            { objet: 'fragment_anneau' },
            { drapeau: { observations: '+1' } },
            { aller: 'ep2_choix' },
          ],
        },
      ],
    },

    ep2_choix: {
      titre: 'Trois hypothèses',
      texte: {
        unParmi: [
          { si: 'elie_obsession >= 2', texte: "Élie a maigri. Elle dort à peine et parle de l'anneau comme d'un être conscient. « Il sait que nous savons. Il attend que je décide. » Tu sens qu'il faut faire un choix : continuer avec elle, ou la mettre en sécurité." },
          { texte: "Tu as accumulé assez de données pour formuler trois hypothèses. Élie te demande laquelle tu veux poursuivre. C'est ton choix maintenant." },
        ],
      },
      choix: [
        {
          label: 'Classer comme INSTRUMENT (un compas)',
          effets: [
            { texte: "Vous décidez ensemble : c'est un instrument. Si on le respecte, il continuera à fonctionner. Il ne faut pas le toucher." },
            { drapeau: { anneau_classifie: 'instrument' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Classer comme VERROU (quelque chose est emprisonné dedans)',
          effets: [
            { texte: "Élie pense qu'il y a une menace de l'autre côté. « S'il faut le briser, on le brisera. Mais d'abord, il faut savoir. »" },
            { drapeau: { anneau_classifie: 'verrou' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Classer comme PORTE (un seuil ouvrable)',
          si: 'contact_etabli',
          effets: [
            { texte: 'Une porte. Vers où ? Tu ne sais pas. Mais une porte se franchit. Élie prépare déjà le matériel.' },
            { drapeau: { anneau_classifie: 'porte' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_seuil: {
      titre: 'Le centre du tracé',
      texte: {
        unParmi: [
          { si: 'elie_obsession >= 3', texte: "L'ellipse est complète. L'anneau ne bouge plus depuis trois jours. Il est désormais fixe au centre du tracé qu'il a dessiné. Tu sens que c'est le moment. Élie n'a pas dormi depuis huit jours. Elle parle à l'anneau. L'anneau ne répond pas, mais elle continue. Tu dois agir." },
          { texte: "L'ellipse est complète. L'anneau ne bouge plus depuis trois jours. Il est désormais fixe au centre du tracé qu'il a dessiné. Tu sens que c'est le moment. Élie te regarde et attend ton signal." },
        ],
      },
      choix: [
        {
          label: 'Observer encore, sans toucher. Repartir avec les données.',
          effets: [
            { texte: "Vous restez trois jours encore, à mesurer, à compiler. Puis vous remontez à bord. L'anneau est encore là, immobile. Élie regarde par le hublot pendant tout le décollage. Elle ne dit rien." },
            { gain: { cristal: 30, datacubes: 25 } },
            { objet: 'compas_cosmique' },
            { drapeau: { compas_obtenu: true } },
            { recrute: 'elie' },
            { fin: 'science_pure' },
          ],
        },
        {
          label: 'Laisser Élie rester. Embarquer sans elle.',
          si: 'elie_obsession >= 2',
          effets: [
            { texte: "Tu lui poses la main sur l'épaule. Elle te sourit pour la première fois depuis des semaines. « Je vais bien. Pars. » Tu pars. Elle reste, avec son anneau, dans le silence du désert. Tu emportes ses dernières notes — et un objet qu'elle t'a glissé dans la poche." },
            { gain: { datacubes: 15 } },
            { objet: 'compas_cosmique' },
            { drapeau: { compas_obtenu: true, elie_status: 'obsedee' } },
            { fin: 'obsession_elie' },
          ],
        },
        {
          label: "Si PORTE : entrer dans l'anneau",
          si: "anneau_classifie == 'porte'",
          effets: [
            { texte: "Tu passes. Élie crie. Tu ne sais plus si tu es passé ou si quelque chose t'a remplacé. Quand tu te retournes, l'anneau est tombé. Il est sur le sable, métal et silence. Élie ne te regarde plus de la même manière. Tu repars avec ce que tu es maintenant." },
            { gain: { datacubes: 40, cristal: 50 } },
            { objet: 'compas_cosmique' },
            { moral: -5 },
            { drapeau: { compas_obtenu: true } },
            { recrute: 'elie' },
            { fin: 'porte_ouverte' },
          ],
        },
        {
          label: "Si VERROU : briser l'anneau",
          si: "anneau_classifie == 'verrou'",
          effets: [
            { texte: "Vous utilisez vos charges. L'anneau résiste, puis cède d'un coup. Pas de bruit, juste l'absence soudaine. Et un courant froid qui passe à travers vous. Élie regarde autour d'elle : « Quelque chose est sorti. Quelque chose est ici, maintenant. »" },
            { gain: { datacubes: 30, cristal: 40 } },
            { moral: -3 },
            { drapeau: { compas_obtenu: false } },
            { recrute: 'elie' },
            { fin: 'verrou_brise' },
          ],
        },
        {
          label: 'Tout détruire et fuir sans rien emporter',
          effets: [
            { texte: "Tu détruis ton matériel d'observation. Tu effaces les données. Vous repartez les mains vides. Élie te regarde longuement. Puis elle te dit : « Merci. » Vous ne reparlerez jamais de l'anneau." },
            { recrute: 'elie' },
            { fin: 'silence_respecte' },
          ],
        },
      ],
    },
  },
});
