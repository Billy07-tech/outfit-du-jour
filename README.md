# Outfit du jour

Application mobile (Expo SDK 57 / React Native) qui te propose chaque jour une tenue de ta garde-robe selon la météo de ta ville.

## Lancer l'app

```bash
npm install
npx expo start -c
```

Il faut **Node 20.19+ ou 22** (pas 21). Scanne le QR code avec **Expo Go**.

## Version web (tester sur PC)

```bash
npm install
npx expo start --web
```

L'app s'ouvre dans le navigateur (http://localhost:8081). Les données sont gardées dans le navigateur (≈ 5 Mo : garde des photos légères).
Sur le web : pas de notifications, et Pinterest s'ouvre dans un nouvel onglet (il refuse d'être intégré à une page).

Pour produire une page unique à ouvrir en double-clic : `npx expo export --platform web`.

## Premier démarrage

1. **Réglages** : ta ville (ou GPS), ta clé API Gemini (gratuite sur aistudio.google.com), l'heure de la notification du matin.
2. **Garde-robe** : ajoute des tenues complètes (photo + description) et/ou des pièces séparées (hauts, bas, chaussures, vestes). Gemini analyse tout.
3. **Aujourd'hui** : la tenue du jour. « Je la porte » l'enregistre.

## Fonctions

- **Météo automatique** (Open-Meteo, sans clé) : 7 jours + météo heure par heure.
- **Filtre strict par température** : une tenue hors météo n'est jamais proposée.
- **Alertes** : pluie probable (fenêtre horaire), gros écart matin / après-midi (couche à prévoir).
- **Notifications** : tenue du jour chaque matin + alerte pluie 1 h avant (reprogrammées à chaque ouverture de l'app).
- **Anti-répétition** : tenues récemment portées pénalisées, pièces réutilisées pénalisées, jamais deux fois la même dans la semaine.
- **Tenues composées** : l'app combine tes pièces (haut + bas + chaussures + veste) et choisit la meilleure pour la météo.
- **Au sale** : une tenue (ou ses haut/bas) portée passe au sale et n'est plus proposée ; bouton pour la remettre au propre.
- **Favoris et notes** : ♥ et 👍/👎 influencent les propositions.
- **Agenda** : indique un événement (travail, soirée…) pour un jour de la semaine, l'app choisit en conséquence.
- **Modifier** une tenue ou une pièce (toucher la carte) ; appui long pour supprimer.
- **Filtres** de garde-robe : météo, style, événement, imperméable, favoris, au sale, recherche.
- **Stats** : tenues et pièces les plus portées, styles, jamais portées.
- **Inspiration** : idées Gemini par style, Pinterest intégré à l'app, images générées par Gemini.
- **Que m'acheter ?** : l'IA repère les manques de ta garde-robe selon la météo à venir.

## Limites à connaître

- **Pinterest** n'a pas d'API de recherche publique : l'app affiche leur site dans une vue intégrée (connexion possible une fois).
- **Notifications dans Expo Go** : les notifications locales programmées fonctionnent, mais Expo Go peut les limiter selon ton téléphone. Elles sont fiables dans une vraie installation de l'app.
- **Images IA** : dépend du modèle d'images Gemini (`IMAGE_MODEL` en bas de `src/ai.js`) ; change-le si Google le renomme.
- **Clé API** : stockée dans le stockage sécurisé du téléphone (usage personnel).
- Les données sont stockées localement sur le téléphone, sans synchronisation.

## Structure

```
App.js                      navigation + reprogrammation des notifications
src/recommend.js            scoring, combinaisons, anti-répétition, planning
src/weather.js              géolocalisation, prévisions, météo horaire, alertes
src/notifications.js        notifications locales
src/sync.js                 recalcul de la semaine + notifications
src/ai.js                   Gemini : analyse, idées, achats, images
src/pinterest.js            vue Pinterest intégrée
src/store.js                stockage local
src/screens/                Aujourd'hui, Semaine, Garde-robe (+ éditeurs, stats), Inspiration, Réglages
```
