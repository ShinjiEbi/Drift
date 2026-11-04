#!/usr/bin/env node
/* global window, document */  // utilisés dans le bot exécuté par le navigateur (page.evaluate)
// tools/sim.mjs — simulation du rythme de DRIFT par un bot « joueur raisonnable ».
//
// Usage :
//   node tools/sim.mjs --scenario regulier --seed 1 [--hours 504] [--out fichier.json] [--root dossier]
//   node tools/sim.mjs --report a.json b.json …     (tableau comparatif des sorties)
//
// Scénarios :
//   actif    : joueur présent en continu (48 h par défaut)
//   regulier : 1 h de session au départ, puis 4 sessions par jour (8 h 10 min,
//              12 h 30 10 min, 18 h 10 min, 21 h 15 min) — 21 jours par défaut
//   rare     : 1 h au départ, puis 2 sessions de 15 min par jour (8 h et 20 h)
//
// 1 tick = 1 seconde réelle. Les absences sont simulées en ticks silencieux,
// comme le rattrapage hors ligne (plafonné à OFFLINE_MAX_HOURS ; au-delà, le
// temps est perdu, comme dans le jeu). Au retour d'une absence de plus de 2 h,
// l'événement garanti est déclenché comme à la fin d'un rattrapage.
//
// Le bot charge le vrai jeu dans Chromium (Playwright, via NODE_PATH ou
// node_modules), coupe la boucle temps réel de la page et avance le temps avec
// tickOnce. Présent, toutes les 5 s : décisions en attente, scènes et combats
// (résolution automatique), candidats (si la biomasse suit les salaires),
// soins, chantiers (file de 3), recherche (file), atelier, vaisseaux,
// expéditions, formations, diplomatie.
// Aucun fichier du dépôt n'est modifié.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

// ------------------------------------------------------------------
// Mode rapport : tableau comparatif de sorties JSON
// ------------------------------------------------------------------
if (args.includes('--report')) {
  const files = args.slice(args.indexOf('--report') + 1).filter(f => f.endsWith('.json'));
  console.log(report(files.map(f => ({ f, d: JSON.parse(fs.readFileSync(f, 'utf8')) }))));
  process.exit(0);
}

const SCEN = opt('scenario', 'actif');
const SEED = Number(opt('seed', 1));
const HOURS = Number(opt('hours', SCEN === 'actif' ? 48 : 21 * 24));
const ROOT = path.resolve(opt('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const OUT = opt('out', null);
const QUIET = args.includes('--quiet');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright introuvable. Définis NODE_PATH (installation globale) ou installe-le.');
  process.exit(2);
}

// ------------------------------------------------------------------
// Bot installé dans la page (sérialisé par Playwright : aucune fermeture Node)
// ------------------------------------------------------------------
async function installBot(cfg) {
  const st = await import('./src/state.js');
  const app = await import('./src/app.js');
  const cat = await import('./src/catalog.js');
  const K = await import('./src/constants.js');
  const DAF = await import('./src/data-arcs-factions.js');
  st.setSimPaused(true);   // coupe la boucle temps réel de la page : c'est le bot qui avance le temps
  const S = () => st.S;
  const RES = K.RESOURCES;
  const H = 3600;

  const B = window.__bot = {
    cfg, t: 0, firsts: {}, actions: [], samples: [], counts: {}, capTicks: {}, zeroTicks: {}, energyShortTicks: 0,
    decisionsLive: 0, deaths: [], presentTicks: 0, absentTicks: 0, lostOfflineTicks: 0,
    sceneChoices: 0, combats: 0, combatWins: 0, chronEnds: [], scenesSeen: {}, incidentIds: {}, eventIds: {},
    autoIncidents: 0, autoEvents: 0, notes: [],
    buildIdle: { present: 0, absent: 0 }, labIdle: { present: 0, absent: 0 }, labTicks: { present: 0, absent: 0 },
    absenceStart: null,
  };
  const inc = (k, n = 1) => { B.counts[k] = (B.counts[k] || 0) + n; };
  const first = (k) => { if (B.firsts[k] === undefined) B.firsts[k] = B.t; };
  const act = (type, detail) => { B.actions.push([B.t, type, detail || '']); inc('act:' + type); };

  // ---------------- Présence du joueur ----------------
  const START_H = 9;   // la partie démarre à 9 h 00
  const SESSIONS = { regulier: [[8, 10], [12.5, 10], [18, 10], [21, 15]], rare: [[8, 15], [20, 15]] };
  B.present = (t) => {
    if (cfg.scenario === 'actif') return true;
    if (t < 3600) return true;          // première session d'une heure
    const hod = (t / 3600 + START_H) % 24;
    for (const [h, mins] of SESSIONS[cfg.scenario]) if (hod >= h && hod < h + mins / 60) return true;
    return false;
  };

  // ---------------- Journal → jalons ----------------
  const JRULES = [
    [/rejoint l'avant-poste/, 'recruit'], [/Signal reçu/, 'candidate'], [/Recherche complétée/, 'research_done'],
    [/Sortie d'usine/, 'vessel_done'], [/Décollage/, 'exp_launch'], [/rentre de/, 'exp_return'],
    [/Faction rencontrée/, 'faction_met'], [/Chronique ouverte :/, 'arc_unlocked'], [/Chronique achevée :/, 'arc_completed'],
    [/décédé/, 'death'], [/achève sa formation/, 'training_done'], [/est rétabli/, 'treatment_done'],
    [/Pénurie d'énergie/, 'energy_shortage_log'], [/Plus de biomasse/, 'biomass_shortage_log'],
  ];
  function scanJournal() {
    const j = S().journal || [];
    // le journal est borné : on repère les nouvelles entrées par marquage
    for (let i = j.length - 1; i >= 0 && !j[i].__seen; i--) {
      const e = j[i];
      e.__seen = true;
      for (const [re, k] of JRULES) if (re.test(e.txt)) { first(k); inc('j:' + k); }
      if (/décision automatique/.test(e.txt)) {
        const isEvent = !/Incident|incident/.test(e.txt) && Object.values(app.COLONY_EVENTS).some(ev => e.txt.includes(ev.titre));
        if (isEvent) B.autoEvents++; else B.autoIncidents++;
      }
    }
  }

  function scanState() {
    const s = S();
    const alive = st.aliveCrew().length;
    for (const n of [5, 10, 15, 25, 40]) if (alive >= n) first('crew_' + n);
    const nt = Object.keys(s.techCompleted || {}).length;
    for (const n of [1, 5, 10, 20, 30, 35, 42]) if (nt >= n) first('techs_' + n);
    if (app.isExoticUnlocked()) first('exotic_branch_unlocked');
    for (const id in cat.MODULES) if (cat.MODULES[id].tier === 2 && s.modules[id]?.level) first('tier2_module_built');
    let nchron = 0;
    for (const sys of s.galaxy.systems) for (const b of sys.bodies) {
      if (b.chronicle) { first('chronicle_any'); if (b.chronicle.completed) nchron++; }
    }
    for (const n of [1, 3, 6]) if (nchron >= n) first('chronicles_done_' + n);
    const arcsDone = Object.values(s.arcs || {}).filter(a => a.rewardClaimed).length;
    for (const n of [1, 2, 3, 4]) if (arcsDone >= n) first('arcs_done_' + n);
    if (Object.keys(s.factions || {}).length) first('faction_any');
    const mods = Object.values(s.modules).reduce((a, m) => a + (m?.level || 0), 0);
    for (const n of [10, 20, 40, 60, 80]) if (mods >= n) first('module_levels_' + n);
  }

  function sample(label) {
    const s = S();
    const rates = st.computeRates();
    const caps = st.capsAll();
    const alive = st.aliveCrew();
    B.samples.push({
      t: B.t, label, present: B.present(B.t),
      res: Object.fromEntries(RES.map(k => [k, Math.round(s.res[k])])), caps,
      ratesH: Object.fromEntries(RES.map(k => [k, Math.round(rates[k] * H)])),
      crew: alive.length, crewCap: st.crewCap(), free: alive.filter(m => m.statut === 'libre').length,
      moral: alive.length ? Math.round(alive.reduce((a, m) => a + m.moral, 0) / alive.length) : null,
      modLevels: Object.values(s.modules).reduce((a, m) => a + (m?.level || 0), 0),
      techs: Object.keys(s.techCompleted || {}).length, fleet: s.fleet.length, pending: (s.pendingDecisions || []).length,
      deaths: s.crew.filter(m => m.statut === 'mort').length,
      build: s.build ? `${s.build.id}:${s.build.targetLevel}` : null, queue: (s.buildQueue || []).length,
      research: (s.research || []).map(r => r.techId), rqueue: (s.researchQueue || []).length,
    });
  }

  // ---------------- Décisions ----------------
  const pRisk = (bonus, dc) => Math.max(0, Math.min(1, (11 - (dc - bonus)) / 10));
  const atBase = m => ['libre', 'travail'].includes(m.statut);
  function scoreDecisionOutcome(o) {
    if (!o) return 0;
    let s = 0;
    for (const k in o.loss || {}) s -= o.loss[k] * 3 * 0.1;
    for (const k in o.gain || {}) s += o.gain[k] * 3 * (k === 'datacubes' ? 0.3 : 0.1);
    if (o.moralAll) s += o.moralAll * 4;
    if (o.status) s -= 30;
    if (o.damageModule) s -= 100;
    if (o.chainIncident) s -= 50;
    if (o.debuff) s -= 20;
    if (o.disableModule) s -= o.disableModule / 60;
    if (o.generateRivalry) s -= 15;
    if (o.spawnVisitor) s += 20;
    if (o.randomBlueprint) s += 20;
    return s;
  }
  function pickDecisionChoice(choices) {
    const base = st.aliveCrew().filter(m => ['libre', 'travail', 'infirmerie', 'formation'].includes(m.statut));
    let best = -1, bestS = -Infinity;
    (choices || []).forEach((c, i) => {
      if (c.req?.skill && !base.some(m => (m.skills?.[c.req.skill.key] || 0) >= c.req.skill.min)) return;
      if (c.consume?.item && !(S().inventory?.[c.consume.item] > 0)) return;
      if (c.pay && c.outcome?.loss) for (const k in c.outcome.loss) if ((S().res[k] || 0) < c.outcome.loss[k] * 3) return;
      let sc;
      if (c.risky) {
        const bestStat = Math.max(5, ...base.map(m => m.stats?.[c.risky.stat] || 5));
        const p = pRisk(Math.floor((bestStat - 5) / 2), c.risky.dc);
        sc = p * scoreDecisionOutcome(c.risky.success) + (1 - p) * scoreDecisionOutcome(c.risky.fail);
      } else sc = scoreDecisionOutcome(c.outcome);
      sc += Math.random();
      if (sc > bestS) { bestS = sc; best = i; }
    });
    return best;
  }
  function resolveDecisions() {
    const q = S().pendingDecisions || [];
    let guard = 0;
    while (q.length && guard++ < 10) {
      const dec = q[0];
      if (dec.kind === 'incident') {
        const incd = app.INCIDENTS?.[dec.refId];
        let victim = S().crew.find(m => m.id === dec.victimId && m.statut !== 'mort');
        if (!victim) victim = st.aliveCrew().find(atBase) || null;
        const idx = incd ? pickDecisionChoice(incd.choices) : -1;
        if (idx >= 0) app.applyIncidentChoice(incd, incd.choices[idx], victim);
        act('incident', dec.refId);
      } else {
        const ev = app.COLONY_EVENTS?.[dec.refId];
        const get = id => (id ? S().crew.find(m => m.id === id) || null : null);
        const actors = { primary: get(dec.actorIds?.primary), secondary: get(dec.actorIds?.secondary) };
        if (ev && (actors.primary || !dec.actorIds?.primary)) {
          const idx = pickDecisionChoice(ev.choices);
          if (idx >= 0) app.applyColonyEventChoice(dec.refId, ev.choices[idx], actors);
          S().lastColonyEventId = dec.refId;
          act('event', dec.refId);
        }
      }
      B.decisionsLive++;
      q.shift();
    }
    S().pendingIncident = null; S().pendingColonyEvent = null;
  }

  // ---------------- Expéditions : scènes et combats ----------------
  function scoreSceneOutcome(o) {
    if (!o || o === 'next') return 1;
    let s = 1;
    for (const k in o.loot || {}) s += (o.loot[k] || 0) * (k === 'datacubes' ? 0.4 : 0.1);
    if (o.item) s += 15;
    if (o.blueprint) s += 25;
    if (o.addCandidate) s += 25;
    if (o.status) s -= 25;
    if (o.morale) s += o.morale * 2;
    if (o.retreat) s -= 15;
    if (o.combat) s += 4;
    if (o.next || o.endChronicleEpisode || o.endChronicle) s += 3;
    return s;
  }
  function chooseScene(exp) {
    // Contrat V1 (moteur narratif) si disponible : choix visibles, disponibilité, chance
    if (typeof app.getSceneView === 'function') {
      const v = app.getSceneView(exp.id);
      const opts = (v?.choix || []).filter(c => c.disponible).map(c => [(c.chance ?? 0.7) + Math.random() * 0.3, c.index]);
      opts.sort((a, b) => b[0] - a[0]);
      return { idx: opts.length ? opts[0][1] : -1, n: opts.length, id: v?.titre || '?' };
    }
    const scene = app.currentScene(exp);
    if (!scene) return { idx: -1, n: 0 };
    const team = exp.crewIds.map(id => S().crew.find(c => c.id === id)).filter(c => c && c.statut !== 'mort');
    const opts = [];
    scene.choices.forEach((c, i) => {
      if (!app.evaluateChoice(exp, c).available) return;
      let sc;
      if (c.risky) {
        const best = Math.max(...team.map(m => m.stats?.[c.risky.stat] || 5));
        const p = pRisk(Math.floor((best - 5) / 2), c.risky.dc);
        sc = p * scoreSceneOutcome(c.risky.success) + (1 - p) * scoreSceneOutcome(c.risky.fail);
      } else sc = scoreSceneOutcome(c.outcome);
      if (c.req) sc += 2;
      sc += Math.random() * 3;
      opts.push([sc, i]);
    });
    opts.sort((a, b) => b[0] - a[0]);
    return { idx: opts.length ? opts[0][1] : -1, n: opts.length, id: scene.id, end: opts.length ? (scene.choices[opts[0][1]].outcome?.endChronicle || scene.choices[opts[0][1]].risky?.success?.endChronicle) : null };
  }
  function playExpeditions() {
    for (const exp of [...S().expeditions]) {
      let guard = 0;
      while (guard++ < 40) {
        const e = S().expeditions.find(x => x.id === exp.id);
        if (!e || e.phase !== 'sur_place') break;
        if (e.combat?.active) {
          first('first_combat'); B.combats++;
          const r = app.combatAutoResolve(e.id);
          if (r?.outcome === 'victory') B.combatWins++;
          act('combat', r?.outcome || '?');
          continue;
        }
        if (!e.awaitingChoice) break;
        const c = chooseScene(e);
        if (c.idx < 0) { app.abandonExpedition(e.id); act('exp_abandon', c.id); break; }
        B.scenesSeen[c.id] = (B.scenesSeen[c.id] || 0) + 1;
        B.sceneChoices++;
        first('first_scene');
        act('scene', c.id);
        app.playChoice(e.id, c.idx);
        if (c.end) B.chronEnds.push([B.t, c.end]);
      }
    }
  }

  // ---------------- Équipage ----------------
  function acceptCandidates() {
    const s = S();
    for (const c of [...s.candidates]) {
      const u = st.crewUsage();
      if (u.used >= u.total) { first('habitat_full'); break; }
      // Salaire : on n'accepte que si la biomasse suit (marge après salaire)
      const bioH = st.computeRates().biomasse * H;
      const salaryH = (app.salaryPerDay ? app.salaryPerDay(c) : 0) / 24;
      if (bioH - salaryH < 5 && (s.res.biomasse || 0) < st.capOf('biomasse') * 0.5) { inc('candidate_declined_bio'); continue; }
      st.acceptCandidate(c.id);
      act('accept', c.name);
      first('first_recruit');
    }
  }
  function medical() {
    if (!S().modules.infirmerie?.level) return;
    for (const m of st.aliveCrew()) {
      if (!m.statuts?.length) continue;
      if (!(atBase(m) || m.statut === 'infirmerie')) continue;
      const r = app.soigner(m.id);
      if (r.ok && r.traitements) { act('medical', 'soigner'); first('first_treatment'); }
    }
  }

  const WISH = [
    ['generateur_solaire', 1], ['mine_surface', 1], ['hydroponie', 1], ['habitat', 1], ['balise_recrutement', 1],
    ['generateur_solaire', 2], ['mine_surface', 2], ['commandement', 2], ['laboratoire', 1], ['infirmerie', 1],
    ['hydroponie', 2], ['generateur_solaire', 3], ['atelier', 1], ['antenne', 1], ['mine_surface', 3], ['habitat', 2],
    ['silo_cryogenique', 1], ['hangar', 1], ['formation', 1], ['laboratoire', 2], ['commandement', 3], ['ambassade', 1],
    ['generateur_solaire', 4], ['hydroponie', 3], ['mine_surface', 4], ['antenne', 2], ['hangar', 2], ['habitat', 3],
    ['infirmerie', 2], ['atelier', 2], ['laboratoire', 3], ['balise_recrutement', 2], ['silo_cryogenique', 2],
    ['quartiers_residentiels', 1], ['formation', 2], ['ambassade', 2], ['commandement', 4], ['generateur_solaire', 5],
    ['mine_surface', 5], ['hydroponie', 4], ['habitat', 4],
  ];
  function nextBuildCandidates() {
    const s = S();
    const pick = [];
    const rates = st.computeRates();
    if ((st.energyRatio && st.energyRatio() < 1) || rates.energie * H < 30) pick.push('generateur_solaire', 'reacteur_fusion');
    if (rates.biomasse * H < 20) pick.push('hydroponie', 'bioreacteur');
    for (const [id, lvl] of WISH) if (st.plannedLevel(id) < lvl) pick.push(id);
    const rest = Object.keys(cat.MODULES).map(id => {
      const cur = st.plannedLevel(id);
      const d = cat.MODULES[id];
      const max = d.maxLevel + (app.techEffectsAccumulated().moduleMaxLevelDelta[id] || 0);
      if (cur >= max) return null;
      if (d.requireTech && !s.techCompleted[d.requireTech]) return null;
      if (id === 'synthetiseur_quantique') return null;
      const c = d.cost(cur + 1); const tot = Object.values(c).reduce((a, v) => a + v, 0);
      return [id, tot + (d.tier === 2 ? -400 : 0)];
    }).filter(Boolean).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    return [...new Set([...pick, ...rest])];
  }
  // Avant une longue absence (fin de session), le joueur remplit la file avec les
  // chantiers les plus longs qu'il peut payer, pour que le chantier tourne en son absence.
  function awayAhead() {
    if (!B.present(B.t + 300)) {
      let a = 300;
      while (a < 24 * H && !B.present(B.t + a)) a += 600;
      return a;
    }
    return 0;
  }
  function build() {
    const s = S();
    let guard = 0;
    if (awayAhead() >= 3 * H) {
      while (guard++ < 4 && (!s.build || (s.buildQueue || []).length < (st.BUILD_QUEUE_MAX || 3))) {
        const ok = nextBuildCandidates().map(id => [id, st.canBuild(id)]).filter(([, r]) => r.ok).sort((a, b) => b[1].time - a[1].time);
        if (!ok.length) break;
        st.enqueueBuild(ok[0][0]); act('build', `${ok[0][0]}:${ok[0][1].nextLevel} (absence)`);
      }
      return;
    }
    while (guard++ < 4 && (!s.build || (s.buildQueue || []).length < (st.BUILD_QUEUE_MAX || 3))) {
      let done = false;
      for (const id of nextBuildCandidates()) {
        const r = st.canBuild(id);
        if (r.ok) { st.enqueueBuild(id); act('build', `${id}:${r.nextLevel}`); done = true; break; }
        if (/Requiert|Niveau max|File|alien/.test(r.why)) continue;   // prérequis, ou datacubes alien (rapportés par l'exploration)
        // Coût au-dessus du stockage actuel : il faut d'abord agrandir le stockage
        const cost = cat.MODULES[id]?.cost(st.plannedLevel(id) + 1) || {};
        const caps = st.capsAll();
        if (Object.entries(cost).some(([k, v]) => caps[k] !== undefined && v > caps[k])) { inc('above_cap:' + id); continue; }
        // ressources insuffisantes : le joueur économise pour ce chantier
        inc('build_wait:' + r.why);
        return;
      }
      if (!done) return;
    }
  }

  const RESEARCH_PRIO = ['tech_hydroponie_avancee', 'tech_metallurgie', 'tech_circuiterie', 'tech_pharmacopee', 'tech_silos_basiques', 'tech_serres_etanches'];
  function research() {
    const s = S();
    if (!s.modules.laboratoire?.level) return;
    let guard = 0;
    while (guard++ < 3) {
      const ids = Object.keys(cat.TECH_TREE).filter(id => !s.techCompleted[id] && !app.isTechResearching(id) && !(app.isTechQueued && app.isTechQueued(id)));
      const ok = ids.filter(id => app.canResearch(id).ok);
      if (!ok.length) {
        if ((s.research || []).length < (app.researchSlots ? app.researchSlots() : 1)) {
          for (const id of ids) { const why = app.canResearch(id).reason || ''; inc('research_blocked:' + why.replace(/\(.*\)/, '').replace(/«.*»/, '').trim().slice(0, 50)); }
        }
        return;
      }
      ok.sort((a, b) => {
        const pa = RESEARCH_PRIO.indexOf(a), pb = RESEARCH_PRIO.indexOf(b);
        if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
        return cat.TECH_TREE[a].cost.datacubes - cat.TECH_TREE[b].cost.datacubes;
      });
      const r = (app.enqueueResearch || app.startResearch)(ok[0]);
      if (r && r.ok === false) return;
      act('research', ok[0]);
      first('first_research_started');
    }
  }

  function usefulItems() {
    if (B._useful) return B._useful;
    const used = new Set();
    for (const sc of cat.SCENES || []) for (const c of sc.choices || []) { if (c.req?.item) used.add(c.req.item); if (c.consume?.item) used.add(c.consume.item); }
    for (const id in cat.ITEMS) if (cat.ITEMS[id].combat) used.add(id);
    B._useful = used; return used;
  }
  function fabricate() {
    const s = S();
    if (!s.modules.atelier?.level) return;
    let guard = 0;
    while (guard++ < 3) {
      const caps = st.capsAll();
      const cands = Object.keys(cat.FABRICATIONS).filter(id => {
        const f = cat.FABRICATIONS[id];
        if (!usefulItems().has(f.produces) || (s.inventory?.[f.produces] || 0) >= 2) return false;
        if (!app.canFabricate(id).ok) return false;
        for (const k in f.cost) if (s.res[k] - f.cost[k] < caps[k] * 0.25) return false;   // ne pas affamer les chantiers
        return true;
      }).sort((a, b) => (s.inventory?.[cat.FABRICATIONS[a].produces] || 0) - (s.inventory?.[cat.FABRICATIONS[b].produces] || 0));
      if (!cands.length) return;
      app.startFabrication(cands[0]);
      act('fab', cands[0]);
    }
  }
  function vessel() {
    const s = S();
    if (s.vesselBuild) return;
    for (const v of ['navette', 'cargo', 'vedette', 'emissaire', 'cuirasse']) {
      const r = app.canBuildVessel(v);
      if (r.ok) { app.startVesselBuild(v); act('vessel', v); first('first_vessel_started'); return; }
    }
  }

  const ITEM_PRIO = id => {
    const d = cat.ITEMS[id]; if (!d) return 99;
    if (d.combat && !d.combat.aoe && !d.combat.heal) return 0;
    if (d.combat?.heal || id === 'kit_medical') return 1;
    if (d.combat?.aoe) return 2;
    if (d.type === 'tool') return 3;
    if (d.type === 'consumable') return 4;
    return 99;
  };
  function launchExpeditions() {
    const s = S();
    for (const ship of s.fleet.filter(v => v.available)) {
      const vdef = cat.VESSELS[ship.type];
      const alive = st.aliveCrew();
      // garder au moins un colon à la base (et le soignant de l'infirmerie)
      const pool = alive.filter(m => atBase(m) && !app.isTreatingDoctor(m.id) && !(m.statuts || []).length
        && !(app.memberAssignment(m.id)?.modKey === 'infirmerie'));
      if (pool.length < 2) return;
      const targeted = new Set(s.expeditions.map(e => e.bodyId));
      const cands = [];
      for (const sys of s.galaxy.systems) {
        if (!sys.scanned) continue;
        for (const b of sys.bodies) {
          if (targeted.has(b.id)) continue;
          let prio;
          if (b.chronicle && !b.chronicle.completed && app.currentChronicleEpisode(b)) prio = 0;
          else if (b.chronicle && !b.chronicle.completed) continue;
          else if (!b.visited) prio = 1;
          else if (typeof b.lootedAt !== 'number' || s.meta.gameMin - b.lootedAt > 2 * 86400) prio = 2;
          else continue;
          cands.push([prio, sys.distance, b]);
        }
      }
      if (!cands.length) { inc('no_destination'); first('no_destination'); return; }
      cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const n = Math.min(vdef.places, pool.length - (alive.length > 3 ? 1 : 0), Math.max(2, Math.min(4, Math.floor(alive.length / 2))));
      if (n < 1) return;
      const want = ['pilotage', 'combat', 'science', 'medecine', 'linguistique', 'ingenierie', 'survie'];
      const crew = [];
      for (const sk of want) {
        if (crew.length >= n) break;
        const best = pool.filter(m => !crew.includes(m)).sort((a, b) => (b.skills[sk] || 0) - (a.skills[sk] || 0))[0];
        if (best && (best.skills[sk] || 0) > 0) crew.push(best);
      }
      for (const m of pool) { if (crew.length >= n) break; if (!crew.includes(m)) crew.push(m); }
      const inv = Object.entries(s.inventory || {}).filter(([id, c]) => c > 0 && ITEM_PRIO(id) < 99).sort((a, b) => ITEM_PRIO(a[0]) - ITEM_PRIO(b[0]));
      const equipment = {}; let slots = vdef.equipSlots || 0;
      for (const [id, c] of inv) { if (slots <= 0) break; const k = Math.min(c, ITEM_PRIO(id) === 0 ? Math.min(crew.length, c) : 1, slots); if (k > 0) { equipment[id] = k; slots -= k; } }
      for (const [prio, , b] of cands.slice(0, 6)) {
        const r = app.canLaunchExpedition({ vesselId: ship.id, bodyId: b.id, crewIds: crew.map(m => m.id) });
        if (!r.ok) { inc('exp_blocked:' + r.why.replace(/\d+/g, 'N').slice(0, 40)); continue; }
        app.launchExpedition({ vesselId: ship.id, bodyId: b.id, crewIds: crew.map(m => m.id), equipment });
        act('expedition', `${b.name}|p${prio}|${r.totalMin}s`);
        inc('exp_duration_total', r.totalMin); inc('exp_count');
        first('first_expedition_launched');
        break;
      }
    }
  }

  const TRAIN_NEEDS = [['science', 2], ['medecine', 2], ['ingenierie', 2], ['linguistique', 2], ['combat', 2], ['pilotage', 2], ['science', 3], ['medecine', 3], ['linguistique', 3], ['ingenierie', 3], ['pilotage', 3], ['medecine', 4], ['science', 4], ['linguistique', 4]];
  function training() {
    const s = S();
    const lvl = s.modules.formation?.level || 0;
    if (!lvl || s.training.length >= lvl) return;
    const alive = st.aliveCrew();
    for (const [sk, min] of TRAIN_NEEDS) {
      const have = alive.filter(m => (m.skills[sk] || 0) >= min).length;
      const wantN = (sk === 'medecine' || sk === 'science') && min <= 3 ? 2 : 1;
      if (have >= wantN) continue;
      const cand = alive.filter(m => atBase(m) && (m.skills[sk] || 0) < min && (m.skills[sk] || 0) < lvl + 1 && !(m.statuts || []).length && !app.isTreatingDoctor(m.id))
        .sort((a, b) => (b.skills[sk] || 0) - (a.skills[sk] || 0))[0];
      if (!cand) continue;
      const r = app.canTrain(cand.id, sk);   // V1 : sans désaffectation
      if (r.ok) { app.startTraining(cand.id, sk); act('training', `${sk}->${min}`); first('first_training'); return; }
      inc('train_blocked:' + r.reason.replace(/\d+/g, 'N').slice(0, 50));
    }
  }
  function diplomacy() {
    const s = S();
    for (const f of Object.values(s.factions || {})) {
      const ft = DAF.FACTION_TYPES[f.type];
      if (!(s.diplomaticMissions || []).some(d => d.factionId === f.id) && (s.diplomaticMissions || []).length < Math.max(1, s.modules.ambassade?.level || 0)) {
        const m = st.aliveCrew().find(m => atBase(m) && !app.isTreatingDoctor(m.id) && ((m.skills[ft.missionReqSkill] || 0) >= ft.missionReqMin || (ft.missionReqAlt && (m.skills[ft.missionReqAlt.skill] || 0) >= ft.missionReqAlt.min)));
        if (m && (s.res.biomasse || 0) > (ft.missionCost || 25) + 50) { app.launchDiplomaticMission(f.id, m.id); act('diplomacy', f.type); first('first_diplo_mission'); }
      }
      const caps = st.capsAll();
      if (!f.lastGift || s.meta.gameMin - f.lastGift >= (ft.giftCooldown || 43200)) {
        const gi = (ft.giftOptions || []).map((g, i) => [g, i]).filter(([g]) => s.res[g.resource] - g.amount > caps[g.resource] * 0.5).sort((a, b) => b[0].repGain - a[0].repGain)[0];
        if (gi) { app.offerGift(f.id, gi[1]); act('gift', f.type); }
      }
      if (!f.tradeActive && app.tradeRequirement(f).ok) { app.toggleFactionTrade(f.id); act('trade', f.type); }
    }
  }
  // Postes clés tenus par un joueur raisonnable (le médecin est géré par l'auto-affectation)
  const KEY_POSTS = [['laboratoire', 0], ['atelier', 0], ['formation', 0]];
  function staffing() {
    for (const [mod, idx] of KEY_POSTS) {
      const job = app.jobsForModule(mod)[idx];
      if (!job || app.memberAt(mod, idx)) continue;
      const key = job.req?.skill?.key;
      const c = st.aliveCrew().filter(m => m.statut === 'libre' && app.isEligibleForJob(m, job))
        .sort((a, b) => (key ? (a.skills[key] || 0) - (b.skills[key] || 0) : 0))[0]
        || st.aliveCrew().filter(m => m.statut === 'travail' && app.isEligibleForJob(m, job)
          && !['infirmerie', 'commandement', 'laboratoire'].includes(app.memberAssignment(m.id)?.modKey))[0];
      if (c) { app.assignMember(c.id, mod, idx); act('staffing', `${mod}:${idx}`); app.autoAssignAllFreeMembers({ respectChoice: true }); }
    }
  }

  // ---------------- Boucle ----------------
  B.run = (nTicks) => {
    const t0 = performance.now();
    const OFF = K.OFFLINE_MAX_HOURS * 3600;
    for (let i = 0; i < nTicks; i++) {
      const present = B.present(B.t);
      if (!present) {
        if (B.absenceStart === null) B.absenceStart = B.t;
        B.absentRun = (B.absentRun || 0) + 1;
        if (B.absentRun > OFF) { B.t++; B.lostOfflineTicks++; continue; }
      } else {
        // Retour d'absence : événement garanti (comme à la fin d'un rattrapage)
        if (B.absenceStart !== null && B.t - B.absenceStart >= 2 * H && app.guaranteeReturnEvent) {
          try { if (app.guaranteeReturnEvent()) inc('return_event'); } catch (e) { B.notes.push('retour: ' + e.message); }
        }
        B.absenceStart = null;
        B.absentRun = 0;
      }
      const pendBefore = (S().pendingDecisions || []).length;
      st.tickOnce({ silent: !present });
      B.t++;
      if (present) B.presentTicks++; else B.absentTicks++;
      const q = S().pendingDecisions || [];
      if (q.length > pendBefore) {
        const d = q[q.length - 1];
        if (d.kind === 'event') { B.eventIds[d.refId] = (B.eventIds[d.refId] || 0) + 1; first('first_event'); }
        else { B.incidentIds[d.refId] = (B.incidentIds[d.refId] || 0) + 1; first('first_incident'); }
      }
      if (B.t % 10 === 0) {
        const caps = st.capsAll();
        const s = S();
        for (const k of RES) {
          if (s.res[k] >= caps[k] - 0.5) B.capTicks[k] = (B.capTicks[k] || 0) + 10;
          if (s.res[k] <= 0.5) B.zeroTicks[k] = (B.zeroTicks[k] || 0) + 10;
        }
        if (st.energyRatio && st.energyRatio() < 0.999) B.energyShortTicks += 10;
        const key = present ? 'present' : 'absent';
        if (!s.build) B.buildIdle[key] += 10;
        if (s.modules.laboratoire?.level) { B.labTicks[key] += 10; if (!(s.research || []).length) B.labIdle[key] += 10; }
      }
      if (present && B.t % cfg.step === 0) {
        const run = (name, fn) => { try { fn(); } catch (e) { if (B.notes.length < 60) B.notes.push(`${name}: ${e.message}`); } };
        run('décisions', resolveDecisions);
        run('expéditions', playExpeditions);
        run('candidats', acceptCandidates);
        if (B.t % 60 === 0) run('postes', staffing);
        run('soins', medical);
        run('chantiers', build);
        run('recherche', research);
        run('vaisseaux', vessel);
        run('lancement', launchExpeditions);
        run('atelier', fabricate);
        run('formation', training);
        run('diplomatie', diplomacy);
      }
      if (B.t % 30 === 0) scanJournal();
      if (B.t % 120 === 0) scanState();
      if (B.t % (B.t <= 7200 ? 300 : 3600) === 0) sample(present ? 'present' : 'absent');
    }
    return { ms: performance.now() - t0, t: B.t, gameMin: S().meta.gameMin };
  };
  B.finish = () => {
    scanJournal(); scanState(); sample('fin');
    for (const m of S().crew) if (m.statut === 'mort') B.deaths.push([m.diedAt, m.name, m.deathCause || null]);
    B.techCount = Object.keys(S().techCompleted || {}).length;
    B.modLevels = Object.values(S().modules).reduce((a, m) => a + (m?.level || 0), 0);
    B.crewAlive = st.aliveCrew().length;
    B.chronDone = S().galaxy.systems.reduce((n, sys) => n + sys.bodies.filter(b => b.chronicle?.completed).length, 0);
    B.factions = Object.keys(S().factions || {}).length;
  };
  sample('start');
  return true;
}

// ------------------------------------------------------------------
// Rapport (tableau comparatif)
// ------------------------------------------------------------------
function H(t) {
  if (t === undefined || t === null) return '—';
  if (t < 3600) return `${Math.round(t / 60)} min`;
  if (t < 86400 * 2) return `${(t / 3600).toFixed(1)} h`;
  return `${(t / 86400).toFixed(1)} j`;
}
export function metrics(d) {
  const days = d.hours / 24;
  const capPct = k => Math.round(100 * (d.capTicks[k] || 0) / (d.hours * 3600));
  const absent = d.absentTicks || 1;
  const pctIdle = (o, base) => base ? Math.round(100 * o / base) : null;
  return {
    '1re expédition': H(d.firsts.first_expedition_launched),
    '1re scène': H(d.firsts.first_scene),
    '1er colon recruté': H(d.firsts.first_recruit),
    '10 techs': H(d.firsts.techs_10), '20 techs': H(d.firsts.techs_20), '30 techs': H(d.firsts.techs_30),
    '40 niv. modules': H(d.firsts.module_levels_40), '80 niv. modules': H(d.firsts.module_levels_80),
    '1re chronique finie': H(d.firsts.chronicles_done_1), '3 chroniques finies': H(d.firsts.chronicles_done_3),
    '1re faction': H(d.firsts.faction_any),
    'fin : techs / niv. modules / colons': `${d.techCount} / ${d.modLevels} / ${d.crewAlive}`,
    'chroniques finies': d.chronDone,
    'morts (dont sans cause)': `${d.deaths.length} (${d.deaths.filter(x => !x[2]).length})`,
    'incidents auto / jour': (d.autoIncidents / days).toFixed(1),
    'décisions vues / jour': (d.decisionsLive / days).toFixed(1),
    'au plafond métal / cristal / biomasse / datacubes': ['metal', 'cristal', 'biomasse', 'datacubes'].map(k => capPct(k) + ' %').join(' / '),
    'énergie en pénurie': Math.round(100 * (d.energyShortTicks || 0) / (d.hours * 3600)) + ' %',
    'chantier à l\'arrêt (absences)': d.absentTicks ? pctIdle(d.buildIdle.absent, absent) + ' %' : '—',
    'labo vide (absences)': d.labTicks?.absent ? pctIdle(d.labIdle.absent, d.labTicks.absent) + ' %' : '—',
    'expéditions (durée moy. A/R)': `${d.counts.exp_count || 0} (${d.counts.exp_count ? Math.round((d.counts.exp_duration_total || 0) / d.counts.exp_count / 60) + ' min' : '—'})`,
    'combats (victoires)': `${d.combats} (${d.combatWins})`,
    'erreurs de page': (d.pageErrors || []).length,
  };
}
function report(runs) {
  const cols = runs.map(r => `${r.d.scenario}${r.d.tag ? '·' + r.d.tag : ''} s${r.d.seed}`);
  const ms = runs.map(r => metrics(r.d));
  const keys = Object.keys(ms[0] || {});
  const out = ['| mesure | ' + cols.join(' | ') + ' |', '|---|' + cols.map(() => '---').join('|') + '|'];
  for (const k of keys) out.push(`| ${k} | ` + ms.map(m => m[k]).join(' | ') + ' |');
  return out.join('\n');
}

// ------------------------------------------------------------------
// Exécution
// ------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  // Math.random reproductible (graine par exécution)
  await ctx.addInitScript(seed => {
    let a = seed >>> 0;
    Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }, (SEED * 2654435761) >>> 0);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => !!document.querySelector('#gameTime')?.textContent, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(installBot, { scenario: SCEN, step: 5 });
  const total = HOURS * 3600;
  let done = 0; const tStart = Date.now();
  while (done < total) {
    const n = Math.min(3600, total - done);
    await page.evaluate(n => window.__bot.run(n), n);
    done += n;
    if (!QUIET && (done / 3600) % 24 === 0) process.stderr.write(`[${SCEN} s${SEED}] ${done / 3600} h simulées (${((Date.now() - tStart) / 1000).toFixed(0)} s)\n`);
  }
  await page.evaluate(() => window.__bot.finish());
  const data = await page.evaluate(() => { const { run, present, finish, ...rest } = window.__bot; return JSON.parse(JSON.stringify(rest)); });
  data.pageErrors = [...new Set(errs)].slice(0, 20);
  Object.assign(data, { scenario: SCEN, seed: SEED, hours: HOURS, tag: process.env.TAG || '' });
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(data));
  const m = metrics(data);
  console.log(`# ${SCEN} graine ${SEED} — ${HOURS} h simulées`);
  for (const [k, v] of Object.entries(m)) console.log(`${k} : ${v}`);
  if (data.notes?.length) console.log('notes :', data.notes.slice(0, 8).join(' | '));
  if (data.pageErrors.length) console.log('erreurs :', data.pageErrors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  server.close();
}
