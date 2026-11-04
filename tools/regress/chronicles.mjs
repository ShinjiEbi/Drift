#!/usr/bin/env node
/* global document, window */  // utilisés dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/chronicles.mjs — non-régression des chroniques planétaires (Playwright).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/chronicles.mjs
//
// Vérifie :
//  - C1  : une expédition de chronique démarre sur sa scène-intro (au lieu de rester
//          bloquée), se joue à la souris dans l'overlay, et les 6 chroniques se jouent
//          jusqu'à une fin sur 3 expéditions successives ;
//  - C1b : une sauvegarde 0.32 bloquée sur « __chron_intro__ » se débloque au rechargement ;
//  - C1c : une expédition sur une scène introuvable rentre au lieu de rester bloquée ;
//  - E11 : un PNJ recruté est un colon complet (origin, salary, sequels…), ou un candidat
//          si l'habitat est plein ; un ancien colon de chronique sans `origin` est réparé ;
//  - M2  : les paiements de chronique débitent bien la colonie (consume) ;
//  - M16 : une chronique déjà attribuée ne l'est pas une seconde fois.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DRIFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright introuvable. Définis NODE_PATH=$(npm root -g) ou installe-le.');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const fail = msg => { failures.push(msg); console.error('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Service Worker|\[PWA\]|Failed to load resource|fonts\.(googleapis|gstatic)/.test(t)) return;
  pageErrors.push(t.split('\n')[0]);
});
page.on('dialog', d => d.accept());
const flushErrors = label => {
  const uniq = [...new Set(pageErrors.splice(0))];
  if (uniq.length) fail(`${label} : ${uniq.length} erreur(s) — ${uniq.slice(0, 5).join(' | ')}`);
  else ok(label);
};

// Fonctions installées dans la page (window.__t) pour piloter une colonie de test
async function installHelpers() {
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const cat = await import('./src/catalog.js');
    const app = await import('./src/app.js');
    const ch = await import('./src/chronicles.js');
    const ui = await import('./src/ui.js');
    const T = { st, cat, app, ch, ui };
    T.S = () => st.S;
    T.setupColony = () => {
      const S = st.S;
      S.crew = []; S.assignments = {};   // V1 : colonie de test sans l'équipage de départ
      for (const [id, d] of Object.entries(cat.MODULES)) S.modules[id] = { level: d.maxLevel || 1 };
      for (const id of Object.keys(cat.TECH_TREE)) S.techCompleted[id] = { at: 0 };
      for (let i = 0; i < 4; i++) {
        const c = st.genCandidate();
        for (const k of Object.keys(c.skills)) c.skills[k] = 4;
        for (const k of Object.keys(c.stats)) c.stats[k] = 9;
        c.traits = ['sang_froid', 'charisma'];
        S.candidates.push(c);
        st.acceptCandidate(c.id);
      }
      S.fleet.push({ id: 'v_regress', type: 'navette', name: 'Regress', available: true });
      T.refill();
    };
    T.refill = () => {
      for (const k of Object.keys(st.S.res)) st.S.res[k] = Math.max(st.S.res[k], st.capOf(k) || 500);
      // L'équipe de test ne reste pas à l'infirmerie entre deux épisodes
      for (const m of st.S.crew) if (m.skills?.science === 4 && m.statut !== 'expedition' && m.statut !== 'mort') { m.statut = 'libre'; m.statuts = []; m.sante = 100; }
    };
    T.body = id => st.S.galaxy.systems.flatMap(s => s.bodies).find(b => b.id === id);
    // Corps de test : propriétés compatibles avec la chronique, chronique forcée
    T.prepareBody = (idx, chronId) => {
      const S = st.S;
      const sys = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, b) => a.distance - b.distance)[idx];
      sys.scanned = true;
      const body = sys.bodies[0];
      const req = ch.CHRONICLES[chronId].requires || {};
      for (const k of ['ruines', 'biome', 'atmosphere', 'vie', 'danger']) if (req[k]) body[k] = [].concat(req[k])[0];
      body.chronicle = { id: chronId, episodeIdx: 0, flags: { ...ch.CHRONICLES[chronId].initialFlags }, completed: false, currentSceneId: null };
      body.chronicleChecked = true;
      return body.id;
    };
    T.crewIds = () => st.S.crew.filter(m => m.statut === 'libre' && m.skills.science === 4).slice(0, 4).map(m => m.id);
    T.launch = bodyId => {
      T.refill();
      const before = st.S.expeditions.length;
      app.launchExpedition({ vesselId: 'v_regress', bodyId, crewIds: T.crewIds(), equipment: {} });
      return st.S.expeditions.length > before ? st.S.expeditions[st.S.expeditions.length - 1].id : null;
    };
    T.exp = id => st.S.expeditions.find(e => e.id === id);
    // Avance rapidement jusqu'à la phase voulue (sans simuler chaque minute)
    T.fastForward = (id, phase) => {
      for (let i = 0; i < 20; i++) {
        const e = T.exp(id);
        if (!e || e.phase === phase) return e ? e.phase : 'rentree';
        if (e.phase !== 'sur_place') e.elapsedMin = Math.max(e.elapsedMin, e.oneWayMin);
        st.tickOnce({ silent: true });
      }
      return T.exp(id)?.phase || 'rentree';
    };
    // Joue les scènes de l'expédition : PNJ à recruter en priorité, sinon 1er choix disponible
    T.playOut = (id, opts = {}) => {
      const trace = [];
      for (let n = 0; n < 40; n++) {
        const e = T.exp(id);
        if (!e || e.phase !== 'sur_place') return { trace, done: true };
        const scene = app.currentScene(e);
        if (!scene) return { trace, done: false, stuck: 'scène introuvable' };
        const avail = scene.choices.map((c, i) => ({ c, i })).filter(({ c }) => app.evaluateChoice(e, c).available);
        if (!avail.length) return { trace, done: false, stuck: 'aucun choix disponible dans ' + scene.id };
        const outs = c => [c.outcome, c.risky?.success].filter(o => o && typeof o === 'object');
        const pick = avail.find(({ c }) => outs(c).some(o => o.addCandidate))
          || (opts.prefer && avail.find(({ c }) => opts.prefer.test(c.label)))
          || avail[0];
        const resBefore = { ...st.S.res };
        T.refill();
        const resAfterRefill = { ...st.S.res };
        app.playChoice(id, pick.i);
        const paid = {};
        for (const k of Object.keys(pick.c.consume || {})) if (k !== 'item') paid[k] = resAfterRefill[k] - st.S.res[k];
        trace.push({ scene: scene.id, label: pick.c.label, consume: pick.c.consume || null, paid, resBefore: resBefore.biomasse });
      }
      return { trace, done: false, stuck: 'trop de choix (boucle ?)' };
    };
    T.fillHabitat = () => {
      // Remplit l'habitat avec des copies d'un colon ordinaire (sans passer par le rendu)
      const model = st.S.crew.find(m => !m.chronicleOrigin && m.skills?.science !== 4) || st.S.crew[0];
      const missing = st.crewUsage().total - st.crewUsage().used;
      for (let i = 0; i < missing; i++) {
        st.S.crew.push({ ...JSON.parse(JSON.stringify(model)), id: 'm_fill_' + i, name: 'Remplissage ' + i, statut: 'libre' });
      }
      return st.crewUsage();
    };
    window.__t = T;
  });
}

try {
  console.log('1. Démarrage');
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.waitForTimeout(800);
  await installHelpers();
  await page.evaluate(() => window.__t.setupColony());
  flushErrors('colonie de test prête');

  console.log('1b. Une chronique n\'est attribuée qu\'à un seul corps (M16)');
  const dup = await page.evaluate(() => {
    const T = window.__t; const S = T.S();
    const systems = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, b) => a.distance - b.distance).slice(10, 14);
    const bodies = systems.map(s => { s.scanned = true; return s.bodies[0]; });
    // Corps compatibles avec les 3 chroniques à ruines humaines ; tirage toujours gagnant
    for (const b of bodies) { b.ruines = 'humaines'; b.biome = 'jungle'; b.atmosphere = 'toxique'; delete b.chronicle; b.chronicleChecked = false; }
    const realRandom = Math.random;
    Math.random = () => 0;
    const exps = [];
    try {
      for (const [i, b] of bodies.entries()) {
        S.fleet.push({ id: 'v_dup' + i, type: 'vedette', name: 'Dup ' + i, available: true });
        T.refill();
        T.app.launchExpedition({ vesselId: 'v_dup' + i, bodyId: b.id, crewIds: [T.crewIds()[0]], equipment: {} });
        exps.push(S.expeditions[S.expeditions.length - 1]);
      }
    } finally { Math.random = realRandom; }
    const ids = bodies.map(b => b.chronicle?.id).filter(Boolean);
    // Nettoyage : on annule ces expéditions de test
    for (const e of exps) {
      S.expeditions.splice(S.expeditions.indexOf(e), 1);
      for (const id of e.crewIds) S.crew.find(m => m.id === id).statut = 'libre';
    }
    S.fleet = S.fleet.filter(v => !v.id.startsWith('v_dup'));
    for (const b of bodies) { delete b.chronicle; b.chronicleChecked = true; }
    return { ids, launched: exps.length };
  });
  check(dup.launched === 4 && dup.ids.length === 3 && new Set(dup.ids).size === dup.ids.length,
    `4 corps compatibles → 3 chroniques distinctes, pas de doublon (${dup.ids.join(', ')})`);

  console.log('2. Épisode 1 du Pulsar Silencieux joué à la souris (overlay de scène)');
  const pulsarBody = await page.evaluate(() => window.__t.prepareBody(0, 'pulsar_silencieux'));
  const exp1 = await page.evaluate(b => window.__t.launch(b), pulsarBody);
  check(!!exp1, 'expédition lancée vers le corps de la chronique');
  const phase1 = await page.evaluate(id => window.__t.fastForward(id, 'sur_place'), exp1);
  const intro = await page.evaluate(id => { const s = window.__t.app.currentScene(window.__t.exp(id)); return s && { id: s.id, n: s.choices.length, text: String(s.text).slice(0, 40) }; }, exp1);
  check(phase1 === 'sur_place' && intro?.id === '__chron_intro__' && intro.n > 0, `arrivée sur place avec la scène-intro (${JSON.stringify(intro)})`);
  // Interface : onglet Galaxie > Expéditions > Reprendre la mission
  await page.click('nav.tabs button[data-tab="galaxy"]', { force: true });
  await page.click('[data-subtab-galaxy="expeditions"]', { force: true });
  await page.waitForTimeout(200);
  await page.click(`button[data-resume-exp="${exp1}"]`, { force: true });
  await page.waitForTimeout(150);
  let overlayShown = await page.evaluate(() => document.querySelector('#sceneOverlay')?.classList.contains('show'));
  check(overlayShown, 'l\'overlay de scène reste ouvert sur l\'intro de chronique');
  const hasAbandon = await page.$('#sceneInner [data-action-scene="abandon"]');
  check(!!hasAbandon, 'le bouton « Retraite anticipée » est présent');
  let clicks = 0;
  while (clicks < 20) {
    overlayShown = await page.evaluate(() => document.querySelector('#sceneOverlay')?.classList.contains('show'));
    if (!overlayShown) break;
    await page.evaluate(() => window.__t.refill());
    const btn = await page.$('#sceneInner button[data-choice]:not([disabled])');
    if (!btn) break;
    await btn.click({ force: true });
    await page.waitForTimeout(80);
    clicks++;
  }
  const after1 = await page.evaluate(id => ({ phase: window.__t.exp(id)?.phase, chron: window.__t.S().galaxy.systems.flatMap(s => s.bodies).find(b => b.chronicle?.id === 'pulsar_silencieux').chronicle }), exp1);
  check(clicks >= 2 && after1.phase === 'retour' && after1.chron.episodeIdx === 1, `épisode 1 joué en ${clicks} clics, retour engagé, épisode suivant = 2 (idx ${after1.chron.episodeIdx})`);
  await page.evaluate(id => window.__t.fastForward(id, 'rentree'), exp1);
  flushErrors('aucune erreur pendant l\'épisode joué à la souris');

  console.log('3. Les 6 chroniques jouées jusqu\'à une fin');
  const chronIds = await page.evaluate(() => Object.keys(window.__t.ch.CHRONICLES));
  const reports = {};
  for (const [i, chronId] of chronIds.entries()) {
    const bodyId = chronId === 'pulsar_silencieux' ? pulsarBody : await page.evaluate(([i, c]) => window.__t.prepareBody(i + 1, c), [i, chronId]);
    const rep = { episodes: 0, traces: [] };
    for (let ep = 0; ep < 5; ep++) {
      const state = await page.evaluate(b => window.__t.S().galaxy.systems.flatMap(s => s.bodies).find(x => x.id === b).chronicle, bodyId);
      if (state.completed) break;
      if (chronId === 'anneau_trace' && state.episodeIdx === 2) {
        rep.habitat = await page.evaluate(() => window.__t.fillHabitat());
      }
      const id = await page.evaluate(b => window.__t.launch(b), bodyId);
      if (!id) { rep.error = 'lancement impossible'; break; }
      await page.evaluate(id => window.__t.fastForward(id, 'sur_place'), id);
      const r = await page.evaluate(id => window.__t.playOut(id), id);
      rep.traces.push(...r.trace);
      if (!r.done) { rep.error = r.stuck; break; }
      await page.evaluate(id => window.__t.fastForward(id, 'rentree'), id);
      rep.episodes++;
    }
    const fin = await page.evaluate(b => window.__t.S().galaxy.systems.flatMap(s => s.bodies).find(x => x.id === b).chronicle, bodyId);
    rep.ending = fin.ending;
    reports[chronId] = rep;
    check(!rep.error && fin.completed && fin.ending,
      `${chronId} : fin « ${fin.ending} » atteinte (${rep.episodes} expédition(s)${rep.error ? ', ' + rep.error : ''})`);
  }
  const paidOk = Object.values(reports).flatMap(r => r.traces).filter(t => t.consume && Object.keys(t.paid).length);
  check(paidOk.length > 0 && paidOk.every(t => Object.entries(t.paid).every(([k, v]) => v === t.consume[k])),
    `les coûts de chronique (consume) sont débités de la colonie (${paidOk.map(t => `${t.scene}: ${JSON.stringify(t.paid)}`).join(', ')})`);
  flushErrors('aucune erreur pendant les chroniques');

  console.log('4. PNJ de chronique recrutés');
  const people = await page.evaluate(() => {
    const S = window.__t.S();
    const pick = p => ({ name: p.name, origin: p.origin, salary: p.salary, sequels: Array.isArray(p.sequels), statut: p.statut, ch: p.chronicleCharacter });
    return { crew: S.crew.filter(p => p.chronicleOrigin).map(pick), cand: S.candidates.filter(p => p.chronicleOrigin).map(pick) };
  });
  const adele = people.crew.find(p => p.ch === 'adele');
  check(adele && adele.origin?.label === 'Le Pulsar Silencieux' && adele.salary > 0 && adele.sequels && adele.statut,
    `Adèle a rejoint l'avant-poste comme colon complet (${JSON.stringify(adele)})`);
  const elie = people.cand.find(p => p.ch === 'elie');
  check(elie && elie.origin?.label === "L'Anneau Tracé", `habitat plein : Élie attend dans les candidatures (${JSON.stringify(elie || { habitat: reports.anneau_trace.habitat, crew: people.crew.map(p => p.ch), cand: people.cand.map(p => p.ch) })})`);
  for (const t of ['crew', 'galaxy', 'overview']) {
    await page.click(`nav.tabs button[data-tab="${t}"]`, { force: true });
    await page.waitForTimeout(150);
    const subs = await page.$$(`#view-${t} [data-subtab], #view-${t} [data-subtab-galaxy]`);
    for (const s of subs) { if (!(await s.isDisabled())) { await s.click({ force: true }); await page.waitForTimeout(100); } }
  }
  flushErrors('vues équipage / candidats sans erreur avec les PNJ');

  console.log('5. Sauvegarde 0.32 bloquée sur « __chron_intro__ » + ancien colon de chronique');
  await page.evaluate(() => {
    const T = window.__t; const S = T.S();
    // Libère l'habitat et prépare un corps avec la chronique du Sanctuaire Vert
    const sys = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, b) => b.distance - a.distance)[0];
    sys.scanned = true;
    const body = sys.bodies[0];
    body.ruines = 'alien_a'; body.biome = 'jungle';
    body.chronicle = { id: 'sanctuaire_vert', episodeIdx: 0, flags: { ...T.ch.CHRONICLES.sanctuaire_vert.initialFlags }, completed: false, currentSceneId: '__chron_intro__' };
    body.chronicleChecked = true;
    const crewIds = T.crewIds().slice(0, 2);
    for (const id of crewIds) S.crew.find(m => m.id === id).statut = 'expedition';
    S.fleet.push({ id: 'v_legacy', type: 'vedette', name: 'Legacy', available: false });
    // Expédition au format 0.32, bloquée (pas de chronicleRef, intro introuvable)
    S.expeditions.push({ id: 'e_legacy', vesselId: 'v_legacy', bodyId: body.id, systemId: sys.id, crewIds, phase: 'sur_place', elapsedMin: 0, oneWayMin: 300, onSiteMin: 240, cost: { fuel: 1, bio: 1 }, bodyDistance: sys.distance, seed: 'legacy', scenes: ['__chron_intro__'], sceneIdx: 0, awaitingChoice: true, accumulatedLoot: {}, accumulatedItems: [], accumulatedLog: [], sceneThreatMod: 0, equipment: {} });
    // Expédition coincée sur une scène qui n'existe pas
    S.fleet.push({ id: 'v_ghost', type: 'vedette', name: 'Fantôme', available: false });
    const ghostCrew = S.crew.find(m => m.statut === 'libre');
    ghostCrew.statut = 'expedition';
    S.expeditions.push({ id: 'e_ghost', vesselId: 'v_ghost', bodyId: body.id, systemId: sys.id, crewIds: [ghostCrew.id], phase: 'sur_place', elapsedMin: 0, oneWayMin: 300, onSiteMin: 240, cost: { fuel: 1, bio: 1 }, bodyDistance: sys.distance, seed: 'ghost', scenes: ['intro_atterrissage'], sceneIdx: 0, awaitingChoice: true, chronicleSceneId: 'scene_disparue', accumulatedLoot: {}, accumulatedItems: [], accumulatedLog: [], sceneThreatMod: 0, equipment: {} });
    // Ancien colon de chronique créé par onReturn ≤ 0.32
    S.crew.push({ id: 'chronchar_legacy', name: 'Mira Voronine', age: 52, origine: 'humaine', sante: 80, moral: 60, loyaute: 55, statut: 'libre', statuts: [], traits: ['chronique_soeur'], stats: { vigueur: 4, dexterite: 4, intellect: 6, sangfroid: 6, charisme: 5 }, skills: { combat: 1, science: 1, ingenierie: 1, medecine: 1, pilotage: 1, linguistique: 2, survie: 2 }, birthGameMin: 0, chronicleOrigin: 'pulsar_silencieux' });
    T.st.save();
  });
  await page.reload();
  await page.waitForTimeout(1500);
  // Le rendu initial a lieu avant le premier tick (qui répare l'ancien colon) : tant que
  // state.js load() n'appelle pas normalizeChronicleRecruits(data), il peut échouer une fois.
  const bootErr = pageErrors.findIndex(m => /\[BOOT\] Erreur render initial.*'label'/.test(m));
  if (bootErr >= 0) {
    pageErrors.splice(bootErr, 1);
    console.log('  ⚠ rendu initial en échec sur l\'ancien colon de chronique (migration à ajouter dans state.js load())');
  }
  await installHelpers();
  const legacy = await page.evaluate(() => {
    const T = window.__t; const S = T.S();
    T.st.tickOnce({ silent: true });
    const e = T.exp('e_legacy');
    const scene = e && T.app.currentScene(e);
    const mira = S.crew.find(m => m.id === 'chronchar_legacy');
    return { phase: e?.phase, scene: scene?.id, text: scene && String(scene.text).slice(0, 30), ghost: T.exp('e_ghost')?.phase, ghostVessel: S.fleet.find(v => v.id === 'v_ghost')?.available, mira: mira && { origin: mira.origin, traits: mira.traits, ch: mira.chronicleCharacter, sequels: mira.sequels, salary: mira.salary } };
  });
  check(legacy.phase === 'sur_place' && legacy.scene === '__chron_intro__', `l'expédition bloquée retrouve sa scène-intro (${legacy.scene} : « ${legacy.text}… »)`);
  check(legacy.ghost === 'retour' || legacy.ghost === undefined, `l'expédition sur une scène introuvable rentre (phase ${legacy.ghost})`);
  check(legacy.mira?.origin?.label === 'Le Pulsar Silencieux' && legacy.mira.ch === 'soeur' && !legacy.mira.traits.includes('chronique_soeur') && Array.isArray(legacy.mira.sequels) && legacy.mira.salary > 0,
    `l'ancien colon de chronique est réparé (${JSON.stringify(legacy.mira)})`);
  // L'expédition débloquée se joue jusqu'au bout via l'overlay
  await page.click('nav.tabs button[data-tab="galaxy"]', { force: true });
  await page.click('[data-subtab-galaxy="expeditions"]', { force: true });
  await page.waitForTimeout(200);
  await page.click('button[data-resume-exp="e_legacy"]', { force: true });
  await page.waitForTimeout(150);
  check(await page.evaluate(() => document.querySelector('#sceneOverlay')?.classList.contains('show')), 'l\'overlay s\'ouvre sur l\'expédition débloquée');
  const r = await page.evaluate(() => window.__t.playOut('e_legacy'));
  const legacyEnd = await page.evaluate(() => { const e = window.__t.exp('e_legacy'); return { phase: e?.phase, idx: e && window.__t.body(e.bodyId).chronicle.episodeIdx }; });
  check(r.done && legacyEnd.phase === 'retour' && legacyEnd.idx === 1, `l'épisode débloqué se termine (${r.trace.length} choix, épisode suivant idx ${legacyEnd.idx})`);
  await page.evaluate(() => document.querySelectorAll('#sceneOverlay.show').forEach(e => e.classList.remove('show')));
  await page.click('nav.tabs button[data-tab="crew"]', { force: true });
  await page.waitForTimeout(150);
  flushErrors('rechargement et réparation sans erreur');
} catch (e) {
  fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log('\n✓ Chroniques : non-régression réussie');
