# La méthode — source de vérité pour les prompts

Toute modification ici doit être reportée dans `web/lib/prompts.js`.

## Les 7 points de préparation
Se renseigner sur le prospect · Identifier les besoins supposés · Se fixer un objectif (+ repli) · Préparer le déroulé · Posture · Préparer ses supports · Définir l'étape suivante.

## SIMAC
1. **Situation** — faire le point sur la situation du client : besoins, enjeux, pourquoi sa décision est importante. Questions ouvertes ; reformuler avec *ses* mots.
2. **Idée** — susciter l'intérêt avec une idée / offre découlant de l'analyse. Simple, claire, concise : elle met le client en condition d'écouter.
3. **Mécanisme** — détailler : qui fait quoi, quand, où, comment, pour combien, pourquoi. 3 à 5 étapes. Lève les freins en démontrant le réalisme. **Le prix se dit à la fin du mécanisme.**
4. **Avantages** — démontrer en quoi la proposition satisfait ses besoins et les bénéfices personnels qu'il en retire. **Reformuler ces besoins.** Mettre en avant ce que la concurrence n'a pas. Bénéfices avant caractéristiques.
5. **Conclusion** — le client doit décider : l'inviter à agir par une question, idéalement **le choix entre deux propositions**, puis expliquer l'étape suivante de la collaboration.

## Les 20 premières secondes
Présentation en 1 phrase · rappel du contexte du rendez-vous · recentrer sur le prospect (une question sur lui). Rassurer, se positionner, montrer qu'on est là pour lui.

## Découverte
Trois piliers : créer la confiance (cadre bienveillant) · questionner avec méthode (questions ouvertes) · écouter activement (reformuler). Kit : questions ouvertes / douleur-enjeu / urgence-budget / décision, puis une reformulation de synthèse validée avant de proposer.

## CABP
Caractéristique → Avantage → Bénéfice → Preuve. Passer de « je fais » à « ce que vous gagnez ». Caractéristiques réelles, objectives, démontrables ; pas de superlatif sans preuve.

## SONCAS-E (motivations d'achat, pas types de personnalité)
| Code | Motivation | Le client veut… |
|---|---|---|
| S | Sécurité | être tranquille, sûr que ça fonctionne : cadre, garanties, références |
| O | Orgueil | reconnaissance, prestige, être à la pointe |
| N | Nouveauté | ce qui est nouveau, moderne, innovant |
| C | Confort | facilité, gain de temps, simplicité |
| A | Argent | gain financier, optimisation des coûts, ROI |
| Y (S) | Sympathie | relationnel, confiance, plaisir à collaborer |
| E | Environnement | respect de l'environnement, valeurs |

Dans l'application : score 1-3 par dimension (défaut 2, proposé par l'IA, corrigé par l'utilisateur) ; le message principal s'appuie sur le top 3.

## Objections
Une objection est une demande d'information, pas un refus. Séquence : **accueillir → creuser (question) → répondre → relancer**. Ne jamais se justifier ni accuser le client de cacher la vraie raison. Classiques : « je dois réfléchir », « nous avons déjà un prestataire », « ce n'est pas le moment », « envoyez-moi une documentation », « c'est trop cher ».

## Les 7 erreurs à traquer
Trop parler de soi au début · pas d'objectif clair · découverte trop courte → proposition hors sujet · prix donné trop tôt · vouloir convaincre à tout prix (écouter > convaincre) · se justifier face aux objections · pas de suite / pas d'appel à l'action.

## Conclure et suivre
On ne repart jamais sans **une date** et **le nom du décideur**. Enregistrer quatre choses : l'action, le responsable, la date, le livrable attendu. Les engagements du client (« elle revient vers nous avant la fin du mois ») sont des actions comme les autres, avec le client pour responsable. Mail de suivi < 150 mots, un seul lien, fin = proposition datée (« mardi ou jeudi ? »), jamais « n'hésitez pas ». Relance notée à J+7.

## Prix, conditions
Prix après la valeur, ramené à l'unité qui parle au client. Plancher connu avant d'entrer ; leviers de négociation sans remise (périmètre, quantité, délai, paiement). Aucune promesse qu'on ne peut pas tenir.

## En anglais et en espagnol

L'interface existe en français (par défaut), anglais et espagnol. La méthode garde ses noms dans les trois langues : il n'existe pas d'acronyme anglais ou espagnol plus établi.

| | Français | Español | English |
|---|---|---|---|
| SIMAC | Situation, Idée, Mécanisme, Avantages, Conclusion | **SIMAC** : Situación, Idea, Mecanismo, Ventajas, Conclusión (« método SIMAC ») | **SIMAC method** : Situation, Idea, Mechanism, Advantages, Conclusion. Pas d'équivalent anglais natif ; le plus proche est **FAB** (Features–Advantages–Benefits), qui couvre Idée → Avantages |
| SONCAS-E | Sécurité, Orgueil, Nouveauté, Confort, Argent, Sympathie, Environnement | **SONCAS** : Seguridad, Orgullo, Novedad, Comodidad, Dinero, Simpatía ; E = Ecología (SONCASE) | **SONCAS** gardé : Security, Pride, Novelty, Comfort, Money, Sympathy, Environment. Proche des « six basic buying motives » anglo-saxons (gain, peur de perdre, confort, éviter la douleur, affection, fierté) |
| CABP | Caractéristique, Avantage, Bénéfice, Preuve | CVBP : Característica, Ventaja, Beneficio, Prueba | FABP : Feature, Advantage, Benefit, Proof |

Les codes internes (S O N C A Y E, scores, CSV) ne changent pas avec la langue. Les consignes de tâche des prompts restent en français ; le bloc méthode est rédigé dans la langue choisie et une consigne finale impose la langue de sortie, en gardant les valeurs énumérées (verdicts, résultats, `nous|eux|égal|inconnu`…) comme codes.

Sources : [SIMAC en espagnol (Appvizer)](https://www.appvizer.es/revista/relacion-cliente/software-crm/como-convencer-a-un-cliente-utilizando-la-tecnica-de-venta-simac) · [SIMAC method en anglais (Leexi)](https://www.leexi.ai/en/sales-enablement/sales-techniques/simac-method/) · [FAB](https://amplemarket.com/glossary/features-advantages-and-benefits) · [SONCAS en espagnol (Skipcall)](https://skipcall.io/es/scripts/metodo-soncas) · [SONCAS (Wikipedia, EN)](https://en.wikipedia.org/wiki/SONCAS) · [Six basic buying motives (Selling Power)](https://sellingpower.com/8865/how-to-identify-the-six-basic-buying-motives)
