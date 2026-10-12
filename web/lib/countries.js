// lib/countries.js — pays du marché et du client : mots de recherche et sources publiques à consulter.
// Seule la France a des API officielles ouvertes sans clé et avec CORS (Annuaire des entreprises, BODACC) :
// pour les autres pays, l'outil propose des liens de consultation (registres, avis, emploi) et des recherches web ciblées.
import { lang } from './i18n.js';

const q = (s) => encodeURIComponent(String(s || '').trim());
// Mots ajoutés aux recherches web, dans la langue du pays.
const WORDS = {
  fr: { providers: 'prestataires tarifs', news: 'projets actualités activité', person: 'rôle interview publication', reviews: 'avis clients' },
  en: { providers: 'providers pricing', news: 'projects news activity', person: 'role interview article', reviews: 'customer reviews' },
  es: { providers: 'proveedores precios', news: 'proyectos noticias actividad', person: 'cargo entrevista publicación', reviews: 'opiniones clientes' },
};

// links: { kind: registre | avis | emploi | annuaire, label, url(nom) } — ouverts par l'utilisateur, jamais collectés automatiquement.
export const COUNTRIES = {
  FR: { label: 'France', words: WORDS.fr, tld: ['.fr'], currency: ['€', 'eur', 'euros?'], officialApi: true,
    reviewSites: ['fr.trustpilot.com', 'pagesjaunes.fr'],
    links: [
      { kind: 'registre', label: 'Annuaire des entreprises', url: (n) => `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${q(n)}` },
      { kind: 'registre', label: 'Pappers', url: (n) => `https://www.pappers.fr/recherche?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://fr.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'PagesJaunes', url: () => 'https://www.pagesjaunes.fr/' },
      { kind: 'emploi', label: 'Welcome to the Jungle', url: () => 'https://www.welcometothejungle.com/fr' },
    ] },
  CO: { label: 'Colombia', words: WORDS.es, tld: ['.co'], currency: ['\\$', 'cop'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'RUES', url: () => 'https://www.rues.org.co/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/co?q=${q(n)}` },
      { kind: 'emploi', label: 'Computrabajo', url: (n) => `https://co.computrabajo.com/trabajo-de-${q(n)}` },
    ] },
  MX: { label: 'México', words: WORDS.es, tld: ['.mx'], currency: ['\\$', 'mxn'],
    reviewSites: ['seccionamarilla.com.mx'],
    links: [
      { kind: 'registre', label: 'SIEM (Secretaría de Economía)', url: () => 'https://siem.economia.gob.mx/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/mx?q=${q(n)}` },
      { kind: 'annuaire', label: 'Sección Amarilla', url: () => 'https://www.seccionamarilla.com.mx/' },
      { kind: 'emploi', label: 'OCC Mundial', url: () => 'https://www.occ.com.mx/' },
    ] },
  PA: { label: 'Panamá', words: WORDS.es, tld: ['.pa'], currency: ['\\$', 'usd', 'pab'],
    reviewSites: [],
    links: [
      { kind: 'registre', label: 'Registro Público de Panamá', url: () => 'https://www.rp.gob.pa/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/pa?q=${q(n)}` },
      { kind: 'emploi', label: 'Konzerta', url: () => 'https://www.konzerta.com/' },
    ] },
  ES: { label: 'España', words: WORDS.es, tld: ['.es'], currency: ['€', 'eur', 'euros?'],
    reviewSites: ['es.trustpilot.com', 'paginasamarillas.es'],
    links: [
      { kind: 'registre', label: 'BORME (BOE)', url: () => 'https://www.boe.es/diario_borme/' },
      { kind: 'registre', label: 'LibreBOR', url: () => 'https://librebor.me/' },
      { kind: 'registre', label: 'Infoempresa', url: () => 'https://www.infoempresa.com/' },
      { kind: 'registre', label: 'Registro Mercantil Central', url: () => 'https://www.rmc.es/' },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://es.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Páginas Amarillas', url: () => 'https://www.paginasamarillas.es/' },
      { kind: 'emploi', label: 'InfoJobs', url: (n) => `https://www.infojobs.net/ofertas-trabajo?keyword=${q(n)}` },
    ] },
  US: { label: 'United States', words: WORDS.en, tld: ['.us', '.com'], currency: ['\\$', 'usd'],
    reviewSites: ['bbb.org', 'yelp.com'],
    links: [
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/us?q=${q(n)}` },
      { kind: 'registre', label: 'SEC EDGAR', url: (n) => `https://www.sec.gov/cgi-bin/browse-edgar?company=${q(n)}&owner=include&action=getcompany` },
      { kind: 'avis', label: 'Better Business Bureau', url: (n) => `https://www.bbb.org/search?find_text=${q(n)}` },
      { kind: 'avis', label: 'Yelp', url: (n) => `https://www.yelp.com/search?find_desc=${q(n)}` },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.com/' },
    ] },
  CA: { label: 'Canada', words: WORDS.en, tld: ['.ca'], currency: ['\\$', 'cad'],
    reviewSites: ['ca.trustpilot.com', 'bbb.org'],
    links: [
      { kind: 'registre', label: 'Corporations Canada', url: () => 'https://ised-isde.canada.ca/site/corporations-canada/en' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/ca?q=${q(n)}` },
      { kind: 'avis', label: 'Better Business Bureau', url: (n) => `https://www.bbb.org/search?find_country=CAN&find_text=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://ca.trustpilot.com/search?query=${q(n)}` },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.ca/' },
    ] },
  GB: { label: 'United Kingdom', words: WORDS.en, tld: ['.uk'], currency: ['£', 'gbp'],
    reviewSites: ['uk.trustpilot.com', 'yell.com'],
    links: [
      { kind: 'registre', label: 'Companies House', url: (n) => `https://find-and-update.company-information.service.gov.uk/search/companies?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://uk.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Yell', url: () => 'https://www.yell.com/' },
      { kind: 'emploi', label: 'Glassdoor', url: () => 'https://www.glassdoor.co.uk/' },
    ] },
  BE: { label: 'Belgique', words: WORDS.fr, tld: ['.be'], currency: ['€', 'eur', 'euros?'],
    reviewSites: ['fr-be.trustpilot.com', 'nl-be.trustpilot.com'],
    links: [
      { kind: 'registre', label: 'BCE / KBO (Banque-Carrefour des Entreprises)', url: () => 'https://kbopub.economie.fgov.be/kbopub/zoeknaamfonetischform.html' },
      { kind: 'registre', label: 'Moniteur belge', url: () => 'https://www.ejustice.just.fgov.be/' },
      { kind: 'registre', label: 'OpenCorporates', url: (n) => `https://opencorporates.com/companies/be?q=${q(n)}` },
      { kind: 'avis', label: 'Trustpilot', url: (n) => `https://fr-be.trustpilot.com/search?query=${q(n)}` },
      { kind: 'annuaire', label: 'Pages d’Or', url: () => 'https://www.pagesdor.be/' },
    ] },
  INT: { label: 'International', words: null, tld: [], currency: ['€', '\\$', '£', 'eur', 'usd'],
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
/** Libellé du marché par défaut dans la langue de l'interface. */
export function marketLabel(code = getCountry()) {
  const names = { fr: { FR: 'France', CO: 'Colombie', MX: 'Mexique', PA: 'Panama', ES: 'Espagne', US: 'États-Unis', CA: 'Canada', GB: 'Royaume-Uni', BE: 'Belgique', INT: 'International' },
    en: { FR: 'France', CO: 'Colombia', MX: 'Mexico', PA: 'Panama', ES: 'Spain', US: 'United States', CA: 'Canada', GB: 'United Kingdom', BE: 'Belgium', INT: 'International' },
    es: { FR: 'Francia', CO: 'Colombia', MX: 'México', PA: 'Panamá', ES: 'España', US: 'Estados Unidos', CA: 'Canadá', GB: 'Reino Unido', BE: 'Bélgica', INT: 'Internacional' } };
  return (names[lang()] || names.fr)[code] || code;
}
