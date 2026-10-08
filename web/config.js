// config.js — réglages de déploiement (modifiables sans toucher au code).
export const CONFIG = {
  // Collecte de l'adresse email à l'acceptation des conditions.
  // L'app envoie un POST (FormData) sans serveur à vous : choisissez l'un des deux branchements gratuits.
  //
  // 1) Google Forms (gratuit, réponses dans un Google Sheet de votre compte) :
  //    - créez un formulaire avec 3 questions « réponse courte » : email, accepte, version
  //    - ouvrez l'aperçu, affichez le code source et relevez les identifiants entry.XXXXXXX de chaque question
  //    - endpoint : https://docs.google.com/forms/d/e/<ID_DU_FORMULAIRE>/formResponse
  // 2) Web3Forms / Formspree (gratuit à faible volume) : endpoint fourni par le service ; fields = { email: 'email', accepted: 'accepted', version: 'version' }.
  emailEndpoint: '',
  emailFields: { email: 'entry.0000000001', accepted: 'entry.0000000002', version: 'entry.0000000003' },
  emailRequired: true,

  // Version des conditions : l'incrémenter force une nouvelle acceptation.
  termsVersion: '2026-10-08',
  contact: 'contact@avapmo.com',
};
