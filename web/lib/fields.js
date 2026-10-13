// lib/fields.js — noms internes (clés de champ, types de source) → libellés dans la langue de l'interface.
// Le modèle renvoie des clés (« decisionProcess », « mechanism / advantages — … », « notes: … ») :
// rien de ce qui s'affiche ne doit montrer une clé brute.
import { t } from './i18n.js';

export const offerLabels = () => ({ name: t('Produit / service'), oneLiner: t('En une phrase'), targets: t('Cibles'), problem: t('Problème de chaque cible'), who: t('Qui parle'), nextStep: t('Étape suivante voulue'), mechanism: t('Mécanisme'), advantages: t('Avantages'), proofs: t('Preuves'), price: t('Prix'), floor: t('Plancher'), delays: t('Délais et conditions'), objections: t('Objections attendues'), constraints: t('Contraintes') });
export const clientLabels = () => ({ company: t('Entreprise / établissement'), sector: t('Secteur'), website: t('Site web'), location: t('Commune / pays'), contacts: t('Interlocuteurs'), meetingFormat: t('Format du rendez-vous'), decisionProcess: t('Processus de décision'), notes: t('Notes collées') });
export const debriefLabels = () => ({ outcome: t('Résultat'), objectionsHeard: t('Objections entendues'), decisionMaker: t('Décideur (nom)'), actions: t('Actions convenues'), dates: t('Dates'), notes: t('Notes / faits nouveaux') });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEP = /\s*(?:\/|,|&|\+)\s*|\s+(?:and|et|y)\s+/;

/**
 * Une entrée renvoyée par le modèle → texte lisible.
 * « decisionProcess » → « Proceso de decisión » ; « mechanism / advantages — … » → « Mecanismo / Ventajas — … » ;
 * « notes: … » → « Notas pegadas: … ». Le texte libre qui suit est conservé tel quel.
 */
export function labelField(item, labels) {
  const s = String(item ?? '').trim();
  if (!s) return s;
  const keys = Object.keys(labels);
  if (!keys.length) return s;
  // 1) tête de l'entrée : une ou plusieurs clés, puis un séparateur (: — – - =) ou la fin.
  const head = /^([A-Za-z_]+(?:(?:\s*(?:\/|,|&|\+)\s*|\s+(?:and|et|y)\s+)[A-Za-z_]+)*)(\s*(?::|—|–|=|\s-\s)\s*[\s\S]*)?$/.exec(s);
  let out = s;
  if (head) {
    const parts = head[1].split(SEP);
    if (parts.every((p) => p in labels)) out = parts.map((p) => labels[p]).join(' / ') + (head[2] || '');
  }
  // 2) ailleurs dans le texte : une clé suivie de « : », ou une clé en camelCase (jamais un mot courant).
  const any = new RegExp(`(?<![A-Za-z])(${keys.map(esc).join('|')})(?![A-Za-z])(?=\\s*:)|(?<![A-Za-z])(${keys.filter((k) => /[a-z][A-Z]/.test(k)).map(esc).join('|') || '(?!)'})(?![A-Za-z])`, 'g');
  return out.replace(any, (m) => labels[m] ?? m);
}

/** Liste « missing » du modèle → libellés, séparés par des virgules. */
export const labelFields = (items, labels) => (Array.isArray(items) ? items : [items]).map((x) => labelField(x, labels)).filter(Boolean).join(', ');

// Types de source (s.kind) : codes stables, affichés traduits.
export const sourceKind = (kind) => ({ notes: t('Notes collées'), profil: t('Profil collé'), document: t('Document joint'), site: t('Site web'), web: t('Recherche web'), registre: t('Registre'), bodacc: 'BODACC', history: t('Historique') }[kind] || kind);

/** Nom affiché d'une source : son titre, son adresse, ou — pour un texte collé dont l'origine est le type — le type traduit. */
export const sourceName = (s) => s.title || (s.source === s.kind ? sourceKind(s.kind) : s.source);
