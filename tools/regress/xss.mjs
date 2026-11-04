#!/usr/bin/env node
/* global document, window */
// tools/regress/xss.mjs — non-régression du constat E5 (données de sauvegarde
// insérées sans échappement dans innerHTML).
// Usage : node tools/regress/xss.mjs
// Injecte une charge utile HTML dans tous les champs texte venant de la sauvegarde
// (noms de colons, candidats, factions, systèmes, corps, vaisseaux, origines,
// sources de découverte, effets temporaires, statuts…), rend chaque vue et chaque
// modale, puis vérifie qu'aucun script ne s'est exécuté et que le texte est
// affiché littéralement.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './lib.mjs';

const { chromium } = loadPlaywright();
const t = reporter('XSS : les données de sauvegarde sont échappées');
const srv = await startServer();
const browser = await chromium.launch();
const PAYLOAD = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';

try {
  const page = await openGame(browser, srv.base);
  await fillColony(page);

  await page.evaluate(async (P) => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    // Colons, candidats, origines, statuts
    S.crew.forEach((m, i) => {
      m.name = P + ' colon' + i;
      m.origin = { label: P, notes: P };
    });
    S.candidates.forEach(c => { c.name = P + ' candidat'; c.origin = { label: P, notes: P }; });
    S.crew[2].statut = P;
    // Galaxie : systèmes et corps
    for (const sys of S.galaxy.systems) {
      sys.name = P + ' système';
      sys.scanned = true;
      for (const b of sys.bodies) b.name = P + ' corps';
    }
    // Vaisseaux
    S.fleet.forEach(v => { v.name = P + ' vaisseau'; });
    // Factions
    const ftype = Object.keys((await import('./src/data-arcs-factions.js')).FACTION_TYPES)[0];
    S.factions = { f_x: { id: 'f_x', type: ftype, name: P + ' faction', bodyName: P, reputation: -70 } };
    S.factions.f_y = { id: 'f_y', type: ftype, name: P + ' faction2', bodyName: P, reputation: 80, tradeActive: true };
    // Découverte, effet temporaire, historique d'expédition
    const bp = Object.keys((await import('./src/catalog.js')).BLUEPRINTS)[0];
    S.discoveries = { [bp]: { firstFoundAt: 0, source: P } };
    S.activeBuffs = [{ type: 'prodMult', value: 0.8, label: P, expiresAt: S.meta.gameMin + 600 }];
    S.expHistory = [{ finishedAt: 0, bodyName: P, vesselName: P, crewCount: 2, result: { outcomeKind: 'warn', summary: P } }];
    // Expédition sur place avec combat, pour l'overlay de scène
    const free = S.crew.slice(5, 7);
    free.forEach(m => app.unassignMember(m.id));
    free.forEach(m => { m.statut = 'libre'; });
    const sys = S.galaxy.systems.find(s => s.bodies.length);
    const body = sys.bodies[0];
    const v = S.fleet[0];
    app.launchExpedition({ vesselId: v.id, bodyId: body.id, crewIds: free.map(m => m.id), equipment: {} });
    const exp = S.expeditions[S.expeditions.length - 1];
    if (exp) {
      // Arrivée sur place (génère les scènes) puis butin inattendu
      exp.elapsedMin = Math.max(0, (exp.oneWayMin || 1) - 1);
      for (let i = 0; i < 3 && exp.phase === 'aller'; i++) st.tickOnce({ silent: true });
      exp.accumulatedLoot = { [P]: P };
      exp.accumulatedItems = [P];
    }
    // Formation en cours
    const trainee = S.crew.find(m => m.statut === 'libre');
    if (trainee) {
      trainee.statut = 'formation';
      S.training.push({ id: 't_x', memberId: trainee.id, skill: 'medecine', targetLvl: 2, doneMin: 0, totalMin: 600, failChance: 0.1, cost: {}, instructorId: S.crew[0].id });
    }
    // Infirmerie
    const STAT = Object.keys(app.STATUTS)[0];
    S.crew[3].statuts.push({ key: STAT, since: 0, revealed: true, diagnosed: true });
    S.crew[3].statut = 'infirmerie';
    window.__expId = exp?.id;
  }, PAYLOAD);

  // Rend toutes les vues
  const views = [['overview'], ['modules', 'construction'], ['modules', 'assignments'],
    ['crew', 'personnel'], ['crew', 'recruit'], ['crew', 'formation'], ['crew', 'soins'],
    ['galaxy', 'cartographie'], ['galaxy', 'fleet'], ['galaxy', 'expeditions'], ['galaxy', 'diplomatie'],
    ['stocks', 'inventory'], ['stocks', 'library'], ['stocks', 'research'], ['stocks', 'workshop'],
    ['arcs'], ['journal']];
  const renderErrors = await page.evaluate(async (views) => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    for (const [tab, sub] of views) {
      ui.selectTab(tab);
      if (sub) ui.selectSubtab(tab, sub);
      ui.render();
    }
    // Cartographie : niveau système puis corps
    const sys = st.S.galaxy.systems[0];
    st.S.ui = { galaxyView: 'system', currentSystemId: sys.id };
    ui.selectTab('galaxy'); ui.selectSubtab('galaxy', 'cartographie'); ui.render();
    st.S.ui = { galaxyView: 'body', currentSystemId: sys.id, currentBodyId: sys.bodies[0].id };
    ui.render();
    return [...document.querySelectorAll('.render-error')].map(e => e.dataset.view);
  }, views);
  t.check(renderErrors.length === 0, 'toutes les vues se rendent', renderErrors.join(', '));

  const close = () => page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));
  // Modales : alertes, affectation, lancement, formation, diplomatie, renommage
  await page.evaluate(() => document.querySelector('#alertBar').click());
  await close();
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    ui.selectTab('modules'); ui.selectSubtab('modules', 'assignments');
    document.querySelector('#assignList .slot-row')?.click();
  });
  await close();
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    st.S.fleet.forEach(v => { v.available = true; });
    ui.showLaunchModal(st.S.galaxy.systems[0].bodies[0].id);
    document.querySelector('#modal [data-pick-vessel]')?.click();
    document.querySelector('#modal [data-pick-crew]')?.click();
  });
  await close();
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    st.S.crew.forEach((m, i) => { if (i > 3 && m.statut !== 'formation') m.statut = 'libre'; });
    ui.showTrainingModal();
    document.querySelector('#modal [data-pick-member]')?.click();
  });
  await close();
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    ui.selectTab('galaxy'); ui.selectSubtab('galaxy', 'diplomatie');
    document.querySelector('[data-diplo-launch]')?.click();
  });
  await close();
  await page.evaluate(async (P) => {
    const st = await import('./src/state.js');
    st.S.meta.colonyName = P;
    document.querySelector('#btnRename').click();
  }, PAYLOAD);
  const inputValue = await page.evaluate(() => document.querySelector('#modalInput')?.value);
  t.check(inputValue === PAYLOAD, 'le champ de renommage affiche le nom tel quel');
  await close();

  // Overlay de scène, puis combat
  const sceneOk = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    ui.selectTab('galaxy'); ui.selectSubtab('galaxy', 'expeditions');
    const btn = document.querySelector(`[data-resume-exp="${window.__expId}"]`);
    if (!btn) return 'pas de bouton Reprendre';
    btn.click();
    const shown = document.querySelector('#sceneOverlay').classList.contains('show');
    document.querySelector('[data-action-scene="close"]')?.click();
    return shown ? 'ok' : 'overlay non affiché';
  });
  t.check(sceneOk === 'ok', 'overlay de scène rendu', sceneOk);
  const combatOk = await page.evaluate(async (P) => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const exp = st.S.expeditions.find(e => e.id === window.__expId);
    exp.combat = {
      active: true, round: P, phase: 'player', selectedAllyId: 'a1', log: ['début'],
      allies: [{ id: 'a1', name: P, hp: 10, maxHp: 10, pa: 2, maxPa: 2, effects: [], maxShieldHp: 5, shieldHp: 5, weaponType: P }],
      enemies: [{ nom: P, hp: 5, maxHp: 5, armor: P }],
    };
    ui.render();
    const btn = document.querySelector(`[data-resume-exp="${window.__expId}"]`);
    btn?.click();
    const shown = document.querySelector('#sceneOverlay').classList.contains('show') && !!document.querySelector('.cbt-arena');
    return shown ? 'ok' : 'combat non affiché';
  }, PAYLOAD);
  t.check(combatOk === 'ok', 'overlay de combat rendu', combatOk);

  await page.waitForTimeout(500);   // laisse aux <img onerror> le temps de se déclencher
  const res = await page.evaluate((P) => ({
    xss: window.__xss,
    imgs: document.querySelectorAll('img[src="x"]').length,
    where: [...document.querySelectorAll('img[src="x"]')].map(i => `${i.parentElement?.className}<${i.parentElement?.parentElement?.className}`),
    literal: document.body.innerText.includes(P),
  }), PAYLOAD);
  t.check(res.xss === undefined && res.imgs === 0, 'aucun script injecté ne s\'exécute', JSON.stringify(res));
  t.check(res.literal, 'la charge utile est affichée comme du texte');
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
