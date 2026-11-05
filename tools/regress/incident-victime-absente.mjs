/* global document, window, Notification */  // utilisés dans les callbacks exécutés par le navigateur
// File des décisions (app.js, 0.33) × colons en poste admis en expédition (canLaunchExpedition, 0.33) :
// un incident en attente garde sa victime même si elle a quitté la base entre-temps.
import { banc } from './_banc.mjs';
const b = await banc({ timeoutMs: 60000 });

async function scenario(choiceRe, simulateMin) {
  const page = await b.page(await b.context());
  await page.goto(b.base);
  await b.waitGame(page);
  const ids = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const cat = await import('./src/catalog.js');
    const S = st.S;
    for (const id of ['habitat', 'mine_surface', 'hydroponie', 'generateur_solaire', 'hangar']) S.modules[id] = { level: 3 };
    S.autoAssign = false;
    for (let i = 0; i < 3; i++) { const c = st.genCandidate(); c.traits = []; S.candidates.push(c); st.acceptCandidate(c.id); }
    const [x] = S.crew;
    app.assignMember(x.id, 'mine_surface', 0);       // X : seul mineur en poste
    S.fleet.push({ id: 'v_q', type: Object.keys(cat.VESSELS)[0], name: 'Navette', available: true });
    for (const sys of S.galaxy.systems) sys.scanned = true;
    S.res.energie = 400; S.res.biomasse = 300; S.res.metal = 900; S.res.cristal = 700;
    S.nextIncidentMin = 1e9; S.nextEventMin = 1e9;
    const body = S.galaxy.systems.find(s => s.distance > 0.8).bodies[0];
    return { x: x.id, body: body.id };
  });
  // 1. Le joueur ouvre l'écran de lancement d'expédition…
  await page.evaluate(async (bodyId) => (await import('./src/ui.js')).showLaunchModal(bodyId), ids.body);
  // 2. … un éboulement survient à la mine : victime X (seul en poste) → mis en file (fenêtre déjà ouverte)
  await page.evaluate(async () => (await import('./src/app.js')).triggerIncident('mine_eboulement', false));
  await page.waitForTimeout(500);
  const victim = await page.evaluate(async () => (await import('./src/state.js')).S.pendingDecisions[0]?.acteurs?.victime);
  // 3. Il ouvre les réglages, choisit le vaisseau et X seul (en poste, donc éligible ;
  //    l'équipe proposée d'office est d'abord retirée), puis décolle
  await page.click('#modal .lx-details > summary');
  await page.click('[data-pick-vessel]');
  for (let i = 0; i < 6; i++) {
    const sel = await page.$(`#modal .crew-picker-item.selected:not([data-pick-crew="${ids.x}"])`);
    if (!sel) break;
    await sel.click();
  }
  if (!await page.$(`#modal [data-pick-crew="${ids.x}"].selected`)) await page.click(`[data-pick-crew="${ids.x}"]`);
  await page.click('#launchGo');
  await page.waitForTimeout(700);
  const shown = await page.evaluate(() => document.querySelector('#modalBg.show #modal .incident-body')?.textContent);
  // 4. La décision s'affiche, toujours au nom de X ; le joueur choisit
  await page.evaluate(re => Array.from(document.querySelectorAll('#modal [data-incident-choice]')).find(b => new RegExp(re).test(b.textContent)).click(), choiceRe);
  await page.waitForTimeout(300);
  const res = await page.evaluate(async ({ id, simulateMin }) => {
    const st = await import('./src/state.js');
    const m = () => st.S.crew.find(c => c.id === id);
    const after = { statut: m().statut, statuts: m().statuts.map(s => s.key) };
    if (simulateMin) {
      st.setSimPaused(true);
      for (let i = 0; i < simulateMin; i++) st.tickOnce({ silent: true });
    }
    return { after, later: { statut: m().statut, statuts: m().statuts.map(s => s.key) }, inExp: st.S.expeditions.some(e => e.crewIds.includes(id)) };
  }, { id: ids.x, simulateMin });
  console.log(`[${choiceRe}] victime en file = X : ${victim === ids.x} ; fenêtre : « ${shown?.trim()} »`);
  console.log('   X juste après le choix :', JSON.stringify(res.after), simulateMin ? `| ${simulateMin} min plus tard : ${JSON.stringify(res.later)}` : '');
  await page.close();
  return res;
}
const r1 = await scenario('Sauver', 0);
b.check(!(r1.after.statut === 'expedition' && r1.after.statuts.length), '« Sauver d\'abord la victime » ne blesse pas un colon parti en expédition');
const r2 = await scenario('Forcer', 24 * 60 + 5);
b.check(r2.later.statut !== 'mort', '« Forcer la reprise » ne tue pas (24 h plus tard) un colon parti en expédition');
await b.fin();
