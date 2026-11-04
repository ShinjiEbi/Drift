// tools/regress/_ui.mjs — outillage commun des tests de non-régression de l'interface.
// Même principe que tools/smoke.mjs : petit serveur statique + Chromium (Playwright,
// cherché via NODE_PATH ou node_modules). Chaque test sort avec le code 1 en cas d'échec.
/* global document, localStorage, sessionStorage */  // utilisés dans les callbacks exécutés par le navigateur
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    console.error('Playwright introuvable. Installe-le (npm i --no-save playwright) ou définis NODE_PATH.');
    process.exit(2);
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

// Démarre le serveur statique ; renvoie { base, close }
export async function startServer() {
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
  return { base: `http://127.0.0.1:${server.address().port}/index.html`, close: () => server.close() };
}

// Collecte des résultats
export function reporter(title) {
  const failures = [];
  console.log(title);
  return {
    ok: msg => console.log('  ✓ ' + msg),
    fail: msg => { failures.push(msg); console.error('  ✗ ' + msg); },
    check(cond, msg, detail = '') { if (cond) this.ok(msg); else this.fail(msg + (detail ? ' — ' + detail : '')); },
    done() {
      if (failures.length) { console.error(`\n✗ ${failures.length} échec(s)`); process.exit(1); }
      console.log('\n✓ Réussi');
    },
  };
}

// Ouvre une page de jeu neuve (localStorage vidé) ; capture les erreurs JS
export async function openGame(browser, base, { width = 390, height = 844, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__keep')) { localStorage.clear(); sessionStorage.setItem('__keep', '1'); } } catch { /* rien */ } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Service Worker|\[PWA\]|Failed to load resource|fonts\.(googleapis|gstatic)/.test(t)) return;
    page.errors.push(t.split('\n')[0]);
  });
  page.on('dialog', d => d.accept());
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'), null, { timeout: 10000 });
  return page;
}

// Remplit une colonie complète (même mise en place que l'étape 3 de tools/smoke.mjs)
export async function fillColony(page) {
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const cat = await import('./src/catalog.js');
    const S = st.S;
    for (const [id, d] of Object.entries(cat.MODULES)) S.modules[id] = { level: d.maxLevel || 1 };
    for (const id of Object.keys(cat.TECH_TREE)) S.techCompleted[id] = { at: 0 };
    S.flags.recrutement = true;
    for (let i = 0; i < 12; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
    for (let i = 0; i < 3; i++) S.candidates.push(st.genCandidate());
    for (const type of Object.keys(cat.VESSELS)) S.fleet.push({ id: 'v_t_' + type, type, name: 'Test ' + type, available: true });
    for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k) * 0.8;
  });
}
