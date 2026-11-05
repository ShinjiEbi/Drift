#!/usr/bin/env node
/* global document, window, getComputedStyle, innerWidth, innerHeight */
// tools/regress/layout.mjs — non-régression de la mise en page mobile.
// Usage : node tools/regress/layout.mjs
//  E6  : rien n'est caché sous la barre d'onglets fixe (bas de page, menu ⋯) ;
//        les boutons du menu « ⋯ » (Exporter, Importer, Recommencer…) sont cliquables.
//  F10 : les 5 onglets tiennent dans l'écran (360 et 320 px), sans défilement ;
//        aucune vue ne déborde horizontalement.
//  E2  : la modale s'affiche au-dessus de l'overlay de scène, le toast au-dessus de tout.
//  M18 : les zones de sécurité iPhone (émulées via --safe-*) décalent l'en-tête,
//        la barre d'onglets, l'overlay de scène, la modale et le menu.
//  Divers : le bandeau d'alertes reste visible (non recouvert) après défilement ;
//        changer d'onglet remet le défilement en haut.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Mise en page : onglets, menu, empilement, zones de sécurité');
const srv = await startServer();
const browser = await chromium.launch();
const SAFE = ':root{--safe-top:47px !important;--safe-bottom:34px !important;--safe-left:0px !important;--safe-right:0px !important;}';
const VIEWS = [['base', 'afaire'], ['base', 'construction'], ['base', 'postes'], ['equipage', 'personnel'], ['equipage', 'recrutement'],
  ['equipage', 'formation'], ['equipage', 'soins'], ['expeditions', 'missions'], ['expeditions', 'carte'], ['expeditions', 'vaisseaux'],
  ['expeditions', 'diplomatie'], ['recits', 'chroniques'], ['recits', 'filsrouges'], ['recits', 'journal'], ['recits', 'archives'],
  ['recits', 'annales'], ['labo', 'recherche'], ['labo', 'atelier'], ['labo', 'inventaire'], ['labo', 'bibliotheque']];

try {
  const sizes = [[360, 780, true], [390, 844, true], [1280, 800, false], [320, 640, true]];
  for (const [w, h, mobile] of sizes) {
    for (const safe of mobile ? [false, true] : [false]) {
      const page = await openGame(browser, srv.base, { width: w, height: h, mobile });
      if (safe) await page.addStyleTag({ content: SAFE });
      await fillColony(page);
      await page.waitForTimeout(100);
      const label = `${w}×${h}${safe ? ' (zone de sécurité)' : ''}`;
      const r = await page.evaluate(async (views) => {
        const ui = await import('./src/ui.js');
        document.querySelector('#modalBg').classList.remove('show');
        const nav = document.querySelector('nav.tabs');
        const navTop = getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
        const overflow = [];
        const hiddenEnd = [];
        for (const [tab, sub] of views) {
          ui.gotoView(tab, sub);
          ui.render();
          if (document.documentElement.scrollWidth - innerWidth > 0.5) overflow.push(`${tab}/${sub}`);
          // Bas de page : le dernier élément de la vue est au-dessus de la barre d'onglets
          window.scrollTo(0, document.documentElement.scrollHeight);
          const view = document.querySelector(`#subview-${sub}`);
          const kids = [...view.querySelectorAll('*')].filter(el => el.getClientRects().length && el.children.length === 0);
          const last = kids[kids.length - 1];
          if (last && last.getBoundingClientRect().bottom > navTop + 0.5) hiddenEnd.push(`${tab}/${sub}`);
        }
        // Changer d'onglet remet le défilement en haut
        ui.gotoView('equipage', 'personnel');
        window.scrollTo(0, 400);
        document.querySelector('nav.tabs button[data-tab="labo"]').click();
        const topAfterTab = window.scrollY;
        window.scrollTo(0, 400);
        document.querySelector('#subtab-atelier').click();
        const topAfterSub = window.scrollY;
        // Menu « ⋯ » : chaque bouton est cliquable (pas recouvert)
        ui.openMenu();
        const sheet = document.querySelector('#menuSheet');
        const menuHidden = [];
        for (const b of sheet.querySelectorAll('button')) {
          b.scrollIntoView({ block: 'center' });
          const rc = b.getBoundingClientRect();
          const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          if (!(el === b || b.contains(el))) menuHidden.push(b.id || b.textContent.trim());
        }
        const sheetPadTop = parseFloat(getComputedStyle(sheet).paddingTop);
        ui.closeMenu();
        return {
          overflow, hiddenEnd, menuHidden, topAfterTab, topAfterSub, sheetPadTop,
          navScroll: nav.scrollWidth - nav.clientWidth,
          outOfScreen: [...nav.querySelectorAll('button')].filter(b => b.getBoundingClientRect().right > innerWidth + 0.5).length,
          pageScrollX: document.documentElement.scrollWidth - innerWidth,
          brandTop: document.querySelector('.brand').getBoundingClientRect().top + window.scrollY,
          navPadBottom: parseFloat(getComputedStyle(nav).paddingBottom),
        };
      }, VIEWS);
      t.check(r.menuHidden.length === 0, `${label} : boutons du menu ⋯ cliquables`, 'cachés : ' + r.menuHidden.join(', '));
      t.check(r.hiddenEnd.length === 0, `${label} : rien sous la barre d'onglets en bas de page`, r.hiddenEnd.join(', '));
      t.check(r.navScroll <= 0 && r.outOfScreen === 0 && r.pageScrollX <= 0 && r.overflow.length === 0, `${label} : les 5 onglets tiennent, aucune vue ne déborde`, JSON.stringify({ ...r, menuHidden: undefined }));
      t.check(r.topAfterTab === 0 && r.topAfterSub === 0, `${label} : changer d'onglet remet le défilement en haut`, `${r.topAfterTab} / ${r.topAfterSub}`);
      if (safe) {
        t.check(r.brandTop >= 47, `${label} : en-tête sous l'encoche`, `haut du titre à ${r.brandTop}px`);
        t.check(r.navPadBottom >= 34, `${label} : barre d'onglets au-dessus de la barre d'accueil`, `padding-bottom ${r.navPadBottom}px`);
        t.check(r.sheetPadTop >= 47, `${label} : menu ⋯ sous l'encoche`, `padding-top ${r.sheetPadTop}px`);
      }
      await page.context().close();
    }
  }

  // Empilement : modale au-dessus de l'overlay de scène, toast au-dessus de la modale
  const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  await page.addStyleTag({ content: SAFE });
  const z = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    document.querySelector('#sceneOverlay').classList.add('show');
    ui.showModal({ title: 'Test', body: 'Corps', primaryLabel: 'OK', onPrimary: () => {} });
    ui.toast('Message');
    const ok = document.querySelector('#modalOk').getBoundingClientRect();
    const hitModal = document.elementFromPoint(ok.left + ok.width / 2, ok.top + ok.height / 2);
    const toast = document.querySelector('#toast .toast-item').getBoundingClientRect();
    const zToast = +getComputedStyle(document.querySelector('#toast')).zIndex;
    const zModal = +getComputedStyle(document.querySelector('#modalBg')).zIndex;
    const zScene = +getComputedStyle(document.querySelector('#sceneOverlay')).zIndex;
    const zSheet = +getComputedStyle(document.querySelector('#menuBg')).zIndex;
    const innerPadTop = parseFloat(getComputedStyle(document.querySelector('#sceneInner')).paddingTop);
    const modalPadTop = parseFloat(getComputedStyle(document.querySelector('#modalBg')).paddingTop);
    const navTop = document.querySelector('nav.tabs').getBoundingClientRect().top;
    document.querySelector('#sceneOverlay').classList.remove('show');
    return { modalOnTop: hitModal?.id === 'modalOk', zToast, zModal, zScene, zSheet, toastVisible: toast.width > 0, toastAboveNav: toast.bottom <= navTop, innerPadTop, modalPadTop };
  });
  t.check(z.modalOnTop && z.zModal > z.zScene, 'la modale passe au-dessus de l\'overlay de scène', JSON.stringify(z));
  t.check(z.zModal > z.zSheet && z.zSheet > 10, 'le menu ⋯ passe au-dessus du jeu, sous les modales', JSON.stringify(z));
  t.check(z.zToast > z.zModal && z.toastVisible && z.toastAboveNav, 'le toast passe au-dessus de tout, sans masquer la barre d\'onglets', JSON.stringify(z));
  t.check(z.innerPadTop >= 47 && z.modalPadTop >= 47, 'overlay de scène et modale décalés sous l\'encoche', JSON.stringify(z));
  await page.context().close();

  // Ordinateur : le bandeau d'alertes n'est pas recouvert par les onglets après défilement
  const desk = await openGame(browser, srv.base, { width: 1280, height: 800 });
  const ab = await desk.evaluate(async () => {
    const st = await import('./src/state.js');
    const ui = await import('./src/ui.js');
    st.S.res.biomasse = 0;   // déclenche une alerte
    ui.render();
    ui.gotoView('recits', 'journal');
    document.querySelector('main').style.minHeight = '4000px';
    window.scrollTo(0, 1500);
    const bar = document.querySelector('#alertBar').getBoundingClientRect();
    const el = document.elementFromPoint(bar.left + 40, bar.top + bar.height / 2);
    return { visible: bar.height > 0 && bar.top >= 0, hit: el?.closest('#alertBar') ? 'alertBar' : el?.tagName };
  });
  t.check(ab.visible && ab.hit === 'alertBar', 'ordinateur : bandeau d\'alertes visible après défilement', JSON.stringify(ab));
  await desk.context().close();
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
