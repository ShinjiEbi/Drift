// src/content/histoires/veilleurs-beth.js — « Les Veilleurs de Beth », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- veilleurs_beth.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'veilleurs_beth',
  titre: 'Les Veilleurs de Beth',
  accroche: 'Des humains vivent encore ici. Ils gardent quelque chose, mais ils ne savent plus quoi.',

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: {
    lieu: "corps.ruines == 'humaines' && corps.biome dans ['ocean', 'jungle', 'toundra', 'desert']",
    chance: 0.3,
  },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    contact: null,               // 'amical' | 'tendu' | 'hostile' | null
    verite_revelee: false,       // a expliqué que les « Présents » viennent d'une orbiteur
    eyla_confiance: 0,           // -2 à +3
    karn_lien: 0,                // 0 à 3
    pretre_status: 'present',    // 'present' | 'humilie' | 'allié' | 'mort'
    orbiteur_localise: false,    // a trouvé/identifié l'installation orbitale
    orbiteur_repare: false,      // a réparé l'installation
    presents_pris: false,        // a emporté des « Présents » sans demander
    offrande_faite: false,       // a fait une offrande lors d'une cérémonie
  },

  personnages: {
    eyla: {
      nom: 'Eyla',
      age: 73,
      pronoms: 'elle',
      role: 'Première Veilleuse',
      voix: "douce, écoute plus qu'elle ne parle",
    },
    karn: {
      nom: 'Karn',
      age: 24,
      pronoms: 'il',
      role: 'Jeune Veilleur',
      voix: 'méfiant, curieux',
      recrue: { competences: { linguistique: 3, survie: 3 }, traits: ['curieux'] },
    },
    pretre: {
      nom: 'Le Prêtre',
      age: 56,
      pronoms: 'il',
      role: 'Gardien des Présents',
      voix: 'rituelle, hostile',
    },
  },

  fins: {
    diplomatie: { titre: 'Le visiteur attendu', texte: 'Tu es devenu un visiteur attendu. Les Veilleurs ne savent toujours pas ce que tu sais, mais ils acceptent tes offrandes et te donnent les leurs. Tu commerces avec eux — sans jamais rien briser.' },
    revelation_brutale: { titre: 'La vérité', texte: "Tu as dit la vérité. Tu as montré que les Présents venaient d'une machine. Le Prêtre a hurlé, Eyla est restée silencieuse. Le rite s'est éteint dans les semaines suivantes. Sans foi, les Veilleurs n'ont pas trouvé de raison de continuer. Tu emportes leur disque, et leur silence." },
    reparation_silencieuse: { titre: 'La dette silencieuse', texte: "Tu es monté en orbite. Tu as réparé la machine. Elle pleuvra des Présents encore cent ans. Les Veilleurs ne sauront jamais. Eyla te regarde repartir comme si elle savait, mais elle ne dit rien. Karn aussi. Tu pars avec une dette qu'ils ne te réclameront jamais." },
    conversion_karn: { titre: 'Karn', texte: "Karn est monté à bord avec toi. Il a vu trop, il ne pouvait plus rester. Sa tribu pense qu'il est mort lors d'un rite. Il vit maintenant à l'avant-poste, partagé entre deux mondes, et précieux pour les deux." },
    sacrilege: { titre: 'Le sacrilège', texte: "Tu as pris ce qu'il y avait à prendre, les Présents inutilisés, le disque, et tu es parti. Les Veilleurs ne comprendront pas où sont passés leurs trésors. Ils accuseront le ciel. Le ciel ne répondra plus." },
  },

  episodes: [
    {
      titre: 'Le contact',
      debut: 'ep1_arrivee',
      intro: "Les capteurs ont confirmé des signaux de vie. Quand tu te poses, tu n'es pas seul à attendre. Des silhouettes encerclent le vaisseau, immobiles, dans des tuniques claires. Le plus vieux d'entre eux lève une main. Ce n'est pas une menace, ni un salut — c'est un signe que tu ne comprends pas.",
    },
    {
      titre: 'Le rite',
      debut: 'ep2_temple',
      intro: {
        unParmi: [
          { si: "contact == 'amical'", texte: "Eyla t'attend à l'entrée du village. Elle te connaît maintenant. Karn observe à distance, comme toujours." },
          { si: "contact == 'tendu'", texte: 'Tu reviens. Les Veilleurs ne te chassent pas, mais ils ne te saluent pas non plus. Eyla a vieilli en quelques jours.' },
          { si: "contact == 'hostile'", texte: "Tu reviens malgré tout. Le Prêtre se tient sur le seuil du temple, armé d'une lance de cérémonie. Eyla est plus loin, presque cachée. Quelque chose a changé." },
          { texte: "Tu reviens parce que tu as vu quelque chose la première fois — un détail qui n'était pas rituel, mais technique. Il faut comprendre." },
        ],
      },
    },
    {
      titre: 'Les Présents',
      debut: 'ep3_choix',
      intro: {
        unParmi: [
          { si: 'orbiteur_localise', texte: "Tu sais maintenant ce qui pleut sur eux. Une orbiteur de l'ancienne colonie, encore en activité, dérégulée. Elle leur envoie des capsules de survie au hasard. C'est ce qu'ils appellent les Présents." },
          { si: 'orbiteur_localise == faux', texte: "Tu n'as pas tout compris encore. Quelque chose alimente leur foi, et ce n'est ni dieu ni hasard." },
          { texte: "Tu reviens parce qu'il faut finir ce qui a commencé." },
        ],
      },
    },
  ],

  scenes: {
    ep1_arrivee: {
      titre: 'Les Veilleurs',
      texte: "Une trentaine de Veilleurs encerclent ton vaisseau. Aucun n'est armé visiblement. La plus vieille — une femme aux yeux laiteux, ils sont aveugles — s'avance. Derrière elle, un homme plus jeune, méfiant, et un troisième en robe écarlate qui te dévisage avec une hostilité claire. La vieille parle un français étrange, archaïque : « Étranger. As-tu été envoyé par le Ciel ? »",
      choix: [
        {
          label: 'Répondre oui : tu viens du ciel, techniquement',
          effets: [
            { texte: "Les Veilleurs s'inclinent. Le Prêtre se redresse, dévisage la jeune femme aveugle. Eyla dit doucement : « Alors les Présents redoubleront. Bénis sois-tu. » Tu n'as rien promis, mais tu as accepté un rôle." },
            { drapeau: { contact: 'amical', eyla_confiance: '+1' } },
            { aller: 'ep1_village' },
          ],
        },
        {
          label: 'Répondre non : un voyageur comme eux, venu de plus loin',
          effets: [
            { texte: 'Silence long. Eyla incline la tête. Le Prêtre crache au sol. Karn — le jeune — vous fixe alternativement. Eyla finit par dire : « Alors tu es égaré. Viens. Tu auras à manger. » Tu as gagné de la confiance, mais perdu du mystère.' },
            { drapeau: { contact: 'amical', eyla_confiance: '+2', karn_lien: '+1' } },
            { aller: 'ep1_village' },
          ],
        },
        {
          label: "Ne rien dire, attendre que d'autres se présentent",
          effets: [
            { texte: "Le silence se prolonge. Eyla finit par hocher la tête, comme si tu avais répondu. Le Prêtre, lui, ne te quitte pas des yeux. On t'emmène au village, mais quelque chose d'inquiet s'est installé." },
            { drapeau: { contact: 'tendu' } },
            { aller: 'ep1_village' },
          ],
        },
      ],
    },

    ep1_village: {
      titre: 'Le village',
      texte: {
        unParmi: [
          { si: "contact == 'amical'", texte: "Le village est petit, peut-être deux cents âmes. Les habitations sont des cylindres métalliques fondus dans la terre — d'anciens modules de la colonie initiale, recyclés. Les Veilleurs t'observent, sans peur ni curiosité — comme on regarde un événement météorologique. Eyla te conduit chez elle." },
          { texte: "On te conduit à travers le village comme on conduirait un suspect. Les Veilleurs se reculent à ton passage. Tu remarques les habitations : ce sont d'anciens modules de la colonie, recyclés. Ils vivent dans nos propres ruines, sans le savoir." },
        ],
      },
      choix: [
        {
          label: 'Poser des questions à Eyla sur leur histoire',
          effets: [
            { texte: "Eyla te raconte : il y a environ 400 ans, le Ciel a cessé de parler. Les Anciens ont disparu. Mais le Ciel a continué à envoyer des Présents — des capsules tombant du firmament avec de la nourriture, parfois des outils, parfois rien. Cela a duré depuis. Aucun de ses parents n'a vu le Ciel parler, mais tous ont vu les Présents." },
            { drapeau: { eyla_confiance: '+1' } },
            { aller: 'ep1_present' },
          ],
        },
        {
          label: "Observer en silence et noter ce qui t'entoure",
          effets: [
            { texte: "Tu vois les détails : tatouages en circuit imprimé sur leurs joues. Des symboles de constellation cousus sur leurs tuniques. Et au centre du village, un module dressé verticalement, peint en blanc — c'est leur temple. Une caisse de présents non ouvrables est exposée comme un autel." },
            { drapeau: { karn_lien: '+1' } },
            { aller: 'ep1_present' },
          ],
        },
        {
          label: 'Demander à voir le Prêtre',
          effets: [
            { texte: "Le Prêtre te reçoit, mais sans Eyla. Sa voix est plate, rituelle. Il t'explique que tu es un Visiteur, que les Visiteurs viennent du Ciel, mais qu'ils ne sont pas le Ciel. Et que ceux qui veulent comprendre les Présents sont des hérétiques. Le ton est clair." },
            { drapeau: { contact: 'hostile' } },
            { aller: 'ep1_present' },
          ],
        },
      ],
    },

    ep1_present: {
      titre: 'Le Présent',
      texte: "Un cri retentit dans le village. Tout le monde se met à courir vers la place. Tu suis. Au centre, une capsule métallique fume légèrement — elle est tombée du ciel pendant que tu parlais. Le Prêtre se précipite, lève les bras. La capsule est un module d'urgence standard, modèle CN-22, datant facilement de 350 ans. Elle contient des rations protéinées. Les Veilleurs s'agenouillent.",
      choix: [
        {
          label: 'Te joindre à la cérémonie en silence',
          effets: [
            { texte: "Tu t'agenouilles avec eux. Karn te regarde, étonné. Eyla sourit imperceptiblement. Le Prêtre passe son regard sur toi sans s'arrêter. Tu as fait le bon choix, du moins pour cette fois." },
            { drapeau: { offrande_faite: true, eyla_confiance: '+1', karn_lien: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Examiner la capsule discrètement',
          effets: [
            { texte: "Tu t'approches assez pour lire la plaque : CN-22, série 4471. C'est une capsule de l'orbiteur Beth-3, qui devait servir de relais médical à la colonie originale. Elle est encore active. Karn a vu ton regard. Il ne dit rien, mais il a vu." },
            { gain: { datacubes: 5 } },
            { drapeau: { orbiteur_localise: true, karn_lien: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Prendre une ration pour analyse',
          effets: [
            { texte: 'Tu glisses une ration dans ta poche pendant que les Veilleurs prient. Le Prêtre te voit. Son visage ne change pas, mais ses yeux se durcissent. Tu as commis un sacrilège — même si rien ne sera dit ce soir.' },
            { gain: { biomasse: 10 } },
            { drapeau: { presents_pris: true, contact: 'hostile', pretre_status: 'present' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_temple: {
      titre: 'Le temple blanc',
      texte: {
        unParmi: [
          { si: "contact == 'amical'", texte: "Eyla te conduit jusqu'au temple — le module vertical peint en blanc. À l'intérieur, des étagères couvertes de Présents anciens : outils inutilisables, fragments d'écran, objets dont personne ne connaît plus le nom. C'est leur bibliothèque, leur musée, leur autel." },
          { texte: "Tu t'es introduit dans le temple alors que les Veilleurs étaient ailleurs. À l'intérieur, des étagères couvertes de Présents anciens. Une vraie archive — non identifiée par ceux qui la gardent." },
        ],
      },
      choix: [
        {
          label: 'Chercher un dispositif de stockage',
          effets: [
            { texte: "Tu trouves un disque cristallin d'un mètre de diamètre, accroché au mur. Manifestement, c'est un support de données ancien — disque mémoire archivique de la colonie Beth, type O-9. Il est intact. Eyla apparaît derrière toi. « C'est le Cœur. On ne le touche pas. »" },
            { drapeau: { eyla_confiance: '-1' } },
            { aller: 'ep2_eyla' },
          ],
        },
        {
          label: 'Demander à Eyla ce que sont vraiment les Présents',
          si: "contact == 'amical'",
          effets: [
            { texte: "Eyla réfléchit longtemps. Puis : « Mon grand-père disait que les Présents tombent moins souvent qu'avant. Avant, c'était trois fois par mois. Maintenant, deux fois, trois fois par an. » Elle se tait. Puis ajoute, plus doucement : « Le Prêtre dit que c'est notre faute. »" },
            { drapeau: { eyla_confiance: '+1' } },
            { aller: 'ep2_eyla' },
          ],
        },
        {
          label: "Sortir avant d'être vu",
          effets: [
            { texte: "Tu sors. Personne ne t'a vu. Mais tu as compris ce qu'il y a dans ce temple, et tu vas devoir choisir quoi en faire." },
            { aller: 'ep2_eyla' },
          ],
        },
      ],
    },

    ep2_eyla: {
      titre: 'Eyla',
      texte: {
        unParmi: [
          { si: 'eyla_confiance >= 2', texte: "Eyla te prend à part le soir. « Tu poses trop de questions. Le Prêtre te surveille. Il faut que tu saches quelque chose. » Elle hésite, puis : « J'ai été élue Première Veilleuse parce que je doute. Le Prêtre, lui, croit. C'est lui qui dirige le rite. Mais moi je sens que quelque chose ne va pas. »" },
          { texte: "Eyla te regarde longuement avant de parler. « Tu n'es pas un envoyé du Ciel. Tu es un homme. Comme nous. Sois prudent — le Prêtre veut t'éloigner. »" },
        ],
      },
      choix: [
        {
          label: "Dire la vérité : les Présents viennent d'une machine",
          effets: [
            { texte: 'Eyla reste silencieuse longtemps. Puis : « Je le savais. Je le savais. » Elle pleure sans larmes — ses yeux ne peuvent plus. « Si tu dis cela aux autres, ils mourront. Sans foi, ils ne tiendront pas. Tu dois choisir : la vérité, ou eux. »' },
            { drapeau: { verite_revelee: true, eyla_confiance: '+1' } },
            { aller: 'ep2_karn' },
          ],
        },
        {
          label: 'Lui demander où Karn passe ses nuits',
          effets: [
            { texte: "Eyla sourit faiblement. « Karn dort dans les ruines, à l'est. Il pense que je ne le sais pas. Il cherche dans les vieux modules. Il croit y trouver quelque chose. » Elle marque une pause. « Si tu lui parles, sois gentil. C'est un enfant qui a déjà trop vu. »" },
            { drapeau: { karn_lien: '+1' } },
            { aller: 'ep2_karn' },
          ],
        },
        {
          label: 'Lui promettre de ne rien révéler',
          effets: [
            { texte: 'Eyla te touche le poignet. « Merci. Mais tu vas savoir, et tu vas devoir choisir. Tu reviendras nous voir, alors ? » Tu hoches la tête. Tu ne sais pas si tu mens.' },
            { drapeau: { eyla_confiance: '+2' } },
            { aller: 'ep2_karn' },
          ],
        },
      ],
    },

    ep2_karn: {
      titre: 'Karn',
      texte: "Karn t'aborde la nuit, à l'écart du village. Sa voix tremble : « J'ai vu des choses dans les ruines à l'est. Des écrans qui s'allument quand on les touche. Des mots dans la langue des Anciens. Personne ne veut écouter. Le Prêtre dit que c'est démoniaque. Toi, tu sais lire ces choses ? »",
      choix: [
        {
          label: "Lui proposer de l'emmener voir l'orbiteur",
          effets: [
            { texte: "Tu emmènes Karn à bord. Tu lui montres ce que tu as scanné : l'orbiteur Beth-3 en lente déchéance, ses systèmes mourants. Karn pleure. Pas de tristesse — de compréhension. Il dit : « Alors c'est fini. Les Présents vont s'arrêter. » Il te regarde : « Tu peux le réparer ? »" },
            { drapeau: { orbiteur_localise: true, karn_lien: '+2' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Lui apprendre à lire les écrans qu'il a trouvés",
          effets: [
            { texte: "Vous passez la nuit dans les ruines à l'est. Tu lui montres comment activer un terminal. Karn lit pour la première fois les vraies archives — la colonie Beth, l'évacuation manquée, l'orbiteur qui devait revenir. Il ne dit rien, mais à l'aube il est différent." },
            { drapeau: { karn_lien: '+2', orbiteur_localise: true } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Lui dire de se taire, pour sa sécurité',
          effets: [
            { texte: "Tu lui dis que le Prêtre a raison de craindre — pas parce que c'est démoniaque, mais parce que la vérité tuerait sa tribu. Karn te dévisage. « Alors tu sais aussi. » Il s'éloigne. Tu l'as perdu." },
            { drapeau: { karn_lien: '-2' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_choix: {
      titre: 'Beth-3',
      texte: [
        "Tu sais maintenant. L'orbiteur Beth-3 est en orbite basse, ses systèmes ne tiendront plus longtemps. Encore peut-être un an, peut-être trois — puis plus de Présents. Les Veilleurs ne survivront pas à cet effondrement de foi. Tu es revenu une fois de plus. Le village est calme. Eyla t'attend.",
        { si: 'karn_lien >= 2', texte: "Karn est avec elle. Il porte un sac sur l'épaule, comme prêt à partir." },
        { si: "pretre_status == 'present' && verite_revelee", texte: 'Le Prêtre est là aussi. Il te dévisage.' },
      ],
      choix: [
        {
          label: 'Diplomatie : commerce, présents, jamais la vérité',
          effets: [
            { texte: "Tu repars avec un accord tacite. Eyla acquiesce. Tu reviendras tous les six mois apporter ce que tu peux, prendre ce qu'ils donnent. C'est un mensonge, mais un mensonge qui les fait vivre." },
            { gain: { biomasse: 30, datacubes: 5 } },
            { fin: 'diplomatie' },
          ],
        },
        {
          label: 'Révéler publiquement la vérité au village entier',
          effets: [
            { texte: "Tu prends la parole devant tous. Tu expliques l'orbiteur, la machine, les capsules programmées. Le Prêtre te frappe au visage. Eyla ne dit rien. Karn pleure. Tu repars avec le disque mémoire. Quelques mois plus tard, tu apprends par signaux radio que le village s'est éteint — sans guerre, sans famine, juste sans envie." },
            { gain: { datacubes: 40 } },
            { objet: 'disque_veilleurs' },
            { moral: -3 },
            { drapeau: { verite_revelee: true } },
            { fin: 'revelation_brutale' },
          ],
        },
        {
          label: "Monter en orbite réparer l'installation, en cachette",
          si: 'orbiteur_localise',
          effets: [
            { texte: "Tu pars vers l'orbiteur. La réparation prend trois jours, demande tout ton matériel. Mais Beth-3 redémarre — pour cent ans, peut-être plus. Tu redescends sans rien dire. Eyla te regarde repartir. Elle sait, peut-être. Mais elle ne dit rien. Toi non plus." },
            { gain: { datacubes: 15 } },
            { drapeau: { orbiteur_repare: true } },
            { fin: 'reparation_silencieuse' },
          ],
        },
        {
          label: "Proposer à Karn de te suivre. L'emmener avec toi.",
          si: 'karn_lien >= 2',
          effets: [
            { texte: "Karn monte à bord sans regarder en arrière. Eyla pose la main sur son cœur. Elle dira à la tribu qu'il est mort lors d'une cérémonie nocturne — c'est la coutume pour ceux qui partent. Karn devient un membre de ton équipage. Il connaît les anciens textes que personne d'autre ne connaît." },
            { gain: { datacubes: 10 } },
            { recrute: 'karn' },
            { fin: 'conversion_karn' },
          ],
        },
        {
          label: 'Tout emporter — disque, Présents, vivres — et partir',
          effets: [
            { texte: "Tu pilles le temple à l'aube. Tu remplis ta soute. Tu décolles sans saluer. Eyla est sur le seuil de sa maison, immobile. Tu ne sauras jamais ce qu'elle a pensé. Quelques années plus tard, les capsules cesseront. Personne n'aura compris pourquoi." },
            { gain: { biomasse: 50, cristal: 30, datacubes: 30 } },
            { objet: 'disque_veilleurs' },
            { moral: -5 },
            { drapeau: { presents_pris: true } },
            { fin: 'sacrilege' },
          ],
        },
      ],
    },
  },
});
