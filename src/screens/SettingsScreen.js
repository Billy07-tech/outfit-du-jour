import React, { useCallback, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, shared } from '../components';
import { COLORS, STYLES } from '../constants';
import { getApiKey, loadSettings, saveSettings, setApiKey } from '../store';
import { syncNotifications } from '../sync';
import { notificationsAvailable } from '../notifications';

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [key, setKey] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSettings(await loadSettings());
        setKey((await getApiKey()) || '');
      })();
    }, [])
  );

  if (!settings) return <View style={shared.screen} />;

  const toggleStyle = (s) =>
    setSettings({
      ...settings,
      styles: settings.styles.includes(s) ? settings.styles.filter((x) => x !== s) : [...settings.styles, s],
    });

  const save = async () => {
    await saveSettings(settings);
    await setApiKey(key.trim());
    syncNotifications();
    Alert.alert('Enregistré', 'Tes réglages sont sauvegardés.');
  };

  return (
    <ScrollView style={shared.screen} contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
      <View style={shared.card}>
        <Text style={shared.h2}>Ville</Text>
        <Text style={[shared.muted, { marginVertical: 6 }]}>
          Laisse vide pour utiliser ta position GPS automatiquement.
        </Text>
        <TextInput
          style={shared.input}
          placeholder="Ex : Bruxelles"
          placeholderTextColor={COLORS.muted}
          value={settings.city}
          onChangeText={(v) => setSettings({ ...settings, city: v })}
        />
      </View>

      <View style={shared.card}>
        <Text style={shared.h2}>Notifications</Text>
        {!notificationsAvailable() && (
          <Text style={[shared.muted, { marginTop: 6 }]}>
            Indisponibles ici (Expo Go ou version web). Elles fonctionneront dans une installation complète de l'app sur téléphone.
          </Text>
        )}
        <View style={[shared.row, { justifyContent: 'space-between', marginTop: 10 }]}>
          <Text style={{ color: COLORS.ink, flex: 1 }}>Tenue du jour chaque matin</Text>
          <Switch value={settings.notifMorning} onValueChange={(v) => setSettings({ ...settings, notifMorning: v })} />
        </View>
        {settings.notifMorning && (
          <TextInput
            style={[shared.input, { marginTop: 10 }]}
            placeholder="Heure (ex : 08:00)"
            placeholderTextColor={COLORS.muted}
            value={settings.notifTime}
            onChangeText={(v) => setSettings({ ...settings, notifTime: v })}
            keyboardType="numbers-and-punctuation"
          />
        )}
        <View style={[shared.row, { justifyContent: 'space-between', marginTop: 6 }]}>
          <Text style={{ color: COLORS.ink, flex: 1 }}>Alerte pluie (1 h avant)</Text>
          <Switch value={settings.notifRain} onValueChange={(v) => setSettings({ ...settings, notifRain: v })} />
        </View>
      </View>

      <View style={shared.card}>
        <Text style={shared.h2}>Garde-robe</Text>
        <View style={[shared.row, { justifyContent: 'space-between', marginTop: 10 }]}>
          <Text style={{ color: COLORS.ink, flex: 1 }}>Mettre au sale après port</Text>
          <Switch value={settings.autoDirty} onValueChange={(v) => setSettings({ ...settings, autoDirty: v })} />
        </View>
        <Text style={[shared.muted, { marginTop: 6 }]}>
          Une tenue portée n'est plus proposée tant que tu ne l'as pas remise au propre dans la garde-robe.
        </Text>
      </View>

      <View style={shared.card}>
        <Text style={shared.h2}>Inspirations</Text>
        <Text style={[shared.muted, { marginVertical: 6 }]}>
          Public pour les recherches Pinterest (ex : homme, femme) et styles favoris.
        </Text>
        <TextInput
          style={shared.input}
          placeholder="homme / femme / unisexe"
          placeholderTextColor={COLORS.muted}
          value={settings.gender}
          onChangeText={(v) => setSettings({ ...settings, gender: v })}
        />
        <View style={shared.wrap}>
          {STYLES.map((s) => (
            <Chip key={s} label={s} active={settings.styles.includes(s)} onPress={() => toggleStyle(s)} />
          ))}
        </View>
      </View>

      <View style={shared.card}>
        <Text style={shared.h2}>Clé API Gemini</Text>
        <Text style={[shared.muted, { marginVertical: 6 }]}>
          Nécessaire pour l'analyse des tenues et les idées. Crée-la gratuitement sur aistudio.google.com (Get API key). Elle reste dans le stockage sécurisé de ton téléphone.
        </Text>
        <TextInput
          style={shared.input}
          placeholder="AIza…"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={key}
          onChangeText={setKey}
        />
      </View>

      <Button title="Enregistrer" onPress={save} />
    </ScrollView>
  );
}
