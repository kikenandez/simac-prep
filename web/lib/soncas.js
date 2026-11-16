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

// ----------------------------------------------------------------------------- saisie de l'utilisateur
// Par motivation : ses observations (notes), ses arguments (args) et les scores qu'il a fixés lui-même (fixed).
// Rangée à part de la proposition IA : une nouvelle proposition ne l'écrase jamais.
const CODES = SONCAS.map((d) => d.code);
const MAX_THREES = 3;

export function blankMine() { return { notes: {}, args: {}, fixed: {} }; }

/** Remet en forme une saisie venue d'un brouillon ou d'un import : seuls les codes connus et les bons types restent. */
export function normMine(m) {
  const out = blankMine();
  if (!m || typeof m !== 'object') return out;
  for (const c of CODES) {
    if (typeof m.notes?.[c] === 'string' && m.notes[c].trim()) out.notes[c] = m.notes[c];
    if (Array.isArray(m.args?.[c])) { const a = m.args[c].filter((x) => typeof x === 'string' && x.trim()); if (a.length) out.args[c] = a; }
    if (m.fixed?.[c] === true) out.fixed[c] = true;
  }
  return out;
}

export function hasMine(m) {
  return !!m && (Object.keys(m.notes || {}).some((c) => (m.notes[c] || '').trim()) || Object.keys(m.args || {}).some((c) => (m.args[c] || []).length) || Object.values(m.fixed || {}).some(Boolean));
}

/** Texte « un argument par ligne » → liste, sans lignes vides ni tirets de début. */
export function lines(text) {
  return String(text || '').split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

/** Proposition IA + scores de l'utilisateur : ses scores fixés restent ; au plus trois 3, les scores IA cèdent d'abord. */
export function mergeScores(ai, prev, fixed = {}) {
  const f = fixed || {};
  const out = { ...ai };
  for (const c of CODES) if (f[c] && prev && Number.isFinite(prev[c])) out[c] = prev[c];
  const threes = () => CODES.filter((c) => out[c] === 3);
  for (const c of [...CODES].reverse()) {
    if (threes().length <= MAX_THREES) break;
    if (out[c] === 3 && !f[c]) out[c] = 2;
  }
  return out;
}

const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Un argument IA répète-t-il un argument de l'utilisateur ? Même texte, ou le reprend mot pour mot dans une phrase plus longue. */
function repeats(ai, own) {
  const a = norm(ai), o = norm(own);
  if (!a || !o) return false;
  return a === o || (o.length >= 12 && a.includes(o));
}
/** Arguments d'une motivation : ceux de l'utilisateur d'abord, puis ceux de l'IA qui ne les répètent pas. */
export function withMine(mine, aiArgs, code) {
  const own = mine?.args?.[code] || [];
  return [...own, ...(aiArgs?.[code] || []).filter((a) => !own.some((o) => repeats(a, o)))];
}

/** Ce que l'utilisateur a écrit, par personne, pour le prompt ; null s'il n'a rien écrit. */
export function userInput(people, names = []) {
  const out = (people || []).map((p, i) => {
    const m = normMine(p?.mine);
    if (!hasMine(m)) return null;
    const fixed_scores = Object.fromEntries(Object.keys(m.fixed).map((c) => [c, p.scores?.[c]]));
    return { person: names[i] || `#${i + 1}`, index: i + 1, observations: m.notes, arguments: m.args, fixed_scores };
  }).filter(Boolean);
  return out.length ? out : null;
}

/** Colonne CSV soncas_mine : la saisie de chaque personne, en JSON ; vide si rien n'a été écrit. */
export function packMine(people) {
  const all = (people || []).map((p) => normMine(p?.mine));
  return all.some(hasMine) ? JSON.stringify(all) : '';
}
export function unpackMine(str, n = 1) {
  let arr = [];
  try { arr = str ? JSON.parse(str) : []; } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return Array.from({ length: Math.max(1, n) }, (_, i) => normMine(arr[i]));
}
