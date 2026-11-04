// views/recits.js — onglet « Récits » : chroniques planétaires, fils rouges
// (arcs, avec les conditions des étapes), journal filtré et groupé par jour,
// archives et annales (remplies en vague 2).

import { $ } from '../util.js';
import { BLUEPRINTS, TECH_TREE } from '../catalog.js';
import { ARCS } from '../data-arcs-factions.js';
import { S, aliveCrew } from '../state.js';
import { getArcState } from '../app.js';
import {
  esc, fmtDuree, setHTML, safeHTML, emptyState, filterChips, getFilter, calendar, pad2, plur,
} from './common.js';
import { chroniclesList } from './base.js';

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
//   FILS ROUGES (arcs)
// ============================================================
const lvl = id => S.modules?.[id]?.level || 0;
const nbBp = origin => Object.keys(S.discoveries || {}).filter(id => BLUEPRINTS[id]?.origin === origin).length;
const inv = id => S.inventory?.[id] || 0;
const nbTech = () => Object.keys(S.techCompleted || {}).length;
const nbRuins = kind => (S.expHistory || []).filter(e => e.body?.ruines === kind).length;
const techNom = id => TECH_TREE[id]?.nom || id;

// Condition lisible de chaque étape connue (et progression chiffrée)
const STEP_HINTS = {
  ap_1: () => ({ txt: 'Compter dix colons vivants.', n: aliveCrew().length, total: 10 }),
  ap_2: () => ({ txt: 'Mine, hydroponie, générateur solaire et habitat au niveau 3.', n: ['mine_surface', 'hydroponie', 'generateur_solaire', 'habitat'].filter(k => lvl(k) >= 3).length, total: 4 }),
  ap_3: () => ({ txt: 'Posséder trois vaisseaux.', n: (S.fleet || []).length, total: 3 }),
  ap_4: () => ({ txt: 'Compter vingt-cinq colons vivants.', n: aliveCrew().length, total: 25 }),
  ap_5: () => ({ txt: 'Mine, hydroponie, générateur, habitat et laboratoire au niveau 5.', n: ['mine_surface', 'hydroponie', 'generateur_solaire', 'habitat', 'laboratoire'].filter(k => lvl(k) >= 5).length, total: 5 }),
  eff_1: () => ({ txt: 'Rapporter un disque mémoire.', n: inv('disque_memoire'), total: 1 }),
  eff_2: () => ({ txt: 'Explorer une ruine humaine.', n: nbRuins('humaines'), total: 1 }),
  eff_3: () => ({ txt: 'Réunir deux disques mémoire.', n: inv('disque_memoire'), total: 2 }),
  eff_4: () => ({ txt: 'Compter un linguiste de niveau 4 dans l\'équipage.' }),
  eff_5: () => ({ txt: 'Trouver une plaque gravée et visiter une station.' }),
  eff_6: () => ({ txt: 'Maîtriser huit technologies.', n: nbTech(), total: 8 }),
  crys_1: () => ({ txt: 'Déchiffrer un schéma alien-A.', n: nbBp('alien_a'), total: 1 }),
  crys_2: () => ({ txt: 'Explorer trois ruines alien-A.', n: nbRuins('alien_a'), total: 3 }),
  crys_3: () => ({ txt: 'Rapporter une lentille noire.', n: inv('lentille_noire'), total: 1 }),
  crys_4: () => ({ txt: `Rechercher « ${techNom('tech_principes_xeno')} ».` }),
  crys_5: () => ({ txt: 'Affronter ce qui garde les ruines cristallines.' }),
  crys_6: () => ({ txt: '50 datacubes alien et trois schémas alien-A.' }),
  cou_1: () => ({ txt: 'Déchiffrer un schéma alien-B.', n: nbBp('alien_b'), total: 1 }),
  cou_2: () => ({ txt: 'Qu\'un colon survive à un pathogène alien.' }),
  cou_3: () => ({ txt: 'Rapporter un anneau scellé.', n: inv('anneau_scelle'), total: 1 }),
  cou_4: () => ({ txt: 'Explorer une ruine alien-B en emportant du sérum xéno.' }),
  cou_5: () => ({ txt: 'Affronter un essaim organique.' }),
  cou_6: () => ({ txt: `Rechercher « ${techNom('tech_genetique')} » ou déchiffrer trois schémas alien-B.` }),
};
const ARC_UNLOCK_HINTS = {
  arc_effondrement: 'Se révèle quand l\'avant-poste compte cinq colons.',
  arc_cristaux: 'Se révèle avec un premier schéma alien-A.',
  arc_couvee: 'Se révèle avec un premier schéma alien-B.',
};
function stepHint(step) {
  const own = step.objectif || step.indice || step.hint;
  if (typeof own === 'string' && own) return { txt: own };
  try { return STEP_HINTS[step.id]?.() || null; } catch { return null; }
}

export function renderArcs() {
  const sub = $('#arcsSub');
  const content = $('#arcsContent');
  if (!content) return;
  const ids = Object.keys(ARCS);
  const states = Object.fromEntries(ids.map(id => [id, getArcState(id)]));
  const unlocked = ids.filter(id => states[id].unlocked).length;
  const completed = ids.filter(id => states[id].rewardClaimed).length;
  setHTML(sub, `<b>${unlocked}/${ids.length}</b> fil${unlocked > 1 ? 's' : ''} ouvert${unlocked > 1 ? 's' : ''} · <b>${completed}</b> achevé${completed > 1 ? 's' : ''}`);
  // L'Avant-poste d'abord (fil principal), puis les ouverts, puis les scellés
  const order = ids.slice().sort((a, b) => {
    const ka = a === 'arc_avant_poste' ? 0 : states[a].unlocked ? 1 : 2;
    const kb = b === 'arc_avant_poste' ? 0 : states[b].unlocked ? 1 : 2;
    return ka - kb;
  });
  setHTML(content, order.map(id => renderArcCard(id, ARCS[id], states[id])).join(''));
}

function renderArcCard(arcId, arc, state) {
  if (!state.unlocked) {
    return `<div class="arc-card locked" data-id="${esc(arcId)}">
      <div class="arc-eyebrow">Fil scellé</div>
      <h3 class="arc-name">Un fil reste à découvrir</h3>
      <p class="arc-locked-hint">${esc(ARC_UNLOCK_HINTS[arcId] || arc.indice || 'Il se révélera de lui-même.')}</p>
    </div>`;
  }
  const total = arc.steps.length;
  const doneIds = state.completedSteps || [];
  const done = doneIds.length;
  const isComplete = done >= total;
  const isMain = arcId === 'arc_avant_poste';
  const currentIdx = arc.steps.findIndex(s => !doneIds.includes(s.id));
  const milestonesHTML = arc.steps.map(step => {
    const ok = doneIds.includes(step.id);
    return `<span class="milestone ${ok ? 'done' : ''}" style="${ok ? `background:${arc.color}` : ''}"></span>`;
  }).join('');
  const stepsHTML = arc.steps.map((step, i) => {
    const ok = doneIds.includes(step.id);
    const current = i === currentIdx;
    // Conditions visibles pour l'étape courante et la suivante ; les plus
    // lointaines restent voilées (sauf pour le fil principal).
    const reveal = ok || isMain || (currentIdx >= 0 && i <= currentIdx + 1);
    let body;
    if (ok) {
      body = `<div class="as-narrative">${step.narrative}</div>`;
    } else if (reveal) {
      const h = stepHint(step);
      const prog = h && Number.isFinite(h.n) && h.total ? ` <span class="as-count">${Math.min(h.n, h.total)}/${h.total}</span>` : '';
      body = `<div class="as-cond">${h ? esc(h.txt) : 'Condition inconnue.'}${prog}</div>`;
    } else {
      body = '<div class="as-pending">Condition révélée plus tard.</div>';
    }
    return `<div class="arc-step ${ok ? 'done' : current ? 'current' : 'pending'}">
      <div class="as-marker" style="${ok ? `background:${arc.color}` : current ? `border-color:${arc.color}` : ''}">${ok ? '✓' : (i + 1)}</div>
      <div class="as-body">
        <div class="as-title">${step.title}${current ? ' <span class="as-now">en cours</span>' : ''}</div>
        ${body}
      </div>
    </div>`;
  }).join('');
  let rewardHTML = '';
  if (arc.reward) {
    let label = '';
    if (arc.reward.kind === 'blueprint') label = `Schéma légendaire : ${String(BLUEPRINTS[arc.reward.value]?.nom || arc.reward.value).replace(/^Schéma\s*:\s*/i, '')}`;
    else if (arc.reward.kind === 'tech') label = `Technologie légendaire : ${TECH_TREE[arc.reward.value]?.nom || arc.reward.value}`;
    else if (arc.reward.kind === 'permanent_bonus') label = 'Bonus permanent : +10 % sur toute production';
    if (state.rewardClaimed) rewardHTML = `<div class="arc-reward claimed">✓ Récompense reçue : ${label}</div>`;
    else if (isComplete) rewardHTML = `<div class="arc-reward ready">Récompense en cours d'attribution : ${label}</div>`;
    else rewardHTML = `<div class="arc-reward pending">Au bout du fil : ${label}</div>`;
  }
  return `<div class="arc-card ${isComplete ? 'complete' : ''}${isMain ? ' main' : ''}" style="border-left-color:${arc.color}" data-id="${esc(arcId)}">
    <div class="arc-eyebrow" style="color:${arc.color}">${arc.eyebrow}</div>
    <h3 class="arc-name">${arc.nom}</h3>
    <p class="arc-intro">${arc.intro}</p>
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
//   ARCHIVES et ANNALES (remplies en vague 2)
// ============================================================
export function renderArchives() {
  setHTML($('#archivesContent'), `<div class="lore-empty">
    <div class="lore-glyph" aria-hidden="true">◈</div>
    <h3>Archives</h3>
    <p>Les fragments que l'équipage rapporte — transmissions, pages arrachées, schémas annotés, voix sur un disque — seront classés ici, page après page.</p>
    <p class="dim">Chaque découverte ouvre une entrée. Rien n'y est encore consigné.</p>
    <button type="button" class="cta-btn ghost" data-goto="expeditions/carte">Partir explorer</button>
  </div>`);
}

export function renderAnnales() {
  const c = calendar(S.meta.gameMin);
  setHTML($('#annalesContent'), `<div class="lore-empty">
    <div class="lore-glyph" aria-hidden="true">✦</div>
    <h3>Annales de ${esc(S.meta.colonyName)}</h3>
    <p>La mémoire de la colonie : sa fondation, ses premiers pas, les noms de ceux qui sont tombés, les chroniques menées à leur terme.</p>
    <p class="dim">Jour ${c.jour} depuis la fondation. L'histoire s'écrit encore.</p>
  </div>`);
}

export const ACTIONS = [];
