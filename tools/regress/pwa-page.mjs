#!/usr/bin/env node
/* global document, window, location, localStorage */  // callbacks exécutés dans le navigateur
// tools/regress/pwa-page.mjs — sécurité et intégration PWA de la page (E5, F9, ?tab=).
// Usage : node tools/regress/pwa-page.mjs   (Playwright via NODE_PATH, comme smoke.mjs)
//
// Vérifie :
//   • index.html : CSP présente, aucun <script> inline, aucune ressource externe ;
//   • en jouant (onglets, sous-onglets, modales, export de sauvegarde) :
//     aucune violation CSP, aucune requête vers un autre domaine (Google Fonts…) ;
//   • polices Newsreader et JetBrains Mono chargées depuis ./fonts/ ;
//   • une injection HTML (<img onerror>, <script>, image distante) rendue SANS
//     échappement n'exécute rien grâce à la CSP ;
//   • ?tab=crew ouvre l'onglet et nettoie l'URL ; un ?tab= malveillant ne lève rien ;
//   • manifeste : id/start_url/scope cohérents, toutes les icônes servies.

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

// ---------- Vérifications statiques ----------
console.log('1. index.html');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)?.[1] || '';
const directives = Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v]));
check(directives['script-src']?.join(' ') === "'self'", "CSP script-src 'self'", csp || 'CSP absente');
check(directives['object-src']?.join(' ') === "'none'" && directives['base-uri']?.join(' ') === "'self'", "CSP object-src 'none' et base-uri 'self'");
check(!/unsafe-eval/.test(csp) && !/'unsafe-inline'/.test(directives['script-src']?.join(' ') || ''), 'ni unsafe-eval ni unsafe-inline pour les scripts');
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1]) || m[2].trim());
check(!inlineScripts.length, 'aucun <script> inline', inlineScripts.map(m => m[0].slice(0, 60)).join(' | '));
check(!/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, '')), 'aucun attribut on…= dans le HTML');
const external = [...html.matchAll(/\b(?:href|src)\s*=\s*["'](https?:)?\/\/[^"']+/gi)].map(m => m[0]);
check(!external.length, 'aucune ressource externe dans index.html', external.join(', '));

// ---------- Serveur ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
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
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const BASE = `${ORIGIN}/index.html`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
// Enregistre les violations CSP (les scripts d'init passent outre la CSP).
await ctx.addInitScript(() => {
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', e => {
    window.__violations.push({ dir: e.effectiveDirective, uri: e.blockedURI, sample: e.sample, expected: !!window.__expectViolation });
  });
});
const page = await ctx.newPage();
const pageErrors = [];
const foreignRequests = [];
const cspConsole = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) cspConsole.push(t.split('\n')[0]);
  if (m.type() === 'error' && !/Failed to load resource|Content Security Policy|Refused to/i.test(t)) pageErrors.push(t.split('\n')[0]);
});
page.on('request', r => { if (!r.url().startsWith(ORIGIN) && !/^(data|blob):/.test(r.url())) foreignRequests.push(r.url()); });
const foreignResponses = [];
page.on('response', r => { if (!r.url().startsWith(ORIGIN) && !/^(data|blob):/.test(r.url())) foreignResponses.push(r.url()); });
page.on('dialog', d => { pageErrors.push('dialog : ' + d.message()); d.dismiss(); });
const flushErrors = label => {
  const uniq = [...new Set(pageErrors.splice(0))];
  check(!uniq.length, label, uniq.slice(0, 4).join(' | '));
};
const unexpectedViolations = () => page.evaluate(() => window.__violations.filter(v => !v.expected));
const waitGame = () => page.waitForFunction(() => /J\d/.test(document.querySelector('#gameTime')?.textContent || ''), null, { timeout: 15000 });
const activeTab = () => page.evaluate(() => document.querySelector('nav.tabs button.active')?.dataset.tab);

try {
  console.log('2. Paramètre ?tab=');
  await page.goto(BASE + '?tab=crew');
  await waitGame();
  await page.waitForTimeout(900);
  check(await activeTab() === 'crew', '?tab=crew ouvre l\'onglet Équipage');
  check(!(await page.evaluate(() => location.search)), 'paramètre retiré de l\'URL');
  // L'interface mémorise l'onglet ouvert (localStorage « drift_ui_nav ») et le restaure au
  // rechargement : on l'oublie pour vérifier que les ?tab= suivants ne changent rien.
  await page.evaluate(() => { try { localStorage.removeItem('drift_ui_nav'); } catch { /* rien */ } });
  for (const evil of ['"]', 'crew"],img[src=x', "x') ; alert(1)//", '<img src=x onerror=alert(1)>']) {
    await page.goto(BASE + '?tab=' + encodeURIComponent(evil));
    await waitGame();
    await page.waitForTimeout(800);
  }
  check(await activeTab() === 'overview', 'un ?tab= inconnu ou malveillant est ignoré');
  flushErrors('aucune erreur avec des ?tab= malveillants');

  console.log('3. Partie : onglets, modales, export');
  for (const t of ['overview', 'modules', 'crew', 'galaxy', 'stocks', 'arcs', 'journal']) {
    await page.click(`nav.tabs button[data-tab="${t}"]`, { force: true });
    await page.waitForTimeout(120);
    const subs = await page.$$(`#view-${t} [data-subtab], #view-${t} [data-subtab-mod], #view-${t} [data-subtab-galaxy], #view-${t} [data-subtab-stocks]`);
    for (const s of subs) {
      if (await s.isDisabled()) continue;
      await s.click({ force: true });
      await page.waitForTimeout(120);
    }
  }
  // Modales : renommer (avec saisie), recommencer (annulé)
  await page.$eval('#btnRename', b => b.click());
  await page.waitForSelector('#modalInput', { timeout: 5000 });
  await page.fill('#modalInput', 'Colonie CSP');
  await page.click('#modalOk');
  await page.$eval('#btnReset', b => b.click());
  await page.waitForSelector('#modalCancel', { timeout: 5000 });
  await page.click('#modalCancel');
  // Export de la sauvegarde (téléchargement via blob:)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.$eval('#btnExport', b => b.click())]);
  const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  check(saved?.meta?.colonyName === 'Colonie CSP', 'export de sauvegarde téléchargé (blob:)');
  // Laisse tourner le jeu quelques secondes (ticks, rendus)
  await page.waitForTimeout(2500);
  const v = await unexpectedViolations();
  check(!v.length && !cspConsole.length, 'aucune violation CSP en jouant', JSON.stringify(v.slice(0, 3)) + cspConsole.slice(0, 3).join(' | '));
  flushErrors('aucune erreur en jouant');

  console.log('4. Polices locales');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, ''));
  });
  check(fonts.includes('Newsreader') && fonts.includes('JetBrains Mono'), 'Newsreader et JetBrains Mono chargées', fonts.join(', ') || 'aucune');
  const fontSrc = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\.woff2/.test(e.name)).map(e => e.name));
  check(fontSrc.length > 0 && fontSrc.every(u => u.includes('/fonts/')), 'polices servies depuis ./fonts/', fontSrc.join(', '));

  console.log('5. Injection HTML non échappée bloquée par la CSP');
  await page.evaluate(() => {
    window.__expectViolation = true;
    const box = document.createElement('div');
    box.innerHTML = '<img src="x" onerror="window.__xss=1"><img src="https://evil.example/p.png"><a href="javascript:window.__xss=3">a</a>';
    document.body.appendChild(box);
    box.querySelector('a').click();
    // Même chemin que le jeu : un nom de colon rendu par l'interface
    return import('./src/state.js').then(st => {
      const m = st.S.crew[0] || st.S.candidates[0];
      if (m) m.name = '<img src=x onerror="window.__xss=2">';
      st.S.meta.colonyName = '<img src=x onerror="window.__xss=2">';
      return import('./src/ui.js').then(ui => ui.render());
    });
  });
  await page.waitForTimeout(800);
  const xss = await page.evaluate(() => { window.__expectViolation = false; return window.__xss; });
  check(xss === undefined, 'aucun gestionnaire injecté exécuté', 'window.__xss = ' + xss);
  const expected = await page.evaluate(() => window.__violations.filter(v => v.expected));
  check(expected.some(v => v.dir === 'img-src' && v.uri.includes('evil.example')) && !foreignResponses.length, 'image distante injectée bloquée (img-src)');
  check(expected.some(v => /^script-src/.test(v.dir)), 'la CSP a signalé le script injecté', expected.map(v => v.dir).join(', '));

  console.log('6. Manifeste et icônes');
  const man = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const m = await fetch(href).then(r => r.json());
    const icons = await Promise.all(m.icons.map(i => fetch(new URL(i.src, href)).then(r => r.status)));
    const headIcons = await Promise.all([...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(l => fetch(l.href).then(r => r.status)));
    return { m, href, icons, headIcons };
  });
  check(man.icons.every(s => s === 200) && man.headIcons.every(s => s === 200), `icônes du manifeste et du <head> servies (${man.icons.length + man.headIcons.length})`);
  check(man.m.scope === './' && man.m.start_url === './index.html', 'scope et start_url relatifs');
  check(typeof man.m.id === 'string' && man.m.id.startsWith('/') && man.m.id.endsWith('/index.html'), 'id absolu (ne collisionne pas avec d\'autres apps de l\'origine)', man.m.id);
  check(man.m.icons.some(i => i.purpose === 'maskable'), 'icône maskable déclarée');

  console.log('7. Requêtes tierces');
  check(!foreignRequests.filter(u => !u.includes('evil.example')).length && !foreignResponses.length, 'aucune requête vers un autre domaine (RGPD)', foreignRequests.slice(0, 3).join(', '));
  flushErrors('aucune erreur JavaScript');
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
console.log('\n✓ Page PWA OK (CSP, polices, ?tab=, manifeste)');
