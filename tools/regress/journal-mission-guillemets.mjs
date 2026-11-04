/* global document, window, Notification */  // utilisés dans les callbacks exécutés par le navigateur
// Assainissement au chargement (state.js) × journal de mission d'une chronique (exp.accumulatedLog)
import { banc } from './_banc.mjs';
const b = await banc();
const page = await b.page();
await page.goto(b.base);
await b.waitGame(page);
const expId = await page.evaluate(async () => {
  const st = await import('./src/state.js');
  const app = await import('./src/app.js');
  const ch = await import('./src/chronicles.js');
  const S = st.S;
  S.modules.habitat = { level: 3 }; S.modules.hangar = { level: 1 };
  for (let i = 0; i < 2; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
  const scene = ch.CHRONICLE_SCENES.find(s => s.choices.some(c => /verrou actif/.test(c.outcome?.log || '')));
  const chronId = Object.keys(ch.CHRONICLES).find(id => JSON.stringify(ch.CHRONICLES[id].episodes).includes('anneau')) || Object.keys(ch.CHRONICLES)[0];
  const sys = S.galaxy.systems[1]; const body = sys.bodies[0];
  body.chronicle = { id: chronId, episodeIdx: 0, flags: { ...(ch.CHRONICLES[chronId].initialFlags || {}) }, completed: false, currentSceneId: null };
  S.fleet.push({ id: 'v_qt', type: 'navette', name: 'Navette', available: false });
  const m = S.crew[0]; m.statut = 'expedition';
  S.expeditions.push({ id: 'e_qt', vesselId: 'v_qt', bodyId: body.id, systemId: sys.id, crewIds: [m.id], phase: 'sur_place', elapsedMin: 0, oneWayMin: 60, onSiteMin: 240, cost: {}, bodyDistance: 1, seed: 'qt', scenes: ['__chron_intro__'], sceneIdx: 0, awaitingChoice: true, accumulatedLoot: {}, accumulatedItems: [], accumulatedLog: [], sceneThreatMod: 0, equipment: {}, chronicleSceneId: scene.id, chronicleRef: { id: chronId, episodeIdx: 0 } });
  const idx = scene.choices.findIndex(c => /verrou actif/.test(c.outcome?.log || ''));
  app.playChoice('e_qt', idx);
  st.save();
  return 'e_qt';
});
const mini = async () => {
  await page.evaluate(() => document.querySelector('nav.tabs button[data-tab="galaxy"]').click());
  await page.evaluate(() => document.querySelector('#subtab-expeditions')?.click());
  await page.waitForTimeout(200);
  await page.click(`button[data-resume-exp="e_qt"]`);
  await page.waitForTimeout(200);
  const t = await page.evaluate(() => Array.from(document.querySelectorAll('.mj-line')).map(l => l.textContent.trim()).filter(t => /verrou/.test(t)));
  await page.evaluate(() => document.querySelector('[data-action-scene="close"]')?.click());
  return t;
};
const before = await mini();
await page.reload();
await b.waitGame(page);
const after = await mini();
console.log('avant rechargement :', before);
console.log('après rechargement :', after);
b.check(before.join() === after.join(), 'le journal de mission est identique après rechargement');
await b.fin();
