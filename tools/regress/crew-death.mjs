#!/usr/bin/env node
/* global document, window */
// tools/regress/crew-death.mjs — non-régression : mort d un colon, relations et vieillissement.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/crew-death.mjs
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
  // Mémorise les setInterval du jeu pour couper la boucle de tick une fois démarré :
  // les scénarios manipulent l'état et avancent le temps eux-mêmes.
  await page.addInitScript(() => {
    const orig = window.setInterval;
    window.__intervals = [];
    window.setInterval = (...a) => { const id = orig(...a); window.__intervals.push(id); return id; };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.evaluate(async () => {
    window.__intervals.forEach(id => clearInterval(id));
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

  // M3 — une mort de vieillesse : un seul deuil, une seule ligne de journal, tout est nettoyé
  await scenario('M3 : mort de vieillesse traitée une seule fois', () => {
    const { st, app, fresh, mk } = window.__t;
    const S = fresh();
    S.journal = [];
    const old = mk({ name: 'Ancien Test', skills: { pilotage: 3 } });
    old.birthGameMin = S.meta.gameMin - 120 * 43200;          // 120 ans
    const friend = mk({ name: 'Ami Test', moral: 70 });
    app.assignMember(old.id, 'commandement', 0);
    S.relations[[old.id, friend.id].sort().join('|')] = 90;   // ami proche
    S.training.push({ id: 't_x', memberId: old.id, skill: 'combat', targetLvl: 1, totalMin: 600, doneMin: 0, cost: {}, failChance: 0, instructorId: null });
    S.treatments.push({ id: 'tr_x', memberId: old.id, statusIdx: 0, statutKey: 'infection', doctorId: null, totalMin: 600, doneMin: 0, cost: {} });
    // 1er tirage : la mort ; tirages suivants : deuil « moral » (pas de trauma)
    const orig = Math.random;
    let n = 0;
    Math.random = () => (n++ === 0 ? 0 : 0.9);
    try { app.tickAging(); } finally { Math.random = orig; }
    const deathLines = S.journal.filter(j => j.txt.includes('Ancien Test')).length;
    return {
      dead: old.statut === 'mort',
      oneLine: deathLines === 1,
      griefOnce: friend.moral === 70 - 8 - 15,
      noPost: !app.memberAssignment(old.id),
      noTraining: !S.training.some(t => t.memberId === old.id),
      noTreatment: !S.treatments.some(t => t.memberId === old.id),
      st: !!st
    };
  });

  // M3 — les morts ne tissent plus de liens, leur moral ne bouge plus, ils ne réagissent plus
  await scenario('M3 : relations et moral figés pour les morts', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const dead = mk({ statut: 'mort', moral: 50 });
    const a = mk({ statut: 'expedition' });
    const b = mk({ statut: 'expedition' });
    const kDA = [dead.id, a.id].sort().join('|');
    S.relations[kDA] = 60;
    S.expeditions = [{ id: 'e_t', crewIds: [dead.id, a.id, b.id], phase: 'aller', elapsedMin: 0, oneWayMin: 1e9, awaitingChoice: false }];
    for (let i = 0; i < 100; i++) { app.tickRelations(); app.tickRelationMoraleEffects(); }
    const rel = app.significantRelations(a.id);
    const ok = {
      affinityFrozen: S.relations[kDA] === 60,
      moraleFrozen: dead.moral === 50,
      notListed: !rel.friends.some(f => f.memberId === dead.id),
      livingBond: app.affinityBetween(a.id, b.id) > 0
    };
    S.expeditions = [];
    return ok;
  });
} catch (e) {
  failed++; console.error('  ✗ exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}
if (pageErrors.length) { failed++; console.error('  ✗ erreurs de page : ' + [...new Set(pageErrors)].slice(0, 5).join(' | ')); }
if (failed) { console.error(`\n✗ ${failed} échec(s)`); process.exit(1); }
console.log('\n✓ crew-death : tout est vert');
