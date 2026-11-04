#!/usr/bin/env node
// tools/lire-histoire.mjs — jouer ou parcourir une histoire dans le terminal,
// sans lancer le jeu ni attendre une expédition.
//
// Usage :
//   node tools/lire-histoire.mjs                    liste des histoires
//   node tools/lire-histoire.mjs <id>               joue l'histoire (choix au clavier)
//   node tools/lire-histoire.mjs <id> --tout        liste tous les chemins jusqu'à chaque fin
//   node tools/lire-histoire.mjs <id> --choix 2,1,3 joue une suite de choix donnée (numéros affichés)
// Options :
//   --equipe science=3,linguistique=1,sangfroid=7   équipe fictive (compétences 0-5, caractéristiques 1-10) ;
//                                                   par défaut 3 partout et 6 en caractéristiques
//   --objets lance_flammes,serum_xeno               objets embarqués
//   --drapeaux                                      affiche les drapeaux après chaque choix
//   --max 500                                       (--tout) nombre maximal de chemins listés
// npm run histoire -- <id> [options]

import readline from 'node:readline/promises';
import { chargerContenu, cheminsHistoire, branchesDe } from './contenu.mjs';

const { contenu: C, vocab: V, N } = await chargerContenu();
const args = process.argv.slice(2);
const opt = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const flag = nom => args.includes(nom);
const id = args.find((a, i) => !a.startsWith('--') && !['--equipe', '--objets', '--choix', '--max'].includes(args[i - 1]));

const H = C.HISTOIRES;
if (!id) {
  console.log('Histoires :');
  for (const h of Object.values(H)) console.log(`  ${h.id.padEnd(20)} ${h.titre} — ${h.episodes.length} épisodes, ${Object.keys(h.scenes).length} scènes, ${Object.keys(h.fins).length} fins`);
  console.log('\nnpm run histoire -- <id> [--tout] [--choix 1,2,1] [--equipe science=3] [--drapeaux]');
  process.exit(0);
}
const h = H[id];
if (!h) { console.error(`Histoire inconnue « ${id} ». Histoires : ${Object.keys(H).join(', ')}`); process.exit(1); }

// ---- Mise en forme terminal ----
const TTY = process.stdout.isTTY;
const st = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const gras = s => st('1', s), ital = s => st('3', s), gris = s => st('2', s), ambre = s => st('33', s), rouge = s => st('31', s), vert = s => st('32', s);
const largeur = Math.min(process.stdout.columns || 88, 100) - 4;
function plier(s, indent = '  ') {
  const out = [];
  for (const para of String(s).split('\n')) {
    let ligne = '';
    for (const mot of para.split(/\s+/)) {
      if ((ligne + ' ' + mot).trim().length > largeur) { out.push(indent + ligne.trim()); ligne = mot; } else ligne += ' ' + mot;
    }
    out.push(indent + ligne.trim());
  }
  return out.join('\n');
}
// Texte source (avec *italique* / **gras**) → terminal
const terminal = s => s.replace(/\*\*(.+?)\*\*/g, (_, x) => gras(x)).replace(/\*(.+?)\*/g, (_, x) => ital(x));

if (flag('--tout')) {
  const max = Number(opt('--max')) || 2000;
  const chemins = cheminsHistoire(N, h, { max });
  const parFin = {};
  for (const c of chemins) (parFin[c.fin] ||= []).push(c);
  console.log(gras(`${h.titre}`) + ` — ${chemins.length} chemin(s)${chemins.length >= max ? ` (limite ${max} atteinte : --max)` : ''}\n`);
  for (const [fin, list] of Object.entries(parFin)) {
    const f = h.fins[fin];
    console.log(ambre(`⇒ ${f ? f.titre + ' (' + fin + ')' : fin}`) + gris(` — ${list.length} chemin(s)`));
    if (f) console.log(gris(plier(N.rendreTexte(f.texte, { gabarit: n => ({ colonie: 'Avant-poste', vaisseau: 'L’Albatros', lieu: 'Kepler-442 b' })[n] ?? null }).brut, '    ')));
    for (const c of list) {
      const etapes = c.pas.map(p => `${p.scene} › « ${p.choix} »${p.branche ? ' [' + p.branche + ']' : ''}${p.requiert ? gris(' {' + p.requiert + '}') : ''}`);
      console.log('  - ' + etapes.join(gris(' → ')));
    }
    console.log('');
  }
  const manquantes = Object.keys(h.fins).filter(f => !parFin[f]);
  if (manquantes.length) console.log(rouge(`Fins jamais atteintes : ${manquantes.join(', ')}`));
  process.exit(0);
}

// ---- Partie jouée ----
const equipeSpec = Object.fromEntries((opt('--equipe') || '').split(',').filter(Boolean).map(x => x.split('=')).map(([k, v]) => [k.trim(), Number(v)]));
const competences = Object.fromEntries(Object.keys(V.COMPETENCES).map(k => [k, equipeSpec[k] ?? 3]));
const caracs = Object.fromEntries(Object.keys(V.CARACS).map(k => [k, equipeSpec[k] ?? 6]));
const equipe = [
  { id: 'a', nom: 'Alex Moreau', pronoms: 'il', competences, caracs, traits: [] },
  { id: 'b', nom: 'Sam Okoye', pronoms: 'elle', competences, caracs, traits: [] },
];
const objets = new Set((opt('--objets') || '').split(',').filter(Boolean));
const flags = { ...h.drapeaux };
const lire = ident => {
  if (!ident.includes('.')) return flags[ident];
  const [ns, a, b] = ident.split('.');
  if (ns === 'equipe') {
    if (a === 'carac') return Math.max(...equipe.map(m => m.caracs[b] ?? 5));
    if (a === 'trait') return equipe.some(m => m.traits.includes(b));
    if (a === 'objet') return objets.has(b) ? 1 : 0;
    if (a === 'taille') return equipe.length;
    return Math.max(...equipe.map(m => m.competences[a] || 0));
  }
  if (ns === 'colonie' && a === 'res') return 999;
  if (ns === 'colonie' && a === 'colons') return 8;
  return undefined;
};
const PERS = { 'equipe.chef': equipe[0], 'equipe.medecin': equipe[1], 'equipe.hasard': equipe[1], acteur: equipe[0], victime: equipe[1], secondaire: equipe[1] };
const env = {
  condition: src => N.condition(src, lire),
  gabarit: nom => {
    if (nom === 'vaisseau') return 'L’Albatros';
    if (nom === 'lieu' || nom === 'planete') return 'Kepler-442 b';
    if (nom === 'systeme') return 'Kepler-442';
    if (nom === 'colonie') return 'Avant-poste';
    if (PERS[nom]) return PERS[nom];
    if (nom.startsWith('pnj:')) { const p = h.personnages?.[nom.slice(4)]; return p ? { nom: p.nom, pronoms: p.pronoms } : null; }
    if (nom.startsWith('decor.')) return `[décor : ${nom.slice(6)}]`;
    return null;
  },
};
const envChoix = { lire, equipe, objetEmbarque: o => (objets.has(o) ? 1 : 0), peutPayer: () => [], nom: (g, x) => x };
const afficher = t => { const r = N.rendreTexte(t, env); for (const p of r.paragraphes) console.log(plier(terminal(p.source)) + '\n'); };

const scriptes = (opt('--choix') || '').split(',').filter(Boolean).map(Number);
const rl = scriptes.length ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
let lignesStdin = null;
async function demander(question, n) {
  if (scriptes.length) { const v = scriptes.shift(); console.log(gris(`${question} ${v}`)); return v; }
  if (!process.stdin.isTTY) {
    lignesStdin ||= (await new Promise(r => { let d = ''; process.stdin.on('data', x => { d += x; }); process.stdin.on('end', () => r(d.split(/\s+/).filter(Boolean))); }));
    const v = Number(lignesStdin.shift());
    console.log(gris(`${question} ${v}`));
    return v;
  }
  for (;;) {
    const v = Number((await rl.question(ambre(question + ' '))).trim());
    if (Number.isInteger(v) && v >= 1 && v <= n) return v;
    console.log(gris(`  (un numéro entre 1 et ${n})`));
  }
}

console.log(gras(h.titre) + (h.accroche ? gris(' — ' + h.accroche) : ''));
console.log(gris(`Équipe fictive : ${equipe.map(m => m.nom).join(', ')} · compétences ${JSON.stringify(competences)} · objets ${[...objets].join(', ') || 'aucun'}\n`));
let fin = null;
episodes: for (let e = 0; e < h.episodes.length; e++) {
  const ep = h.episodes[e];
  console.log(ambre(gras(`━━ Épisode ${e + 1} : ${ep.titre} ━━`)) + (e ? gris(`  (${h.rythme?.entreEpisodes || '18h'} plus tard)`) : ''));
  if (ep.intro) afficher(ep.intro);
  let sid = ep.debut;
  for (let pas = 0; pas < 100; pas++) {
    const sc = h.scenes[sid];
    console.log(gras(`▸ ${sc.titre || sid}`) + gris(`  [${sid}]`));
    afficher(sc.texte);
    const visibles = sc.choix.map((c, i) => ({ c, i, a: N.analyserChoix(c, envChoix) })).filter(x => x.a.visible);
    if (!visibles.length) { console.log(rouge('  Impasse : aucun choix visible.')); break episodes; }
    visibles.forEach((x, k) => {
      const details = [];
      if (x.c.si) details.push('si ' + x.c.si);
      if (x.c.requiert) details.push('requiert ' + x.c.requiert);
      if (x.c.cout) details.push('coût ' + JSON.stringify(x.c.cout));
      if (x.c.consomme) details.push('consomme ' + x.c.consomme);
      if (x.a.test) details.push(`test ${x.a.test.libelle} ${x.a.test.difficulte} (${Math.round(x.a.chance * 100)} %)`);
      const label = N.rendreTexte(x.c.label, env).brut;
      console.log(`  ${k + 1}. ${x.a.disponible ? label : gris(label + ' — ' + x.a.raison)}${details.length ? gris('  {' + details.join(' ; ') + '}') : ''}`);
    });
    const k = await demander('Choix ?', visibles.length);
    const { c } = visibles[k - 1] || visibles[0];
    const branches = branchesDe(c);
    let liste = branches[0][1];
    if (branches.length > 1) {
      console.log(gris('  Issue : ' + branches.map(([nom], j) => `${j + 1}. ${nom}`).join('  ')));
      const b = await demander('Branche ?', branches.length);
      liste = (branches[b - 1] || branches[0])[1];
    }
    for (const eff of liste) {
      const [type] = Object.keys(eff);
      if (type === 'texte') { console.log(''); afficher(eff.texte); }
      else if (type === 'drapeau') N.appliquerDrapeaux(flags, eff.drapeau);
      else if (!['aller', 'finEpisode', 'fin', 'retraite', 'rentrer', 'combat'].includes(type)) console.log(vert(`  + ${type} ${JSON.stringify(eff[type])}`));
    }
    if (flag('--drapeaux')) console.log(gris('  drapeaux : ' + JSON.stringify(flags)));
    const issue = N.issueDe(liste);
    if (!issue) { console.log(rouge('  Pas d’issue : l’épisode se termine (à corriger : ajouter aller / finEpisode / fin).')); continue episodes; }
    if (issue.type === 'aller') { sid = issue.valeur; console.log(''); continue; }
    if (issue.type === 'finEpisode') { console.log(gris('\n  — fin de l’épisode —\n')); continue episodes; }
    if (issue.type === 'fin') { fin = issue.valeur; break episodes; }
    console.log(gris(`\n  — ${issue.type} : l’équipe rentre, l’épisode reprendra —`));
    break episodes;
  }
}
if (fin) {
  const f = h.fins[fin];
  console.log(ambre(gras(`\n⇒ Fin : ${f?.titre || fin}`)));
  if (f) afficher(f.texte);
}
console.log(gris('Drapeaux finaux : ' + JSON.stringify(flags)));
rl?.close();
