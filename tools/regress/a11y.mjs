#!/usr/bin/env node
/* global document */
// tools/regress/a11y.mjs — non-régression des constats F14 / M5-UI (accessibilité).
// Usage : node tools/regress/a11y.mjs
//  - modale : role="dialog", focus initial, Tab bloqué à l'intérieur, Échap ferme
//    si une sortie existe (mais pas une décision obligatoire), Entrée valide le
//    champ de renommage, le focus revient sur le bouton d'origine ;
//  - menu « ⋯ » : dialogue titré, focus dedans, Tab bloqué, Échap le ferme et
//    rend le focus au bouton ⋯, arrière-plan inerte pendant son ouverture ;
//  - toast annoncé (aria-live) ;
//  - cartes et lignes cliquables : role="button", tabindex, activation au clavier ;
//  - onglets : role="tablist", aria-selected, flèches gauche/droite ;
//  - arrière-plan inerte sous la modale et sous l'overlay de scène.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Accessibilité : modale, menu, clavier, rôles');
const srv = await startServer();
const browser = await chromium.launch();
const shown = page => page.evaluate(() => document.querySelector('#modalBg').classList.contains('show'));
const sheetShown = page => page.evaluate(() => document.querySelector('#menuBg').classList.contains('show'));

try {
  const page = await openGame(browser, srv.base, { width: 1280, height: 800 });
  await fillColony(page);
  await page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));

  // Menu « ⋯ » au clavier
  await page.focus('#menuBtn');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  const menu = await page.evaluate(() => {
    const s = document.querySelector('#menuSheet');
    return {
      role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'),
      title: document.getElementById(s.getAttribute('aria-labelledby') || '')?.textContent,
      inside: s.contains(document.activeElement),
      appInert: document.querySelector('#app').hasAttribute('inert'),
      expanded: document.querySelector('#menuBtn').getAttribute('aria-expanded'),
    };
  });
  t.check(menu.role === 'dialog' && menu.modal === 'true' && menu.title === 'Réglages', 'le menu est un dialogue titré', JSON.stringify(menu));
  t.check(menu.inside && menu.appInert && menu.expanded === 'true', 'menu ouvert : focus dedans, arrière-plan inerte', JSON.stringify(menu));
  let out = false;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    if (!(await page.evaluate(() => document.querySelector('#menuSheet').contains(document.activeElement)))) out = true;
  }
  t.check(!out, 'Tab et Maj+Tab restent dans le menu');

  // Renommer au clavier (depuis le menu) : Entrée ouvre, le champ a le focus, Entrée valide, le focus revient
  await page.focus('#btnRename');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const dlg = await page.evaluate(() => {
    const m = document.querySelector('#modal');
    const title = document.getElementById(m.getAttribute('aria-labelledby') || '')?.textContent;
    return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), title, focus: document.activeElement?.id,
      appInert: document.querySelector('#app').hasAttribute('inert'), menuInert: document.querySelector('#menuBg').hasAttribute('inert') };
  });
  t.check(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.title === 'Renommer la colonie', 'la modale est un dialogue titré', JSON.stringify(dlg));
  t.check(dlg.focus === 'modalInput', 'le champ reçoit le focus à l\'ouverture', dlg.focus);
  t.check(dlg.appInert && dlg.menuInert, 'l\'arrière-plan (jeu et menu) est inerte pendant la modale', JSON.stringify(dlg));
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Nouvelle Aube');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const after = await page.evaluate(async () => ({
    name: (await import('./src/state.js')).S.meta.colonyName,
    focus: document.activeElement?.id,
    menuInert: document.querySelector('#menuBg').hasAttribute('inert'),
  }));
  t.check(!(await shown(page)) && after.name === 'Nouvelle Aube', 'Entrée dans le champ valide le renommage', JSON.stringify(after));
  t.check(after.focus === 'btnRename' && !after.menuInert, 'le focus revient sur le bouton d\'origine (menu toujours ouvert)', JSON.stringify(after));

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

  // Échap ferme le menu et rend le focus au bouton ⋯
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => ({ focus: document.activeElement?.id, appInert: document.querySelector('#app').hasAttribute('inert') }));
  t.check(!(await sheetShown(page)) && closed.focus === 'menuBtn' && !closed.appInert, 'Échap ferme le menu, le focus revient sur ⋯', JSON.stringify(closed));

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
  await page.focus('nav.tabs button[data-tab="base"]');
  await page.keyboard.press('ArrowRight');
  const tabs = await page.evaluate(() => ({
    role: document.querySelector('nav.tabs').getAttribute('role'),
    n: document.querySelectorAll('nav.tabs button').length,
    sel: document.querySelector('nav.tabs button[aria-selected="true"]')?.dataset.tab,
    focus: document.activeElement?.dataset?.tab,
    visible: document.querySelector('#view-equipage').classList.contains('active'),
  }));
  t.check(tabs.role === 'tablist' && tabs.n === 5 && tabs.sel === 'equipage' && tabs.focus === 'equipage' && tabs.visible, 'flèche droite : onglet suivant sélectionné', JSON.stringify(tabs));
  // Sous-onglets : flèches aussi
  await page.focus('#subtab-personnel');
  await page.keyboard.press('ArrowRight');
  const sub = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.subtab, visible: document.querySelector('#subview-recrutement').classList.contains('active') }));
  t.check(sub.focus === 'recrutement' && sub.visible, 'sous-onglets : flèche droite', JSON.stringify(sub));

  // Cartes cliquables : rôle, tabindex, activation clavier
  const roles = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const missing = [];
    const check = sel => document.querySelectorAll(sel).forEach(el => {
      if (el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0') missing.push(sel);
    });
    ui.gotoView('base', 'postes'); check('.slot-row');
    ui.gotoView('expeditions', 'carte'); check('.system-card');
    ui.gotoView('labo', 'atelier'); check('.fab-card.available');
    ui.gotoView('expeditions', 'carte');
    return [...new Set(missing)];
  });
  t.check(roles.length === 0, 'cartes cliquables : role="button" et tabindex', roles.join(', '));
  await page.focus('.system-card');
  await page.keyboard.press('Enter');
  const sysView = await page.evaluate(async () => (await import('./src/state.js')).S.ui?.galaxyView);
  t.check(sysView === 'system', 'Entrée sur une carte de système l\'ouvre', sysView);
  // Carte de colon : un vrai bouton qui déplie (aria-expanded)
  await page.evaluate(async () => { (await import('./src/ui.js')).gotoView('equipage', 'personnel'); });
  await page.focus('#crewList .pc-summary');
  await page.keyboard.press('Enter');
  const crewOpen = await page.evaluate(() => {
    const b = document.querySelector('#crewList .pc-summary');
    return { expanded: b.getAttribute('aria-expanded'), details: !!document.getElementById(b.getAttribute('aria-controls')) };
  });
  t.check(crewOpen.expanded === 'true' && crewOpen.details, 'Entrée déplie la fiche d\'un colon (aria-expanded, aria-controls)', JSON.stringify(crewOpen));
  // Espace sur une ligne de poste ouvre le sélecteur
  await page.evaluate(async () => { (await import('./src/ui.js')).gotoView('base', 'postes'); });
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
