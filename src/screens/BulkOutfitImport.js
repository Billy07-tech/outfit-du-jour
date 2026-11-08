import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { Button, setPhotoCache, shared } from '../components';
import { COLORS } from '../constants';
import { loadOutfits, saveOutfits, savePhoto } from '../store';
import { analyzeOutfit } from '../ai';
import { newId, pickPhotos } from '../photo';

const MAX_PHOTOS = 20;

// Valeurs par défaut quand l'IA n'a pas pu analyser une photo (à corriger ensuite dans la garde-robe).
const fallback = (n) => ({
  name: `Tenue ${n}`,
  style: 'Casual',
  events: [],
  tempMin: 8,
  tempMax: 20,
  warmth: 3,
  waterproof: false,
  items: [],
  colors: [],
});

// Ajout de plusieurs tenues d'un coup : choix de photos multiples, analyse IA une par une, puis enregistrement groupé.
export default function BulkOutfitImport({ visible, onClose, onSaved }) {
  const [rows, setRows] = useState([]); // [{ key, photo, status: 'pending'|'analyzing'|'done'|'error', form, error }]
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (visible) {
      setRows([]);
      setRunning(false);
      setSaving(false);
      cancelled.current = false;
    }
  }, [visible]);

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const choose = async () => {
    const photos = await pickPhotos(MAX_PHOTOS);
    if (!photos.length) return;
    const start = rows.length;
    const added = photos.map((photo, i) => ({
      key: newId() + i,
      photo,
      status: 'pending',
      form: fallback(start + i + 1),
      error: '',
    }));
    setRows((rs) => [...rs, ...added]);
    analyzeAll(added);
  };

  // Analyse les photos l'une après l'autre (plus doux pour le quota gratuit Gemini).
  const analyzeAll = async (list) => {
    setRunning(true);
    cancelled.current = false;
    for (const r of list) {
      if (cancelled.current) break;
      update(r.key, { status: 'analyzing' });
      try {
        const form = await analyzeOutfit({ base64: r.photo.base64 });
        update(r.key, { status: 'done', form });
      } catch (e) {
        update(r.key, { status: 'error', error: e.message });
        // Sans clé ou quota épuisé : inutile d'essayer les photos suivantes.
        if (/clé|quota/i.test(e.message)) {
          list.slice(list.indexOf(r) + 1).forEach((x) => update(x.key, { status: 'error', error: e.message }));
          break;
        }
      }
    }
    setRunning(false);
  };

  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const rename = (key, name) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, form: { ...r.form, name } } : r)));

  const close = () => {
    cancelled.current = true;
    onClose();
  };

  const save = async () => {
    if (!rows.length) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const created = rows.map((r, i) => ({
        r,
        outfit: {
          id: newId() + i,
          name: r.form.name.trim() || `Tenue ${i + 1}`,
          style: r.form.style,
          events: r.form.events || [],
          tempMin: Number(r.form.tempMin) || 0,
          tempMax: Number(r.form.tempMax) || 25,
          warmth: r.form.warmth,
          waterproof: !!r.form.waterproof,
          items: r.form.items || [],
          colors: r.form.colors || [],
          createdAt: now,
        },
      }));
      // Photos d'abord : si le stockage est plein, on n'enregistre que les tenues dont la photo a pu être gardée.
      const kept = [];
      let full = false;
      for (const { r, outfit } of created) {
        const uri = 'data:image/jpeg;base64,' + r.photo.base64;
        try {
          await savePhoto(outfit.id, uri);
          setPhotoCache(outfit.id, uri);
          kept.push(outfit);
        } catch {
          full = true;
          break;
        }
      }
      if (kept.length) await saveOutfits([...(await loadOutfits()), ...kept]);
      if (full) {
        Alert.alert(
          'Stockage plein',
          `${kept.length} tenue(s) enregistrée(s) sur ${rows.length}. L'espace du navigateur est plein : supprime des tenues ou utilise l'app mobile.`
        );
      }
      onSaved();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e.message);
      setSaving(false);
    }
  };

  const done = rows.filter((r) => r.status === 'done').length;
  const failed = rows.filter((r) => r.status === 'error').length;
  const firstError = rows.find((r) => r.status === 'error')?.error;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[shared.screen, { paddingTop: 50 }]}>
        <ScrollView contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
          <Text style={[shared.h1, { marginBottom: 6 }]}>Ajouter plusieurs tenues</Text>
          <Text style={[shared.muted, { marginBottom: 14 }]}>
            Choisis jusqu'à {MAX_PHOTOS} photos : l'IA analyse chaque tenue, tu vérifies les noms puis tu enregistres tout d'un coup.
          </Text>

          <Button
            title={rows.length ? '🖼️ Ajouter d’autres photos' : '🖼️ Choisir des photos'}
            kind={rows.length ? 'ghost' : 'primary'}
            onPress={choose}
            disabled={running || saving}
            style={{ marginBottom: 14 }}
          />

          {rows.length > 0 && (
            <Text style={[shared.muted, { marginBottom: 10 }]}>
              {running ? `Analyse en cours… ${done + failed}/${rows.length}` : `${done} analysée(s) sur ${rows.length}`}
            </Text>
          )}
          {failed > 0 && !running && (
            <View style={[shared.card, { marginBottom: 12 }]}>
              <Text style={{ color: COLORS.ink, marginBottom: 4 }}>
                {failed} photo(s) non analysée(s) : elles seront enregistrées avec des réglages par défaut, à corriger ensuite en touchant la tenue.
              </Text>
              <Text style={shared.muted}>{firstError}</Text>
            </View>
          )}

          {rows.map((r) => (
            <View key={r.key} style={[shared.card, shared.row, { marginBottom: 10, alignItems: 'center' }]}>
              <Image source={{ uri: r.photo.uri }} style={{ width: 64, height: 84, borderRadius: 10, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[shared.input, { marginBottom: 4 }]}
                  value={r.form.name}
                  onChangeText={(v) => rename(r.key, v)}
                  placeholder="Nom de la tenue"
                  placeholderTextColor={COLORS.muted}
                />
                {r.status === 'analyzing' || r.status === 'pending' ? (
                  <View style={shared.row}>
                    {r.status === 'analyzing' && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 6 }} />}
                    <Text style={shared.muted}>{r.status === 'analyzing' ? 'Analyse…' : 'En attente'}</Text>
                  </View>
                ) : r.status === 'error' ? (
                  <Text style={shared.muted}>⚠️ Non analysée (réglages par défaut)</Text>
                ) : (
                  <Text style={shared.muted}>
                    {r.form.style} · {r.form.tempMin}° à {r.form.tempMax}°{r.form.waterproof ? ' · 🌧️' : ''}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => remove(r.key)} disabled={running} style={{ padding: 8, marginLeft: 4 }}>
                <Text style={{ fontSize: 18, color: COLORS.muted }}>✕</Text>
              </Pressable>
            </View>
          ))}

          {rows.length > 0 && (
            <Button
              title={saving ? 'Enregistrement…' : `Enregistrer ${rows.length} tenue${rows.length > 1 ? 's' : ''}`}
              onPress={save}
              disabled={running || saving}
              style={{ marginTop: 6 }}
            />
          )}
          <Button kind="ghost" title="Annuler" onPress={close} style={{ marginTop: 10 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
