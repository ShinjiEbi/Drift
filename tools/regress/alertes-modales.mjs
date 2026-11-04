#!/usr/bin/env node
/* global document, CSS */  // utilisés dans les callbacks exécutés par le navigateur
// tools/regress/alertes-modales.mjs — non-régression des constats F12 et F13,
// et des ajustements d'interface liés aux autres corrections (soins).
// Usage : node tools/regress/alertes-modales.mjs
//  F12 : un effet temporaire n'apparaît qu'une fois ; une ligne d'alerte mène à
//        l'onglet concerné ; les décisions en attente (S.pendingDecisions) sont
//        comptées et se rouvrent au clic ; la modale ne garde pas de classe collée.
//  F13 : choisir un colon dans la modale de lancement ne remet pas le défilement à 0.
//  Soins : bouton « Admettre » pour un colon à son poste ; diagnostic impossible
//        → bouton désactivé avec la raison.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Alertes, modales, soins');
const srv = await startServer();
const browser = await chromium.launch();

try {
  const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  await fillColony(page);
  await page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));

  // ---- Effet temporaire : une seule ligne ----
  const buff = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    st.S.activeBuffs = [{ type: 'prodMult', value: 0.8, label: 'Hydroponie contaminée', expiresAt: st.S.meta.gameMin + 600 }];
    document.querySelector('#alertBar').click();
    const rows = [...document.querySelectorAll('#modal .alert-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    return { n: rows.filter(r => r.includes('Hydroponie contaminée')).length, cls: document.querySelector('#modal').className };
  });
  t.check(buff.n === 1, 'un effet temporaire n\'apparaît qu\'une fois dans les alertes', `${buff.n} ligne(s)`);
  t.check(buff.cls.includes('alerts-modal'), 'la liste des alertes est ouverte');

  // ---- Une ligne mène à l'onglet concerné ----
  const nav = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    st.S.crew[0].statut = 'libre';   // au moins un colon sans poste
    document.querySelector('#modalBg').classList.remove('show');
    document.querySelector('#alertBar').click();
    const row = [...document.querySelectorAll('#modal button.alert-row')].find(r => /sans poste/.test(r.textContent));
    if (!row) return { err: 'pas de ligne « sans poste » cliquable' };
    row.click();
    await new Promise(r => setTimeout(r, 50));
    return {
      shown: document.querySelector('#modalBg').classList.contains('show'),
      tab: document.querySelector('nav.tabs button.active')?.dataset.tab,
      sub: document.querySelector('#view-base nav.subtabs button.active')?.dataset.subtab,
      cls: document.querySelector('#modal').className,
    };
  });
  t.check(!nav.err && !nav.shown && nav.tab === 'base' && nav.sub === 'postes', 'cliquer « colons sans poste » ouvre Base › Postes', JSON.stringify(nav));
  t.check(nav.cls === 'modal', 'la modale fermée ne garde pas de classe (alerts-modal…)', nav.cls);

  // ---- Décisions en attente : comptées, rouvertes au clic ----
  const dec = await page.evaluate(async () => {
    const app = await import('./src/app.js');
    const st = await import('./src/state.js');
    const cat = await import('./src/catalog.js');
    const ids = Object.keys(app.INCIDENTS).filter(id => cat.MODULES[app.INCIDENTS[id].modKey]);
    // Tout se fait sans laisser passer de tick : la file n'est pas vidée entre-temps
    app.triggerIncident(ids[0], false);
    app.triggerIncident(ids[1] || ids[0], false);
    const pending = st.S.pendingDecisions?.length || 0;
    document.querySelector('#alertBar').click();
    const row = [...document.querySelectorAll('#modal button.alert-row')].find(r => /décision/.test(r.textContent));
    const text = row?.textContent.replace(/\s+/g, ' ').trim();
    row?.click();
    return {
      pending, text,
      shown: document.querySelector('#modalBg').classList.contains('show'),
      decision: !!document.querySelector('#modal [data-incident-choice], #modal [data-event-choice]'),
      cls: document.querySelector('#modal').className,
    };
  });
  t.check(dec.pending >= 2 && dec.text?.includes(`${dec.pending} décisions en attente`), 'les décisions en attente sont comptées', JSON.stringify(dec));
  t.check(dec.shown && dec.decision && !dec.cls.includes('alerts-modal'), 'cliquer l\'alerte rouvre la prochaine décision', JSON.stringify(dec));
  // On résout les décisions pour la suite
  for (let i = 0; i < 12; i++) {
    const did = await page.evaluate(() => {
      const bg = document.querySelector('#modalBg');
      if (!bg.classList.contains('show')) return false;
      (document.querySelector('#consContinue') || document.querySelector('#modal button.incident-choice:not([disabled])'))?.click();
      if (!document.querySelector('#modal button.incident-choice, #consContinue')) bg.classList.remove('show');
      return true;
    });
    if (!did) {
      const left = await page.evaluate(async () => (await import('./src/state.js')).S.pendingDecisions?.length || 0);
      if (!left) break;
      await page.waitForTimeout(1100);
    }
  }

  // ---- F13 : le défilement de la modale de lancement est conservé ----
  const scroll = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    document.querySelector('#modalBg').classList.remove('show');
    st.S.fleet.forEach(v => { v.available = true; });
    st.S.crew.forEach(m => { if (m.statut === 'travail') m.statut = 'libre'; });
    ui.showLaunchModal(st.S.galaxy.systems[0].bodies[0].id);
    const big = st.S.fleet.reduce((a, v) => (a && a.type === 'cargo') ? a : v, null);
    document.querySelector(`#modal [data-pick-vessel="${big.id}"]`)?.click();
    const m = document.querySelector('#modal');
    const list = m.querySelector('.crew-picker');
    m.scrollTop = m.scrollHeight;
    list.scrollTop = list.scrollHeight;
    const before = { modal: m.scrollTop, list: list.scrollTop };
    const items = [...list.querySelectorAll('[data-pick-crew]:not(.disabled)')];
    items[items.length - 1].click();
    const list2 = m.querySelector('.crew-picker');
    const after = { modal: m.scrollTop, list: list2.scrollTop, selected: !!list2.querySelector('.selected') };
    document.querySelector('#modalBg').classList.remove('show');
    return { before, after };
  });
  t.check(scroll.before.list > 50 && Math.abs(scroll.after.list - scroll.before.list) < 2 && Math.abs(scroll.after.modal - scroll.before.modal) < 2 && scroll.after.selected,
    'sélectionner un colon conserve le défilement de la modale de lancement', JSON.stringify(scroll));

  // ---- Soins : admission depuis un poste ; diagnostic impossible expliqué ----
  const soins = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const key = Object.keys(app.STATUTS).find(k => app.STATUTS[k].hidden) || Object.keys(app.STATUTS)[0];
    const worker = S.crew.find(m => m.statut === 'libre');
    worker.statut = 'travail';
    worker.statuts.push({ key, since: S.meta.gameMin, revealed: true, diagnosed: true });
    const patient = S.crew.find(m => m.statut === 'libre' && m !== worker);
    patient.statuts.push({ key, since: S.meta.gameMin, revealed: true, diagnosed: false, lastDiagAt: S.meta.gameMin });
    patient.statut = 'infirmerie';
    ui.gotoView('equipage', 'soins'); ui.render();
    const admit = !!document.querySelector(`#subview-soins button[data-act="admit"][data-mid="${CSS.escape(worker.id)}"]`);
    const diag = document.querySelector(`#subview-soins button[data-act="diagnose"][data-mid="${CSS.escape(patient.id)}"]`);
    const expected = app.canDiagnose(patient.id, 0);
    return { admit, diagDisabled: diag?.disabled, diagText: diag?.textContent.trim(), expected: expected.ok ? 'ok' : expected.reason };
  });
  t.check(soins.admit, 'un colon à son poste peut être admis à l\'infirmerie');
  t.check(soins.expected === 'ok' || (soins.diagDisabled && soins.diagText === soins.expected), 'diagnostic impossible : bouton désactivé avec la raison', JSON.stringify(soins));
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
