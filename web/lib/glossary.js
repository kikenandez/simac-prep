// lib/glossary.js — termes de la méthode que les consignes (en français) font fuiter dans les réponses en/es.
// Une seule liste sert deux fois : dans la consigne de langue de chaque prompt, puis en filet de sécurité
// sur le JSON reçu (le modèle recopie parfois « plancher » ou « rendez-vous » malgré la consigne).

// Chaque terme : formes françaises [singulier, pluriel] → [singulier, pluriel] en/es.
// Seuls des mots qui n'existent pas dans la langue cible ; `en: null` = rien à corriger en anglais.
export const GLOSSARY = [
  { fr: ['plancher', 'planchers'], en: ['price floor', 'price floors'], es: ['precio mínimo', 'precios mínimos'] },
  { fr: ['rendez-vous'], en: ['meeting'], es: ['reunión'], esFem: true },
  { fr: ['débrief', 'débriefs'], en: ['debrief', 'debriefs'], es: ['resumen', 'resúmenes'] },
  { fr: ['debrief', 'debriefs'], en: null, es: ['resumen', 'resúmenes'] },
  { fr: ['cible', 'cibles'], en: ['target', 'targets'], es: ['público objetivo', 'públicos objetivo'] },
  { fr: ['offre', 'offres'], en: ['offer', 'offers'], es: ['oferta', 'ofertas'], esFem: true },
  { fr: ['relance', 'relances'], en: ['follow-up', 'follow-ups'], es: ['seguimiento', 'seguimientos'] },
  { fr: ['devis'], en: ['quote'], es: ['presupuesto'] },
  { fr: ['prestataire', 'prestataires'], en: ['provider', 'providers'], es: ['proveedor', 'proveedores'] },
];

/** Consigne de vocabulaire ajoutée à la règle de langue de sortie. */
export function glossaryRule(lang) {
  if (lang !== 'en' && lang !== 'es') return '';
  const pairs = GLOSSARY.filter((g) => g[lang] && g.fr[0] !== g[lang][0]).map((g) => `${g.fr[0]} → ${g[lang][0]}`).join('; ');
  return lang === 'es'
    ? `Vocabulario obligatorio (las instrucciones usan términos franceses; tradúcelos siempre): ${pairs}. Ninguna palabra francesa en el texto libre, salvo SIMAC, SONCAS y los códigos.`
    : `Required vocabulary (the instructions use French terms; always translate them): ${pairs}. No French words in free text, except SIMAC, SONCAS and the codes.`;
}

// Espagnol : les deux mots qui précèdent suivent le genre du terme traduit (« el próximo rendez-vous » → « la próxima reunión »).
const MASC_FEM = { el: 'la', del: 'de la', al: 'a la', un: 'una', los: 'las', unos: 'unas', este: 'esta', ese: 'esa', estos: 'estas', próximo: 'próxima', próximos: 'próximas', primer: 'primera', primero: 'primera', segundo: 'segunda', nuevo: 'nueva', otro: 'otra', último: 'última', mismo: 'misma', cada: 'cada' };
const FEM_MASC = Object.fromEntries(Object.entries(MASC_FEM).filter(([m]) => !['primero', 'cada'].includes(m)).map(([m, f]) => [f, m]));
const DETS = [...new Set([...Object.keys(MASC_FEM), ...Object.keys(FEM_MASC)])].sort((a, b) => b.length - a.length).map((d) => d.replace(/ /g, '\\s+')).join('|');

// \b ignore les lettres accentuées : bornes de mot explicites (lettres, chiffres, trait d'union).
const W = 'A-Za-zÀ-ÖØ-öø-ÿ0-9-';
const rules = (lang) => GLOSSARY.filter((g) => g[lang]).flatMap((g) => g.fr.map((form, i) => ({
  re: new RegExp(`(?<![${W}])${lang === 'es' ? `((?:(?:${DETS})\\s+){0,2})` : '()'}(${form.replace(/-/g, '\\-')})(?![${W}])`, 'gi'),
  to: g[lang][i] ?? g[lang][0],
  fem: !!g.esFem,
})));
const RULES = { en: rules('en'), es: rules('es') };
const DET_RE = new RegExp(`(?<![${W}])(${DETS})(?![${W}])`, 'gi');
const keepCase = (src, out) => (src[0] !== src[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out);
const agree = (det, fem) => {
  const k = det.toLowerCase().replace(/\s+/g, ' ');
  const out = (fem ? MASC_FEM[k] : FEM_MASC[k]) ?? k;
  return keepCase(det, out);
};

/** Remplace les termes français connus dans un texte libre en/es. */
export function fixTerms(text, lang) {
  if (!RULES[lang] || typeof text !== 'string') return text;
  return RULES[lang].reduce((s, { re, to, fem }) => s.replace(re, (m, dets, word) => (dets || '').replace(DET_RE, (d) => agree(d, fem)) + keepCase(word, to)), text);
}

// Champs codés (valeurs énumérées, clés de champ, ID, dates) : jamais modifiés.
// Les codes de verdict contiennent « offre » (« travailler l’offre ») : ils restent intacts ici.
const CODES = new Set(['verdict', 'outcome', 'avantage', 'type', 'owner', 'weight', 'field', 'next_field', 'missing', 'source_ids', 'id', 'due', 'date', 'score', 'url', 'website']);

/** Parcourt le JSON du modèle et corrige le texte libre, sans toucher aux codes. */
export function fixOutput(value, lang, key = '') {
  if (!RULES[lang] || CODES.has(key)) return value;
  if (typeof value === 'string') return fixTerms(value, lang);
  if (Array.isArray(value)) return value.map((v) => fixOutput(v, lang, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixOutput(v, lang, k)]));
  return value;
}
