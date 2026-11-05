// data-arcs-factions.js — fils rouges (vue de compatibilité) et FACTION_TYPES
//
// V1 : les fils rouges sont du contenu (src/content/arcs/, format décrit dans
// docs/ecrire-pour-drift.md), avancés par tickArcs() dans app.js. ARCS reste
// exporté ici, indexé par id, pour le code qui lit l'ancien format 0.33
// (nom, eyebrow, color, steps [{ id, title, narrative }], reward { kind, value, log }) :
// les champs V1 (titre, surtitre, couleur, etapes, recompense…) y sont aussi.

import { PACING } from './constants.js';
import { ARCS as FILS_ROUGES } from './content/index.js';

// Récompense au format 0.33, déduite des effets de la récompense V1
function rewardDe(r) {
  if (!r) return null;
  const effets = r.effets || [];
  const bp = effets.find(e => typeof e.schema === 'string' && e.schema.startsWith('bp_'));
  if (bp) return { kind: 'blueprint', value: bp.schema, log: r.texte || '' };
  const tech = effets.find(e => e.technologie);
  if (tech) return { kind: 'tech', value: tech.technologie, log: r.texte || '' };
  const bonus = effets.find(e => e.bonusPermanent);
  if (bonus) return { kind: 'permanent_bonus', value: bonus.bonusPermanent, log: r.texte || '' };
  return { kind: 'effets', value: null, log: r.texte || '' };
}

export const ARCS = Object.fromEntries(FILS_ROUGES.map(a => [a.id, Object.freeze({
  ...a,
  nom: a.titre,
  eyebrow: a.surtitre || '',
  color: a.couleur || '#c8a878',
  steps: a.etapes.map(e => Object.freeze({ ...e, title: e.titre, narrative: e.texte })),
  reward: rewardDe(a.recompense),
})]));

export const FACTION_TYPES = {
  humain: {
    label: "Humaine",
    color: '#c8a878',
    desc: "Descendants de l'Effondrement. Méfiance partagée, intérêts proches.",
    namePrefixes: ['Enclave', 'Vestige', 'Concorde', 'Refuge', 'Faction', 'Communauté'],
    nameSuffixes: ['de Pénombre', 'de la Cendre', 'd\'Hécate', 'des Veilleurs', 'de Méandre', 'de Linceul', 'des Naufragés', 'de Velden'],
    initialReputation: 10,
    missionSkill: 'linguistique',   // compétence primaire pour le jet de mission
    missionCost: 25,                // biomasse
    missionReqSkill: 'linguistique', missionReqMin: 3,
    tradeOffer: { metal: 30, cristal: 15 },
    tradeAsk:   { biomasse: 40 },
    // Cadeaux appréciés : ressources pratiques
    giftOptions: [
      { resource: 'biomasse', amount: 30,  repGain: 6,  label: 'Rations' },
      { resource: 'metal',    amount: 50,  repGain: 8,  label: 'Matériaux' },
      { resource: 'biomasse', amount: 80,  repGain: 14, label: 'Provisions' }
    ],
    giftCooldown: PACING.GIFT_COOLDOWN,   // entre deux cadeaux (12 h réelles)
    // Don d'alliance (réputation ≥ 75)
    allianceGift: { resource: 'metal', amount: 40, interval: 3 * PACING.JOUR }
  },
  alien_a: {
    label: "Alien-A · Cristalline",
    color: '#9f5fb8',
    desc: "Civilisation cristalline. Logique impénétrable, gestes précis.",
    namePrefixes: ['Conclave', 'Choeur', 'Géométrie', 'Chant', 'Spire', 'Prisme'],
    nameSuffixes: ['de Resh', 'd\'Astralune', 'de Cithare', 'des Strates', 'de Verre-Long', 'd\'Inversion'],
    initialReputation: -5,
    missionSkill: 'science',        // ils valorisent la rigueur intellectuelle
    missionCost: 20,
    missionReqSkill: 'science', missionReqMin: 2,   // science 2+ OU linguistique 3+
    missionReqAlt: { skill: 'linguistique', min: 3 },
    tradeOffer: { datacubes: 15, cristal: 25 },
    tradeAsk:   { metal: 50 },
    giftOptions: [
      { resource: 'datacubes', amount: 15,  repGain: 8,  label: 'Données' },
      { resource: 'cristal',   amount: 40,  repGain: 9,  label: 'Cristaux' },
      { resource: 'datacubes', amount: 35,  repGain: 15, label: 'Archives' }
    ],
    giftCooldown: PACING.GIFT_COOLDOWN,
    allianceGift: { resource: 'datacubes', amount: 20, interval: 3 * PACING.JOUR }
  },
  alien_b: {
    label: "Alien-B · Organique",
    color: '#7a9b6e',
    desc: "Biologie consciente, lente, patiente. Pense en cycles.",
    namePrefixes: ['Couvée', 'Symbiose', 'Filament', 'Chrysalide', 'Murmure', 'Reliquat'],
    nameSuffixes: ['Ondulée', 'des Profondeurs', 'd\'Anthrax', 'de Limbe', 'de Tendre', 'd\'Estran'],
    initialReputation: 0,
    missionSkill: 'medecine',       // empathie biologique
    missionCost: 20,
    missionReqSkill: 'medecine', missionReqMin: 2,
    missionReqAlt: { skill: 'linguistique', min: 3 },
    tradeOffer: { biomasse: 50, datacubes: 10 },
    tradeAsk:   { cristal: 30 },
    giftOptions: [
      { resource: 'biomasse', amount: 40,  repGain: 8,  label: 'Cultures' },
      { resource: 'biomasse', amount: 90,  repGain: 15, label: 'Provisions' },
      { resource: 'datacubes',amount: 20,  repGain: 6,  label: 'Données biologiques' }
    ],
    giftCooldown: PACING.GIFT_COOLDOWN,
    allianceGift: { resource: 'biomasse', amount: 60, interval: 3 * PACING.JOUR }
  },
  fusion: {
    label: "Hybride",
    color: '#d49bb8',
    desc: "Métissage rare. Communautés à cheval sur deux mondes.",
    namePrefixes: ['Pacte', 'Croisée', 'Hybride', 'Union'],
    nameSuffixes: ['de Boréalys', 'des Deux-Sangs', 'de Méridien', 'de Crépuscule'],
    initialReputation: 5,
    missionSkill: 'linguistique',
    missionCost: 25,
    missionReqSkill: 'linguistique', missionReqMin: 3,
    tradeOffer: { datacubes: 20, biomasse: 30 },
    tradeAsk:   { metal: 40, cristal: 15 },
    giftOptions: [
      { resource: 'datacubes', amount: 20,  repGain: 7,  label: 'Archives' },
      { resource: 'biomasse',  amount: 50,  repGain: 9,  label: 'Provisions' },
      { resource: 'metal',     amount: 40,  repGain: 6,  label: 'Matériaux' }
    ],
    giftCooldown: PACING.GIFT_COOLDOWN,
    allianceGift: { resource: 'cristal', amount: 30, interval: 4 * PACING.JOUR }
  }
};

