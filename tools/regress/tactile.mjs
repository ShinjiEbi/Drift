#!/usr/bin/env node
/* global document, window */
// tools/regress/tactile.mjs — non-régression du constat F11 (cibles tactiles).
// Usage : node tools/regress/tactile.mjs
// À 360 px : les actions principales font au moins 44 px de haut ; les petits
// boutons d'en-tête de carte ont une zone de toucher d'au moins 44 px
// (vérifiée par elementFromPoint au-dessus et au-dessous du bouton).
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './lib.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Cibles tactiles (360 px)');
const srv = await startServer();
const browser = await chromium.launch();

try {
  const page = await openGame(browser, srv.base, { width: 360, height: 780, mobile: true });
  await fillColony(page);
  const r = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const S = st.S;
    document.querySelector('#modalBg').classList.remove('show');
    // Une recherche et une fabrication en cours pour afficher leurs boutons « Annuler »
    S.research.push({ id: 'r_t', techId: Object.keys((await import('./src/catalog.js')).TECH_TREE)[0], doneMin: 0, totalMin: 600 });
    S.fabrication.push({ id: 'f_t', fabId: Object.keys((await import('./src/catalog.js')).FABRICATIONS)[0], doneMin: 0, totalMin: 600 });
    const MAIN = ['footer.actions button', 'nav.tabs button', 'nav.subtabs button', '.module button.build', '.person .actions-row button',
      '.assign-toolbar .quick-action', '.cta-btn', '.back-btn'];
    const SMALL = ['.staff-panel .sp-link', '.research-active .ra-cancel', '.fab-active .fa-cancel'];
    const views = [['overview'], ['modules', 'construction'], ['modules', 'assignments'], ['crew', 'recruit'], ['crew', 'soins'],
      ['galaxy', 'fleet'], ['stocks', 'research'], ['stocks', 'workshop']];
    const tooSmall = new Map();
    const hitBad = new Map();
    for (const [tab, sub] of views) {
      ui.selectTab(tab); if (sub) ui.selectSubtab(tab, sub); ui.render();
      for (const sel of MAIN) {
        for (const el of document.querySelectorAll(sel)) {
          if (!el.getClientRects().length) continue;
          const h = el.getBoundingClientRect().height;
          if (h < 43.5) tooSmall.set(sel, Math.round(h));
        }
      }
      for (const sel of SMALL) {
        for (const el of document.querySelectorAll(`#view-${tab} ${sel}`)) {
          if (!el.getClientRects().length) continue;
          el.scrollIntoView({ block: 'center' });
          const rc = el.getBoundingClientRect();
          const x = rc.left + rc.width / 2;
          const top = (rc.top + rc.bottom) / 2 - 21.5;
          const bottom = (rc.top + rc.bottom) / 2 + 21.5;
          for (const y of [top, bottom]) {
            const hit = document.elementFromPoint(x, y);
            if (hit !== el) hitBad.set(sel, `${Math.round(rc.height)}px, ${hit?.className || hit?.tagName}`);
          }
        }
      }
    }
    // Modale : boutons et éléments de sélection
    ui.selectTab('modules'); ui.selectSubtab('modules', 'assignments');
    document.querySelector('#assignList .slot-row')?.click();
    for (const el of document.querySelectorAll('#modal button, #modal .assign-pick-item')) {
      const h = el.getBoundingClientRect().height;
      if (h < 43.5) tooSmall.set('modale ' + (el.className || el.tagName), Math.round(h));
    }
    document.querySelector('#modalBg').classList.remove('show');
    window.scrollTo(0, 0);
    return { tooSmall: [...tooSmall].map(([k, v]) => `${k}: ${v}px`), hitBad: [...hitBad].map(([k, v]) => `${k}: ${v}`) };
  });
  t.check(r.tooSmall.length === 0, 'actions principales ≥ 44 px de haut', r.tooSmall.join(' ; '));
  t.check(r.hitBad.length === 0, 'petits boutons : zone de toucher ≥ 44 px', r.hitBad.join(' ; '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
