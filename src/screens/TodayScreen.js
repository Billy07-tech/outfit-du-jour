import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, OutfitVisual, Tag, shared } from '../components';
import { COLORS, EVENTS, STYLES } from '../constants';
import {
  loadAgenda,
  loadHistory,
  loadMeta,
  loadOutfits,
  loadPieces,
  loadPlanned,
  loadSettings,
  saveHistory,
  setOutfitDirty,
  updateMeta,
} from '../store';
import { analyzeHours, fetchForecast, fetchHourly, resolveLocation } from '../weather';
import { allOutfits, findOutfit, rankOutfits } from '../recommend';
import { syncNotifications } from '../sync';

export default function TodayScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [prefs, setPrefs] = useState({ style: null, event: undefined });
  const [rated, setRated] = useState(null); // 'up' | 'down' pour la tenue portée aujourd'hui

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
    setLoading(true);
    setError(null);
    try {
      const local = await readLocal();
      // Met à jour tout de suite la garde-robe (sans attendre la météo) :
      // une tenue supprimée ou mise au sale disparaît immédiatement des propositions.
      setData((prev) => (prev ? { ...prev, ...local } : prev));
      const loc = await resolveLocation(local.settings);
      if (!loc) throw new Error('Ville introuvable. Autorise la localisation ou saisis ta ville dans Réglages.');
      const days = await fetchForecast(loc.lat, loc.lon);
      let hourly = { alerts: [] };
      try {
        hourly = analyzeHours(await fetchHourly(loc.lat, loc.lon, days[0].date), new Date().getHours());
      } catch {}
      setData({ ...local, loc, days, alerts: hourly.alerts });
      setIdx(0);
    } catch (e) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const today = data?.days?.[0];
  const agendaToday = data?.agenda?.[today?.date] || null;
  const effEvent = prefs.event === undefined ? agendaToday?.event || null : prefs.event;

  const options = useMemo(() => {
    if (!data) return [];
    // On ignore la tenue « portée aujourd'hui » dans le calcul d'anti-répétition.
    const history = { ...data.history };
    delete history[today.date];
    const ranked = rankOutfits(allOutfits(data.outfits, data.pieces), today, {
      history,
      prefs: { style: prefs.style, event: effEvent },
      meta: data.meta,
    });
    const plannedId = data.planned[today.date];
    if (plannedId && !prefs.style && prefs.event === undefined) {
      const i = ranked.findIndex((r) => r.outfit.id === plannedId);
      if (i > 0) ranked.unshift(ranked.splice(i, 1)[0]);
    }
    return ranked;
  }, [data, prefs, today, effEvent]);

  const wear = async (outfit) => {
    const prevId = data.history[today.date];
    const history = { ...data.history, [today.date]: outfit.id };
    await saveHistory(history);
    if (data.settings.autoDirty) {
      if (prevId && prevId !== outfit.id) {
        await setOutfitDirty(findOutfit(prevId, data.outfits, data.pieces), false);
      }
      await setOutfitDirty(outfit, true);
    }
    setRated(null);
    const local = await readLocal();
    setData({ ...data, ...local });
    syncNotifications();
  };

  const toggleFav = async (outfit) => {
    const cur = data.meta[outfit.id]?.fav;
    const meta = await updateMeta(outfit.id, { fav: !cur });
    setData({ ...data, meta });
  };

  const rate = async (outfit, kind) => {
    if (rated) return;
    const meta = await updateMeta(outfit.id, (c) => ({ [kind]: (c[kind] || 0) + 1 }));
    setRated(kind);
    setData({ ...data, meta });
  };

  if (loading && !data) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={[shared.muted, { marginTop: 10 }]}>Récupération de la météo…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[shared.screen, shared.pad]}>
        <View style={shared.card}>
          <Text style={shared.h2}>Oups</Text>
          <Text style={[shared.muted, { marginVertical: 10 }]}>{error}</Text>
          <Button title="Réessayer" onPress={load} />
        </View>
      </View>
    );
  }

  const wornId = data.history[today.date];
  const worn = findOutfit(wornId, data.outfits, data.pieces);
  const totalCount = data.outfits.length + data.pieces.length;

  // On ne propose que les tenues adaptées à la météo ; si aucune ne l'est, on prévient.
  const fitOptions = options.filter((r) => !r.unfit || r.outfit.id === data.planned[today.date]);
  const noFit = options.length > 0 && fitOptions.length === 0;
  const list = noFit ? options : fitOptions;
  const current = list.length ? list[idx % list.length] : null;
  const cm = current ? data.meta[current.outfit.id] || {} : {};

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={shared.pad}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.accent} />}
    >
      <View style={shared.card}>
        <Text style={shared.muted}>{data.loc.name}</Text>
        <View style={[shared.row, { marginTop: 4 }]}>
          <Text style={{ fontSize: 44, marginRight: 12 }}>{today.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={shared.h1}>
              {Math.round(today.tMin)}° / {Math.round(today.tMax)}°
            </Text>
            <Text style={shared.muted}>
              {today.label} · ressenti {Math.round(today.feelMin)}°/{Math.round(today.feelMax)}° · pluie {today.rainProb}%
            </Text>
          </View>
        </View>
        {agendaToday && (
          <Text style={{ marginTop: 10, color: COLORS.ink }}>
            📅 {agendaToday.event}
            {agendaToday.title ? ` — ${agendaToday.title}` : ''}
          </Text>
        )}
      </View>

      {data.alerts?.length > 0 && (
        <View style={[shared.card, { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent }]}>
          {data.alerts.map((a) => (
            <Text key={a.text} style={{ color: COLORS.ink, marginVertical: 2 }}>
              {a.text}
            </Text>
          ))}
        </View>
      )}

      {totalCount === 0 ? (
        <View style={shared.card}>
          <Text style={shared.h2}>Ta garde-robe est vide</Text>
          <Text style={[shared.muted, { marginTop: 6 }]}>
            Ajoute des tenues (ou des pièces à combiner) dans l'onglet Garde-robe : l'IA les analysera et je te proposerai la bonne chaque jour.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[shared.h2, { marginBottom: 8 }]}>Pour toi aujourd'hui</Text>

          {worn && (
            <View style={[shared.card, { borderColor: COLORS.good }]}>
              <Text style={{ color: COLORS.good, fontWeight: '700' }}>✓ Tu portes : {worn.name}</Text>
              <View style={[shared.row, { marginTop: 10 }]}>
                <Text style={[shared.muted, { marginRight: 10 }]}>Tu l'as aimée ?</Text>
                <Chip label="👍" active={rated === 'up'} onPress={() => rate(worn, 'up')} />
                <Chip label="👎" active={rated === 'down'} onPress={() => rate(worn, 'down')} />
              </View>
              {data.settings.autoDirty && <Text style={shared.muted}>🧺 Mise au sale automatiquement.</Text>}
            </View>
          )}

          {noFit && (
            <View style={[shared.card, { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft }]}>
              <Text style={{ color: COLORS.accent, fontWeight: '700' }}>
                Aucune de tes tenues ne convient vraiment à ce temps.
              </Text>
              <Text style={shared.muted}>
                Ajoute une tenue plus {today.feelMax < 14 ? 'chaude' : 'légère'} dans ta garde-robe. En attendant, voici la moins mauvaise.
              </Text>
            </View>
          )}

          {!current && options.length === 0 && (
            <View style={shared.card}>
              <Text style={shared.muted}>
                Toutes tes tenues sont au sale (ou il manque des hauts/bas pour composer des tenues). Remets-en une au propre dans la garde-robe.
              </Text>
            </View>
          )}

          {current && (
            <View style={shared.card}>
              <OutfitVisual outfit={current.outfit} style={{ width: '100%', height: 300, borderRadius: 12 }} />
              <View style={[shared.row, { marginTop: 12, justifyContent: 'space-between' }]}>
                <Text style={[shared.h2, { flex: 1 }]}>{current.outfit.name}</Text>
                <Text onPress={() => toggleFav(current.outfit)} style={{ fontSize: 26, color: COLORS.accent, paddingLeft: 10 }}>
                  {cm.fav ? '♥' : '♡'}
                </Text>
              </View>
              <View style={shared.wrap}>
                <Tag label={current.outfit.style} />
                {(current.outfit.events || []).map((e) => (
                  <Tag key={e} label={e} />
                ))}
                {current.outfit.waterproof && <Tag label="Imperméable" />}
                {current.outfit.isCombo && <Tag label="Composée" />}
              </View>
              <View style={{ marginTop: 10 }}>
                {current.reasons.map((r) => (
                  <Text key={r} style={shared.muted}>
                    • {r}
                  </Text>
                ))}
              </View>
              <View style={[shared.row, { marginTop: 14 }]}>
                <Button title="Je la porte" onPress={() => wear(current.outfit)} style={{ flex: 1, marginRight: 8 }} />
                <Button title="Autre idée" kind="ghost" onPress={() => setIdx(idx + 1)} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <Text style={[shared.muted, { marginBottom: 6 }]}>Style</Text>
          <View style={shared.wrap}>
            {STYLES.map((s) => (
              <Chip
                key={s}
                label={s}
                active={prefs.style === s}
                onPress={() => {
                  setPrefs({ ...prefs, style: prefs.style === s ? null : s });
                  setIdx(0);
                }}
              />
            ))}
          </View>
          <Text style={[shared.muted, { marginBottom: 6 }]}>Événement{agendaToday && prefs.event === undefined ? ' (agenda)' : ''}</Text>
          <View style={shared.wrap}>
            {EVENTS.map((e) => (
              <Chip
                key={e}
                label={e}
                active={effEvent === e}
                onPress={() => {
                  setPrefs({ ...prefs, event: effEvent === e ? null : e });
                  setIdx(0);
                }}
              />
            ))}
          </View>
        </>
      )}

      <Button
        kind="ghost"
        title="📌 Voir les inspirations du jour"
        style={{ marginTop: 8 }}
        onPress={() => navigation.navigate('Inspiration')}
      />
    </ScrollView>
  );
}
