// views/equipage.js — onglet « Équipage » : personnel (cartes compactes
// dépliables), recrutement, formation, soins, légende des caractéristiques.

import { $ } from '../util.js';
import { RES_LABELS, SKILL_LIST, SKILL_LABELS, STAT_LABELS } from '../constants.js';
import { MODULES, TRAITS, TREATMENTS } from '../catalog.js';
import {
  S, crewUsage, aliveCrew, acceptCandidate, refuseCandidate, traitNom, trainingTargetLevel, formationBonuses,
} from '../state.js';
import {
  SEQUELS, ROLES, STATUTS, TRAINING_PROGRAMS, jobsForModule, jobKey, memberAssignment, ancienneteBonus,
  currentAge, maxHealthOf, significantRelations, relationType, infirmaryBeds, bedsInUse,
  bestAvailableDoctor, infirmaryBonuses, canDiagnose, canTreat, canTrain, startTraining, cancelTraining,
  admitToInfirmary, dischargeMember, startDiagnostic, startTreatment,
} from '../app.js';
import {
  hasApp, esc, fmtDuree, setHTML, emptyState, isOpen, nomOf, dayOf, accord, plur,
} from './common.js';
import { render, rerenderModal, markCancelled } from '../ui.js';

// ---- Libellés ----
export const STATUT_LABELS = {
  libre: 'Libre', travail: 'En poste', expedition: 'En mission', infirmerie: 'Infirmerie',
  formation: 'Formation', diplomatie: 'Diplomatie', mort: 'Mort',
};
const statutLabel = s => STATUT_LABELS[s] || String(s ?? '?');

export const STAT_HELP = {
  vigueur: 'Endurance et force : points de vie en combat, résistance aux blessures et aux épreuves physiques.',
  dexterite: 'Adresse et réflexes : précision au combat, manœuvres délicates, pilotage serré.',
  intellect: 'Raisonnement : analyses, diagnostics médicaux, problèmes techniques.',
  sangfroid: 'Calme sous la pression : jets risqués, peur, situations qui dérapent.',
  charisme: 'Présence et persuasion : diplomatie, négociations, cohésion de l\'équipe.',
};
export const SKILL_HELP = {
  medecine: 'Soigner, diagnostiquer, stabiliser un blessé. Indispensable à l\'infirmerie.',
  ingenierie: 'Réparer, construire, faire tourner les machines. Mines, ateliers, générateurs.',
  science: 'Analyser, comprendre, chercher. Laboratoire et anomalies.',
  pilotage: 'Mener un vaisseau, atterrir là où personne ne devrait.',
  combat: 'Se battre, protéger, tenir une position.',
  linguistique: 'Langues, signaux, symboles inconnus. Diplomatie et ruines.',
  survie: 'Tenir dehors : terrains hostiles, vivres, orientation.',
};
const statAbbr = k => String(STAT_LABELS[k] ?? k).slice(0, 3).toUpperCase();

// ============================================================
//   PERSONNEL
// ============================================================
function postOf(p) {
  const a = memberAssignment(p.id);
  if (!a) return null;
  const def = MODULES[a.modKey];
  const job = jobsForModule(a.modKey)[a.slotIdx];
  if (!def || !job) return null;
  return { def, job, role: ROLES[job.role] || { nom: job.role, color: 'var(--text-mute)' } };
}

function topSkills(p, n = 2) {
  return SKILL_LIST.map(s => ({ s, v: p.skills?.[s] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n);
}

function hasCare(p) {
  return (p.statuts || []).length > 0;
}

// Carte d'un colon (ou d'un candidat). Compacte par défaut, dépliable.
export function renderPersonCard(p, opts = {}) {
  const cand = !!opts.isCandidate;
  const open = cand || isOpen('crew:' + p.id);
  const detId = 'pc-det-' + p.id;
  const age = cand ? p.age : currentAge(p);
  const post = cand ? null : postOf(p);
  const healthCap = cand ? 100 : maxHealthOf(p);
  const sante = Number(p.sante ?? 100);
  const sub = cand
    ? `${esc(age)} ans · ${esc(p.origin?.label || '')}`
    : `${esc(age)} ans · ${post ? `<span style="color:${post.role.color}">${esc(post.job.label)}</span> · ${esc(post.def.nom)}` : 'sans poste'}`;
  const skills = topSkills(p).map(x => `<span class="sk-chip">${SKILL_LABELS[x.s]} <b>${esc(x.v)}</b></span>`).join('');
  const traitsShort = (p.traits || []).map(tid => {
    const t = TRAITS[tid];
    return t ? `<span class="trait-chip ${esc(t.kind)}">${esc(t.nom)}</span>` : '';
  }).join('');

  // Ligne médicale et action de soin
  let care = '';
  if (!cand && hasCare(p)) {
    const grave = (p.statuts || []).some(s => {
      const def = STATUTS[s.key];
      return def && (def.severity >= 3 || def.untreated?.become === 'mort');
    });
    const n = (p.statuts || []).length;
    const btn = hasApp('soigner') && !['expedition', 'diplomatie', 'mort'].includes(p.statut)
      ? `<button type="button" class="care-btn" data-soigner="${esc(p.id)}">Soigner</button>`
      : `<button type="button" class="care-btn ghost" data-goto="equipage/soins">Infirmerie →</button>`;
    care = `<div class="pc-care${grave ? ' grave' : ''}"><span>⚠ ${n > 1 ? `${n} problèmes de santé` : 'Problème de santé'}${grave ? ' · grave' : ''}</span>${btn}</div>`;
  }

  let details = '';
  if (open) {
    const statsHTML = Object.entries(p.stats || {}).map(([k, v]) => {
      const cls = v >= 8 ? 'high' : v <= 3 ? 'low' : '';
      return `<div class="kv ${cls}"><span class="k">${esc(STAT_LABELS[k] ?? k)}</span><span class="v">${esc(v)}</span></div>`;
    }).join('');
    const skillsHTML = SKILL_LIST.map(s => {
      const v = p.skills?.[s] || 0;
      return `<div class="kv ${v === 0 ? 'zero' : v >= 3 ? 'notable' : ''}"><span class="k">${SKILL_LABELS[s]}</span><span class="v">${esc(v)}</span></div>`;
    }).join('');
    const traitsHTML = (p.traits || []).map(tid => {
      const t = TRAITS[tid];
      if (!t) return '';
      return `<li><span class="trait-chip ${esc(t.kind)}">${esc(t.nom)}</span> <span class="trait-desc">${esc(t.desc)}</span></li>`;
    }).join('');
    let relationsHTML = '';
    if (!cand && S.crew.length > 1) {
      const { friends, rivals } = significantRelations(p.id);
      const chip = ({ member, affinity }) => {
        const t = relationType(affinity);
        return `<span class="rel-chip" style="color:${t.color}">${esc(member.name)} <small>${esc(t.label)}</small></span>`;
      };
      if (friends.length) relationsHTML += `<div class="rel-line"><span class="rel-lbl">Liens :</span> ${friends.map(chip).join('')}</div>`;
      if (rivals.length) relationsHTML += `<div class="rel-line"><span class="rel-lbl">Tensions :</span> ${rivals.map(chip).join('')}</div>`;
    }
    let career = '';
    if (post) {
      const ab = ancienneteBonus(p);
      const days = p.posteInfo ? Math.max(0, dayOf(S.meta.gameMin) - dayOf(p.posteInfo.depuis || 0)) : 0;
      career = `<div class="pc-line">Poste : <span style="color:${post.role.color}">${esc(post.job.label)}</span> · ${esc(post.def.nom)}${days > 0 ? ` · depuis ${plur(days, 'jour')}` : ''}${ab.label ? ` <span class="career-badge cb-${esc(ab.label.toLowerCase())}">${esc(ab.label)} +${Math.round((ab.mult - 1) * 100)} %</span>` : ''}</div>`;
      if (p.posteHistorique?.length) career += `<div class="pc-line dim">${plur(p.posteHistorique.length, 'poste précédent', 'postes précédents')}</div>`;
    }
    const seq = (p.sequels || []).map(sq => SEQUELS[sq.key]).filter(Boolean);
    details = `<div class="pc-details" id="${esc(detId)}">
      ${cand ? '' : `<div class="pc-line origin">${esc(p.origin?.label || '')}${p.origin?.notes ? ` — <span class="dim">${esc(p.origin.notes)}</span>` : ''}</div>`}
      <div class="kv-title">Caractéristiques</div>
      <div class="kv-grid">${statsHTML}</div>
      <div class="kv-title">Compétences</div>
      <div class="kv-grid">${skillsHTML}</div>
      ${traitsHTML ? `<div class="kv-title">Traits</div><ul class="trait-list">${traitsHTML}</ul>` : ''}
      ${seq.length ? `<div class="kv-title">Séquelles</div><ul class="trait-list">${seq.map(d => `<li><span class="sequel-chip">${esc(d.nom)}</span> <span class="trait-desc">${esc(d.desc || '')}</span></li>`).join('')}</ul>` : ''}
      ${relationsHTML ? `<div class="rel-block">${relationsHTML}</div>` : ''}
      ${career}
      ${cand ? '' : `<div class="pc-line vitals">Santé <b>${esc(sante)} %${healthCap < 100 ? ` / ${esc(healthCap)} %` : ''}</b> · Moral <b>${esc(p.moral)}</b> · Loyauté <b>${esc(p.loyaute)}</b></div>`}
    </div>`;
  }

  let actions = '';
  if (cand) {
    const cap = crewUsage();
    const full = cap.used >= cap.total;
    actions = `<div class="salary">Prétention : <b>${esc(p.salary)} biomasse par jour</b></div>
      <div class="actions-row">
        <button class="refuse" data-action="refuse" data-id="${esc(p.id)}">Écarter</button>
        <button class="accept" data-action="accept" data-id="${esc(p.id)}" ${full ? 'disabled' : ''}>${full ? 'Habitat plein' : 'Engager'}</button>
      </div>`;
  }

  const lowHealth = sante < 40 ? ' low' : '';
  return `<div class="person crew-card${cand ? ' candidate' : ''}${opts.fresh ? ' fresh' : ''}${open ? ' open' : ''}" data-id="${esc(p.id)}">
    ${cand
      ? `<div class="pc-summary static"><span class="pc-main"><span class="pname">${esc(p.name)}</span><span class="pc-sub">${sub}</span></span></div>`
      : `<button type="button" class="pc-summary" data-toggle="crew:${esc(p.id)}" aria-expanded="${open}" aria-controls="${esc(detId)}">
          <span class="pc-main"><span class="pname">${esc(p.name)}</span><span class="pc-sub">${sub}</span></span>
          <span class="pc-side"><span class="status-tag ${esc(p.statut)}">${esc(statutLabel(p.statut))}</span><span class="pc-health${lowHealth}">santé ${esc(sante)} %</span></span>
        </button>`}
    <div class="pc-tags">${skills}${traitsShort}</div>
    ${care}
    ${details}
    ${actions}
  </div>`;
}

export function renderCrew() {
  const list = $('#crewList');
  const sub = $('#crewSub');
  const cap = crewUsage();
  const alive = aliveCrew();
  const dead = S.crew.filter(m => m.statut === 'mort');
  if (cap.total === 0) setHTML(sub, 'Construis un <em>Habitat</em> pour loger un équipage.');
  else setHTML(sub, `${cap.used} / ${cap.total} places occupées · touche un colon pour le détail`);

  let html = '';
  if (alive.length === 0) {
    html = cap.total === 0
      ? emptyState('Personne à bord. Il faut d\'abord des couchettes.', { goto: 'base/construction', cible: 'habitat', label: 'Construire l\'Habitat' })
      : emptyState('Aucun membre actif. Les candidats répondent à la balise.', { goto: 'equipage/recrutement', label: 'Recrutement' });
  } else {
    html = alive.map(p => renderPersonCard(p)).join('');
  }
  if (dead.length > 0) {
    html += `<h3 class="section-h">In memoriam (${dead.length})</h3>`;
    html += dead.map(p => {
      const traits = (p.traits || []).slice(0, 2).map(t => TRAITS[t]?.nom || t).join(', ') || '—';
      const d = dayOf(p.diedAt ?? S.meta.gameMin);
      return `<div class="person dead-row" data-id="${esc(p.id)}">
        <div class="head-row">
          <div class="pname">${esc(p.name)}</div>
          <div class="pmeta">${accord(p, 'mort', 'morte', '†')} le jour ${d}</div>
        </div>
        <div class="origin">${esc(p.origin?.label || '')}<small>${esc(traits)} · ${esc(p.age)} ans</small></div>
      </div>`;
    }).join('');
  }
  setHTML(list, html);
}

// ---- Légende (glossaire) ----
export function openGlossary() {
  const m = $('#modal');
  const bg = $('#modalBg');
  const stats = Object.keys(STAT_LABELS).map(k => `<li><b>${esc(STAT_LABELS[k])}</b> <span class="abbr">${statAbbr(k)}</span><br><span>${esc(STAT_HELP[k] || '')}</span></li>`).join('');
  const skills = SKILL_LIST.map(k => `<li><b>${esc(SKILL_LABELS[k])}</b><br><span>${esc(SKILL_HELP[k] || '')}</span> <span class="dim">Échelle 0 à 5.</span></li>`).join('');
  const byKind = { positif: [], ambigu: [], negatif: [] };
  for (const [id, t] of Object.entries(TRAITS)) (byKind[t.kind] || (byKind[t.kind] = [])).push({ id, ...t });
  const kindLbl = { positif: 'Traits favorables', ambigu: 'Traits ambigus', negatif: 'Traits défavorables' };
  const traits = Object.entries(byKind).filter(([, l]) => l.length).map(([k, l]) => `
    <h4>${esc(kindLbl[k] || k)}</h4>
    <ul class="gloss-list">${l.map(t => `<li><span class="trait-chip ${esc(t.kind)}">${esc(t.nom)}</span> <span>${esc(t.desc)}</span></li>`).join('')}</ul>`).join('');
  m.className = 'modal glossary-modal';
  m.innerHTML = `
    <h3>Légende de l'équipage</h3>
    <h4>Caractéristiques (1 à 10)</h4>
    <ul class="gloss-list">${stats}</ul>
    <h4>Compétences</h4>
    <ul class="gloss-list">${skills}</ul>
    ${traits}
    <div class="btn-row"><button class="primary" data-modal-cancel>Fermer</button></div>`;
  bg.classList.add('show');
  m.querySelector('[data-modal-cancel]')?.addEventListener('click', () => bg.classList.remove('show'));
}

// ============================================================
//   RECRUTEMENT
// ============================================================
export function renderRecruit() {
  const list = $('#candidateList');
  const sub = $('#recruitSub');
  if (!S.modules.balise_recrutement) {
    setHTML(sub, 'Aucune balise ne diffuse nos conditions d\'engagement.');
    setHTML(list, emptyState('Silence radio. Construis une <em>Balise de recrutement</em> pour recevoir des candidats.', { goto: 'base/construction', cible: 'balise_recrutement', label: 'Construire la balise' }));
    return;
  }
  const lvl = S.modules.balise_recrutement.level;
  const cap = crewUsage();
  const nextIn = Math.max(0, (S.nextRecruitMin || 0) - S.meta.gameMin);
  setHTML(sub, `Balise niv. ${esc(lvl)} · prochain signal dans ${fmtDuree(nextIn)} · habitat ${cap.used}/${cap.total}`);
  if (S.candidates.length === 0) {
    setHTML(list, '<div class="empty">Aucun candidat pour le moment. La balise continue d\'émettre.</div>');
    return;
  }
  setHTML(list, S.candidates.map((c, i) => renderPersonCard(c, { isCandidate: true, fresh: i === S.candidates.length - 1 })).join(''));
}

// ============================================================
//   FORMATION
// ============================================================
// Encart : colons affectés au bâtiment, bonus actuels, lien vers les postes
export function renderStaffPanel(modKey, opts = {}) {
  const def = MODULES[modKey];
  if (!def || !S.modules[modKey]) return '';
  const jobs = jobsForModule(modKey);
  if (jobs.length === 0) return '';
  const rows = jobs.map((job, i) => {
    const id = S.assignments[jobKey(modKey, i)];
    const m = id ? S.crew.find(c => c.id === id) : null;
    const role = ROLES[job.role] || { nom: job.role, color: 'var(--text-mute)' };
    const onPost = m && m.statut === 'travail';
    const who = onPost ? esc(m.name) : m ? `${esc(m.name)} · ${esc(statutLabel(m.statut).toLowerCase())}` : 'vacant';
    return `<div class="staff-row${onPost ? '' : ' vacant'}" style="border-left-color:${role.color}">
      <div class="sr-info"><span class="role-mini" style="color:${role.color}">${role.nom}</span>${job.label}</div>
      <div class="sr-name">${who}</div>
    </div>`;
  }).join('');
  return `<div class="staff-panel">
    <div class="sp-head">
      <div class="sp-title">${opts.title || `Équipe — ${def.nom}`}</div>
      <button class="sp-link" data-goto-assign="${esc(modKey)}">Gérer →</button>
    </div>
    ${opts.bonusText ? `<div class="sp-bonuses">${opts.bonusText}</div>` : ''}
    <div class="staff-list">${rows}</div>
  </div>`;
}

export function renderFormation() {
  const sub = $('#formationSub');
  const status = $('#formationStatus');
  const list = $('#formationList');
  const btn = $('#btnNewTraining');
  const center = S.modules.formation;
  if (!center) {
    setHTML(sub, 'Aucun centre de formation.');
    setHTML(status, '');
    setHTML(list, emptyState('Un <em>Centre de formation</em> permet d\'apprendre une compétence auprès d\'un instructeur.', { goto: 'base/construction', cible: 'formation', label: 'Construire le centre' }));
    btn.style.display = 'none';
    return;
  }
  const lvl = center.level;
  const cap = lvl;
  const inUse = S.training.length;
  setHTML(sub, `Centre niv. ${esc(lvl)} · niveau enseignable jusqu'à <em>${esc(lvl + 1)}</em>`);
  const fb = formationBonuses();
  const parts = [];
  if (fb.speedMult < 1) parts.push(`Formations <b>${Math.round((1 - fb.speedMult) * 100)} % plus rapides</b>`);
  if (fb.failChanceDelta < 0) parts.push(`Risque d'échec <b>−${Math.round(-fb.failChanceDelta * 100)} %</b>`);
  const bonusText = parts.length ? parts.join(' · ') : '<span class="none">Aucun bonus actif. Affecte un Pédagogue ou un Assistant.</span>';
  setHTML(status, renderStaffPanel('formation', { title: 'Équipe pédagogique', bonusText }) + `<div class="formation-status">
    Places : <b>${inUse}/${esc(cap)}</b> · Membres libres : <b>${S.crew.filter(m => m.statut === 'libre').length}</b>
  </div>`);
  if (S.training.length === 0) {
    setHTML(list, '<div class="empty">Aucune formation en cours.</div>');
  } else {
    setHTML(list, S.training.map(t => {
      if (!t) return '';
      const member = S.crew.find(m => m.id === t.memberId);
      if (!member) return '';
      const pct = Math.min(100, (t.doneMin / t.totalMin) * 100);
      const cur = member.skills[t.skill] || 0;
      const instr = t.instructorId ? S.crew.find(m => m.id === t.instructorId) : null;
      return `<div class="training-card" data-id="${esc(t.id)}">
        <div class="tcard-head">
          <div class="tname">${esc(member.name)}</div>
          <div class="tlevel">${esc(String(TRAINING_PROGRAMS[t.skill]?.nom ?? t.skill).toUpperCase())} · ${esc(cur)}→${esc(t.targetLvl)}</div>
        </div>
        <div class="tprog">
          <div class="bar" style="width:${pct}%"></div>
          <div class="lbl">${pct.toFixed(0)} % · reste ${fmtDuree(t.totalMin - t.doneMin)}</div>
        </div>
        <div class="tmeta">
          ${instr ? `<span class="instr">Instructeur : ${esc(instr.name)}</span>` : '<span>Auto-formation</span>'}
          <span class="risk">Risque d'échec : ${(t.failChance * 100).toFixed(0)} %</span>
        </div>
        <button class="cancel" data-cancel="${esc(t.id)}">Interrompre (50 % remboursés)</button>
      </div>`;
    }).join(''));
  }
  const placesAvail = cap - inUse;
  const free = S.crew.filter(m => m.statut === 'libre').length;
  btn.style.display = 'block';
  const off = placesAvail <= 0 || free === 0;
  if (btn.disabled !== off) btn.disabled = off;
  const label = placesAvail <= 0 ? `Toutes les places occupées (${cap}/${cap})` : free === 0 ? 'Aucun membre libre' : 'Lancer une formation';
  if (btn.textContent !== label) btn.textContent = label;
}

// Sélecteur de formation
let _trainPick = { memberId: null, skill: null };
export function showTrainingModal() {
  _trainPick = { memberId: null, skill: null };
  const m = $('#modal');
  m.className = 'modal training-modal';
  m.innerHTML = renderTrainingModalContent();
  $('#modalBg').classList.add('show');
  hookTrainingModal();
}

function renderTrainingModalContent() {
  const free = S.crew.filter(c => c.statut === 'libre');
  const memberOptions = free.map(c => {
    const sel = c.id === _trainPick.memberId ? 'selected' : '';
    const traits = (c.traits || []).map(traitNom).join(', ') || '—';
    return `<div class="tpicker-item ${sel}" data-pick-member="${esc(c.id)}" role="button" tabindex="0"${sel ? ' aria-pressed="true"' : ''}>
      <div class="pi-name">${esc(c.name)}</div>
      <div class="pi-detail">Traits : ${esc(traits)}</div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:18px">Aucun membre libre.</div>';
  const member = free.find(c => c.id === _trainPick.memberId);
  const skillOptions = SKILL_LIST.map(s => {
    const cur = member ? (member.skills[s] || 0) : 0;
    const target = member ? trainingTargetLevel(member, s) : null;
    const sel = s === _trainPick.skill ? 'selected' : '';
    const dis = !member || target === null ? 'disabled' : '';
    let detail;
    if (member) detail = target === null ? (cur >= 5 ? `Niv. ${cur} · maximum` : `Niv. ${cur} · centre trop bas`) : `Niv. ${cur} → ${target}`;
    else detail = 'Choisis d\'abord un colon';
    return `<div class="tpicker-item ${sel} ${dis}" data-pick-skill="${s}" role="button"${dis ? ' aria-disabled="true"' : ' tabindex="0"'}${sel ? ' aria-pressed="true"' : ''}>
      <div class="pi-name">${nomOf(TRAINING_PROGRAMS, s)}</div>
      <div class="pi-detail">${detail}</div>
    </div>`;
  }).join('');
  let estimateHTML = '';
  let canLaunch = false;
  if (_trainPick.memberId && _trainPick.skill) {
    const r = canTrain(_trainPick.memberId, _trainPick.skill);
    if (r.ok) {
      canLaunch = true;
      const costStr = Object.entries(r.cost).map(([k, v]) => `${RES_LABELS[k]} ${v}`).join(' · ');
      estimateHTML = `<div class="estimate">
        <div class="row"><span class="lbl">Niveau visé</span><span class="val">${r.target}</span></div>
        <div class="row"><span class="lbl">Durée</span><span class="val">${fmtDuree(r.duration)}</span></div>
        <div class="row"><span class="lbl">Coût</span><span class="val">${costStr}</span></div>
        <div class="row"><span class="lbl">Instructeur</span><span class="val">${esc(r.instructor ? r.instructor.name : '—')}</span></div>
        <div class="row"><span class="lbl">Risque d'échec</span><span class="val ${r.failChance > 0.1 ? 'warn' : 'ok'}">${(r.failChance * 100).toFixed(0)} %</span></div>
      </div>`;
    } else {
      estimateHTML = `<div class="estimate"><div class="ko">${esc(r.reason)}</div></div>`;
    }
  }
  return `
    <h3>Nouvelle formation</h3>
    <p class="picker-step">1. Colon</p>
    <div class="tpicker">${memberOptions}</div>
    <p class="picker-step">2. Programme</p>
    <div class="tpicker">${skillOptions}</div>
    ${estimateHTML}
    <div class="btn-row">
      <button id="trainCancel">Annuler</button>
      <button class="primary" id="trainLaunch" ${canLaunch ? '' : 'disabled'}>Lancer</button>
    </div>`;
}

function hookTrainingModal() {
  const m = $('#modal');
  const close = () => $('#modalBg').classList.remove('show');
  m.querySelectorAll('[data-pick-member]').forEach(el => el.addEventListener('click', () => {
    _trainPick.memberId = el.dataset.pickMember;
    if (_trainPick.skill) {
      const member = S.crew.find(c => c.id === _trainPick.memberId);
      if (member && trainingTargetLevel(member, _trainPick.skill) === null) _trainPick.skill = null;
    }
    rerenderModal(renderTrainingModalContent(), hookTrainingModal);
  }));
  m.querySelectorAll('[data-pick-skill]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      _trainPick.skill = el.dataset.pickSkill;
      rerenderModal(renderTrainingModalContent(), hookTrainingModal);
    });
  });
  $('#trainCancel')?.addEventListener('click', close);
  $('#trainLaunch')?.addEventListener('click', () => {
    if (_trainPick.memberId && _trainPick.skill) {
      startTraining(_trainPick.memberId, _trainPick.skill);
      close();
    }
  });
}

// ============================================================
//   SOINS
// ============================================================
export function renderSoins() {
  const sub = $('#soinsSub');
  const status = $('#soinsStatus');
  const alert = $('#soinsAlert');
  const body = $('#soinsBody');
  const patients = $('#soinsPatients');
  const attention = $('#soinsAttention');
  const inf = S.modules.infirmerie;
  if (!inf) {
    setHTML(sub, 'Aucune infirmerie.');
    setHTML(status, '');
    setHTML(alert, emptyState('Une <em>Infirmerie</em> permet de diagnostiquer et de traiter les blessés.', { goto: 'base/construction', cible: 'infirmerie', label: 'Construire l\'infirmerie' }));
    if (body) body.hidden = true;
    return;
  }
  if (body) body.hidden = false;
  const beds = infirmaryBeds();
  const used = bedsInUse();
  const doctor = bestAvailableDoctor();
  const docInfo = doctor
    ? `<b>${esc(doctor.name)}</b> (Médecine ${esc(doctor.skills?.medecine)})`
    : '<span style="color:var(--rust-text)">aucun médecin disponible</span>';
  setHTML(sub, `Infirmerie niv. ${esc(inf.level)} · diagnostics et traitements jusqu'au palier ${esc(inf.level)}`);
  const ib = infirmaryBonuses();
  const parts = [];
  if (ib.speedMult < 1) parts.push(`Soins <b>${Math.round((1 - ib.speedMult) * 100)} % plus rapides</b>`);
  if (ib.diagBonus > 0) parts.push(`Diagnostic <b>+${ib.diagBonus}</b>`);
  if (ib.traitMedecinNe) parts.push('Trait <b>Médecin né</b> dans l\'équipe');
  const bonusText = parts.length ? parts.join(' · ') : '<span class="none">Aucun bonus actif. Affecte du personnel pour améliorer les soins.</span>';
  setHTML(status, renderStaffPanel('infirmerie', { title: 'Équipe médicale', bonusText }) + `<div class="soins-status ${used >= beds ? 'full' : ''}">
    Lits : <b>${used}/${beds}</b> · Médecin : ${docInfo}
  </div>`);
  const needAdmission = S.crew.filter(m => m.statut === 'libre' && (m.statuts || []).some(s => {
    const def = STATUTS[s.key];
    return def && (def.severity >= 3 || def.untreated?.become === 'mort');
  }));
  setHTML(alert, used >= beds && needAdmission.length > 0
    ? `<div class="soins-alert"><b>Triage requis.</b> ${plur(needAdmission.length, 'colon')} en attente de soins critiques. Fais sortir un patient ou agrandis l'infirmerie.</div>`
    : '');
  const admitted = S.crew.filter(m => m.statut === 'infirmerie');
  setHTML(patients, admitted.length ? admitted.map(m => renderPatientCard(m, true)).join('') : '<div class="empty">Aucun patient admis.</div>');
  const needAttention = S.crew.filter(m => m.statut !== 'infirmerie' && m.statut !== 'mort' && ((m.statuts || []).length > 0 || (m.sequels || []).length > 0));
  setHTML(attention, needAttention.length ? needAttention.map(m => renderPatientCard(m, false)).join('') : '<div class="empty">Personne ne requiert de soin.</div>');
}

function renderPatientCard(member, admitted) {
  const healthCls = member.sante < 40 ? 'low' : '';
  const canAdmit = bedsInUse() < infirmaryBeds();
  const statuts = Array.isArray(member.statuts) ? member.statuts : [];
  const sequels = Array.isArray(member.sequels) ? member.sequels : [];
  const statutsHTML = statuts.length === 0
    ? '<div class="pc-line dim">Aucun statut actif.</div>'
    : statuts.map((s, idx) => renderStatusRow(member, s, idx, admitted)).join('');
  const sequelsHTML = sequels.length ? `<div class="sequels-list">${sequels.map(sq => {
    const def = SEQUELS[sq.key];
    return def ? `<span class="sequel-chip">${esc(def.nom)}</span>` : '';
  }).join('')}</div>` : '';
  let actions = '';
  const soignerBtn = hasApp('soigner') && statuts.length > 0 && ['libre', 'travail', 'formation', 'infirmerie'].includes(member.statut)
    ? `<button class="treat" data-soigner="${esc(member.id)}">Soigner (diagnostic + traitement)</button>` : '';
  if (admitted) {
    actions = `<div class="patient-actions">${soignerBtn}<button class="discharge" data-act="discharge" data-mid="${esc(member.id)}">Faire sortir</button></div>`;
  } else if (statuts.length > 0 && ['libre', 'travail', 'formation'].includes(member.statut)) {
    actions = `<div class="patient-actions">${soignerBtn}
      <button class="admit" data-act="admit" data-mid="${esc(member.id)}" ${canAdmit ? '' : 'disabled'}>${canAdmit ? 'Admettre à l\'infirmerie' : 'Lits pleins'}</button>
    </div>`;
  } else if (statuts.length > 0) {
    actions = `<div class="patient-actions"><button disabled>Indisponible (${esc(statutLabel(member.statut).toLowerCase())})</button></div>`;
  }
  return `<div class="patient-card ${admitted ? '' : 'libre'}" data-id="${esc(member.id)}">
    <div class="pcard-head">
      <div class="pname">${esc(member.name)}</div>
      <div class="health-bar">Santé <span class="v ${healthCls}">${esc(member.sante)} %</span> · Moral ${esc(member.moral)}</div>
    </div>
    ${statutsHTML}
    ${sequelsHTML}
    ${actions}
  </div>`;
}

function renderStatusRow(member, status, idx, admitted) {
  const def = STATUTS[status.key] || { nom: String(status.key ?? '?'), short: '', kind: 'inconnu', detect: 'auto' };
  const elapsed = S.meta.gameMin - status.since;
  const treatment = S.treatments.find(t => t.memberId === member.id && t.statusIdx === idx);
  const isUnknown = !status.diagnosed;
  const displayName = isUnknown ? 'Anomalie suspecte' : def.nom;
  const displayShort = isUnknown ? 'Le patient présente des symptômes inexpliqués. Diagnostic requis.' : def.short;
  let countdownHTML = '';
  if (def.untreated && def.untreated.afterMin > 0 && status.diagnosed && !treatment) {
    const remaining = def.untreated.afterMin - elapsed;
    if (remaining > 0) {
      const what = def.untreated.become;
      const label = what === 'mort' ? 'décès dans' : what === 'mutinerie' ? 'mutinerie dans' : 'complication dans';
      countdownHTML = `<span class="countdown">${label} ${fmtDuree(remaining)}</span>`;
    }
  } else if (def.untreated && def.untreated.selfCure && !treatment) {
    const remaining = def.untreated.afterMin - elapsed;
    if (remaining > 0) countdownHTML = `<span class="ok">guérison naturelle dans ${fmtDuree(remaining)}</span>`;
  }
  let treatmentHTML = '';
  if (treatment) {
    const pct = Math.min(100, (treatment.doneMin / treatment.totalMin) * 100);
    treatmentHTML = `<div class="treatment-progress">
      <div class="bar" style="width:${pct}%"></div>
      <div class="lbl">Traitement · ${pct.toFixed(0)} % · reste ${fmtDuree(treatment.totalMin - treatment.doneMin)}</div>
    </div>`;
  }
  let actionsHTML = '';
  if (admitted && !treatment) {
    if (isUnknown) {
      const r = canDiagnose(member.id, idx);
      const costStr = r.ok ? (Object.entries(r.cost || {}).map(([k, v]) => `${v} ${RES_LABELS[k] || k}`).join(' · ') || 'gratuit') : '';
      const label = r.ok ? `Diagnostiquer (${costStr})` : (r.reason || 'Diagnostic impossible');
      actionsHTML = `<div class="statut-actions">
        <button class="diagnose" data-act="diagnose" data-mid="${esc(member.id)}" data-s="${idx}" ${r.ok ? '' : 'disabled'}>${esc(label)}</button>
      </div>`;
    } else {
      const r = canTreat(member.id, idx);
      const tdef = TREATMENTS[status.key]?.[0];
      const costStr = tdef ? Object.entries(tdef.cost).map(([k, v]) => `${RES_LABELS[k]} ${v}`).join(' · ') : '';
      const label = r.ok ? `Traiter (${costStr})` : r.reason;
      actionsHTML = `<div class="statut-actions">
        <button class="treat" data-act="treat" data-mid="${esc(member.id)}" data-s="${idx}" ${r.ok ? '' : 'disabled'}>${esc(label)}</button>
      </div>`;
    }
  } else if (!admitted && !isUnknown && !hasApp('soigner')) {
    actionsHTML = '<div class="statut-actions"><button disabled>Admission requise pour le traitement</button></div>';
  }
  return `<div class="statut-row ${isUnknown ? 'hidden-status' : ''}">
    <div class="srow-head">
      <div class="sname ${isUnknown ? 'unknown' : ''}">${esc(displayName)}</div>
      <div class="skind ${esc(def.kind)}">${esc(def.kind)}</div>
    </div>
    <div class="sshort">${displayShort}</div>
    <div class="smeta">Apparu il y a ${fmtDuree(elapsed)}${countdownHTML ? ' · ' + countdownHTML : ''}</div>
    ${treatmentHTML}
    ${actionsHTML}
  </div>`;
}

// ============================================================
//   Actions
// ============================================================
export const ACTIONS = [
  ['#candidateList button[data-action]', el => {
    if (el.dataset.action === 'accept') acceptCandidate(el.dataset.id);
    else refuseCandidate(el.dataset.id);
  }],
  ['#formationList button[data-cancel]', el => {
    markCancelled('tr:' + el.dataset.cancel);
    cancelTraining(el.dataset.cancel);
    render();
  }],
  ['#subview-soins button[data-act]', el => {
    const act = el.dataset.act;
    const mid = el.dataset.mid;
    const sIdx = el.dataset.s !== undefined ? parseInt(el.dataset.s, 10) : null;
    if (act === 'admit') admitToInfirmary(mid);
    else if (act === 'discharge') dischargeMember(mid);
    else if (act === 'diagnose') startDiagnostic(mid, sIdx);
    else if (act === 'treat') startTreatment(mid, sIdx);
  }],
  ['button[data-glossary]', () => openGlossary()],
];

