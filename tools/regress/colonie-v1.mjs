#!/usr/bin/env node
/* global document */  // utilisés dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/colonie-v1.mjs — non-régression : contenu de la colonie migré (V1).
//   1. incidents et événements jouables : chaque choix de chaque incident et
//      événement s'applique ; effets vérifiés (pertes, module hors service ou
//      endommagé, blessure, incident en chaîne, Annales, gabarits d'acteurs) ;
//   2. accueillir un colon reste une décision : la résolution automatique ne
//      recrute jamais ; « colonie.vivres_ok » ; salaire affiché ;
//   3. ancienne sauvegarde (0.33) avec des décisions en attente : ids et acteurs
//      convertis, minuteries reprises dans S.evenements ;
//   4. archives débloquées (badge, lecture) et annales (décès raconté) ;
//   5. validateur : erreurs injectées dans le contenu de la colonie.
// Usage : NODE_PATH=$(npm root -g) node tools/regress/colonie-v1.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { banc, ROOT, seedSaveScript } from './_banc.mjs';

const b = await banc({ timeoutMs: 90000 });
const { check } = b;

// Colonie de test : modules des incidents au niveau 5, colons compétents, stocks
// larges (le Commandement ajoute un filet à chaque tick : on garde une marge).
const preparer = page => page.evaluate(async () => {
  const st = await import('./src/state.js');
  const S = st.S;
  st.setSimPaused(true);
  for (const id of ['habitat', 'mine_surface', 'hydroponie', 'generateur_solaire', 'laboratoire', 'atelier', 'infirmerie', 'hangar']) S.modules[id] = { level: 5 };
  for (let i = 0; i < 6; i++) {
    const c = st.genCandidate();
    for (const k of Object.keys(c.skills)) c.skills[k] = 3;
    for (const k of Object.keys(c.stats)) c.stats[k] = 6;
    c.traits = [];
    S.candidates.push(c);
    st.acceptCandidate(c.id);
  }
  for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k) * 0.8;
  S.inventory.kit_reparation = 5; S.inventory.ration_concentree = 5; S.inventory.disque_memoire = 0;
  S.nextIncidentMin = 1e9; S.nextEventMin = 1e9;
  S.pendingDecisions.length = 0;
  return S.crew.map(m => m.id);
});

try {
  const ctx = await b.context();
  const page = await b.page(ctx);
  await page.goto(b.base);
  await b.waitGame(page);
  await preparer(page);

  // ------------------------------------------------------------------
  console.log('1. Incidents et événements jouables');
  const jouables = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const out = { incidents: 0, choixIncidents: 0, evenements: 0, choixEvenements: 0, echecs: [] };
    for (const id of Object.keys(app.INCIDENTS)) {
      out.incidents++;
      app.INCIDENTS[id].choix.forEach((c, i) => {
        S.pendingDecisions.length = 0;
        for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k) * 0.8;
        app.triggerIncident(id, false);
        const dec = S.pendingDecisions[0];
        const vue = dec && app.vueDecision(dec.id);
        if (!vue) { out.echecs.push(`${id} : pas de vue`); return; }
        const v = vue.choix.find(x => x.index === i);
        if (!v || !v.disponible) return;
        const r = app.choisirDecision(dec.id, i);
        if (!r.ok || !r.resultat.effets.length) out.echecs.push(`${id}[${i}] : ${r.why || 'aucun effet'}`);
        else out.choixIncidents++;
      });
    }
    // Événements : on force leurs conditions (acteurs à trouver) et on les déclenche
    const morts = S.crew.find(m => m.statut !== 'mort');
    for (const ev of Object.values(app.COLONY_EVENTS)) {
      out.evenements++;
      ev.choix.forEach((c, i) => {
        S.pendingDecisions.length = 0;
        for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k) * 0.8;
        const dec = { id: 'dec_ev_' + ev.id + i, kind: 'event', refId: ev.id, acteurs: {}, createdAt: S.meta.gameMin, v: 1 };
        // Acteurs : n'importe quels colons présents (ou un défunt pour l'hommage)
        const vivants = S.crew.filter(m => m.statut !== 'mort' && m.statut !== 'expedition');
        Object.entries(ev.acteurs || {}).forEach(([nom, spec], k) => { dec.acteurs[nom] = spec.parmi === 'morts' ? morts.id : vivants[k].id; });
        if (Object.values(ev.acteurs || {}).some(s => s.parmi === 'morts')) { morts.statut = 'mort'; morts.diedAt = S.meta.gameMin; }
        S.pendingDecisions.push(dec);
        const vue = app.vueDecision(dec.id);
        if (!vue) { out.echecs.push(`${ev.id} : pas de vue`); morts.statut = 'libre'; return; }
        const v = vue.choix.find(x => x.index === i);
        if (v && v.disponible) {
          const r = app.choisirDecision(dec.id, i);
          if (!r.ok) out.echecs.push(`${ev.id}[${i}] : ${r.why}`);
          else out.choixEvenements++;
        }
        morts.statut = 'libre'; delete morts.diedAt;
      });
    }
    S.pendingDecisions.length = 0;
    return out;
  });
  check(jouables.incidents === 17 && jouables.evenements >= 14, `contenu migré : ${jouables.incidents} incidents, ${jouables.evenements} événements`);
  check(jouables.echecs.length === 0 && jouables.choixIncidents >= 40 && jouables.choixEvenements >= 50,
    `chaque choix disponible s'applique (${jouables.choixIncidents} choix d'incident, ${jouables.choixEvenements} d'événement)${jouables.echecs.length ? ' — ' + jouables.echecs.slice(0, 4).join(' | ') : ''}`);

  const effets = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const now = () => S.meta.gameMin;
    const out = {};
    // « Évacuer immédiatement » : pertes réelles et mine hors service 1 h
    S.res.metal = 500; S.res.cristal = 300; S.modules.mine_surface = { level: 5 };
    app.triggerIncident('mine_eboulement', false);
    let dec = S.pendingDecisions[0];
    let r = app.choisirDecision(dec.id, 0);
    out.evacuer = { metal: S.res.metal, cristal: S.res.cristal, hs: S.modules.mine_surface.disabledUntil - now(), effets: r.resultat.effets.map(e => e.text) };
    // « Forcer la reprise » : niveau perdu, blessure grave de la victime, éboulement dans 4 h, Annales
    S.modules.mine_surface = { level: 5 };
    S.pendingChainIncidents = [];
    app.triggerIncident('mine_eboulement', false);
    dec = S.pendingDecisions[0];
    const victime = S.crew.find(m => m.id === dec.acteurs.victime);
    r = app.choisirDecision(dec.id, 3);
    out.forcer = {
      niveau: S.modules.mine_surface.level,
      blessure: victime.statuts.some(s => s.key === 'blessure_grave'),
      chaine: S.pendingChainIncidents.map(p => [p.incidentId, p.triggerAt - now()]),
      annales: S.historicalMarks.at(-1)?.text || '', nom: victime.name,
      texte: r.resultat.textes.join(' '),
    };
    // Anniversaire : acteur filtré (âge rond), gabarit {colon.age}
    const fete = S.crew.find(m => m.statut !== 'mort');
    fete.birthGameMin = now() - 35 * 7 * 86400 - 3600;
    for (const m of S.crew) if (m !== fete) m.birthGameMin = now() - 33 * 7 * 86400;
    S.evenements = {};
    out.anniv = app.triggerColonyEvent('anniversaire');
    dec = S.pendingDecisions.find(d => d.refId === 'anniversaire');
    out.annivVue = app.vueDecision(dec.id)?.texteHTML || '';
    out.annivNom = fete.name;
    app.choisirDecision(dec.id, 1);
    // Délai par acteur : le même colon n'est pas refêté
    out.annivBis = app.triggerColonyEvent('anniversaire');
    S.pendingDecisions.length = 0;
    return out;
  });
  check(Math.abs(effets.evacuer.metal - 410) < 1 && Math.abs(effets.evacuer.cristal - 255) < 1 && effets.evacuer.hs === 3600,
    `« Évacuer » : −90 métal, −45 cristal, mine hors service 1 h (${JSON.stringify(effets.evacuer)})`);
  check(effets.forcer.niveau === 4 && effets.forcer.blessure && effets.forcer.chaine.some(([id, d]) => id === 'mine_eboulement' && d === 14400),
    `« Forcer la reprise » : niveau perdu, blessure grave, éboulement en chaîne dans 4 h (${JSON.stringify(effets.forcer.chaine)})`);
  check(effets.forcer.annales.includes(effets.forcer.nom) && effets.forcer.texte.includes(effets.forcer.nom), 'victime nommée dans le récit et dans les Annales');
  check(effets.anniv && effets.annivVue.includes(effets.annivNom) && /35\s*ans/.test(effets.annivVue) && !effets.annivBis,
    'anniversaire : acteur filtré (âge rond), {colon.age}, pas deux fois le même colon');

  // ------------------------------------------------------------------
  console.log('2. Accueillir un colon reste une décision du joueur');
  const recrue = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const out = {};
    S.modules.habitat = { level: 8 };
    S.res.biomasse = st.capOf('biomasse') * 0.8;
    // Bilan de biomasse positif (hydroponie poussée si besoin)
    for (let l = 5; l <= 12 && st.computeRates().biomasse < 0; l++) S.modules.hydroponie = { level: l };
    out.vivresOk = app.vivresOk();
    S.evenements = {};
    out.declenche = app.triggerColonyEvent('visiteur_isole');
    const dec = S.pendingDecisions.find(d => d.refId === 'visiteur_isole');
    const vue = app.vueDecision(dec.id);
    const accueil = vue.choix.find(c => c.recrue);
    out.salaire = accueil?.recrue?.salaire;
    out.salaireAttendu = app.salaryPerDay(dec.recrues[accueil.index]);
    // File qui déborde : seuls les incidents mineurs sont tranchés ; le visiteur
    // (un événement) attend le joueur, personne n'entre sans lui
    const n0 = S.crew.length;
    S.pendingDecisions.length = 0;
    S.pendingDecisions.push(dec);
    for (let i = 0; i < 3; i++) app.triggerIncident('mine_eboulement', false);
    out.colons = S.crew.length - n0;
    out.journal = S.journal.slice(-6).map(e => e.txt).join(' | ');
    out.restants = S.pendingDecisions.map(d => d.refId);
    // Vivres à zéro : le visiteur ne vient plus
    S.pendingDecisions.length = 0;
    S.evenements = {};
    S.res.biomasse = 0;
    out.sansVivres = app.triggerColonyEvent('visiteur_isole');
    S.res.biomasse = st.capOf('biomasse') * 0.8;
    return out;
  });
  check(recrue.vivresOk && recrue.declenche, 'colonie.vivres_ok : couchette libre et vivres en hausse → le visiteur peut venir');
  check(Number.isFinite(recrue.salaire) && recrue.salaire === recrue.salaireAttendu, `le choix d'accueil affiche le salaire réel (${recrue.salaire} biomasse par jour)`);
  check(recrue.colons === 0 && recrue.restants.includes('visiteur_isole') && !/Visiteur isolé.*décision automatique/.test(recrue.journal),
    `file qui déborde : le visiteur attend le joueur, aucun colon accueilli (${JSON.stringify(recrue.restants)})`);
  check(recrue.sansVivres === false, 'sans biomasse, aucun visiteur ne se présente');

  // Affichage de la fenêtre : titre, texte, choix avec raison / chance / salaire, conséquences
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    st.S.pendingDecisions.length = 0;
    st.S.evenements = {};
    app.triggerColonyEvent('visiteur_isole');
    app.triggerIncident('mine_predateur', false);
    st.setSimPaused(false);
  });
  await b.until(page, () => /Visiteur/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 4000 });
  const fen = await page.evaluate(() => [...document.querySelectorAll('#modal [data-event-choice]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check(fen.some(t => /Accueille .+ · salaire \d+ biomasse par jour/.test(t)), 'fenêtre : le choix d\'accueil nomme la recrue et son salaire');
  await page.evaluate(() => document.querySelector('#modal [data-event-choice="2"]').click());
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  await page.click('#consContinue');
  await b.until(page, () => /Créature/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 4000 });
  const inc = await page.evaluate(() => ({
    eyebrow: document.querySelector('#modal .incident-eyebrow')?.textContent.replace(/\s+/g, ' '),
    choix: [...document.querySelectorAll('#modal [data-incident-choice]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
  }));
  check(/Incident · Critique · Mine de surface/.test(inc.eyebrow) && inc.choix.some(t => /\d+ % — Vigueur de /.test(t)),
    `fenêtre d'incident : gravité, module, chance de réussite nommée (${inc.choix[0]})`);
  await page.evaluate(() => document.querySelector('#modal [data-incident-choice="0"]').click());
  await page.waitForSelector('#consContinue', { timeout: 2000 });
  const cons = await page.evaluate(() => document.querySelector('#modal').textContent);
  check(/Vigueur de .+ : \d+ [+−] \d+ = \d+ contre 6 — (réussite|échec)/.test(cons) && /−\d+ Métal/.test(cons), 'conséquences : jet de dés et pertes réellement appliquées');
  await page.click('#consContinue');
  await page.evaluate(async () => (await import('./src/state.js')).setSimPaused(true));
  b.noErrors(page, 'aucune erreur de page (contenu joué)');

  // ------------------------------------------------------------------
  console.log('2b. File pleine, incident sans personne, module endommagé avant un chantier en file');
  const file = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    const out = {};
    // File pleine (3) : ni incident ni événement tiré, rien de tranché à la place du joueur
    S.pendingDecisions.length = 0;
    S.evenements = {};
    app.triggerColonyEvent('visiteur_isole');
    app.triggerIncident('mine_predateur', false);
    app.triggerIncident('mine_predateur', false);
    out.pleine = app.fileDecisionsPleine();
    const avant = S.pendingDecisions.map(d => d.id).join();
    S.nextIncidentMin = 0; S.nextEventMin = 0;
    app.tickIncidents(true);
    app.tickColonyEvents(true);
    out.inchangee = S.pendingDecisions.map(d => d.id).join() === avant;
    // Un incident sérieux de plus (incident en chaîne, contenu) : la file déborde
    // mais rien n'est tranché à la place du joueur
    app.triggerIncident('mine_predateur', false);
    out.deborde = S.pendingDecisions.length === 4 && S.pendingDecisions.some(d => d.refId === 'visiteur_isole');
    // Incident sans personne à la base : le choix retenu est payé
    S.pendingDecisions.length = 0;
    S.modules.habitat = { level: 3 };
    for (const m of S.crew) if (m.statut !== 'mort') m.statut = 'expedition';
    S.res.biomasse = 300;
    S.pendingDecisions.push({ id: 'dec_vide', kind: 'incident', refId: 'habitat_anniversaire', acteurs: {}, createdAt: S.meta.gameMin, v: 1 });
    document.querySelector('#modalBg')?.classList.remove('show');   // aucune fenêtre ouverte
    st.setSimPaused(false); app.pumpDecisions(); st.setSimPaused(true);   // (synchrone : aucun tick entre les deux)
    const ligne = S.journal.slice(-12).map(e => e.txt).find(t => /Anniversaire<\/b> — décision automatique/.test(t)) || '(aucune décision automatique « Anniversaire »)';
    out.fete = /Organiser une fête/.test(ligne) ? S.res.biomasse <= 241 : /Geste discret|Trop occupés/.test(ligne);
    out.fete = out.fete && !S.pendingDecisions.some(d => d.id === 'dec_vide');
    out.ligne = ligne.slice(0, 160);
    for (const m of S.crew) if (m.statut === 'expedition') m.statut = 'libre';
    // Module endommagé alors qu'un niveau est en file : réparation gratuite d'abord
    // (un autre chantier se termine ; la file prend le relais)
    S.modules.mine_surface = { level: 3 };
    S.modules.generateur_solaire = { level: 1 };
    S.build = { id: 'generateur_solaire', targetLevel: 2, totalMin: 10, doneMin: 9, cost: {} };
    S.buildQueue = [{ id: 'mine_surface', targetLevel: 4, cost: { metal: 10 } }];
    app.appliquerEffetsColonie([{ module: { id: 'mine_surface', niveau: -1 } }], {});
    st.tickOnce({ silent: true });
    out.dbg = JSON.stringify({ build: S.build, q: S.buildQueue, lvl: S.modules.mine_surface });
    out.reparation = S.build?.id === 'mine_surface' && S.build?.targetLevel === 3 && Object.keys(S.build.cost || {}).length === 0 && S.buildQueue[0]?.targetLevel === 4;
    S.build = null; S.buildQueue = []; S.pendingDecisions.length = 0;
    return out;
  });
  check(file.pleine && file.inchangee, 'file pleine : aucun nouvel incident ni événement tiré');
  check(file.deborde, 'file qui déborde : aucun incident sérieux ni événement tranché à la place du joueur');
  check(file.fete, `incident sans personne à la base : le coût du choix retenu est payé (${file.ligne})`);
  check(file.reparation, 'module endommagé : le niveau perdu est réparé gratuitement, le niveau payé reste en file' + (file.reparation ? '' : ' ' + file.dbg));

  // ------------------------------------------------------------------
  console.log('3. Archives et Annales');
  const lore = await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const ui = await import('./src/ui.js');
    const S = st.S;
    const out = {};
    S.archives = {};
    S.inventory.disque_memoire = 1;
    while (S.meta.gameMin % 5) S.meta.gameMin++;
    app.tickArcs();
    out.ouvertes = Object.keys(S.archives);
    for (const id of out.ouvertes) if (id !== 'effondrement') S.archives[id].lu = true;
    ui.render();
    out.badge = document.querySelector('#archivesBadge')?.classList.contains('show') && document.querySelector('#archivesBadge').textContent;
    ui.gotoView('recits', 'archives');
    ui.render();
    out.page = !!document.querySelector('#archivesContent [data-archive="effondrement"].new');
    document.querySelector('#archivesContent [data-archive="effondrement"]').click();
    out.modal = document.querySelector('#modal h3')?.textContent;
    out.texte = document.querySelector('#modal .lore-reader')?.textContent || '';
    out.lu = S.archives.effondrement.lu;
    document.querySelector('#modalOk')?.click();
    ui.render();
    out.badgeApres = document.querySelector('#archivesBadge')?.classList.contains('show');
    // Annales : un décès raconté (mort naturelle à 80 ans), daté
    const vieux = S.crew.find(m => m.statut !== 'mort' && !m.startRole);
    vieux.birthGameMin = S.meta.gameMin - 80 * 7 * 86400;
    const rnd = Math.random;
    Math.random = () => 0;
    try { app.tickAging(); } finally { Math.random = rnd; }
    out.mort = vieux.statut;
    out.nom = vieux.name;
    out.annales = app.annalesColonie().map(e => `${e.jour}|${e.kind}|${e.texte}`);
    ui.gotoView('recits', 'annales');
    ui.render();
    out.vue = document.querySelector('#annalesContent')?.textContent.replace(/\s+/g, ' ') || '';
    return out;
  });
  check(lore.ouvertes.includes('effondrement') && lore.ouvertes.includes('exode') && lore.ouvertes.includes('plateau'), `pages débloquées par les découvertes (${lore.ouvertes.join(', ')})`);
  check(lore.badge === '1' && lore.page, 'badge discret sur « Archives » ; page marquée « nouveau »');
  check(lore.modal === "L'Effondrement" && /Nous ne sommes pas les premiers/.test(lore.texte) && lore.lu && !lore.badgeApres, 'lecture d\'une page : texte affiché, page lue, badge retiré');
  check(lore.mort === 'mort' && lore.annales.some(a => a.includes('|deces|') && a.includes(lore.nom) && /mort naturelle, paisible, à 80 ans/.test(a)), 'Annales : décès raconté avec sa cause');
  check(lore.annales[0]?.includes('|fondation|') && /Jour 1/.test(lore.vue) && lore.vue.includes(lore.nom), 'Annales : fondation en tête, triées par « Jour N », affichées dans Récits');
  b.noErrors(page, 'aucune erreur de page (archives, annales)');
  await ctx.close();

  // ------------------------------------------------------------------
  console.log('4. Ancienne sauvegarde (0.33) avec des décisions en attente');
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/regress/fixtures/sauvegarde-0.33-narration.json'), 'utf8'));
  raw.expeditions = [];
  for (const m of raw.crew) m.statut = 'libre';
  raw.modules.mine_surface = { level: 2 };
  const [v1, v2] = raw.crew;
  raw.pendingDecisions = [
    { id: 'dec_a', kind: 'event', refId: 'event_marchand', actorIds: { primary: null, secondary: null }, actorsDead: {}, createdAt: 1 },
    { id: 'dec_b', kind: 'incident', refId: 'mine_eboulement', victimId: v1.id, createdAt: 1 },
    { id: 'dec_c', kind: 'event', refId: 'event_romance', actorIds: { primary: v1.id, secondary: v2.id }, actorsDead: { primary: false, secondary: false }, createdAt: 1 },
  ];
  raw.pendingColonyEvent = 'event_marchand'; raw.pendingIncident = 'mine_eboulement';
  raw.relations = { [[v1.id, v2.id].sort().join('|')]: 80 };
  raw.flags.eventLastAt = { event_romance: 1 };
  raw.lastMerchantMin = 1;
  raw.lastColonyEventId = 'event_romance';
  v2.lastBirthdayCelebrated = 1;
  raw.arcs.arc_couvee.pathogenSeen = [v1.id];
  raw.historicalMarks = [{ at: 1, text: '{worker} a été sauvé d\'un éboulement au prix de matériel.', victim: v1.name }];
  raw.res.metal = 900; raw.res.cristal = 600;
  raw.meta.lastTickRealMs = Date.now(); raw.meta.lastSave = Date.now();   // pas de rattrapage
  const ctx2 = await b.context();
  await ctx2.addInitScript(seedSaveScript(JSON.stringify(raw)));
  const p2 = await b.page(ctx2);
  await p2.goto(b.base);
  await b.waitGame(p2);
  await b.until(p2, () => /Marchand/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 6000 });
  const vieux = await p2.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const S = st.S;
    return {
      decs: S.pendingDecisions.map(d => `${d.kind}:${d.refId}:${JSON.stringify(d.acteurs)}:${d.v}`),
      evenements: S.evenements, legacy: [S.lastMerchantMin, S.flags.eventLastAt, S.crew[1].lastBirthdayCelebrated],
      last: S.lastColonyEventId, vus: S.statutsVus, prologue: S.arcs.prologue?.unlocked || false,
      annales: app.annalesColonie().map(e => e.texte).join(' | '),
      ids: S.crew.map(m => m.id),
    };
  });
  check(vieux.decs[0]?.startsWith('event:marchand:{}:1') && vieux.decs[1] === `incident:mine_eboulement:{"victime":"${vieux.ids[0]}"}:1` && vieux.decs[2] === `event:romance:{"colon":"${vieux.ids[0]}","autre":"${vieux.ids[1]}"}:1`,
    `décisions converties (ids, acteurs) : ${vieux.decs.join(' ; ')}`);
  check(vieux.evenements.romance?.derniere === 1 && vieux.evenements.marchand?.derniere === 1 && vieux.evenements.anniversaire?.acteurs?.[vieux.ids[1]] === 1 && vieux.legacy.every(x => x === undefined) && vieux.last === 'romance',
    'minuteries de 0.33 reprises dans S.evenements (et retirées)');
  check(vieux.vus.pathogene_alien?.includes(vieux.ids[0]) && !vieux.prologue, 'suivi du pathogène repris ; pas de prologue sur une sauvegarde existante');
  check(/a été sauvé d'un éboulement/.test(vieux.annales) && !vieux.annales.includes('{worker}'), 'anciennes marques des Annales relues (victime nommée)');
  await p2.evaluate(() => document.querySelector('#modal [data-event-choice="0"]').click());
  await p2.waitForSelector('#consContinue', { timeout: 2000 });
  await p2.click('#consContinue');
  await b.until(p2, () => /Éboulement/.test(document.querySelector('#modalBg.show #modal h3')?.textContent || ''), null, { timeout: 4000 });
  check(true, 'la décision suivante (incident converti) s\'affiche');
  b.noErrors(p2, 'aucune erreur de page (ancienne sauvegarde)');
  await ctx2.close();
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}

// ------------------------------------------------------------------
console.log('5. Validateur : contenu de la colonie');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-colonie-'));
try {
  for (const d of ['src', 'tools']) fs.cpSync(path.join(ROOT, d), path.join(TMP, d), { recursive: true, filter: s => !s.includes(`${path.sep}regress${path.sep}`) });
  const modifier = (fichier, a, bb) => {
    const f = path.join(TMP, 'src/content', fichier);
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes(a)) throw new Error('motif absent : ' + a);
    fs.writeFileSync(f, src.replace(a, bb));
  };
  modifier('evenements/decouvertes.js', "si: 'colonie.vivres_ok',", "si: 'colonie.colons >= 1',");                        // recrue sans vivres
  modifier('incidents/mine.js', "{ module: { horsService: '1h' } },", "{ module: { horsService: '1h' } }, { aller: 'x' },"); // issue à la colonie
  modifier('evenements/social.js', "acteurs: { colon: { filtre: 'acteur.age_rond' } },", "acteurs: { colon: { filtre: 'acteur.agee' } },"); // champ d'acteur
  modifier('lore/ruines.js', "categorie: 'ruines',", "categorie: 'decombres',");                                           // catégorie inconnue
  modifier('arcs/atterrissage.js', "scene: 'prologue_postes',", "scene: 'prologue_poste',");                                // scène inconnue
  modifier('evenements/ilya.js', "{ monde: { ilya_service: 'refusee' } }", "{ monde: { ilya_service: 'refusee' } }, { gain: { metl: 3 } }"); // ressource
  modifier('incidents/habitat.js', "texte: \"C'est l'anniversaire de {victime}.", "texte: \"C'est l'anniversaire de {fete}.");  // gabarit
  const r = spawnSync(process.execPath, [path.join(TMP, 'tools/check-content.mjs')], { encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  check(r.status === 1, 'code de sortie 1');
  for (const [motif, nom] of [
    [/visiteur_isole.*exige « colonie\.vivres_ok »/, 'recrue sans condition de vivres'],
    [/effet « aller » impossible à la colonie/, 'issue dans un incident'],
    [/champ d'acteur inconnu « acteur\.agee »/, 'champ d\'acteur inconnu'],
    [/catégorie inconnue « decombres »/, 'catégorie d\'archives inconnue'],
    [/scène inconnue « prologue_poste »/, 'scène de fil rouge inconnue'],
    [/ressource inconnue « metl »/, 'ressource inconnue'],
    [/gabarit inconnu \{fete\}/, 'gabarit inconnu'],
  ]) check(motif.test(out), `détecté : ${nom}`);
} catch (e) {
  check(false, 'exception (validateur) : ' + e.message);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
await b.fin();
