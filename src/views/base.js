// views/base.js — onglet « Base » : tableau de bord « À faire »,
// construction (filtres, file de chantiers) et postes (affectations).

import { $ } from '../util.js';
import { RES_LABELS, RESOURCES, SKILL_LIST, SKILL_LABELS } from '../constants.js';
import { MODULES, MODULE_JOBS, TECH_TREE, FABRICATIONS } from '../catalog.js';
// Imports d'espace de noms : un export renommé par le moteur narratif ne casse pas le chargement
import * as Chron from '../chronicles.js';
import { S, computeRates, capOf, buildTime, aliveCrew, startBuild } from '../state.js';
import {
  moduleEfficiency, jobsForModule, jobKey, isEligibleForJob, jobReqText,
  memberAssignment, memberAt, assignMember, unassignMember, autoAssignAllFreeMembers,
  ROLES, ancienneteBonus, techEffectsAccumulated, laboratoryBonuses, automationFloor,
  workshopBonuses, STATUTS, TRAINING_PROGRAMS,
} from '../app.js';
import {
  App, appCall, hasApp, esc, fmt, fmtDuree, setHTML, progressHTML, emptyState, filterChips,
  getFilter, setFilter, isOpen, fmtRate, calendar, etaTicks,
  vesselDef, accord, plur, TICKS_PER_HOUR,
} from './common.js';
import { getObjectives } from '../objectives.js';
import { toast, render, log, confirmModal, navigateTo, flash } from '../ui.js';

// ============================================================
//   Données partagées avec les autres vues
// ============================================================

// Titre lisible d'une décision en attente (incident ou événement)
export function decisionTitle(dec) {
  if (!dec) return '';
  const table = dec.kind === 'incident' ? App.INCIDENTS : App.COLONY_EVENTS;
  return table?.[dec.refId]?.titre || table?.[dec.refId]?.title || (dec.kind === 'incident' ? 'Incident' : 'Événement de colonie');
}

// Expéditions qui attendent un choix du joueur
export function awaitingExpeditions() {
  return (S.expeditions || []).filter(e => e.phase === 'sur_place' && e.awaitingChoice);
}

export function bodyById(bodyId) {
  for (const sys of S.galaxy?.systems || []) {
    const b = sys.bodies?.find(x => x.id === bodyId);
    if (b) return { sys, body: b };
  }
  return { sys: null, body: null };
}

// Chroniques planétaires : App.listChronicles(S) si présent, sinon lecture
// des corps de la galaxie qui portent une chronique.
export function chroniclesList() {
  const list = appCall('listChronicles', [S], null);
  if (Array.isArray(list)) return list;
  const out = [];
  for (const sys of S.galaxy?.systems || []) {
    for (const b of sys.bodies || []) {
      const ch = b.chronicle;
      if (!ch?.id) continue;
      const def = Chron.CHRONICLES?.[ch.id];
      const episodes = def?.episodes?.length || 0;
      const onSite = (S.expeditions || []).some(e => e.bodyId === b.id);
      out.push({
        id: ch.id,
        titre: def?.nom || ch.id,
        lieu: { systemId: sys.id, bodyId: b.id, nom: b.name, systeme: sys.name },
        etat: ch.completed ? 'terminee' : onSite ? 'en_cours' : (ch.episodeIdx || 0) === 0 ? 'decouverte' : 'prete',
        episode: Math.min(episodes, (ch.episodeIdx || 0) + (ch.completed ? 0 : 1)),
        episodes,
        prochainDans: null,
        fin: ch.completed ? (ch.ending || 'completed') : null,
      });
    }
  }
  return out;
}

// Blessés graves sans soin (statut sévère ou mortel non traité)
export function woundedUntreated() {
  return (S.crew || []).filter(m => m.statut !== 'mort' && m.statut !== 'infirmerie' && (m.statuts || []).some(s => {
    const def = STATUTS[s.key];
    return def ? (def.severity >= 3 || def.untreated?.become === 'mort') : (s.severity === 'grave' || s.severity === 'critique');
  }));
}

// Pénuries : App.shortages() si présent (forme tolérée : chaînes ou objets)
export function shortagesList() {
  const raw = appCall('shortages', [], null);
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'object') {
      return Object.entries(raw).filter(([, v]) => v).map(([k, v]) => ({ res: k, text: typeof v === 'string' ? v : `${RES_LABELS[k] || k} en pénurie` }));
    }
    return [];
  }
  return raw.map(s => {
    if (typeof s === 'string') return { res: RESOURCES.includes(s) ? s : null, text: RESOURCES.includes(s) ? `${RES_LABELS[s]} en pénurie` : s };
    const res = s?.res ?? s?.ressource ?? s?.resource ?? null;
    return { res, text: s?.texte ?? s?.text ?? s?.message ?? s?.label ?? `${RES_LABELS[res] || res || 'Ressource'} en pénurie`, critical: !!(s?.critique ?? s?.critical) };
  });
}

// Vitesse estimée d'une recherche (avancement par tick) avant mesure
export function researchRate0(techId) {
  try {
    const lb = laboratoryBonuses();
    const auto = lb.activeProd ? 1 : automationFloor();
    let mod = 1;
    for (const id of Object.keys(S.modules || {})) {
      const def = MODULES[id];
      if (def?.researchSpeedBonus && S.modules[id]?.level > 0) mod += def.researchSpeedBonus(S.modules[id].level);
    }
    let r = auto * mod / (lb.speedMult || 1);
    if (TECH_TREE[techId]?.branch === 'bio') r *= lb.bioBonus || 1;
    return r > 0 ? r : 1;
  } catch { return 1; }
}
// Temps restant réel d'une recherche en cours
export function researchRemaining(r) {
  const eta = appCall('researchEta', [r.techId], null);
  if (Number.isFinite(eta) && eta >= 0) return eta;
  if (eta && typeof eta === 'object' && Number.isFinite(eta.restant ?? eta.remaining)) return eta.restant ?? eta.remaining;
  return etaTicks('res:' + r.id, r.doneMin, r.totalMin, researchRate0(r.techId));
}
export function fabRemaining(f) {
  let rate0 = 1;
  try {
    const b = workshopBonuses();
    rate0 = (b.hasArtisan ? 1 : automationFloor()) / (b.speedMult || 1);
  } catch { rate0 = 1; }
  return etaTicks('fab:' + f.id, f.doneMin, f.totalMin, rate0);
}

// Libellé d'une phase d'expédition et temps restant de la phase
export function expeditionPhase(exp) {
  let total, label;
  if (exp.phase === 'aller') { total = exp.oneWayMin; label = 'En route'; }
  else if (exp.phase === 'sur_place') { total = exp.onSiteMin; label = 'Sur place'; }
  else { total = exp.oneWayMin; label = 'Retour'; }
  const pct = total > 0 ? Math.min(100, (exp.elapsedMin / total) * 100) : 0;
  return { label, pct, remaining: Math.max(0, (total || 0) - (exp.elapsedMin || 0)) };
}

// ============================================================
//   TABLEAU DE BORD « À FAIRE »
// ============================================================
export function renderDashboard() {
  renderDashHead();
  renderAttention();
  renderObjectives();
  renderActivity();
  renderResourcesSummary();
}

function renderDashHead() {
  const c = calendar(S.meta.gameMin);
  const alive = aliveCrew().length;
  const cmd = S.modules.commandement?.level || 1;
  setHTML($('#dashHead'), `
    <h1 class="head">${esc(S.meta.colonyName)}</h1>
    <div class="subhead">Jour ${c.jour} · ${alive ? plur(alive, 'colon') : 'aucun colon'} · Commandement niv. ${esc(cmd)}</div>`);
}

// ---- Ce qui demande le joueur ----
export function attentionItems() {
  const items = [];
  const pend = Array.isArray(S.pendingDecisions) ? S.pendingDecisions.filter(Boolean) : [];
  if (pend.length > 0) {
    items.push({
      key: 'decision', crit: pend.some(d => d.kind === 'incident'),
      titre: pend.length > 1 ? `${pend.length} décisions en attente` : 'Une décision t\'attend',
      detail: decisionTitle(pend[0]),
      btn: { label: 'Décider', attrs: 'data-open-decision="1"' },
    });
  }
  for (const exp of awaitingExpeditions()) {
    const { body } = bodyById(exp.bodyId);
    const isChron = !!exp.chronicleSceneId || exp.scenes?.[0] === '__chron_intro__';
    items.push({
      key: 'exp:' + exp.id, crit: !!exp.combat?.active,
      titre: `${body?.name || 'Expédition'} : l'équipe attend tes ordres`,
      detail: exp.combat?.active ? `Combat en cours · round ${exp.combat.round}`
        : isChron ? 'Chronique · décision attendue' : `Scène ${Number(exp.sceneIdx) + 1}/${exp.scenes?.length || '?'} · décision attendue`,
      btn: { label: 'Reprendre', attrs: `data-reprendre="${esc(exp.id)}"` },
    });
  }
  // Chronique prête : le bouton ouvre directement le lancement vers sa planète
  for (const c of chroniclesList()) {
    if (c.etat !== 'prete') continue;
    items.push({
      key: 'chron:' + c.id,
      titre: `La suite est prête : ${c.titre}`,
      detail: `${c.lieu?.nom || ''}${c.episode ? ` · épisode ${c.episode}${c.episodes ? '/' + c.episodes : ''}` : ''}`,
      btn: { label: 'Lancer', attrs: `data-launch-body="${esc(c.lieu?.bodyId || '')}"` },
    });
  }
  // Retours d'expédition (pendant une absence aussi) : bilan à lire
  const bilans = appCall('unreadReports', [], []) || [];
  if (bilans.length) {
    const h = bilans[0];
    items.push({
      key: 'bilan:' + h.expId,
      titre: bilans.length > 1 ? `${bilans.length} retours d'expédition` : `Retour d'expédition : ${h.bodyName}`,
      detail: bilans.length > 1 ? bilans.slice(0, 3).map(x => x.bodyName).join(', ') : 'Le bilan t\'attend.',
      btn: bilans.length > 1
        ? { label: 'Voir', attrs: 'data-goto="expeditions/missions"' }
        : { label: 'Bilan', attrs: `data-bilan="${esc(h.expId)}"` },
    });
  }
  const wounded = woundedUntreated();
  if (wounded.length > 0) {
    const one = wounded.length === 1 ? wounded[0] : null;
    items.push({
      key: 'wounded', crit: true,
      titre: wounded.length > 1 ? `${wounded.length} blessés graves sans soin` : `${one.name} : blessure grave sans soin`,
      detail: wounded.length > 1 ? wounded.map(m => m.name).join(', ') : 'Chaque heure compte.',
      btn: one && hasApp('soigner') && one.statut !== 'expedition'
        ? { label: 'Soigner', attrs: `data-soigner="${esc(one.id)}"` }
        : { label: 'Soins', attrs: 'data-goto="equipage/soins"' },
    });
  }
  const nCand = (S.candidates || []).length;
  if (nCand > 0) {
    items.push({
      key: 'cand',
      titre: nCand > 1 ? `${nCand} candidats attendent une réponse` : 'Un candidat attend une réponse',
      detail: S.candidates.slice(0, 3).map(c => c.name).join(', ') + (nCand > 3 ? '…' : ''),
      btn: { label: 'Voir', attrs: 'data-goto="equipage/recrutement"' },
    });
  }
  return items;
}

function renderAttention() {
  const items = attentionItems();
  const html = items.length === 0 ? '' : `
    <h2 class="eyebrow">Demande ton attention</h2>
    <div class="attn-list">${items.map(it => `
      <div class="attn-card${it.crit ? ' crit' : ''}" data-id="${esc(it.key)}">
        <div class="attn-text">
          <div class="attn-title">${esc(it.titre)}</div>
          ${it.detail ? `<div class="attn-detail">${esc(it.detail)}</div>` : ''}
        </div>
        <button type="button" class="attn-btn" ${it.btn.attrs}>${esc(it.btn.label)}</button>
      </div>`).join('')}
    </div>`;
  setHTML($('#dashAttention'), html);
}

// ---- Objectifs ----
const OBJ_LABEL = { base: 'Construire', equipage: 'Équipage', expeditions: 'Expéditions', recits: 'Récits', labo: 'Labo' };
function renderObjectives() {
  let objs = [];
  try { objs = getObjectives(S); } catch (err) { console.error('[objectifs]', err); }
  if (!objs.length) { setHTML($('#dashObjectives'), ''); return; }
  setHTML($('#dashObjectives'), `
    <h2 class="eyebrow">Objectifs</h2>
    <div class="obj-list">${objs.map(o => {
      const a = o.action || {};
      const target = [a.onglet, a.sousOnglet].filter(Boolean).join('/');
      const prog = o.progression && o.progression.total > 0
        ? `<div class="obj-prog" aria-hidden="true"><span style="width:${Math.round(100 * o.progression.n / o.progression.total)}%"></span></div>` : '';
      return `<div class="obj-card ${esc(o.source || '')}${o.fait ? ' done' : ''}" data-id="${esc(o.id)}">
        <div class="obj-text">
          ${o.source === 'fil' ? `<div class="obj-kicker">Fil rouge · ${esc(o.fil || "L'Avant-poste")}</div>` : o.source === 'urgence' ? '<div class="obj-kicker crit">Urgent</div>' : ''}
          <div class="obj-title">${esc(o.titre)}</div>
          ${o.detail ? `<div class="obj-detail">${esc(o.detail)}</div>` : ''}
          ${prog}
        </div>
        <button type="button" class="obj-btn" data-goto="${esc(target)}"${a.cible ? ` data-cible="${esc(a.cible)}"` : ''}>${esc(a.label || OBJ_LABEL[a.onglet] || 'Aller')} <span aria-hidden="true">→</span></button>
      </div>`;
    }).join('')}</div>`);
}

// ---- Activités en cours ----
export function activityRows() {
  const rows = [];
  const gm = S.meta.gameMin || 0;
  if (S.build) {
    const b = S.build;
    const pct = b.totalMin > 0 ? (b.doneMin / b.totalMin) * 100 : 0;
    rows.push({ key: 'build', kind: 'Chantier', title: `${MODULES[b.id]?.nom || b.id} → niv. ${b.targetLevel}`, pct, rest: Math.max(0, b.totalMin - b.doneMin), goto: 'base/construction' });
  }
  (Array.isArray(S.buildQueue) ? S.buildQueue : []).forEach((q, i) => {
    rows.push({ key: 'bq:' + i, kind: 'En file', title: `${MODULES[q?.id]?.nom || q?.id} → niv. ${q?.targetLevel ?? '?'}`, queued: true, goto: 'base/construction' });
  });
  for (const r of S.research || []) {
    const pct = r.totalMin > 0 ? (r.doneMin / r.totalMin) * 100 : 0;
    rows.push({ key: 'res:' + r.id, kind: 'Recherche', title: TECH_TREE[r.techId]?.nom || r.techId, pct, rest: researchRemaining(r), goto: 'labo/recherche' });
  }
  (Array.isArray(S.researchQueue) ? S.researchQueue : []).forEach((t, i) => {
    const id = typeof t === 'string' ? t : t?.techId;
    rows.push({ key: 'rq:' + i, kind: 'En file', title: TECH_TREE[id]?.nom || id, queued: true, goto: 'labo/recherche' });
  });
  for (const f of S.fabrication || []) {
    const pct = f.totalMin > 0 ? (f.doneMin / f.totalMin) * 100 : 0;
    rows.push({ key: 'fab:' + f.id, kind: 'Atelier', title: FABRICATIONS[f.fabId]?.nom || f.fabId, pct, rest: fabRemaining(f), goto: 'labo/atelier' });
  }
  for (const t of S.training || []) {
    if (!t) continue;
    const m = S.crew.find(c => c.id === t.memberId);
    const pct = t.totalMin > 0 ? (t.doneMin / t.totalMin) * 100 : 0;
    rows.push({ key: 'tr:' + t.id, kind: 'Formation', title: `${m?.name || '?'} · ${TRAINING_PROGRAMS[t.skill]?.nom || SKILL_LABELS[t.skill] || t.skill}`, pct, rest: Math.max(0, t.totalMin - t.doneMin), goto: 'equipage/formation' });
  }
  for (const t of S.treatments || []) {
    if (!t) continue;
    const m = S.crew.find(c => c.id === t.memberId);
    const pct = t.totalMin > 0 ? (t.doneMin / t.totalMin) * 100 : 0;
    rows.push({ key: 'tt:' + (t.id || t.memberId + ':' + t.statusIdx), kind: 'Soins', title: m?.name || '?', pct, rest: Math.max(0, t.totalMin - t.doneMin), goto: 'equipage/soins' });
  }
  if (S.vesselBuild) {
    const v = S.vesselBuild;
    const pct = v.totalMin > 0 ? (v.doneMin / v.totalMin) * 100 : 0;
    rows.push({ key: 'vb', kind: 'Hangar', title: `${vesselDef(v.type).nom} sur cale`, pct, rest: Math.max(0, v.totalMin - v.doneMin), goto: 'expeditions/vaisseaux' });
  }
  for (const exp of S.expeditions || []) {
    const { body } = bodyById(exp.bodyId);
    const ph = expeditionPhase(exp);
    const waiting = exp.phase === 'sur_place' && exp.awaitingChoice;
    rows.push({
      key: 'exp:' + exp.id, kind: ph.label, title: body?.name || 'Expédition',
      pct: waiting ? null : ph.pct, rest: waiting ? null : ph.remaining,
      waiting, expId: exp.id, goto: 'expeditions/missions',
    });
  }
  for (const mis of S.diplomaticMissions || []) {
    const f = S.factions?.[mis.factionId];
    const elapsed = gm - (mis.startedAt || 0);
    rows.push({ key: 'dip:' + mis.id, kind: 'Diplomatie', title: f?.name || 'Mission', pct: mis.duration > 0 ? (elapsed / mis.duration) * 100 : 0, rest: Math.max(0, (mis.duration || 0) - elapsed), goto: 'expeditions/diplomatie' });
  }
  return rows;
}

function renderActivity() {
  const rows = activityRows();
  let html = '<h2 class="eyebrow">En cours</h2>';
  if (rows.length === 0) {
    html += emptyState('Aucune activité. Les heures passent sans que rien ne se construise.', { goto: 'base/construction', label: 'Lancer un chantier' });
  } else {
    if (!S.build) {
      html += `<div class="act-idle"><span>Aucun chantier en cours.</span><button type="button" class="link-btn" data-goto="base/construction">Construire →</button></div>`;
    }
    html += '<div class="act-list">' + rows.map(r => {
      const label = r.queued ? 'en file' : r.waiting ? 'décision attendue' : `reste ${fmtDuree(r.rest)}`;
      return `<div class="act-row${r.queued ? ' queued' : ''}${r.waiting ? ' waiting' : ''}" data-id="${esc(r.key)}">
        <div class="act-head">
          <span class="act-kind">${esc(r.kind)}</span>
          <span class="act-title">${esc(r.title)}</span>
          ${r.waiting
            ? `<button type="button" class="act-go" data-reprendre="${esc(r.expId)}">Reprendre</button>`
            : `<button type="button" class="act-go ghost" data-goto="${esc(r.goto)}" aria-label="Voir : ${esc(r.title)}"><span class="act-eta">${esc(label)}</span> <span aria-hidden="true">›</span></button>`}
        </div>
        ${r.pct !== null && r.pct !== undefined && !r.queued ? progressHTML(r.pct, '', 'thin') : ''}
      </div>`;
    }).join('') + '</div>';
  }
  setHTML($('#dashActivity'), html);
}

// ---- Ressources : production nette réelle ----
function renderResourcesSummary() {
  const rate = computeRates();
  const short = shortagesList();
  const rows = RESOURCES.map(k => {
    const cur = S.res[k] || 0;
    const cap = capOf(k);
    const r = rate[k] || 0;
    let eta = '';
    if (r > 0 && cur < cap) eta = `plein dans ${fmtDuree((cap - cur) / r)}`;
    else if (r > 0) eta = 'plein';
    else if (r < 0 && cur > 0) eta = `vide dans ${fmtDuree(cur / -r)}`;
    else if (r < 0) eta = 'à sec';
    const pct = cap > 0 ? Math.min(100, (cur / cap) * 100) : 0;
    const cls = r > 0.0001 ? 'pos' : r < -0.0001 ? 'neg' : '';
    const warn = (r < 0 && cur / -r < 3600) || short.some(s => s.res === k);
    return `<div class="rs-row${warn ? ' warn' : ''}" data-r="${k}">
      <span class="rs-lbl">${RES_LABELS[k]}</span>
      <span class="rs-val">${fmt(cur)}<small>/${fmt(cap)}</small></span>
      <span class="rs-rate ${cls}">${fmtRate(r)}</span>
      <span class="rs-eta">${esc(eta)}</span>
      <span class="rs-bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span>
    </div>`;
  }).join('');
  const shortHTML = short.length ? `<div class="rs-alert" role="alert">${short.map(s => `<div>⚠ ${esc(s.text)}</div>`).join('')}</div>` : '';
  setHTML($('#dashResources'), `
    <h2 class="eyebrow">Ressources · bilan réel</h2>
    ${shortHTML}
    <div class="rs-table">${rows}</div>
    <div class="rs-foot">Production moins consommation, par heure réelle, personnel et effets compris.</div>`);
}

// ============================================================
//   CONSTRUCTION
// ============================================================

// Production réelle : on évalue computeRates() sur un état modifié puis
// restauré (même formule que la simulation, personnel et bonus compris).
function ratesWith(mutate) {
  const undo = mutate();
  try { return computeRates(); } finally { undo(); }
}
function withLevel(id, level) {
  return () => {
    const had = Object.prototype.hasOwnProperty.call(S.modules, id);
    const prev = S.modules[id];
    if (level > 0) {
      const clone = { ...(prev || {}), level };
      if (clone.disabledUntil && clone.disabledUntil <= (S.meta.gameMin || 0)) delete clone.disabledUntil;
      S.modules[id] = clone;
    } else {
      delete S.modules[id];
    }
    return () => { if (had) S.modules[id] = prev; else delete S.modules[id]; };
  };
}
function withoutStaff(id) {
  return () => {
    const saved = {};
    for (const k of Object.keys(S.assignments || {})) {
      if (k.startsWith(id + ':')) { saved[k] = S.assignments[k]; delete S.assignments[k]; }
    }
    return () => Object.assign(S.assignments, saved);
  };
}
const diff = (a, b) => Object.fromEntries(RESOURCES.map(k => [k, (a[k] || 0) - (b[k] || 0)]));

// Les productions ne changent qu'avec les bâtiments, les postes, les techs ou
// les effets temporaires : on ne les recalcule que si cette empreinte change
// (sinon la vue Construction coûterait des dizaines de computeRates par tick).
let _yieldCache = { sig: '', map: new Map() };
function yieldSig() {
  const gm = S.meta.gameMin || 0;
  const mods = Object.entries(S.modules || {}).map(([k, m]) => `${k}${m?.level}${m?.disabledUntil > gm ? 'x' : ''}`).sort().join();
  const asg = Object.entries(S.assignments || {}).map(([k, v]) => k + v).sort().join();   // trié : withoutStaff() réordonne les clés
  const work = (S.crew || []).filter(m => m.statut === 'travail').length;
  return [mods, asg, work, Object.keys(S.techCompleted || {}).length,
    (S.activeBuffs || []).filter(b => b.expiresAt > gm).length, Math.floor(gm / 600)].join('|');
}

// Contribution d'un module : maintenant, sans personnel, au niveau suivant
// À appeler une fois par rendu (renderConstruction) : vide le cache si l'état a changé
export function refreshYieldCache() {
  const sig = yieldSig();
  if (sig !== _yieldCache.sig || _yieldCache.s !== S) _yieldCache = { sig, s: S, map: new Map() };
}
export function moduleYield(id, nextLevel) {
  if (_yieldCache.s !== S) refreshYieldCache();
  const key = id + ':' + nextLevel;
  let v = _yieldCache.map.get(key);
  if (!v) { v = computeYield(id, nextLevel); _yieldCache.map.set(key, v); }
  return v;
}
function computeYield(id, nextLevel) {
  const cur = S.modules[id]?.level || 0;
  const without = ratesWith(withLevel(id, 0));
  const now = cur > 0 ? diff(computeRates(), without) : null;
  const bare = cur > 0 && (MODULE_JOBS[id] || []).length ? diff(ratesWith(withoutStaff(id)), without) : null;
  const next = nextLevel ? diff(ratesWith(withLevel(id, nextLevel)), without) : null;
  return { now, bare, next };
}

function yieldHTML(id, y, nextLevel) {
  const keys = RESOURCES.filter(k => [y.now, y.next].some(d => d && Math.abs(d[k] || 0) * TICKS_PER_HOUR >= 0.05));
  if (!keys.length) return '';
  return `<div class="mod-yield">${keys.map(k => {
    const a = y.now?.[k] || 0, b = y.next?.[k];
    const cls = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
    const nowTxt = y.now ? `<b class="${cls(a)}">${fmtRate(a)}</b>` : '';
    const nextTxt = b !== undefined && nextLevel ? `${y.now ? '<span class="arrow" aria-hidden="true">→</span>' : ''}<span class="nxt">${y.now ? `niv. ${nextLevel} ` : 'au niv. 1 '}<b class="${cls(b)}">${fmtRate(b)}</b></span>` : '';
    return `<span class="yl"><span class="yk">${RES_LABELS[k]}</span> ${nowTxt}${nextTxt}</span>`;
  }).join('')}</div>`;
}

// Texte d'effet sans les chiffres de ressources (« /min » trompeurs) :
// les productions sont affichées en vrai à côté.
const RES_SEG = /^[+−-]\s*\d[\d.,]*\s*(énergie|métal|metal|cristal|biomasse|datacubes?)\b/i;
function effectText(def, level) {
  if (!def.effect || level <= 0) return '';
  let txt = '';
  try { txt = String(def.effect(level) ?? ''); } catch { return ''; }
  return txt.split(/\s+·\s+/).filter(seg => !RES_SEG.test(seg.trim())).join(' · ').trim();
}

// Statut de construction d'un module (indépendant du chantier en cours)
export function moduleStatus(id) {
  const def = MODULES[id];
  const cur = S.modules[id]?.level || 0;
  let maxLvl = def.maxLevel;
  try { maxLvl += techEffectsAccumulated().moduleMaxLevelDelta[id] || 0; } catch { /* rien */ }
  const queue = Array.isArray(S.buildQueue) ? S.buildQueue : [];
  const inBuild = S.build?.id === id;
  const queued = queue.filter(q => q?.id === id).length;
  // Niveau visé par la prochaine action (après chantier et file)
  const next = cur + 1 + (inBuild ? 1 : 0) + queued;
  const isMax = next > maxLvl;
  const lockedByTech = !!(def.requireTech && !S.techCompleted?.[def.requireTech]);
  let prereq = {};
  try { prereq = isMax ? {} : def.prereq(next) || {}; } catch { prereq = {}; }
  const unmet = Object.keys(prereq).filter(k => (S.modules[k]?.level || 0) < prereq[k]).map(k => `${MODULES[k]?.nom || k} niv. ${prereq[k]}`);
  if (lockedByTech) unmet.unshift(`Tech ${TECH_TREE[def.requireTech]?.nom || def.requireTech}`);
  let cost = {};
  try { cost = isMax ? {} : def.cost(next) || {}; } catch { cost = {}; }
  const missing = Object.keys(cost).filter(k => (k === 'datacubes_alien' ? (S.alienDatacubes || 0) : (S.res[k] || 0)) < cost[k]);
  const locked = cur === 0 && !inBuild && !queued && unmet.length > 0;
  const disabled = !!(S.modules[id]?.disabledUntil && S.modules[id].disabledUntil > (S.meta.gameMin || 0));
  return { def, cur, next, maxLvl, isMax, inBuild, queued, unmet, cost, missing, locked, disabled };
}

const FILTERS = [['dispo', 'Disponible'], ['cours', 'En cours'], ['fait', 'Construit'], ['verrou', 'Verrouillé']];
function matchFilter(st, f) {
  if (f === 'dispo') return !st.locked && !st.isMax && st.unmet.length === 0;
  if (f === 'cours') return st.inBuild || st.queued > 0;
  if (f === 'fait') return st.cur > 0;
  if (f === 'verrou') return st.locked || (st.unmet.length > 0 && !st.isMax);
  return true;
}

export function renderConstruction() {
  refreshYieldCache();
  renderBuildPanel();
  const ids = Object.keys(MODULES);
  const stats = Object.fromEntries(ids.map(id => [id, moduleStatus(id)]));
  let f = getFilter('construction', 'dispo');
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, ids.filter(id => matchFilter(stats[id], k)).length]));
  setHTML($('#buildFilters'), filterChips('construction', FILTERS, f, counts));
  const shown = ids.filter(id => matchFilter(stats[id], f));
  const list = $('#modulesList');
  if (shown.length === 0) {
    const msg = { dispo: 'Rien à construire pour l\'instant : tout est en cours, au maximum ou verrouillé.', cours: 'Aucun chantier ni rien en file.', fait: 'Aucun bâtiment construit.', verrou: 'Plus rien de verrouillé.' }[f] || '';
    setHTML(list, `<div class="empty">${esc(msg)}</div>`);
  } else {
    setHTML(list, shown.map(id => moduleCard(id, stats[id])).join(''));
  }
  renderSynthesisBanner();
}

function renderBuildPanel() {
  const queue = Array.isArray(S.buildQueue) ? S.buildQueue : [];
  const max = Number(App.BUILD_QUEUE_MAX) || (hasApp('enqueueBuild') ? 3 : 0);
  let html = '<div class="build-panel">';
  html += `<div class="bp-head"><span class="bp-title">Chantier</span>${max ? `<span class="bp-queue">file ${queue.length}/${max}</span>` : ''}</div>`;
  if (S.build) {
    const b = S.build;
    const pct = b.totalMin > 0 ? (b.doneMin / b.totalMin) * 100 : 0;
    html += `<div class="bp-cur" data-id="build:${esc(b.id)}:${esc(b.targetLevel)}">
      <div class="bp-name">${esc(MODULES[b.id]?.nom || b.id)} <span class="bp-lvl">→ niv. ${esc(b.targetLevel)}</span></div>
      ${progressHTML(pct, `${Math.floor(pct)} % · reste ${fmtDuree(b.totalMin - b.doneMin)}`)}
    </div>`;
  } else {
    html += `<div class="bp-idle">Aucun chantier en cours. Choisis un bâtiment ci-dessous.</div>`;
  }
  if (queue.length) {
    html += '<ol class="bp-list">' + queue.map((q, i) => `<li data-id="bq:${i}:${esc(q?.id)}">
      <span class="bp-qname">${esc(MODULES[q?.id]?.nom || q?.id)} <span class="bp-lvl">→ niv. ${esc(q?.targetLevel ?? '?')}</span></span>
      ${hasApp('cancelQueuedBuild') ? `<button type="button" class="bp-cancel" data-cancel-queue="${i}" aria-label="Retirer de la file : ${esc(MODULES[q?.id]?.nom || q?.id)}">✕</button>` : ''}
    </li>`).join('') + '</ol>';
  }
  html += '</div>';
  setHTML($('#buildPanel'), html);
}

function moduleCard(id, st) {
  const { def, cur, next, isMax, inBuild, queued, unmet, cost, missing, locked, disabled } = st;
  const open = isOpen('mod:' + id);
  const gm = S.meta.gameMin || 0;
  // Production réelle (seulement pour ce qui peut produire ou consommer)
  let y = { now: null, bare: null, next: null };
  if (def.prod || def.upkeep) {
    try { y = moduleYield(id, isMax || locked ? null : next); } catch { /* affichage sans chiffres */ }
  }
  const yHTML = (def.prod || def.upkeep) ? yieldHTML(id, y, isMax || locked ? null : next) : '';
  // Autres effets (places, portée…) : maintenant → niveau suivant
  const effNow = effectText(def, cur);
  const effNext = !isMax ? effectText(def, next) : '';
  let effHTML = '';
  if (effNow && effNext && effNow !== effNext) effHTML = `<div class="mod-effect">${esc(effNow)} <span class="arrow" aria-hidden="true">→</span> <span class="nxt">niv. ${next} : ${esc(effNext)}</span></div>`;
  else if (effNow || effNext) effHTML = `<div class="mod-effect">${esc(effNow || effNext)}</div>`;

  // Coût et durée réelle
  let costHTML = '';
  if (!isMax && !locked) {
    let t = 0;
    try { t = buildTime(id, next); } catch { t = 0; }
    costHTML = '<div class="cost">' + Object.keys(cost).map(k => {
      const label = k === 'datacubes_alien' ? 'Datacubes alien' : RES_LABELS[k];
      return `<span class="${missing.includes(k) ? 'ko' : ''}">${label} ${fmt(cost[k])}</span>`;
    }).join('') + (t ? `<span class="dur">${fmtDuree(t)}</span>` : '') + '</div>';
  }

  // Action
  const queue = Array.isArray(S.buildQueue) ? S.buildQueue : [];
  const max = Number(App.BUILD_QUEUE_MAX) || 3;
  let action;
  if (isMax) action = `<button class="build" disabled>${inBuild || queued ? 'En cours…' : 'Niveau maximal'}</button>`;
  else if (unmet.length) action = `<button class="build" disabled>🔒 Requiert : ${esc(unmet.join(', '))}</button>`;
  else if (!S.build) {
    const verb = next === 1 ? 'Construire' : `Améliorer → niv. ${next}`;
    action = `<button class="build" data-id="${esc(id)}" ${missing.length ? 'disabled' : ''}>${missing.length ? `Manque : ${esc(missing.map(k => RES_LABELS[k] || k).join(', '))}` : verb}</button>`;
  } else if (hasApp('enqueueBuild')) {
    const full = queue.length >= max;
    action = `<button class="build queue" data-enqueue="${esc(id)}" ${full ? 'disabled' : ''}>${full ? 'File pleine' : `Mettre en file → niv. ${next}`}</button>`;
  } else {
    action = `<button class="build" disabled>Chantier en cours…</button>`;
  }

  // Détails dépliables : ambiance, personnel, production sans personnel
  let detailsHTML = '';
  if (open) {
    const eff = cur > 0 ? moduleEfficiency(id) : null;
    const jobs = cur > 0 ? jobsForModule(id) : [];
    const bareTxt = y.bare && y.now ? RESOURCES.filter(k => Math.abs(y.now[k] || 0) * TICKS_PER_HOUR >= 0.05)
      .map(k => `${RES_LABELS[k]} ${fmtRate(y.bare[k] || 0)}`).join(' · ') : '';
    detailsHTML = `<div class="mod-details" id="mod-det-${esc(id)}">
      <p class="desc">${def.desc}</p>
      ${jobs.length ? `<div class="mod-staff">Personnel : <b>${eff.jobsFilled}/${eff.jobsTotal}</b> poste${eff.jobsTotal > 1 ? 's' : ''} pourvu${eff.jobsFilled > 1 ? 's' : ''} · rendement <b>${Math.round(eff.prodMult * 100)} %</b>
        <button type="button" class="link-btn" data-goto-assign="${esc(id)}">Postes →</button></div>` : ''}
      ${bareTxt ? `<div class="mod-staff">Sans personnel : ${esc(bareTxt)}</div>` : ''}
      ${cur > 0 && def.effect ? `<div class="mod-staff">Fiche : ${esc(String(def.effect(cur)).replace(/\/min/g, '').trim())}</div>` : ''}
    </div>`;
  }
  const tierBadge = def.tier === 2 ? '<span class="tier-badge">TIER 2</span>' : '';
  const disabledBadge = disabled ? `<span class="disabled-badge">HORS SERVICE · ${fmtDuree(S.modules[id].disabledUntil - gm)}</span>` : '';
  const levelTxt = cur === 0 ? (inBuild ? 'En chantier' : 'Non construit') : `Niv. ${cur}${cur >= st.maxLvl ? ' · max' : ''}`;
  const busy = inBuild ? ' busy' : queued ? ' queued' : '';
  return `<div class="module mod-card${locked ? ' locked' : ''}${disabled ? ' mod-disabled' : ''}${busy}" data-id="${esc(id)}">
    <div class="title-row">
      <div class="name">${def.nom}${tierBadge}</div>
      <div class="level">${inBuild && cur > 0 ? `Niv. ${cur} → ${cur + 1}` : levelTxt}${queued ? ` · ${queued} en file` : ''}</div>
    </div>
    ${disabledBadge}
    ${yHTML}
    ${effHTML}
    ${costHTML}
    <div class="mod-actions">
      ${action}
      <button type="button" class="mod-more" data-toggle="mod:${esc(id)}" aria-expanded="${open}" aria-controls="mod-det-${esc(id)}" aria-label="${open ? 'Masquer' : 'Afficher'} les détails : ${esc(def.nom)}"><span aria-hidden="true">${open ? '▴' : '▾'}</span></button>
    </div>
    ${detailsHTML}
  </div>`;
}

// ============================================================
//   Synthétiseur quantique (module tier 2)
// ============================================================
const SYNTHESIS_RECIPES = [
  { lvl: 1, id: 'metal_to_cristal',    inputs: { metal: 20 },     outputs: { cristal: 10 },   energie: 5,  nom: 'Métal → Cristal' },
  { lvl: 1, id: 'cristal_to_metal',    inputs: { cristal: 20 },   outputs: { metal: 30 },     energie: 5,  nom: 'Cristal → Métal' },
  { lvl: 1, id: 'biomasse_to_metal',   inputs: { biomasse: 15 },  outputs: { metal: 25 },     energie: 8,  nom: 'Biomasse → Métal' },
  { lvl: 2, id: 'biomasse_to_datacubes', inputs: { biomasse: 25 }, outputs: { datacubes: 5 },  energie: 12, nom: 'Biomasse → Datacubes' },
  { lvl: 2, id: 'datacubes_to_cristal',  inputs: { datacubes: 5 }, outputs: { cristal: 60 },   energie: 10, nom: 'Datacubes → Cristal' },
  { lvl: 2, id: 'cristal_to_biomasse',   inputs: { cristal: 20 }, outputs: { biomasse: 25 },  energie: 10, nom: 'Cristal → Biomasse' },
];

function renderSynthesisBanner() {
  const banner = $('#synthesisBanner');
  if (!banner) return;
  const m = S.modules?.synthetiseur_quantique;
  if (!m || m.level === 0) { banner.hidden = true; return; }
  banner.hidden = false;
  const available = SYNTHESIS_RECIPES.filter(r => r.lvl <= m.level).length;
  const txt = `${available} conversion${available > 1 ? 's' : ''} disponible${available > 1 ? 's' : ''} au niveau ${m.level}.`;
  const subEl = banner.querySelector('.sb-sub');
  if (subEl.textContent !== txt) subEl.textContent = txt;
}

export function openSynthesisModal() {
  const lvl = S.modules?.synthetiseur_quantique?.level || 0;
  if (lvl === 0) return;
  const recipes = SYNTHESIS_RECIPES.filter(r => r.lvl <= lvl);
  const m = $('#modal');
  const bg = $('#modalBg');
  if (!m || !bg) return;
  const items = recipes.map(r => {
    const inputOk = Object.keys(r.inputs).every(k => (S.res[k] || 0) >= r.inputs[k]);
    const energyOk = (S.res.energie || 0) >= r.energie;
    const canDo = inputOk && energyOk;
    const inputStr = Object.entries(r.inputs).map(([k, v]) => `${v} ${RES_LABELS[k]}`).join(' + ');
    const outputStr = Object.entries(r.outputs).map(([k, v]) => `${v} ${RES_LABELS[k]}`).join(' + ');
    return `<div class="syn-recipe ${canDo ? '' : 'syn-disabled'}">
      <div class="syn-recipe-head">
        <span class="syn-nom">${r.nom}</span>
        <button class="syn-do" data-recipe="${r.id}" ${canDo ? '' : 'disabled'}>Convertir</button>
      </div>
      <div class="syn-flow">
        <span class="syn-inputs">${inputStr}</span>
        <span class="syn-arrow">→</span>
        <span class="syn-outputs">${outputStr}</span>
        <span class="syn-energy">−${r.energie} ${RES_LABELS.energie}</span>
      </div>
    </div>`;
  }).join('');
  m.className = 'modal synthesis-modal';
  m.innerHTML = `
    <div class="incident-eyebrow">Synthétiseur quantique · niveau ${lvl}</div>
    <h3 class="incident-title">Réarrangement de matière</h3>
    <div class="syn-info">Chaque conversion réorganise les atomes au prix de beaucoup d'énergie. Choisis avec soin.</div>
    <div class="syn-recipes">${items}</div>
    <div class="btn-row">
      <button id="synClose" class="primary">Fermer</button>
    </div>
  `;
  bg.classList.add('show');
  m.querySelectorAll('.syn-do[data-recipe]').forEach(b => b.addEventListener('click', () => runSynthesisRecipe(b.dataset.recipe)));
  $('#synClose')?.addEventListener('click', () => bg.classList.remove('show'));
}

function runSynthesisRecipe(recipeId) {
  const r = SYNTHESIS_RECIPES.find(x => x.id === recipeId);
  if (!r) return;
  const lvl = S.modules?.synthetiseur_quantique?.level || 0;
  if (r.lvl > lvl) { toast('Niveau de synthétiseur insuffisant'); return; }
  for (const k in r.inputs) {
    if ((S.res[k] || 0) < r.inputs[k]) { toast(`Pas assez de ${RES_LABELS[k]}`); return; }
  }
  if ((S.res.energie || 0) < r.energie) { toast('Pas assez d\'énergie'); return; }
  for (const k in r.inputs) S.res[k] -= r.inputs[k];
  S.res.energie -= r.energie;
  for (const k in r.outputs) S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + r.outputs[k]);
  const inputStr = Object.entries(r.inputs).map(([k, v]) => `${v} ${RES_LABELS[k]}`).join(' + ');
  const outputStr = Object.entries(r.outputs).map(([k, v]) => `+${v} ${RES_LABELS[k]}`).join(' ');
  log('success', `Synthèse : ${inputStr} → ${outputStr}.`);
  toast('Conversion effectuée');
  render();
  openSynthesisModal();
}

// ============================================================
//   POSTES (affectations)
// ============================================================
function slotCounts() {
  let totalSlots = 0, filledSlots = 0;
  for (const modKey in MODULE_JOBS) {
    if (!S.modules[modKey]) continue;
    const jobs = jobsForModule(modKey);
    totalSlots += jobs.length;
    for (let i = 0; i < jobs.length; i++) {
      const occ = S.assignments[jobKey(modKey, i)];
      if (occ && S.crew.find(c => c.id === occ)?.statut === 'travail') filledSlots++;
    }
  }
  return { totalSlots, filledSlots };
}
export function freeCrew() {
  const vol = typeof App.isVoluntarilyFree === 'function' ? App.isVoluntarilyFree : null;
  return (S.crew || []).filter(m => m.statut === 'libre' && !(vol && appCall('isVoluntarilyFree', [m], false)));
}
export function postesBadgeCount() {
  const { totalSlots, filledSlots } = slotCounts();
  const free = freeCrew().length;
  return free > 0 ? Math.min(totalSlots - filledSlots, free) : 0;
}

export function renderAssignments() {
  const sub = $('#assignSub');
  const controls = $('#assignControls');
  const list = $('#assignList');
  const { totalSlots, filledSlots } = slotCounts();
  const free = S.crew.filter(m => m.statut === 'libre').length;

  if (totalSlots === 0) {
    setHTML(sub, 'Aucun poste ouvert. Construis et améliore tes bâtiments pour ouvrir des postes.');
    setHTML(controls, '');
    setHTML(list, emptyState('Pas encore de postes à pourvoir.', { goto: 'base/construction', label: 'Construire' }));
    return;
  }
  setHTML(sub, 'Touche un poste pour choisir qui l\'occupe.');
  const onCls = S.autoAssign ? 'on' : '';
  setHTML(controls, `
    <div class="assign-toolbar">
      <span class="toggle ${onCls}" id="autoAssignToggle" role="switch" tabindex="0" aria-checked="${S.autoAssign ? 'true' : 'false'}">
        <span class="switch" aria-hidden="true"></span>
        Auto-affectation
      </span>
      <button class="quick-action" id="optimizeAssignBtn">Réoptimiser</button>
      <button class="quick-action" id="clearAllAssignBtn">Tout libérer</button>
    </div>
    <div class="assign-stats">
      Postes pourvus : <b>${filledSlots}/${totalSlots}</b> · Libres : <b>${free}</b>
    </div>
  `);
  const cards = [];
  for (const modKey in MODULE_JOBS) {
    if (!S.modules[modKey]) continue;
    const jobs = jobsForModule(modKey);
    if (jobs.length === 0) continue;
    cards.push(renderAssignCard(modKey, jobs));
  }
  setHTML(list, cards.join('') || '<div class="empty">Aucun bâtiment avec des postes ouverts.</div>');
}

function renderAssignCard(modKey, jobs) {
  const def = MODULES[modKey];
  const eff = moduleEfficiency(modKey);
  const fillCls = eff.jobsFilled === eff.jobsTotal ? 'full' : eff.jobsFilled === 0 ? 'none' : 'partial';
  const prodPct = Math.round(eff.prodMult * 100);
  return `<div class="module-assign-card" data-mod="${esc(modKey)}">
    <div class="mac-head">
      <div class="mac-name">${def.nom}</div>
      <div class="mac-fill"><span class="v ${fillCls}">${eff.jobsFilled}/${eff.jobsTotal}</span> · rendement <span class="v ${prodPct > 100 ? 'up' : prodPct < 60 ? 'down' : ''}">${prodPct} %</span></div>
    </div>
    ${jobs.map((job, i) => renderSlotRow(modKey, i, job)).join('')}
  </div>`;
}

const STATUT_AWAY = { expedition: 'en mission', infirmerie: 'infirmerie', formation: 'en formation', diplomatie: 'mission diplo' };
function renderSlotRow(modKey, slotIdx, job) {
  const role = ROLES[job.role] || { nom: job.role, color: 'var(--text-mute)' };
  const occ = S.assignments[jobKey(modKey, slotIdx)];
  const m = occ ? S.crew.find(c => c.id === occ) : null;
  const onPost = m && m.statut === 'travail';
  let occHTML;
  if (m) {
    const unfit = isEligibleForJob(m, job) ? '' : ' unfit';
    let status;
    if (m.statut === 'mort') status = `<span class="occ-status absent">${accord(m, 'décédé', 'décédée', '† mort')}</span>`;
    else if (STATUT_AWAY[m.statut]) status = `<span class="occ-status away">◐ ${STATUT_AWAY[m.statut]}</span>`;
    else if (onPost) {
      const ab = ancienneteBonus(m);
      status = ab.label ? `<span class="career-badge cb-${esc(ab.label.toLowerCase())}">${esc(ab.label)} +${Math.round((ab.mult - 1) * 100)} %</span>` : '<span class="occ-status">● en poste</span>';
    } else status = `<span class="occ-status">${esc(m.statut)}</span>`;
    occHTML = `<div class="slot-occupant"><span class="occ-name${unfit}">${esc(m.name)}</span>${status}</div>`;
  } else {
    occHTML = '<div class="slot-occupant vacant">vacant</div>';
  }
  return `<div class="slot-row ${m ? '' : 'vacant'} ${m && !onPost ? 'away' : ''}" data-mod="${esc(modKey)}" data-slot="${slotIdx}" role="button" tabindex="0" aria-label="${esc(job.label)} : ${m ? esc(m.name) : 'vacant'}">
    <div class="slot-role" style="background:${role.color}"></div>
    <div class="slot-info">
      <div class="slot-label">${job.label}</div>
      <div class="slot-meta"><span class="role-tag" style="color:${role.color}">${role.nom}</span> ${jobReqText(job)}</div>
    </div>
    ${occHTML}
  </div>`;
}

// Libère les postes des colons présents au travail. Les postes réservés aux
// colons absents (expédition, mission, soins, formation) sont conservés.
function releaseWorkingAssignments() {
  for (const k of Object.keys(S.assignments)) {
    const m = S.crew.find(c => c.id === S.assignments[k]);
    if (m && m.statut !== 'mort' && m.statut !== 'travail') continue;
    if (m && m.statut === 'travail') m.statut = 'libre';
    delete S.assignments[k];
  }
}
function optimizeAssignments() {
  releaseWorkingAssignments();
  autoAssignAllFreeMembers();
  toast('Affectations réoptimisées');
}

// Sélecteur de colon pour un poste
let _pickerCtx = { modKey: null, slotIdx: null };
export function openAssignPicker(modKey, slotIdx) {
  _pickerCtx = { modKey, slotIdx };
  const m = $('#modal');
  m.className = 'modal launch-modal';
  m.innerHTML = renderAssignPickerContent();
  $('#modalBg').classList.add('show');
  hookAssignPicker();
}

function renderAssignPickerContent() {
  const { modKey, slotIdx } = _pickerCtx;
  const job = jobsForModule(modKey)[slotIdx];
  if (!job) return '<h3>Erreur</h3><p>Poste introuvable.</p><div class="btn-row"><button id="pickerCancel">Fermer</button></div>';
  const role = ROLES[job.role] || { nom: job.role, color: 'var(--text-mute)' };
  const def = MODULES[modKey];
  const current = memberAt(modKey, slotIdx);
  const items = S.crew.filter(m => m.statut !== 'mort').map(m => {
    const eligible = isEligibleForJob(m, job);
    const isCurrent = current?.id === m.id;
    let busy = '';
    if (m.statut === 'expedition' || m.statut === 'formation' || m.statut === 'infirmerie') busy = STATUT_AWAY[m.statut] || m.statut;
    else if (m.statut === 'travail' && !isCurrent) {
      const a = memberAssignment(m.id);
      busy = a ? `${MODULES[a.modKey]?.nom || '?'} · ${jobsForModule(a.modKey)[a.slotIdx]?.label || '?'}` : 'au travail';
    }
    let relevant = '';
    if (job.req?.skill) relevant = `${SKILL_LABELS[job.req.skill.key]} ${m.skills[job.req.skill.key] || 0}`;
    else {
      const best = SKILL_LIST.map(s => ({ s, v: m.skills[s] || 0 })).sort((a, b) => b.v - a.v)[0];
      if (best.v > 0) relevant = `${SKILL_LABELS[best.s]} ${best.v}`;
    }
    return { m, eligible, isCurrent, busy, relevant };
  });
  items.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (a.busy ? 1 : 0) - (b.busy ? 1 : 0);
  });
  const itemsHTML = items.map(({ m, eligible, isCurrent, busy, relevant }) => {
    const dis = !eligible;
    const detail = busy && !isCurrent ? `Occupé : ${busy}` : m.statut === 'libre' ? 'Libre' : isCurrent ? 'Affecté ici' : m.statut;
    return `<div class="assign-pick-item ${isCurrent ? 'current' : ''} ${dis ? 'disabled' : ''}" data-pick-member="${esc(m.id)}" role="button"${dis ? ' aria-disabled="true"' : ' tabindex="0"'}${isCurrent ? ' aria-current="true"' : ''}>
      <div class="api-info">
        <div class="api-name">${esc(m.name)}</div>
        <div class="api-detail">${esc(detail)}${dis ? ' · ne remplit pas les conditions' : ''}</div>
      </div>
      <div class="api-relevant">${esc(relevant)}</div>
    </div>`;
  }).join('');
  return `
    <h3>${job.label}</h3>
    <p class="picker-meta">${def.nom} · <span style="color:${role.color}">${role.nom}</span> · ${jobReqText(job)}</p>
    ${current ? `<p class="picker-meta">Actuellement : <em>${esc(current.name)}</em></p>` : ''}
    <div class="assign-picker-list">
      ${itemsHTML || '<div class="empty" style="padding:18px">Aucun colon disponible.</div>'}
    </div>
    <div class="btn-row">
      ${current ? '<button class="danger" id="pickerUnassign">Libérer le poste</button>' : ''}
      <button id="pickerCancel">Fermer</button>
    </div>`;
}

function hookAssignPicker() {
  const m = $('#modal');
  const close = () => $('#modalBg').classList.remove('show');
  m.querySelectorAll('[data-pick-member]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const r = assignMember(el.dataset.pickMember, _pickerCtx.modKey, _pickerCtx.slotIdx);
      if (!r.ok) { toast(r.reason); return; }
      close();
      render();
    });
  });
  $('#pickerUnassign')?.addEventListener('click', () => {
    const occ = memberAt(_pickerCtx.modKey, _pickerCtx.slotIdx);
    if (occ) unassignMember(occ.id);
    close();
    render();
  });
  $('#pickerCancel')?.addEventListener('click', close);
}

// ============================================================
//   Actions (délégation depuis <main>, voir ui.js)
// ============================================================
export const ACTIONS = [
  ['button.build[data-id]', el => startBuild(el.dataset.id)],
  ['button[data-enqueue]', el => {
    const r = appCall('enqueueBuild', [el.dataset.enqueue], null);
    if (r && r.ok === false) toast(r.why || 'Impossible de mettre en file');
    else toast(`${MODULES[el.dataset.enqueue]?.nom || 'Bâtiment'} mis en file`);
    render();
  }],
  ['button[data-cancel-queue]', el => {
    const i = parseInt(el.dataset.cancelQueue, 10);
    const q = S.buildQueue?.[i];
    const r = appCall('cancelQueuedBuild', [i], null);
    if (r && r.ok === false) toast(r.why || 'Impossible de retirer de la file');
    else if (q) toast(`${MODULES[q.id]?.nom || 'Bâtiment'} retiré de la file`);
    render();
  }],
  ['#openSynthesis', () => openSynthesisModal()],
  ['#autoAssignToggle', () => {
    S.autoAssign = !S.autoAssign;
    if (S.autoAssign) autoAssignAllFreeMembers();
    render();
  }],
  ['#optimizeAssignBtn', () => { optimizeAssignments(); render(); }],
  ['#clearAllAssignBtn', async () => {
    const ok = await confirmModal({ titre: 'Tout libérer ?', texte: 'Les colons présents quittent leur poste. Les postes des absents (mission, soins, formation) restent réservés.', confirmer: 'Libérer', danger: true });
    if (!ok) return;
    releaseWorkingAssignments();
    toast('Tous les postes libérés');
    render();
  }],
  ['.slot-row[data-mod]', el => openAssignPicker(el.dataset.mod, parseInt(el.dataset.slot, 10))],
  ['button[data-open-decision]', () => {
    if (typeof App.pumpDecisions === 'function') appCall('pumpDecisions');
    else toast('Décision indisponible');
  }],
  ['button[data-soigner]', el => {
    const r = appCall('soigner', [el.dataset.soigner], null);
    if (r && r.ok === false) { toast(r.why || 'Soins impossibles'); navigateTo('equipage/soins'); }
    else if (r) toast('Soins engagés');
    render();
  }],
];

// Après une navigation vers la construction avec une cible : la carte du
// module est rendue visible (filtre adapté) puis mise en évidence.
export function revealModule(id) {
  if (!MODULES[id]) return;
  const st = moduleStatus(id);
  const f = getFilter('construction', 'dispo');
  if (!matchFilter(st, f)) {
    const better = FILTERS.map(([k]) => k).find(k => matchFilter(st, k)) || 'dispo';
    setFilter('construction', better);
  }
  render();
  requestAnimationFrame(() => flash(`#modulesList .module[data-id="${CSS.escape(id)}"]`));
}

