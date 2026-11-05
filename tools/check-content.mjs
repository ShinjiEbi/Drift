#!/usr/bin/env node
// tools/check-content.mjs — validation du contenu narratif (src/content/).
// Usage : node tools/check-content.mjs [--couverture] [--notes]
//
// Vérifie, pour chaque histoire, scène d'expédition, incident, événement de
// colonie, fil rouge, personnage partagé et page d'archives :
//   1. le schéma (champs attendus, types ; une clé inconnue est une erreur) ;
//   2. les références (objets, statuts, ennemis, compétences, caractéristiques,
//      traits, modules, techs, PNJ, scènes, fins, drapeaux déclarés) ;
//   3. les conditions (syntaxe du mini-langage, identifiants et valeurs connus) ;
//   4. le graphe de chaque histoire, en suivant l'état des drapeaux : scènes et
//      fins atteignables, une seule issue en dernier, pas d'impasse, au moins un
//      choix toujours possible, valeurs de drapeaux lues mais jamais écrites ;
//   5. les gabarits ({acteur}, {pnj:…}…) ;
//   6. la typographie pour mobile : pas de " < > dans les textes, libellé ≤ 60
//      caractères, paragraphe ≤ 900, 2 à 4 choix ;
//   7. la couverture : nombre de scènes compatibles par type de lieu.
// Code de sortie 1 s'il y a au moins une erreur (les avertissements n'échouent pas).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, chargerJeu, parcourirHistoire, branchesDe } from './contenu.mjs';

const ARGS = process.argv.slice(2);
const J = await chargerJeu();
const { N, vocab: V, contenu: C, K, CAT, ST, APP, RAW_ITEMS } = J;
const DAF = await import(pathToFileURL(path.join(ROOT, 'src/data-arcs-factions.js')).href);

const erreurs = [], avertissements = [], notes = [];
const err = (ctx, m) => erreurs.push(`${ctx} : ${m}`);
const avert = (ctx, m) => avertissements.push(`${ctx} : ${m}`);
const note = m => notes.push(m);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// ============================================================
//   0. Vocabulaire ↔ tables du jeu
// ============================================================
const memes = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const comparer = (nom, vocab, jeu) => { if (!memes(vocab, jeu)) err('vocabulaire.js', `${nom} ne correspond pas au jeu : [${vocab.join(', ')}] ≠ [${jeu.join(', ')}]`); };
comparer('RESSOURCES', Object.keys(V.RESSOURCES), K.RESOURCES);
comparer('COMPETENCES', Object.keys(V.COMPETENCES), K.SKILL_LIST);
comparer('CARACS', Object.keys(V.CARACS), Object.keys(K.STAT_LABELS));
comparer('STATUTS', V.STATUTS, Object.keys(APP.STATUTS));
comparer('LIEU.biome', V.LIEU.biome, Object.keys(CAT.BIOMES));
comparer('LIEU.atmosphere', V.LIEU.atmosphere, Object.keys(CAT.ATMOSPHERES));
comparer('LIEU.signal', V.LIEU.signal, Object.keys(CAT.SIGNAUX));
comparer('LIEU.ruines', V.LIEU.ruines, Object.keys(CAT.RUINES));
comparer('LIEU.danger', V.LIEU.danger, Object.keys(CAT.DANGERS));
comparer('LIEU.vie', V.LIEU.vie, Object.keys(ST.VIES));
comparer('LIEU.gravite', V.LIEU.gravite, Object.keys(ST.GRAVITES));
comparer('LIEU.type', V.LIEU.type, Object.keys(ST.BODY_TYPES));

// ============================================================
//   1. Fichiers : tout fichier de contenu doit être au sommaire
// ============================================================
const CONTENT = path.join(ROOT, 'src/content');
{
  const index = fs.readFileSync(path.join(CONTENT, 'index.js'), 'utf8');
  const importes = new Set([...index.matchAll(/from\s+'\.\/([^']+)'/g)].map(m => m[1]));
  const walk = d => fs.readdirSync(path.join(CONTENT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]);
  for (const dir of fs.readdirSync(CONTENT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    for (const f of walk(dir)) if (f.endsWith('.js') && !importes.has(f)) err(`src/content/${f}`, "fichier absent du sommaire src/content/index.js (il n'existe pas pour le jeu)");
  }
}

// ============================================================
//   Références du jeu
// ============================================================
const RES = new Set(Object.keys(V.RESSOURCES));
const SKILLS = new Set(Object.keys(V.COMPETENCES));
const STATS = new Set(Object.keys(V.CARACS));
const STATUTS = new Set(V.STATUTS);
const ITEMS = RAW_ITEMS;
const ORIGINES_SCHEMAS = new Set(Object.values(CAT.BLUEPRINTS).map(b => b.origin));
const INCIDENTS = new Set(Object.keys(APP.INCIDENTS || {}));
const COMPTEURS = new Set(['expeditions', 'scenes', 'combats_gagnes', 'chroniques_terminees']);
// Colonie, fils rouges, archives, personnages partagés (vague 2)
const PERSONNAGES_P = C.PERSONNAGES || {};
const IDS_EVENEMENTS = new Set((C.EVENEMENTS || []).map(e => e?.id));
const IDS_ARCS = new Set((C.ARCS || []).map(a => a?.id));
const IDS_LORE = new Set((C.LORE || []).map(l => l?.id));
const IDS_SCENES = new Set(C.SCENES.map(s => s?.id));
const TYPES_FACTION = new Set(Object.keys(DAF.FACTION_TYPES || {}));
const COLONIE_SIMPLE = new Set(['colons', 'jour', 'batiments', 'en_poste', 'couchettes_libres', 'vivres_ok', 'flotte', 'techs', 'recherches', 'datacubes_alien', 'morts']);
const FILTRES_EXPEDITION = new Set(['biome', 'ruines', 'vie', 'type', 'atmosphere', 'scene', 'objet']);
const NOMS_RESERVES_ACTEUR = new Set(['acteur', 'victime', 'secondaire', 'colonie', 'module', 'recrue', 'equipe', 'chef', 'vaisseau', 'lieu', 'systeme']);
const MONDE_ECRIT = new Set();
const MONDE_LU = [];
const HISTOIRES = C.HISTOIRES;
const PERSONNES = new Set(['equipe.chef', 'equipe.medecin', 'equipe.hasard', 'acteur', 'victime', 'secondaire']);

// Collecte des drapeaux globaux écrits (effet monde), toutes sources confondues
const toutesListes = [];
const visiterEffets = (liste, f) => { for (const e of liste || []) { f(e); if (e?.combat) { visiterEffets(e.combat.victoire, f); visiterEffets(e.combat.defaite, f); } } };
const listesDuChoix = c => (c.test ? [c.test.reussite, c.test.echec] : [c.effets]);
for (const s of C.SCENES) for (const c of s.choix || []) toutesListes.push(...listesDuChoix(c));
for (const h of Object.values(HISTOIRES)) {
  for (const sc of Object.values(h.scenes || {})) for (const c of sc.choix || []) toutesListes.push(...listesDuChoix(c));
  for (const f of Object.values(h.fins || {})) toutesListes.push(f.effets);
}
for (const d of [...(C.INCIDENTS || []), ...(C.EVENEMENTS || [])]) for (const c of d?.choix || []) toutesListes.push(...listesDuChoix(c));
for (const a of C.ARCS || []) toutesListes.push(a?.recompense?.effets);
for (const l of toutesListes) visiterEffets(l, e => { if (isObj(e?.monde)) for (const k of Object.keys(e.monde)) MONDE_ECRIT.add(k); });

// ============================================================
//   2-3. Conditions
// ============================================================
// cadre : { histoire (objet ou null), lieu: bool (condition de lieu : ni équipe ni drapeau) }
function verifierCondition(src, ctx, cadre = {}) {
  if (typeof src === 'boolean') return;
  if (typeof src !== 'string') { err(ctx, `condition attendue (texte), reçu ${JSON.stringify(src)}`); return; }
  try { N.compiler(src); } catch (e) { err(ctx, e.message); return; }
  const h = cadre.histoire;
  for (const id of N.identifiants(src)) {
    const [ns, a, b, c] = id.split('.');
    if (!id.includes('.')) {
      if (V.MOTS_RESERVES.includes(id)) { err(ctx, `« ${id} » est un mot réservé`); continue; }
      if (!h) err(ctx, `drapeau « ${id} » hors d'une histoire (les scènes génériques n'ont pas de drapeaux ; utiliser monde.${id} ?)`);
      else if (!(id in h.drapeaux)) err(ctx, `drapeau non déclaré « ${id} » (drapeaux : ${Object.keys(h.drapeaux).join(', ')})`);
      continue;
    }
    if (cadre.lieu && ns === 'equipe') { err(ctx, `« ${id} » : une condition de lieu ne peut pas lire l'équipe`); continue; }
    switch (ns) {
      case 'equipe':
        if (a === 'carac') { if (!STATS.has(b)) err(ctx, `caractéristique inconnue « ${id} » (${[...STATS].join(', ')})`); }
        else if (a === 'trait') { if (!CAT.TRAITS[b]) err(ctx, `trait inconnu « ${id} »`); }
        else if (a === 'objet') { if (!ITEMS.has(b)) err(ctx, `objet inconnu « ${id} »`); }
        else if (!(SKILLS.has(a) && !b) && a !== 'taille' && a !== 'chef') err(ctx, `référence inconnue « ${id} » (equipe.<compétence>, equipe.carac.x, equipe.trait.x, equipe.objet.x, equipe.taille)`);
        break;
      case 'colonie':
        if (a === 'res') { if (!RES.has(b)) err(ctx, `ressource inconnue « ${id} »`); }
        else if (a === 'module') { if (!CAT.MODULES[b]) err(ctx, `module inconnu « ${id} »`); }
        else if (a === 'tech') { if (!CAT.TECH_TREE[b]) err(ctx, `technologie inconnue « ${id} »`); }
        else if (a === 'objet') { if (!ITEMS.has(b)) err(ctx, `objet inconnu « ${id} »`); }
        else if (a === 'schemas') { if (!ORIGINES_SCHEMAS.has(b)) err(ctx, `origine de schéma inconnue « ${id} » (${[...ORIGINES_SCHEMAS].join(', ')})`); }
        else if (a === 'competence') { if (!SKILLS.has(b)) err(ctx, `compétence inconnue « ${id} »`); }
        else if (a === 'reserve') { if (!RES.has(b)) err(ctx, `ressource inconnue « ${id} »`); }
        else if (a === 'gueris') { if (!STATUTS.has(b)) err(ctx, `statut inconnu « ${id} »`); }
        else if (!COLONIE_SIMPLE.has(a) || b) err(ctx, `référence inconnue « ${id} » (colonie.${[...COLONIE_SIMPLE].join(', colonie.')}, colonie.res.x, .module.x, .tech.x, .objet.x, .schemas.x, .competence.x, .reserve.x, .gueris.x)`);
        break;
      case 'expeditions': {
        const ps = id.split('.').slice(1);
        if (ps.length === 1 && ['total', 'en_cours'].includes(ps[0])) break;
        if (!ps.length || ps.length % 2) { err(ctx, `« ${id} » : expeditions.total, expeditions.en_cours ou des filtres par paires (expeditions.ruines.humaines)`); break; }
        for (let i = 0; i < ps.length; i += 2) {
          const [k, v] = [ps[i], ps[i + 1]];
          if (!FILTRES_EXPEDITION.has(k)) err(ctx, `filtre d'expédition inconnu « ${k} » (${[...FILTRES_EXPEDITION].join(', ')})`);
          else if (V.LIEU[k] && !V.LIEU[k].includes(v)) err(ctx, `valeur jamais générée « ${v} » pour ${k} (${V.LIEU[k].join(', ')})`);
          else if (k === 'scene' && !IDS_SCENES.has(v)) err(ctx, `scène d'expédition inconnue « ${v} »`);
          else if (k === 'objet' && !ITEMS.has(v)) err(ctx, `objet inconnu « ${v} »`);
        }
        break;
      }
      case 'factions':
        if (!(['total', 'allies'].includes(a) || TYPES_FACTION.has(a)) || b) err(ctx, `référence inconnue « ${id} » (factions.total, factions.allies, factions.<type> : ${[...TYPES_FACTION].join(', ')})`);
        break;
      case 'evenement':
        if (!IDS_EVENEMENTS.has(a)) err(ctx, `événement inconnu « ${a} »`);
        else if (!['fois', 'depuis'].includes(b) || c) err(ctx, `référence inconnue « ${id} » (evenement.x.fois, evenement.x.depuis)`);
        break;
      case 'fil':
        if (!IDS_ARCS.has(a)) err(ctx, `fil rouge inconnu « ${a} »`);
        else if (!['etape', 'termine'].includes(b) || c) err(ctx, `référence inconnue « ${id} » (fil.x.etape, fil.x.termine)`);
        break;
      case 'archives':
        if (b || (a !== 'total' && !IDS_LORE.has(a))) err(ctx, `page d'archives inconnue « ${id} »`);
        break;
      case 'corps':
        if (!(a in V.LIEU) && a !== 'visites') err(ctx, `attribut de lieu inconnu « ${id} » (${Object.keys(V.LIEU).join(', ')}, visites)`);
        break;
      case 'faction':
        if (!['existe', 'reputation'].includes(a) || b) err(ctx, `référence inconnue « ${id} » (faction.existe, faction.reputation)`);
        break;
      case 'histoire': {
        const hh = HISTOIRES[a];
        if (!hh) { err(ctx, `histoire inconnue « ${a} »`); break; }
        if (b === 'drapeau') { if (!(c in hh.drapeaux)) err(ctx, `drapeau « ${c} » non déclaré dans l'histoire ${a}`); }
        else if (!['fin', 'terminee', 'episode'].includes(b)) err(ctx, `référence inconnue « ${id} » (histoire.x.fin, .terminee, .episode, .drapeau.y)`);
        break;
      }
      case 'monde': MONDE_LU.push([ctx, id.slice(6)]); break;
      case 'compteur': if (!COMPTEURS.has(id.slice(9))) err(ctx, `compteur inconnu « ${id} » (${[...COMPTEURS].join(', ')})`); break;
      case 'acteur':
        if (!cadre.acteur) { err(ctx, `« ${id} » n'existe que dans un filtre d'acteur d'événement`); break; }
        if (a === 'carac') { if (!STATS.has(b)) err(ctx, `caractéristique inconnue « ${id} »`); }
        else if (a === 'trait') { if (!CAT.TRAITS[b]) err(ctx, `trait inconnu « ${id} »`); }
        else if (!(a in V.CHAMPS_ACTEUR || SKILLS.has(a)) || b) err(ctx, `champ d'acteur inconnu « ${id} » (${Object.keys(V.CHAMPS_ACTEUR).join(', ')})`);
        break;
      default: err(ctx, `espace de noms inconnu « ${ns} » (${Object.keys(V.ESPACES).filter(x => x !== '(nu)').join(', ')})`);
    }
  }
  // Valeurs comparées : attributs de lieu, fins d'histoire, drapeaux texte
  for (const { id, valeurs } of N.comparaisons(src)) {
    const [ns, a, b] = id.split('.');
    if (ns === 'corps' && V.LIEU[a]) for (const v of valeurs) if (!V.LIEU[a].includes(v)) err(ctx, `valeur jamais générée « ${v} » pour ${id} (${V.LIEU[a].join(', ')})`);
    if (ns === 'histoire' && b === 'fin' && HISTOIRES[a]) for (const v of valeurs) if (v !== null && !HISTOIRES[a].fins?.[v]) err(ctx, `fin inconnue « ${v} » pour ${id}`);
    if (h && !id.includes('.') && id in h.drapeaux) (cadre.lectures ||= []).push({ ctx, id, valeurs });
  }
}

// ============================================================
//   Textes : schéma, gabarits, typographie
// ============================================================
function verifierChaine(s, ctx, cadre, { label = false } = {}) {
  if (typeof s !== 'string') { err(ctx, `texte attendu, reçu ${JSON.stringify(s)}`); return; }
  if (/[<>"]/.test(s)) err(ctx, `caractère interdit (" < >) : guillemets « », pas de HTML — « ${s.slice(0, 60)}… »`);
  if (/\$\{/.test(s)) err(ctx, 'pas de ${…} : les gabarits s\'écrivent {nom}');
  for (const g of N.gabaritsDe(s)) verifierGabarit(g, ctx, cadre);
  if (label) {
    if (s.length > 60) err(ctx, `libellé trop long pour un téléphone (${s.length} > 60 caractères) : « ${s} »`);
    if (/\n/.test(s)) err(ctx, 'libellé sur plusieurs lignes');
  } else {
    for (const p of s.split(/\n[ \t]*\n/)) if (p.length > 900) err(ctx, `paragraphe trop long (${p.length} > 900 caractères) : couper en plusieurs paragraphes`);
    if ((s.match(/\*/g) || []).length % 2) avert(ctx, "astérisque isolé : l'italique s'écrit *ainsi* et le gras **ainsi**");
  }
}

function verifierGabarit(inner, ctx, cadre) {
  const parts = inner.split('|').map(x => x.trim());
  let head = parts[0];
  const accord = parts.length > 1 || /\.e$/.test(head);
  if (parts.length === 2) err(ctx, `{${inner}} : un accord s'écrit {nom|masculin|féminin} ou {nom|masculin|féminin|neutre}`);
  if (parts.length > 4) err(ctx, `{${inner}} : trop de formes`);
  if (/\.e$/.test(head) && parts.length === 1) head = head.slice(0, -2);
  const h = cadre.histoire;
  const acteurs = cadre.acteurs || [];
  const ageActeur = /^(\w+)\.age$/.exec(head);
  if (ageActeur && acteurs.includes(ageActeur[1])) { if (accord) err(ctx, `{${inner}} : accord sur un âge`); return; }
  const colonie = cadre.colonie && (acteurs.includes(head) || ['recrue'].includes(head));
  const estPersonne = PERSONNES.has(head) || head.startsWith('pnj:') || colonie;
  if (head.startsWith('pnj:')) {
    const ref = head.slice(4);
    const [hId, pId] = ref.includes('/') ? ref.split('/') : [h?.id, ref];
    if (!HISTOIRES[hId]?.personnages?.[pId] && !(cadre.colonie && !ref.includes('/') && PERSONNAGES_P[ref])) err(ctx, `{${inner}} : personnage inconnu « ${ref} »${h ? '' : ' (hors histoire : {pnj:histoire/personnage} ; un personnage partagé, seulement à la colonie)'}`);
  } else if (colonie || (cadre.colonie && head === 'module' && cadre.module)) {
    // acteur déclaré de l'événement, recrue, module de l'incident
  } else if (head.startsWith('decor.')) {
    if (!['biome', 'atmosphere', 'signal', 'ruines', 'danger'].includes(head.slice(6))) err(ctx, `{${inner}} : décor inconnu (decor.biome, .atmosphere, .signal, .ruines, .danger)`);
  } else if (!['vaisseau', 'lieu', 'systeme', 'colonie'].includes(head) && !PERSONNES.has(head)) {
    err(ctx, `gabarit inconnu {${inner}} (${Object.keys(V.GABARITS).join(', ')})`);
  }
  if (accord && !estPersonne) err(ctx, `{${inner}} : accord sur un gabarit qui n'est pas une personne`);
  if ((head === 'acteur' || (head === 'victime' && !cadre.incident)) && !cadre.consequence) avert(ctx, `{${head}} dans le texte de la scène : il n'est connu qu'après le choix (le chef d'équipe sera nommé à sa place)`);
}

const BLOCS_TEXTE = new Set(['si', 'texte']);
function verifierTexte(t, ctx, cadre, { obligatoire = true } = {}) {
  if (t === undefined || t === null || t === '') { if (obligatoire) err(ctx, 'texte manquant'); return; }
  if (typeof t === 'string') { verifierChaine(t, ctx, cadre); return; }
  const blocs = Array.isArray(t) ? t : [t];
  blocs.forEach((b, i) => {
    const cx = Array.isArray(t) ? `${ctx}[${i}]` : ctx;
    if (typeof b === 'string') { verifierChaine(b, cx, cadre); return; }
    if (!isObj(b)) { err(cx, 'paragraphe : texte, { si, texte } ou { unParmi: [...] } attendu'); return; }
    if ('unParmi' in b) {
      for (const k of Object.keys(b)) if (k !== 'unParmi') err(cx, `clé inconnue « ${k} » dans un bloc unParmi`);
      if (!Array.isArray(b.unParmi) || !b.unParmi.length) { err(cx, 'unParmi : liste de variantes attendue'); return; }
      b.unParmi.forEach((v, j) => {
        if (!isObj(v)) { err(`${cx}.unParmi[${j}]`, 'variante { si, texte } attendue'); return; }
        for (const k of Object.keys(v)) if (!BLOCS_TEXTE.has(k)) err(`${cx}.unParmi[${j}]`, `clé inconnue « ${k} » (si, texte)`);
        if (v.si !== undefined) verifierCondition(v.si, `${cx}.unParmi[${j}].si`, cadre);
        verifierTexte(v.texte, `${cx}.unParmi[${j}]`, cadre);
      });
      if (b.unParmi[b.unParmi.length - 1]?.si !== undefined) avert(cx, 'unParmi : la dernière variante devrait être sans condition (texte par défaut)');
      return;
    }
    for (const k of Object.keys(b)) if (!BLOCS_TEXTE.has(k)) err(cx, `clé inconnue « ${k} » dans un paragraphe (si, texte)`);
    if (b.si !== undefined) verifierCondition(b.si, `${cx}.si`, cadre);
    verifierTexte(b.texte, cx, cadre);
  });
}

// ============================================================
//   Effets
// ============================================================
const EFFETS = new Set(Object.keys(V.EFFETS));
const ISSUES = new Set(['aller', 'finEpisode', 'fin', 'retraite', 'rentrer', 'combat']);
const ennemisRencontres = new Set();

function verifierRessources(obj, ctx) {
  if (!isObj(obj)) { err(ctx, 'objet { ressource: nombre } attendu'); return; }
  for (const [k, v] of Object.entries(obj)) {
    if (!RES.has(k)) err(ctx, `ressource inconnue « ${k} » (${[...RES].join(', ')})`);
    if (!isNum(v) || v <= 0) err(ctx, `${k} : nombre positif attendu (${v})`);
  }
}
const verifierDuree = (v, ctx) => { if (!Number.isFinite(N.parseDuree(v))) err(ctx, `durée invalide « ${v} » (ex. '30min', '18h', '3j')`); };
const verifierCible = (c, ctx, cadre = {}) => { if (c !== undefined && !(c in V.CIBLES) && !(cadre.acteurs || []).includes(c)) err(ctx, `cible inconnue « ${c} » (${[...Object.keys(V.CIBLES), ...(cadre.acteurs || [])].join(', ')})`); };

function verifierEffets(liste, ctx, cadre) {
  if (!Array.isArray(liste)) { err(ctx, 'liste d\'effets attendue'); return; }
  const h = cadre.histoire;
  liste.forEach((e, i) => {
    const cx = `${ctx}[${i}]`;
    if (!isObj(e)) { err(cx, 'effet : objet à une clé attendu'); return; }
    const keys = Object.keys(e);
    if (keys.length !== 1) { err(cx, `un effet = un objet à UNE clé (trouvé : ${keys.join(', ')}) ; séparer en plusieurs effets`); return; }
    const [k] = keys, v = e[k];
    if (!EFFETS.has(k)) { err(cx, `effet inconnu « ${k} » (${[...EFFETS].join(', ')})`); return; }
    if (cadre.colonie && !V.EFFETS_COLONIE.includes(k)) { err(cx, `effet « ${k} » impossible à la colonie (${V.EFFETS_COLONIE.join(', ')})`); return; }
    if (ISSUES.has(k) && i !== liste.length - 1) err(cx, `« ${k} » est une issue : elle doit être le dernier effet de la liste`);
    switch (k) {
      case 'texte': verifierTexte(v, cx, { ...cadre, consequence: true }); break;
      case 'gain': case 'perte': verifierRessources(v, cx); break;
      case 'objet': {
        const id = typeof v === 'string' ? v : v?.id;
        if (!ITEMS.has(id)) err(cx, `objet inconnu « ${id} »`);
        if (isObj(v)) for (const kk of Object.keys(v)) if (!['id', 'n'].includes(kk)) err(cx, `clé inconnue « ${kk} » (id, n)`);
        break;
      }
      case 'schema':
        if (v !== 'auto') for (const o of [].concat(v)) if (!ORIGINES_SCHEMAS.has(o) && !CAT.BLUEPRINTS[o]) err(cx, `aucun schéma d'origine « ${o} » (${[...ORIGINES_SCHEMAS].join(', ')}, 'auto', ou un id de schéma)`);
        break;
      case 'statut':
        if (!isObj(v)) { err(cx, "{ statut: { cible, id } } attendu"); break; }
        for (const kk of Object.keys(v)) if (!['cible', 'id'].includes(kk)) err(cx, `clé inconnue « ${kk} » (cible, id)`);
        if (!STATUTS.has(v.id)) err(cx, `statut inconnu « ${v.id} » (${[...STATUTS].join(', ')})`);
        verifierCible(v.cible, cx, cadre);
        break;
      case 'moral':
        if (isNum(v)) break;
        if (!isObj(v) || !isNum(v.valeur)) { err(cx, '{ moral: -2 } ou { moral: { cible, valeur } } attendu'); break; }
        for (const kk of Object.keys(v)) if (!['cible', 'valeur'].includes(kk)) err(cx, `clé inconnue « ${kk} » (cible, valeur)`);
        verifierCible(v.cible, cx, cadre);
        break;
      case 'affinite':
        if (!isObj(v) || !isNum(v.delta)) { err(cx, '{ affinite: { a, b, delta } } attendu'); break; }
        verifierCible(v.a, cx, cadre); verifierCible(v.b, cx, cadre);
        break;
      case 'brouille':
        if (!isObj(v) || v.a === undefined || v.b === undefined) { err(cx, "{ brouille: { a: 'victime', b: 'colonie_hasard' } } attendu"); break; }
        for (const kk of Object.keys(v)) if (!['a', 'b'].includes(kk)) err(cx, `clé inconnue « ${kk} » (a, b)`);
        verifierCible(v.a, cx, cadre); verifierCible(v.b, cx, cadre);
        break;
      case 'retardRecherche': verifierDuree(v, cx); break;
      case 'bonusPermanent': if (!APP.BONUS_PERMANENTS?.[v]) err(cx, `bonus permanent inconnu « ${v} » (${Object.keys(APP.BONUS_PERMANENTS || {}).join(', ')})`); break;
      case 'technologie': if (!CAT.TECH_TREE[v]) err(cx, `technologie inconnue « ${v} »`); break;
      case 'drapeau':
        if (!h) { err(cx, 'drapeau hors d\'une histoire (utiliser monde)'); break; }
        if (!isObj(v)) { err(cx, '{ drapeau: { nom: valeur } } attendu'); break; }
        for (const [f, val] of Object.entries(v)) {
          if (!(f in h.drapeaux)) err(cx, `drapeau non déclaré « ${f} »`);
          else if (N.estIncrement(val) && typeof h.drapeaux[f] !== 'number') err(cx, `« ${val} » sur le drapeau non numérique « ${f} »`);
          if (typeof val === 'string' && /^[+-]0$/.test(val)) avert(cx, `« ${f}: '${val}' » ne change rien`);
        }
        break;
      case 'monde': if (!isObj(v)) err(cx, '{ monde: { nom: valeur } } attendu'); break;
      case 'recrute': {
        if (isObj(v)) {
          for (const kk of Object.keys(v)) if (!['inconnu', 'bonus'].includes(kk)) err(cx, `clé inconnue « ${kk} » (inconnu, bonus)`);
          if (v.inconnu !== true) err(cx, '{ recrute: { inconnu: true, bonus? } } attendu');
          if (v.bonus !== undefined && !(Number.isInteger(v.bonus) && v.bonus >= 0 && v.bonus <= 3)) err(cx, 'bonus : entier de 0 à 3');
          if (!cadre.colonie) err(cx, 'un visiteur ne se recrute qu’à la colonie (événement)');
          break;
        }
        const ref = String(v);
        const [hId, pId] = ref.includes('/') ? ref.split('/') : [h?.id, ref];
        if (!HISTOIRES[hId]?.personnages?.[pId] && !(cadre.colonie && !ref.includes('/') && PERSONNAGES_P[ref])) err(cx, `personnage inconnu « ${ref} »`);
        break;
      }
      case 'reputation':
        if (!isNum(v) && !(isObj(v) && isNum(v.delta))) err(cx, '{ reputation: 10 } ou { reputation: { faction, delta } } attendu');
        else if (isObj(v) && v.faction !== undefined && !TYPES_FACTION.has(v.faction)) err(cx, `type de faction inconnu « ${v.faction} » (${[...TYPES_FACTION].join(', ')})`);
        else if (cadre.colonie && isNum(v) && !cadre.faction) err(cx, 'à la colonie, préciser la faction : { reputation: { faction, delta } } (ou un personnage de faction)');
        break;
      case 'journal': case 'annales': verifierTexte(v, cx, { ...cadre, consequence: true }); break;
      case 'module': {
        const id = v?.id ?? cadre.module;
        if (!isObj(v) || !CAT.MODULES[id]) { err(cx, `module inconnu « ${v?.id} »${cadre.module ? '' : ' (id obligatoire hors d’un incident)'}`); break; }
        for (const kk of Object.keys(v)) if (!['id', 'horsService', 'niveau'].includes(kk)) err(cx, `clé inconnue « ${kk} » (id, horsService, niveau)`);
        if (v.horsService === undefined && v.niveau === undefined) err(cx, "{ module: { horsService: '1h' } } ou { module: { niveau: -1 } } attendu");
        if (v.horsService !== undefined) verifierDuree(v.horsService, cx);
        if (v.niveau !== undefined && !(Number.isInteger(v.niveau) && v.niveau < 0 && v.niveau >= -3)) err(cx, 'niveau : entier négatif (−1 à −3)');
        break;
      }
      case 'effetTemporaire':
        if (!isObj(v) || !isNum(v.prod) || typeof v.titre !== 'string') err(cx, "{ effetTemporaire: { titre, prod: 0.85, duree: '12h' } } attendu");
        else verifierDuree(v.duree, cx);
        break;
      case 'incident':
        if (!isObj(v) || !INCIDENTS.has(v.id)) err(cx, `incident inconnu « ${v?.id} »`);
        else if (v.dans !== undefined) verifierDuree(v.dans, cx);
        break;
      case 'combat': {
        if (!isObj(v)) { err(cx, '{ combat: { ennemis, butin, victoire, defaite } } attendu'); break; }
        for (const kk of Object.keys(v)) if (!['ennemis', 'butin', 'victoire', 'defaite'].includes(kk)) err(cx, `clé inconnue « ${kk} » (ennemis, butin, victoire, defaite)`);
        if (!Array.isArray(v.ennemis) || !v.ennemis.length) err(cx, 'combat : liste d\'ennemis attendue');
        for (const en of v.ennemis || []) { if (!CAT.ENEMY_TYPES[en]) err(cx, `ennemi inconnu « ${en} »`); else ennemisRencontres.add(en); }
        if (v.butin !== undefined) verifierRessources(v.butin, `${cx}.butin`);
        if (v.victoire !== undefined) verifierEffets(v.victoire, `${cx}.victoire`, cadre);
        if (v.defaite !== undefined) verifierEffets(v.defaite, `${cx}.defaite`, cadre);
        if (h) {
          if (!N.issueDe(v.victoire || [])) err(`${cx}.victoire`, 'dans une histoire, la suite d\'une victoire doit finir par une issue (aller, finEpisode, fin)');
        }
        break;
      }
      case 'aller':
        if (!h) err(cx, '« aller » n\'existe que dans une histoire');
        else if (!h.scenes[v]) err(cx, `scène inconnue « ${v} »`);
        break;
      case 'finEpisode': if (!h) err(cx, '« finEpisode » n\'existe que dans une histoire'); if (v !== true) err(cx, 'finEpisode: true attendu'); break;
      case 'fin':
        if (!h) err(cx, '« fin » n\'existe que dans une histoire');
        else if (!h.fins?.[v]) err(cx, `fin inconnue « ${v} » (${Object.keys(h.fins || {}).join(', ')})`);
        break;
      case 'retraite': case 'rentrer': if (v !== true) err(cx, `${k}: true attendu`); break;
    }
  });
}

// ============================================================
//   Choix
// ============================================================
const CLES_CHOIX = new Set(['label', 'si', 'requiert', 'raison', 'cout', 'consomme', 'test', 'effets']);
function verifierChoix(choix, ctx, cadre) {
  if (!Array.isArray(choix) || !choix.length) { err(ctx, 'choix : liste non vide attendue'); return; }
  if (choix.length > 5) err(ctx, `${choix.length} choix : 4 au plus sur un écran de téléphone`);
  else if (choix.length === 5) avert(ctx, '5 choix : 2 à 4 recommandés sur téléphone');
  else if (choix.length === 1) avert(ctx, 'un seul choix : 2 à 4 recommandés');
  if (!choix.some(c => isObj(c) && c.si === undefined && c.requiert === undefined && c.cout === undefined && c.consomme === undefined)) {
    err(ctx, 'au moins un choix doit toujours être possible (sans si, requiert, cout ni consomme)');
  }
  choix.forEach((c, i) => {
    const cx = `${ctx}.choix[${i}]`;
    if (!isObj(c)) { err(cx, 'objet attendu'); return; }
    for (const k of Object.keys(c)) if (!CLES_CHOIX.has(k)) err(cx, `clé inconnue « ${k} » (${[...CLES_CHOIX].join(', ')})`);
    verifierChaine(c.label, `${cx}.label`, cadre, { label: true });
    if (c.si !== undefined) verifierCondition(c.si, `${cx}.si`, cadre);
    if (c.requiert !== undefined) verifierCondition(c.requiert, `${cx}.requiert`, cadre);
    if (c.raison !== undefined) verifierChaine(c.raison, `${cx}.raison`, cadre, { label: true });
    if (c.cout !== undefined) verifierRessources(c.cout, `${cx}.cout`);
    for (const id of [].concat(c.consomme ?? [])) if (!ITEMS.has(id)) err(`${cx}.consomme`, `objet inconnu « ${id} »`);
    if (c.test !== undefined && c.effets !== undefined) err(cx, 'test OU effets, pas les deux (les effets vont dans test.reussite / test.echec)');
    if (c.test !== undefined) {
      const t = c.test;
      if (!isObj(t)) { err(`${cx}.test`, 'objet attendu'); return; }
      for (const k of Object.keys(t)) if (!['carac', 'competence', 'difficulte', 'reussite', 'echec'].includes(k)) err(`${cx}.test`, `clé inconnue « ${k} »`);
      if (!!t.carac === !!t.competence) err(`${cx}.test`, 'une caractéristique (carac) OU une compétence (competence)');
      if (t.carac && !STATS.has(t.carac)) err(`${cx}.test`, `caractéristique inconnue « ${t.carac} » (${[...STATS].join(', ')})`);
      if (t.competence && !SKILLS.has(t.competence)) err(`${cx}.test`, `compétence inconnue « ${t.competence} » (${[...SKILLS].join(', ')})`);
      if (!Number.isInteger(t.difficulte) || t.difficulte < 2 || t.difficulte > 15) err(`${cx}.test`, `difficulte : entier de 2 à 15 attendu (${t.difficulte})`);
      verifierEffets(t.reussite, `${cx}.test.reussite`, cadre);
      verifierEffets(t.echec, `${cx}.test.echec`, cadre);
    } else if (c.effets !== undefined) verifierEffets(c.effets, `${cx}.effets`, cadre);
    // Une histoire : chaque branche finit par exactement une issue
    if (cadre.histoire) {
      for (const [nom, liste] of branchesDe(c)) {
        const issues = liste.filter(e => isObj(e) && ISSUES.has(Object.keys(e)[0]));
        if (!N.issueDe(liste) || issues.length !== 1) err(`${cx}${nom ? ' (' + nom + ')' : ''}`, `une scène d'histoire exige une issue en dernier (aller, finEpisode, fin, retraite), trouvé ${issues.length}`);
      }
    } else if (!cadre.colonie) {
      for (const [nom, liste] of branchesDe(c)) {
        const iss = N.issueDe(liste);
        if (iss && !['retraite', 'rentrer', 'combat'].includes(iss.type)) err(`${cx}${nom ? ' (' + nom + ')' : ''}`, `issue « ${iss.type} » impossible hors d'une histoire (scène suivante implicite, retraite ou rentrer)`);
      }
    }
  });
}

// ============================================================
//   Scènes d'expédition
// ============================================================
const CLES_SCENE = new Set(['id', 'titre', 'moment', 'lieux', 'affinites', 'poids', 'texte', 'choix', 'type']);
const idsScenes = new Set();
for (const s of C.SCENES) {
  const ctx = `scène ${s?.id || '?'}`;
  if (!isObj(s) || s.type !== 'scene') { err(ctx, 'créer la scène avec scene({...}) (src/content/dsl.js)'); continue; }
  for (const k of Object.keys(s)) if (!CLES_SCENE.has(k)) err(ctx, `clé inconnue « ${k} » (${[...CLES_SCENE].join(', ')})`);
  if (typeof s.id !== 'string' || !/^[a-z0-9_]+$/.test(s.id)) err(ctx, 'id : minuscules, chiffres et _ uniquement');
  if (idsScenes.has(s.id)) err(ctx, 'id dupliqué');
  idsScenes.add(s.id);
  if (typeof s.titre !== 'string' || !s.titre.trim()) err(ctx, 'titre manquant (affiché au joueur)');
  else verifierChaine(s.titre, `${ctx}.titre`, {}, { label: true });
  if (s.moment !== undefined && !(s.moment in V.MOMENTS)) err(ctx, `moment inconnu « ${s.moment} » (${Object.keys(V.MOMENTS).join(', ')})`);
  if (s.lieux === undefined) err(ctx, "lieux manquant : condition sur le lieu (« vrai » pour partout)");
  else verifierCondition(s.lieux, `${ctx}.lieux`, { lieu: true });
  if (s.poids !== undefined && (!isNum(s.poids) || s.poids <= 0)) err(ctx, `poids : nombre positif attendu (${s.poids})`);
  if (s.affinites !== undefined) {
    if (!Array.isArray(s.affinites)) err(ctx, 'affinites : liste de { si, facteur } attendue');
    else s.affinites.forEach((a, i) => {
      for (const k of Object.keys(a || {})) if (!['si', 'facteur'].includes(k)) err(`${ctx}.affinites[${i}]`, `clé inconnue « ${k} » (si, facteur)`);
      verifierCondition(a?.si, `${ctx}.affinites[${i}].si`, { lieu: true });
      if (!isNum(a?.facteur) || a.facteur <= 0) err(`${ctx}.affinites[${i}]`, 'facteur : nombre positif attendu');
    });
  }
  verifierTexte(s.texte, `${ctx}.texte`, {});
  verifierChoix(s.choix, ctx, {});
}
for (const id of ['intro_atterrissage', 'outro_retour']) if (!idsScenes.has(id)) err(`scène ${id}`, 'scène de secours absente (arrivée / départ par défaut)');

// ============================================================
//   Histoires
// ============================================================
const CLES_HISTOIRE = new Set(['id', 'titre', 'accroche', 'apparition', 'rythme', 'drapeaux', 'personnages', 'fins', 'episodes', 'scenes', 'type']);
const CLES_PNJ = new Set(['nom', 'age', 'pronoms', 'role', 'voix', 'recrue']);
const statsHistoires = [];
for (const [cle, h] of Object.entries(HISTOIRES)) {
  const ctx = `histoire ${h?.id || cle}`;
  if (!isObj(h) || h.type !== 'histoire') { err(ctx, 'créer l\'histoire avec histoire({...}) (src/content/dsl.js)'); continue; }
  for (const k of Object.keys(h)) if (!CLES_HISTOIRE.has(k)) err(ctx, `clé inconnue « ${k} » (${[...CLES_HISTOIRE].join(', ')})`);
  if (!/^[a-z0-9_]+$/.test(h.id || '')) err(ctx, 'id : minuscules, chiffres et _ uniquement');
  if (idsScenes.has(h.id)) err(ctx, 'même id qu\'une scène');
  if (typeof h.titre !== 'string') err(ctx, 'titre manquant'); else verifierChaine(h.titre, `${ctx}.titre`, {}, { label: true });
  if (h.accroche !== undefined) verifierChaine(h.accroche, `${ctx}.accroche`, {});
  if (!isObj(h.drapeaux)) { err(ctx, 'drapeaux : objet { nom: valeur de départ } attendu'); continue; }
  for (const [f, v] of Object.entries(h.drapeaux)) {
    if (!/^[a-z][a-z0-9_]*$/.test(f)) err(`${ctx}.drapeaux`, `nom de drapeau invalide « ${f} »`);
    if (V.MOTS_RESERVES.includes(f)) err(`${ctx}.drapeaux`, `« ${f} » est un mot réservé`);
    if (!(v === null || ['number', 'string', 'boolean'].includes(typeof v))) err(`${ctx}.drapeaux`, `${f} : nombre, texte, booléen ou null`);
  }
  const cadre = { histoire: h, lectures: [] };
  // Apparition et rythme
  if (!isObj(h.apparition)) err(ctx, 'apparition : { lieu, si?, chance? } attendu');
  else {
    for (const k of Object.keys(h.apparition)) if (!['lieu', 'si', 'chance'].includes(k)) err(`${ctx}.apparition`, `clé inconnue « ${k} »`);
    verifierCondition(h.apparition.lieu ?? true, `${ctx}.apparition.lieu`, { lieu: true });
    if (h.apparition.si !== undefined) verifierCondition(h.apparition.si, `${ctx}.apparition.si`, {});
    if (h.apparition.chance !== undefined && !(isNum(h.apparition.chance) && h.apparition.chance > 0 && h.apparition.chance <= 1)) err(`${ctx}.apparition`, 'chance : nombre entre 0 et 1');
  }
  if (h.rythme !== undefined) {
    for (const k of Object.keys(h.rythme || {})) if (k !== 'entreEpisodes') err(`${ctx}.rythme`, `clé inconnue « ${k} » (entreEpisodes)`);
    verifierDuree(h.rythme?.entreEpisodes, `${ctx}.rythme.entreEpisodes`);
  }
  // Personnages
  for (const [pid, p] of Object.entries(h.personnages || {})) {
    const cx = `${ctx}.personnages.${pid}`;
    for (const k of Object.keys(p || {})) if (!CLES_PNJ.has(k)) err(cx, `clé inconnue « ${k} » (${[...CLES_PNJ].join(', ')})`);
    if (typeof p?.nom !== 'string') err(cx, 'nom manquant');
    if (p?.pronoms !== undefined && !['il', 'elle', 'iel'].includes(p.pronoms)) err(cx, "pronoms : 'il', 'elle' ou 'iel'");
    if (p?.recrue) {
      for (const k of Object.keys(p.recrue)) if (!['competences', 'caracs', 'traits'].includes(k)) err(cx, `recrue : clé inconnue « ${k} »`);
      for (const [k, v] of Object.entries(p.recrue.competences || {})) if (!SKILLS.has(k) || !Number.isInteger(v) || v < 0 || v > 5) err(cx, `compétence « ${k}: ${v} » (0 à 5)`);
      for (const [k, v] of Object.entries(p.recrue.caracs || {})) if (!STATS.has(k) || !Number.isInteger(v) || v < 1 || v > 10) err(cx, `caractéristique « ${k}: ${v} » (1 à 10)`);
      for (const t of p.recrue.traits || []) if (!CAT.TRAITS[t]) err(cx, `trait inconnu « ${t} »`);
    }
  }
  // Fins
  if (!isObj(h.fins) || !Object.keys(h.fins).length) err(ctx, 'fins : au moins une fin { id: { titre, texte } }');
  for (const [fid, f] of Object.entries(h.fins || {})) {
    const cx = `${ctx}.fins.${fid}`;
    for (const k of Object.keys(f || {})) if (!['titre', 'texte', 'effets'].includes(k)) err(cx, `clé inconnue « ${k} » (titre, texte, effets)`);
    if (typeof f?.titre !== 'string') err(cx, 'titre manquant'); else verifierChaine(f.titre, `${cx}.titre`, cadre, { label: true });
    verifierTexte(f?.texte, cx, { ...cadre, consequence: true });
    if (f?.effets !== undefined) {
      verifierEffets(f.effets, `${cx}.effets`, cadre);
      if (N.issueDe(f.effets)) err(`${cx}.effets`, 'pas d\'issue dans les effets d\'une fin');
    }
  }
  // Épisodes
  if (!Array.isArray(h.episodes) || !h.episodes.length) { err(ctx, 'episodes : liste non vide attendue'); continue; }
  h.episodes.forEach((ep, i) => {
    const cx = `${ctx}.episodes[${i}]`;
    for (const k of Object.keys(ep || {})) if (!['titre', 'debut', 'intro'].includes(k)) err(cx, `clé inconnue « ${k} » (titre, debut, intro)`);
    if (typeof ep?.titre !== 'string') err(cx, 'titre manquant'); else verifierChaine(ep.titre, `${cx}.titre`, cadre, { label: true });
    if (!h.scenes?.[ep?.debut]) err(cx, `scène de début inconnue « ${ep?.debut} »`);
    verifierTexte(ep?.intro, `${cx}.intro`, cadre, { obligatoire: false });
  });
  // Scènes
  if (!isObj(h.scenes)) { err(ctx, 'scenes : objet { id: scène } attendu'); continue; }
  for (const [sid, sc] of Object.entries(h.scenes)) {
    const cx = `${ctx}/${sid}`;
    if (!/^[a-z0-9_]+$/.test(sid)) err(cx, 'id de scène : minuscules, chiffres et _ uniquement');
    for (const k of Object.keys(sc || {})) if (!['titre', 'texte', 'choix'].includes(k)) err(cx, `clé inconnue « ${k} » (titre, texte, choix)`);
    if (sc?.titre !== undefined) verifierChaine(sc.titre, `${cx}.titre`, cadre, { label: true });
    verifierTexte(sc?.texte, `${cx}.texte`, cadre);
    verifierChoix(sc?.choix, cx, cadre);
  }
  if (erreurs.some(e => e.startsWith(ctx))) { note(`${ctx} : parcours des branches ignoré (corriger d'abord les erreurs)`); continue; }

  // ---- 4. Graphe : toutes les branches, avec l'état des drapeaux ----
  const w = parcourirHistoire(N, h);
  if (w.tronque) avert(ctx, 'parcours tronqué (trop d\'états de drapeaux) : résultats partiels');
  for (const sid of Object.keys(h.scenes)) if (!w.scenes.has(sid)) err(ctx, `scène inatteignable « ${sid} »`);
  for (const f of Object.keys(h.fins)) if (!w.fins[f]) err(ctx, `fin inatteignable « ${f} »`);
  for (const imp of w.impasses.slice(0, 5)) err(`${ctx}/${imp.scene}`, `impasse : aucun choix visible avec ${JSON.stringify(imp.flags)}`);
  w.finsEpisode.forEach((n, i) => { if (i < h.episodes.length - 1 && n === 0) err(ctx, `l'épisode ${i + 1} ne mène jamais à l'épisode suivant (aucun finEpisode atteignable)`); });
  if (w.finsEpisode[h.episodes.length - 1] > 0) avert(ctx, 'le dernier épisode peut se terminer par finEpisode : fin générique, sans fin nommée');
  // Drapeaux : valeurs lues jamais écrites, drapeaux jamais lus
  const ecrites = w.valeursEcrites;
  const lus = new Set();
  for (const { ctx: cx, id, valeurs } of cadre.lectures) {
    lus.add(id);
    const possibles = new Set([h.drapeaux[id], ...(ecrites[id] || [])].map(String));
    for (const v of valeurs) {
      if (typeof h.drapeaux[id] === 'number' && typeof v === 'number') continue;
      if (!possibles.has(String(v))) err(cx, `drapeau ${id} comparé à « ${v} », valeur jamais écrite (${[...possibles].join(', ')})`);
    }
  }
  const tousTextes = JSON.stringify([h.scenes, h.episodes, h.fins]);
  for (const f of Object.keys(h.drapeaux)) {
    const lu = lus.has(f) || new RegExp(`["'(!\\s]${f}\\b(?![:'])`).test(tousTextes.replace(/"drapeau":\{[^}]*\}/g, ''));
    if (!lu) note(`${ctx} : drapeau « ${f} » jamais lu (simple mémoire ; utile pour une suite ?)`);
    if (!ecrites[f]) note(`${ctx} : drapeau « ${f} » jamais écrit`);
  }
  const mots = JSON.stringify(h).split(/\s+/).length;
  statsHistoires.push(`${h.id} : ${h.episodes.length} épisodes, ${Object.keys(h.scenes).length} scènes, ${Object.keys(h.fins).length} fins (atteintes par ${Object.values(w.fins).reduce((a, b) => a + b, 0)} chemins), ${Object.keys(h.personnages || {}).length} PNJ, ~${mots} mots, états de drapeaux en fin d'épisode : ${w.finsEpisode.join(' → ')}`);
}

// ============================================================
//   Colonie : incidents, événements, fils rouges, personnages, archives
// ============================================================
const idUnique = (vus, id, ctx) => {
  if (typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id)) err(ctx, 'id : minuscules, chiffres et _ uniquement');
  else if (vus.has(id)) err(ctx, 'id dupliqué');
  vus.add(id);
};
const cles = (obj, permises, ctx) => { for (const k of Object.keys(obj || {})) if (!permises.has(k)) err(ctx, `clé inconnue « ${k} » (${[...permises].filter(x => x !== 'type').join(', ')})`); };
const titreValide = (t, ctx) => { if (typeof t !== 'string' || !t.trim()) err(ctx, 'titre manquant (affiché au joueur)'); else verifierChaine(t, `${ctx}.titre`, {}, { label: true }); };
const ajouteColon = c => [...(c.test ? [c.test.reussite, c.test.echec] : [c.effets])].some(l => (l || []).some(e => isObj(e) && e.recrute !== undefined));
const toujoursPossible = c => isObj(c) && c.si === undefined && c.requiert === undefined && c.cout === undefined && c.consomme === undefined;

// Choix d'une décision de colonie : vocabulaire de la colonie, pas d'issue ;
// une recrue exige des vivres (colonie.vivres_ok) et un choix de repli sans recrue.
function verifierChoixColonie(def, ctx, cadre) {
  verifierChoix(def.choix, ctx, cadre);
  if (!Array.isArray(def.choix)) return;
  def.choix.forEach((c, i) => {
    if (!isObj(c) || !ajouteColon(c)) return;
    const garde = [def.si, c.requiert].some(x => typeof x === 'string' && N.identifiants(x).includes('colonie.vivres_ok'));
    if (!garde) err(`${ctx}.choix[${i}]`, "un choix qui fait entrer un colon exige « colonie.vivres_ok » (si de l'événement ou requiert du choix)");
  });
  if (def.choix.some(c => isObj(c) && ajouteColon(c)) && !def.choix.some(c => toujoursPossible(c) && !ajouteColon(c))) {
    err(ctx, "il faut un choix toujours possible qui n'ajoute personne (la résolution automatique ne recrute jamais)");
  }
}

// ---- Incidents ----
const CLES_INCIDENT = new Set(['id', 'titre', 'module', 'niveauMin', 'gravite', 'ton', 'si', 'poids', 'texte', 'choix', 'type']);
const TONS = ['positif', 'negatif', 'neutre'];
const idsIncidents = new Set();
for (const inc of C.INCIDENTS || []) {
  const ctx = `incident ${inc?.id || '?'}`;
  if (!isObj(inc) || inc.type !== 'incident') { err(ctx, 'créer l’incident avec incident({...}) (src/content/dsl.js)'); continue; }
  cles(inc, CLES_INCIDENT, ctx);
  idUnique(idsIncidents, inc.id, ctx);
  titreValide(inc.titre, ctx);
  if (!CAT.MODULES[inc.module]) err(ctx, `module inconnu « ${inc.module} »`);
  if (!(inc.gravite in V.GRAVITES)) err(ctx, `gravité inconnue « ${inc.gravite} » (${Object.keys(V.GRAVITES).join(', ')})`);
  if (inc.ton !== undefined && !TONS.includes(inc.ton)) err(ctx, `ton inconnu « ${inc.ton} » (${TONS.join(', ')})`);
  if (inc.niveauMin !== undefined && !(Number.isInteger(inc.niveauMin) && inc.niveauMin >= 1)) err(ctx, 'niveauMin : entier ≥ 1');
  if (inc.poids !== undefined && (!isNum(inc.poids) || inc.poids <= 0)) err(ctx, `poids : nombre positif attendu (${inc.poids})`);
  const cadre = { colonie: true, incident: true, module: inc.module };
  if (inc.si !== undefined) verifierCondition(inc.si, `${ctx}.si`, cadre);
  verifierTexte(inc.texte, `${ctx}.texte`, cadre);
  verifierChoixColonie(inc, ctx, cadre);
}

// ---- Événements de colonie ----
const CLES_EVENEMENT = new Set(['id', 'titre', 'theme', 'ton', 'si', 'acteurs', 'personnage', 'delai', 'delaiActeur', 'unique', 'spontane', 'poids', 'texte', 'choix', 'type']);
const CLES_ACTEUR = new Set(['parmi', 'filtre', 'prefere']);
const idsEvenements = new Set();
for (const ev of C.EVENEMENTS || []) {
  const ctx = `événement ${ev?.id || '?'}`;
  if (!isObj(ev) || ev.type !== 'evenement') { err(ctx, 'créer l’événement avec evenement({...}) (src/content/dsl.js)'); continue; }
  cles(ev, CLES_EVENEMENT, ctx);
  idUnique(idsEvenements, ev.id, ctx);
  if (/^event_/.test(ev.id || '')) err(ctx, "pas de préfixe « event_ » : il est réservé aux anciens ids (0.33), convertis automatiquement");
  titreValide(ev.titre, ctx);
  if (ev.theme !== undefined) verifierChaine(ev.theme, `${ctx}.theme`, {}, { label: true });
  if (ev.ton !== undefined && !TONS.includes(ev.ton)) err(ctx, `ton inconnu « ${ev.ton} » (${TONS.join(', ')})`);
  if (ev.personnage !== undefined && !PERSONNAGES_P[ev.personnage]) err(ctx, `personnage inconnu « ${ev.personnage} » (src/content/personnages/)`);
  for (const k of ['delai', 'delaiActeur']) if (ev[k] !== undefined) verifierDuree(ev[k], `${ctx}.${k}`);
  for (const k of ['unique', 'spontane']) if (ev[k] !== undefined && typeof ev[k] !== 'boolean') err(ctx, `${k} : vrai ou faux (true / false)`);
  if (ev.poids !== undefined && (!isNum(ev.poids) || ev.poids <= 0)) err(ctx, `poids : nombre positif attendu (${ev.poids})`);
  const noms = [];
  if (ev.acteurs !== undefined) {
    if (!isObj(ev.acteurs)) err(ctx, 'acteurs : { nom: { parmi?, filtre?, prefere? } } attendu');
    else for (const [nom, spec] of Object.entries(ev.acteurs)) {
      const cx = `${ctx}.acteurs.${nom}`;
      if (!/^[a-z][a-z0-9_]*$/.test(nom)) err(cx, 'nom d’acteur : minuscules, chiffres et _');
      if (NOMS_RESERVES_ACTEUR.has(nom) || V.MOTS_RESERVES.includes(nom)) err(cx, `« ${nom} » est réservé (${[...NOMS_RESERVES_ACTEUR].join(', ')})`);
      if (!isObj(spec)) { err(cx, '{ parmi?, filtre?, prefere? } attendu ({} : n’importe quel colon présent)'); continue; }
      cles(spec, CLES_ACTEUR, cx);
      if (spec.parmi !== undefined && !['colons', 'vivants', 'morts'].includes(spec.parmi)) err(cx, "parmi : 'colons' (présents), 'vivants' (même en mission) ou 'morts'");
      for (const k of ['filtre', 'prefere']) if (spec[k] !== undefined) verifierCondition(spec[k], `${cx}.${k}`, { acteur: true });
      noms.push(nom);
    }
  }
  const cadre = { colonie: true, acteurs: noms, faction: PERSONNAGES_P[ev.personnage]?.faction };
  if (ev.si !== undefined) verifierCondition(ev.si, `${ctx}.si`, cadre);
  verifierTexte(ev.texte, `${ctx}.texte`, cadre);
  verifierChoixColonie(ev, ctx, cadre);
}

// ---- Fils rouges ----
const CLES_ARC = new Set(['id', 'titre', 'surtitre', 'couleur', 'principal', 'intro', 'ouverture', 'indiceOuverture', 'etapes', 'recompense', 'type']);
const CLES_ETAPE = new Set(['id', 'titre', 'texte', 'quand', 'indice', 'objectif', 'scene']);
const CLES_OBJECTIF = new Set(['si', 'titre', 'detail', 'action', 'progression', 'modules', 'niveau']);
const ONGLETS = new Set(['base', 'equipage', 'expeditions', 'recits', 'labo']);
const idsArcs = new Set(), idsEtapes = new Set();
function verifierObjectif(o, ctx) {
  const variantes = Array.isArray(o) ? o : [o];
  variantes.forEach((v, i) => {
    const cx = Array.isArray(o) ? `${ctx}[${i}]` : ctx;
    if (!isObj(v)) { err(cx, 'objectif : { titre, action, … } attendu'); return; }
    cles(v, CLES_OBJECTIF, cx);
    if (v.si !== undefined) verifierCondition(v.si, `${cx}.si`, {});
    if (typeof v.titre !== 'string') err(cx, 'titre manquant'); else verifierChaine(v.titre, `${cx}.titre`, {}, { label: true });
    if (v.detail !== undefined) verifierChaine(v.detail, `${cx}.detail`, {});
    if (!isObj(v.action) || !ONGLETS.has(v.action.onglet)) err(cx, `action : { onglet (${[...ONGLETS].join(', ')}), sousOnglet?, cible?, label? } attendu`);
    else if (v.action.cible !== undefined && v.action.onglet === 'base' && !CAT.MODULES[v.action.cible]) err(cx, `module cible inconnu « ${v.action.cible} »`);
    if (v.progression !== undefined) {
      if (!isObj(v.progression) || typeof v.progression.valeur !== 'string' || !isNum(v.progression.total)) err(cx, "progression : { valeur: 'colonie.colons', total: 10, unite? } attendu");
      else verifierCondition(v.progression.valeur, `${cx}.progression.valeur`, {});
    }
    if (v.modules !== undefined) {
      if (!Array.isArray(v.modules) || !v.modules.length) err(cx, 'modules : liste d’ids de modules');
      else for (const m of v.modules) if (!CAT.MODULES[m]) err(cx, `module inconnu « ${m} »`);
      if (!Number.isInteger(v.niveau) || v.niveau < 1) err(cx, 'niveau : entier ≥ 1 (avec modules)');
    }
    if (Array.isArray(o) && i === o.length - 1 && v.si !== undefined) avert(cx, 'la dernière variante devrait être sans condition (objectif par défaut)');
  });
}
for (const arc of C.ARCS || []) {
  const ctx = `fil rouge ${arc?.id || '?'}`;
  if (!isObj(arc) || arc.type !== 'arc') { err(ctx, 'créer le fil rouge avec arc({...}) (src/content/dsl.js)'); continue; }
  cles(arc, CLES_ARC, ctx);
  idUnique(idsArcs, arc.id, ctx);
  titreValide(arc.titre, ctx);
  if (arc.surtitre !== undefined) verifierChaine(arc.surtitre, `${ctx}.surtitre`, {}, { label: true });
  if (arc.couleur !== undefined && !/^#[0-9a-f]{6}$/i.test(arc.couleur)) err(ctx, "couleur : '#rrvvbb'");
  if (arc.intro !== undefined) verifierChaine(arc.intro, `${ctx}.intro`, {});
  if (arc.indiceOuverture !== undefined) verifierChaine(arc.indiceOuverture, `${ctx}.indiceOuverture`, {});
  verifierCondition(arc.ouverture ?? true, `${ctx}.ouverture`, {});
  if (!Array.isArray(arc.etapes) || !arc.etapes.length) { err(ctx, 'etapes : liste non vide attendue'); continue; }
  arc.etapes.forEach((e, i) => {
    const cx = `${ctx}.etapes[${i}]`;
    if (!isObj(e)) { err(cx, 'étape : objet attendu'); return; }
    cles(e, CLES_ETAPE, cx);
    idUnique(idsEtapes, e.id, `${cx} (${e.id})`);
    titreValide(e.titre, cx);
    verifierTexte(e.texte, `${cx}.texte`, {});
    verifierCondition(e.quand, `${cx}.quand`, {});
    if (e.indice !== undefined) verifierChaine(e.indice, `${cx}.indice`, {});
    if (e.objectif !== undefined) verifierObjectif(e.objectif, `${cx}.objectif`);
    if (e.scene !== undefined) {
      const ev = (C.EVENEMENTS || []).find(x => x.id === e.scene);
      if (!ev) err(cx, `scène inconnue « ${e.scene} » (un événement de src/content/evenements/)`);
      else if (ev.spontane !== false) avert(cx, `la scène « ${e.scene} » peut aussi survenir au hasard (spontane: false pour la réserver au fil)`);
    }
  });
  if (arc.recompense !== undefined) {
    const r = arc.recompense, cx = `${ctx}.recompense`;
    if (!isObj(r)) err(cx, '{ titre, texte, effets } attendu');
    else {
      cles(r, new Set(['titre', 'texte', 'effets']), cx);
      if (r.titre !== undefined) verifierChaine(r.titre, `${cx}.titre`, {});
      if (r.texte !== undefined) verifierChaine(r.texte, `${cx}.texte`, {});
      if (r.effets !== undefined) verifierEffets(r.effets, `${cx}.effets`, { colonie: true, consequence: true });
    }
  }
}
// Les fils de 0.33 gardent leurs ids (sauvegardes) : leur disparition est une erreur
for (const id of ['arc_avant_poste', 'arc_effondrement', 'arc_cristaux', 'arc_couvee']) if (!idsArcs.has(id)) err(`fil rouge ${id}`, 'absent : son id est référencé par les sauvegardes (et par TECH_TREE prereq.requireArc)');
for (const [id, t] of Object.entries(CAT.TECH_TREE)) if (t.prereq?.requireArc && !idsArcs.has(t.prereq.requireArc)) err(`TECH_TREE.${id}`, `fil rouge requis inconnu « ${t.prereq.requireArc} »`);

// ---- Personnages partagés ----
const CLES_PERSO = new Set(['id', 'nom', 'age', 'pronoms', 'role', 'voix', 'portrait', 'faction', 'recrue', 'type']);
for (const [cle, p] of Object.entries(PERSONNAGES_P)) {
  const ctx = `personnage ${p?.id || cle}`;
  if (!isObj(p) || p.type !== 'personnage') { err(ctx, 'créer le personnage avec personnage({...}) (src/content/dsl.js)'); continue; }
  cles(p, CLES_PERSO, ctx);
  if (!/^[a-z][a-z0-9_]*$/.test(p.id || '')) err(ctx, 'id : minuscules, chiffres et _ uniquement');
  if (typeof p.nom !== 'string' || !p.nom.trim()) err(ctx, 'nom manquant'); else verifierChaine(p.nom, `${ctx}.nom`, {}, { label: true });
  if (!['il', 'elle', 'iel'].includes(p.pronoms)) err(ctx, "pronoms : 'il', 'elle' ou 'iel' (accords des textes)");
  for (const k of ['role', 'voix', 'portrait']) if (p[k] !== undefined) verifierChaine(p[k], `${ctx}.${k}`, {});
  if (p.age !== undefined && !(Number.isInteger(p.age) && p.age > 0)) err(ctx, 'age : entier positif');
  if (p.faction !== undefined && !TYPES_FACTION.has(p.faction)) err(ctx, `type de faction inconnu « ${p.faction} »`);
  if (p.recrue) {
    for (const k of Object.keys(p.recrue)) if (!['competences', 'caracs', 'traits'].includes(k)) err(ctx, `recrue : clé inconnue « ${k} »`);
    for (const [k, v] of Object.entries(p.recrue.competences || {})) if (!SKILLS.has(k) || !Number.isInteger(v) || v < 0 || v > 5) err(ctx, `compétence « ${k}: ${v} » (0 à 5)`);
    for (const [k, v] of Object.entries(p.recrue.caracs || {})) if (!STATS.has(k) || !Number.isInteger(v) || v < 1 || v > 10) err(ctx, `caractéristique « ${k}: ${v} » (1 à 10)`);
    for (const t of p.recrue.traits || []) if (!CAT.TRAITS[t]) err(ctx, `trait inconnu « ${t} »`);
  }
  const apparitions = (C.EVENEMENTS || []).filter(e => e.personnage === p.id).length;
  if (apparitions < 2) avert(ctx, `n'apparaît que dans ${apparitions} événement(s) : un personnage partagé revient (2 au moins)`);
}

// ---- Archives (lore) ----
const CLES_LORE = new Set(['id', 'titre', 'categorie', 'ordre', 'si', 'resume', 'texte', 'type']);
const idsLore = new Set();
for (const page of C.LORE || []) {
  const ctx = `archives ${page?.id || '?'}`;
  if (!isObj(page) || page.type !== 'lore') { err(ctx, 'créer la page avec lore({...}) (src/content/dsl.js)'); continue; }
  cles(page, CLES_LORE, ctx);
  idUnique(idsLore, page.id, ctx);
  titreValide(page.titre, ctx);
  if (!(page.categorie in V.CATEGORIES_LORE)) err(ctx, `catégorie inconnue « ${page.categorie} » (${Object.keys(V.CATEGORIES_LORE).join(', ')})`);
  if (page.ordre !== undefined && !isNum(page.ordre)) err(ctx, 'ordre : nombre');
  if (page.si === undefined) err(ctx, "si manquant : condition de déblocage (« vrai » pour une page ouverte dès le départ)");
  else verifierCondition(page.si, `${ctx}.si`, {});
  if (page.resume !== undefined) verifierChaine(page.resume, `${ctx}.resume`, { colonie: true });
  verifierTexte(page.texte, `${ctx}.texte`, { colonie: true });
}

// Drapeaux globaux lus jamais écrits
for (const [cx, k] of MONDE_LU) if (!MONDE_ECRIT.has(k)) err(cx, `monde.${k} est lu mais aucun effet { monde: { ${k}: … } } ne l'écrit`);

// Chaque ennemi doit pouvoir être rencontré
for (const id of Object.keys(CAT.ENEMY_TYPES)) if (!ennemisRencontres.has(id)) err(`ENEMY_TYPES.${id}`, 'jamais rencontré (aucune scène ne lance de combat contre lui)');

// ============================================================
//   7. Couverture : scènes compatibles par type de lieu
// ============================================================
// Corps générés par le vrai générateur (state.js), sur plusieurs galaxies.
const lieux = [];
for (let g = 0; g < 6; g++) {
  const gal = ST.genGalaxy(`couverture-${g}`);
  for (const sys of gal.systems) for (const b of sys.bodies) lieux.push(b);
}
const lire = b => id => { const [ns, a] = id.split('.'); if (ns === 'corps') return a === 'visites' ? 0 : b[a]; if (ns === 'faction') return a === 'existe' ? false : undefined; return undefined; };
const compat = (b, s) => { try { return N.condition(s.lieux ?? true, lire(b)); } catch { return false; } };
const parMoment = m => C.SCENES.filter(s => (s.moment || 'exploration') === m);
const expl = parMoment('exploration'), arr = parMoment('arrivee'), dep = parMoment('depart');
const comptes = lieux.map(b => ({ b, n: expl.filter(s => compat(b, s)).length, a: arr.filter(s => compat(b, s)).length, d: dep.filter(s => compat(b, s)).length }));
const pauvres = comptes.filter(c => c.n < 4);
const sansArrivee = comptes.filter(c => c.a === 0 || c.d === 0);
if (sansArrivee.length) err('couverture', `${sansArrivee.length} lieu(x) sans scène d'arrivée ou de départ compatible (ex. ${JSON.stringify(sansArrivee[0].b)})`);
const moyenne = (comptes.reduce((s, c) => s + c.n, 0) / comptes.length).toFixed(1);
const couverture = [`Couverture (${comptes.length} lieux générés) : ${moyenne} scènes d'exploration compatibles en moyenne, min ${Math.min(...comptes.map(c => c.n))}, ${pauvres.length} lieu(x) à moins de 4 (${(100 * pauvres.length / comptes.length).toFixed(1)} %).`];
const parAttr = attr => {
  const g = {};
  for (const c of comptes) { const k = c.b[attr]; (g[k] ||= []).push(c.n); }
  return Object.entries(g).map(([k, ns]) => `${k} ${(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)}`).join(' · ');
};
for (const attr of ['type', 'biome', 'atmosphere', 'ruines', 'vie', 'danger', 'signal']) couverture.push(`  par ${attr.padEnd(10)} : ${parAttr(attr)}`);
if (pauvres.length) {
  const types = {};
  for (const c of pauvres) { const k = `${c.b.type}/${c.b.biome}/${c.b.atmosphere}/ruines ${c.b.ruines}/vie ${c.b.vie}`; types[k] = (types[k] || 0) + 1; }
  couverture.push('  lieux pauvres les plus fréquents : ' + Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, ARGS.includes('--couverture') ? 20 : 5).map(([k, n]) => `${k} (${n})`).join(' ; '));
}
const jamais = C.SCENES.filter(s => !lieux.some(b => compat(b, s)) && s.moment !== 'embuscade');
if (jamais.length) avert('couverture', `scène(s) compatible(s) avec aucun lieu généré : ${jamais.map(s => s.id).join(', ')}`);

// ============================================================
//   Résultat
// ============================================================
const nbChoix = C.SCENES.reduce((s, x) => s + (x.choix?.length || 0), 0);
const hs = Object.values(HISTOIRES);
console.log(`Colonie : ${(C.INCIDENTS || []).length} incidents, ${(C.EVENEMENTS || []).length} événements, ${(C.ARCS || []).length} fils rouges, ${Object.keys(C.PERSONNAGES || {}).length} personnages partagés, ${(C.LORE || []).length} pages d'archives.`);
console.log(`Contenu : ${C.SCENES.length} scènes d'expédition (${nbChoix} choix), ${hs.length} histoires (${hs.reduce((s, h) => s + Object.keys(h.scenes || {}).length, 0)} scènes, ${hs.reduce((s, h) => s + (h.scenes ? Object.values(h.scenes).reduce((a, sc) => a + (sc.choix?.length || 0), 0) : 0), 0)} choix, ${hs.reduce((s, h) => s + Object.keys(h.fins || {}).length, 0)} fins, ${hs.reduce((s, h) => s + Object.keys(h.personnages || {}).length, 0)} personnages).`);
for (const l of statsHistoires) console.log('  • ' + l);
for (const l of couverture) console.log(l);
if (ARGS.includes('--notes')) for (const n of notes) console.log('  · ' + n);
else if (notes.length) console.log(`  (${notes.length} note(s) : --notes pour les voir)`);
if (avertissements.length) {
  console.log(`⚠ ${avertissements.length} avertissement(s) :`);
  for (const a of avertissements) console.log('  - ' + a);
}
if (erreurs.length) {
  console.error(`✗ ${erreurs.length} erreur(s) de contenu :`);
  for (const e of erreurs) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ Contenu narratif valide.');
