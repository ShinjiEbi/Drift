// src/content/incidents/solaire.js — incidents du Générateur solaire.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'solaire_panne',
    titre: 'Voilure à la dérive',
    module: 'generateur_solaire',
    gravite: 'mineur',
    texte: 'Une voilure se met à dériver. Production en chute libre.',
    choix: [
      { label: "Réparation d'urgence", requiert: 'equipe.ingenierie >= 1',
        effets: [{ texte: 'Réparation rapide. Production relancée.' }, { perte: { energie: 60 } }] },
      { label: 'Remplacer la voilure', cout: { metal: 45, cristal: 30, energie: 30 },
        effets: [{ texte: 'Voilure neuve installée. Plus durable.' }] },
      { label: 'Patcher avec un kit', consomme: 'kit_reparation',
        effets: [{ texte: 'Le kit fait des merveilles. Aucun temps perdu.' }, { gain: { energie: 15 } }] },
      // Choix de repli, toujours disponible (les autres demandent compétence, objet ou stock)
      { label: 'Attendre la prochaine maintenance',
        effets: [{ texte: 'La voilure reste repliée en attendant la maintenance.' }, { module: { horsService: '30min' } }] },
    ],
  }),

  incident({
    id: 'solaire_surcharge',
    titre: 'Surcharge solaire',
    module: 'generateur_solaire',
    niveauMin: 3,
    gravite: 'serieux',
    texte: 'Une éruption locale crée un pic électrique. Les régulateurs saturent.',
    choix: [
      { label: 'Couper le réseau immédiatement',
        effets: [{ texte: 'Réseau coupé à temps. Stocks préservés.' }, { perte: { energie: 90 } }] },
      { label: 'Tenter de canaliser',
        test: { carac: 'sangfroid', difficulte: 6,
          reussite: [{ texte: 'Pic canalisé en stockage. Bonus inattendu.' }, { gain: { energie: 150 } }],
          echec: [
            { texte: '{victime} a pris une décharge. Les panneaux sont partiellement détruits.' },
            { perte: { energie: 180, cristal: 60 } },
            { statut: { cible: 'victime', id: 'blessure_legere' } },
            { module: { niveau: -1 } },
            { annales: 'Le générateur solaire a brûlé sous une éruption. {victime} a été blessé{victime.e}.' },
          ] } },
    ],
  }),
];
