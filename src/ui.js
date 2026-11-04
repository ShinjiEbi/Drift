// ui.js — coquille de l'interface : rendu, navigation (5 onglets), en-tête,
// alertes, retours à l'écran (toasts), menu « ⋯ » et réglages, fenêtres
// (modale, confirmation, accueil), écran de scène et de combat.
//
// Les vues sont dans src/views/ (un fichier par onglet) :
//   base.js         tableau de bord « À faire », construction, postes
//   equipage.js     personnel, recrutement, formation, soins
//   expeditions.js  missions, carte, vaisseaux, diplomatie
//   recits.js       chroniques, fils rouges, journal, archives, annales
//   labo.js         recherche, atelier, inventaire, schémas
//   common.js       outils partagés (setHTML, formats, accès tolérant à app.js)

import { $, $$, fmt, fmtDuree, esc } from './util.js';
import { VERSION, RES_LABELS, RESOURCES, SKILL_LIST, SKILL_LABELS, STAT_LABELS } from './constants.js';
import { MODULES, ITEMS, ITEM_ORIGINS, TECH_TREE, FABRICATIONS, BIOMES, TRAITS } from './catalog.js';
import {
  getNotifPermission, requestNotifPermission, isPushEnabled, setPushEnabled,
} from './notifications.js';
import {
  S, capOf, crewUsage, bodyThreatLevel, bodyRewardLevel, BODY_TYPES, isCatchingUp,
} from './state.js';
// Imports croisés depuis app.js — résolus au runtime grâce aux live bindings
import {
  memberAssignment, jobsForModule, itemDef,
  canLaunchExpedition, launchExpedition, abandonExpedition,
  playChoice, currentScene, evaluateChoice, fillTemplate,
  activeChronicle, currentChronicleEpisode,
  combatAllyAction, combatEndTurn, pumpDecisions,
} from './app.js';
import {
  setHTML, safeHTML, nomOf, vesselDef, calendar, pad2,
  toggleOpen, setFilter, typo,
} from './views/common.js';
import * as Base from './views/base.js';
import * as Equipage from './views/equipage.js';
import * as Expe from './views/expeditions.js';
import * as Recits from './views/recits.js';
import * as Labo from './views/labo.js';

export { showTrainingModal } from './views/equipage.js';
export { setHTML, safeHTML };


// ============================================================
//   RENDU — seule la vue visible est reconstruite
// ============================================================
// render() est appelée à chaque tick (1 s) et après chaque action de jeu.
// Elle met à jour l'en-tête (horloge, ressources, alertes), les badges et
// les retours à l'écran (toasts), puis UNIQUEMENT la vue active (onglet +
// sous-onglet). Les vues cachées sont rendues quand on les affiche.
// Chaque sous-rendu est isolé par guard() : une exception dans une vue
// n'empêche plus les autres de se mettre à jour.
// Les conteneurs sont mis à jour par setHTML() : si le HTML n'a pas changé on
// ne touche à rien, sinon on corrige le DOM existant sur place (morph) — les
// clics, le focus et les animations survivent au tick. Corollaire : aucun
// écouteur n'est attaché aux éléments produits par les vues, tout passe par
// la délégation (VIEW_ACTIONS).

// Onglet → sous-onglet → fonctions de rendu
const VIEWS = {
  base:        { afaire: [Base.renderDashboard], construction: [Base.renderConstruction], postes: [Base.renderAssignments] },
  equipage:    { personnel: [Equipage.renderCrew], recrutement: [Equipage.renderRecruit], formation: [Equipage.renderFormation], soins: [Equipage.renderSoins] },
  expeditions: { missions: [Expe.renderExpeditions], carte: [Expe.renderGalaxy], vaisseaux: [Expe.renderFleet], diplomatie: [Expe.renderDiplomacy] },
  recits:      { chroniques: [Recits.renderChronicles], filsrouges: [Recits.renderArcs], journal: [Recits.renderJournal], archives: [Recits.renderArchives], annales: [Recits.renderAnnales] },
  labo:        { recherche: [Labo.renderResearch], atelier: [Labo.renderWorkshop], inventaire: [Labo.renderInventory], bibliotheque: [Labo.renderLibrary] },
};
export const TABS = Object.keys(VIEWS);
const DEFAULT_SUB = { base: 'afaire', equipage: 'personnel', expeditions: 'missions', recits: 'chroniques', labo: 'recherche' };

// Anciens noms d'onglets (≤ 0.33 : liens ?tab=, notifications, onglet
// mémorisé) → nouvel emplacement.
export const LEGACY_TABS = {
  overview: { tab: 'base', sub: 'afaire' },
  modules:  { tab: 'base', sub: 'construction' },
  crew:     { tab: 'equipage' },
  galaxy:   { tab: 'expeditions' },
  stocks:   { tab: 'labo' },
  arcs:     { tab: 'recits', sub: 'filsrouges' },
  journal:  { tab: 'recits', sub: 'journal' },
};
// Anciens sous-onglets → nouveaux (par ancien onglet)
export const LEGACY_SUBS = {
  modules: { construction: 'construction', assignments: 'postes' },
  crew:    { personnel: 'personnel', recruit: 'recrutement', formation: 'formation', soins: 'soins' },
  galaxy:  { cartographie: 'carte', fleet: 'vaisseaux', expeditions: 'missions', diplomatie: 'diplomatie' },
  stocks:  { inventory: 'inventaire', library: 'bibliotheque', research: 'recherche', workshop: 'atelier' },
};

const NAV_KEY = 'drift_ui_nav';
const _nav = { tab: 'base', sub: { ...DEFAULT_SUB } };
let _navRestored = false;
let _renderPending = false;
// ?tab=… lu dès le chargement : pwa.js nettoie l'URL au bout de 500 ms
const _initialTabParam = (() => {
  try { return new URLSearchParams(location.search).get('tab'); } catch { return null; }
})();

export function render() {
  if (!S) return;
  // Onglet en arrière-plan : on ne calcule rien, on rendra au retour.
  if (document.hidden) { _renderPending = true; return; }
  _renderPending = false;
  guard('renderHeader', renderHeader);
  guard('renderBadges', renderBadges);
  if (!_navRestored) {
    _navRestored = true;
    restoreNav();
    if (_initialTabParam) navigateTo(_initialTabParam);
    // Le bouton des notifications a pu être initialisé avant le chargement de
    // la partie (S encore nul) : on le remet d'aplomb au premier rendu.
    guard('refreshPushButton', refreshPushButton);
    guard('welcome', () => maybeWelcome());
  }
  guard('feedback', detectChanges);
  renderActiveView();
}

// Rend la vue visible (et seulement elle)
function renderActiveView() {
  if (!S) return;
  const tab = VIEWS[_nav.tab] ? _nav.tab : 'base';
  const subs = VIEWS[tab];
  const sub = subs[_nav.sub[tab]] ? _nav.sub[tab] : DEFAULT_SUB[tab];
  for (const fn of subs[sub]) guard(fn.name, fn, '#subview-' + sub);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _renderPending) render();
  });
}

// ---- Isolation des erreurs de rendu ----
const _loggedRenderErrors = new Set();
function guard(name, fn, hostSel) {
  try {
    fn();
    if (hostSel) clearRenderError(hostSel, name);
  } catch (err) {
    // Journalise une seule fois par vue et par message (pas à chaque tick)
    const key = name + '|' + (err && err.message);
    if (!_loggedRenderErrors.has(key)) {
      _loggedRenderErrors.add(key);
      console.error(`[render] ${name} :`, err);
    }
    if (hostSel) showRenderError(hostSel, name);
  }
}
function showRenderError(hostSel, name) {
  const host = $(hostSel);
  if (!host || host.querySelector(`:scope > .render-error[data-view="${name}"]`)) return;
  const box = document.createElement('div');
  box.className = 'render-error';
  box.dataset.view = name;
  box.setAttribute('role', 'alert');
  box.textContent = "Cette section n'a pas pu s'afficher (erreur interne, détails dans la console). Le reste du jeu continue de tourner.";
  host.prepend(box);
}
function clearRenderError(hostSel, name) {
  $(hostSel)?.querySelector(`:scope > .render-error[data-view="${name}"]`)?.remove();
}

// ============================================================
//   BADGES
// ============================================================
function setBadge(sel, n) {
  const b = $(sel);
  if (!b) return;
  if (n > 0) {
    const txt = String(n);
    if (b.textContent !== txt) b.textContent = txt;
    b.classList.add('show');
  } else {
    b.classList.remove('show');
  }
}
function renderBadges() {
  // Base : décisions en attente ; Postes : postes vacants pourvoyables
  const nDec = Array.isArray(S.pendingDecisions) ? S.pendingDecisions.length : 0;
  setBadge('#baseBadge', nDec);
  setBadge('#afaireBadge', nDec);
  setBadge('#postesBadge', Base.postesBadgeCount());
  // Équipage : candidats ; Soins : blessés graves sans soin
  const nCand = (S.candidates || []).length;
  const nWounded = Base.woundedUntreated().length;
  setBadge('#equipageBadge', nCand + nWounded);
  setBadge('#recrutementBadge', nCand);
  setBadge('#soinsBadge', nWounded);
  setBadge('#formationBadge', (S.training || []).length);
  // Expéditions : expéditions qui ATTENDENT une décision (pas celles en cours)
  const nWait = Base.awaitingExpeditions().length;
  setBadge('#expeditionsBadge', nWait);
  const mb = $('#missionsBadge');
  if (mb) {
    // Sous-onglet Missions : attente en ambre, sinon nombre en cours en discret
    const nExp = (S.expeditions || []).length;
    mb.classList.toggle('count', nWait === 0);
    setBadge('#missionsBadge', nWait || nExp);
  }
  setBadge('#diploBadge', (S.diplomaticMissions || []).length);
  // Récits : chroniques dont la suite est prête
  const nReady = Base.chroniclesList().filter(c => c.etat === 'prete').length;
  setBadge('#recitsBadge', nReady);
  setBadge('#chroniquesBadge', nReady);
  // Labo : activités en cours (discret), schémas connus
  setBadge('#rechercheBadge', (S.research || []).length);
  setBadge('#atelierBadge', (S.fabrication || []).length);
  setBadge('#libBadge', Object.keys(S.discoveries || {}).length);
}

// ============================================================
//   EN-TÊTE
// ============================================================
function renderHeader() {
  const name = S.meta.colonyName;
  const cn = $('#colonyName');
  if (cn.textContent !== name) cn.textContent = name;
  // « Jour N · hh:mm » : jours réels depuis la fondation. Le « our » est
  // ajouté en CSS (.jday::after) : le texte reste « J1 · 00:03 ».
  const c = calendar(S.meta.gameMin);
  setHTML($('#gameTime'), `<span class="jday">J</span>${c.jour} · ${pad2(c.h)}:${pad2(c.m)}`);
  const gt = $('#gameTime');
  const label = `Jour ${c.jour}, ${pad2(c.h)} h ${pad2(c.m)} depuis la fondation`;
  if (gt.getAttribute('aria-label') !== label) gt.setAttribute('aria-label', label);
  // Durée de la session : affichée dans « À propos » (menu ⋯), plus dans l'en-tête
  const sess = Math.floor((S.meta.sessionMs || 0) / 1000);
  const rt = $('#realTime');
  const sessTxt = `session ${Math.floor(sess / 60)}:${String(sess % 60).padStart(2, '0')}`;
  if (rt && rt.textContent !== sessTxt) rt.textContent = sessTxt;
  renderResBar();
  renderAlertBar();
}

// Bandeau ressources persistant (visible sur tous les onglets)
const RB_IDS = { metal: 'rbMetal', cristal: 'rbCristal', energie: 'rbEnergie', biomasse: 'rbBiomasse', datacubes: 'rbDatacubes' };
function renderResBar() {
  for (const k of RESOURCES) {
    const cell = $(`[data-res="${k}"]`);
    const val = $(`#${RB_IDS[k]}`);
    if (!cell || !val) continue;
    const cur = S.res[k] || 0;
    const cap = capOf(k);
    const over = (S.overflow && S.overflow[k]) || 0;
    setHTML(val, over > 0 ? `${fmt(cur)}<span class="rb-overflow">+${fmt(over)}</span>` : fmt(cur));
    cell.classList.toggle('overflow', over > 0);
    cell.classList.toggle('full', !(over > 0) && cur >= cap * 0.95);
    cell.classList.toggle('low', !(over > 0) && cur < cap * 0.95 && cur < cap * 0.1);
    let tip = `${RES_LABELS[k]} : ${fmt(cur)} / ${fmt(cap)}`;
    if (over > 0) tip += ` · surplus ${fmt(over)} (sera réabsorbé)`;
    if (cell.title !== tip) cell.title = tip;
  }
  const pop = $('#rbPop');
  if (pop) {
    const usage = crewUsage();
    const t = `${usage.used}/${usage.total}`;
    if (pop.textContent !== t) pop.textContent = t;
    if (pop.parentElement) pop.parentElement.title = `${usage.used} colons · capacité ${usage.total}`;
  }
}

// Bandeau d'alertes contextuelles (visible s'il y a quelque chose à signaler)
function renderAlertBar() {
  const bar = $('#alertBar');
  const txt = $('#alertText');
  if (!bar || !txt) return;
  const alerts = collectAlerts();
  if (alerts.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  bar.classList.toggle('critical', alerts.some(a => a.critical));
  const first = alerts[0];
  const label = alerts.length === 1 ? first.text : `${first.text} · +${alerts.length - 1} autre${alerts.length > 2 ? 's' : ''}`;
  const shown = typo(label);
  if (txt.textContent !== shown) txt.textContent = shown;
}

// Collecte les alertes à afficher. Chaque alerte peut porter une action
// (clé de ALERT_ACTIONS) : un clic sur sa ligne, dans la modale, y mène.
export function collectAlerts() {
  const alerts = [];
  const pending = Array.isArray(S.pendingDecisions) ? S.pendingDecisions : [
    ...(S.pendingIncident ? [{ kind: 'incident' }] : []),
    ...(S.pendingColonyEvent ? [{ kind: 'event' }] : []),
  ];
  if (pending.length > 0) {
    const incidents = pending.filter(d => d?.kind === 'incident').length;
    const text = pending.length > 1
      ? `${pending.length} décisions en attente`
      : incidents ? 'Incident en attente de décision' : 'Événement de colonie en attente de décision';
    alerts.push({ text, critical: incidents > 0, action: 'decisions' });
  }
  // Expéditions qui attendent un choix
  const waiting = Base.awaitingExpeditions();
  if (waiting.length > 0) {
    alerts.push({ text: waiting.length > 1 ? `${waiting.length} expéditions attendent tes ordres` : 'Une expédition attend tes ordres', critical: waiting.some(e => e.combat?.active), action: 'expedition', target: waiting[0].id });
  }
  const wounded = Base.woundedUntreated();
  if (wounded.length > 0) {
    alerts.push({ text: `${wounded.length} blessé${wounded.length > 1 ? 's' : ''} grave${wounded.length > 1 ? 's' : ''} sans soin`, critical: true, action: 'medical' });
  }
  // Pénuries signalées par le moteur
  for (const s of Base.shortagesList()) alerts.push({ text: s.text, critical: s.critical !== false, action: 'resources' });
  // Biomasse critique sans hydroponie (début de partie)
  const hydroLevel = S.modules?.hydroponie?.level || 0;
  const biomasse = S.res?.biomasse || 0;
  if (hydroLevel === 0 && biomasse < capOf('biomasse') * 0.3) {
    alerts.push({
      text: biomasse < 20 ? `Biomasse critique (${fmt(biomasse)}) : construis une hydroponie` : `Biomasse basse (${fmt(biomasse)}) : pense à l'hydroponie`,
      critical: biomasse < 20, action: 'build', target: 'hydroponie',
    });
  }
  // Effets temporaires : une ligne par effet
  if (Array.isArray(S.activeBuffs) && S.activeBuffs.length > 0) {
    const now = S.meta?.gameMin || 0;
    for (const b of S.activeBuffs.filter(b => b.expiresAt > now)) {
      alerts.push({ text: `${b.label || 'Effet en cours'} · encore ${fmtDuree(b.expiresAt - now)}`, critical: b.type === 'prodMult' && b.value < 1, action: 'resources' });
    }
  }
  // Modules hors service
  const disabled = Object.keys(S.modules || {}).filter(id => S.modules[id]?.disabledUntil > (S.meta?.gameMin || 0));
  if (disabled.length > 0) {
    alerts.push({ text: `Hors service : ${disabled.map(id => MODULES[id]?.nom || id).join(', ')}`, critical: true, action: 'build', target: disabled[0] });
  }
  // Colons sans poste (sauf ceux laissés libres volontairement)
  const free = Base.freeCrew();
  if (free.length > 0) {
    alerts.push({ text: `${free.length} colon${free.length > 1 ? 's' : ''} sans poste`, critical: false, action: 'assign' });
  }
  // Stocks saturés
  const fullRes = RESOURCES.filter(k => (S.res[k] || 0) >= capOf(k) * 0.98);
  if (fullRes.length > 0) {
    alerts.push({ text: `Stocks pleins : ${fullRes.map(k => RES_LABELS[k]).join(', ')}`, critical: false, action: 'resources' });
  }
  return alerts;
}

// Où mène chaque alerte. Renvoie null si l'action n'est pas disponible.
const ALERT_ACTIONS = {
  decisions:  () => openNextDecision,
  expedition: a => () => openSceneOverlay(a.target),
  medical:    () => () => gotoView('equipage', 'soins'),
  build:      a => () => gotoView('base', 'construction', { cible: a.target }),
  resources:  () => () => gotoView('base', 'afaire', { sel: '#dashResources' }),
  assign:     () => () => gotoView('base', 'postes'),
};
function openNextDecision() {
  try { pumpDecisions(); } catch (err) { console.error('[alertes] pumpDecisions :', err); }
}

// Modale qui liste toutes les alertes en détail
function showAlertsModal(alerts) {
  const m = $('#modal');
  const bg = $('#modalBg');
  if (!m || !bg) return;
  const gos = alerts.map(a => (a.action && ALERT_ACTIONS[a.action]?.(a)) || null);
  const html = alerts.map((a, i) => {
    const cls = a.critical ? 'critical' : '';
    const inner = `<span class="alert-icon" aria-hidden="true">${a.critical ? '⚠' : '◦'}</span>
      <span class="alert-text">${esc(a.text)}</span>`;
    return gos[i]
      ? `<button type="button" class="alert-row ${cls}" data-alert-idx="${i}">${inner}<span class="alert-go" aria-hidden="true">›</span></button>`
      : `<div class="alert-row ${cls}">${inner}</div>`;
  }).join('');
  m.className = 'modal alerts-modal';
  m.innerHTML = `
    <div class="incident-eyebrow">Alertes (${alerts.length})</div>
    <h3 class="incident-title">État de la colonie</h3>
    <div class="alerts-list">${html}</div>
    <div class="btn-row">
      <button id="alertsClose" class="primary">Fermer</button>
    </div>`;
  bg.classList.add('show');
  const close = () => bg.classList.remove('show');
  $('#alertsClose')?.addEventListener('click', close);
  m.querySelectorAll('[data-alert-idx]').forEach(row => {
    row.addEventListener('click', () => {
      close();
      gos[Number(row.dataset.alertIdx)]?.();
    });
  });
}

// ============================================================
//   NOTIFICATIONS SYSTÈME (bouton du menu)
// ============================================================
let _pushHandlersInstalled = false;
export function setupNotifHandlers() {
  if (_pushHandlersInstalled) return;
  _pushHandlersInstalled = true;
  const btn = $('#btnPushToggle');
  if (!btn) return;
  refreshPushButton();
  btn.addEventListener('click', async () => {
    const perm = getNotifPermission();
    if (perm === 'unsupported') { toast('Ton navigateur ne gère pas les notifications.'); return; }
    if (perm === 'denied') { toast('Permission refusée. Active les notifications dans les réglages du navigateur.'); return; }
    if (perm === 'default') {
      const result = await requestNotifPermission();
      if (result !== 'granted') { toast('Permission refusée'); refreshPushButton(); return; }
    }
    const newState = !isPushEnabled();
    setPushEnabled(newState);
    toast(newState ? 'Notifications téléphone activées' : 'Notifications téléphone désactivées');
    refreshPushButton();
  });
}
function refreshPushButton() {
  const btn = $('#btnPushToggle');
  if (!btn) return;
  const perm = getNotifPermission();
  if (perm === 'unsupported') { btn.textContent = '🔕 Notifications non disponibles'; btn.disabled = true; return; }
  if (perm === 'denied') { btn.textContent = '🔕 Notifications bloquées'; btn.title = 'Permission refusée dans le navigateur'; return; }
  const on = isPushEnabled();
  btn.textContent = on ? '🔔 Notifs téléphone : activées' : '🔕 Notifs téléphone : désactivées';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Touche pour désactiver les notifications système' : 'Touche pour activer les notifications système (app en arrière-plan)';
}

// ============================================================
//   NAVIGATION — onglets et sous-onglets
// ============================================================
const subtabButton = (tab, key) => $(`#view-${tab} nav.subtabs button[data-subtab="${CSS.escape(key)}"]`);

// Affiche un onglet principal et rend sa vue (défilement remis en haut)
export function selectTab(tab, { focus = false, scroll = true } = {}) {
  if (!VIEWS[tab] && LEGACY_TABS[tab]) {
    const l = LEGACY_TABS[tab];
    if (l.sub) selectSubtab(l.tab, l.sub, { scroll: false });
    tab = l.tab;
  }
  const btn = document.querySelector(`nav.tabs button[data-tab="${CSS.escape(String(tab))}"]`);
  if (!btn) return;
  const changed = _nav.tab !== tab;
  for (const b of $$('nav.tabs button')) {
    const on = b === btn;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  for (const v of $$('section.view')) v.classList.toggle('active', v.id === 'view-' + tab);
  _nav.tab = tab;
  saveNav();
  if (focus) btn.focus();
  if (scroll && changed) scrollTop();
  renderActiveView();
}

// Affiche un sous-onglet (même si son onglet n'est pas visible) et le rend si visible
export function selectSubtab(tab, key, { focus = false, scroll = true } = {}) {
  if (!VIEWS[tab] && LEGACY_TABS[tab]) {
    key = LEGACY_SUBS[tab]?.[key] || key;
    tab = LEGACY_TABS[tab].tab;
  }
  const btn = VIEWS[tab]?.[key] ? subtabButton(tab, key) : null;
  if (!btn || btn.disabled) return;
  const view = $('#view-' + tab);
  const changed = _nav.sub[tab] !== key;
  for (const b of view.querySelectorAll('nav.subtabs button')) {
    const on = b === btn;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  for (const v of view.querySelectorAll('.subview')) v.classList.toggle('active', v.id === 'subview-' + key);
  _nav.sub[tab] = key;
  saveNav();
  if (focus) btn.focus();
  if (_nav.tab === tab) {
    if (scroll && changed) scrollTop();
    renderActiveView();
  }
}

function scrollTop() {
  try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); }
}

export function currentView() {
  return { tab: _nav.tab, sub: _nav.sub[_nav.tab] };
}

// Résout « onglet », « onglet/sous-onglet » ou un ancien nom (liste blanche :
// le nom n'est jamais inséré tel quel dans un sélecteur) → { tab, sub } ou null
export function resolveTarget(name) {
  if (typeof name !== 'string' || !name) return null;
  const [a, b] = name.split('/');
  if (VIEWS[a]) {
    if (b && !VIEWS[a][b]) return { tab: a };
    return { tab: a, sub: b || undefined };
  }
  if (LEGACY_TABS[a]) {
    const l = LEGACY_TABS[a];
    const sub = (b && LEGACY_SUBS[a]?.[b]) || l.sub;
    return { tab: l.tab, sub };
  }
  return null;
}
// Navigue vers une cible (« expeditions/missions », « galaxy »…) ; true si connue
export function navigateTo(name, opts = {}) {
  const t = resolveTarget(name);
  if (!t) return false;
  gotoView(t.tab, t.sub, opts);
  return true;
}

// Affiche une vue et y fait défiler jusqu'à un élément (ou en haut).
// opts.cible : un module à montrer dans la construction ; opts.sel : un sélecteur.
export function gotoView(tab, sub, opts = {}) {
  if (typeof opts === 'string') opts = { sel: opts };
  if (sub) selectSubtab(tab, sub, { scroll: false });
  selectTab(tab, { scroll: false });
  scrollTop();
  if (opts.cible && tab === 'base' && (sub === 'construction' || !sub)) {
    if (!sub) selectSubtab('base', 'construction', { scroll: false });
    Base.revealModule(opts.cible);
    return;
  }
  if (opts.sel) requestAnimationFrame(() => flash(opts.sel));
}

// Met un élément en évidence (et le fait défiler au centre)
export function flash(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

function saveNav() {
  try { localStorage.setItem(NAV_KEY, JSON.stringify({ v: 2, tab: _nav.tab, sub: _nav.sub })); } catch { /* stockage indisponible : sans gravité */ }
}
// Restaure l'onglet et les sous-onglets mémorisés (au premier render).
// Les valeurs ≤ 0.33 (overview, crew, galaxy…) sont converties.
function restoreNav() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return;
  const subs = {};
  if (saved.v === 2) {
    for (const tab of TABS) if (typeof saved.sub?.[tab] === 'string' && VIEWS[tab][saved.sub[tab]]) subs[tab] = saved.sub[tab];
  } else {
    for (const old of Object.keys(LEGACY_SUBS)) {
      const key = LEGACY_SUBS[old][saved.sub?.[old]];
      const tab = LEGACY_TABS[old].tab;
      if (key && !(tab === 'base' && old === 'modules')) subs[tab] = key;
    }
  }
  for (const [tab, key] of Object.entries(subs)) if (key !== _nav.sub[tab]) selectSubtab(tab, key, { scroll: false });
  const t = resolveTarget(typeof saved.tab === 'string' ? saved.tab : '');
  if (t) {
    if (t.sub && saved.v !== 2) selectSubtab(t.tab, t.sub, { scroll: false });
    if (t.tab !== _nav.tab) selectTab(t.tab, { scroll: false });
  }
  saveNav();
}

// Navigation clavier dans une liste d'onglets : flèches, Début, Fin
function tablistKeydown(e, buttons, activate) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const enabled = buttons.filter(b => !b.disabled);
  const i = enabled.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  let j = i;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + enabled.length) % enabled.length;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % enabled.length;
  else if (e.key === 'Home') j = 0;
  else j = enabled.length - 1;
  activate(enabled[j]);
}

// Branchement (le DOM est déjà analysé : les modules ES sont différés)
{
  const tabs = $$('nav.tabs button');
  for (const b of tabs) {
    b.addEventListener('click', () => {
      // Toucher l'onglet déjà ouvert : retour à sa première vue, en haut
      if (_nav.tab === b.dataset.tab) {
        if (window.scrollY > 0) scrollTop();
        else selectSubtab(b.dataset.tab, DEFAULT_SUB[b.dataset.tab]);
        return;
      }
      selectTab(b.dataset.tab);
    });
  }
  $('nav.tabs')?.addEventListener('keydown', e => tablistKeydown(e, tabs, b => selectTab(b.dataset.tab, { focus: true })));
  for (const nav of $$('nav.subtabs')) {
    const tab = nav.closest('section.view').id.replace('view-', '');
    const btns = Array.from(nav.querySelectorAll('button'));
    for (const b of btns) b.addEventListener('click', () => selectSubtab(tab, b.dataset.subtab));
    nav.addEventListener('keydown', e => tablistKeydown(e, btns, b => selectSubtab(tab, b.dataset.subtab, { focus: true })));
  }
  _nav.tab = $('nav.tabs button.active')?.dataset.tab || 'base';
  // Navigation demandée par une notification (service worker) ou un autre module
  try {
    navigator.serviceWorker?.addEventListener('message', e => {
      if (e.data?.type === 'NOTIF_NAVIGATE' && S) navigateTo(e.data.target);
    });
  } catch { /* pas de service worker */ }
  window.addEventListener('drift:navigate', e => { if (S) navigateTo(e.detail); });
}

// ============================================================
//   ACTIONS DES VUES — délégation d'événements
// ============================================================
// Un seul écouteur sur <main> route les clics selon le premier sélecteur
// correspondant (du plus spécifique au plus général).
const VIEW_ACTIONS = [
  // Navigation interne : data-goto="onglet/sous-onglet" (+ data-cible)
  ['[data-goto]', el => navigateTo(el.dataset.goto, { cible: el.dataset.cible })],
  ['[data-goto-body]', el => {
    if (Expe.openBody(el.dataset.gotoBody)) gotoView('expeditions', 'carte');
  }],
  ['button[data-goto-assign]', el => gotoAssignments(el.dataset.gotoAssign)],
  // Filtres (chips) : data-filter="groupe:valeur"
  ['button[data-filter]', el => {
    const [group, value] = el.dataset.filter.split(':');
    setFilter(group, value);
    renderActiveView();
  }],
  // Cartes dépliables : data-toggle="clé"
  ['[data-toggle]', el => {
    toggleOpen(el.dataset.toggle);
    renderActiveView();
  }],
  ...Base.ACTIONS,
  ...Equipage.ACTIONS,
  ...Expe.ACTIONS,
  ...Recits.ACTIONS,
  ...Labo.ACTIONS,
];

$('main')?.addEventListener('click', e => {
  const root = e.currentTarget;
  for (const [sel, fn] of VIEW_ACTIONS) {
    const el = e.target.closest?.(sel);
    if (!el || !root.contains(el)) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    fn(el, e);
    return;
  }
});

// Activation clavier des éléments non-<button> marqués role="button"
// (cartes et lignes cliquables) : Entrée ou Espace = clic.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (!(el instanceof HTMLElement) || el.isContentEditable) return;
  if (/^(BUTTON|A|INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(el.tagName)) return;
  if (!/^(button|switch|checkbox)$/.test(el.getAttribute('role') || '')) return;
  e.preventDefault();
  if (el.getAttribute('aria-disabled') === 'true') return;
  el.click();
});

// Bandeau d'alertes : ouvre le détail (clavier : role="button", voir plus haut)
$('#alertBar')?.addEventListener('click', () => { if (S) showAlertsModal(collectAlerts()); });

// « Gérer → » : va sur Base › Postes et fait défiler jusqu'au bâtiment
function gotoAssignments(modKey) {
  gotoView('base', 'postes');
  requestAnimationFrame(() => flash(`#assignList .module-assign-card[data-mod="${CSS.escape(modKey || '')}"]`));
}
export function prefersReducedMotion() {
  return !!(getPrefs().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// ============================================================
//   RETOURS À L'ÉCRAN — toasts empilables
// ============================================================
// #toast est une région aria-live : chaque message y est ajouté comme un
// élément (annoncé par les lecteurs d'écran), puis retiré après quelques
// secondes. Trois au plus à la fois ; un message identique n'est pas répété.
// Non bloquants : ils ne captent pas les touchers (le contenu dessous reste
// utilisable) ; le détail est dans le tableau de bord et le journal.
const TOAST_MAX = 3;
export function toast(msg, opts = {}) {
  const host = $('#toast');
  if (!host || msg == null) return;
  const text = String(msg);
  for (const el of host.children) {
    if (el.dataset.text === text) { el.remove(); break; }
  }
  const el = document.createElement('div');
  el.className = 'toast-item' + (opts.kind ? ' ' + opts.kind : '');
  el.dataset.text = text;
  const span = document.createElement('span');
  span.className = 'toast-text';
  span.textContent = typo(text);
  el.appendChild(span);
  host.appendChild(el);
  while (host.children.length > TOAST_MAX) host.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  const ms = opts.ms || (opts.kind === 'crit' ? 6000 : 4200);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, ms);
}

// ---- Détection des changements entre deux rendus ----
// Le moteur n'émet rien : on compare un instantané de l'état à celui du
// rendu précédent. Pas de messages pendant un rattrapage (il a son propre
// rapport) ni après un saut de temps important.
let _prev = null;
let _prevS = null;
const _cancelled = new Set();
// Une activité annulée par le joueur ne donne pas de message « terminé »
export function markCancelled(key) { _cancelled.add(key); }

function snapshot() {
  const exps = {};
  for (const e of S.expeditions || []) {
    exps[e.id] = { phase: e.phase, waiting: e.phase === 'sur_place' && !!e.awaitingChoice, bodyId: e.bodyId };
  }
  const chron = {};
  for (const c of Base.chroniclesList()) chron[c.id] = { etat: c.etat, titre: c.titre, bodyId: c.lieu?.bodyId };
  return {
    gm: S.meta.gameMin || 0,
    build: S.build ? { id: S.build.id, lvl: S.build.targetLevel } : null,
    research: (S.research || []).map(r => ({ id: r.id, techId: r.techId })),
    fab: (S.fabrication || []).map(f => ({ id: f.id, fabId: f.fabId })),
    training: (S.training || []).filter(Boolean).map(t => ({ id: t.id, memberId: t.memberId, skill: t.skill })),
    treatments: (S.treatments || []).filter(Boolean).map(t => ({ key: (t.id || '') + ':' + t.memberId + ':' + t.statusIdx, memberId: t.memberId })),
    vessel: S.vesselBuild ? S.vesselBuild.type : null,
    cands: (S.candidates || []).map(c => c.id),
    exps,
    alive: new Set((S.crew || []).filter(m => m.statut !== 'mort').map(m => m.id)),
    chron,
  };
}
const nameOf = id => S.crew.find(c => c.id === id)?.name || 'Un colon';
const bodyName = id => Base.bodyById(id).body?.name || 'destination inconnue';

function detectChanges() {
  const cur = snapshot();
  const prev = _prev;
  const sameGame = _prevS === S;
  _prev = cur;
  _prevS = S;
  // Nouvelle partie (Recommencer) ou partie importée : le menu se referme
  if (prev && !sameGame && sheetShown()) closeMenu();
  if (!prev || !sameGame || isCatchingUp()) return;
  if (cur.gm - prev.gm > 3600 || cur.gm < prev.gm) return;
  const msgs = [];
  // Chantier terminé (et suivant démarré depuis la file)
  if (prev.build && (!cur.build || cur.build.id !== prev.build.id || cur.build.lvl !== prev.build.lvl)) {
    if ((S.modules[prev.build.id]?.level || 0) >= prev.build.lvl) {
      const next = cur.build ? ` · suivant : ${MODULES[cur.build.id]?.nom || cur.build.id}` : '';
      msgs.push({ text: `Chantier terminé : ${MODULES[prev.build.id]?.nom || prev.build.id} niv. ${prev.build.lvl}${next}`, kind: 'ok' });
    }
  }
  // Recherche terminée
  for (const r of prev.research) {
    if (cur.research.some(x => x.id === r.id)) continue;
    if (_cancelled.delete('res:' + r.id)) continue;
    if (S.techCompleted?.[r.techId]) msgs.push({ text: `Recherche terminée : ${TECH_TREE[r.techId]?.nom || r.techId}`, kind: 'ok' });
  }
  // Fabrication terminée
  for (const f of prev.fab) {
    if (cur.fab.some(x => x.id === f.id)) continue;
    if (_cancelled.delete('fab:' + f.id)) continue;
    msgs.push({ text: `Fabrication terminée : ${FABRICATIONS[f.fabId]?.nom || f.fabId}`, kind: 'ok' });
  }
  // Formation terminée
  for (const t of prev.training) {
    if (cur.training.some(x => x.id === t.id)) continue;
    if (_cancelled.delete('tr:' + t.id)) continue;
    if (!cur.alive.has(t.memberId)) continue;
    msgs.push({ text: `Formation terminée : ${nameOf(t.memberId)} (${SKILL_LABELS[t.skill] || t.skill})`, kind: 'ok' });
  }
  // Soins terminés
  for (const t of prev.treatments) {
    if (cur.treatments.some(x => x.key === t.key)) continue;
    if (!cur.alive.has(t.memberId)) continue;
    msgs.push({ text: `Soins terminés : ${nameOf(t.memberId)}`, kind: 'ok' });
  }
  // Vaisseau livré
  if (prev.vessel && !cur.vessel) msgs.push({ text: `Vaisseau prêt : ${vesselDef(prev.vessel).nom}`, kind: 'ok' });
  // Nouveaux candidats
  const newCands = cur.cands.filter(id => !prev.cands.includes(id));
  if (newCands.length === 1) {
    const c = S.candidates.find(x => x.id === newCands[0]);
    msgs.push({ text: `Nouveau candidat : ${c?.name || '?'}` });
  } else if (newCands.length > 1) {
    msgs.push({ text: `${newCands.length} nouveaux candidats` });
  }
  // Expéditions : retour, ou décision attendue
  for (const [id, p] of Object.entries(prev.exps)) {
    const c = cur.exps[id];
    if (!c) {
      msgs.push({ text: `Retour d'expédition : ${bodyName(p.bodyId)}` });
    } else if (c.waiting && !p.waiting) {
      msgs.push({ text: `${bodyName(c.bodyId)} : l'équipe attend tes ordres`, kind: 'warn' });
    }
  }
  for (const [id, c] of Object.entries(cur.exps)) {
    if (!prev.exps[id] && c.waiting) msgs.push({ text: `${bodyName(c.bodyId)} : l'équipe attend tes ordres`, kind: 'warn' });
  }
  // Chronique : la suite est prête
  for (const [id, c] of Object.entries(cur.chron)) {
    if (c.etat === 'prete' && prev.chron[id]?.etat !== 'prete') {
      msgs.push({ text: `La suite est prête : ${c.titre}` });
    }
  }
  // Décès
  for (const id of prev.alive) {
    if (cur.alive.has(id)) continue;
    const m = S.crew.find(c => c.id === id);
    if (m && m.statut === 'mort') msgs.push({ text: `Décès : ${m.name}`, kind: 'crit' });
  }
  if (msgs.length > 4) {
    toast(`${msgs.length} nouvelles de la colonie — le journal en garde la trace`);
    return;
  }
  for (const m of msgs) toast(m.text, { kind: m.kind });
}

// ============================================================
//   PRÉFÉRENCES (par appareil) ET MENU « ⋯ »
// ============================================================
const PREFS_KEY = 'drift_ui_prefs';
const PREF_DEFAULTS = { textSize: 'normal', reduceMotion: false, autoCombat: false };
let _prefs = null;
// Préférences d'affichage et de jeu de cet appareil.
// autoCombat est lu par l'écran de combat (vague 2).
export function getPrefs() {
  if (_prefs) return _prefs;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { saved = {}; }
  _prefs = { ...PREF_DEFAULTS };
  if (saved.textSize === 'grand') _prefs.textSize = 'grand';
  _prefs.reduceMotion = saved.reduceMotion === true;
  _prefs.autoCombat = saved.autoCombat === true;
  return _prefs;
}
export function setPref(name, value) {
  const p = getPrefs();
  if (!(name in PREF_DEFAULTS)) return;
  p[name] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ }
  applyPrefs();
}
function applyPrefs() {
  const p = getPrefs();
  const root = document.documentElement;
  if (p.textSize === 'grand') root.dataset.textSize = 'grand'; else delete root.dataset.textSize;
  if (p.reduceMotion) root.dataset.reduceMotion = '1'; else delete root.dataset.reduceMotion;
  for (const b of $$('#menuSheet [data-pref]')) {
    const name = b.dataset.pref;
    const on = b.dataset.value !== undefined ? p[name] === b.dataset.value : !!p[name];
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.classList.toggle('on', on);
  }
}

const sheetShown = () => !!$('#menuBg')?.classList.contains('show');
let _sheetOpener = null;
export function openMenu() {
  const bg = $('#menuBg');
  if (!bg || sheetShown()) return;
  const active = document.activeElement;
  _sheetOpener = active && active !== document.body ? active : $('#menuBtn');
  const av = $('#aboutVersion');
  if (av) av.textContent = VERSION;
  applyPrefs();
  refreshPushButton();
  bg.classList.add('show');
  $('#menuBtn')?.setAttribute('aria-expanded', 'true');
  syncInert();
  const sheet = $('#menuSheet');
  sheet.scrollTop = 0;
  sheet.focus({ preventScroll: true });
}
export function closeMenu() {
  const bg = $('#menuBg');
  if (!bg || !sheetShown()) return;
  bg.classList.remove('show');
  $('#menuBtn')?.setAttribute('aria-expanded', 'false');
  syncInert();
  const back = _sheetOpener;
  _sheetOpener = null;
  if (back?.isConnected && back.getClientRects().length && !back.closest('[inert]')) back.focus({ preventScroll: true });
}
{
  $('#menuBtn')?.addEventListener('click', () => (sheetShown() ? closeMenu() : openMenu()));
  $('#menuClose')?.addEventListener('click', closeMenu);
  // Toucher le voile ferme le menu
  $('#menuBg')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeMenu(); });
  // Réglages
  $('#menuSheet')?.addEventListener('click', e => {
    const b = e.target.closest?.('[data-pref]');
    if (!b) return;
    const name = b.dataset.pref;
    if (b.dataset.value !== undefined) setPref(name, b.dataset.value);
    else setPref(name, !getPrefs()[name]);
  });
  applyPrefs();
}

// ============================================================
//   ACCUEIL (premier lancement)
// ============================================================
// Au tout premier lancement d'une partie neuve : quelques phrases qui posent
// la situation, puis le tableau de bord guide par les objectifs. Une seule
// fois par appareil. Pas affiché sous automatisation (navigator.webdriver) :
// les tests de bout en bout démarrent tous sur une partie neuve.
const WELCOME_KEY = 'drift_ui_welcome';
export function maybeWelcome({ force = false } = {}) {
  if (!S?.meta) return false;
  if (!force) {
    let seen = null;
    try { seen = localStorage.getItem(WELCOME_KEY); } catch { seen = '1'; }
    if (seen || navigator.webdriver) return false;
    if ((S.meta.gameMin || 0) > 600 || (S.journal || []).length > 12) {
      try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* rien */ }
      return false;
    }
    if (modalShown() || overlayShown()) return false;
  }
  const m = $('#modal');
  m.className = 'modal welcome-modal';
  const crew = (S.crew || []).filter(c => c.statut !== 'mort' && !(c.role === 'commandante' || c.commandante || c.isCommander));
  const names = crew.slice(0, 4).map(c => esc(c.name));
  const liste = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0];
  const equipe = crew.length
    ? `Avec toi, ${crew.length > 1 ? `${crew.length} colons : ${liste}` : liste}${crew.length > 4 ? '…' : ''}.`
    : 'Personne encore à tes côtés : l\'équipage viendra.';
  m.innerHTML = `
    <div class="incident-eyebrow">Jour 1 · ${esc(S.meta.colonyName)}</div>
    <h3>Bienvenue, commandante.</h3>
    <div class="welcome-body">
      <p>La capsule s'est posée sur un plateau balayé par le vent, à des années de tout. Tu commandes cet avant-poste : le centre de commandement ronronne, le reste est à bâtir.</p>
      <p>${equipe} Construis de quoi tenir, affecte chacun à son poste, puis envoie des équipes là où les signaux s'éteignent.</p>
      <p>Le temps passe pour de vrai, même l'app fermée : reviens quelques minutes, plusieurs fois par jour. <em>Base › À faire</em> te dira toujours ce qui t'attend.</p>
    </div>
    <div class="btn-row">
      <button class="primary" id="welcomeGo" data-modal-cancel>Prendre le commandement</button>
    </div>`;
  $('#modalBg').classList.add('show');
  $('#welcomeGo').addEventListener('click', () => {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* rien */ }
    $('#modalBg').classList.remove('show');
    gotoView('base', 'afaire');
  });
  return true;
}



// ============================================================
//   OVERLAY DE SCÈNE — UI plein écran narratif
// ============================================================
let _activeSceneExpId = null;

export function openSceneOverlay(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp || exp.phase !== 'sur_place' || !exp.awaitingChoice) return;
  _activeSceneExpId = expId;
  const active = document.activeElement;
  _sceneOpener = active && active !== document.body ? active : null;
  $('#sceneOverlay').classList.add('show');
  $('#sceneOverlay').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  syncInert();
  renderSceneOverlay();
}
let _sceneOpener = null;

// Garde le focus clavier dans l'overlay après chaque ré-affichage
function focusSceneOverlay() {
  const inner = $('#sceneInner');
  if (inner && overlayShown() && !modalShown() && !inner.contains(document.activeElement)) {
    inner.focus({ preventScroll: true });
  }
}

// ============================================================
//   OVERLAY DE COMBAT
// ============================================================
let _pendingCombatAction = null; // { allyId, action } — attend sélection d'une cible

function renderCombatOverlay(exp) {
  const cbt = exp.combat;
  _pendingCombatAction = null;

  // Étiquette du type d'arme
  const weaponLabel = { melee: 'CAC', ranged: 'Dist.', precision: 'Sniper', shield_cinetique: 'Boucl.', shield_energetique: 'Énergie', exo: 'Exo', shield_refractant: 'Réfract.' };

  // Carte d'un allié
  const alliesHTML = cbt.allies.map(a => {
    const dead = a.hp <= 0;
    const hpPct = Math.max(0, a.hp / a.maxHp * 100);
    const hpCls = dead ? 'dead' : a.hp < a.maxHp * 0.3 ? 'crit' : a.hp < a.maxHp * 0.6 ? 'low' : '';
    const paDots = Array.from({ length: a.maxPa }, (_, i) =>
      `<span class="cbt-pa-dot ${i < a.pa ? 'active' : ''}"></span>`
    ).join('');
    const sel = a.id === cbt.selectedAllyId ? 'selected' : '';
    const coverActive = a.effects.some(e => e.type === 'cover');
    const shieldBar = a.maxShieldHp > 0
      ? `<div class="cbt-shield-bar"><div class="cbt-shield-fill" style="width:${Math.max(0, a.shieldHp / a.maxShieldHp * 100)}%"></div></div>
         <div class="cbt-hp-txt cbt-shield-txt">⚡${esc(a.shieldHp)}/${esc(a.maxShieldHp)} Bouclier</div>`
      : '';
    const wType = a.weaponType ? `<span class="cbt-wtype">${esc(weaponLabel[a.weaponType] || a.weaponType)}</span>` : '';
    return `<div class="cbt-ally ${dead ? 'dead' : ''} ${sel}" data-cbt-ally="${esc(a.id)}"${dead ? '' : ' role="button" tabindex="0"'}${sel ? ' aria-pressed="true"' : ''}>
      <div class="cbt-a-name">${esc(a.name)}${wType}${coverActive ? ' <span class="cbt-cover-icon">🛡</span>' : ''}</div>
      ${shieldBar}
      <div class="cbt-hp-bar"><div class="cbt-hp-fill ${hpCls}" style="width:${hpPct}%"></div></div>
      <div class="cbt-hp-txt">${esc(a.hp)}/${esc(a.maxHp)} PV</div>
      <div class="cbt-pa-row">${paDots}<span class="cbt-pa-lbl">${esc(a.pa)} PA</span></div>
    </div>`;
  }).join('');

  // Carte d'un ennemi
  const enemiesHTML = cbt.enemies.map((e, i) => {
    const dead = e.hp <= 0;
    const hpPct = Math.max(0, e.hp / e.maxHp * 100);
    const sel = _pendingCombatAction ? 'targetable' : '';
    return `<div class="cbt-enemy ${dead ? 'dead' : ''} ${sel}" data-cbt-enemy="${i}"${dead ? '' : ' role="button" tabindex="0"'}>
      <div class="cbt-e-name">${esc(e.nom)}</div>
      <div class="cbt-hp-bar"><div class="cbt-hp-fill enemy" style="width:${hpPct}%"></div></div>
      <div class="cbt-hp-txt">${esc(e.hp)}/${esc(e.maxHp)} PV · armure ${esc(e.armor)}</div>
    </div>`;
  }).join('');

  // Journal (6 dernières lignes)
  const logHTML = cbt.log.slice(-7).map(l =>
    `<div class="cbt-log-line">${safeHTML(l)}</div>`
  ).join('');

  // Actions pour l'allié sélectionné
  const ally = cbt.allies.find(a => a.id === cbt.selectedAllyId);
  const hasKit = ((exp.equipment?.nanobots_reparation || 0) + (exp.equipment?.kit_medical || 0)) > 0;
  // Cherche n'importe quel explosif AoE disponible
  const aoeItem = ['mine_eclats', 'grenade_concussion', 'grenade_iem'].find(id => (exp.equipment?.[id] || 0) > 0);
  const aoeLabel = aoeItem ? (ITEMS[aoeItem]?.nom || aoeItem) : null;
  const canHeal = ally && (ally.medecine > 0 || hasKit);

  let actionsHTML = '';
  if (cbt.phase === 'ended') {
    const icon = cbt.outcome === 'victory' ? '🏆' : cbt.outcome === 'retreat' ? '↩' : '💀';
    const label = cbt.outcome === 'victory' ? 'Victoire !' : cbt.outcome === 'retreat' ? 'Retraite' : 'Défaite';
    actionsHTML = `<div class="cbt-ended">${icon} ${label}</div>`;
  } else if (!ally || ally.hp <= 0) {
    actionsHTML = `<div class="cbt-hint">Sélectionne un colon actif pour agir.</div>`;
  } else {
    actionsHTML = `
      <div class="cbt-action-group">
        <button class="cbt-action" data-cbt-act="attack" ${ally.pa < 1 ? 'disabled' : ''} title="Attaque standard · 1 PA">
          Attaquer <span class="cbt-act-cost">1 PA</span>
        </button>
        <button class="cbt-action" data-cbt-act="precise" ${ally.pa < 2 ? 'disabled' : ''} title="+20% précision, +2 dégâts · 2 PA">
          Tir ciblé <span class="cbt-act-cost">2 PA</span>
        </button>
        <button class="cbt-action" data-cbt-act="cover" ${ally.pa < 1 ? 'disabled' : ''} title="+3 armure ce round · 1 PA">
          Couverture <span class="cbt-act-cost">1 PA</span>
        </button>
        ${canHeal ? `<button class="cbt-action" data-cbt-act="heal" ${ally.pa < 2 ? 'disabled' : ''} title="Soigne le plus blessé · 2 PA">
          Soigner <span class="cbt-act-cost">2 PA</span>
        </button>` : ''}
        ${aoeLabel ? `<button class="cbt-action cbt-aoe" data-cbt-act="grenade" ${ally.pa < 1 ? 'disabled' : ''} title="${aoeLabel} · 1 PA (consomme l'item)">
          ${aoeLabel} <span class="cbt-act-cost">1 PA</span>
        </button>` : ''}
        <button class="cbt-action cbt-pass" data-cbt-act="end_turn" title="Passe le reste du tour">
          Passer
        </button>
      </div>
      <div class="cbt-turn-row">
        <button class="cbt-end-turn" data-cbt-end-turn>Fin de tour →</button>
        <button class="cbt-retreat" data-cbt-retreat>Retraite</button>
      </div>`;
  }

  $('#sceneInner').innerHTML = `
    <div class="cbt-header">
      <span class="cbt-title">⚔ Combat · Round ${esc(cbt.round)}</span>
      <span class="cbt-phase-lbl ${esc(cbt.phase)}">${
        cbt.phase === 'player' ? 'Tour des alliés' :
        cbt.phase === 'enemy'  ? 'Phase ennemie…' : 'Terminé'
      }</span>
    </div>
    <div class="cbt-arena">
      <div class="cbt-col allies">
        <div class="cbt-col-head">Équipage</div>
        ${alliesHTML}
      </div>
      <div class="cbt-col enemies">
        <div class="cbt-col-head">Ennemis</div>
        ${enemiesHTML}
      </div>
    </div>
    <div class="cbt-log">${logHTML}</div>
    <div class="cbt-actions">${actionsHTML}</div>
  `;

  hookCombatOverlay(exp.id);
  focusSceneOverlay();
}

function hookCombatOverlay(expId) {
  const inner = $('#sceneInner');

  // Sélection d'un allié
  inner.querySelectorAll('[data-cbt-ally]').forEach(el => {
    el.addEventListener('click', () => {
      const exp = S.expeditions.find(e => e.id === expId);
      if (!exp?.combat) return;
      const ally = exp.combat.allies.find(a => a.id === el.dataset.cbtAlly);
      if (!ally || ally.hp <= 0) return;
      _pendingCombatAction = null;
      exp.combat.selectedAllyId = ally.id;
      renderCombatOverlay(exp);
    });
  });

  // Sélection d'une action
  inner.querySelectorAll('[data-cbt-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const exp = S.expeditions.find(e => e.id === expId);
      if (!exp?.combat) return;
      const action = btn.dataset.cbtAct;
      const allyId = exp.combat.selectedAllyId;

      if (action === 'attack' || action === 'precise') {
        // Mode sélection de cible
        _pendingCombatAction = { allyId, action };
        // Highlight ennemis vivants
        inner.querySelectorAll('[data-cbt-enemy]:not(.dead)').forEach(e => e.classList.add('targetable'));
      } else {
        // Actions sans cible
        combatAllyAction(expId, allyId, action, 0);
        renderCombatOverlay(exp);
      }
    });
  });

  // Clic sur un ennemi (après sélection d'action d'attaque)
  inner.querySelectorAll('[data-cbt-enemy]').forEach(el => {
    el.addEventListener('click', () => {
      const exp = S.expeditions.find(e => e.id === expId);
      if (!exp?.combat || !_pendingCombatAction) return;
      const enemyIdx = parseInt(el.dataset.cbtEnemy, 10);
      const enemy = exp.combat.enemies[enemyIdx];
      if (!enemy || enemy.hp <= 0) return;
      const { allyId, action } = _pendingCombatAction;
      _pendingCombatAction = null;
      combatAllyAction(expId, allyId, action, enemyIdx);
      // Si le combat est terminé, basculer sur la scène ou fermer
      if (!exp.combat.active) {
        const stillInPhase = exp.phase === 'sur_place' && exp.awaitingChoice;
        if (stillInPhase) renderSceneOverlay();
        else closeSceneOverlay();
      } else {
        renderCombatOverlay(exp);
      }
    });
  });

  // Fin de tour
  inner.querySelector('[data-cbt-end-turn]')?.addEventListener('click', () => {
    const exp = S.expeditions.find(e => e.id === expId);
    if (!exp?.combat) return;
    combatEndTurn(expId);
    if (!exp.combat.active) {
      const stillInPhase = exp.phase === 'sur_place' && exp.awaitingChoice;
      if (stillInPhase) renderSceneOverlay();
      else closeSceneOverlay();
    } else {
      renderCombatOverlay(exp);
    }
  });

  // Retraite
  inner.querySelector('[data-cbt-retreat]')?.addEventListener('click', () => {
    const exp = S.expeditions.find(e => e.id === expId);
    if (!exp?.combat) return;
    confirmModal({
      titre: 'Battre en retraite ?',
      texte: "L'équipe rentre immédiatement, avec des pertes possibles : chaque ennemi encore actif porte une attaque d'opportunité.",
      confirmer: 'Retraite', annuler: 'Rester', danger: true,
    }).then(ok => {
      if (!ok || !exp.combat) return;
      combatAllyAction(expId, exp.combat.selectedAllyId || exp.combat.allies[0]?.id, 'retreat', -1);
      closeSceneOverlay();
    });
  });
}

function closeSceneOverlay() {
  _activeSceneExpId = null;
  $('#sceneOverlay').classList.remove('show');
  document.body.style.overflow = '';
  syncInert();
  render();
  // Retour du focus sur le bouton « Reprendre » (ou l'élément d'origine)
  const back = _sceneOpener;
  _sceneOpener = null;
  if (back?.isConnected && back.getClientRects().length && !modalShown()) back.focus({ preventScroll: true });
}

function renderSceneOverlay() {
  if (!_activeSceneExpId) return;
  const exp = S.expeditions.find(e => e.id === _activeSceneExpId);
  if (!exp) {
    closeSceneOverlay();
    return;
  }
  // Si la mission a quitté la phase sur_place, on ferme
  if (exp.phase !== 'sur_place') {
    closeSceneOverlay();
    return;
  }
  // Si un combat est en cours, afficher l'UI de combat
  if (exp.combat?.active) {
    renderCombatOverlay(exp);
    return;
  }

  const scene = currentScene(exp);
  if (!scene) {
    closeSceneOverlay();
    return;
  }

  const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
  const body = sys?.bodies.find(b => b.id === exp.bodyId);
  const vessel = S.fleet.find(v => v.id === exp.vesselId);
  const ctx = {
    // Noms échappés : le texte de scène est du HTML (catalogue) où ils sont insérés
    vesselName: esc(vessel?.name ?? ''),
    bodyName: esc(body?.name ?? ''),
    body
  };
  // 0.24 — texte dynamique (fonction des flags de chronique) si applicable
  let rawText = scene.text;
  if (typeof rawText === 'function') {
    rawText = rawText(body?.chronicle?.flags || {});
  }
  const text = fillTemplate(rawText, ctx);

  // Progression : pastilles (cachées pour les scènes de chronique, séquence non-linéaire)
  const isChronScene = scene.chronicleEpisode || scene.id === '__chron_intro__';
  // Titre : pour une chronique, son nom et celui de l'épisode (pas l'id technique)
  let sceneTitle = String(scene.id).replace(/_/g, ' ');
  if (isChronScene) {
    const chron = activeChronicle(body);
    const ep = currentChronicleEpisode(body);
    const parts = [chron?.nom, ep?.title].filter(Boolean);
    if (parts.length) sceneTitle = parts.join(' · ');
    else if (scene.id === '__chron_intro__') sceneTitle = 'Chronique';
  }
  const dots = isChronScene ? '<span class="chron-badge">CHRONIQUE</span>' : exp.scenes.map((_, i) => {
    if (i < exp.sceneIdx) return '<span class="dot done"></span>';
    if (i === exp.sceneIdx) return '<span class="dot current"></span>';
    return '<span class="dot"></span>';
  }).join('');

  // Choix
  const choicesHTML = scene.choices.map((ch, i) => {
    const evalRes = evaluateChoice(exp, ch);
    let extraHTML = '';
    if (ch.req?.trait) {
      const has = exp.crewIds.some(id => S.crew.find(c => c.id === id)?.traits?.includes(ch.req.trait));
      extraHTML += `<span class="req ${has ? '' : 'locked'}">REQUIERT TRAIT : ${TRAITS[ch.req.trait]?.nom || ch.req.trait}</span>`;
    }
    if (ch.req?.skill) {
      const has = exp.crewIds.some(id => (S.crew.find(c => c.id === id)?.skills[ch.req.skill.key] || 0) >= ch.req.skill.min);
      extraHTML += `<span class="req ${has ? '' : 'locked'}">REQUIERT : ${SKILL_LABELS[ch.req.skill.key]} ≥ ${ch.req.skill.min}</span>`;
    }
    if (ch.req?.item) {
      const has = (exp.equipment?.[ch.req.item] || 0) > 0;
      const itDef = ITEMS[ch.req.item];
      extraHTML += `<span class="req ${has ? '' : 'locked'}">REQUIERT : ${itDef?.nom || ch.req.item}</span>`;
    }
    // Consume : sépare ressources et item
    if (ch.consume) {
      const resEntries = Object.entries(ch.consume).filter(([k]) => k !== 'item');
      if (resEntries.length > 0) {
        const parts = resEntries.map(([k,v]) => {
          const ko = (S.res[k] || 0) < v;
          return `<span class="${ko ? 'ko' : ''}">${RES_LABELS[k]} −${v}</span>`;
        }).join(' · ');
        extraHTML += `<span class="cost">COÛT : ${parts}</span>`;
      }
      if (ch.consume.item) {
        const itDef = ITEMS[ch.consume.item];
        const has = (exp.equipment?.[ch.consume.item] || 0) > 0;
        extraHTML += `<span class="cost ${has ? '' : 'ko'}" style="${has ? 'color:#b09bd0' : ''}">CONSOMME : ${itDef?.nom || ch.consume.item}</span>`;
      }
    }
    if (ch.risky) {
      extraHTML += `<span class="risk">RISQUÉ · jet de ${STAT_LABELS[ch.risky.stat]} (DC ${ch.risky.dc})</span>`;
    }
    return `<button class="scene-choice" data-choice="${i}" ${evalRes.available ? '' : 'disabled'}>
      ${ch.label}
      ${extraHTML}
    </button>`;
  }).join('');

  // Équipage actif
  const teamHTML = exp.crewIds.map(id => {
    const m = S.crew.find(c => c.id === id);
    if (!m) return '';
    const dead = m.statut === 'mort';
    const skillsTop = SKILL_LIST
      .map(s => ({ s, v: m.skills[s] || 0 }))
      .filter(x => x.v > 0)
      .sort((a,b) => b.v - a.v)
      .slice(0, 2)
      .map(x => `${SKILL_LABELS[x.s].slice(0,3)}${esc(x.v)}`)
      .join(' ') || '—';
    const traits = esc((m.traits || []).slice(0, 2).map(t => TRAITS[t]?.nom || t).join(', ') || '—');
    const healthCls = m.sante < 40 ? 'warn' : '';
    return `<div class="scene-team-row ${dead ? 'dead' : ''}">
      <span>${esc(m.name)}</span>
      <span class="row-info">santé <span class="v ${healthCls}">${esc(m.sante)}%</span> · ${skillsTop} · ${traits}</span>
    </div>`;
  }).join('');

  // Loot accumulé
  const lootEntries = Object.entries(exp.accumulatedLoot);
  const lootHTML = lootEntries.length === 0 && exp.accumulatedItems.length === 0
    ? `<div class="scene-loot empty">Aucune cargaison récoltée pour l'instant.</div>`
    : `<div class="scene-loot">
        <div class="lloot">${lootEntries.map(([k,v]) => `<span>${RES_LABELS[k] || esc(k)} <b>+${esc(v)}</b></span>`).join('')}</div>
        ${exp.accumulatedItems.length > 0 ? `<div class="litems">Items : ${exp.accumulatedItems.map(i => esc(itemDef(i)?.nom || i)).join(', ')}</div>` : ''}
      </div>`;

  // Équipement embarqué encore disponible (0.15)
  let equipHTML = '';
  if (exp.equipment) {
    const equipList = Object.entries(exp.equipment).filter(([_, n]) => n > 0);
    if (equipList.length > 0) {
      const items = equipList.map(([id, n]) => {
        const itDef = ITEMS[id];
        const ori = ITEM_ORIGINS[itDef?.origin] || { color: 'var(--text-mute)' };
        return `<span style="color:${ori.color}">${esc(itDef?.nom || id)}${n > 1 ? ` ×${esc(n)}` : ''}</span>`;
      });
      equipHTML = `<div class="scene-equip"><span class="lbl">Équipement embarqué :</span> ${items.join(' · ')}</div>`;
    }
  }

  // Mini-journal (3 dernières entrées)
  const mjHTML = exp.accumulatedLog.length === 0 ? '' : `
    <div class="scene-mini-journal">
      ${exp.accumulatedLog.slice(-3).map(line => `<div class="mj-line">› ${safeHTML(line)}</div>`).join('')}
    </div>
  `;

  $('#sceneInner').innerHTML = `
    <div class="scene-header">
      <div class="sh-loc">${esc(sys?.name || '?')} › ${esc(body?.name || '?')}</div>
      <div class="sh-title">${esc(sceneTitle)}</div>
      <div class="sh-sub">${esc(vessel?.name || '?')}${isChronScene ? '' : ` · scène ${esc(Number(exp.sceneIdx) + 1)} / ${exp.scenes.length}`}</div>
      <div class="sh-progress">${dots}</div>
    </div>
    <div class="scene-body">${safeHTML(text)}</div>
    <div class="scene-choices">${choicesHTML}</div>
    <div class="scene-team">
      <h4>Équipage présent</h4>
      <div class="scene-team-list">${teamHTML}</div>
    </div>
    ${equipHTML}
    ${lootHTML}
    ${mjHTML}
    <div class="scene-actions">
      <button class="scene-abandon" data-action-scene="abandon">Retraite anticipée</button>
      <span class="scene-info">Le temps de la colonie continue de tourner</span>
      <button class="scene-close" data-action-scene="close">Reprendre plus tard</button>
    </div>
  `;

  // Hooks
  $('#sceneInner').querySelectorAll('button[data-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.choice, 10);
      playChoice(_activeSceneExpId, idx);
      $('#sceneOverlay').scrollTop = 0;   // nouvelle scène : on repart du haut
      // Rafraîchit l'overlay (la scène a changé) ou ferme s'il a fini
      const exp = S.expeditions.find(e => e.id === _activeSceneExpId);
      if (!exp || exp.phase !== 'sur_place') {
        closeSceneOverlay();
      } else {
        renderSceneOverlay();
      }
    });
  });
  $('#sceneInner').querySelectorAll('button[data-action-scene]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.actionScene;
      if (a === 'close') {
        closeSceneOverlay();
      } else if (a === 'abandon') {
        const expId = _activeSceneExpId;
        confirmModal({
          titre: 'Retraite anticipée ?',
          texte: "L'équipe rentre immédiatement avec ce qu'elle a déjà récupéré.",
          confirmer: 'Rentrer', annuler: 'Rester', danger: true,
        }).then(ok => {
          if (!ok) return;
          abandonExpedition(expId);
          closeSceneOverlay();
        });
      }
    });
  });
  focusSceneOverlay();
}

// ============================================================
//   Modal de lancement d'expédition
// ============================================================
let _launchPick = { bodyId: null, vesselId: null, crewIds: new Set(), equipment: {} };

export function showLaunchModal(bodyId) {
  _launchPick = { bodyId, vesselId: null, crewIds: new Set(), equipment: {} };
  // Pré-sélectionne un vaisseau dispo si un seul
  const avail = S.fleet.filter(v => v.available);
  if (avail.length === 1) _launchPick.vesselId = avail[0].id;
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('launch-modal');
  m.innerHTML = renderLaunchModal();
  bg.classList.add('show');
  hookLaunchModal();
}

function renderLaunchModal() {
  // Trouve la planète cible
  let body = null, sys = null;
  for (const s of S.galaxy.systems) {
    const b = s.bodies.find(b => b.id === _launchPick.bodyId);
    if (b) { body = b; sys = s; break; }
  }
  if (!body) return '<h3>Erreur</h3><p>Destination introuvable.</p><div class="btn-row"><button id="launchClose">Fermer</button></div>';

  // Liste vaisseaux disponibles
  const avail = S.fleet.filter(v => v.available);
  let vesselHTML;
  if (avail.length === 0) {
    vesselHTML = '<div class="empty" style="padding:14px">Aucun vaisseau disponible. Construis-en un.</div>';
  } else {
    vesselHTML = `<div class="tpicker">${avail.map(v => {
      const def = vesselDef(v.type);
      const sel = v.id === _launchPick.vesselId ? 'selected' : '';
      return `<div class="tpicker-item ${sel}" data-pick-vessel="${esc(v.id)}" role="button" tabindex="0"${sel ? ' aria-pressed="true"' : ''}>
        <div class="pi-name">${esc(v.name)}</div>
        <div class="pi-detail">${esc(def.nom)} · ${def.places} places · cargo ${def.cargo}</div>
      </div>`;
    }).join('')}</div>`;
  }

  // Liste équipage — 0.23 : enrichie avec poste, statut, ETA des indispos
  // Disponibles : statut 'libre' OU 'travail' (postes persistants — un colon en poste peut partir)
  const available = S.crew.filter(c => c.statut === 'libre' || c.statut === 'travail');
  // Indispos : tous les autres sauf 'mort'
  const unavailable = S.crew.filter(c => c.statut !== 'libre' && c.statut !== 'travail' && c.statut !== 'mort');
  const vessel = avail.find(v => v.id === _launchPick.vesselId);
  const placesMax = vessel ? vesselDef(vessel.type).places : 0;

  // Fonction helper : ETA approximative selon le statut
  function eta(c) {
    if (c.statut === 'expedition') {
      const exp = (S.expeditions || []).find(e => e.crewIds && e.crewIds.includes(c.id));
      if (exp) {
        const remaining = Math.max(0, (exp.totalMin || 0) - (exp.elapsedMin || 0));
        return remaining > 0 ? ` (${fmtDuree(remaining)})` : '';
      }
      return '';
    }
    if (c.statut === 'formation') {
      const t = (S.training || []).find(t => t.memberId === c.id);
      if (t) {
        const remaining = Math.max(0, t.duration - (S.meta.gameMin - t.startedAt));
        return remaining > 0 ? ` (${fmtDuree(remaining)})` : '';
      }
      return '';
    }
    if (c.statut === 'diplomatie') {
      const dip = (S.diplomaticMissions || []).find(d => d.memberId === c.id);
      if (dip) {
        const remaining = Math.max(0, dip.duration - (S.meta.gameMin - dip.startedAt));
        return remaining > 0 ? ` (${fmtDuree(remaining)})` : '';
      }
      return '';
    }
    return '';
  }
  // Affiche le poste de base du colon
  function postLabel(c) {
    const a = memberAssignment(c.id);
    if (!a) return '';
    const def = MODULES[a.modKey];
    const jobs = jobsForModule(a.modKey);
    const job = jobs[a.slotIdx];
    if (!def || !job) return '';
    return `${job.label} · ${def.nom}`;
  }

  let crewHTML = '';
  if (available.length === 0 && unavailable.length === 0) {
    crewHTML = '<div class="empty" style="padding:14px">Aucun membre.</div>';
  } else {
    let availList = '';
    if (available.length > 0) {
      availList = `<div class="crew-section-label">Disponibles (${available.length})</div>
        <div class="crew-picker">${available.map(c => {
          const sel = _launchPick.crewIds.has(c.id) ? 'selected' : '';
          const dis = !sel && _launchPick.crewIds.size >= placesMax ? 'disabled' : '';
          const post = postLabel(c);
          const postHTML = post ? `<div class="pi-post">${post}</div>` : `<div class="pi-post" style="opacity:0.5">sans poste</div>`;
          const topSkills = SKILL_LIST
            .map(s => ({ s, v: c.skills[s] || 0 }))
            .filter(x => x.v > 0)
            .sort((a,b) => b.v - a.v)
            .slice(0, 3)
            .map(x => `${SKILL_LABELS[x.s].slice(0,3)} ${esc(x.v)}`)
            .join(' · ') || '—';
          return `<div class="crew-picker-item ${sel} ${dis}" data-pick-crew="${esc(c.id)}"${dis ? ' aria-disabled="true"' : ' tabindex="0"'} role="checkbox" aria-checked="${sel ? 'true' : 'false'}">
            <span class="checkbox"></span>
            <div class="pi-main">
              <div class="pi-name">${esc(c.name)}</div>
              ${postHTML}
              <div class="pi-detail">Santé ${esc(c.sante)}% · Moral ${esc(c.moral)}</div>
            </div>
            <div class="pi-skills">${topSkills}</div>
          </div>`;
        }).join('')}</div>`;
    }
    let unavailList = '';
    if (unavailable.length > 0) {
      unavailList = `<div class="crew-section-label muted">Indisponibles (${unavailable.length})</div>
        <div class="crew-picker muted">${unavailable.map(c => {
          let where = '';
          if (c.statut === 'expedition') where = 'en mission';
          else if (c.statut === 'infirmerie') where = "à l'infirmerie";
          else if (c.statut === 'formation') where = 'en formation';
          else if (c.statut === 'diplomatie') where = 'mission diplomatique';
          else where = c.statut;
          const post = postLabel(c);
          return `<div class="crew-picker-item unavailable" aria-disabled="true">
            <span class="checkbox dot">◌</span>
            <div class="pi-main">
              <div class="pi-name">${esc(c.name)}</div>
              <div class="pi-detail">${esc(where)}${eta(c)}${post ? ' · ' + post : ''}</div>
            </div>
          </div>`;
        }).join('')}</div>`;
    }
    crewHTML = availList + unavailList;
  }

  // Section équipement (0.15)
  let equipPickerHTML = '';
  if (vessel) {
    const def = vesselDef(vessel.type);
    const slots = def.equipSlots || 0;
    const used = Object.values(_launchPick.equipment).reduce((s, n) => s + n, 0);
    const fieldItems = Object.entries(S.inventory || {})
      .filter(([id, n]) => n > 0)
      .map(([id, n]) => ({ id, n, def: ITEMS[id] }))
      .filter(x => x.def && ['consumable', 'tool', 'weapon'].includes(x.def.type));
    if (slots === 0) {
      equipPickerHTML = `<div class="empty" style="padding:10px;font-size:11px">Pas de soute d'équipement sur ce vaisseau.</div>`;
    } else if (fieldItems.length === 0) {
      equipPickerHTML = `<div class="empty" style="padding:10px;font-size:11px">Aucun équipement fabricable en stock. Visite l'Atelier.</div>`;
    } else {
      const itemsList = fieldItems.map(({ id, n, def: itDef }) => {
        const taken = _launchPick.equipment[id] || 0;
        const ori = ITEM_ORIGINS[itDef.origin] || { color: 'var(--text-mute)' };
        const typeLabel = itDef.type === 'consumable' ? 'consommable' : itDef.type === 'tool' ? 'outil' : 'arme';
        return `<div class="equip-row">
          <div class="er-info" style="border-left-color:${ori.color}">
            <div class="er-name">${itDef.nom}</div>
            <div class="er-detail">${typeLabel} · stock ${esc(n - taken)}/${esc(n)}</div>
          </div>
          <div class="er-controls">
            <button class="er-btn" data-equip-minus="${id}" aria-label="Retirer : ${esc(itDef.nom)}" ${taken === 0 ? 'disabled' : ''}>−</button>
            <span class="er-count" aria-live="polite">${taken}</span>
            <button class="er-btn" data-equip-plus="${id}" aria-label="Ajouter : ${esc(itDef.nom)}" ${taken >= n || used >= slots ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
      }).join('');
      equipPickerHTML = `<div class="equip-picker">${itemsList}</div>`;
    }
  }
  const equipSlots = vessel ? (vesselDef(vessel.type).equipSlots || 0) : 0;
  const equipUsed = Object.values(_launchPick.equipment).reduce((s, n) => s + n, 0);

  // Estimation
  let estimateHTML = '';
  let canLaunch = false;
  if (_launchPick.vesselId && _launchPick.crewIds.size > 0) {
    const r = canLaunchExpedition({
      vesselId: _launchPick.vesselId,
      bodyId: _launchPick.bodyId,
      crewIds: Array.from(_launchPick.crewIds)
    });
    if (r.ok) {
      canLaunch = true;
      const threat = bodyThreatLevel(body);
      const reward = bodyRewardLevel(body);
      estimateHTML = `<div class="estimate">
        <div class="row"><span class="lbl">Distance</span><span class="val">${sys.distance.toFixed(2)} pc</span></div>
        <div class="row"><span class="lbl">Voyage aller</span><span class="val">${fmtDuree(r.oneWayMin)}</span></div>
        <div class="row"><span class="lbl">Sur place</span><span class="val">${fmtDuree(r.onSiteMin)}</span></div>
        <div class="row"><span class="lbl">Total</span><span class="val">${fmtDuree(r.totalMin)}</span></div>
        <div class="row"><span class="lbl">Carburant</span><span class="val">${r.fuel} énergie</span></div>
        <div class="row"><span class="lbl">Vivres</span><span class="val">${r.bio} biomasse</span></div>
        <div class="row"><span class="lbl">Menace estimée</span><span class="val ${threat>=4?'warn':''}">${'●'.repeat(threat)}${'○'.repeat(5-threat)}</span></div>
        <div class="row"><span class="lbl">Récompense potentielle</span><span class="val ok">${'●'.repeat(reward)}${'○'.repeat(5-reward)}</span></div>
      </div>`;
    } else {
      estimateHTML = `<div class="estimate"><div class="ko">${esc(r.why)}</div></div>`;
    }
  }

  return `
    <h3>Lancer une expédition</h3>
    <p style="margin-bottom:6px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">Destination</p>
    <div class="estimate" style="margin-bottom:12px">
      <div style="font-family:var(--serif);font-style:italic;color:var(--text);font-size:15px">${esc(body.name)}</div>
      <div style="color:var(--text-mute);font-size:11px;margin-top:2px">${esc(sys.name)} · ${BIOMES[body.biome]?.nom || ''} · ${nomOf(BODY_TYPES, body.type)}</div>
    </div>
    <p style="margin-bottom:6px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">Vaisseau</p>
    ${vesselHTML}
    <p style="margin-bottom:6px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">
      Équipage ${vessel ? `(${_launchPick.crewIds.size}/${placesMax})` : ''}
    </p>
    ${crewHTML}
    ${vessel ? `<p style="margin-bottom:6px;margin-top:14px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">
      Équipement (${equipUsed}/${equipSlots})
    </p>${equipPickerHTML}` : ''}
    ${estimateHTML}
    <div class="btn-row">
      <button id="launchClose">Annuler</button>
      <button class="primary" id="launchGo" ${canLaunch ? '' : 'disabled'}>Décoller</button>
    </div>
  `;
}

function hookLaunchModal() {
  const m = $('#modal');
  m.querySelectorAll('[data-pick-vessel]').forEach(el => {
    el.addEventListener('click', () => {
      _launchPick.vesselId = el.dataset.pickVessel;
      // Reset équipage si dépassait la capacité du nouveau vaisseau
      const vessel = S.fleet.find(v => v.id === _launchPick.vesselId);
      const cap = vesselDef(vessel.type).places;
      while (_launchPick.crewIds.size > cap) {
        const last = Array.from(_launchPick.crewIds).pop();
        _launchPick.crewIds.delete(last);
      }
      rerenderModal(renderLaunchModal(), hookLaunchModal);
    });
  });
  m.querySelectorAll('[data-pick-crew]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const id = el.dataset.pickCrew;
      if (_launchPick.crewIds.has(id)) _launchPick.crewIds.delete(id);
      else _launchPick.crewIds.add(id);
      rerenderModal(renderLaunchModal(), hookLaunchModal);
    });
  });
  // Hooks +/- équipement
  m.querySelectorAll('[data-equip-plus]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.equipPlus;
      _launchPick.equipment[id] = (_launchPick.equipment[id] || 0) + 1;
      rerenderModal(renderLaunchModal(), hookLaunchModal);
    });
  });
  m.querySelectorAll('[data-equip-minus]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.equipMinus;
      if (!_launchPick.equipment[id]) return;
      _launchPick.equipment[id]--;
      if (_launchPick.equipment[id] <= 0) delete _launchPick.equipment[id];
      rerenderModal(renderLaunchModal(), hookLaunchModal);
    });
  });
  $('#launchClose')?.addEventListener('click', () => {
    $('#modalBg').classList.remove('show');
    m.classList.remove('launch-modal');
  });
  $('#launchGo')?.addEventListener('click', () => {
    if (_launchPick.vesselId && _launchPick.crewIds.size > 0) {
      launchExpedition({
        vesselId: _launchPick.vesselId,
        bodyId: _launchPick.bodyId,
        crewIds: Array.from(_launchPick.crewIds),
        equipment: { ..._launchPick.equipment }
      });
      $('#modalBg').classList.remove('show');
      m.classList.remove('launch-modal');
    }
  });
}

// ============================================================
// Fenêtres : modale générique, confirmation, accessibilité, journal
// ============================================================

export function showModal({ title, body, primaryLabel='OK', primaryClass='primary', onPrimary, withInput=false, inputValue='', inputPlaceholder='', hideCancel=false, bodyIsHTML=false }) {
  const bg = $('#modalBg');
  const m = $('#modal');
  // title et body sont du texte (échappé) ; body n'est inséré tel quel que si
  // l'appelant le déclare explicitement HTML (bodyIsHTML: true).
  const bodyHTML = bodyIsHTML ? `<div class="modal-body">${body}</div>` : `<p>${esc(body)}</p>`;
  m.className = 'modal';   // pas de classe héritée d'une modale précédente
  m.innerHTML = `
    <h3>${esc(title)}</h3>
    ${bodyHTML}
    ${withInput ? `<input type="text" id="modalInput" value="${esc(inputValue)}" placeholder="${esc(inputPlaceholder)}" aria-label="${esc(title)}" enterkeyhint="done">` : ''}
    <div class="btn-row">
      ${hideCancel ? '' : `<button id="modalCancel" data-modal-cancel>Annuler</button>`}
      <button class="${esc(primaryClass)}" id="modalOk">${esc(primaryLabel)}</button>
    </div>
  `;
  bg.classList.add('show');
  const close = () => { bg.classList.remove('show'); m.className = 'modal'; };
  if (!hideCancel) $('#modalCancel').addEventListener('click', close);
  $('#modalOk').addEventListener('click', () => {
    const v = withInput ? $('#modalInput').value : null;
    close();
    onPrimary?.(v);
  });
  if (withInput) {
    // Entrée dans le champ = valider
    $('#modalInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#modalOk')?.click(); }
    });
    setTimeout(() => { const i = $('#modalInput'); i?.focus(); i?.select(); }, 50);
  }
}

// ============================================================
//   CONFIRMATION — fenêtre du jeu à la place de confirm()
// ============================================================
// confirmModal({ titre, texte, confirmer, annuler, danger }) → Promise<boolean>
// Échap, « Annuler » ou une autre fenêtre qui prend la place : false.
// Au-dessus de l'écran de scène et du menu (même calque que les modales).
let _confirmResolve = null;
export function confirmModal({ titre = 'Confirmer ?', texte = '', confirmer = 'Confirmer', annuler = 'Annuler', danger = false } = {}) {
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  const bg = $('#modalBg');
  const m = $('#modal');
  if (!bg || !m) return Promise.resolve(false);
  return new Promise(resolve => {
    _confirmResolve = resolve;
    m.className = 'modal confirm-modal';
    m.innerHTML = `
      <h3>${esc(titre)}</h3>
      ${texte ? `<p>${esc(texte)}</p>` : ''}
      <div class="btn-row">
        <button id="confirmNo" data-modal-cancel>${esc(annuler)}</button>
        <button id="confirmYes" class="${danger ? 'danger' : 'primary'}">${esc(confirmer)}</button>
      </div>`;
    let obs = null;
    const done = v => {
      if (_confirmResolve !== resolve) return;
      _confirmResolve = null;
      obs?.disconnect();
      bg.classList.remove('show');
      resolve(v);
    };
    $('#confirmYes').addEventListener('click', () => done(true));
    $('#confirmNo').addEventListener('click', () => done(false));
    bg.classList.add('show');
    // Contenu remplacé (autre fenêtre) ou fermeture externe : réponse « non »
    obs = new MutationObserver(() => {
      if (!bg.classList.contains('show') || !m.querySelector('#confirmYes')) {
        obs.disconnect();
        if (_confirmResolve === resolve) { _confirmResolve = null; resolve(false); }
      }
    });
    obs.observe(m, { childList: true });
    obs.observe(bg, { attributes: true, attributeFilter: ['class'] });
    $('#confirmYes').focus({ preventScroll: true });
  });
}

// ============================================================
//   MODALE ET OVERLAY — accessibilité commune
// ============================================================
// #modal est rempli par de nombreuses fonctions (ici et dans app.js) qui
// ajoutent ou retirent .show sur #modalBg. Un MutationObserver applique les
// comportements communs à chaque ouverture/fermeture, sans toucher aux appelants :
//  - titre du dialogue (aria-labelledby → premier h3), focus initial ;
//  - Tab / Maj+Tab restent dans la modale (ou dans l'overlay de scène) ;
//  - Échap ferme SEULEMENT si la modale propose une sortie (Annuler, Fermer,
//    Continuer) ; jamais pour une décision obligatoire (incident, événement) ;
//  - l'arrière-plan est rendu inerte, le focus revient ensuite sur
//    l'élément qui avait ouvert la modale.
// Boutons reconnus comme « sortie » : attribut data-modal-cancel, ou l'un
// des identifiants ci-dessous (modales existantes, dont celles d'app.js).
const MODAL_CANCEL = '[data-modal-cancel], #modalCancel, #pickerCancel, #diploCancel, #researchCancel, #fabCancel, #launchClose, #trainCancel, #alertsClose, #synClose, #consContinue, #confirmNo';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let _modalOpener = null;

const modalShown = () => !!$('#modalBg')?.classList.contains('show');
const overlayShown = () => !!$('#sceneOverlay')?.classList.contains('show');
function focusablesIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => el.getClientRects().length && el.getAttribute('aria-disabled') !== 'true');
}
function setInert(el, on) {
  if (!el) return;
  if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
}
// Arrière-plan inerte : #app sous l'overlay et sous le menu ; #app, l'overlay
// et le menu sous la modale
function syncInert() {
  const modal = modalShown();
  setInert($('#app'), modal || overlayShown() || sheetShown());
  setInert($('#sceneOverlay'), modal);
  setInert($('#menuBg'), modal || (overlayShown() && !sheetShown()));
}
function labelModal() {
  const m = $('#modal');
  const h = m?.querySelector('h3, .incident-title');
  if (!h) { m?.removeAttribute('aria-labelledby'); return; }
  if (!h.id) h.id = 'modalTitle';
  m.setAttribute('aria-labelledby', h.id);
}
function onModalOpen() {
  const m = $('#modal');
  const active = document.activeElement;
  if (active && active !== document.body && !m.contains(active)) _modalOpener = active;
  labelModal();
  syncInert();
  // Focus initial : le champ s'il y en a un (showModal s'en charge), sinon le dialogue
  if (!m.contains(document.activeElement)) {
    (m.querySelector('input[type="text"]') || m).focus({ preventScroll: true });
  }
}
function onModalClose() {
  const m = $('#modal');
  if (m) m.className = 'modal';
  syncInert();
  const back = _modalOpener;
  _modalOpener = null;
  if (back && sheetShown() && $('#menuSheet').contains(back) && back.isConnected) {
    back.focus({ preventScroll: true });
    return;
  }
  if (overlayShown()) {
    const inner = $('#sceneInner');
    if (!inner.contains(document.activeElement)) (focusablesIn(inner)[0] || inner).focus?.({ preventScroll: true });
    return;
  }
  if (back && back.isConnected && back.getClientRects().length && !back.closest('[inert]')) {
    back.focus({ preventScroll: true });
  }
}
{
  const bg = $('#modalBg');
  const m = $('#modal');
  if (bg && m && typeof MutationObserver !== 'undefined') {
    let wasShown = bg.classList.contains('show');
    new MutationObserver(() => {
      const shown = bg.classList.contains('show');
      if (shown === wasShown) return;
      wasShown = shown;
      if (shown) onModalOpen(); else onModalClose();
    }).observe(bg, { attributes: true, attributeFilter: ['class'] });
    // Contenu remplacé pendant que la modale est ouverte : titre et focus
    new MutationObserver(() => {
      if (!bg.classList.contains('show')) return;
      labelModal();
      if (!m.contains(document.activeElement)) m.focus({ preventScroll: true });
    }).observe(m, { childList: true });
  }
}

document.addEventListener('keydown', e => {
  const inModal = modalShown();
  const inSheet = !inModal && sheetShown();
  const container = inModal ? $('#modal') : inSheet ? $('#menuSheet') : overlayShown() ? $('#sceneInner') : null;
  if (!container) return;
  if (e.key === 'Escape') {
    if (inSheet) { e.preventDefault(); closeMenu(); return; }
    const exit = inModal
      ? container.querySelector(MODAL_CANCEL)
      : container.querySelector('[data-action-scene="close"]');
    if (exit && !exit.disabled) { e.preventDefault(); exit.click(); }
    return;
  }
  if (e.key !== 'Tab') return;
  // Piège du focus : Tab et Maj+Tab bouclent à l'intérieur du dialogue
  const items = focusablesIn(container);
  if (!items.length) { e.preventDefault(); container.focus?.(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const cur = document.activeElement;
  if (!container.contains(cur) || cur === container) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && cur === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && cur === last) {
    e.preventDefault(); first.focus();
  }
});

// Ré-affiche le contenu d'une modale ouverte (sélecteurs de lancement et de
// formation) en conservant le défilement et l'élément qui avait le focus.
export function rerenderModal(html, hook) {
  const m = $('#modal');
  const scrolls = [m.scrollTop, ...Array.from(m.querySelectorAll('.crew-picker, .tpicker, .equip-picker, .assign-picker-list')).map(el => el.scrollTop)];
  const active = document.activeElement;
  let focusSel = null;
  if (active && m.contains(active)) {
    if (active.id) focusSel = '#' + CSS.escape(active.id);
    else {
      const attr = Array.from(active.attributes).find(a => a.name.startsWith('data-pick-') || a.name.startsWith('data-equip-'));
      if (attr) focusSel = `[${attr.name}="${CSS.escape(attr.value)}"]`;
    }
  }
  m.innerHTML = html;
  hook();
  m.scrollTop = scrolls[0];
  Array.from(m.querySelectorAll('.crew-picker, .tpicker, .equip-picker, .assign-picker-list')).forEach((el, i) => {
    if (scrolls[i + 1] !== undefined) el.scrollTop = scrolls[i + 1];
  });
  const target = focusSel && m.querySelector(focusSel);
  if (target && !target.disabled) target.focus({ preventScroll: true });
}

export function log(kind, txt) {
  S.journal.push({ t: S.meta.gameMin, kind, txt });
  // Limite à 200 entrées pour éviter l'inflation
  if (S.journal.length > 200) S.journal = S.journal.slice(-200);
}

// ============================================================
// 10. BOOT
// ============================================================

export function seedJournal() {
  S.journal = [];
  log('neutral', "Largage réussi. La capsule s'est posée sur un plateau rocheux balayé par le vent. Le module de commandement est en ligne.");
  log('neutral', "Le ciel est d'un bleu sombre, presque noir. Le soleil local est petit, distant, mais suffisant pour les voilures.");
  log('neutral', "Premier objectif : <em>générateur solaire</em>, <em>mine de surface</em>, <em>hydroponie</em>.");
  log('neutral', "Une fois <em>Habitat</em> érigé, déployer une <em>Balise de recrutement</em> pour attirer un équipage.");
  // Mention discrète de la galaxie
  const homeSys = S.galaxy?.systems.find(s => s.distance < 0.8);
  if (homeSys) {
    log('neutral', `Cartographie locale : nous sommes dans le système <em>${esc(homeSys.name)}</em>. Une <em>Antenne longue portée</em> permettra de scanner les voisins.`);
  }
}

