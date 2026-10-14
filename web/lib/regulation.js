// lib/regulation.js — activité réglementée ? Détection, sources par pays et effet sur la maturité — logique pure, sans DOM.
// Une offre dans une activité réglementée (santé, finance, alimentation, enseignement, bâtiment…) ne peut pas être
// « prête à vendre » tant que la règle applicable n'est ni écrite dans la fiche, ni au moins cherchée.

// Domaines → racines de mots (fr / en / es, sans accents, début de mot). Repérer large : la personne confirme ensuite.
export const DOMAINS = {
  health: ['professionnel de sante', 'soins de sante', 'sante mentale', 'healthcare', 'health care', 'health service', 'mental health', 'servicios de salud', 'centro de salud', 'salud mental', 'medic', 'soin', 'therap', 'terap', 'kine', 'pharma', 'farmac', 'dentist', 'dental', 'dentaire', 'infirm', 'nurs', 'psycholog', 'nutrition', 'dietet', 'paramedic', 'optic', 'clinic', 'clinique', 'hopital', 'hospital', 'paciente'],
  finance: ['banque', 'bank', 'banco', 'credit', 'pret', 'loan', 'prestamo', 'assurance', 'insurance', 'seguro', 'invest', 'inversion', 'crypto', 'moyen de paiement', 'payment service', 'pasarela de pago', 'comptab', 'contab', 'accountan', 'accounting', 'patrimoine', 'gestion de fortune', 'wealth', 'financ', 'courtier', 'broker', 'corredor'],
  food: ['aliment', 'food', 'comida', 'restaura', 'traiteur', 'catering', 'boisson', 'bebida', 'beverage', 'alcool', 'alcohol', 'vins', 'wine', 'biere', 'beer', 'cerveza', 'boulang', 'panader', 'bakery', 'cosmeti', 'complement alimentaire', 'supplement', 'suplemento'],
  // « formation / capacitación » seule ne compte pas : une mise en service avec deux formations n'est pas un organisme de formation.
  education: ['enseign', 'teach', 'ensenanza', 'organisme de formation', 'formation professionnelle', 'formation certifiante', 'vocational training', 'training provider', 'formacion para el trabajo', 'educacion para el trabajo', 'formacion profesional', 'instituto de formacion', 'cours particulier', 'soutien scolaire', 'tutor', 'creche', 'nursery', 'guarderia', 'jardin infantil', 'childcare', 'garde d enfant', 'babysit', 'nounou', 'ninera', 'cuidado de ninos', 'accueil de mineur', 'colonie de vacance', 'summer camp', 'campamento'],
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
 * État de la réglementation pour la maturité, à partir de deux questions posées à la personne :
 *  sector : « Savez-vous si votre activité est réglementée ? » → 'yes' | 'no' | 'unknown' | '' (pas répondu)
 *  docs   : « Avez-vous déjà les documents / certifications exigés ? » (si sector = 'yes') → 'yes' | 'no' | 'unsure' | ''
 * detected = indice dans la fiche OU avis de l'IA ; searched = recherche web faite avec résultats.
 *  - sector 'no' → la personne l'a vérifié : pas de plafond ;
 *  - sector 'yes' + docs 'yes' → prête : pas de plafond (une recherche peut confirmer) ;
 *  - sector 'yes' + docs 'no' / 'unsure' / '' → plafond 3 ;
 *  - 'unknown' ou pas répondu : si l'activité semble réglementée → plafond 3, ou 4 une fois la recherche faite ; sinon rien.
 * search : 'propose' (chercher et proposer : « je ne sais pas », pas répondu, ou documents manquants) | 'confirm' (documents déclarés) | ''.
 */
export function regulationStatus(product = {}, { aiRegulated = false, searched = false, answers = {} } = {}) {
  const domains = detectDomains(product);
  const detected = Boolean(aiRegulated) || domains.length > 0;
  const sector = ['yes', 'no', 'unknown'].includes(answers.sector) ? answers.sector : '';
  const docs = sector === 'yes' && ['yes', 'no', 'unsure'].includes(answers.docs) ? answers.docs : '';
  let status, cap = null;
  if (sector === 'no') status = 'declared_no';
  else if (sector === 'yes') { status = docs === 'yes' ? 'ready' : 'not_ready'; cap = docs === 'yes' ? null : 3; }
  else if (detected) { status = searched ? 'searched' : 'missing'; cap = searched ? 4 : 3; }
  else status = 'none';
  const search = status === 'ready' ? 'confirm' : (sector === 'unknown' || (sector === '' && detected) || (sector === 'yes' && docs !== 'yes')) ? 'propose' : '';
  return { detected, regulated: detected || sector === 'yes', domains, sector, docs, searched: Boolean(searched), status, cap, search };
}

const VERDICT_BY_SCORE = { 1: 'travailler l’offre', 2: 'travailler l’offre', 3: 'prêt pour des réunions à blanc', 4: 'prêt pour la vente', 5: 'prêt pour la vente' };

/**
 * Applique le critère « réglementation » à une maturité renvoyée par l'IA (plafond selon regulationStatus).
 * Tant qu'un plafond s'applique, un manque « regulation » figure dans les manques (il devient bloquant à 3 ou moins).
 * gaps : { missing, searched, not_ready } → { why, fix } dans la langue de l'interface (fournis par l'appelant).
 */
export function applyRegulation(maturity, product, { aiRegulated, searched = false, answers = {}, gaps: texts = {} } = {}) {
  if (!maturity) return maturity;
  const ai = maturity.regulation || {};
  const st = regulationStatus(product, { aiRegulated: aiRegulated ?? ai.regulated === true, searched, answers });
  const raw = Math.min(5, Math.max(1, Number(maturity.score) || 1));
  const score = st.cap ? Math.min(raw, st.cap) : raw;
  let gaps = (maturity.gaps || []).filter((g) => g?.field !== 'regulation' || st.cap);
  if (st.cap) {
    const own = { field: 'regulation', why: texts[st.status]?.why || '', fix: texts[st.status]?.fix || '' };
    gaps = [own, ...gaps.filter((g) => g?.field !== 'regulation')];
  }
  const verdict = score < raw ? VERDICT_BY_SCORE[score] : maturity.verdict;
  return { ...maturity, score, rawScore: raw, verdict, gaps, regulation: { ...ai, ...st } };
}

/** Proposition de l'IA après recherche : sources limitées aux résultats réellement trouvés. */
export function sanitizeProposal(result, results = []) {
  const urls = new Set(results.map((r) => r.source));
  const str = (v) => String(v ?? '').trim();
  const requirements = (Array.isArray(result?.requirements) ? result.requirements : []).slice(0, 6)
    .map((r) => ({ item: str(r?.item), authority: str(r?.authority), source: urls.has(str(r?.source)) ? str(r?.source) : '' }))
    .filter((r) => r.item);
  return { regulated: ['yes', 'no', 'unknown'].includes(result?.regulated) ? result.regulated : 'unknown', summary: str(result?.summary), requirements, field_value: str(result?.field_value) };
}
