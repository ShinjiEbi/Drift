// views/common.js — outils partagés par les vues de l'interface.
// Ce module n'importe pas ui.js : les vues peuvent s'en servir sans cycle.
//
//  - setHTML()      : mise à jour du DOM sur place (morph) ;
//  - safeHTML()     : HTML produit par le jeu filtré par liste blanche ;
//  - formats        : durées réelles, taux par heure, horodatage « Jour N » ;
//  - etaTicks()     : temps restant réel d'une activité dont la vitesse varie ;
//  - App            : accès tolérant aux fonctions d'app.js (contrats V1).

import { esc, fmt, fmtDuree } from '../util.js';
import { VESSELS } from '../catalog.js';
import { S } from '../state.js';
import * as App from '../app.js';

export { App, esc, fmt, fmtDuree };

// Appelle une fonction d'app.js si elle existe (contrats V1 en cours de
// construction) ; sinon renvoie `fallback`. Une exception est journalisée
// une fois et traitée comme une absence.
const _appErrors = new Set();
export function appCall(name, args = [], fallback = undefined) {
  const fn = App[name];
  if (typeof fn !== 'function') return fallback;
  try {
    return fn(...args);
  } catch (err) {
    if (!_appErrors.has(name)) { _appErrors.add(name); console.error(`[ui] App.${name} :`, err); }
    return fallback;
  }
}
export const hasApp = name => typeof App[name] === 'function';

// ---- Typographie française ----
// Espace insécable avant « ; : ! ? » et à l'intérieur des guillemets : le
// signe ne part jamais seul à la ligne. Appliquée à tout le HTML des vues
// (aucun attribut du jeu ne contient d'espace avant ces signes).
export const typo = s => String(s ?? '')
  .replace(/ ([:;!?»])/g, ' $1')
  .replace(/« /g, '« ');

// ---- Mise à jour du DOM sur place ----
const _lastHTML = new WeakMap();
// Remplace le contenu de el par html, sans rien recréer si rien n'a changé
// et en conservant les nœuds existants quand seule une partie a changé.
export function setHTML(el, html) {
  if (!el) return;
  html = typo(html);
  if (_lastHTML.get(el) === html) return;
  _lastHTML.set(el, html);
  if (!el.firstChild) { el.innerHTML = html; return; }
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(el, tpl.content);
}
function morphChildren(cur, next) {
  const curKids = Array.from(cur.childNodes);
  const nextKids = Array.from(next.childNodes);
  for (let i = 0; i < nextKids.length; i++) {
    const nk = nextKids[i];
    const ck = curKids[i];
    if (!ck) { cur.appendChild(nk); continue; }
    if (ck.nodeType !== nk.nodeType || ck.nodeName !== nk.nodeName ||
        (ck.nodeType === 1 && ck.getAttribute('data-id') !== nk.getAttribute('data-id'))) {
      // Nature différente, ou autre objet (data-id) : on remplace le nœud
      cur.replaceChild(nk, ck);
      continue;
    }
    if (ck.nodeType === 1) {
      morphAttrs(ck, nk);
      morphChildren(ck, nk);
    } else if (ck.nodeValue !== nk.nodeValue) {
      ck.nodeValue = nk.nodeValue;
    }
  }
  for (let i = nextKids.length; i < curKids.length; i++) curKids[i].remove();
}
function morphAttrs(cur, next) {
  for (const { name, value } of Array.from(next.attributes)) {
    if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
  }
  for (const { name } of Array.from(cur.attributes)) {
    if (!next.hasAttribute(name)) cur.removeAttribute(name);
  }
}

// ---- HTML produit par le jeu (journal, logs d'expédition et de combat) ----
// Ces textes contiennent volontairement du HTML (<em>…) et ne sont donc pas
// échappés ; mais ils incluent des noms venus de la sauvegarde. On ne garde
// que quelques balises de mise en forme, sans attribut autre que class.
const SAFE_TAGS = new Set(['EM', 'STRONG', 'B', 'I', 'U', 'BR', 'SPAN', 'SMALL', 'SUB', 'SUP']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH',
  'IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'SOURCE', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
const _safeCache = new Map();
export function safeHTML(html) {
  html = String(html ?? '');
  if (!html.includes('<')) return html;
  const hit = _safeCache.get(html);
  if (hit !== undefined) return hit;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  cleanNode(tpl.content);
  const out = tpl.innerHTML;
  if (_safeCache.size > 1000) _safeCache.clear();
  _safeCache.set(html, out);
  return out;
}
function cleanNode(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      const tag = child.nodeName.toUpperCase();
      if (DROP_TAGS.has(tag)) { child.remove(); continue; }
      cleanNode(child);
      if (!SAFE_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const a of Array.from(child.attributes)) if (a.name !== 'class') child.removeAttribute(a.name);
    } else if (child.nodeType !== 3) {
      child.remove();   // commentaires, instructions…
    }
  }
}
// Texte brut d'un fragment HTML du jeu (pour un aria-label, un résumé…)
export function plainText(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---- Accès tolérants aux données inattendues (sauvegarde ancienne ou modifiée) ----
// Nom d'une entrée de catalogue, déjà échappé ; à défaut la clé elle-même.
export const nomOf = (table, key) => esc(table?.[key]?.nom ?? key ?? '?');
// Définition de vaisseau, avec des valeurs neutres si le type est inconnu
export const vesselDef = type => VESSELS[type] || { nom: String(type ?? '?'), flavor: '', places: 0, cargo: 0, speed: 1, fuelPerPc: 0, equipSlots: 0 };

// ---- Temps : 1 tick = 1 seconde réelle (docs/V1.md) ----
export const TICKS_PER_HOUR = 3600;
export const TICKS_PER_DAY = 86400;

// Calendrier : jours réels depuis la fondation. App.calendarOf(gameMin) est
// utilisé s'il existe (forme tolérée : { jour|day, heure|h, minute|m }).
export function calendar(gm) {
  const t = Math.max(0, Number(gm) || 0);
  const c = appCall('calendarOf', [t], null);
  if (c && typeof c === 'object') {
    const jour = c.jour ?? c.day;
    const h = c.heure ?? c.heures ?? c.h ?? c.hour;
    const m = c.minute ?? c.minutes ?? c.m ?? c.min;
    if (Number.isFinite(jour) && Number.isFinite(h) && Number.isFinite(m)) return { jour, h, m };
  }
  return {
    jour: Math.floor(t / TICKS_PER_DAY) + 1,
    h: Math.floor((t % TICKS_PER_DAY) / 3600),
    m: Math.floor((t % 3600) / 60),
  };
}
export const pad2 = n => String(n).padStart(2, '0');
// « Jour 3 · 14:05 » (journal, historiques)
export function stamp(gm) {
  const c = calendar(gm);
  return `Jour ${c.jour} · ${pad2(c.h)}:${pad2(c.m)}`;
}
export const dayOf = gm => calendar(gm).jour;

// Taux par tick → texte par heure réelle : « +1 240/h », « −36/h », « 0/h »
export function fmtRate(perTick, { sign = true } = {}) {
  const h = (Number(perTick) || 0) * TICKS_PER_HOUR;
  const a = Math.abs(h);
  let txt;
  if (a >= 10000) txt = Math.round(a / 1000) + ' k';
  else if (a >= 100) txt = Math.round(a).toLocaleString('fr-FR').replace(/ |\s/g, ' ');
  else if (a >= 10) txt = String(Math.round(a));
  else txt = (Math.round(a * 10) / 10).toString().replace('.', ',');
  if (a < 0.05) return '0/h';
  return (sign ? (h > 0 ? '+' : '−') : (h < 0 ? '−' : '')) + txt + '/h';
}

// ---- Temps restant réel d'une activité ----
// La vitesse de certaines activités (recherche, fabrication) dépend du
// personnel : on mesure la progression entre deux rendus. `rate0` est la
// vitesse supposée (avancement par tick) avant la première mesure.
const _rates = new Map();
export function etaTicks(key, done, total, rate0 = 1) {
  done = Number(done) || 0;
  total = Number(total) || 0;
  const gm = S?.meta?.gameMin || 0;
  let r = _rates.get(key);
  if (!r) {
    r = { done, gm, rate: rate0 > 0 ? rate0 : 1 };
    _rates.set(key, r);
    if (_rates.size > 200) _rates.delete(_rates.keys().next().value);
  } else if (gm > r.gm) {
    const obs = (done - r.done) / (gm - r.gm);
    if (obs > 0) r.rate = obs;
    r.done = done;
    r.gm = gm;
  }
  return Math.max(0, total - done) / Math.max(1e-6, r.rate);
}

// ---- Fragments HTML ----
// Barre de progression (pct 0-100) avec libellé
export function progressHTML(pct, label, cls = '') {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="pbar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"${label ? ` aria-valuetext="${esc(label)}"` : ''}>
    <div class="pbar-fill" style="width:${p.toFixed(1)}%"></div>
    ${label ? `<div class="pbar-lbl">${esc(label)}</div>` : ''}
  </div>`;
}
// État vide avec une action (bouton de navigation data-goto)
export function emptyState(text, action = null) {
  return `<div class="empty-state">
    <p>${text}</p>
    ${action ? `<button type="button" class="cta-btn ghost" data-goto="${esc(action.goto)}"${action.cible ? ` data-cible="${esc(action.cible)}"` : ''}>${esc(action.label)}</button>` : ''}
  </div>`;
}
// Chips de filtre (role=radiogroup) ; data-filter="<groupe>:<valeur>"
export function filterChips(group, options, current, counts = {}) {
  return `<div class="filters" role="radiogroup" aria-label="Filtrer">${options.map(([key, label]) => {
    const on = key === current;
    const n = counts[key];
    return `<button type="button" class="chip${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-filter="${esc(group)}:${esc(key)}">${esc(label)}${n !== undefined ? ` <span class="chip-n">${esc(n)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

// ---- Petites préférences d'affichage par appareil (localStorage) ----
// Filtres, cartes dépliées… : jamais d'état de jeu ici.
const UI_KEY = 'drift_ui_view';
let _uiState = null;
function uiState() {
  if (_uiState) return _uiState;
  try { _uiState = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { _uiState = {}; }
  if (typeof _uiState !== 'object' || Array.isArray(_uiState)) _uiState = {};
  return _uiState;
}
export function getFilter(group, def) {
  const v = uiState()['f_' + group];
  return typeof v === 'string' ? v : def;
}
export function setFilter(group, value) {
  uiState()['f_' + group] = String(value);
  try { localStorage.setItem(UI_KEY, JSON.stringify(_uiState)); } catch { /* stockage indisponible */ }
}
// Cartes dépliées (non mémorisées entre deux lancements)
const _open = new Set();
export const isOpen = key => _open.has(key);
export function toggleOpen(key) {
  if (_open.has(key)) _open.delete(key); else _open.add(key);
  return _open.has(key);
}
export function setOpen(key, on) {
  if (on) _open.add(key); else _open.delete(key);
}

// Accord en genre si la donnée existe (pronoms ajoutés par le moteur narratif),
// sinon formulation neutre fournie par l'appelant.
export function genreOf(m) {
  const g = m?.genre ?? m?.gender ?? m?.pronoms?.genre ?? m?.pronoms?.sujet ?? m?.pronom;
  if (typeof g !== 'string') return null;
  const s = g.toLowerCase();
  if (s === 'f' || s === 'elle' || s.startsWith('fem') || s.startsWith('fém')) return 'f';
  if (s === 'm' || s === 'il' || s.startsWith('masc') || s === 'h') return 'm';
  return null;
}
export function accord(m, masc, fem, neutre) {
  const g = genreOf(m);
  return g === 'f' ? fem : g === 'm' ? masc : neutre;
}

// Pluriel simple : plur(2, 'colon') → « 2 colons »
export const plur = (n, sing, pl = sing + 's') => `${n} ${Math.abs(n) > 1 ? pl : sing}`;

// État d'un fil rouge (arc) : App.getArcState si présent, sinon lecture directe
export function arcState(id) {
  const st = appCall('getArcState', [id], null);
  return (st && typeof st === 'object') ? st : (S?.arcs?.[id] || { unlocked: false, completedSteps: [], rewardClaimed: false });
}
