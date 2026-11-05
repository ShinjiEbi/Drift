#!/usr/bin/env node
/* global document */
// tools/regress/decisions.mjs — non-régression : file des décisions, incidents, événements.
//   E2  : une seule fenêtre de décision ; la 2e attend la 1re ; la décision en attente
//         survit au rechargement ; rien ne s'affiche pendant une scène ; file plafonnée ;
//         acteurs revalidés (mort entre-temps)
//   E1  : incidents en chaîne — en direct : file ; en silencieux : résolution automatique
//   M2  : coûts vérifiés avant un choix volontaire, montants réels affichés
//   M6  : dégâts sur un module — postes libérés, chantier repris à zéro (niveau payé acquis)
//   M11 : une erreur dans un sous-système ne bloque ni les autres ni l'horloge ;
//         une erreur de rendu ne double pas le temps et n'empêche pas la sauvegarde
// Usage : NODE_PATH=$(npm root -g) node tools/regress/decisions.mjs
import { banc } from './_banc.mjs';

const b = await banc();
const { check } = b;

// Fenêtre de décision affichée : { kind, title, text } ou null
const shown = page => page.evaluate(() => {
  if (!document.querySelector('#modalBg')?.classList.contains('show')) return null;
  const kind = document.querySelector('#modal [data-incident-choice]') ? 'incident'
    : document.querySelector('#modal [data-event-choice]') ? 'event' : 'autre';
  return { kind, title: document.querySelector('#modal h3')?.textContent?.trim(), text: document.querySelector('#modal')?.textContent };
});
const waitShown = (page, re, timeout = 3000) => b.until(page, re => {
  const h3 = document.querySelector('#modalBg.show #modal h3')?.textContent || '';
  return new RegExp(re).test(h3) ? h3 : false;
}, re.source, { timeout });
const clickChoice = (page, sel = '#modal button.incident-choice:not([disabled])') => page.evaluate(s => document.querySelector(s)?.click(), sel);
// V1 : après un choix, la fenêtre montre les conséquences ; « Continuer » la ferme
const choisir = async (page, sel) => {
  await clickChoice(page, sel);
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  await page.click('#consContinue');
};

try {
  const ctx = await b.context();
  const page = await b.page(ctx);
  await page.goto(b.base);
  await b.waitGame(page);
  const ids = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const S = st.S;
    for (const id of ['habitat', 'mine_surface', 'hydroponie', 'generateur_solaire']) S.modules[id] = { level: 3 };
    for (let i = 0; i < 6; i++) {
      const c = st.genCandidate();
      for (const k of Object.keys(c.skills)) c.skills[k] = 3;
      S.candidates.push(c);
      st.acceptCandidate(c.id);
    }
    S.nextIncidentMin = 1e9;   // pas d'incident aléatoire pendant le test
    S.nextEventMin = 1e9;
    st.save();
    return S.crew.map(m => m.id);
  });

  // ------------------------------------------------------------------
  console.log('1. Incident en attente + rechargement (E2)');
  await page.evaluate(async () => (await import('./src/app.js')).triggerIncident('mine_eboulement', false));
  await waitShown(page, /Éboulement/);
  const before = await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    return { victim: S.pendingDecisions[0]?.acteurs?.victime, flag: S.pendingIncident };
  });
  check(before.flag === 'mine_eboulement', 'S.pendingIncident renseigné pour le bandeau d\'alertes');
  await page.reload();
  await b.waitGame(page);
  await waitShown(page, /Éboulement/);
  const after = await page.evaluate(async () => (await import('./src/state.js')).S.pendingDecisions[0]?.acteurs?.victime);
  check(!!before.victim && after === before.victim, 'après rechargement, le même incident réapparaît (même victime)');
  await choisir(page);
  await page.waitForTimeout(300);
  const st1 = await page.evaluate(async () => { const { S } = await import('./src/state.js'); return { n: S.pendingDecisions.length, flag: S.pendingIncident }; });
  check(st1.n === 0 && st1.flag === null && !(await shown(page)), 'choix appliqué : file vide, fenêtre fermée');

  // ------------------------------------------------------------------
  console.log('2. Deux incidents rapprochés (E2)');
  await page.evaluate(async () => {
    const app = await import('./src/app.js');
    app.triggerIncident('mine_filon_riche', false);
    app.triggerIncident('hydro_recolte_abondante', false);
  });
  await waitShown(page, /Filon/);
  await page.waitForTimeout(600);
  check(/Filon/.test((await shown(page))?.title || ''), 'le 2e incident n\'écrase pas le 1er');
  await choisir(page);
  await waitShown(page, /Récolte/);
  check(true, 'le 2e s\'affiche une fois le 1er résolu');
  await choisir(page);
  await page.waitForTimeout(300);

  // ------------------------------------------------------------------
  console.log('3. Pas de décision pendant une scène ; file plafonnée');
  await page.evaluate(() => document.querySelector('#sceneOverlay').classList.add('show'));
  await page.evaluate(async () => {
    const app = await import('./src/app.js');
    for (let i = 0; i < 7; i++) app.triggerIncident('labo_etude_inattendue', false);
  });
  await page.waitForTimeout(700);
  check(!(await shown(page)), 'aucune fenêtre de décision pendant une scène ouverte');
  const cap = await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    return { n: S.pendingDecisions.length, auto: S.journal.filter(e => /décision automatique/.test(e.txt)).length };
  });
  check(cap.n === 3 && cap.auto >= 4, `file plafonnée à 3 (${cap.n}), les plus anciennes mineures résolues automatiquement (${cap.auto})`);
  await page.evaluate(() => document.querySelector('#sceneOverlay').classList.remove('show'));
  await waitShown(page, /Corrélation/);
  check(true, 'la décision s\'affiche à la fermeture de la scène');
  await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    S.pendingDecisions.length = 0;
    document.querySelector('#modalBg').classList.remove('show');
  });

  // ------------------------------------------------------------------
  console.log('4. Événement dont un acteur est mort entre-temps');
  const ev = await page.evaluate(async (ids) => {
    const { S } = await import('./src/state.js');
    const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    S.relations = { [key(ids[0], ids[1])]: 80, [key(ids[2], ids[3])]: 80 };
    S.pendingDecisions.push({ id: 'dec_test', kind: 'event', refId: 'event_romance', createdAt: S.meta.gameMin,
      actorIds: { primary: ids[0], secondary: ids[1] }, actorsDead: { primary: false, secondary: false } });
    S.crew.find(m => m.id === ids[1]).statut = 'mort';
    const names = Object.fromEntries(S.crew.map(m => [m.id, m.name]));
    return { c: names[ids[2]], d: names[ids[3]], a: names[ids[0]] };
  }, ids);
  await waitShown(page, /Romance/);
  const evText = (await shown(page))?.text || '';
  check(evText.includes(ev.c) && evText.includes(ev.d) && !evText.includes(ev.a), 'acteurs remplacés par un couple encore valide');
  await clickChoice(page);
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  await page.click('#consContinue');
  await page.evaluate(async (ids) => {
    const { S } = await import('./src/state.js');
    S.relations = {};
    S.pendingDecisions.push({ id: 'dec_test2', kind: 'event', refId: 'event_romance', createdAt: S.meta.gameMin,
      actorIds: { primary: ids[0], secondary: ids[1] }, actorsDead: { primary: false, secondary: false } });
  }, ids);
  await page.waitForTimeout(700);
  const dropped = await page.evaluate(async () => (await import('./src/state.js')).S.pendingDecisions.length);
  check(dropped === 0 && !(await shown(page)), 'événement devenu caduc retiré sans fenêtre');

  // ------------------------------------------------------------------
  console.log('5. Coûts vérifiés et montants réels (M2)');
  await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    S.res.metal = 300; S.res.cristal = 0; S.res.datacubes = 0;
    S.pendingDecisions.push({ id: 'dec_m', kind: 'event', refId: 'event_marchand', createdAt: S.meta.gameMin,
      actorIds: { primary: null, secondary: null }, actorsDead: {} });
  });
  await waitShown(page, /Marchand/);
  const m = await page.evaluate(() => [...document.querySelectorAll('#modal [data-event-choice]')].map(btn => ({ t: btn.textContent.replace(/\s+/g, ' ').trim(), off: btn.disabled })));
  check(/240 métal contre 90 datacubes/.test(m[0].t) && !m[0].off, `montants réels affichés (${m[0].t.slice(0, 60)}…)`);
  check(m[1].off && /stock insuffisant/i.test(m[1].t), 'échange impayable indisponible, raison affichée');
  await clickChoice(page, '#modal [data-event-choice="0"]');
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  const cons = await page.evaluate(async () => ({ txt: document.querySelector('#modal').textContent, metal: (await import('./src/state.js')).S.res.metal }));
  // Le filet du Commandement (V1) ajoute un peu de métal à chaque tick : marge < 1.
  check(Math.abs(cons.metal - 60) < 1 && /−240 Métal/.test(cons.txt) && /\+90 Datacubes/.test(cons.txt), 'conséquences = montants réellement appliqués' + (Math.abs(cons.metal - 60) < 1 ? '' : ' (métal : ' + cons.metal + ')'));
  await page.click('#consContinue');

  // ------------------------------------------------------------------
  console.log('6. Dégâts sur un module (M6)');
  const dmg = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    S.modules.mine_surface = { level: 3 };
    const workers = S.crew.filter(x => x.statut !== 'mort').slice(0, 3);
    for (const w of workers) app.unassignMember(w.id);
    workers.forEach((w, i) => app.assignMember(w.id, 'mine_surface', i));
    const third = workers[2];
    S.build = { id: 'mine_surface', targetLevel: 4, totalMin: 100, doneMin: 10 };
    app.appliquerEffetsColonie([{ module: { id: 'mine_surface', niveau: -1 } }], { victime: third });
    const a = app.memberAssignment(third.id);
    const res = {
      level: S.modules.mine_surface.level, slot2: S.assignments['mine_surface:2'] || null,
      thirdPost: a ? `${a.modKey}:${a.slotIdx}` : null, thirdStatut: third.statut, hist: (third.posteHistorique || []).length,
      target: S.build.targetLevel, done: S.build.doneMin
    };
    S.build.doneMin = S.build.totalMin;
    st.tickOnce({ silent: true });
    res.afterBuild = S.modules.mine_surface.level;
    return res;
  });
  check(dmg.level === 2 && !dmg.slot2, 'niveau perdu et poste disparu libéré');
  check(dmg.thirdPost !== 'mine_surface:2' && (dmg.thirdStatut !== 'travail' || dmg.thirdPost) && dmg.hist >= 1,
    `occupant libéré (statut ${dmg.thirdStatut}, poste ${dmg.thirdPost || 'aucun'}), ancienneté archivée`);
  // V1 : le niveau payé reste acquis ; les dégâts coûtent du temps (chantier repris à zéro)
  check(dmg.target === 4 && dmg.done === 0 && dmg.afterBuild === 4, `chantier repris à zéro, niveau payé acquis (cible ${dmg.target}, après ${dmg.afterBuild})`);

  // ------------------------------------------------------------------
  console.log('7. Incidents en chaîne (E1)');
  const chain = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const S = st.S;
    S.pendingDecisions.length = 0;
    S.pendingChainIncidents = [{ incidentId: 'mine_eboulement', triggerAt: S.meta.gameMin }];
    const j0 = S.journal.length;
    st.tickOnce({ silent: true });
    // V1 : hors ligne, un incident sérieux attend le retour du joueur…
    const silent = { pending: S.pendingDecisions.map(d => d.refId), chain: S.pendingChainIncidents.length,
      logged: S.journal.slice(j0).some(e => /Éboulement dans la mine.*décision automatique/.test(e.txt)) };
    S.pendingDecisions.length = 0;
    // … un incident mineur (gravité 1) est tranché automatiquement
    S.pendingChainIncidents = [{ incidentId: 'mine_filon_riche', triggerAt: S.meta.gameMin }];
    const j1 = S.journal.length;
    st.tickOnce({ silent: true });
    const minor = { pending: S.pendingDecisions.length, logged: S.journal.slice(j1).some(e => /Filon inattendu.*décision automatique/.test(e.txt)) };
    S.pendingChainIncidents = [{ incidentId: 'mine_eboulement', triggerAt: S.meta.gameMin }];
    st.tickOnce({ silent: false });
    const live = { pending: S.pendingDecisions.map(d => d.refId) };
    S.pendingDecisions.length = 0;
    return { silent, minor, live };
  });
  check(chain.silent.pending.includes('mine_eboulement') && chain.silent.chain === 0 && !chain.silent.logged, 'en silencieux : incident en chaîne sérieux gardé pour le retour du joueur');
  check(chain.minor.pending === 0 && chain.minor.logged, 'en silencieux : incident en chaîne mineur résolu automatiquement');
  check(chain.live.pending.includes('mine_eboulement'), 'en direct : incident en chaîne mis en file');
  await page.evaluate(() => document.querySelector('#modalBg').classList.remove('show'));

  // ------------------------------------------------------------------
  console.log('8. Données : un choix de repli toujours disponible');
  const noFallback = await page.evaluate(async () => {
    const app = await import('./src/app.js');
    const bad = [];
    for (const [id, def] of [...Object.entries(app.INCIDENTS), ...Object.entries(app.COLONY_EVENTS)]) {
      if (!def.titre) bad.push(id + ' (sans titre)');
      if (!def.choix.some(c => c.si === undefined && c.requiert === undefined && c.consomme === undefined && c.cout === undefined)) bad.push(id);
    }
    return bad;
  });
  check(noFallback.length === 0, `chaque incident / événement a un titre et un choix sans prérequis ni coût${noFallback.length ? ' — ' + noFallback.join(', ') : ''}`);

  // ------------------------------------------------------------------
  console.log('9. Robustesse de la boucle (M11)');
  const rob = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const S = st.S;
    st.setSimPaused(true);
    const g = S.meta.gameMin;
    S.activeBuffs = [{ type: 'prodMult', value: 0.5, expiresAt: g, label: 'expiré' }];
    S.training = [null];   // fait planter le sous-système « formations »
    for (let i = 0; i < 5; i++) st.tickOnce({ silent: true });
    const r = { advanced: S.meta.gameMin - g, buffs: S.activeBuffs.length, toast: document.querySelector('#toast').textContent };
    S.training = [];
    // Erreur de rendu : le temps n'est pas doublé et la sauvegarde a lieu
    const gt = document.querySelector('#gameTime');
    gt.remove();
    st.setSimPaused(false);
    const g2 = S.meta.gameMin;
    const saved0 = S.meta.lastSave;
    S.meta.lastTickRealMs = Date.now() - 12000;
    const n = st.tick();
    r.renderTicks = n;
    r.renderAdvanced = S.meta.gameMin - g2;
    r.saved = S.meta.lastSave > saved0;
    document.querySelector('#realTime').before(gt);
    return r;
  });
  check(rob.advanced === 5, `horloge avancée une fois par tick malgré l'erreur (+${rob.advanced})`);
  check(rob.buffs === 0, 'les sous-systèmes suivants tournent quand même');
  check(/erreur est survenue/.test(rob.toast), 'toast unique après erreurs répétées');
  check(rob.renderTicks === 12 && rob.renderAdvanced === 12 && rob.saved, `rendu en échec : +${rob.renderAdvanced} min pour 12 s (pas de double), sauvegarde faite`);
  // render() isole chaque vue (ui.js, guard) : l'en-tête privé de #gameTime ne lève plus
  // d'exception mais journalise une fois « [render] renderHeader … » — attendu ici.
  b.noErrors(page, 'aucune autre erreur de page', /\[TICK\]|\[render\]/);
  await ctx.close();
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
