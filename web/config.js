// config.js — réglages de déploiement (modifiables sans toucher au code).
export const CONFIG = {
  // Collecte de l'adresse email à l'acceptation des conditions.
  // Même liste que adp.avapmo.com : Buttondown (double opt-in, l'abonné confirme par mail — RGPD).
  // L'app envoie un POST (FormData) sans serveur ; `metadata__source` identifie l'outil d'origine.
  // Laisser emailEndpoint vide pour ne conserver l'adresse que localement.
  emailEndpoint: 'https://buttondown.com/api/emails/embed-subscribe/kike4ai',
  emailFields: { email: 'email', source: 'metadata__source', version: 'metadata__terms_version' },
  emailSource: 'simac-prep',
  emailRequired: true,

  // Version des conditions : l'incrémenter force une nouvelle acceptation.
  termsVersion: '2026-10-08',
  contact: 'contact@avapmo.com',
};
