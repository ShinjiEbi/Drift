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
        // Compétences précisées par le scénario : les autres à 0 (sinon un tirage
        // rend le colon éligible à un poste imprévu)
        m.skills = over.skills ? { ...Object.fromEntries(Object.keys(c.skills).map(k => [k, 0])), ...over.skills } : { ...c.skills };
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

  // E8 — l'infirmerie n'admet ni ne « rapatrie » un colon absent
  await scenario('E8 : admission/sortie d\'infirmerie réservées aux présents', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 2 };
    const away = mk({ statut: 'expedition' });
    const worker = mk({ statut: 'libre', skills: { pilotage: 2 } });
    app.assignMember(worker.id, 'commandement', 0);
    app.admitToInfirmary(away.id);
    app.dischargeMember(away.id);
    app.admitToInfirmary(worker.id);
    const admitted = worker.statut === 'infirmerie' && !!app.memberAssignment(worker.id);
    app.dischargeMember(worker.id);
    return { awayUntouched: away.statut === 'expedition', admitted, backToPost: worker.statut === 'travail' };
  });

  // M7 — recliquer sur son propre poste ne remet pas l'ancienneté à zéro
  await scenario('M7 : ancienneté conservée en recliquant sur son poste', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.meta.gameMin = 10 * window.__YEAR;            // 10 ans écoulés (V1 : 1 an = 7 jours réels)
    const vet = mk({ skills: { pilotage: 3 } });
    app.assignMember(vet.id, 'commandement', 0);
    vet.posteInfo.depuis = S.meta.gameMin - 8 * window.__YEAR;   // 8 ans en poste → Vétéran
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

  // M6 — un officier sur un poste supprimé (module rétrogradé) ne compte plus
  await scenario('M6 : commandement limité aux postes ouverts', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.commandement = { level: 2 };
    const off = mk({ skills: { science: 3 } });
    const ok = app.assignMember(off.id, 'commandement', 1).ok;
    const before = app.globalCommandBonus();
    S.modules.commandement.level = 1;              // le poste « Officier scientifique » disparaît
    const after = app.globalCommandBonus();
    const staffed = app.staffOf('commandement').length;
    return { ok, before: before === 1, after: after === 0, staffConsistent: staffed === after };
  });

  // V1 — formation sans désaffectation : le poste reste réservé et repris au retour
  await scenario('V1 : formation sans désaffectation', () => {
    const { st, app, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.formation = { level: 2 };
    S.modules.mine_surface = { level: 1 };
    const w = mk({ skills: { survie: 1, science: 1 } });
    app.assignMember(w.id, 'mine_surface', 0);
    const r = app.canTrain(w.id, 'science');
    app.startTraining(w.id, 'science');
    const during = { statut: w.statut, post: app.memberAssignment(w.id)?.modKey };
    const sess = S.training[0];
    sess.failChance = 0;
    S.training = [];
    app.finishTraining(sess);
    return { canTrainAtWork: r.ok === true, inTraining: during.statut === 'formation', reserved: during.post === 'mine_surface',
      backToPost: w.statut === 'travail' && app.memberAssignment(w.id)?.modKey === 'mine_surface', learned: w.skills.science === 2, st: !!st };
  });

  // V1 — le soignant va à l'infirmerie et l'auto-affectation ne l'en retire jamais
  await scenario('V1 : médecin muté à l\'infirmerie par l\'auto-affectation, jamais repris', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.autoAssign = true;
    S.modules.hydroponie = { level: 3 };
    const doc = mk({ skills: { medecine: 2 } });
    app.autoAssignAllFreeMembers();
    const before = app.memberAssignment(doc.id)?.modKey;      // Hygiéniste (hydroponie) faute d'infirmerie
    S.modules.infirmerie = { level: 1 };
    app.autoAssignAllFreeMembers({ respectChoice: true });     // fin de chantier de l'infirmerie
    const moved = app.memberAssignment(doc.id)?.modKey;
    const other = mk({ skills: { medecine: 1 } });
    app.autoAssignAllFreeMembers();                            // « Réoptimiser »
    return { before: before === 'hydroponie', moved: moved === 'infirmerie', kept: app.memberAssignment(doc.id)?.modKey === 'infirmerie',
      otherPlaced: !!app.memberAssignment(other.id) };
  });

  // V1 — « libre » volontaire : pas d'alerte, pas de réaffectation automatique
  await scenario('V1 : isVoluntarilyFree', () => {
    const { app, fresh, mk } = window.__t;
    const S = fresh();
    S.autoAssign = true;
    const noPost = mk({ skills: { combat: 1 } });             // aucun poste vacant pour lui
    const pilot = mk({ skills: { pilotage: 2 } });            // Capitaine vacant
    const r = { noPostFree: app.isVoluntarilyFree(noPost) === true, pilotNotFree: app.isVoluntarilyFree(pilot) === false,
      alertList: app.freeMembersWithOpenPost().map(m => m.id).join() === pilot.id };
    app.autoAssignAllFreeMembers({ respectChoice: true });
    r.placed = app.memberAssignment(pilot.id)?.modKey === 'commandement';
    app.unassignMember(pilot.id);                              // choix du joueur
    r.voluntary = app.isVoluntarilyFree(pilot) === true;
    app.autoAssignAllFreeMembers({ respectChoice: true });     // fin de chantier : il reste libre
    r.respected = pilot.statut === 'libre';
    app.autoAssignAllFreeMembers();                            // « Réoptimiser » : tout le monde est placé
    r.reoptimise = pilot.statut === 'travail';
    r.s = !!S;
    return r;
  });

  // Réparation au démarrage réel : sauvegarde abîmée enregistrée puis page rechargée
  await page.evaluate(() => {
    const { st, fresh, mk } = window.__t;
    const S = fresh();
    S.modules.infirmerie = { level: 3 };
    const doc = mk({ id: 'm_doc', statut: 'libre', skills: { medecine: 3, pilotage: 2 } });   // « libéré » par l'ancien diagnostic
    S.assignments['commandement:0'] = doc.id;
    const pat = mk({ id: 'm_pat', statut: 'infirmerie' });
    pat.statuts = [{ key: 'infection', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
    S.treatments = [{ id: 'tr_old', memberId: pat.id, statusIdx: 1, statutKey: 'infection', doctorId: doc.id, totalMin: 600, doneMin: 0, cost: {} }];
    S.meta.lastTickRealMs = Date.now();
    st.save();
  });
  await prepare();
  await scenario('Réparation d\'une sauvegarde au chargement de la page', () => {
    const { st } = window.__t;
    const S = st.S;
    const doc = S.crew.find(m => m.id === 'm_doc');
    return {
      doctorWorking: doc?.statut === 'travail',
      treatmentIdx: S.treatments.length === 1 && S.treatments[0].statusIdx === 0
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
console.log('\n✓ assignments : tout est vert');
