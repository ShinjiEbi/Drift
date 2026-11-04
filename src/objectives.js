// objectives.js — objectifs affichés sur le tableau de bord « À faire ».
//
// getObjectives(S) → 3 objectifs au plus :
//   [{ id, titre, detail, action: { onglet, sousOnglet?, cible?, label? }, fait,
//      source: 'urgence'|'conseil'|'fil', progression?: { n, total } }]
//
// Deux sources :
//   1. des indices dynamiques, calculés sur l'état (énergie en baisse,
//      chantier à l'arrêt, colons sans poste, vaisseau à quai…) ;
//   2. l'étape courante du fil rouge « L'Avant-poste » (ARCS), avec sa
//      progression chiffrée.
// Les urgences passent devant ; le fil rouge garde toujours une place tant
// qu'il n'est pas achevé. Lecture seule : rien n'est modifié dans S.

import { MODULES, TECH_TREE } from './catalog.js';
import { ARCS } from './data-arcs-factions.js';
import { computeRates, crewCap, aliveCrew } from './state.js';
import { fmtDuree } from './util.js';
import * as App from './app.js';

const ARC_ID = 'arc_avant_poste';
const PRIMAIRES = ['mine_surface', 'hydroponie', 'generateur_solaire', 'habitat'];

// Ordre de priorité des premiers bâtiments conseillés
const BUILD_PRIORITY = [
  'generateur_solaire', 'habitat', 'hydroponie', 'mine_surface', 'balise_recrutement',
  'laboratoire', 'atelier', 'hangar', 'antenne', 'infirmerie', 'formation',
];

const lvl = (S, id) => S.modules?.[id]?.level || 0;
const fn = name => (typeof App[name] === 'function' ? App[name] : null);
function safe(f, fallback) {
  try { return f(); } catch { return fallback; }
}

// Le module peut-il être construit / amélioré (hors chantier en cours) ?
function buildable(S, id) {
  const def = MODULES[id];
  if (!def) return null;
  const cur = lvl(S, id);
  const maxLvl = def.maxLevel + (safe(() => App.techEffectsAccumulated().moduleMaxLevelDelta[id], 0) || 0);
  if (cur >= maxLvl) return null;
  if (def.requireTech && !S.techCompleted?.[def.requireTech]) return null;
  const next = cur + 1;
  const req = safe(() => def.prereq(next), {}) || {};
  for (const k in req) if (lvl(S, k) < req[k]) return null;
  const cost = safe(() => def.cost(next), {}) || {};
  let affordable = true;
  for (const k in cost) {
    const have = k === 'datacubes_alien' ? (S.alienDatacubes || 0) : (S.res?.[k] || 0);
    if (have < cost[k]) affordable = false;
  }
  return { id, next, cost, affordable };
}

// Temps (ticks) avant qu'une ressource en baisse soit vide
function ticksToEmpty(S, k, rates) {
  const r = rates[k] || 0;
  if (r >= 0) return Infinity;
  return (S.res?.[k] || 0) / -r;
}

const nomMod = id => MODULES[id]?.nom || id;

// ---- Indices dynamiques (du plus urgent au moins urgent) ----
function hints(S) {
  const out = [];
  const rates = safe(() => computeRates(), {}) || {};
  const crew = safe(() => aliveCrew(), []) || [];

  // Énergie en baisse : à sec en moins de 2 h
  const tE = ticksToEmpty(S, 'energie', rates);
  if (tE < 2 * 3600) {
    out.push({
      id: 'energie', source: 'urgence', prio: 100,
      titre: "Stabiliser l'énergie",
      detail: (S.res?.energie || 0) < 1
        ? "Réserves vides : les modules tournent au ralenti. Un générateur de plus, ou moins de consommateurs."
        : `Bilan négatif : réserves à sec dans ${fmtDuree(tE)}. Améliore le générateur solaire.`,
      action: { onglet: 'base', sousOnglet: 'construction', cible: 'generateur_solaire', label: 'Générateur' },
    });
  }
  // Biomasse en baisse
  const tB = ticksToEmpty(S, 'biomasse', rates);
  if (tB < 2 * 3600 && crew.length > 0) {
    out.push({
      id: 'biomasse', source: 'urgence', prio: 95,
      titre: 'Nourrir la colonie',
      detail: (S.res?.biomasse || 0) < 1
        ? "Plus de vivres : le moral s'effondre. Agrandis l'hydroponie."
        : `Vivres épuisés dans ${fmtDuree(tB)}. Agrandis l'hydroponie.`,
      action: { onglet: 'base', sousOnglet: 'construction', cible: 'hydroponie', label: 'Hydroponie' },
    });
  }

  // Chantier à l'arrêt
  if (!S.build) {
    let pick = null;
    for (const id of BUILD_PRIORITY) {
      if (lvl(S, id) > 0) continue;
      const b = buildable(S, id);
      if (b) { pick = b; break; }
    }
    if (!pick) {
      // Amélioration la moins avancée parmi les bâtiments primaires, puis le reste
      const ids = [...PRIMAIRES, ...Object.keys(MODULES).filter(id => !PRIMAIRES.includes(id) && lvl(S, id) > 0)];
      const cands = ids.map(id => buildable(S, id)).filter(Boolean);
      cands.sort((a, b) => (b.affordable - a.affordable) || (a.next - b.next));
      pick = cands[0] || null;
    }
    if (pick) {
      const verbe = pick.next === 1 ? 'Construire' : 'Améliorer';
      out.push({
        id: 'chantier', source: 'conseil', prio: 80,
        titre: `${verbe} : ${nomMod(pick.id)}${pick.next > 1 ? ` (niv. ${pick.next})` : ''}`,
        detail: pick.affordable
          ? "Aucun chantier en cours. Le temps passé sans chantier est perdu."
          : "Aucun chantier en cours. Il manque encore quelques ressources.",
        action: { onglet: 'base', sousOnglet: 'construction', cible: pick.id, label: verbe },
      });
    }
  }

  // Loger un équipage
  if (safe(() => crewCap(), 0) === 0 && !(S.build?.id === 'habitat')) {
    out.push({
      id: 'habitat', source: 'conseil', prio: 70,
      titre: "Préparer l'accueil : l'Habitat",
      detail: "Sans couchettes, aucun colon ne peut rejoindre l'avant-poste.",
      action: { onglet: 'base', sousOnglet: 'construction', cible: 'habitat', label: 'Habitat' },
    });
  } else if (lvl(S, 'habitat') > 0 && !lvl(S, 'balise_recrutement') && S.build?.id !== 'balise_recrutement') {
    out.push({
      id: 'balise', source: 'conseil', prio: 65,
      titre: 'Appeler des renforts : la Balise',
      detail: "La balise de recrutement diffuse nos conditions d'engagement. Les candidats répondront.",
      action: { onglet: 'base', sousOnglet: 'construction', cible: 'balise_recrutement', label: 'Balise' },
    });
  }

  // Colons sans poste (hors volontairement libres)
  const isVol = fn('isVoluntarilyFree');
  const free = crew.filter(m => m.statut === 'libre' && !(isVol && safe(() => isVol(m), false)));
  if (free.length > 0 && Object.keys(S.modules || {}).length > 1) {
    out.push({
      id: 'postes', source: 'conseil', prio: 60,
      titre: free.length > 1 ? `Affecter ${free.length} colons` : `Affecter ${free[0].name}`,
      detail: 'Un colon à son poste fait tourner un bâtiment à plein régime.',
      action: { onglet: 'base', sousOnglet: 'postes', label: 'Postes' },
    });
  }

  // Envoyer une équipe : aucun colon dehors, un vaisseau à quai
  const away = crew.some(m => m.statut === 'expedition');
  const docked = (S.fleet || []).some(v => v.available);
  const ready = crew.filter(m => m.statut === 'libre' || m.statut === 'travail').length;
  if (!away && docked && ready > 0 && (S.expeditions || []).length === 0) {
    out.push({
      id: 'expedition', source: 'conseil', prio: 55,
      titre: 'Envoyer une équipe',
      detail: 'Un vaisseau attend à quai. Choisis une destination sur la carte.',
      action: { onglet: 'expeditions', sousOnglet: 'carte', label: 'Carte' },
    });
  }

  // Laboratoire à l'arrêt
  if (lvl(S, 'laboratoire') > 0 && (S.research || []).length === 0) {
    const some = Object.keys(TECH_TREE).some(id => safe(() => App.canResearch(id).ok, false));
    out.push({
      id: 'recherche', source: 'conseil', prio: some ? 50 : 20,
      titre: 'Lancer une recherche',
      detail: some ? 'Le laboratoire est inoccupé.' : 'Le laboratoire attend des datacubes.',
      action: { onglet: 'labo', sousOnglet: 'recherche', label: 'Recherche' },
    });
  }
  return out;
}

// ---- Étape courante du fil rouge « L'Avant-poste » ----
function arcObjective(S) {
  const arc = ARCS[ARC_ID];
  if (!arc) return null;
  const st = S.arcs?.[ARC_ID] || { completedSteps: [] };
  const done = Array.isArray(st.completedSteps) ? st.completedSteps : [];
  const step = arc.steps.find(s => !done.includes(s.id));
  if (!step) return null;
  const n = safe(() => aliveCrew().length, 0);
  const base = { id: 'fil_' + step.id, source: 'fil', fil: arc.nom, etape: step.title, prio: 40 };
  switch (step.id) {
    case 'ap_1':
      return { ...base, titre: 'Réunir dix colons', detail: `${step.title} · ${Math.min(n, 10)}/10 colons`,
        progression: { n: Math.min(n, 10), total: 10 }, action: { onglet: 'equipage', sousOnglet: 'recrutement', label: 'Recruter' } };
    case 'ap_4':
      return { ...base, titre: 'Atteindre vingt-cinq colons', detail: `${step.title} · ${Math.min(n, 25)}/25 colons`,
        progression: { n: Math.min(n, 25), total: 25 }, action: { onglet: 'equipage', sousOnglet: 'recrutement', label: 'Recruter' } };
    case 'ap_2':
    case 'ap_5': {
      const target = step.id === 'ap_2' ? 3 : 5;
      const ids = step.id === 'ap_2' ? PRIMAIRES : [...PRIMAIRES, 'laboratoire'];
      const ok = ids.filter(id => lvl(S, id) >= target).length;
      const lag = ids.slice().sort((a, b) => lvl(S, a) - lvl(S, b))[0];
      return { ...base, titre: `Bâtiments primaires au niveau ${target}`,
        detail: `${step.title} · ${ok}/${ids.length} — le plus en retard : ${nomMod(lag)} (niv. ${lvl(S, lag)})`,
        progression: { n: ok, total: ids.length }, action: { onglet: 'base', sousOnglet: 'construction', cible: lag, label: nomMod(lag) } };
    }
    case 'ap_3': {
      const f = (S.fleet || []).length;
      return { ...base, titre: 'Une flotte de trois vaisseaux', detail: `${step.title} · ${Math.min(f, 3)}/3 vaisseaux`,
        progression: { n: Math.min(f, 3), total: 3 }, action: { onglet: 'expeditions', sousOnglet: 'vaisseaux', label: 'Hangar' } };
    }
    default: {
      // Étape ajoutée par le contenu : son texte d'objectif s'il en a un
      const txt = step.objectif || step.indice || step.hint || '';
      return { ...base, titre: step.title, detail: txt || `Fil rouge : ${arc.nom}`, action: { onglet: 'recits', sousOnglet: 'filsrouges', label: 'Fil rouge' } };
    }
  }
}

export function getObjectives(S) {
  if (!S?.meta) return [];
  const hs = safe(() => hints(S), []);
  hs.sort((a, b) => b.prio - a.prio);
  const arc = safe(() => arcObjective(S), null);
  const picked = [];
  const seenCible = new Set();
  const room = arc ? 2 : 3;
  for (const h of hs) {
    if (picked.length >= room) break;
    const c = h.action?.cible;
    if (c && seenCible.has(c)) continue;
    if (c) seenCible.add(c);
    picked.push(h);
  }
  if (arc) picked.push(arc);
  // Moins de 3 : on complète avec les indices restants
  for (const h of hs) {
    if (picked.length >= 3) break;
    if (picked.includes(h) || (h.action?.cible && seenCible.has(h.action.cible))) continue;
    picked.push(h);
  }
  return picked.slice(0, 3).map(({ prio, ...o }) => ({ fait: false, ...o }));
}
