// src/engine/ancien-format.js — conversion des scènes au format 0.33 vers le format V1.
//
// Sert au script de migration (tout le contenu a été converti une fois, puis
// relu à la main) et, à l'exécution, aux scènes encore écrites à l'ancienne
// (outils de test qui injectent une scène dans SCENES). Le contenu publié dans
// src/content/ est déjà au format V1 : ce module n'est qu'une passerelle.

const LIEUX_PAR_TAG = {
  signal: "corps.signal != 'aucun'",
  signal_sos: "corps.signal == 'sos'",
  signal_crypte: "corps.signal == 'crypte'",
  aucune_vie: "corps.vie == 'aucune'",
  ruines: "corps.ruines != 'aucune'",
  ruines_humaines: "corps.ruines dans ['humaines', 'fusion']",
  ruines_alien_a: "corps.ruines dans ['alien_a', 'fusion']",
  ruines_alien_b: "corps.ruines == 'alien_b'",
  sombre: "(corps.ruines == 'fusion' || corps.type == 'epave')",
  anomalie: "(corps.signal dans ['bruit_blanc', 'echo_temporel'] || corps.danger == 'anomalie')",
  faune: "corps.vie == 'faune'",
  flore_agressive: "corps.vie == 'flore_agressive'",
  civ_active: "corps.vie == 'civ_active'",
  civ_dechue: "corps.vie == 'civ_dechue'",
  predateurs: "corps.danger == 'predateurs'",
  tempetes: "corps.danger == 'tempetes'",
  faille: "corps.danger == 'faille'",
  ia_hostile: "corps.danger == 'ia_hostile'",
  pathogene: "corps.danger == 'pathogene'",
  epave: "corps.type == 'epave'",
  station: "corps.type == 'station'",
  atm_toxique: "corps.atmosphere == 'toxique'",
  atm_vide: "corps.atmosphere == 'aucune'",
  atm_anormale: "corps.atmosphere == 'anormale'",
};

// Condition de lieu équivalente aux tags 0.33 (OU pour une scène d'exploration,
// ET pour une intro/outro, comme l'ancien tirage).
export function lieuxDepuisTags(tags = [], { requireFusion = false } = {}) {
  const special = new Set(['intro', 'outro', 'filler', 'embuscade_faction']);
  const conds = [];
  for (const t of tags) {
    if (special.has(t)) continue;
    if (t.startsWith('biome_')) conds.push(`corps.biome == '${t.slice(6)}'`);
    else if (LIEUX_PAR_TAG[t]) conds.push(LIEUX_PAR_TAG[t]);
  }
  const et = tags.includes('intro') || tags.includes('outro');
  let expr = conds.length ? conds.join(et ? ' && ' : ' || ') : 'vrai';
  if (requireFusion) expr = conds.length ? `corps.ruines == 'fusion' && (${expr})` : "corps.ruines == 'fusion'";
  if (tags.includes('embuscade_faction')) expr = 'faction.reputation <= -60';
  return expr;
}

const FRAGMENTS = { '{planete}': '{lieu}', '{biomeFrag}': '{decor.biome}', '{atmFrag}': '{decor.atmosphere}', '{signalFrag}': '{decor.signal}', '{ruinesFrag}': '{decor.ruines}' };
export function texteDepuisAncien(text) {
  let t = String(text ?? '');
  for (const [a, b] of Object.entries(FRAGMENTS)) t = t.split(a).join(b);
  return t;
}

// outcome 0.33 → liste d'effets V1 (l'issue en dernier)
export function effetsDepuisOutcome(o, { localId = x => x } = {}) {
  if (!o || o === 'next') return [];
  if (o === 'retreat') return [{ retraite: true }];
  const out = [];
  if (o.log) out.push({ texte: o.log });
  if (o.loot && Object.keys(o.loot).length) out.push({ gain: { ...o.loot } });
  if (o.item) out.push({ objet: o.item });
  if (o.blueprint) out.push({ schema: o.blueprint });
  if (o.status) out.push({ statut: { cible: 'equipe_hasard', id: o.status } });
  if (o.status2) out.push({ statut: { cible: 'equipe_hasard', id: o.status2 } });
  if (o.morale) out.push({ moral: o.morale });
  if (o.reputation) out.push({ reputation: o.reputation });
  if (o.setFlags) {
    const d = {};
    for (const [k, v] of Object.entries(o.setFlags)) if (v !== '+0' && v !== '-0') d[k] = v;
    if (Object.keys(d).length) out.push({ drapeau: d });
  }
  if (o.addCandidate) out.push({ recrute: o.addCandidate });
  // Issue (une seule, en dernier) — même priorité que l'ancien moteur
  if (o.combat) {
    const c = { ennemis: [...(o.combat.enemies || [])] };
    if (o.combat.lootOnWin && Object.keys(o.combat.lootOnWin).length) c.butin = { ...o.combat.lootOnWin };
    out.push({ combat: c });
  } else if (o.retreat) out.push({ retraite: true });
  else if (o.end) out.push({ rentrer: true });
  else if (o.next) out.push({ aller: localId(o.next) });
  else if (o.endChronicleEpisode) out.push({ finEpisode: true });
  else if (o.endChronicle) out.push({ fin: o.endChronicle });
  return out;
}

// choix 0.33 → choix V1
export function choixDepuisAncien(c, opts = {}) {
  const v = { label: c.label };
  const req = c.req || {};
  const requiert = [];
  const si = [];
  if (req.skill) requiert.push(`equipe.${req.skill.key} >= ${req.skill.min}`);
  if (req.stat) requiert.push(`equipe.carac.${req.stat.key} >= ${req.stat.min}`);
  if (req.trait) requiert.push(`equipe.trait.${req.trait}`);
  if (req.item && req.item !== c.consume?.item) requiert.push(`equipe.objet.${req.item}`);
  if (req.flag) {
    const { key, equals, min, max } = req.flag;
    const lit = x => (typeof x === 'string' ? `'${x}'` : String(x));
    if (equals !== undefined) si.push(equals === true ? key : equals === false ? `!${key}` : `${key} == ${lit(equals)}`);
    if (min !== undefined) si.push(`${key} >= ${min}`);
    if (max !== undefined) si.push(`${key} <= ${max}`);
  }
  if (si.length) v.si = si.join(' && ');
  if (requiert.length) v.requiert = requiert.join(' && ');
  if (c.consume) {
    const cout = {};
    for (const [k, n] of Object.entries(c.consume)) if (k !== 'item') cout[k] = n;
    if (Object.keys(cout).length) v.cout = cout;
    if (c.consume.item) v.consomme = c.consume.item;
  }
  if (c.risky) {
    v.test = {
      carac: c.risky.stat, difficulte: c.risky.dc,
      reussite: effetsDepuisOutcome(c.risky.success, opts),
      echec: effetsDepuisOutcome(c.risky.fail, opts),
    };
  } else {
    v.effets = effetsDepuisOutcome(c.outcome, opts);
  }
  return v;
}

// scène 0.33 → scène V1 (le titre reste à écrire à la main lors d'une migration)
export function sceneDepuisAncienne(s) {
  const tags = s.tags || [];
  const moment = tags.includes('intro') ? 'arrivee' : tags.includes('outro') ? 'depart'
    : tags.includes('embuscade_faction') ? 'embuscade' : 'exploration';
  const v = {
    id: s.id,
    titre: s.titre || String(s.id).replace(/_/g, ' '),
    lieux: lieuxDepuisTags(tags, { requireFusion: !!s.requireFusion }),
    poids: s.weight ?? 1,
    texte: texteDepuisAncien(typeof s.text === 'function' ? '' : s.text),
    choix: (s.choices || []).map(c => choixDepuisAncien(c)),
    type: 'scene',
  };
  if (moment !== 'exploration') v.moment = moment;
  return v;
}

// Une scène est-elle encore au format 0.33 ?
export const estAncienneScene = s => !!s && Array.isArray(s.choices) && !Array.isArray(s.choix);
