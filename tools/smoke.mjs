#!/usr/bin/env node
/* global document */  // utilisé dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/smoke.mjs — test de fumée du jeu dans Chromium (Playwright).
// Usage : node tools/smoke.mjs [--days N]
// Démarre un petit serveur statique, charge le jeu, parcourt tous les onglets,
// simule N jours sur une colonie complète, puis recharge la page.
// Échoue (code 1) à la moindre erreur JavaScript ou valeur NaN dans l'état.
//
// Playwright n'est pas une dépendance du projet : on le cherche via
// NODE_PATH (installation globale) ou node_modules.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || (args.includes('--days') ? 10 : 10);

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright introuvable. Installe-le (npm i --no-save playwright && npx playwright install chromium) ou définis NODE_PATH.');
  process.exit(2);
}

// ---- Serveur statique ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
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
page.on('dialog', d => { pageErrors.push('dialog inattendu : ' + d.message()); d.dismiss(); });
const flushErrors = label => {
  const uniq = [...new Set(pageErrors.splice(0))];
  if (uniq.length) fail(`${label} : ${uniq.length} erreur(s) — ${uniq.slice(0, 5).join(' | ')}`);
  else ok(label);
};

async function clickAllTabs() {
  for (const t of ['base', 'equipage', 'expeditions', 'recits', 'labo']) {
    await page.click(`nav.tabs button[data-tab="${t}"]`, { force: true });
    await page.waitForTimeout(150);
    const subs = await page.$$(`#view-${t} [data-subtab]`);
    for (const s of subs) {
      if (await s.isDisabled()) continue;
      await s.click({ force: true });
      await page.waitForTimeout(150);
    }
  }
}

// Les incidents et événements « en direct » attendent une décision du joueur
// (file persistée, une fenêtre à la fois) : on les résout via l'interface.
async function resolveDecisions(max = 40) {
  let choices = 0;
  for (let i = 0; i < max; i++) {
    const did = await page.evaluate(() => {
      const bg = document.querySelector('#modalBg');
      if (!bg?.classList.contains('show')) return 'none';
      const cont = document.querySelector('#consContinue');
      if (cont) { cont.click(); return 'continue'; }
      const btn = document.querySelector('#modal button.incident-choice:not([disabled])');
      if (btn) { btn.click(); return 'choice'; }
      bg.classList.remove('show');   // autre fenêtre (résumé, alerte…) : on la ferme
      return 'closed';
    });
    if (did === 'none') {
      const pending = await page.evaluate(async () => (await import('./src/state.js')).S.pendingDecisions?.length || 0);
      if (!pending) break;
      await page.waitForTimeout(400);   // pumpDecisions affiche la suivante au prochain tick
      continue;
    }
    if (did === 'choice') choices++;
    await page.waitForTimeout(50);
  }
  return choices;
}

try {
  console.log('1. Démarrage d\'une partie neuve');
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  flushErrors('démarrage sans erreur');

  console.log('2. Parcours de tous les onglets');
  await clickAllTabs();
  flushErrors('onglets sans erreur');

  console.log(`3. Simulation de ${DAYS} jours sur une colonie complète`);
  const sim = await page.evaluate(async (DAYS) => {
    const st = await import('./src/state.js');
    const cat = await import('./src/catalog.js');
    const app = await import('./src/app.js');
    const ui = await import('./src/ui.js');
    const S = st.S;
    for (const [id, d] of Object.entries(cat.MODULES)) S.modules[id] = { level: d.maxLevel || 1 };
    for (const id of Object.keys(cat.TECH_TREE)) S.techCompleted[id] = { at: 0 };
    S.flags.recrutement = true;
    for (let i = 0; i < 20; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
    for (const type of Object.keys(cat.VESSELS)) S.fleet.push({ id: 'v_smoke_' + type, type, name: 'Smoke ' + type, available: true });
    // Exerce l'infirmerie : séquelles et statuts
    const seqKeys = Object.keys(app.SEQUELS || {});
    const statKeys = Object.keys(app.STATUTS || {});
    S.crew.slice(0, 3).forEach((m, i) => {
      if (seqKeys.length) m.sequels.push({ key: seqKeys[i % seqKeys.length], since: 0 });
      if (statKeys.length) m.statuts.push({ key: statKeys[i % statKeys.length], since: S.meta.gameMin, revealed: true, diagnosed: true });
    });
    const errs = {};
    const nan = new Set();
    const scan = (o, p, d) => {
      if (d > 9 || o === null) return;
      if (typeof o === 'number') { if (!Number.isFinite(o)) nan.add(p.replace(/\[\d+\]/g, '[]')); return; }
      if (typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach((v, i) => scan(v, p + '[' + i + ']', d + 1)); return; }
      for (const k in o) scan(o[k], p + '.' + k, d + 1);
    };
    const t0 = performance.now();
    for (let i = 0; i < DAYS * 1440; i++) {
      try { st.tickOnce({ silent: false }); } catch (e) { const k = 'tick: ' + e.message; errs[k] = (errs[k] || 0) + 1; }
      if (i % 120 === 0) { try { ui.render(); } catch (e) { const k = 'render: ' + e.message; errs[k] = (errs[k] || 0) + 1; } }
      if (i % 1440 === 0) {
        scan(S, 'S', 0);
        for (const k of Object.keys(S.res)) S.res[k] = Math.max(S.res[k], st.capOf(k) * 0.5);
      }
    }
    const simMs = performance.now() - t0;
    for (let i = 0; i < 1440; i++) {
      try { st.tickOnce({ silent: true }); } catch (e) { const k = 'silent tick: ' + e.message; errs[k] = (errs[k] || 0) + 1; }
    }
    try { ui.render(); } catch (e) { errs['render final: ' + e.message] = 1; }
    scan(S, 'S', 0);
    st.save();
    return { errs, nan: [...nan], msPerTick: simMs / (DAYS * 1440), alive: S.crew.filter(m => m.statut !== 'mort').length, gameMin: S.meta.gameMin, colonyName: S.meta.colonyName };
  }, DAYS);
  const simErrs = Object.entries(sim.errs);
  if (simErrs.length) fail(`erreurs pendant la simulation : ${simErrs.slice(0, 5).map(([k, n]) => `${k} (×${n})`).join(' | ')}`);
  else ok(`simulation sans erreur (${sim.msPerTick.toFixed(3)} ms/tick, ${sim.alive} colons vivants)`);
  if (sim.nan.length) fail(`valeurs non finies dans l'état : ${sim.nan.slice(0, 8).join(', ')}`);
  else ok('aucune valeur NaN/Infinity dans l\'état');
  flushErrors('aucune erreur de page pendant la simulation');

  console.log('4. Décisions en attente, puis onglets après simulation');
  const resolved = await resolveDecisions();
  flushErrors(`décisions en attente résolues par l'interface (${resolved})`);
  await page.evaluate(() => document.querySelectorAll('.modal-bg.show').forEach(e => e.classList.remove('show')));
  await clickAllTabs();
  flushErrors('onglets sans erreur après simulation');

  console.log('5. Rechargement de la page');
  await page.reload();
  await page.waitForTimeout(2000);
  const after = await page.evaluate(async () => { const st = await import('./src/state.js'); return { gameMin: st.S?.meta?.gameMin, crew: st.S?.crew?.length }; });
  if (!(after.gameMin >= sim.gameMin)) fail(`sauvegarde non relue : gameMin ${after.gameMin} < ${sim.gameMin}`);
  else ok(`sauvegarde relue (J${Math.floor(after.gameMin / 1440) + 1}, ${after.crew} colons)`);
  flushErrors('rechargement sans erreur');
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
console.log('\n✓ Test de fumée réussi');
