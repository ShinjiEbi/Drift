#!/usr/bin/env node
// tools/sw-version.mjs — liste de pré-cache et version du cache du service worker.
//
// Usage :
//   node tools/sw-version.mjs            affiche la version, l'empreinte et la liste
//   node tools/sw-version.mjs --write    met à jour le bloc généré de sw.js
//   node tools/sw-version.mjs --check    échoue (code 1) si sw.js n'est pas à jour
//   … --root <dossier>                   travaille sur une autre copie du jeu (tests)
//
// La liste des fichiers pré-cachés est calculée, pas écrite à la main :
//   • index.html, et tout ce qu'il charge (<link href>, <script src>, <img src>) ;
//   • le manifeste et ses icônes ;
//   • les url(…) et @import des feuilles de style (polices locales…) ;
//   • tous les .js/.mjs de src/ et les chemins './icons/…', './fonts/…' qu'ils citent.
// L'empreinte (sha-256 tronqué) couvre le contenu de tous ces fichiers ET le
// reste de sw.js : chaque release qui change un octet publié obtient un
// nouveau cache, et le navigateur voit un sw.js différent → mise à jour.
// Les fins de ligne sont normalisées (CRLF → LF) pour que l'empreinte soit
// la même sous Windows et sous Linux.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const ROOT = rootArg >= 0
  ? path.resolve(args[rootArg + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : 'print';

const SW_FILE = path.join(ROOT, 'sw.js');
const BLOCK_RE = /^\/\/ @generated-start.*\n[\s\S]*?^\/\/ @generated-end.*$/m;
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

const errors = [];

// ---------- Résolution des références ----------
const toRel = abs => path.relative(ROOT, abs).split(path.sep).join('/');

// Résout une URL relative trouvée dans `fromRel` ; renvoie null si externe.
function resolveRef(ref, fromRel) {
  ref = ref.trim();
  if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|%23)/i.test(ref)) return null; // http:, data:, blob:, //cdn, #ancre
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  const abs = clean.startsWith('/')
    ? path.join(ROOT, clean)
    : path.resolve(path.dirname(path.join(ROOT, fromRel)), decodeURI(clean));
  if (!abs.startsWith(ROOT + path.sep)) { errors.push(`${fromRel} : référence hors du projet « ${ref} »`); return null; }
  return toRel(abs);
}

function walk(dirRel, exts) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const rel = dirRel + '/' + e.name;
    if (e.isDirectory()) return walk(rel, exts);
    return exts.includes(path.extname(e.name)) ? [rel] : [];
  });
}

function collect() {
  const files = new Set();
  const queue = [];
  const add = (rel, from) => {
    if (!rel || files.has(rel)) return;
    if (!fs.existsSync(path.join(ROOT, rel))) { errors.push(`${from} référence « ${rel} », introuvable`); return; }
    files.add(rel);
    queue.push(rel);
  };
  add('index.html', 'racine');
  for (const js of walk('src', ['.js', '.mjs'])) add(js, 'src/');

  while (queue.length) {
    const rel = queue.shift();
    const ext = path.extname(rel);
    if (!TEXT_EXT.has(ext)) continue;
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (ext === '.html') {
      const noComments = text.replace(/<!--[\s\S]*?-->/g, '');
      for (const m of noComments.matchAll(/<link\b[^>]*>/gi)) {
        const tag = m[0];
        const rel_ = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || '';
        if (/\b(?:preconnect|dns-prefetch|canonical|alternate)\b/i.test(rel_)) continue;
        const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
        if (href) add(resolveRef(href, rel), rel);
      }
      for (const m of noComments.matchAll(/<(?:script|img|source)\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi)) add(resolveRef(m[1], rel), rel);
    } else if (ext === '.json' || ext === '.webmanifest') {
      let json;
      try { json = JSON.parse(text); } catch (e) { errors.push(`${rel} : JSON invalide (${e.message})`); continue; }
      const imgs = [...(json.icons || []), ...(json.screenshots || []), ...(json.shortcuts || []).flatMap(s => s.icons || [])];
      for (const img of imgs) {
        const r = resolveRef(img.src || '', rel);
        add(r, rel);
        if (r && img.sizes) checkPngSize(r, img.sizes, rel);
      }
    } else if (ext === '.css') {
      const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
      // Les chaînes entre guillemets sont consommées d'un bloc : un url(#…)
      // à l'intérieur d'une image data: n'est pas une ressource.
      for (const m of noComments.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/gi)) {
        add(resolveRef(m[1] ?? m[2] ?? m[3], rel), rel);
      }
      for (const m of noComments.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) add(resolveRef(m[2], rel), rel);
    } else if (ext === '.js' || ext === '.mjs') {
      for (const m of text.matchAll(/\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1|\bimport\s*\(\s*(['"])(\.{1,2}\/[^'"]+)\3\s*\)|^\s*import\s*(['"])(\.{1,2}\/[^'"]+)\5/gm)) {
        add(resolveRef(m[2] || m[4] || m[6], rel), rel);
      }
      // Ressources citées en dur (icônes de notification…), relatives au document.
      for (const m of text.matchAll(/(['"`])\.\/((?:icons|fonts)\/[^'"`$]+)\1/g)) add(m[2], rel);
    }
  }
  return [...files].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

// Les tailles déclarées (manifeste) doivent correspondre aux PNG.
function checkPngSize(rel, sizes, from) {
  if (!rel.endsWith('.png') || sizes === 'any') return;
  const buf = fs.readFileSync(path.join(ROOT, rel));
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') { errors.push(`${rel} : PNG illisible`); return; }
  const real = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  if (!sizes.split(/\s+/).includes(real)) errors.push(`${from} : ${rel} déclaré ${sizes}, réel ${real}`);
}

// ---------- Empreinte ----------
function normalized(rel, buf) {
  return TEXT_EXT.has(path.extname(rel)) ? Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buf;
}

function contentHash(files, swSource) {
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel + '\0');
    h.update(normalized(rel, fs.readFileSync(path.join(ROOT, rel))));
    h.update('\0');
  }
  h.update('sw.js\0');
  h.update(swSource.replace(/\r\n/g, '\n').replace(BLOCK_RE, '// @generated'));
  return h.digest('hex').slice(0, 12);
}

function appVersion() {
  const src = fs.readFileSync(path.join(ROOT, 'src/constants.js'), 'utf8');
  const m = /export\s+const\s+VERSION\s*=\s*['"]([^'"]+)['"]/.exec(src);
  if (!m) { errors.push('src/constants.js : VERSION introuvable'); return '0.0.0'; }
  return m[1];
}

function renderBlock(version, hash, files) {
  return [
    '// @generated-start — tools/sw-version.mjs (npm run sw:write)',
    `const APP_VERSION = '${version}';`,
    `const CONTENT_HASH = '${hash}';`,
    'const PRECACHE_URLS = [',
    files.map(f => `  './${f}'`).join(',\n'),
    '];',
    '// @generated-end'
  ].join('\n');
}

// ---------- Main ----------
const sw = fs.readFileSync(SW_FILE, 'utf8');
const current = BLOCK_RE.exec(sw);
if (!current) {
  console.error('✗ sw.js : bloc « // @generated-start … // @generated-end » introuvable.');
  process.exit(1);
}
const files = collect();
const version = appVersion();
const hash = contentHash(files, sw);
const block = renderBlock(version, hash, files);

if (errors.length) {
  console.error('✗ Références invalides :\n  ' + errors.join('\n  '));
  process.exit(1);
}

if (MODE === 'write') {
  if (current[0] === block) {
    console.log(`✓ sw.js déjà à jour (drift-${version}-${hash}, ${files.length} fichiers)`);
  } else {
    fs.writeFileSync(SW_FILE, sw.replace(BLOCK_RE, block));
    console.log(`✓ sw.js mis à jour : cache drift-${version}-${hash}, ${files.length} fichiers pré-cachés`);
  }
} else if (MODE === 'check') {
  if (current[0] === block) {
    console.log(`✓ sw.js à jour (drift-${version}-${hash}, ${files.length} fichiers pré-cachés)`);
  } else {
    const listed = [...current[0].matchAll(/^\s*'\.\/([^']+)'/gm)].map(m => m[1]);
    const missing = files.filter(f => !listed.includes(f));
    const extra = listed.filter(f => !files.includes(f));
    console.error('✗ sw.js n\'est pas à jour avec les fichiers du jeu.');
    if (missing.length) console.error('  À pré-cacher : ' + missing.join(', '));
    if (extra.length) console.error('  En trop (supprimés ou plus référencés) : ' + extra.join(', '));
    const oldHash = /CONTENT_HASH = '([^']*)'/.exec(current[0])?.[1];
    const oldVer = /APP_VERSION = '([^']*)'/.exec(current[0])?.[1];
    if (oldVer !== version) console.error(`  Version : ${oldVer} → ${version}`);
    if (oldHash !== hash) console.error(`  Empreinte du contenu : ${oldHash} → ${hash}`);
    console.error('  → Lance `npm run sw:write` (node tools/sw-version.mjs --write) puis commite sw.js.');
    process.exit(1);
  }
} else {
  console.log(`Cache : drift-${version}-${hash}`);
  console.log(files.map(f => '  ./' + f).join('\n'));
}
