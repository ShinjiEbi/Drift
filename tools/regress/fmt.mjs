#!/usr/bin/env node
// tools/regress/fmt.mjs — test unitaire des formateurs de src/util.js (F1).
// Usage : node tools/regress/fmt.mjs   (code de sortie 1 en cas d'échec)
import { fmt, fmtMin } from '../../src/util.js';

const cases = [
  // [fonction, entrée, attendu]
  [fmtMin, 0.5, '30s'],
  [fmtMin, 45, '45 min'],
  [fmtMin, 44.2, '45 min'],
  [fmtMin, 59.5, '1h'],          // bug F1 : donnait « 60 min »
  [fmtMin, 60, '1h'],
  [fmtMin, 119.5, '2h'],         // bug F1 : donnait « 1h60 »
  [fmtMin, 179.2, '3h'],         // bug F1 : donnait « 2h60 »
  [fmtMin, 125, '2h05'],
  [fmtMin, 124.1, '2h05'],
  [fmtMin, 120, '2h'],
  [fmtMin, 1440, '24h'],
  [fmtMin, 0, '0s'],
  [fmtMin, -12, '0s'],
  [fmtMin, NaN, '—'],
  [fmtMin, undefined, '—'],
  [fmt, 0, '0'],
  [fmt, 5.25, '5.3'],
  [fmt, 7, '7'],
  [fmt, 150.7, '150'],
  [fmt, 12345, '12.3k'],
  [fmt, 250000, '250k'],
  [fmt, undefined, '0'],
  [fmt, NaN, '0'],
];

let failed = 0;
for (const [fn, input, expected] of cases) {
  const got = fn(input);
  if (got !== expected) {
    failed++;
    console.error(`  ✗ ${fn === fmt ? 'fmt' : 'fmtMin'}(${input}) = ${JSON.stringify(got)}, attendu ${JSON.stringify(expected)}`);
  }
}
// Propriété : jamais « 60 » dans la partie minutes, jamais « 60 min »
for (let m = 0.01; m < 600; m += 0.37) {
  const s = fmtMin(m);
  if (/h60$/.test(s) || s === '60 min') { failed++; console.error(`  ✗ fmtMin(${m.toFixed(2)}) = ${s}`); break; }
}
if (failed) { console.error(`\n✗ ${failed} échec(s)`); process.exit(1); }
console.log(`✓ fmt/fmtMin : ${cases.length} cas + propriété OK`);
