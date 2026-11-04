#!/usr/bin/env node
// tools/regress/all.mjs — lance tous les tests de non-régression de tools/regress/.
// Usage : node tools/regress/all.mjs   (code de sortie 1 si l'un d'eux échoue)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const tests = fs.readdirSync(DIR).filter(f => f.endsWith('.mjs') && !['all.mjs', 'lib.mjs'].includes(f)).sort();
const failed = [];
for (const f of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', env: process.env });
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`✓ ${f} (${s} s)`);
  } else {
    failed.push(f);
    console.log(`✗ ${f} (${s} s)\n${(r.stdout || '') + (r.stderr || '')}`);
  }
}
if (failed.length) { console.error(`\n✗ ${failed.length}/${tests.length} test(s) en échec : ${failed.join(', ')}`); process.exit(1); }
console.log(`\n✓ ${tests.length} tests de non-régression réussis`);
