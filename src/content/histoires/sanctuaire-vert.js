// src/content/histoires/sanctuaire-vert.js — « Le Sanctuaire Vert », chronique en 3 épisodes.
// Format : docs/ecrire-pour-drift.md (« Histoires »). Vérifié par npm run check:content ;
// à relire en terminal avec npm run histoire -- sanctuaire_vert.
import { histoire } from '../dsl.js';

export default histoire({
  id: 'sanctuaire_vert',
  titre: 'Le Sanctuaire Vert',
  accroche: 'Une jungle volcanique. Un temple alien cristallin. Et un chant qui change à chaque visite.',

  // Où la chronique peut apparaître (condition sur le lieu) et avec quelle chance à la première visite
  apparition: {
    lieu: "corps.ruines == 'alien_a' && corps.biome dans ['jungle', 'volcanique', 'exotique', 'desert']",
    chance: 0.4,
  },
  // Délai réel entre deux épisodes : l'épisode suivant n'est jouable qu'après ce temps
  rythme: { entreEpisodes: '18h' },

  // Drapeaux : déclarés ici avec leur valeur de départ ; seuls ceux-ci peuvent être lus ou écrits
  drapeaux: {
    tone_compris: 0,             // 0 à 3 : combien tu as compris la langue cristalline
    inara_status: 'inconnu',     // 'inconnu' | 'rencontree' | 'allie' | 'morte' | 'devenue'
    offrande: null,              // 'sang' | 'datacube' | 'chant' | 'aucune' | 'refus'
    choeur_eveille: false,       // les 7 voix divergentes sont-elles entendues
    profanation: false,          // a-t-on cassé un cristal ?
    pacte: null,                 // 'interlocuteur' | 'victime' | 'successeur'
  },

  personnages: {
    inara: {
      nom: 'Inara Hask',
      age: 38,
      pronoms: 'elle',
      role: 'Exobiologiste',
      voix: 'rauque, fragmentée — elle parle peu, elle écoute',
    },
    chant: {
      nom: 'Le Chant',
      pronoms: 'il',
      role: 'Présence cristalline',
      voix: 'fréquences pures, mots déformés',
    },
    choeur: {
      nom: 'Le Chœur des Sept',
      pronoms: 'il',
      role: 'Voix fragmentaires',
      voix: 'sept timbres distincts, parfois contradictoires',
    },
  },

  fins: {
    interlocuteur: { titre: "L'interlocuteur", texte: "Tu deviens l'interlocuteur du Chant. Il t'a marqué d'une fréquence — tu l'entendras le reste de ta vie, où que tu sois. La galaxie te répond différemment." },
    victime: { titre: 'Ce qui manque', texte: "Le Chant t'a pris quelque chose de précieux. Tu reviens vivant mais incomplet. Ce qui te manque ne reviendra pas." },
    successeur: { titre: 'Le successeur', texte: "Tu prends la place d'Inara, ou de quelqu'un avant elle. Tu restes au temple. Une autre version de toi rentre à l'avant-poste." },
    profanation_finale: { titre: 'Le Chant brisé', texte: 'Tu as brisé le Chant. Les cristaux pleurent en sons audibles maintenant. Tu emportes beaucoup. Tu laisses un cadavre derrière toi.' },
    refus_silence: { titre: 'Le silence', texte: "Tu as refusé. Tu repars sans rien. Mais quelque part en toi, le silence aussi est un choix qu'on respecte." },
  },

  episodes: [
    {
      titre: "L'Écho",
      debut: 'ep1_lisiere',
      intro: "À mesure que tu approches, l'air vibre. Une jungle dense, des sommets volcaniques fumants, et au cœur de la vallée, une structure de cristal de la taille d'une cathédrale. Tu entends quelque chose, mais ce n'est pas un son. C'est une *idée* de son.",
    },
    {
      titre: "L'Initiée",
      debut: 'ep2_inara',
      intro: {
        unParmi: [
          { si: "inara_status == 'inconnu'", texte: "Cette fois tu n'es pas seul. Quelqu'un te suit. Pas une bête." },
          { si: "inara_status == 'rencontree'", texte: "Inara t'attend à l'orée. Elle n'a pas bougé d'un mètre depuis la dernière fois." },
          { si: "inara_status == 'morte'", texte: "Tu reviens là où Inara n'est plus. Le temple, lui, est toujours là. Plus lumineux." },
          { texte: "Le sanctuaire t'a appelé en rêve cette semaine. C'était précis : il y a quelque chose dedans qui veut te parler maintenant." },
        ],
      },
    },
    {
      titre: 'Le Pacte',
      debut: 'ep3_seuil',
      intro: {
        unParmi: [
          { si: 'tone_compris >= 3', texte: "Tu comprends ce qu'on te demande, et tu n'as plus peur. Tu reviens parce que tu as fait un choix." },
          { si: 'tone_compris >= 2', texte: 'Tu comprends presque. Tu reviens parce que tu veux savoir le reste.' },
          { si: 'tone_compris >= 1', texte: "Tu reviens parce que tu n'arrives plus à dormir sans entendre le Chant." },
          { si: 'tone_compris >= 0', texte: "Tu reviens parce que tu en as honte. Tu n'as pas écouté la dernière fois. Tu vas essayer." },
          { texte: "Tu reviens. Tu n'aurais pas dû repartir." },
        ],
      },
    },
  ],

  scenes: {
    ep1_lisiere: {
      titre: 'La lisière',
      texte: [
        "À la lisière du sanctuaire, la jungle s'arrête net. Comme par un accord. Devant toi, sur une dalle de basalte, un cercle de cristaux verts en éclats — un visage humain pourrait y tenir, mais aucun n'a été taillé : les éclats poussent d'eux-mêmes, hors de la roche. L'un d'eux vibre faiblement. Pas un son. Une *attente*.",
        "Dans la forêt derrière toi, un craquement. Quelqu'un suit. Pas un prédateur. Trop léger.",
      ],
      choix: [
        {
          label: 'Toucher le cristal vibrant',
          effets: [
            { texte: "Tu poses la paume. Le cristal réchauffe ta main, puis s'éteint. Quelque chose t'a vu." },
            { drapeau: { tone_compris: '+1' } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: 'Te retourner vers le craquement',
          effets: [
            { texte: 'Une femme se tient à dix mètres, immobile. Vêtements râpés, cheveux blancs, peau brûlée par le soleil tropical. Elle ne parle pas. Elle attend.' },
            { drapeau: { inara_status: 'rencontree' } },
            { aller: 'ep1_inara_premiere' },
          ],
        },
        {
          label: 'Briser le cristal pour analyse',
          requiert: 'equipe.science >= 2',
          effets: [
            { texte: "Le cristal se fend dans un cri silencieux que tu ressens dans tes os. Les autres cristaux du cercle s'éteignent. Quelque chose s'est cassé que tu ne sais pas réparer." },
            { gain: { cristal: 15, datacubes: 5 } },
            { drapeau: { profanation: true } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: 'Faire demi-tour',
          effets: [
            { texte: "Tu décides que tu n'es pas prêt. Sur le chemin du retour, tu sens le regard de quelqu'un dans ton dos. Long." },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep1_inara_premiere: {
      titre: 'La femme au brassard',
      texte: [
        "La femme s'avance lentement. De près, on voit que sa gorge est cicatrisée — pas par une blessure, par autre chose, comme si la peau avait été remodelée de l'intérieur. Elle ouvre la bouche. Aucun son. Elle te fait signe — désigne le temple, désigne ton cœur, désigne la terre. Trois fois. Puis attend.",
        'Elle a un nom gravé sur un brassard usé : *Inara Hask. Expédition Vespera-7. Année du Linceul.*',
      ],
      choix: [
        {
          label: 'Lui parler — patiemment, comme à un enfant',
          requiert: 'equipe.linguistique >= 2',
          effets: [
            { texte: "Tu commences à parler. Elle ferme les yeux et hoche la tête. Tu comprends qu'elle écoute, mais autrement — elle suit les vibrations de ta voix, pas les mots. Tu apprends qu'elle est ici depuis 18 ans. Qu'elle ne peut plus parler. Qu'elle peut chanter, mais alors le temple répond et elle ne sait plus s'arrêter." },
            { drapeau: { tone_compris: '+1', inara_status: 'allie' } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: "L'inviter à venir avec vous",
          effets: [
            { texte: "Inara secoue la tête, plus tristement que vous ne pensiez possible. Elle pointe le sanctuaire et fait le geste qu'on ferait pour dire « je suis ici, c'est ici. » Elle ne partira pas." },
            { drapeau: { inara_status: 'allie' } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: "Lui demander si quelqu'un d'autre est ici",
          effets: [
            { texte: "Elle hésite. Puis elle lève les sept doigts d'une main — non, sept doigts. Tu remarques qu'elle a deux pouces à la main droite, et que ce n'est pas une difformité. Tu ne sais pas comment." },
            { drapeau: { choeur_eveille: true, inara_status: 'allie' } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: 'Lui faire signe de chanter pour le temple',
          effets: [
            { texte: "Inara hésite longtemps. Puis elle ferme les yeux et chante — un son sans paroles, pur, qui n'a plus rien d'humain. Le temple répond aussitôt, et tu comprends en une minute plus qu'en une heure de gestes. Mais elle ne s'arrête pas. Quand tu repars, elle chante encore, seule à l'orée, et sa voix commence à se briser." },
            { drapeau: { tone_compris: '+2', inara_status: 'morte' } },
            { aller: 'ep1_temple' },
          ],
        },
        {
          label: 'Reculer, prudent',
          effets: [
            { texte: 'Tu prends ta distance. Inara reste immobile. Elle ne reviendra pas vers toi sans permission.' },
            { drapeau: { inara_status: 'rencontree' } },
            { aller: 'ep1_temple' },
          ],
        },
      ],
    },

    ep1_temple: {
      titre: 'La nef',
      texte: [
        {
          unParmi: [
            { si: 'profanation', texte: "Le temple ne chante plus. Tu le ressens — il s'est *interrompu*. Tu es entré dans un silence trop grand." },
            { si: 'choeur_eveille', texte: "Sept voix t'accueillent, non pas en harmonie, mais en désaccord léger, comme un chœur qui débat." },
            { texte: "Une seule voix t'accueille. Pure, basse, ronde. Pas un son — une présence sonore." },
          ],
        },
        "L'intérieur du sanctuaire est une nef cristalline, hexagonale, traversée de filaments lumineux qui pulsent au rythme d'une *respiration*. Au centre, une dalle vide. Une offrande est attendue.",
      ],
      choix: [
        {
          label: 'Offrir une goutte de ton sang',
          requiert: 'equipe.medecine >= 1',
          effets: [
            { texte: 'Tu te coupes la paume. La goutte tombe sur la dalle. Elle est absorbée en silence. Le Chant change — il connaît maintenant ton sang. Il te reconnaîtra.' },
            { gain: { cristal: 20 } },
            { drapeau: { offrande: 'sang', tone_compris: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Offrir un datacube',
          cout: { datacubes: 5 },
          effets: [
            { texte: 'Le datacube est aspiré dans la pierre. Une vibration brève. Le Chant a appris quelque chose. Il garde.' },
            { gain: { cristal: 15 } },
            { drapeau: { offrande: 'datacube', tone_compris: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Chanter une mélodie de ton monde',
          requiert: 'equipe.carac.charisme >= 6',
          effets: [
            { texte: "Tu chantes — bas, hésitant. Le Chant t'écoute. Puis il répond, en reprenant ta mélodie déformée d'une manière qui t'arrache des larmes. Tu ne sais pas pourquoi tu pleures." },
            { gain: { datacubes: 15 } },
            { drapeau: { offrande: 'chant', tone_compris: '+2' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Briser un cristal de la nef',
          effets: [
            { texte: "Tu frappes. Le cristal éclate. Le Chant ne crie pas — il *se retire*. Tu sens l'attention se détacher de toi. Tu emportes les morceaux. Tu sais que tu as commis quelque chose." },
            { gain: { cristal: 40, datacubes: 10 } },
            { moral: -2 },
            { drapeau: { profanation: true, offrande: 'refus' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Repartir sans offrir',
          effets: [
            { texte: 'Tu sors lentement. Rien ne te retient. Le Chant continue derrière toi, indifférent.' },
            { drapeau: { offrande: 'aucune' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_inara: {
      titre: "L'orée",
      texte: {
        unParmi: [
          { si: "inara_status == 'morte'", texte: "Tu trouves Inara contre le tronc d'un arbre, morte depuis peu. Elle a souri en mourant. Sur son brassard, gravé à la main, un message : *J'ai été entendue jusqu'au bout. Continuez.* À côté d'elle, un éclat de cristal qui pulse lentement, à l'unisson d'un cœur qui ne bat plus." },
          { si: "inara_status == 'allie'", texte: "Inara t'attend à l'orée, comme convenu sans paroles. Elle te regarde longuement, puis fait un signe simple : elle tend les mains vers le sanctuaire et lève sept doigts. Elle veut t'emmener à l'intérieur. *Profond.*" },
          { si: "inara_status == 'rencontree'", texte: "Inara est là, mais cette fois elle se tient au seuil du temple, pas à l'orée. Sa peau est plus pâle. Elle te dévisage. Elle ne te connaît pas, mais elle reconnaît quelque chose en toi." },
          { texte: "Le sanctuaire t'a attiré comme une marée. Aucune Inara. Mais une silhouette dans l'embrasure du temple — qui pourrait être elle, qui pourrait être autre chose." },
        ],
      },
      choix: [
        {
          label: "Suivre Inara à l'intérieur, profondément",
          si: "inara_status == 'allie'",
          effets: [
            { texte: "Inara t'emmène par un passage que tu n'avais pas vu. Vous descendez. La lumière passe du vert au bleu profond. Tu entends maintenant clairement les sept voix." },
            { drapeau: { choeur_eveille: true, tone_compris: '+1' } },
            { aller: 'ep2_choeur' },
          ],
        },
        {
          label: "Recueillir le corps d'Inara",
          si: "inara_status == 'morte'",
          effets: [
            { texte: "Tu enveloppes Inara. Tu prends son brassard. Le cristal qui pulsait à côté d'elle s'éteint définitivement à ton toucher. Tu remontes le chemin du temple seul." },
            { gain: { datacubes: 10 } },
            { objet: 'plaque_gravee' },
            { drapeau: { tone_compris: '+1' } },
            { aller: 'ep2_temple_seul' },
          ],
        },
        {
          label: 'Avancer seul, ignorer Inara',
          effets: [
            { texte: "Tu passes à côté d'elle sans un mot. Elle ne réagit pas. Tu entres dans le temple. Il fait plus sombre que la dernière fois." },
            { aller: 'ep2_temple_seul' },
          ],
        },
        {
          label: 'Parler à Inara longuement',
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Tu passes une heure avec Inara. Elle ne parle toujours pas, mais à travers les gestes et les éclats sonores qu'elle peut produire, tu apprends : il y a quelqu'un *avant* dans le temple. Quelqu'un que le Chant a gardé. Inara veut prendre sa place quand elle sera prête." },
            { drapeau: { inara_status: 'allie', tone_compris: '+2', choeur_eveille: true } },
            { aller: 'ep2_choeur' },
          ],
        },
      ],
    },

    ep2_choeur: {
      titre: 'Les sept piliers',
      texte: [
        {
          unParmi: [
            { si: "inara_status == 'allie'", texte: 'Vous descendez dans une chambre que tu ne savais pas exister. Sept piliers de cristal, chacun pulsant à une fréquence différente. Inara te tient le bras. Elle ne tremble pas. Toi un peu.' },
            { texte: 'Tu descends dans une chambre que tu ne savais pas exister. Sept piliers de cristal, chacun pulsant à une fréquence différente.' },
          ],
        },
        'Une voix te parle, fragmentée, comme si sept personnes essayaient de prononcer le même mot mais désaccordées :',
        "« VOUS-ÊTES-VENU. NOUS-AVONS-PARLÉ-D'AUTRES. AVANT-NOUS-AVIONS-UNE. (silence) MAINTENANT-NOUS-NE-SAVONS-PLUS. QUI. ÊTES. VOUS. »",
      ],
      choix: [
        {
          label: 'Donner ton vrai nom au Chœur',
          effets: [
            { texte: "Tu prononces ton nom. Les sept piliers le répètent en harmonie cette fois — un instant fugace de cohérence. Le Chœur te connaît. C'est dangereux, c'est précieux." },
            { drapeau: { tone_compris: '+1' } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Mentir, donner un faux nom',
          requiert: 'equipe.linguistique >= 2',
          effets: [
            { texte: "Tu mens. Les sept piliers s'agitent, désaccordés. L'un d'eux émet un son qui te paraît être un rire, ou un sanglot. Tu ne sais pas si tu as été cru." },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Demander au Chœur QUI il est, lui',
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Le Chœur se tait longtemps. Puis : « NOUS-SOMMES-CE-QUI-RESTE. NOUS-AVIONS-UN. ELLE-EST-PARTIE. NOUS-CHERCHONS. » Tu comprends qu'ils ont perdu leur point focal. Que sans lui, ils se désaccordent." },
            { drapeau: { tone_compris: '+2' } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Rester silencieux face au Chœur',
          requiert: 'equipe.carac.sangfroid >= 7',
          effets: [
            { texte: "Tu te tais. Les sept voix se calment. Puis l'une d'elles, sans le Chœur, te dit doucement : « Bien. Tu as compris. »" },
            { drapeau: { tone_compris: '+2' } },
            { aller: 'ep2_choix' },
          ],
        },
      ],
    },

    ep2_temple_seul: {
      titre: 'Le temple sans Inara',
      texte: "Sans Inara, le temple est moins vivant. Le Chant te suit, mais à distance, comme s'il évaluait. Tu sens une porte au fond — qu'il n'y avait pas la dernière fois.",
      choix: [
        {
          label: "Forcer l'ouverture de la porte",
          requiert: 'equipe.ingenierie >= 2',
          effets: [
            { texte: "La porte s'ouvre par mécanisme étranger. Derrière, une salle des sept piliers. Tu n'aurais pas dû entrer ainsi." },
            { drapeau: { choeur_eveille: true, profanation: true } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: "Attendre que la porte s'ouvre d'elle-même",
          requiert: 'equipe.carac.sangfroid >= 8',
          effets: [
            { texte: "Tu attends. Quarante-cinq minutes. La porte s'ouvre. Tu entres dans une salle des sept piliers, plus calme." },
            { drapeau: { choeur_eveille: true, tone_compris: '+1' } },
            { aller: 'ep2_choix' },
          ],
        },
        {
          label: 'Repartir, revenir plus tard',
          effets: [
            { texte: "Tu ne forces rien aujourd'hui. Tu repars. Le Chant reste à sa fréquence." },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep2_choix: {
      titre: 'La question du Chœur',
      texte: [
        "Le moment décisif s'approche. Tu sens que ce que tu choisis ici détermine ce que tu seras à ton retour.",
        {
          unParmi: [
            { si: 'choeur_eveille', texte: 'Les sept voix te demandent maintenant en alternance : « ACCEPTES-TU. DE-REVENIR. UNE-DERNIÈRE-FOIS. POUR-PRENDRE. CE-QUI-NOUS-MANQUE. »' },
            { texte: "La voix unique du Chant te demande : « Reviendras-tu ? Tu n'as pas tout pris. Tu n'as pas tout reçu. »" },
          ],
        },
      ],
      choix: [
        {
          label: 'Promettre de revenir',
          effets: [
            { texte: "Tu acquiesces. Le Chant marque ta paume d'une fréquence visible — un mince trait luminescent sous la peau. Tu rentres." },
            { gain: { cristal: 25, datacubes: 15 } },
            { drapeau: { tone_compris: '+1' } },
            { finEpisode: true },
          ],
        },
        {
          label: 'Refuser et partir',
          effets: [
            { texte: 'Tu refuses. Le Chant ne te retient pas. Mais en sortant, tu sens que quelque chose en toi reste là-bas.' },
            { moral: -2 },
            { finEpisode: true },
          ],
        },
        {
          label: 'Demander ce qui leur manque',
          requiert: 'equipe.linguistique >= 3',
          effets: [
            { texte: "Le Chœur te répond : « LA-FOCALE. CELLE-QUI-A-ÉTÉ. INARA-S'APPRÊTE. MAIS-NOUS-AURIONS-AIMÉ. TOI. » Tu comprends qu'ils te veulent comme focale, à la place d'Inara. Tu pars sans répondre." },
            { gain: { datacubes: 25 } },
            { objet: 'lentille_noire' },
            { drapeau: { tone_compris: '+2' } },
            { finEpisode: true },
          ],
        },
      ],
    },

    ep3_seuil: {
      titre: 'Le seuil',
      texte: [
        {
          unParmi: [
            { si: "inara_status == 'allie'", texte: "Tu te tiens à nouveau au seuil du temple. Inara est là, plus pâle, plus translucide. Elle te tend les deux mains, paumes ouvertes, et te montre du regard la salle des sept piliers. *C'est l'heure*, semblent dire ses yeux. *L'heure de l'un de nous deux.*" },
            { si: "inara_status == 'morte'", texte: "Tu te tiens à nouveau au seuil du temple. Inara n'est plus. Mais ses traces sont encore là — des sentiers qu'elle a battus, des marques qu'elle a faites sur les pierres. Le Chant pulse plus lentement, comme s'il portait un deuil." },
            { texte: "Tu te tiens à nouveau au seuil du temple. Personne ne t'attend. Le temple, lui, brille différemment — comme s'il avait appris ton absence et l'avait pesée." },
          ],
        },
        { si: 'profanation', texte: "Mais ce n'est pas comme la première fois. Tu as cassé quelque chose ici. Le Chant le sait. Il pulse, oui, mais avec une note dissonante qui n'était pas là avant." },
        "La dalle vide t'attend, au centre. Mais tu sens que cette fois, ce que tu donneras ne sera pas un objet.",
      ],
      choix: [
        {
          label: 'Avancer sur la dalle, accepter ce qui vient',
          si: 'tone_compris >= 3',
          effets: [
            { texte: "Tu avances. La dalle s'illumine. Le Chant t'enveloppe. Tu deviens partie de la conversation." },
            { aller: 'ep3_pacte_interlocuteur' },
          ],
        },
        {
          label: 'Avancer sur la dalle, ne sachant pas comprendre',
          si: 'tone_compris <= 2',
          effets: [
            { texte: "Tu avances quand même. Le Chant prend ce qu'il peut prendre. Tu repars vivant mais incomplet." },
            { aller: 'ep3_pacte_victime' },
          ],
        },
        {
          label: "Prendre la place d'Inara comme focale",
          si: "inara_status == 'allie'",
          effets: [
            { texte: "Tu te tournes vers Inara. Tu fais le geste qu'elle t'a appris : tendre les mains, paumes ouvertes. Elle pleure sans bruit. Elle te touche le front. Elle s'éteint." },
            { aller: 'ep3_pacte_successeur' },
          ],
        },
        {
          label: 'Briser tous les cristaux que tu peux',
          effets: [
            { texte: "Tu frappes. Tu frappes. Tu frappes encore. Le Chant hurle dans une fréquence que tu ressens comme un saignement intérieur. Quand tu sors, tu emportes des cristaux pour des siècles. Tu n'es plus tout à fait toi." },
            { aller: 'ep3_pacte_profanation' },
          ],
        },
        {
          label: 'Refuser, partir sans rien',
          requiert: 'equipe.carac.sangfroid >= 7',
          effets: [
            { texte: "Tu poses ta main sur la dalle, doucement. Tu dis non. Tu n'argumentes pas. Tu pars. Le Chant ne te retient pas — il te remercie, à sa manière, en silence." },
            { gain: { datacubes: 15 } },
            { fin: 'refus_silence' },
          ],
        },
      ],
    },

    ep3_pacte_interlocuteur: {
      titre: 'La fréquence',
      texte: [
        "Tu te tiens sur la dalle. Le Chant ne te submerge pas — il *t'accueille*. Il te tisse une fréquence personnelle, comme on accorde un nouvel instrument à un ensemble qui jouait déjà.",
        "Quand tu en redescends, tu portes le Chant en toi. Pas tout — juste un fil. Tu l'entendras toujours, faiblement, comme on entend la mer quand on a vécu près d'elle.",
      ],
      choix: [
        {
          label: 'Accepter le pacte et rentrer',
          effets: [
            { texte: 'Tu rentres marqué. Désormais, certaines technologies cristallines te répondent. Tu portes une fréquence — une dette gracieuse.' },
            { gain: { cristal: 60, datacubes: 40 } },
            { objet: 'lentille_noire' },
            { schema: ['alien_a'] },
            { fin: 'interlocuteur' },
          ],
        },
      ],
    },

    ep3_pacte_victime: {
      titre: 'Ce que le Chant prend',
      texte: [
        "Tu te tiens sur la dalle. Le Chant cherche en toi quelque chose qu'il peut comprendre. Il prend ce qui ressemble le plus à sa propre matière : une couleur, un souvenir précis, une affection.",
        "Tu ne sauras pas tout de suite ce qui te manque. Tu t'en rendras compte dans une semaine, ou dix ans.",
      ],
      choix: [
        {
          label: 'Tenter de fuir maintenant',
          effets: [
            { texte: "Tu cours. Le Chant te laisse fuir. Mais ce qu'il a pris, il l'a pris." },
            { gain: { cristal: 30, datacubes: 20 } },
            { moral: -3 },
            { fin: 'victime' },
          ],
        },
        {
          label: 'Endurer en silence',
          requiert: 'equipe.carac.sangfroid >= 8',
          effets: [
            { texte: 'Tu restes. Tu acceptes ce qui se passe. Au moins, en restant, tu reçois un peu plus en échange.' },
            { gain: { cristal: 50, datacubes: 35 } },
            { objet: 'lentille_noire' },
            { moral: -2 },
            { fin: 'victime' },
          ],
        },
      ],
    },

    ep3_pacte_successeur: {
      titre: 'La relève',
      texte: [
        "Inara s'éteint dans tes bras. Doucement, sans douleur visible. À mesure qu'elle s'éloigne, le Chant se réaccorde autour de toi. Tu deviens la nouvelle focale.",
        'Les sept voix sont alignées maintenant. Elles parlent une langue claire — une langue. La tienne.',
        'Mais tu sais que pour rester focale, tu ne peux pas partir. Pas vraiment.',
      ],
      choix: [
        {
          label: 'Rester. Une autre version de toi rentrera.',
          effets: [
            { texte: "Tu fermes les yeux. Quand tu les rouvres, tu te vois sortir du temple. Cette version-là rejoindra l'équipage. Tu, toi qui restes, regarderas par ses yeux." },
            { gain: { cristal: 80, datacubes: 60 } },
            { objet: 'lentille_noire' },
            { schema: ['alien_a'] },
            { fin: 'successeur' },
          ],
        },
        {
          label: 'Refuser au dernier moment',
          effets: [
            { texte: 'Tu te ravises. Tu poses Inara sur la dalle. Le Chœur la prend, en silence. Tu sors. Tu emportes peu, mais tu emportes tout.' },
            { gain: { cristal: 35, datacubes: 25 } },
            { objet: 'plaque_gravee' },
            { fin: 'refus_silence' },
          ],
        },
      ],
    },

    ep3_pacte_profanation: {
      titre: 'Les cristaux qui pleurent',
      texte: "Tu emportes une cargaison de cristaux dont la simple présence dans ta soute fait vibrer les parois. Le Chant ne hurle plus — il s'est tu. Tu n'entendras plus rien de lui, jamais. Aucune autre civilisation alien_a ne te répondra plus de la même manière.",
      choix: [
        {
          label: 'Partir avec le butin',
          effets: [
            { texte: "Tu pars. La jungle qui t'avait laissé passer ne te répondra plus." },
            { gain: { cristal: 120, datacubes: 50, metal: 30 } },
            { moral: -5 },
            { fin: 'profanation_finale' },
          ],
        },
      ],
    },
  },
});
