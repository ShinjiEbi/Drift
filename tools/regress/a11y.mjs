#!/usr/bin/env node
/* global document */
// tools/regress/a11y.mjs — non-régression des constats F14 / M5-UI (accessibilité).
// Usage : node tools/regress/a11y.mjs
//  - modale : role="dialog", focus initial, Tab bloqué à l'intérieur, Échap ferme
//    si une sortie existe (mais pas une décision obligatoire), Entrée valide le
//    champ de renommage, le focus revient sur le bouton d'origine ;
//  - toast annoncé (aria-live) ;
//  - cartes et lignes cliquables : role="button", tabindex, activation au clavier ;
//  - onglets : role="tablist", aria-selected, flèches gauche/droite ;
//  - arrière-plan inerte sous la modale et sous l'overlay de scène.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './lib.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Accessibilité : modale, clavier, rôles');
const srv = await startServer();
const browser = await chromium.launch();
const shown = page => page.evaluate(() => document.querySelector('#modalBg').classList.contains('show'));

try {
  const page = await openGame(browser, srv.base, { width: 1280, height: 800 });
  await fillColony(page);
  await page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));

  // Renommer au clavier : Entrée ouvre, le champ a le focus, Entrée valide, le focus revient
  await page.focus('#btnRename');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const dlg = await page.evaluate(() => {
    const m = document.querySelector('#modal');
    const title = document.getElementById(m.getAttribute('aria-labelledby') || '')?.textContent;
    return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), title, focus: document.activeElement?.id, appInert: document.querySelector('#app').hasAttribute('inert') };
  });
  t.check(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.title === 'Renommer la colonie', 'la modale est un dialogue titré', JSON.stringify(dlg));
  t.check(dlg.focus === 'modalInput', 'le champ reçoit le focus à l\'ouverture', dlg.focus);
  t.check(dlg.appInert, 'l\'arrière-plan est inerte pendant la modale');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Nouvelle Aube');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const after = await page.evaluate(async () => ({
    name: (await import('./src/state.js')).S.meta.colonyName,
    focus: document.activeElement?.id,
    appInert: document.querySelector('#app').hasAttribute('inert'),
  }));
  t.check(!(await shown(page)) && after.name === 'Nouvelle Aube', 'Entrée dans le champ valide le renommage', JSON.stringify(after));
  t.check(after.focus === 'btnRename' && !after.appInert, 'le focus revient sur le bouton d\'origine');

  // Tab reste dans la modale ; Échap ferme quand « Annuler » existe
  await page.focus('#btnReset');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  let escaped = false;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    if (!(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement)))) escaped = true;
  }
  t.check(!escaped, 'Tab et Maj+Tab restent dans la modale');
  await page.keyboard.press('Escape');
  const afterEsc = await page.evaluate(() => ({ shown: document.querySelector('#modalBg').classList.contains('show'), focus: document.activeElement?.id }));
  t.check(!afterEsc.shown && afterEsc.focus === 'btnReset', 'Échap ferme une modale annulable et rend le focus', JSON.stringify(afterEsc));

  // Décision obligatoire (aucune sortie) : Échap ne ferme pas
  await page.evaluate(() => {
    const m = document.querySelector('#modal');
    m.innerHTML = '<h3 class="incident-title">Incident</h3><div class="incident-choices"><button class="incident-choice" data-incident-choice="0">Agir</button></div>';
    document.querySelector('#modalBg').classList.add('show');
  });
  await page.keyboard.press('Escape');
  t.check(await shown(page), 'Échap ne ferme pas une décision obligatoire');
  await page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));

  // Toast annoncé
  const live = await page.evaluate(() => document.querySelector('#toast').getAttribute('aria-live'));
  t.check(live === 'polite', 'le toast est annoncé (aria-live)');

  // Onglets : tablist, aria-selected, flèches
  await page.focus('nav.tabs button[data-tab="overview"]');
  await page.keyboard.press('ArrowRight');
  const tabs = await page.evaluate(() => ({
    role: document.querySelector('nav.tabs').getAttribute('role'),
    sel: document.querySelector('nav.tabs button[aria-selected="true"]')?.dataset.tab,
    focus: document.activeElement?.dataset?.tab,
    visible: document.querySelector('#view-modules').classList.contains('active'),
  }));
  t.check(tabs.role === 'tablist' && tabs.sel === 'modules' && tabs.focus === 'modules' && tabs.visible, 'flèche droite : onglet suivant sélectionné', JSON.stringify(tabs));

  // Cartes cliquables : rôle, tabindex, activation clavier
  const roles = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const missing = [];
    const check = sel => document.querySelectorAll(sel).forEach(el => {
      if (el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0') missing.push(sel);
    });
    ui.selectTab('modules'); ui.selectSubtab('modules', 'assignments'); check('.slot-row');
    ui.selectTab('galaxy'); ui.selectSubtab('galaxy', 'cartographie'); check('.system-card');
    ui.selectTab('stocks'); ui.selectSubtab('stocks', 'workshop'); check('.fab-card.available');
    ui.selectTab('galaxy');
    return [...new Set(missing)];
  });
  t.check(roles.length === 0, 'cartes cliquables : role="button" et tabindex', roles.join(', '));
  await page.focus('.system-card');
  await page.keyboard.press('Enter');
  const sysView = await page.evaluate(async () => (await import('./src/state.js')).S.ui?.galaxyView);
  t.check(sysView === 'system', 'Entrée sur une carte de système l\'ouvre', sysView);
  // Espace sur une ligne de poste ouvre le sélecteur
  await page.evaluate(async () => { const ui = await import('./src/ui.js'); ui.selectTab('modules'); ui.selectSubtab('modules', 'assignments'); });
  await page.focus('#assignList .slot-row');
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  t.check(await shown(page), 'Espace sur un poste ouvre le sélecteur d\'affectation');
  await page.keyboard.press('Escape');
  t.check(!(await shown(page)), 'Échap ferme le sélecteur d\'affectation');

  // Modale au-dessus de l'overlay de scène : l'overlay devient inerte
  const inert = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    document.querySelector('#sceneOverlay').classList.add('show');
    ui.showModal({ title: 'T', body: 'B', onPrimary: () => {} });
    await new Promise(r => setTimeout(r, 30));
    const res = document.querySelector('#sceneOverlay').hasAttribute('inert');
    document.querySelector('#modalBg').classList.remove('show');
    await new Promise(r => setTimeout(r, 30));
    const res2 = document.querySelector('#sceneOverlay').hasAttribute('inert');
    document.querySelector('#sceneOverlay').classList.remove('show');
    return { during: res, after: res2 };
  });
  t.check(inert.during && !inert.after, 'l\'overlay de scène est inerte sous la modale, puis rétabli', JSON.stringify(inert));
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
