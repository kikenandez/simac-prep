// lib/countries.js — pays du marché et du client : mots de recherche et sources publiques à consulter.
// Seule la France a des API officielles ouvertes sans clé et avec CORS (Annuaire des entreprises, BODACC) :
// pour les autres pays, l'outil propose des liens de consultation (registres, avis, emploi) et des recherches web ciblées.
import { lang, t } from './i18n.js';

const q = (s) => encodeURIComponent(String(s || '').trim());
// Computrabajo : mots-clés en slug (« trabajo-de-acme-co »)
const slug = (s) => encodeURIComponent(String(s || '').trim().toLowerCase().replace(/\s+/g, '-'));
// Mots ajoutés aux recherches web, dans la langue du pays.
const WORDS = {
  fr: { providers: 'prestataires tarifs', news: 'projets actualités activité', person: 'rôle interview publication', reviews: 'avis clients' },
  en: { providers: 'providers pricing', news: 'projects news activity', person: 'role interview article', reviews: 'customer reviews' },
  es: { providers: 'proveedores precios', news: 'proyectos noticias actividad', person: 'cargo entrevista publicación', reviews: 'opiniones clientes' },
};

// links: { kind: registre | avis | emploi | annuaire, label, url(nom) } — ouverts par l'utilisateur, jamais collectés automatiquement.
export const COUNTRIES = {
  FR: { label: 'France', city: 'Paris, France', words: WORDS.fr, tld: ['.fr'], officialApi: true,
    reviewSites: ['fr.trustpilot.com', 'pagesjaunes.fr'],
    links: [
      { kind: 'registre', label: 'Annuaire des entreprises', url: (n) => `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${q(n)}` },
      { kind: 'registre', label: 'Pappers', url: (n) => `https://www.pappers.fr/recherche?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://fr.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'PagesJaunes', url: () => 'https://www.pagesjaunes.fr/' },
      { kind: 'emploi', label: 'Welcome to the Jungle', url: () => 'https://www.welcometothejungle.com/fr' },
    ] },
  CO: { label: 'Colombia', city: 'Bogotá, Colombia', words: WORDS.es, tld: ['.co'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'RUES', url: () => 'https://www.rues.org.co/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/co?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://co.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  MX: { label: 'México', city: 'Ciudad de México, México', words: WORDS.es, tld: ['.mx'],
    reviewSites: ['seccionamarilla.com.mx'],
    links: [
      { kind: 'registre', label: 'SIEM (Secretaría de Economía)', url: () => 'https://siem.economia.gob.mx/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/mx?q=${q(n)}` },
      { kind: 'annuaire', label: 'Sección Amarilla', url: () => 'https://www.seccionamarilla.com.mx/' },
      { kind: 'emploi', label: 'OCC Mundial', url: () => 'https://www.occ.com.mx/' },
    ] },
  PA: { label: 'Panamá', city: 'Ciudad de Panamá, Panamá', words: WORDS.es, tld: ['.pa'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Registro Público de Panamá', url: () => 'https://www.rp.gob.pa/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/pa?q=${q(n)}` },
      { kind: 'emploi', label: 'Konzerta', url: () => 'https://www.konzerta.com/' },
    ] },
  AR: { label: 'Argentina', city: 'Buenos Aires, Argentina', words: WORDS.es, tld: ['.ar'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'IGJ (Inspección General de Justicia)', url: () => 'https://www.argentina.gob.ar/justicia/igj' },
      { kind: 'registre', label: 'Boletín Oficial', url: () => 'https://www.boletinoficial.gob.ar/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Bumeran', url: () => 'https://www.bumeran.com.ar/' },
    ] },
  CL: { label: 'Chile', city: 'Santiago, Chile', words: WORDS.es, tld: ['.cl'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Registro de Empresas y Sociedades', url: () => 'https://www.registrodeempresasysociedades.cl/' },
      { kind: 'registre', label: 'SII', url: () => 'https://www.sii.cl/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://cl.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  UY: { label: 'Uruguay', city: 'Montevideo, Uruguay', words: WORDS.es, tld: ['.uy'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'IMPO (Diario Oficial)', url: () => 'https://www.impo.com.uy/' },
      { kind: 'registre', label: 'DGI', url: () => 'https://www.gub.uy/direccion-general-impositiva/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
    ] },
  PE: { label: 'Perú', city: 'Lima, Perú', words: WORDS.es, tld: ['.pe'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'SUNAT (consulta RUC)', url: () => 'https://e-consultaruc.sunat.gob.pe/' },
      { kind: 'registre', label: 'SUNARP', url: () => 'https://www.gob.pe/sunarp' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://pe.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  EC: { label: 'Ecuador', city: 'Quito, Ecuador', words: WORDS.es, tld: ['.ec'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Superintendencia de Compañías', url: () => 'https://www.supercias.gob.ec/' },
      { kind: 'registre', label: 'SRI', url: () => 'https://www.sri.gob.ec/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://ec.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  VE: { label: 'Venezuela', city: 'Caracas, Venezuela', words: WORDS.es, tld: ['.ve'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'SAREN', url: () => 'https://www.saren.gob.ve/' },
      { kind: 'registre', label: 'SENIAT', url: () => 'https://www.seniat.gob.ve/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
    ] },
  GT: { label: 'Guatemala', city: 'Ciudad de Guatemala, Guatemala', words: WORDS.es, tld: ['.gt'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Registro Mercantil', url: () => 'https://www.registromercantil.gob.gt/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://gt.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  SV: { label: 'El Salvador', city: 'San Salvador, El Salvador', words: WORDS.es, tld: ['.sv'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'CNR (Centro Nacional de Registros)', url: () => 'https://www.cnr.gob.sv/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
    ] },
  HN: { label: 'Honduras', city: 'Tegucigalpa, Honduras', words: WORDS.es, tld: ['.hn'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
    ] },
  NI: { label: 'Nicaragua', city: 'Managua, Nicaragua', words: WORDS.es, tld: ['.ni'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
    ] },
  CR: { label: 'Costa Rica', city: 'San José, Costa Rica', words: WORDS.es, tld: ['.cr'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Registro Nacional', url: () => 'https://www.rnpdigital.com/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://cr.computrabajo.com/trabajo-de-${slug(n)}` },
    ] },
  ES: { label: 'España', city: 'Madrid, España', words: WORDS.es, tld: ['.es'],
    reviewSites: ['es.trustpilot.com', 'paginasamarillas.es'],
    links: [
      { kind: 'registre', label: 'BORME (BOE)', url: () => 'https://www.boe.es/diario_borme/' },
      { kind: 'registre', label: 'Infoempresa', url: () => 'https://www.infoempresa.com/' },
      { kind: 'registre', label: 'Registro Mercantil Central', url: () => 'https://www.rmc.es/' },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://es.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Páginas Amarillas', url: () => 'https://www.paginasamarillas.es/' },
      { kind: 'emploi', label: 'InfoJobs', url: (n) => `https://www.infojobs.net/ofertas-trabajo?keyword=${q(n)}` },
    ] },
  US: { label: 'United States', city: 'Austin, TX, United States', words: WORDS.en, tld: ['.us', '.com'],
    reviewSites: ['bbb.org', 'yelp.com'],
    links: [
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/us?q=${q(n)}` },
      { kind: 'registre', label: 'SEC EDGAR', url: (n) => `https://www.sec.gov/cgi-bin/browse-edgar?company=${q(n)}&owner=include&action=getcompany` },
      { kind: 'avis', label: 'Better Business Bureau', url: (n) => `https://www.bbb.org/search?find_text=${q(n)}` },
      { kind: 'avis', label: 'Yelp', url: (n) => `https://www.yelp.com/search?find_desc=${q(n)}` },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.com/' },
    ] },
  CA: { label: 'Canada', city: 'Toronto, Canada', words: WORDS.en, tld: ['.ca'],
    reviewSites: ['ca.trustpilot.com', 'bbb.org'],
    links: [
      { kind: 'registre', label: 'Corporations Canada', url: () => 'https://ised-isde.canada.ca/site/corporations-canada/en' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/ca?q=${q(n)}` },
      { kind: 'avis', label: 'Better Business Bureau', url: (n) => `https://www.bbb.org/search?find_country=CAN&find_text=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://ca.trustpilot.com/search?query=${q(n)}` },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.ca/' },
    ] },
  GB: { label: 'United Kingdom', city: 'Manchester, United Kingdom', words: WORDS.en, tld: ['.uk'],
    reviewSites: ['uk.trustpilot.com', 'yell.com'],
    links: [
      { kind: 'registre', label: 'Companies House', url: (n) => `https://find-and-update.company-information.service.gov.uk/search/companies?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://uk.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Yell', url: () => 'https://www.yell.com/' },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.co.uk/' },
    ] },
  BE: { label: 'Belgique', city: 'Bruxelles, Belgique', words: WORDS.fr, tld: ['.be'],
    reviewSites: ['fr-be.trustpilot.com', 'nl-be.trustpilot.com'],
    links: [
      { kind: 'registre', label: 'BCE / KBO (Banque-Carrefour des Entreprises)', url: () => 'https://kbopub.economie.fgov.be/kbopub/zoeknaamfonetischform.html' },
      { kind: 'registre', label: 'Moniteur belge', url: () => 'https://www.ejustice.just.fgov.be/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/be?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://fr-be.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Pages d’Or', url: () => 'https://www.pagesdor.be/' },
    ] },
  INT: { label: 'International', words: null, tld: [],
    reviewSites: ['trustpilot.com'],
    links: [
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://www.trustpilot.com/search?query=${q(n)}` },
    ] },
};

const KEY = 'simac.country';
const DEFAULT_BY_LANG = { fr: 'FR', es: 'ES', en: 'GB' };
export function getCountry() {
  try { const c = localStorage.getItem(KEY); if (c && COUNTRIES[c]) return c; } catch {}
  return DEFAULT_BY_LANG[lang()] || 'FR';
}
export function setCountry(code) { if (!COUNTRIES[code]) return; try { localStorage.setItem(KEY, code); } catch {} }
export const country = (code = getCountry()) => COUNTRIES[code] || COUNTRIES.FR;
/** Mots de recherche du pays ; « International » suit la langue de l'interface. */
export const words = (code = getCountry()) => country(code).words || WORDS[lang()] || WORDS.fr;
/** Marché par défaut, écrit dans la langue du pays (c'est un mot de la recherche web) ; vide pour International. */
/** Exemple de lieu pour le champ « Commune / pays », dans la langue du pays ; International suit l'interface. */
export const cityExample = (code = getCountry()) => country(code).city || t('Paris, France');
export const geoName = (code = getCountry()) => (code === 'INT' ? '' : country(code).label);
/** Nom du pays dans la langue de l'interface (sélecteur). */
export function marketLabel(code = getCountry()) {
  const names = { fr: { FR: 'France', CO: 'Colombie', MX: 'Mexique', PA: 'Panama', AR: 'Argentine', CL: 'Chili', UY: 'Uruguay', PE: 'Pérou', EC: 'Équateur', VE: 'Venezuela', GT: 'Guatemala', SV: 'Salvador', HN: 'Honduras', NI: 'Nicaragua', CR: 'Costa Rica', ES: 'Espagne', US: 'États-Unis', CA: 'Canada', GB: 'Royaume-Uni', BE: 'Belgique', INT: 'International' },
    en: { FR: 'France', CO: 'Colombia', MX: 'Mexico', PA: 'Panama', AR: 'Argentina', CL: 'Chile', UY: 'Uruguay', PE: 'Peru', EC: 'Ecuador', VE: 'Venezuela', GT: 'Guatemala', SV: 'El Salvador', HN: 'Honduras', NI: 'Nicaragua', CR: 'Costa Rica', ES: 'Spain', US: 'United States', CA: 'Canada', GB: 'United Kingdom', BE: 'Belgium', INT: 'International' },
    es: { FR: 'Francia', CO: 'Colombia', MX: 'México', PA: 'Panamá', AR: 'Argentina', CL: 'Chile', UY: 'Uruguay', PE: 'Perú', EC: 'Ecuador', VE: 'Venezuela', GT: 'Guatemala', SV: 'El Salvador', HN: 'Honduras', NI: 'Nicaragua', CR: 'Costa Rica', ES: 'España', US: 'Estados Unidos', CA: 'Canadá', GB: 'Reino Unido', BE: 'Bélgica', INT: 'Internacional' } };
  return (names[lang()] || names.fr)[code] || code;
}

/** Drapeau emoji à partir du code ISO (« FR » → 🇫🇷) ; globe pour International. Sans police emoji (Windows), les lettres s'affichent. */
export const flag = (code) => (code === 'INT' ? '🌐' : String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))));
/** Options « 🇫🇷 France » du sélecteur, dans la langue de l'interface. */
export const countryOptions = (selected = getCountry()) => Object.keys(COUNTRIES)
  .map((k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${flag(k)} ${marketLabel(k)}</option>`).join('');
/** Sélecteur de pays dans chaque élément .country-switch ; onChange redessine la vue en cours. */
export function mountCountrySwitch(onChange, root = document) {
  root.querySelectorAll('.country-switch').forEach((el) => {
    el.innerHTML = `<select aria-label="${t('Pays : recherches et sources')}" title="${t('Pays : recherches et sources')}">${countryOptions()}</select>`;
    el.querySelector('select').onchange = (e) => { setCountry(e.target.value); syncCountrySwitches(); onChange?.(); };
  });
}
/** Garde les sélecteurs de pays (barre du haut et cartes) alignés après un changement. */
export function syncCountrySwitches(root = document) {
  root.querySelectorAll('.country-switch select').forEach((s) => { s.value = getCountry(); });
  root.querySelectorAll('[data-city-example]').forEach((i) => { i.placeholder = cityExample(); });
}
