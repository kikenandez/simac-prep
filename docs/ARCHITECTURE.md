# Architecture et choix

## Contrainte directrice : gratuit, pour toujours
- **Pas de backend.** Une page statique ; tout tourne dans le navigateur. Hébergement GitHub Pages (gratuit, HTTPS).
- **BYOK (bring your own key).** L'utilisateur colle une clé de fournisseur à offre gratuite. Pas de proxy, donc pas de coût ni de clé partagée à protéger. Risque accepté : la clé est dans `localStorage` du poste de l'utilisateur.
- **Un seul protocole.** Tous les fournisseurs retenus exposent `POST /chat/completions` compatible OpenAI avec CORS ouvert : Groq, Gemini (endpoint `/openai`), Mistral, OpenRouter, Ollama (`OLLAMA_ORIGINS`). Ajouter un fournisseur = une entrée dans `PROVIDERS`.
- **Sorties JSON.** Chaque appel demande un objet JSON (schéma dans le prompt) ; `parseJSON` tolère les clôtures ``` et le texte autour. `response_format: json_object` est envoyé sauf pour Ollama.
- **Mode démo.** `provider: mock` renvoie des contenus d'exemple marqués `[DEMO]` : tests, démonstrations, premier contact sans clé.

## Recherche client
Jina Reader (`r.jina.ai/<url>`) rend une page en texte, et `s.jina.ai/<requête>` fait une recherche ; sans clé à faible volume. Les sources sont tronquées à 6 000 caractères chacune pour tenir dans le contexte des modèles gratuits. L'utilisateur peut toujours coller des notes (profil LinkedIn, mail) : LinkedIn n'est pas lisible par URL.

## Mémoire et RAG léger
- Un rendez-vous = une ligne plate (`COLUMNS` dans `store.js`), stockée dans `localStorage` (`simac.meetings`).
- Le CSV exporté est exactement cette table ; l'import la recharge. C'est l'« amorce RAG » demandée : lisible par un humain, par un tableur, par un autre outil.
- Récupération : score par recouvrement de tokens (société, secteur, offre, rôle, notes) + bonus même société, top 3 injectés en texte dans les prompts Fiche client et Persona. Pas d'embeddings : volumes TPE/PME (dizaines à centaines de lignes), et zéro dépendance.
- Le brouillon courant est dans `simac.draft` ; « Nouveau RDV » conserve la fiche offre.

## Limites connues
- Quotas gratuits variables (429) → changer de fournisseur ; message explicite.
- `localStorage` ≈ 5 Mo : largement suffisant ; au-delà, exporter et purger.
- Pas de multi-utilisateur ni de synchronisation : le CSV est le mécanisme de partage.
- Anglais : les prompts existent en `en` (`prompts.js`), l'interface est en français pour ce premier cas d'usage.

## Évolutions candidates
Embeddings locaux (transformers.js) si l'historique dépasse quelques centaines de lignes · export PDF du script · import CSV d'un CRM · variante anglaise de l'interface · PWA hors ligne.
