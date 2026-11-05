// src/content/incidents/mine.js — incidents de la Mine de surface.
// Migrés de la table INCIDENTS (0.33) : montants écrits tels qu'appliqués
// (l'ancien ×3 caché est fait), durées en temps réel.
import { incident } from '../dsl.js';

export default [
  incident({
    id: 'mine_eboulement',
    titre: 'Éboulement dans la mine',
    module: 'mine_surface',
    gravite: 'serieux',
    texte: "Une galerie de la mine s'effondre partiellement. {victime} était à proximité.",
    choix: [
      { label: 'Évacuer immédiatement',
        effets: [
          { texte: 'Évacuation rapide. La mine est mise hors service le temps de la sécurisation.' },
          { perte: { metal: 90, cristal: 45 } },
          { module: { horsService: '1h' } },
        ] },
      { label: 'Tenter de stabiliser et continuer', requiert: 'equipe.ingenierie >= 2',
        effets: [
          { texte: "{acteur} fait étayer le boyau. Le travail reprend rapidement." },
          { perte: { metal: 30 } },
        ] },
      { label: "Sauver d'abord la victime",
        effets: [
          { texte: "{victime} est dégagé{victime.e}. Le geste a marqué l'équipage." },
          { statut: { cible: 'victime', id: 'blessure_legere' } },
          { perte: { metal: 150, cristal: 75 } },
          { moral: { cible: 'colonie', valeur: 3 } },
          { annales: "{victime} a été sauvé{victime.e} d'un éboulement au prix de matériel." },
        ] },
      { label: 'Forcer la reprise immédiate, ignorer les risques',
        effets: [
          { texte: "{victime} est gravement blessé{victime.e}. La structure souffre. L'équipage murmure." },
          { statut: { cible: 'victime', id: 'blessure_grave' } },
          { module: { niveau: -1 } },
          { moral: { cible: 'colonie', valeur: -6 } },
          { brouille: { a: 'victime', b: 'colonie_hasard' } },
          { incident: { id: 'mine_eboulement', dans: '4h' } },
          { annales: 'Le commandement a forcé une reprise dans une galerie instable. {victime} y est resté{victime.e}.' },
        ] },
    ],
  }),

  incident({
    id: 'mine_filon_riche',
    titre: 'Filon inattendu',
    module: 'mine_surface',
    gravite: 'mineur',
    ton: 'positif',
    texte: "Les foreurs tombent sur un filon inattendu. Plus pur que la moyenne. Mais l'extraction est risquée.",
    choix: [
      { label: 'Exploiter prudemment',
        effets: [{ texte: 'Filon exploité sans incident.' }, { gain: { metal: 120 } }] },
      { label: 'Forer agressivement', requiert: 'equipe.ingenierie >= 2',
        effets: [{ texte: 'Pari gagnant. Récolte exceptionnelle.' }, { gain: { metal: 240, cristal: 90 } }] },
      { label: 'Reporter à plus tard',
        effets: [{ texte: 'Le filon est marqué pour exploitation différée.' }] },
    ],
  }),

  incident({
    id: 'mine_predateur',
    titre: 'Créature dans la mine',
    module: 'mine_surface',
    niveauMin: 3,
    gravite: 'critique',
    texte: 'Une créature inconnue émerge des profondeurs de la mine. {victime} la voit en premier.',
    choix: [
      { label: 'Repousser à coups de pioche',
        test: { carac: 'vigueur', difficulte: 6,
          reussite: [
            { texte: 'La créature retraite. Travail interrompu, mais rien de plus.' },
            { perte: { metal: 45 } },
          ],
          echec: [
            { texte: '{victime} a été blessé{victime.e} sérieusement. La galerie est temporairement abandonnée.' },
            { statut: { cible: 'victime', id: 'blessure_grave' } },
            { perte: { metal: 90 } },
            { module: { horsService: '1h20' } },
            { annales: 'Une créature a surgi de la mine et blessé {victime}.' },
          ] } },
      { label: 'Sceller la galerie',
        effets: [
          { texte: 'Galerie scellée définitivement. La créature est prisonnière en bas. La mine est diminuée.' },
          { perte: { metal: 60, cristal: 30 } },
          { module: { niveau: -1 } },
          { annales: 'Une galerie de la mine a été scellée — une créature inconnue y dort encore.' },
        ] },
      { label: 'Attaquer en groupe armé', requiert: 'equipe.combat >= 2',
        effets: [
          { texte: "La créature est abattue. Sa carcasse fournit de la matière organique. L'équipage en parle longtemps." },
          { gain: { biomasse: 90 } },
          { moral: { cible: 'colonie', valeur: 3 } },
          { annales: "L'équipage a abattu une créature des profondeurs." },
        ] },
    ],
  }),
];
