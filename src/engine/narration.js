// src/engine/narration.js — interpréteur du contenu narratif (V1).
//
// Un seul moteur pour lire le contenu de src/content/ : conditions (mini-langage
// interprété, sans eval : la CSP du jeu l'interdit), textes (paragraphes
// conditionnels, *italique*, gabarits, accords), effets (vocabulaire unique),
// choix (visibilité, disponibilité et raison lisible, chance de réussite, colon
// qui agit) et durées en temps réel.
//
// Ce module ne connaît ni l'état du jeu (S) ni le DOM : l'appelant lui passe un
// « environnement » (fonctions de lecture et de gabarits). Il est donc utilisé
// tel quel par le jeu (app.js), le validateur (tools/check-content.mjs) et le
// lecteur d'histoire en terminal (tools/lire-histoire.mjs).

import { COMPETENCES, CARACS, RESSOURCES } from '../content/vocabulaire.js';

// ============================================================
//   DURÉES — 1 tick = 1 seconde réelle
// ============================================================
const UNITES = { s: 1, min: 60, h: 3600, j: 86400 };

// '18h' → 64800 ; '30min' → 1800 ; '3j' → 259200 ; '1j12h' ; '2h30' (= 2 h 30 min).
// Un nombre est déjà une durée en ticks. Renvoie NaN si la chaîne est invalide.
export function parseDuree(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const src = v.replace(/\s+/g, '').toLowerCase();
  if (!src) return NaN;
  const re = /(\d+(?:[.,]\d+)?)(j|h|min|s)?/y;
  let total = 0, last = null, m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    m = re.exec(src);
    if (!m) return NaN;
    const n = Number(m[1].replace(',', '.'));
    let unite = m[2];
    if (!unite) {
      // « 2h30 » : un nombre nu après des heures = des minutes
      if (last === 'h' && re.lastIndex === src.length) unite = 'min';
      else return NaN;
    }
    total += n * UNITES[unite];
    last = unite;
  }
  return Math.round(total);
}

// ============================================================
//   CONDITIONS — mini-langage interprété
// ============================================================
// Littéraux : 12, 0.5, 'texte', vrai/faux (true/false), nul (null), ['a', 'b']
// Opérateurs : == != >= <= > <  dans  &&/et  ||/ou  !/non  ( )
// Identifiants : drapeau (nu), equipe.science, corps.biome, colonie.res.metal…

const MOTS = { et: '&&', ou: '||', non: '!', dans: 'dans' };
const LITTERAUX = { vrai: true, faux: false, true: true, false: false, nul: null, null: null };
const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>=': 3, '<=': 3, '>': 3, '<': 3, dans: 3 };

export class ErreurCondition extends Error {}

function tokenize(src) {
  const re = /\s*(?:(-?\d+(?:\.\d+)?)|'([^']*)'|(==|!=|>=|<=|&&|\|\||[<>!()[\],])|([A-Za-z_][\w.:]*))/y;
  const out = [];
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(at))) break;
      throw new ErreurCondition(`caractère inattendu « ${src.slice(at).trim()[0]} » (position ${at + 1}) dans « ${src} »`);
    }
    if (m[1] !== undefined) out.push({ t: 'lit', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'lit', v: m[2] });
    else if (m[3]) out.push({ t: 'op', v: m[3] });
    else if (m[4] in LITTERAUX) out.push({ t: 'lit', v: LITTERAUX[m[4]] });
    else if (m[4] in MOTS) out.push({ t: 'op', v: MOTS[m[4]] });
    else out.push({ t: 'id', v: m[4] });
  }
  return out;
}

function parse(src) {
  const tk = tokenize(src);
  let i = 0;
  const err = msg => new ErreurCondition(`${msg} dans « ${src} »`);
  const primaire = () => {
    const x = tk[i++];
    if (!x) throw err('expression incomplète');
    if (x.t === 'op' && x.v === '!') return { k: 'op', op: '!', a: primaire() };
    if (x.t === 'op' && x.v === '(') {
      const e = expr(0);
      if (tk[i++]?.v !== ')') throw err('« ) » manquante');
      return e;
    }
    if (x.t === 'op' && x.v === '[') {
      const items = [];
      while (tk[i] && tk[i].v !== ']') {
        const it = tk[i++];
        if (it.t !== 'lit') throw err('une liste ne contient que des valeurs (texte entre apostrophes ou nombres)');
        items.push(it.v);
        if (tk[i]?.v === ',') i++;
        else if (tk[i]?.v !== ']') throw err('« , » ou « ] » attendu dans la liste');
      }
      if (tk[i++]?.v !== ']') throw err('« ] » manquant');
      return { k: 'liste', v: items };
    }
    if (x.t === 'op') throw err(`opérateur « ${x.v} » inattendu`);
    return x.t === 'lit' ? { k: 'lit', v: x.v } : { k: 'id', v: x.v };
  };
  const expr = min => {
    let a = primaire();
    while (tk[i]?.t === 'op' && PREC[tk[i].v] > min) {
      const op = tk[i++].v;
      a = { k: 'op', op, a, b: expr(PREC[op]) };
    }
    return a;
  };
  const e = expr(0);
  if (i < tk.length) throw err(`suite inattendue « ${tk.slice(i).map(t => t.t === 'lit' ? JSON.stringify(t.v) : t.v).join(' ')} »`);
  return e;
}

const _cache = new Map();
// Analyse (avec cache) ; lève ErreurCondition si la syntaxe est invalide.
export function compiler(src) {
  if (typeof src === 'boolean') return { k: 'lit', v: src };
  if (typeof src !== 'string') throw new ErreurCondition(`condition attendue (texte), reçu ${JSON.stringify(src)}`);
  let ast = _cache.get(src);
  if (!ast) {
    ast = parse(src);
    if (_cache.size > 2000) _cache.clear();
    _cache.set(src, ast);
  }
  return ast;
}

const vrai = v => !(v === false || v === null || v === undefined || v === 0 || v === '' || Number.isNaN(v));

function evaluerNoeud(n, lire) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'liste': return n.v;
    case 'id': return lire(n.v);
  }
  if (n.op === '!') return !vrai(evaluerNoeud(n.a, lire));
  if (n.op === '&&') return vrai(evaluerNoeud(n.a, lire)) && vrai(evaluerNoeud(n.b, lire));
  if (n.op === '||') return vrai(evaluerNoeud(n.a, lire)) || vrai(evaluerNoeud(n.b, lire));
  const a = evaluerNoeud(n.a, lire), b = evaluerNoeud(n.b, lire);
  switch (n.op) {
    case '==': return (a ?? null) === (b ?? null);
    case '!=': return (a ?? null) !== (b ?? null);
    case 'dans': return Array.isArray(b) && b.includes(a);
  }
  if (a === null || a === undefined || b === null || b === undefined) return false;
  switch (n.op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
  }
  return false;
}

// Valeur d'une expression ; `lire(id)` donne la valeur d'un identifiant.
export function evaluer(src, lire) {
  return evaluerNoeud(compiler(src), lire);
}

// Condition booléenne ; une condition absente est vraie.
export function condition(src, lire) {
  if (src === undefined || src === null) return true;
  return vrai(evaluer(src, lire));
}

// Identifiants employés par une expression (pour le validateur)
export function identifiants(src) {
  const out = [];
  const visit = n => {
    if (!n) return;
    if (n.k === 'id') out.push(n.v);
    visit(n.a); visit(n.b);
  };
  visit(compiler(src));
  return out;
}

// Comparaisons identifiant ↔ valeur littérale (pour vérifier les valeurs attendues)
export function comparaisons(src) {
  const out = [];
  const visit = n => {
    if (!n || n.k !== 'op') return;
    if (PREC[n.op] === 3 && n.a.k === 'id' && (n.b.k === 'lit' || n.b.k === 'liste')) {
      out.push({ id: n.a.v, op: n.op, valeurs: n.b.k === 'liste' ? n.b.v : [n.b.v] });
    }
    visit(n.a); visit(n.b);
  };
  visit(compiler(src));
  return out;
}

// ============================================================
//   TEXTES
// ============================================================
// Texte = 'chaîne' (paragraphes séparés par une ligne vide)
//       | [ 'paragraphe', { si, texte }, { unParmi: [{ si, texte }, …, { texte }] } ]

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const NBSP = ' ';

// Typographie française appliquée au rendu : apostrophe courbe, espaces
// insécables avant ; : ! ? » et après «.
export function typographie(s) {
  return String(s)
    .replace(/'/g, '’')
    .replace(/ ([;:!?»])/g, NBSP + '$1')
    .replace(/« /g, '«' + NBSP)
    .replace(/«(?=[^\s ])/g, '«' + NBSP)
    .replace(/([^\s ])»/g, '$1' + NBSP + '»');
}

// Liste des paragraphes bruts retenus (conditions évaluées par `cond(src)`)
export function paragraphes(texte, cond = () => true) {
  const out = [];
  const pousser = s => {
    for (const p of String(s).split(/\n[ \t]*\n/)) {
      const t = p.replace(/\s*\n\s*/g, ' ').trim();
      if (t) out.push(t);
    }
  };
  const visiter = t => {
    if (t === undefined || t === null) return;
    if (typeof t === 'string') { pousser(t); return; }
    if (Array.isArray(t)) { t.forEach(visiter); return; }
    if (typeof t === 'object') {
      if (Array.isArray(t.unParmi)) {
        const v = t.unParmi.find(x => x && (x.si === undefined || cond(x.si)));
        if (v) visiter(v.texte);
        return;
      }
      if (t.si === undefined || cond(t.si)) visiter(t.texte);
    }
  };
  visiter(texte);
  return out;
}

// Accord neutre à partir de deux formes : prêt/prête → « prêt·e », il/elle → « il/elle »
function neutre(m, f) {
  if (f.startsWith(m) && f.length > m.length) return m + '·' + f.slice(m.length);
  return `${m}/${f}`;
}

// Pronoms d'une personne : 'il' | 'elle' | autre (neutre)
const genreDe = p => (p?.pronoms === 'il' || p?.pronoms === 'elle') ? p.pronoms : 'neutre';

// Résout un gabarit {…} en texte brut. env.gabarit(nom) renvoie une chaîne, une
// personne { nom, pronoms } ou null.
export function resoudreGabarit(inner, env = {}) {
  const get = nom => (env.gabarit ? env.gabarit(nom) : null);
  const parts = inner.split('|').map(s => s.trim());
  const head = parts[0];
  if (parts.length >= 3) {
    // {acteur|il|elle} ou {acteur|il|elle|iel} : accord selon les pronoms
    const p = get(head);
    const g = genreDe(p && typeof p === 'object' ? p : null);
    if (g === 'il') return parts[1];
    if (g === 'elle') return parts[2];
    return parts[3] ?? neutre(parts[1], parts[2]);
  }
  if (/\.e$/.test(head) && head !== 'e') {
    // {acteur.e} : « e » si elle, rien si il, « ·e » sinon
    const p = get(head.slice(0, -2));
    if (p && typeof p === 'object') {
      const g = genreDe(p);
      return g === 'elle' ? 'e' : g === 'il' ? '' : '·e';
    }
  }
  const v = get(head);
  if (v === null || v === undefined) return env.inconnu ? env.inconnu(head) : `{${inner}}`;
  if (typeof v === 'object') return String(v.nom ?? '');
  return String(v);
}

// Gabarits présents dans un texte brut (pour le validateur)
export function gabaritsDe(s) {
  return [...String(s).matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
}

// Mise en forme d'un paragraphe déjà typographié : échappement, **gras**, *italique*
const emphase = s => escHTML(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');
const sansEmphase = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

// Rend un paragraphe : gabarits, typographie, échappement, **gras**, *italique*.
// `source` garde les marques * et les gabarits résolus : c'est la forme à stocker
// dans une sauvegarde (aucun HTML), convertie plus tard par htmlDepuisSource().
function rendreParagraphe(p, env) {
  const valeurs = [];
  const avecJetons = p.replace(/\{([^{}]+)\}/g, (_, inner) => {
    valeurs.push(resoudreGabarit(inner, env));
    return `\u0000${valeurs.length - 1}\u0000`;
  });
  const typo = typographie(avecJetons);
  const html = emphase(typo).replace(/\u0000(\d+)\u0000/g, (_, n) => escHTML(valeurs[n]));
  const brut = sansEmphase(typo).replace(/\u0000(\d+)\u0000/g, (_, n) => valeurs[n]);
  const source = typo.replace(/\u0000(\d+)\u0000/g, (_, n) => valeurs[n]);
  return { html, brut, source };
}

// HTML de paragraphes `source` (rendus plus tôt et conservés en texte simple)
export function htmlDepuisSource(paras) {
  return [].concat(paras || []).filter(Boolean).map(p => `<p>${emphase(String(p))}</p>`).join('');
}

// Rend un texte complet. env : { condition(src) → bool, gabarit(nom) → … }.
// Renvoie { html: '<p>…</p><p>…</p>', brut: 'texte\n\ntexte', paragraphes: [{ html, brut, source }] }.
export function rendreTexte(texte, env = {}) {
  const cond = env.condition || (() => true);
  const ps = paragraphes(texte, cond).map(p => rendreParagraphe(p, env));
  return {
    paragraphes: ps,
    html: ps.map(p => `<p>${p.html}</p>`).join(''),
    brut: ps.map(p => p.brut).join('\n\n'),
  };
}

// ============================================================
//   EFFETS
// ============================================================
export const ISSUES = ['aller', 'finEpisode', 'fin', 'retraite', 'rentrer', 'combat'];

// Forme canonique d'un effet : { type, ...paramètres }
export function normaliserEffet(e) {
  const type = Object.keys(e || {})[0];
  const v = e?.[type];
  switch (type) {
    case 'moral':
      return typeof v === 'number' ? { type, cible: 'equipe', valeur: v } : { type, cible: v.cible || 'equipe', valeur: v.valeur };
    case 'objet':
      return typeof v === 'string' ? { type, id: v, n: 1 } : { type, id: v.id, n: v.n || 1 };
    case 'reputation':
      return typeof v === 'number' ? { type, faction: null, delta: v } : { type, faction: v.faction || null, delta: v.delta };
    case 'schema':
      return { type, origines: v === 'auto' ? 'auto' : [].concat(v) };
    case 'statut':
      return { type, cible: v.cible || 'equipe_hasard', id: v.id };
    case 'combat':
      return {
        type, ennemis: [...(v.ennemis || [])], butin: { ...(v.butin || {}) },
        victoire: v.victoire || [], defaite: v.defaite || [{ retraite: true }],
      };
    case 'gain': case 'perte': case 'drapeau': case 'monde':
      return { type, valeurs: { ...v } };
    default:
      return { type, valeur: v };
  }
}

// Dernier effet d'une liste s'il s'agit d'une issue ; sinon null (issue implicite)
export function issueDe(liste) {
  const last = Array.isArray(liste) && liste.length ? liste[liste.length - 1] : null;
  const k = last && Object.keys(last)[0];
  return k && ISSUES.includes(k) ? normaliserEffet(last) : null;
}

const INCREMENT = /^[+-]\d+$/;
// Applique { drapeau: {...} } sur un objet de drapeaux : '+1'/'-2' incrémentent
// (drapeaux numériques), toute autre valeur remplace.
export function appliquerDrapeaux(flags, changes) {
  for (const [k, v] of Object.entries(changes || {})) {
    if (typeof v === 'string' && INCREMENT.test(v)) flags[k] = (Number(flags[k]) || 0) + parseInt(v, 10);
    else flags[k] = v;
  }
  return flags;
}
export const estIncrement = v => typeof v === 'string' && INCREMENT.test(v);

// ============================================================
//   CHOIX — visibilité, disponibilité, raison, chance, acteur
// ============================================================
// env : {
//   lire(id) → valeur d'un identifiant,
//   equipe : [{ id, nom, pronoms, competences:{}, caracs:{}, traits:[] }] (vivants),
//   objetEmbarque(id) → nombre,  peutPayer(cout) → [ressources manquantes],
//   nom(genre, id) → libellé d'un objet / trait / module / tech
// }

const accord = (genre, m, f) => (genre === 'f' ? f : genre === 'mp' ? m + 's' : m);

// Bonus de test d'un colon : caractéristique → (valeur − 5) / 2 arrondi en dessous ;
// compétence → son niveau (0 à 5).
export function bonusTest(colon, test) {
  if (test.carac) return Math.floor(((colon?.caracs?.[test.carac] ?? 5) - 5) / 2);
  return colon?.competences?.[test.competence] ?? 0;
}

// Meilleur colon pour un test (le premier en cas d'égalité)
export function meilleurPourTest(equipe, test) {
  let best = null, bonus = -Infinity;
  for (const m of equipe || []) {
    const b = bonusTest(m, test);
    if (b > bonus) { best = m; bonus = b; }
  }
  return { colon: best, bonus: best ? bonus : 0 };
}

// Probabilité de réussite d'un jet 1d10 + bonus ≥ difficulté
export function chanceDe(difficulte, bonus) {
  const seuil = difficulte - bonus;            // il faut faire au moins `seuil` au dé
  return Math.max(0, Math.min(1, (11 - seuil) / 10));
}

export function libelleTest(test) {
  return test.carac ? (CARACS[test.carac]?.nom || test.carac) : (COMPETENCES[test.competence]?.nom || test.competence);
}

// Lance le test : rng() ∈ [0, 1) fourni par l'appelant (seedé)
export function lancerTest(test, equipe, rng) {
  const { colon, bonus } = meilleurPourTest(equipe, test);
  const jet = 1 + Math.floor(rng() * 10);
  const total = jet + bonus;
  return {
    libelle: libelleTest(test), carac: test.carac || null, competence: test.competence || null,
    colon, jet, bonus, total, difficulte: test.difficulte, reussite: total >= test.difficulte,
    chance: chanceDe(test.difficulte, bonus),
  };
}

// Conjonction de premier niveau d'une expression (a && b && c → [a, b, c])
function conjoints(n) {
  if (n.k === 'op' && n.op === '&&') return [...conjoints(n.a), ...conjoints(n.b)];
  return [n];
}

// Description lisible d'une condition atomique (ou null si inconnue)
function decrireAtome(n, env) {
  const nom = (g, id) => (env.nom ? env.nom(g, id) : id) || id;
  // equipe.objet.x / equipe.trait.x (présence)
  const ident = n.k === 'id' ? n.v : (n.k === 'op' && n.a?.k === 'id' && n.b?.k === 'lit' ? n.a.v : null);
  if (!ident) return null;
  const val = n.k === 'id' ? null : n.b.v;
  const op = n.k === 'id' ? null : n.op;
  let m;
  if ((m = /^equipe\.objet\.(\w+)$/.exec(ident)) && (op === null || (op === '>=' && val <= 1) || (op === '>' && val === 0))) {
    return { texte: `Nécessite : ${nom('objet', m[1])}` };
  }
  if ((m = /^equipe\.trait\.(\w+)$/.exec(ident)) && (op === null || (op === '==' && val === true))) {
    return { texte: `Trait requis dans l'équipe : ${nom('trait', m[1])}`, trait: m[1] };
  }
  const seuil = op === '>=' ? val : op === '>' ? val + 1 : null;
  if (seuil === null || typeof val !== 'number') return null;
  if ((m = /^equipe\.carac\.(\w+)$/.exec(ident)) && CARACS[m[1]]) {
    const c = CARACS[m[1]];
    return { texte: `${c.nom} ${seuil} ${accord(c.genre, 'requis', 'requise')} dans l'équipe`, carac: m[1] };
  }
  if ((m = /^equipe\.(\w+)$/.exec(ident)) && COMPETENCES[m[1]]) {
    const c = COMPETENCES[m[1]];
    return { texte: `${c.nom} ${seuil} ${accord(c.genre, 'requis', 'requise')} dans l'équipe`, competence: m[1] };
  }
  if ((m = /^colonie\.res\.(\w+)$/.exec(ident)) && RESSOURCES[m[1]]) {
    const r = RESSOURCES[m[1]];
    return { texte: `${r.nom} ${seuil} ${accord(r.genre, 'requis', 'requise')} en réserve` };
  }
  if ((m = /^colonie\.module\.(\w+)$/.exec(ident))) {
    return { texte: `${nom('module', m[1])} niveau ${seuil} requis` };
  }
  if ((m = /^colonie\.colons$/.exec(ident))) return { texte: `${seuil} colons requis` };
  return null;
}

// Raison lisible pour une condition `requiert` fausse (seuls les termes faux sont cités)
export function raisonRequiert(src, env) {
  const ast = compiler(src);
  const lire = env.lire || (() => undefined);
  const raisons = [];
  for (const c of conjoints(ast)) {
    if (vrai(evaluerNoeud(c, lire))) continue;
    if (c.k === 'op' && c.op === '||') {
      const alts = [];
      const visit = x => { if (x.k === 'op' && x.op === '||') { visit(x.a); visit(x.b); } else alts.push(decrireAtome(x, env)); };
      visit(c);
      if (alts.every(Boolean)) { raisons.push(alts.map(a => a.texte).join(', ou ')); continue; }
    }
    const d = decrireAtome(c, env);
    raisons.push(d ? d.texte : 'Conditions non remplies');
  }
  return [...new Set(raisons)].join(' · ') || 'Conditions non remplies';
}

// Colon qui agit d'après une condition `requiert` (le meilleur sur la compétence / caractéristique citée)
function acteurDeRequiert(src, env) {
  let ast;
  try { ast = compiler(src); } catch { return null; }
  for (const c of conjoints(ast)) {
    const d = decrireAtome(c, env);
    if (!d) continue;
    const eq = env.equipe || [];
    if (d.competence) return [...eq].sort((a, b) => (b.competences?.[d.competence] || 0) - (a.competences?.[d.competence] || 0))[0] || null;
    if (d.carac) return [...eq].sort((a, b) => (b.caracs?.[d.carac] ?? 5) - (a.caracs?.[d.carac] ?? 5))[0] || null;
    if (d.trait) return eq.find(m => (m.traits || []).includes(d.trait)) || null;
  }
  return null;
}

// Analyse un choix pour l'affichage. Renvoie :
// { visible, disponible, raison, chance (0-1 | null), acteur (colon | null), test (libellé, difficulté) }
export function analyserChoix(choix, env) {
  const lire = env.lire || (() => undefined);
  const out = { visible: true, disponible: true, raison: null, chance: null, acteur: null, test: null };
  if (choix.si !== undefined && !condition(choix.si, lire)) {
    return { ...out, visible: false, disponible: false, raison: '' };
  }
  const raisons = [];
  if (!(env.equipe || []).length && env.equipeRequise !== false) raisons.push('Équipage indisponible');
  if (choix.requiert !== undefined && !condition(choix.requiert, lire)) {
    raisons.push(choix.raison || raisonRequiert(choix.requiert, env));
  }
  if (choix.consomme) {
    const ids = [].concat(choix.consomme);
    for (const id of ids) if (!((env.objetEmbarque ? env.objetEmbarque(id) : 0) > 0)) raisons.push(`Nécessite : ${(env.nom && env.nom('objet', id)) || id}`);
  }
  if (choix.cout) {
    const manque = env.peutPayer ? env.peutPayer(choix.cout) : [];
    for (const r of manque) raisons.push(`Manque ${RESSOURCES[r]?.nom || r} (${choix.cout[r]})`);
  }
  if (raisons.length) { out.disponible = false; out.raison = raisons.join(' · '); }
  if (choix.test) {
    const { colon, bonus } = meilleurPourTest(env.equipe, choix.test);
    out.chance = chanceDe(choix.test.difficulte, bonus);
    out.acteur = colon;
    out.test = { libelle: libelleTest(choix.test), difficulte: choix.test.difficulte, carac: choix.test.carac || null, competence: choix.test.competence || null };
  } else if (choix.requiert !== undefined) {
    out.acteur = acteurDeRequiert(choix.requiert, env);
  }
  return out;
}

// Branche d'effets jouée par un choix (après un éventuel test déjà lancé)
export function brancheDe(choix, jet) {
  if (choix.test) return (jet && jet.reussite ? choix.test.reussite : choix.test.echec) || [];
  return choix.effets || [];
}
