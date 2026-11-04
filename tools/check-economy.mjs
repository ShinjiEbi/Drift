#!/usr/bin/env node
// tools/check-economy.mjs — « économie sans mur » : aucun coût au-dessus du stockage
// atteignable au moment où il est proposé.
// Usage : node tools/check-economy.mjs [--verbose]
//
// Méthode : on rejoue une progression gloutonne à partir d'une partie neuve —
// à chaque pas, l'élément le moins cher dont les prérequis sont remplis et qui
// tient dans le stockage est acquis (niveau de module, tech, vaisseau,
// fabrication). Quand un élément devient proposé (ses prérequis viennent d'être
// remplis), son coût doit tenir dans le stockage ATTEIGNABLE à cet instant :
// plafonds actuels + tout ce qui augmente le stockage et qui est déjà
// accessible sans tirage aléatoire (niveaux de silo, de mine, d'hydroponie, de
// générateur, de laboratoire, techs de stockage…), acquis à son tour s'il tient
// dans les plafonds du moment.
// Les schémas donnés par la piste des ruines (RUIN_DISCOVERY_TRACK) ou par un arc
// sont déterministes ; une tech qui dépend d'un schéma purement aléatoire est
// une erreur. Les techs légendaires (récompenses d'arc) et les datacubes alien
// (non plafonnés) sont vérifiés contre le stockage maximal.
// Échoue (code 1) à la première violation.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

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
const ST = await imp('state.js');
const APP = await imp('app.js');
const DAF = await imp('data-arcs-factions.js');
const { MODULES, VESSELS, TECH_TREE, FABRICATIONS, BLUEPRINTS } = CAT;
const RES = K.RESOURCES;

// ---- État de travail (une partie neuve dont on fait varier modules et techs) ----
ST.setS(ST.freshState());
const S = ST.S;
S.modules = { commandement: { level: 1 } };
S.techCompleted = {};
const caps = () => ST.capsAll();
const lvl = id => S.modules[id]?.level || 0;

// Schémas déterministes : piste des ruines + récompenses d'arc
const DETERMINISTIC_BP = new Set([
  ...Object.values(APP.RUIN_DISCOVERY_TRACK || {}).flat(),
  ...Object.values(DAF.ARCS).filter(a => a.reward?.kind === 'blueprint').map(a => a.reward.value),
]);
// L'exploration (vedette de départ + antenne) rapporte les schémas de la piste des ruines
const exploring = () => lvl('antenne') >= 1;

// ---- Éléments achetables ----
const items = [];
for (const [id, d] of Object.entries(MODULES)) {
  const max = d.maxLevel + (id === 'mine_surface' ? 1 : 0);   // Extraction profonde : +1 niveau
  for (let l = 1; l <= max; l++) {
    if (id === 'commandement' && l === 1) continue;   // déjà construit
    items.push({
      key: `${id}:${l}`, label: `${d.nom} niv ${l}`, kind: 'module', id, level: l, cost: d.cost(l),
      storage: !!d.capBonus,
      ready: () => lvl(id) === l - 1 && (!d.requireTech || S.techCompleted[d.requireTech])
        && (l <= d.maxLevel || S.techCompleted.tech_mining_advanced)
        && Object.entries(d.prereq(l)).every(([k, v]) => lvl(k) >= v),
      apply: () => { S.modules[id] = { level: l }; },
    });
  }
}
const randomGatedTechs = [];
for (const [id, t] of Object.entries(TECH_TREE)) {
  const bp = t.prereq?.blueprint;
  if (bp && !DETERMINISTIC_BP.has(bp)) randomGatedTechs.push(`${t.nom} (schéma ${BLUEPRINTS[bp]?.nom || bp})`);
  if (t.prereq?.requireArc) continue;   // légendaire : vérifiée contre le stockage maximal
  items.push({
    key: 'tech:' + id, label: `Tech ${t.nom}`, kind: 'tech', id, cost: { datacubes: t.cost.datacubes },
    storage: !!t.effects?.capacityMult,
    ready: () => !S.techCompleted[id] && lvl('laboratoire') >= 1
      && (t.prereq?.tech || []).every(x => S.techCompleted[x])
      && (!bp || (DETERMINISTIC_BP.has(bp) && exploring()))
      && (t.branch !== 'exotique' || exploring())
      && (!t.prereq?.requireAnyAlienBlueprint || exploring()),
    apply: () => { S.techCompleted[id] = { at: 0 }; },
  });
}
for (const [id, v] of Object.entries(VESSELS)) {
  items.push({
    key: 'vaisseau:' + id, label: `Vaisseau ${v.nom}`, kind: 'vessel', id, cost: v.cost,
    ready: () => lvl('hangar') >= v.hangarReq && (!v.requireTech || S.techCompleted[v.requireTech])
      && Object.entries(v.requireModule || {}).every(([k, n]) => lvl(k) >= n),
    apply: () => {}, once: true,
  });
}
for (const [id, f] of Object.entries(FABRICATIONS)) {
  items.push({
    key: 'fab:' + id, label: `Fabrication ${f.nom}`, kind: 'fab', id, cost: f.cost,
    ready: () => lvl('atelier') >= (f.prereq?.workshopLevel || 1) && (f.prereq?.tech || []).every(x => S.techCompleted[x]),
    apply: () => {}, once: true,
  });
}
const total = c => Object.entries(c).reduce((a, [k, v]) => a + (RES.includes(k) ? v : 0), 0);
items.sort((a, b) => total(a.cost) - total(b.cost));

const fits = (cost, cp) => Object.entries(cost).every(([k, v]) => !RES.includes(k) || v <= cp[k]);
const over = (cost, cp) => Object.entries(cost).filter(([k, v]) => RES.includes(k) && v > cp[k]).map(([k, v]) => `${k} ${v} > ${cp[k]}`);

// Stockage atteignable maintenant : on acquiert (sur une copie) tout ce qui
// augmente le stockage et tient déjà dans les plafonds, jusqu'à stabilité.
function reachableCaps(done) {
  const saveMods = JSON.stringify(S.modules), saveTech = { ...S.techCompleted };
  const local = new Set(done);
  let progress = true;
  while (progress) {
    progress = false;
    for (const it of items) {
      if (!it.storage || local.has(it.key) || !it.ready() || !fits(it.cost, caps())) continue;
      it.apply(); local.add(it.key); progress = true;
    }
  }
  const cp = caps();
  S.modules = JSON.parse(saveMods);
  S.techCompleted = saveTech;
  return cp;
}

// ---- Progression gloutonne ----
const done = new Set();
const proposed = new Set();
const violations = [];
const timeline = [];
for (;;) {
  // Éléments qui viennent d'être proposés (prérequis tout juste remplis)
  let cp = null;
  for (const it of items) {
    if (done.has(it.key) || proposed.has(it.key) || !it.ready()) continue;
    proposed.add(it.key);
    cp ||= reachableCaps(done);
    if (!fits(it.cost, cp)) violations.push(`${it.label} : coût au-dessus du stockage atteignable quand il est proposé (${over(it.cost, cp).join(', ')})`);
  }
  // Puis on acquiert le moins cher qui tient dans les plafonds actuels
  let acquired = null;
  for (const it of items) {
    if (done.has(it.key) || !it.ready()) continue;
    if (fits(it.cost, caps())) { acquired = it; break; }
  }
  if (!acquired) break;
  acquired.apply();
  done.add(acquired.key);
  timeline.push(acquired.key);
}

// Éléments jamais acquis : murs définitifs (ou prérequis jamais remplis)
const never = items.filter(it => !done.has(it.key));
for (const it of never) {
  if (it.ready()) violations.push(`${it.label} : jamais finançable (${over(it.cost, caps()).join(', ')})`);
  else violations.push(`${it.label} : jamais proposé (prérequis hors d'atteinte sans tirage aléatoire)`);
}
// Techs légendaires et datacubes alien : contre le stockage maximal
const maxCaps = caps();
for (const t of Object.values(TECH_TREE)) {
  if (!t.prereq?.requireArc) continue;
  if (t.cost.datacubes > maxCaps.datacubes) violations.push(`Tech ${t.nom} : ${t.cost.datacubes} datacubes > stockage maximal ${maxCaps.datacubes}`);
}
for (const t of randomGatedTechs) violations.push(`Tech derrière un schéma aléatoire : ${t}`);

console.log(`Économie : ${items.length} éléments (modules, techs, vaisseaux, fabrications), ${done.size} acquis dans la progression.`);
console.log(`Stockage maximal atteint : ${RES.map(k => `${k} ${maxCaps[k]}`).join(' · ')}`);
if (VERBOSE) console.log('Ordre : ' + timeline.join(' → '));
if (violations.length) {
  console.error(`\n✗ ${violations.length} mur(s) :`);
  for (const v of violations) console.error('  ✗ ' + v);
  process.exit(1);
}
console.log('✓ aucun coût au-dessus du stockage atteignable');
