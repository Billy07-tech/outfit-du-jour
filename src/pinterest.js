import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Pinterest n'offre pas d'API publique de recherche : on affiche la page de recherche
// Pinterest directement dans l'app (WebView), sans quitter l'application.
export function pinterestUrl(query) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
}

export function PinterestView({ query, height = 520 }) {
  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' }}>
      <WebView
        key={query} // recharge quand la recherche change
        source={{ uri: pinterestUrl(query) }}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        )}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        // On reste sur Pinterest : tout autre lien est bloqué.
        onShouldStartLoadWithRequest={(req) => /^https:\/\/([a-z0-9-]+\.)?pinterest\.[a-z.]+\//i.test(req.url)}
      />
    </View>
  );
}

// Requête quand l'IA n'est pas utilisée.
export function fallbackQuery(style, day, gender) {
  const temp = day.feelMax;
  const season = temp < 6 ? 'winter' : temp < 14 ? 'fall' : temp < 22 ? 'spring' : 'summer';
  const rain = day.rainProb >= 50 ? 'rainy day' : '';
  return [style, gender, 'outfit', season, rain].filter(Boolean).join(' ');
}
