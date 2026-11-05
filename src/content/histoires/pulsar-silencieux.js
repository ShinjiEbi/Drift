// src/content/histoires/pulsar-silencieux.js — « Le Pulsar Silencieux », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- pulsar_silencieux.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'pulsar_silencieux',
  titre: 'Le Pulsar Silencieux',
  accroche: 'Une station humaine émet un signal régulier depuis trois mois. Personne ne répond.',

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: { lieu: "corps.ruines == 'humaines' && corps.atmosphere dans ['toxique', 'tenue', 'anormale']", chance: 0.35 },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    signal_origin: null,         // 'station' | 'bunker' | 'inconnu'
    truth_revealed: false,       // a lu le journal de bord ?
    adele_trust: 0,              // -2 à +3
    tomas_status: 'present',     // 'present' | 'allie' | 'mort' | 'absent'
    survivors_fate: null,        // 'sauves' | 'partages' | 'abandonnes'
    secret_partage: false,       // a vu la porte verrouillée
    last_signal: 'recu',         // 'recu' | 'ignore'
  },

  personnages: {
    adele: {
      nom: 'Adèle Voronine',
      age: 47,
      pronoms: 'elle',
      role: 'Biologiste',
      voix: 'sèche, ironique',
      recrue: { competences: { science: 3, medecine: 2, survie: 2 }, traits: ['cynique', 'survivant'] },
    },
    tomas: { nom: 'Tomas Renaud', age: 31, pronoms: 'il', role: 'Mécanicien', voix: 'naïf, dépendant' },
    soeur: {
      nom: 'Mira Voronine',
      age: 52,
      pronoms: 'elle',
      voix: 'rare, étrange',
      recrue: { competences: { linguistique: 4, science: 2 }, traits: ['voix_murmurent', 'distant'] },
    },
  },

  fins: {
    sauvetage_comprehension: { titre: "Ce qu'elle gardait", texte: "Tu as sauvé Adèle et compris ce qu'elle gardait. La sœur reste là-bas, mais paisible. La station est devenue un lieu de mémoire." },
    sauvetage_destruction: { titre: 'La machine débranchée', texte: "Tu as sauvé Adèle, mais débranché la machine. La sœur est morte. Adèle ne te parle plus mais reste à l'avant-poste." },
    partage_revelation: { titre: 'Le respect', texte: "Tu n'as pas embarqué Adèle, elle est morte. Mais tu as compris ce qu'elle protégeait. Tu repars avec respect." },
    abandon_profanation: { titre: 'La profanation', texte: "Tu as pillé, tu as profané. Tu en sors riche. Quelque chose s'est cassé en toi." },
    emporter_soeur: { titre: 'La sœur', texte: "Tu as ramené la sœur. Elle vit maintenant à l'avant-poste — silencieuse, étrange, importante." },
  },

  episodes: [
    {
      titre: 'Le signal',
      debut: 'ep1_sas',
      intro: "À l'approche, le signal s'intensifie. Une station orbitale, intacte de loin. Le rythme est trop régulier pour être un automatisme défectueux. Quelqu'un veut être trouvé — ou veut qu'on croie ça.",
    },
    {
      titre: 'Les survivants',
      debut: 'ep2_contact',
      intro: {
        unParmi: [
          { si: "signal_origin == 'bunker'", texte: 'Le signal a changé de nature. Une voix humaine maintenant, depuis la surface.' },
          { si: "signal_origin == 'station'", texte: "Tu retournes sur la station. Les écrans ne mentent plus : quelqu'un est arrivé." },
          { si: "signal_origin == 'inconnu'", texte: "Tu reviens parce que tu ne pouvais pas faire autrement. Quelque chose t'a appelé." },
          { texte: "Le signal n'a pas faibli. Quelque chose t'attend là-bas." },
        ],
      },
    },
    {
      titre: 'La vérité',
      debut: 'ep3_retour',
      intro: {
        unParmi: [
          { si: "survivors_fate == 'sauves'", texte: "Adèle vit chez toi maintenant. Elle te demande de retourner sur la planète, pour fermer ce qu'elle a laissé ouvert. « Tomas refuse de venir. Vous le comprendrez. »" },
          { si: "survivors_fate == 'partages'", texte: "Le signal a repris, mais plus fort, et différent. Comme un appel. Tu décides d'y retourner." },
          { si: "survivors_fate == 'abandonnes'", texte: "Le signal s'est tu. Mais quelque chose t'attire encore là-bas. Une dette." },
          { texte: 'Tu reviens, et tu sais pourquoi.' },
        ],
      },
    },
  ],

  scenes: {
    ep1_sas: {
      titre: 'Le sas',
      texte: "L'écoutille de la station s'ouvre sans résistance. L'intérieur est froid mais pas mort : lumières d'urgence, atmosphère respirable. Sur le pont, un journal de bord récent, ouvert à la dernière page. Trois mois de vide silencieux, puis : « Adèle, si quelqu'un trouve ça : ne descends pas. Ils mentent. »",
      choix: [
        {
          label: 'Lire le journal entier',
          requiert: 'equipe.science >= 2',
          effets: [
            { texte: "Vous remontez le fil des trois derniers mois. La station surveillait quelque chose en bas. Quelqu'un est descendu et n'est jamais remonté." },
            { drapeau: { truth_revealed: true } },
            { aller: 'ep1_passerelle_lu' },
          ],
        },
        {
          label: 'Ranger le journal et continuer',
          effets: [
            { texte: 'Tu fermes le carnet, par respect ou par prudence.' },
            { aller: 'ep1_passerelle_neutre' },
          ],
        },
        {
          label: "Photographier la page sans s'attarder",
          effets: [
            { texte: 'Tu prends une photo et tu passes ton chemin. Sans contexte, ça ne dit rien.' },
            { aller: 'ep1_passerelle_neutre' },
          ],
        },
      ],
    },

    ep1_passerelle_lu: {
      titre: 'La passerelle',
      texte: "La passerelle est vide, mais les écrans tournent encore. Tu remontes le fil. La station n'orbitait pas pour rien : elle surveillait *quelque chose en bas*. Un signal venait de la surface. Le journal s'arrête net trois mois plus tôt — quelqu'un est descendu et n'est jamais remonté.",
      choix: [
        {
          label: 'Trianguler la source du signal au sol',
          requiert: 'equipe.science >= 2',
          effets: [
            { texte: "Le signal vient d'un bunker abandonné, dans l'hémisphère sud." },
            { gain: { datacubes: 10 } },
            { drapeau: { signal_origin: 'bunker' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Fouiller les quartiers d'équipage",
          effets: [
            { texte: "Dans la cabine d'Adèle Voronine, un disque mémoire glissé sous le matelas." },
            { gain: { datacubes: 15 } },
            { objet: 'disque_memoire' },
            { drapeau: { signal_origin: 'station' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Brouiller le signal sortant',
          effets: [
            { texte: "Tu coupes l'émetteur. Le silence se fait. C'est peut-être ce qui était demandé." },
            { drapeau: { signal_origin: 'inconnu', last_signal: 'ignore' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep1_passerelle_neutre: {
      titre: 'La passerelle',
      texte: "La passerelle est vide. Les écrans tournent encore mais tu ne sais pas quoi en faire. Un signal pulse depuis quelque part — surface ou orbite, difficile à dire sans plus d'analyse.",
      choix: [
        {
          label: 'Trianguler le signal',
          requiert: 'equipe.science >= 2',
          effets: [
            { texte: 'Source au sol, dans un bunker.' },
            { gain: { datacubes: 8 } },
            { drapeau: { signal_origin: 'bunker' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Inspecter les quartiers d'équipage",
          effets: [
            { texte: "Rien de bien intéressant — sauf quelques effets personnels d'une certaine Adèle V." },
            { gain: { datacubes: 10 } },
            { drapeau: { signal_origin: 'station' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Repartir avec ce qu'on a",
          effets: [
            { texte: 'Tu pars sans en savoir plus. Le signal continue derrière toi.' },
            { drapeau: { signal_origin: 'inconnu' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_contact: {
      titre: 'La trappe',
      texte: {
        unParmi: [
          { si: "signal_origin == 'bunker'", texte: 'Tu trouves le bunker rapidement, guidé par la triangulation. Adèle Voronine ouvre la trappe elle-même. Cheveux gris très courts, visage marqué. Elle te dévisage longuement, et dit lentement : « Vous avez mis le temps. »' },
          { si: "signal_origin == 'station'", texte: "Le signal venait de la station, mais en y retournant tu trouves une trappe d'accès vers le sol. Au bout, un bunker, et une femme grise qui t'attend. « Vous avez fini par descendre. »" },
          { texte: "Sans triangulation, tu cherches à l'instinct. C'est presque par hasard que tu repères une cheminée d'aération dans la roche. En dessous, un bunker. Une trappe s'ouvre avant que tu frappes. « J'ai entendu vos pas. »" },
        ],
      },
      choix: [
        {
          label: "« On répond à un signal de détresse. Vous l'avez envoyé ? »",
          effets: [
            { texte: "Adèle se ferme un peu. « On a fait ce qu'on a pu pour être entendus. »" },
            { aller: 'ep2_bunker' },
          ],
        },
        {
          label: '« Combien êtes-vous ? »',
          effets: [
            { texte: 'Un homme plus jeune apparaît derrière elle. « Tomas », dit-il, presque timidement. Adèle hoche la tête : « Lui et moi. »' },
            { drapeau: { adele_trust: '+1' } },
            { aller: 'ep2_bunker' },
          ],
        },
        {
          label: '« Pourquoi nous attendiez-vous ? »',
          si: 'truth_revealed',
          effets: [
            { texte: 'Adèle pâlit légèrement, mais ne nie rien. « Vous avez lu le carnet. Alors vous savez. Pas tout, mais assez. »' },
            { drapeau: { adele_trust: '+2' } },
            { aller: 'ep2_bunker' },
          ],
        },
        {
          label: 'Garder le silence, observer',
          requiert: 'equipe.carac.sangfroid >= 7',
          effets: [
            { texte: "Le silence s'étire. Adèle finit par parler la première. « Je suis biologiste. Enfin, j'étais. Quarante ans qu'on est ici. »" },
            { drapeau: { adele_trust: '+1' } },
            { aller: 'ep2_bunker' },
          ],
        },
      ],
    },

    ep2_bunker: {
      titre: 'Le bunker',
      texte: {
        unParmi: [
          { si: 'adele_trust >= 2', texte: 'Adèle te fait tout visiter. Y compris la porte verrouillée au fond. « Là-bas, il y avait six autres. Ils sont sortis. Ils ne sont pas revenus. »' },
          { si: 'adele_trust >= 1', texte: "Adèle te fait visiter le bunker. Trois pièces, des stocks à moitié vides, une plante qui survit sous lampe. Tomas te montre fièrement un schéma de réacteur qu'il a réparé seul. Mais une porte au fond reste fermée." },
          { texte: "Adèle ne te montre que la salle commune. Stocks visiblement bas. Une porte verrouillée derrière, qu'elle évite de regarder. Tomas évite ton regard." },
        ],
      },
      choix: [
        {
          label: '« Que mangez-vous ? Vous tenez encore combien ? »',
          effets: [
            { texte: "Tomas, plus bavard qu'Adèle : « Deux mois, peut-être. Si on rationne. »" },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: '« Pourquoi rester ? Vous pourriez partir. »',
          effets: [
            { texte: 'Adèle se ferme. « Vous ne comprenez pas. On ne peut pas partir. »' },
            { drapeau: { adele_trust: '-1' } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Demander à parler à Tomas seul',
          requiert: 'equipe.linguistique >= 2',
          effets: [
            { texte: "Adèle s'éloigne à contrecœur. Tomas, baissant la voix : « Elle ne vous dira pas tout. Il y a... quelqu'un d'autre ici. Derrière la porte. »" },
            { drapeau: { tomas_status: 'allie', secret_partage: true } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Demander à voir la porte verrouillée',
          si: 'adele_trust >= 2',
          effets: [
            { texte: "Adèle hésite, puis t'ouvre la porte. « Pas maintenant. Mais sachez qu'elle existe. Ma sœur. Elle est ici depuis toujours. »" },
            { drapeau: { secret_partage: true, adele_trust: '+1' } },
            { aller: 'ep2_choix' },
          ],
        },
      ],
    },

    ep2_choix: {
      titre: 'Deux mois de vivres',
      texte: [
        {
          unParmi: [
            { si: "tomas_status == 'allie'", texte: "Tomas, qui te connaît maintenant : « On n'a plus que pour deux mois. Et nous sommes trois — vous savez. »" },
            {
              texte: [
                "Tomas finit par lâcher : « On n'a plus que pour deux mois. Et nous sommes trois, en comptant... »",
                "Adèle l'interrompt sèchement : « Trois. Trois en tout. »",
              ],
            },
          ],
        },
        'Le choix vous appartient.',
      ],
      choix: [
        {
          label: 'Embarquer tout le monde sur le vaisseau',
          cout: { biomasse: 30 },
          effets: [
            { texte: 'Adèle et Tomas montent à bord. La biomasse pour le voyage de retour est lourde mais gérable.' },
            { drapeau: { survivors_fate: 'sauves' } },
            { recrute: 'adele' },
            { finEpisode: true },
          ],
        },
        {
          label: 'Partager des provisions, revenir plus tard',
          cout: { biomasse: 15 },
          effets: [
            { texte: 'Vous laissez ce que vous pouvez. Adèle, presque touchée : « Vous reviendrez ? » Vous promettez. En échange, elle vous remet un disque mémoire.' },
            { gain: { datacubes: 20 } },
            { objet: 'disque_memoire' },
            { drapeau: { survivors_fate: 'partages' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Partir sans rien laisser',
          effets: [
            { texte: "Vous remontez le vaisseau sans un mot. L'équipage est silencieux pendant tout le retour." },
            { moral: -3 },
            { drapeau: { survivors_fate: 'abandonnes' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Forcer la porte verrouillée tout de suite',
          si: 'secret_partage',
          effets: [
            { texte: 'Adèle hurle. Tomas tente de vous arrêter. Vous voyez quelque chose derrière — une silhouette branchée à une machine. Puis Adèle vous chasse à coups de barre. Vous partez de force.' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
            { moral: -2 },
            { drapeau: { survivors_fate: 'abandonnes', truth_revealed: true, adele_trust: -5 } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_retour: {
      titre: 'Le retour au bunker',
      texte: {
        unParmi: [
          { si: "survivors_fate == 'sauves'", texte: "Le bunker est tel qu'Adèle l'a laissé. Plus de Tomas — il a disparu de l'avant-poste sans un mot la semaine dernière. La porte verrouillée est ouverte. Quelqu'un est passé par là." },
          { si: "survivors_fate == 'partages'", texte: 'Le bunker. Adèle et Tomas sont morts. Adèle a une balle dans la tête, sa propre arme dans la main. Tomas a tenté de fuir, il est tombé dans le couloir. Le signal vient de la porte verrouillée — ouverte, maintenant.' },
          { texte: "Plus rien ne bouge sur la planète depuis trois mois. Quand tu entres dans le bunker, tu trouves Tomas mort de faim, recroquevillé près de la porte. Adèle, elle, n'est pas là. La porte est ouverte. Elle est partie de l'autre côté." },
        ],
      },
      choix: [
        {
          label: 'Avancer vers la porte ouverte',
          effets: [{ texte: 'Vous entrez dans ce qui était condamné.' }, { aller: 'ep3_revelation' }],
        },
        {
          label: 'Piller le bunker et partir',
          si: "survivors_fate == 'abandonnes'",
          effets: [
            { texte: "Tu prends ce qu'il y a et tu repars. Le signal pulse derrière toi pendant des semaines." },
            { gain: { metal: 30, datacubes: 25, biomasse: 15 } },
            { moral: -3 },
            { fin: 'abandon_profanation' },
          ],
        },
      ],
    },

    ep3_revelation: {
      titre: 'La porte ouverte',
      texte: [
        'Derrière la porte, une pièce ronde, plongée dans la pénombre. Au centre, sur une chaise, un humain — ou ce qui lui ressemble. Très âgé, immobile, branché à une machine antique.',
        {
          unParmi: [
            {
              si: "survivors_fate == 'sauves'",
              texte: [
                "La voix d'Adèle Voronine, depuis ton com :",
                "« Vous deviez le découvrir un jour. C'est ma sœur. Mira. Elle est née ici. Elle n'a jamais respiré autre chose que cette planète. Et elle communique avec ce que nous appelions l'Étoile-mère, depuis quarante ans. Tomas n'a pas voulu que ça se sache. Il avait raison. »",
              ],
            },
            {
              si: "survivors_fate == 'partages'",
              texte: [
                "Sur la machine, un message pré-enregistré dans l'écriture finale d'Adèle :",
                "« Vous avez choisi de revenir. C'est cohérent. Elle vous attend. Elle attendait quelqu'un. Pas moi — quelqu'un qui n'a pas peur. C'est ma sœur Mira. Elle ne vous fera pas de mal. Pas elle. »",
              ],
            },
            {
              texte: [
                "Une voix de femme, mais ce n'est pas Adèle — c'est sa sœur Mira, vivante, qui parle pour la première fois depuis quarante ans :",
                "« Tu n'es pas Adèle. Tu es celui qui a laissé Tomas mourir. Bien. Approche. Elle ne mord pas. Plus maintenant. »",
              ],
            },
          ],
        },
      ],
      choix: [
        {
          label: 'Débrancher la machine',
          effets: [
            { texte: "La sœur s'éteint sans un bruit. Sur la console, un disque mémoire se libère. Tu reconnais le format — c'est ce que cherche votre arc Effondrement." },
            { gain: { datacubes: 30 } },
            { objet: 'disque_memoire' },
            { fin: 'sauvetage_destruction' },
          ],
        },
        {
          label: 'Comprendre, écouter, ne pas toucher',
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Tu t'agenouilles devant la machine. Tu écoutes — vraiment. Mira parle dans une langue oubliée, mais tu comprends. Pendant une heure, elle te confie ce qu'elle a appris en quarante ans de communication avec ce qui était au-delà." },
            { gain: { datacubes: 50 } },
            { objet: 'disque_memoire' },
            { schema: ['humain'] },
            { fin: 'sauvetage_comprehension' },
          ],
        },
        {
          label: "L'emmener avec nous, machine comprise",
          si: 'secret_partage',
          effets: [
            { texte: "Vous déconnectez délicatement Mira de l'installation et l'embarquez. Elle survit au voyage. Elle vivra à l'avant-poste — silencieuse, étrange, mais présente." },
            { gain: { datacubes: 20 } },
            { recrute: 'soeur' },
            { fin: 'emporter_soeur' },
          ],
        },
        {
          label: 'Faire ses adieux et partir en respect',
          si: "survivors_fate == 'partages'",
          effets: [
            { texte: "Tu laisses Mira. Tu prends le disque mémoire qu'Adèle avait laissé pour vous, et tu pars. La porte se referme derrière toi." },
            { gain: { datacubes: 25 } },
            { objet: 'disque_memoire' },
            { fin: 'partage_revelation' },
          ],
        },
        {
          label: 'Tout détruire en partant',
          si: "survivors_fate == 'abandonnes'",
          effets: [
            { texte: 'Vous mettez le feu au bunker, à la machine, à Mira. La station orbitale, vous la laissez intacte — elle continuera à pulser pour personne.' },
            { gain: { metal: 40, datacubes: 30 } },
            { moral: -5 },
            { fin: 'abandon_profanation' },
          ],
        },
      ],
    },
  },
});
