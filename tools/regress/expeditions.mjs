#!/usr/bin/env node
/* global document */  // utilisé dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/expeditions.mjs — non-régression du moteur de scènes d'expédition (Playwright).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/expeditions.mjs
//
// Vérifie :
//  - F6  : l'outro « découverte » ne sort que sur les corps à ruines ;
//  - F3  : un site déjà fouillé ne redonne qu'une fraction du butin et aucune réputation ;
//  - F15 : un schéma légendaire / récompense d'arc ne tombe jamais d'un tirage aléatoire ;
//  - M14 : les jets « risqués » portent sur une caractéristique (journal sans « undefined ») ;
//  - M13 : les objets fabricables embarqués débloquent leur choix dédié et sont consommés.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DRIFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright introuvable. Définis NODE_PATH=$(npm root -g) ou installe-le.');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
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
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const fail = msg => { failures.push(msg); console.error('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Service Worker|\[PWA\]|Failed to load resource|fonts\.(googleapis|gstatic)/.test(t)) return;
  pageErrors.push(t.split('\n')[0]);
});
page.on('dialog', d => d.accept());

try {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await page.waitForTimeout(500);

  const res = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const cat = await import('./src/catalog.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const out = {};
    // ---- Colonie de test ----
    for (const [id, d] of Object.entries(cat.MODULES)) S.modules[id] = { level: d.maxLevel || 1 };
    for (const id of Object.keys(cat.TECH_TREE)) S.techCompleted[id] = { at: 0 };
    for (let i = 0; i < 3; i++) {
      const c = st.genCandidate();
      for (const k of Object.keys(c.skills)) c.skills[k] = 4;
      for (const k of Object.keys(c.stats)) c.stats[k] = 5;
      c.traits = [];
      S.candidates.push(c); st.acceptCandidate(c.id);
    }
    const team = S.crew.slice(-3).map(m => m.id);
    S.fleet.push({ id: 'v_rx', type: 'cuirasse', name: 'Regress', available: true });
    const refill = () => {
      for (const k of Object.keys(S.res)) S.res[k] = Math.max(S.res[k], st.capOf(k) || 500);
      for (const id of team) { const m = S.crew.find(c => c.id === id); if (m.statut !== 'expedition') { m.statut = 'libre'; m.statuts = []; } }
    };
    const sys = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, b) => a.distance - b.distance)[0];
    sys.scanned = true;
    const body = sys.bodies[0];
    Object.assign(body, { type: 'planete', biome: 'toundra', atmosphere: 'tenue', vie: 'aucune', signal: 'aucun', danger: 'aucun', ruines: 'aucune', chronicleChecked: true });
    delete body.chronicle;
    const launch = (equipment = {}) => {
      refill();
      for (const [k, n] of Object.entries(equipment)) S.inventory[k] = (S.inventory[k] || 0) + n;
      app.launchExpedition({ vesselId: 'v_rx', bodyId: body.id, crewIds: team, equipment });
      return S.expeditions[S.expeditions.length - 1];
    };
    const cancel = e => {
      S.expeditions.splice(S.expeditions.indexOf(e), 1);
      S.fleet.find(v => v.id === 'v_rx').available = true;
      for (const id of team) S.crew.find(m => m.id === id).statut = 'libre';
    };
    const arrive = (e, scenes) => {
      if (scenes) e.scenes = scenes;
      e.elapsedMin = e.oneWayMin;
      st.tickOnce({ silent: true });
    };
    const finish = e => { e.elapsedMin = e.oneWayMin; st.tickOnce({ silent: true }); };
    const choiceIdx = (e, re) => app.currentScene(e).choices.findIndex(c => re.test(c.label));
    // Chaque section est indépendante : une exception n'empêche pas les suivantes
    const sec = (name, fn) => {
      try { out[name] = fn(); } catch (err) {
        out[name] = { error: err.message };
        for (const e of [...S.expeditions]) cancel(e);
      }
    };

    // ---- F6 : outros ----
    sec('f6', () => {
      const outrosNoRuins = new Set(); const outrosRuins = new Set();
      // Tirage aléatoire : assez d'essais pour que le résultat ne dépende pas de la chance
      for (let i = 0; i < 200; i++) { const e = launch(); outrosNoRuins.add(e.scenes[e.scenes.length - 1]); cancel(e); }
      body.ruines = 'humaines';
      for (let i = 0; i < 400 && !outrosRuins.has('outro_decouverte'); i++) { const e = launch(); outrosRuins.add(e.scenes[e.scenes.length - 1]); cancel(e); }
      return { noRuins: [...outrosNoRuins], ruins: [...outrosRuins] };
    });
    body.ruines = 'humaines';

    // ---- F3 : site épuisé ----
    body.vie = 'civ_active';
    const visit = () => {
      const e = launch();
      arrive(e, ['filler_cache', 'civ_negociation', 'outro_retour']);
      const mult = e.lootMult;
      app.playChoice(e.id, choiceIdx(e, /^Ouvrir$/));              // butin : métal 20, cristal 10
      const rep0 = Object.values(S.factions || {}).find(f => f.id === body.factionId)?.reputation;
      app.playChoice(e.id, choiceIdx(e, /Saluer et prendre congé/)); // réputation +2
      const rep1 = S.factions?.[body.factionId]?.reputation;
      const metal = e.accumulatedLoot.metal || 0;
      app.playChoice(e.id, choiceIdx(e, /Remballer/));
      const phase = e.phase;
      finish(e);
      return { mult, metal, repDelta: rep1 - rep0, phase, back: !S.expeditions.includes(e) };
    };
    sec('f3', () => {
      const r = { first: visit(), second: visit() };
      S.meta.gameMin += 31 * 1440;   // le site se reconstitue en 30 jours
      r.later = visit();
      return r;
    });

    // ---- M14 : jet risqué sur une caractéristique ----
    sec('m14', () => {
      const e = launch();
      arrive(e, ['civ_troc', 'outro_retour']);
      app.playChoice(e.id, choiceIdx(e, /par la force/));
      const line = e.accumulatedLog.find(l => l.startsWith('Jet')) || null;
      cancel(e);
      return line;
    });

    // ---- M13 : objet embarqué → choix dédié, consommé ----
    sec('m13', () => {
      const r = {};
      const e = launch({ explosif_demolition: 1 });
      arrive(e, ['ruine_h_porte', 'outro_retour']);
      e.lootMult = 1;   // le corps de test a été épuisé par les visites précédentes
      const idx = choiceIdx(e, /charge de démolition/);
      const avail = idx >= 0 && app.evaluateChoice(e, app.currentScene(e).choices[idx]).available;
      app.playChoice(e.id, idx);
      Object.assign(r, { avail, consumed: !(e.equipment.explosif_demolition > 0), metal: e.accumulatedLoot.metal || 0 });
      cancel(e);
      const e2 = launch();
      arrive(e2, ['ruine_h_porte', 'outro_retour']);
      const idx2 = choiceIdx(e2, /charge de démolition/);
      r.lockedWithout = !app.evaluateChoice(e2, app.currentScene(e2).choices[idx2]).available;
      cancel(e2);
      return r;
    });

    // ---- F15 : schémas légendaires exclus des tirages ----
    sec('f15', () => {
      const legendary = new Set(Object.keys(cat.BLUEPRINTS).filter(id => cat.BLUEPRINTS[id].legendary));
      const got = new Set();
      body.ruines = 'fusion';
      for (let i = 0; i < 60; i++) {
        const e = launch();
        arrive(e, ['schema_fusion_chambre_silence', 'outro_retour']);
        e.lootMult = 1;
        app.playChoice(e.id, choiceIdx(e, /Étudier longuement/));
        for (const it of e.accumulatedItems) if (cat.BLUEPRINTS[it]) got.add(it);
        cancel(e);
      }
      return { got: [...got], legendaryDrawn: [...got].filter(id => legendary.has(id)) };
    });
    return out;
  });

  console.log('F6 — outro « découverte »');
  check(res.f6.noRuins && !res.f6.noRuins.includes('outro_decouverte'), `jamais sans ruines (outros tirées : ${res.f6.noRuins?.join(', ') || res.f6.error})`);
  check(res.f6.ruins?.includes('outro_decouverte'), `possible avec ruines (outros tirées : ${res.f6.ruins?.join(', ') || res.f6.error})`);

  console.log('F3 — site déjà fouillé');
  const { first = {}, second = {}, later = {} } = res.f3 || {};
  if (res.f3?.error) fail('exception : ' + res.f3.error);
  check(first.mult === 1 && first.metal === 20 && first.repDelta === 2 && first.back, `1re visite : butin complet (métal ${first.metal}), réputation +${first.repDelta}`);
  check(second.mult < 0.3 && second.metal > 0 && second.metal <= 6 && second.repDelta === 0 && second.back, `2e visite : butin réduit (×${second.mult?.toFixed(2)}, métal ${second.metal}), réputation +${second.repDelta}`);
  check(later.mult === 1 && later.metal === 20 && later.repDelta === 2, `après 31 jours : site reconstitué (métal ${later.metal}, réputation +${later.repDelta})`);

  console.log('M14 — jets risqués');
  check(res.m14 && /^Jet Vigueur/.test(res.m14) && !/undefined/.test(res.m14), `journal : « ${res.m14} »`);

  console.log('M13 — objets fabricables');
  check(res.m13.avail && res.m13.consumed && res.m13.metal === 45 && res.m13.lockedWithout,
    `charge de démolition : choix disponible une fois embarquée, consommée, butin métal ${res.m13.metal} ; grisé sans l'objet${res.m13.error ? ' — ' + res.m13.error : ''}`);

  console.log('F15 — schémas légendaires');
  check(res.f15.got?.length > 0 && res.f15.legendaryDrawn.length === 0, `tirages fusion : ${res.f15.got?.join(', ') || res.f15.error} (aucun légendaire)`);

  const uniq = [...new Set(pageErrors)];
  check(uniq.length === 0, `aucune erreur de page${uniq.length ? ' — ' + uniq.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log('\n✓ Expéditions : non-régression réussie');
