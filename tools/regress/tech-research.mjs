#!/usr/bin/env node
/* global document, window */
// tools/regress/tech-research.mjs — non-régression recherche, formation et effets des technologies.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/tech-research.mjs
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
    window.__YEAR = (await import('./src/constants.js')).YEAR_IN_GAME_MIN;
    window.__t = {
      st, app,
      fresh() {
        st.setS(st.freshState());
        const S = st.S;
        S.crew = []; S.fleet = [];  // V1 : sans l'équipage ni la vedette de départ
        S.nextIncidentMin = 1e12;
        S.nextEventMin = 1e12;      // pas d'événement de colonie parasite
        S.autoAssign = false;
        S.res = { metal: 500, cristal: 500, energie: 500, biomasse: 500, datacubes: 200 };
        return S;
      },
      mk(over = {}) {
        const c = st.genCandidate();
        const m = { ...c, id: 'm_test_' + st.S.crew.length, age: 30, traits: [], birthGameMin: st.S.meta.gameMin - 30 * window.__YEAR,
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

  // M5 — annuler une recherche rembourse dans la limite de la capacité réelle (techs comprises)
  await scenario('M5 : annulation de recherche sans perte de datacubes', () => {
    const { st, app, fresh } = window.__t;
    const S = fresh();
    S.modules.laboratoire = { level: 2 };
    S.techCompleted.tech_archives_compactes = { at: 0 };     // capacité datacubes ×1.4
    const cap = st.capOf('datacubes');
    S.res.datacubes = 260;                                    // > CAP de base (200), < cap réelle
    app.startResearch('tech_metallurgie');                    // coûte 30
    const id = S.research[0]?.id;
    app.cancelResearch(id);
    return { capRaised: cap > 260, refunded: S.res.datacubes === 260 - 30 + 15, cancelled: S.research.length === 0 };
  });

  // Identifiants uniques même pour deux lancements dans la même milliseconde
  await scenario('Ids : deux recherches lancées ensemble restent distinctes', () => {
    const { app, fresh } = window.__t;
    const S = fresh();
    S.modules.laboratoire = { level: 4 };                     // 2 places de recherche
    const now = Date.now;
    Date.now = () => 1700000000000;                           // même milliseconde
    try {
      app.startResearch('tech_metallurgie');
      app.startResearch('tech_circuiterie');
    } finally { Date.now = now; }
    const [a, b] = S.research;
    app.cancelResearch(a.id);
    return { distinct: !!a && !!b && a.id !== b.id, onlyOneCancelled: S.research.length === 1 && S.research[0].techId === 'tech_circuiterie' };
  });

  // M5 — les autres remboursements ne réduisent jamais un stock
  await scenario('M5 : remboursements de formation sans perte', () => {
    const { st, app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.formation = { level: 2 };
    const m = mk({ skills: { combat: 0 } });
    app.startTraining(m.id, 'combat');
    const s = S.training[0];
    const metalCap = st.capOf('metal');
    S.res.metal = metalCap + 50;                              // stock au-delà du plafond (capacité réduite entre-temps)
    app.cancelTraining(s.id);
    return { started: !!s, notReduced: S.res.metal === metalCap + 50, back: m.statut === 'libre' };
  });

  // E9 — baseFractionDelta relève vraiment le plancher des postes vacants
  await scenario('E9 : plancher d\'automatisation appliqué', () => {
    const { app, fresh } = window.__t;
    const S = fresh();
    S.modules.mine_surface = { level: 1 };
    S.modules.laboratoire = { level: 1 };
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const base = app.moduleEfficiency('mine_surface').prodMult;
    S.techCompleted.tech_automatisation = { at: 0 };
    const auto = app.moduleEfficiency('mine_surface').prodMult;
    S.techCompleted.tech_relais_unifie = { at: 0 };
    const both = app.moduleEfficiency('mine_surface').prodMult;
    // Recherche sans chercheur : avance au rythme du plancher
    S.research = [{ id: 'r_t', techId: 'tech_metallurgie', startedAt: 0, totalMin: 1e6, doneMin: 0 }];
    for (let i = 0; i < 10; i++) app.tickResearch();
    return { base: near(base, 0.30), auto: near(auto, 0.45), both: near(both, 0.65), research: near(S.research[0].doneMin, 6.5) };
  });

  // E9 — Relais unifié : effet réel sur les postes de commandement
  await scenario('E9 : Relais unifié renforce le commandement', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const cap = mk({ skills: { pilotage: 2 } });
    app.assignMember(cap.id, 'commandement', 0);
    const before = app.globalCommandBonus();
    S.techCompleted.tech_relais_unifie = { at: 0 };
    return { before: before === 1, after: app.globalCommandBonus() === 1.5 };
  });

  // E9 — Membranes adaptives : immunité aux contaminations en expédition
  await scenario('E9 : Membranes adaptives immunisent en expédition', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const a = mk({ statut: 'expedition' });
    const b = mk({ statut: 'expedition' });
    const home = mk({ statut: 'libre' });
    app.inflictStatus(a, 'pathogene_alien', 'expédition');
    S.techCompleted.tech_membrane_adaptive = { at: 0 };
    app.inflictStatus(b, 'pathogene_alien', 'expédition');
    app.inflictStatus(b, 'blessure_legere', 'expédition');
    app.inflictStatus(home, 'infection', 'incident');
    return {
      withoutTech: a.statuts.some(s => s.key === 'pathogene_alien'),
      immune: !b.statuts.some(s => s.key === 'pathogene_alien'),
      woundsStill: b.statuts.some(s => s.key === 'blessure_legere'),
      baseUnaffected: home.statuts.some(s => s.key === 'infection')
    };
  });

  // M1 — le cache des effets de techs suit les techs terminées et le remplacement de l'état
  await scenario('M1 : cache des effets de techs invalidé à bon escient', () => {
    const { st, app, fresh } = window.__t;
    const S = fresh();
    S.modules.laboratoire = { level: 2 };
    const a = app.techEffectsAccumulated();
    const same = app.techEffectsAccumulated() === a;
    // Fin de recherche normale
    S.research = [{ id: 'r_t', techId: 'tech_silos_basiques', startedAt: 0, totalMin: 0.1, doneMin: 0 }];
    app.tickResearch();
    const afterResearch = app.techEffectsAccumulated().capacityMult.metal === 1.25;
    // Chargement d'un autre état (même nombre de techs, autre objet)
    const S2 = fresh();
    S2.techCompleted = { tech_stockage_quantique: { at: 0 } };
    const afterLoad = app.techEffectsAccumulated().capacityMult.metal === 2;
    st.setS({ ...S2, techCompleted: {} });
    const afterReset = app.techEffectsAccumulated().capacityMult.metal === 1;
    return { cached: same, afterResearch, afterLoad, afterReset };
  });

  // E9 — cohérence des paliers : une tech ne dépend jamais d'une tech de palier supérieur
  await scenario('E9 : paliers de l\'arbre cohérents', async () => {
    const { TECH_TREE } = await import('./src/catalog.js');
    const bad = [];
    for (const [id, t] of Object.entries(TECH_TREE)) {
      for (const p of t.prereq?.tech || []) if (TECH_TREE[p] && TECH_TREE[p].tier > t.tier) bad.push(`${id}<-${p}`);
    }
    return { noInversion: bad.length === 0 || bad };
  });
} catch (e) {
  failed++; console.error('  ✗ exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}
if (pageErrors.length) { failed++; console.error('  ✗ erreurs de page : ' + [...new Set(pageErrors)].slice(0, 5).join(' | ')); }
if (failed) { console.error(`\n✗ ${failed} échec(s)`); process.exit(1); }
console.log('\n✓ tech-research : tout est vert');
