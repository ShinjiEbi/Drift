#!/usr/bin/env node
/* global document, sessionStorage, localStorage */
// tools/regress/interface-contrats.mjs — l'interface V1 avec les fonctions des
// contrats entre modules (docs/V1.md) : file de chantiers et de recherche,
// soins en un geste, durée réelle de recherche, calendrier, pénuries,
// colons volontairement libres, liste des chroniques.
// Les fonctions sont SIMULÉES : le serveur de test réécrit l'import
// `import * as App from '…/app.js'` de src/views/common.js et src/objectives.js
// pour y superposer un module de doublures (les vraies fonctions d'app.js, si
// elles existent, sont masquées : le test reste déterministe).
// Usage : node tools/regress/interface-contrats.mjs
import { loadPlaywright, startServer, reporter } from './_ui.mjs';

const { chromium } = loadPlaywright();
const t = reporter('Interface V1 : contrats d\'app.js (doublures)');
const srv = await startServer();
const browser = await chromium.launch();

const STUB = `
import { S } from './state.js';
const calls = (globalThis.__stub ||= { calls: [] }).calls;
const log = (n, a) => calls.push([n, ...a]);
export const BUILD_QUEUE_MAX = 3;
export function enqueueBuild(id) {
  log('enqueueBuild', [id]);
  if (!Array.isArray(S.buildQueue)) S.buildQueue = [];
  if (S.buildQueue.length >= 3) return { ok: false, why: 'File pleine' };
  const lvl = (S.modules[id]?.level || 0) + (S.build?.id === id ? 1 : 0) + S.buildQueue.filter(q => q.id === id).length;
  S.buildQueue.push({ id, targetLevel: lvl + 1 });
  return { ok: true };
}
export function cancelQueuedBuild(i) { log('cancelQueuedBuild', [i]); S.buildQueue.splice(i, 1); return { ok: true }; }
export function enqueueResearch(techId) {
  log('enqueueResearch', [techId]);
  if (!Array.isArray(S.researchQueue)) S.researchQueue = [];
  S.researchQueue.push(techId);
  return { ok: true };
}
export function cancelQueuedResearch(i) { log('cancelQueuedResearch', [i]); S.researchQueue.splice(i, 1); return { ok: true }; }
export function soigner(memberId) { log('soigner', [memberId]); return { ok: true }; }
export function researchEta() { return 5400; }
export function calendarOf() { return { jour: 42, heure: 7, minute: 5 }; }
export function shortages() { return [{ res: 'energie', texte: "Pénurie d'énergie : modules au ralenti" }]; }
export function isVoluntarilyFree(m) { return m.__libre === true; }
export function listChronicles(s) {
  const sys = s.galaxy.systems.find(x => x.distance > 0.8);
  const b = sys.bodies[0];
  return [{ id: 'stub', titre: 'La Chronique simulée', lieu: { systemId: sys.id, bodyId: b.id, nom: b.name }, etat: 'prete', episode: 2, episodes: 3, prochainDans: null, fin: null }];
}
`;
const PROXY = (rel) => `import * as RealApp from '${rel}app.js';
import * as StubApp from '${rel}__stub.js';
const App = new Proxy({}, { get: (_, k) => (k in StubApp ? StubApp[k] : RealApp[k]) });`;

async function openStubbed() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__keep')) { localStorage.clear(); sessionStorage.setItem('__keep', '1'); } } catch { /* rien */ } });
  await ctx.route('**/src/__stub.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
  for (const [pat, rel] of [['**/src/views/common.js', '../'], ['**/src/objectives.js', './']]) {
    await ctx.route(pat, async route => {
      const res = await route.fetch();
      const src = await res.text();
      const re = new RegExp(`import \\* as App from '${rel.replace(/\./g, '\\.')}app\\.js';`);
      if (!re.test(src)) throw new Error('import * as App introuvable dans ' + pat);
      await route.fulfill({ response: res, body: src.replace(re, PROXY(rel)) });
    });
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Service Worker|\[PWA\]|Failed to load resource/.test(m.text())) page.errors.push(m.text().split('\n')[0]); });
  await page.goto(srv.base);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'), null, { timeout: 10000 });
  return page;
}

try {
  const page = await openStubbed();
  const r = await page.evaluate(async () => {
    const ui = await import('./src/ui.js');
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const cat = await import('./src/catalog.js');
    const S = st.S;
    st.setSimPaused(true);
    const out = {};
    // Colonie : quelques bâtiments et colons
    for (const id of ['generateur_solaire', 'mine_surface', 'hydroponie', 'habitat', 'balise_recrutement', 'laboratoire', 'infirmerie']) S.modules[id] = { level: 2 };
    S.modules.commandement.level = 3;
    S.flags.recrutement = true;
    for (let i = 0; i < 4; i++) { const c = st.genCandidate(); S.candidates.push(c); st.acceptCandidate(c.id); }
    for (const k of Object.keys(S.res)) S.res[k] = st.capOf(k);
    S.res.datacubes = st.capOf('datacubes');
    ui.render();
    // En-tête : calendrier fourni par le moteur
    out.clock = document.querySelector('#gameTime').textContent;
    // Construction : « Mettre en file » quand un chantier tourne, file affichée, annulation
    st.startBuild('mine_surface');
    ui.gotoView('base', 'construction');
    const qBtn = document.querySelector('#modulesList button[data-enqueue="hydroponie"]');
    out.queueBtn = qBtn?.textContent.trim();
    qBtn?.click();
    ui.render();
    out.queue = [...document.querySelectorAll('#buildPanel .bp-list li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
    out.queueMax = document.querySelector('#buildPanel .bp-queue')?.textContent;
    document.querySelector('#buildPanel [data-cancel-queue="0"]')?.click();
    out.queueAfter = (S.buildQueue || []).length;
    // Tableau de bord : chronique prête, pénurie
    ui.gotoView('base', 'afaire');
    ui.render();
    out.attn = [...document.querySelectorAll('#dashAttention .attn-title')].map(e => e.textContent);
    out.shortage = document.querySelector('#dashResources .rs-alert')?.textContent || '';
    out.alertBar = document.querySelector('#alertText').textContent;
    out.recitsBadge = document.querySelector('#recitsBadge').textContent;
    // « Lancer » : la fenêtre de lancement s'ouvre vers la planète de la chronique
    document.querySelector('#dashAttention [data-launch-body]')?.click();
    const chronBody = S.galaxy.systems.find(x => x.distance > 0.8).bodies[0];
    out.chronGo = {
      shown: document.querySelector('#modalBg').classList.contains('show') && document.querySelector('#modal').classList.contains('launch-modal'),
      titre: document.querySelector('#modal h3')?.textContent, body: chronBody.name,
      card: document.querySelector('#modal .lx-chron')?.textContent.replace(/\s+/g, ' ').trim(),
    };
    document.querySelector('#modalBg').classList.remove('show');
    // Équipage : « Soigner » en un geste
    const m = S.crew[0];
    m.statuts.push({ key: Object.keys(app.STATUTS)[0], since: S.meta.gameMin, revealed: true, diagnosed: true });
    ui.gotoView('equipage', 'personnel');
    const care = document.querySelector(`#crewList .crew-card[data-id="${m.id}"] [data-soigner]`);
    out.careBtn = care?.textContent;
    care?.click();
    out.soigner = globalThis.__stub.calls.find(c => c[0] === 'soigner')?.[1] === m.id;
    // Colons volontairement libres : pas d'alerte « sans poste »
    for (const c of S.crew) app.unassignMember(c.id);
    S.crew.forEach(c => { c.statut = 'libre'; });
    ui.render();
    out.freeAlert = ui.collectAlerts().some(a => /sans poste/.test(a.text));
    S.crew.forEach(c => { c.__libre = true; });
    ui.render();
    out.freeAlertVol = ui.collectAlerts().some(a => /sans poste/.test(a.text));
    // Labo : durée réelle (researchEta) et file de recherche
    ui.gotoView('labo', 'recherche');
    out.durations = [...document.querySelectorAll('#researchContent .tech-card .dur')].map(e => e.textContent.replace(/ /g, ' '));
    const techs = Object.keys(cat.TECH_TREE).filter(id => app.canResearch(id).ok);
    app.startResearch(techs[0]);
    ui.render();
    const other = Object.keys(cat.TECH_TREE).find(id => id !== techs[0] && !app.isTechCompleted(id) && document.querySelector(`#researchContent .tech-card[data-tech="${id}"][role="button"]`));
    document.querySelector(`#researchContent .tech-card[data-tech="${other}"]`)?.click();
    out.rqBtn = document.querySelector('#researchQueue')?.textContent;
    document.querySelector('#researchQueue')?.click();
    ui.render();
    out.rq = [...document.querySelectorAll('#researchContent .bp-list li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
    out.calls = globalThis.__stub.calls.map(c => c[0]);
    return out;
  });
  t.check(/^J42 · 07:05$/.test(r.clock), 'calendrier du moteur (calendarOf) dans l\'en-tête', r.clock);
  t.check(/Mettre en file/.test(r.queueBtn || '') && r.queue.length === 1 && /Hydroponie/.test(r.queue[0]) && r.queueMax === 'file 1/3', '« Mettre en file » pendant un chantier, file affichée', JSON.stringify([r.queueBtn, r.queue, r.queueMax]));
  t.check(r.queueAfter === 0, 'annulation d\'un chantier en file (cancelQueuedBuild)');
  t.check(r.attn.some(x => /La suite est prête : La Chronique simulée/.test(x.replace(/ /g, ' '))) && r.recitsBadge === '1', 'chronique « La suite est prête » (listChronicles) sur le tableau de bord et en badge', JSON.stringify(r.attn));
  t.check(r.chronGo.shown && (r.chronGo.titre || '').includes(r.chronGo.body) && /Chronique simulée/.test(r.chronGo.card || '') && /épisode 2\/3/.test(r.chronGo.card || ''),
    '« Lancer » ouvre le lancement vers la planète de la chronique', JSON.stringify(r.chronGo));
  t.check(/Pénurie d.énergie/.test(r.shortage) && /Pénurie d.énergie/.test(r.alertBar), 'pénurie (shortages) signalée dans les ressources et le bandeau', JSON.stringify([r.shortage, r.alertBar]));
  t.check(r.careBtn === 'Soigner' && r.soigner, '« Soigner » en un geste (soigner)', JSON.stringify(r.careBtn));
  t.check(r.freeAlert && !r.freeAlertVol, 'alerte « sans poste » : les colons volontairement libres sont ignorés (isVoluntarilyFree)');
  t.check(r.durations.length > 0 && r.durations.every(d => d === '1 h 30'), 'durée réelle des recherches (researchEta)', JSON.stringify(r.durations.slice(0, 4)));
  t.check(r.rqBtn === 'Mettre en file' && r.rq.length === 1, 'recherche mise en file quand le laboratoire est occupé (enqueueResearch)', JSON.stringify([r.rqBtn, r.rq]));
  t.check(page.errors.length === 0, 'aucune erreur JavaScript', page.errors.slice(0, 3).join(' | '));
} catch (e) {
  t.fail('exception du test : ' + e.message);
} finally {
  await browser.close();
  srv.close();
}
t.done();
