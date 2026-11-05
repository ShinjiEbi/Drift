// src/content/histoires/marche-etrange.js — « Le Marché Étrange », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- marche_etrange.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'marche_etrange',
  titre: 'Le Marché Étrange',
  accroche: "Un bazar de fortune où humains, cristallins et symbiotes s'échangent ce qu'aucun n'avoue convoiter.",

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: {
    lieu: "corps.ruines dans ['fusion', 'humaines', 'alien_a', 'alien_b'] && corps.biome dans ['toundra', 'desert', 'jungle', 'asteroide', 'volcanique']",
    chance: 0.3,
  },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    contact: null,               // 'curieux' | 'mefiant' | 'arrogant'
    reputation_marche: 0,        // -3 à +3
    kherda_lien: 0,              // -2 à +3
    voln_aide: 0,                // 0 à 3
    dette_tisseuse: false,       // a accepté une promesse à la Tisseuse
    patron_revele: false,        // a découvert qui contrôle le marché
    patron_identite: null,       // 'kherda' | 'consortium' | 'entite_alien'
    route_etablie: false,        // a établi une route commerciale
    effondrement: false,         // le marché s'effondre suite à actions du joueur
    sceau_obtenu: false,         // a obtenu le sceau du marché
  },

  personnages: {
    kherda: {
      nom: 'Khêr-Da',
      age: 134,
      pronoms: 'il',
      role: 'Marchand hybride',
      voix: 'calme, précise, ironique',
    },
    tisseuse: {
      nom: 'La Tisseuse',
      pronoms: 'elle',
      role: 'Marchande de promesses',
      voix: 'multiple, comme un chœur',
    },
    voln: {
      nom: 'Voln',
      age: 38,
      pronoms: 'il',
      role: 'Naufragé rabatteur',
      voix: 'rauque, désespérée',
      recrue: { competences: { linguistique: 3, pilotage: 2, survie: 2 }, traits: ['survivant'] },
    },
  },

  fins: {
    marchand_expert: { titre: 'Le marchand', texte: "Tu es devenu un visage connu au Marché. Khêr-Da te salue à chaque visite. Tu as établi une route commerciale stable — les caravanes croisent les tiennes deux fois par mois. Tu n'as pas tout compris du Marché, mais tu y prospères." },
    dette_eternelle: { titre: 'La dette', texte: "Tu as accepté la promesse de la Tisseuse. Tu ne sais pas ce qu'elle te demandera, ni quand. Elle finira par te le réclamer, et ce jour-là tu obéiras — c'est la nature du pacte. Mais d'ici là, elle t'a tout donné." },
    sauvetage_voln: { titre: 'Voln', texte: "Voln est monté à bord avec toi. Il pleurait. Il portait un sac avec rien dedans — il n'avait jamais rien possédé là-bas. Il vit maintenant à l'avant-poste. Il refait surface lentement, parle peu, mais il connaît le Marché. Il est précieux." },
    patron_negocie: { titre: 'Le partenaire', texte: "Tu as trouvé le Patron. Tu as négocié directement avec lui. Le Marché continue d'exister, mais désormais tu as une ligne directe. Tu n'es plus un client — tu es un partenaire. Ce qui veut dire que tu portes une responsabilité aussi." },
    effondrement: { titre: "L'effondrement", texte: "Tu as poussé trop loin. Tu as triché, manipulé, accumulé. Quelqu'un t'a démasqué — peut-être Khêr-Da, peut-être la Tisseuse. Le Marché s'est défait en trois jours. Tu repars riche mais maudit. Si tu reviens un jour, il n'y aura plus personne pour te vendre quoi que ce soit." },
  },

  episodes: [
    {
      titre: 'Le bazar',
      debut: 'ep1_arrivee',
      intro: "Tu te poses à proximité du signal. Ce n'est pas une ville ni une ruine — c'est un marché. Des tentes hybrides, des étals de matières non identifiées, et un mouvement de figures hétéroclites entre les allées. Personne ne semble surpris de te voir. Au contraire : trois marchands s'avancent immédiatement vers ton vaisseau, comme s'ils t'attendaient.",
    },
    {
      titre: 'Les transactions',
      debut: 'ep2_marchands',
      intro: {
        unParmi: [
          { si: "contact == 'curieux'", texte: "Khêr-Da t'attend à son stand. Voln rôde un peu plus loin. La Tisseuse n'apparaît que la nuit, dit-on." },
          { si: "contact == 'mefiant'", texte: "Tu reviens en restant sur tes gardes. Les marchands t'observent comme un acheteur potentiel — ou une marchandise." },
          { si: "contact == 'arrogant'", texte: 'Tu reviens en imposant. Khêr-Da hausse un sourcil mais te salue. Les autres sont plus distants.' },
          { texte: "Tu reviens. Le marché a quelque chose à t'apprendre." },
        ],
      },
    },
    {
      titre: 'Le Patron',
      debut: 'ep3_revelation',
      intro: {
        unParmi: [
          { si: 'patron_revele', texte: "Tu sais maintenant qui tient les fils. La question n'est plus 'qui dirige' mais 'qu'est-ce que je fais avec ça'." },
          { si: 'patron_revele == faux', texte: "Tu sens qu'il y a une autre couche. Quelqu'un orchestre tout ça en silence. Il est temps de chercher." },
          { texte: 'Tu reviens pour finir ce qui se joue ici. Ou pour le rompre.' },
        ],
      },
    },
  ],

  scenes: {
    ep1_arrivee: {
      titre: 'Le bazar',
      texte: "Le marché s'étend sur plusieurs hectares. Tu vois des structures humaines tordues par des excroissances cristallines, des organismes lisses qui les parcourent en silence, et entre tout cela des figures qui marchandent avec des gestes que tu ne comprends pas. Un homme d'âge indéfini s'approche en premier — son visage porte des reflets nacrés sur les pommettes, mais ses yeux sont humains. « Bienvenue. Tu es nouveau. C'est rare. »",
      choix: [
        {
          label: 'Te présenter ouvertement et demander à voir le marché',
          effets: [
            { texte: "Khêr-Da te conduit personnellement. Il t'apprend les règles tacites : on ne touche pas sans demander, on ne demande pas le prix avant l'objet, on ne refuse jamais une promesse de la Tisseuse à la légère." },
            { drapeau: { contact: 'curieux', kherda_lien: '+1' } },
            { aller: 'ep1_decouverte' },
          ],
        },
        {
          label: "Rester en retrait, observer avant d'engager",
          effets: [
            { texte: "Tu marches en silence. Personne ne t'aborde plus, mais tout le monde te regarde. Tu remarques que certains stalls fonctionnent par troc, d'autres par dette, d'autres par services rendus. Aucun argent visible." },
            { drapeau: { contact: 'mefiant' } },
            { aller: 'ep1_decouverte' },
          ],
        },
        {
          label: 'Afficher de la puissance : armes visibles, ton ferme',
          effets: [
            { texte: 'Khêr-Da hausse un sourcil, mais te salue poliment. Les autres marchands évitent ton regard. Tu sens immédiatement que tu viens de payer un prix invisible — celui de la confiance.' },
            { drapeau: { contact: 'arrogant' } },
            { aller: 'ep1_decouverte' },
          ],
        },
      ],
    },

    ep1_decouverte: {
      titre: 'Les allées',
      texte: [
        "Tu parcours le marché. Les marchandises te déconcertent : un coffret qui chante quand on ouvre son couvercle. Une lentille qui montre des souvenirs qui ne sont pas les tiens. Un récipient contenant un liquide qui n'a pas de masse. Près d'un coin sombre, un humain maigre — l'un des rares vraiment humains ici — agite une main vers toi. Il a une cicatrice sur le front et porte des vêtements rapiécés.",
        { si: "contact == 'curieux'", texte: "Khêr-Da, à côté de toi, murmure : « C'est Voln. Évite-le si tu veux, mais il a souvent des informations que personne d'autre n'a. »" },
      ],
      choix: [
        {
          label: 'Aller parler à Voln',
          effets: [
            { texte: "Voln te raconte qu'il est arrivé ici il y a 5 ans, son vaisseau a brûlé. Personne ne repart du Marché — pas par contrainte, mais parce que la sortie est compliquée. Il survit en informant. Il te demande si tu veux une info — il accepte la nourriture comme paiement." },
            { drapeau: { voln_aide: '+1' } },
            { aller: 'ep1_premiere_offre' },
          ],
        },
        {
          label: 'Ignorer Voln et continuer à explorer',
          effets: [
            { texte: "Tu passes ton chemin. Voln te suit du regard, sans s'offusquer. Tu remarques au passage un stand voilé, sombre, devant lequel personne ne s'arrête. Une silhouette dedans, qu'on devine à peine." },
            { aller: 'ep1_premiere_offre' },
          ],
        },
        {
          label: 'Donner une ration à Voln sans rien demander en retour',
          cout: { biomasse: 5 },
          effets: [
            { texte: "Voln pleure. Pas de joie, juste de fatigue. Il te dit : « Si tu trouves la Tisseuse, ne lui promets rien. Si tu rencontres le Patron, ne le défie pas. Ce sont mes seuls cadeaux pour toi. » Il s'éloigne." },
            { drapeau: { voln_aide: '+2' } },
            { aller: 'ep1_premiere_offre' },
          ],
        },
      ],
    },

    ep1_premiere_offre: {
      titre: 'La première offre',
      texte: "Khêr-Da te présente une première offre. Il te propose un coffret en métal ouvragé contenant 10 datacubes alien. Le prix : 50 biomasse, ou un service rendu plus tard. Il te regarde patiemment. C'est un test.",
      choix: [
        {
          label: 'Payer en biomasse immédiatement',
          cout: { biomasse: 50 },
          effets: [
            { texte: "Khêr-Da acquiesce et te remet le coffret. « Tu paies cash. C'est honnête. La plupart préfèrent le service — mais c'est leur problème, pas le mien. »" },
            { gain: { datacubes: 10 } },
            { drapeau: { reputation_marche: '+1', kherda_lien: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Accepter le pacte du service à venir',
          effets: [
            { texte: "Khêr-Da sourit. « Tu apprends. » Il te remet le coffret. Tu lui dois maintenant un service non spécifié. Pas inquiétant — Khêr-Da ne réclame jamais l'impossible. Mais une dette est une dette." },
            { gain: { datacubes: 10 } },
            { drapeau: { reputation_marche: '+2', kherda_lien: '+2' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Refuser, dire que tu reviendras plus tard',
          effets: [
            { texte: "Khêr-Da hoche la tête. « Comme tu veux. Le coffret restera ici. » Tu ne sens aucune offense — mais tu remarques que d'autres marchands deviennent un peu plus distants à ton égard. Tu n'es plus un acheteur potentiel." },
            { drapeau: { reputation_marche: '-1' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_marchands: {
      titre: 'Les caravanes',
      texte: "Tu reviens. Le marché s'est étoffé — d'autres caravanes sont arrivées. Khêr-Da te salue. Voln, plus en retrait, observe sans s'approcher. Et pour la première fois, tu vois la Tisseuse à son stand : une silhouette voilée dont les contours semblent fluctuer. Elle ne vend rien de tangible, dit-on. Seulement des promesses.",
      choix: [
        {
          label: 'Visiter le stand de la Tisseuse',
          effets: [
            { texte: "Tu t'approches. Sa voix multiple te demande ce que tu veux. Tu n'as rien à demander en particulier. Elle t'offre alors un cadeau — une lentille qui montre la position d'une planète riche en cristal. En échange : tu lui devras quelque chose. Pas un objet, pas un service précis. Juste 'quelque chose'." },
            { aller: 'ep2_tisseuse' },
          ],
        },
        {
          label: 'Aider Voln à recueillir des informations pour Khêr-Da',
          effets: [
            { texte: "Voln est ému. Vous passez la journée à arpenter le marché, à recouper des rumeurs. Tu apprends beaucoup sur les rapports entre marchands. Voln s'ouvre — il te raconte qu'il rêve de partir, mais qu'il ne peut pas. Pas pour des raisons matérielles. Pour autre chose." },
            { drapeau: { voln_aide: '+2', kherda_lien: '+1' } },
            { aller: 'ep2_tisseuse' },
          ],
        },
        {
          label: 'Proposer une marchandise à Khêr-Da : du minerai raffiné',
          cout: { metal: 30 },
          effets: [
            { texte: "Khêr-Da analyse ton minerai avec une lentille hybride. Il te propose un échange équitable : 30 metal raffinés contre 8 datacubes alien et une information sur le marché. Tu acceptes. Tu apprends que d'autres marchés existent ailleurs — il faut un sceau pour y entrer." },
            { gain: { datacubes: 8 } },
            { drapeau: { reputation_marche: '+1' } },
            { aller: 'ep2_tisseuse' },
          ],
        },
      ],
    },

    ep2_tisseuse: {
      titre: 'La Tisseuse',
      texte: "La Tisseuse te fait signe — elle veut te parler. Tu t'approches. Sa voix multiple murmure : « Tu cherches sans savoir quoi. C'est mon spécialité. J'ai une promesse pour toi, si tu en veux. Tu n'as qu'à dire oui. Je te donnerai ce qui te manque. Tu me devras une dette future — non spécifiée, non datée. Mais je viendrai un jour la collecter. »",
      choix: [
        {
          label: 'Accepter la promesse de la Tisseuse',
          effets: [
            { texte: "Tu dis oui. La Tisseuse te touche le poignet — sa peau est tiède, presque humaine. Tu sens passer quelque chose en toi. Tu reçois immédiatement un objet : un sceau d'opale qui ouvre certaines portes. Mais maintenant, tu portes une dette. Elle te trouvera. Tu ne sais pas quand." },
            { gain: { datacubes: 20 } },
            { objet: 'sceau_marche' },
            { drapeau: { dette_tisseuse: true, sceau_obtenu: true } },
            { aller: 'ep2_voln_secret' },
          ],
        },
        {
          label: 'Refuser poliment la promesse',
          effets: [
            { texte: "Tu refuses. La Tisseuse hoche la tête sans rancune. « Comme tu veux. Reviens si tu changes d'avis. Tout le monde finit par changer d'avis. » Elle se détourne. Khêr-Da, à distance, te regarde avec un respect renouvelé." },
            { drapeau: { kherda_lien: '+1' } },
            { aller: 'ep2_voln_secret' },
          ],
        },
        {
          label: 'Tenter de négocier les termes de la dette',
          effets: [
            { texte: "« Précise au moins ce que tu me demanderas, » dis-tu. La Tisseuse semble amusée. « Je ne peux pas. La dette se révèle d'elle-même. Mais je peux te promettre qu'elle ne te demandera rien que tu ne puisses donner. » C'est ambigu. Tu n'acceptes pas, tu ne refuses pas." },
            { aller: 'ep2_voln_secret' },
          ],
        },
      ],
    },

    ep2_voln_secret: {
      titre: 'Le secret de Voln',
      texte: [
        "Voln t'attend à l'écart du marché, derrière les tentes. Il a l'air paniqué. « Je dois te dire quelque chose. J'ai vu le Patron. Une fois. C'était par accident. » Il tremble. « Il n'est pas humain, mais ce n'est pas non plus un alien comme on en connaît. C'est quelque chose entre. Comme la Tisseuse, mais en plus grand. Il vit dans une chambre souterraine sous le marché. C'est lui qui décide qui peut commercer ici. »",
        { si: 'voln_aide >= 2', texte: "Voln te touche le bras. « Je te le dis parce que tu m'as aidé. Mais ne dis à personne que c'est moi qui te l'ai appris. »" },
      ],
      choix: [
        {
          label: 'Aller chercher le Patron immédiatement',
          effets: [
            { texte: 'Tu pars chercher la chambre souterraine. Voln te suit à distance, terrifié. Vous trouvez une trappe sous un stand abandonné.' },
            { drapeau: { patron_revele: true } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Demander à Voln de te suivre — partir avec lui',
          effets: [
            { texte: "Voln pleure de gratitude. Tu lui promets de l'emmener à la fin de cette visite. Il dit qu'il préparera ses affaires — c'est-à-dire rien, il n'a rien. Tu repars en méditant ta promesse." },
            { drapeau: { voln_aide: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: "Garder l'info pour toi et continuer normalement",
          effets: [
            { texte: "Tu remercies Voln et le laisses repartir. Tu continues à commercer comme si de rien n'était. Tu te demanderas longtemps si c'était une sagesse ou une lâcheté." },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_revelation: {
      titre: 'Le moment du choix',
      texte: [
        "C'est ta troisième visite. Le marché te connaît. Khêr-Da te salue par ton nom. Voln te suit du regard. La Tisseuse, dans son stand, semble parfois te regarder à travers son voile — mais comment savoir ?",
        { si: 'patron_revele', texte: "Tu sais ce qu'il y a sous la trappe. Tu sais qui dirige tout ça. La question n'est plus 'qui' — c'est 'que faire'." },
        'Le moment du choix arrive.',
      ],
      choix: [
        {
          label: 'Établir une route commerciale, devenir un client fidèle',
          effets: [
            { texte: "Tu négocies avec Khêr-Da les termes d'une route commerciale. Tes vaisseaux passeront ici deux fois par mois. Tu y vendras ton métal raffiné, tu y achèteras des datacubes alien et des biens rares. Le marché te bénit à sa manière." },
            { gain: { datacubes: 25 } },
            { objet: 'sceau_marche' },
            { drapeau: { route_etablie: true } },
            { fin: 'marchand_expert' },
          ],
        },
        {
          label: 'Accepter la dette de la Tisseuse, devenir son client',
          si: 'dette_tisseuse',
          effets: [
            { texte: "Tu confirmes ton pacte avec la Tisseuse. Elle te remet en cadeau d'adieu un objet impossible — un fragment de temps emprisonné dans du verre, ou ce qui y ressemble. Tu repars avec un trésor et une promesse à honorer un jour." },
            { gain: { datacubes: 50, cristal: 30 } },
            { objet: 'sceau_marche' },
            { fin: 'dette_eternelle' },
          ],
        },
        {
          label: 'Embarquer Voln avec toi, le sauver du Marché',
          si: 'voln_aide >= 2',
          effets: [
            { texte: "Voln monte à bord avec un sac vide et des mains tremblantes. Khêr-Da te regarde le faire — son visage est neutre. La Tisseuse, dans son stand voilé, ne réagit pas. Voln pleure tout le décollage. À l'avant-poste, il devient un colon précieux : il connaît tous les codes de marchands. Il ne reviendra jamais ici." },
            { gain: { datacubes: 10 } },
            { recrute: 'voln' },
            { fin: 'sauvetage_voln' },
          ],
        },
        {
          label: 'Descendre voir le Patron, négocier directement',
          si: 'patron_revele',
          effets: [
            { texte: "Tu descends seul dans la chambre souterraine. Le Patron est… une chose. Pas humanoïde, pas vraiment. Une présence cohérente. Il parle dans ta tête, courtoisement. Vous concluez un accord direct : tu auras des privilèges, en échange d'un service de transport qui te sera détaillé plus tard. Tu remontes sceau en main. Tu es désormais un partenaire — pas un client." },
            { gain: { datacubes: 40 } },
            { objet: 'sceau_marche' },
            { drapeau: { patron_identite: 'entite_alien' } },
            { fin: 'patron_negocie' },
          ],
        },
        {
          label: 'Tout truquer, voler et fuir avant que ça se sache',
          effets: [
            { texte: "Tu changes les étiquettes, tu falsifies des transactions, tu accumules sans payer. Khêr-Da te démasque le troisième jour. Quand tu retournes à ton vaisseau, le marché est en feu — pas littéralement, mais quelque chose s'est rompu. Voln court vers toi en hurlant que les gens fuient. Tu décolles avec un butin énorme. Mais derrière toi, le Marché est en train de disparaître." },
            { gain: { datacubes: 80, cristal: 60, biomasse: 40, metal: 100 } },
            { moral: -8 },
            { drapeau: { effondrement: true } },
            { fin: 'effondrement' },
          ],
        },
      ],
    },
  },
});
