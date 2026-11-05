// chronicles.js — passerelle vers les histoires V1 (chroniques planétaires).
//
// Depuis la V1, les chroniques sont des fichiers de contenu en données pures :
// src/content/histoires/*.js (format : docs/ecrire-pour-drift.md), lues par le
// moteur narratif (src/engine/narration.js). Ce module garde les deux noms
// historiques pour le code qui les importe :
//   CHRONICLES       — les histoires par id (format V1 : titre, episodes, scenes…)
//   CHRONICLE_SCENES — index à plat des scènes d'histoire, id global « histoire/scene »

import { HISTOIRES } from './content/index.js';

export const CHRONICLES = HISTOIRES;

export const CHRONICLE_SCENES = Object.freeze(Object.values(HISTOIRES).flatMap(h =>
  Object.entries(h.scenes).map(([cle, scene]) => Object.freeze({ id: `${h.id}/${cle}`, histoire: h.id, cle, scene }))));
