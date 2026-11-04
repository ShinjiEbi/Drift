/* global document, window, Notification */  // utilisés dans les callbacks exécutés par le navigateur
// « Réoptimiser » (ui.js) × poste réservé d'un colon en poste parti en expédition (app.js 0.33)
import { banc } from './_banc.mjs';
const b = await banc();
const page = await b.page();
await page.goto(b.base);
await b.waitGame(page);
const r = await page.evaluate(async () => {
  const st = await import('./src/state.js');
  const app = await import('./src/app.js');
  const cat = await import('./src/catalog.js');
  const S = st.S;
  for (const id of ['habitat', 'mine_surface', 'hangar']) S.modules[id] = { level: 1 };
  S.autoAssign = false;
  for (let i = 0; i < 3; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
  S.autoAssign = true;
  const x = S.crew[0];
  app.unassignMember(x.id);
  for (const k of Object.keys(S.assignments)) delete S.assignments[k];
  for (const m of S.crew) m.statut = 'libre';
  app.autoAssignMember(x.id, { force: true });   // V1 : désaffecté par le joueur → replacé seulement sur demande
  const a = app.memberAssignment(x.id);
  globalThis.__slot = a.modKey + ':' + a.slotIdx;
  for (const sys of S.galaxy.systems) sys.scanned = true;
  S.fleet.push({ id: 'v_o', type: Object.keys(cat.VESSELS)[0], name: 'Navette', available: true });
  S.res.energie = 400; S.res.biomasse = 300;
  const body = S.galaxy.systems.find(s => s.distance > 0.8).bodies[0];
  app.launchExpedition({ vesselId: 'v_o', bodyId: body.id, crewIds: [x.id] });
  const before = { slot: globalThis.__slot, reserved: S.assignments[globalThis.__slot] === x.id, statut: x.statut };
  return { x: x.id, slot: globalThis.__slot, before };
});
console.log('X en expédition, poste réservé :', JSON.stringify(r.before));
await page.evaluate(() => { document.querySelector('nav.tabs button[data-tab="modules"]').click(); document.querySelector('[data-subtab-mod="assignments"]').click(); });
await page.waitForTimeout(200);
await page.click('#optimizeAssignBtn');
await page.waitForTimeout(200);
const after = await page.evaluate(async ({ id, slot }) => {
  const { S } = await import('./src/state.js');
  const occ = S.assignments[slot];
  return { reservedForX: occ === id, occupant: S.crew.find(c => c.id === occ)?.name || null, xStatut: S.crew.find(c => c.id === id).statut };
}, { id: r.x, slot: r.slot });
console.log('après « Réoptimiser » :', JSON.stringify(after));
b.check(after.reservedForX, 'le poste de X reste réservé pendant son expédition');
await b.fin();
