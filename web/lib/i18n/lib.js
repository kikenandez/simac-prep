// Dictionnaire lib : 'clé française' → { en, es }.
export default {
  // llm.js — fournisseurs (Réglages)
  'Groq (free tier)': { en: 'Groq (free tier)', es: 'Groq (nivel gratuito)' },
  'Google Gemini (free tier)': { en: 'Google Gemini (free tier)', es: 'Google Gemini (nivel gratuito)' },
  'Mistral (free "experiment" plan)': { en: 'Mistral (free "experiment" plan)', es: 'Mistral (plan gratuito "experiment")' },
  'OpenRouter (":free" models)': { en: 'OpenRouter (":free" models)', es: 'OpenRouter (modelos ":free")' },
  'Claude — Anthropic (payant, données non utilisées pour l’entraînement)': { en: 'Claude — Anthropic (paid, data not used for training)', es: 'Claude — Anthropic (de pago, datos no usados para entrenamiento)' },
  'Ollama (local, no key)': { en: 'Ollama (local, no key)', es: 'Ollama (local, sin clave)' },
  'Mock (offline demo, no AI)': { en: 'Mock (offline demo, no AI)', es: 'Simulación (demo sin conexión, sin IA)' },
  // llm.js — erreurs
  'réponse coupée (trop longue). Réduisez les sources ou relancez.': { en: 'response cut off (too long). Reduce the sources or try again.', es: 'respuesta cortada (demasiado larga). Reduce las fuentes o vuelve a intentarlo.' },
  'JSON illisible': { en: 'Unreadable JSON', es: 'JSON ilegible' },
  // files.js — lecture des fichiers déposés
  '{name} : PDF sans texte — lecture optique en cours (quelques dizaines de secondes)…': { en: '{name}: PDF without text — running OCR (a few dozen seconds)…', es: '{name}: PDF sin texto — reconocimiento óptico en curso (unas decenas de segundos)…' },
  '{name} : lecture optique de l’image (quelques dizaines de secondes)…': { en: '{name}: reading the image with OCR (a few dozen seconds)…', es: '{name}: reconocimiento óptico de la imagen (unas decenas de segundos)…' },
  'Aucun texte lisible dans {name} (image trop petite ou illisible).': { en: 'No readable text in {name} (image too small or unreadable).', es: 'No hay texto legible en {name} (imagen demasiado pequeña o ilegible).' },
  'Aucun texte lisible dans {name}.': { en: 'No readable text in {name}.', es: 'No hay texto legible en {name}.' },
  'Chargement de tesseract.js impossible.': { en: 'Could not load tesseract.js.', es: 'No se pudo cargar tesseract.js.' },
  'Image illisible.': { en: 'Unreadable image.', es: 'Imagen ilegible.' },
  'Chargement de mammoth impossible.': { en: 'Could not load mammoth.', es: 'No se pudo cargar mammoth.' },
  // ---- fields.js : libellés des champs et types de source
  'Dates': { en: 'Dates', es: 'Fechas' },
  'Profil collé': { en: 'Pasted profile', es: 'Perfil pegado' },
  'Document joint': { en: 'Attached document', es: 'Documento adjunto' },
  'Recherche web': { en: 'Web search', es: 'Búsqueda web' },
  'Registre': { en: 'Registry', es: 'Registro' },
};
