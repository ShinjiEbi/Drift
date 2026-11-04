#!/usr/bin/env node
/* global document, window, getComputedStyle, innerWidth */
// tools/regress/layout.mjs — non-régression de la mise en page mobile.
// Usage : node tools/regress/layout.mjs
//  E6  : les boutons du pied de page (Exporter, Importer, Recommencer…) sont
//        cliquables en bas de page, pas cachés sous la barre d'onglets fixe.
//  F10 : les 7 onglets tiennent dans l'écran (360 et 320 px), sans défilement.
//  E2  : la modale s'affiche au-dessus de l'overlay de scène, le toast au-dessus de tout.
//  M18 : les zones de sécurité iPhone (émulées via --safe-*) décalent l'en-tête,
//        la barre d'onglets, l'overlay de scène et la modale.
//  Divers : le bandeau d'alertes reste visible (non recouvert) après défilement.
import { loadPlaywright, startServer, reporter, openGame } from './lib.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Mise en page : pied de page, onglets, empilement, zones de sécurité');
const srv = await startServer();
const browser = await chromium.launch();
const SAFE = ':root{--safe-top:47px !important;--safe-bottom:34px !important;--safe-left:0px !important;--safe-right:0px !important;}';

try {
  const sizes = [[360, 780, true], [390, 844, true], [1280, 800, false], [320, 640, true]];
  for (const [w, h, mobile] of sizes) {
    for (const safe of mobile ? [false, true] : [false]) {
      const page = await openGame(browser, srv.base, { width: w, height: h, mobile });
      if (safe) await page.addStyleTag({ content: SAFE });
      await page.waitForTimeout(100);
      const label = `${w}×${h}${safe ? ' (zone de sécurité)' : ''}`;
      const r = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const hidden = [];
        for (const b of document.querySelectorAll('footer.actions button')) {
          const rc = b.getBoundingClientRect();
          const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          if (!(el === b || b.contains(el))) hidden.push(b.id);
        }
        const nav = document.querySelector('nav.tabs');
        const outOfScreen = [...nav.querySelectorAll('button')].filter(b => b.getBoundingClientRect().right > innerWidth + 0.5).length;
        return {
          hidden,
          navScroll: nav.scrollWidth - nav.clientWidth,
          outOfScreen,
          pageScrollX: document.documentElement.scrollWidth - innerWidth,
          brandTop: document.querySelector('.brand').getBoundingClientRect().top + window.scrollY,
          navPadBottom: parseFloat(getComputedStyle(nav).paddingBottom),
        };
      });
      t.check(r.hidden.length === 0, `${label} : pied de page cliquable en bas de page`, 'caché : ' + r.hidden.join(', '));
      t.check(r.navScroll <= 0 && r.outOfScreen === 0 && r.pageScrollX <= 0, `${label} : les 7 onglets tiennent, sans défilement horizontal`, JSON.stringify(r));
      if (safe) {
        t.check(r.brandTop >= 47, `${label} : en-tête sous l'encoche`, `haut du titre à ${r.brandTop}px`);
        t.check(r.navPadBottom >= 34, `${label} : barre d'onglets au-dessus de la barre d'accueil`, `padding-bottom ${r.navPadBottom}px`);
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
    const toast = document.querySelector('#toast').getBoundingClientRect();
    const zToast = +getComputedStyle(document.querySelector('#toast')).zIndex;
    const zModal = +getComputedStyle(document.querySelector('#modalBg')).zIndex;
    const zScene = +getComputedStyle(document.querySelector('#sceneOverlay')).zIndex;
    const innerPadTop = parseFloat(getComputedStyle(document.querySelector('#sceneInner')).paddingTop);
    const modalPadTop = parseFloat(getComputedStyle(document.querySelector('#modalBg')).paddingTop);
    document.querySelector('#sceneOverlay').classList.remove('show');
    return { modalOnTop: hitModal?.id === 'modalOk', zToast, zModal, zScene, toastVisible: toast.width > 0, innerPadTop, modalPadTop };
  });
  t.check(z.modalOnTop && z.zModal > z.zScene, 'la modale passe au-dessus de l\'overlay de scène', JSON.stringify(z));
  t.check(z.zToast > z.zModal, 'le toast passe au-dessus de la modale', JSON.stringify(z));
  t.check(z.innerPadTop >= 47 && z.modalPadTop >= 47, 'overlay de scène et modale décalés sous l\'encoche', JSON.stringify(z));
  await page.context().close();

  // Ordinateur : le bandeau d'alertes n'est pas recouvert par les onglets après défilement
  const desk = await openGame(browser, srv.base, { width: 1280, height: 800 });
  const ab = await desk.evaluate(async () => {
    const st = await import('./src/state.js');
    const ui = await import('./src/ui.js');
    st.S.res.biomasse = 0;   // déclenche une alerte
    ui.render();
    ui.selectTab('journal');
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
