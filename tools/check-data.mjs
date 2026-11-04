#!/usr/bin/env node
// tools/check-data.mjs — vérifie les références croisées des données du jeu.
// Usage : node tools/check-data.mjs
// Échoue (code 1) si une donnée pointe vers quelque chose qui n'existe pas :
// item, schéma, tech, module, ennemi, compétence, caractéristique…
// Le contenu narratif (scènes d'expédition, chroniques, rencontres de combat) est
// vérifié par tools/check-content.mjs.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- Bouchons DOM minimaux : app.js / state.js / ui.js touchent le navigateur ----
const noop = () => {};
const el = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : el),
  set: () => true, apply: () => el, construct: () => el,
});
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
def('document', {
  readyState: 'loading', addEventListener: noop, removeEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  createElement: () => el, body: el, documentElement: el, hidden: false, visibilityState: 'visible',
});
def('window', globalThis);
const store = {};
def('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: noop });
def('navigator', { userAgent: 'node' });
def('Notification', function () {});
globalThis.addEventListener = noop;

const imp = f => import(pathToFileURL(path.join(ROOT, 'src', f)).href);
const K = await imp('constants.js');
const CAT = await imp('catalog.js');
const RAW_ITEMS = new Set(Object.keys(CAT.ITEMS));   // avant l'injection des schémas par app.js
await imp('app.js');   // (effet de bord : ajoute les schémas aux ITEMS)
const DAF = await imp('data-arcs-factions.js');

const { MODULES, MODULE_JOBS, VESSELS, BLUEPRINTS, TECH_TREE, FABRICATIONS, ITEM_NAME_TO_ID,
  TRAITS, ENEMY_TYPES } = CAT;
const RESOURCES = new Set(K.RESOURCES);
const SKILLS = new Set(K.SKILL_LIST);
const ALL_ITEMS = new Set([...RAW_ITEMS, ...Object.keys(BLUEPRINTS)]);

const errors = [];
const err = (ctx, msg) => errors.push(`${ctx} : ${msg}`);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function checkRes(obj, ctx, { allowNeg = false } = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (!RESOURCES.has(k)) err(ctx, `ressource inconnue « ${k} »`);
    if (!isNum(v)) err(ctx, `${k} n'est pas un nombre (${v})`);
    else if (v < 0 && !allowNeg) err(ctx, `${k} négatif (${v}) — utiliser consume pour un coût`);
  }
}

// ---- Modules ----
for (const [id, m] of Object.entries(MODULES)) {
  if (m.requireTech && !TECH_TREE[m.requireTech]) err(`MODULES.${id}`, `requireTech « ${m.requireTech} » inconnue`);
  for (let l = 1; l <= m.maxLevel; l++) {
    try {
      for (const [k, v] of Object.entries(m.cost(l))) if (!RESOURCES.has(k) && k !== 'datacubes_alien') err(`MODULES.${id} niv ${l}`, `coût en ressource inconnue « ${k} »`); else if (!isNum(v) || v < 0) err(`MODULES.${id} niv ${l}`, `coût ${k} = ${v}`);
      if (!isNum(m.time(l)) || m.time(l) <= 0) err(`MODULES.${id} niv ${l}`, `durée invalide`);
      if (m.prod) checkRes(m.prod(l), `MODULES.${id} niv ${l} prod`);
      if (m.upkeep) checkRes(m.upkeep(l), `MODULES.${id} niv ${l} upkeep`);
      for (const pm of Object.keys(m.prereq(l) || {})) if (!MODULES[pm]) err(`MODULES.${id} niv ${l}`, `prérequis module inconnu « ${pm} »`);
    } catch (e) { err(`MODULES.${id} niv ${l}`, `exception ${e.message}`); }
  }
}
for (const [mid, jobs] of Object.entries(MODULE_JOBS)) {
  if (!MODULES[mid]) err(`MODULE_JOBS.${mid}`, 'module inconnu');
  jobs.forEach((j, i) => {
    if (j.req?.skill && !SKILLS.has(j.req.skill.key)) err(`MODULE_JOBS.${mid}[${i}]`, `compétence inconnue « ${j.req.skill.key} »`);
    if (j.req?.trait && !TRAITS[j.req.trait]) err(`MODULE_JOBS.${mid}[${i}]`, `trait inconnu « ${j.req.trait} »`);
  });
}

// ---- Vaisseaux ----
for (const [id, v] of Object.entries(VESSELS)) {
  checkRes(v.cost, `VESSELS.${id}.cost`);
  if (v.requireTech && !TECH_TREE[v.requireTech]) err(`VESSELS.${id}`, `requireTech « ${v.requireTech} » inconnue`);
  for (const m of Object.keys(v.requireModule || {})) if (!MODULES[m]) err(`VESSELS.${id}`, `module requis inconnu « ${m} »`);
}

// ---- Technologies (références + cycles) ----
for (const [id, t] of Object.entries(TECH_TREE)) {
  for (const p of t.prereq?.tech || []) if (!TECH_TREE[p]) err(`TECH_TREE.${id}`, `prérequis tech inconnu « ${p} »`);
  if (t.prereq?.blueprint && !BLUEPRINTS[t.prereq.blueprint]) err(`TECH_TREE.${id}`, `schéma requis inconnu « ${t.prereq.blueprint} »`);
  if (t.prereq?.requireArc && !DAF.ARCS[t.prereq.requireArc]) err(`TECH_TREE.${id}`, `arc requis inconnu « ${t.prereq.requireArc} »`);
  for (const k of ['moduleProdMult', 'moduleMaxLevelDelta']) for (const m of Object.keys(t.effects?.[k] || {})) if (!MODULES[m]) err(`TECH_TREE.${id}.effects.${k}`, `module inconnu « ${m} »`);
  for (const k of ['resourceMult', 'capacityMult']) for (const r of Object.keys(t.effects?.[k] || {})) if (!RESOURCES.has(r)) err(`TECH_TREE.${id}.effects.${k}`, `ressource inconnue « ${r} »`);
}
{
  const st = {};
  const dfs = (n, stack) => {
    st[n] = 1;
    for (const x of TECH_TREE[n]?.prereq?.tech || []) {
      if (st[x] === 1) err('TECH_TREE', `cycle ${[...stack, n, x].join(' → ')}`);
      else if (!st[x] && TECH_TREE[x]) dfs(x, [...stack, n]);
    }
    st[n] = 2;
  };
  for (const n in TECH_TREE) if (!st[n]) dfs(n, []);
}

// ---- Schémas ----
for (const [id, bp] of Object.entries(BLUEPRINTS)) {
  if (RAW_ITEMS.has(id)) err(`BLUEPRINTS.${id}`, 'même id qu\'un item');
  if (bp.unlocks?.kind === 'fab' && !RAW_ITEMS.has(bp.unlocks.target)) err(`BLUEPRINTS.${id}`, `débloque un item inconnu « ${bp.unlocks.target} »`);
}

// ---- Fabrications ----
for (const [id, f] of Object.entries(FABRICATIONS)) {
  if (!RAW_ITEMS.has(f.produces)) err(`FABRICATIONS.${id}`, `produit un item inconnu « ${f.produces} »`);
  checkRes(f.cost, `FABRICATIONS.${id}.cost`);
  if (f.prereq?.blueprint && !BLUEPRINTS[f.prereq.blueprint]) err(`FABRICATIONS.${id}`, `schéma requis inconnu « ${f.prereq.blueprint} »`);
  if (f.prereq?.tech !== undefined && !Array.isArray(f.prereq.tech)) err(`FABRICATIONS.${id}`, 'prereq.tech doit être un tableau');
  for (const t of (Array.isArray(f.prereq?.tech) ? f.prereq.tech : [])) if (!TECH_TREE[t]) err(`FABRICATIONS.${id}`, `tech requise inconnue « ${t} »`);
}
for (const [name, id] of Object.entries(ITEM_NAME_TO_ID)) if (!ALL_ITEMS.has(id)) err(`ITEM_NAME_TO_ID.${name}`, `item inconnu « ${id} »`);

// ---- Ennemis ----
for (const [id, e] of Object.entries(ENEMY_TYPES)) {
  checkRes(e.loot, `ENEMY_TYPES.${id}.loot`);
  for (const l of e.itemLoot || []) if (!ALL_ITEMS.has(l.item)) err(`ENEMY_TYPES.${id}.itemLoot`, `item inconnu « ${l.item} »`);
}

// ---- Types de factions ----
for (const [id, ft] of Object.entries(DAF.FACTION_TYPES)) {
  for (const k of ['missionSkill', 'missionReqSkill']) if (ft[k] && !SKILLS.has(ft[k])) err(`FACTION_TYPES.${id}.${k}`, `compétence inconnue « ${ft[k]} »`);
  if (ft.missionReqAlt && !SKILLS.has(ft.missionReqAlt.skill)) err(`FACTION_TYPES.${id}.missionReqAlt`, `compétence inconnue « ${ft.missionReqAlt.skill} »`);
  checkRes(ft.tradeOffer, `FACTION_TYPES.${id}.tradeOffer`);
  checkRes(ft.tradeAsk, `FACTION_TYPES.${id}.tradeAsk`);
  for (const g of ft.giftOptions || []) if (!RESOURCES.has(g.resource)) err(`FACTION_TYPES.${id}.giftOptions`, `ressource inconnue « ${g.resource} »`);
  if (ft.allianceGift && !RESOURCES.has(ft.allianceGift.resource)) err(`FACTION_TYPES.${id}.allianceGift`, `ressource inconnue « ${ft.allianceGift.resource} »`);
}

// ---- Arcs ----
for (const [id, a] of Object.entries(DAF.ARCS)) {
  if (a.reward?.tech && !TECH_TREE[a.reward.tech]) err(`ARCS.${id}`, `tech de récompense inconnue « ${a.reward.tech} »`);
}

// ---- Résultat ----
const counts = `${Object.keys(MODULES).length} modules, ${RAW_ITEMS.size} items, ${Object.keys(BLUEPRINTS).length} schémas, ${Object.keys(TECH_TREE).length} techs, ${Object.keys(FABRICATIONS).length} fabrications, ${Object.keys(ENEMY_TYPES).length} ennemis`;
if (errors.length) {
  console.error(`✗ ${errors.length} erreur(s) de données :`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ Données cohérentes (${counts}).`);
