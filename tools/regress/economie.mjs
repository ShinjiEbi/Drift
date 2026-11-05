#!/usr/bin/env node
// tools/regress/economie.mjs — « économie sans mur » : branche tools/check-economy.mjs
// dans les tests de non-régression (aucun coût au-dessus du stockage atteignable,
// aucune tech derrière un schéma tiré au hasard).
// Usage : node tools/regress/economie.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-economy.mjs');
const r = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
