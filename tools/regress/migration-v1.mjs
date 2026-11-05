#!/usr/bin/env node
/* global localStorage */  // utilisé dans les fonctions exécutées par le navigateur (page.evaluate)
// tools/regress/migration-v1.mjs — une VRAIE sauvegarde 0.33 (jeu be5d1ac extrait de
// l'historique git) chargée par la V1 : schéma 2, travaux en cours convertis à la
// durée réelle sans perte d'avancement, âges et ancienneté conservés, files créées.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/migration-v1.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { banc, ROOT, seedSaveScript } from './_banc.mjs';

const REV = 'be5d1ac';   // 0.33.0 (dernière version avant la V1)
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-033-'));
try {
  const tar = execFileSync('git', ['-C', ROOT, 'archive', REV, 'index.html', 'styles.css', 'manifest.json', 'src', 'icons'], { maxBuffer: 64 << 20 });
  execFileSync('tar', ['-x', '-C', OLD], { input: tar });
} catch {
  console.log(`  (historique git ${REV} indisponible : test ignoré)`);
  process.exit(0);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const oldServer = http.createServer((req, res) => {
  let p = path.join(OLD, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => oldServer.listen(0, '127.0.0.1', r));

const b = await banc({ timeoutMs: 60000 });
const { check } = b;
try {
  console.log('1. Partie 0.33 avec des travaux en cours');
  const oldPage = await b.page(await b.context());
  await oldPage.goto(`http://127.0.0.1:${oldServer.address().port}/index.html`);
  await b.waitGame(oldPage);
  const old = await oldPage.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    st.setSimPaused(true);
    const S = st.S;
    for (const id of ['habitat', 'mine_surface', 'hydroponie', 'generateur_solaire', 'laboratoire', 'atelier', 'infirmerie', 'hangar', 'formation']) S.modules[id] = { level: 3 };
    S.modules.commandement = { level: 3 };
    S.res = { metal: 900, cristal: 700, energie: 380, biomasse: 280, datacubes: 180 };
    for (let i = 0; i < 6; i++) { const c = st.genCandidate(); c.age = 30 + i; S.candidates.push(c); st.acceptCandidate(c.id); }
    const [a, bb, c, d] = S.crew;
    // Ancienneté : un vétéran (8 « ans » de 30 jours de jeu en poste)
    app.autoAssignAllFreeMembers();
    const vet = S.crew.slice(4).find(m => m.posteInfo);   // ni en formation, ni soigné, ni parti
    vet.posteInfo.depuis = S.meta.gameMin - 8 * 43200;
    st.startBuild('mine_surface');
    app.startResearch('tech_metallurgie');
    app.startFabrication('fab_kit_reparation');
    app.unassignMember(a.id);
    a.skills.combat = 0;   // formation toujours possible (tirage aléatoire sinon)
    app.startTraining(a.id, 'combat');
    bb.statuts = [{ key: 'infection', since: S.meta.gameMin, revealed: true, diagnosed: true, statMod: {} }];
    c.skills.medecine = 3; app.unassignMember(c.id);
    app.admitToInfirmary(bb.id);
    app.startTreatment(bb.id, 'infection');
    S.fleet.push({ id: 'v_old', type: 'vedette', name: 'Vieille', available: true });
    // Galaxie tirée au hasard : premier corps assez proche pour que le départ soit payable
    S.res.energie = Math.max(S.res.energie, 300); S.res.biomasse = Math.max(S.res.biomasse, 250);
    for (const sys of S.galaxy.systems.filter(s => s.distance > 1).sort((x, y) => x.distance - y.distance)) {
      sys.scanned = true;
      app.launchExpedition({ vesselId: 'v_old', bodyId: sys.bodies[0].id, crewIds: [d.id] });
      if (S.expeditions.length) break;
    }
    app.startVesselBuild('vedette');
    // avance d'un tiers des travaux
    for (let i = 0; i < 40; i++) st.tickOnce({ silent: true });
    const frac = w => w ? w.doneMin / w.totalMin : null;
    const exp = S.expeditions[0];
    st.save();
    return {
      raw: localStorage.getItem('drift_save_v1'),
      fr: { build: frac(S.build), research: frac(S.research[0]), fab: frac(S.fabrication[0]), training: frac(S.training[0]),
        treatment: frac(S.treatments[0]), vessel: frac(S.vesselBuild), exp: exp ? exp.elapsedMin / exp.oneWayMin : null },
      tot: { training: S.training[0]?.totalMin, treatment: S.treatments[0]?.totalMin },
      ages: Object.fromEntries(S.crew.map(m => [m.id, app.currentAge(m)])),
      vet: { id: vet.id, label: app.ancienneteBonus(vet).label },
      schema: S.meta.schemaVersion
    };
  });
  check(old.schema === 1 && old.raw && old.raw.length > 1000, `sauvegarde 0.33 produite (schéma ${old.schema})`);
  check(Object.values(old.fr).every(v => v > 0 && v < 1), `travaux en cours : ${Object.entries(old.fr).map(([k, v]) => `${k} ${(v * 100).toFixed(0)} %`).join(', ')}`);

  console.log('2. Chargement par la V1');
  const ctx = await b.context();
  await ctx.addInitScript(seedSaveScript(old.raw));
  const page = await b.page(ctx);
  await page.goto(b.base);
  await b.waitGame(page);
  const now = await page.evaluate(async (oldTot) => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const cat = await import('./src/catalog.js');
    st.setSimPaused(true);
    const S = st.S;
    const frac = w => w ? w.doneMin / w.totalMin : null;
    const exp = S.expeditions[0];
    return {
      schema: S.meta.schemaVersion, queues: Array.isArray(S.buildQueue) && Array.isArray(S.researchQueue),
      fr: { build: frac(S.build), research: frac(S.research[0]), fab: frac(S.fabrication[0]), training: frac(S.training[0]),
        treatment: frac(S.treatments[0]), vessel: frac(S.vesselBuild), exp: exp ? exp.elapsedMin / exp.oneWayMin : null },
      totals: { build: S.build?.totalMin === st.buildTime(S.build.id, S.build.targetLevel), research: S.research[0]?.totalMin === app.researchDuration(S.research[0].techId),
        vessel: S.vesselBuild?.totalMin === app.vesselBuildDuration(S.vesselBuild.type), fab: S.fabrication[0]?.totalMin === cat.FABRICATIONS[S.fabrication[0].fabId].time * 12,
        exp: exp?.oneWayMin >= 180 && exp?.oneWayMin <= 6000, training: S.training[0]?.totalMin >= 4 * oldTot.training, treatment: S.treatments[0]?.totalMin >= 4 * oldTot.treatment },
      ages: Object.fromEntries(S.crew.map(m => [m.id, app.currentAge(m)])),
      crew: S.crew.map(m => ({ id: m.id, label: app.ancienneteBonus(m).label })),
      timers: S.nextIncidentMin > S.meta.gameMin && S.nextEventMin > S.meta.gameMin
    };
  }, old.tot);
  check(now.schema === 2 && now.queues, `schéma 2, files de chantiers et de recherche créées`);
  const sameFrac = Object.keys(old.fr).filter(k => Math.abs((now.fr[k] ?? -1) - old.fr[k]) < 0.01);
  check(sameFrac.length === Object.keys(old.fr).length, `avancement conservé (${sameFrac.join(', ')})`);
  check(Object.values(now.totals).every(Boolean), `durées converties à l'échelle réelle (${Object.entries(now.totals).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'toutes'})`);
  check(Object.entries(old.ages).every(([id, a]) => now.ages[id] === a), 'âges des colons conservés');
  check(now.crew.find(m => m.id === old.vet.id)?.label === old.vet.label && old.vet.label === 'Vétéran', `ancienneté conservée (${old.vet.label})`);
  check(now.timers, 'minuteries d\'incidents et d\'événements replacées dans le futur');
  // Moteur narratif : mémoire et pronoms (accords des textes)
  const narr = await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const people = [...S.crew, ...S.candidates];
    return { mem: obj(S.scenesVues) && obj(S.compteurs) && obj(S.monde),
      pron: people.filter(p => p.pronoms).length, n: people.length,
      ok: people.every(p => p.pronoms === undefined || ['il', 'elle', 'iel'].includes(p.pronoms)) };
  });
  check(narr.mem, 'mémoire narrative créée (scenesVues, compteurs, monde)');
  check(narr.ok && narr.pron > 0, `pronoms déduits des prénoms (${narr.pron}/${narr.n})`);
  // La partie tourne ensuite normalement
  const run = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    for (let i = 0; i < 600; i++) st.tickOnce({ silent: true });
    return st.S.meta.gameMin > 0;
  });
  check(run, 'la partie migrée tourne');
  b.noErrors(page, 'aucune erreur de page (V1)');
} catch (e) {
  check(false, 'exception du test : ' + e.message);
} finally {
  oldServer.close();
  fs.rmSync(OLD, { recursive: true, force: true });
}
await b.fin();
