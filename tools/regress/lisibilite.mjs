#!/usr/bin/env node
/* global document, getComputedStyle, Node */
// tools/regress/lisibilite.mjs — non-régression du constat M17 (lisibilité).
// Usage : node tools/regress/lisibilite.mjs
//  - le zoom n'est pas bloqué (viewport sans user-scalable=no / maximum-scale) ;
//  - aucun texte visible sous 11 px, dans toutes les vues (390 px de large) ;
//  - les champs de saisie font au moins 16 px (pas d'auto-zoom iOS) ;
//  - --text-mute et --rust-text atteignent 4,5:1 sur toutes les surfaces du thème.
import { loadPlaywright, startServer, reporter, openGame, fillColony } from './lib.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Lisibilité : zoom, tailles de police, contrastes');
const srv = await startServer();
const browser = await chromium.launch();

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

try {
  const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  await fillColony(page);

  const viewport = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  t.check(!/user-scalable\s*=\s*no|maximum-scale/.test(viewport), 'le zoom n\'est pas bloqué', viewport);

  const small = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    document.querySelector('#modalBg').classList.remove('show');
    const views = [['overview'], ['modules', 'construction'], ['modules', 'assignments'], ['crew', 'personnel'], ['crew', 'recruit'],
      ['crew', 'formation'], ['crew', 'soins'], ['galaxy', 'cartographie'], ['galaxy', 'fleet'], ['galaxy', 'expeditions'],
      ['galaxy', 'diplomatie'], ['stocks', 'inventory'], ['stocks', 'library'], ['stocks', 'research'], ['stocks', 'workshop'], ['arcs'], ['journal']];
    const found = new Map();
    const scan = root => {
      for (const el of root.querySelectorAll('*')) {
        if (!el.getClientRects().length) continue;
        const hasText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if (!hasText) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 10.95) found.set(el.className || el.tagName, fs);
      }
    };
    for (const [tab, sub] of views) {
      ui.selectTab(tab); if (sub) ui.selectSubtab(tab, sub); ui.render();
      scan(document.querySelector('#view-' + tab));
    }
    scan(document.querySelector('header.top'));
    scan(document.querySelector('.topbars'));
    scan(document.querySelector('footer.actions'));
    return [...found].map(([k, v]) => `${k} (${v}px)`);
  });
  t.check(small.length === 0, 'aucun texte visible sous 11 px', small.slice(0, 8).join(', '));

  const inputFs = await page.evaluate(() => {
    document.querySelector('#btnRename').click();
    const fs = parseFloat(getComputedStyle(document.querySelector('#modalInput')).fontSize);
    document.querySelector('#modalBg').classList.remove('show');
    return fs;
  });
  t.check(inputFs >= 16, 'le champ de renommage fait au moins 16 px', `${inputFs}px`);

  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    return { mute: v('--text-mute'), rustText: v('--rust-text'), bg: v('--bg'), deep: v('--bg-deep'), surface: v('--surface'), surface2: v('--surface-2') };
  });
  for (const fg of ['mute', 'rustText']) {
    const worst = Math.min(...['bg', 'deep', 'surface', 'surface2'].map(b => ratio(vars[fg], vars[b])));
    t.check(worst >= 4.5, `contraste de --${fg === 'mute' ? 'text-mute' : 'rust-text'} ≥ 4,5:1 sur toutes les surfaces`, `${vars[fg]} : ${worst.toFixed(2)}:1`);
  }
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
