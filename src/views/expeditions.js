// views/expeditions.js — onglet « Expéditions » : missions en cours (et
// celles qui attendent une décision), carte de la galaxie, vaisseaux,
// diplomatie.

import { $ } from '../util.js';
import { RES_LABELS, SKILL_LABELS, BUILD_TIME_MULT, PACING } from '../constants.js';
import { VESSELS, BIOMES, ATMOSPHERES, SIGNAUX, RUINES, DANGERS } from '../catalog.js';
import { FACTION_TYPES } from '../data-arcs-factions.js';
import {
  S, aliveCrew, describeBody, bodyThreatLevel, bodyRewardLevel, BODY_TYPES, GRAVITES, VIES,
} from '../state.js';
import {
  staffRoleCount, hangarBonuses, canBuildVessel, startVesselBuild, fleetCapacity,
  factionStatus, toggleFactionTrade, launchDiplomaticMission, offerGift,
  tradeRequirement, allianceRequirement,
  sceneStep, unreadReports, expeditionEstimate,
} from '../app.js';
import {
  esc, fmtDuree, setHTML, progressHTML, emptyState, nomOf, vesselDef, dayOf, plur,
} from './common.js';
import { render, toast, showLaunchModal, openSceneOverlay, showExpeditionReport } from '../ui.js';
import { renderStaffPanel } from './equipage.js';
import { expeditionPhase, chroniclesList } from './base.js';

// ============================================================
//   MISSIONS (expéditions en cours et historique)
// ============================================================
const isChronExp = exp => !!exp.chronicleSceneId || exp.scenes?.[0] === '__chron_intro__';
const colonsDispo = () => (S.crew || []).filter(c => c.statut === 'libre' || c.statut === 'travail').length;
const RISQUE = ['', 'faible', 'modéré', 'sérieux', 'élevé', 'extrême'];
const CHRON_ETAT_COURT = { decouverte: 'à découvrir', en_cours: 'en cours', prete: 'la suite est prête', en_attente: 'en attente', terminee: 'achevée' };

// Destinations proposées quand un vaisseau attend à quai : chronique prête ou
// à découvrir d'abord, puis les sites proches jamais visités ; un site fouillé
// récemment (butin réduit) passe après.
export function nearbyDestinations(n = 3) {
  const chrons = chroniclesList();
  const busy = new Set((S.expeditions || []).map(e => e.bodyId));
  const now = S.meta?.gameMin || 0;
  const out = [];
  for (const sys of S.galaxy?.systems || []) {
    if (!sys.scanned) continue;
    for (const body of sys.bodies || []) {
      if (busy.has(body.id)) continue;
      const ch = chrons.find(c => c.lieu?.bodyId === body.id && c.etat !== 'terminee') || null;
      let score = sys.distance + bodyThreatLevel(body) * 0.25;
      if (ch?.etat === 'prete' || ch?.etat === 'decouverte') score -= 10;
      if (!body.visited) score -= 0.5;
      if (typeof body.lootedAt === 'number' && now - body.lootedAt < PACING.LOOT_RECOVERY) score += 4;
      out.push({ sys, body, ch, score });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, n);
}

// Bloc « Destinations proches » : un toucher ouvre le lancement (équipe déjà
// proposée), un second fait décoller.
function destinationsHTML(titre) {
  const vessel = (S.fleet || []).find(v => v.available);
  if (!vessel || !colonsDispo()) return '';
  const list = nearbyDestinations(3);
  if (!list.length) return '';
  return `<h2 class="eyebrow">${esc(titre)}</h2>
    <p class="dest-intro">${esc(vessel.name)} (${esc(vesselDef(vessel.type).nom.toLowerCase())}) est prêt${['vedette', 'navette'].includes(vessel.type) ? 'e' : ''} à décoller.</p>
    <div class="dest-list">${list.map(({ sys, body, ch }) => {
      const est = expeditionEstimate({ vesselId: vessel.id, bodyId: body.id, crewCount: 2 });
      const threat = bodyThreatLevel(body);
      const meta = [esc(sys.name), est ? `aller-retour ${fmtDuree(est.allerRetour)}` : '', `risque ${RISQUE[threat] || threat}`].filter(Boolean).join(' · ');
      return `<div class="dest-card${ch?.etat === 'prete' ? ' ready' : ''}" data-id="dest:${esc(body.id)}">
        <div class="dest-main">
          <div class="dest-name">${esc(body.name)}</div>
          <div class="dest-meta">${meta}</div>
          ${ch ? `<div class="dest-chron">Chronique · ${esc(ch.titre)} — ${esc(CHRON_ETAT_COURT[ch.etat] || ch.etat)}</div>` : ''}
        </div>
        <button type="button" class="cta-btn dest-go" data-launch-body="${esc(body.id)}" aria-label="Envoyer une équipe vers ${esc(body.name)}">Envoyer</button>
      </div>`;
    }).join('')}</div>`;
}

// Bouton principal d'une mission sur place : ce qui attend le joueur
function missionAction(exp) {
  const step = sceneStep(exp.id);
  const id = esc(exp.id);
  if (step === 'resultat') return `<button class="cta-btn" data-resume-exp="${id}">Lire le résultat</button>`;
  if (step === 'bilanCombat') return `<button class="cta-btn" data-resume-exp="${id}">Voir l'issue du combat</button>`;
  if (step === 'combat') {
    return `<button class="cta-btn cbt-btn" data-resume-exp="${id}">⚔ Combat en cours · round ${esc(exp.combat.round)}</button>`;
  }
  if (step === 'scene' && exp.awaitingChoice) {
    const where = isChronExp(exp) ? 'chronique' : `scène ${esc(Number(exp.sceneIdx) + 1)} sur ${esc(exp.scenes?.length || '?')}`;
    return `<button class="cta-btn" data-resume-exp="${id}">Reprendre · ${where}</button>`;
  }
  return '';
}

export function renderExpeditions() {
  const sub = $('#expSub');
  const active = $('#expActiveList');
  const histHead = $('#expHistoryHead');
  const hist = $('#expHistoryList');
  const exps = S.expeditions || [];
  // Attend le joueur : décision sur place, ou résultat pas encore lu
  const attend = exp => (exp.phase === 'sur_place' && exp.awaitingChoice) || ['resultat', 'bilanCombat'].includes(sceneStep(exp.id));
  const waiting = exps.filter(attend);
  const unread = unreadReports();

  const subParts = [];
  if (exps.length) subParts.push(`${plur(exps.length, 'expédition')} en cours`);
  else subParts.push('Aucune expédition en cours');
  if (waiting.length) subParts.push(`<b class="warn-txt">${plur(waiting.length, 'équipe attend', 'équipes attendent')} tes ordres</b>`);
  if (unread.length) subParts.push(`${plur(unread.length, 'bilan', 'bilans')} à lire`);
  setHTML(sub, subParts.join(' · '));

  let html = '';
  // Retours pas encore lus (y compris pendant une absence) : bilan en un toucher
  if (unread.length) {
    html += `<div class="return-list">${unread.slice(0, 4).map(h => `
      <div class="return-card" data-id="ret:${esc(h.expId)}">
        <div class="rc-text">
          <div class="rc-kicker">Retour · bilan à lire</div>
          <div class="rc-title">${esc(h.bodyName)}</div>
          <div class="rc-meta">${esc(h.vesselName)} · Jour ${dayOf(h.finishedAt)}${h.result?.outcomeKind === 'warn' ? ' · <span class="warn-txt">pertes</span>' : ''}</div>
        </div>
        <button type="button" class="cta-btn rc-go" data-bilan="${esc(h.expId)}">Lire le bilan</button>
      </div>`).join('')}</div>`;
  }
  if (exps.length) {
    // Celles qui attendent le joueur d'abord, puis par temps restant
    const reste = exp => {
      const ph = expeditionPhase(exp);
      return exp.phase === 'aller' ? ph.remaining + (exp.oneWayMin || 0) : exp.phase === 'retour' ? ph.remaining : 0;
    };
    const sorted = exps.slice().sort((a, b) => (attend(b) - attend(a)) || (reste(a) - reste(b)));
    html += sorted.map(exp => {
      const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
      const body = sys?.bodies.find(b => b.id === exp.bodyId);
      const vessel = S.fleet.find(v => v.id === exp.vesselId);
      const ph = expeditionPhase(exp);
      const crewNames = exp.crewIds.map(id => esc(S.crew.find(c => c.id === id)?.name || '?')).join(', ');
      const awaiting = attend(exp);
      let phase, progress = '';
      if (exp.phase === 'aller') {
        phase = 'En route';
        progress = progressHTML(ph.pct, `Arrivée dans ${fmtDuree(ph.remaining)}`);
      } else if (exp.phase === 'retour') {
        phase = 'Retour';
        progress = progressHTML(ph.pct, `De retour à l'avant-poste dans ${fmtDuree(ph.remaining)}`);
      } else {
        phase = awaiting ? 'Attend tes ordres' : 'Sur place';
        const lbl = exp.combat?.active ? `Combat · round ${esc(exp.combat.round)}`
          : isChronExp(exp) ? 'Chronique' : `Scène ${esc(Number(exp.sceneIdx) + 1)} sur ${esc(exp.scenes?.length || '?')}`;
        progress = `<div class="eprog"><div class="lbl">${lbl}${awaiting ? ' · l\'équipe attend ta décision' : ''}</div></div>`;
      }
      const actions = [missionAction(exp)];
      if (exp.phase === 'retour') actions.push(`<button class="cta-btn ghost" data-bilan="${esc(exp.id)}">Bilan provisoire</button>`);
      return `<div class="expedition-card ${esc(exp.phase)}${awaiting ? ' awaiting' : ''}" data-id="${esc(exp.id)}">
        <div class="ehead">
          <div class="edest">${esc(body?.name || '?')}</div>
          <div class="ephase">${phase}</div>
        </div>
        <div class="emeta">${esc(vessel?.name || '?')} · ${sys ? sys.distance.toFixed(2) : '?'} pc · ${plur(exp.crewIds.length, 'membre')}${isChronExp(exp) ? ' · chronique' : ''}</div>
        ${progress}
        <div class="ecrew">${crewNames}</div>
        ${actions.filter(Boolean).join('')}
      </div>`;
    }).join('');
  }
  // Un vaisseau à quai : destinations proches, à deux touchers du départ
  const dest = destinationsHTML(exps.length ? 'Envoyer une autre équipe' : 'Destinations proches');
  if (dest) {
    html += dest;
  } else if (!exps.length) {
    if (!(S.fleet || []).length) {
      html += S.modules.hangar
        ? emptyState('Aucun vaisseau dans la flotte.', { goto: 'expeditions/vaisseaux', label: 'Mettre un vaisseau sur cale' })
        : emptyState('Plus aucun vaisseau. Un <em>Hangar</em> permet d\'en construire.', { goto: 'base/construction', cible: 'hangar', label: 'Construire le hangar' });
    } else if (!colonsDispo()) {
      html += emptyState('Aucun colon disponible pour partir : tous sont occupés, blessés ou en formation.', { goto: 'equipage/personnel', label: 'Voir l\'équipage' });
    } else {
      html += emptyState('Aucune destination connue. Une <em>Antenne</em> cartographie les systèmes voisins.', { goto: 'expeditions/carte', label: 'Ouvrir la carte' });
    }
  }
  setHTML(active, html);

  if ((S.expHistory || []).length > 0) {
    histHead.hidden = false;
    setHTML(hist, S.expHistory.slice(0, 8).map(h => {
      const cls = h.result?.outcomeKind === 'warn' ? 'warn' : '';
      const nouveau = h.bilanVu === false;
      return `<div class="exphistory-row ${cls}${nouveau ? ' unread' : ''}" data-id="h:${esc(h.expId || h.finishedAt)}">
        <div class="h-head">
          <div class="h-dest">${esc(h.bodyName)}</div>
          <div>${nouveau ? '<span class="h-new">Nouveau</span> ' : ''}Jour ${dayOf(h.finishedAt)}</div>
        </div>
        <div class="h-summary">${esc(h.vesselName)} · ${plur(Number(h.crewCount) || 0, 'membre')}${h.result?.summary ? ' · ' + esc(h.result.summary) : ''}</div>
        ${h.bilan && h.expId ? `<button type="button" class="h-bilan" data-bilan="${esc(h.expId)}">Voir le bilan</button>` : ''}
      </div>`;
    }).join(''));
  } else {
    histHead.hidden = true;
    setHTML(hist, '');
  }
}
// ============================================================
//   CARTE (galaxie → système → corps)
// ============================================================
function pipBar(value, kind) {
  const pips = [];
  for (let i = 1; i <= 5; i++) pips.push(`<span class="pip ${i <= value ? 'on' : ''}"></span>`);
  return `<span class="tr-bar ${kind}" role="img" aria-label="${value} sur 5">${pips.join('')}</span>`;
}
// Pastille « Chronique » d'un système ou d'un corps, selon l'état le plus
// pressant de ses chroniques (prête > à découvrir > en cours > en attente > achevée)
const CHRON_ORDRE = ['prete', 'decouverte', 'en_cours', 'en_attente', 'terminee'];
const CHRON_CHIP = { prete: 'Chronique : la suite est prête', decouverte: 'Chronique à découvrir', en_cours: 'Chronique en cours', en_attente: 'Chronique en attente', terminee: 'Chronique achevée' };
function chronChip(chrons) {
  if (!chrons.length) return '';
  const etat = CHRON_ORDRE.find(e => chrons.some(c => c.etat === e)) || chrons[0].etat;
  return `<span class="signal-chip chron ${esc(etat)}">${esc(CHRON_CHIP[etat] || 'Chronique')}</span>`;
}
// Système de l'avant-poste : le plus proche (plusieurs systèmes peuvent être à moins de 0,8 pc)
function homeSystem() {
  let best = null;
  for (const s of S.galaxy?.systems || []) if (!best || s.distance < best.distance) best = s;
  return best;
}
function systemChips(sys) {
  const chips = [];
  const hasSignal = sys.bodies.some(b => b.signal && b.signal !== 'aucun');
  const hasRuines = sys.bodies.some(b => b.ruines && b.ruines !== 'aucune');
  const hasDanger = sys.bodies.some(b => b.danger && ['ia_hostile', 'anomalie', 'pathogene'].includes(b.danger));
  const hasLife = sys.bodies.some(b => ['civ_active', 'civ_dechue'].includes(b.vie));
  const chrons = chroniclesList().filter(c => c.lieu?.systemId === sys.id);
  const chip = chronChip(chrons);
  if (chip) chips.push(chip);
  if (hasSignal) chips.push('<span class="signal-chip signal">Signal</span>');
  if (hasRuines) chips.push('<span class="signal-chip ruins">Ruines</span>');
  if (hasLife) chips.push('<span class="signal-chip life">Vie</span>');
  if (hasDanger) chips.push('<span class="signal-chip danger">Danger</span>');
  return chips.join('');
}

export function renderGalaxy() {
  const host = $('#galaxyContent');
  const view = S.ui?.galaxyView || 'list';
  if (view === 'body' && S.ui.currentBodyId) setHTML(host, renderGalaxyBody());
  else if (view === 'system' && S.ui.currentSystemId) setHTML(host, renderGalaxySystem());
  else setHTML(host, renderGalaxyList());
}

function renderGalaxyList() {
  const scanned = S.galaxy.systems.filter(s => s.scanned);
  const total = S.galaxy.systems.length;
  const antLvl = S.modules.antenne?.level || 0;
  const range = (1 + antLvl * 1.4).toFixed(1);
  const cards = scanned.map(sys => {
    const isHome = sys === homeSystem();
    const cls = isHome ? 'home' : (sys.explored ? 'explored' : '');
    const chips = systemChips(sys);
    return `<div class="system-card ${cls}" data-system-id="${esc(sys.id)}" role="button" tabindex="0">
      <div class="scard-head">
        <div class="sysname">${esc(sys.name)}${isHome ? '<span class="home-marker">Origine</span>' : ''}</div>
        <div class="sysdist">${sys.distance.toFixed(2)} pc</div>
      </div>
      <div class="sysmeta">${plur(sys.bodies.length, 'corps céleste', 'corps célestes')}</div>
      ${chips ? `<div class="syssignals">${chips}</div>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="galaxy-stats">
      Systèmes connus : <b>${scanned.length} / ${total}</b> · Portée : <b>${range} pc</b>
      ${antLvl === 0 ? ' · aucune antenne longue portée' : ` · antenne niv. ${esc(antLvl)}`}
    </div>
    <div class="system-list">${cards || '<div class="empty">Aucun système cartographié.</div>'}</div>`;
}

function renderGalaxySystem() {
  const sys = S.galaxy.systems.find(s => s.id === S.ui.currentSystemId);
  if (!sys) { S.ui.galaxyView = 'list'; return renderGalaxyList(); }
  const isHome = sys === homeSystem();
  const bodyCards = sys.bodies.map(b => {
    const summary = [
      BIOMES[b.biome]?.nom, ATMOSPHERES[b.atmosphere]?.nom,
      GRAVITES[b.gravite] ? `gravité ${GRAVITES[b.gravite].nom.toLowerCase()}` : null,
    ].filter(Boolean).join(' · ');
    const chron = chronChip(chroniclesList().filter(c => c.lieu?.bodyId === b.id));
    return `<div class="body-card ${b.visited ? 'visited' : ''} ${b.looted ? 'looted' : ''}" data-body-id="${esc(b.id)}" data-type="${esc(b.type)}" role="button" tabindex="0">
      <div class="bcard-head">
        <div class="bname">${esc(b.name)}</div>
        <div class="btype">${nomOf(BODY_TYPES, b.type)}</div>
      </div>
      <div class="bsummary">${summary}${chron ? ' ' + chron : ''}</div>
      <div class="threat-reward">
        <span>Menace ${pipBar(bodyThreatLevel(b), 'threat')}</span>
        <span>Récompense ${pipBar(bodyRewardLevel(b), 'reward')}</span>
      </div>
    </div>`;
  }).join('');
  return `
    <button class="back-btn" data-galaxy-action="list">Galaxie</button>
    <div class="system-header">
      <div class="sysname-big">${esc(sys.name)}${isHome ? '<span class="home-marker">Origine</span>' : ''}</div>
      <div class="sysmeta-big">${sys.distance.toFixed(2)} pc · ${plur(sys.bodies.length, 'corps céleste', 'corps célestes')}</div>
    </div>
    <div class="body-list">${bodyCards}</div>`;
}

const CHRON_ETAT = { decouverte: 'Découverte', en_cours: 'En cours', prete: 'La suite est prête', en_attente: 'En attente', terminee: 'Achevée' };
function renderGalaxyBody() {
  const sys = S.galaxy.systems.find(s => s.id === S.ui.currentSystemId);
  const body = sys?.bodies.find(b => b.id === S.ui.currentBodyId);
  if (!body) { S.ui.galaxyView = 'system'; return renderGalaxySystem(); }
  const dataRows = [
    ['Type', nomOf(BODY_TYPES, body.type), ''],
    ['Biome', BIOMES[body.biome]?.nom || '—', ''],
    ['Atmosphère', ATMOSPHERES[body.atmosphere]?.nom || '—', ''],
    ['Gravité', GRAVITES[body.gravite]?.nom || '—', ''],
    ['Vie', VIES[body.vie]?.nom || '—', body.vie !== 'aucune' ? 'life' : ''],
    ['Signal', SIGNAUX[body.signal]?.nom || '—', body.signal !== 'aucun' ? 'signal' : ''],
    ['Ruines', RUINES[body.ruines]?.nom || '—', body.ruines !== 'aucune' ? 'ruins' : ''],
    ['Danger', DANGERS[body.danger]?.nom || '—', body.danger !== 'aucun' ? 'danger' : ''],
  ];
  const dataHTML = dataRows.map(([lbl, val, cls]) => `<div class="dl-row"><span class="dl-lbl">${lbl}</span><span class="dl-val ${cls}">${val}</span></div>`).join('');
  // Chronique portée par ce corps
  let chronHTML = '';
  const chron = chroniclesList().find(c => c.lieu?.bodyId === body.id);
  if (chron) {
    chronHTML = `<div class="body-chron ${esc(chron.etat)}">
      <div class="bc-kicker">Chronique · ${esc(CHRON_ETAT[chron.etat] || chron.etat)}</div>
      <div class="bc-title">${esc(chron.titre)}</div>
      ${chron.episodes ? `<div class="bc-meta">Épisode ${esc(chron.episode)}/${esc(chron.episodes)}${chron.prochainDans ? ` · suite dans ${fmtDuree(chron.prochainDans)}` : ''}</div>` : ''}
    </div>`;
  }
  // Le départ ne demande qu'un vaisseau à quai (la vedette de départ attend sur
  // l'aire de fortune) ; le hangar ne sert qu'à en construire d'autres.
  let actionHTML;
  if (S.fleet.length === 0 && !S.vesselBuild) {
    actionHTML = S.modules.hangar
      ? emptyState('Aucun vaisseau dans la flotte.', { goto: 'expeditions/vaisseaux', label: 'Mettre un vaisseau sur cale' })
      : emptyState('Plus aucun vaisseau. Un <em>Hangar</em> permet d\'en construire.', { goto: 'base/construction', cible: 'hangar', label: 'Construire le hangar' });
  } else {
    const availV = S.fleet.filter(v => v.available).length;
    const freeC = colonsDispo();
    const onSite = (S.expeditions || []).some(e => e.bodyId === body.id);
    const label = chron && (chron.etat === 'prete' || chron.etat === 'decouverte') && !onSite
      ? `Lancer l'épisode ${chron.episode}` : 'Lancer une expédition';
    if (availV === 0) actionHTML = '<div class="body-action-area">Tous les vaisseaux sont en mission.</div>';
    else if (freeC === 0) actionHTML = '<div class="body-action-area">Aucun membre d\'équipage disponible.</div>';
    else actionHTML = `<button class="cta-btn" data-galaxy-action="launch" data-body-id="${esc(body.id)}">${esc(label)}</button>`;
  }
  return `
    <button class="back-btn" data-galaxy-action="system">${esc(sys.name)}</button>
    <div class="body-detail-header">
      <div class="bname-big">${esc(body.name)}</div>
      <div class="bsystem">Système ${esc(sys.name)} · ${sys.distance.toFixed(2)} pc · ${nomOf(BODY_TYPES, body.type)}</div>
    </div>
    ${chronHTML}
    <div class="body-data-grid">${dataHTML}</div>
    <div class="body-pips">
      <span>Menace ${pipBar(bodyThreatLevel(body), 'threat')}</span>
      <span>Récompense ${pipBar(bodyRewardLevel(body), 'reward')}</span>
    </div>
    <div class="body-narrative">${esc(describeBody(body))}</div>
    ${actionHTML}`;
}

function galaxyUI() {
  if (!S.ui || typeof S.ui !== 'object') S.ui = {};
  return S.ui;
}
// Ouvre la fiche d'un corps céleste (depuis le tableau de bord, une chronique…)
export function openBody(bodyId) {
  for (const sys of S.galaxy?.systems || []) {
    if (sys.bodies?.some(b => b.id === bodyId)) {
      const ui = galaxyUI();
      ui.galaxyView = 'body';
      ui.currentSystemId = sys.id;
      ui.currentBodyId = bodyId;
      return true;
    }
  }
  return false;
}
// Change de niveau dans la carte : rend, remonte en haut, garde le focus
function renderGalaxyAndFocus() {
  const host = $('#galaxyContent');
  const hadFocus = host?.contains(document.activeElement);
  render();
  if (!host) return;
  if (host.getBoundingClientRect().top < 0) window.scrollTo({ top: 0 });
  if (hadFocus && !host.contains(document.activeElement)) {
    host.querySelector('.back-btn, [data-system-id], [data-body-id]')?.focus({ preventScroll: true });
  }
}

// ============================================================
//   VAISSEAUX
// ============================================================
export function renderFleet() {
  const sub = $('#fleetSub');
  const status = $('#fleetStatus');
  const list = $('#fleetList');
  const catalogHead = $('#fleetCatalogHead');
  const catalog = $('#fleetCatalog');
  // Sans hangar, la vedette de départ attend sur l'aire de fortune et peut
  // partir ; le hangar ne sert qu'à construire d'autres vaisseaux.
  const hangar = S.modules.hangar;
  const cap = fleetCapacity();
  const cur = S.fleet.length + (S.vesselBuild ? 1 : 0);
  const quai = `<div class="fleet-status">
    À quai : <b>${S.fleet.filter(v => v.available).length}</b> · En mission : <b>${S.fleet.filter(v => !v.available).length}</b>${S.vesselBuild ? ' · Un vaisseau sur cale' : ''}
  </div>`;
  if (!hangar) {
    setHTML(sub, `Aire de fortune · ${esc(cur)}/${esc(cap)} place${cap > 1 ? 's' : ''} occupée${cur > 1 ? 's' : ''}`);
    setHTML(status, quai);
    catalogHead.hidden = true;
    setHTML(catalog, emptyState('Construire d\'autres vaisseaux demande un <em>Hangar</em> (il demande un atelier).', { goto: 'base/construction', cible: 'hangar', label: 'Construire le hangar' }));
  } else {
    setHTML(sub, `Hangar niv. ${esc(hangar.level)} · ${esc(cur)}/${esc(cap)} place${cap > 1 ? 's' : ''} occupée${cur > 1 ? 's' : ''}`);
  }
  const hb = hangarBonuses();
  const parts = [];
  if (hb.fuelMult < 1) parts.push(`Carburant <b>−${Math.round((1 - hb.fuelMult) * 100)} %</b>`);
  if (hb.speedMult < 1) parts.push(`Voyages <b>${Math.round((1 - hb.speedMult) * 100)} % plus rapides</b>`);
  const secCount = staffRoleCount('hangar', 'securite');
  if (secCount > 0) parts.push(`Sécurité hangar <b>+${secCount}</b>`);
  const bonusText = parts.length ? parts.join(' · ') : '<span class="none">Aucun bonus actif. Affecte un Mécano de bord ou un Chef pilote.</span>';
  if (hangar) setHTML(status, renderStaffPanel('hangar', { title: 'Équipe au sol', bonusText }) + quai);
  let html = '';
  if (S.vesselBuild) {
    const def = vesselDef(S.vesselBuild.type);
    const pct = Math.min(100, S.vesselBuild.doneMin / S.vesselBuild.totalMin * 100);
    html += `<div class="vessel-buildslot">
      <div class="name">${esc(def.nom)} sur cale</div>
      ${progressHTML(pct, `${pct.toFixed(0)} % · reste ${fmtDuree(S.vesselBuild.totalMin - S.vesselBuild.doneMin)}`)}
    </div>`;
  }
  if (S.fleet.length === 0 && !S.vesselBuild) {
    html += '<div class="empty">Aucun vaisseau dans le hangar.</div>';
  } else {
    html += S.fleet.map(v => {
      const def = vesselDef(v.type);
      const busy = !v.available;
      let busyInfo = '';
      if (busy) {
        const exp = S.expeditions.find(e => e.vesselId === v.id);
        if (exp) {
          const sys = S.galaxy.systems.find(s => s.id === exp.systemId);
          const body = sys?.bodies.find(b => b.id === exp.bodyId);
          busyInfo = ` · ${esc(body?.name || '?')} (${esc(expeditionPhase(exp).label.toLowerCase())})`;
        }
      }
      return `<div class="vessel-card ${busy ? 'busy' : ''}">
        <div class="vcard-head">
          <div class="vname">${esc(v.name)}</div>
          <div class="vtype">${esc(def.nom)}</div>
        </div>
        <div class="vstats">
          <span>Places <b>${def.places}</b></span>
          <span>Cargo <b>${def.cargo}</b></span>
          <span>Vitesse <b>${(1 / def.speed).toFixed(2)}×</b></span>
          <span>Carb. <b>${def.fuelPerPc}</b>/pc</span>
        </div>
        <div class="vstatus ${busy ? 'busy' : 'available'}">${busy ? `En mission${busyInfo}` : 'À quai'}</div>
      </div>`;
    }).join('');
  }
  setHTML(list, html);
  if (!hangar) return;
  const eligible = Object.entries(VESSELS).filter(([, d]) => d.hangarReq <= hangar.level);
  if (eligible.length > 0 && cur < cap && !S.vesselBuild) {
    catalogHead.hidden = false;
    setHTML(catalog, eligible.map(([key, def]) => {
      const r = canBuildVessel(key);
      const costStr = Object.entries(def.cost).map(([k, v]) => `<span class="${(S.res[k] || 0) < v ? 'ko' : ''}">${RES_LABELS[k]} ${v}</span>`).join(' · ');
      return `<div class="vmodel-card">
        <div class="vmname">${def.nom}</div>
        <div class="vmflavor">${def.flavor}</div>
        <div class="vmstats">
          <span>Places ${def.places}</span>
          <span>Cargo ${def.cargo}</span>
          <span>Vit. ${(1 / def.speed).toFixed(2)}×</span>
          <span>Carb. ${def.fuelPerPc}/pc</span>
        </div>
        <div class="vmcost">${costStr} · ${fmtDuree(def.buildHours * 60 * BUILD_TIME_MULT)}</div>
        <button data-build-vessel="${key}" ${r.ok ? '' : 'disabled'}>${r.ok ? 'Mettre sur cale' : esc(r.why)}</button>
      </div>`;
    }).join(''));
  } else {
    catalogHead.hidden = true;
    setHTML(catalog, '');
  }
}

// ============================================================
//   DIPLOMATIE
// ============================================================
export function renderDiplomacy() {
  const sub = $('#diploSub');
  const content = $('#diploContent');
  if (!content) return;
  const factions = Object.values(S.factions || {});
  const activeMissions = (S.diplomaticMissions || []).length;
  const allies = factions.filter(f => f.reputation >= 60).length;
  if (factions.length === 0) {
    setHTML(sub, 'Aucune faction connue.');
    setHTML(content, emptyState('L\'avant-poste n\'a encore croisé personne. Les factions se rencontrent en expédition.', { goto: 'expeditions/carte', label: 'Ouvrir la carte' }));
    return;
  }
  setHTML(sub, `<b>${factions.length}</b> faction${factions.length > 1 ? 's' : ''} connue${factions.length > 1 ? 's' : ''} · <b>${allies}</b> allié${allies > 1 ? 's' : ''} · <b>${activeMissions}</b> mission${activeMissions > 1 ? 's' : ''} en cours`);
  let html = '';
  if (activeMissions > 0) {
    html += '<h3 class="section-h">Missions diplomatiques en cours</h3>';
    for (const mis of S.diplomaticMissions) {
      const f = S.factions[mis.factionId];
      const member = S.crew.find(c => c.id === mis.memberId);
      if (!f || !member) continue;
      const elapsed = S.meta.gameMin - mis.startedAt;
      const pct = Math.min(100, (elapsed / mis.duration) * 100);
      html += `<div class="diplo-mission">
        <div class="dm-head">
          <div><b>${esc(member.name)}</b> → <em>${esc(f.name)}</em></div>
          <div class="dm-eta">${pct.toFixed(0)} % · reste ${fmtDuree(Math.max(0, mis.duration - elapsed))}</div>
        </div>
        <div class="dm-bar"><div class="dm-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
  }
  factions.sort((a, b) => b.reputation - a.reputation);
  html += '<h3 class="section-h">Factions connues</h3>';
  html += factions.map(f => renderFactionCard(f)).join('');
  setHTML(content, html);
}

function missionSuccessChance(member, factionType) {
  const ft = FACTION_TYPES[factionType] || {};
  const pSkill = ft.missionSkill || 'linguistique';
  const pScore = member.skills[pSkill] || 0;
  const lScore = pSkill !== 'linguistique' ? (member.skills.linguistique || 0) : 0;
  const charisme = member.stats?.charisme || 5;
  const mod = pScore * 2 + Math.floor(lScore * 0.6) + Math.floor((charisme - 5) / 2);
  const minRoll = 10 - mod;
  return Math.max(0, Math.min(10, 11 - minRoll)) * 10;
}

function renderFactionCard(f) {
  const ft = FACTION_TYPES[f.type];
  if (!ft) {
    return `<div class="diplo-card"><div class="dc-head"><div class="dc-name">${esc(f.name)}</div></div>
      <div class="dc-desc">Faction d'un type inconnu de cette version du jeu.</div></div>`;
  }
  const status = factionStatus(f.reputation);
  const repPct = Math.max(0, Math.min(100, (f.reputation + 100) / 2));
  const onMission = (S.diplomaticMissions || []).some(m => m.factionId === f.id);
  const milestones = [
    { rep: -60, label: 'Hostile', pct: 20 }, { rep: 20, label: 'Cordial', pct: 60 }, { rep: 40, label: 'Commerce', pct: 70 },
    { rep: 50, label: 'Ami', pct: 75 }, { rep: 75, label: 'Allié', pct: 87.5 },
  ];
  const milestonesHTML = milestones.map(m => `<div class="dc-milestone ${f.reputation >= m.rep ? 'reached' : ''}" style="left:${m.pct}%">
      <div class="dcm-tick"></div><div class="dcm-label">${m.label}</div></div>`).join('');
  let tradeHTML = '';
  const tradeReq = tradeRequirement(f);
  const tradeBlocked = !f.tradeActive && !tradeReq.ok;
  if (f.reputation >= 40) {
    const offerStr = Object.entries(ft.tradeOffer).map(([k, v]) => `+${v} ${RES_LABELS[k]}`).join(', ');
    const askStr = Object.entries(ft.tradeAsk).map(([k, v]) => `−${v} ${RES_LABELS[k]}`).join(', ');
    const cycle = 15 * 24 * 60;
    const nextCaravan = f.tradeActive && f.lastCaravan ? Math.max(0, cycle - (S.meta.gameMin - f.lastCaravan)) : null;
    tradeHTML = `<div class="dc-section">
      <div class="dc-section-label">Commerce</div>
      <div class="dt-rates">${offerStr} contre ${askStr} · tous les ${fmtDuree(cycle)}</div>
      <div class="dt-row">
        <button class="dt-btn ${f.tradeActive ? 'active' : ''}" data-trade="${esc(f.id)}" ${tradeBlocked ? 'disabled' : ''}>${f.tradeActive ? '◼ Suspendre' : '◻ Ouvrir'} la route</button>
        ${f.tradeActive && nextCaravan !== null ? `<span class="dt-eta">Prochaine dans ${fmtDuree(nextCaravan)}</span>` : ''}
      </div>
      ${tradeBlocked ? `<div class="dt-why">${esc(tradeReq.why)}</div>` : ''}
    </div>`;
  } else {
    tradeHTML = '<div class="dc-section dc-section-locked">Commerce possible à partir de 40 de réputation</div>';
  }
  if (f.reputation <= -60) tradeHTML = `<div class="dc-section dc-section-hostile">⚠ Faction hostile — les expéditions sur ${esc(f.bodyName)} risquent l'embuscade.</div>`;
  let allianceHTML = '';
  const allyReq = allianceRequirement(f);
  const ag = ft.allianceGift;
  if (f.reputation >= 75 && ag && !allyReq.ok) {
    allianceHTML = `<div class="dc-section dc-section-locked">
      <div class="dc-section-label">★ Alliance</div>
      <div>Dons automatiques (+${ag.amount} ${RES_LABELS[ag.resource] || ''} tous les ${fmtDuree(ag.interval)})</div>
      <div class="dt-why">${esc(allyReq.why)}</div>
    </div>`;
  } else if (f.reputation >= 75 && ag) {
    const nextAg = f.lastAllianceGift ? Math.max(0, ag.interval - (S.meta.gameMin - f.lastAllianceGift)) : 0;
    allianceHTML = `<div class="dc-section dc-alliance">
      <div class="dc-section-label">★ Alliance</div>
      <div>Don automatique : +${ag.amount} ${RES_LABELS[ag.resource]} tous les ${fmtDuree(ag.interval)}</div>
      ${nextAg > 0 ? `<div class="dt-eta">Prochain dans ${fmtDuree(nextAg)}</div>` : ''}
    </div>`;
  } else if (f.reputation >= 50) {
    allianceHTML = `<div class="dc-section dc-section-locked">Alliance à 75 : dons automatiques (+${ag?.amount || '?'} ${RES_LABELS[ag?.resource] || ''} tous les ${fmtDuree(ag?.interval || 0)})</div>`;
  }
  let giftsHTML = '';
  if (ft.giftOptions?.length) {
    const cooldown = ft.giftCooldown || 3 * 24 * 60;
    const waitLeft = f.lastGift ? Math.max(0, cooldown - (S.meta.gameMin - f.lastGift)) : 0;
    const giftBtns = ft.giftOptions.map((g, i) => {
      const canAfford = (S.res[g.resource] || 0) >= g.amount;
      return `<button class="gift-btn ${canAfford ? '' : 'cant'}" ${(waitLeft > 0 || !canAfford) ? 'disabled' : ''} data-gift-faction="${esc(f.id)}" data-gift-idx="${i}">
        ${g.label} (−${g.amount} ${RES_LABELS[g.resource]}) → +${g.repGain} rép.
      </button>`;
    }).join('');
    giftsHTML = `<div class="dc-section">
      <div class="dc-section-label">Offrir un cadeau</div>
      <div class="gift-list">${giftBtns}</div>
      ${waitLeft > 0 ? `<span class="dt-eta">Prochain cadeau dans ${fmtDuree(waitLeft)}</span>` : ''}
    </div>`;
  }
  let missionHTML = '';
  const reqSkill = ft.missionReqSkill || 'linguistique';
  const reqMin = ft.missionReqMin || 3;
  const reqAlt = ft.missionReqAlt;
  const cost = ft.missionCost ?? 25;
  if (onMission) {
    missionHTML = '<div class="dc-section"><div class="diplo-mission-info">Mission en cours…</div></div>';
  } else {
    const candidates = diploCandidates(ft);
    if (candidates.length > 0) {
      const best = candidates.slice().sort((a, b) => missionSuccessChance(b, f.type) - missionSuccessChance(a, f.type))[0];
      const chance = missionSuccessChance(best, f.type);
      const reqLabel = reqAlt ? `${SKILL_LABELS[reqSkill]} ${reqMin}+ ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : `${SKILL_LABELS[reqSkill]} ${reqMin}+`;
      missionHTML = `<div class="dc-section">
        <div class="dc-section-label">Mission diplomatique · ${cost} biomasse</div>
        <div class="mission-req">Valorisée : <em>${SKILL_LABELS[ft.missionSkill] || ft.missionSkill}</em> · Requis : ${reqLabel}</div>
        <div class="mission-best">Meilleur candidat : <b>${esc(best.name)}</b> · <span class="mission-chance ${chance >= 70 ? 'good' : chance >= 40 ? 'mid' : 'bad'}">${chance} % de succès</span></div>
        <button class="diplo-launch-btn" data-diplo-launch="${esc(f.id)}">Envoyer une mission</button>
      </div>`;
    } else {
      const altLabel = reqAlt ? ` ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : '';
      missionHTML = `<div class="dc-section dc-section-locked">Mission : ${SKILL_LABELS[reqSkill]} ${reqMin}+${altLabel} requis</div>`;
    }
  }
  return `<div class="diplo-card" style="border-left-color:${ft.color}">
    <div class="dc-head">
      <div class="dc-name">${esc(f.name)}</div>
      <div class="dc-status" style="color:${status.color}">${status.label}</div>
    </div>
    <div class="dc-meta" style="color:${ft.color}">${ft.label} · ${esc(f.bodyName)}</div>
    <div class="dc-desc">${ft.desc}</div>
    <div class="dc-rep">
      <div class="dc-rep-header">
        <span class="dc-rep-label">Réputation</span>
        <span class="dc-rep-val" style="color:${status.color}">${f.reputation > 0 ? '+' : ''}${Math.round(f.reputation)}</span>
      </div>
      <div class="dc-rep-track">
        <div class="dc-rep-bar"><div class="dc-rep-fill" style="width:${repPct}%; background:${status.color}"></div></div>
        <div class="dc-milestones">${milestonesHTML}</div>
      </div>
    </div>
    ${allianceHTML}
    ${tradeHTML}
    ${giftsHTML}
    ${missionHTML}
  </div>`;
}

function diploCandidates(ft) {
  const reqSkill = ft.missionReqSkill || 'linguistique';
  const reqMin = ft.missionReqMin || 3;
  const reqAlt = ft.missionReqAlt;
  return aliveCrew().filter(m => (m.statut === 'libre' || m.statut === 'travail') && (
    (m.skills[reqSkill] || 0) >= reqMin || (reqAlt && (m.skills[reqAlt.skill] || 0) >= reqAlt.min)));
}

let _diploPick = null;
function openDiploLaunchModal(factionId) {
  _diploPick = { factionId, memberId: null };
  const f = S.factions?.[factionId];
  const ft = f && FACTION_TYPES[f.type];
  if (!ft) return;
  const reqSkill = ft.missionReqSkill || 'linguistique';
  const reqMin = ft.missionReqMin || 3;
  const reqAlt = ft.missionReqAlt;
  const cost = ft.missionCost ?? 25;
  const candidates = diploCandidates(ft);
  if (candidates.length === 0) {
    const altLabel = reqAlt ? ` ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : '';
    toast(`Aucun candidat disponible (${SKILL_LABELS[reqSkill]} ${reqMin}+${altLabel}).`);
    return;
  }
  const m = $('#modal');
  m.className = 'modal incident-modal';
  const pSkillLabel = SKILL_LABELS[ft.missionSkill] || ft.missionSkill;
  const sorted = candidates.slice().sort((a, b) => missionSuccessChance(b, f.type) - missionSuccessChance(a, f.type));
  const candidatesHTML = sorted.map(c => {
    const chance = missionSuccessChance(c, f.type);
    const cls = chance >= 70 ? 'good' : chance >= 40 ? 'mid' : 'bad';
    return `<div class="diplo-pick" data-pick-diplo="${esc(c.id)}" role="button" tabindex="0">
      <div class="dp-name">${esc(c.name)}</div>
      <div class="dp-meta">${pSkillLabel} ${esc(c.skills[ft.missionSkill] || 0)} · Charisme ${esc(c.stats?.charisme || 5)} · <span class="mission-chance ${cls}">${chance} %</span></div>
    </div>`;
  }).join('');
  const pSkills = reqAlt ? `${SKILL_LABELS[reqSkill]} ${reqMin}+ ou ${SKILL_LABELS[reqAlt.skill]} ${reqAlt.min}+` : `${SKILL_LABELS[reqSkill]} ${reqMin}+`;
  m.innerHTML = `
    <div class="incident-eyebrow">Mission diplomatique</div>
    <h3 class="incident-title">→ ${esc(f.name)}</h3>
    <p class="incident-body" style="font-size:14px;padding:8px 0 12px">
      Coût : ${cost} biomasse · Compétence valorisée : <em>${pSkillLabel}</em><br>Requis : ${pSkills}
    </p>
    <div class="diplo-pick-list">${candidatesHTML}</div>
    <div class="btn-row">
      <button id="diploCancel">Annuler</button>
      <button id="diploGo" class="primary" disabled>Envoyer</button>
    </div>`;
  $('#modalBg').classList.add('show');
  const close = () => $('#modalBg').classList.remove('show');
  m.querySelectorAll('[data-pick-diplo]').forEach(el => el.addEventListener('click', () => {
    _diploPick.memberId = el.dataset.pickDiplo;
    m.querySelectorAll('[data-pick-diplo]').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected');
    $('#diploGo').disabled = false;
  }));
  $('#diploCancel')?.addEventListener('click', close);
  $('#diploGo')?.addEventListener('click', () => {
    launchDiplomaticMission(_diploPick.factionId, _diploPick.memberId);
    close();
  });
}

// ============================================================
//   Actions
// ============================================================
export const ACTIONS = [
  // Le bouton de lancement porte aussi data-body-id : il passe en premier
  ['[data-galaxy-action]', el => {
    const act = el.dataset.galaxyAction;
    const ui = galaxyUI();
    if (act === 'list') {
      ui.galaxyView = 'list'; ui.currentSystemId = null; ui.currentBodyId = null;
      renderGalaxyAndFocus();
    } else if (act === 'system') {
      ui.galaxyView = 'system'; ui.currentBodyId = null;
      renderGalaxyAndFocus();
    } else if (act === 'launch') {
      showLaunchModal({ bodyId: el.dataset.bodyId });
    }
  }],
  // Lancement direct vers un corps (destinations proches, chronique prête du tableau de bord…)
  ['[data-launch-body]', el => showLaunchModal({ bodyId: el.dataset.launchBody })],
  // Bilan d'une expédition (rentrée ou sur le retour)
  ['[data-bilan]', el => showExpeditionReport(el.dataset.bilan)],
  ['[data-system-id]', el => {
    const ui = galaxyUI();
    ui.galaxyView = 'system';
    ui.currentSystemId = el.dataset.systemId;
    renderGalaxyAndFocus();
  }],
  ['.body-card[data-body-id]', el => {
    const ui = galaxyUI();
    ui.galaxyView = 'body';
    ui.currentBodyId = el.dataset.bodyId;
    renderGalaxyAndFocus();
  }],
  ['button[data-build-vessel]', el => startVesselBuild(el.dataset.buildVessel)],
  // « Reprendre » : liste des missions (data-resume-exp) et tableau de bord (data-reprendre,
  // un autre attribut pour que le sélecteur des missions reste unique)
  ['button[data-resume-exp], button[data-reprendre]', el => openSceneOverlay(el.dataset.resumeExp || el.dataset.reprendre)],
  ['button[data-trade]', el => { toggleFactionTrade(el.dataset.trade); render(); }],
  ['button[data-diplo-launch]', el => openDiploLaunchModal(el.dataset.diploLaunch)],
  ['button[data-gift-faction]', el => offerGift(el.dataset.giftFaction, parseInt(el.dataset.giftIdx, 10))],
];
