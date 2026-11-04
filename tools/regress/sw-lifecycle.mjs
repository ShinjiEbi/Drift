#!/usr/bin/env node
/* global document, window, navigator, caches */  // callbacks exécutés dans le navigateur
// tools/regress/sw-lifecycle.mjs — cycle de vie du service worker (E4, M19, F17).
// Usage : node tools/regress/sw-lifecycle.mjs [--screenshot bandeau.png]
//         (Playwright via NODE_PATH, comme smoke.mjs)
//
// Sert une COPIE du jeu (dossier temporaire) comme GitHub Pages
// (Cache-Control: max-age=600), avec injection d'échecs réseau, et vérifie :
//   1. première visite : un seul chargement, SW installé, cache complet ;
//   2. hors-ligne après installation : le jeu démarre, polices comprises ;
//   3. release N+1 : bandeau « Nouvelle version », pas de rechargement forcé ;
//      clic → nouvelle version servie EN ENTIER (malgré le cache HTTP qui
//      contient encore l'ancien constants.js), sauvegarde conservée ;
//   4. fichier modifié sans `sw:write` : la page reste cohérente (pas de mélange) ;
//   5. release N+2 avec un fichier en échec pendant l'installation : l'ancienne
//      version reste en service, complète, et fonctionne hors-ligne ; une
//      nouvelle tentative réussit ensuite ;
//   6. migration depuis le SW ≤ 0.32 (si l'historique git est disponible) ;
//   7. un cache d'un autre projet de l'origine n'est pas supprimé (F17).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY_REV = 'd5f1687'; // dernière version avec l'ancien sw.js (0.32.0)
const APP_FILES = ['index.html', 'sw.js', 'styles.css', 'manifest.json', 'favicon.ico', 'src', 'icons', 'fonts'];

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

// ---------- Copie du jeu servie ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-sw-'));
const SITE = path.join(TMP, 'site');
function copySite(fromDir) {
  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(SITE, { recursive: true });
  for (const f of APP_FILES) {
    const src = path.join(fromDir, f);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(SITE, f), { recursive: true });
  }
}
const swWrite = () => execFileSync(process.execPath, [path.join(ROOT, 'tools/sw-version.mjs'), '--write', '--root', SITE], { stdio: 'pipe' });
const siteFile = rel => fs.readFileSync(path.join(SITE, rel), 'utf8');
const editSite = (rel, fn) => fs.writeFileSync(path.join(SITE, rel), fn(siteFile(rel)));
const setVersion = v => editSite('src/constants.js', s => s.replace(/export const VERSION = '[^']*'/, `export const VERSION = '${v}'`));
const swInfo = () => {
  const sw = siteFile('sw.js');
  const ver = /APP_VERSION = '([^']*)'/.exec(sw)[1];
  const hash = /CONTENT_HASH = '([^']*)'/.exec(sw)[1];
  const urls = [...sw.matchAll(/^\s*'\.\/([^']+)',?$/gm)].map(m => m[1]);
  return { cache: `drift-${ver}-${hash}`, urls };
};

// ---------- Serveur « GitHub Pages » ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const net = { offline: false, fail: new Set(), log: [] };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // Toute l'app vit sous /Drift/ comme sur shinjiebi.github.io/Drift/
  if (!url.pathname.startsWith('/Drift/')) { res.writeHead(404).end(); return; }
  const rel = decodeURIComponent(url.pathname.slice('/Drift/'.length)) || 'index.html';
  net.log.push(rel);
  if (net.offline) { req.socket.destroy(); return; }
  if (net.fail.has(rel)) { res.writeHead(503, { 'Cache-Control': 'no-store' }).end('panne simulée'); return; }
  const p = path.join(SITE, rel);
  if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  res.end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const BASE = `${ORIGIN}/Drift/`;

// ---------- Helpers navigateur ----------
const browser = await chromium.launch();
let pageErrors = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.loads = 0;
  page.on('load', () => { page.loads++; });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|fonts\.(googleapis|gstatic)|service ?worker|ERR_INTERNET_DISCONNECTED|panne simulée/i.test(t)) return;
    pageErrors.push(t.split('\n')[0]);
  });
  page.on('dialog', d => d.dismiss());
  return page;
}
function flushErrors(label) {
  const uniq = [...new Set(pageErrors.splice(0))];
  check(!uniq.length, label, uniq.slice(0, 4).join(' | '));
}
const waitGame = page => page.waitForFunction(() => /J\d/.test(document.querySelector('#gameTime')?.textContent || ''), null, { timeout: 15000 });
const waitControlled = page => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const pageVersion = page => page.evaluate(() => import('./src/constants.js').then(m => m.VERSION));
const colonyName = page => page.evaluate(() => import('./src/state.js').then(m => m.S?.meta?.colonyName));
const setColonyName = (page, name) => page.evaluate(n => import('./src/state.js').then(m => { m.S.meta.colonyName = n; m.save(); }), name);
const cacheKeys = page => page.evaluate(() => caches.keys());
const swVersion = page => page.evaluate(() => new Promise((resolve) => {
  const ctl = navigator.serviceWorker.controller;
  if (!ctl) return resolve(null);
  const ch = new MessageChannel();
  ch.port1.onmessage = e => resolve(e.data);
  ctl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  setTimeout(() => resolve(null), 2000);
}));
const regState = page => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { active: !!r?.active, waiting: !!r?.waiting, installing: !!r?.installing };
});
const triggerUpdate = page => page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => true, e => String(e)));
// Contenu texte de chaque fichier du cache DRIFT, à comparer au disque.
const cachedTexts = (page, cacheName, rels) => page.evaluate(async ({ cacheName, rels }) => {
  const c = await caches.open(cacheName);
  const out = {};
  for (const r of rels) { const res = await c.match(new URL(r, document.baseURI).href); out[r] = res ? await res.text() : null; }
  return out;
}, { cacheName, rels });
const TEXT_FILES = () => swInfo().urls.filter(u => /\.(html|js|css|json)$/.test(u));
async function checkCacheMatchesDisk(page, label) {
  const { cache } = swInfo();
  const texts = await cachedTexts(page, cache, TEXT_FILES());
  const bad = Object.entries(texts).filter(([r, t]) => t !== siteFile(r)).map(([r]) => r);
  check(!bad.length, label, 'différents du disque : ' + bad.join(', '));
}
const bannerVisible = page => page.evaluate(() => !!document.getElementById('pwa-update'));

try {
  // ============================================================
  console.log('1. Première visite');
  copySite(ROOT);
  swWrite();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  // Cache d'un autre projet de l'origine shinjiebi.github.io (F17)
  let page = await newPage(ctx);
  await page.goto(BASE + 'index.html');
  await waitGame(page);
  await page.evaluate(() => caches.open('autre-projet-v1').then(c => c.put('/Autre/x.txt', new Response('x'))));
  await waitControlled(page);
  await page.waitForTimeout(2500); // l'ancien SW rechargeait 800 ms après l'activation
  check(page.loads === 1, 'un seul chargement à la première visite', `${page.loads} chargements`);
  const v0 = swInfo();
  let keys = await cacheKeys(page);
  check(keys.includes(v0.cache), `cache ${v0.cache} créé`, keys.join(', '));
  const cachedUrls = await page.evaluate(n => caches.open(n).then(c => c.keys()).then(ks => ks.map(k => k.url)), v0.cache);
  check(cachedUrls.length === v0.urls.length, `cache complet (${cachedUrls.length}/${v0.urls.length} fichiers)`);
  check(!(await bannerVisible(page)), 'pas de bandeau à la première visite');
  await setColonyName(page, 'Regress-N');
  flushErrors('première visite sans erreur');

  // ============================================================
  console.log('2. Hors-ligne après installation');
  net.offline = true;
  await ctx.setOffline(true);
  await page.reload();
  await waitGame(page);
  check(await colonyName(page) === 'Regress-N', 'partie relue hors-ligne');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, ''));
  });
  check(fonts.includes('Newsreader') && fonts.includes('JetBrains Mono'), 'polices locales chargées hors-ligne', fonts.join(', '));
  flushErrors('démarrage hors-ligne sans erreur');
  net.offline = false;
  await ctx.setOffline(false);

  // ============================================================
  console.log('3. Release N+1 : bandeau puis mise à jour complète');
  const oldVersion = await pageVersion(page);
  setVersion('0.0.1-regress-n1');
  editSite('src/app.js', s => s + '\n// regress N+1\n');
  editSite('src/ui.js', s => s + '\n// regress N+1\n');
  swWrite();
  const v1 = swInfo();
  const loadsBefore = page.loads;
  await triggerUpdate(page);
  await page.waitForFunction(() => !!document.getElementById('pwa-update'), null, { timeout: 20000 }).catch(() => {});
  check(await bannerVisible(page), 'bandeau « Nouvelle version disponible » affiché');
  await page.waitForTimeout(1200);
  check(page.loads === loadsBefore, 'pas de rechargement forcé pendant la partie');
  check(await pageVersion(page) === oldVersion, 'la page ouverte continue sur l\'ancienne version');
  check((await regState(page)).waiting, 'nouvelle version en attente (pas de skipWaiting d\'office)');
  // Bandeau au-dessus de la barre d'onglets fixe (mobile)
  const geo = await page.evaluate(() => {
    const b = document.getElementById('pwa-update')?.getBoundingClientRect();
    const n = document.querySelector('nav.tabs')?.getBoundingClientRect();
    return b && n ? { bannerBottom: b.bottom, navTop: n.top, left: b.left, right: b.right, vw: window.innerWidth } : null;
  });
  check(geo && geo.bannerBottom <= geo.navTop && geo.left >= 0 && geo.right <= geo.vw, 'bandeau visible au-dessus de la barre d\'onglets', JSON.stringify(geo));
  const shotArg = process.argv.indexOf('--screenshot');
  if (shotArg > 0) await page.screenshot({ path: process.argv[shotArg + 1] });
  await setColonyName(page, 'Regress-N1');
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#pwa-update button.pwa-reload')]);
  await waitGame(page);
  check(await pageVersion(page) === '0.0.1-regress-n1', 'nouvelle version chargée après le clic');
  keys = await cacheKeys(page);
  check(keys.includes(v1.cache) && !keys.includes(v0.cache), 'ancien cache DRIFT supprimé, nouveau en place', keys.join(', '));
  check(keys.includes('autre-projet-v1'), 'cache d\'un autre projet de l\'origine conservé (F17)');
  await checkCacheMatchesDisk(page, 'tous les fichiers du cache sont ceux de N+1 (cache HTTP contourné)');
  check(await colonyName(page) === 'Regress-N1', 'sauvegarde conservée à travers la mise à jour');
  check(!(await bannerVisible(page)), 'plus de bandeau après la mise à jour');
  check((await swVersion(page))?.cache === v1.cache, 'le SW actif est celui de N+1');
  flushErrors('mise à jour sans erreur');

  // ============================================================
  console.log('4. Fichier modifié sans sw:write : aucune revalidation mélangée');
  const uiN1 = siteFile('src/ui.js');
  editSite('src/ui.js', s => s + '\n// modifié sans sw:write\n');
  await page.reload();
  await waitGame(page);
  await page.waitForTimeout(500);
  await page.reload();
  await waitGame(page);
  const servedUi = await page.evaluate(() => fetch('./src/ui.js').then(r => r.text()));
  check(servedUi === uiN1, 'ui.js servi = version du cache (pas de mélange)');
  flushErrors('rechargements sans erreur');

  // ============================================================
  console.log('5. Release N+2 avec un échec réseau pendant l\'installation');
  setVersion('0.0.2-regress-n2');
  swWrite();
  const v2 = swInfo();
  net.fail.add('src/ui.js');
  net.log.length = 0;
  await triggerUpdate(page);
  let st;
  for (let t0 = Date.now(); Date.now() - t0 < 15000; await page.waitForTimeout(200)) {
    st = await regState(page);
    if (net.log.includes('sw.js') && !st.installing && !st.waiting) break;
  }
  check(net.log.includes('src/ui.js'), 'le nouveau SW a tenté de télécharger ui.js');
  check(st.active && !st.waiting && !st.installing, 'installation N+2 abandonnée', JSON.stringify(st));
  check(!(await bannerVisible(page)), 'pas de bandeau pour une installation ratée');
  keys = await cacheKeys(page);
  check(keys.includes(v1.cache) && !keys.includes(v2.cache), 'cache N+1 intact, pas de cache N+2 partiel', keys.join(', '));
  net.offline = true;
  await ctx.setOffline(true);
  await page.reload();
  await waitGame(page);
  check(await pageVersion(page) === '0.0.1-regress-n1', 'N+1 toujours servie, hors-ligne');
  check(await colonyName(page) === 'Regress-N1', 'partie intacte hors-ligne');
  flushErrors('hors-ligne après échec sans erreur');
  net.offline = false;
  await ctx.setOffline(false);
  net.fail.clear();
  await triggerUpdate(page);
  await page.waitForFunction(() => !!document.getElementById('pwa-update'), null, { timeout: 20000 }).catch(() => {});
  check(await bannerVisible(page), 'nouvelle tentative réussie → bandeau');
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#pwa-update button.pwa-reload')]);
  await waitGame(page);
  check(await pageVersion(page) === '0.0.2-regress-n2', 'N+2 installée après la panne');
  await checkCacheMatchesDisk(page, 'cache N+2 = fichiers du disque');
  flushErrors('N+2 sans erreur');
  await ctx.close();

  // ============================================================
  console.log('6. Migration depuis le service worker ≤ 0.32');
  const LEGACY = path.join(TMP, 'legacy');
  let haveLegacy = true;
  try {
    fs.mkdirSync(LEGACY);
    const tar = execFileSync('git', ['-C', ROOT, 'archive', LEGACY_REV, ...APP_FILES.filter(f => f !== 'fonts')], { maxBuffer: 64 << 20 });
    execFileSync('tar', ['-x', '-C', LEGACY], { input: tar });
  } catch {
    haveLegacy = false;
    console.log(`  (historique git ${LEGACY_REV} indisponible : étape ignorée)`);
  }
  if (haveLegacy) {
    copySite(LEGACY);
    const lctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
    await lctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    page = await newPage(lctx);
    await page.goto(BASE + 'index.html');
    await waitGame(page);
    await waitControlled(page);
    await page.waitForTimeout(1500); // l'ancien SW recharge la page 800 ms après l'activation
    await waitGame(page);
    keys = await cacheKeys(page);
    check(keys.some(k => /^drift-v[\d.]+-cache$/.test(k)), 'ancien SW installé', keys.join(', '));
    await setColonyName(page, 'Regress-legacy');
    pageErrors = [];
    // Publication de la version actuelle par-dessus
    copySite(ROOT);
    swWrite();
    const vNew = swInfo();
    const reloaded = page.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false);
    await triggerUpdate(page);
    check(await reloaded, 'la page de l\'ancienne version recharge d\'elle-même');
    await waitGame(page);
    await page.waitForFunction(v => import('./src/constants.js').then(m => m.VERSION === v), (/VERSION = '([^']*)'/.exec(siteFile('src/constants.js')))[1], { timeout: 10000 }).catch(() => {});
    check((await swVersion(page))?.cache === vNew.cache, 'nouveau SW actif après migration');
    keys = await cacheKeys(page);
    check(keys.length === 1 && keys[0] === vNew.cache, 'ancien cache supprimé', keys.join(', '));
    await checkCacheMatchesDisk(page, 'cache = version actuelle');
    check(await colonyName(page) === 'Regress-legacy', 'sauvegarde conservée à la migration');
    flushErrors('migration sans erreur');
    await lctx.close();
  }
} catch (e) {
  fail('exception du test : ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log('\n✓ Cycle de vie du service worker OK');
