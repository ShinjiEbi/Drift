#!/usr/bin/env node
/* global document, window */
// tools/regress/medical.mjs — non-régression de l'infirmerie (statuts, diagnostics, traitements).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/medical.mjs
// Chaque scénario repart d'un état neuf (freshState) et s'exécute dans la page.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright introuvable (définis NODE_PATH).'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
let failed = 0;

// Prépare dans la page un utilitaire window.__t : état neuf + fabrique de colons.
async function prepare() {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    window.__t = {
      st, app,
      fresh() {
        st.setS(st.freshState());
        const S = st.S;
        S.nextEventMin = 1e12;      // pas d'événement de colonie parasite
        S.autoAssign = false;
        S.res = { metal: 500, cristal: 500, energie: 500, biomasse: 500, datacubes: 200 };
        return S;
      },
      mk(over = {}) {
        const c = st.genCandidate();
        const m = { ...c, id: 'm_test_' + st.S.crew.length, age: 30, traits: [], birthGameMin: st.S.meta.gameMin - 30 * 43200,
          statut: 'libre', sante: 100, moral: 70, loyaute: 60, statuts: [], sequels: [], ...over };
        m.skills = { ...c.skills, ...(over.skills || {}) };
        st.S.crew.push(m);
        return m;
      },
      ticks(n) { for (let i = 0; i < n; i++) st.tickOnce({ silent: true }); }
    };
  });
}

async function scenario(name, fn) {
  try {
    const r = await page.evaluate(fn);
    const bad = Object.entries(r).filter(([, v]) => v !== true);
    if (bad.length) { failed++; console.error(`  ✗ ${name} : ${bad.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`); }
    else console.log(`  ✓ ${name}`);
  } catch (e) { failed++; console.error(`  ✗ ${name} : exception ${e.message.split('\n')[0]}`); }
}

try {
  await prepare();

  // C4 — un traitement reste attaché à son statut quand un autre statut du colon disparaît
  await scenario('C4 : traitement recalé après auto-guérison d\'un autre statut', () => {
    const { st, app, fresh, mk, ticks } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 3 };
    mk({ skills: { medecine: 3 } });                       // médecin libre
    const pat = mk({ statut: 'infirmerie' });
    const now = S.meta.gameMin;
    pat.statuts = [
      { key: 'blessure_legere', since: now - (48 * 60 - 2), revealed: true, diagnosed: true, statMod: {} },
      { key: 'infection', since: now - (72 * 60 - 30), revealed: true, diagnosed: true, statMod: {} }
    ];
    app.startTreatment(pat.id, 1);
    const started = S.treatments.length === 1 && S.treatments[0].statutKey === 'infection';
    ticks(10);   // la blessure légère guérit seule → l'infection passe à l'index 0
    const shifted = pat.statuts.length === 1 && pat.statuts[0].key === 'infection'
      && S.treatments.length === 1 && S.treatments[0].statusIdx === 0;
    ticks(60);   // dépasse le délai de 72 h : le patient en traitement ne doit pas mourir
    const alive = pat.statut !== 'mort';
    ticks(8 * 60);
    return { started, shifted, alive, cured: pat.statuts.length === 0 && pat.statut !== 'mort', noLeftover: S.treatments.length === 0, st: !!st };
  });

  // C4 — une sauvegarde dont le traitement pointe sur le mauvais index est réparée
  await scenario('C4 : réparation d\'un traitement désindexé (sauvegarde 0.32)', () => {
    const { st, app, fresh, mk, ticks } = window.__t;
    fresh();
    const S = st.S;
    S.modules.infirmerie = { level: 3 };
    mk({ skills: { medecine: 3 } });
    const pat = mk({ statut: 'infirmerie' });
    pat.statuts = [{ key: 'infection', since: S.meta.gameMin - 60, revealed: true, diagnosed: true, statMod: {} }];
    S.treatments = [
      { id: 'tr_old', memberId: pat.id, statusIdx: 1, statutKey: 'infection', doctorId: null, totalMin: 600, doneMin: 0, cost: {} },
      { id: 'tr_ghost', memberId: 'm_disparu', statusIdx: 0, statutKey: 'infection', doctorId: null, totalMin: 600, doneMin: 0, cost: {} }
    ];
    st.setS({ ...S });          // simule un chargement (nouvel objet d'état)
    ticks(1);
    const S2 = st.S;
    return {
      fixedIdx: S2.treatments.length === 1 && S2.treatments[0].statusIdx === 0,
      canTreatSays: app.canTreat(pat.id, 0).reason === 'Traitement déjà en cours'
    };
  });
} catch (e) {
  failed++; console.error('  ✗ exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}
if (pageErrors.length) { failed++; console.error('  ✗ erreurs de page : ' + [...new Set(pageErrors)].slice(0, 5).join(' | ')); }
if (failed) { console.error(`\n✗ ${failed} échec(s)`); process.exit(1); }
console.log('\n✓ medical : tout est vert');
