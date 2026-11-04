#!/usr/bin/env node
/* global window, document */  // utilisé dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/diplomatie-arcs.mjs — non-régression diplomatie, factions, flotte, arcs.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/diplomatie-arcs.mjs
// Couvre : diplomate mort (M3), statut du colon envoyé, Émissaire (M8), compétences
// entières (F5), technologies commerce/alliance (E9), noms de vaisseaux, étapes d'arcs
// dans l'ordre, colons morts exclus, étape « Système immunitaire » (F16).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
  console.error('Playwright introuvable (définis NODE_PATH=$(npm root -g)).'); process.exit(2);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.error('  ✗ ' + msg); } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.dismiss());

try {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const cat = await import('./src/catalog.js');
    const S = st.S;
    let n = 0;
    window.__t = {
      st, app, cat, S,
      member(over = {}) {
        const m = { ...st.genCandidate(), id: 'm_t' + (n++), statut: 'libre', sante: 100, moral: 70, birthGameMin: 0,
          statuts: [], sequels: [], blessures: [], ...over };
        m.skills = { combat: 0, science: 0, ingenierie: 0, medecine: 0, pilotage: 0, linguistique: 0, survie: 0, ...(over.skills || {}) };
        m.stats = { vigueur: 5, dexterite: 5, intellect: 5, sangfroid: 5, charisme: 5 };
        S.crew.push(m);
        return m;
      },
      faction(over = {}) {
        const id = 'fac_t' + (n++);
        S.factions[id] = { id, type: 'humain', name: 'Enclave ' + id, bodyId: null, bodyName: 'X', systemId: null, reputation: 10, metAt: S.meta.gameMin, tradeActive: false, lastCaravan: null, ...over };
        return S.factions[id];
      },
      finishMissions() {
        for (const mis of S.diplomaticMissions) mis.startedAt = S.meta.gameMin - mis.duration - 1;
        app.tickDiplomaticMissions();
      },
      journal: () => S.journal.map(j => j.txt).join('\n'),
    };
    S.res.biomasse = 900;
    S.diplomaticMissions = [];
  });

  console.log('M3 — statut du diplomate et diplomate mort');
  const m3 = await page.evaluate(() => {
    const { app, S } = window.__t;
    const out = {};
    const f = window.__t.faction();
    for (const statut of ['expedition', 'infirmerie', 'formation', 'diplomatie']) {
      const m = window.__t.member({ statut, skills: { linguistique: 4 } });
      app.launchDiplomaticMission(f.id, m.id);
      out[statut] = S.diplomaticMissions.length;
    }
    const worker = window.__t.member({ statut: 'travail', skills: { linguistique: 4 } });
    app.launchDiplomaticMission(f.id, worker.id);
    out.travail = S.diplomaticMissions.length === 1 && worker.statut === 'diplomatie';
    // Le diplomate meurt pendant la mission
    const rep0 = f.reputation;
    worker.statut = 'mort';
    app.tickDiplomaticMissions();
    out.cleared = S.diplomaticMissions.length === 0;
    out.repUnchanged = f.reputation === rep0;
    out.logged = /perdue/.test(window.__t.journal());
    out.stillDead = worker.statut === 'mort';
    return out;
  });
  check(m3.expedition === 0 && m3.infirmerie === 0 && m3.formation === 0 && m3.diplomatie === 0, 'refus d\'un colon en expédition, à l\'infirmerie, en formation ou déjà en mission');
  check(m3.travail, 'un colon en poste peut partir en mission');
  check(m3.cleared && m3.stillDead, 'la mission d\'un diplomate mort se termine sans le ressusciter');
  check(m3.repUnchanged && m3.logged, 'aucune récompense, échec consigné au journal');

  console.log('M8 — Émissaire et nom de vaisseau');
  const em = await page.evaluate(() => {
    const { app, S } = window.__t;
    S.vesselBuild = { type: 'emissaire', totalMin: 1, doneMin: 1, cost: {} };
    app.finishVesselBuild();
    const v = S.fleet[S.fleet.length - 1];
    v.available = true;
    const f = window.__t.faction();
    const m = window.__t.member({ skills: { linguistique: 4 } });
    app.launchDiplomaticMission(f.id, m.id);
    const mis = S.diplomaticMissions.find(d => d.memberId === m.id);
    const rep0 = f.reputation;
    const realRandom = Math.random;
    Math.random = () => 0.5;      // jet moyen : succès simple, gain de base 15 + 5
    try { window.__t.finishMissions(); } finally { Math.random = realRandom; }
    S.fleet = S.fleet.filter(x => x !== v);
    return { name: v.name, id: v.id, vesselType: mis?.vesselType, gain: f.reputation - rep0 };
  });
  check(!/^Vaisseau-/.test(em.name), `l'Émissaire a un nom propre (${em.name})`);
  check(em.vesselType === 'emissaire', 'la mission enregistre l\'Émissaire disponible');
  check(em.gain >= 30, `le bonus ×1.5 de l'Émissaire s'applique (réputation +${em.gain})`);

  console.log('F5 — compétences entières après succès critiques');
  const f5 = await page.evaluate(() => {
    const { app } = window.__t;
    const f = window.__t.faction();
    const m = window.__t.member({ skills: { linguistique: 3.3 } });   // valeur héritée de 0.32.0
    const values = [];
    const realRandom = Math.random;
    Math.random = () => 0.999;    // 1d10 = 10 → succès critique
    try {
      for (let i = 0; i < 3; i++) {
        m.statut = 'libre';
        app.launchDiplomaticMission(f.id, m.id);
        window.__t.finishMissions();
        values.push(m.skills.linguistique);
      }
    } finally { Math.random = realRandom; }
    return { values, crits: m.diploCrits };
  });
  check(f5.values.every(Number.isInteger), `compétence toujours entière (${f5.values.join(' → ')})`);
  check(f5.values[f5.values.length - 1] === 4, 'la fraction héritée (0.3 = 3 succès) + 2 critiques donnent +1');

  console.log('E9 — commerce et alliance exigent leur technologie');
  const e9 = await page.evaluate(() => {
    const { app, S } = window.__t;
    const saved = S.techCompleted;
    S.techCompleted = {};
    const f = window.__t.faction({ reputation: 50 });
    app.toggleFactionTrade(f.id);
    const blocked = !f.tradeActive;
    S.techCompleted = { tech_commerce_interstellaire: { at: 0 } };
    app.toggleFactionTrade(f.id);
    const opened = f.tradeActive;
    // Alliance : réputation 80, intervalle écoulé
    const g = window.__t.faction({ reputation: 80, metAt: S.meta.gameMin - 30 * 24 * 60 });
    const metal0 = S.res.metal = 0;
    S.techCompleted = {};
    app.tickFactions();
    const noGift = S.res.metal === metal0 && !g.lastAllianceGift;
    const warned = /Traités formels/.test(window.__t.journal());
    S.techCompleted = { tech_traites_formels: { at: 0 } };
    app.tickFactions();
    const gift = S.res.metal > metal0;
    // Droits acquis : alliance nouée avant 0.32.1 (lastAllianceGift posé), sans la tech
    S.techCompleted = {};
    const h = window.__t.faction({ reputation: 80, lastAllianceGift: S.meta.gameMin - 30 * 24 * 60 });
    const m1 = S.res.metal;
    app.tickFactions();
    const legacyGift = S.res.metal > m1 && h.lastAllianceGift === S.meta.gameMin;
    S.techCompleted = saved;
    return { blocked, opened, noGift, warned, gift, legacyGift };
  });
  check(e9.blocked, 'route commerciale refusée sans Commerce interstellaire');
  check(e9.opened, 'route commerciale ouverte avec la technologie');
  check(e9.noGift && e9.warned, 'pas de don d\'alliance sans Traités formels (message explicite)');
  check(e9.gift, 'don d\'alliance avec la technologie');
  check(e9.legacyGift, 'une alliance déjà nouée dans une ancienne sauvegarde reste active');

  console.log('Arcs — étapes dans l\'ordre, morts exclus, « Système immunitaire »');
  const arcs = await page.evaluate(() => {
    const { app, S, cat } = window.__t;
    const out = {};
    // L'Avant-poste : ap_3 (flotte ≥ 3) remplie mais ap_1 (10 colons vivants) non
    S.crew.filter(m => m.statut !== 'mort').slice(9).forEach(m => { m.statut = 'mort'; });
    S.arcs = {};
    while (S.fleet.length < 3) S.fleet.push({ id: 'v_arc' + S.fleet.length, type: 'vedette', name: 'A', available: true });
    app.tickArcs(); app.tickArcs();
    out.outOfOrder = app.isStepComplete('arc_avant_poste', 'ap_3');
    // Sauvegarde ancienne : ap_3 déjà validée hors ordre → conservée
    app.getArcState('arc_avant_poste').completedSteps.push('ap_3');
    app.tickArcs();
    out.legacyKept = app.isStepComplete('arc_avant_poste', 'ap_3');
    // L'Effondrement, étape 4 : un linguiste mort ne compte pas
    for (const m of S.crew) m.skills.linguistique = Math.min(m.skills.linguistique || 0, 3);
    const st = app.getArcState('arc_effondrement');
    st.unlocked = true; st.completedSteps = ['eff_1', 'eff_2', 'eff_3'];
    window.__t.member({ statut: 'mort', skills: { linguistique: 5 } });
    app.tickArcs();
    out.deadLinguist = app.isStepComplete('arc_effondrement', 'eff_4');
    window.__t.member({ skills: { linguistique: 4 } });
    app.tickArcs();
    out.aliveLinguist = app.isStepComplete('arc_effondrement', 'eff_4');
    // La Couvée : l'étape 2 se valide APRÈS la guérison, pas pendant l'infection
    const bp = Object.keys(cat.BLUEPRINTS).find(id => cat.BLUEPRINTS[id].origin === 'alien_b');
    S.discoveries[bp] = true;
    const patient = window.__t.member();
    patient.statuts.push({ key: 'pathogene_alien', since: S.meta.gameMin, revealed: true, diagnosed: true });
    app.tickArcs(); app.tickArcs();
    out.cou1 = app.isStepComplete('arc_couvee', 'cou_1');
    out.duringInfection = app.isStepComplete('arc_couvee', 'cou_2');
    patient.statuts = [];
    app.tickArcs();
    out.afterCure = app.isStepComplete('arc_couvee', 'cou_2');
    return out;
  });
  check(!arcs.outOfOrder, 'une étape ultérieure ne se valide pas avant les précédentes');
  check(arcs.legacyKept, 'une étape déjà validée hors ordre reste acquise');
  check(!arcs.deadLinguist && arcs.aliveLinguist, 'eff_4 : seul un linguiste vivant compte');
  check(arcs.cou1 && !arcs.duringInfection, 'cou_2 ne se valide pas pendant l\'infection');
  check(arcs.afterCure, 'cou_2 se valide quand le colon infecté a survécu');

  const errs = [...new Set(pageErrors)];
  check(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  failures.push('exception : ' + e.message);
  console.error('  ✗ exception : ' + e.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) { console.error(`\n✗ ${failures.length} échec(s)`); process.exit(1); }
console.log('\n✓ Non-régression diplomatie / factions / arcs : OK');
