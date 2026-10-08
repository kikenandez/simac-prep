# Architecture et choix

## Contrainte directrice : gratuit, pour toujours
- **Pas de backend.** Une page statique ; tout tourne dans le navigateur. Hébergement GitHub Pages (gratuit, HTTPS).
- **BYOK (bring your own key).** L'utilisateur colle une clé de fournisseur à offre gratuite. Pas de proxy, donc pas de coût ni de clé partagée à protéger. Risque accepté : la clé est dans `localStorage` du poste de l'utilisateur.
- **Un seul protocole.** Tous les fournisseurs retenus exposent `POST /chat/completions` compatible OpenAI avec CORS ouvert : Groq, Gemini (endpoint `/openai`), Mistral, OpenRouter, Ollama (`OLLAMA_ORIGINS`). Ajouter un fournisseur = une entrée dans `PROVIDERS`.
- **Sorties JSON.** Chaque appel demande un objet JSON (schéma dans le prompt) ; `parseJSON` tolère les clôtures ``` et le texte autour. `response_format: json_object` est envoyé sauf pour Ollama.
- **Mode démo.** `provider: mock` renvoie des contenus d'exemple marqués `[DEMO]` : tests, démonstrations, premier contact sans clé.

## Recherche publique et préparation

`research.js` contient les adaptateurs `searchCompanies`, `companySource`, `fetchNotices`, `searchWeb`, `readUrl`. `research-ui.js` gère les panneaux de marché et d’identification/recherche du client. Les appels sont directs depuis le navigateur ; aucun proxy ni secret partagé.

- Recherche d’entreprises : `/search?q=…&per_page=5`, nom + commune ou SIREN/SIRET. Choix explicite du SIRET, pas de sélection automatique du premier résultat. Les dates de naissance des dirigeants ne sont pas conservées. Effectifs et finances indiquent leur année et concernent l’unité légale.
- BODACC : Explore v2.1, dataset `annonces-commerciales`, filtre SIREN exact et date, maximum 10 annonces sur 24 mois. Une absence de résultats n’est pas un jugement sur l’entreprise. Une erreur ne supprime pas les résultats précédents.
- Jina : Reader sans clé à faible volume ; Search nécessite une clé personnelle et des crédits. Les recherches commencent par le marché français, modifiable. Les recherches client ciblent séparément société et personnes ; les extraits web nécessitent une sélection manuelle. Pappers est exclu des requêtes et résultats, et bloqué à la lecture directe.
- Timeout réseau 20 s ; cache mémoire des API officielles 15 min, limité à 50 entrées ; actualisation explicite contourne le cache. Maximum 40 sources par collection ; 6 000 caractères par source, contexte de sources limité à 60 000 caractères. Aucun cache partagé ou serveur.
- Preuves : identifiant stable, URL/origine, texte, date de consultation, date de publication/référence si connue, inclusion, sujet et SIREN si pertinents. Les dates inconnues restent inconnues. Les données non cochées ne passent pas dans les sources du prompt.
- Comparaison concurrentielle séparée de la fiche offre ; les caractéristiques de concurrents ne sont jamais extraites vers notre offre. Prix absent = non publié. Les alternatives sans preuve sont explicitement hypothétiques. Les comparaisons sont éditables.
- Fiche client : rôle documenté vs identité à confirmer, hypothèses, signaux sourcés, questions par personne, ouverture ou premier email (copie uniquement). Les IDs de citations sont résolus contre les sources incluses ; faits sans référence valide reclassés en hypothèses. Cela vérifie la référence, pas la vérité sémantique de la phrase : relecture nécessaire.
- Modification du client/lieu : identité officielle effacée, anciennes preuves décochées. Modification d’interlocuteurs : résultats de recherche sur les personnes décochés. Les résultats asynchrones sont ignorés si le contexte a changé. Modification des sources/offre/comparaison : préparation dérivée invalidée. Les scores SONCAS saisis restent conservés, les arguments IA sont à régénérer.
- URL rendues : seulement http/https sans identifiants ; textes échappés. Les prompts traitent les documents comme des données, pas des instructions. Pas d’inférence de motivations SONCAS ou de pouvoir d’achat depuis un titre public.

Les API Recherche d’entreprises et BODACC ont répondu sans clé avec CORS ouvert lors des vérifications du 8 octobre 2026. Disponibilité, quotas et conditions des fournisseurs peuvent évoluer. Références : [Recherche d’entreprises](https://recherche-entreprises.api.gouv.fr/docs/), [BODACC](https://www.bodacc.fr/explore/dataset/annonces-commerciales/api/), [Jina](https://jina.ai/reader/), [Pappers](https://www.pappers.fr/mentions-legales).

## Mémoire et RAG léger
- Un rendez-vous = une ligne plate (`COLUMNS` dans `store.js`), stockée dans `localStorage` (`simac.meetings`).
- Le CSV exporté est exactement cette table ; l'import la recharge. C'est l'« amorce RAG » demandée : lisible par un humain, par un tableur, par un autre outil.
- Récupération : score par recouvrement de tokens (société, secteur, offre, rôle, notes) + bonus même société, top 3 injectés en texte dans les prompts Fiche client et Persona. Pas d'embeddings : volumes TPE/PME (dizaines à centaines de lignes), et zéro dépendance.
- `research_json` ajoute au CSV un instantané versionné : offre, comparaison, sources, identité officielle et contexte de préparation. Il n’inclut pas les clés API. Les anciennes lignes sans ce champ restent compatibles ; la fiche et le SIMAC sont à régénérer à la réouverture.
- Le brouillon courant est dans `simac.draft` ; « Nouveau RDV » conserve la fiche offre.

## Limites connues
- Quotas gratuits variables (429) → changer de fournisseur ; message explicite.
- `localStorage` ≈ 5 Mo : les textes des sources augmentent le volume de chaque rendez-vous. Exporter régulièrement et supprimer les anciens rendez-vous devenus inutiles.
- Pas de multi-utilisateur ni de synchronisation : le CSV est le mécanisme de partage.
- Anglais : les prompts existent en `en` (`prompts.js`), l'interface est en français pour ce premier cas d'usage.

## Évolutions candidates
Embeddings locaux (transformers.js) si l'historique dépasse quelques centaines de lignes · export PDF du script · import CSV d'un CRM · variante anglaise de l'interface · PWA hors ligne.
