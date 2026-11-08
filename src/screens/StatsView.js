import React from 'react';
import { Text, View } from 'react-native';
import { COLORS } from '../constants';
import { shared } from '../components';
import { comboPieceIds, findOutfit } from '../recommend';

function Bar({ label, value, max, suffix = '' }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={[shared.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: COLORS.ink, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={shared.muted}>
          {value}
          {suffix}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.line, marginTop: 3 }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: COLORS.accent,
            width: `${Math.max(4, (value / Math.max(1, max)) * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}

export default function StatsView({ outfits, pieces, history, meta }) {
  const entries = Object.entries(history);
  if (entries.length === 0) {
    return (
      <View style={shared.card}>
        <Text style={shared.muted}>
          Pas encore de statistiques. Appuie sur « Je la porte » sur l'écran Aujourd'hui pour enregistrer ce que tu portes.
        </Text>
      </View>
    );
  }

  // Tenues portées (complètes ou composées)
  const count = {};
  const styleCount = {};
  const pieceCount = {};
  for (const [, id] of entries) {
    count[id] = (count[id] || 0) + 1;
    const o = findOutfit(id, outfits, pieces);
    if (o) styleCount[o.style] = (styleCount[o.style] || 0) + 1;
    for (const pid of comboPieceIds(id)) pieceCount[pid] = (pieceCount[pid] || 0) + 1;
  }
  const nameOf = (id) => findOutfit(id, outfits, pieces)?.name;
  const topOutfits = Object.entries(count)
    .map(([id, n]) => ({ name: nameOf(id), n }))
    .filter((x) => x.name)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const topPieces = Object.entries(pieceCount)
    .map(([id, n]) => ({ name: pieces.find((p) => p.id === id)?.name, n }))
    .filter((x) => x.name)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const styles = Object.entries(styleCount).sort((a, b) => b[1] - a[1]);
  const neverOutfits = outfits.filter((o) => !count[o.id]);
  const neverPieces = pieces.filter((p) => !pieceCount[p.id]);
  const favs = Object.entries(meta).filter(([, m]) => m.fav).length;
  const ups = Object.values(meta).reduce((s, m) => s + (m.up || 0), 0);
  const downs = Object.values(meta).reduce((s, m) => s + (m.down || 0), 0);

  return (
    <>
      <View style={shared.card}>
        <Text style={shared.h2}>Vue d'ensemble</Text>
        <Text style={[shared.muted, { marginTop: 6 }]}>
          {entries.length} jour{entries.length > 1 ? 's' : ''} enregistré{entries.length > 1 ? 's' : ''} · {outfits.length}{' '}
          tenue{outfits.length > 1 ? 's' : ''} · {pieces.length} pièce{pieces.length > 1 ? 's' : ''} · {favs} favori
          {favs > 1 ? 's' : ''}
        </Text>
        {(ups > 0 || downs > 0) && (
          <Text style={shared.muted}>
            👍 {ups} · 👎 {downs}
          </Text>
        )}
        {styles[0] && (
          <Text style={{ color: COLORS.ink, marginTop: 8 }}>
            Ton style dominant : <Text style={{ fontWeight: '700' }}>{styles[0][0]}</Text>
          </Text>
        )}
      </View>

      {topOutfits.length > 0 && (
        <View style={shared.card}>
          <Text style={[shared.h2, { marginBottom: 10 }]}>Tenues les plus portées</Text>
          {topOutfits.map((t) => (
            <Bar key={t.name} label={t.name} value={t.n} max={topOutfits[0].n} suffix="×" />
          ))}
        </View>
      )}

      {topPieces.length > 0 && (
        <View style={shared.card}>
          <Text style={[shared.h2, { marginBottom: 10 }]}>Pièces les plus portées</Text>
          {topPieces.map((t) => (
            <Bar key={t.name} label={t.name} value={t.n} max={topPieces[0].n} suffix="×" />
          ))}
        </View>
      )}

      {styles.length > 0 && (
        <View style={shared.card}>
          <Text style={[shared.h2, { marginBottom: 10 }]}>Répartition des styles</Text>
          {styles.map(([s, n]) => (
            <Bar key={s} label={s} value={n} max={styles[0][1]} suffix="×" />
          ))}
        </View>
      )}

      {(neverOutfits.length > 0 || neverPieces.length > 0) && (
        <View style={shared.card}>
          <Text style={[shared.h2, { marginBottom: 6 }]}>Jamais portées</Text>
          {neverOutfits.map((o) => (
            <Text key={o.id} style={shared.muted}>
              • {o.name}
            </Text>
          ))}
          {neverPieces.map((p) => (
            <Text key={p.id} style={shared.muted}>
              • {p.name} ({p.category.toLowerCase()})
            </Text>
          ))}
        </View>
      )}
    </>
  );
}
