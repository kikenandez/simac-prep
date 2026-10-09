// lib/dates.js — jour du calendrier de l'utilisateur (AAAA-MM-JJ). toISOString() donne le jour UTC :
// entre minuit et 2 h à Paris, il affichait la veille.

/** Date, horodatage ISO ou rien (= maintenant) → AAAA-MM-JJ local, ou '' si illisible. */
export function localDay(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value || NaN);
  if (Number.isNaN(d.getTime())) return '';
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}
