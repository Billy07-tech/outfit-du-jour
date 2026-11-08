// Ajoute le sous-chemin du site web quand il est fourni (ex. GitHub Pages : /outfit-du-jour).
// En local, EXPO_BASE_URL n'est pas défini : l'app reste servie à la racine.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
