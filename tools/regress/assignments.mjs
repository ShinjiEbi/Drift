#!/usr/bin/env node
/* global document, window */
// tools/regress/assignments.mjs — non-régression des affectations aux postes (statuts, ancienneté, commandement).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/assignments.mjs
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

  // E8a — un diagnostic ne « libère » plus le médecin en poste
  await scenario('E8 : le diagnostic laisse le médecin à son poste', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 4 };
    const doc = mk({ skills: { medecine: 3 } });
    const job = app.jobsForModule('infirmerie').findIndex(j => app.isEligibleForJob(doc, j));
    const assigned = app.assignMember(doc.id, 'infirmerie', job).ok;
    const pat = mk({ statut: 'infirmerie' });
    pat.statuts = [{ key: 'trauma_psy', since: S.meta.gameMin, revealed: false, diagnosed: false, statMod: {} }];
    app.startDiagnostic(pat.id, 0);
    return { assigned, docWorking: doc.statut === 'travail', docKeepsPost: app.memberAssignment(doc.id)?.slotIdx === job };
  });

  // E8b — affectation : colons absents refusés, occupant absent jamais « libéré »
  await scenario('E8 : affectation refusée en mission, occupant absent conservé', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const diplo = mk({ statut: 'diplomatie', skills: { pilotage: 3 } });
    const away = mk({ skills: { pilotage: 3 } });
    const repl = mk({ skills: { pilotage: 3 } });
    const r1 = app.assignMember(diplo.id, 'commandement', 0);
    app.assignMember(away.id, 'commandement', 0);
    away.statut = 'expedition';                    // part en expédition, poste réservé
    const r2 = app.assignMember(repl.id, 'commandement', 0);
    return {
      diploRefused: r1.ok === false && diplo.statut === 'diplomatie' && !app.memberAssignment(diplo.id),
      replaced: r2.ok === true && repl.statut === 'travail' && app.memberAt('commandement', 0)?.id === repl.id,
      awayStillAway: away.statut === 'expedition',
      awayLostPost: !app.memberAssignment(away.id),
      s: !!S
    };
  });

  // E8 — réparation d'une sauvegarde : colons « libres » pourtant partis en mission
  await scenario('E8 : réparation des statuts d\'une sauvegarde abîmée', () => {
    const { st, fresh, mk, ticks } = window.__t;
    const S = fresh();
    const e1 = mk({ statut: 'libre' });            // dans l'équipage d'une expédition en cours
    const d1 = mk({ statut: 'libre' });            // en mission diplomatique en cours
    const ghost = mk({ statut: 'expedition' });    // expédition disparue : coincé
    const worker = mk({ statut: 'libre' });        // tient un poste mais « libre »
    S.assignments['commandement:0'] = worker.id;
    S.assignments['commandement:1'] = 'm_inconnu';
    S.expeditions = [{ id: 'e_test', crewIds: [e1.id], phase: 'aller', elapsedMin: 0, oneWayMin: 1e9, awaitingChoice: false }];
    S.diplomaticMissions = [{ id: 'dipl_test', factionId: 'f_x', memberId: d1.id, startedAt: S.meta.gameMin, duration: 1e9 }];
    st.setS({ ...S });                              // simule un chargement
    ticks(1);
    const T = st.S;
    const ok = {
      exp: e1.statut === 'expedition',
      diplo: d1.statut === 'diplomatie',
      ghostBack: ghost.statut === 'libre',
      worker: worker.statut === 'travail',
      danglingRemoved: !('commandement:1' in T.assignments)
    };
    // Nettoyage : ne pas laisser de mission factice dans l'état
    T.expeditions = []; T.diplomaticMissions = [];
    return ok;
  });

  // M7 — recliquer sur son propre poste ne remet pas l'ancienneté à zéro
  await scenario('M7 : ancienneté conservée en recliquant sur son poste', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.meta.gameMin = 10 * 43200;                    // 10 ans de jeu écoulés (1 an = 30 j)
    const vet = mk({ skills: { pilotage: 3 } });
    app.assignMember(vet.id, 'commandement', 0);
    vet.posteInfo.depuis = S.meta.gameMin - 8 * 43200;   // 8 ans en poste → Vétéran
    const before = app.ancienneteBonus(vet);
    const hist = (vet.posteHistorique || []).length;
    const r = app.assignMember(vet.id, 'commandement', 0);
    const after = app.ancienneteBonus(vet);
    // Remise à plat des affectations (« Réoptimiser ») puis réaffectation au même poste
    S.assignments = {}; vet.statut = 'libre';
    app.assignMember(vet.id, 'commandement', 0);
    const afterReset = app.ancienneteBonus(vet);
    return {
      veteran: before.label === 'Vétéran',
      ok: r.ok === true,
      kept: after.mult === before.mult && after.label === 'Vétéran',
      noDupHistory: (vet.posteHistorique || []).length === hist,
      keptAfterReset: afterReset.label === 'Vétéran' && vet.statut === 'travail'
    };
  });

  // M7 — un colon affecté avant 0.32 (sans posteInfo) ne fait rien planter
  await scenario('M7 : posteInfo absent toléré', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const old = mk({ statut: 'travail', skills: { pilotage: 3 } });
    S.assignments['commandement:0'] = old.id;
    const b = app.ancienneteBonus(old);
    const eff = app.moduleEfficiency('commandement');
    old.posteInfo = { modKey: 'commandement', slotIdx: 0 };   // migration incomplète (sans depuis)
    const b2 = app.ancienneteBonus(old);
    const r = app.assignMember(old.id, 'commandement', 0);
    return { neutral: b.mult === 1 && b.label === null, eff: eff.jobsFilled === 1, noDepuis: b2.mult === 1, reclick: r.ok === true };
  });
} catch (e) {
  failed++; console.error('  ✗ exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}
if (pageErrors.length) { failed++; console.error('  ✗ erreurs de page : ' + [...new Set(pageErrors)].slice(0, 5).join(' | ')); }
if (failed) { console.error(`\n✗ ${failed} échec(s)`); process.exit(1); }
console.log('\n✓ assignments : tout est vert');
