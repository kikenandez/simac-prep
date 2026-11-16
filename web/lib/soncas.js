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

// ---------------------------------------------------------------- saisie manuelle par motivation
// Chaque personne porte, à côté de la proposition IA (aiScores, rationale, arguments), ce que l'utilisateur a saisi :
// notes (ce qu'il sait : indices, propos entendus), myArgs (ses arguments) et manual (scores qu'il a fixés lui-même).
// Une nouvelle proposition IA ne touche jamais à ces trois champs.
const CODES = SONCAS.map((d) => d.code);
const MAX_NOTE = 1000, MAX_ARG = 300, MAX_ARGS = 6;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** Saisie de l'utilisateur pour une personne, nettoyée : { notes, myArgs, manual }, sans entrée vide. */
export function userInput(p = {}) {
  const notes = {}, myArgs = {}, manual = {};
  for (const c of CODES) {
    const n = clean(p.notes?.[c], MAX_NOTE); if (n) notes[c] = n;
    const a = (Array.isArray(p.myArgs?.[c]) ? p.myArgs[c] : []).map((x) => clean(x, MAX_ARG)).filter(Boolean).slice(0, MAX_ARGS); if (a.length) myArgs[c] = a;
    if (p.manual?.[c] === true) manual[c] = true;
  }
  return { notes, myArgs, manual };
}
/** Une personne a-t-elle saisi quelque chose ? */
export const hasUserInput = (p) => { const u = userInput(p); return Object.keys(u.notes).length + Object.keys(u.myArgs).length + Object.keys(u.manual).length > 0; };

/** Texte d'une zone « un argument par ligne » → liste. */
export const argsFromText = (text) => String(text || '').split('\n').map((x) => clean(x, MAX_ARG)).filter(Boolean).slice(0, MAX_ARGS);

/**
 * Au plus trois dimensions à 3 : au-delà, les dernières dans l'ordre S-O-N-C-A-S-E repassent à 2.
 * Les dimensions de `keep` (scores fixés par l'utilisateur) passent en premier et ne sont jamais rabaissées.
 */
export function capThrees(scores, keep = {}) {
  const out = { ...scores };
  let n = CODES.filter((c) => keep[c] && out[c] === 3).length;
  for (const c of CODES) if (!keep[c] && out[c] === 3) { n++; if (n > 3) out[c] = 2; }
  return out;
}

/**
 * Nouvelle proposition IA pour une personne (`ai` : { scores, rationale, arguments }), fusionnée avec ce qui existe.
 * Scores fixés à la main conservés ; les autres prennent la valeur IA. Notes et arguments de l'utilisateur intacts.
 */
export function mergeAiPerson(prev = {}, ai = {}) {
  const u = userInput(prev);
  const aiScores = capThrees(clampScores(ai.scores));
  const scores = { ...aiScores };
  for (const c of Object.keys(u.manual)) scores[c] = clampScores(prev.scores)[c];
  return {
    scores: capThrees(scores, u.manual), aiScores,
    rationale: ai.rationale && typeof ai.rationale === 'object' ? ai.rationale : {},
    arguments: ai.arguments && typeof ai.arguments === 'object' ? ai.arguments : {},
    notes: { ...(prev.notes || {}) }, myArgs: { ...(prev.myArgs || {}) }, manual: u.manual,
  };
}

/** Arguments d'une motivation pour le SIMAC : ceux de l'utilisateur d'abord, puis les 2 premiers de l'IA. */
export function argsFor(p = {}, code) {
  const mine = userInput(p).myArgs[code] || [];
  const ai = (Array.isArray(p.arguments?.[code]) ? p.arguments[code] : []).filter((a) => !mine.includes(a)).slice(0, 2);
  return [...mine, ...ai];
}

/** Observations de l'utilisateur, par personne, pour les prompts (null si rien n'a été saisi). */
export function userObservations(people = [], names = []) {
  const out = people.map((p, i) => {
    const u = userInput(p); const sc = clampScores(p.scores);
    return { name: names[i] || '', user_scores: Object.fromEntries(Object.keys(u.manual).map((c) => [c, sc[c]])), user_notes: u.notes, user_arguments: u.myArgs };
  }).filter((o) => Object.keys(o.user_scores).length + Object.keys(o.user_notes).length + Object.keys(o.user_arguments).length);
  return out.length ? out : null;
}
