#!/usr/bin/env node
/* global document */
// tools/regress/contrats-reels.mjs — les vues appellent app.js sans dépendre de lui
// (import * as App, appCall('nom'), hasApp('nom'), App.nom) : un export manquant
// ne casse rien, la fonctionnalité disparaît en silence. Ce test relève tous ces
// noms dans le code et vérifie qu'ils existent dans le VRAI app.js (pas une doublure),
// puis qu'une partie neuve propose bien la file de chantiers.
// Usage : node tools/regress/contrats-reels.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, startServer, reporter, openGame } from './_ui.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const fichiers = ['src/objectives.js', 'src/ui.js', ...fs.readdirSync(path.join(ROOT, 'src/views')).map(f => 'src/views/' + f)];
const noms = new Set();
for (const f of fichiers) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/(?:appCall|hasApp)\('([A-Za-z_][\w$]*)'/g)) noms.add(m[1]);
  for (const m of src.matchAll(/\bApp\.([A-Za-z_][\w$]*)/g)) noms.add(m[1]);
}

const { chromium } = loadPlaywright();
const t = reporter('Contrats réels : fonctions d\'app.js appelées par les vues');
const srv = await startServer();
const browser = await chromium.launch();
try {
  const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  const manquants = await page.evaluate(async noms => {
    const A = await import('./src/app.js');
    return noms.filter(n => A[n] === undefined);
  }, [...noms]);
  t.check(noms.size >= 20 && manquants.length === 0, `${noms.size} noms appelés par les vues, tous exportés par app.js`, manquants.join(', '));

  // Partie neuve : un chantier en cours, la file se propose sur les autres cartes
  const file = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const ui = await import('./src/ui.js');
    document.querySelector('#modalBg')?.classList.remove('show');
    st.setSimPaused(true);
    st.S.res.metal = 2000; st.S.res.cristal = 2000;
    st.startBuild('generateur_solaire');
    ui.gotoView('base', 'construction');
    ui.render();
    const btn = document.querySelector('.mod-card[data-id="mine_surface"] button');
    const avant = btn?.textContent.trim();
    btn?.click();
    ui.render();
    return { avant, queue: st.S.buildQueue.length, compteur: document.querySelector('#view-base')?.textContent.match(/file \d\/\d/)?.[0] };
  });
  t.check(/en file/i.test(file.avant || '') && file.queue === 1 && file.compteur === 'file 1/3', 'chantier en cours : « Mettre en file » ajoute à la file (file 1/3)', JSON.stringify(file));
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
