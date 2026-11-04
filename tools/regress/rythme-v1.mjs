#!/usr/bin/env node
// tools/regress/rythme-v1.mjs — V1 : rythme en temps réel, files, économie, début de partie.
//   - table PACING : chantiers exponentiels (≈1 min → 10-20 min → 1-2 h → 4-8 h), recherche ×4
//   - file de 3 chantiers (coût payé à l'ajout, rendu à l'annulation), 1 recherche en file
//   - partie neuve : 3 colons affectés, vedette prête, faction à portée, 1re expédition immédiate
//   - économie : filet du Centre de commandement, entretien proportionnel, pénurie d'énergie,
//     salaires, plafonds qui suivent les modules
//   - combat résolu en un geste ; calendrier en jours réels
// Usage : NODE_PATH=$(npm root -g) node tools/regress/rythme-v1.mjs
import { banc } from './_banc.mjs';

const b = await banc({ timeoutMs: 60000 });
const { check } = b;
const page = await b.page();
await page.goto(b.base);
await b.waitGame(page);

try {
  console.log('1. Table PACING et durées');
  const d = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const K = await import('./src/constants.js');
    st.setSimPaused(true);
    const bt = (id, l) => st.buildTime(id, l);
    return {
      mine: [1, 4, 6, 8].map(l => bt('mine_surface', l)),
      habitat8: bt('habitat', 8),
      tier1: app.researchDuration('tech_metallurgie'), tier4: app.researchDuration('tech_warp'),
      queueMax: st.BUILD_QUEUE_MAX, rq: K.PACING.RESEARCH_QUEUE_MAX, year: K.YEAR_IN_GAME_MIN,
      cal: st.calendarOf(2 * 86400 + 3 * 3600 + 25 * 60), cal0: st.calendarOf(0)
    };
  });
  const [m1, m4, m6, m8] = d.mine;
  check(m1 >= 30 && m1 <= 120, `chantier niv 1 ≈ 1 min (${m1} s)`);
  check(m4 >= 600 && m4 <= 1200, `niv 4 entre 10 et 20 min (${Math.round(m4 / 60)} min)`);
  check(m6 >= 3600 && m6 <= 7200, `niv 6 entre 1 et 2 h (${(m6 / 3600).toFixed(1)} h)`);
  check(m8 >= 4 * 3600 && m8 <= 8 * 3600 && d.habitat8 <= 8 * 3600, `niv 8 entre 4 et 8 h (${(m8 / 3600).toFixed(1)} h, habitat ${(d.habitat8 / 3600).toFixed(1)} h)`);
  check(d.tier1 >= 30 * 60 && d.tier1 <= 50 * 60 && d.tier4 >= 4 * 3600 && d.tier4 <= 5 * 3600, `recherche : tier 1 ${Math.round(d.tier1 / 60)} min, tier 4 ${(d.tier4 / 3600).toFixed(1)} h`);
  check(d.queueMax === 3 && d.rq === 1, 'file de 3 chantiers et 1 recherche');
  check(d.year === 7 * 86400, '1 an de vie = 7 jours réels');
  check(d.cal.jour === 3 && d.cal.heure === 3 && d.cal.minute === 25 && d.cal0.jour === 1, `calendrier : Jour ${d.cal.jour} ${d.cal.heure} h ${d.cal.minute}`);

  console.log('2. Partie neuve');
  const g = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    st.setS(st.freshState());
    app.autoAssignAllFreeMembers();
    const S = st.S;
    const roles = S.crew.map(m => m.startRole).sort().join(',');
    const scanned = S.galaxy.systems.filter(s => s.scanned);
    const civ = scanned.some(s => s.bodies.some(b => b.vie === 'civ_active'));
    const home = scanned[0].bodies[0];
    const r = app.canLaunchExpedition({ vesselId: S.fleet[0]?.id, bodyId: home.id, crewIds: S.crew.slice(0, 2).map(m => m.id) });
    // un chantier pour chaque colon : tout le monde a un poste
    for (const id of ['generateur_solaire', 'mine_surface', 'hydroponie']) S.modules[id] = { level: 1 };
    app.autoAssignAllFreeMembers({ respectChoice: true });
    const medicFree = S.crew.find(m => m.startRole === 'medecin');
    S.modules.infirmerie = { level: 1 };
    app.autoAssignAllFreeMembers({ respectChoice: true });
    return {
      crew: S.crew.length, roles, vedette: S.fleet[0]?.type === 'vedette' && S.fleet[0].available,
      pilotPost: app.memberAssignment(S.crew.find(m => m.startRole === 'pilote').id)?.modKey,
      civ, launch: r.ok, launchWhy: r.why, oneWay: r.oneWayMin, total: r.totalMin,
      allWorking: S.crew.every(m => m.statut === 'travail'),
      medicInInfirmary: app.memberAssignment(medicFree.id)?.modKey === 'infirmerie',
      cmdProd: S.res && st.computeRates().metal > 0 && st.computeRates().cristal > 0
    };
  });
  check(g.crew === 3 && g.roles === 'ingenieur,medecin,pilote', `3 colons complémentaires (${g.roles})`);
  check(g.pilotPost === 'commandement', 'la pilote prend le poste de Capitaine dès le départ');
  check(g.vedette, 'une vedette prête au départ');
  check(g.civ, 'une civilisation (faction rencontrable) dans un système connu dès le départ');
  check(g.launch && g.total >= 15 * 60 && g.total <= 45 * 60, `1re expédition possible tout de suite (${g.launchWhy || 'ok'}, A/R ${Math.round(g.total / 60)} min)`);
  check(g.allWorking && g.medicInInfirmary, 'colons affectés automatiquement, la médecin à l\'infirmerie');
  check(g.cmdProd, 'le Centre de commandement produit un filet de métal et de cristal');

  console.log('3. File de chantiers');
  const q = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    st.setS(st.freshState());
    const S = st.S;
    S.res = { metal: 900, cristal: 500, energie: 300, biomasse: 300, datacubes: 50 };
    const r = ['generateur_solaire', 'generateur_solaire', 'mine_surface', 'hydroponie', 'habitat'].map(id => st.enqueueBuild(id));
    const queued = S.buildQueue.map(x => `${x.id}:${x.targetLevel}`);
    const metalAfter = S.res.metal;
    // annuler le solaire niv 2 rend aussi… rien d'autre (pas de niveau 3 en file)
    const c = st.cancelQueuedBuild(0);
    const refunded = S.res.metal - metalAfter;
    // la file prend le relais à la fin du chantier
    S.build.doneMin = S.build.totalMin;
    st.tickOnce({ silent: true });
    const cat = await import('./src/catalog.js');
    return { oks: r.map(x => x.ok), why: r[4].why, queued, refunded, expected: cat.MODULES.generateur_solaire.cost(2).metal,
      cancel: c.ok, next: S.build?.id, left: S.buildQueue.length, solar: S.modules.generateur_solaire?.level };
  });
  check(q.oks.slice(0, 4).every(Boolean) && q.oks[4] === false && /File/.test(q.why), `1 chantier + 3 en file, le 5e refusé (${q.why})`);
  check(q.queued.join() === 'generateur_solaire:2,mine_surface:1,hydroponie:1', `niveaux en file cohérents (${q.queued.join(' ')})`);
  check(q.cancel && q.refunded === q.expected, `annulation : coût rendu (${q.refunded} métal)`);
  check(q.solar === 1 && q.next === 'mine_surface' && q.left === 1, 'fin de chantier : le suivant démarre seul');

  console.log('4. Recherche en file et durée affichée');
  const rq = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    st.setS(st.freshState());
    const S = st.S;
    S.crew = [];
    S.modules.laboratoire = { level: 1 };
    S.res.datacubes = 200;
    const a = app.enqueueResearch('tech_metallurgie');
    const b2 = app.enqueueResearch('tech_efficience_solaire');   // dépend de la recherche en cours : en file
    const c = app.enqueueResearch('tech_circuiterie');           // file pleine
    const etaNoResearcher = app.researchEta('tech_metallurgie');
    const dur = app.researchDuration('tech_metallurgie');
    const dc = S.res.datacubes;
    const cancel = app.cancelQueuedResearch(0);
    const refunded = S.res.datacubes - dc;
    app.enqueueResearch('tech_circuiterie');
    S.research[0].doneMin = S.research[0].totalMin;
    app.tickResearch();
    return { a: a.ok && !a.queued, b: b2.ok && b2.queued, c: c.ok === false, eta: etaNoResearcher, dur, cancel: cancel.ok, refunded,
      next: S.research.map(r => r.techId).join(), queue: S.researchQueue.length };
  });
  check(rq.a && rq.b && rq.c, 'une recherche en cours, une en file (même dépendante), la suivante refusée');
  check(Math.abs(rq.eta - rq.dur / 0.3) <= 2, `sans chercheur, la durée affichée reflète la vitesse réelle (${Math.round(rq.eta / 60)} min au lieu de ${Math.round(rq.dur / 60)})`);
  check(rq.cancel && rq.refunded === 60, `annulation en file : datacubes rendus (${rq.refunded})`);
  check(rq.next === 'tech_circuiterie' && rq.queue === 0, 'fin de recherche : la suivante démarre seule');

  console.log('5. Économie : entretien, pénurie, salaires, plafonds');
  const e = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const K = await import('./src/constants.js');
    st.setS(st.freshState());
    const S = st.S;
    S.crew = [];
    S.modules = { commandement: { level: 1 }, mine_surface: { level: 2 } };
    const capBefore = st.capsAll().metal;
    S.res.energie = 0;
    const r0 = st.computeRates();
    const ratio = st.energyRatio();
    const short = app.shortages();
    S.modules.generateur_solaire = { level: 3 };
    S.res.energie = 100;
    S.modules.habitat = { level: 1 };            // de la place pour la recrue
    const r1 = st.computeRates();
    const c = st.genCandidate(); c.salary = 5;
    S.autoAssign = false;
    S.candidates.push(c); st.acceptCandidate(c.id);
    const r2 = st.computeRates();
    return {
      capGrows: capBefore === K.CAP.metal + (await import('./src/catalog.js')).MODULES.mine_surface.capBonus(2).metal,
      ratio, minePenalised: r0.metal < r1.metal * 0.999, short: short.map(x => x.res).join(),
      salaryDay: app.salaryPerDay(c), bioDelta: Math.round((r1.biomasse - r2.biomasse) * 86400)
    };
  });
  check(e.capGrows, 'chaque niveau de mine agrandit le stockage de métal');
  check(e.ratio < 1 && e.minePenalised && e.short.includes('energie'), `pénurie d'énergie : mine ralentie (${Math.round(e.ratio * 100)} %), alerte ${e.short}`);
  check(e.salaryDay === 200 && e.bioDelta >= 200, `salaire prélevé : ${e.salaryDay} biomasse/jour (biomasse −${e.bioDelta}/jour avec ses vivres)`);
  const up = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const K = await import('./src/constants.js');
    st.setS(st.freshState());
    const S = st.S;
    S.crew = [];
    S.modules = { commandement: { level: 1 }, generateur_solaire: { level: 8 } };
    S.res.energie = 300;
    const without = st.computeRates().energie;
    S.modules.laboratoire = { level: 2 };
    const withLab = st.computeRates().energie;
    const labFull = 5 * 2 * K.PROD_MULT;
    return { consumed: without - withLab, labFull };
  });
  check(Math.abs(up.consumed - up.labFull * 0.3) < 1e-9, `un laboratoire sans personnel consomme 30 % de son entretien (${(up.consumed / up.labFull * 100).toFixed(0)} %)`);

  console.log('6. Ouvertures : plus aucun début de partie bloqué');
  const ouv = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    // Les 7 ouvertures « naturelles » mesurées en 0.33 (3 bloquaient la partie)
    const ORDERS = [
      ['generateur_solaire', 'mine_surface', 'hydroponie'],
      ['generateur_solaire', 'hydroponie', 'habitat'],
      ['hydroponie', 'habitat'],
      ['generateur_solaire', 'hydroponie', 'generateur_solaire'],
      ['habitat', 'generateur_solaire'],
      ['generateur_solaire', 'habitat', 'hydroponie'],
      ['habitat', 'hydroponie'],
    ];
    const out = [];
    for (const order of ORDERS) {
      st.setS(st.freshState());
      const S = st.S;
      S.nextIncidentMin = 1e12; S.nextEventMin = 1e12;
      for (const id of order) {
        st.enqueueBuild(id);
        let guard = 0;
        while ((S.build || S.buildQueue.length) && guard++ < 50000) st.tickOnce({ silent: true });
      }
      // On épuise le stock, puis on attend : le filet du Centre de commandement suffit
      S.res.metal = 0; S.res.cristal = 0;
      for (let i = 0; i < 3 * 3600; i++) st.tickOnce({ silent: true });
      out.push({ order: order.join('→'), mine: st.canBuild('mine_surface').ok || (S.modules.mine_surface?.level || 0) > 0 });
    }
    return out;
  });
  check(ouv.every(o => o.mine), `7 ouvertures : la mine reste finançable en moins de 3 h même à sec (${ouv.filter(o => o.mine).length}/7)`);

  console.log('7. Combat résolu en un geste');
  const cb = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    st.setS(st.freshState());
    const S = st.S;
    for (const m of S.crew) m.statut = 'expedition';
    const exp = { id: 'e_cb', seed: 'cb', crewIds: S.crew.map(m => m.id), equipment: { kit_medical: 1 }, accumulatedLoot: {}, accumulatedItems: [],
      accumulatedLog: [], scenes: ['a', 'b', 'c'], sceneIdx: 0, phase: 'sur_place', vesselId: S.fleet[0].id };
    S.expeditions.push(exp);
    app.initCombat(exp, ['pillard', 'pillard'], { metal: 10 }, 'retreat');
    const r = app.combatAutoResolve(exp.id);
    const again = app.combatAutoResolve(exp.id);
    return { r, active: exp.combat.active, again };
  });
  check(cb.r.ok && ['victory', 'defeat', 'retreat'].includes(cb.r.outcome) && !cb.active, `combat joué jusqu'au bout (${cb.r.outcome}, ${cb.r.rounds} tours)`);
  check(cb.again.ok === false && !!cb.again.why, 'second appel refusé proprement');
  b.noErrors(page, 'aucune erreur de page');
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
