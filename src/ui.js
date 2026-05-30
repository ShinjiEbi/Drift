// ui.js — rendu DOM et UI complète
// Extrait depuis app.js lors de la modularisation (étape R4)

import { $, $$, fmt, fmtMin } from './util.js';
import {
  VERSION, MIN_PER_TICK, BUILD_TIME_MULT, PROD_MULT,
  RES_LABELS, RESOURCES, CAP, SKILL_LIST, SKILL_LABELS, STAT_LABELS,
  JOB_BIOMASSE_MULT, YEAR_IN_GAME_MIN, ADULT_AGE, PREGNANCY_DURATION_MIN
} from './constants.js';
import {
  MODULES, MODULE_JOBS, VESSELS, ITEMS, ITEM_TYPES, ITEM_ORIGINS, ITEM_NAME_TO_ID,
  BLUEPRINTS, TECH_TREE, TECH_BRANCHES, FABRICATIONS, SCENES, TREATMENTS,
  BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS, TRAITS, ENEMY_TYPES
} from './catalog.js';
import { ARCS, FACTION_TYPES } from './data-arcs-factions.js';
import {
  getNotifPermission, requestNotifPermission,
  isPushEnabled, setPushEnabled
} from './notifications.js';
import {
  S, crewCap, capOf, computeRates, canBuild, startBuild, crewUsage, aliveCrew,
  genCandidate, acceptCandidate, refuseCandidate, traitDesc, traitNom, traitKind,
  trainingTargetLevel, formationBonuses, findInstructor,
  describeBody, bodyThreatLevel, bodyRewardLevel, BODY_TYPES,
  save, resetGame, exportSave, importSave, buildTime,
  GRAVITES, VIES
} from './state.js';
// Imports croisés depuis app.js — résolus au runtime grâce aux live bindings
import {
  staffRoleCount, moduleEfficiency, globalCommandBonus,
  techEffectsAccumulated, permanentBonusesAccumulated,
  laboratoryBonuses, workshopBonuses, workshopSlots,
  infirmaryBonuses,
  jobsForModule, isEligibleForJob, jobReqText, jobKey, memberAssignment,
  memberAt, assignMember, unassignMember, unassignSlot, autoAssignMember,
  autoAssignAllFreeMembers,
  discoverBlueprint, addBlueprintToInventory, isExoticUnlocked,
  isTechCompleted, isTechResearching, canResearch, startResearch,
  cancelResearch,
  itemDef, addToInventory,
  isFabAvailable, canFabricate, startFabrication, cancelFabrication,
  inflictStatus, bestAvailableDoctor,
  hangarBonuses, canBuildVessel, startVesselBuild,
  canLaunchExpedition, launchExpedition, abandonExpedition,
  playChoice, currentScene, evaluateChoice,
  triggerIncident, applyIncidentChoice, applyColonyEventChoice,
  getArcState, isArcComplete, isStepComplete,
  factionStatus, adjustReputation, toggleFactionTrade,
  launchDiplomaticMission, offerGift,
  startTraining, cancelTraining,
  currentAge, maxHealthOf, affinityBetween, relationType,
  significantRelations, ROLES, inventoryCount,
  TRAINING_PROGRAMS, infirmaryBeds, bedsInUse,
  STATUTS, canTrain, canTreat, admitToInfirmary, dischargeMember, fillTemplate,
  startDiagnostic, startTreatment,
  memberCombatStats, combatAllyAction, combatEndTurn,
  ancienneteBonus,
  formCouple, dissolveCouple
} from './app.js';


export function render() {
  renderHeader();
  renderResources();
  renderCrewSummary();
  renderBuildSlot();
  renderModules();
  renderAssignments();
  renderCrew();
  renderFormation();
  renderSoins();
  renderRecruit();
  renderGalaxy();
  renderFleet();
  renderExpeditions();
  renderInventory();
  renderLibrary();
  renderResearch();
  renderWorkshop();
  renderArcs();
  renderDiplomacy();
  renderJournal();
}

function renderHeader() {
  $('#colonyName').textContent = S.meta.colonyName;
  $('#overviewName').textContent = S.meta.colonyName;

  const totalMin = S.meta.gameMin;
  const day = Math.floor(totalMin / (24*60)) + 1;
  const hr = Math.floor((totalMin % (24*60)) / 60);
  const mn = Math.floor(totalMin % 60);
  $('#gameTime').textContent = `J${day} · ${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;

  const sess = Math.floor(S.meta.sessionMs / 1000);
  const sm = Math.floor(sess / 60), ss = sess % 60;
  $('#realTime').textContent = `session ${sm}:${String(ss).padStart(2,'0')}`;

  // Sous-titre vue d'ensemble
  const lvlCmd = S.modules.commandement?.level || 1;
  $('#overviewSub').textContent = `Commandement niv ${lvlCmd} · capacité équipage ${crewCap()}`;

  // 0.23 — Mise à jour du bandeau ressources persistant
  renderResBar();
  renderAlertBar();
}

// 0.23 — Bandeau ressources persistant (visible sur tous les onglets)
function renderResBar() {
  const cellMap = {
    metal: 'rbMetal', cristal: 'rbCristal', energie: 'rbEnergie',
    biomasse: 'rbBiomasse', datacubes: 'rbDatacubes'
  };
  for (const k of RESOURCES) {
    const cell = $(`[data-res="${k}"]`);
    const val = $(`#${cellMap[k]}`);
    if (!cell || !val) continue;
    const cur = S.res[k] || 0;
    const cap = capOf(k);
    const over = (S.overflow && S.overflow[k]) || 0;  // 0.28
    // Affichage : valeur normale + suffixe "+X" si overflow
    if (over > 0) {
      val.innerHTML = `${fmt(cur)}<span class="rb-overflow">+${fmt(over)}</span>`;
    } else {
      val.textContent = fmt(cur);
    }
    cell.classList.remove('low', 'full', 'overflow');
    if (over > 0) cell.classList.add('overflow');
    else if (cur >= cap * 0.95) cell.classList.add('full');
    else if (cur < cap * 0.1) cell.classList.add('low');
    // Tooltip avec capacité, taux et overflow
    let tip = `${RES_LABELS[k]} : ${fmt(cur)} / ${fmt(cap)}`;
    if (over > 0) tip += ` · surplus ${fmt(over)} (sera réabsorbé)`;
    cell.title = tip;
  }
  // Population
  const pop = $('#rbPop');
  if (pop) {
    const usage = crewUsage();
    pop.textContent = `${usage.used}/${usage.total}`;
    if (pop.parentElement) {
      pop.parentElement.title = `${usage.used} vivants · capacité ${usage.total}`;
    }
  }
}

// 0.23 — Bandeau alertes contextuelles (visible si quelque chose à signaler)
function renderAlertBar() {
  const bar = $('#alertBar');
  const txt = $('#alertText');
  if (!bar || !txt) return;
  const alerts = collectAlerts();
  if (alerts.length === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';
  bar.classList.toggle('critical', alerts.some(a => a.critical));
  // Premier message + nombre total si plus d'un
  const first = alerts[0];
  if (alerts.length === 1) {
    txt.textContent = first.text;
  } else {
    txt.textContent = `${first.text} · +${alerts.length - 1} autre${alerts.length > 2 ? 's' : ''}`;
  }
  bar.onclick = () => showAlertsModal(alerts);
}

// Collecte les alertes à afficher
function collectAlerts() {
  const alerts = [];
  // Incidents en cours (modale d'incident en attente)
  if (S.pendingIncident) {
    alerts.push({ text: 'Incident en attente de décision', critical: true, action: 'incident' });
  }
  // Événements de colonie en attente
  if (S.pendingColonyEvent) {
    alerts.push({ text: 'Événement de colonie en cours', critical: false, action: 'event' });
  }
  // Blessés graves non soignés
  const wounded = (S.crew || []).filter(m => m.statut !== 'mort' && m.statut !== 'infirmerie' && (m.statuts || []).some(s => s.severity === 'grave' || s.severity === 'critique'));
  if (wounded.length > 0) {
    alerts.push({ text: `${wounded.length} blessé${wounded.length > 1 ? 's' : ''} grave${wounded.length > 1 ? 's' : ''} sans soin`, critical: true, action: 'medical' });
  }
  // 0.27.2 — Biomasse critique sans hydroponie (early game alert)
  const hydroLevel = S.modules?.hydroponie?.level || 0;
  const biomasse = S.res?.biomasse || 0;
  const biomasseCap = capOf('biomasse');
  if (hydroLevel === 0 && biomasse < biomasseCap * 0.3) {
    alerts.push({
      text: biomasse < 20
        ? `Biomasse critique (${biomasse}). Construis une hydroponie d'urgence`
        : `Biomasse basse (${biomasse}). Pense à construire une hydroponie`,
      critical: biomasse < 20,
      action: 'build_hydro'
    });
  }
  // 0.28 — Effets temporaires actifs (buffs/debuffs)
  if (Array.isArray(S.activeBuffs) && S.activeBuffs.length > 0) {
    const now = S.meta?.gameMin || 0;
    const active = S.activeBuffs.filter(b => b.expiresAt > now);
    if (active.length > 0) {
      const minutesLeft = Math.min(...active.map(b => b.expiresAt - now));
      const hoursLeft = Math.round(minutesLeft / 60);
      const negCount = active.filter(b => b.value && b.value < 1).length;
      const text = active.length === 1
        ? `${active[0].label || 'Effet actif'} · ${hoursLeft}h`
        : `${active.length} effets actifs · prochain ${hoursLeft}h`;
      alerts.push({ text, critical: negCount > 0, action: 'effects' });
    }
  }

  // 0.28 — Modules désactivés temporairement
  const disabled = Object.keys(S.modules || {}).filter(id => {
    const m = S.modules[id];
    return m?.disabledUntil && m.disabledUntil > (S.meta?.gameMin || 0);
  });
  if (disabled.length > 0) {
    const names = disabled.map(id => MODULES[id]?.nom || id).join(', ');
    alerts.push({ text: `Modules hors service : ${names}`, critical: true, action: 'modules' });
  }

  // Colons libres sans poste
  const free = (S.crew || []).filter(m => m.statut === 'libre');
  if (free.length > 0) {
    alerts.push({ text: `${free.length} colon${free.length > 1 ? 's' : ''} sans poste`, critical: false, action: 'assign' });
  }
  // Cargaison saturée
  const fullRes = RESOURCES.filter(k => (S.res[k] || 0) >= capOf(k) * 0.98);
  if (fullRes.length > 0) {
    const labels = fullRes.map(k => RES_LABELS[k]).join(', ');
    alerts.push({ text: `Stocks saturés : ${labels}`, critical: false, action: 'stocks' });
  }
  // 0.28 — Buffs/debuffs actifs
  if (Array.isArray(S.activeBuffs) && S.activeBuffs.length > 0) {
    const now = S.meta?.gameMin || 0;
    const active = S.activeBuffs.filter(b => b.expiresAt > now);
    for (const b of active) {
      const remaining = Math.max(0, b.expiresAt - now);
      const sign = b.type === 'prodMult' && b.value < 1 ? 'critical' : false;
      alerts.push({
        text: `${b.label || 'Effet en cours'} (${Math.round(remaining/60)}h restantes)`,
        critical: sign,
        action: null
      });
    }
  }
  return alerts;
}

// Modale qui liste toutes les alertes en détail
function showAlertsModal(alerts) {
  const m = $('#modal');
  const bg = $('#modalBg');
  if (!m || !bg) return;
  const html = alerts.map(a => {
    const cls = a.critical ? 'critical' : '';
    return `<div class="alert-row ${cls}">
      <span class="alert-icon">${a.critical ? '⚠' : '◦'}</span>
      <span class="alert-text">${a.text}</span>
    </div>`;
  }).join('');
  m.classList.add('alerts-modal');
  m.innerHTML = `
    <div class="incident-eyebrow">Alertes (${alerts.length})</div>
    <h3 class="incident-title">État de la colonie</h3>
    <div class="alerts-list">${html}</div>
    <div class="btn-row">
      <button id="alertsClose" class="primary">Fermer</button>
    </div>
  `;
  bg.classList.add('show');
  $('#alertsClose')?.addEventListener('click', () => {
    bg.classList.remove('show');
    m.classList.remove('alerts-modal');
  });
}


// ============================================================
//   0.27.3 — Toggle push uniquement (panneau notifs retiré)
// ============================================================
// L'ancienne cloche/panneau de notifications a été retirée car redondante
// avec le journal de bord. Il reste juste un bouton dans le footer pour
// activer/désactiver les notifications système (push natives quand l'app
// est en arrière-plan).

let _pushHandlersInstalled = false;

export function setupNotifHandlers() {
  if (_pushHandlersInstalled) return;
  _pushHandlersInstalled = true;

  const btn = $('#btnPushToggle');
  if (!btn) return;

  // État initial du bouton
  refreshPushButton();

  btn.addEventListener('click', async () => {
    const perm = getNotifPermission();
    if (perm === 'unsupported') {
      toast("Ton navigateur ne supporte pas les notifications.");
      return;
    }
    if (perm === 'denied') {
      toast("Permission refusée. Active les notifs dans les paramètres du navigateur.");
      return;
    }
    if (perm === 'default') {
      const result = await requestNotifPermission();
      if (result !== 'granted') {
        toast("Permission refusée");
        refreshPushButton();
        return;
      }
    }
    // Toggle
    const newState = !isPushEnabled();
    setPushEnabled(newState);
    toast(newState ? "Notifications téléphone activées" : "Notifications téléphone désactivées");
    refreshPushButton();
  });
}

// Met à jour le label du bouton selon l'état
function refreshPushButton() {
  const btn = $('#btnPushToggle');
  if (!btn) return;
  const perm = getNotifPermission();
  if (perm === 'unsupported') {
    btn.textContent = '🔕 Notifs non supportées';
    btn.disabled = true;
    return;
  }
  if (perm === 'denied') {
    btn.textContent = '🔕 Notifs bloquées';
    btn.title = "Permission refusée dans le navigateur";
    return;
  }
  const on = isPushEnabled();
  btn.textContent = on ? '🔔 Notifs téléphone' : '🔕 Notifs téléphone';
  btn.title = on
    ? "Tapez pour désactiver les notifications système"
    : "Tapez pour activer les notifications système (lorsque l'app est en arrière-plan)";
}

function renderResources() {
  const grid = $('#resourcesGrid');
  const rate = computeRates();
  grid.innerHTML = RESOURCES.map(k => {
    const r = rate[k];
    const cls = r > 0 ? 'pos' : r < 0 ? 'neg' : '';
    const sign = r > 0 ? '+' : '';
    return `<div class="res" data-r="${k}">
      <div class="label">${RES_LABELS[k]}</div>
      <div class="val">${fmt(S.res[k])}<span style="color:var(--text-mute);font-size:13px">/${fmt(capOf(k))}</span></div>
      <div class="rate ${cls}">${r === 0 ? '— stable' : sign + r.toFixed(1) + '/min'}</div>
    </div>`;
  }).join('');
}

function renderBuildSlot() {
  const slot = $('#buildSlot');
  if (!S.build) {
    slot.className = 'empty';
    slot.textContent = "Aucun chantier ouvert.";
    return;
  }
  const b = S.build;
  const def = MODULES[b.id];
  const pct = Math.min(100, (b.doneMin / b.totalMin) * 100);
  const remaining = b.totalMin - b.doneMin;
  slot.className = 'module';
  slot.innerHTML = `
    <div class="title-row">
      <div class="name">${def.nom}</div>
      <div class="level">→ NIV ${b.targetLevel}</div>
    </div>
    <div class="desc">${def.desc}</div>
    <div class="progress-wrap">
      <div class="bar" style="width:${pct}%"></div>
      <div class="label-prog">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
    </div>
  `;
}

function renderModules() {
  const list = $('#modulesList');
  list.innerHTML = Object.keys(MODULES).map(id => {
    const def = MODULES[id];
    const cur = S.modules[id]?.level || 0;
    const next = cur + 1;
    const isMax = cur >= def.maxLevel;
    const check = canBuild(id);
    const showCost = !isMax;
    const cost = showCost ? def.cost(next) : null;

    const prereq = !isMax ? def.prereq(next) : {};
    const prereqOk = Object.keys(prereq).every(k => (S.modules[k]?.level || 0) >= prereq[k]);
    const lockedByPrereq = !prereqOk && cur === 0;

    // 0.26.1 : verrou par tech (modules tier 2)
    const lockedByTech = def.requireTech && !S.techCompleted?.[def.requireTech] && cur === 0;
    const lockedByTechNom = lockedByTech ? (TECH_TREE[def.requireTech]?.nom || def.requireTech) : null;

    const effects = cur > 0 ? def.effect(cur) : (def.effect ? def.effect(1) + ' (au niv 1)' : '');

    let costHTML = '';
    if (showCost && !lockedByPrereq && !lockedByTech) {
      costHTML = '<div class="cost">' + Object.keys(cost).map(k => {
        // 0.26.1 : datacubes_alien lit S.alienDatacubes
        const have = k === 'datacubes_alien' ? (S.alienDatacubes || 0) : (S.res[k] || 0);
        const ko = have < cost[k];
        const label = k === 'datacubes_alien' ? 'Datacubes alien' : RES_LABELS[k];
        return `<span class="${ko ? 'ko' : ''}">${label} ${fmt(cost[k])}</span>`;
      }).join('') + ` <span style="color:var(--text-mute)">· ${fmtMin(buildTime(id, next))}</span></div>`;
    }

    let actionHTML = '';
    if (S.build) {
      actionHTML = `<button class="build" disabled>Chantier en cours…</button>`;
    } else if (isMax) {
      actionHTML = `<button class="build" disabled>Niveau maximal</button>`;
    } else if (lockedByTech) {
      actionHTML = `<button class="build" disabled>🔒 Requiert : ${lockedByTechNom}</button>`;
    } else if (lockedByPrereq) {
      const txt = Object.keys(prereq).map(k => `${MODULES[k].nom} niv ${prereq[k]}`).join(', ');
      actionHTML = `<button class="build" disabled>Requiert : ${txt}</button>`;
    } else {
      actionHTML = `<button class="build" data-id="${id}" ${check.ok ? '' : 'disabled'}>
        ${cur === 0 ? 'Construire' : `Améliorer → niv ${next}`}
      </button>`;
    }

    // 0.26.1 : badge tier 2 dans le titre
    const tierBadge = def.tier === 2 ? '<span class="tier-badge">TIER 2</span>' : '';
    const lockedClass = (lockedByPrereq || lockedByTech) ? 'locked' : '';

    // 0.28 : module désactivé temporairement
    const modState = S.modules[id];
    let disabledBadge = '';
    let disabledClass = '';
    if (modState && modState.disabledUntil && modState.disabledUntil > (S.meta?.gameMin || 0)) {
      const remaining = modState.disabledUntil - S.meta.gameMin;
      disabledBadge = `<span class="disabled-badge">HORS SERVICE · ${fmtMin(remaining)}</span>`;
      disabledClass = 'mod-disabled';
    }

    return `<div class="module ${lockedClass} ${disabledClass}" data-id="${id}">
      <div class="title-row">
        <div class="name">${def.nom}${tierBadge}${disabledBadge}</div>
        <div class="level">${cur === 0 ? '— NON CONSTRUIT' : `NIVEAU ${cur}${isMax ? ' (MAX)' : ''}`}</div>
      </div>
      <div class="desc">${def.desc}</div>
      ${effects ? `<div class="effects">${effects}</div>` : ''}
      ${costHTML}
      ${actionHTML}
    </div>`;
  }).join('');

  list.querySelectorAll('button.build[data-id]').forEach(btn => {
    btn.addEventListener('click', () => startBuild(btn.dataset.id));
  });

  // 0.26.1 : bandeau synthétiseur si module construit
  renderSynthesisBanner();
}

// ============================================================
//   0.26.1 — Synthétiseur quantique (module tier 2)
// ============================================================

// Définition des conversions disponibles (niveau 1 = 3 conversions, niveau 2 = 6)
// Chaque conversion coûte de l'énergie en plus des ressources d'entrée
const SYNTHESIS_RECIPES = [
  // Niveau 1
  { lvl: 1, id: 'metal_to_cristal',    inputs: { metal: 20 },     outputs: { cristal: 10 },   energie: 5,  nom: 'Métal → Cristal' },
  { lvl: 1, id: 'cristal_to_metal',    inputs: { cristal: 20 },   outputs: { metal: 30 },     energie: 5,  nom: 'Cristal → Métal' },
  { lvl: 1, id: 'biomasse_to_metal',   inputs: { biomasse: 15 },  outputs: { metal: 25 },     energie: 8,  nom: 'Biomasse → Métal' },
  // Niveau 2
  { lvl: 2, id: 'biomasse_to_datacubes', inputs: { biomasse: 25 }, outputs: { datacubes: 5 },  energie: 12, nom: 'Biomasse → Datacubes' },
  { lvl: 2, id: 'datacubes_to_cristal',  inputs: { datacubes: 5 }, outputs: { cristal: 60 },   energie: 10, nom: 'Datacubes → Cristal' },
  { lvl: 2, id: 'cristal_to_biomasse',   inputs: { cristal: 20 }, outputs: { biomasse: 25 },  energie: 10, nom: 'Cristal → Biomasse' },
];

function renderSynthesisBanner() {
  const banner = $('#synthesisBanner');
  if (!banner) return;
  const m = S.modules?.synthetiseur_quantique;
  if (!m || m.level === 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const lvl = m.level;
  const available = SYNTHESIS_RECIPES.filter(r => r.lvl <= lvl).length;
  banner.querySelector('.sb-sub').textContent = `${available} conversion(s) disponible(s) au niveau ${lvl}.`;
  const btn = $('#openSynthesis');
  if (btn && !btn._wired) {
    btn._wired = true;
    btn.addEventListener('click', openSynthesisModal);
  }
}

function openSynthesisModal() {
  const lvl = S.modules?.synthetiseur_quantique?.level || 0;
  if (lvl === 0) return;
  const recipes = SYNTHESIS_RECIPES.filter(r => r.lvl <= lvl);
  const m = $('#modal');
  const bg = $('#modalBg');
  if (!m || !bg) return;
  const items = recipes.map(r => {
    // Disponibilité
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
  m.classList.add('synthesis-modal');
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
  // Handlers
  m.querySelectorAll('.syn-do[data-recipe]').forEach(b => {
    b.addEventListener('click', () => {
      runSynthesisRecipe(b.dataset.recipe);
    });
  });
  $('#synClose')?.addEventListener('click', () => {
    bg.classList.remove('show');
    m.classList.remove('synthesis-modal');
  });
}

function runSynthesisRecipe(recipeId) {
  const r = SYNTHESIS_RECIPES.find(x => x.id === recipeId);
  if (!r) return;
  const lvl = S.modules?.synthetiseur_quantique?.level || 0;
  if (r.lvl > lvl) { toast('Niveau de synthétiseur insuffisant'); return; }
  // Vérifie inputs
  for (const k in r.inputs) {
    if ((S.res[k] || 0) < r.inputs[k]) { toast(`Pas assez de ${RES_LABELS[k]}`); return; }
  }
  if ((S.res.energie || 0) < r.energie) { toast(`Pas assez d'énergie`); return; }
  // Consomme
  for (const k in r.inputs) S.res[k] -= r.inputs[k];
  S.res.energie -= r.energie;
  // Produit (cap)
  for (const k in r.outputs) {
    S.res[k] = Math.min(capOf(k), (S.res[k] || 0) + r.outputs[k]);
  }
  const inputStr = Object.entries(r.inputs).map(([k, v]) => `${v} ${RES_LABELS[k]}`).join('+');
  const outputStr = Object.entries(r.outputs).map(([k, v]) => `+${v} ${RES_LABELS[k]}`).join(' ');
  log('success', `Synthèse : ${inputStr} → ${outputStr}.`);
  toast('Conversion effectuée');
  render();
  // Rouvre la modale pour permettre une nouvelle conversion
  openSynthesisModal();
}

// ============================================================
//   AFFECTATIONS — rendu et interaction
// ============================================================

function renderAssignments() {
  const sub = $('#assignSub');
  const controls = $('#assignControls');
  const list = $('#assignList');
  const badge = $('#assignBadge');

  // Compte total des postes ouverts et pourvus
  let totalSlots = 0;
  let filledSlots = 0;
  for (const modKey in MODULE_JOBS) {
    if (!S.modules[modKey]) continue;
    const jobs = jobsForModule(modKey);
    totalSlots += jobs.length;
    for (let i = 0; i < jobs.length; i++) {
      const occ = S.assignments[jobKey(modKey, i)];
      if (occ) {
        const m = S.crew.find(c => c.id === occ);
        if (m && m.statut === 'travail') filledSlots++;
      }
    }
  }
  const freeCrew = S.crew.filter(m => m.statut === 'libre').length;

  // Badge sur le sous-onglet : postes vacants assignables (= libre + au moins un poste libre)
  const vacant = totalSlots - filledSlots;
  if (vacant > 0 && freeCrew > 0) {
    badge.textContent = Math.min(vacant, freeCrew);
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }

  if (totalSlots === 0) {
    sub.innerHTML = "Aucun poste ouvert. Construis et améliore tes bâtiments pour ouvrir des postes.";
    controls.innerHTML = '';
    list.innerHTML = '<div class="empty">Pas encore de postes à pourvoir.</div>';
    return;
  }

  sub.innerHTML = `Assigne ton équipage aux postes des bâtiments. <em>Cliquer sur un poste pour ouvrir le sélecteur.</em>`;

  // Toolbar : auto-assign toggle + bouton optimiser
  const onCls = S.autoAssign ? 'on' : '';
  controls.innerHTML = `
    <div class="assign-toolbar">
      <label class="toggle ${onCls}" id="autoAssignToggle">
        <span class="switch"></span>
        Auto-affectation
      </label>
      <button class="quick-action" id="optimizeAssignBtn">Réoptimiser</button>
      <button class="quick-action" id="clearAllAssignBtn">Tout libérer</button>
    </div>
    <div class="assign-stats">
      Postes pourvus : <b>${filledSlots}/${totalSlots}</b> · Libres : <b>${freeCrew}</b>
    </div>
  `;
  $('#autoAssignToggle')?.addEventListener('click', () => {
    S.autoAssign = !S.autoAssign;
    if (S.autoAssign) autoAssignAllFreeMembers();
    render();
  });
  $('#optimizeAssignBtn')?.addEventListener('click', () => {
    optimizeAssignments();
    render();
  });
  $('#clearAllAssignBtn')?.addEventListener('click', () => {
    if (!confirm("Libérer tous les colons de leurs postes ?")) return;
    clearAllAssignments();
    render();
  });

  // Liste des bâtiments avec leurs postes
  const cards = [];
  for (const modKey in MODULE_JOBS) {
    if (!S.modules[modKey]) continue;
    const jobs = jobsForModule(modKey);
    if (jobs.length === 0) continue;
    cards.push(renderAssignCard(modKey, jobs));
  }
  list.innerHTML = cards.join('') || '<div class="empty">Aucun bâtiment avec des postes ouverts.</div>';

  // Hooks sur les rangées de poste
  list.querySelectorAll('.slot-row').forEach(row => {
    row.addEventListener('click', () => {
      openAssignPicker(row.dataset.mod, parseInt(row.dataset.slot, 10));
    });
  });
}

function renderAssignCard(modKey, jobs) {
  const def = MODULES[modKey];
  const eff = moduleEfficiency(modKey);
  const fillCls = eff.jobsFilled === eff.jobsTotal ? 'full' :
                  eff.jobsFilled === 0 ? 'empty' : 'partial';

  // Effets actuels du bâtiment
  const effectsHTML = renderEffectsLine(modKey, eff);

  // Lignes de poste
  const slotsHTML = jobs.map((job, i) => renderSlotRow(modKey, i, job)).join('');

  return `<div class="module-assign-card">
    <div class="mac-head">
      <div class="mac-name">${def.nom}</div>
      <div class="mac-fill">postes <span class="v ${fillCls}">${eff.jobsFilled}/${eff.jobsTotal}</span></div>
    </div>
    ${effectsHTML}
    ${slotsHTML}
  </div>`;
}

function renderEffectsLine(modKey, eff) {
  const items = [];
  // Production
  const prodPct = Math.round(eff.prodMult * 100);
  let prodCls = 'v';
  if (prodPct > 100) prodCls = 'v up';
  else if (prodPct < 60) prodCls = 'v down';
  items.push(`<span class="eff-item"><span class="lbl">Prod</span> <span class="${prodCls}">${prodPct}%</span></span>`);
  // Upkeep
  if (MODULES[modKey].upkeep && Object.keys(MODULES[modKey].upkeep(1) || {}).length > 0) {
    const upkeepPct = Math.round(eff.upkeepMult * 100);
    const cls = upkeepPct < 100 ? 'v up' : 'v';
    items.push(`<span class="eff-item"><span class="lbl">Upkeep</span> <span class="${cls}">${upkeepPct}%</span></span>`);
  }
  // Sécurité / Support / Qualité
  if (eff.securityBonus > 0) items.push(`<span class="eff-item"><span class="lbl">Sécu</span> <span class="v up">+${eff.securityBonus}</span></span>`);
  if (eff.supportBonus > 0)  items.push(`<span class="eff-item"><span class="lbl">Support</span> <span class="v up">+${eff.supportBonus}</span></span>`);
  if (eff.qualityBonus > 0)  items.push(`<span class="eff-item"><span class="lbl">Qualité</span> <span class="v up">+${eff.qualityBonus}</span></span>`);
  return `<div class="mac-effects">${items.join('')}</div>`;
}

function renderSlotRow(modKey, slotIdx, job) {
  const role = ROLES[job.role];
  const occ = S.assignments[jobKey(modKey, slotIdx)];
  const occMember = occ ? S.crew.find(c => c.id === occ) : null;
  const isReallyOnPost = occMember && occMember.statut === 'travail';

  let occHTML;
  if (occMember) {
    const stillFit = isEligibleForJob(occMember, job);
    const unfitCls = stillFit ? '' : 'unfit';
    // 0.22 — Affichage enrichi du statut absent : icône + libellé clair
    let statusLabel = '';
    if (occMember.statut === 'mort') {
      statusLabel = `<div class="occ-status absent">décédé</div>`;
    } else if (occMember.statut === 'expedition') {
      statusLabel = `<div class="occ-status away">◐ en mission</div>`;
    } else if (occMember.statut === 'infirmerie') {
      statusLabel = `<div class="occ-status away">◐ infirmerie</div>`;
    } else if (occMember.statut === 'formation') {
      statusLabel = `<div class="occ-status away">◐ en formation</div>`;
    } else if (occMember.statut === 'diplomatie') {
      statusLabel = `<div class="occ-status away">◐ mission diplo</div>`;
    } else if (occMember.statut === 'travail') {
      statusLabel = `<div class="occ-status">● en poste</div>`;
    } else {
      statusLabel = `<div class="occ-status">${occMember.statut}</div>`;
    }
    let careerBadge = '';
    if (isReallyOnPost && occMember.posteInfo) {
      const ab = ancienneteBonus(occMember);
      const dureeDays = Math.floor(((S.meta?.gameMin || 0) - (occMember.posteInfo.depuis || 0)) / (24*60));
      careerBadge = `<div class="career-since">Dep. J.${dureeDays}</div>`;
      if (ab.label) {
        careerBadge += `<div class="career-badge cb-${ab.label.toLowerCase()}">${ab.label} +${Math.round((ab.mult-1)*100)}%</div>`;
      }
    }
    occHTML = `<div class="slot-occupant">
      <div class="occ-name ${unfitCls}">${occMember.name}</div>
      ${statusLabel}
      ${careerBadge}
    </div>`;
  } else {
    occHTML = `<div class="slot-occupant empty">vacant</div>`;
  }

  return `<div class="slot-row ${occMember ? '' : 'empty'} ${occMember && !isReallyOnPost ? 'away' : ''}" data-mod="${modKey}" data-slot="${slotIdx}">
    <div class="slot-role" style="background:${role.color}"></div>
    <div class="slot-info">
      <div class="slot-label">${job.label}</div>
      <div class="slot-meta">
        <span class="role-tag" style="color:${role.color}">${role.nom}</span>
        ${jobReqText(job)}
      </div>
    </div>
    ${occHTML}
  </div>`;
}

// Réoptimise toutes les affectations : libère tout puis ré-applique l'auto-affectation
function optimizeAssignments() {
  // Libère tous les colons en travail
  for (const k in S.assignments) {
    const id = S.assignments[k];
    const m = S.crew.find(c => c.id === id);
    if (m && m.statut === 'travail') m.statut = 'libre';
  }
  S.assignments = {};
  autoAssignAllFreeMembers();
  toast("Affectations réoptimisées");
}

function clearAllAssignments() {
  for (const k in S.assignments) {
    const id = S.assignments[k];
    const m = S.crew.find(c => c.id === id);
    if (m && m.statut === 'travail') m.statut = 'libre';
  }
  S.assignments = {};
  toast("Tous les postes libérés");
}

// Modale : sélection d'un colon pour un poste
let _pickerCtx = { modKey: null, slotIdx: null };
function openAssignPicker(modKey, slotIdx) {
  _pickerCtx = { modKey, slotIdx };
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('launch-modal');
  m.innerHTML = renderAssignPickerContent();
  bg.classList.add('show');
  hookAssignPicker();
}

function renderAssignPickerContent() {
  const { modKey, slotIdx } = _pickerCtx;
  const job = jobsForModule(modKey)[slotIdx];
  if (!job) return '<h3>Erreur</h3><p>Poste introuvable.</p>';
  const role = ROLES[job.role];
  const def = MODULES[modKey];
  const currentOccupant = memberAt(modKey, slotIdx);

  // Tri des candidats : éligibles d'abord, puis non-éligibles. Pour les éligibles, score décroissant.
  const allCrew = S.crew.filter(m => m.statut !== 'mort');
  const items = allCrew.map(m => {
    const eligible = isEligibleForJob(m, job);
    const isCurrent = currentOccupant?.id === m.id;
    let busy = '';
    if (m.statut === 'expedition' || m.statut === 'formation' || m.statut === 'infirmerie') {
      busy = m.statut;
    } else if (m.statut === 'travail' && !isCurrent) {
      const a = memberAssignment(m.id);
      if (a) {
        const otherJob = jobsForModule(a.modKey)[a.slotIdx];
        busy = `${MODULES[a.modKey].nom} · ${otherJob.label}`;
      } else busy = 'travail';
    }
    // Score / statistique pertinente
    let relevant = '';
    if (job.req?.skill) {
      const v = m.skills[job.req.skill.key] || 0;
      relevant = `${SKILL_LABELS[job.req.skill.key].slice(0,3)} ${v}`;
    } else {
      // Affiche le meilleur skill
      const best = SKILL_LIST.map(s => ({ s, v: m.skills[s] || 0 })).sort((a,b)=>b.v-a.v)[0];
      if (best.v > 0) relevant = `${SKILL_LABELS[best.s].slice(0,3)} ${best.v}`;
    }
    return { m, eligible, isCurrent, busy, relevant };
  });
  // Tri : courant > libres éligibles > occupés éligibles > non-éligibles libres > reste
  items.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const aBusy = a.busy ? 1 : 0, bBusy = b.busy ? 1 : 0;
    if (aBusy !== bBusy) return aBusy - bBusy;
    return 0;
  });

  const itemsHTML = items.map(({ m, eligible, isCurrent, busy, relevant }) => {
    const cls = isCurrent ? 'current' : (!eligible || (busy && !isCurrent) ? '' : '');
    const dis = !eligible ? 'disabled' : '';
    const detail = busy && !isCurrent ? `Occupé : ${busy}` :
                   m.statut === 'libre' ? 'Libre' :
                   isCurrent ? 'Affecté ici' : m.statut;
    return `<div class="assign-pick-item ${cls} ${dis}" data-pick-member="${m.id}">
      <div class="api-info">
        <div class="api-name">${m.name}</div>
        <div class="api-detail">${detail}</div>
      </div>
      <div class="api-relevant">${relevant}</div>
    </div>`;
  }).join('');

  const currentInfo = currentOccupant
    ? `<p style="margin-bottom:10px;font-family:var(--mono);font-size:11px;color:var(--text-dim)">Actuellement : <em style="color:var(--amber)">${currentOccupant.name}</em></p>`
    : '';

  return `
    <h3>${job.label}</h3>
    <p style="margin-bottom:6px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.04em">
      ${def.nom} · <span style="color:${role.color}">${role.nom}</span> · ${jobReqText(job)}
    </p>
    ${currentInfo}
    <div class="assign-picker-list">
      ${itemsHTML || '<div class="empty" style="padding:18px">Aucun colon disponible.</div>'}
    </div>
    <div class="btn-row">
      ${currentOccupant ? `<button class="danger" id="pickerUnassign">Libérer le poste</button>` : ''}
      <button id="pickerCancel">Fermer</button>
    </div>
  `;
}

function hookAssignPicker() {
  const m = $('#modal');
  m.querySelectorAll('[data-pick-member]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const id = el.dataset.pickMember;
      const r = assignMember(id, _pickerCtx.modKey, _pickerCtx.slotIdx);
      if (!r.ok) { toast(r.reason); return; }
      $('#modalBg').classList.remove('show');
      m.classList.remove('launch-modal');
      render();
    });
  });
  $('#pickerUnassign')?.addEventListener('click', () => {
    const occ = memberAt(_pickerCtx.modKey, _pickerCtx.slotIdx);
    if (occ) unassignMember(occ.id);
    $('#modalBg').classList.remove('show');
    m.classList.remove('launch-modal');
    render();
  });
  $('#pickerCancel')?.addEventListener('click', () => {
    $('#modalBg').classList.remove('show');
    m.classList.remove('launch-modal');
  });
}

// ============================================================
//   ARCS NARRATIFS — UI (0.20)
// ============================================================
// ============================================================
//   DIPLOMATIE — UI (0.21)
// ============================================================
function renderDiplomacy() {
  const sub = $('#diploSub');
  const content = $('#diploContent');
  const badge = $('#diploBadge');
  if (!content) return;

  const factions = Object.values(S.factions || {});
  const activeMissions = (S.diplomaticMissions || []).length;

  // Badge : nombre de factions Allié + missions en cours
  const allies = factions.filter(f => f.reputation >= 60).length;
  const totalAlerts = activeMissions;
  if (totalAlerts > 0) { badge.textContent = totalAlerts; badge.classList.add('show'); }
  else badge.classList.remove('show');

  if (factions.length === 0) {
    sub.innerHTML = "Aucune faction connue. Rencontre des civilisations en expédition pour ouvrir cet onglet.";
    content.innerHTML = '<div class="empty">L\'avant-poste n\'a pas encore noué de liens connus.</div>';
    return;
  }

  sub.innerHTML = `<b>${factions.length}</b> faction${factions.length > 1 ? 's' : ''} connue${factions.length > 1 ? 's' : ''} · <b>${allies}</b> allié${allies > 1 ? 's' : ''} · <b>${activeMissions}</b> mission${activeMissions > 1 ? 's' : ''} en cours`;

  // Missions actives
  let html = '';
  if (activeMissions > 0) {
    html += '<h3 class="section-h">Missions diplomatiques en cours</h3>';
    for (const mis of S.diplomaticMissions) {
      const f = S.factions[mis.factionId];
      const member = S.crew.find(c => c.id === mis.memberId);
      if (!f || !member) continue;
      const elapsed = S.meta.gameMin - mis.startedAt;
      const pct = Math.min(100, (elapsed / mis.duration) * 100);
      const remaining = Math.max(0, mis.duration - elapsed);
      html += `<div class="diplo-mission">
        <div class="dm-head">
          <div><b>${member.name}</b> → <em>${f.name}</em></div>
          <div class="dm-eta">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
        </div>
        <div class="dm-bar"><div class="dm-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
  }

  // Tri factions par réputation décroissante
  factions.sort((a, b) => b.reputation - a.reputation);

  html += '<h3 class="section-h">Factions connues</h3>';
  html += factions.map(f => renderFactionCard(f)).join('');
  content.innerHTML = html;

  // Hooks
  content.querySelectorAll('button[data-trade]').forEach(btn => {
    btn.addEventListener('click', () => { toggleFactionTrade(btn.dataset.trade); render(); });
  });
  content.querySelectorAll('button[data-diplo-launch]').forEach(btn => {
    btn.addEventListener('click', () => openDiploLaunchModal(btn.dataset.diploLaunch));
  });
  content.querySelectorAll('button[data-gift-faction]').forEach(btn => {
    btn.addEventListener('click', () => {
      offerGift(btn.dataset.giftFaction, parseInt(btn.dataset.giftIdx, 10));
    });
  });
}

// 0.30 — Probabilité de succès d'une mission pour un colon donné et un type de faction
function missionSuccessChance(member, factionType) {
  const ft = FACTION_TYPES[factionType];
  const pSkill = ft.missionSkill || 'linguistique';
  const pScore = member.skills[pSkill] || 0;
  const lScore = pSkill !== 'linguistique' ? (member.skills.linguistique || 0) : 0;
  const charisme = member.stats?.charisme || 5;
  const dc = 10;
  // modifier attendu
  const mod = pScore * 2 + Math.floor(lScore * 0.6) + Math.floor((charisme - 5) / 2);
  // nb de faces (1d10) qui font total >= dc → total = roll + mod >= dc → roll >= dc - mod
  const minRoll = dc - mod;
  const successes = Math.max(0, Math.min(10, 11 - minRoll));
  return successes * 10;
}

function renderFactionCard(f) {
  const ft = FACTION_TYPES[f.type];
  const status = factionStatus(f.reputation);
  // Barre de réputation : -100 → 0% à gauche, 0 → 50%, +100 → 100%
  const repPct = Math.max(0, Math.min(100, (f.reputation + 100) / 2));
  const onMission = (S.diplomaticMissions || []).some(m => m.factionId === f.id);

  // ── Jalons de réputation ──
  const milestones = [
    { rep: -60, label: 'Hostile',  pct: 20,  key: 'hostile' },
    { rep:  20, label: 'Cordial',  pct: 60,  key: 'cordial' },
    { rep:  40, label: 'Commerce', pct: 70,  key: 'commerce' },
    { rep:  50, label: 'Ami',      pct: 75,  key: 'ami' },
    { rep:  75, label: 'Allié',    pct: 87.5,key: 'allie' }
  ];
  const milestonesHTML = milestones.map(m => {
    const reached = f.reputation >= m.rep;
    return `<div class="dc-milestone ${reached ? 'reached' : ''}" style="left:${m.pct}%">
      <div class="dcm-tick"></div>
      <div class="dcm-label">${m.label}</div>
    </div>`;
  }).join('');

  // ── Commerce ──
  let tradeHTML = '';
  if (f.reputation >= 40) {
    const offerStr = Object.entries(ft.tradeOffer).map(([k,v]) => `+${v} ${RES_LABELS[k]}`).join(', ');
    const askStr   = Object.entries(ft.tradeAsk).map(([k,v])   => `-${v} ${RES_LABELS[k]}`).join(', ');
    const cycle    = 15 * 24 * 60;
    const nextCaravan = f.tradeActive && f.lastCaravan ? Math.max(0, cycle - (S.meta.gameMin - f.lastCaravan)) : null;
    tradeHTML = `<div class="dc-section">
      <div class="dc-section-label">Commerce</div>
      <div class="dt-rates">${offerStr} contre ${askStr} · toutes les 15j</div>
      <div class="dt-row">
        <button class="dt-btn ${f.tradeActive ? 'active' : ''}" data-trade="${f.id}">${f.tradeActive ? '◼ Désactiver' : '◻ Activer'} la route</button>
        ${f.tradeActive && nextCaravan !== null ? `<span class="dt-eta">Prochaine dans ${fmtMin(nextCaravan)}</span>` : ''}
      </div>
    </div>`;
  } else {
    tradeHTML = `<div class="dc-section dc-section-locked">Commerce disponible à réputation 40+</div>`;
  }
  if (f.reputation <= -60) {
    tradeHTML = `<div class="dc-section dc-section-hostile">⚠ Faction hostile — expéditions sur ${f.bodyName} risquent l'embuscade.</div>`;
  }

  // ── Alliance ──
  let allianceHTML = '';
  if (f.reputation >= 75 && ft.allianceGift) {
    const ag = ft.allianceGift;
    const nextAg = f.lastAllianceGift ? Math.max(0, ag.interval - (S.meta.gameMin - f.lastAllianceGift)) : 0;
    allianceHTML = `<div class="dc-section dc-alliance">
      <div class="dc-section-label">★ Alliance</div>
      <div>Don automatique : +${ag.amount} ${RES_LABELS[ag.resource]} tous les ${fmtMin(ag.interval)}</div>
      ${nextAg > 0 ? `<div class="dt-eta">Prochain dans ${fmtMin(nextAg)}</div>` : ''}
    </div>`;
  } else if (f.reputation >= 50) {
    const ag = ft.allianceGift;
    allianceHTML = `<div class="dc-section dc-section-locked">Alliance à 75 : dons auto (+${ag?.amount || '?'} ${RES_LABELS[ag?.resource] || ''} / ${fmtMin(ag?.interval || 0)})</div>`;
  }

  // ── Cadeaux ──
  let giftsHTML = '';
  if (ft.giftOptions?.length) {
    const cooldown = ft.giftCooldown || 3 * 24 * 60;
    const waitLeft = f.lastGift ? Math.max(0, cooldown - (S.meta.gameMin - f.lastGift)) : 0;
    const giftBtns = ft.giftOptions.map((g, i) => {
      const canAfford = (S.res[g.resource] || 0) >= g.amount;
      const dis = (waitLeft > 0 || !canAfford) ? 'disabled' : '';
      return `<button class="gift-btn ${canAfford ? '' : 'cant'}" ${dis} data-gift-faction="${f.id}" data-gift-idx="${i}">
        ${g.label} (−${g.amount} ${RES_LABELS[g.resource]}) → +${g.repGain} rép.
      </button>`;
    }).join('');
    const cooldownNote = waitLeft > 0 ? `<span class="dt-eta">Prochain cadeau dans ${fmtMin(waitLeft)}</span>` : '';
    giftsHTML = `<div class="dc-section">
      <div class="dc-section-label">Offrir un cadeau</div>
      <div class="gift-list">${giftBtns}</div>
      ${cooldownNote}
    </div>`;
  }

  // ── Mission diplomatique ──
  let missionHTML = '';
  const reqSkill = ft.missionReqSkill || 'linguistique';
  const reqMin   = ft.missionReqMin   || 3;
  const reqAlt   = ft.missionReqAlt;
  const cost     = ft.missionCost ?? 25;
  if (onMission) {
    missionHTML = `<div class="dc-section"><div class="diplo-mission-info">Mission en cours...</div></div>`;
  } else {
    const candidates = aliveCrew().filter(m => m.statut === 'libre' && (
      (m.skills[reqSkill] || 0) >= reqMin ||
      (reqAlt && (m.skills[reqAlt.skill] || 0) >= reqAlt.min)
    ));
    if (candidates.length > 0) {
      // Meilleur candidat
      const best = candidates.slice().sort((a, b) => missionSuccessChance(b, f.type) - missionSuccessChance(a, f.type))[0];
      const chance = missionSuccessChance(best, f.type);
      const reqLabel = reqAlt
        ? `${SKILL_LABELS[reqSkill]} ${reqMin}+ ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+`
        : `${SKILL_LABELS[reqSkill]} ${reqMin}+`;
      const pSkillLabel = SKILL_LABELS[ft.missionSkill] || ft.missionSkill;
      missionHTML = `<div class="dc-section">
        <div class="dc-section-label">Mission diplomatique · ${cost} biomasse</div>
        <div class="mission-req">Valorisée : <em>${pSkillLabel}</em> · Requis : ${reqLabel}</div>
        <div class="mission-best">Meilleur candidat : <b>${best.name}</b>
          · <span class="mission-chance ${chance >= 70 ? 'good' : chance >= 40 ? 'mid' : 'bad'}">${chance}% de succès</span>
        </div>
        <button class="diplo-launch-btn" data-diplo-launch="${f.id}">Envoyer une mission</button>
      </div>`;
    } else {
      const altLabel = reqAlt ? ` ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : '';
      missionHTML = `<div class="dc-section dc-section-locked">Mission : ${SKILL_LABELS[reqSkill]} ${reqMin}+${altLabel} requis</div>`;
    }
  }

  return `<div class="diplo-card" style="border-left-color:${ft.color}">
    <div class="dc-head">
      <div class="dc-name">${f.name}</div>
      <div class="dc-status" style="color:${status.color}">${status.label}</div>
    </div>
    <div class="dc-meta" style="color:${ft.color}">${ft.label} · ${f.bodyName}</div>
    <div class="dc-desc">${ft.desc}</div>
    <div class="dc-rep">
      <div class="dc-rep-header">
        <span class="dc-rep-label">Réputation</span>
        <span class="dc-rep-val" style="color:${status.color}">${f.reputation > 0 ? '+' : ''}${Math.round(f.reputation)}</span>
      </div>
      <div class="dc-rep-track">
        <div class="dc-rep-bar">
          <div class="dc-rep-fill" style="width:${repPct}%; background:${status.color}"></div>
        </div>
        <div class="dc-milestones">${milestonesHTML}</div>
      </div>
    </div>
    ${allianceHTML}
    ${tradeHTML}
    ${giftsHTML}
    ${missionHTML}
  </div>`;
}

let _diploLaunchPick = null;
function openDiploLaunchModal(factionId) {
  _diploLaunchPick = { factionId, memberId: null };
  const f = S.factions?.[factionId];
  if (!f) return;
  const ft = FACTION_TYPES[f.type];
  const reqSkill = ft.missionReqSkill || 'linguistique';
  const reqMin   = ft.missionReqMin   || 3;
  const reqAlt   = ft.missionReqAlt;
  const cost     = ft.missionCost ?? 25;
  const candidates = aliveCrew().filter(m => m.statut === 'libre' && (
    (m.skills[reqSkill] || 0) >= reqMin ||
    (reqAlt && (m.skills[reqAlt.skill] || 0) >= reqAlt.min)
  ));
  if (candidates.length === 0) {
    const altLabel = reqAlt ? ` ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : '';
    toast(`Aucun candidat disponible (${SKILL_LABELS[reqSkill]} ${reqMin}+${altLabel}).`);
    return;
  }
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('incident-modal');
  // Trier par chance de succès décroissante
  const sorted = candidates.slice().sort((a, b) =>
    missionSuccessChance(b, f.type) - missionSuccessChance(a, f.type));
  const pSkillLabel = SKILL_LABELS[ft.missionSkill] || ft.missionSkill;
  const candidatesHTML = sorted.map(c => {
    const chance = missionSuccessChance(c, f.type);
    const cls = chance >= 70 ? 'good' : chance >= 40 ? 'mid' : 'bad';
    const pScore = c.skills[ft.missionSkill] || 0;
    const sel = _diploLaunchPick.memberId === c.id ? 'selected' : '';
    return `<div class="diplo-pick ${sel}" data-pick-diplo="${c.id}">
      <div class="dp-name">${c.name}</div>
      <div class="dp-meta">${pSkillLabel} ${pScore} · Charisme ${c.stats?.charisme || 5}
        · <span class="mission-chance ${cls}">${chance}%</span>
      </div>
    </div>`;
  }).join('');
  const pSkills = reqAlt
    ? `${SKILL_LABELS[reqSkill]} ${reqMin}+ ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+`
    : `${SKILL_LABELS[reqSkill]} ${reqMin}+`;
  m.innerHTML = `
    <div class="incident-eyebrow">Mission diplomatique</div>
    <h3 class="incident-title">→ ${f.name}</h3>
    <p class="incident-body" style="font-size:13px;padding:8px 0 12px">
      Durée : 24–48h jeu · Coût : ${cost} biomasse · Compétence valorisée : <em>${pSkillLabel}</em><br>
      Requis : ${pSkills}
    </p>
    <div class="diplo-pick-list">${candidatesHTML}</div>
    <div class="btn-row">
      <button id="diploCancel">Annuler</button>
      <button id="diploGo" class="primary" disabled>Envoyer</button>
    </div>
  `;
  bg.classList.add('show');
  hookDiploLaunchModal();
}

function hookDiploLaunchModal() {
  const m = $('#modal');
  m.querySelectorAll('[data-pick-diplo]').forEach(el => {
    el.addEventListener('click', () => {
      _diploLaunchPick.memberId = el.dataset.pickDiplo;
      m.querySelectorAll('[data-pick-diplo]').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      $('#diploGo').disabled = false;
    });
  });
  $('#diploCancel')?.addEventListener('click', () => {
    $('#modalBg').classList.remove('show');
    m.classList.remove('incident-modal');
  });
  $('#diploGo')?.addEventListener('click', () => {
    launchDiplomaticMission(_diploLaunchPick.factionId, _diploLaunchPick.memberId);
    $('#modalBg').classList.remove('show');
    m.classList.remove('incident-modal');
  });
}

function renderArcs() {
  const sub = $('#arcsSub');
  const content = $('#arcsContent');
  const badge = $('#arcsBadge');
  if (!content) return;

  // Compte les arcs en cours qui ont avancé récemment (badge)
  let recentProgress = 0;
  for (const arcId in ARCS) {
    const state = getArcState(arcId);
    if (state.unlocked && !state.rewardClaimed) {
      const arc = ARCS[arcId];
      if (state.completedSteps.length > 0 && state.completedSteps.length < arc.steps.length) recentProgress++;
    }
  }
  if (recentProgress > 0) { badge.textContent = recentProgress; badge.classList.add('show'); }
  else badge.classList.remove('show');

  // Statistiques globales
  const totalArcs = Object.keys(ARCS).length;
  const unlockedArcs = Object.values(S.arcs || {}).filter(a => a.unlocked).length;
  const completedArcs = Object.values(S.arcs || {}).filter(a => a.rewardClaimed).length;
  sub.innerHTML = `<b>${unlockedArcs}/${totalArcs}</b> chronique${unlockedArcs > 1 ? 's' : ''} ouverte${unlockedArcs > 1 ? 's' : ''} · <b>${completedArcs}</b> achevée${completedArcs > 1 ? 's' : ''}`;

  // Rendu des arcs
  let html = '';
  for (const arcId in ARCS) {
    const arc = ARCS[arcId];
    const state = getArcState(arcId);
    html += renderArcCard(arcId, arc, state);
  }
  content.innerHTML = html;
}

function renderArcCard(arcId, arc, state) {
  if (!state.unlocked) {
    return `<div class="arc-card locked">
      <div class="arc-eyebrow" style="color:var(--text-mute)">Chronique scellée</div>
      <h3 class="arc-name">???</h3>
      <p class="arc-locked-hint">Une chronique reste à découvrir.</p>
    </div>`;
  }

  const total = arc.steps.length;
  const done = state.completedSteps.length;
  const pct = (done / total) * 100;
  const isComplete = done >= total;
  const claimed = state.rewardClaimed;

  // Barre de progression visuelle (jalons)
  const milestonesHTML = arc.steps.map((step, i) => {
    const isDone = state.completedSteps.includes(step.id);
    return `<span class="milestone ${isDone ? 'done' : ''}" style="${isDone ? `background:${arc.color}` : ''}"></span>`;
  }).join('');

  // Liste des étapes
  const stepsHTML = arc.steps.map((step, i) => {
    const isDone = state.completedSteps.includes(step.id);
    const cls = isDone ? 'done' : 'pending';
    return `<div class="arc-step ${cls}">
      <div class="as-marker" style="${isDone ? `background:${arc.color}` : ''}">${isDone ? '✓' : (i + 1)}</div>
      <div class="as-body">
        <div class="as-title">${step.title}</div>
        ${isDone
          ? `<div class="as-narrative">${step.narrative}</div>`
          : `<div class="as-pending">À découvrir.</div>`}
      </div>
    </div>`;
  }).join('');

  // Récompense
  let rewardHTML = '';
  if (arc.reward) {
    let rewardLabel = '';
    if (arc.reward.kind === 'blueprint') {
      rewardLabel = `Schéma légendaire : ${BLUEPRINTS[arc.reward.value]?.nom || arc.reward.value}`;
    } else if (arc.reward.kind === 'tech') {
      rewardLabel = `Technologie légendaire : ${TECH_TREE[arc.reward.value]?.nom || arc.reward.value}`;
    } else if (arc.reward.kind === 'permanent_bonus') {
      rewardLabel = `Bonus permanent : +10% sur toute production`;
    }
    if (claimed) {
      rewardHTML = `<div class="arc-reward claimed">✓ Récompense reçue : ${rewardLabel}</div>`;
    } else if (isComplete) {
      rewardHTML = `<div class="arc-reward ready">Récompense en cours d'attribution : ${rewardLabel}</div>`;
    } else {
      rewardHTML = `<div class="arc-reward pending">Récompense finale : ${rewardLabel}</div>`;
    }
  }

  return `<div class="arc-card ${isComplete ? 'complete' : ''}" style="border-left-color:${arc.color}">
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

function renderJournal() {
  const list = $('#journalList');
  if (S.journal.length === 0) {
    list.innerHTML = '<li class="empty">Aucune entrée. La station écoute.</li>';
    return;
  }
  list.innerHTML = S.journal.slice().reverse().map(e => {
    const d = Math.floor(e.t / (24*60)) + 1;
    const h = Math.floor((e.t % (24*60)) / 60);
    const m = Math.floor(e.t % 60);
    const stamp = `J${d} · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    return `<li class="entry ${e.kind}">
      <div class="meta">${stamp}</div>
      <div class="body">${e.txt}</div>
    </li>`;
  }).join('');
}

// ============================================================
//   INVENTAIRE — rendu (0.11)
// ============================================================
function renderInventory() {
  const sub = $('#invSub');
  const content = $('#invContent');
  if (!sub || !content) return;

  const inv = S.inventory || {};
  const total = inventoryCount();
  const distinct = Object.keys(inv).filter(k => inv[k] > 0).length;

  if (total === 0) {
    sub.innerHTML = "Aucun item récupéré pour l'instant. Lance des expéditions pour ramener des artefacts.";
    content.innerHTML = '<div class="empty">Inventaire vide.</div>';
    return;
  }

  sub.innerHTML = `<b>${total}</b> item(s) au total · ${distinct} type(s) distinct(s)`;

  // Résumé par origine
  const byOrigin = {};
  for (const id in inv) {
    if (!inv[id]) continue;
    const def = ITEMS[id];
    if (!def) continue;
    byOrigin[def.origin] = (byOrigin[def.origin] || 0) + inv[id];
  }
  const originLine = Object.entries(byOrigin)
    .map(([o, n]) => `<span style="color:${ITEM_ORIGINS[o]?.color || 'var(--text)'}">${ITEM_ORIGINS[o]?.nom || o}</span> <b>${n}</b>`)
    .join(' · ');
  let html = `<div class="inv-summary">Origine : ${originLine}</div>`;

  // Groupement par type
  for (const typeKey of Object.keys(ITEM_TYPES)) {
    const itemsOfType = Object.keys(inv).filter(id => {
      const def = ITEMS[id];
      return def && def.type === typeKey && inv[id] > 0;
    });
    if (itemsOfType.length === 0) continue;
    const typeDef = ITEM_TYPES[typeKey];
    const typeTotal = itemsOfType.reduce((s, id) => s + inv[id], 0);

    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title">${typeDef.nom}</div>
        <div class="ish-desc">${typeDef.desc}</div>
        <div class="ish-count">${typeTotal} item(s)</div>
      </div>
      <div class="inv-grid">`;

    // Tri par origine puis nom
    itemsOfType.sort((a, b) => {
      const da = ITEMS[a], db = ITEMS[b];
      if (da.origin !== db.origin) return da.origin.localeCompare(db.origin);
      return da.nom.localeCompare(db.nom);
    });

    for (const id of itemsOfType) {
      const def = ITEMS[id];
      const ori = ITEM_ORIGINS[def.origin] || { nom: def.origin, color: 'var(--text-mute)' };
      html += `<div class="inv-card" style="border-left-color:${ori.color}">
        <div class="ic-head">
          <div class="ic-name">${def.nom}</div>
          <div class="ic-origin" style="color:${ori.color}">${ori.nom}</div>
        </div>
        <div class="ic-count">${inv[id]}<span class="lbl">en stock</span></div>
        <div class="ic-desc">${def.desc}</div>
      </div>`;
    }
    html += `</div></div>`;
  }
  content.innerHTML = html;
}

// ============================================================
//   BIBLIOTHÈQUE DE SCHÉMAS — rendu (0.12)
// ============================================================
function renderLibrary() {
  const sub = $('#libSub');
  const content = $('#libContent');
  const badge = $('#libBadge');
  if (!sub || !content) return;

  const discoveries = S.discoveries || {};
  const allBpIds = Object.keys(BLUEPRINTS);
  const found = allBpIds.filter(id => discoveries[id]).length;
  const total = allBpIds.length;

  // Badge : nombre de schémas connus
  if (found > 0) { badge.textContent = found; badge.classList.add('show'); }
  else badge.classList.remove('show');

  if (found === 0) {
    sub.innerHTML = "Aucun schéma découvert. Explore les <em>ruines</em> en expédition pour en trouver.";
  } else {
    sub.innerHTML = `<b>${found}</b> schéma(s) connu(s) sur <b>${total}</b> au total.`;
  }

  // Header avec barre de progression
  const segs = allBpIds.map(id => `<span class="seg ${discoveries[id] ? 'found' : ''}"></span>`).join('');
  let html = `<div class="lib-summary">
    Cataloguée : <b>${found} / ${total}</b> · Reste à découvrir : <b>${total - found}</b>
    <div class="progress">${segs}</div>
  </div>`;

  // Groupement par origine
  for (const originKey of Object.keys(ITEM_ORIGINS)) {
    const bpsOfOrigin = allBpIds.filter(id => BLUEPRINTS[id].origin === originKey);
    if (bpsOfOrigin.length === 0) continue;
    const ori = ITEM_ORIGINS[originKey];
    const foundInOrigin = bpsOfOrigin.filter(id => discoveries[id]).length;

    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title" style="color:${ori.color}">${ori.nom}</div>
        <div class="ish-count">${foundInOrigin} / ${bpsOfOrigin.length}</div>
      </div>`;

    // Tri : trouvés d'abord, puis par rareté croissante
    bpsOfOrigin.sort((a, b) => {
      const da = discoveries[a] ? 0 : 1, db = discoveries[b] ? 0 : 1;
      if (da !== db) return da - db;
      return BLUEPRINTS[a].rarity - BLUEPRINTS[b].rarity;
    });

    for (const id of bpsOfOrigin) {
      const bp = BLUEPRINTS[id];
      const isFound = !!discoveries[id];
      const stock = (S.inventory?.[id] || 0);
      const rarityLabel = ['', 'Commun', 'Peu commun', 'Rare', 'Très rare'][bp.rarity || 1];
      const unlocksLabel = bp.unlocks?.label || '?';
      const unlockKindLabel = {
        fab: 'Fabrication débloquée',
        module: 'Amélioration de module',
        tech: 'Palier technologique'
      }[bp.unlocks?.kind] || 'Effet';

      let inner;
      if (isFound) {
        const d = Math.floor(discoveries[id].firstFoundAt / (24*60)) + 1;
        inner = `
          <div class="bphead">
            <div class="bpname">${bp.nom}</div>
            <div class="bp-tags">
              <span class="bp-origin" style="color:${ori.color}">${ori.nom}</span>
              <span class="bp-rarity r${bp.rarity}">${rarityLabel}</span>
            </div>
          </div>
          <div class="bpdesc">${bp.desc}</div>
          <div class="bpunlocks">
            <span class="lbl">${unlockKindLabel}</span>${unlocksLabel}
            <span class="pending">— exploitable en phase 0.13</span>
          </div>
          ${stock > 0 ? `<div class="bp-stock">${stock} exemplaire(s) en inventaire</div>` : ''}
          <div class="bp-found-at">Découvert J${d} via ${discoveries[id].source}</div>
        `;
      } else {
        // Non-découvert : silhouette grisée, juste l'origine et la rareté
        inner = `
          <div class="bphead">
            <div class="bpname">— Schéma inconnu —</div>
            <div class="bp-tags">
              <span class="bp-origin" style="color:${ori.color}">${ori.nom}</span>
              <span class="bp-rarity r${bp.rarity}">${rarityLabel}</span>
            </div>
          </div>
          <div class="bpdesc">À découvrir en expédition.</div>
        `;
      }

      html += `<div class="bp-card ${isFound ? '' : 'unknown'}" ${isFound ? `style="border-left-color:${ori.color}"` : ''}>${inner}</div>`;
    }
    html += `</div>`;
  }
  content.innerHTML = html;
}

// ============================================================
//   RECHERCHE / TECH TREE — rendu (0.13)
// ============================================================
function renderResearch() {
  const sub = $('#researchSub');
  const content = $('#researchContent');
  const badge = $('#researchBadge');
  if (!sub || !content) return;

  const labLvl = S.modules.laboratoire?.level || 0;
  const allTechs = Object.keys(TECH_TREE);
  const completed = allTechs.filter(id => isTechCompleted(id)).length;
  const ongoing = (S.research || []).length;

  // Badge : recherches en cours
  if (ongoing > 0) { badge.textContent = ongoing; badge.classList.add('show'); }
  else badge.classList.remove('show');

  if (labLvl === 0) {
    sub.innerHTML = "Construis un <em>Laboratoire</em> pour engager des recherches.";
    content.innerHTML = '<div class="empty">Aucun laboratoire opérationnel.</div>';
    return;
  }

  const slots = Math.max(1, Math.ceil(labLvl / 2));
  const lb = laboratoryBonuses();
  sub.innerHTML = `Laboratoire niv ${labLvl} · <b>${ongoing}/${slots}</b> recherche(s) en cours · <b>${completed}/${allTechs.length}</b> technologies maîtrisées`;

  // Résumé global avec datacubes / datacubes alien
  let html = `<div class="research-summary">
    <div class="stat"><span class="lbl">Datacubes</span><span class="v">${fmt(S.res.datacubes)}</span></div>
    <div class="stat"><span class="lbl">Datacubes alien</span><span class="v">${fmt(S.alienDatacubes || 0)}</span></div>
    <div class="stat"><span class="lbl">Places labo</span><span class="v">${ongoing}/${slots}</span></div>
    <div class="stat"><span class="lbl">Vitesse</span><span class="v">${lb.activeProd ? Math.round(100/lb.speedMult) + '%' : '30% (auto)'}</span></div>
  </div>`;

  // Recherches actives
  if (S.research && S.research.length > 0) {
    html += S.research.map(r => {
      const tech = TECH_TREE[r.techId];
      const pct = Math.min(100, (r.doneMin / r.totalMin) * 100);
      const remaining = Math.max(0, r.totalMin - r.doneMin);
      return `<div class="research-active">
        <div class="ra-head">
          <div class="ra-name">${tech?.nom || '?'}</div>
          <div class="ra-eta">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
        </div>
        <div class="ra-bar"><div class="ra-fill" style="width:${pct}%"></div></div>
        <div class="ra-foot">
          <span>Branche : ${TECH_BRANCHES[tech?.branch]?.nom || '?'}</span>
          <button class="ra-cancel" data-cancel-research="${r.id}">Annuler</button>
        </div>
      </div>`;
    }).join('');
  }

  // Tech tree groupé par branche
  for (const branchKey of Object.keys(TECH_BRANCHES)) {
    const br = TECH_BRANCHES[branchKey];
    const isLocked = branchKey === 'exotique' && !isExoticUnlocked();
    const branchTechs = allTechs.filter(id => TECH_TREE[id].branch === branchKey);
    const branchDone = branchTechs.filter(id => isTechCompleted(id)).length;

    html += `<div class="branch-section">
      <div class="branch-head ${isLocked ? 'locked' : ''}" style="color:${br.color}">
        <div>
          <div class="b-name">${br.nom}</div>
          <div class="b-desc">${isLocked ? "Découvre un schéma alien pour débloquer cette branche." : br.desc}</div>
        </div>
        <div class="b-progress">${branchDone}/${branchTechs.length}</div>
      </div>`;

    // Groupe par tier
    const tiers = {};
    for (const id of branchTechs) {
      const t = TECH_TREE[id];
      if (!tiers[t.tier]) tiers[t.tier] = [];
      tiers[t.tier].push(id);
    }
    const sortedTiers = Object.keys(tiers).sort((a, b) => parseInt(a) - parseInt(b));
    for (const tier of sortedTiers) {
      html += `<div class="tech-tier">
        <div class="tier-label">Palier ${tier}</div>`;
      for (const techId of tiers[tier]) {
        html += renderTechCard(techId, br.color);
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  content.innerHTML = html;

  // Hooks
  content.querySelectorAll('button[data-cancel-research]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm("Annuler cette recherche ? 50% des ressources seront récupérées.")) {
        cancelResearch(btn.dataset.cancelResearch);
      }
    });
  });
  content.querySelectorAll('.tech-card.available[data-tech]').forEach(card => {
    card.addEventListener('click', () => openResearchModal(card.dataset.tech));
  });
}

function renderTechCard(techId, branchColor) {
  const tech = TECH_TREE[techId];
  const completed = isTechCompleted(techId);
  const researching = isTechResearching(techId);
  const r = canResearch(techId);

  let cls, statusHTML;
  if (completed) {
    cls = 'completed';
    statusHTML = `<span class="tc-status done">acquise</span>`;
  } else if (researching) {
    cls = 'researching';
    statusHTML = `<span class="tc-status cur">en cours</span>`;
  } else if (r.ok) {
    cls = 'available';
    statusHTML = `<span class="tc-status av">disponible</span>`;
  } else {
    cls = 'locked';
    statusHTML = `<span class="tc-status lk">${r.reason}</span>`;
  }

  // Coût
  const cost = tech.cost;
  const costParts = [];
  const dcKO = (S.res.datacubes || 0) < cost.datacubes;
  costParts.push(`<span class="${dcKO && !completed && !researching ? 'ko' : ''}">${cost.datacubes} datacubes</span>`);
  if (cost.datacubes_alien) {
    const dcaKO = (S.alienDatacubes || 0) < cost.datacubes_alien;
    costParts.push(`<span class="${dcaKO && !completed && !researching ? 'ko' : ''}">${cost.datacubes_alien} d.alien</span>`);
  }
  costParts.push(`durée ${fmtMin(cost.time * BUILD_TIME_MULT)}`);

  // Prérequis
  let prereqStr = '';
  const unmetPrereqs = [];
  for (const t of (tech.prereq?.tech || [])) {
    if (!isTechCompleted(t)) unmetPrereqs.push(TECH_TREE[t]?.nom || t);
  }
  if (tech.prereq?.blueprint && !S.discoveries?.[tech.prereq.blueprint]) {
    unmetPrereqs.push(`Schéma : ${BLUEPRINTS[tech.prereq.blueprint]?.nom || '?'}`);
  }
  if (unmetPrereqs.length > 0) {
    prereqStr = `<div class="tc-prereq unmet">Requiert : ${unmetPrereqs.join(' · ')}</div>`;
  } else if (tech.prereq?.tech?.length || tech.prereq?.blueprint) {
    const sat = [];
    for (const t of (tech.prereq?.tech || [])) sat.push(TECH_TREE[t]?.nom);
    if (tech.prereq?.blueprint) sat.push(`Schéma : ${BLUEPRINTS[tech.prereq.blueprint]?.nom}`);
    prereqStr = `<div class="tc-prereq">Suite de : ${sat.join(' · ')}</div>`;
  }

  return `<div class="tech-card ${cls}" data-tech="${techId}" style="${cls === 'available' ? `border-left-color:${branchColor}` : ''}">
    <div class="tc-head">
      <div class="tc-name">${tech.nom}</div>
      ${statusHTML}
    </div>
    <div class="tc-desc">${tech.desc}</div>
    <div class="tc-meta">${costParts.join(' · ')}</div>
    ${prereqStr}
  </div>`;
}

function openResearchModal(techId) {
  const tech = TECH_TREE[techId];
  if (!tech) return;
  const r = canResearch(techId);
  const br = TECH_BRANCHES[tech.branch];

  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('research-modal');

  const cost = tech.cost;
  const dcKO = (S.res.datacubes || 0) < cost.datacubes;
  const dcaKO = cost.datacubes_alien && (S.alienDatacubes || 0) < cost.datacubes_alien;
  const costHTML = `
    <div class="rm-cost">
      <span class="${dcKO ? 'ko' : ''}">Datacubes : ${cost.datacubes} (${fmt(S.res.datacubes)} en stock)</span>
      ${cost.datacubes_alien ? `<span class="${dcaKO ? 'ko' : ''}">D.alien : ${cost.datacubes_alien} (${fmt(S.alienDatacubes || 0)} en stock)</span>` : ''}
      <span>Durée : ${fmtMin(cost.time * BUILD_TIME_MULT)}</span>
    </div>
  `;

  // Affichage des effets
  const effectsLines = [];
  const e = tech.effects || {};
  if (e.resourceMult) {
    for (const k in e.resourceMult) effectsLines.push(`Production ${RES_LABELS[k]} ×${e.resourceMult[k].toFixed(2)}`);
  }
  if (e.moduleProdMult) {
    for (const k in e.moduleProdMult) effectsLines.push(`${MODULES[k]?.nom || k} : ×${e.moduleProdMult[k].toFixed(2)}`);
  }
  if (e.moduleMaxLevelDelta) {
    for (const k in e.moduleMaxLevelDelta) effectsLines.push(`${MODULES[k]?.nom || k} : niveau max +${e.moduleMaxLevelDelta[k]}`);
  }
  if (e.capacityMult) {
    for (const k in e.capacityMult) effectsLines.push(`Capacité max ${RES_LABELS[k]} ×${e.capacityMult[k].toFixed(2)}`);
  }
  if (e.baseFractionDelta) effectsLines.push(`Plancher production auto : +${(e.baseFractionDelta*100).toFixed(0)}%`);
  if (e.treatmentSpeedMult) effectsLines.push(`Soins : ×${e.treatmentSpeedMult.toFixed(2)} de durée`);
  if (e.contagionMult) effectsLines.push(`Contagion : ×${e.contagionMult.toFixed(2)}`);
  if (e.sequelChanceMult) effectsLines.push(`Séquelles : ×${e.sequelChanceMult.toFixed(2)}`);
  if (e.trainingSpeedMult) effectsLines.push(`Formations : ×${e.trainingSpeedMult.toFixed(2)} de durée`);
  if (e.workerBiomasseMult) effectsLines.push(`Coût biomasse colon actif : ×${e.workerBiomasseMult.toFixed(2)}`);
  if (e.expeditionBiomasseMult) effectsLines.push(`Biomasse expé : ×${e.expeditionBiomasseMult.toFixed(2)}`);
  if (e.expeditionAlienLootMult) effectsLines.push(`Loot ruines alien : ×${e.expeditionAlienLootMult.toFixed(2)}`);
  if (e.expeditionThreatBonus) effectsLines.push(`Menace effective : ${e.expeditionThreatBonus > 0 ? '+' : ''}${e.expeditionThreatBonus}`);
  if (e.expeditionCombatBonus) effectsLines.push(`Bonus combat équipage : +${e.expeditionCombatBonus}`);
  if (e.expeditionToxicImmune) effectsLines.push(`Immunité aux atmosphères toxiques`);
  if (e.vesselFuelMult) effectsLines.push(`Carburant expé : ×${e.vesselFuelMult.toFixed(2)}`);
  if (e.vesselSpeedMult) effectsLines.push(`Durée voyage : ×${e.vesselSpeedMult.toFixed(2)}`);
  if (e.scanRangeBonus) effectsLines.push(`Portée scan : +${e.scanRangeBonus}`);

  m.innerHTML = `
    <div class="rm-branch" style="color:${br.color}">${br.nom} · Palier ${tech.tier}</div>
    <h3>${tech.nom}</h3>
    <div class="rm-desc">${tech.desc}</div>
    <div class="rm-effects">${effectsLines.map(l => '› ' + l).join('<br>')}</div>
    ${costHTML}
    ${!r.ok ? `<div class="rm-prereq" style="color:var(--rust)">${r.reason}</div>` : ''}
    <div class="btn-row">
      <button id="researchCancel">Annuler</button>
      <button id="researchConfirm" class="primary" ${r.ok ? '' : 'disabled'}>Lancer la recherche</button>
    </div>
  `;
  bg.classList.add('show');

  $('#researchCancel').addEventListener('click', () => {
    bg.classList.remove('show');
    m.classList.remove('research-modal');
  });
  $('#researchConfirm').addEventListener('click', () => {
    startResearch(techId);
    bg.classList.remove('show');
    m.classList.remove('research-modal');
  });
}

// ============================================================
//   ATELIER / FABRICATIONS — rendu (0.14)
// ============================================================
function renderWorkshop() {
  const sub = $('#workshopSub');
  const status = $('#workshopStatus');
  const content = $('#workshopContent');
  const badge = $('#workshopBadge');
  if (!sub || !content) return;

  const lvl = S.modules.atelier?.level || 0;
  const inQueue = (S.fabrication || []).length;
  const slots = workshopSlots();

  // Badge
  if (inQueue > 0) { badge.textContent = inQueue; badge.classList.add('show'); }
  else badge.classList.remove('show');

  if (lvl === 0) {
    sub.innerHTML = "Construis un <em>Atelier</em> pour fabriquer de l'équipement.";
    status.innerHTML = '';
    content.innerHTML = '<div class="empty">Aucun atelier opérationnel.</div>';
    return;
  }

  const bonuses = workshopBonuses();
  sub.innerHTML = `Atelier niv ${lvl} · <b>${inQueue}/${slots}</b> en cours`;

  // Encart staff de l'atelier
  const wBonusParts = [];
  if (bonuses.speedMult < 1) wBonusParts.push(`Fabrications <b>${Math.round((1 - bonuses.speedMult) * 100)}% plus rapides</b>`);
  if (bonuses.qualityChance > 0) wBonusParts.push(`<b>${Math.round(bonuses.qualityChance * 100)}%</b> de chance × 2`);
  if (!bonuses.hasArtisan) wBonusParts.push(`<span style="color:var(--rust)">Aucun Artisan : 30% de la vitesse normale</span>`);
  const wBonusText = wBonusParts.length > 0
    ? wBonusParts.join(' · ')
    : `<span class="none">Aucun bonus actif. Affecte un Artisan.</span>`;
  const staffHTML = renderStaffPanel('atelier', { title: 'Équipe atelier', bonusText: wBonusText });
  status.innerHTML = staffHTML;

  // File en cours
  let html = '';
  if (S.fabrication && S.fabrication.length > 0) {
    html += S.fabrication.map(f => {
      const fab = FABRICATIONS[f.fabId];
      const pct = Math.min(100, (f.doneMin / f.totalMin) * 100);
      const remaining = Math.max(0, f.totalMin - f.doneMin);
      return `<div class="fab-active">
        <div class="fa-head">
          <div class="fa-name">${fab?.nom || '?'}</div>
          <div class="fa-eta">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
        </div>
        <div class="fa-bar"><div class="fa-fill" style="width:${pct}%"></div></div>
        <div class="fa-foot">
          <button class="fa-cancel" data-cancel-fab="${f.id}">Annuler</button>
        </div>
      </div>`;
    }).join('');
  }

  // Catalogue de fabrications, regroupé par type d'item produit
  const groups = {
    consumable: [],
    tool:       [],
    weapon:     []
  };
  for (const fabId in FABRICATIONS) {
    const fab = FABRICATIONS[fabId];
    const itemDef2 = ITEMS[fab.produces];
    if (!itemDef2) continue;
    if (!groups[itemDef2.type]) groups[itemDef2.type] = [];
    groups[itemDef2.type].push(fabId);
  }

  for (const typeKey of ['consumable', 'tool', 'weapon']) {
    const list = groups[typeKey];
    if (!list || list.length === 0) continue;
    const typeDef = ITEM_TYPES[typeKey];
    html += `<div class="inv-section">
      <div class="inv-section-head">
        <div class="ish-title">${typeDef.nom}</div>
        <div class="ish-desc">${typeDef.desc.replace(/ \(à venir.*\)/, '')}</div>
      </div>`;

    // Tri : disponibles d'abord, puis verrouillées par niveau croissant
    list.sort((a, b) => {
      const aav = isFabAvailable(a) ? 0 : 1;
      const bav = isFabAvailable(b) ? 0 : 1;
      if (aav !== bav) return aav - bav;
      return (FABRICATIONS[a].prereq?.workshopLevel || 1) - (FABRICATIONS[b].prereq?.workshopLevel || 1);
    });

    for (const fabId of list) {
      html += renderFabCard(fabId);
    }
    html += `</div>`;
  }

  content.innerHTML = html;

  // Hooks
  content.querySelectorAll('button[data-cancel-fab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm("Annuler cette fabrication ? 50% des ressources seront récupérées.")) {
        cancelFabrication(btn.dataset.cancelFab);
      }
    });
  });
  content.querySelectorAll('.fab-card.available[data-fab]').forEach(card => {
    card.addEventListener('click', () => openFabModal(card.dataset.fab));
  });
  hookStaffLinks($('#subview-workshop'));
}

function renderFabCard(fabId) {
  const fab = FABRICATIONS[fabId];
  const itemDef2 = ITEMS[fab.produces];
  const ori = ITEM_ORIGINS[itemDef2.origin] || { color: 'var(--text-mute)' };
  const r = canFabricate(fabId);
  const inQueue = (S.fabrication || []).some(f => f.fabId === fabId);

  let cls, statusHTML;
  if (inQueue) {
    cls = 'in-queue';
    statusHTML = `<span class="fc-status cur">en file</span>`;
  } else if (r.ok) {
    cls = 'available';
    statusHTML = `<span class="fc-status av">disponible</span>`;
  } else if (isFabAvailable(fabId)) {
    // Disponible (prérequis OK) mais coût/file pas remplis
    cls = 'locked';
    statusHTML = `<span class="fc-status lk">${r.reason}</span>`;
  } else {
    cls = 'locked';
    statusHTML = `<span class="fc-status lk">verrouillée</span>`;
  }

  // Coût
  const cost = fab.cost;
  const costParts = Object.entries(cost).map(([k, v]) => {
    const ko = (S.res[k] || 0) < v;
    return `<span class="${ko && !inQueue ? 'ko' : ''}">${v} ${RES_LABELS[k]}</span>`;
  });
  costParts.push(`durée ${fmtMin(fab.time * BUILD_TIME_MULT)}`);

  // Prérequis
  const unmet = [];
  if (fab.prereq?.workshopLevel && (S.modules.atelier?.level || 0) < fab.prereq.workshopLevel) {
    unmet.push(`Atelier niv ${fab.prereq.workshopLevel}`);
  }
  if (fab.prereq?.blueprint && !S.discoveries?.[fab.prereq.blueprint]) {
    unmet.push(`Schéma : ${BLUEPRINTS[fab.prereq.blueprint]?.nom || '?'}`);
  }
  if (fab.prereq?.tech) {
    for (const t of fab.prereq.tech) {
      if (!isTechCompleted(t)) unmet.push(`Tech : ${TECH_TREE[t]?.nom || t}`);
    }
  }
  let prereqHTML = '';
  if (unmet.length > 0) {
    prereqHTML = `<div class="fc-prereq unmet">Requiert : ${unmet.join(' · ')}</div>`;
  } else if (fab.prereq?.blueprint) {
    prereqHTML = `<div class="fc-prereq">Requiert : ${BLUEPRINTS[fab.prereq.blueprint]?.nom}</div>`;
  }

  // Stock actuel de l'item produit
  const stock = (S.inventory || {})[fab.produces] || 0;
  const stockHTML = stock > 0 ? `<span class="fc-tag" style="color:var(--moss)">stock: ${stock}</span>` : '';

  return `<div class="fab-card ${cls}" data-fab="${fabId}" ${cls === 'available' ? `style="border-left-color:${ori.color}"` : ''}>
    <div class="fc-head">
      <div class="fc-name">${fab.nom}</div>
      <div class="fc-tags">
        ${stockHTML}
        ${statusHTML}
      </div>
    </div>
    <div class="fc-desc">${fab.desc}</div>
    <div class="fc-cost">${costParts.join(' · ')}</div>
    ${prereqHTML}
  </div>`;
}

function openFabModal(fabId) {
  const fab = FABRICATIONS[fabId];
  if (!fab) return;
  const r = canFabricate(fabId);
  const itemDef2 = ITEMS[fab.produces];
  const ori = ITEM_ORIGINS[itemDef2.origin];

  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('research-modal');

  const cost = fab.cost;
  const costHTML = `<div class="rm-cost">
    ${Object.entries(cost).map(([k, v]) => {
      const ko = (S.res[k] || 0) < v;
      return `<span class="${ko ? 'ko' : ''}">${RES_LABELS[k]} : ${v} (${fmt(S.res[k] || 0)} en stock)</span>`;
    }).join('')}
    <span>Durée : ${fmtMin(fab.time * BUILD_TIME_MULT)}</span>
  </div>`;

  m.innerHTML = `
    <div class="rm-branch" style="color:${ori.color}">${itemDef2.type === 'consumable' ? 'Consommable' : itemDef2.type === 'tool' ? 'Outil' : 'Armement'} · ${ITEM_ORIGINS[itemDef2.origin].nom}</div>
    <h3>${fab.nom}</h3>
    <div class="rm-desc">${itemDef2.desc}</div>
    ${costHTML}
    ${!r.ok ? `<div class="rm-prereq" style="color:var(--rust)">${r.reason}</div>` : ''}
    <div class="btn-row">
      <button id="fabCancel">Annuler</button>
      <button id="fabConfirm" class="primary" ${r.ok ? '' : 'disabled'}>Lancer la fabrication</button>
    </div>
  `;
  bg.classList.add('show');

  $('#fabCancel').addEventListener('click', () => {
    bg.classList.remove('show');
    m.classList.remove('research-modal');
  });
  $('#fabConfirm').addEventListener('click', () => {
    startFabrication(fabId);
    bg.classList.remove('show');
    m.classList.remove('research-modal');
  });
}

// Petite barre de pips 1-5
function pipBar(value, kind) {
  const pips = [];
  for (let i = 1; i <= 5; i++) {
    pips.push(`<span class="pip ${i <= value ? 'on' : ''}"></span>`);
  }
  return `<span class="tr-bar ${kind}">${pips.join('')}</span>`;
}

// Chips d'aperçu pour une carte système (signaux remarquables)
function systemChips(sys) {
  const chips = [];
  // On regarde si au moins un corps a un signal / des ruines / un danger fort / vie
  const hasSignal  = sys.bodies.some(b => b.signal && b.signal !== 'aucun');
  const hasRuines  = sys.bodies.some(b => b.ruines && b.ruines !== 'aucune');
  const hasDanger  = sys.bodies.some(b => b.danger && ['ia_hostile','anomalie','pathogene'].includes(b.danger));
  const hasLife    = sys.bodies.some(b => ['civ_active','civ_dechue'].includes(b.vie));
  if (hasSignal) chips.push('<span class="signal-chip signal">Signal</span>');
  if (hasRuines) chips.push('<span class="signal-chip ruins">Ruines</span>');
  if (hasLife)   chips.push('<span class="signal-chip life">Vie</span>');
  if (hasDanger) chips.push('<span class="signal-chip danger">Danger</span>');
  return chips.join('');
}

function renderGalaxy() {
  const host = $('#galaxyContent');
  const view = S.ui?.galaxyView || 'list';
  if (view === 'body' && S.ui.currentBodyId) {
    host.innerHTML = renderGalaxyBody();
  } else if (view === 'system' && S.ui.currentSystemId) {
    host.innerHTML = renderGalaxySystem();
  } else {
    host.innerHTML = renderGalaxyList();
  }
  hookGalaxyClicks();
}

function renderGalaxyList() {
  const scanned = S.galaxy.systems.filter(s => s.scanned);
  const total = S.galaxy.systems.length;
  const antLvl = S.modules.antenne?.level || 0;
  const range = (1 + antLvl * 1.4).toFixed(1);

  const cards = scanned.map(sys => {
    const isHome = sys.distance < 0.8;
    const cls = isHome ? 'home' : (sys.explored ? 'explored' : '');
    const chips = systemChips(sys);
    return `<div class="system-card ${cls}" data-system-id="${sys.id}">
      <div class="scard-head">
        <div class="sysname">${sys.name}${isHome ? '<span class="home-marker">Origine</span>' : ''}</div>
        <div class="sysdist">${sys.distance.toFixed(2)} pc</div>
      </div>
      <div class="sysmeta">${sys.bodies.length} corps céleste${sys.bodies.length > 1 ? 's' : ''}</div>
      ${chips ? `<div class="syssignals">${chips}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="galaxy-header">
      <div>
        <h2 class="eyebrow">Cartographie galactique</h2>
        <h1 class="head">Galaxie</h1>
      </div>
    </div>
    <div class="galaxy-stats">
      Systèmes connus : <b>${scanned.length} / ${total}</b> · Portée actuelle : <b>${range} pc</b>
      ${antLvl === 0 ? ' · Aucune antenne longue portée' : ` · Antenne niv ${antLvl}`}
    </div>
    <div style="height:14px"></div>
    <div class="system-list">${cards || '<div class="empty">Aucun système cartographié.</div>'}</div>
  `;
}

function renderGalaxySystem() {
  const sys = S.galaxy.systems.find(s => s.id === S.ui.currentSystemId);
  if (!sys) {
    S.ui.galaxyView = 'list';
    return renderGalaxyList();
  }
  const isHome = sys.distance < 0.8;

  const bodyCards = sys.bodies.map(b => {
    const threat = bodyThreatLevel(b);
    const reward = bodyRewardLevel(b);
    const summary = [
      BIOMES[b.biome]?.nom,
      ATMOSPHERES[b.atmosphere]?.nom,
      GRAVITES[b.gravite] ? `gravité ${GRAVITES[b.gravite].nom.toLowerCase()}` : null
    ].filter(Boolean).join(' · ');

    return `<div class="body-card ${b.visited ? 'visited' : ''} ${b.looted ? 'looted' : ''}"
      data-body-id="${b.id}" data-type="${b.type}">
      <div class="bcard-head">
        <div class="bname">${b.name}</div>
        <div class="btype">${BODY_TYPES[b.type].nom}</div>
      </div>
      <div class="bsummary">${summary}</div>
      <div class="threat-reward">
        <span>Menace ${pipBar(threat, 'threat')}</span>
        <span>Récompense ${pipBar(reward, 'reward')}</span>
      </div>
    </div>`;
  }).join('');

  return `
    <button class="back-btn" data-galaxy-action="list">Galaxie</button>
    <div class="system-header">
      <div class="sysname-big">${sys.name}${isHome ? '<span class="home-marker">Origine</span>' : ''}</div>
      <div class="sysmeta-big">${sys.distance.toFixed(2)} pc · ${sys.bodies.length} corps céleste${sys.bodies.length > 1 ? 's' : ''}</div>
    </div>
    <div class="body-list">${bodyCards}</div>
  `;
}

function renderGalaxyBody() {
  const sys = S.galaxy.systems.find(s => s.id === S.ui.currentSystemId);
  const body = sys?.bodies.find(b => b.id === S.ui.currentBodyId);
  if (!body) {
    S.ui.galaxyView = 'system';
    return renderGalaxySystem();
  }
  const threat = bodyThreatLevel(body);
  const reward = bodyRewardLevel(body);
  const narrative = describeBody(body);

  // Tableau d'analyse
  const dataRows = [
    ['Type',        BODY_TYPES[body.type].nom, ''],
    ['Biome',       BIOMES[body.biome]?.nom || '—', ''],
    ['Atmosphère',  ATMOSPHERES[body.atmosphere]?.nom || '—', ''],
    ['Gravité',     GRAVITES[body.gravite]?.nom || '—', ''],
    ['Vie',         VIES[body.vie]?.nom || '—', body.vie !== 'aucune' ? 'life' : ''],
    ['Signal',      SIGNAUX[body.signal]?.nom || '—', body.signal !== 'aucun' ? 'signal' : ''],
    ['Ruines',      RUINES[body.ruines]?.nom || '—', body.ruines !== 'aucune' ? 'ruins' : ''],
    ['Danger',      DANGERS[body.danger]?.nom || '—', body.danger !== 'aucun' ? 'danger' : '']
  ];
  const dataHTML = dataRows.map(([lbl, val, cls]) =>
    `<div class="dl-row"><span class="dl-lbl">${lbl}</span><span class="dl-val ${cls}">${val}</span></div>`
  ).join('');

  // Zone d'action : décide ce qu'on peut faire
  let actionHTML;
  if (!S.modules.hangar) {
    actionHTML = `<div class="body-action-area">
      Construis un <em style="color:var(--amber);font-style:normal;">Hangar</em> pour engager des expéditions.
    </div>`;
  } else if (S.fleet.length === 0 && !S.vesselBuild) {
    actionHTML = `<div class="body-action-area">
      Aucun vaisseau dans la flotte.<br>
      Va dans <em style="color:var(--amber);font-style:normal;">Galaxie › Vaisseaux</em> pour en construire un.
    </div>`;
  } else {
    const availV = S.fleet.filter(v => v.available).length;
    const freeC = S.crew.filter(c => c.statut === 'libre').length;
    if (availV === 0) {
      actionHTML = `<div class="body-action-area">Tous les vaisseaux sont en mission.</div>`;
    } else if (freeC === 0) {
      actionHTML = `<div class="body-action-area">Aucun membre d'équipage disponible.</div>`;
    } else {
      actionHTML = `<button class="cta-btn" data-galaxy-action="launch" data-body-id="${body.id}">
        Lancer une expédition
      </button>`;
    }
  }

  return `
    <button class="back-btn" data-galaxy-action="system">${sys.name}</button>
    <div class="body-detail-header">
      <div class="bname-big">${body.name}</div>
      <div class="bsystem">Système ${sys.name} · ${sys.distance.toFixed(2)} pc · ${BODY_TYPES[body.type].nom}</div>
    </div>
    <div class="body-data-grid">${dataHTML}</div>
    <div style="display:flex;gap:14px;font-family:var(--mono);font-size:11px;color:var(--text-mute);margin-bottom:18px;">
      <span>Menace ${pipBar(threat, 'threat')}</span>
      <span>Récompense ${pipBar(reward, 'reward')}</span>
    </div>
    <div class="body-narrative">${narrative}</div>
    ${actionHTML}
  `;
}

function hookGalaxyClicks() {
  $('#galaxyContent').querySelectorAll('[data-system-id]').forEach(el => {
    el.addEventListener('click', () => {
      S.ui.galaxyView = 'system';
      S.ui.currentSystemId = el.dataset.systemId;
      renderGalaxy();
    });
  });
  $('#galaxyContent').querySelectorAll('[data-body-id]').forEach(el => {
    el.addEventListener('click', () => {
      S.ui.galaxyView = 'body';
      S.ui.currentBodyId = el.dataset.bodyId;
      renderGalaxy();
    });
  });
  $('#galaxyContent').querySelectorAll('[data-galaxy-action]').forEach(el => {
    el.addEventListener('click', () => {
      const act = el.dataset.galaxyAction;
      if (act === 'list') {
        S.ui.galaxyView = 'list';
        S.ui.currentSystemId = null;
        S.ui.currentBodyId = null;
        renderGalaxy();
      } else if (act === 'system') {
        S.ui.galaxyView = 'system';
        S.ui.currentBodyId = null;
        renderGalaxy();
      } else if (act === 'launch') {
        showLaunchModal(el.dataset.bodyId);
      }
    });
  });
}

// ============================================================
//   FLEET — rendu
// ============================================================
// ============================================================
//   ENCART STAFF — composant partagé entre Soin / Formation / Vaisseaux
// ============================================================
// Affiche en haut d'un panneau les colons affectés au bâtiment correspondant,
// avec un résumé des bonus actuels et un raccourci vers Modules › Affectations.
function renderStaffPanel(modKey, opts = {}) {
  const def = MODULES[modKey];
  if (!def || !S.modules[modKey]) return '';
  const jobs = jobsForModule(modKey);
  if (jobs.length === 0) return '';

  // Construit la liste des postes (occupés et vacants)
  const rows = jobs.map((job, i) => {
    const id = S.assignments[jobKey(modKey, i)];
    const m = id ? S.crew.find(c => c.id === id) : null;
    const role = ROLES[job.role];
    const onPost = m && m.statut === 'travail';
    if (onPost) {
      return `<div class="staff-row" style="border-left-color:${role.color}">
        <div class="sr-info"><span class="role-mini" style="color:${role.color}">${role.nom}</span>${job.label}</div>
        <div class="sr-name">${m.name}</div>
      </div>`;
    } else if (m) {
      return `<div class="staff-row empty" style="border-left-color:${role.color}">
        <div class="sr-info"><span class="role-mini" style="color:${role.color}">${role.nom}</span>${job.label}</div>
        <div class="sr-name">${m.name} · ${m.statut}</div>
      </div>`;
    } else {
      return `<div class="staff-row empty" style="border-left-color:${role.color}">
        <div class="sr-info"><span class="role-mini" style="color:${role.color}">${role.nom}</span>${job.label}</div>
        <div class="sr-name">vacant</div>
      </div>`;
    }
  }).join('');

  // Résumé des bonus actuellement actifs (selon le module)
  let bonusesHTML = '';
  if (opts.bonusText) {
    bonusesHTML = `<div class="sp-bonuses">${opts.bonusText}</div>`;
  }

  return `<div class="staff-panel">
    <div class="sp-head">
      <div class="sp-title">${opts.title || `Équipe — ${def.nom}`}</div>
      <button class="sp-link" data-goto-assign="${modKey}">Gérer →</button>
    </div>
    ${bonusesHTML}
    <div class="staff-list">${rows}</div>
  </div>`;
}

// Hook commun pour les liens "Gérer →" (va sur Modules › Affectations et scrolle vers le bâtiment)
function hookStaffLinks(scope) {
  const root = scope || document;
  root.querySelectorAll('button[data-goto-assign]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Active l'onglet Modules
      const modulesBtn = document.querySelector('nav.tabs button[data-tab="modules"]');
      if (modulesBtn) modulesBtn.click();
      // Active le sous-onglet Affectations
      const assignSub = document.querySelector('nav.subtabs button[data-subtab-mod="assignments"]');
      if (assignSub) assignSub.click();
      // Scrolle vers le bâtiment correspondant (au tick suivant pour laisser le DOM se mettre à jour)
      setTimeout(() => {
        const cards = document.querySelectorAll('#assignList .module-assign-card');
        // Match par nom de bâtiment dans le DOM
        const targetName = MODULES[btn.dataset.gotoAssign]?.nom;
        for (const card of cards) {
          const nameEl = card.querySelector('.mac-name');
          if (nameEl && nameEl.textContent.trim() === targetName) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Mise en surbrillance brève
            card.style.transition = 'border-color 0.4s';
            card.style.borderColor = 'var(--amber)';
            setTimeout(() => { card.style.borderColor = ''; }, 1500);
            break;
          }
        }
      }, 50);
    });
  });
}

function renderFleet() {
  const sub = $('#fleetSub');
  const status = $('#fleetStatus');
  const list = $('#fleetList');
  const catalogHead = $('#fleetCatalogHead');
  const catalog = $('#fleetCatalog');

  const hangar = S.modules.hangar;
  const fleetTab = $('#subtab-fleet');
  if (fleetTab) fleetTab.disabled = !hangar;

  if (!hangar) {
    sub.innerHTML = "Construis un <em>Hangar</em> pour entreposer des vaisseaux. Prérequis : Atelier niv 1.";
    status.innerHTML = '';
    list.innerHTML = '<div class="empty">Aucun hangar.</div>';
    catalogHead.style.display = 'none';
    catalog.innerHTML = '';
    return;
  }

  const cap = hangar.level;
  const cur = S.fleet.length + (S.vesselBuild ? 1 : 0);
  sub.innerHTML = `Hangar niv ${cap} · capacité ${cur}/${cap} vaisseau(x)`;

  // Encart staff hangar
  const hb = hangarBonuses();
  const hBonusParts = [];
  if (hb.fuelMult < 1) hBonusParts.push(`Carburant <b>${Math.round((1 - hb.fuelMult) * 100)}% en moins</b>`);
  if (hb.speedMult < 1) hBonusParts.push(`Voyages <b>${Math.round((1 - hb.speedMult) * 100)}% plus rapides</b>`);
  // Sécurité hangar : on l'affiche mais pour l'instant c'est cosmétique (sera utilisé pour incidents hangar)
  const secCount = staffRoleCount('hangar', 'securite');
  if (secCount > 0) hBonusParts.push(`Sécurité hangar <b>+${secCount}</b>`);
  const hBonusText = hBonusParts.length > 0
    ? hBonusParts.join(' · ')
    : `<span class="none">Aucun bonus actif. Affecte un Mécano de bord ou un Chef pilote pour améliorer.</span>`;
  const hStaffHTML = renderStaffPanel('hangar', { title: 'Équipe sol', bonusText: hBonusText });

  status.innerHTML = hStaffHTML + `<div class="fleet-status">
    Stationnés : <b>${S.fleet.filter(v=>v.available).length}</b> · 
    En mission : <b>${S.fleet.filter(v=>!v.available).length}</b>
    ${S.vesselBuild ? ` · Chantier en cours` : ''}
  </div>`;

  // Vaisseaux possédés
  let listHTML = '';
  if (S.vesselBuild) {
    const def = VESSELS[S.vesselBuild.type];
    const pct = Math.min(100, S.vesselBuild.doneMin / S.vesselBuild.totalMin * 100);
    const remaining = S.vesselBuild.totalMin - S.vesselBuild.doneMin;
    listHTML += `<div class="vessel-buildslot">
      <div class="name">${def.nom} en construction</div>
      <div class="progress-wrap">
        <div class="bar" style="width:${pct}%"></div>
        <div class="lbl">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
      </div>
    </div>`;
  }

  if (S.fleet.length === 0 && !S.vesselBuild) {
    listHTML += '<div class="empty">Aucun vaisseau dans le hangar.</div>';
  } else {
    listHTML += S.fleet.map(v => {
      const def = VESSELS[v.type];
      const busy = !v.available;
      let busyInfo = '';
      if (busy) {
        const exp = S.expeditions.find(e => e.vesselId === v.id);
        if (exp) {
          const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
          const body = sys?.bodies.find(b => b.id === exp.bodyId);
          busyInfo = ` · vers ${body?.name || '?'} (${exp.phase})`;
        }
      }
      return `<div class="vessel-card ${busy ? 'busy' : ''}">
        <div class="vcard-head">
          <div class="vname">${v.name}</div>
          <div class="vtype">${def.nom}</div>
        </div>
        <div class="vflavor">${def.flavor}</div>
        <div class="vstats">
          <span>Places <b>${def.places}</b></span>
          <span>Cargo <b>${def.cargo}</b></span>
          <span>Vitesse <b>${(1/def.speed).toFixed(2)}×</b></span>
          <span>Carb. <b>${def.fuelPerPc}</b>/pc</span>
        </div>
        <div class="vstatus ${busy ? 'busy' : 'available'}">
          ${busy ? `En mission${busyInfo}` : 'Disponible'}
        </div>
      </div>`;
    }).join('');
  }
  list.innerHTML = listHTML;

  // Catalogue : modèles dispo selon Hangar
  const eligible = Object.entries(VESSELS).filter(([k,d]) => d.hangarReq <= cap);
  if (eligible.length > 0 && cur < cap && !S.vesselBuild) {
    catalogHead.style.display = '';
    catalog.innerHTML = eligible.map(([key, def]) => {
      const r = canBuildVessel(key);
      const costStr = Object.entries(def.cost).map(([k,v]) => {
        const ko = (S.res[k] || 0) < v;
        return `<span class="${ko ? 'ko' : ''}">${RES_LABELS[k]} ${v}</span>`;
      }).join(' · ');
      return `<div class="vmodel-card">
        <div class="vmname">${def.nom}</div>
        <div class="vmflavor">${def.flavor}</div>
        <div class="vmstats">
          <span>Places ${def.places}</span>
          <span>Cargo ${def.cargo}</span>
          <span>Vit. ${(1/def.speed).toFixed(2)}×</span>
          <span>Carb. ${def.fuelPerPc}/pc</span>
        </div>
        <div class="vmcost">${costStr} · ${fmtMin(def.buildHours * 60 * BUILD_TIME_MULT)}</div>
        <button data-build-vessel="${key}" ${r.ok ? '' : 'disabled'}>
          ${r.ok ? 'Mettre sur cale' : r.why}
        </button>
      </div>`;
    }).join('');

    catalog.querySelectorAll('button[data-build-vessel]').forEach(btn => {
      btn.addEventListener('click', () => startVesselBuild(btn.dataset.buildVessel));
    });
  } else {
    catalogHead.style.display = 'none';
    catalog.innerHTML = '';
  }
  hookStaffLinks($('#subview-fleet'));
}

// ============================================================
//   EXPÉDITIONS — rendu
// ============================================================
function renderExpeditions() {
  const sub = $('#expSub');
  const active = $('#expActiveList');
  const histHead = $('#expHistoryHead');
  const hist = $('#expHistoryList');
  const expTab = $('#subtab-expeditions');
  const expBadge = $('#expBadge');
  const galaxyBadge = $('#galaxyBadge');

  const n = S.expeditions.length;
  // Badge sur le sous-onglet et sur l'onglet principal Galaxie
  for (const b of [expBadge, galaxyBadge]) {
    if (!b) continue;
    if (n > 0) { b.textContent = n; b.classList.add('show'); }
    else b.classList.remove('show');
  }

  if (expTab) expTab.disabled = !S.modules.hangar;

  if (n === 0) {
    sub.innerHTML = "Aucune expédition active. Va dans <em>Cartographie</em>, choisis une planète, lance une mission.";
    active.innerHTML = '<div class="empty">Aucune mission en cours.</div>';
  } else {
    sub.innerHTML = `${n} expédition${n>1?'s':''} en cours`;
    active.innerHTML = S.expeditions.map(exp => {
      const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
      const body = sys?.bodies.find(b => b.id === exp.bodyId);
      const vessel = S.fleet.find(v => v.id === exp.vesselId);
      let totalForPhase, label;
      if (exp.phase === 'aller')      { totalForPhase = exp.oneWayMin; label = 'En route'; }
      else if (exp.phase === 'sur_place') { totalForPhase = exp.onSiteMin; label = 'Sur place'; }
      else                            { totalForPhase = exp.oneWayMin; label = 'Retour'; }
      const pct = Math.min(100, exp.elapsedMin / totalForPhase * 100);
      const remaining = totalForPhase - exp.elapsedMin;
      const crewNames = exp.crewIds
        .map(id => S.crew.find(c => c.id === id)?.name || '?')
        .join(', ');

      // Bouton Reprendre si on est sur place et qu'une décision est attendue
      let actionBtn = '';
      if (exp.phase === 'sur_place' && exp.awaitingChoice) {
        if (exp.combat?.active) {
          const roundLabel = `Round ${exp.combat.round}`;
          const phase = exp.combat.phase === 'player' ? 'tour des alliés' : 'phase ennemie';
          actionBtn = `<button class="cta-btn cbt-btn" data-resume-exp="${exp.id}" style="margin-top:10px;padding:10px;font-size:11px;background:#8b2020;">
            ⚔ Combat en cours · ${roundLabel} · ${phase}
          </button>`;
        } else {
          const sceneNum = exp.sceneIdx + 1;
          const sceneTotal = exp.scenes.length;
          actionBtn = `<button class="cta-btn" data-resume-exp="${exp.id}" style="margin-top:10px;padding:10px;font-size:11px;">
            Reprendre la mission · scène ${sceneNum}/${sceneTotal}
          </button>`;
        }
      }

      // Pour la phase sur_place, on n'affiche pas la barre puisque le temps ne progresse pas
      const progressHTML = exp.phase === 'sur_place'
        ? `<div class="eprog"><div class="lbl">${exp.combat?.active ? `⚔ Combat · Round ${exp.combat.round}` : `Scène ${exp.sceneIdx + 1}/${exp.scenes.length} · décision attendue`}</div></div>`
        : `<div class="eprog">
            <div class="bar" style="width:${pct}%"></div>
            <div class="lbl">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
          </div>`;

      return `<div class="expedition-card ${exp.phase}">
        <div class="ehead">
          <div class="edest">${body?.name || '?'}</div>
          <div class="ephase">${label}</div>
        </div>
        <div class="emeta">${vessel?.name || '?'} · ${sys?.distance.toFixed(2)} pc · ${exp.crewIds.length} membre${exp.crewIds.length>1?'s':''}</div>
        ${progressHTML}
        <div class="ecrew">${crewNames}</div>
        ${actionBtn}
      </div>`;
    }).join('');

    // Hook les boutons "Reprendre"
    setTimeout(() => {
      $('#expActiveList')?.querySelectorAll('button[data-resume-exp]').forEach(btn => {
        btn.addEventListener('click', () => openSceneOverlay(btn.dataset.resumeExp));
      });
    }, 0);
  }

  // Historique
  if (S.expHistory.length > 0) {
    histHead.style.display = '';
    hist.innerHTML = S.expHistory.slice(0, 8).map(h => {
      const d = Math.floor(h.finishedAt / (24*60)) + 1;
      const cls = h.result.outcomeKind === 'warn' ? 'warn' : '';
      return `<div class="exphistory-row ${cls}">
        <div class="h-head">
          <div class="h-dest">${h.bodyName}</div>
          <div>J${d}</div>
        </div>
        <div class="h-summary">${h.vesselName} · ${h.crewCount} membre${h.crewCount>1?'s':''} · ${h.result.summary}</div>
      </div>`;
    }).join('');
  } else {
    histHead.style.display = 'none';
    hist.innerHTML = '';
  }
}

// ============================================================
//   OVERLAY DE SCÈNE — UI plein écran narratif
// ============================================================
let _activeSceneExpId = null;

function openSceneOverlay(expId) {
  const exp = S.expeditions.find(e => e.id === expId);
  if (!exp || exp.phase !== 'sur_place' || !exp.awaitingChoice) return;
  _activeSceneExpId = expId;
  $('#sceneOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderSceneOverlay();
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
    const guardingActive = a.effects.some(e => e.type === 'guarding');
    const shieldBar = a.maxShieldHp > 0
      ? `<div class="cbt-shield-bar"><div class="cbt-shield-fill" style="width:${Math.max(0, a.shieldHp / a.maxShieldHp * 100)}%"></div></div>
         <div class="cbt-hp-txt" style="color:#7ab8e8">⚡${a.shieldHp}/${a.maxShieldHp} Bouclier</div>`
      : '';
    const wType = a.weaponType ? `<span class="cbt-wtype">${weaponLabel[a.weaponType] || a.weaponType}</span>` : '';
    const statusBadge = a.au_sol
      ? ' <span class="cbt-au-sol">AU SOL</span>'
      : coverActive ? ' <span class="cbt-cover-icon">🛡</span>'
      : guardingActive ? ' <span class="cbt-guarding-icon">⚔🛡</span>'
      : '';
    return `<div class="cbt-ally ${dead ? 'dead' : ''} ${a.au_sol ? 'au-sol' : ''} ${sel}" data-cbt-ally="${a.id}">
      <div class="cbt-a-name">${a.name}${wType}${statusBadge}</div>
      ${shieldBar}
      <div class="cbt-hp-bar"><div class="cbt-hp-fill ${hpCls}" style="width:${hpPct}%"></div></div>
      <div class="cbt-hp-txt">${a.au_sol ? '⚠ À terre' : `${a.hp}/${a.maxHp} PV`}</div>
      <div class="cbt-pa-row">${paDots}<span class="cbt-pa-lbl">${a.pa} PA</span></div>
    </div>`;
  }).join('');

  // Carte d'un ennemi
  const enemiesHTML = cbt.enemies.map((e, i) => {
    const dead = e.hp <= 0;
    const hpPct = Math.max(0, e.hp / e.maxHp * 100);
    const sel = _pendingCombatAction ? 'targetable' : '';
    const isCharging = e.effects?.some(ef => ef.type === 'en_charge');
    const isEnraged = (e.behavior === 'enrage' || e.behavior === 'charge_enrage') && e.hp <= e.maxHp * 0.3 && !dead;
    const chargeBadge = isCharging ? '<span class="cbt-charge-badge">⚡ CHARGE</span>' : '';
    const enrageBadge = isEnraged ? '<span class="cbt-enrage-badge">💢 ENRAGÉ</span>' : '';
    return `<div class="cbt-enemy ${dead ? 'dead' : ''} ${sel}" data-cbt-enemy="${i}">
      <div class="cbt-e-name">${e.nom}${chargeBadge}${enrageBadge}</div>
      <div class="cbt-hp-bar"><div class="cbt-hp-fill enemy" style="width:${hpPct}%"></div></div>
      <div class="cbt-hp-txt">${e.hp}/${e.maxHp} PV · armure ${e.armor}${e.counterChance > 0 ? ' · ↩' : ''}</div>
    </div>`;
  }).join('');

  // Journal (6 dernières lignes)
  const logHTML = cbt.log.slice(-7).map(l =>
    `<div class="cbt-log-line">${l}</div>`
  ).join('');

  // Actions pour l'allié sélectionné
  const ally = cbt.allies.find(a => a.id === cbt.selectedAllyId);
  const hasKit = ((exp.equipment?.nanobots_reparation || 0) + (exp.equipment?.kit_medical || 0)) > 0;
  const aoeItem = ['mine_eclats', 'grenade_concussion', 'grenade_iem'].find(id => (exp.equipment?.[id] || 0) > 0);
  const aoeLabel = aoeItem ? (ITEMS[aoeItem]?.nom || aoeItem) : null;
  const canHeal = ally && (ally.medecine > 0 || hasKit);
  const hasDowned = cbt.allies.some(a => a.au_sol);
  const hasOtherAlly = ally && cbt.allies.some(a => a.id !== ally?.id && a.hp > 0 && !a.au_sol);

  let actionsHTML = '';
  if (cbt.phase === 'ended') {
    const icon = cbt.outcome === 'victory' ? '🏆' : cbt.outcome === 'retreat' ? '↩' : '💀';
    const label = cbt.outcome === 'victory' ? 'Victoire !' : cbt.outcome === 'retreat' ? 'Retraite' : 'Défaite';
    actionsHTML = `<div class="cbt-ended">${icon} ${label}</div>`;
  } else if (!ally || ally.hp <= 0 || ally.au_sol) {
    actionsHTML = `<div class="cbt-hint">Sélectionne un colon actif pour agir.</div>`;
  } else {
    const attackLabel = ally.weaponType === 'ranged' || ally.weaponType === 'precision' ? 'Tirer' : 'Attaquer CAC';
    actionsHTML = `
      <div class="cbt-action-group">
        <button class="cbt-action" data-cbt-act="attack" ${ally.pa < 1 ? 'disabled' : ''} title="Attaque standard · 1 PA${ally.weaponType === 'melee' ? ' (peut déclencher contre-attaque)' : ''}">
          ${attackLabel} <span class="cbt-act-cost">1 PA</span>
        </button>
        <button class="cbt-action" data-cbt-act="precise" ${ally.pa < 2 ? 'disabled' : ''} title="+20% précision, +2 dégâts · 2 PA">
          Tir ciblé <span class="cbt-act-cost">2 PA</span>
        </button>
        <button class="cbt-action" data-cbt-act="cover" ${ally.pa < 1 ? 'disabled' : ''} title="+3 armure ce round · 1 PA">
          Couverture <span class="cbt-act-cost">1 PA</span>
        </button>
        ${hasOtherAlly ? `<button class="cbt-action cbt-garde" data-cbt-act="garde" ${ally.pa < 1 ? 'disabled' : ''} title="Protège l'allié le plus vulnérable ce round · 1 PA">
          Protéger <span class="cbt-act-cost">1 PA</span>
        </button>` : ''}
        ${canHeal ? `<button class="cbt-action" data-cbt-act="heal" ${ally.pa < 2 ? 'disabled' : ''} title="Soigne le plus blessé · 2 PA">
          Soigner <span class="cbt-act-cost">2 PA</span>
        </button>` : ''}
        ${hasDowned ? `<button class="cbt-action cbt-stabilise" data-cbt-act="stabilise" ${ally.pa < 1 ? 'disabled' : ''} title="Stabilise un colon à terre · 1 PA">
          Stabiliser <span class="cbt-act-cost">1 PA</span>
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
      <span class="cbt-title">⚔ Combat · Round ${cbt.round}</span>
      <span class="cbt-phase-lbl ${cbt.phase}">${
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
    if (confirm('Confirmer la retraite ? L\'équipe rentre immédiatement avec des pertes possibles.')) {
      combatAllyAction(expId, exp.combat.selectedAllyId || exp.combat.allies[0]?.id, 'retreat', -1);
      closeSceneOverlay();
    }
  });
}

function closeSceneOverlay() {
  _activeSceneExpId = null;
  $('#sceneOverlay').classList.remove('show');
  document.body.style.overflow = '';
  render();
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
    vesselName: vessel?.name,
    bodyName: body?.name,
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
      const has = exp.crewIds.some(id => S.crew.find(c => c.id === id)?.traits.includes(ch.req.trait));
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
      .map(x => `${SKILL_LABELS[x.s].slice(0,3)}${x.v}`)
      .join(' ') || '—';
    const traits = m.traits.slice(0, 2).map(t => TRAITS[t]?.nom || t).join(', ') || '—';
    const healthCls = m.sante < 40 ? 'warn' : '';
    return `<div class="scene-team-row ${dead ? 'dead' : ''}">
      <span>${m.name}</span>
      <span class="row-info">santé <span class="v ${healthCls}">${m.sante}%</span> · ${skillsTop} · ${traits}</span>
    </div>`;
  }).join('');

  // Loot accumulé
  const lootEntries = Object.entries(exp.accumulatedLoot);
  const lootHTML = lootEntries.length === 0 && exp.accumulatedItems.length === 0
    ? `<div class="scene-loot empty">Aucune cargaison récoltée pour l'instant.</div>`
    : `<div class="scene-loot">
        <div class="lloot">${lootEntries.map(([k,v]) => `<span>${RES_LABELS[k]} <b>+${v}</b></span>`).join('')}</div>
        ${exp.accumulatedItems.length > 0 ? `<div class="litems">Items : ${exp.accumulatedItems.map(i => itemDef(i)?.nom || i).join(', ')}</div>` : ''}
      </div>`;

  // Équipement embarqué encore disponible (0.15)
  let equipHTML = '';
  if (exp.equipment) {
    const equipList = Object.entries(exp.equipment).filter(([_, n]) => n > 0);
    if (equipList.length > 0) {
      const items = equipList.map(([id, n]) => {
        const itDef = ITEMS[id];
        const ori = ITEM_ORIGINS[itDef?.origin] || { color: 'var(--text-mute)' };
        return `<span style="color:${ori.color}">${itDef?.nom || id}${n > 1 ? ` ×${n}` : ''}</span>`;
      });
      equipHTML = `<div class="scene-equip"><span class="lbl">Équipement embarqué :</span> ${items.join(' · ')}</div>`;
    }
  }

  // Mini-journal (3 dernières entrées)
  const mjHTML = exp.accumulatedLog.length === 0 ? '' : `
    <div class="scene-mini-journal">
      ${exp.accumulatedLog.slice(-3).map(line => `<div class="mj-line">› ${line}</div>`).join('')}
    </div>
  `;

  $('#sceneInner').innerHTML = `
    <div class="scene-header">
      <div class="sh-loc">${sys?.name || '?'} › ${body?.name || '?'}</div>
      <div class="sh-title">${scene.id.replace(/_/g, ' ')}</div>
      <div class="sh-sub">${vessel?.name || '?'} · scène ${exp.sceneIdx + 1} / ${exp.scenes.length}</div>
      <div class="sh-progress">${dots}</div>
    </div>
    <div class="scene-body">${text}</div>
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
        if (confirm('Confirmer la retraite ? L\'équipe rentre immédiatement avec ce qu\'elle a déjà récupéré.')) {
          abandonExpedition(_activeSceneExpId);
          closeSceneOverlay();
        }
      }
    });
  });
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
      const def = VESSELS[v.type];
      const sel = v.id === _launchPick.vesselId ? 'selected' : '';
      return `<div class="tpicker-item ${sel}" data-pick-vessel="${v.id}">
        <div class="pi-name">${v.name}</div>
        <div class="pi-detail">${def.nom} · ${def.places} places · cargo ${def.cargo}</div>
      </div>`;
    }).join('')}</div>`;
  }

  // Liste équipage — 0.23 : enrichie avec poste, statut, ETA des indispos
  // Disponibles : statut 'libre' OU 'travail' (postes persistants — un colon en poste peut partir)
  const available = S.crew.filter(c => c.statut === 'libre' || c.statut === 'travail');
  // Indispos : tous les autres sauf 'mort'
  const unavailable = S.crew.filter(c => c.statut !== 'libre' && c.statut !== 'travail' && c.statut !== 'mort');
  const vessel = avail.find(v => v.id === _launchPick.vesselId);
  const placesMax = vessel ? VESSELS[vessel.type].places : 0;

  // Fonction helper : ETA approximative selon le statut
  function eta(c) {
    if (c.statut === 'expedition') {
      const exp = (S.expeditions || []).find(e => e.crewIds && e.crewIds.includes(c.id));
      if (exp) {
        const remaining = Math.max(0, (exp.totalMin || 0) - (exp.elapsedMin || 0));
        return remaining > 0 ? ` (${fmtMin(remaining)})` : '';
      }
      return '';
    }
    if (c.statut === 'formation') {
      const t = (S.training || []).find(t => t.memberId === c.id);
      if (t) {
        const remaining = Math.max(0, t.duration - (S.meta.gameMin - t.startedAt));
        return remaining > 0 ? ` (${fmtMin(remaining)})` : '';
      }
      return '';
    }
    if (c.statut === 'diplomatie') {
      const dip = (S.diplomaticMissions || []).find(d => d.memberId === c.id);
      if (dip) {
        const remaining = Math.max(0, dip.duration - (S.meta.gameMin - dip.startedAt));
        return remaining > 0 ? ` (${fmtMin(remaining)})` : '';
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
            .map(x => `${SKILL_LABELS[x.s].slice(0,3)} ${x.v}`)
            .join(' · ') || '—';
          return `<div class="crew-picker-item ${sel} ${dis}" data-pick-crew="${c.id}">
            <span class="checkbox"></span>
            <div class="pi-main">
              <div class="pi-name">${c.name}</div>
              ${postHTML}
              <div class="pi-detail">Santé ${c.sante}% · Moral ${c.moral}</div>
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
          return `<div class="crew-picker-item unavailable">
            <span class="checkbox dot">◌</span>
            <div class="pi-main">
              <div class="pi-name">${c.name}</div>
              <div class="pi-detail">${where}${eta(c)}${post ? ' · ' + post : ''}</div>
            </div>
          </div>`;
        }).join('')}</div>`;
    }
    crewHTML = availList + unavailList;
  }

  // Section équipement (0.15)
  let equipPickerHTML = '';
  if (vessel) {
    const def = VESSELS[vessel.type];
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
            <div class="er-detail">${typeLabel} · stock ${n - taken}/${n}</div>
          </div>
          <div class="er-controls">
            <button class="er-btn" data-equip-minus="${id}" ${taken === 0 ? 'disabled' : ''}>−</button>
            <span class="er-count">${taken}</span>
            <button class="er-btn" data-equip-plus="${id}" ${taken >= n || used >= slots ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
      }).join('');
      equipPickerHTML = `<div class="equip-picker">${itemsList}</div>`;
    }
  }
  const equipSlots = vessel ? (VESSELS[vessel.type].equipSlots || 0) : 0;
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
        <div class="row"><span class="lbl">Voyage aller</span><span class="val">${fmtMin(r.oneWayMin)}</span></div>
        <div class="row"><span class="lbl">Sur place</span><span class="val">${fmtMin(r.onSiteMin)}</span></div>
        <div class="row"><span class="lbl">Total</span><span class="val">${fmtMin(r.totalMin)}</span></div>
        <div class="row"><span class="lbl">Carburant</span><span class="val">${r.fuel} énergie</span></div>
        <div class="row"><span class="lbl">Vivres</span><span class="val">${r.bio} biomasse</span></div>
        <div class="row"><span class="lbl">Menace estimée</span><span class="val ${threat>=4?'warn':''}">${'●'.repeat(threat)}${'○'.repeat(5-threat)}</span></div>
        <div class="row"><span class="lbl">Récompense potentielle</span><span class="val ok">${'●'.repeat(reward)}${'○'.repeat(5-reward)}</span></div>
      </div>`;
    } else {
      estimateHTML = `<div class="estimate"><div class="ko">${r.why}</div></div>`;
    }
  }

  return `
    <h3>Lancer une expédition</h3>
    <p style="margin-bottom:6px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">Destination</p>
    <div class="estimate" style="margin-bottom:12px">
      <div style="font-family:var(--serif);font-style:italic;color:var(--text);font-size:15px">${body.name}</div>
      <div style="color:var(--text-mute);font-size:11px;margin-top:2px">${sys.name} · ${BIOMES[body.biome]?.nom || ''} · ${BODY_TYPES[body.type].nom}</div>
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
      const cap = VESSELS[vessel.type].places;
      while (_launchPick.crewIds.size > cap) {
        const last = Array.from(_launchPick.crewIds).pop();
        _launchPick.crewIds.delete(last);
      }
      m.innerHTML = renderLaunchModal();
      hookLaunchModal();
    });
  });
  m.querySelectorAll('[data-pick-crew]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const id = el.dataset.pickCrew;
      if (_launchPick.crewIds.has(id)) _launchPick.crewIds.delete(id);
      else _launchPick.crewIds.add(id);
      m.innerHTML = renderLaunchModal();
      hookLaunchModal();
    });
  });
  // Hooks +/- équipement
  m.querySelectorAll('[data-equip-plus]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.equipPlus;
      _launchPick.equipment[id] = (_launchPick.equipment[id] || 0) + 1;
      m.innerHTML = renderLaunchModal();
      hookLaunchModal();
    });
  });
  m.querySelectorAll('[data-equip-minus]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.equipMinus;
      if (!_launchPick.equipment[id]) return;
      _launchPick.equipment[id]--;
      if (_launchPick.equipment[id] <= 0) delete _launchPick.equipment[id];
      m.innerHTML = renderLaunchModal();
      hookLaunchModal();
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

// ---- Rendu personne (mutualisé entre équipage et candidat) ----
function renderPersonCard(p, opts = {}) {
  // opts: { isCandidate: bool, fresh: bool }
  const statsHTML = Object.entries(p.stats).map(([k,v]) => {
    const cls = v >= 8 ? 'high' : v <= 3 ? 'low' : '';
    return `<div class="stat ${cls}">
      <span class="lbl">${STAT_LABELS[k].slice(0,3).toUpperCase()}</span>
      <span class="v">${v}</span>
    </div>`;
  }).join('');

  const skillsHTML = SKILL_LIST.map(s => {
    const v = p.skills[s] || 0;
    const cls = v === 0 ? 'zero' : v >= 3 ? 'notable' : '';
    return `<div class="skill ${cls}">
      <span class="lbl">${SKILL_LABELS[s].slice(0,3)}</span>
      <span class="v">${v}</span>
    </div>`;
  }).join('');

  const traitsHTML = p.traits.map(tid => {
    const t = TRAITS[tid];
    if (!t) return '';
    return `<span class="trait-chip ${t.kind}" title="${t.desc.replace(/"/g,'&quot;')}">${t.nom}</span>`;
  }).join('');

  let actionsHTML = '';
  if (opts.isCandidate) {
    const cap = crewUsage();
    const full = cap.used >= cap.total;
    actionsHTML = `<div class="actions-row">
      <button class="refuse" data-action="refuse" data-id="${p.id}">Écarter</button>
      <button class="accept" data-action="accept" data-id="${p.id}" ${full ? 'disabled' : ''}>
        ${full ? 'Habitat plein' : 'Engager'}
      </button>
    </div>`;
  } else {
    // Indicateurs supplémentaires : statuts médicaux actifs et séquelles
    const sCount = (p.statuts || []).length;
    const seqCount = (p.sequels || []).length;
    let medInfo = '';
    if (sCount > 0 || seqCount > 0) {
      const parts = [];
      if (sCount > 0) parts.push(`<span style="color:var(--rust)">⚠ ${sCount} statut${sCount>1?'s':''} actif${sCount>1?'s':''}</span>`);
      if (seqCount > 0) parts.push(`<span style="color:#d4998a">▲ ${seqCount} séquelle${seqCount>1?'s':''}</span>`);
      medInfo = `<div style="font-family:var(--mono);font-size:11px;margin-bottom:6px;letter-spacing:0.04em;">${parts.join(' · ')}</div>`;
    }
    // Indicateur santé selon âge (cap diminué)
    const healthCap = maxHealthOf(p);
    const healthDisplay = healthCap < 100 ? `${p.sante}%/${healthCap}%` : `${p.sante}%`;
    // Affiche le poste de base persistant + ancienneté + historique carrière
    let postInfo = '';
    const a = memberAssignment(p.id);
    if (a) {
      const def = MODULES[a.modKey];
      const job = jobsForModule(a.modKey)[a.slotIdx];
      if (def && job) {
        const role = ROLES[job.role];
        const ab = ancienneteBonus(p);
        const dureeDays = p.posteInfo ? Math.floor(((S.meta?.gameMin || 0) - (p.posteInfo.depuis || 0)) / (24*60)) : 0;
        const ancBadge = ab.label
          ? ` <span class="career-badge cb-${ab.label.toLowerCase()}">${ab.label} +${Math.round((ab.mult-1)*100)}%</span>`
          : (dureeDays > 0 ? ` <span style="opacity:0.55;font-size:10px">Dep. J.${dureeDays}</span>` : '');
        postInfo = `<div class="crew-post-line">
          Poste : <span style="color:${role.color}">${job.label}</span> · ${def.nom}${ancBadge}
        </div>`;
        if (p.posteHistorique?.length) {
          postInfo += `<div class="crew-career-hist">${p.posteHistorique.length} poste${p.posteHistorique.length>1?'s':''} précédent${p.posteHistorique.length>1?'s':''}</div>`;
        }
      }
    }
    // Couple & grossesse
    let familyHTML = '';
    if (p.partnerId) {
      const partner = S.crew.find(c => c.id === p.partnerId);
      if (partner && partner.statut !== 'mort') {
        familyHTML += `<div class="family-line">♥ <span class="partner-name">${partner.name}</span></div>`;
      }
    }
    if (p.grossesse) {
      const elapsed = (S.meta?.gameMin || 0) - (p.grossesse.debut || 0);
      const pct = Math.min(100, Math.round((elapsed / PREGNANCY_DURATION_MIN) * 100));
      const daysLeft = Math.max(0, Math.round((PREGNANCY_DURATION_MIN - elapsed) / (24 * 60)));
      familyHTML += `<div class="pregnancy-wrap">
        <div class="pregnancy-bar"><div class="pregnancy-fill" style="width:${pct}%"></div></div>
        <div class="pregnancy-lbl">Grossesse · ${pct}% — encore ~${daysLeft} j</div>
      </div>`;
    }
    actionsHTML = `${postInfo}${familyHTML}${medInfo}<div class="actions-row">
      <span class="status-tag ${p.statut}">${p.statut}</span>
      <span style="flex:1; text-align:right; font-family:var(--mono); font-size:11px; color:var(--text-mute);">
        Santé ${healthDisplay} · Moral ${p.moral} · Loy ${p.loyaute}
      </span>
    </div>`;
  }

  // Bloc relations (uniquement pour les colons actifs, pas les candidats)
  let relationsHTML = '';
  if (!opts.isCandidate && S.crew && S.crew.length > 1) {
    const { friends, rivals } = significantRelations(p.id);
    if (friends.length > 0 || rivals.length > 0) {
      const friendChips = friends.map(({ member, affinity }) => {
        const t = relationType(affinity);
        return `<span class="rel-chip" style="color:${t.color}" title="${t.label} · affinité ${Math.round(affinity)}">${member.name}</span>`;
      }).join('');
      const rivalChips = rivals.map(({ member, affinity }) => {
        const t = relationType(affinity);
        return `<span class="rel-chip" style="color:${t.color}" title="${t.label} · affinité ${Math.round(affinity)}">${member.name}</span>`;
      }).join('');
      const parts = [];
      if (friends.length > 0) parts.push(`<div class="rel-line"><span class="rel-lbl">Liens :</span> ${friendChips}</div>`);
      if (rivals.length > 0) parts.push(`<div class="rel-line"><span class="rel-lbl">Tensions :</span> ${rivalChips}</div>`);
      relationsHTML = `<div class="rel-block">${parts.join('')}</div>`;
    }
  }

  const freshClass = opts.fresh ? ' fresh' : '';
  const candClass = opts.isCandidate ? ' candidate' : '';
  // Âge affiché : dynamique pour les colons actifs, statique pour candidats
  const displayAge = opts.isCandidate ? p.age : currentAge(p);
  return `<div class="person${candClass}${freshClass}" data-id="${p.id}">
    <div class="head-row">
      <div class="pname">${p.name}</div>
      <div class="pmeta">${displayAge} ans</div>
    </div>
    <div class="origin">${p.origin.label}<small>${p.origin.notes}</small></div>
    <div class="stats-row">${statsHTML}</div>
    <div class="skills-row">${skillsHTML}</div>
    ${traitsHTML ? `<div class="traits">${traitsHTML}</div>` : ''}
    ${relationsHTML}
    ${opts.isCandidate ? `<div class="salary">Prétention : <b>${p.salary} biomasse / cycle</b></div>` : ''}
    ${actionsHTML}
  </div>`;
}

function renderCrewSummary() {
  // Affiché dans la vue d'ensemble
  let host = $('#crewSummary');
  if (!host) {
    // injecte la carte juste avant le buildSlot dans la vue overview
    const buildSlot = $('#buildSlot');
    const eyebrow = buildSlot.previousElementSibling;
    const card = document.createElement('div');
    card.id = 'crewSummary';
    card.className = 'crew-summary';
    eyebrow.parentNode.insertBefore(card, eyebrow);
    host = card;
  }
  const cap = crewUsage();
  const cls = (cap.total > 0 && cap.used >= cap.total) ? 'warn' : '';
  const candCount = S.candidates.length;
  host.innerHTML = `
    <div>
      <div class="lbl">Équipage</div>
      <div class="v ${cls}">${cap.used} / ${cap.total || '—'}</div>
    </div>
    <div style="text-align:right;">
      <div class="lbl">Candidats en attente</div>
      <div class="v" style="color:${candCount > 0 ? 'var(--amber)' : 'var(--text-mute)'}">${candCount}</div>
    </div>
  `;
}

function renderChildCard(child) {
  const age = currentAge(child);
  const p1 = child.parentIds ? S.crew.find(m => m.id === child.parentIds[0]) : null;
  const p2 = child.parentIds ? S.crew.find(m => m.id === child.parentIds[1]) : null;
  const parentsStr = [p1?.name, p2?.name].filter(Boolean).join(' & ');
  const yearsToAdult = Math.max(0, ADULT_AGE - age);
  const growthPct = Math.min(100, Math.round((age / ADULT_AGE) * 100));
  const topSkills = SKILL_LIST
    .filter(s => (child.skills[s] || 0) > 0)
    .map(s => `${SKILL_LABELS[s].slice(0, 4)} ${child.skills[s]}`)
    .join(' · ') || 'aptitudes en développement';
  const traits = (child.traits || []).slice(0, 2).map(t => TRAITS[t]?.nom || t).join(', ');
  return `<div class="person child-card">
    <div class="head-row">
      <div class="pname">${child.name} <span class="child-tag">enfant</span></div>
      <div class="pmeta">${age} an${age !== 1 ? 's' : ''}</div>
    </div>
    ${parentsStr ? `<div class="origin">Enfant de <small>${parentsStr}</small></div>` : ''}
    <div class="child-growth">
      <div class="child-growth-bar"><div class="child-growth-fill" style="width:${growthPct}%"></div></div>
      <div class="child-growth-lbl">Majorité dans ${yearsToAdult > 0 ? `${yearsToAdult} an${yearsToAdult > 1 ? 's' : ''}` : 'très bientôt…'}</div>
    </div>
    <div class="child-skills">${topSkills}${traits ? ` · ${traits}` : ''}</div>
  </div>`;
}

function renderCrew() {
  const list = $('#crewList');
  const sub = $('#crewSub');
  const cap = crewUsage();
  const children = S.crew.filter(m => m.statut === 'enfant');
  const alive = aliveCrew().filter(m => m.statut !== 'enfant');
  const dead = S.crew.filter(m => m.statut === 'mort');

  const couplesCount = alive.filter(m => m.partnerId).length / 2;
  const pregCount = alive.filter(m => m.grossesse).length;
  let subParts = [];
  if (cap.total > 0) subParts.push(`${cap.used} / ${cap.total} place(s)`);
  if (couplesCount >= 1) subParts.push(`${Math.floor(couplesCount)} couple${couplesCount >= 2 ? 's' : ''}`);
  if (pregCount > 0) subParts.push(`${pregCount} grossesse${pregCount > 1 ? 's' : ''}`);
  if (children.length > 0) subParts.push(`${children.length} enfant${children.length > 1 ? 's' : ''}`);

  if (cap.total === 0) {
    sub.innerHTML = "Construis un <em>Habitat</em> pour pouvoir loger un équipage.";
  } else {
    sub.innerHTML = subParts.join(' · ');
  }

  let html = '';
  if (alive.length === 0 && children.length === 0) {
    html = '<div class="empty">Aucun membre actif. Recrute via la Balise.</div>';
  } else {
    html = alive.map(p => renderPersonCard(p)).join('');
  }

  // Section enfants
  if (children.length > 0) {
    html += `<h3 class="section-h">Jeunes générations (${children.length})</h3>`;
    html += children.map(c => renderChildCard(c)).join('');
  }

  // Section "In memoriam" pour les défunts (préservée pour la mémoire de la colonie)
  if (dead.length > 0) {
    html += `<h3 class="section-h">In memoriam (${dead.length})</h3>`;
    html += dead.map(p => {
      const traits = (p.traits || []).slice(0, 2).map(t => TRAITS[t]?.nom || t).join(', ') || '—';
      const d = Math.floor((p.diedAt || S.meta.gameMin) / (24*60)) + 1;
      return `<div class="person dead-row">
        <div class="head-row">
          <div class="pname">${p.name}</div>
          <div class="pmeta">décédé(e) J${d}</div>
        </div>
        <div class="origin">${p.origin?.label || ''}<small>${traits} · ${p.age} ans</small></div>
      </div>`;
    }).join('');
  }

  list.innerHTML = html;
}

// ---- Rendu Formation ----
function renderFormation() {
  const subtab = $('#subtab-formation');
  const sub = $('#formationSub');
  const status = $('#formationStatus');
  const list = $('#formationList');
  const btn = $('#btnNewTraining');

  const center = S.modules.formation;
  const hasCenter = !!center;
  if (subtab) subtab.disabled = !hasCenter;

  if (!hasCenter) {
    sub.innerHTML = "Construis un <em>Centre de formation</em> pour entraîner ton équipage.";
    status.innerHTML = '';
    list.innerHTML = '<div class="empty">Aucun centre actif.</div>';
    btn.style.display = 'none';
    return;
  }

  const lvl = center.level;
  const cap = lvl;
  const inUse = S.training.length;
  const skillCap = lvl + 1;

  sub.innerHTML = `Centre niv ${lvl} · plafond skill enseignable : <em>${skillCap}</em>`;

  // Encart staff de la formation
  const fb = formationBonuses();
  const fBonusParts = [];
  if (fb.speedMult < 1) fBonusParts.push(`Formations <b>${Math.round((1 - fb.speedMult) * 100)}% plus rapides</b>`);
  if (fb.failChanceDelta < 0) fBonusParts.push(`Risque d'échec <b>${Math.round(-fb.failChanceDelta * 100)}%</b> en moins`);
  const fBonusText = fBonusParts.length > 0
    ? fBonusParts.join(' · ')
    : `<span class="none">Aucun bonus actif. Affecte un Pédagogue ou un Assistant pour améliorer.</span>`;
  const formStaffHTML = renderStaffPanel('formation', { title: 'Équipe pédagogique', bonusText: fBonusText });

  status.innerHTML = formStaffHTML + `<div class="formation-status">
    Places : <b>${inUse}/${cap}</b> · Membres libres : <b>${S.crew.filter(m => m.statut === 'libre').length}</b>
  </div>`;

  // Sessions en cours
  if (S.training.length === 0) {
    list.innerHTML = '<div class="empty">Aucune formation en cours.</div>';
  } else {
    list.innerHTML = S.training.map(t => {
      const member = S.crew.find(m => m.id === t.memberId);
      if (!member) return '';
      const pct = Math.min(100, (t.doneMin / t.totalMin) * 100);
      const remaining = t.totalMin - t.doneMin;
      const cur = member.skills[t.skill] || 0;
      const instr = t.instructorId ? S.crew.find(m => m.id === t.instructorId) : null;
      const failPct = (t.failChance * 100).toFixed(0);
      return `<div class="training-card" data-id="${t.id}">
        <div class="tcard-head">
          <div class="tname">${member.name}</div>
          <div class="tlevel">${TRAINING_PROGRAMS[t.skill].nom.toUpperCase()} · ${cur}→${t.targetLvl}</div>
        </div>
        <div class="tprog">
          <div class="bar" style="width:${pct}%"></div>
          <div class="lbl">${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
        </div>
        <div class="tmeta">
          ${instr ? `<span class="instr">Instructeur : ${instr.name}</span>` : '<span>Auto-formation</span>'}
          <span class="risk">Risque échec : ${failPct}%</span>
        </div>
        <button class="cancel" data-cancel="${t.id}">Interrompre (rembours. 50%)</button>
      </div>`;
    }).join('');

    list.querySelectorAll('button[data-cancel]').forEach(b => {
      b.addEventListener('click', () => cancelTraining(b.dataset.cancel));
    });
  }

  // Bouton "Lancer une formation"
  const placesAvail = cap - inUse;
  const freeCrew = S.crew.filter(m => m.statut === 'libre').length;
  btn.style.display = 'block';
  btn.disabled = placesAvail <= 0 || freeCrew === 0;
  btn.textContent = placesAvail <= 0
    ? `Toutes les places occupées (${cap}/${cap})`
    : freeCrew === 0
      ? 'Aucun membre libre'
      : 'Lancer une formation';
  hookStaffLinks($('#subview-formation'));
}

// État éphémère du sélecteur de formation
let _trainPick = { memberId: null, skill: null };

export function showTrainingModal() {
  _trainPick = { memberId: null, skill: null };
  const bg = $('#modalBg');
  const m = $('#modal');
  m.classList.add('training-modal');
  m.innerHTML = renderTrainingModalContent();
  bg.classList.add('show');
  hookTrainingModal();
}

function renderTrainingModalContent() {
  const freeCrew = S.crew.filter(c => c.statut === 'libre');
  const memberOptions = freeCrew.map(c => {
    const sel = c.id === _trainPick.memberId ? 'selected' : '';
    const traits = c.traits.map(traitNom).join(', ') || '—';
    return `<div class="tpicker-item ${sel}" data-pick-member="${c.id}">
      <div class="pi-name">${c.name}</div>
      <div class="pi-detail">Traits : ${traits}</div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:18px">Aucun membre libre.</div>';

  // Skill list — désactiver ceux qui ne peuvent pas
  const member = freeCrew.find(c => c.id === _trainPick.memberId);
  const skillOptions = SKILL_LIST.map(s => {
    const cur = member ? (member.skills[s] || 0) : 0;
    const target = member ? trainingTargetLevel(member, s) : null;
    const sel = s === _trainPick.skill ? 'selected' : '';
    const dis = !member || target === null ? 'disabled' : '';
    let detail = '';
    if (member) {
      if (target === null) {
        if (cur >= 5) detail = `Niv ${cur} · max atteint`;
        else detail = `Niv ${cur} · centre trop bas`;
      } else {
        detail = `Niv ${cur} → ${target}`;
      }
    } else {
      detail = "Choisis d'abord un colon";
    }
    return `<div class="tpicker-item ${sel} ${dis}" data-pick-skill="${s}">
      <div class="pi-name">${TRAINING_PROGRAMS[s].nom}</div>
      <div class="pi-detail">${detail}</div>
    </div>`;
  }).join('');

  // Estimation si tout est sélectionné
  let estimateHTML = '';
  let canLaunch = false;
  if (_trainPick.memberId && _trainPick.skill) {
    const r = canTrain(_trainPick.memberId, _trainPick.skill);
    if (r.ok) {
      canLaunch = true;
      const costStr = Object.entries(r.cost).map(([k,v]) => `${RES_LABELS[k]} ${v}`).join(' · ');
      estimateHTML = `<div class="estimate">
        <div class="row"><span class="lbl">Niveau cible</span><span class="val">${r.target}</span></div>
        <div class="row"><span class="lbl">Durée</span><span class="val">${fmtMin(r.duration)}</span></div>
        <div class="row"><span class="lbl">Coût</span><span class="val">${costStr}</span></div>
        <div class="row"><span class="lbl">Instructeur</span><span class="val">${r.instructor ? r.instructor.name : '—'}</span></div>
        <div class="row"><span class="lbl">Risque d'échec</span><span class="val ${r.failChance>0.1?'warn':'ok'}">${(r.failChance*100).toFixed(0)}%</span></div>
      </div>`;
    } else {
      estimateHTML = `<div class="estimate"><div class="ko">${r.reason}</div></div>`;
    }
  }

  return `
    <h3>Nouvelle formation</h3>
    <p style="margin-bottom:8px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">1. Colon</p>
    <div class="tpicker">${memberOptions}</div>
    <p style="margin-bottom:8px;font-family:var(--mono);font-size:11px;color:var(--text-mute);letter-spacing:0.06em;text-transform:uppercase">2. Programme</p>
    <div class="tpicker">${skillOptions}</div>
    ${estimateHTML}
    <div class="btn-row">
      <button id="trainCancel">Annuler</button>
      <button class="primary" id="trainLaunch" ${canLaunch ? '' : 'disabled'}>Lancer</button>
    </div>
  `;
}

function hookTrainingModal() {
  const m = $('#modal');
  m.querySelectorAll('[data-pick-member]').forEach(el => {
    el.addEventListener('click', () => {
      _trainPick.memberId = el.dataset.pickMember;
      // Re-vérifier que le skill choisi est encore valide
      if (_trainPick.skill) {
        const member = S.crew.find(c => c.id === _trainPick.memberId);
        if (member && trainingTargetLevel(member, _trainPick.skill) === null) {
          _trainPick.skill = null;
        }
      }
      m.innerHTML = renderTrainingModalContent();
      hookTrainingModal();
    });
  });
  m.querySelectorAll('[data-pick-skill]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      _trainPick.skill = el.dataset.pickSkill;
      m.innerHTML = renderTrainingModalContent();
      hookTrainingModal();
    });
  });
  $('#trainCancel')?.addEventListener('click', () => {
    $('#modalBg').classList.remove('show');
    m.classList.remove('training-modal');
  });
  $('#trainLaunch')?.addEventListener('click', () => {
    if (_trainPick.memberId && _trainPick.skill) {
      startTraining(_trainPick.memberId, _trainPick.skill);
      $('#modalBg').classList.remove('show');
      m.classList.remove('training-modal');
    }
  });
}

// ---- Rendu Soins (Infirmerie) ----
function renderSoins() {
  const subtab = $('#subtab-soins');
  const sub = $('#soinsSub');
  const status = $('#soinsStatus');
  const alert = $('#soinsAlert');
  const patients = $('#soinsPatients');
  const attention = $('#soinsAttention');

  const inf = S.modules.infirmerie;
  const hasInf = !!inf;
  if (subtab) subtab.disabled = !hasInf;

  if (!hasInf) {
    sub.innerHTML = "Construis une <em>Infirmerie</em> pour soigner ton équipage.";
    status.innerHTML = '';
    alert.innerHTML = '';
    patients.innerHTML = '<div class="empty">Aucun établissement médical.</div>';
    attention.innerHTML = '';
    return;
  }

  const beds = infirmaryBeds();
  const used = bedsInUse();
  const lvl = inf.level;
  const doctor = bestAvailableDoctor();
  const docInfo = doctor
    ? `<b>${doctor.name}</b> (Méd ${doctor.skills.medecine})`
    : `<span style="color:var(--rust)">aucun médecin disponible</span>`;
  sub.innerHTML = `Infirmerie niv ${lvl} · paliers diag/traitement jusqu'à ${lvl}`;

  // Encart staff de l'infirmerie + bonus actuels
  const ib = infirmaryBonuses();
  const bonusParts = [];
  if (ib.speedMult < 1) bonusParts.push(`Soins <b>${Math.round((1 - ib.speedMult) * 100)}% plus rapides</b>`);
  if (ib.diagBonus > 0) bonusParts.push(`Diagnostic <b>+${ib.diagBonus}</b>`);
  if (ib.traitMedecinNe) bonusParts.push(`Trait <b>Médecin né</b> dans l'équipe`);
  const bonusText = bonusParts.length > 0
    ? bonusParts.join(' · ')
    : `<span class="none">Aucun bonus actif. Affecte du personnel pour améliorer les soins.</span>`;
  const staffHTML = renderStaffPanel('infirmerie', { title: 'Équipe médicale', bonusText });

  status.innerHTML = staffHTML + `<div class="soins-status ${used >= beds ? 'full' : ''}">
    Lits : <b>${used}/${beds}</b> · Médecin : ${docInfo}
  </div>`;

  // Alerte triage si lits pleins ET au moins un membre nécessite admission
  const needAdmission = S.crew.filter(m => m.statut === 'libre' && (m.statuts || []).some(s => {
    const def = STATUTS[s.key];
    return def && (def.severity >= 3 || def.untreated?.become === 'mort');
  }));
  if (used >= beds && needAdmission.length > 0) {
    alert.innerHTML = `<div class="soins-alert">
      <b>Triage requis.</b> ${needAdmission.length} colon(s) en attente de soins critiques.
      Sortez un patient ou agrandissez l'infirmerie.
    </div>`;
  } else {
    alert.innerHTML = '';
  }

  // ---- Patients admis ----
  const admitted = S.crew.filter(m => m.statut === 'infirmerie');
  if (admitted.length === 0) {
    patients.innerHTML = '<div class="empty">Aucun patient admis.</div>';
  } else {
    patients.innerHTML = admitted.map(m => renderPatientCard(m, true)).join('');
  }

  // ---- Membres nécessitant attention (statuts non admis) ----
  const needAttention = S.crew.filter(m =>
    m.statut !== 'infirmerie' &&
    m.statut !== 'mort' &&
    ((m.statuts || []).length > 0 || (m.sequels || []).length > 0)
  );
  if (needAttention.length === 0) {
    attention.innerHTML = '<div class="empty">Personne ne requiert de soin actif.</div>';
  } else {
    attention.innerHTML = needAttention.map(m => renderPatientCard(m, false)).join('');
  }

  // Hook tous les boutons d'action du sous-panneau Soins
  $('#subview-soins').querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      const mid = btn.dataset.mid;
      const sIdx = btn.dataset.s !== undefined ? parseInt(btn.dataset.s, 10) : null;
      if (act === 'admit')          admitToInfirmary(mid);
      else if (act === 'discharge') dischargeMember(mid);
      else if (act === 'diagnose')  startDiagnostic(mid, sIdx);
      else if (act === 'treat')     startTreatment(mid, sIdx);
    });
  });
  hookStaffLinks($('#subview-soins'));
}

function renderPatientCard(member, admitted) {
  const healthCls = member.sante < 40 ? 'low' : '';
  const beds = infirmaryBeds();
  const used = bedsInUse();
  const canAdmit = used < beds;

  let statutsHTML = '';
  if (member.statuts.length === 0) {
    statutsHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--text-mute);padding:6px 0;">Aucun statut actif.</div>';
  } else {
    statutsHTML = member.statuts.map((s, idx) => renderStatusRow(member, s, idx, admitted)).join('');
  }

  let sequelsHTML = '';
  if (member.sequels.length > 0) {
    sequelsHTML = `<div class="sequels-list">${
      member.sequels.map(sq => {
        const def = SEQUELS[sq.key];
        return def ? `<span class="sequel-chip" title="${def.desc.replace(/"/g,'&quot;')}">${def.nom}</span>` : '';
      }).join('')
    }</div>`;
  }

  let patientActions = '';
  if (admitted) {
    patientActions = `<div class="patient-actions">
      <button class="discharge" data-act="discharge" data-mid="${member.id}">Faire sortir</button>
    </div>`;
  } else if (member.statuts.length > 0 && member.statut === 'libre') {
    patientActions = `<div class="patient-actions">
      <button class="admit" data-act="admit" data-mid="${member.id}" ${canAdmit ? '' : 'disabled'}>
        ${canAdmit ? "Admettre à l'infirmerie" : 'Lits pleins'}
      </button>
    </div>`;
  } else if (member.statut !== 'libre' && member.statuts.length > 0) {
    patientActions = `<div class="patient-actions">
      <button disabled>Indisponible (${member.statut})</button>
    </div>`;
  }

  return `<div class="patient-card ${admitted ? '' : 'libre'}">
    <div class="pcard-head">
      <div class="pname">${member.name}</div>
      <div class="health-bar">Santé <span class="v ${healthCls}">${member.sante}%</span> · Moral ${member.moral}</div>
    </div>
    ${statutsHTML}
    ${sequelsHTML}
    ${patientActions}
  </div>`;
}

function renderStatusRow(member, status, idx, admitted) {
  const def = STATUTS[status.key];
  const elapsed = S.meta.gameMin - status.since;
  const treatment = S.treatments.find(t => t.memberId === member.id && t.statusIdx === idx);

  const isUnknown = !status.diagnosed;
  const displayName = isUnknown ? "Anomalie suspecte" : def.nom;
  const displayShort = isUnknown
    ? "Le patient présente des symptômes inexpliqués. Diagnostic requis."
    : def.short;

  // Compteur de complication si applicable
  let countdownHTML = '';
  if (def.untreated && def.untreated.afterMin > 0 && status.diagnosed && !treatment) {
    const remaining = def.untreated.afterMin - elapsed;
    if (remaining > 0) {
      const what = def.untreated.become;
      const label = what === 'mort' ? 'décès dans' : what === 'mutinerie' ? 'mutinerie dans' : `complication dans`;
      countdownHTML = `<span class="countdown">${label} ${fmtMin(remaining)}</span>`;
    }
  } else if (def.untreated && def.untreated.selfCure && !treatment) {
    const remaining = def.untreated.afterMin - elapsed;
    if (remaining > 0) {
      countdownHTML = `<span class="ok">guérison naturelle dans ${fmtMin(remaining)}</span>`;
    }
  }

  // Barre de traitement
  let treatmentHTML = '';
  if (treatment) {
    const pct = Math.min(100, (treatment.doneMin / treatment.totalMin) * 100);
    const remaining = treatment.totalMin - treatment.doneMin;
    treatmentHTML = `<div class="treatment-progress">
      <div class="bar" style="width:${pct}%"></div>
      <div class="lbl">Traitement · ${pct.toFixed(0)}% · reste ${fmtMin(remaining)}</div>
    </div>`;
  }

  // Actions sur le statut (uniquement si admis)
  let actionsHTML = '';
  if (admitted && !treatment) {
    if (isUnknown) {
      // Bouton diagnostic
      const det = def.detect;
      const labOk = !det.needLab || S.flags.recherche;
      const docOk = bestAvailableDoctor();
      const cost = det.needLab ? '2 datacubes' : 'gratuit';
      let tooltip = `Diag (${cost})`;
      let dis = '';
      if (!labOk) { dis = 'disabled'; tooltip = 'Labo requis'; }
      else if (!docOk) { dis = 'disabled'; tooltip = 'Aucun médecin'; }
      actionsHTML = `<div class="statut-actions">
        <button class="diagnose" data-act="diagnose" data-mid="${member.id}" data-s="${idx}" ${dis}>${tooltip}</button>
      </div>`;
    } else {
      // Bouton traitement
      const r = canTreat(member.id, idx);
      const tdef = TREATMENTS[status.key]?.[0];
      const costStr = tdef ? Object.entries(tdef.cost).map(([k,v]) => `${RES_LABELS[k]} ${v}`).join(' · ') : '';
      let label = r.ok ? `Traiter (${costStr})` : r.reason;
      actionsHTML = `<div class="statut-actions">
        <button class="treat" data-act="treat" data-mid="${member.id}" data-s="${idx}" ${r.ok ? '' : 'disabled'}>${label}</button>
      </div>`;
    }
  } else if (!admitted && !isUnknown) {
    // Hint
    actionsHTML = `<div class="statut-actions">
      <button disabled>Admission requise pour traitement</button>
    </div>`;
  }

  return `<div class="statut-row ${isUnknown ? 'hidden-status' : ''}">
    <div class="srow-head">
      <div class="sname ${isUnknown ? 'unknown' : ''}">${displayName}</div>
      <div class="skind ${def.kind}">${def.kind}</div>
    </div>
    <div class="sshort">${displayShort}</div>
    <div class="smeta">Apparu il y a ${fmtMin(elapsed)} ${countdownHTML ? '· ' + countdownHTML : ''}</div>
    ${treatmentHTML}
    ${actionsHTML}
  </div>`;
}

function renderRecruit() {
  const list = $('#candidateList');
  const sub = $('#recruitSub');
  const recBadge = $('#recruitBadge');
  const crewBadge = $('#crewBadge');
  const hasBalise = !!(S.modules.balise_recrutement);

  // Badge sur le sous-onglet recrut. ET sur l'onglet principal Équipage
  const n = S.candidates.length;
  for (const b of [recBadge, crewBadge]) {
    if (!b) continue;
    if (n > 0) { b.textContent = n; b.classList.add('show'); }
    else b.classList.remove('show');
  }

  if (!hasBalise) {
    sub.innerHTML = "Construis une <em>Balise de recrutement</em> pour recevoir des candidats.";
    list.innerHTML = '<div class="empty">Silence radio.</div>';
    return;
  }

  const lvl = S.modules.balise_recrutement.level;
  const intervalH = Math.round(24/lvl);
  const cap = crewUsage();
  const nextIn = Math.max(0, S.nextRecruitMin - S.meta.gameMin);
  sub.innerHTML = `Balise niv ${lvl} · ~1 candidat / ${intervalH}h jeu · prochain dans ${fmtMin(nextIn)} · habitat ${cap.used}/${cap.total}`;

  if (S.candidates.length === 0) {
    list.innerHTML = '<div class="empty">Aucun candidat pour le moment.</div>';
    return;
  }
  list.innerHTML = S.candidates.map((c, i) =>
    renderPersonCard(c, { isCandidate: true, fresh: i === S.candidates.length - 1 })
  ).join('');

  // Hook les boutons accepter/refuser
  list.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'accept') acceptCandidate(id);
      else refuseCandidate(id);
    });
  });
}

// Onglets
$$('nav.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('nav.tabs button').forEach(b => b.classList.remove('active'));
    $$('section.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    $('#view-' + btn.dataset.tab).classList.add('active');
  });
});

// Sous-onglets (à l'intérieur de l'onglet Équipage)
$$('nav.subtabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const parent = btn.closest('section.view');
    parent.querySelectorAll('nav.subtabs button').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.subview').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    // Compatible avec data-subtab (équipage), data-subtab-galaxy (galaxie), data-subtab-mod (modules), data-subtab-stocks (stocks)
    const key = btn.dataset.subtab || btn.dataset.subtabGalaxy || btn.dataset.subtabMod || btn.dataset.subtabStocks;
    parent.querySelector('#subview-' + key).classList.add('active');
  });
});

// ============================================================
// 9. PERSIST — save / load / export / import
// ============================================================


// ============================================================
// Helpers UI : toast, modal, log
// ============================================================

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function showModal({ title, body, primaryLabel='OK', primaryClass='primary', onPrimary, withInput=false, inputValue='', inputPlaceholder='', hideCancel=false, bodyIsHTML=false }) {
  const bg = $('#modalBg');
  const m = $('#modal');
  const bodyHTML = bodyIsHTML ? `<div class="modal-body">${body}</div>` : `<p>${body}</p>`;
  m.innerHTML = `
    <h3>${title}</h3>
    ${bodyHTML}
    ${withInput ? `<input type="text" id="modalInput" value="${inputValue.replace(/"/g,'&quot;')}" placeholder="${inputPlaceholder}">` : ''}
    <div class="btn-row">
      ${hideCancel ? '' : `<button id="modalCancel">Annuler</button>`}
      <button class="${primaryClass}" id="modalOk">${primaryLabel}</button>
    </div>
  `;
  bg.classList.add('show');
  const close = () => bg.classList.remove('show');
  if (!hideCancel) $('#modalCancel').addEventListener('click', close);
  $('#modalOk').addEventListener('click', () => {
    const v = withInput ? $('#modalInput').value : null;
    close();
    onPrimary?.(v);
  });
  if (withInput) setTimeout(() => $('#modalInput').focus(), 50);
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
    log('neutral', `Cartographie locale : nous sommes dans le système <em>${homeSys.name}</em>. Une <em>Antenne longue portée</em> permettra de scanner les voisins.`);
  }
}

