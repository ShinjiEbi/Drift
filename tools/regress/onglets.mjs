#!/usr/bin/env node
/* global document, localStorage */
// tools/regress/onglets.mjs — non-régression M10 : deux onglets ne s'écrasent plus la sauvegarde.
//   - un rechargement simple ne déclenche pas l'alerte « déjà ouvert »
//   - le 2e onglet affiche la modale et ne simule ni ne sauvegarde
//   - « Utiliser cet onglet » : l'onglet actif sauvegarde, se met en pause, l'autre
//     reprend la partie à jour ; et inversement
// Usage : NODE_PATH=$(npm root -g) node tools/regress/onglets.mjs
import { banc, SAVE_KEY } from './_banc.mjs';

const b = await banc();
const { check } = b;

const title = page => page.evaluate(() => (document.querySelector('#modalBg.show #modal h3')?.textContent || '').trim());
const stateOf = page => page.evaluate(async () => {
  const { S, isSimPaused, savesLocked } = await import('./src/state.js');
  return { has: !!S?.meta, gm: S?.meta?.gameMin, name: S?.meta?.colonyName, paused: isSimPaused(), locked: savesLocked() };
});

try {
  const ctx = await b.context();
  const p1 = await b.page(ctx);
  await p1.goto(b.base);
  await b.waitGame(p1);

  console.log('1. Rechargement simple');
  await p1.reload();
  await b.waitGame(p1);
  await p1.waitForTimeout(500);
  check(!/déjà ouvert/.test(await title(p1)), 'pas d\'alerte « déjà ouvert » après un rechargement');
  await p1.evaluate(async () => { const { S, save } = await import('./src/state.js'); S.meta.colonyName = 'Onglet-1'; save(); });

  console.log('2. Second onglet');
  const p2 = await b.page(ctx);
  await p2.goto(b.base);
  await b.until(p2, () => /déjà ouvert/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 5000 });
  check(true, 'le 2e onglet affiche « DRIFT est déjà ouvert dans un autre onglet »');
  const s2 = await stateOf(p2);
  check(!s2.has, 'le 2e onglet ne simule pas (aucune partie chargée)');
  const raw1 = await p1.evaluate(k => localStorage.getItem(k), SAVE_KEY);
  await p2.waitForTimeout(300);
  const g1a = (await stateOf(p1)).gm;
  await p1.waitForTimeout(1200);
  check((await stateOf(p1)).gm > g1a, 'le 1er onglet continue de tourner');
  check(JSON.parse(raw1).meta.colonyName === 'Onglet-1', 'la sauvegarde reste celle du 1er onglet');

  console.log('3. « Utiliser cet onglet » dans le 2e');
  await p2.click('#modalOk');
  await b.waitGame(p2);
  await b.until(p1, () => /déjà ouvert/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 5000 });
  const s1 = await stateOf(p1);
  const s2b = await stateOf(p2);
  check(s1.paused && s1.locked, 'le 1er onglet est en pause et n\'écrit plus');
  check(s2b.has && s2b.name === 'Onglet-1' && s2b.gm >= s1.gm - 1, `le 2e reprend la partie à jour (${s2b.name}, minute ${s2b.gm} ≥ ${s1.gm})`);
  const g1 = s1.gm;
  await p1.waitForTimeout(1200);
  check((await stateOf(p1)).gm === g1, 'le 1er onglet ne simule plus');
  await p2.evaluate(async () => { const { S, save } = await import('./src/state.js'); S.meta.colonyName = 'Onglet-2'; save(); });
  await p1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p1.waitForTimeout(300);
  check(JSON.parse(await p1.evaluate(k => localStorage.getItem(k), SAVE_KEY)).meta.colonyName === 'Onglet-2', 'le 1er onglet n\'écrase pas la sauvegarde du 2e');

  console.log('4. Reprise par le 1er onglet');
  await Promise.all([p1.waitForEvent('load', { timeout: 8000 }), p1.click('#modalOk')]);
  await b.waitGame(p1);
  await b.until(p2, () => /déjà ouvert/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 5000 });
  const s1c = await stateOf(p1);
  check(s1c.name === 'Onglet-2' && !s1c.paused, 'le 1er onglet reprend la partie (avec les changements du 2e)');
  check((await stateOf(p2)).paused, 'le 2e onglet passe en pause');
  b.noErrors(p1, 'onglet 1 sans erreur');
  b.noErrors(p2, 'onglet 2 sans erreur');
  await ctx.close();
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
