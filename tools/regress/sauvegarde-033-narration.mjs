#!/usr/bin/env node
/* global document, localStorage */  // utilisés dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/sauvegarde-033-narration.mjs — une sauvegarde 0.33 avec une expédition
// et une chronique en cours se termine avec le moteur narratif V1.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/sauvegarde-033-narration.mjs
//
// La sauvegarde est produite par le code de la 0.33 (git archive be5d1ac) ; sans
// historique git, la copie figée tools/regress/fixtures/sauvegarde-0.33-narration.json
// est utilisée (DRIFT_ECRIRE_FIXTURE=1 la régénère).
// Vérifie : ids de scènes conservés (scène générique en cours), ancien id de scène de
// chronique (« chron_pulsar_ep2_bunker ») relu, drapeaux, fin de la scène et de
// l'épisode, délai avant l'épisode suivant, PNJ recruté au retour, interface sans erreur.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { banc, ROOT, seedSaveScript, SAVE_KEY } from './_banc.mjs';

const LEGACY_REV = 'be5d1ac';   // 0.33.0 + cahier des charges V1
const FIXTURE = path.join(ROOT, 'tools/regress/fixtures/sauvegarde-0.33-narration.json');
const b = await banc({ timeoutMs: 60000 });

// ---------- 1. Sauvegarde produite par la 0.33 ----------
async function sauvegarde033() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-033-'));
  try {
    const tar = execFileSync('git', ['-C', ROOT, 'archive', LEGACY_REV, 'index.html', 'styles.css', 'manifest.json', 'src', 'icons'], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    execFileSync('tar', ['-x', '-C', TMP], { input: tar });
  } catch {
    return null;
  }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    let p = path.join(TMP, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(TMP)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const page = await b.page(await b.context());
  page.errors.length = 0;
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await b.waitGame(page);
    return await page.evaluate(async ([key]) => {
      const st = await import('./src/state.js');
      const app = await import('./src/app.js');
      const cat = await import('./src/catalog.js');
      const ch = await import('./src/chronicles.js');
      const S = st.S;
      for (const [id, d] of Object.entries(cat.MODULES)) S.modules[id] = { level: d.maxLevel || 1 };
      for (const id of Object.keys(cat.TECH_TREE)) S.techCompleted[id] = { at: 0 };
      for (let i = 0; i < 4; i++) {
        const c = st.genCandidate();
        for (const k of Object.keys(c.skills)) c.skills[k] = 4;
        for (const k of Object.keys(c.stats)) c.stats[k] = 8;
        c.name = 'Testeur ' + i;
        S.candidates.push(c); st.acceptCandidate(c.id);
      }
      const refill = () => { for (const k of Object.keys(S.res)) S.res[k] = Math.max(S.res[k], st.capOf(k) || 500); };
      const systems = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, c) => a.distance - c.distance);
      // Expédition générique arrêtée sur la 2e scène (« ruine_h_porte »)
      const sysA = systems[0]; sysA.scanned = true;
      const bodyA = sysA.bodies[0];
      Object.assign(bodyA, { type: 'planete', biome: 'toundra', atmosphere: 'tenue', vie: 'aucune', signal: 'aucun', danger: 'aucun', ruines: 'humaines', chronicleChecked: true });
      delete bodyA.chronicle;
      S.fleet.push({ id: 'v_a', type: 'cuirasse', name: 'Ancienne A', available: true });
      refill();
      app.launchExpedition({ vesselId: 'v_a', bodyId: bodyA.id, crewIds: [S.crew[0].id, S.crew[1].id], equipment: {} });
      const expA = S.expeditions[S.expeditions.length - 1];
      expA.scenes = ['intro_atterrissage', 'ruine_h_porte', 'outro_retour'];
      expA.elapsedMin = expA.oneWayMin; st.tickOnce({ silent: true });
      app.playChoice(expA.id, 0);
      // Chronique du Pulsar Silencieux : épisode 1 joué, épisode 2 arrêté sur « chron_pulsar_ep2_bunker »
      const sysB = systems[1]; sysB.scanned = true;
      const bodyB = sysB.bodies[0];
      Object.assign(bodyB, { type: 'planete', biome: 'desert', atmosphere: 'toxique', ruines: 'humaines' });
      bodyB.chronicle = { id: 'pulsar_silencieux', episodeIdx: 1, flags: { ...ch.CHRONICLES.pulsar_silencieux.initialFlags, signal_origin: 'bunker', truth_revealed: true }, completed: false, currentSceneId: null };
      bodyB.chronicleChecked = true;
      S.fleet.push({ id: 'v_b', type: 'cuirasse', name: 'Ancienne B', available: true });
      refill();
      app.launchExpedition({ vesselId: 'v_b', bodyId: bodyB.id, crewIds: [S.crew[2].id, S.crew[3].id], equipment: {} });
      const expB = S.expeditions[S.expeditions.length - 1];
      expB.elapsedMin = expB.oneWayMin; st.tickOnce({ silent: true });
      app.playChoice(expB.id, 0);                       // intro → chron_pulsar_ep2_contact
      const sc = app.currentScene(expB);
      app.playChoice(expB.id, sc.choices.findIndex(c => /Combien/.test(c.label)));   // → chron_pulsar_ep2_bunker
      st.save();
      return localStorage.getItem(key);
    }, [SAVE_KEY]);
  } finally {
    await page.close();
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

let raw = await sauvegarde033();
if (raw) {
  console.log(`Sauvegarde produite par la 0.33 (${LEGACY_REV}).`);
  if (process.env.DRIFT_ECRIRE_FIXTURE) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify(JSON.parse(raw)) + '\n');
    console.log('  copie figée écrite : ' + path.relative(ROOT, FIXTURE));
  }
} else {
  raw = fs.readFileSync(FIXTURE, 'utf8').trim();
  console.log(`Historique git ${LEGACY_REV} indisponible : copie figée ${path.relative(ROOT, FIXTURE)}.`);
}
const d0 = JSON.parse(raw);
b.check(d0.meta.version === '0.33.0' && d0.expeditions.length === 2 && d0.expeditions.some(e => e.chronicleSceneId === 'chron_pulsar_ep2_bunker'),
  `sauvegarde 0.33 : 2 expéditions, dont une sur « ${d0.expeditions.find(e => e.chronicleSceneId)?.chronicleSceneId} »`);

// ---------- 2. Chargement dans la V1 ----------
const ctx = await b.context();
await ctx.addInitScript(seedSaveScript(raw));
const page = await b.page(ctx);
await page.goto(b.base);
await b.waitGame(page);
const r = await page.evaluate(async () => {
  const st = await import('./src/state.js');
  const app = await import('./src/app.js');
  const S = st.S;
  const out = {};
  const expA = S.expeditions.find(e => !e.chronicleSceneId);
  const expB = S.expeditions.find(e => e.chronicleSceneId);
  out.sceneA = app.currentScene(expA)?.id;
  out.vueA = app.getSceneView(expA.id);
  out.sceneB = app.currentScene(expB)?.id;
  const vueB = app.getSceneView(expB.id);
  out.vueB = { titre: vueB?.titre, texte: vueB?.texteHTML, chronique: vueB?.chronique, choix: vueB?.choix.map(c => c.label) };
  // Scène générique : passer son chemin, puis la scène de départ
  app.playChoice(expA.id, app.currentScene(expA).choices.findIndex(c => /Passer son chemin/.test(c.label)));
  out.sceneA2 = app.currentScene(expA)?.id;
  app.playChoice(expA.id, 0);
  out.phaseA = expA.phase;
  // Chronique : finir la scène, puis l'épisode en embarquant tout le monde
  const sc = app.currentScene(expB);
  app.playChoice(expB.id, sc.choices.findIndex(c => /Que mangez-vous/.test(c.label)));
  out.sceneB2 = app.currentScene(expB)?.id;
  for (const k of Object.keys(S.res)) S.res[k] = Math.max(S.res[k], 200);
  app.playChoice(expB.id, app.currentScene(expB).choices.findIndex(c => /Embarquer tout le monde/.test(c.label)));
  out.phaseB = expB.phase;
  const body = S.galaxy.systems.flatMap(s => s.bodies).find(x => x.id === expB.bodyId);
  out.chron = { ...body.chronicle };
  out.liste = app.listChronicles(S).find(c => c.id === 'pulsar_silencieux');
  // Retour des deux vaisseaux
  for (const e of [expA, expB]) e.elapsedMin = e.oneWayMin;
  st.tickOnce({ silent: true });
  out.restantes = S.expeditions.length;
  const adele = [...S.crew, ...S.candidates].find(p => p.chronicleCharacter === 'adele');
  out.adele = adele && { nom: adele.name, origine: adele.origin?.label, statut: adele.statut, pronoms: adele.pronoms };
  out.bilans = S.expHistory.slice(0, 2).map(h => h.bilan && { lieu: h.bilan.lieu, chronique: h.bilan.chronique?.titre || null, faits: h.bilan.faits.length });
  return out;
});
b.check(r.sceneA === 'ruine_h_porte' && r.vueA?.titre === 'La porte soudée' && r.vueA.progression.i === 2 && r.vueA.progression.n === 3,
  `expédition générique : scène « ${r.sceneA} » relue, titre « ${r.vueA?.titre} », ${r.vueA?.progression.i}/${r.vueA?.progression.n}`);
b.check(r.sceneB === 'pulsar_silencieux/ep2_bunker' && r.vueB.chronique?.episode === 2 && /Tomas te montre/.test(r.vueB.texte || ''),
  `chronique : ancien id « chron_pulsar_ep2_bunker » → « ${r.sceneB} », texte selon adele_trust = 1, épisode ${r.vueB.chronique?.episode}`);
b.check(r.sceneA2 === 'outro_retour' && r.phaseA === 'retour', `scène générique terminée, départ (${r.sceneA2} → ${r.phaseA})`);
b.check(r.sceneB2 === 'pulsar_silencieux/ep2_choix' && r.phaseB === 'retour' && r.chron.episodeIdx === 2 && r.chron.flags.survivors_fate === 'sauves' && r.chron.flags.adele_trust === 1,
  `épisode 2 terminé (épisode suivant idx ${r.chron.episodeIdx}, drapeaux ${JSON.stringify({ survivors_fate: r.chron.flags.survivors_fate, adele_trust: r.chron.flags.adele_trust })})`);
b.check(r.liste?.etat === 'en_attente' && r.liste.episode === 3 && r.liste.prochainDans > 0, `épisode 3 en attente (${Math.round((r.liste?.prochainDans || 0) / 3600)} h)`);
b.check(r.restantes === 0 && r.adele?.origine === 'Le Pulsar Silencieux' && r.adele.pronoms === 'elle', `retour : Adèle a rejoint la colonie (${JSON.stringify(r.adele)})`);
b.check(r.bilans.length === 2 && r.bilans.every(Boolean) && r.bilans.some(x => x.chronique === 'Le Pulsar Silencieux'), `bilans enregistrés dans l'historique (${JSON.stringify(r.bilans)})`);
// L'interface tourne sans erreur sur cette partie
for (const t of ['galaxy', 'crew', 'overview']) {
  await page.evaluate(tab => document.querySelector(`nav.tabs button[data-tab="${tab}"]`)?.click(), t);
  await page.waitForTimeout(150);
}
b.noErrors(page, 'aucune erreur JavaScript');
await b.fin();
