import React, { useEffect } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TodayScreen from './src/screens/TodayScreen';
import WeekScreen from './src/screens/WeekScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';
import InspirationScreen from './src/screens/InspirationScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/constants';
import { syncNotifications } from './src/sync';

const Tab = createBottomTabNavigator();

const icon = (emoji) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

export default function App() {
  // Reprogramme les notifications au lancement et à chaque retour dans l'app.
  useEffect(() => {
    syncNotifications();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && syncNotifications());
    return () => sub.remove();
  }, []);

  // Sur grand écran (web), on garde un format « téléphone » centré.
  const frame = Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' } : { flex: 1 };

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E9E5DF' : COLORS.bg }}>
        <View style={frame}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.bg },
            headerShadowVisible: false,
            headerTitleStyle: { color: COLORS.ink, fontWeight: '700' },
            tabBarActiveTintColor: COLORS.accent,
            tabBarInactiveTintColor: COLORS.muted,
            tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.line },
          }}
        >
          <Tab.Screen name="Aujourd'hui" component={TodayScreen} options={{ tabBarIcon: icon('☀️') }} />
          <Tab.Screen name="Semaine" component={WeekScreen} options={{ tabBarIcon: icon('📅') }} />
          <Tab.Screen name="Garde-robe" component={WardrobeScreen} options={{ tabBarIcon: icon('👕') }} />
          <Tab.Screen name="Inspiration" component={InspirationScreen} options={{ tabBarIcon: icon('📌') }} />
          <Tab.Screen name="Réglages" component={SettingsScreen} options={{ tabBarIcon: icon('⚙️') }} />
        </Tab.Navigator>
      </NavigationContainer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
