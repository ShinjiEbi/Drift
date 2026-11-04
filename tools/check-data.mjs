#!/usr/bin/env node
// tools/check-data.mjs — vérifie les références croisées des données du jeu.
// Usage : node tools/check-data.mjs
// Échoue (code 1) si une donnée pointe vers quelque chose qui n'existe pas :
// item, schéma, tech, module, ennemi, scène, compétence, caractéristique…

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
const CH = await imp('chronicles.js');
const APP = await imp('app.js');
const DAF = await imp('data-arcs-factions.js');

const { MODULES, MODULE_JOBS, VESSELS, ITEMS, BLUEPRINTS, TECH_TREE, FABRICATIONS, ITEM_NAME_TO_ID,
  SCENES, TRAITS, ENEMY_TYPES, BIOMES, ATMOSPHERES, RUINES } = CAT;
const { CHRONICLES, CHRONICLE_SCENES } = CH;
const RESOURCES = new Set(K.RESOURCES);
const SKILLS = new Set(K.SKILL_LIST);
const STATS = new Set(Object.keys(K.STAT_LABELS));
const STATUTS = new Set(Object.keys(APP.STATUTS));
const ALL_ITEMS = new Set([...RAW_ITEMS, ...Object.keys(BLUEPRINTS)]);
const ORIGINS_WITH_BP = new Set(Object.values(BLUEPRINTS).map(b => b.origin));
const NPCS = new Set(Object.values(CHRONICLES).flatMap(c => Object.keys(c.characters || {})));

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

// ---- Scènes d'expédition et de chronique ----
const allScenes = [...SCENES.map(s => ['SCENES', s]), ...CHRONICLE_SCENES.map(s => ['CHRONICLE_SCENES', s])];
const sceneIds = new Set();
for (const [, s] of allScenes) {
  if (sceneIds.has(s.id)) err(`scène ${s.id}`, 'id dupliqué');
  sceneIds.add(s.id);
}
const chronSceneIds = new Set(CHRONICLE_SCENES.map(s => s.id));

function checkReq(req, ctx) {
  if (!req) return;
  if (req.skill && !SKILLS.has(req.skill.key)) err(ctx, `req.skill inconnue « ${req.skill.key} »`);
  if (req.stat && !STATS.has(req.stat.key)) err(ctx, `req.stat inconnue « ${req.stat.key} »`);
  if (req.trait && !TRAITS[req.trait]) err(ctx, `req.trait inconnu « ${req.trait} »`);
  if (req.item && !ALL_ITEMS.has(req.item)) err(ctx, `req.item inconnu « ${req.item} »`);
  if (req.flag !== undefined && (typeof req.flag !== 'object' || !req.flag.key)) err(ctx, 'req.flag mal formé (attendu { key, equals|min|max })');
}
function checkOutcome(o, ctx, inChron) {
  if (!o || o === 'next' || typeof o !== 'object') return;
  if (o.loot) checkRes(o.loot, `${ctx}.loot`);
  if (o.item !== undefined && (typeof o.item !== 'string' || !ALL_ITEMS.has(o.item))) err(ctx, `item inconnu « ${o.item} »`);
  if (o.status !== undefined && !STATUTS.has(o.status)) err(ctx, `statut inconnu « ${o.status} »`);
  if (o.blueprint !== undefined && o.blueprint !== 'auto') {
    for (const p of [].concat(o.blueprint)) if (!ORIGINS_WITH_BP.has(p)) err(ctx, `aucun schéma d'origine « ${p} »`);
  }
  if (o.combat) for (const e of o.combat.enemies || []) if (!ENEMY_TYPES[e]) err(ctx, `ennemi inconnu « ${e} »`);
  if (o.combat?.lootOnWin) checkRes(o.combat.lootOnWin, `${ctx}.combat.lootOnWin`);
  if (o.next && !(inChron ? chronSceneIds : sceneIds).has(o.next)) err(ctx, `next vers une scène inconnue « ${o.next} »`);
  if (o.addCandidate && NPCS.size && !NPCS.has(o.addCandidate)) err(ctx, `PNJ inconnu « ${o.addCandidate} »`);
}
for (const [kind, s] of allScenes) {
  const inChron = kind === 'CHRONICLE_SCENES';
  (s.choices || []).forEach((c, i) => {
    const ctx = `${kind}.${s.id}[${i}]`;
    checkReq(c.req, ctx);
    if (c.consume) {
      for (const [k, v] of Object.entries(c.consume)) {
        if (k === 'item') { if (!ALL_ITEMS.has(v)) err(ctx, `consume.item inconnu « ${v} »`); }
        else if (!RESOURCES.has(k)) err(ctx, `consume en ressource inconnue « ${k} »`);
      }
    }
    if (c.risky) {
      if (!STATS.has(c.risky.stat)) err(ctx, `risky.stat « ${c.risky.stat} » n'est pas une caractéristique (${[...STATS].join(', ')})`);
      checkOutcome(c.risky.success, `${ctx}.success`, inChron);
      checkOutcome(c.risky.fail, `${ctx}.fail`, inChron);
    } else checkOutcome(c.outcome, ctx, inChron);
  });
}

// ---- Chroniques ----
for (const [id, c] of Object.entries(CHRONICLES)) {
  for (const ep of c.episodes || []) if (!chronSceneIds.has(ep.firstScene)) err(`CHRONICLES.${id}`, `firstScene inconnue « ${ep.firstScene} »`);
  const r = c.requires || {};
  for (const [k, table] of [['biome', BIOMES], ['atmosphere', ATMOSPHERES], ['ruines', RUINES]]) {
    for (const v of [].concat(r[k] ?? [])) if (!table[v]) err(`CHRONICLES.${id}.requires.${k}`, `valeur jamais générée « ${v} »`);
  }
  for (const [cid, ch] of Object.entries(c.characters || {})) {
    for (const k of Object.keys(ch.skills || {})) if (!SKILLS.has(k)) err(`CHRONICLES.${id}.characters.${cid}`, `compétence inconnue « ${k} »`);
    for (const k of Object.keys(ch.stats || {})) if (!STATS.has(k)) err(`CHRONICLES.${id}.characters.${cid}`, `caractéristique inconnue « ${k} »`);
    for (const t of ch.traits || []) if (!TRAITS[t]) err(`CHRONICLES.${id}.characters.${cid}`, `trait inconnu « ${t} »`);
  }
}

// ---- Arcs ----
for (const [id, a] of Object.entries(DAF.ARCS)) {
  if (a.reward?.tech && !TECH_TREE[a.reward.tech]) err(`ARCS.${id}`, `tech de récompense inconnue « ${a.reward.tech} »`);
}

// ---- Résultat ----
const counts = `${Object.keys(MODULES).length} modules, ${RAW_ITEMS.size} items, ${Object.keys(BLUEPRINTS).length} schémas, ${Object.keys(TECH_TREE).length} techs, ${Object.keys(FABRICATIONS).length} fabrications, ${SCENES.length} scènes, ${CHRONICLE_SCENES.length} scènes de chronique, ${Object.keys(ENEMY_TYPES).length} ennemis`;
if (errors.length) {
  console.error(`✗ ${errors.length} erreur(s) de données :`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ Données cohérentes (${counts}).`);
