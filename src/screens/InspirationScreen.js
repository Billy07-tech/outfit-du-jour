import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, Tag, shared } from '../components';
import { COLORS, STYLES } from '../constants';
import { loadOutfits, loadPieces, loadSettings } from '../store';
import { fetchForecast, resolveLocation, weatherSummary } from '../weather';
import { generateOutfitImage, suggestIdeas, suggestPurchases } from '../ai';
import { PinterestView, fallbackQuery } from '../pinterest';

export default function InspirationScreen() {
  const [ctx, setCtx] = useState(null);
  const [selected, setSelected] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [active, setActive] = useState(null); // index de l'idée affichée
  const [view, setView] = useState('pinterest'); // 'pinterest' | 'image'
  const [images, setImages] = useState({}); // { clé d'idée: data URI }
  const [imgBusy, setImgBusy] = useState(false);
  const [buy, setBuy] = useState(null); // { gaps, items }
  const [buyQuery, setBuyQuery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [buyBusy, setBuyBusy] = useState(false);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [settings, outfits, pieces] = await Promise.all([loadSettings(), loadOutfits(), loadPieces()]);
          const loc = await resolveLocation(settings);
          if (!loc) throw new Error('Ville introuvable. Vérifie les Réglages.');
          const days = await fetchForecast(loc.lat, loc.lon);
          setCtx({ settings, today: days[0], days, outfits, pieces });
          setSelected((prev) =>
            prev.length ? prev : settings.styles.length ? settings.styles : ['Casual', 'Streetwear']
          );
        } catch (e) {
          setError(e.message);
        }
      })();
    }, [])
  );

  const toggle = (s) => {
    setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    setIdeas([]);
    setActive(null);
    setBuyQuery(null);
  };

  const generate = async () => {
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setBuyQuery(null);
    try {
      const res = await suggestIdeas({
        styles: selected,
        weather: weatherSummary(ctx.today),
        gender: ctx.settings.gender,
      });
      setIdeas(res);
      setActive(0);
      setView('pinterest');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const climate = () => {
    const d = ctx.days;
    const min = Math.round(Math.min(...d.map((x) => x.feelMin)));
    const max = Math.round(Math.max(...d.map((x) => x.feelMax)));
    const rainy = d.filter((x) => x.rainProb >= 50).length;
    return `ressenti de ${min}° à ${max}°, ${rainy} jour${rainy > 1 ? 's' : ''} de pluie sur 7`;
  };

  const askPurchases = async () => {
    setBuyBusy(true);
    setError(null);
    try {
      const r = await suggestPurchases({
        outfits: ctx.outfits,
        pieces: ctx.pieces,
        climate: climate(),
        gender: ctx.settings.gender,
      });
      setBuy(r);
      if (r.items[0]) setBuyQuery(r.items[0].query);
    } catch (e) {
      setError(e.message);
    } finally {
      setBuyBusy(false);
    }
  };

  const current = ideas.length ? ideas[active ?? 0] : null;
  const imgKey = current ? current.title + '|' + current.style : null;

  const makeImage = async () => {
    setImgBusy(true);
    setError(null);
    try {
      const uri = await generateOutfitImage({ ...current, gender: ctx.settings.gender });
      setImages((m) => ({ ...m, [imgKey]: uri }));
    } catch (e) {
      setError(e.message);
    } finally {
      setImgBusy(false);
    }
  };

  if (!ctx && !error) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  // Sans idées générées : on affiche directement Pinterest pour le premier style choisi.
  const query =
    buyQuery ||
    current?.query ||
    (ctx && selected.length ? fallbackQuery(selected[0], ctx.today, ctx.settings.gender) : null);
  const showImage = !buyQuery && current && view === 'image';

  return (
    <ScrollView style={shared.screen} contentContainerStyle={shared.pad} nestedScrollEnabled>
      {ctx && (
        <Text style={[shared.muted, { marginBottom: 12 }]}>
          Idées adaptées à : {ctx.today.emoji} {weatherSummary(ctx.today)}
        </Text>
      )}

      <Text style={[shared.muted, { marginBottom: 6 }]}>Styles</Text>
      <View style={shared.wrap}>
        {STYLES.map((s) => (
          <Chip key={s} label={s} active={selected.includes(s)} onPress={() => toggle(s)} />
        ))}
      </View>

      <Button
        title={busy ? 'Génération…' : "✨ Générer des idées pour aujourd'hui"}
        onPress={generate}
        disabled={busy || !ctx || !selected.length}
        style={{ marginVertical: 8 }}
      />
      {busy && <ActivityIndicator color={COLORS.accent} />}
      {error && <Text style={{ color: COLORS.accent, marginVertical: 8 }}>{error}</Text>}

      {ideas.length > 0 && (
        <>
          <View style={[shared.wrap, { marginTop: 8 }]}>
            {ideas.map((idea, i) => (
              <Chip
                key={idea.title + i}
                label={idea.style}
                active={active === i && !buyQuery}
                onPress={() => {
                  setActive(i);
                  setBuyQuery(null);
                }}
              />
            ))}
          </View>
          {current && !buyQuery && (
            <View style={shared.card}>
              <Tag label={current.style} />
              <Text style={[shared.h2, { marginTop: 8 }]}>{current.title}</Text>
              <Text style={[shared.muted, { marginTop: 6 }]}>{current.description}</Text>
              <View style={[shared.row, { marginTop: 12 }]}>
                <Chip label="📌 Pinterest" active={view === 'pinterest'} onPress={() => setView('pinterest')} />
                <Chip label="🎨 Image IA" active={view === 'image'} onPress={() => setView('image')} />
              </View>
            </View>
          )}
        </>
      )}

      {showImage ? (
        <View style={shared.card}>
          {images[imgKey] ? (
            <Image source={{ uri: images[imgKey] }} style={{ width: '100%', height: 420, borderRadius: 12 }} resizeMode="cover" />
          ) : (
            <Text style={shared.muted}>Gemini peut créer une image de cette tenue.</Text>
          )}
          <Button
            kind={images[imgKey] ? 'ghost' : 'primary'}
            title={imgBusy ? 'Création de l\'image…' : images[imgKey] ? '🔄 Une autre image' : "🎨 Créer l'image"}
            onPress={makeImage}
            disabled={imgBusy}
            style={{ marginTop: 10 }}
          />
          {imgBusy && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.accent} />}
        </View>
      ) : (
        query && (
          <>
            <Text style={[shared.muted, { marginBottom: 8 }]}>📌 Pinterest : « {query} »</Text>
            <PinterestView query={query} />
            <Text style={[shared.muted, { marginTop: 8, fontSize: 12 }]}>
              Si Pinterest te demande de te connecter, connecte-toi une fois : la session reste dans l'app.
            </Text>
          </>
        )
      )}

      <View style={[shared.card, { marginTop: 18 }]}>
        <Text style={shared.h2}>🛍️ Que m'acheter ?</Text>
        <Text style={[shared.muted, { marginVertical: 6 }]}>
          L'IA repère ce qui manque dans ta garde-robe selon la météo des 7 prochains jours.
        </Text>
        <Button
          title={buyBusy ? 'Analyse…' : 'Analyser ma garde-robe'}
          onPress={askPurchases}
          disabled={buyBusy || !ctx || ctx.outfits.length + ctx.pieces.length === 0}
        />
        {ctx && ctx.outfits.length + ctx.pieces.length === 0 && (
          <Text style={[shared.muted, { marginTop: 8 }]}>Ajoute d'abord quelques tenues ou pièces.</Text>
        )}
        {buyBusy && <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.accent} />}
        {buy && (
          <View style={{ marginTop: 14 }}>
            {buy.gaps.length > 0 && (
              <>
                <Text style={{ fontWeight: '700', color: COLORS.ink, marginBottom: 4 }}>Ce qui manque</Text>
                {buy.gaps.map((g) => (
                  <Text key={g} style={shared.muted}>
                    • {g}
                  </Text>
                ))}
              </>
            )}
            <Text style={{ fontWeight: '700', color: COLORS.ink, marginTop: 12, marginBottom: 6 }}>À acheter</Text>
            {buy.items.map((it) => (
              <View key={it.item} style={{ marginBottom: 10 }}>
                <Text style={{ color: COLORS.ink, fontWeight: '600' }}>{it.item}</Text>
                <Text style={shared.muted}>{it.why}</Text>
                <View style={[shared.row, { marginTop: 6 }]}>
                  <Chip label="📌 Voir comment la porter" active={buyQuery === it.query} onPress={() => setBuyQuery(it.query)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
