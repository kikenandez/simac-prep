// lib/soncas.js — dimensions SONCAS-E et utilitaires de scoring.
export const SONCAS = [
  { code: 'S', label: 'Sécurité', hint: 'Veut être tranquille, sûr que ça fonctionne : garanties, cadre, références.' },
  { code: 'O', label: 'Orgueil', hint: 'Ego, prestige, reconnaissance : être à la pointe, être cité.' },
  { code: 'N', label: 'Nouveauté', hint: 'Attiré par ce qui est nouveau, moderne, innovant.' },
  { code: 'C', label: 'Confort', hint: 'Facilité, gain de temps, simplicité, zéro friction.' },
  { code: 'A', label: 'Argent', hint: 'Gain financier, optimisation des coûts, retour sur investissement.' },
  { code: 'Y', label: 'Sympathie', hint: 'Relationnel, confiance, plaisir à collaborer.' },
  { code: 'E', label: 'Environnement', hint: 'Respect de l’environnement, valeurs, éthique.' },
];

export const DEFAULT_SCORES = { S: 2, O: 2, N: 2, C: 2, A: 2, Y: 2, E: 2 };

export function clampScores(scores = {}) {
  const out = { ...DEFAULT_SCORES };
  for (const d of SONCAS) {
    const v = Number(scores[d.code]);
    out[d.code] = Number.isFinite(v) ? Math.min(3, Math.max(1, Math.round(v))) : 2;
  }
  return out;
}

/** Les 3 dimensions les plus fortes, ordre stable S-O-N-C-A-S-E en cas d'égalité. */
export function top3(scores) {
  return [...SONCAS]
    .sort((a, b) => (scores[b.code] - scores[a.code]) || (SONCAS.indexOf(a) - SONCAS.indexOf(b)))
    .slice(0, 3)
    .map((d) => d.code);
}

export function label(code) {
  return SONCAS.find((d) => d.code === code)?.label || code;
}

/** Scores → "S3 O1 N2 C3 A3 Y2 E1" (colonne CSV à plat) et retour. */
export function packScores(scores) {
  return SONCAS.map((d) => d.code + (scores?.[d.code] ?? 2)).join(' ');
}
export function unpackScores(str) {
  const out = {};
  for (const m of String(str || '').matchAll(/([SONCAYE])([123])/g)) out[m[1]] = +m[2];
  return clampScores(out);
}

export const WEIGHTS = { decide: 'décide', influence: 'influence', use: 'utilise' };
