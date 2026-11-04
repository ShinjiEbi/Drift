#!/usr/bin/env node
// tools/run-regress.mjs — lance tous les tests de non-régression de tools/regress/.
// Usage : node tools/run-regress.mjs [filtre]
// Chaque fichier est un script autonome qui sort avec le code 1 en cas d'échec.
// Les fichiers dont le nom commence par « _ » sont des aides partagées, pas des tests.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'regress');
const filter = process.argv[2] || '';
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => /\.(mjs|cjs|js)$/.test(f) && !f.startsWith('_') && f.includes(filter)).sort()
  : [];

if (!files.length) {
  console.log('Aucun test de non-régression trouvé.');
  process.exit(0);
}

const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env, timeout: 180000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`✓ ${f} (${secs} s)`);
  } else {
    failed.push(f);
    console.log(`✗ ${f} (${secs} s, code ${r.status ?? r.signal})`);
    const out = (r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n');
    if (out) console.log(out.replace(/^/gm, '    '));
  }
}

console.log(`\n${files.length - failed.length}/${files.length} tests réussis`);
process.exit(failed.length ? 1 : 0);
