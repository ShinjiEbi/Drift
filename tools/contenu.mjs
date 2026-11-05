// tools/contenu.mjs — outils communs au validateur (check-content.mjs) et au
// lecteur d'histoire (lire-histoire.mjs) : chargement du jeu dans Node et
// parcours des branches d'une histoire avec l'état de ses drapeaux.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- Bouchons DOM minimaux : app.js / state.js / ui.js touchent le navigateur ----
function bouchonsDOM() {
  if (globalThis.__driftBouchons) return;
  globalThis.__driftBouchons = true;
  const noop = () => {};
  const el = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : el),
    set: () => true, apply: () => el, construct: () => el,
  });
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def('document', {
    readyState: 'loading', addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => el, body: el, documentElement: el, hidden: false, visibilityState: 'visible',
  });
  def('window', globalThis);
  const store = {};
  def('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: noop });
  def('navigator', { userAgent: 'node' });
  def('Notification', function () {});
  globalThis.addEventListener = noop;
}

const imp = f => import(pathToFileURL(path.join(ROOT, 'src', f)).href);

// Contenu seul (sans le jeu) : rapide, sans DOM
export async function chargerContenu() {
  const [contenu, vocab, N] = await Promise.all([imp('content/index.js'), imp('content/vocabulaire.js'), imp('engine/narration.js')]);
  return { contenu, vocab, N };
}

// Contenu + tables du jeu (catalogue, constantes, état, app.js) pour les références
export async function chargerJeu() {
  bouchonsDOM();
  const K = await imp('constants.js');
  const CAT = await imp('catalog.js');
  const RAW_ITEMS = new Set(Object.keys(CAT.ITEMS));   // avant l'ajout des schémas par app.js
  const ST = await imp('state.js');
  const APP = await imp('app.js');
  const base = await chargerContenu();
  return { ...base, K, CAT, ST, APP, RAW_ITEMS };
}

// ============================================================
//   Parcours d'une histoire
// ============================================================
// Évalue une condition qui ne dépend que des drapeaux : true / false, ou
// 'inconnu' si elle lit l'équipe, la colonie, le lieu… (les deux issues sont possibles).
export function evaluerDrapeaux(N, src, flags) {
  if (src === undefined || src === null) return true;
  const ids = N.identifiants(src);
  if (ids.some(id => id.includes('.'))) return 'inconnu';
  return N.condition(src, id => flags[id]);
}

// Branches possibles d'un choix : listes d'effets (réussite / échec d'un test,
// victoire / défaite d'un combat), avec un libellé de branche.
export function branchesDe(choix) {
  const bases = choix.test
    ? [['réussite', choix.test.reussite || []], ['échec', choix.test.echec || []]]
    : [['', choix.effets || []]];
  const out = [];
  for (const [nom, liste] of bases) {
    const last = liste[liste.length - 1];
    if (last && last.combat) {
      const avant = liste.slice(0, -1);
      out.push([[nom, 'victoire'].filter(Boolean).join(', '), [...avant, ...(last.combat.victoire || [])]]);
      out.push([[nom, 'défaite'].filter(Boolean).join(', '), [...avant, ...(last.combat.defaite || [{ retraite: true }])]]);
    } else out.push([nom, liste]);
  }
  return out;
}

const issueDe = liste => {
  const last = liste[liste.length - 1];
  const k = last && Object.keys(last)[0];
  return ['aller', 'finEpisode', 'fin', 'retraite', 'rentrer'].includes(k) ? { type: k, valeur: last[k] } : null;
};

function appliquerDrapeauxListe(N, flags, liste) {
  const f = { ...flags };
  for (const e of liste) if (e.drapeau) N.appliquerDrapeaux(f, e.drapeau);
  return f;
}

// Parcourt toutes les branches d'une histoire, épisode par épisode, en suivant
// l'état des drapeaux. Renvoie les scènes et fins atteintes, le nombre d'états
// de drapeaux en fin d'épisode, et les impasses (scène sans choix visible).
export function parcourirHistoire(N, h, { maxEtats = 50000 } = {}) {
  const scenes = new Set(), fins = {}, finsEpisode = [], impasses = [], retraites = [];
  const valeursEcrites = {};
  let starts = [{ ...h.drapeaux }];
  let tronque = false;
  h.episodes.forEach((ep, n) => {
    const suivants = new Map();
    const pile = starts.map(f => [ep.debut, f]);
    const vu = new Set();
    while (pile.length) {
      const [sid, flags] = pile.pop();
      const cle = sid + '|' + JSON.stringify(flags);
      if (vu.has(cle)) continue;
      if (vu.size >= maxEtats) { tronque = true; break; }
      vu.add(cle);
      scenes.add(sid);
      const sc = h.scenes[sid];
      if (!sc) continue;
      let visibles = 0;
      for (const c of sc.choix || []) {
        if (evaluerDrapeaux(N, c.si, flags) === false) continue;
        if (evaluerDrapeaux(N, c.requiert, flags) === false) continue;
        visibles++;
        for (const [, liste] of branchesDe(c)) {
          const f2 = appliquerDrapeauxListe(N, flags, liste);
          for (const e of liste) if (e.drapeau) for (const [k, v] of Object.entries(e.drapeau)) (valeursEcrites[k] ||= new Set()).add(N.estIncrement(v) ? f2[k] : v);
          const iss = issueDe(liste);
          if (!iss) continue;
          if (iss.type === 'aller') pile.push([iss.valeur, f2]);
          else if (iss.type === 'fin') fins[iss.valeur] = (fins[iss.valeur] || 0) + 1;
          else if (iss.type === 'finEpisode') suivants.set(JSON.stringify(f2), f2);
          else retraites.push({ episode: n + 1, scene: sid });
        }
      }
      if (!visibles) impasses.push({ episode: n + 1, scene: sid, flags });
    }
    finsEpisode.push(suivants.size);
    starts = [...suivants.values()];
  });
  return { scenes, fins, finsEpisode, impasses, retraites, valeursEcrites, tronque };
}

// Énumère les chemins d'une histoire (pour lire-histoire --tout) : liste de
// { pas: [{ episode, scene, choix, branche }], fin, flags }. Plafonné à `max` chemins.
export function cheminsHistoire(N, h, { max = 2000 } = {}) {
  const out = [];
  const visiter = (epIdx, sid, flags, pas, profondeur) => {
    if (out.length >= max || profondeur > 60) return;
    const sc = h.scenes[sid];
    if (!sc) return;
    for (const c of sc.choix || []) {
      if (evaluerDrapeaux(N, c.si, flags) === false) continue;
      if (evaluerDrapeaux(N, c.requiert, flags) === false) continue;
      for (const [branche, liste] of branchesDe(c)) {
        const f2 = appliquerDrapeauxListe(N, flags, liste);
        const p2 = [...pas, { episode: epIdx + 1, scene: sid, choix: c.label, branche, requiert: c.requiert || null, si: c.si || null }];
        const iss = issueDe(liste);
        if (!iss) continue;
        if (iss.type === 'aller') visiter(epIdx, iss.valeur, f2, p2, profondeur + 1);
        else if (iss.type === 'finEpisode') {
          if (epIdx + 1 < h.episodes.length) visiter(epIdx + 1, h.episodes[epIdx + 1].debut, f2, p2, profondeur + 1);
          else out.push({ pas: p2, fin: '(fin générique)', flags: f2 });
        } else if (iss.type === 'fin') out.push({ pas: p2, fin: iss.valeur, flags: f2 });
        else out.push({ pas: p2, fin: `(${iss.type} : l'épisode reprendra)`, flags: f2 });
        if (out.length >= max) return;
      }
    }
  };
  visiter(0, h.episodes[0].debut, { ...h.drapeaux }, [], 0);
  return out;
}
