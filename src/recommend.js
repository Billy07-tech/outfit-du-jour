// Moteur de recommandation : météo + style + événement + anti-répétition
// + favoris/notes + tenues « au sale » + combinaisons de pièces.
// Fichier volontairement sans dépendance pour pouvoir le tester facilement.

function dayDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

// Petit bruit stable (même jour + même tenue = même valeur) pour départager les égalités.
function jitter(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return (h % 40) / 10; // 0 à 3.9
}

// ---------- Plages de température ----------

// Plage de température réaliste selon la chaleur de la tenue (1 = short/t-shirt … 5 = grand froid).
// Sert de garde-fou si l'IA ou l'utilisateur a saisi une plage trop large.
const WARMTH_BANDS = {
  1: [20, 45],
  2: [14, 32],
  3: [8, 22],
  4: [0, 14],
  5: [-30, 8],
};

export function effectiveRange(o) {
  const band = WARMTH_BANDS[o.warmth];
  let min = o.tempMin ?? -50;
  let max = o.tempMax ?? 50;
  if (band) {
    const bMin = band[0] - 2;
    const bMax = band[1] + 2;
    const nMin = Math.max(min, bMin);
    const nMax = Math.min(max, bMax);
    if (nMin <= nMax) {
      min = nMin;
      max = nMax;
    } else {
      min = band[0];
      max = band[1];
    }
  }
  return [min, max];
}

// Au-delà de cet écart (en °C), la tenue est jugée inadaptée et n'est plus proposée.
const MAX_TEMP_GAP = 3;

// ---------- Combinaisons de pièces ----------

export const isCombo = (id) => typeof id === 'string' && id.startsWith('c|');
export const comboPieceIds = (id) => (isCombo(id) ? id.split('|').slice(1) : []);

function mostCommon(arr) {
  const c = {};
  arr.forEach((x) => x && (c[x] = (c[x] || 0) + 1));
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function makeCombo(parts) {
  const [top, bottom, shoes, jacket] = parts;
  const base = (top.warmth + bottom.warmth) / 2;
  const warmth = Math.min(5, Math.max(1, Math.round(base + (jacket ? (jacket.warmth - 1) * 0.3 : 0))));
  const list = parts.filter(Boolean);
  const styles = list.map((p) => p.style);
  // Style : deux pièces très différentes (ex. Sportswear + Classique) se marient mal.
  const clash = new Set(styles.filter(Boolean)).size - 1;
  const events = [...new Set(list.flatMap((p) => p.events || []))];
  return {
    id: 'c|' + list.map((p) => p.id).join('|'),
    name: [top.name, bottom.name, jacket?.name].filter(Boolean).join(' + '),
    parts: list,
    style: mostCommon(styles) || 'Casual',
    events,
    warmth,
    waterproof: !!jacket?.waterproof,
    isCombo: true,
    clash: Math.max(0, clash),
  };
}

// Génère les tenues possibles à partir des pièces propres.
export function buildCombos(pieces, cap = 400) {
  const ok = pieces.filter((p) => !p.dirty);
  const by = (c) => ok.filter((p) => p.category === c);
  const tops = by('Haut');
  const bottoms = by('Bas');
  const shoes = by('Chaussures');
  const jackets = by('Veste');
  if (!tops.length || !bottoms.length) return [];
  const shoeOpts = shoes.length ? shoes : [null];
  const jacketOpts = [null, ...jackets];
  const combos = [];
  for (const t of tops)
    for (const b of bottoms)
      for (const s of shoeOpts)
        for (const j of jacketOpts) combos.push(makeCombo([t, b, s, j]));
  if (combos.length <= cap) return combos;
  // Trop de combinaisons : on en garde un échantillon stable.
  return combos.sort((a, b) => jitter(a.id) - jitter(b.id) || (a.id < b.id ? -1 : 1)).slice(0, cap);
}

// Tenues complètes + combinaisons, sans ce qui est au sale.
export function allOutfits(outfits, pieces = []) {
  return [...outfits.filter((o) => !o.dirty), ...buildCombos(pieces)];
}

// ---------- Score ----------

function buildWornMap(history) {
  const m = {};
  for (const [date, id] of Object.entries(history)) (m[id] = m[id] || []).push(date);
  return m;
}

export function scoreOutfit(o, day, ctx) {
  const { prefs = {}, usedInPlan = new Set(), meta = {}, wornMap = {}, pieceLast = {} } = ctx;
  const reasons = [];
  let score = 100;

  // 1. Température ressentie (pondérée vers la journée)
  const feel = day.feelMin * 0.4 + day.feelMax * 0.6;
  const [min, max] = effectiveRange(o);
  const dist = feel < min ? min - feel : feel > max ? feel - max : 0;
  const unfit = dist > MAX_TEMP_GAP;
  if (dist === 0) reasons.push(`Adaptée à ${Math.round(feel)}°C ressentis`);
  else if (unfit) reasons.push(feel < min ? 'Trop légère pour ce temps' : 'Trop chaude pour ce temps');
  else reasons.push('Un peu limite côté température');
  score -= dist * 12;

  // 2. Pluie
  const rainy = day.rainProb >= 50 || day.precip >= 2;
  if (rainy) {
    if (o.waterproof) {
      score += 6;
      reasons.push('Protège de la pluie');
    } else {
      score -= 18;
      reasons.push('Pas imperméable (pluie prévue)');
    }
  }

  // 3. Vent fort + tenue légère
  if (day.wind >= 40 && (o.warmth ?? 3) <= 2) score -= 6;

  // 4. Préférences du moment (style / événement du jour)
  if (prefs.style) {
    if (o.style === prefs.style) {
      score += 8;
      reasons.push(`Style ${o.style}`);
    } else score -= 4;
  }
  if (prefs.event) {
    if ((o.events || []).includes(prefs.event)) {
      score += 8;
      reasons.push(`Convient pour : ${prefs.event}`);
    } else score -= 12;
  }

  // 5. Anti-répétition
  let lastGap = null;
  let recentCount = 0;
  for (const d of wornMap[o.id] || []) {
    const gap = dayDiff(d, day.date); // > 0 : portée avant ce jour
    if (gap > 0) {
      if (lastGap === null || gap < lastGap) lastGap = gap;
      if (gap <= 30) recentCount++;
    }
  }
  if (lastGap !== null && lastGap < 7) {
    score -= (7 - lastGap) * 7; // hier = -42, il y a 6 jours = -7
    reasons.push(lastGap === 1 ? 'Portée hier' : `Portée il y a ${lastGap} jours`);
  } else if (lastGap === null) {
    score += 4;
    reasons.push('Jamais portée encore');
  } else {
    reasons.push(`Pas portée depuis ${lastGap} jours`);
  }
  score -= recentCount * 2; // les tenues très portées passent un peu après

  // Une pièce déjà portée hier ou avant-hier (dans une autre combinaison) est aussi pénalisée.
  if (o.isCombo) {
    let reused = 0;
    for (const p of o.parts) {
      const last = pieceLast[p.id];
      if (last !== undefined) {
        const gap = dayDiff(last, day.date);
        if (gap > 0 && gap <= 2) reused++;
      }
    }
    if (reused) {
      score -= reused * 8;
      reasons.push(`${reused} pièce${reused > 1 ? 's' : ''} déjà portée${reused > 1 ? 's' : ''} récemment`);
    }
    if (o.clash > 0) score -= o.clash * 6;
  }

  // 6. Favoris et notes
  const m = meta[o.id];
  if (m) {
    if (m.fav) {
      score += 10;
      reasons.push('♥ Favori');
    }
    score += Math.min(m.up || 0, 3) * 3;
    score -= Math.min(m.down || 0, 3) * 8;
  }

  // 7. Une tenue ne revient pas deux fois dans la même semaine planifiée
  if (usedInPlan.has(o.id)) score -= 80;

  score += jitter(day.date + o.id);
  return { outfit: o, score, reasons, dist, unfit };
}

// Les tenues adaptées à la météo passent toujours avant les inadaptées,
// quel que soit le style, l'événement ou l'anti-répétition.
export function rankOutfits(outfits, day, ctx = {}) {
  const history = ctx.history || {};
  const wornMap = buildWornMap(history);
  // Dernière date de port de chaque pièce (via les combinaisons), avant ce jour.
  const pieceLast = {};
  for (const [date, id] of Object.entries(history)) {
    if (date >= day.date) continue;
    for (const pid of comboPieceIds(id)) if (!pieceLast[pid] || date > pieceLast[pid]) pieceLast[pid] = date;
  }
  const c = { ...ctx, wornMap, pieceLast };
  return outfits
    .filter((o) => !o.dirty)
    .map((o) => scoreOutfit(o, day, c))
    .sort((a, b) => (a.unfit - b.unfit) || b.score - a.score);
}

// Planifie les 7 jours : chaque tenue choisie est prise en compte pour les jours suivants.
// agenda : { 'YYYY-MM-DD': { event, title } } — l'événement du jour oriente le choix.
export function planWeek(outfits, days, history = {}, planned = {}, prefs = {}, agenda = {}, meta = {}) {
  const simHistory = { ...history };
  const used = new Set();
  const plan = [];
  for (const day of days) {
    const dayPrefs = { ...prefs, event: agenda[day.date]?.event || prefs.event };
    const ranked = rankOutfits(outfits, day, { history: simHistory, prefs: dayPrefs, usedInPlan: used, meta });
    const forced = planned[day.date] && outfits.find((o) => o.id === planned[day.date]);
    const pick = forced
      ? ranked.find((r) => r.outfit.id === forced.id) || ranked[0]
      : ranked[0];
    if (pick) {
      simHistory[day.date] = pick.outfit.id;
      used.add(pick.outfit.id);
    }
    plan.push({
      day,
      ranked,
      pick: pick || null,
      forced: !!forced,
      noFit: !!pick?.unfit,
      agenda: agenda[day.date] || null,
    });
  }
  return plan;
}

// Retrouve une tenue (complète ou combinaison) à partir de son id, même si elle est au sale.
export function findOutfit(id, outfits, pieces) {
  if (!id) return null;
  if (!isCombo(id)) return outfits.find((o) => o.id === id) || null;
  const parts = comboPieceIds(id).map((pid) => pieces.find((p) => p.id === pid));
  if (parts.some((p) => !p)) return null;
  const by = (c) => parts.find((p) => p.category === c) || null;
  const top = by('Haut');
  const bottom = by('Bas');
  if (!top || !bottom) return null;
  return makeCombo([top, bottom, by('Chaussures'), by('Veste')]);
}
