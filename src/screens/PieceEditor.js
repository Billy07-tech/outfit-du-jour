import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { Button, Chip, OutfitImage, setPhotoCache, shared } from '../components';
import { CATEGORIES, COLORS, EVENTS, STYLES } from '../constants';
import { loadPieces, savePieces, savePhoto } from '../store';
import { analyzePiece } from '../ai';
import { newId, pickPhoto } from '../photo';

const EMPTY = { name: '', category: 'Haut', style: 'Casual', events: [], warmth: 3, waterproof: false, colors: [] };

// Création / modification d'une pièce (haut, bas, chaussures, veste).
export default function PieceEditor({ visible, editing, onClose, onSaved }) {
  const [photo, setPhoto] = useState(null);
  const [description, setDescription] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhoto(null);
      setDescription('');
      setBusy(false);
      setForm(editing ? { ...editing } : null);
    }
  }, [visible, editing]);

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
      setForm(await analyzePiece({ base64: photo?.base64, description: description.trim() }));
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
    if (!form.name.trim()) return Alert.alert('Nom manquant', 'Donne un nom à la pièce.');
    const list = await loadPieces();
    const id = editing ? editing.id : newId();
    const piece = {
      ...(editing || {}),
      id,
      name: form.name.trim(),
      category: form.category,
      style: form.style,
      events: form.events || [],
      warmth: form.warmth,
      waterproof: form.waterproof,
      colors: form.colors || [],
      createdAt: editing?.createdAt || new Date().toISOString(),
    };
    await savePieces(editing ? list.map((p) => (p.id === id ? piece : p)) : [...list, piece]);
    if (photo?.base64) {
      const uri = 'data:image/jpeg;base64,' + photo.base64;
      await savePhoto(id, uri);
      setPhotoCache(id, uri);
    }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[shared.screen, { paddingTop: 50 }]}>
        <ScrollView contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
          <Text style={[shared.h1, { marginBottom: 14 }]}>{editing ? 'Modifier la pièce' : 'Nouvelle pièce'}</Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 260, borderRadius: 14, marginBottom: 10 }} />
          ) : editing ? (
            <OutfitImage id={editing.id} style={{ width: '100%', height: 260, borderRadius: 14, marginBottom: 10 }} />
          ) : null}
          <View style={[shared.row, { marginBottom: 10 }]}>
            <Button title="📷 Photo" kind="ghost" onPress={() => take('camera')} style={{ flex: 1, marginRight: 8 }} />
            <Button title="🖼️ Galerie" kind="ghost" onPress={() => take('library')} style={{ flex: 1 }} />
          </View>

          <TextInput
            style={[shared.input, { minHeight: 60, textAlignVertical: 'top' }]}
            placeholder="Description (optionnelle) : jean noir slim…"
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
              <TextInput
                style={shared.input}
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder="Nom de la pièce"
                placeholderTextColor={COLORS.muted}
              />
              <Text style={[shared.muted, { marginBottom: 6 }]}>Catégorie</Text>
              <View style={shared.wrap}>
                {CATEGORIES.map((c) => (
                  <Chip key={c} label={c} active={form.category === c} onPress={() => set('category', c)} />
                ))}
              </View>
              <Text style={[shared.muted, { marginBottom: 6 }]}>Style</Text>
              <View style={shared.wrap}>
                {STYLES.map((s) => (
                  <Chip key={s} label={s} active={form.style === s} onPress={() => set('style', s)} />
                ))}
              </View>
              <Text style={[shared.muted, { marginBottom: 6 }]}>Événements</Text>
              <View style={shared.wrap}>
                {EVENTS.map((e) => (
                  <Chip key={e} label={e} active={(form.events || []).includes(e)} onPress={() => toggleEvent(e)} />
                ))}
              </View>
              <Text style={[shared.muted, { marginBottom: 6 }]}>Chaleur (1 = très léger, 5 = très chaud)</Text>
              <View style={shared.wrap}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} label={String(n)} active={form.warmth === n} onPress={() => set('warmth', n)} />
                ))}
              </View>
              <View style={[shared.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
                <Text style={{ color: COLORS.ink }}>Protège de la pluie</Text>
                <Switch value={form.waterproof} onValueChange={(v) => set('waterproof', v)} />
              </View>
              <Button title={editing ? 'Enregistrer les modifications' : 'Enregistrer la pièce'} onPress={save} />
            </View>
          )}

          <Button kind="ghost" title="Annuler" onPress={onClose} style={{ marginTop: 10 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
