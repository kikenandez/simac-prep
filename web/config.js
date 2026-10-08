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

  // Limites de la version gratuite (clé de l'utilisateur, appels depuis son navigateur).
  // Dimensionnées pour qu'une réponse IA ne soit jamais coupée. Une version gérée (clés et appels pris en charge)
  // pourra relever ces plafonds : c'est le seul endroit à changer.
  limits: {
    sourcesPerStep: 4,     // documents + pages lues, par étape (offre, client, marché)
    charsPerSource: 6000,  // caractères conservés par source
    totalChars: 20000,     // caractères envoyés à l'IA au total pour une analyse
  },
  contact: 'contact@avapmo.com',
};
