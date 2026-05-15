// util.js — helpers utilitaires : RNG, DOM, formats
// Extrait depuis app.js lors de la modularisation

// Format des nombres
export const fmt = n => {
  if (n >= 100000) return (n/1000).toFixed(0) + 'k';
  if (n >= 10000)  return (n/1000).toFixed(1) + 'k';
  if (n >= 100)    return Math.floor(n).toString();
  return n.toFixed(1).replace(/\.0$/, '');
};

// Format durée minutes-jeu → texte
export const fmtMin = m => {
  if (m < 1) return Math.ceil(m*60) + 's';
  if (m < 60) return Math.ceil(m) + ' min';
  const h = Math.floor(m/60), r = Math.ceil(m%60);
  return h + 'h' + (r ? r.toString().padStart(2,'0') : '');
};

// ============================================================
// 2. RNG — PRNG seedé Mulberry32 (déterministe, prépare le multi)
// ============================================================

// Convertit une string en seed 32 bits (FNV-1a)
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Crée un PRNG seedé. Renvoie une fonction () => [0,1)
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// PRNG dérivé d'une seed maître + namespace (string libre).
// Permet d'avoir un RNG stable par planète/système/scène.
export function rngFor(masterSeed, ...parts) {
  return mulberry32(hashSeed(masterSeed + '|' + parts.join('|')));
}

// Helpers utilisant un RNG donné (par défaut Math.random)
export function rPick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }
export function rWeighted(entries, rng = Math.random) {
  // entries : array de [key, weight]
  const total = entries.reduce((s, [_, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}
export function rInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}


export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));
