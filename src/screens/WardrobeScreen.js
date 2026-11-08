import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '../alert';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, OutfitImage, Tag, shared } from '../components';
import { CATEGORIES, COLORS, EVENTS, STYLES } from '../constants';
import {
  deleteOutfit,
  deletePiece,
  loadHistory,
  loadMeta,
  loadOutfits,
  loadPieces,
  saveOutfits,
  savePieces,
  updateMeta,
} from '../store';
import { effectiveRange } from '../recommend';
import { syncNotifications } from '../sync';
import OutfitEditor from './OutfitEditor';
import BulkOutfitImport from './BulkOutfitImport';
import PieceEditor from './PieceEditor';
import StatsView from './StatsView';

// Catégories de météo : une tenue y appartient si sa plage de température les recoupe.
const WEATHER_FILTERS = [
  { label: '❄️ Froid', min: -50, max: 8 },
  { label: '🧥 Frais', min: 8, max: 15 },
  { label: '🌤️ Doux', min: 15, max: 22 },
  { label: '☀️ Chaud', min: 22, max: 60 },
];

const EMPTY_FILTERS = { search: '', styles: [], events: [], weather: [], rain: false, fav: false, dirty: false };

function matches(o, f, meta) {
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = [o.name, o.style, o.category, ...(o.items || []), ...(o.colors || []), ...(o.events || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.styles.length && !f.styles.includes(o.style)) return false;
  if (f.events.length && !f.events.some((e) => (o.events || []).includes(e))) return false;
  if (f.weather.length) {
    const [lo, hi] = effectiveRange(o);
    const ok = f.weather.some((label) => {
      const w = WEATHER_FILTERS.find((x) => x.label === label);
      return lo < w.max && hi > w.min;
    });
    if (!ok) return false;
  }
  if (f.rain && !o.waterproof) return false;
  if (f.fav && !meta[o.id]?.fav) return false;
  if (f.dirty && !o.dirty) return false;
  return true;
}

export default function WardrobeScreen() {
  const [tab, setTab] = useState('outfits'); // outfits | pieces | stats
  const [outfits, setOutfits] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [history, setHistory] = useState({});
  const [meta, setMeta] = useState({});
  const [editor, setEditor] = useState(null); // { kind: 'outfit'|'piece', item?: ... }
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const refresh = useCallback(async () => {
    const [o, p, h, m] = await Promise.all([loadOutfits(), loadPieces(), loadHistory(), loadMeta()]);
    setOutfits(o);
    setPieces(p);
    setHistory(h);
    setMeta(m);
  }, []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const toggleIn = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));
  const activeCount =
    filters.styles.length +
    filters.events.length +
    filters.weather.length +
    (filters.rain ? 1 : 0) +
    (filters.fav ? 1 : 0) +
    (filters.dirty ? 1 : 0) +
    (filters.search.trim() ? 1 : 0);

  const source = tab === 'pieces' ? pieces : outfits;
  const visible = source.filter((o) => matches(o, filters, meta));

  const confirmDelete = (item, kind) =>
    Alert.alert(kind === 'piece' ? 'Supprimer cette pièce ?' : 'Supprimer cette tenue ?', item.name, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await (kind === 'piece' ? deletePiece(item.id) : deleteOutfit(item.id));
          await refresh();
          syncNotifications();
        },
      },
    ]);

  const toggleDirty = async (item, kind) => {
    if (kind === 'piece') await savePieces(pieces.map((p) => (p.id === item.id ? { ...p, dirty: !p.dirty } : p)));
    else await saveOutfits(outfits.map((o) => (o.id === item.id ? { ...o, dirty: !o.dirty } : o)));
    await refresh();
    syncNotifications();
  };

  const toggleFav = async (item) => {
    setMeta(await updateMeta(item.id, { fav: !meta[item.id]?.fav }));
  };

  const renderCard = (o, kind) => (
    <Pressable key={o.id} onPress={() => setEditor({ kind, item: o })} onLongPress={() => confirmDelete(o, kind)}>
      <View style={[shared.card, shared.row, { alignItems: 'flex-start', opacity: o.dirty ? 0.7 : 1 }]}>
        <OutfitImage id={o.id} style={{ width: 84, height: 108, borderRadius: 10 }} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={[shared.row, { justifyContent: 'space-between' }]}>
            <Text style={[shared.h2, { flex: 1 }]}>{o.name}</Text>
            {kind === 'outfit' && (
              <Text onPress={() => toggleFav(o)} style={{ fontSize: 24, color: COLORS.accent, paddingLeft: 8 }}>
                {meta[o.id]?.fav ? '♥' : '♡'}
              </Text>
            )}
          </View>
          <Text style={shared.muted}>
            {kind === 'piece'
              ? `${o.category} · chaleur ${o.warmth}/5`
              : `${o.tempMin}° à ${o.tempMax}° · chaleur ${o.warmth}/5`}
          </Text>
          <View style={shared.wrap}>
            <Tag label={o.style} />
            {(o.events || []).map((e) => (
              <Tag key={e} label={e} />
            ))}
            {o.waterproof && <Tag label="Imperméable" />}
          </View>
          <Pressable onPress={() => toggleDirty(o, kind)} style={{ marginTop: 8 }}>
            <Text style={{ color: o.dirty ? COLORS.accent : COLORS.muted, fontWeight: '600' }}>
              {o.dirty ? '🧺 Au sale — remettre au propre' : '✅ Propre — mettre au sale'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.pad} keyboardShouldPersistTaps="handled">
        <View style={[shared.row, { marginBottom: 12 }]}>
          {[
            ['outfits', `Tenues (${outfits.length})`],
            ['pieces', `Pièces (${pieces.length})`],
            ['stats', 'Stats'],
          ].map(([k, label]) => (
            <Chip key={k} label={label} active={tab === k} onPress={() => setTab(k)} />
          ))}
        </View>

        {tab === 'stats' ? (
          <StatsView outfits={outfits} pieces={pieces} history={history} meta={meta} />
        ) : (
          <>
            <Button
              title={tab === 'pieces' ? '＋ Ajouter une pièce' : '＋ Ajouter une tenue'}
              onPress={() => setEditor({ kind: tab === 'pieces' ? 'piece' : 'outfit' })}
              style={{ marginBottom: tab === 'pieces' ? 14 : 8 }}
            />
            {tab === 'outfits' && (
              <Button
                title="🖼️ Ajouter plusieurs tenues"
                kind="ghost"
                onPress={() => setEditor({ kind: 'bulk' })}
                style={{ marginBottom: 14 }}
              />
            )}
            {tab === 'pieces' && (
              <Text style={[shared.muted, { marginBottom: 12 }]}>
                Ajoute tes hauts, bas, chaussures et vestes séparément : l'app compose elle-même les tenues (il faut au moins un haut et un bas).
              </Text>
            )}
            {source.length === 0 && (
              <Text style={shared.muted}>
                {tab === 'pieces'
                  ? 'Aucune pièce pour le moment.'
                  : "Prends en photo une tenue que tu portes. L'IA détecte le style, les événements, la météo adaptée."}
              </Text>
            )}

            {source.length > 0 && (
              <View style={{ marginBottom: 6 }}>
                <TextInput
                  style={shared.input}
                  placeholder="🔍 Rechercher (nom, pièce, couleur…)"
                  placeholderTextColor={COLORS.muted}
                  value={filters.search}
                  onChangeText={(v) => setFilters((f) => ({ ...f, search: v }))}
                />
                <View style={[shared.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
                  <Pressable onPress={() => setShowFilters((s) => !s)}>
                    <Text style={{ color: COLORS.accent, fontWeight: '700' }}>
                      {showFilters ? '▾' : '▸'} Filtres{activeCount ? ` (${activeCount})` : ''}
                    </Text>
                  </Pressable>
                  {activeCount > 0 && (
                    <Pressable onPress={() => setFilters(EMPTY_FILTERS)}>
                      <Text style={{ color: COLORS.muted }}>Tout effacer</Text>
                    </Pressable>
                  )}
                </View>

                {showFilters && (
                  <View style={shared.card}>
                    <Text style={[shared.muted, { marginBottom: 6 }]}>Météo</Text>
                    <View style={shared.wrap}>
                      {WEATHER_FILTERS.map((w) => (
                        <Chip
                          key={w.label}
                          label={w.label}
                          active={filters.weather.includes(w.label)}
                          onPress={() => toggleIn('weather', w.label)}
                        />
                      ))}
                      <Chip
                        label="🌧️ Imperméable"
                        active={filters.rain}
                        onPress={() => setFilters((f) => ({ ...f, rain: !f.rain }))}
                      />
                    </View>
                    <Text style={[shared.muted, { marginBottom: 6 }]}>État</Text>
                    <View style={shared.wrap}>
                      {tab === 'outfits' && (
                        <Chip label="♥ Favoris" active={filters.fav} onPress={() => setFilters((f) => ({ ...f, fav: !f.fav }))} />
                      )}
                      <Chip label="🧺 Au sale" active={filters.dirty} onPress={() => setFilters((f) => ({ ...f, dirty: !f.dirty }))} />
                    </View>
                    <Text style={[shared.muted, { marginBottom: 6 }]}>Style</Text>
                    <View style={shared.wrap}>
                      {STYLES.map((s) => (
                        <Chip key={s} label={s} active={filters.styles.includes(s)} onPress={() => toggleIn('styles', s)} />
                      ))}
                    </View>
                    <Text style={[shared.muted, { marginBottom: 6 }]}>Événement</Text>
                    <View style={shared.wrap}>
                      {EVENTS.map((e) => (
                        <Chip key={e} label={e} active={filters.events.includes(e)} onPress={() => toggleIn('events', e)} />
                      ))}
                    </View>
                  </View>
                )}

                <Text style={shared.muted}>
                  {visible.length} {tab === 'pieces' ? 'pièce' : 'tenue'}
                  {visible.length > 1 ? 's' : ''}
                  {activeCount ? ` sur ${source.length}` : ''}
                </Text>
              </View>
            )}

            {source.length > 0 && visible.length === 0 && (
              <Text style={[shared.muted, { textAlign: 'center', marginVertical: 20 }]}>
                Aucun résultat pour ces filtres.
              </Text>
            )}

            {tab === 'pieces'
              ? CATEGORIES.map((c) => {
                  const list = visible.filter((p) => p.category === c);
                  if (!list.length) return null;
                  return (
                    <View key={c}>
                      <Text style={[shared.h2, { marginVertical: 8 }]}>{c}s</Text>
                      {list.map((p) => renderCard(p, 'piece'))}
                    </View>
                  );
                })
              : visible.map((o) => renderCard(o, 'outfit'))}

            {source.length > 0 && (
              <Text style={[shared.muted, { textAlign: 'center' }]}>
                Touche pour modifier · appui long pour supprimer.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <OutfitEditor
        visible={editor?.kind === 'outfit'}
        editing={editor?.kind === 'outfit' ? editor.item : null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          refresh();
          syncNotifications();
        }}
      />
      <BulkOutfitImport
        visible={editor?.kind === 'bulk'}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          refresh();
          syncNotifications();
        }}
      />
      <PieceEditor
        visible={editor?.kind === 'piece'}
        editing={editor?.kind === 'piece' ? editor.item : null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          refresh();
          syncNotifications();
        }}
      />
    </View>
  );
}
