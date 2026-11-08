import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { Button, Chip, OutfitImage, setPhotoCache, shared } from '../components';
import { COLORS, EVENTS, STYLES } from '../constants';
import { loadOutfits, saveOutfits, savePhoto } from '../store';
import { analyzeOutfit } from '../ai';
import { newId, pickPhoto } from '../photo';

const EMPTY = {
  name: '',
  style: 'Casual',
  events: [],
  tempMin: '8',
  tempMax: '20',
  warmth: 3,
  waterproof: false,
  items: [],
  colors: [],
};

const toForm = (o) => ({ ...o, tempMin: String(o.tempMin ?? 8), tempMax: String(o.tempMax ?? 20) });

// Création d'une tenue (photo + IA) ou modification d'une tenue existante (prop `editing`).
export default function OutfitEditor({ visible, editing, onClose, onSaved }) {
  const [photo, setPhoto] = useState(null); // { uri, base64 }
  const [description, setDescription] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhoto(null);
      setDescription('');
      setBusy(false);
      setForm(editing ? toForm(editing) : null);
    }
  }, [visible, editing]);

  const close = () => onClose();

  const take = async (source) => {
    const p = await pickPhoto(source);
    if (p) {
      setPhoto(p);
      if (!editing) setForm(null);
    }
  };

  const analyze = async () => {
    if (!photo && !description.trim()) return Alert.alert('Rien à analyser', 'Ajoute une photo ou une description.');
    setBusy(true);
    try {
      const r = await analyzeOutfit({ base64: photo?.base64, description: description.trim() });
      setForm({ ...r, tempMin: String(r.tempMin), tempMax: String(r.tempMax) });
    } catch (e) {
      Alert.alert('Analyse impossible', e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleEvent = (e) =>
    set('events', form.events.includes(e) ? form.events.filter((x) => x !== e) : [...form.events, e]);

  const save = async () => {
    if (!form.name.trim()) return Alert.alert('Nom manquant', 'Donne un nom à la tenue.');
    const list = await loadOutfits();
    const id = editing ? editing.id : newId();
    const outfit = {
      ...(editing || {}),
      id,
      name: form.name.trim(),
      style: form.style,
      events: form.events,
      tempMin: Number(form.tempMin) || 0,
      tempMax: Number(form.tempMax) || 25,
      warmth: form.warmth,
      waterproof: form.waterproof,
      items: form.items || [],
      colors: form.colors || [],
      createdAt: editing?.createdAt || new Date().toISOString(),
    };
    await saveOutfits(editing ? list.map((o) => (o.id === id ? outfit : o)) : [...list, outfit]);
    if (photo?.base64) {
      const uri = 'data:image/jpeg;base64,' + photo.base64;
      await savePhoto(id, uri);
      setPhotoCache(id, uri);
    }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[shared.screen, { paddingTop: 50 }]}>
        <ScrollView contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
          <Text style={[shared.h1, { marginBottom: 14 }]}>{editing ? 'Modifier la tenue' : 'Nouvelle tenue'}</Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 320, borderRadius: 14, marginBottom: 10 }} />
          ) : editing ? (
            <OutfitImage id={editing.id} style={{ width: '100%', height: 320, borderRadius: 14, marginBottom: 10 }} />
          ) : null}
          <View style={[shared.row, { marginBottom: 10 }]}>
            <Button title="📷 Photo" kind="ghost" onPress={() => take('camera')} style={{ flex: 1, marginRight: 8 }} />
            <Button title="🖼️ Galerie" kind="ghost" onPress={() => take('library')} style={{ flex: 1 }} />
          </View>

          <TextInput
            style={[shared.input, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder="Description (optionnelle) : jean noir, pull gris, baskets blanches…"
            placeholderTextColor={COLORS.muted}
            multiline
            value={description}
            onChangeText={setDescription}
          />

          {(!form || editing) && (
            <>
              <Button
                title={busy ? 'Analyse en cours…' : editing ? "✨ Ré-analyser avec l'IA" : "✨ Analyser avec l'IA"}
                onPress={analyze}
                disabled={busy}
                kind={editing ? 'ghost' : 'primary'}
              />
              {busy && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.accent} />}
              {!form && (
                <Pressable
                  onPress={() => setForm({ ...EMPTY, name: description.trim().slice(0, 30) })}
                  style={{ alignItems: 'center', marginTop: 14 }}
                >
                  <Text style={{ color: COLORS.muted }}>Ou renseigner à la main</Text>
                </Pressable>
              )}
            </>
          )}

          {form && (
            <View style={[shared.card, { marginTop: 8 }]}>
              <Text style={[shared.muted, { marginBottom: 8 }]}>Vérifie et corrige si besoin avant d'enregistrer.</Text>
              <TextInput
                style={shared.input}
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder="Nom de la tenue"
                placeholderTextColor={COLORS.muted}
              />
              {form.items?.length > 0 && (
                <Text style={[shared.muted, { marginBottom: 10 }]}>Pièces : {form.items.join(', ')}</Text>
              )}

              <Text style={[shared.muted, { marginBottom: 6 }]}>Style</Text>
              <View style={shared.wrap}>
                {STYLES.map((s) => (
                  <Chip key={s} label={s} active={form.style === s} onPress={() => set('style', s)} />
                ))}
              </View>

              <Text style={[shared.muted, { marginBottom: 6 }]}>Événements</Text>
              <View style={shared.wrap}>
                {EVENTS.map((e) => (
                  <Chip key={e} label={e} active={form.events.includes(e)} onPress={() => toggleEvent(e)} />
                ))}
              </View>

              <Text style={[shared.muted, { marginBottom: 6 }]}>Température ressentie confortable (°C)</Text>
              <View style={shared.row}>
                <TextInput
                  style={[shared.input, { flex: 1, marginRight: 8 }]}
                  keyboardType="numbers-and-punctuation"
                  value={form.tempMin}
                  onChangeText={(v) => set('tempMin', v)}
                />
                <Text style={{ marginBottom: 10 }}>à</Text>
                <TextInput
                  style={[shared.input, { flex: 1, marginLeft: 8 }]}
                  keyboardType="numbers-and-punctuation"
                  value={form.tempMax}
                  onChangeText={(v) => set('tempMax', v)}
                />
              </View>

              <Text style={[shared.muted, { marginBottom: 6 }]}>Chaleur de la tenue (1 = short/t-shirt, 5 = grand froid)</Text>
              <View style={shared.wrap}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} label={String(n)} active={form.warmth === n} onPress={() => set('warmth', n)} />
                ))}
              </View>

              <View style={[shared.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
                <Text style={{ color: COLORS.ink }}>Protège de la pluie</Text>
                <Switch value={form.waterproof} onValueChange={(v) => set('waterproof', v)} />
              </View>

              <Button title={editing ? 'Enregistrer les modifications' : 'Enregistrer la tenue'} onPress={save} />
            </View>
          )}

          <Button kind="ghost" title="Annuler" onPress={close} style={{ marginTop: 10 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
