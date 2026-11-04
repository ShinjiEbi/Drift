#!/usr/bin/env node
/* global document, window, localStorage, getComputedStyle, KeyboardEvent */
// tools/regress/interface-v1.mjs — interface V1 : navigation en 5 onglets, liens
// internes et anciens noms d'onglets, tableau de bord « À faire », objectifs,
// retours à l'écran (toasts), menu « ⋯ » et réglages, confirmModal, accueil.
// Ce test passe avec ou sans les fonctions des contrats V1 d'app.js (voir
// interface-contrats.mjs pour la version où elles sont simulées).
// Usage : node tools/regress/interface-v1.mjs
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Interface V1 : navigation, tableau de bord, objectifs, retours, réglages');
const srv = await startServer();
const browser = await chromium.launch();
const view = page => page.evaluate(async () => (await import('./src/ui.js')).currentView());

try {
  // ------------------------------------------------------------------
  console.log('1. Partie neuve : en-tête, objectifs, accueil');
  let page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  const head = await page.evaluate(() => {
    const gt = document.querySelector('#gameTime');
    return {
      txt: gt.textContent,
      jour: getComputedStyle(gt.querySelector('.jday'), '::after').content,
      label: gt.getAttribute('aria-label'),
      sessionInHeader: !!document.querySelector('header.top #realTime'),
      sessionInMenu: !!document.querySelector('#menuSheet #realTime'),
      footer: !!document.querySelector('footer.actions'),
      tabs: [...document.querySelectorAll('nav.tabs button')].map(b => b.dataset.tab),
      modal: document.querySelector('#modalBg').classList.contains('show'),
    };
  });
  t.check(/^J1 · 00:0\d$/.test(head.txt) && /our/.test(head.jour) && /^Jour 1, /.test(head.label), 'en-tête « Jour 1 · hh:mm »', JSON.stringify(head));
  t.check(!head.sessionInHeader && head.sessionInMenu && !head.footer, 'compteur de session dans le menu, plus de pied de page d\'administration');
  t.check(head.tabs.join() === 'base,equipage,expeditions,recits,labo', '5 onglets : Base, Équipage, Expéditions, Récits, Labo', head.tabs.join());
  t.check(!head.modal, 'pas de fenêtre d\'accueil sous automatisation (les tests partent tous d\'une partie neuve)');

  const objs = await page.evaluate(async () => {
    const { getObjectives } = await import('./src/objectives.js');
    const { S } = await import('./src/state.js');
    const list = getObjectives(S);
    const cards = [...document.querySelectorAll('#dashObjectives .obj-card')].map(c => ({
      title: c.querySelector('.obj-title')?.textContent, goto: c.querySelector('.obj-btn')?.dataset.goto, cible: c.querySelector('.obj-btn')?.dataset.cible || null,
    }));
    return { list, cards };
  });
  t.check(objs.list.length === 3 && objs.cards.length === 3, 'partie neuve : 3 objectifs affichés', JSON.stringify(objs.cards));
  t.check(objs.list.every(o => o.titre && o.action?.onglet && o.fait === false) && objs.list.some(o => o.source === 'fil'),
    'chaque objectif a un titre et une action ; l\'un vient du fil rouge « L\'Avant-poste »', JSON.stringify(objs.list.map(o => [o.id, o.source])));
  // Chaque bouton mène au bon écran (et montre la cible)
  for (let i = 0; i < objs.list.length; i++) {
    const o = objs.list[i];
    await page.evaluate(async () => (await import('./src/ui.js')).gotoView('base', 'afaire'));
    await page.click(`#dashObjectives .obj-card:nth-child(${i + 1}) .obj-btn`);
    await page.waitForTimeout(800);   // défilement doux jusqu'à la cible
    const v = await view(page);
    const target = o.action.cible
      ? await page.evaluate(id => {
        const el = document.querySelector(`#modulesList .module[data-id="${id}"]`);
        if (!el) return 'absente';
        const rc = el.getBoundingClientRect();
        return rc.top < window.innerHeight && rc.bottom > 0 ? 'visible' : 'hors écran';
      }, o.action.cible)
      : 'aucune';
    t.check(v.tab === o.action.onglet && (!o.action.sousOnglet || v.sub === o.action.sousOnglet) && target !== 'absente' && target !== 'hors écran',
      `objectif « ${o.titre} » → ${o.action.onglet}/${o.action.sousOnglet || ''}${o.action.cible ? ' (' + o.action.cible + ' ' + target + ')' : ''}`, JSON.stringify(v));
  }
  // Accueil (forcé : premier lancement)
  const welcome = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    ui.gotoView('labo', 'recherche');
    const shown = ui.maybeWelcome({ force: true });
    const m = document.querySelector('#modal');
    const r = { shown, title: m.querySelector('h3')?.textContent, paras: m.querySelectorAll('.welcome-body p').length };
    document.querySelector('#welcomeGo').click();
    await new Promise(res => setTimeout(res, 30));
    return { ...r, closed: !document.querySelector('#modalBg').classList.contains('show'), seen: localStorage.getItem('drift_ui_welcome'), view: ui.currentView() };
  });
  t.check(welcome.shown && /Bienvenue/.test(welcome.title) && welcome.paras >= 3, 'fenêtre d\'accueil : quelques phrases qui posent la situation', JSON.stringify(welcome));
  t.check(welcome.closed && welcome.seen === '1' && welcome.view.tab === 'base' && welcome.view.sub === 'afaire', 'l\'accueil mène au tableau de bord et n\'est montré qu\'une fois', JSON.stringify(welcome));
  t.check(page.errors.length === 0, 'aucune erreur JavaScript (partie neuve)', page.errors.slice(0, 3).join(' | '));
  await page.context().close();

  // ------------------------------------------------------------------
  console.log('2. Navigation : sous-onglets, défilement, liens internes, anciens noms');
  page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  await fillColony(page);
  const nav = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    st.setSimPaused(true);
    document.querySelector('#modalBg').classList.remove('show');
    const out = {};
    // Chaque onglet a ses sous-onglets et une vue rendue
    const subs = {};
    for (const b of document.querySelectorAll('nav.tabs button')) {
      b.click();
      subs[b.dataset.tab] = [...document.querySelectorAll(`#view-${b.dataset.tab} nav.subtabs button`)].map(x => x.dataset.subtab);
    }
    out.subs = subs;
    // Défilement remis en haut au changement de sous-onglet
    ui.gotoView('equipage', 'personnel');
    window.scrollTo(0, 600);
    document.querySelector('#subtab-recrutement').click();
    out.scrollSub = window.scrollY;
    // Re-toucher l'onglet actif : retour à la première vue
    document.querySelector('nav.tabs button[data-tab="equipage"]').click();
    out.retap = ui.currentView();
    // Anciens noms (table exportée)
    out.legacy = Object.keys(ui.LEGACY_TABS).map(k => { ui.navigateTo(k); const v = ui.currentView(); return `${k}→${v.tab}/${v.sub}`; });
    out.legacySub = (ui.navigateTo('galaxy/fleet'), ui.currentView());
    out.unknown = ui.navigateTo('"]<img src=x>');
    // « Gérer → » d'un encart d'équipe → Base › Postes
    ui.gotoView('equipage', 'soins');
    document.querySelector('#subview-soins [data-goto-assign]')?.click();
    out.gerer = ui.currentView();
    // Événement « drift:navigate » (pour pwa.js / notifications.js)
    window.dispatchEvent(new CustomEvent('drift:navigate', { detail: 'journal' }));
    out.event = ui.currentView();
    return out;
  });
  t.check(nav.subs.base.join() === 'afaire,construction,postes' && nav.subs.equipage.join() === 'personnel,recrutement,formation,soins' &&
    nav.subs.expeditions.join() === 'missions,carte,vaisseaux,diplomatie' && nav.subs.recits.join() === 'chroniques,filsrouges,journal,archives,annales' &&
    nav.subs.labo.join() === 'recherche,atelier,inventaire,bibliotheque', 'sous-vues de chaque onglet', JSON.stringify(nav.subs));
  t.check(nav.scrollSub === 0, 'changer de sous-onglet remet le défilement en haut', String(nav.scrollSub));
  t.check(nav.retap.tab === 'equipage' && nav.retap.sub === 'personnel', 'toucher l\'onglet ouvert ramène à sa première vue', JSON.stringify(nav.retap));
  t.check(nav.legacy.join() === 'overview→base/afaire,modules→base/construction,crew→equipage/personnel,galaxy→expeditions/missions,stocks→labo/recherche,arcs→recits/filsrouges,journal→recits/journal',
    'anciens noms d\'onglets (overview, modules, crew…) redirigés', nav.legacy.join(' '));
  t.check(nav.legacySub.tab === 'expeditions' && nav.legacySub.sub === 'vaisseaux' && nav.unknown === false, 'ancien sous-onglet (galaxy/fleet) redirigé, nom inconnu ignoré', JSON.stringify(nav.legacySub));
  t.check(nav.gerer.tab === 'base' && nav.gerer.sub === 'postes', '« Gérer → » mène à Base › Postes', JSON.stringify(nav.gerer));
  t.check(nav.event.tab === 'recits' && nav.event.sub === 'journal', 'événement drift:navigate (notifications)', JSON.stringify(nav.event));

  // Onglet mémorisé : ancienne valeur (≤ 0.33) migrée au chargement
  await page.evaluate(() => localStorage.setItem('drift_ui_nav', JSON.stringify({ tab: 'galaxy', sub: { modules: 'assignments', crew: 'recruit', galaxy: 'fleet', stocks: 'workshop' } })));
  await page.evaluate(async () => (await import('./src/state.js')).save());
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'));
  await page.waitForTimeout(200);
  const restored = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const v = ui.currentView();
    const saved = JSON.parse(localStorage.getItem('drift_ui_nav'));
    document.querySelector('nav.tabs button[data-tab="labo"]').click();
    return { v, saved, labo: ui.currentView() };
  });
  t.check(restored.v.tab === 'expeditions' && restored.v.sub === 'vaisseaux' && restored.labo.sub === 'atelier' && restored.saved.v === 2,
    'onglet mémorisé : ancienne valeur convertie (galaxy/fleet → Expéditions › Vaisseaux)', JSON.stringify(restored));

  // ------------------------------------------------------------------
  console.log('3. Tableau de bord : décision, expédition en attente, file, ressources');
  const dash = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    st.setSimPaused(true);
    document.querySelector('#modalBg').classList.remove('show');
    // Une expédition sur place qui attend un choix
    S.fleet.forEach(v => { v.available = true; });
    for (const sys of S.galaxy.systems) sys.scanned = true;
    const crew = S.crew.slice(0, 2);
    crew.forEach(m => app.unassignMember(m.id));
    crew.forEach(m => { m.statut = 'libre'; });
    const body = S.galaxy.systems.find(s => s.distance > 0.8).bodies[0];
    app.launchExpedition({ vesselId: S.fleet[0].id, bodyId: body.id, crewIds: crew.map(m => m.id), equipment: {} });
    const exp = S.expeditions.at(-1);
    exp.elapsedMin = Math.max(0, exp.oneWayMin - 1);
    for (let i = 0; i < 3 && exp.phase === 'aller'; i++) st.tickOnce({ silent: true });
    // Un chantier et une file simulée
    S.build = { id: 'habitat', targetLevel: (S.modules.habitat?.level || 0) + 1, totalMin: 600, doneMin: 150 };
    S.buildQueue = [{ id: 'hydroponie', targetLevel: 2 }, { id: 'laboratoire', targetLevel: 3 }];
    // Une décision en attente, gardée en file (une scène est « ouverte »)
    document.querySelector('#sceneOverlay').classList.add('show');
    const id = Object.keys(app.INCIDENTS).find(k => S.modules[app.INCIDENTS[k].modKey]);
    app.triggerIncident(id, false);
    document.querySelector('#sceneOverlay').classList.remove('show');
    ui.gotoView('base', 'afaire');
    ui.render();
    const attn = [...document.querySelectorAll('#dashAttention .attn-card')].map(c => ({ t: c.querySelector('.attn-title').textContent, b: c.querySelector('button').textContent, attrs: [...c.querySelector('button').attributes].map(a => a.name).join(' ') }));
    const acts = [...document.querySelectorAll('#dashActivity .act-row')].map(r => r.dataset.id + ':' + r.querySelector('.act-title').textContent);
    const rates = [...document.querySelectorAll('#dashResources .rs-row')].map(r => r.querySelector('.rs-rate').textContent);
    const expected = st.computeRates();
    const badge = { exp: document.querySelector('#expeditionsBadge').textContent, expShown: document.querySelector('#expeditionsBadge').classList.contains('show'), base: document.querySelector('#baseBadge').textContent };
    const resTiles = document.querySelectorAll('#subview-afaire .res').length;
    return { attn, acts, rates, metalRate: expected.metal, badge, resTiles, pending: S.pendingDecisions.length, expId: exp.id, waiting: exp.awaitingChoice && exp.phase === 'sur_place', exps: S.expeditions.length };
  });
  t.check(dash.pending >= 1 && dash.attn.some(a => /décision/i.test(a.t) && a.b === 'Décider'), 'décision en attente signalée avec « Décider »', JSON.stringify(dash.attn));
  t.check(dash.waiting && dash.attn.some(a => /attend tes ordres/.test(a.t) && a.b === 'Reprendre'), 'expédition en attente de décision signalée avec « Reprendre »', JSON.stringify(dash.attn));
  t.check(dash.acts.some(a => a.startsWith('build:')) && dash.acts.filter(a => a.startsWith('bq:')).length === 2 && dash.acts.some(a => a.startsWith('exp:')),
    'activités en cours : chantier, file de chantiers, expédition', JSON.stringify(dash.acts));
  t.check(dash.rates.length === 5 && dash.resTiles === 0, 'ressources : un tableau compact (plus de tuiles en double)', JSON.stringify(dash.rates));
  t.check(dash.badge.expShown && dash.badge.exp === '1', 'badge Expéditions = expéditions qui attendent une décision', JSON.stringify(dash.badge));
  // « Décider » ouvre la décision, « Reprendre » l'écran de scène
  const opened = await page.evaluate(async () => {
    (await import('./src/state.js')).setSimPaused(false);   // pumpDecisions n'ouvre rien quand la simulation est en pause
    document.querySelector('#dashAttention [data-open-decision]').click();
    const decision = !!document.querySelector('#modal [data-incident-choice], #modal [data-event-choice]');
    return decision;
  });
  t.check(opened, '« Décider » ouvre la décision en attente');
  for (let i = 0; i < 6; i++) {
    const more = await page.evaluate(() => {
      const bg = document.querySelector('#modalBg');
      if (!bg.classList.contains('show')) return false;
      (document.querySelector('#consContinue') || document.querySelector('#modal button.incident-choice:not([disabled])'))?.click();
      if (!document.querySelector('#modal button.incident-choice, #consContinue')) bg.classList.remove('show');
      return true;
    });
    if (!more) break;
  }
  const resumed = await page.evaluate(async id => {
    const ui = await import('./src/ui.js');
    ui.render();
    document.querySelector(`#dashAttention [data-reprendre="${id}"]`)?.click();
    const shown = document.querySelector('#sceneOverlay').classList.contains('show');
    document.querySelector('[data-action-scene="close"]')?.click();
    return shown;
  }, dash.expId);
  t.check(resumed, '« Reprendre » ouvre l\'écran de la scène');

  // ------------------------------------------------------------------
  console.log('4. Retours à l\'écran (toasts)');
  const toasts = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    const host = document.querySelector('#toast');
    const read = () => [...host.querySelectorAll('.toast-item')].map(e => e.textContent.replace(/ /g, ' '));
    ui.render();
    host.textContent = '';
    // Fin de chantier, le suivant démarre depuis la file
    const b = S.build;
    S.modules[b.id] = { ...(S.modules[b.id] || {}), level: b.targetLevel };
    S.build = { id: 'hydroponie', targetLevel: 2, totalMin: 600, doneMin: 0 };
    S.buildQueue.shift();
    ui.render();
    const r1 = read();
    host.textContent = '';
    // Fin de chantier réelle par la simulation
    S.build = { id: 'antenne', targetLevel: (S.modules.antenne?.level || 0) + 1, totalMin: 2, doneMin: 0 };
    S.buildQueue = [];
    ui.render();
    st.tickOnce({ silent: true }); st.tickOnce({ silent: true }); st.tickOnce({ silent: true });
    ui.render();
    const r2 = read();
    host.textContent = '';
    // Nouveau candidat, décès
    S.candidates.push(st.genCandidate());
    const victim = S.crew.find(m => m.statut !== 'mort' && m.statut !== 'expedition');
    victim.statut = 'mort';
    ui.render();
    const r3 = read();
    return { r1, r2, r3, live: host.getAttribute('aria-live'), n: host.children.length <= 3 };
  });
  t.check(toasts.r1.some(x => /Chantier terminé : Habitat/.test(x) && /suivant : Hydroponie/.test(x)), 'fin de chantier et démarrage du suivant en file', JSON.stringify(toasts.r1));
  t.check(toasts.r2.some(x => /Chantier terminé : Antenne/.test(x)), 'fin de chantier détectée après la simulation', JSON.stringify(toasts.r2));
  t.check(toasts.r3.some(x => /Nouveau candidat/.test(x)) && toasts.r3.some(x => /Décès/.test(x)) && toasts.live === 'polite' && toasts.n,
    'nouveau candidat et décès annoncés (aria-live, 3 au plus)', JSON.stringify(toasts.r3));

  // ------------------------------------------------------------------
  console.log('5. Fenêtre de confirmation (confirmModal)');
  const conf = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const out = {};
    let p = ui.confirmModal({ titre: 'Tout libérer ?', texte: 'Texte', confirmer: 'Libérer', annuler: 'Garder', danger: true });
    out.ui = { title: document.querySelector('#modal h3').textContent, yes: document.querySelector('#confirmYes').textContent, danger: document.querySelector('#confirmYes').classList.contains('danger'), focus: document.activeElement?.id };
    document.querySelector('#confirmYes').click();
    out.yes = await p;
    p = ui.confirmModal({ titre: 'Q' });
    document.querySelector('#confirmNo').click();
    out.no = await p;
    p = ui.confirmModal({ titre: 'Q' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.esc = await p;
    // Remplacée par une autre fenêtre : réponse « non »
    p = ui.confirmModal({ titre: 'Q' });
    ui.showModal({ title: 'Autre', body: 'x', onPrimary: () => {} });
    out.replaced = await p;
    document.querySelector('#modalBg').classList.remove('show');
    // Au-dessus de l'écran de scène
    document.querySelector('#sceneOverlay').classList.add('show');
    p = ui.confirmModal({ titre: 'Retraite ?' });
    const btn = document.querySelector('#confirmYes').getBoundingClientRect();
    out.onTop = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2)?.id === 'confirmYes';
    document.querySelector('#confirmYes').click();
    await p;
    document.querySelector('#sceneOverlay').classList.remove('show');
    return out;
  });
  t.check(conf.ui.title === 'Tout libérer ?' && conf.ui.yes === 'Libérer' && conf.ui.danger && conf.ui.focus === 'confirmYes', 'confirmModal : titre, libellés, style danger, focus', JSON.stringify(conf.ui));
  t.check(conf.yes === true && conf.no === false && conf.esc === false && conf.replaced === false, 'confirmModal : vrai / faux / Échap / remplacée', JSON.stringify(conf));
  t.check(conf.onTop, 'confirmModal au-dessus de l\'écran de scène');
  // Une action réelle passe par la fenêtre du jeu (plus de confirm() natif)
  const clear = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const { S } = await import('./src/state.js');
    ui.gotoView('base', 'postes');
    const before = Object.keys(S.assignments).length;
    document.querySelector('#clearAllAssignBtn').click();
    const shown = /Tout libérer/.test(document.querySelector('#modal h3')?.textContent || '');
    document.querySelector('#confirmNo').click();
    await new Promise(r => setTimeout(r, 20));
    const kept = Object.keys(S.assignments).length === before;
    document.querySelector('#clearAllAssignBtn').click();
    document.querySelector('#confirmYes').click();
    await new Promise(r => setTimeout(r, 20));
    return { shown, kept, after: Object.values(S.assignments).filter(id => S.crew.find(c => c.id === id)?.statut === 'travail').length };
  });
  t.check(clear.shown && clear.kept && clear.after === 0, '« Tout libérer » demande confirmation dans une fenêtre du jeu', JSON.stringify(clear));

  // ------------------------------------------------------------------
  console.log('6. Menu « ⋯ » et réglages');
  const prefs = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    document.querySelector('#menuBtn').click();
    const open = document.querySelector('#menuBg').classList.contains('show');
    const ids = ['btnRename', 'btnPushToggle', 'btnExport', 'btnImport', 'btnReset'].filter(id => document.querySelector(`#menuSheet #${id}`));
    document.querySelector('#menuSheet [data-pref="textSize"][data-value="grand"]').click();
    document.querySelector('#menuSheet [data-pref="reduceMotion"]').click();
    document.querySelector('#menuSheet [data-pref="autoCombat"]').click();
    const zoom = getComputedStyle(document.body).zoom;
    const html = { size: document.documentElement.dataset.textSize, motion: document.documentElement.dataset.reduceMotion };
    const stored = JSON.parse(localStorage.getItem('drift_ui_prefs'));
    const version = document.querySelector('#aboutVersion').textContent;
    document.querySelector('#menuClose').click();
    return { open, ids, zoom, html, stored, getPrefs: ui.getPrefs(), reduced: ui.prefersReducedMotion(), version, closed: !document.querySelector('#menuBg').classList.contains('show') };
  });
  t.check(prefs.open && prefs.ids.length === 5 && prefs.closed, 'le menu ⋯ regroupe renommer, notifications, export, import, recommencer', JSON.stringify(prefs.ids));
  t.check(prefs.html.size === 'grand' && Number(prefs.zoom) > 1 && prefs.html.motion === '1' && prefs.reduced, 'taille du texte « grand » et animations réduites appliquées', JSON.stringify(prefs));
  t.check(prefs.stored.textSize === 'grand' && prefs.stored.reduceMotion === true && prefs.stored.autoCombat === true && prefs.getPrefs.autoCombat === true,
    'préférences mémorisées (dont « Combat automatique par défaut »)', JSON.stringify(prefs.stored));
  t.check(/^\d+\.\d+\.\d+/.test(prefs.version), 'version affichée dans « À propos »', prefs.version);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'));
  const reapplied = await page.evaluate(() => ({ size: document.documentElement.dataset.textSize, autoCombat: document.querySelector('#menuSheet [data-pref="autoCombat"]').getAttribute('aria-checked') }));
  t.check(reapplied.size === 'grand' && reapplied.autoCombat === 'true', 'préférences réappliquées au rechargement', JSON.stringify(reapplied));
  await page.evaluate(() => localStorage.removeItem('drift_ui_prefs'));

  // ------------------------------------------------------------------
  console.log('7. Récits, construction, équipage, labo');
  const views = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    st.setSimPaused(true);
    document.querySelectorAll('.modal-bg.show').forEach(e => e.classList.remove('show'));
    const out = {};
    // Fils rouges : conditions visibles pour l'étape courante
    ui.gotoView('recits', 'filsrouges');
    const ap = document.querySelector('#arcsContent .arc-card.main');
    out.arcCurrent = ap?.querySelector('.arc-step.current .as-cond')?.textContent || '';
    out.decouvrir = /À découvrir\./.test(document.querySelector('#arcsContent').textContent);
    // Chroniques : un corps avec une chronique apparaît (repli sans listChronicles)
    const sys = S.galaxy.systems.find(s => s.distance > 0.8);
    const body = sys.bodies[0];
    body.chronicle = { id: 'pulsar_silencieux', episodeIdx: 1, flags: {}, completed: false };
    ui.gotoView('recits', 'chroniques');
    out.chron = [...document.querySelectorAll('#chronList .chron-card')].map(c => c.querySelector('.cc-title').textContent + ' | ' + c.querySelector('.cc-meta').textContent);
    document.querySelector(`#chronList [data-goto-body="${body.id}"]`)?.click();
    out.chronGo = { v: ui.currentView(), body: document.querySelector('#galaxyContent .bname-big')?.textContent };
    // Journal : filtres et jours
    S.journal.push({ t: S.meta.gameMin + 86400 * 2, kind: 'neutral', txt: 'Construction engagée : <em>Mine</em>.' });
    S.journal.push({ t: S.meta.gameMin + 86400 * 2, kind: 'neutral', txt: 'Signal reçu : <em>Noor Hassan</em> propose ses services.' });
    ui.gotoView('recits', 'journal');
    out.days = document.querySelectorAll('#journalList .jday').length;
    document.querySelector('#journalFilters [data-filter="journal:equipage"]').click();
    out.equipage = [...document.querySelectorAll('#journalList .entry .body')].map(e => e.textContent);
    document.querySelector('#journalFilters [data-filter="journal:tout"]').click();
    // Construction : filtres
    ui.gotoView('base', 'construction');
    out.filters = [...document.querySelectorAll('#buildFilters .chip')].map(c => c.textContent.trim());
    document.querySelector('#buildFilters [data-filter="construction:verrou"]').click();
    out.locked = document.querySelectorAll('#modulesList .module').length;
    document.querySelector('#buildFilters [data-filter="construction:fait"]').click();
    const card = document.querySelector('#modulesList .module');
    out.cardDetails = !!card.querySelector('.mod-details');
    card.querySelector('.mod-more').click();
    out.cardOpen = !!document.querySelector(`#modulesList .module[data-id="${card.dataset.id}"] .mod-details .desc`);
    out.yields = [...document.querySelectorAll('#modulesList .mod-yield .yl')].length;
    document.querySelector('#buildFilters [data-filter="construction:dispo"]').click();
    // Équipage : cartes compactes dépliables, légende
    ui.gotoView('equipage', 'personnel');
    const cards = document.querySelectorAll('#crewList .crew-card');
    out.crewCards = cards.length;
    out.crewOpen = document.querySelectorAll('#crewList .pc-details').length;
    cards[0].querySelector('.pc-summary').click();
    out.crewOpen2 = document.querySelectorAll('#crewList .pc-details').length;
    out.statNames = [...document.querySelectorAll('#crewList .pc-details .kv .k')].slice(0, 5).map(e => e.textContent);
    out.traitDesc = !!document.querySelector('#crewList .pc-details .trait-desc');
    document.querySelector('[data-glossary]').click();
    out.glossary = document.querySelectorAll('#modal .gloss-list li').length;
    document.querySelector('#modalBg').classList.remove('show');
    // Labo : filtres de recherche
    ui.gotoView('labo', 'recherche');
    out.rfilters = [...document.querySelectorAll('#researchContent .chip')].map(c => c.dataset.filter);
    out.durations = [...document.querySelectorAll('#researchContent .tech-card .dur')].map(e => e.textContent).slice(0, 3);
    // Archives / Annales : états vides
    ui.gotoView('recits', 'archives');
    out.archives = document.querySelector('#archivesContent .lore-empty h3')?.textContent;
    return out;
  });
  t.check(views.arcCurrent.length > 5 && !views.decouvrir, 'fils rouges : condition de l\'étape courante visible, plus de « À découvrir »', views.arcCurrent);
  t.check(views.chron.some(c => /Pulsar/.test(c)) && views.chronGo.v.sub === 'carte' && !!views.chronGo.body, 'chroniques planétaires listées, bouton vers la planète', JSON.stringify(views.chron) + JSON.stringify(views.chronGo));
  t.check(views.days >= 2 && views.equipage.some(x => /Noor Hassan/.test(x)) && !views.equipage.some(x => /Construction engagée/.test(x)), 'journal : groupé par jour, filtre Équipage', JSON.stringify(views.equipage.slice(0, 3)));
  t.check(views.filters.length === 4 && views.locked >= 0 && !views.cardDetails && views.cardOpen && views.yields > 0, 'construction : 4 filtres, cartes repliées par défaut et dépliables, production réelle', JSON.stringify(views));
  t.check(views.crewCards > 5 && views.crewOpen === 0 && views.crewOpen2 === 1 && views.statNames.includes('Vigueur') && views.traitDesc && views.glossary > 10,
    'équipage : cartes compactes, fiche dépliable (noms complets, effets des traits), légende', JSON.stringify(views));
  t.check(views.rfilters.length === 4 && views.durations.every(d => /\d/.test(d)), 'labo : filtres de recherche et durées réelles', JSON.stringify(views.rfilters) + JSON.stringify(views.durations));
  t.check(views.archives === 'Archives', 'archives : état vide qui annonce son contenu');
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
  await page.context().close();
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
