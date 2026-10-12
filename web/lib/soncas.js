// lib/soncas.js — dimensions SONCAS-E et utilitaires de scoring.
// Les codes (S O N C A Y E) restent fixes dans toutes les langues ; seuls les libellés sont traduits.
// ES : SONCAS se dit aussi SONCAS (Seguridad, Orgullo, Novedad, Comodidad, Dinero, Simpatía ; E = Ecología).
// EN : pas d'acronyme établi ; on garde SONCAS avec Security, Pride, Novelty, Comfort, Money, Sympathy, Environment.
import { t } from './i18n.js';
export const SONCAS = [
  { code: 'S', label: t('Sécurité'), hint: t('Veut être tranquille, sûr que ça fonctionne : garanties, cadre, références.') },
  { code: 'O', label: t('Orgueil'), hint: t('Ego, prestige, reconnaissance : être à la pointe, être cité.') },
  { code: 'N', label: t('Nouveauté'), hint: t('Attiré par ce qui est nouveau, moderne, innovant.') },
  { code: 'C', label: t('Confort'), hint: t('Facilité, gain de temps, simplicité, zéro friction.') },
  { code: 'A', label: t('Argent'), hint: t('Gain financier, optimisation des coûts, retour sur investissement.') },
  { code: 'Y', label: t('Sympathie'), hint: t('Relationnel, confiance, plaisir à collaborer.') },
  { code: 'E', label: t('Environnement'), hint: t('Respect de l’environnement, valeurs, éthique.') },
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

export const WEIGHTS = { decide: t('décide'), influence: t('influence'), use: t('utilise') };
