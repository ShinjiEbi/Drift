#!/usr/bin/env node
/* global window, document */  // utilisé dans les callbacks exécutés par le navigateur (page.evaluate)
// tools/regress/combat.mjs — non-régression du combat au tour par tour (0.31/0.31b).
// Usage : NODE_PATH=$(npm root -g) node tools/regress/combat.mjs
// Couvre : étourdissement décompté (E10), équipement réparti (M8), bonus IEM,
// graine des jets (cbt.seq), soin (trousse + compétence), butin plafonné à la soute
// et ressource « composants », retraite avec attaques d'opportunité (F3), bonus de
// technologies (E9), reprise d'une sauvegarde faite en plein combat (0.32.0).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
  console.error('Playwright introuvable (définis NODE_PATH=$(npm root -g)).'); process.exit(2);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.error('  ✗ ' + msg); } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.dismiss());

// Outils installés dans la page : colons de test, expédition prête au combat.
async function installHelpers() {
  await page.evaluate(async () => {
    const st = await import('./src/state.js');
    const app = await import('./src/app.js');
    const cat = await import('./src/catalog.js');
    const S = st.S;
    let n = 0;
    window.__t = {
      st, app, cat, S,
      member(over = {}) {
        const m = { ...st.genCandidate(), id: 'm_t' + (n++), name: 'Testeur ' + n, age: 30, statut: 'expedition', sante: 100, moral: 70, loyaute: 60,
          birthGameMin: 0, stats: { vigueur: 5, dexterite: 5, intellect: 5, sangfroid: 5, charisme: 5 },
          skills: { combat: 1, science: 0, ingenierie: 0, medecine: 0, pilotage: 0, linguistique: 0, survie: 0 },
          traits: [], statuts: [], sequels: [], blessures: [], ...over };
        S.crew.push(m);
        return m;
      },
      // Lance un combat contre `enemies` avec l'équipement donné ; renvoie l'expédition.
      fight(enemies, equipment = {}, { members, vesselType = 'cuirasse', loot = {}, lootOnWin = {} } = {}) {
        const team = members || [this.member(), this.member(), this.member()];
        const vid = 'v_t' + (n++);
        S.fleet.push({ id: vid, type: vesselType, name: 'Test', available: false });
        const sid = '__t_scene_' + (n++);
        cat.SCENES.push({ id: sid, tags: ['__test__'], text: '', choices: [{ label: 'x', outcome: { combat: { enemies, lootOnWin, onDefeat: 'retreat' } } }] });
        const exp = { id: 'e_t' + (n++), vesselId: vid, bodyId: 'x', systemId: 'x', crewIds: team.map(m => m.id), phase: 'sur_place',
          elapsedMin: 0, oneWayMin: 10, seed: 'regress|' + n, scenes: [sid, sid], sceneIdx: 0, awaitingChoice: true,
          accumulatedLoot: { ...loot }, accumulatedItems: [], accumulatedLog: [], equipment: { ...equipment } };
        S.expeditions.push(exp);
        app.playChoice(exp.id, 0);
        return exp;
      },
    };
  });
}

try {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J1'), null, { timeout: 10000 });
  await installHelpers();

  console.log('E10 — l\'étourdissement ne dure qu\'une attaque');
  const stun = await page.evaluate(() => {
    const { app } = window.__t;
    const exp = window.__t.fight(['gardien_antique'], { grenade_concussion: 1 });
    const cbt = exp.combat;
    const a = cbt.allies[0];
    app.combatAllyAction(exp.id, a.id, 'grenade', 0);
    const stunned = cbt.enemies[0].effects.some(e => e.type === 'stunned');
    const logLen = cbt.log.length;
    app.combatEndTurn(exp.id);                       // phase ennemie 1 : saute son attaque
    const phase1 = cbt.log.slice(logLen).join('\n');
    const effectsAfter = cbt.enemies[0].effects.length;
    const l2 = cbt.log.length;
    app.combatEndTurn(exp.id);                       // phase ennemie 2 : doit attaquer
    const phase2 = cbt.log.slice(l2).join('\n');
    return { stunned, phase1, effectsAfter, phase2 };
  });
  check(stun.stunned, 'la grenade à concussion étourdit l\'ennemi');
  check(/étourdi — passe son attaque/.test(stun.phase1), 'l\'ennemi étourdi saute sa première attaque');
  check(stun.effectsAfter === 0, 'l\'effet est purgé après la phase ennemie');
  check(/Gardien antique (→|attaque)/.test(stun.phase2) && !/passe son attaque/.test(stun.phase2), 'l\'ennemi attaque de nouveau au round suivant');

  console.log('M8 — équipement réparti, explosifs exclus des armes, IEM vs machines');
  const gear = await page.evaluate(() => {
    const { app } = window.__t;
    const exp = window.__t.fight(['gardien_antique'], { mine_eclats: 1, bouclier_energetique: 1, pistolet_plasma: 1 });
    const cbt = exp.combat;
    const shielded = cbt.allies.filter(a => a.maxShieldHp > 0).length;
    const armed = cbt.allies.filter(a => a.weaponType === 'ranged').length;
    const bare = app.memberCombatStats(window.__t.S.crew.find(m => m.id === cbt.allies[0].id), {}).damage;
    const unarmedDamages = cbt.allies.filter(a => a.weaponType === 'melee').map(a => a.damage.join('-'));
    const allGear = cbt.allies.flatMap(a => a.gear);
    // IEM contre un drone (machine) : 4 + dégâts + d4 + bonus machine − armure (sans bonus : bien moins)
    const { ITEMS, ENEMY_TYPES } = window.__t.cat;
    const iemMin = 4 + ITEMS.grenade_iem.combat.damage + ITEMS.grenade_iem.combat.machineBonus - ENEMY_TYPES.drone_gardien.armor;
    const exp2 = window.__t.fight(['drone_gardien'], { grenade_iem: 1 });
    const e = exp2.combat.enemies[0];
    const hp0 = e.hp;
    app.combatAllyAction(exp2.id, exp2.combat.allies[0].id, 'grenade', 0);
    const dealt = hp0 - e.hp;
    const line = exp2.combat.log[exp2.combat.log.length - 1];
    return { shielded, armed, bare: bare.join('-'), unarmedDamages, allGear, category: e.category, dealt, line, iemMin };
  });
  check(gear.shielded === 1, `un seul bouclier énergétique → un seul allié protégé (${gear.shielded})`);
  check(gear.armed === 1, `un seul pistolet → un seul allié armé à distance (${gear.armed})`);
  check(!gear.allGear.includes('mine_eclats'), 'la mine à éclats n\'est portée par personne (réserve commune)');
  check(gear.unarmedDamages.every(d => d === gear.bare), 'les alliés sans arme n\'ont aucun bonus de dégâts (pas de +5 de la mine)');
  check(gear.category === 'machine', 'la catégorie de l\'ennemi est copiée dans le combat');
  check(gear.dealt >= gear.iemMin, `la grenade IEM applique son bonus contre les machines (${gear.dealt} ≥ ${gear.iemMin})`);
  check(gear.line.includes(String(gear.dealt)), `le journal affiche les dégâts réels (« ${gear.line} »)`);

  console.log('M8 — jets distincts pour des actions dans la même minute');
  const seq = await page.evaluate(() => {
    const { app, S } = window.__t;
    let identical = 0, total = 0;
    for (let k = 0; k < 12; k++) {
      const exp = window.__t.fight(['xenoforme_reine'], {});
      const cbt = exp.combat;
      const a = cbt.allies[0];
      const outs = [];
      const gm = S.meta.gameMin;
      while (a.pa > 0 && cbt.active) {
        const l = cbt.log.length;
        app.combatAllyAction(exp.id, a.id, 'attack', 0);
        outs.push(cbt.log.slice(l).join(''));
      }
      S.meta.gameMin = gm;
      total++;
      if (outs.length > 1 && outs.every(o => o === outs[0])) identical++;
    }
    return { identical, total };
  });
  check(seq.identical < seq.total / 2, `attaques successives non identiques (${seq.identical}/${seq.total} séries identiques)`);

  console.log('M8 — soin : effet de la trousse, refus sans trousse ni compétence');
  const heal = await page.evaluate(() => {
    const { app } = window.__t;
    const exp = window.__t.fight(['gardien_antique'], { nanobots_reparation: 1 });
    const cbt = exp.combat;
    const [a, b] = cbt.allies;
    b.hp = 1;                                        // 8 PV max pour un colon de Vigueur 5
    app.combatAllyAction(exp.id, a.id, 'heal', 0);
    const healed = b.hp - 1;
    const kitLeft = exp.equipment.nanobots_reparation || 0;
    // Sans trousse ni médecine : refusé, aucun PA dépensé
    const exp2 = window.__t.fight(['gardien_antique'], {});
    const [c, d] = exp2.combat.allies;
    d.hp = 1;
    const pa0 = c.pa;
    app.combatAllyAction(exp2.id, c.id, 'heal', 0);
    // Médecin (médecine 2) sans trousse : 3 + 2×2 = 7
    const medic = window.__t.member({ skills: { combat: 0, medecine: 2 } });
    const exp3 = window.__t.fight(['gardien_antique'], {}, { members: [medic, window.__t.member()] });
    const [m3, w3] = exp3.combat.allies;
    w3.hp = 1;
    app.combatAllyAction(exp3.id, m3.id, 'heal', 0);
    return { healed, kitLeft, refusedPa: c.pa === pa0, refusedHp: d.hp === 1, medicHeal: w3.hp - 1 };
  });
  check(heal.healed === 6 && heal.kitLeft === 0, `les nanobots soignent 6 PV et sont consommés (+${heal.healed})`);
  check(heal.refusedPa && heal.refusedHp, 'soin refusé sans trousse ni compétence (aucun PA dépensé)');
  check(heal.medicHeal === 7, `un médecin (Médecine 2) sans trousse soigne 7 PV (+${heal.medicHeal})`);

  console.log('M8 — butin plafonné à la soute, ressources inconnues ignorées');
  const loot = await page.evaluate(() => {
    const { app, S } = window.__t;
    const strong = () => window.__t.member({ skills: { combat: 5 }, stats: { vigueur: 9, dexterite: 9, intellect: 5, sangfroid: 9, charisme: 5 } });
    const exp = window.__t.fight(['meute_rapaces'], {}, { vesselType: 'vedette', loot: { metal: 55 }, lootOnWin: { biomasse: 45, composants: 8 }, members: [strong(), strong(), strong()] });
    let guard = 0;
    while (exp.combat.active && guard++ < 20) {
      for (const a of exp.combat.allies) while (exp.combat.active && a.hp > 0 && a.pa > 0) { S.meta.gameMin++; app.combatAllyAction(exp.id, a.id, 'attack', 0); }
      if (exp.combat.active) app.combatEndTurn(exp.id);
    }
    const total = Object.values(exp.accumulatedLoot).reduce((s, v) => s + v, 0);
    // Site déjà fouillé : exp.lootMult réduit aussi le butin de combat
    const exp2 = window.__t.fight(['meute_rapaces'], {}, { lootOnWin: { biomasse: 40 }, members: [strong(), strong(), strong()] });
    exp2.lootMult = 0.5;
    guard = 0;
    while (exp2.combat.active && guard++ < 20) {
      for (const a of exp2.combat.allies) while (exp2.combat.active && a.hp > 0 && a.pa > 0) { S.meta.gameMin++; app.combatAllyAction(exp2.id, a.id, 'attack', 0); }
      if (exp2.combat.active) app.combatEndTurn(exp2.id);
    }
    return { outcome: exp.combat.outcome, total, keys: Object.keys(exp.accumulatedLoot), log: exp.accumulatedLog.join(' | '),
      halved: exp2.combat.outcome === 'victory' ? exp2.accumulatedLoot.biomasse : 'défaite' };
  });
  check(loot.outcome === 'victory', 'combat gagné');
  check(loot.total <= 60, `butin total ≤ soute de la vedette (60) : ${loot.total}`);
  check(loot.keys.every(k => ['metal', 'cristal', 'energie', 'biomasse', 'datacubes'].includes(k)), `aucune ressource fantôme (${loot.keys.join(', ')})`);
  check(!/undefined/.test(loot.log) && /Soute pleine/.test(loot.log), 'journal propre, abandon du surplus signalé');
  check(loot.halved === 22, `exp.lootMult (0.5) réduit le butin de combat : (40 + 4) × 0.5 = ${loot.halved}`);

  console.log('F3 — la retraite coûte des attaques d\'opportunité');
  const retreat = await page.evaluate(() => {
    const { app } = window.__t;
    const exp = window.__t.fight(['pillard', 'pillard'], {});
    const cbt = exp.combat;
    const l = cbt.log.length;
    app.combatAllyAction(exp.id, cbt.allies[0].id, 'retreat', -1);
    const lines = cbt.log.slice(l);
    return { outcome: cbt.outcome, opp: lines.filter(x => /^Pillard (→|attaque)/.test(x)).length, head: lines[0], phase: exp.phase };
  });
  check(/attaques? d'opportunité/.test(retreat.head), `coût annoncé dans le journal (« ${retreat.head} »)`);
  check(retreat.opp === 2, `chaque ennemi actif attaque une fois (${retreat.opp})`);
  check(['retreat', 'defeat'].includes(retreat.outcome) && retreat.phase === 'retour', 'l\'expédition rentre après la retraite');

  console.log('E9 — technologies de combat appliquées');
  const tech = await page.evaluate(() => {
    const { app, S } = window.__t;
    const m = window.__t.member();
    const saved = S.techCompleted;
    S.techCompleted = {};
    const base = app.memberCombatStats(m, {});
    S.techCompleted = { tech_resonance_armee: { at: 0 }, tech_blindage: { at: 0 }, tech_camouflage_adaptatif: { at: 0 }, tech_armure_composite: { at: 0 } };
    const boosted = app.memberCombatStats(m, {});
    S.techCompleted = saved;
    return { base, boosted };
  });
  check(tech.boosted.accuracy > tech.base.accuracy && tech.boosted.damage[1] > tech.base.damage[1], `Résonance armée : précision ${tech.base.accuracy}→${tech.boosted.accuracy}, dégâts max ${tech.base.damage[1]}→${tech.boosted.damage[1]}`);
  check(tech.boosted.dodge > tech.base.dodge && tech.boosted.armor > tech.base.armor, `menace réduite : esquive ${tech.base.dodge}→${tech.boosted.dodge}, armure ${tech.base.armor}→${tech.boosted.armor}`);

  console.log('Compatibilité — sauvegarde 0.32.0 faite en plein combat');
  await page.evaluate(() => {
    const { S, st } = window.__t;
    const exp = window.__t.fight(['drone_gardien', 'pillard'], { grenade_iem: 1 });
    const cbt = exp.combat;
    delete cbt.seq;                                   // champs absents en 0.32.0
    for (const e of cbt.enemies) delete e.category;
    for (const a of cbt.allies) delete a.gear;
    cbt.enemies[1].effects = [{ type: 'stunned', turnsLeft: 1 }];
    cbt.lootOnWin = { metal: 5, composants: 8 };
    exp.accumulatedLoot = { metal: 10, composants: 5 };
    S.res.composants = 12;
    window.localStorage.setItem('__regress_exp', exp.id);
    st.save();
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#gameTime')?.textContent?.includes('J'), null, { timeout: 10000 });
  await page.waitForTimeout(1500);   // quelques ticks : purge de « composants »
  await installHelpers();
  const legacy = await page.evaluate(() => {
    const { app, S } = window.__t;
    const exp = S.expeditions.find(e => e.id === window.localStorage.getItem('__regress_exp'));
    if (!exp?.combat?.active) return { found: false };
    const cbt = exp.combat;
    const drone = cbt.enemies[0];
    const hp0 = drone.hp;
    app.combatAllyAction(exp.id, cbt.allies[0].id, 'grenade', 0);
    const iem = hp0 - drone.hp;
    app.combatEndTurn(exp.id);
    const stunPurged = !cbt.enemies[1].effects?.length;
    return { found: true, seq: cbt.seq, iem, stunPurged, resComposants: S.res.composants, lootComposants: exp.accumulatedLoot.composants, metal: exp.accumulatedLoot.metal };
  });
  check(legacy.found, 'le combat en cours est relu');
  check(legacy.found && legacy.seq > 0, 'le compteur de jets démarre sur une sauvegarde sans seq');
  check(legacy.found && legacy.iem >= gear.iemMin, `bonus IEM appliqué sans « category » sauvegardée (${legacy.iem})`);
  check(legacy.found && legacy.stunPurged, 'étourdissement hérité purgé après une phase ennemie');
  check(legacy.found && legacy.resComposants === undefined && legacy.lootComposants === undefined && legacy.metal >= 15, '« composants » converti en métal (stock et soute)');

  const errs = [...new Set(pageErrors)];
  check(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) {
  failures.push('exception : ' + e.message);
  console.error('  ✗ exception : ' + e.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) { console.error(`\n✗ ${failures.length} échec(s)`); process.exit(1); }
console.log('\n✓ Non-régression combat : OK');
