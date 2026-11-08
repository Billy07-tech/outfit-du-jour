import React from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from './components';
import { COLORS } from './constants';

// Sur le web, Pinterest refuse d'être affiché dans une autre page (il bloque l'intégration) :
// on propose donc un bouton qui l'ouvre dans un nouvel onglet.
export function pinterestUrl(query) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
}

export function PinterestView({ query }) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: COLORS.line,
      }}
    >
      <Text style={{ color: COLORS.muted, marginBottom: 10 }}>
        Pinterest ne peut pas s'afficher dans une page web externe. Sur téléphone, il est intégré à l'app.
      </Text>
      <Button title="📌 Ouvrir Pinterest dans un nouvel onglet" onPress={() => Linking.openURL(pinterestUrl(query))} />
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
