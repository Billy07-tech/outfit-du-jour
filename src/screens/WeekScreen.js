import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, OutfitVisual, shared } from '../components';
import { COLORS, EVENTS } from '../constants';
import {
  loadAgenda,
  loadHistory,
  loadMeta,
  loadOutfits,
  loadPieces,
  loadPlanned,
  loadSettings,
  saveAgenda,
  savePlanned,
} from '../store';
import { fetchForecast, resolveLocation } from '../weather';
import { allOutfits, planWeek } from '../recommend';
import { syncNotifications } from '../sync';

const dayName = (iso) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

export default function WeekScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editingDate, setEditingDate] = useState(null);
  const [title, setTitle] = useState('');

  const readLocal = async () => {
    const [outfits, pieces, history, planned, agenda, meta, settings] = await Promise.all([
      loadOutfits(),
      loadPieces(),
      loadHistory(),
      loadPlanned(),
      loadAgenda(),
      loadMeta(),
      loadSettings(),
    ]);
    return { outfits, pieces, history, planned, agenda, meta, settings };
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const local = await readLocal();
      // Met à jour tout de suite la garde-robe (sans attendre la météo).
      setData((prev) => (prev ? { ...prev, ...local } : prev));
      const loc = await resolveLocation(local.settings);
      if (!loc) throw new Error('Ville introuvable. Vérifie les Réglages.');
      const days = await fetchForecast(loc.lat, loc.lon);
      // On nettoie les choix manuels et événements des jours passés.
      const from = days[0].date;
      const planned = Object.fromEntries(Object.entries(local.planned).filter(([d]) => d >= from));
      const agenda = Object.fromEntries(Object.entries(local.agenda).filter(([d]) => d >= from));
      setData({ ...local, planned, agenda, days });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const everything = useMemo(() => (data ? allOutfits(data.outfits, data.pieces) : []), [data]);
  const plan = useMemo(
    () => (data?.days ? planWeek(everything, data.days, data.history, data.planned, {}, data.agenda, data.meta) : []),
    [data, everything]
  );
  const editing = plan.find((p) => p.day.date === editingDate) || null;

  const openDay = (p) => {
    setEditingDate(p.day.date);
    setTitle(data.agenda[p.day.date]?.title || '');
  };

  const choose = async (date, outfitId) => {
    const planned = { ...data.planned };
    if (outfitId) planned[date] = outfitId;
    else delete planned[date];
    await savePlanned(planned);
    setData({ ...data, planned });
    syncNotifications();
  };

  const setEvent = async (date, event, newTitle) => {
    const agenda = { ...data.agenda };
    if (event) agenda[date] = { event, title: (newTitle ?? title).trim() };
    else delete agenda[date];
    await saveAgenda(agenda);
    setData({ ...data, agenda });
    syncNotifications();
  };

  if (error) {
    return (
      <View style={[shared.screen, shared.pad]}>
        <View style={shared.card}>
          <Text style={shared.muted}>{error}</Text>
          <Button title="Réessayer" onPress={load} style={{ marginTop: 10 }} />
        </View>
      </View>
    );
  }
  if (!data?.days) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (data.outfits.length + data.pieces.length === 0) {
    return (
      <View style={[shared.screen, shared.pad]}>
        <View style={shared.card}>
          <Text style={shared.muted}>Ajoute des tenues ou des pièces dans ta garde-robe pour voir ta semaine.</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={shared.screen} contentContainerStyle={shared.pad}>
        <Text style={[shared.muted, { marginBottom: 12 }]}>
          Chaque tenue ne revient qu'une fois dans la semaine quand c'est possible. Touche un jour pour changer la tenue ou ajouter un événement (réunion, soirée…).
        </Text>
        {plan.map((p) => {
          const { day, pick, forced, noFit, agenda } = p;
          return (
            <Pressable key={day.date} onPress={() => openDay(p)}>
              <View style={[shared.card, shared.row]}>
                {pick ? (
                  <OutfitVisual outfit={pick.outfit} style={{ width: 74, height: 96, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 74, height: 96, borderRadius: 10, backgroundColor: COLORS.line }} />
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.ink, textTransform: 'capitalize' }}>
                    {dayName(day.date)}
                  </Text>
                  <Text style={shared.muted}>
                    {day.emoji} {Math.round(day.tMin)}°/{Math.round(day.tMax)}° · 💧 {day.rainProb}%
                  </Text>
                  {agenda && (
                    <Text style={{ color: COLORS.ink, fontSize: 13, marginTop: 2 }}>
                      📅 {agenda.event}
                      {agenda.title ? ` — ${agenda.title}` : ''}
                    </Text>
                  )}
                  <Text style={{ marginTop: 6, color: COLORS.ink, fontSize: 15 }}>{pick ? pick.outfit.name : '—'}</Text>
                  {forced && <Text style={{ color: COLORS.accent, fontSize: 12 }}>Choisie par toi</Text>}
                  {noFit && (
                    <Text style={{ color: COLORS.accent, fontSize: 12 }}>⚠️ Aucune tenue adaptée à ce temps</Text>
                  )}
                </View>
                <Text style={{ color: COLORS.muted, fontSize: 20 }}>›</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditingDate(null)}>
        <View style={[shared.screen, { paddingTop: 50 }]}>
          <ScrollView contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
            {editing && (
              <>
                <Text style={[shared.h1, { textTransform: 'capitalize' }]}>{dayName(editing.day.date)}</Text>
                <Text style={[shared.muted, { marginBottom: 14 }]}>
                  {editing.day.emoji} {editing.day.label} · {Math.round(editing.day.tMin)}°/
                  {Math.round(editing.day.tMax)}° · pluie {editing.day.rainProb}%
                </Text>

                <View style={shared.card}>
                  <Text style={[shared.h2, { marginBottom: 8 }]}>📅 Événement</Text>
                  <View style={shared.wrap}>
                    {EVENTS.map((e) => (
                      <Chip
                        key={e}
                        label={e}
                        active={editing.agenda?.event === e}
                        onPress={() => setEvent(editing.day.date, editing.agenda?.event === e ? null : e)}
                      />
                    ))}
                  </View>
                  {editing.agenda && (
                    <TextInput
                      style={shared.input}
                      placeholder="Précision (ex : réunion client)"
                      placeholderTextColor={COLORS.muted}
                      value={title}
                      onChangeText={setTitle}
                      onEndEditing={() => setEvent(editing.day.date, editing.agenda.event, title)}
                    />
                  )}
                </View>

                <Text style={[shared.h2, { marginBottom: 8 }]}>Tenue</Text>
                {editing.ranked.slice(0, 6).map((r) => (
                  <Pressable key={r.outfit.id} onPress={() => choose(editing.day.date, r.outfit.id)}>
                    <View
                      style={[
                        shared.card,
                        shared.row,
                        editing.pick?.outfit.id === r.outfit.id && { borderColor: COLORS.accent },
                      ]}
                    >
                      <OutfitVisual outfit={r.outfit} style={{ width: 60, height: 76, borderRadius: 8 }} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontWeight: '700', color: COLORS.ink }}>{r.outfit.name}</Text>
                        <Text style={shared.muted}>{r.reasons.slice(0, 2).join(' · ')}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
                {editing.forced && (
                  <Button
                    kind="ghost"
                    title="Revenir au choix automatique"
                    onPress={() => choose(editing.day.date, null)}
                    style={{ marginBottom: 10 }}
                  />
                )}
                <Button kind="ghost" title="Fermer" onPress={() => setEditingDate(null)} />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
