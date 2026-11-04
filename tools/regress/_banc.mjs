/* global document */  // utilisé dans les fonctions exécutées par le navigateur (page.evaluate)
// tools/regress/_banc.mjs — banc d'essai commun aux tests de non-régression
// (serveur statique + Chromium via Playwright), même principe que tools/smoke.mjs.
// Usage dans un test :
//   import { banc } from './_banc.mjs';
//   const b = await banc();            // serveur + navigateur
//   const page = await b.page();       // nouvel onglet (contexte partagé)
//   … b.check(cond, 'message') …
//   await b.fin();                      // ferme tout, code de sortie 1 si échec

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SAVE_KEY = 'drift_save_v1';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export async function banc({ timeoutMs = 30000 } = {}) {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright introuvable. Définis NODE_PATH (installation globale) ou installe-le.');
    process.exit(2);
  }
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
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const failures = [];
  const t0 = Date.now();
  const watchdog = setTimeout(() => {
    console.error(`  ✗ délai dépassé (${timeoutMs} ms)`);
    process.exit(1);
  }, timeoutMs + 15000);

  const b = {
    base,
    browser,
    failures,
    async context(opts = {}) {
      return browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true, ...opts });
    },
    // Nouvel onglet ; les erreurs JS de la page sont collectées dans page.errors
    async page(ctx) {
      const c = ctx || (b._ctx ||= await b.context());
      const page = await c.newPage();
      page.errors = [];
      page.on('pageerror', e => page.errors.push(e.message));
      page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/Service Worker|\[PWA\]|Failed to load resource|fonts\.(googleapis|gstatic)/.test(t)) return;
        page.errors.push(t.split('\n')[0]);
      });
      page.on('dialog', d => { page.errors.push('dialog inattendu : ' + d.message()); d.dismiss(); });
      return page;
    },
    check(cond, msg) {
      if (cond) console.log('  ✓ ' + msg);
      else { failures.push(msg); console.error('  ✗ ' + msg); }
      return !!cond;
    },
    noErrors(page, label, allow = null) {
      const errs = [...new Set(page.errors.splice(0))].filter(e => !(allow && allow.test(e)));
      return b.check(errs.length === 0, `${label}${errs.length ? ' — ' + errs.slice(0, 4).join(' | ') : ''}`);
    },
    // Attend qu'une fonction (éventuellement async) évaluée dans la page
    // renvoie une valeur vraie. (page.waitForFunction n'attend pas les
    // promesses : une fonction async y serait « vraie » immédiatement.)
    async until(page, fn, arg, { timeout = 10000, interval = 100 } = {}) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        try { last = await page.evaluate(fn, arg); } catch (e) { last = undefined; }   // navigation en cours…
        if (last) return last;
        await new Promise(r => setTimeout(r, interval));
      }
      throw new Error(`condition non remplie en ${timeout} ms`);
    },
    // Attend que le jeu ait démarré (S chargé) dans la page
    async waitGame(page, timeout = 10000) {
      await b.until(page, async () => {
        const st = await import('./src/state.js');
        return !!st.S?.meta && !!document.querySelector('#gameTime')?.textContent?.startsWith('J');
      }, null, { timeout });
    },
    async fin() {
      clearTimeout(watchdog);
      await browser.close().catch(() => {});
      server.close();
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (failures.length) {
        console.error(`\n✗ ${failures.length} échec(s) (${dt} s)`);
        process.exit(1);
      }
      console.log(`\n✓ Réussi (${dt} s)`);
    }
  };
  return b;
}

// Script d'initialisation : place une sauvegarde brute dans localStorage avant
// le chargement du jeu, une seule fois par onglet (pas aux rechargements).
export function seedSaveScript(raw) {
  return { content: `(() => { try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(raw)}); sessionStorage.setItem('__seeded', '1'); } } catch (e) {} })();` };
}
