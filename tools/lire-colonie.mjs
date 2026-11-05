// tools/lire-colonie.mjs — lecture en terminal du contenu de la colonie :
// événements, incidents, fils rouges et pages d'archives. Appelé par
// tools/lire-histoire.mjs (npm run histoire -- <id>) quand l'id n'est pas une histoire.
//
//   npm run histoire -- marchand                 joue l'événement (choix au clavier)
//   npm run histoire -- mine_eboulement --tout   tous les choix et toutes les branches
//   npm run histoire -- marchand --choix 2       joue un choix précis (numéro affiché)
//   npm run histoire -- arc_avant_poste          étapes d'un fil rouge
//   npm run histoire -- effondrement             page d'archives
// Options : --equipe science=1,vigueur=8 (colons fictifs : 3 en compétences, 6 en
// caractéristiques par défaut), --monde ilya_confiance=2,maud=amie (drapeaux globaux).

import readline from 'node:readline/promises';
import { chargerContenu, branchesDe } from './contenu.mjs';

const TTY = process.stdout.isTTY;
const st = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const gras = s => st('1', s), ital = s => st('3', s), gris = s => st('2', s), ambre = s => st('33', s), vert = s => st('32', s), rouge = s => st('31', s);
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
const terminal = s => s.replace(/\*\*(.+?)\*\*/g, (_, x) => gras(x)).replace(/\*(.+?)\*/g, (_, x) => ital(x));

// Liste du contenu de la colonie (pour lire-histoire sans argument)
export async function listeColonie() {
  const { contenu: C } = await chargerContenu();
  const lignes = [];
  lignes.push('Événements de colonie :');
  for (const e of C.EVENEMENTS) lignes.push(`  ${e.id.padEnd(24)} ${e.titre}${e.personnage ? ' — ' + C.PERSONNAGES[e.personnage]?.nom : ''}${e.spontane === false ? ' (fil rouge)' : ''}`);
  lignes.push('Incidents :');
  for (const i of C.INCIDENTS) lignes.push(`  ${i.id.padEnd(24)} ${i.titre} — ${i.module}, ${i.gravite}`);
  lignes.push('Fils rouges :');
  for (const a of C.ARCS) lignes.push(`  ${a.id.padEnd(24)} ${a.titre} — ${a.etapes.length} étapes`);
  lignes.push(`Archives : ${C.LORE.map(l => l.id).join(', ')}`);
  return lignes.join('\n');
}

// Lit un contenu de la colonie ; false si l'id est inconnu.
export async function lireContenuColonie(id, args) {
  const { contenu: C, vocab: V, N } = await chargerContenu();
  const opt = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  const ev = C.EVENEMENTS.find(x => x.id === id);
  const inc = C.INCIDENTS.find(x => x.id === id);
  const arc = C.ARCS.find(x => x.id === id);
  const page = C.LORE.find(x => x.id === id);
  if (!ev && !inc && !arc && !page) return false;

  // Monde fictif
  const spec = Object.fromEntries((opt('--equipe') || '').split(',').filter(Boolean).map(x => x.split('=')).map(([k, v]) => [k.trim(), Number(v)]));
  const competences = Object.fromEntries(Object.keys(V.COMPETENCES).map(k => [k, spec[k] ?? 3]));
  const caracs = Object.fromEntries(Object.keys(V.CARACS).map(k => [k, spec[k] ?? 6]));
  const monde = Object.fromEntries((opt('--monde') || '').split(',').filter(Boolean).map(x => x.split('=')).map(([k, v]) => [k.trim(), v === 'true' ? true : v === 'false' ? false : (Number.isFinite(Number(v)) ? Number(v) : v)]));
  const noms = [['Alex Moreau', 'il'], ['Sam Okoye', 'elle'], ['Camille Ren', 'iel'], ['Noor Hassan', 'elle']];
  const colons = noms.map(([nom, pronoms], i) => ({ id: 'c' + i, nom, pronoms, competences, caracs, traits: [] }));
  const acteurs = Object.fromEntries(Object.keys(ev?.acteurs || {}).map((k, i) => [k, colons[i % colons.length]]));
  const lire = ident => {
    const [ns, a, b] = ident.split('.');
    if (ns === 'equipe') {
      if (a === 'carac') return Math.max(...colons.map(m => m.caracs[b] ?? 5));
      if (a === 'trait') return false;
      if (a === 'objet') return 1;
      if (a === 'taille') return colons.length;
      return Math.max(...colons.map(m => m.competences[a] || 0));
    }
    if (ns === 'monde') return monde[ident.slice(6)];
    if (ns === 'colonie' && a === 'res') return 999;
    if (ns === 'colonie' && a === 'colons') return 8;
    if (ns === 'colonie' && a === 'vivres_ok') return true;
    if (ns === 'evenement' && b === 'fois') return Number(opt('--fois') || 0);
    return undefined;
  };
  const env = {
    condition: src => { try { return N.condition(src, lire); } catch { return false; } },
    gabarit: nom => {
      if (nom === 'colonie') return 'Avant-poste';
      if (nom === 'module') return inc?.module || 'le module';
      if (nom === 'victime') return colons[1];
      if (nom === 'acteur') return colons[0];
      if (nom === 'secondaire') return colons[1];
      if (nom === 'recrue') return { nom: 'Lou Varga', pronoms: 'elle' };
      if (nom.startsWith('pnj:')) { const p = C.PERSONNAGES[nom.slice(4)]; return p ? { nom: p.nom, pronoms: p.pronoms } : `[${nom}]`; }
      const m = /^(\w+)\.age$/.exec(nom);
      if (m && acteurs[m[1]]) return '35';
      if (acteurs[nom]) return acteurs[nom];
      return null;
    },
  };
  const afficher = t => { for (const p of N.rendreTexte(t, env).paragraphes) console.log(plier(terminal(p.source)) + '\n'); };
  const resumeEffet = e => {
    const [k] = Object.keys(e), v = e[k];
    return `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`;
  };

  if (page) {
    console.log(gras(page.titre) + gris(`  [${page.id} · ${V.CATEGORIES_LORE[page.categorie] || page.categorie}]`));
    console.log(gris(`Débloquée quand : ${page.si}`) + '\n');
    if (page.resume) console.log(ital(plier(N.rendreTexte(page.resume, env).brut)) + '\n');
    afficher(page.texte);
    return true;
  }
  if (arc) {
    console.log(gras(arc.titre) + gris(`  [${arc.id}${arc.surtitre ? ' · ' + arc.surtitre : ''}]`));
    console.log(plier(arc.intro || '') + '\n');
    console.log(gris(`Ouverture : ${arc.ouverture ?? 'vrai'}${arc.indiceOuverture ? ' — ' + arc.indiceOuverture : ''}`));
    arc.etapes.forEach((e, i) => {
      console.log(ambre(`\n${i + 1}. ${e.titre}`) + gris(`  [${e.id}]`));
      console.log(gris(`   quand : ${e.quand}${e.scene ? ` · scène : ${e.scene}` : ''}`));
      if (e.indice) console.log(gris(`   indice : ${e.indice}`));
      const o = Array.isArray(e.objectif) ? e.objectif.at(-1) : e.objectif;
      if (o) console.log(gris(`   objectif : ${o.titre} → ${o.action?.onglet}/${o.action?.sousOnglet || ''}${o.action?.cible ? ' (' + o.action.cible + ')' : ''}`));
      console.log(plier(e.texte, '   '));
    });
    if (arc.recompense) console.log(vert(`\nRécompense : ${arc.recompense.titre || ''}`) + gris(` ${(arc.recompense.effets || []).map(resumeEffet).join(' ; ')}`));
    return true;
  }

  const def = ev || inc;
  const entete = ev
    ? `Événement${ev.theme ? ' · ' + ev.theme : ''}${ev.personnage ? ' · ' + C.PERSONNAGES[ev.personnage]?.nom : ''}`
    : `Incident · ${V.GRAVITES[inc.gravite]?.nom || inc.gravite} · ${inc.module}${inc.niveauMin ? ' (niv ' + inc.niveauMin + '+)' : ''}`;
  console.log(gris(entete));
  console.log(gras(def.titre) + gris(`  [${def.id}]`));
  const regles = [];
  if (def.si) regles.push('si ' + def.si);
  if (ev?.delai) regles.push('délai ' + ev.delai);
  if (ev?.delaiActeur) regles.push('délai par acteur ' + ev.delaiActeur);
  if (ev?.unique) regles.push('unique');
  if (ev?.spontane === false) regles.push('ouvert par un fil rouge');
  for (const [k, s] of Object.entries(ev?.acteurs || {})) regles.push(`{${k}} = ${acteurs[k].nom}${s.parmi ? ' parmi ' + s.parmi : ''}${s.filtre ? ' où ' + s.filtre : ''}${s.prefere ? ' (de préférence ' + s.prefere + ')' : ''}`);
  if (regles.length) console.log(gris(regles.join(' · ')));
  console.log(gris(`Colons fictifs : ${colons.map(m => m.nom).join(', ')} · monde ${JSON.stringify(monde)}\n`));
  afficher(def.texte);

  const envChoix = { lire, equipe: colons, equipeRequise: false, objetEmbarque: () => 1, peutPayer: () => [], nom: (g, x) => x };
  const visibles = def.choix.map((c, i) => ({ c, i, a: N.analyserChoix(c, envChoix) })).filter(x => x.a.visible);
  const decrire = (x, k) => {
    const details = [];
    if (x.c.si) details.push('si ' + x.c.si);
    if (x.c.requiert) details.push('requiert ' + x.c.requiert);
    if (x.c.cout) details.push('coût ' + JSON.stringify(x.c.cout));
    if (x.c.consomme) details.push('consomme ' + x.c.consomme);
    if (x.a.test) details.push(`test ${x.a.test.libelle} ${x.a.test.difficulte} (${Math.round(x.a.chance * 100)} %)`);
    console.log(`  ${k + 1}. ${N.rendreTexte(x.c.label, env).brut}${details.length ? gris('  {' + details.join(' ; ') + '}') : ''}`);
  };
  const jouerBranche = (nom, liste) => {
    if (nom) console.log(ambre(`   [${nom}]`));
    for (const e of liste) {
      const [k] = Object.keys(e);
      if (k === 'texte') afficher(e.texte);
      else console.log(vert(`   + ${resumeEffet(e)}`));
    }
  };
  if (args.includes('--tout')) {
    visibles.forEach((x, k) => {
      console.log('');
      decrire(x, k);
      for (const [nom, liste] of branchesDe(x.c)) jouerBranche(nom, liste);
    });
    const caches = def.choix.length - visibles.length;
    if (caches) console.log(gris(`\n(${caches} choix caché(s) par leur condition « si » : --monde pour les voir)`));
    return true;
  }
  visibles.forEach(decrire);
  if (!visibles.length) { console.log(rouge('  Aucun choix visible.')); return true; }
  let k = Number((opt('--choix') || '').split(',')[0]);
  if (!(k >= 1 && k <= visibles.length)) {
    if (!process.stdin.isTTY) k = 1;
    else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      for (;;) { k = Number((await rl.question(ambre('Choix ? '))).trim()); if (k >= 1 && k <= visibles.length) break; }
      rl.close();
    }
  }
  console.log('');
  for (const [nom, liste] of branchesDe(visibles[k - 1].c)) jouerBranche(nom, liste);
  return true;
}
