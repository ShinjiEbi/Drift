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

  // M4 — sans médecin, un soin bénin est refusé sans rien débiter
  await scenario('M4 : soin refusé sans médecin, biomasse intacte', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 1 };
    const pat = mk({ statut: 'infirmerie' });
    pat.statuts = [{ key: 'blessure_legere', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
    const bio = S.res.biomasse;
    const r = app.canTreat(pat.id, 0);
    let threw = false;
    try { app.startTreatment(pat.id, 0); } catch { threw = true; }
    return { refused: r.ok === false && /médecin/i.test(r.reason), noThrow: !threw, notCharged: S.res.biomasse === bio, noTreatment: S.treatments.length === 0 };
  });

  // M9 — la contagion ne touche que les colons présents au même endroit
  await scenario('M9 : contagion limitée au même lieu', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const sick = mk({ statut: 'libre' });
    sick.statuts = [{ key: 'infection', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
    const diplo = mk({ statut: 'diplomatie' });
    const exp1 = mk({ statut: 'expedition' });
    const exp2 = mk({ statut: 'expedition' });
    S.expeditions = [{ id: 'e_t', crewIds: [exp1.id, exp2.id], phase: 'aller', elapsedMin: 0, oneWayMin: 1e9, awaitingChoice: false }];
    // Colons créés avant de figer Math.random (genCandidate en dépend)
    const local = mk({ statut: 'mort' });
    const other = mk({ statut: 'mort' });
    const orig = Math.random;
    Math.random = () => 0;                      // la contagion se déclenche à coup sûr
    let r;
    try {
      app.progressMemberStatuts(sick);          // seuls des absents : personne n'est contaminé
      const absentsSafe = diplo.statuts.length === 0 && exp1.statuts.length === 0 && exp2.statuts.length === 0;
      local.statut = 'travail';
      app.progressMemberStatuts(sick);
      const localHit = local.statuts.some(s => s.key === 'infection');
      // Porteur en expédition : seul son coéquipier peut être touché
      sick.statuts = []; exp1.statuts = [{ key: 'infection', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
      other.statut = 'libre';
      app.progressMemberStatuts(exp1);
      r = { absentsSafe, localHit, teammateHit: exp2.statuts.some(s => s.key === 'infection'), baseSafe: other.statuts.length === 0 };
    } finally { Math.random = orig; }
    S.expeditions = [];
    return r;
  });

  // F4 — un diagnostic raté ne peut pas être relancé immédiatement et gratuitement
  await scenario('F4 : délai entre deux diagnostics', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 3 };
    S.flags.recherche = true;
    const doc = mk({ skills: { medecine: 1 } });   // médecin libre, peu doué
    doc.stats = { ...doc.stats, intellect: 5 };
    const pat = mk({ statut: 'infirmerie' });
    pat.statuts = [{ key: 'parasite', since: S.meta.gameMin, revealed: false, diagnosed: false, statMod: {} }];
    const dc0 = S.res.datacubes;
    const orig = Math.random;
    let r;
    try {
      Math.random = () => 0;                    // jet de 1 → échec assuré (DC 4)
      app.startDiagnostic(pat.id, 0);
      const failedOnce = !pat.statuts[0].diagnosed && S.res.datacubes === dc0 - 2;
      const blocked = app.canDiagnose(pat.id, 0);
      app.startDiagnostic(pat.id, 0);           // refusé : pas de nouveau débit
      const notCharged = S.res.datacubes === dc0 - 2;
      S.meta.gameMin += app.DIAG_RETRY_MIN;
      const again = app.canDiagnose(pat.id, 0).ok;
      Math.random = () => 0.99;                 // jet de 6 → réussite
      app.startDiagnostic(pat.id, 'parasite');
      r = { failedOnce, blocked: blocked.ok === false && blocked.waitMin > 0, notCharged, again, diagnosed: pat.statuts[0].diagnosed === true };
    } finally { Math.random = orig; }
    return r;
  });

  // Mutation : apparaît après revealAfter, pas immédiatement
  await scenario('Mutation : révélation différée', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const m = mk();
    app.inflictStatus(m, 'mutation', 'test');
    const hiddenFirst = m.statuts[0]?.revealed === false && m.statuts[0]?.diagnosed === false;
    S.meta.gameMin += 24 * 60;
    app.progressMemberStatuts(m);
    return { hiddenFirst, revealedLater: m.statuts[0]?.revealed === true && m.statuts[0]?.diagnosed === true };
  });

  // Éclosion : l'instinct du Survivant n'efface pas un parasite qui éclot
  await scenario('Éclosion : le parasite devient un pathogène même chez un Survivant', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    const m = mk({ traits: ['survivant'] });
    m.statuts = [{ key: 'parasite', since: S.meta.gameMin - 60 * 24 * 7 - 1, revealed: true, diagnosed: true, statMod: {} }];
    const orig = Math.random;
    Math.random = () => 0;                      // le Survivant « esquiverait » à coup sûr une exposition
    try { app.progressMemberStatuts(m); } finally { Math.random = orig; }
    return { noParasite: !m.statuts.some(s => s.key === 'parasite'), pathogen: m.statuts.some(s => s.key === 'pathogene_alien') };
  });

  // Un médecin qui assure un traitement ne quitte pas la base (expédition, mission)
  await scenario('Médecin en plein traitement : départ en expédition refusé', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 3 };
    mk({ skills: { medecine: 3 } });
    const pat = mk({ statut: 'infirmerie' });
    pat.statuts = [{ key: 'infection', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
    app.startTreatment(pat.id, 0);
    const docId = S.treatments[0]?.doctorId;
    const sys = S.galaxy.systems[0]; sys.scanned = true;
    S.fleet.push({ id: 'v_med', type: 'vedette', name: 'Test', available: true });
    const r = app.canLaunchExpedition({ vesselId: 'v_med', bodyId: sys.bodies[0].id, crewIds: [docId] });
    return { treating: !!docId && app.isTreatingDoctor(docId), blocked: r.ok === false && /traitement/.test(r.why || '') ? true : r };
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
