#!/usr/bin/env node
/* global document, window, localStorage, Storage */
// tools/regress/sauvegarde.mjs — non-régression : chargement, migration, import, assainissement.
//   C3  : sauvegarde illisible → modale, rien d'écrasé, copie de secours, export, recommencer
//   M12 : migration d'une sauvegarde 0.32 (schemaVersion, posteInfo, origin, champs morts, file d'incidents)
//   Q3  : import validé + migré + confirmé, puis rechargement ; sauvegarde plus récente signalée
//   E5  : chaînes assainies (<, >, ") ; journal en liste blanche ; aucun script exécuté
//   F7  : échec de sauvegarde → toast unique ;  F19 : horloge de session remise à zéro
// Usage : NODE_PATH=$(npm root -g) node tools/regress/sauvegarde.mjs
import fs from 'node:fs';
import { banc, seedSaveScript, SAVE_KEY } from './_banc.mjs';

const b = await banc();
const { check } = b;

const backupsOf = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('drift_save_v1_backup_')));

try {
  // ------------------------------------------------------------------
  console.log('1. Sauvegarde illisible (JSON tronqué)');
  {
    const raw = '{"meta":{"version":"0.32.0","gameMin":4242,"colonyName":"Tronquée"},"res":{"metal":1';
    const ctx = await b.context();
    await ctx.addInitScript(seedSaveScript(raw));
    const page = await b.page(ctx);
    await page.goto(b.base);
    await page.waitForSelector('#modalBg.show', { timeout: 8000 });
    const title = await page.textContent('#modal h3');
    check(/illisible/i.test(title), `modale « Sauvegarde illisible » affichée (${title})`);
    await page.waitForTimeout(1500);
    check(await page.evaluate(k => localStorage.getItem(k), SAVE_KEY) === raw, 'la sauvegarde endommagée n\'est pas écrasée');
    let backups = await backupsOf(page);
    check(backups.length === 1, `une copie de secours (${backups.join(', ')})`);
    check(await page.evaluate(k => localStorage.getItem(k), backups[0]) === raw, 'la copie de secours contient la chaîne brute');
    const dl = page.waitForEvent('download');
    await page.click('#corruptExport');
    const file = await (await dl).path();
    check(fs.readFileSync(file, 'utf8') === raw, '« Exporter la sauvegarde endommagée » télécharge la chaîne brute');
    // Rechargement : toujours rien d'écrasé, pas de copie en double
    await page.reload();
    await page.waitForSelector('#modalBg.show', { timeout: 8000 });
    await page.waitForTimeout(500);
    check(await page.evaluate(k => localStorage.getItem(k), SAVE_KEY) === raw, 'après rechargement, toujours rien d\'écrasé');
    backups = await backupsOf(page);
    check(backups.length === 1, 'pas de copie de secours en double');
    // Recommencer une partie
    await page.click('#modalOk');
    await b.waitGame(page);
    const fresh = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    check(fresh?.meta?.colonyName === 'Avant-poste' && fresh.meta.schemaVersion >= 1, '« Recommencer » crée et sauvegarde une partie neuve');
    check((await backupsOf(page)).length === 1, 'la copie de secours est conservée');
    b.noErrors(page, 'aucune erreur inattendue', /Sauvegarde illisible|\[SAVE\]/);
    await ctx.close();
  }

  // ------------------------------------------------------------------
  console.log('2. Migration d\'une sauvegarde 0.32 (chargement)');
  let oldSave;
  {
    // Fabrique une sauvegarde au format 0.32 à partir d'une partie réelle
    const ctx = await b.context();
    const page = await b.page(ctx);
    await page.goto(b.base);
    await b.waitGame(page);
    oldSave = await page.evaluate(async () => {
      const st = await import('./src/state.js');
      const app = await import('./src/app.js');
      const S = st.S;
      st.setSimPaused(true);
      st.lockSaves('test');
      S.modules.habitat = { level: 2 };
      S.modules.mine_surface = { level: 2 };
      for (let i = 0; i < 3; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
      const worker = S.crew.find(m => m.statut === 'travail');
      const d = JSON.parse(JSON.stringify(S));
      // Format 0.32 : pas de schemaVersion, champs morts, file d'incidents, pas d'ui, pas de posteInfo
      delete d.meta.schemaVersion;
      d.meta.version = '0.31.0';   // format 0.32 (version différente de VERSION pour tester previousVersion)
      d.meta.sessionMs = 987654321;
      d.notifications = [{ id: 'n1' }];
      d.diplomacy = { routes: [], alliances: [], treaties: [] };
      d.queuedIncidents = ['mine_eboulement'];
      delete d.pendingDecisions;
      delete d.pendingIncident;
      delete d.ui;
      for (const m of d.crew) delete m.posteInfo;
      // Personnage de chronique créé par l'ancienne version : pas d'origin, pas de sequels
      d.crew.push({ id: 'chronchar_old', name: 'Vieux <b>Chroniqueur</b>', age: 40, origine: 'humaine', sante: 80, moral: 60, loyaute: 55,
        statut: 'libre', statuts: [], traits: ['chronique_x'], stats: { vigueur: 4, dexterite: 4, intellect: 6, sangfroid: 6, charisme: 5 },
        skills: { combat: 1 }, birthGameMin: 0 });
      // Chaînes hostiles (XSS)
      d.crew[0].name = '<img src=x onerror="window.__xss=1">Mallory';
      d.meta.colonyName = '<script>window.__xss=2</script>Colonie';
      d.inventory['x" onmouseover="window.__xss=3'] = 1;
      d.journal.push({ t: 1, kind: 'neutral', txt: 'Texte <em>légitime</em> et <img src=x onerror="window.__xss=4"> <br/> fin' });
      return { save: d, workerId: worker?.id, workerJoined: worker?.joinedAt, assigned: Object.keys(S.assignments).length, appOk: !!app.pumpDecisions };
    });
    await ctx.close();
    check(oldSave.assigned > 0 && oldSave.workerId, `sauvegarde 0.32 fabriquée (${oldSave.assigned} poste(s) pourvu(s))`);
  }
  {
    const ctx = await b.context();
    await ctx.addInitScript(seedSaveScript(JSON.stringify(oldSave.save)));
    const page = await b.page(ctx);
    await page.goto(b.base);
    await b.waitGame(page);
    const r = await page.evaluate(async (workerId) => {
      const { S } = await import('./src/state.js');
      const w = S.crew.find(m => m.id === workerId);
      const chron = S.crew.find(m => m.id === 'chronchar_old');
      return {
        schema: S.meta.schemaVersion, prev: S.meta.previousVersion, session: S.meta.sessionMs,
        notifications: 'notifications' in S, diplomacy: 'diplomacy' in S, queued: 'queuedIncidents' in S,
        chain: S.pendingChainIncidents.map(p => p.incidentId), ui: !!S.ui && S.ui.galaxyView,
        poste: w?.posteInfo, joined: w?.joinedAt,
        chronOrigin: chron?.origin, chronSeq: Array.isArray(chron?.sequels), chronSkills: chron?.skills?.survie,
        names: S.crew.map(m => m.name), colony: S.meta.colonyName, invKeys: Object.keys(S.inventory),
        journal: S.journal.map(e => e.txt).filter(t => /légitime|onerror/.test(t)),
        seed: S.journal[0]?.txt
      };
    }, oldSave.workerId);
    check(r.schema === 1 && r.prev === '0.31.0', `schemaVersion=1, version d'origine gardée (${r.prev})`);
    check((await backupsOf(page)).length === 1, 'copie de secours avant migration');
    check(!r.notifications && !r.diplomacy && !r.queued, 'champs morts retirés (notifications, diplomacy, queuedIncidents)');
    check(r.chain.includes('mine_eboulement'), 'incident en file converti en incident en chaîne');
    check(r.ui === 'list', 'S.ui recréé');
    check(r.poste && r.poste.depuis === r.joined && r.poste.titre, `posteInfo créé pour les colons en poste (depuis ${r.poste?.depuis})`);
    check(r.chronOrigin?.id === 'chronique' && r.chronSeq && r.chronSkills === 0, 'origin / sequels / compétences complétés (personnage de chronique)');
    check(r.names.every(n => !/[<>"]/.test(n)) && r.names.some(n => /Mallory/.test(n)), 'noms de colons assainis');
    check(!/[<>]/.test(r.colony), `nom de colonie assaini (${r.colony})`);
    check(r.invKeys.every(k => !/[<>"]/.test(k)), 'clés assainies');
    check(r.journal.length === 1 && r.journal[0].includes('<em>légitime</em>') && r.journal[0].includes('&lt;img') && r.journal[0].includes('<br/>'),
      `journal : balises autorisées gardées, le reste échappé (${r.journal[0]})`);
    check(/<em>générateur solaire<\/em>/.test(await page.evaluate(async () => (await import('./src/state.js')).S.journal.map(e => e.txt).join('\n'))),
      'entrées de journal générées par le jeu intactes');
    await page.waitForTimeout(400);
    check(/session 0:0\d/.test(await page.textContent('#realTime')), 'horloge de session remise à zéro au démarrage (F19)');
    for (const t of ['base', 'equipage', 'expeditions', 'labo', 'recits']) {
      await page.click(`nav.tabs button[data-tab="${t}"]`, { force: true });
      await page.waitForTimeout(120);
    }
    check(await page.evaluate(() => window.__xss === undefined), 'aucun script injecté exécuté');
    b.noErrors(page, 'chargement et onglets sans erreur');

    // ----------------------------------------------------------------
    console.log('3. Import (validation, migration, confirmation, rechargement)');
    const imported = JSON.parse(JSON.stringify(oldSave.save));
    imported.meta.colonyName = 'Colonie importée';
    imported.meta.gameMin = 77777;
    imported.meta.lastTickRealMs = Date.now() - 6 * 3600e3;   // ne doit PAS déclencher de rattrapage
    await page.setInputFiles('#fileInput', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => /Remplacer la partie/.test(document.querySelector('#modal h3')?.textContent || ''), null, { timeout: 5000 });
    check(true, 'confirmation demandée avant de remplacer la partie');
    // Annuler : rien ne change
    await page.click('#modalCancel');
    await page.waitForTimeout(300);
    check(await page.evaluate(async () => (await import('./src/state.js')).S.meta.colonyName) !== 'Colonie importée', 'annuler laisse la partie intacte');
    await page.setInputFiles('#fileInput', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => /Remplacer la partie/.test(document.querySelector('#modal h3')?.textContent || ''), null, { timeout: 5000 });
    await Promise.all([page.waitForEvent('load', { timeout: 8000 }), page.click('#modalOk')]);
    await b.waitGame(page);
    const after = await page.evaluate(async () => {
      const { S } = await import('./src/state.js');
      return { name: S.meta.colonyName, gm: S.meta.gameMin, schema: S.meta.schemaVersion, ui: !!S.ui, journal: S.journal.at(-1)?.txt };
    });
    check(after.name === 'Colonie importée' && after.schema === 1 && after.ui, 'sauvegarde importée, migrée et rechargée');
    check(after.gm < 77777 + 60, `pas de rattrapage de la période export → import (gameMin ${after.gm})`);
    // Clic sur un système (plantait avec une vieille sauvegarde sans S.ui)
    await page.click('nav.tabs button[data-tab="expeditions"]', { force: true });
    await page.click('[data-subtab="carte"]', { force: true });
    await page.waitForTimeout(200);
    const sys =await page.$('[data-system-id], [data-sys], .system-row, .sys-row');
    if (sys) { await sys.click({ force: true }); await page.waitForTimeout(200); }
    b.noErrors(page, 'galaxie de la sauvegarde importée sans erreur');

    // Fichier invalide : refus, partie intacte
    await page.setInputFiles('#fileInput', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"pas":"une sauvegarde"}') });
    await page.waitForTimeout(500);
    check(/Échec import/.test(await page.textContent('#toast')), 'fichier invalide refusé (toast)');
    // Sauvegarde d'une version plus récente : signalée
    const newer = JSON.parse(JSON.stringify(imported));
    newer.meta.schemaVersion = 99;
    newer.meta.version = '9.9.9';
    newer.futureField = { keep: true };
    await page.setInputFiles('#fileInput', { name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
    await page.waitForFunction(() => /Remplacer la partie/.test(document.querySelector('#modal h3')?.textContent || ''), null, { timeout: 5000 });
    check(/plus récente/.test(await page.textContent('#modal')), 'sauvegarde plus récente signalée à l\'import');
    await page.click('#modalCancel');

    // ----------------------------------------------------------------
    console.log('4. Échec de sauvegarde (F7)');
    const f7 = await page.evaluate(async () => {
      const st = await import('./src/state.js');
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
      const r1 = st.save();
      const toast1 = document.querySelector('#toast').textContent;
      document.querySelector('#toast').textContent = '';
      const r2 = st.save();
      const toast2 = document.querySelector('#toast').textContent;
      Storage.prototype.setItem = orig;
      const r3 = st.save();
      return { r1, r2, r3, toast1, toast2 };
    });
    check(f7.r1 === false && /Sauvegarde impossible/.test(f7.toast1), 'toast quand la sauvegarde échoue');
    check(f7.r2 === false && f7.toast2 === '', 'toast unique (pas de répétition)');
    check(f7.r3 === true, 'la sauvegarde refonctionne ensuite');
    b.noErrors(page, 'aucune erreur de page', /Sauvegarde échouée/);
    await ctx.close();
  }
} catch (e) {
  check(false, 'exception du test : ' + e.message);
}
await b.fin();
