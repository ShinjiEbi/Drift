#!/usr/bin/env node
/* global document, window, navigator, ServiceWorkerRegistration */  // callbacks exécutés dans le navigateur
// tools/regress/notifications.mjs — notifications système (src/notifications.js).
// Usage : node tools/regress/notifications.mjs   (Playwright via NODE_PATH, comme smoke.mjs)
//
// L'API Notification est remplacée par une fausse qui enregistre les appels.
// Vérifie :
//   • anti-rafale : une notification critique (ou plus importante que la
//     précédente) passe même juste après une autre ; les moins importantes
//     sont regroupées ; chaque critique a son propre tag ;
//   • rien quand l'app est visible ou pour une notification « info » ;
//   • avec un service worker actif : registration.showNotification ;
//   • enregistrement du SW en échec, ou SW bloqué en installation
//     (navigator.serviceWorker.ready ne se résout jamais) : repli sur
//     new Notification() en quelques secondes.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright introuvable. Définis NODE_PATH (installation globale) ou installe-le.');
  process.exit(2);
}

const failures = [];
const fail = msg => { failures.push(msg); console.error('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);
const check = (cond, msg, detail = '') => (cond ? ok(msg) : fail(msg + (detail ? ' — ' + detail : '')));

// swMode : 'normal' (sw.js réel), '404' (enregistrement en échec), 'stuck' (installation sans fin)
let swMode = 'normal';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/sw.js' && swMode === '404') { res.writeHead(404).end(); return; }
  if (url.pathname === '/sw.js' && swMode === 'stuck') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end("self.addEventListener('install', e => e.waitUntil(new Promise(() => {})));");
    return;
  }
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

const browser = await chromium.launch();
const pageErrors = [];

async function openGame() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  await ctx.addInitScript(() => {
    window.__notifs = [];
    class FakeNotification {
      constructor(title, opts = {}) { window.__notifs.push({ via: 'constructor', title, tag: opts.tag, body: opts.body }); }
      close() {}
      static get permission() { return 'granted'; }
      static requestPermission() { return Promise.resolve('granted'); }
    }
    window.Notification = FakeNotification;
    if (window.ServiceWorkerRegistration) {
      ServiceWorkerRegistration.prototype.showNotification = function (title, opts = {}) {
        window.__notifs.push({ via: 'sw', title, tag: opts.tag, body: opts.body });
        return Promise.resolve();
      };
    }
    // Permet de simuler l'app en arrière-plan
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__visibility || 'visible' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|service ?worker|bad HTTP response code|\[PWA\]/i.test(m.text())) pageErrors.push(m.text().split('\n')[0]);
  });
  await page.goto(BASE);
  await page.waitForFunction(() => /J\d/.test(document.querySelector('#gameTime')?.textContent || ''), null, { timeout: 15000 });
  await page.evaluate(() => import('./src/state.js').then(st => { st.S.flags.pushNotifications = true; }));
  return { ctx, page };
}
// Envoie une séquence de notifications « en arrière-plan », attend, renvoie ce qui a été affiché.
const send = (page, calls, waitMs = 300) => page.evaluate(async ({ calls, waitMs }) => {
  const { notif } = await import('./src/notifications.js');
  window.__notifs.length = 0;
  window.__visibility = 'hidden';
  for (const [fn, ...args] of calls) notif[fn](...args);
  await new Promise(r => setTimeout(r, waitMs));
  window.__visibility = 'visible';
  return window.__notifs.slice();
}, { calls, waitMs });

try {
  console.log('1. Service worker actif');
  let { ctx, page } = await openGame();
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!r?.active), null, { timeout: 15000 });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 15000 }).catch(() => {});
  let shown = await send(page, [
    ['arcProgress', 'Arc', 'étape'],          // success → passe
    ['colonyEvent', 'Tempête'],               // warn, plus important → passe
    ['trainingDone', 'Ana', 'médecine'],      // success, moins important → regroupé (ignoré)
    ['death', 'Bob', 'asphyxie'],             // critique → passe
    ['incident', 'Brèche']                    // critique → passe aussi
  ]);
  check(shown.every(n => n.via === 'sw'), 'notifications envoyées par le service worker', JSON.stringify(shown.map(n => n.via)));
  const bodies = shown.map(n => n.body.split('\n')[0]);
  check(bodies.length === 4 && bodies.includes('Bob est mort') && bodies.includes('Incident en attente') && !bodies.some(b => /Formation/.test(b)),
    'anti-rafale : critiques et plus importantes passent, les autres sont regroupées', JSON.stringify(bodies));
  const critTags = shown.filter(n => /mort|Incident/.test(n.body)).map(n => n.tag);
  check(new Set(critTags).size === 2 && critTags.every(t => /critical/.test(t)), 'chaque notification critique a son propre tag', critTags.join(', '));
  shown = await page.evaluate(async () => {
    const { notif } = await import('./src/notifications.js');
    window.__notifs.length = 0;
    window.__visibility = 'visible';
    notif.death('Visible', 'x');
    window.__visibility = 'hidden';
    notif.buildDone('Mine', 2); // info
    await new Promise(r => setTimeout(r, 300));
    window.__visibility = 'visible';
    return window.__notifs.slice();
  });
  check(!shown.length, 'rien si l\'app est visible ni pour une info', JSON.stringify(shown));
  await ctx.close();

  console.log('2. Enregistrement du service worker en échec');
  swMode = '404';
  ({ ctx, page } = await openGame());
  await page.waitForTimeout(500);
  shown = await send(page, [['death', 'Carl', 'chute']], 500);
  check(shown.length === 1 && shown[0].via === 'constructor', 'repli immédiat sur new Notification()', JSON.stringify(shown));
  await ctx.close();

  console.log('3. Service worker bloqué en installation (ready ne se résout jamais)');
  swMode = 'stuck';
  ({ ctx, page } = await openGame());
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!r?.installing), null, { timeout: 10000 }).catch(() => {});
  const t0 = Date.now();
  shown = await send(page, [['death', 'Dina', 'froid']], 4000);
  check(shown.length === 1 && shown[0].via === 'constructor', `repli sur new Notification() après délai (${Date.now() - t0} ms)`, JSON.stringify(shown));
  await ctx.close();

  const uniq = [...new Set(pageErrors)];
  check(!uniq.length, 'aucune erreur JavaScript', uniq.slice(0, 4).join(' | '));
} catch (e) {
  fail('exception du test : ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log('\n✓ Notifications OK');
