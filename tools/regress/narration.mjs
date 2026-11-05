#!/usr/bin/env node
// tools/regress/narration.mjs — moteur narratif V1 (src/engine/narration.js) et
// validateur de contenu (tools/check-content.mjs), sans navigateur.
// Usage : node tools/regress/narration.mjs
//
// Couvre : durées réelles, mini-langage de conditions (priorités, et/ou/non, dans,
// nombres négatifs, erreurs), textes (paragraphes, variantes, *italique*,
// typographie, gabarits, accords), choix (caché, raison lisible, coût, objet,
// chance, colon qui agit), drapeaux, et la détection d'erreurs de contenu injectées.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const N = await import(pathToFileURL(path.join(ROOT, 'src/engine/narration.js')).href);
const failures = [];
const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.error('  ✗ ' + msg); } };
const leve = fn => { try { fn(); return null; } catch (e) { return e.message; } };

console.log('Durées réelles (1 tick = 1 s)');
check(N.parseDuree('18h') === 64800 && N.parseDuree('30min') === 1800 && N.parseDuree('3j') === 259200, "'18h', '30min', '3j'");
check(N.parseDuree('1j12h') === 129600 && N.parseDuree('2h30') === 9000 && N.parseDuree(45) === 45, "'1j12h', '2h30', nombre");
check(Number.isNaN(N.parseDuree('demain')) && Number.isNaN(N.parseDuree('12')), 'durée invalide → NaN');

console.log('Conditions');
const flags = { confiance: 2, maelle: 'rencontree', lanterne: false, rien: null };
const lire = id => (id.includes('.') ? { 'equipe.science': 3, 'corps.biome': 'ocean', 'faction.reputation': -70 }[id] : flags[id]);
const c = src => N.condition(src, lire);
check(c("confiance >= 2 && maelle == 'rencontree'") && !c('lanterne') && c('!lanterne') && c('non lanterne'), 'comparaisons, &&, !, non');
check(c("lanterne || confiance > 1") && c("lanterne ou confiance > 1") && !c("lanterne et confiance > 1"), '||, ou, et');
check(c("lanterne || confiance > 1 && maelle != 'inconnue'") && !c("(lanterne || confiance > 1) && maelle == 'inconnue'"), 'priorités et parenthèses');
check(c("corps.biome dans ['ocean', 'glace']") && !c("corps.biome dans ['desert']"), 'dans [liste]');
check(c('faction.reputation <= -60') && !c('faction.reputation > -60'), 'nombres négatifs');
check(c('rien == nul') && c('inconnu_x == nul') && !c('rien >= 0') && c('vrai') && !c('faux'), 'null, valeurs absentes, vrai/faux');
check(c(undefined) === true && c(true) === true, 'condition absente = vraie');
check(/incomplète/.test(leve(() => N.compiler('confiance >=')) || '') && /manquante/.test(leve(() => N.compiler('(confiance > 1')) || '')
  && /inattendu/.test(leve(() => N.compiler('confiance > 1 maelle')) || leve(() => N.compiler('confiance = 1')) || ''), 'erreurs de syntaxe lisibles');
check(JSON.stringify(N.identifiants("equipe.science >= 2 && !lanterne")) === '["equipe.science","lanterne"]', 'identifiants');
check(JSON.stringify(N.comparaisons("corps.biome dans ['ocean'] && maelle == 'x'")) === '[{"id":"corps.biome","op":"dans","valeurs":["ocean"]},{"id":"maelle","op":"==","valeurs":["x"]}]', 'comparaisons littérales');

console.log('Textes');
const gab = { 'equipe.chef': { nom: 'Vikram Rao', pronoms: 'il' }, acteur: { nom: 'Lin <Ha>', pronoms: 'elle' }, victime: { nom: 'Sam' }, vaisseau: 'L’Albatros' };
const env = { condition: s => c(s), gabarit: n => gab[n] ?? null };
const t = N.rendreTexte([
  "{vaisseau} se pose. C'est *calme*.\n\nDeux : « oui » ?",
  { si: 'confiance >= 2', texte: '{equipe.chef} sourit.' },
  { si: 'lanterne', texte: 'jamais' },
  { unParmi: [{ si: 'lanterne', texte: 'A' }, { si: 'confiance >= 1', texte: 'B' }, { texte: 'C' }] },
  '{acteur} est prêt{acteur.e}, {acteur|il|elle} hésite. {victime|il|elle} et {victime|prêt|prête}. **Fin**.',
], env);
check(t.paragraphes.length === 5, `paragraphes : ligne vide, si, unParmi (${t.paragraphes.length})`);
check(t.paragraphes[0].html === 'L’Albatros se pose. C’est <em>calme</em>.' && t.paragraphes[3].brut === 'B', 'gabarit, apostrophe courbe, *italique*, première variante vraie');
check(t.paragraphes[1].brut === 'Deux : « oui » ?', 'espaces insécables avant : ? » et après «');
check(t.paragraphes[4].html === 'Lin &lt;Ha&gt; est prête, elle hésite. il/elle et prêt·e. <strong>Fin</strong>.', `accords selon les pronoms, neutre sinon, échappement (${t.paragraphes[4].html})`);
check(t.html.startsWith('<p>') && t.brut.split('\n\n').length === 5, 'html en <p>, brut séparé par des lignes vides');
check(N.htmlDepuisSource(t.paragraphes.map(p => p.source)) === t.html, 'source (sans HTML, pour la sauvegarde) → même HTML');
check(N.rendreTexte('{inconnu} ici', { gabarit: () => null, inconnu: () => '' }).brut === ' ici', 'gabarit inconnu remplacé par la valeur de repli');

console.log('Choix');
const equipe = [
  { id: 'a', nom: 'Vikram', competences: { science: 1 }, caracs: { sangfroid: 9 }, traits: [] },
  { id: 'b', nom: 'Lin', competences: { science: 3 }, caracs: { sangfroid: 5 }, traits: ['sang_froid'] },
];
const envC = {
  lire: id => (id.includes('.') ? ({ 'equipe.science': 3, 'equipe.ingenierie': 0, 'equipe.carac.sangfroid': 9, 'equipe.trait.sang_froid': true, 'equipe.objet.kit_reparation': 0 })[id] : flags[id]),
  equipe, objetEmbarque: id => (id === 'serum' ? 1 : 0), peutPayer: cout => Object.keys(cout).filter(k => cout[k] > 50),
  nom: (g, id) => ({ kit_reparation: 'Kit de réparation', sang_froid: 'Sang-froid' })[id] || id,
};
const a1 = N.analyserChoix({ label: 'x', si: 'lanterne', effets: [] }, envC);
check(!a1.visible && !a1.disponible, 'si faux → choix caché');
const a2 = N.analyserChoix({ label: 'x', requiert: 'equipe.ingenierie >= 2', effets: [] }, envC);
check(!a2.disponible && a2.raison === "Ingénierie 2 requise dans l'équipe", `raison : « ${a2.raison} »`);
const a3 = N.analyserChoix({ label: 'x', requiert: 'equipe.objet.kit_reparation', effets: [] }, envC);
check(a3.raison === 'Nécessite : Kit de réparation', `raison : « ${a3.raison} »`);
const a4 = N.analyserChoix({ label: 'x', requiert: 'equipe.science >= 2 && equipe.carac.sangfroid >= 7', effets: [] }, envC);
check(a4.disponible && a4.acteur?.nom === 'Lin', `requiert rempli, colon qui agit : ${a4.acteur?.nom}`);
const a5 = N.analyserChoix({ label: 'x', cout: { metal: 80 }, consomme: 'kit_reparation', effets: [] }, envC);
check(!a5.disponible && /Manque Métal \(80\)/.test(a5.raison) && /Nécessite : Kit de réparation/.test(a5.raison), `coût et objet consommé : « ${a5.raison} »`);
const a6 = N.analyserChoix({ label: 'x', test: { carac: 'sangfroid', difficulte: 6, reussite: [], echec: [] } }, envC);
check(a6.disponible && Math.abs(a6.chance - 0.7) < 1e-9 && a6.acteur?.nom === 'Vikram' && a6.test.libelle === 'Sang-froid', `test : ${Math.round(a6.chance * 100)} % — ${a6.test.libelle} de ${a6.acteur?.nom}`);
const a7 = N.analyserChoix({ label: 'x', test: { competence: 'science', difficulte: 9, reussite: [], echec: [] } }, envC);
check(Math.abs(a7.chance - 0.5) < 1e-9 && a7.acteur?.nom === 'Lin', `test de compétence : ${Math.round(a7.chance * 100)} % (bonus = niveau)`);
const a8 = N.analyserChoix({ label: 'x', si: 'confiance >= 1', requiert: 'confiance >= 5', raison: 'Elle ne te fait pas encore confiance', effets: [] }, envC);
check(a8.visible && !a8.disponible && a8.raison === 'Elle ne te fait pas encore confiance', 'raison écrite par l’auteur');
const jet = N.lancerTest({ carac: 'sangfroid', difficulte: 6 }, equipe, () => 0.25);
check(jet.jet === 3 && jet.bonus === 2 && jet.total === 5 && !jet.reussite && jet.colon.nom === 'Vikram', 'jet : 1d10 + bonus du meilleur');

console.log('Effets et drapeaux');
const fl = { confiance: 1, maelle: 'x' };
N.appliquerDrapeaux(fl, { confiance: '+2', maelle: 'rencontree' });
N.appliquerDrapeaux(fl, { confiance: '-1' });
check(fl.confiance === 2 && fl.maelle === 'rencontree', "drapeaux : '+2', '-1', remplacement");
check(N.issueDe([{ texte: 'a' }, { aller: 'b' }])?.type === 'aller' && N.issueDe([{ aller: 'b' }, { texte: 'a' }]) === null, 'issue = dernier effet');
const ce = N.normaliserEffet({ combat: { ennemis: ['pillard'] } });
check(ce.defaite[0].retraite === true && ce.victoire.length === 0, 'combat : défaite = retraite par défaut');
check(N.normaliserEffet({ moral: -2 }).cible === 'equipe' && N.normaliserEffet({ objet: 'x' }).n === 1, 'formes courtes (moral, objet)');

// ---------- Validateur : erreurs injectées dans une copie du contenu ----------
console.log('Validateur de contenu (erreurs injectées)');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-contenu-'));
try {
  for (const d of ['src', 'tools']) fs.cpSync(path.join(ROOT, d), path.join(TMP, d), { recursive: true, filter: s => !s.includes(`${path.sep}regress${path.sep}`) });
  const lancer = () => spawnSync(process.execPath, [path.join(TMP, 'tools/check-content.mjs')], { encoding: 'utf8' });
  const propre = lancer();
  check(propre.status === 0, 'le contenu publié est valide');
  const f = path.join(TMP, 'src/content/histoires/pulsar-silencieux.js');
  let src = fs.readFileSync(f, 'utf8');
  const remplacer = (a, b) => { if (!src.includes(a)) throw new Error('motif absent : ' + a); src = src.replace(a, b); };
  remplacer("si: 'truth_revealed'", "si: 'truth_reveled'");                                   // drapeau mal orthographié
  remplacer("{ objet: 'disque_memoire' }", "{ objet: 'disque_memoir' }");                       // objet inconnu
  remplacer("{ aller: 'ep1_passerelle_neutre' }", "{ aller: 'ep1_passerelle' }");                // scène inconnue
  remplacer("requiert: 'equipe.science >= 2'", "requiert: 'equipe.science >='");                 // expression incomplète
  remplacer("{ texte: 'Tu fermes le carnet, par respect ou par prudence.' },", "{ aller: 'ep1_passerelle_neutre' },\n            { texte: 'Tu fermes le carnet.' },"); // issue mal placée
  remplacer("label: 'Partir sans rien laisser'", "label: 'Partir sans rien laisser derrière soi, sans un regard, sans un mot'"); // libellé trop long
  remplacer('Ils mentent. »', 'Ils mentent. » \\"');                                          // guillemet droit
  remplacer("titre: 'Le sas',", "titre: 'Le sas',\n      choices: [],");                                // clé inconnue
  fs.writeFileSync(f, src);
  fs.writeFileSync(path.join(TMP, 'src/content/scenes/oubliee.js'), "import { scene } from '../dsl.js';\nexport default [];\n");
  const r = lancer();
  const out = r.stdout + r.stderr;
  check(r.status === 1, 'code de sortie 1');
  for (const [motif, nom] of [
    [/drapeau non déclaré « truth_reveled »/, 'drapeau mal orthographié'],
    [/objet inconnu « disque_memoir »/, 'objet inconnu'],
    [/scène inconnue « ep1_passerelle »/, 'scène inconnue'],
    [/expression incomplète/, 'expression incomplète'],
    [/doit être le dernier effet/, 'issue mal placée'],
    [/libellé trop long/, 'libellé > 60 caractères'],
    [/caractère interdit/, 'guillemet droit'],
    [/clé inconnue « choices »/, 'clé inconnue'],
    [/oubliee\.js : fichier absent du sommaire/, 'fichier hors du sommaire'],
  ]) check(motif.test(out), `détecté : ${nom}`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s)`);
  process.exit(1);
}
console.log('\n✓ Moteur narratif : non-régression réussie');
