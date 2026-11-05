#!/usr/bin/env node
/* global document, window, innerWidth, getComputedStyle, localStorage */  // utilisés dans les callbacks exécutés par le navigateur
// tools/regress/expeditions-ui.mjs — écran de scène, combat, bilan et lancement (V1, Playwright).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/expeditions-ui.mjs
//
// Vérifie :
//  - partie neuve : Expéditions › Missions propose d'envoyer la vedette de départ
//    (pas de hangar) et l'expédition part en 2 touchers ; la carte aussi ;
//  - écran de scène : vrai titre, progression, chance « 60 % — Vigueur de Vikram Osei »,
//    raison lisible d'un choix indisponible, coût affiché ;
//  - le résultat d'un choix (jet, gains en vert, pertes en rouge, région aria-live)
//    s'affiche AVANT la scène suivante, et il est conservé après un rechargement ;
//  - combat : « Résolution automatique » puis résumé ; préférence « combat
//    automatique » : résumé dès l'ouverture ; « 1 dégât » accordé dans le journal ;
//  - bilan au retour : message avec « Bilan », retour à lire dans les missions,
//    fenêtre du bilan (lieu, gains, faits), puis marqué lu ;
//  - aucun débordement horizontal à 320 et 390 px ; boutons d'au moins 44 px.
// Les tirages sont neutralisés : caractéristiques et compétences fixées, choix
// sans jet pour les gains et pertes vérifiés, verdict du jet comparé à l'état.
import { loadPlaywright, startServer, reporter, openGame } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Expéditions : scène, résultat, combat, bilan, lancement');
const srv = await startServer();
const browser = await chromium.launch();

// Colonie de test : trois colons aux caractéristiques fixées, une navette, des ressources.
// Renvoie l'id d'une expédition arrivée sur place, sur les scènes données.
async function prepare(page, scenes, { ingenierie = 0 } = {}) {
  return page.evaluate(async ({ scenes, ingenierie }) => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    st.setSimPaused(true);
    S.nextIncidentMin = 1e12; S.nextEventMin = 1e12;
    document.querySelector('#modalBg').classList.remove('show');
    if (!window.__team) {
      S.modules.habitat = { level: 3 };   // place pour trois colons de plus
      const noms = ['Vikram Osei', 'Ana Lindqvist', 'Lou Marchetti'];
      window.__team = noms.map(nom => {
        const c = st.genCandidate();
        c.name = nom; c.traits = [];
        S.candidates.push(c); st.acceptCandidate(c.id);
        return S.crew.find(m => m.name === nom).id;
      });
      S.fleet.push({ id: 'v_ui', type: 'navette', name: 'Mousson-42', available: true });
    }
    for (const id of window.__team) {
      const m = S.crew.find(x => x.id === id);
      Object.assign(m, { statut: 'libre', statuts: [], sante: 100 });
      for (const k of Object.keys(m.skills)) m.skills[k] = 1;
      for (const k of Object.keys(m.stats)) m.stats[k] = 5;
      m.skills.ingenierie = ingenierie;
      m.skills.combat = 3;
    }
    S.crew.find(m => m.id === window.__team[0]).stats.vigueur = 8;   // +1 au jet : 60 % contre 6
    for (const k of Object.keys(S.res)) S.res[k] = Math.max(S.res[k], st.capOf(k) * 0.8);
    const sys = S.galaxy.systems.filter(s => s.distance > 0.8).sort((a, b) => a.distance - b.distance)[0];
    sys.scanned = true;
    const body = sys.bodies[0];
    Object.assign(body, { type: 'planete', biome: 'toundra', atmosphere: 'tenue', vie: 'aucune', signal: 'aucun', danger: 'aucun', ruines: 'humaines', chronicleChecked: true });
    delete body.chronicle;
    delete body.lootedAt;
    S.fleet.find(v => v.id === 'v_ui').available = true;
    app.launchExpedition({ vesselId: 'v_ui', bodyId: body.id, crewIds: window.__team, equipment: {} });
    const e = S.expeditions[S.expeditions.length - 1];
    e.scenes = scenes;
    e.elapsedMin = e.oneWayMin;
    st.tickOnce({ silent: true });
    e.lootMult = 1;
    return e.id;
  }, { scenes, ingenierie });
}
const norm = s => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

try {
  // ---- 1. Partie neuve : départ de la vedette en 2 touchers, sans hangar ----
  {
    const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
    await page.evaluate(async () => {
      const st = await import('./src/state.js');
      st.setSimPaused(true);
      const ui = await import('./src/ui.js');
      ui.gotoView('expeditions', 'missions');
    });
    const avant = await page.evaluate(async () => {
      const st = await import('./src/state.js');
      return {
        hangar: !!st.S.modules.hangar,
        dest: document.querySelectorAll('#expActiveList [data-launch-body]').length,
        hangarOnly: /Aucun hangar/.test(document.querySelector('#expActiveList').textContent),
        sub: document.querySelector('#expSub').textContent,
      };
    });
    t.check(!avant.hangar && avant.dest > 0 && !avant.hangarOnly, `partie neuve : Missions propose ${avant.dest} destination(s) sans hangar`, JSON.stringify(avant));
    // Toucher 1 : « Envoyer » ; toucher 2 : « Décoller »
    await page.click('#expActiveList [data-launch-body]');
    const modale = await page.evaluate(() => ({
      titre: document.querySelector('#modal h3')?.textContent,
      equipe: document.querySelector('#modal .lx-names')?.textContent,
      duree: document.querySelector('#modal .lx-fact dd b')?.textContent,
      ferme: !document.querySelector('#modal .lx-details')?.open,
      go: !document.querySelector('#launchGo')?.disabled,
    }));
    t.check(/^Expédition vers /.test(modale.titre || '') && modale.go && modale.ferme && /\d/.test(modale.duree || ''),
      'la fenêtre de lancement propose équipe, vaisseau et durée aller-retour, réglages repliés', JSON.stringify(modale));
    await page.click('#launchGo');
    const apres = await page.evaluate(async () => {
      const st = await import('./src/state.js');
      const e = st.S.expeditions[0];
      return { n: st.S.expeditions.length, crew: e?.crewIds.length, vessel: st.S.fleet.find(v => v.id === e?.vesselId)?.type, closed: !document.querySelector('#modalBg').classList.contains('show'), left: st.S.crew.filter(m => m.statut !== 'expedition').length };
    });
    t.check(apres.n === 1 && apres.crew >= 1 && apres.vessel === 'vedette' && apres.closed && apres.left >= 1,
      `expédition lancée en 2 touchers (vedette, ${apres.crew} colon(s), ${apres.left} reste(nt) à l'avant-poste)`, JSON.stringify(apres));
    // Carte : la fiche d'un corps propose le départ sans hangar
    const carte = await page.evaluate(async () => {
      const st = await import('./src/state.js');
      const ui = await import('./src/ui.js');
      const exp = await import('./src/views/expeditions.js');
      const S = st.S;
      S.fleet[0].available = true;                       // vedette de nouveau à quai
      for (const m of S.crew) if (m.statut === 'expedition') m.statut = 'libre';
      S.expeditions.length = 0;
      const sys = S.galaxy.systems.find(s => s.scanned);
      exp.openBody(sys.bodies[0].id);
      ui.gotoView('expeditions', 'carte');
      const btn = document.querySelector('#galaxyContent [data-galaxy-action="launch"]');
      return { btn: btn?.textContent.trim() || null, hangarMsg: /Hangar/.test(document.querySelector('#galaxyContent').textContent.replace(/Lancer.*/, '')) };
    });
    t.check(!!carte.btn, `carte : « ${carte.btn} » sur la fiche d'un corps, sans hangar`, JSON.stringify(carte));
    t.check(page.errors.length === 0, 'aucune erreur JavaScript (partie neuve)', page.errors.slice(0, 3).join(' | '));
    await page.context().close();
  }

  // ---- 2. Écran de scène, résultat avant la suite, rechargement ----
  const page = await openGame(browser, srv.base, { width: 390, height: 844, mobile: true });
  const expId = await prepare(page, ['ruine_h_porte', 'combat_drone_gardien', 'outro_retour'], { ingenierie: 0 });
  await page.evaluate(async id => (await import('./src/ui.js')).openSceneOverlay(id), expId);
  const scene = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const choix = [...document.querySelectorAll('#sceneInner .scene-choice')].map(b => ({ label: b.querySelector('.sc-label')?.textContent, meta: b.querySelector('.sc-meta')?.textContent || '', disabled: b.disabled }));
    return { titre: q('#sceneInner .sh-title')?.textContent, sub: q('#sceneInner .sh-sub')?.textContent, choix, focus: document.activeElement?.id };
  });
  t.check(scene.titre === 'La porte soudée' && /^Scène 1 sur 3/.test(norm(scene.sub)), `titre « ${scene.titre} », ${norm(scene.sub)}`);
  const forcer = scene.choix.find(c => /Forcer/.test(c.label));
  t.check(forcer && norm(forcer.meta) === '60 % — Vigueur de Vikram Osei' && !forcer.disabled, `chance affichée : « ${norm(forcer?.meta)} »`);
  const chalumeau = scene.choix.find(c => /chalumeau/.test(c.label));
  t.check(chalumeau?.disabled && /Ingénierie 2 requise/.test(norm(chalumeau.meta)) && /Coût : 8 énergie/.test(norm(chalumeau.meta)),
    `choix indisponible avec sa raison et son coût : « ${norm(chalumeau?.meta)} »`);
  t.check(scene.focus === 'sceneTitle', 'le focus va au titre de la scène');

  // Choix sans jet (exigence remplie) : gains et pertes déterministes
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    for (const id of window.__team) st.S.crew.find(m => m.id === id).skills.ingenierie = 2;
  });
  await page.evaluate(async id => { (await import('./src/ui.js')).openSceneOverlay(id); }, expId);
  await page.evaluate(() => { document.querySelector('#sceneOverlay').scrollTop = 300; });
  await page.evaluate(() => [...document.querySelectorAll('#sceneInner button[data-choice]')].find(b => /chalumeau/.test(b.textContent)).click());
  const res = await page.evaluate(async id => {
    const st = await import('./src/state.js');
    const q = s => document.querySelector(s);
    return {
      choice: q('#sceneInner .sr-choice')?.textContent,
      gains: [...document.querySelectorAll('#sceneInner .sr-effects li.gain')].map(l => l.textContent),
      pertes: [...document.querySelectorAll('#sceneInner .sr-effects li.perte')].map(l => l.textContent),
      continuer: !!q('#sceneInner [data-scene-continue]'),
      choixVisibles: document.querySelectorAll('#sceneInner [data-choice]').length,
      titre: q('#sceneInner .sh-title')?.textContent,
      live: q('#sceneLive')?.textContent || '',
      liveAttr: q('#sceneLive')?.getAttribute('aria-live'),
      scroll: q('#sceneOverlay').scrollTop,
      saved: JSON.parse(localStorage.getItem('drift_save_v1')).expeditions.find(e => e.id === id)?.dernierResultat?.vu,
      sceneIdx: st.S.expeditions.find(e => e.id === id).sceneIdx,
    };
  }, expId);
  t.check(res.continuer && res.choixVisibles === 0 && res.titre === 'La porte soudée' && /chalumeau/.test(res.choice) && res.sceneIdx === 1,
    'après un choix : le résultat s\'affiche avant la scène suivante (déjà prête en coulisse)', JSON.stringify(res));
  t.check(res.gains.includes('+40 Métal') && res.pertes.includes('−8 Énergie'), `gains en vert (${res.gains.join(', ')}), pertes en rouge (${res.pertes.join(', ')})`);
  t.check(res.liveAttr === 'polite' && /40 Métal/.test(res.live), `région aria-live : « ${norm(res.live).slice(0, 80)} »`);
  t.check(res.scroll === 0, 'nouvel écran : défilement remis en haut');
  t.check(res.saved === false, 'le résultat non lu est déjà dans la sauvegarde');

  // Rechargement : le résultat attend toujours le joueur
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'), null, { timeout: 10000 });
  const reprise = await page.evaluate(async id => {
    const st = await import('./src/state.js');
    st.setSimPaused(true);
    const ui = await import('./src/ui.js');
    ui.gotoView('expeditions', 'missions');
    const btn = document.querySelector(`#expActiveList [data-resume-exp="${id}"]`);
    const label = btn?.textContent.trim();
    btn?.click();
    return { label, choice: document.querySelector('#sceneInner .sr-choice')?.textContent, gains: [...document.querySelectorAll('#sceneInner .sr-effects li.gain')].map(l => l.textContent) };
  }, expId);
  t.check(reprise.label === 'Lire le résultat' && /chalumeau/.test(reprise.choice || '') && reprise.gains.includes('+40 Métal'),
    'après rechargement : « Lire le résultat » rouvre le même résultat', JSON.stringify(reprise));
  // « Continuer » → scène suivante
  await page.click('#sceneInner [data-scene-continue]');
  const suivante = await page.evaluate(async id => {
    const st = await import('./src/state.js');
    return { titre: document.querySelector('#sceneInner .sh-title')?.textContent, vu: st.S.expeditions.find(e => e.id === id).dernierResultat.vu, choix: document.querySelectorAll('#sceneInner [data-choice]').length };
  }, expId);
  t.check(suivante.titre === 'Le drone gardien' && suivante.vu === true && suivante.choix > 0, `« Continuer » mène à la scène suivante (« ${suivante.titre} »)`);

  // ---- 3. Combat : bouton « Résolution automatique », puis résumé ----
  await page.evaluate(() => [...document.querySelectorAll('#sceneInner button[data-choice]')].find(b => /Neutraliser/.test(b.textContent)).click());
  const avantCombat = await page.evaluate(() => document.querySelector('#sceneInner .sn-hint')?.textContent);
  await page.click('#sceneInner [data-scene-continue]');
  const combat = await page.evaluate(() => ({ arena: !!document.querySelector('#sceneInner .cbt-arena'), auto: document.querySelector('#sceneInner [data-cbt-auto]')?.textContent }));
  t.check(/combat/i.test(avantCombat || '') && combat.arena && combat.auto === 'Résolution automatique', 'le résultat annonce le combat ; écran de combat avec « Résolution automatique »', JSON.stringify({ avantCombat, ...combat }));
  await page.click('#sceneInner [data-cbt-auto]');
  const resume = await page.evaluate(async id => {
    const st = await import('./src/state.js');
    const e = st.S.expeditions.find(x => x.id === id);
    return {
      issue: document.querySelector('#sceneInner .cs-issue')?.textContent,
      outcome: e?.combat?.outcome, active: e?.combat?.active,
      equipe: document.querySelectorAll('#sceneInner .cs-ally').length,
      continuer: !!document.querySelector('#sceneInner [data-scene-continue]'),
      log: (e?.combat?.log || []).join('\n'),
    };
  }, expId);
  const ISSUE = { victory: 'Victoire', defeat: 'Défaite', retreat: 'Retraite' };
  t.check(resume.active === false && resume.issue === ISSUE[resume.outcome] && resume.equipe === 3 && resume.continuer,
    `combat résolu en un geste, résumé « ${resume.issue} » avec l'état de l'équipe`, JSON.stringify({ ...resume, log: undefined }));
  t.check(!/\b1 dégâts\b/.test(resume.log) && !/\b([2-9]|\d{2,}) dégât\b/.test(resume.log) && /dégâts?/.test(resume.log), 'journal de combat : « 1 dégât », « 3 dégâts »');
  await page.click('#sceneInner [data-scene-continue]');

  // ---- 4. Préférence « combat automatique » : résumé dès l'ouverture ----
  const exp2 = await prepare(page, ['combat_drone_gardien', 'outro_retour'], { ingenierie: 0 });
  await page.evaluate(async id => {
    const ui = await import('./src/ui.js');
    if (document.querySelector('#sceneOverlay').classList.contains('show')) document.querySelector('#sceneInner [data-action-scene="close"]')?.click();
    ui.setPref('autoCombat', true);
    ui.openSceneOverlay(id);
    [...document.querySelectorAll('#sceneInner button[data-choice]')].find(b => /Neutraliser/.test(b.textContent)).click();
    document.querySelector('#sceneInner [data-scene-continue]').click();
  }, exp2);
  const pref = await page.evaluate(() => ({ arena: !!document.querySelector('#sceneInner .cbt-arena'), resume: !!document.querySelector('#sceneInner .cbt-summary') }));
  t.check(!pref.arena && pref.resume, 'préférence « combat automatique » : le combat se résout à l\'ouverture, résumé affiché', JSON.stringify(pref));
  await page.evaluate(async () => { (await import('./src/ui.js')).setPref('autoCombat', false); });

  // ---- 5. Débordements et cibles tactiles (390 px, puis 320 px) ----
  const mesure = () => page.evaluate(() => {
    const out = { over: [], small: [] };
    const host = document.querySelector('#modalBg.show #modal') || (document.querySelector('#sceneOverlay.show') ? document.querySelector('#sceneInner') : null);
    if (document.documentElement.scrollWidth > innerWidth + 0.5) out.over.push('page');
    if (host && host.scrollWidth > host.clientWidth + 0.5) out.over.push(host.id);
    const root = host || document;
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed') { out.over.push(el.className || el.tagName); break; }
    }
    const SEL = '.scene-choice, .scene-continue, .scene-actions button, .cbt-auto, .lx-details > summary, #launchGo, #launchClose, .dest-go, .rc-go, .h-bilan, #bilanClose, .scene-mini-journal summary, .cs-log summary';
    for (const el of document.querySelectorAll(SEL)) {
      if (!el.getClientRects().length || el.closest('[hidden]')) continue;
      const h = el.getBoundingClientRect().height;
      if (h < 43.5) out.small.push(`${el.className || el.id}: ${Math.round(h)}px`);
    }
    return out;
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    const ecrans = {};
    const exp3 = await prepare(page, ['ruine_h_porte', 'combat_drone_gardien', 'outro_retour'], { ingenierie: 2 });
    await page.evaluate(async id => {
      if (document.querySelector('#sceneOverlay').classList.contains('show')) document.querySelector('#sceneInner [data-action-scene="close"]')?.click();
      (await import('./src/ui.js')).openSceneOverlay(id);
    }, exp3);
    ecrans.scene = await mesure();
    await page.evaluate(() => [...document.querySelectorAll('#sceneInner button[data-choice]')].find(b => /chalumeau/.test(b.textContent)).click());
    ecrans.resultat = await mesure();
    await page.click('#sceneInner [data-scene-continue]');
    await page.evaluate(() => [...document.querySelectorAll('#sceneInner button[data-choice]')].find(b => /Neutraliser/.test(b.textContent)).click());
    await page.click('#sceneInner [data-scene-continue]');
    ecrans.combat = await mesure();
    await page.click('#sceneInner [data-cbt-auto]');
    ecrans.resumeCombat = await mesure();
    // Lancement (réglages ouverts) et bilan
    ecrans.lancement = await page.evaluate(async id => {
      document.querySelector('#sceneInner [data-action-scene="close"]')?.click();
      const st = await import('./src/state.js');
      const ui = await import('./src/ui.js');
      const e = st.S.expeditions.find(x => x.id === id);
      ui.showLaunchModal({ bodyId: e.bodyId });
      return true;
    }, exp3);
    ecrans.lancement = await mesure();
    await page.click('#modal .lx-details > summary');
    ecrans.lancementDetails = await mesure();
    await page.click('#launchClose');
    ecrans.missions = await page.evaluate(async () => {
      const ui = await import('./src/ui.js');
      ui.gotoView('expeditions', 'missions');
      return true;
    });
    ecrans.missions = await mesure();
    await page.evaluate(async id => (await import('./src/ui.js')).showExpeditionReport(id), exp3);
    ecrans.bilan = await mesure();
    await page.evaluate(() => document.querySelector('#bilanClose')?.click());
    const pb = Object.entries(ecrans).filter(([, r]) => r.over.length || r.small.length).map(([k, r]) => `${k}: ${JSON.stringify(r)}`);
    t.check(pb.length === 0, `${width} px : scène, résultat, combat, résumé, lancement, missions et bilan sans débordement, boutons ≥ 44 px`, pb.join(' ; '));
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ---- 6. Retour : message « Bilan », retour à lire, fenêtre du bilan ----
  const retour = await page.evaluate(async id => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const ui = await import('./src/ui.js');
    const S = st.S;
    for (const t of document.querySelectorAll('#toast .toast-item')) t.remove();
    ui.gotoView('expeditions', 'missions');
    const e = S.expeditions.find(x => x.id === id);
    if (e.phase === 'sur_place') app.abandonExpedition(id);
    ui.render();
    e.elapsedMin = e.oneWayMin;
    st.tickOnce({ silent: true });
    ui.render();
    const toast = [...document.querySelectorAll('#toast .toast-item')].find(x => /Retour d'expédition/.test(x.textContent));
    const card = document.querySelector(`#expActiveList [data-bilan="${id}"]`);
    const histBtn = document.querySelector(`#expHistoryList [data-bilan="${id}"]`);
    const out = { toast: toast?.textContent, act: toast?.querySelector('.toast-act')?.textContent, card: !!card, hist: !!histBtn, vuAvant: S.expHistory[0].bilanVu };
    toast?.querySelector('.toast-act')?.click();
    const m = document.querySelector('#modalBg.show #modal.bilan-modal');
    out.bilan = m && {
      lieu: m.querySelector('h3')?.textContent,
      gains: [...m.querySelectorAll('.sr-effects li.gain')].map(l => l.textContent),
      faits: m.querySelectorAll('.bl-faits li').length,
      equipe: m.querySelector('.bl-team')?.textContent,
    };
    out.lieu = app.expeditionSummary(id)?.lieu;
    out.metal = `+${app.expeditionSummary(id)?.gains?.metal} Métal`;
    out.vuApres = S.expHistory[0].bilanVu;
    document.querySelector('#bilanClose')?.click();
    ui.render();
    out.cardApres = !!document.querySelector(`#expActiveList .return-card [data-bilan="${id}"]`);
    return out;
  }, expId);
  t.check(/Retour d'expédition/.test(retour.toast || '') && retour.act === 'Bilan' && retour.card && retour.hist && retour.vuAvant === false,
    'au retour : message avec « Bilan », retour à lire dans les missions et l\'historique', JSON.stringify({ ...retour, bilan: undefined }));
  t.check(retour.bilan && retour.bilan.lieu === retour.lieu && retour.bilan.gains.includes(retour.metal) && retour.bilan.faits > 0 && /Vikram Osei/.test(retour.bilan.equipe || ''),
    `fenêtre du bilan : ${retour.bilan?.lieu}, ${retour.bilan?.gains.join(', ')}, ${retour.bilan?.faits} fait(s)`, JSON.stringify(retour.bilan));
  t.check(retour.vuApres === true && !retour.cardApres, 'bilan lu : il quitte la liste des retours à lire');

  const errs = [...new Set(page.errors)];
  t.check(errs.length === 0, 'aucune erreur JavaScript', errs.slice(0, 3).join(' | '));
  await page.context().close();
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
