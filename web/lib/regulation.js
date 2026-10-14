// lib/regulation.js — activité réglementée ? Détection, sources par pays et effet sur la maturité — logique pure, sans DOM.
// Une offre dans une activité réglementée (santé, finance, alimentation, enseignement, bâtiment…) ne peut pas être
// « prête à vendre » tant que la règle applicable n'est ni écrite dans la fiche, ni au moins cherchée.

// Domaines → racines de mots (fr / en / es, sans accents, début de mot). Repérer large : la personne confirme ensuite.
export const DOMAINS = {
  health: ['professionnel de sante', 'soins de sante', 'sante mentale', 'healthcare', 'health care', 'health service', 'mental health', 'servicios de salud', 'centro de salud', 'salud mental', 'medic', 'soin', 'therap', 'terap', 'kine', 'pharma', 'farmac', 'dentist', 'dental', 'dentaire', 'infirm', 'nurs', 'psycholog', 'nutrition', 'dietet', 'paramedic', 'optic', 'clinic', 'clinique', 'hopital', 'hospital', 'paciente'],
  finance: ['banque', 'bank', 'banco', 'credit', 'pret', 'loan', 'prestamo', 'assurance', 'insurance', 'seguro', 'invest', 'inversion', 'crypto', 'moyen de paiement', 'payment service', 'pasarela de pago', 'comptab', 'contab', 'accountan', 'accounting', 'patrimoine', 'gestion de fortune', 'wealth', 'financ', 'courtier', 'broker', 'corredor'],
  food: ['aliment', 'food', 'comida', 'restaura', 'traiteur', 'catering', 'boisson', 'bebida', 'beverage', 'alcool', 'alcohol', 'vins', 'wine', 'biere', 'beer', 'cerveza', 'boulang', 'panader', 'bakery', 'cosmeti', 'complement alimentaire', 'supplement', 'suplemento'],
  education: ['enseign', 'teach', 'ensenanza', 'formation', 'training', 'formacion', 'capacitacion', 'cours particulier', 'soutien scolaire', 'tutor', 'creche', 'nursery', 'guarderia', 'jardin infantil', 'childcare', 'garde d enfant', 'babysit', 'nounou', 'ninera', 'cuidado de ninos', 'accueil de mineur', 'colonie de vacance', 'summer camp', 'campamento'],
  sport: ['sport', 'deport', 'fitness', 'gym', 'coach sportif', 'entrenador personal', 'personal trainer', 'yoga', 'pilates', 'capoeira', 'natation', 'swim', 'natacion', 'escalade', 'climbing', 'escalada', 'plongee', 'diving', 'buceo'],
  construction: ['batiment', 'construction', 'construccion', 'travaux', 'renovat', 'remodel', 'electric', 'electric', 'plomb', 'plumb', 'fontaner', 'toiture', 'roof', 'tejado', 'architect', 'arquitect', 'chauffage', 'heating', 'calefaccion', 'gaz'],
  transport: ['transport', 'taxi', 'vtc', 'chauffeur', 'livraison', 'delivery', 'domicilio', 'demenag', 'mudanza', 'moving', 'logisti', 'flete', 'freight', 'fret'],
  legal: ['avocat', 'lawyer', 'abogad', 'juridi', 'legal', 'notaire', 'notar', 'immobili', 'real estate', 'inmobiliari', 'recouvrement', 'debt collection', 'cobranza', 'detective'],
  data: ['donnees personnelles', 'personal data', 'datos personales', 'rgpd', 'gdpr', 'videosurveillance', 'surveillance', 'vigilancia', 'securite privee', 'security guard', 'seguridad privada', 'biometri'],
  other: ['tourism', 'tourisme', 'turismo', 'voyage', 'travel agency', 'agencia de viaje', 'hebergement', 'alojamiento', 'hotel', 'jeux d argent', 'gambling', 'apuesta', 'casino', 'tabac', 'tobacco', 'tabaco', 'weapon', 'firearm', 'fournisseur d energie', 'energy supplier', 'photovolta', 'fotovolta', 'solaire', 'solar panel', 'panel solar', 'dechet', 'waste', 'residuo', 'pesticid', 'veterin', 'animal', 'cannabis', 'cbd', 'drone', 'pharmacie'],
};

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ');
const RX = Object.fromEntries(Object.entries(DOMAINS).map(([d, stems]) => [d, new RegExp(`(?<![a-z0-9])(${[...new Set(stems)].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)]));
// Ce que fait l'offre, pas à qui elle se vend : un éditeur qui vend aux écoles n'enseigne pas (cibles, preuves, prix,
// conditions, réglementation et contraintes déjà écrites ne comptent pas comme indice).
const TEXT_KEYS = ['name', 'oneLiner', 'who', 'mechanism'];

/** Domaines réglementés repérés dans la fiche (indices à confirmer, jamais une conclusion). */
export function detectDomains(product = {}) {
  const text = fold(TEXT_KEYS.map((k) => product[k] || '').join('\n'));
  return Object.keys(RX).filter((d) => RX[d].test(text));
}

// Mots de recherche dans la langue du pays.
const WORDS = {
  fr: 'réglementation activité autorisation obligatoire',
  en: 'regulation licence permit requirements',
  es: 'regulación normativa licencia permiso requisitos',
};
const COUNTRY_LANG = { FR: 'fr', BE: 'fr', US: 'en', CA: 'en', GB: 'en' };
const countryLang = (code, uiLang = 'fr') => (code === 'INT' ? uiLang : COUNTRY_LANG[code] || 'es');

// Portails officiels du droit applicable (pages d'accueil, ouvertes par l'utilisateur).
export const LAW_PORTALS = {
  FR: [{ label: 'Légifrance', url: 'https://www.legifrance.gouv.fr/' }, { label: 'Entreprendre.Service-Public.fr', url: 'https://entreprendre.service-public.fr/' }],
  BE: [{ label: 'Justel (Moniteur belge)', url: 'https://www.ejustice.just.fgov.be/' }],
  ES: [{ label: 'BOE', url: 'https://www.boe.es/' }],
  CO: [{ label: 'SUIN-Juriscol', url: 'https://www.suin-juriscol.gov.co/' }, { label: 'Gestor Normativo (Función Pública)', url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/' }],
  MX: [{ label: 'Diario Oficial de la Federación', url: 'https://www.dof.gob.mx/' }, { label: 'gob.mx — Trámites', url: 'https://www.gob.mx/tramites' }],
  PA: [{ label: 'Gaceta Oficial', url: 'https://www.gacetaoficial.gob.pa/' }, { label: 'Panamá Emprende', url: 'https://www.panamaemprende.gob.pa/' }],
  AR: [{ label: 'SAIJ', url: 'https://www.saij.gob.ar/' }, { label: 'Boletín Oficial', url: 'https://www.boletinoficial.gob.ar/' }],
  CL: [{ label: 'LeyChile (BCN)', url: 'https://www.bcn.cl/leychile/' }],
  UY: [{ label: 'IMPO', url: 'https://www.impo.com.uy/' }],
  PE: [{ label: 'El Peruano — Normas legales', url: 'https://diariooficial.elperuano.pe/' }],
  EC: [{ label: 'Registro Oficial', url: 'https://www.registroficial.gob.ec/' }],
  US: [{ label: 'SBA — Licenses and permits', url: 'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits' }, { label: 'eCFR', url: 'https://www.ecfr.gov/' }],
  CA: [{ label: 'BizPaL', url: 'https://www.bizpal-perle.ca/' }, { label: 'Justice Laws', url: 'https://laws-lois.justice.gc.ca/' }],
  GB: [{ label: 'GOV.UK — Licence finder', url: 'https://www.gov.uk/licence-finder' }, { label: 'legislation.gov.uk', url: 'https://www.legislation.gov.uk/' }],
};

/** Requête web : ce que vend l'offre + mots « réglementation » dans la langue du pays + pays. */
export function regulationQuery(product = {}, { code = 'FR', geography = '', uiLang = 'fr' } = {}) {
  const what = String(product.name || product.oneLiner || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return [what, WORDS[countryLang(code, uiLang)], geography].filter(Boolean).join(' ');
}

/** Liens à ouvrir : portails officiels du pays + une recherche web prête. */
export function regulationLinks(product, opts = {}) {
  const web = { label: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(regulationQuery(product, opts))}` };
  return [...(LAW_PORTALS[opts.code] || []), web];
}

/**
 * État de la réglementation pour la maturité :
 * regulated = indice dans la fiche OU avis de l'IA ; confirmed = champ « Réglementation » rempli ; searched = recherche faite avec résultats.
 */
export function regulationStatus(product = {}, { aiRegulated = false, searched = false } = {}) {
  const domains = detectDomains(product);
  const regulated = Boolean(aiRegulated) || domains.length > 0;
  const confirmed = Boolean(String(product.regulation || '').trim());
  return { regulated, domains, confirmed, searched: Boolean(searched), status: confirmed ? 'confirmed' : searched ? 'searched' : regulated ? 'missing' : 'none' };
}

const VERDICT_BY_SCORE = { 1: 'travailler l’offre', 2: 'travailler l’offre', 3: 'prêt pour des réunions à blanc', 4: 'prêt pour la vente', 5: 'prêt pour la vente' };

/**
 * Applique le critère « réglementation identifiée » à une maturité renvoyée par l'IA.
 * Activité réglementée, règle ni écrite ni cherchée → score plafonné à 3 (réunions à blanc, pas de vente) et manque « regulation » en tête.
 * Cherchée mais pas écrite dans la fiche → plafond 4 : la présentation exige la règle écrite.
 * gap : { why, fix } dans la langue de l'interface (fournis par l'appelant).
 */
export function applyRegulation(maturity, product, { aiRegulated, searched = false, gap = {} } = {}) {
  if (!maturity) return maturity;
  const ai = maturity.regulation || {};
  const st = regulationStatus(product, { aiRegulated: aiRegulated ?? ai.regulated === true, searched });
  const raw = Math.min(5, Math.max(1, Number(maturity.score) || 1));
  const cap = !st.regulated || st.confirmed ? 5 : st.searched ? 4 : 3;
  const score = Math.min(raw, cap);
  const gaps = (maturity.gaps || []).filter((g) => g?.field !== 'regulation' || !st.confirmed);
  if (cap < 5 && !gaps.some((g) => g?.field === 'regulation')) gaps.unshift({ field: 'regulation', why: gap.why || '', fix: gap.fix || '' });
  const verdict = score < raw ? VERDICT_BY_SCORE[score] : maturity.verdict;
  return { ...maturity, score, rawScore: raw, verdict, gaps, regulation: { ...ai, ...st, cap: cap < 5 ? cap : null } };
}
