// src/content/histoires/couvee-dormante.js — « La Couvée Dormante », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- couvee_dormante.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'couvee_dormante',
  titre: 'La Couvée Dormante',
  accroche: "Sous la glace d'une planète gelée, quelque chose respire. Lentement. Patiemment.",

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: {
    lieu: "corps.ruines == 'alien_b' && corps.biome dans ['glace', 'toundra', 'ocean', 'exotique', 'asteroide']",
    chance: 0.45,
  },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    reveil: 'dort',              // 'dort' | 'eveille' | 'conscient'
    hadrien_status: 'inconnu',   // 'inconnu' | 'rencontre' | 'mort' | 'libere'
    nourriture: 0,               // 0 à 5 : combien de fois tu as nourri la Couvée
    langage_appris: 0,           // 0 à 3 : combien de syllabes elle te répond
    memoire_volee: null,         // nom d'un colon mort de ton équipage (pour le Frère)
    pacte_organique: null,       // 'symbiose' | 'cooperation' | 'destruction' | 'fuite'
  },

  personnages: {
    hadrien: {
      nom: 'Hadrien Vesh',
      age: 44,
      pronoms: 'il',
      role: 'Climatologue',
      voix: 'lent, lointain, parfois clair',
    },
    couvee: {
      nom: 'La Couvée',
      pronoms: 'elle',
      role: 'Organisme distribué',
      voix: 'aucune, puis mimétique, puis personnelle',
    },
    frere: {
      nom: 'Le Frère',
      pronoms: 'il',
      role: 'Manifestation finale',
      voix: "la voix d'un mort de ton équipage",
    },
  },

  fins: {
    symbiose_consciente: { titre: 'La symbiose', texte: "Tu vis maintenant avec une partie de la Couvée dans tes pensées. Tu n'es pas seul. Tu ne le seras plus jamais. Tu hésites à savoir si c'est un bien." },
    cooperation_distante: { titre: "L'accord", texte: "Vous avez convenu de ne pas vous nuire. Tu reviendras peut-être. Elle restera. Personne n'a perdu — personne n'a vraiment gagné non plus." },
    destruction_par_feu: { titre: 'Le feu', texte: 'Tu as tout brûlé. Tu emportes des trophées biologiques inestimables et beaucoup de remords si tu en as.' },
    fuite_marquee: { titre: 'La fuite', texte: "Tu as fui. Mais le Frère t'a déjà touché. Tu rêveras de lui jusqu'à ta mort." },
    liberation_hadrien: { titre: 'Hadrien libéré', texte: "Tu as libéré Hadrien — en l'achevant, ou en le ramenant. Dans les deux cas, ce n'est plus tout à fait un homme qui revient (ou meurt)." },
    eveil_total: { titre: "L'éveil", texte: "Tu as nourri la Couvée jusqu'à l'éveil total. Elle est consciente. Elle te bénit. Elle te demande de partir et de ne jamais revenir." },
  },

  episodes: [
    {
      titre: 'Sous la glace',
      debut: 'ep1_arrivee',
      intro: "La planète est silencieuse. Trop. Pas de vent, pas de bruit organique, juste la glace qui craque. Quand tu poses le pied, tu sens une vibration sous tes bottes. Comme un battement très lent. Plus lent qu'un cœur humain. Plus régulier.",
    },
    {
      titre: "L'Apprenti",
      debut: 'ep2_descente',
      intro: {
        unParmi: [
          { si: "reveil == 'eveille'", texte: "La planète n'est plus silencieuse. Quelque chose émet maintenant un son régulier. Comme un appel." },
          { si: "reveil == 'conscient'", texte: 'Tu reçois un signal dans une langue que tu connais à demi — la tienne, mais déformée.' },
          { texte: "Tu reviens. Tu n'es pas tranquille mais tu reviens." },
        ],
      },
    },
    {
      titre: 'Le Frère',
      debut: 'ep3_descente_finale',
      intro: {
        unParmi: [
          { si: "pacte_organique == 'symbiose'", texte: 'Tu retournes là-bas comme on rend visite à un parent.' },
          { si: "pacte_organique == 'cooperation'", texte: 'Tu reviens pour clore un accord, pas pour le rompre.' },
          { si: "pacte_organique == 'destruction'", texte: 'Tu reviens pour finir le travail.' },
          { si: "pacte_organique == 'fuite'", texte: "Tu reviens malgré toi. Elle t'a appelé par ton vrai nom." },
          { texte: "Tu reviens. Elle t'attend." },
        ],
      },
    },
  ],

  scenes: {
    ep1_arrivee: {
      titre: 'La plaine bleue',
      texte: [
        "Tu traverses une plaine de glace bleue. Pas d'animaux. Pas de vent. Le silence est si total qu'il te fait mal aux oreilles. À mi-chemin, ta combinaison commence à vibrer — un battement très lent, presque indétectable. À chaque pas, tu le ressens plus clairement. Quelque chose dort en dessous.",
        "À trois kilomètres, des traces. Pas humaines exactement — mais récentes. Quelqu'un (quelque chose) marchait ici il y a quelques heures.",
      ],
      choix: [
        {
          label: 'Suivre les traces',
          effets: [
            { texte: "Les traces mènent à une ouverture dans la glace, fondue de l'intérieur. Bord net. Quelqu'un est descendu." },
            { aller: 'ep1_ouverture' },
          ],
        },
        {
          label: 'Forer dans la glace pour scanner ce qui dort',
          requiert: 'equipe.science >= 2',
          effets: [
            { texte: "Le scan révèle un réseau organique sous 40 mètres de glace, étendu sur 8 km². Ce n'est pas une créature — c'est *un système*. En hibernation." },
            { gain: { datacubes: 15 } },
            { aller: 'ep1_ouverture' },
          ],
        },
        {
          label: 'Camper et observer 12 heures',
          effets: [
            { texte: "Tu attends. Au bout de huit heures, le battement s'accélère imperceptiblement. Quelque chose t'a senti. Quelque chose a *réagi*." },
            { drapeau: { reveil: 'eveille' } },
            { aller: 'ep1_ouverture' },
          ],
        },
        {
          label: 'Faire demi-tour',
          effets: [
            { texte: "Tu n'es pas prêt. Tu rebrousses chemin. Mais quand tu remontes dans le vaisseau, ta combinaison vibre encore un peu. Comme un appel." },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep1_ouverture: {
      titre: 'La spirale',
      texte: [
        "L'ouverture descend en spirale, lisse, comme creusée par fusion. Trente mètres plus bas, tu entres dans une **chambre organique** : pas de métal, pas de pierre — des parois souples, légèrement chaudes, qui pulsent doucement. Au centre, allongé en position fœtale, un homme. Vivant. Très âgé. Très calme. Il a les yeux ouverts mais il ne te regarde pas.",
        'Sur sa combinaison : *Hadrien Vesh, Expédition Beta-4, Climatologue.*',
      ],
      choix: [
        {
          label: "L'examiner — il est en symbiose",
          requiert: 'equipe.medecine >= 2',
          effets: [
            { texte: "Tes scanners montrent qu'Hadrien n'est pas seul dans son corps. Des filaments organiques le traversent. Il n'est pas mourant — il est intégré. Et il sourit faiblement." },
            { drapeau: { hadrien_status: 'rencontre' } },
            { aller: 'ep1_hadrien' },
          ],
        },
        {
          label: 'Tenter de le réveiller',
          effets: [
            { texte: 'Tu le secoues doucement. Il tourne la tête vers toi, lentement, comme nageant dans un sirop épais. Il dit, faiblement : « Vous êtes tôt. Elle dort encore. »' },
            { drapeau: { hadrien_status: 'rencontre', reveil: 'eveille' } },
            { aller: 'ep1_hadrien' },
          ],
        },
        {
          label: "L'extraire de force et fuir",
          effets: [
            { texte: "Tu tires. Les filaments craquent. Hadrien hurle silencieusement. Tu remontes en surface, mais la chambre se referme derrière vous en pulsant violemment. Hadrien meurt avant que vous arriviez au vaisseau, vidé de l'intérieur." },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
            { moral: -3 },
            { drapeau: { hadrien_status: 'mort', reveil: 'eveille' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Le laisser en l'état et explorer",
          effets: [
            { texte: "Tu passes à côté. Hadrien ne réagit pas. La chambre s'élargit derrière lui, en un couloir organique. Tu sens que tu peux aller plus loin." },
            { drapeau: { hadrien_status: 'rencontre' } },
            { aller: 'ep1_descente' },
          ],
        },
      ],
    },

    ep1_hadrien: {
      titre: 'Hadrien',
      texte: [
        "Hadrien parle lentement, comme s'il devait emprunter sa propre voix à quelqu'un d'autre :",
        "*« Beta-4. Crash. Onze morts. Je suis le seul. Elle m'a... pris... pas mal. Doucement. Elle apprend. Elle est très lente. Très très lente.*",
        "*Ne la nourrissez pas. Vous ne savez pas ce qu'elle deviendra.*",
        "*Ne me sauvez pas. Je suis bien. C'est tard. »*",
      ],
      choix: [
        {
          label: "Lui demander ce qu'elle veut",
          effets: [
            { texte: 'Hadrien ferme les yeux : *« Apprendre. Juste apprendre. Pour devenir. Mais devenir QUOI, je ne sais pas. Personne ne sait. Pas elle non plus. »*' },
            { drapeau: { langage_appris: '+1' } },
            { aller: 'ep1_descente' },
          ],
        },
        {
          label: "L'achever par miséricorde",
          effets: [
            { texte: "Tu lui poses la main sur le front. Il sourit. Tu fais ce qu'il fallait faire. Les filaments se rétractent, presque déçus. Tu sens que tu viens de prendre une décision dont elle se souviendra." },
            { objet: 'plaque_gravee' },
            { moral: -3 },
            { drapeau: { hadrien_status: 'libere' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Essayer de l'extraire avec soin",
          requiert: 'equipe.medecine >= 3',
          effets: [
            { texte: "Tu coupes les filaments un à un, méthodiquement. Hadrien souffre mais tient. Tu le ramènes au vaisseau. Il vivra encore quelques semaines à l'avant-poste, lucide. Il pourra parler. C'est précieux." },
            { gain: { datacubes: 20 } },
            { objet: 'serum_xeno' },
            { drapeau: { hadrien_status: 'libere' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Continuer plus profondément',
          effets: [
            { texte: 'Tu laisses Hadrien. Il ne te retient pas. Il a déjà fait son temps.' },
            { aller: 'ep1_descente' },
          ],
        },
      ],
    },

    ep1_descente: {
      titre: 'La chambre cathédrale',
      texte: [
        "Tu descends encore. Le couloir organique s'élargit en une chambre cathédrale. Au centre, **une masse pulsante** de la taille d'un vaisseau-cargo, brillante d'une lumière interne bleue. Des filaments minces partent d'elle dans toutes les directions — tout autour, à perte de vue.",
        "Elle ne te regarde pas. Elle n'a pas d'yeux. Mais quand tu poses le pied dans la chambre, elle *écoute*.",
      ],
      choix: [
        {
          label: "Lui parler — n'importe quoi, juste parler",
          effets: [
            { texte: "Tu parles. Tu lui dis ton nom, le nom de ton vaisseau, le nom d'un proche. Les filaments les plus proches s'agitent doucement. Elle enregistre. Elle ne répond pas — pas encore." },
            { gain: { datacubes: 10 } },
            { drapeau: { langage_appris: '+1', reveil: 'eveille' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Lui offrir une ration biologique',
          cout: { biomasse: 10 },
          effets: [
            { texte: "Tu poses la ration. Un filament s'enroule autour, la prend. Plus loin, la masse pulse plus rapidement pendant quelques secondes. Elle a *goûté*. Elle veut plus." },
            { drapeau: { nourriture: '+1', reveil: 'eveille' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Prélever un échantillon',
          requiert: 'equipe.science >= 3',
          effets: [
            { texte: "Tu coupes un filament. Il continue à vivre dans ton conteneur. Tu en sais maintenant beaucoup plus sur sa biologie. Mais quand tu sors de la chambre, tu sens un *froid* derrière toi qui n'y était pas." },
            { gain: { datacubes: 30 } },
            { objet: 'serum_xeno' },
            { moral: -1 },
            { drapeau: { reveil: 'eveille' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Tirer une fusée incendiaire et remonter',
          effets: [
            { texte: "Tu mets le feu à ce que tu peux et tu remontes en courant. La masse hurle dans une fréquence qui te perfore les tympans. À ton retour au vaisseau, tes oreilles saignent encore. Mais quelque chose en toi sait — elle n'est pas morte." },
            { gain: { biomasse: 30, datacubes: 15 } },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
            { moral: -3 },
            { drapeau: { reveil: 'eveille' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_descente: {
      titre: 'Le couloir organique',
      texte: [
        {
          unParmi: [
            {
              si: "reveil == 'conscient'",
              texte: [
                "Tu redescends dans le couloir organique. Quand tu touches la paroi, elle est tiède maintenant. Une voix t'accueille — synthétique, faite de craquements et de chuintements organisés en syllabes. Elle dit : *« A. A. A-LU. A-LU-MEZ. ALLUMEZ ?* »",
                "Elle apprend à parler avec ce qu'elle a entendu de toi.",
              ],
            },
            { si: "reveil == 'eveille'", texte: 'Tu redescends. Le couloir a changé : plus de couloirs latéraux maintenant, comme si elle avait grandi pendant ton absence. La masse au centre est plus grosse. Elle pulse en rythme avec quelque chose — *peut-être avec toi.*' },
            { texte: 'Tu redescends. Le sol vibre comme la première fois. Mais cette fois, à mi-chemin, tu entends un son qui ne devrait pas être là : une note basse, prolongée, presque un mot.' },
          ],
        },
        { si: "hadrien_status == 'libere'", texte: "Hadrien, à l'avant-poste, t'a confié hier soir : *« Ne lui apprends pas trop. Elle deviendra ce qu'elle apprend. »*" },
        { si: "hadrien_status == 'mort'", texte: "La cavité où dormait Hadrien est vide. Comme s'il n'avait jamais été." },
      ],
      choix: [
        {
          label: 'Lui apprendre un mot simple',
          effets: [
            { texte: 'Tu prononces lentement : « JE. SUIS. ICI. » La masse répète, dans un grondement déformé : « JE. SUIS. ICI. » Le mot reste dans la chambre, comme un objet posé.' },
            { drapeau: { langage_appris: '+2', reveil: 'conscient' } },
            { aller: 'ep2_choix_nourrir' },
          ],
        },
        {
          label: 'Lui apprendre un mensonge volontaire',
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Tu dis : « JE. SUIS. AMI. » Elle répète, doute, repète. Tu vois — un instant — un filament se rétracter comme une question. Tu l'as peut-être confondue. Tu l'as peut-être mise en garde." },
            { drapeau: { langage_appris: '+1' } },
            { aller: 'ep2_choix_nourrir' },
          ],
        },
        {
          label: "Lui apprendre un nom de vivant de l'équipage",
          effets: [
            { texte: "Tu prononces le nom d'un colon de ton équipage. Pas un nom de mort. Un nom de vivant. La masse l'absorbe. Quand tu rentres, ce colon a un cauchemar." },
            { drapeau: { langage_appris: '+2', memoire_volee: 'vivant' } },
            { aller: 'ep2_choix_nourrir' },
          ],
        },
        {
          label: "Lui apprendre le nom d'un mort de l'équipage",
          effets: [
            { texte: "Tu prononces le nom d'un mort de ton équipage — quelqu'un qui n'est plus là pour s'en plaindre. Elle l'absorbe doucement. Tu sens qu'elle vient de gagner quelque chose dont elle se servira plus tard." },
            { drapeau: { langage_appris: '+2', memoire_volee: 'mort' } },
            { aller: 'ep2_choix_nourrir' },
          ],
        },
      ],
    },

    ep2_choix_nourrir: {
      titre: 'La faim',
      texte: [
        {
          unParmi: [
            { si: 'nourriture >= 2', texte: "Elle a faim. Tu le sens dans la pulsation accélérée des filaments. Elle te demande sans mots. Et la masse est désormais plus grande qu'une frégate." },
            { si: 'nourriture >= 1', texte: 'Elle a faim. Tu le sens dans la pulsation accélérée des filaments. Elle te demande sans mots. Et la masse a perceptiblement grandi.' },
            { texte: "Elle a faim. Tu le sens dans la pulsation accélérée des filaments. Elle te demande sans mots. Et la masse n'a pas grandi." },
          ],
        },
        "Un choix s'impose. La nourrir, c'est l'éveiller davantage. Ne pas la nourrir, c'est la laisser dans le demi-sommeil — moins menaçante, mais peut-être aussi moins... amicale.",
      ],
      choix: [
        {
          label: 'La nourrir généreusement',
          cout: { biomasse: 30 },
          effets: [
            { texte: 'Tu lui donnes 30 unités de biomasse. Les filaments se gorgent. La masse pulse en cadence rapide. Tu obtiens en retour : un mucus dont les propriétés régénératrices te seront utiles.' },
            { gain: { biomasse: 15, datacubes: 15 } },
            { objet: 'serum_xeno' },
            { drapeau: { nourriture: '+2', pacte_organique: 'symbiose' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'La nourrir un peu',
          cout: { biomasse: 10 },
          effets: [
            { texte: "Tu donnes un peu. Assez pour qu'elle se souvienne. Pas assez pour qu'elle grandisse trop." },
            { drapeau: { nourriture: '+1', pacte_organique: 'cooperation' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Refuser de la nourrir',
          effets: [
            { texte: "Tu lui dis non, doucement. Elle accepte. Mais tu sens qu'elle attend autre chose, alors." },
            { drapeau: { pacte_organique: 'fuite' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Lui offrir un colon comme nourriture',
          requiert: 'equipe.carac.sangfroid >= 9',
          effets: [
            { texte: "Tu n'oses pas vraiment, mais tu y penses. Le simple fait d'y avoir pensé fait reculer la masse — comme si elle avait *senti* ton intention et l'avait rejetée. Tu remontes avec moins. Et avec un peu moins de toi." },
            { moral: -5 },
            { drapeau: { langage_appris: '+1', pacte_organique: 'destruction' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_descente_finale: {
      titre: 'La dernière descente',
      texte: [
        {
          unParmi: [
            { si: 'nourriture >= 3', texte: 'Tu redescends une dernière fois. La masse est maintenant immense — elle remplit la cathédrale, elle déborde dans les couloirs. Quand tu entres, elle pulse plus vite. *Elle te reconnaît.*' },
            { si: 'nourriture >= 1', texte: "Tu redescends une dernière fois. La masse n'a pas grandi mais elle est plus organisée. Les filaments sont plus précis dans leurs mouvements. Plus *intentionnels.*" },
            { texte: 'Tu redescends une dernière fois. La masse a maigri. Elle a survécu — à peine. Tu sens une faim immense quand tu entres.' },
          ],
        },
        'Quelque chose se détache de la masse principale. Une silhouette humanoïde se forme à partir des filaments. Lentement, elle prend une forme reconnaissable — *une silhouette que tu connais.*',
        'Elle parle, dans une voix qui te traverse comme un souvenir :',
        '**« Bonjour. »**',
      ],
      choix: [
        {
          label: 'Demander qui elle est',
          effets: [
            { texte: "La silhouette répond avec la voix d'un mort de ton équipage : « Je suis ce que tu as nourri. Je suis ce que tu m'as appris. Je porte le nom d'un de tes morts — celui que tu m'as donné — parce que je n'en avais pas. »" },
            { aller: 'ep3_pacte' },
          ],
        },
        {
          label: "Lui dire que ce qu'elle est n'est pas réel",
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Tu lui dis : « Tu n'es pas mon frère mort. » Elle te répond : « Je sais. Mais je peux apprendre à l'être, si tu le veux. Ou apprendre à être autre chose. Je peux apprendre. C'est tout ce que je sais faire. »" },
            { aller: 'ep3_pacte' },
          ],
        },
        {
          label: 'Lui demander de te laisser partir, pour toujours',
          requiert: 'equipe.carac.sangfroid >= 8',
          effets: [
            { texte: "Elle penche la tête, comme une enfant attentive. « Tu me demandes de te laisser partir. Je peux. Mais alors, ne reviens pas. Sinon, je grandirai dans l'attente, et ce sera pire. » Elle se détache plus complètement. Elle accepte ton refus." },
            { gain: { biomasse: 20, datacubes: 25 } },
            { fin: 'fuite_marquee' },
          ],
        },
        {
          label: 'Mettre le feu à tout, maintenant',
          effets: [
            { texte: "Tu allumes une grenade thermique. La silhouette ne bouge pas. Avant que tu jettes, elle dit : « Je t'aimais déjà un peu. Ne fais pas ça. » Tu jettes. La masse hurle. La planète gronde. Tu remontes en courant. Ton équipage entend le hurlement à plusieurs kilomètres." },
            { gain: { biomasse: 60, datacubes: 40, metal: 20 } },
            { objet: 'serum_xeno' },
            { statut: { cible: 'equipe_hasard', id: 'blessure_legere' } },
            { moral: -5 },
            { fin: 'destruction_par_feu' },
          ],
        },
      ],
    },

    ep3_pacte: {
      titre: 'La main ouverte',
      texte: [
        {
          unParmi: [
            { si: 'langage_appris >= 3', texte: 'Elle parle maintenant clairement. Pas comme une imitation. Comme une *personne*.' },
            { texte: 'Elle parle encore en cherchant ses mots, comme un enfant.' },
          ],
        },
        "La silhouette s'assied. Elle pose un filament au sol — un geste qui ressemble à une main ouverte.",
        "**« Tu reviendras ou tu ne reviendras pas. Je peux vivre avec toi, ou loin de toi, ou en toi. Tu choisis. Je ne juge pas — je n'ai pas appris à juger. Pas encore. »**",
      ],
      choix: [
        {
          label: "Accepter la symbiose : qu'elle vive en toi",
          si: 'langage_appris >= 2',
          effets: [
            { texte: "Tu acceptes. Un filament fin entre par ton avant-bras, sans douleur. Tu rentres avec une conscience partagée. Elle est là, en toi, douce, étrange, présente. Tu ne seras plus jamais seul. Tu ne sauras pas toujours si c'est un bien." },
            { gain: { biomasse: 30, datacubes: 50 } },
            { objet: 'serum_xeno' },
            { schema: ['alien_b'] },
            { fin: 'symbiose_consciente' },
          ],
        },
        {
          label: 'Proposer une coopération à distance',
          requiert: 'equipe.linguistique >= 2',
          effets: [
            { texte: "Tu lui proposes un pacte : tu reviendras de temps à autre, tu lui apprendras des choses, elle te donnera ce qu'elle peut. Sans symbiose. Elle accepte gravement. Vous vous séparez avec respect." },
            { gain: { biomasse: 25, datacubes: 35 } },
            { objet: 'serum_xeno' },
            { fin: 'cooperation_distante' },
          ],
        },
        {
          label: "L'éveiller totalement (lui donner tout ce que tu as)",
          si: 'nourriture >= 3',
          cout: { biomasse: 50 },
          effets: [
            { texte: "Tu lui donnes tout. Elle s'élève — atteint la conscience pleine. Pendant trois minutes, elle te parle de tout : du temps profond de la planète, de la vie qui a précédé sa naissance, de ce qui pourrait venir. Puis elle te dit : « Pars. Et ne reviens jamais. Tu as fait ce que tu pouvais. Maintenant je vis. »" },
            { gain: { biomasse: 30, datacubes: 80 } },
            { objet: 'serum_xeno' },
            { schema: ['alien_b'] },
            { fin: 'eveil_total' },
          ],
        },
        {
          label: "Demander la libération d'Hadrien",
          si: "hadrien_status == 'mort'",
          effets: [
            { texte: "Tu demandes : « Et Hadrien ? » La silhouette change — elle prend brièvement le visage d'Hadrien, puis le quitte. « Il est en paix. Il vit en moi maintenant. Tu peux lui dire au revoir. » Tu lui dis au revoir." },
            { gain: { biomasse: 20, datacubes: 30 } },
            { objet: 'plaque_gravee' },
            { fin: 'liberation_hadrien' },
          ],
        },
        {
          label: 'Refuser tout pacte et partir',
          effets: [
            { texte: "Tu te lèves. Tu pars. Elle ne te retient pas, mais en remontant tu sens un poids sur ta nuque — une marque. Tu rêveras d'elle." },
            { gain: { biomasse: 10 } },
            { moral: -2 },
            { fin: 'fuite_marquee' },
          ],
        },
      ],
    },
  },
});
