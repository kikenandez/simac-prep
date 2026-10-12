// lib/safety.js — liens de rédaction d'un mail : messagerie locale (mailto:) ou Gmail / Outlook web
// pour les postes sans messagerie configurée. Rien n'est envoyé par l'application.

/** mailto: et rédaction Gmail / Outlook web, avec objet et corps préremplis. */
export function mailLinks({ to = '', subject = '', body = '' }) {
  const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return {
    mailto: `mailto:${encodeURIComponent(to)}?${q({ subject, body })}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&${q({ to, su: subject, body })}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?${q({ to, subject, body })}`,
  };
}
