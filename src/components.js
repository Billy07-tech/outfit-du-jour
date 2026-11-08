import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from './constants';
import { loadPhoto } from './store';

const cache = new Map();

export function OutfitImage({ id, style }) {
  const [uri, setUri] = useState(cache.get(id) || null);
  useEffect(() => {
    let alive = true;
    // Quand l'id change (« Autre idée »), on remet à jour l'image, y compris depuis le cache.
    if (cache.has(id)) {
      setUri(cache.get(id));
    } else {
      setUri(null);
      loadPhoto(id).then((u) => {
        if (u) cache.set(id, u);
        if (alive) setUri(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [id]);
  if (!uri) {
    return (
      <View style={[{ backgroundColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontSize: 28 }}>👕</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

// Affiche une tenue : sa photo, ou une mosaïque des pièces pour une combinaison.
export function OutfitVisual({ outfit, style }) {
  if (!outfit?.parts) return <OutfitImage key={outfit?.id} id={outfit?.id} style={style} />;
  const parts = outfit.parts.slice(0, 4);
  const flat = StyleSheet.flatten(style) || {};
  const gap = 3;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap, overflow: 'hidden', backgroundColor: COLORS.line }, flat]}>
      {parts.map((p) => (
        <View key={p.id} style={{ width: parts.length === 1 ? '100%' : '49%', height: parts.length <= 2 ? '100%' : '49%' }}>
          <OutfitImage id={p.id} style={{ width: '100%', height: '100%' }} />
        </View>
      ))}
    </View>
  );
}

export function setPhotoCache(id, uri) {
  cache.set(id, uri);
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        kind === 'ghost' && styles.btnGhost,
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <Text style={[styles.btnText, kind === 'ghost' && { color: COLORS.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function Tag({ label }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  h1: { fontSize: 26, fontWeight: '700', color: COLORS.ink },
  h2: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  muted: { color: COLORS.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.ink,
    marginBottom: 10,
  },
});

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.card,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { color: COLORS.ink, fontSize: 14 },
  chipTextActive: { color: '#fff' },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  btnGhost: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tag: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginTop: 6,
  },
  tagText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
});
