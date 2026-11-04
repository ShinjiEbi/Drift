#!/usr/bin/env node
/* global document */
// tools/regress/render.mjs — non-régression du rendu (constats E7 et C2).
// Usage : node tools/regress/render.mjs
//  E7 : seule la vue active est reconstruite ; les nœuds sont conservés d'un
//       tick à l'autre (barres mises à jour sur place, clic non perdu, focus gardé).
//  C2 : une exception dans une vue ne bloque pas les autres, est journalisée
//       une seule fois et affiche un message dans la vue ; les données
//       inattendues (types inconnus) ne font pas planter le rendu.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Rendu : vue active, DOM conservé, isolation des erreurs');
const srv = await startServer();
const browser = await chromium.launch();

try {
  const page = await openGame(browser, srv.base);
  await fillColony(page);

  // ---- E7 : les vues cachées ne sont pas reconstruites ----
  const hidden = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    ui.selectTab('crew'); ui.selectSubtab('crew', 'recruit');
    ui.selectTab('overview');
    const before = document.querySelector('#candidateList').innerHTML;
    st.S.candidates.push(st.genCandidate());
    ui.render();
    const whileHidden = document.querySelector('#candidateList').innerHTML;
    const badge = Number(document.querySelector('#crewBadge').textContent);
    ui.selectTab('crew');
    const shown = document.querySelector('#candidateList').innerHTML;
    return { unchanged: before === whileHidden, badge, n: st.S.candidates.length, updated: shown !== whileHidden };
  });
  t.check(hidden.unchanged, 'une vue cachée n\'est pas reconstruite par render()');
  t.check(hidden.badge === hidden.n, 'les badges d\'onglets restent à jour', `badge ${hidden.badge}, candidats ${hidden.n}`);
  t.check(hidden.updated, 'la vue est rendue dès qu\'on l\'affiche');

  // ---- E7 : barre de progression mise à jour sans recréer les nœuds ----
  const bars = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    st.S.build = { id: 'habitat', targetLevel: 2, totalMin: 100000, doneMin: 10 };
    ui.selectTab('overview');
    ui.render();
    const bar = document.querySelector('#buildSlot .bar');
    const w0 = bar.style.width;
    for (let i = 0; i < 20; i++) { st.tickOnce({ silent: true }); st.S.build.doneMin += 500; ui.render(); }
    const bar2 = document.querySelector('#buildSlot .bar');
    st.S.build = null;
    ui.render();
    return { same: bar === bar2, moved: bar2.style.width !== w0 };
  });
  t.check(bars.same && bars.moved, 'la barre de progression est mise à jour sur place', JSON.stringify(bars));

  // ---- E7 : un clic n'est pas perdu si un tick survient entre l'appui et le relâchement ----
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    const m = S.crew.find(c => c.statut === 'libre') || S.crew[0];
    m.statut = 'formation';
    S.training.push({ id: 't_regress', memberId: m.id, skill: 'medecine', targetLvl: 2, doneMin: 0, totalMin: 100000, failChance: 0.1, cost: {} });
    ui.selectTab('crew'); ui.selectSubtab('crew', 'formation');
  });
  const btn = page.locator('#formationList button[data-cancel="t_regress"]');
  await btn.scrollIntoViewIfNeeded();
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    for (let i = 0; i < 3; i++) { st.S.training.find(x => x.id === 't_regress').doneMin += 1000; ui.render(); }
  });
  await page.mouse.up();
  const cancelled = await page.evaluate(async () => !(await import('./src/state.js')).S.training.some(x => x.id === 't_regress'));
  t.check(cancelled, 'clic conservé malgré un rendu pendant l\'appui (formation interrompue)');

  // ---- E7 : le focus clavier reste sur le bouton après plusieurs ticks ----
  const focus = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    ui.selectTab('modules'); ui.selectSubtab('modules', 'assignments');
    const b = document.querySelector('#optimizeAssignBtn');
    b.focus();
    for (let i = 0; i < 5; i++) { st.tickOnce({ silent: true }); ui.render(); }
    return document.activeElement === b && b.isConnected;
  });
  t.check(focus, 'le focus clavier survit aux ticks');

  // ---- C2 : une vue qui lève une exception n'arrête pas les autres ----
  const before = page.errors.length;
  const iso = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    const victim = S.crew[0];
    const realName = victim.name;
    Object.defineProperty(victim, 'name', { configurable: true, get() { throw new Error('nom illisible (test)'); } });
    ui.selectTab('crew'); ui.selectSubtab('crew', 'personnel');
    const clock0 = document.querySelector('#gameTime').textContent;
    let threw = false;
    for (let i = 0; i < 5; i++) {
      try { st.tickOnce({ silent: true }); ui.render(); } catch { threw = true; }
    }
    const errBox = !!document.querySelector('#subview-personnel > .render-error');
    const clockMoved = document.querySelector('#gameTime').textContent !== clock0;
    ui.selectTab('journal');
    const journalOk = document.querySelectorAll('#journalList li').length > 0 && !document.querySelector('#view-journal > .render-error');
    // Réparation : le message disparaît au rendu suivant
    Object.defineProperty(victim, 'name', { configurable: true, writable: true, value: realName });
    ui.selectTab('crew');
    const recovered = !document.querySelector('#subview-personnel > .render-error');
    return { threw, errBox, clockMoved, journalOk, recovered };
  });
  const logged = page.errors.slice(before).filter(e => /nom illisible/.test(e)).length;
  t.check(!iso.threw, 'render() ne propage pas l\'exception d\'une vue');
  t.check(iso.errBox, 'la vue en erreur affiche un message');
  t.check(iso.clockMoved && iso.journalOk, 'l\'horloge et les autres vues continuent de se mettre à jour');
  t.check(logged === 1, 'l\'erreur est journalisée une seule fois', `${logged} fois`);
  t.check(iso.recovered, 'le message disparaît quand la vue se rend de nouveau');

  // ---- C2 : données inattendues (types inconnus) ----
  page.errors.length = 0;
  const odd = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    const sys = S.galaxy.systems.find(s => s.scanned) || S.galaxy.systems[0];
    sys.bodies[0].type = 'type_inconnu';
    S.fleet.push({ id: 'v_bad', type: 'vaisseau_inconnu', name: 'Bizarre', available: true });
    const m = S.crew[1];
    m.stats.stat_inconnue = 4;
    m.statuts.push({ key: 'statut_inconnu', since: 0, revealed: true, diagnosed: true });
    m.statut = 'formation';
    S.training.push({ id: 't_bad', memberId: m.id, skill: 'competence_inconnue', targetLvl: 2, doneMin: 0, totalMin: 600, failChance: 0, cost: {} });
    S.factions = S.factions || {};
    S.factions.f_bad = { id: 'f_bad', type: 'faction_inconnue', name: 'Inconnus', reputation: 0, bodyName: '?' };
    S.expHistory.unshift({ finishedAt: 0, bodyName: 'X', vesselName: 'Y', crewCount: 1 });
    const views = [['crew', 'personnel'], ['crew', 'formation'], ['crew', 'soins'], ['galaxy', 'fleet'], ['galaxy', 'expeditions'], ['galaxy', 'diplomatie']];
    for (const [tab, sub] of views) { ui.selectTab(tab); ui.selectSubtab(tab, sub); ui.render(); }
    ui.selectTab('galaxy'); ui.selectSubtab('galaxy', 'cartographie');
    S.ui = { galaxyView: 'system', currentSystemId: sys.id };
    ui.render();
    S.ui = { galaxyView: 'body', currentSystemId: sys.id, currentBodyId: sys.bodies[0].id };
    ui.render();
    return [...document.querySelectorAll('.render-error')].map(e => e.dataset.view);
  });
  t.check(odd.length === 0 && page.errors.length === 0, 'les types inconnus s\'affichent sans erreur', `vues en erreur : ${odd.join(', ')} ; ${page.errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
