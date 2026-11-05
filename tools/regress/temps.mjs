#!/usr/bin/env node
/* global document, window, MutationObserver */
// tools/regress/temps.mjs — non-régression : temps de jeu et rattrapage.
//   E3 : onglet caché, minuteur ralenti à 1 appel/min → le temps n'est plus perdu
//        (10 min réelles ≈ 600 min de jeu) ; page gelée réveillée en arrière-plan ;
//        horloge système qui recule
//   M1 : rattrapage de 12 h par morceaux : page réactive, barre de progression,
//        « Reprise du contact » à la fin, pas de double simulation
//   E1 : incidents du rattrapage appliqués automatiquement, aucune modale empilée
// Usage : NODE_PATH=$(npm root -g) node tools/regress/temps.mjs
import { banc } from './_banc.mjs';

const b = await banc();
const { check } = b;

const gameMin = page => page.evaluate(async () => (await import('./src/state.js')).S.meta.gameMin);
const setHidden = (page, hidden) => page.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

try {
  // ------------------------------------------------------------------
  console.log('1. Onglet caché, minuteur ralenti (1 appel par minute)');
  {
    const ctx = await b.context();
    const page = await b.page(ctx);
    const T0 = new Date('2026-11-04T10:00:00Z').getTime();
    await page.clock.install({ time: T0 });
    await page.goto(b.base);
    await b.waitGame(page);
    await page.clock.pauseAt(T0 + 20000);
    await page.clock.runFor(1000);
    const g0 = await gameMin(page);
    await setHidden(page, true);
    // fastForward : saute dans le temps et ne déclenche chaque minuteur qu'une
    // fois — exactement ce que fait Chrome avec un onglet caché depuis 5 min.
    for (let i = 0; i < 10; i++) await page.clock.fastForward(60000);
    const g1 = await gameMin(page);
    check(Math.abs(g1 - g0 - 600) <= 2, `10 min réelles cachées → ${g1 - g0} min de jeu (attendu ≈ 600)`);
    await setHidden(page, false);
    await page.clock.runFor(1000);
    const g2 = await gameMin(page);
    check(g2 - g1 >= 0 && g2 - g1 <= 2, `retour au premier plan : pas de double simulation (+${g2 - g1})`);

    console.log('2. Page gelée 3 h, réveillée en arrière-plan puis affichée');
    // Un bilan d'expédition pas encore lu : la reprise du contact doit y mener
    await page.evaluate(async () => {
      const { S } = await import('./src/state.js');
      S.expHistory.push({ expId: 'e_bilan_test', bilanVu: false, bilan: { expId: 'e_bilan_test', lieu: 'Lune de test', systeme: 'Test', duree: 1800,
        equipe: [], gains: { metal: 40 }, objets: [], schemas: [], blesses: [], morts: [], chronique: null, faits: [], final: true } });
    });
    await setHidden(page, true);
    await page.clock.fastForward(3 * 3600e3);
    const g3 = await gameMin(page);
    check(g3 - g2 <= 1, `réveil en arrière-plan : rien de simulé tant que l'onglet est caché (+${g3 - g2})`);
    await setHidden(page, false);
    await page.clock.runFor(2000);
    await b.until(page, async () => !(await import('./src/state.js')).isCatchingUp(), null, { timeout: 15000 });
    const g4 = await gameMin(page);
    check(Math.abs(g4 - g3 - 3 * 3600) <= 5, `retour : rattrapage des 3 h (+${g4 - g3} min de jeu, attendu ≈ 10800)`);
    const title = await page.textContent('#modal h3').catch(() => '');
    check(/Reprise du contact/.test(title) && await page.$('#modalBg.show'), '« Reprise du contact » affichée');
    const bilanBtn = await page.$('#modal [data-catchup-bilan="e_bilan_test"]');
    check(!!bilanBtn && /Lune de test/.test(await bilanBtn.textContent()), 'bouton vers le bilan non lu dans la reprise du contact');
    await bilanBtn?.click();
    await page.waitForTimeout(200);
    check(/Lune de test/.test(await page.textContent('#modal').catch(() => '')), 'le bouton ouvre le bilan');
    await page.evaluate(() => document.querySelector('#modalBg')?.classList.remove('show'));

    console.log('3. Horloge système qui recule');
    const g5 = await gameMin(page);
    await page.clock.setSystemTime(T0);   // ≈ 3 h en arrière
    await page.clock.runFor(3000);
    const g6 = await gameMin(page);
    check(g6 - g5 >= 1 && g6 - g5 <= 4, `horloge reculée : recalage sans simulation massive (+${g6 - g5})`);
    b.noErrors(page, 'aucune erreur de page');
    await ctx.close();
  }

  // ------------------------------------------------------------------
  console.log('4. Rattrapage hors ligne de 12 h');
  {
    const ctx = await b.context();
    // Sonde de réactivité : un minuteur de 10 ms mesure les blocages du fil principal ;
    // un observateur compte les fenêtres d'incident ouvertes pendant le rattrapage.
    await ctx.addInitScript(() => {
      window.__gaps = [];
      window.__incidentModals = 0;
      window.__progressSeen = false;
      let last = performance.now();
      const probe = () => {
        const now = performance.now();
        window.__gaps.push(now - last);
        last = now;
        setTimeout(probe, 10);
      };
      setTimeout(probe, 10);
      document.addEventListener('DOMContentLoaded', () => {
        const m = document.getElementById('modal');
        new MutationObserver(() => {
          if (m.querySelector('[data-incident-choice], [data-event-choice]')) window.__incidentModals++;
          if (m.querySelector('#catchupBar')) window.__progressSeen = true;
        }).observe(m, { childList: true, subtree: true });
      });
    });
    const page = await b.page(ctx);
    await page.goto(b.base);
    await b.waitGame(page);
    await page.evaluate(async () => {
      const st = await import('./src/state.js');
      const S = st.S;
      st.setSimPaused(true);
      for (const id of ['habitat', 'mine_surface', 'hydroponie', 'generateur_solaire', 'laboratoire', 'atelier', 'infirmerie', 'hangar']) S.modules[id] = { level: 3 };
      for (let i = 0; i < 10; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
      for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k) * 0.6;
      S.nextIncidentMin = S.meta.gameMin;
      S.nextEventMin = S.meta.gameMin;
      S.meta.lastTickRealMs = Date.now() - 12 * 3600e3;
      st.save();
      st.lockSaves('test');   // la page ne réécrit plus rien avant le rechargement
    });
    const before = await page.evaluate(async () => (await import('./src/state.js')).S.meta.gameMin);
    const t0 = Date.now();
    await page.reload();
    await b.until(page, async () => {
      const st = await import('./src/state.js');
      return !!st.S && !st.isCatchingUp() && /Reprise du contact/.test(document.querySelector('#modal h3')?.textContent || '');
    }, null, { timeout: 25000, interval: 200 });
    const dt = (Date.now() - t0) / 1000;
    const r = await page.evaluate(async () => {
      const { S } = await import('./src/state.js');
      const app = await import('./src/app.js');
      const gaps = window.__gaps.slice(5);
      const rep = app.getLastReturnReport();
      return {
        report: rep && { faits: Array.isArray(rep.faits), deces: Array.isArray(rep.deces), ev: rep.evenementRetour, enAttente: rep.enAttente },
        pendingKinds: S.pendingDecisions.map(d => d.kind + ':' + d.refId),
        minorQueued: S.pendingDecisions.filter(d => d.kind === 'incident' && app.INCIDENTS[d.refId]?.gravite === 'mineur' && d.offline).length,
        gm: S.meta.gameMin, pending: S.pendingDecisions.length,
        maxGap: Math.max(...gaps), incidentModals: window.__incidentModals, progress: window.__progressSeen,
        modal: document.querySelector('#modal').textContent,
        autoLogs: S.journal.filter(e => /décision automatique/.test(e.txt)).length
      };
    });
    const simulated = r.gm - before;
    check(simulated >= 43200 && simulated <= 43200 + dt + 5, `12 h simulées sans double comptage (+${simulated} min de jeu, ${dt.toFixed(1)} s réelles)`);
    check(r.progress, 'barre de progression affichée pendant le rattrapage');
    check(r.maxGap < 250, `page réactive pendant le rattrapage (blocage max ${r.maxGap.toFixed(0)} ms)`);
    check(r.incidentModals === 0 && r.pending <= 3, `aucune fenêtre d'incident pendant le rattrapage ; ${r.pending} décision(s) gardée(s) pour le retour (${r.pendingKinds.join(', ')})`);
    check(r.minorQueued === 0, 'hors ligne, les incidents mineurs ne sont pas mis en attente');
    check(r.report?.faits && r.report?.deces && r.report.enAttente === r.pending, 'rapport de retour : récit et données (getLastReturnReport)');
    check(!r.report?.ev || r.pendingKinds.some(k => k.startsWith('event:')), `événement garanti au retour (${r.report?.ev || 'aucun éligible'})`);
    check(/Incidents gérés automatiquement/.test(r.modal) && r.autoLogs > 0, `incidents appliqués automatiquement (${r.autoLogs} entrées de journal)`);
    b.noErrors(page, 'aucune erreur de page');
    await ctx.close();
  }
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
