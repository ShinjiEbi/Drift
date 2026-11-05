#!/usr/bin/env node
/* global document, window */  // utilisés dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/prologue.mjs — prologue « L'atterrissage » d'une partie neuve.
//   - 3 colons nommés (pilote, ingénieur, médecin) et une vedette ;
//   - scène 1 à l'ouverture : l'équipage nommé par son rôle, objectif « Construire » ;
//   - scène 2 après le premier module, objectif « Postes » ; scène 3 ensuite,
//     objectif « Carte » ; le premier départ achève le prologue (récompense) ;
//   - le prologue peut être passé et ne bloque rien ; « L'Avant-poste » prend le relais ;
//   - sous automatisation, sans demande explicite, aucune scène ne s'ouvre.
// Les scènes de fil rouge sont suspendues sous navigator.webdriver (comme la
// fenêtre d'accueil) : window.__DRIFT_PROLOGUE__ les réactive pour ce test.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/prologue.mjs
import { banc } from './_banc.mjs';

const b = await banc({ timeoutMs: 60000 });
const { check } = b;
const h3 = page => page.evaluate(() => document.querySelector('#modalBg.show #modal h3')?.textContent || '');
const attendre = (page, re) => b.until(page, re => new RegExp(re).test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), re.source, { timeout: 5000 });
const choisir = async (page, i) => {
  await page.evaluate(i => document.querySelector(`#modal [data-event-choice="${i}"]`).click(), i);
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  const txt = await page.evaluate(() => document.querySelector('#modal').textContent.replace(/\s+/g, ' '));
  await page.click('#consContinue');
  return txt;
};
const objectifs = page => page.evaluate(async () => {
  const { getObjectives } = await import('./src/objectives.js');
  const { S } = await import('./src/state.js');
  return getObjectives(S).map(o => ({ id: o.id, source: o.source, titre: o.titre, action: o.action }));
});
const nouvellePartie = async () => {
  const ctx = await b.context();
  await ctx.addInitScript(() => { window.__DRIFT_PROLOGUE__ = true; });
  const page = await b.page(ctx);
  await page.goto(b.base);
  await b.waitGame(page);
  await page.evaluate(async () => { const { S } = await import('./src/state.js'); S.nextIncidentMin = 1e9; S.nextEventMin = 1e9; });
  return { ctx, page };
};

try {
  console.log('1. Partie neuve : équipage, scène d\'ouverture, objectif');
  const { ctx, page } = await nouvellePartie();
  await attendre(page, /L'atterrissage/);
  const depart = await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    const role = r => S.crew.find(m => m.startRole === r)?.name;
    return {
      roles: S.crew.map(m => m.startRole).sort().join(','), vedette: S.fleet.map(v => v.type).join(','),
      pilote: role('pilote'), ingenieur: role('ingenieur'), medecin: role('medecin'),
      texte: document.querySelector('#modal .incident-body').textContent,
      choix: document.querySelectorAll('#modal [data-event-choice]').length,
    };
  });
  check(depart.roles === 'ingenieur,medecin,pilote' && depart.vedette === 'vedette', 'trois colons nommés (pilote, ingénieur, médecin) et une vedette');
  check([depart.pilote, depart.ingenieur, depart.medecin].every(n => n && depart.texte.includes(n)), 'la scène nomme l\'équipage par son rôle (gabarits)');
  check(depart.choix === 4, 'quatre choix, dont « passer le prologue »');
  let obj = await objectifs(page);
  const fil1 = obj.find(o => o.source === 'fil');
  check(fil1?.id === 'fil_pro_chantier' && fil1.action.onglet === 'base' && fil1.action.sousOnglet === 'construction', `objectif du prologue : ${fil1?.titre}`);
  await choisir(page, 0);
  obj = await objectifs(page);
  const fil1b = obj.find(o => o.source === 'fil');
  check(fil1b?.titre === 'Construire : Générateur solaire' && fil1b.action.cible === 'generateur_solaire', 'le choix oriente l\'objectif (bouton vers le générateur)');

  console.log('2. Premier module → scène « Chacun à son poste »');
  await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    S.modules.generateur_solaire = { level: 1 };
  });
  await attendre(page, /Chacun à son poste/);
  obj = await objectifs(page);
  const fil2 = obj.find(o => o.source === 'fil');
  check(fil2?.id === 'fil_pro_postes' && fil2.action.sousOnglet === 'postes', `objectif suivant : ${fil2?.titre} → ${fil2?.action.onglet}/${fil2?.action.sousOnglet}`);
  await choisir(page, 0);
  await page.evaluate(async () => (await import('./src/app.js')).autoAssignAllFreeMembers());

  console.log('3. « Premier départ » → la vedette décolle, le prologue s\'achève');
  await attendre(page, /Premier départ/);
  obj = await objectifs(page);
  const fil3 = obj.find(o => o.source === 'fil');
  check(fil3?.id === 'fil_pro_depart' && fil3.action.onglet === 'expeditions', `objectif : ${fil3?.titre} → ${fil3?.action.onglet}/${fil3?.action.sousOnglet}`);
  check(!obj.some(o => o.source !== 'fil' && o.action.onglet === 'expeditions' && o.action.sousOnglet === fil3?.action.sousOnglet), 'pas de doublon entre le conseil « vedette » et l\'objectif du prologue');
  await choisir(page, 0);
  const fin = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const metal0 = S.res.metal;
    const body = S.galaxy.systems.find(s => s.distance > 0 && s.bodies?.length).bodies[0];
    const pilote = S.crew.find(m => m.startRole === 'pilote');
    app.launchExpedition({ vesselId: S.fleet[0].id, bodyId: body.id, crewIds: [pilote.id], equipment: {} });
    return { lance: S.expeditions.length, metal0 };
  });
  await b.until(page, async () => (await import('./src/state.js')).S.arcs.prologue?.rewardClaimed, null, { timeout: 5000 });
  const apres = await page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    return { etapes: S.arcs.prologue.completedSteps.join(','), journal: S.journal.slice(-8).map(e => e.txt).join(' | ') };
  });
  check(fin.lance === 1 && apres.etapes === 'pro_chantier,pro_postes,pro_depart' && /Chronique achevée : L(&#39;|')atterrissage/.test(apres.journal), 'premier départ : les trois étapes franchies, récompense donnée');
  obj = await objectifs(page);
  check(obj.some(o => o.id === 'fil_ap_1'), '« L\'Avant-poste » prend le relais dans les objectifs');
  b.noErrors(page, 'aucune erreur de page (prologue joué)');
  await ctx.close();

  console.log('4. Passer le prologue');
  const p2 = await nouvellePartie();
  await attendre(p2.page, /L'atterrissage/);
  await choisir(p2.page, 3);
  await b.until(p2.page, async () => (await import('./src/state.js')).S.arcs.prologue?.rewardClaimed, null, { timeout: 5000 });
  await p2.page.waitForTimeout(1500);
  const passe = await p2.page.evaluate(async () => {
    const { S } = await import('./src/state.js');
    return { pending: S.pendingDecisions.length, h3: document.querySelector('#modalBg.show #modal h3')?.textContent || '' };
  });
  check(passe.pending === 0 && !passe.h3, 'passé : plus aucune scène du prologue, rien ne reste en attente');
  b.noErrors(p2.page, 'aucune erreur de page (prologue passé)');
  await p2.ctx.close();

  console.log('5. Sous automatisation, sans demande explicite');
  const ctx3 = await b.context();
  const p3 = await b.page(ctx3);
  await p3.goto(b.base);
  await b.waitGame(p3);
  await p3.waitForTimeout(2000);
  const auto = await p3.evaluate(async () => {
    const { S } = await import('./src/state.js');
    return { pending: S.pendingDecisions.length, unlocked: S.arcs.prologue?.unlocked };
  });
  check(auto.pending === 0 && auto.unlocked && !(await h3(p3)), 'prologue ouvert mais sans fenêtre (les autres tests partent d\'une partie neuve)');
  await ctx3.close();
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
