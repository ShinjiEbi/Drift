// views/labo.js — onglet « Labo » : recherche (liste compacte par branche,
// filtres, file), atelier, inventaire, schémas découverts.

import { $ } from '../util.js';
import { RES_LABELS, BUILD_TIME_MULT } from '../constants.js';
import {
  ITEMS, ITEM_TYPES, ITEM_ORIGINS, BLUEPRINTS, TECH_TREE, TECH_BRANCHES, FABRICATIONS, MODULES,
} from '../catalog.js';
import { ARCS } from '../data-arcs-factions.js';
import { S } from '../state.js';
import {
  isExoticUnlocked, isTechCompleted, isTechResearching, canResearch, startResearch, cancelResearch,
  laboratoryBonuses, workshopBonuses, workshopSlots, isFabAvailable, canFabricate, startFabrication,
  cancelFabrication, inventoryCount, getArcState,
} from '../app.js';
import {
  appCall, hasApp, esc, fmt, fmtDuree, setHTML, progressHTML, emptyState, filterChips, getFilter, dayOf, plur,
} from './common.js';
import { toast, render, confirmModal, markCancelled } from '../ui.js';
import { renderStaffPanel } from './equipage.js';
import { researchRemaining, researchRate0, fabRemaining } from './base.js';

// ============================================================
//   RECHERCHE
// ============================================================
// Nom d'un schéma sans le préfixe « Schéma : » du catalogue (évite « Schéma : Schéma : … »)
export const bpNom = id => String(BLUEPRINTS[id]?.nom || id || '?').replace(/^Schéma\s*:\s*/i, '');
// Raisons venues du moteur : « Requiert le schéma : Schéma : X » → « Requiert le schéma : X »
const reasonTxt = s => String(s || '').replace(/(schéma)\s*:\s*schéma\s*:\s*/i, '$1 : ');
const labSlots = () => Math.max(1, Math.ceil((S.modules.laboratoire?.level || 0) / 2));
const researchQueue = () => (Array.isArray(S.researchQueue) ? S.researchQueue : []).map(t => (typeof t === 'string' ? t : t?.techId)).filter(Boolean);

// Prérequis non remplis (indépendants des ressources et des places)
function unmetPrereqs(techId) {
  const tech = TECH_TREE[techId];
  const out = [];
  if (!tech) return ['Tech inconnue'];
  if (tech.branch === 'exotique' && !isExoticUnlocked()) out.push('un schéma alien');
  for (const t of tech.prereq?.tech || []) if (!isTechCompleted(t)) out.push(TECH_TREE[t]?.nom || t);
  if (tech.prereq?.blueprint && !S.discoveries?.[tech.prereq.blueprint]) out.push(`schéma ${bpNom(tech.prereq.blueprint)}`);
  if (tech.prereq?.requireAnyAlienBlueprint && !isExoticUnlocked() && !out.includes('un schéma alien')) out.push('un schéma alien');
  if (tech.prereq?.requireArc && !getArcState(tech.prereq.requireArc).rewardClaimed) out.push(`fil rouge « ${ARCS[tech.prereq.requireArc]?.nom || tech.prereq.requireArc} » achevé`);
  return out;
}

export function techStatus(techId) {
  if (isTechCompleted(techId)) return 'fait';
  if (isTechResearching(techId) || researchQueue().includes(techId)) return 'cours';
  if (unmetPrereqs(techId).length) return 'verrou';
  return 'dispo';
}

// Durée réelle d'une recherche : App.researchEta si présent, sinon estimation
export function researchDuration(techId) {
  const r = (S.research || []).find(x => x.techId === techId);
  if (r) return researchRemaining(r);
  const eta = appCall('researchEta', [techId], null);
  if (Number.isFinite(eta) && eta >= 0) return eta;
  const tech = TECH_TREE[techId];
  return (tech?.cost?.time || 0) * BUILD_TIME_MULT / researchRate0(techId);
}

const RFILTERS = [['dispo', 'Disponible'], ['cours', 'En cours'], ['fait', 'Fait'], ['verrou', 'Verrouillé']];

export function renderResearch() {
  const sub = $('#researchSub');
  const content = $('#researchContent');
  if (!sub || !content) return;
  const labLvl = S.modules.laboratoire?.level || 0;
  const all = Object.keys(TECH_TREE);
  const completed = all.filter(id => isTechCompleted(id)).length;
  if (labLvl === 0) {
    setHTML(sub, 'Aucun laboratoire.');
    setHTML(content, emptyState('Le <em>Laboratoire</em> transforme les datacubes en connaissances.', { goto: 'base/construction', cible: 'laboratoire', label: 'Construire le laboratoire' }));
    return;
  }
  const slots = labSlots();
  const ongoing = (S.research || []).length;
  const lb = laboratoryBonuses();
  const speed = lb.activeProd ? Math.round(100 / lb.speedMult) + ' %' : 'automatique (sans chercheur)';
  setHTML(sub, `Labo niv. ${esc(labLvl)} · ${ongoing}/${slots} en cours · ${completed}/${all.length} maîtrisées · ${fmt(S.res.datacubes)} datacubes${S.alienDatacubes ? ` · ${fmt(S.alienDatacubes)} alien` : ''} · vitesse ${speed}`);

  // Recherches actives et file
  let html = '<div class="build-panel research-panel">';
  html += `<div class="bp-head"><span class="bp-title">Laboratoire</span>${hasApp('enqueueResearch') ? `<span class="bp-queue">file ${researchQueue().length}/1</span>` : ''}</div>`;
  if (ongoing === 0) {
    html += '<div class="bp-idle">Aucune recherche en cours. Choisis une technologie ci-dessous.</div>';
  } else {
    html += S.research.map(r => {
      const tech = TECH_TREE[r.techId];
      const pct = Math.min(100, (r.doneMin / r.totalMin) * 100);
      return `<div class="research-active" data-id="${esc(r.id)}">
        <div class="ra-head">
          <div class="ra-name">${esc(tech?.nom || '?')}</div>
          <button class="ra-cancel" data-cancel-research="${esc(r.id)}">Annuler</button>
        </div>
        ${progressHTML(pct, `${pct.toFixed(0)} % · reste ${fmtDuree(researchRemaining(r))}`)}
      </div>`;
    }).join('');
  }
  const q = researchQueue();
  if (q.length) {
    html += '<ol class="bp-list">' + q.map((t, i) => `<li data-id="rq:${i}:${esc(t)}"><span class="bp-qname">${esc(TECH_TREE[t]?.nom || t)}</span>
      ${hasApp('cancelQueuedResearch') ? `<button type="button" class="bp-cancel" data-cancel-rqueue="${i}" aria-label="Retirer de la file : ${esc(TECH_TREE[t]?.nom || t)}">✕</button>` : ''}</li>`).join('') + '</ol>';
  }
  html += '</div>';

  const f = getFilter('recherche', 'dispo');
  const status = Object.fromEntries(all.map(id => [id, techStatus(id)]));
  const counts = Object.fromEntries(RFILTERS.map(([k]) => [k, all.filter(id => status[id] === k).length]));
  html += filterChips('recherche', RFILTERS, f, counts);
  let any = false;
  for (const branchKey of Object.keys(TECH_BRANCHES)) {
    const br = TECH_BRANCHES[branchKey];
    const techs = all.filter(id => TECH_TREE[id].branch === branchKey);
    const shown = techs.filter(id => status[id] === f).sort((a, b) => TECH_TREE[a].tier - TECH_TREE[b].tier);
    if (!shown.length) continue;
    any = true;
    const done = techs.filter(id => status[id] === 'fait').length;
    html += `<div class="branch-section">
      <div class="branch-head" style="color:${br.color}">
        <div class="b-name">${br.nom}</div>
        <div class="b-progress">${done}/${techs.length}</div>
      </div>
      <div class="tech-list">${shown.map(id => renderTechCard(id, br.color, status[id])).join('')}</div>
    </div>`;
  }
  if (!any) {
    const msg = { dispo: 'Aucune technologie accessible pour l\'instant.', cours: 'Aucune recherche en cours ni en file.', fait: 'Aucune technologie maîtrisée.', verrou: 'Plus rien de verrouillé.' }[f];
    html += `<div class="empty">${esc(msg || '')}</div>`;
  }
  setHTML(content, html);
}

function renderTechCard(techId, color, status) {
  const tech = TECH_TREE[techId];
  const r = canResearch(techId);
  const queued = researchQueue().includes(techId);
  let badge;
  if (status === 'fait') badge = '<span class="tc-status done">acquise</span>';
  else if (isTechResearching(techId)) badge = '<span class="tc-status cur">en cours</span>';
  else if (queued) badge = '<span class="tc-status cur">en file</span>';
  else if (status === 'verrou') badge = '<span class="tc-status lk">verrouillée</span>';
  else if (r.ok) badge = '<span class="tc-status av">disponible</span>';
  else badge = `<span class="tc-status lk">${esc(reasonTxt(r.reason))}</span>`;
  const cost = tech.cost || {};
  const parts = [];
  const live = status !== 'fait' && !isTechResearching(techId);
  parts.push(`<span class="${live && (S.res.datacubes || 0) < cost.datacubes ? 'ko' : ''}">${cost.datacubes} datacubes</span>`);
  if (cost.datacubes_alien) parts.push(`<span class="${live && (S.alienDatacubes || 0) < cost.datacubes_alien ? 'ko' : ''}">${cost.datacubes_alien} alien</span>`);
  if (status !== 'fait') parts.push(`<span class="dur">${fmtDuree(researchDuration(techId))}</span>`);
  const unmet = status === 'verrou' ? unmetPrereqs(techId) : [];
  const clickable = status === 'dispo' || status === 'cours';
  const cls = status === 'fait' ? 'completed' : status === 'verrou' ? 'locked' : isTechResearching(techId) || queued ? 'researching' : r.ok ? 'available' : 'pending';
  return `<div class="tech-card ${cls}" data-tech="${esc(techId)}"${clickable ? ' role="button" tabindex="0"' : ''} style="${status === 'dispo' ? `border-left-color:${color}` : ''}">
    <div class="tc-head">
      <div class="tc-name">${tech.nom} <span class="tc-tier">P${esc(tech.tier)}</span></div>
      ${badge}
    </div>
    <div class="tc-desc">${tech.desc}</div>
    <div class="tc-meta">${parts.join(' · ')}</div>
    ${unmet.length ? `<div class="tc-prereq unmet">Requiert : ${esc(unmet.join(' · '))}</div>` : ''}
  </div>`;
}

// Fenêtre de détail : effets, coût, lancer ou mettre en file
function techEffectsLines(tech) {
  const lines = [];
  const e = tech.effects || {};
  const pctMult = v => `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)} %`;
  if (e.resourceMult) for (const k in e.resourceMult) lines.push(`Production ${RES_LABELS[k]} ${pctMult(e.resourceMult[k])}`);
  if (e.moduleProdMult) for (const k in e.moduleProdMult) lines.push(`${MODULES[k]?.nom || k} : production ${pctMult(e.moduleProdMult[k])}`);
  if (e.moduleMaxLevelDelta) for (const k in e.moduleMaxLevelDelta) lines.push(`${MODULES[k]?.nom || k} : niveau max +${e.moduleMaxLevelDelta[k]}`);
  if (e.capacityMult) for (const k in e.capacityMult) lines.push(`Stockage ${RES_LABELS[k]} ${pctMult(e.capacityMult[k])}`);
  if (e.baseFractionDelta) lines.push(`Rendement sans personnel : +${(e.baseFractionDelta * 100).toFixed(0)} points`);
  if (e.treatmentSpeedMult) lines.push(`Durée des soins ${pctMult(e.treatmentSpeedMult)}`);
  if (e.contagionMult) lines.push(`Contagion ${pctMult(e.contagionMult)}`);
  if (e.sequelChanceMult) lines.push(`Risque de séquelles ${pctMult(e.sequelChanceMult)}`);
  if (e.trainingSpeedMult) lines.push(`Durée des formations ${pctMult(e.trainingSpeedMult)}`);
  if (e.workerBiomasseMult) lines.push(`Vivres d'un colon au travail ${pctMult(e.workerBiomasseMult)}`);
  if (e.expeditionBiomasseMult) lines.push(`Vivres en expédition ${pctMult(e.expeditionBiomasseMult)}`);
  if (e.expeditionAlienLootMult) lines.push(`Butin des ruines alien ${pctMult(e.expeditionAlienLootMult)}`);
  if (e.expeditionThreatBonus) lines.push(`Menace effective ${e.expeditionThreatBonus > 0 ? '+' : ''}${e.expeditionThreatBonus}`);
  if (e.expeditionCombatBonus) lines.push(`Combat de l'équipe +${e.expeditionCombatBonus}`);
  if (e.expeditionToxicImmune) lines.push('Immunité aux contaminations en expédition');
  if (e.vesselFuelMult) lines.push(`Carburant ${pctMult(e.vesselFuelMult)}`);
  if (e.vesselSpeedMult) lines.push(`Durée des voyages ${pctMult(e.vesselSpeedMult)}`);
  if (e.scanRangeBonus) lines.push(`Portée de scan +${e.scanRangeBonus}`);
  return lines;
}

export function openResearchModal(techId) {
  const tech = TECH_TREE[techId];
  if (!tech) return;
  const r = canResearch(techId);
  const br = TECH_BRANCHES[tech.branch] || { nom: tech.branch, color: 'var(--amber)' };
  const running = isTechResearching(techId);
  const queued = researchQueue().includes(techId);
  const canQueue = !r.ok && !running && !queued && hasApp('enqueueResearch') && (S.research || []).length >= labSlots() && unmetPrereqs(techId).length === 0;
  const cost = tech.cost || {};
  const lines = techEffectsLines(tech);
  const m = $('#modal');
  m.className = 'modal research-modal';
  m.innerHTML = `
    <div class="rm-branch" style="color:${br.color}">${br.nom} · palier ${tech.tier}</div>
    <h3>${tech.nom}</h3>
    <div class="rm-desc">${tech.desc}</div>
    ${lines.length ? `<ul class="rm-effects">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <div class="rm-cost">
      <span class="${(S.res.datacubes || 0) < cost.datacubes ? 'ko' : ''}">Datacubes : ${cost.datacubes} (${fmt(S.res.datacubes)} en stock)</span>
      ${cost.datacubes_alien ? `<span class="${(S.alienDatacubes || 0) < cost.datacubes_alien ? 'ko' : ''}">Datacubes alien : ${cost.datacubes_alien} (${fmt(S.alienDatacubes || 0)} en stock)</span>` : ''}
      <span>Durée : ${fmtDuree(researchDuration(techId))}</span>
    </div>
    ${!r.ok && !canQueue ? `<div class="rm-prereq">${esc(running ? 'Recherche en cours.' : queued ? 'Déjà en file.' : reasonTxt(r.reason))}</div>` : ''}
    ${canQueue ? '<div class="rm-prereq info">Le laboratoire est occupé : la recherche démarrera à la fin de l\'actuelle.</div>' : ''}
    <div class="btn-row">
      <button id="researchCancel">Fermer</button>
      ${canQueue
        ? '<button id="researchQueue" class="primary">Mettre en file</button>'
        : `<button id="researchConfirm" class="primary" ${r.ok ? '' : 'disabled'}>Lancer la recherche</button>`}
    </div>`;
  $('#modalBg').classList.add('show');
  const close = () => $('#modalBg').classList.remove('show');
  $('#researchCancel').addEventListener('click', close);
  $('#researchConfirm')?.addEventListener('click', () => { startResearch(techId); close(); render(); });
  $('#researchQueue')?.addEventListener('click', () => {
    const res = appCall('enqueueResearch', [techId], null);
    if (res && res.ok === false) toast(res.why || 'Impossible de mettre en file');
    else toast(`${tech.nom} : en file`);
    close();
    render();
  });
}

// ============================================================
//   ATELIER
// ============================================================
export function renderWorkshop() {
  const sub = $('#workshopSub');
  const status = $('#workshopStatus');
  const content = $('#workshopContent');
  if (!sub || !content) return;
  const lvl = S.modules.atelier?.level || 0;
  if (lvl === 0) {
    setHTML(sub, 'Aucun atelier.');
    setHTML(status, '');
    setHTML(content, emptyState('L\'<em>Atelier</em> fabrique rations, kits, outils et armes pour les expéditions.', { goto: 'base/construction', cible: 'atelier', label: 'Construire l\'atelier' }));
    return;
  }
  const inQueue = (S.fabrication || []).length;
  const slots = workshopSlots();
  const b = workshopBonuses();
  setHTML(sub, `Atelier niv. ${esc(lvl)} · ${inQueue}/${slots} en cours`);
  const parts = [];
  if (b.speedMult < 1) parts.push(`Fabrications <b>${Math.round((1 - b.speedMult) * 100)} % plus rapides</b>`);
  if (b.qualityChance > 0) parts.push(`<b>${Math.round(b.qualityChance * 100)} %</b> de chance de double production`);
  if (!b.hasArtisan) parts.push('<span style="color:var(--rust-text)">Aucun artisan : vitesse réduite</span>');
  const bonusText = parts.length ? parts.join(' · ') : '<span class="none">Aucun bonus actif. Affecte un Artisan.</span>';
  setHTML(status, renderStaffPanel('atelier', { title: 'Équipe de l\'atelier', bonusText }));
  let html = '<div class="fab-actives">';
  for (const f of S.fabrication || []) {
    const fab = FABRICATIONS[f.fabId];
    const pct = Math.min(100, (f.doneMin / f.totalMin) * 100);
    html += `<div class="fab-active" data-id="${esc(f.id)}">
      <div class="fa-head">
        <div class="fa-name">${esc(fab?.nom || '?')}</div>
        <button class="fa-cancel" data-cancel-fab="${esc(f.id)}">Annuler</button>
      </div>
      ${progressHTML(pct, `${pct.toFixed(0)} % · reste ${fmtDuree(fabRemaining(f))}`)}
    </div>`;
  }
  html += '</div>';
  const groups = { consumable: [], tool: [], weapon: [] };
  for (const fabId in FABRICATIONS) {
    const it = ITEMS[FABRICATIONS[fabId].produces];
    if (!it) continue;
    (groups[it.type] || (groups[it.type] = [])).push(fabId);
  }
  for (const typeKey of ['consumable', 'tool', 'weapon']) {
    const list = groups[typeKey];
    if (!list?.length) continue;
    const typeDef = ITEM_TYPES[typeKey];
    list.sort((a, bb) => ((isFabAvailable(a) ? 0 : 1) - (isFabAvailable(bb) ? 0 : 1)) ||
      ((FABRICATIONS[a].prereq?.workshopLevel || 1) - (FABRICATIONS[bb].prereq?.workshopLevel || 1)));
    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title">${typeDef.nom}</div>
        <div class="ish-desc">${cleanTypeDesc(typeDef.desc)}</div>
      </div>
      ${list.map(renderFabCard).join('')}
    </div>`;
  }
  setHTML(content, html);
}

function cleanTypeDesc(desc) {
  return String(desc || '').replace(/\s*\(à venir[^)]*\)/g, '');
}

function renderFabCard(fabId) {
  const fab = FABRICATIONS[fabId];
  const it = ITEMS[fab.produces];
  const ori = ITEM_ORIGINS[it.origin] || { color: 'var(--text-mute)' };
  const r = canFabricate(fabId);
  const inQueue = (S.fabrication || []).some(f => f.fabId === fabId);
  let cls, statusHTML;
  if (inQueue) { cls = 'in-queue'; statusHTML = '<span class="fc-status cur">en cours</span>'; }
  else if (r.ok) { cls = 'available'; statusHTML = '<span class="fc-status av">disponible</span>'; }
  else if (isFabAvailable(fabId)) { cls = 'locked'; statusHTML = `<span class="fc-status lk">${esc(reasonTxt(r.reason))}</span>`; }
  else { cls = 'locked'; statusHTML = '<span class="fc-status lk">verrouillée</span>'; }
  const costParts = Object.entries(fab.cost).map(([k, v]) => `<span class="${(S.res[k] || 0) < v && !inQueue ? 'ko' : ''}">${v} ${RES_LABELS[k]}</span>`);
  costParts.push(`<span class="dur">${fmtDuree(fab.time * BUILD_TIME_MULT)}</span>`);
  const unmet = [];
  if (fab.prereq?.workshopLevel && (S.modules.atelier?.level || 0) < fab.prereq.workshopLevel) unmet.push(`Atelier niv. ${fab.prereq.workshopLevel}`);
  if (fab.prereq?.blueprint && !S.discoveries?.[fab.prereq.blueprint]) unmet.push(`schéma ${bpNom(fab.prereq.blueprint)}`);
  for (const t of fab.prereq?.tech || []) if (!isTechCompleted(t)) unmet.push(`tech ${TECH_TREE[t]?.nom || t}`);
  const stock = (S.inventory || {})[fab.produces] || 0;
  return `<div class="fab-card ${cls}" data-fab="${esc(fabId)}"${cls === 'available' ? ' role="button" tabindex="0"' : ''} ${cls === 'available' ? `style="border-left-color:${ori.color}"` : ''}>
    <div class="fc-head">
      <div class="fc-name">${fab.nom}</div>
      <div class="fc-tags">${stock > 0 ? `<span class="fc-tag" style="color:var(--moss)">stock : ${esc(stock)}</span>` : ''}${statusHTML}</div>
    </div>
    <div class="fc-desc">${fab.desc}</div>
    <div class="fc-cost">${costParts.join(' · ')}</div>
    ${unmet.length ? `<div class="fc-prereq unmet">Requiert : ${esc(unmet.join(' · '))}</div>` : ''}
  </div>`;
}

function openFabModal(fabId) {
  const fab = FABRICATIONS[fabId];
  if (!fab) return;
  const r = canFabricate(fabId);
  const it = ITEMS[fab.produces];
  const ori = ITEM_ORIGINS[it.origin] || { nom: it.origin, color: 'var(--text-mute)' };
  const m = $('#modal');
  m.className = 'modal research-modal';
  m.innerHTML = `
    <div class="rm-branch" style="color:${ori.color}">${it.type === 'consumable' ? 'Consommable' : it.type === 'tool' ? 'Outil' : 'Armement'} · ${ori.nom}</div>
    <h3>${fab.nom}</h3>
    <div class="rm-desc">${it.desc}</div>
    <div class="rm-cost">
      ${Object.entries(fab.cost).map(([k, v]) => `<span class="${(S.res[k] || 0) < v ? 'ko' : ''}">${RES_LABELS[k]} : ${v} (${fmt(S.res[k] || 0)} en stock)</span>`).join('')}
      <span>Durée : ${fmtDuree(fab.time * BUILD_TIME_MULT)}</span>
    </div>
    ${!r.ok ? `<div class="rm-prereq">${esc(reasonTxt(r.reason))}</div>` : ''}
    <div class="btn-row">
      <button id="fabCancel">Fermer</button>
      <button id="fabConfirm" class="primary" ${r.ok ? '' : 'disabled'}>Lancer la fabrication</button>
    </div>`;
  $('#modalBg').classList.add('show');
  const close = () => $('#modalBg').classList.remove('show');
  $('#fabCancel').addEventListener('click', close);
  $('#fabConfirm').addEventListener('click', () => { startFabrication(fabId); close(); render(); });
}

// ============================================================
//   INVENTAIRE
// ============================================================
export function renderInventory() {
  const sub = $('#invSub');
  const content = $('#invContent');
  if (!sub || !content) return;
  const inv = S.inventory || {};
  const total = inventoryCount();
  const distinct = Object.keys(inv).filter(k => inv[k] > 0).length;
  if (total === 0) {
    setHTML(sub, 'Rien en stock.');
    setHTML(content, emptyState('Les expéditions rapportent artefacts et matériaux ; l\'atelier fabrique le reste.', { goto: 'expeditions/carte', label: 'Partir explorer' }));
    return;
  }
  setHTML(sub, `<b>${esc(total)}</b> objet${total > 1 ? 's' : ''} · ${plur(distinct, 'type', 'types')}`);
  const byOrigin = {};
  for (const id in inv) {
    if (!inv[id]) continue;
    const def = ITEMS[id];
    if (!def) continue;
    byOrigin[def.origin] = (byOrigin[def.origin] || 0) + inv[id];
  }
  const originLine = Object.entries(byOrigin).map(([o, n]) => `<span style="color:${ITEM_ORIGINS[o]?.color || 'var(--text)'}">${ITEM_ORIGINS[o]?.nom || esc(o)}</span> <b>${esc(n)}</b>`).join(' · ');
  let html = `<div class="inv-summary">Origine : ${originLine}</div>`;
  for (const typeKey of Object.keys(ITEM_TYPES)) {
    const ids = Object.keys(inv).filter(id => ITEMS[id]?.type === typeKey && inv[id] > 0);
    if (!ids.length) continue;
    const typeDef = ITEM_TYPES[typeKey];
    const typeTotal = ids.reduce((s, id) => s + inv[id], 0);
    ids.sort((a, b) => (ITEMS[a].origin.localeCompare(ITEMS[b].origin)) || ITEMS[a].nom.localeCompare(ITEMS[b].nom));
    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title">${typeDef.nom}</div>
        <div class="ish-desc">${cleanTypeDesc(typeDef.desc)}</div>
        <div class="ish-count">${esc(typeTotal)}</div>
      </div>
      <div class="inv-grid">${ids.map(id => {
        const def = ITEMS[id];
        const ori = ITEM_ORIGINS[def.origin] || { nom: def.origin, color: 'var(--text-mute)' };
        return `<div class="inv-card" style="border-left-color:${ori.color}">
          <div class="ic-head">
            <div class="ic-name">${def.nom}</div>
            <div class="ic-origin" style="color:${ori.color}">${ori.nom}</div>
          </div>
          <div class="ic-count">${esc(inv[id])}<span class="lbl">en stock</span></div>
          <div class="ic-desc">${def.desc}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  setHTML(content, html);
}

// ============================================================
//   SCHÉMAS (bibliothèque)
// ============================================================
export function renderLibrary() {
  const sub = $('#libSub');
  const content = $('#libContent');
  if (!sub || !content) return;
  const disc = S.discoveries || {};
  const all = Object.keys(BLUEPRINTS);
  const found = all.filter(id => disc[id]).length;
  setHTML(sub, found === 0 ? 'Aucun schéma découvert. Les <em>ruines</em> en recèlent.' : `<b>${found}</b> schéma${found > 1 ? 's' : ''} sur <b>${all.length}</b>`);
  const segs = all.map(id => `<span class="seg ${disc[id] ? 'found' : ''}"></span>`).join('');
  let html = `<div class="lib-summary">Catalogués : <b>${found} / ${all.length}</b><div class="progress">${segs}</div></div>`;
  for (const originKey of Object.keys(ITEM_ORIGINS)) {
    const ids = all.filter(id => BLUEPRINTS[id].origin === originKey);
    if (!ids.length) continue;
    const ori = ITEM_ORIGINS[originKey];
    ids.sort((a, b) => ((disc[a] ? 0 : 1) - (disc[b] ? 0 : 1)) || (BLUEPRINTS[a].rarity - BLUEPRINTS[b].rarity));
    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title" style="color:${ori.color}">${ori.nom}</div>
        <div class="ish-count">${ids.filter(id => disc[id]).length} / ${ids.length}</div>
      </div>`;
    for (const id of ids) {
      const bp = BLUEPRINTS[id];
      const isFound = !!disc[id];
      const rarity = ['', 'Commun', 'Peu commun', 'Rare', 'Très rare'][bp.rarity || 1];
      const kind = { fab: 'Fabrication débloquée', module: 'Amélioration de module', tech: 'Palier technologique' }[bp.unlocks?.kind] || 'Effet';
      const tags = `<div class="bp-tags"><span class="bp-origin" style="color:${ori.color}">${ori.nom}</span><span class="bp-rarity r${bp.rarity}">${rarity}</span></div>`;
      const inner = isFound
        ? `<div class="bphead"><div class="bpname">${bpNom(id)}</div>${tags}</div>
          <div class="bpdesc">${bp.desc}</div>
          <div class="bpunlocks"><span class="lbl">${kind}</span>${bp.unlocks?.label || '?'}</div>
          ${(S.inventory?.[id] || 0) > 0 ? `<div class="bp-stock">${plur(S.inventory[id], 'exemplaire')} en inventaire</div>` : ''}
          <div class="bp-found-at">Découvert le jour ${dayOf(disc[id].firstFoundAt)} · ${esc(disc[id].source)}</div>`
        : `<div class="bphead"><div class="bpname">Schéma inconnu</div>${tags}</div>
          <div class="bpdesc">À découvrir en expédition.</div>`;
      html += `<div class="bp-card ${isFound ? '' : 'unknown'}" ${isFound ? `style="border-left-color:${ori.color}"` : ''}>${inner}</div>`;
    }
    html += '</div>';
  }
  setHTML(content, html);
}

// ============================================================
//   Actions
// ============================================================
export const ACTIONS = [
  ['button[data-cancel-research]', async el => {
    const ok = await confirmModal({ titre: 'Annuler la recherche ?', texte: 'La moitié des datacubes engagés est récupérée. Le temps passé est perdu.', confirmer: 'Annuler la recherche', annuler: 'Continuer', danger: true });
    if (!ok) return;
    markCancelled('res:' + el.dataset.cancelResearch);
    cancelResearch(el.dataset.cancelResearch);
    render();
  }],
  ['button[data-cancel-rqueue]', el => {
    const r = appCall('cancelQueuedResearch', [parseInt(el.dataset.cancelRqueue, 10)], null);
    if (r && r.ok === false) toast(r.why || 'Impossible de retirer de la file');
    render();
  }],
  ['.tech-card[data-tech][role="button"]', el => openResearchModal(el.dataset.tech)],
  ['button[data-cancel-fab]', async el => {
    const ok = await confirmModal({ titre: 'Annuler la fabrication ?', texte: 'La moitié des ressources engagées est récupérée.', confirmer: 'Annuler la fabrication', annuler: 'Continuer', danger: true });
    if (!ok) return;
    markCancelled('fab:' + el.dataset.cancelFab);
    cancelFabrication(el.dataset.cancelFab);
    render();
  }],
  ['.fab-card.available[data-fab]', el => openFabModal(el.dataset.fab)],
];

