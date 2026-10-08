// Fiche offre : ordre d'importance pour vendre, manques essentiels et champs à demander — logique pure, sans DOM.

// Ordre d'importance pour vendre (le même que les questions guidées) ; les OFFER_ESSENTIAL premiers sont « essentiels ».
export const OFFER_KEY_ORDER = ['oneLiner', 'targets', 'problem', 'nextStep', 'mechanism', 'advantages', 'proofs', 'price', 'objections', 'name', 'who', 'floor', 'delays', 'constraints'];
export const OFFER_ESSENTIAL = 9;

const isEmpty = (obj, k) => !String(obj?.[k] || '').trim();
const inOrder = (set) => OFFER_KEY_ORDER.filter((k) => set.has(k));

/** Champs que la dernière maturité juge bloquants (seulement si l'offre n'est pas prête à vendre, score ≤ 3). */
export function blockersFrom(maturity) {
  if (!maturity || Number(maturity.score) > 3) return [];
  return inOrder(new Set((maturity.gaps || []).map((g) => g.field)));
}

/** Manques pour vendre : essentiels vides + champs remplis mais jugés bloquants par la maturité. */
export function essentialGaps(product, blockers = []) {
  const empty = OFFER_KEY_ORDER.slice(0, OFFER_ESSENTIAL).filter((k) => isEmpty(product, k));
  return inOrder(new Set([...empty, ...blockers]));
}

/** Champs à demander, dans l'ordre : vides ou bloquants, jamais déjà demandés ni passés. */
export function questionTodo({ current, asked = [], skipped = [], blockers = [] }) {
  const done = new Set([...asked, ...skipped]);
  const todo = new Set([...OFFER_KEY_ORDER.filter((k) => isEmpty(current, k)), ...blockers]);
  return inOrder(todo).filter((k) => !done.has(k));
}
