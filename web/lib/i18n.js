// lib/i18n.js — langue de l'interface : français par défaut, anglais, espagnol.
// Le texte français est la clé : t('Texte', { var }) renvoie la traduction (ou le français si elle manque).
// Les dictionnaires sont dans ./i18n/*.js ; changer de langue recharge la page (constantes évaluées au chargement).
import CORE from './i18n/core.js';
import APP from './i18n/app.js';
import LIB from './i18n/lib.js';

export const LANGS = { fr: 'Français', en: 'English', es: 'Español' };
const KEY = 'simac.lang';
const DICT = { ...LIB, ...APP, ...CORE };

function detect() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('lang');
    if (q && LANGS[q]) { try { localStorage.setItem(KEY, q); } catch {} return q; }
  } catch {}
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch {}
  return 'fr';
}
let current = detect();

export const lang = () => current;
/** Locale pour Intl (nombres, dates). */
export const locale = () => ({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[current]);

export function setLang(l, { reload = true } = {}) {
  if (!LANGS[l]) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch {}
  if (reload && globalThis.location) {
    const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href);
  }
}

const fill = (s, vars) => vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
export function t(fr, vars) {
  if (current === 'fr') return fill(fr, vars);
  return fill(DICT[fr]?.[current] ?? fr, vars);
}
/** Clés connues (tests). */
export const dictionary = () => DICT;

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Traduit le HTML statique : [data-i18n] (contenu) et [data-i18n-attr="title,placeholder"]. */
export function translateDom(root = document) {
  document.documentElement.lang = current;
  if (current === 'fr') return;
  root.querySelectorAll('[data-i18n]').forEach((el) => { const k = norm(el.innerHTML); const v = DICT[k]?.[current]; if (v) el.innerHTML = v; });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(',').forEach((a) => {
    const k = el.getAttribute(a.trim()); const v = k && DICT[norm(k)]?.[current]; if (v) el.setAttribute(a.trim(), v);
  }));
}
/** Sélecteur de langue dans chaque élément .lang-switch. */
export function mountLangSwitch(root = document) {
  root.querySelectorAll('.lang-switch').forEach((el) => {
    el.innerHTML = `<select aria-label="Langue / Language / Idioma">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${k.toUpperCase()} · ${v}</option>`).join('')}</select>`;
    el.querySelector('select').onchange = (e) => setLang(e.target.value);
  });
}
export function initI18n() { translateDom(); mountLangSwitch(); }
