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
  // Accès en échange d'une adresse confirmée : après l'envoi, la page d'accueil reste fermée et affiche
  // « Vérifiez votre boîte mail » ; l'outil s'ouvre au retour du lien de confirmation (?ok=1, alias ?confirmed=1).
  // false = ancien comportement (accès dès l'envoi du formulaire). Barrière « douce » : sans serveur, ?ok=1 suffit.
  // Liste partagée avec adp.avapmo.com : Buttondown n'a qu'une redirection après confirmation.
  // Provisoirement https://simac.avapmo.com/?ok=1 ; cible : https://adp.avapmo.com/fr/confirme/, dont la page
  // lit le cookie ci-dessous (commun à *.avapmo.com) et renvoie vers https://simac.avapmo.com/?ok=1.
  confirmToUnlock: true,
  pendingCookie: { name: 'simac_pending', domain: 'avapmo.com', maxAge: 7 * 24 * 3600 },

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
