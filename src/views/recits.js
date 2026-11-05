// views/recits.js — onglet « Récits » : chroniques planétaires, fils rouges
// (arcs, avec les conditions des étapes), journal filtré et groupé par jour,
// archives (pages de lore débloquées) et annales (mémoire de la partie).

import { $ } from '../util.js';
import * as ArcsData from '../data-arcs-factions.js';
import { S } from '../state.js';
import {
  appCall, esc, fmtDuree, setHTML, safeHTML, emptyState, filterChips, getFilter, calendar, pad2, plur, arcState,
} from './common.js';
import { chroniclesList } from './base.js';
import { showModal, render } from '../ui.js';

// ============================================================
//   CHRONIQUES PLANÉTAIRES
// ============================================================
export const CHRON_ETATS = {
  prete: { label: 'La suite est prête', cls: 'ready', ordre: 0 },
  en_cours: { label: 'En cours', cls: 'live', ordre: 1 },
  decouverte: { label: 'Découverte', cls: 'new', ordre: 2 },
  en_attente: { label: 'En attente', cls: 'wait', ordre: 3 },
  terminee: { label: 'Achevée', cls: 'done', ordre: 4 },
};

export function renderChronicles() {
  const sub = $('#chronSub');
  const host = $('#chronList');
  const list = chroniclesList().slice().sort((a, b) => (CHRON_ETATS[a.etat]?.ordre ?? 9) - (CHRON_ETATS[b.etat]?.ordre ?? 9));
  if (list.length === 0) {
    setHTML(sub, 'Les planètes racontent des histoires à ceux qui s\'y posent.');
    setHTML(host, emptyState('Aucune chronique révélée pour l\'instant. Une équipe qui foule une planète singulière peut en éveiller une.', { goto: 'expeditions/carte', label: 'Ouvrir la carte' }));
    return;
  }
  const done = list.filter(c => c.etat === 'terminee').length;
  setHTML(sub, `${plur(list.length, 'chronique révélée', 'chroniques révélées')} · ${plur(done, 'achevée', 'achevées')}`);
  setHTML(host, list.map(c => {
    const st = CHRON_ETATS[c.etat] || { label: c.etat, cls: '' };
    const lieu = [c.lieu?.systeme, c.lieu?.nom].filter(Boolean).join(' › ');
    const ep = c.episodes ? `Épisode ${esc(c.episode)}/${esc(c.episodes)}` : '';
    const wait = c.etat === 'en_attente' && Number.isFinite(c.prochainDans) ? ` · suite dans ${fmtDuree(c.prochainDans)}` : '';
    const fin = c.etat === 'terminee' && c.fin && c.fin !== 'completed' ? ` · fin : ${esc(String(c.fin).replace(/_/g, ' '))}` : '';
    return `<div class="chron-card ${st.cls}" data-id="chron:${esc(c.id)}">
      <div class="cc-head">
        <div class="cc-title">${esc(c.titre)}</div>
        <span class="cc-state">${esc(st.label)}</span>
      </div>
      <div class="cc-meta">${esc(lieu)}${ep ? ' · ' + ep : ''}${wait}${fin}</div>
      ${c.lieu?.bodyId ? `<button type="button" class="cc-btn" data-goto-body="${esc(c.lieu.bodyId)}">Voir la planète →</button>` : ''}
    </div>`;
  }).join(''));
}

// ============================================================
//   FILS ROUGES (arcs) — contenu de src/content/arcs/
// ============================================================
// Indice et progression d'une étape : écrits dans le contenu (indice,
// objectif.progression, objectif.modules) ; la progression est calculée par
// le moteur (App.evaluerColonie).
const lvl = id => S.modules?.[id]?.level || 0;
function stepHint(step) {
  const o = Array.isArray(step.objectif) ? step.objectif[step.objectif.length - 1] : step.objectif;
  const txt = step.indice || o?.titre || '';
  if (Array.isArray(o?.modules) && o.modules.length) {
    return { txt, n: o.modules.filter(id => lvl(id) >= (o.niveau || 1)).length, total: o.modules.length };
  }
  if (o?.progression?.valeur) {
    const n = Number(appCall('evaluerColonie', [o.progression.valeur], 0)) || 0;
    return { txt, n, total: o.progression.total || 1 };
  }
  return txt ? { txt } : null;
}

const principalOrdre = (arc, st) => (arc.principal && st.unlocked && !st.rewardClaimed ? 0 : st.unlocked ? 1 : 2);

export function renderArcs() {
  const sub = $('#arcsSub');
  const content = $('#arcsContent');
  if (!content) return;
  const ARCS = ArcsData.ARCS || {};
  // Un fil qui ne s'ouvre jamais de lui-même (le prologue d'une partie neuve)
  // n'est montré que s'il a été ouvert.
  const ids = Object.keys(ARCS).filter(id => ARCS[id].ouverture !== 'faux' || arcState(id).unlocked);
  const states = Object.fromEntries(ids.map(id => [id, arcState(id)]));
  const unlocked = ids.filter(id => states[id].unlocked).length;
  const completed = ids.filter(id => states[id].rewardClaimed).length;
  setHTML(sub, `<b>${unlocked}/${ids.length}</b> fil${unlocked > 1 ? 's' : ''} ouvert${unlocked > 1 ? 's' : ''} · <b>${completed}</b> achevé${completed > 1 ? 's' : ''}`);
  // Le fil principal en cours d'abord, puis les ouverts, puis les scellés
  const order = ids.slice().sort((a, b) => principalOrdre(ARCS[a], states[a]) - principalOrdre(ARCS[b], states[b]));
  setHTML(content, order.map(id => renderArcCard(id, ARCS[id], states[id])).join(''));
}

function renderArcCard(arcId, arc, state) {
  if (!state.unlocked) {
    return `<div class="arc-card locked" data-id="${esc(arcId)}">
      <div class="arc-eyebrow">Fil scellé</div>
      <h3 class="arc-name">Un fil reste à découvrir</h3>
      <p class="arc-locked-hint">${esc(arc.indiceOuverture || 'Il se révélera de lui-même.')}</p>
    </div>`;
  }
  const steps = arc.steps || [];
  const total = steps.length;
  const doneIds = state.completedSteps || [];
  const done = doneIds.length;
  const isComplete = done >= total;
  const isMain = !!arc.principal;
  const color = esc(arc.color);
  const currentIdx = steps.findIndex(s => !doneIds.includes(s.id));
  const milestonesHTML = steps.map(step => {
    const ok = doneIds.includes(step.id);
    return `<span class="milestone ${ok ? 'done' : ''}" style="${ok ? `background:${color}` : ''}"></span>`;
  }).join('');
  const stepsHTML = steps.map((step, i) => {
    const ok = doneIds.includes(step.id);
    const current = i === currentIdx;
    // Conditions visibles pour l'étape courante et la suivante ; les plus
    // lointaines restent voilées (sauf pour un fil principal).
    const reveal = ok || isMain || (currentIdx >= 0 && i <= currentIdx + 1);
    let body;
    if (ok) {
      body = `<div class="as-narrative">${esc(step.narrative)}</div>`;
    } else if (reveal) {
      const h = stepHint(step);
      const prog = h && Number.isFinite(h.n) && h.total ? ` <span class="as-count">${Math.min(h.n, h.total)}/${h.total}</span>` : '';
      body = `<div class="as-cond">${h?.txt ? esc(h.txt) : 'Condition inconnue.'}${prog}</div>`;
    } else {
      body = '<div class="as-pending">Condition révélée plus tard.</div>';
    }
    return `<div class="arc-step ${ok ? 'done' : current ? 'current' : 'pending'}">
      <div class="as-marker" style="${ok ? `background:${color}` : current ? `border-color:${color}` : ''}">${ok ? '✓' : (i + 1)}</div>
      <div class="as-body">
        <div class="as-title">${esc(step.title)}${current ? ' <span class="as-now">en cours</span>' : ''}</div>
        ${body}
      </div>
    </div>`;
  }).join('');
  let rewardHTML = '';
  const label = arc.recompense?.titre;
  if (label) {
    if (state.rewardClaimed) rewardHTML = `<div class="arc-reward claimed">✓ Récompense reçue — ${esc(label)}</div>`;
    else if (isComplete) rewardHTML = `<div class="arc-reward ready">Récompense en cours d'attribution — ${esc(label)}</div>`;
    else rewardHTML = `<div class="arc-reward pending">Au bout du fil — ${esc(label)}</div>`;
  }
  return `<div class="arc-card ${isComplete ? 'complete' : ''}${isMain ? ' main' : ''}" style="border-left-color:${color}" data-id="${esc(arcId)}">
    <div class="arc-eyebrow" style="color:${color}">${esc(arc.eyebrow)}</div>
    <h3 class="arc-name">${esc(arc.nom)}</h3>
    <p class="arc-intro">${esc(arc.intro)}</p>
    <div class="arc-progress">
      <div class="arc-milestones">${milestonesHTML}</div>
      <div class="arc-counter">${done}/${total} étape${total > 1 ? 's' : ''}</div>
    </div>
    <div class="arc-steps">${stepsHTML}</div>
    ${rewardHTML}
  </div>`;
}

// ============================================================
//   JOURNAL — filtres et regroupement par jour
// ============================================================
const JOURNAL_KINDS = new Set(['neutral', 'success', 'warn']);
export const JOURNAL_FILTERS = [['tout', 'Tout'], ['recits', 'Récits'], ['colonie', 'Colonie'], ['equipage', 'Équipage']];
const RE_RECITS = /chroniqu|expédition|expedition|scène|épisode|fil rouge|faction|diplomat|ambassad|mission|retour de|ruine|signal|schéma|légend|planète|système|caravane|alliance|cartograph|antenne|artefact|découvert/i;
const RE_EQUIPAGE_FORT = /propose ses services|rejoint|recrut|candidat|\bdécès|est mort|est morte/i;
const RE_EQUIPAGE = /\bcolons?\b|bless|malad|infirmerie|\bsoins?\b|décéd|\bmort|moral|loyaut|amitié|rival|anniversaire|séquelle|diagnos|traitement|rétabli|guéri|patient|équipage|vieilli|formation/i;
const _cat = new Map();
// Noms des colons (un nom illisible n'empêche pas de classer le journal)
function crewNames() {
  const out = [];
  for (const m of S.crew || []) {
    try { if (m?.name) out.push(String(m.name)); } catch { /* donnée corrompue : ignorée */ }
  }
  return out;
}
export function journalCategory(e) {
  if (e && typeof e.cat === 'string') return e.cat;
  const txt = String(e?.txt ?? '');
  const hit = _cat.get(txt);
  if (hit) return hit;
  const plain = txt.replace(/<[^>]*>/g, '');
  let cat = 'colonie';
  if (RE_EQUIPAGE_FORT.test(plain)) cat = 'equipage';
  else if (RE_RECITS.test(plain)) cat = 'recits';
  else if (RE_EQUIPAGE.test(plain) || crewNames().some(n => plain.includes(n))) cat = 'equipage';
  if (_cat.size > 2000) _cat.clear();
  _cat.set(txt, cat);
  return cat;
}

export function renderJournal() {
  const list = $('#journalList');
  const filters = $('#journalFilters');
  const f = getFilter('journal', 'tout');
  const entries = Array.isArray(S.journal) ? S.journal.filter(Boolean) : [];
  const counts = { tout: entries.length };
  for (const e of entries) { const c = journalCategory(e); counts[c] = (counts[c] || 0) + 1; }
  setHTML(filters, filterChips('journal', JOURNAL_FILTERS, f, counts));
  const shown = entries.filter(e => f === 'tout' || journalCategory(e) === f);
  if (shown.length === 0) {
    setHTML(list, `<div class="empty">${entries.length ? 'Rien dans cette catégorie.' : 'Aucune entrée. La station écoute.'}</div>`);
    return;
  }
  const today = calendar(S.meta.gameMin).jour;
  const days = [];
  for (const e of shown.slice().reverse()) {
    const c = calendar(Number(e.t) || 0);
    let d = days[days.length - 1];
    if (!d || d.jour !== c.jour) { d = { jour: c.jour, items: [] }; days.push(d); }
    d.items.push({ e, c });
  }
  setHTML(list, days.map(d => `
    <section class="jday" data-id="jour-${d.jour}">
      <h3 class="jday-head">Jour ${d.jour}${d.jour === today ? ' <span class="jday-now">aujourd\'hui</span>' : ''}</h3>
      <ul class="journal-list">${d.items.map(({ e, c }) => {
        const kind = JOURNAL_KINDS.has(e.kind) ? e.kind : 'neutral';
        // e.txt est du HTML produit par le jeu (<em>…) : filtré par liste blanche
        return `<li class="entry ${kind}">
          <div class="meta">${pad2(c.h)}:${pad2(c.m)}</div>
          <div class="body">${safeHTML(e.txt)}</div>
        </li>`;
      }).join('')}</ul>
    </section>`).join(''));
}

// ============================================================
//   ARCHIVES (pages de lore débloquées) et ANNALES (mémoire de la partie)
// ============================================================
// Badge discret : pages d'archives débloquées et pas encore lues
export function archivesBadgeCount() {
  return Number(appCall('archivesNonLues', [], 0)) || 0;
}

export function renderArchives() {
  const pages = appCall('pagesArchives', [], []) || [];
  const ouvertes = pages.filter(p => p.debloquee);
  if (!ouvertes.length) {
    setHTML($('#archivesContent'), `<div class="lore-empty">
      <div class="lore-glyph" aria-hidden="true">◈</div>
      <h3>Archives</h3>
      <p>Les fragments que l'équipage rapporte — transmissions, pages arrachées, schémas annotés, voix sur un disque — seront classés ici, page après page.</p>
      <p class="dim">Chaque découverte ouvre une entrée. Rien n'y est encore consigné.</p>
      <button type="button" class="cta-btn ghost" data-goto="expeditions/carte">Partir explorer</button>
    </div>`);
    return;
  }
  const groupes = [];
  for (const p of pages) {
    let g = groupes[groupes.length - 1];
    if (!g || g.categorie !== p.categorie) { g = { categorie: p.categorie, nom: p.categorieNom, pages: [] }; groupes.push(g); }
    g.pages.push(p);
  }
  const nonLues = ouvertes.filter(p => !p.lu).length;
  setHTML($('#archivesContent'), `
    <div class="subhead">${plur(ouvertes.length, 'page ouverte', 'pages ouvertes')} sur ${pages.length}${nonLues ? ` · ${plur(nonLues, 'nouvelle', 'nouvelles')}` : ''}</div>
    ${groupes.map(g => {
      const visibles = g.pages.filter(p => p.debloquee);
      const scellees = g.pages.length - visibles.length;
      return `<section class="lore-cat" data-id="cat-${esc(g.categorie)}">
        <h3 class="lore-cat-head">${esc(g.nom)} <span class="lore-cat-count">${visibles.length}/${g.pages.length}</span></h3>
        ${visibles.map(p => `<button type="button" class="lore-page${p.lu ? '' : ' new'}" data-archive="${esc(p.id)}" data-id="arch-${esc(p.id)}">
          <span class="lp-title">${esc(p.titre)}${p.lu ? '' : ' <span class="lp-new">nouveau</span>'}</span>
          <span class="lp-resume">${esc(p.resume || '')}</span>
        </button>`).join('')}
        ${scellees ? `<div class="lore-sealed">${plur(scellees, 'page scellée', 'pages scellées')} : d'autres découvertes les ouvriront.</div>` : ''}
      </section>`;
    }).join('')}`);
}

// Ouvre une page d'archives (texte rendu par le moteur, déjà sûr) et la marque lue
function ouvrirArchive(id) {
  const p = (appCall('pagesArchives', [], []) || []).find(x => x.id === id && x.debloquee);
  if (!p) return;
  showModal({
    title: p.titre,
    body: `<div class="lore-reader"><div class="lore-reader-cat">${esc(p.categorieNom)}</div>${p.texteHTML}</div>`,
    bodyIsHTML: true,
    primaryLabel: 'Refermer',
    hideCancel: true,
  });
  appCall('marquerArchiveLue', [id]);
  render();
}

const ANNALES_ICONES = { fondation: '✦', arrivee: '+', deces: '†', contact: '◎', annales: '❖', chantier: '▲', fil: '◆', marque: '•' };

export function renderAnnales() {
  const c = calendar(S.meta.gameMin);
  const entrees = appCall('annalesColonie', [], []) || [];
  const jours = [];
  for (const e of entrees) {
    let d = jours[jours.length - 1];
    if (!d || d.jour !== e.jour) { d = { jour: e.jour, items: [] }; jours.push(d); }
    d.items.push(e);
  }
  setHTML($('#annalesContent'), `
    <div class="annales-head">
      <h3>Annales de ${esc(S.meta.colonyName)}</h3>
      <p class="dim">Jour ${c.jour} depuis la fondation. La mémoire de la colonie : ses arrivées, ses morts, ses premiers contacts, ses chantiers, ses récits menés à terme.</p>
    </div>
    ${jours.map(d => `<section class="jday annales-day" data-id="annales-${d.jour}">
      <h3 class="jday-head">Jour ${d.jour}${d.jour === c.jour ? ' <span class="jday-now">aujourd\'hui</span>' : ''}</h3>
      <ul class="annales-list">${d.items.map(e => `<li class="annale ${esc(e.kind)}">
        <span class="annale-icon" aria-hidden="true">${ANNALES_ICONES[e.kind] || '•'}</span>
        <span class="annale-text">${esc(e.texte)}</span>
      </li>`).join('')}</ul>
    </section>`).join('')}`);
}

export const ACTIONS = [
  ['button[data-archive]', el => ouvrirArchive(el.dataset.archive)],
];
