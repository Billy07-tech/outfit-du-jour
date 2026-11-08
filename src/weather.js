import * as Location from 'expo-location';

// Open-Meteo : gratuit, sans clé API.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

export function describeCode(code) {
  if (code === 0) return { label: 'Ciel dégagé', emoji: '☀️' };
  if (code <= 2) return { label: 'Peu nuageux', emoji: '🌤️' };
  if (code === 3) return { label: 'Couvert', emoji: '☁️' };
  if (code === 45 || code === 48) return { label: 'Brouillard', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Bruine', emoji: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Pluie', emoji: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Neige', emoji: '🌨️' };
  if (code >= 80 && code <= 82) return { label: 'Averses', emoji: '🌧️' };
  if (code === 85 || code === 86) return { label: 'Averses de neige', emoji: '🌨️' };
  if (code >= 95) return { label: 'Orage', emoji: '⛈️' };
  return { label: 'Variable', emoji: '🌥️' };
}

export async function geocodeCity(name) {
  const res = await fetch(
    `${GEOCODE}?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`
  );
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

// Ville saisie dans les réglages, sinon position GPS.
export async function resolveLocation(settings) {
  if (settings.city?.trim()) {
    const g = await geocodeCity(settings.city.trim());
    if (g) return g;
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      let name = 'Ma position';
      try {
        const [p] = await Location.reverseGeocodeAsync(pos.coords);
        name = p?.city || p?.subregion || name;
      } catch {}
      return { lat: pos.coords.latitude, lon: pos.coords.longitude, name };
    }
  } catch {}
  return null;
}

// Renvoie 7 jours de prévisions normalisées.
export async function fetchForecast(lat, lon) {
  const daily = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'wind_speed_10m_max',
  ].join(',');
  const res = await fetch(
    `${FORECAST}?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=auto&forecast_days=7`
  );
  if (!res.ok) throw new Error('Météo indisponible');
  const { daily: d } = await res.json();
  return d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    tMax: d.temperature_2m_max[i],
    tMin: d.temperature_2m_min[i],
    feelMax: d.apparent_temperature_max[i],
    feelMin: d.apparent_temperature_min[i],
    rainProb: d.precipitation_probability_max[i] ?? 0,
    precip: d.precipitation_sum[i] ?? 0,
    wind: d.wind_speed_10m_max[i] ?? 0,
    ...describeCode(d.weather_code[i]),
  }));
}

export function weatherSummary(day) {
  return `${day.label}, ${Math.round(day.tMin)}°/${Math.round(day.tMax)}° (ressenti ${Math.round(
    day.feelMin
  )}°/${Math.round(day.feelMax)}°), pluie ${day.rainProb}%, vent ${Math.round(day.wind)} km/h`;
}

// ---------- Météo heure par heure (pour les alertes) ----------

// Renvoie les heures d'une journée donnée : [{ hour, feel, rainProb, code }]
export async function fetchHourly(lat, lon, date) {
  const res = await fetch(
    `${FORECAST}?latitude=${lat}&longitude=${lon}&hourly=apparent_temperature,precipitation_probability,weather_code&timezone=auto&start_date=${date}&end_date=${date}`
  );
  if (!res.ok) throw new Error('Météo horaire indisponible');
  const { hourly: h } = await res.json();
  return h.time.map((t, i) => ({
    hour: parseInt(t.slice(11, 13), 10),
    feel: h.apparent_temperature[i],
    rainProb: h.precipitation_probability[i] ?? 0,
    code: h.weather_code[i],
  }));
}

// Analyse une journée : fenêtre de pluie et gros écart de température entre matin et après-midi.
// Ne regarde que les heures « actives » (7h - 22h).
export function analyzeHours(hours, fromHour = 7) {
  const active = hours.filter((h) => h.hour >= Math.max(7, fromHour) && h.hour <= 22);
  const alerts = [];
  let rain = null;
  const wet = active.filter((h) => h.rainProb >= 50);
  if (wet.length) {
    rain = { from: wet[0].hour, to: wet[wet.length - 1].hour + 1 };
    alerts.push({
      kind: 'rain',
      text:
        rain.from <= Math.max(7, fromHour)
          ? `☔ Pluie probable jusqu'à ${rain.to}h : prends un imperméable`
          : `☔ Pluie probable de ${rain.from}h à ${rain.to}h : prends un imperméable`,
    });
  }
  if (active.length >= 4) {
    const morning = active.slice(0, 3);
    const rest = active.slice(3);
    const mAvg = morning.reduce((s, h) => s + h.feel, 0) / morning.length;
    const maxRest = Math.max(...rest.map((h) => h.feel));
    const minRest = Math.min(...rest.map((h) => h.feel));
    if (maxRest - mAvg >= 7) {
      alerts.push({
        kind: 'swing',
        text: `🌡️ ${Math.round(mAvg)}° le matin, jusqu'à ${Math.round(maxRest)}° l'après-midi : prévois une couche à retirer`,
      });
    } else if (mAvg - minRest >= 7) {
      alerts.push({
        kind: 'swing',
        text: `🌡️ ${Math.round(mAvg)}° le matin, ${Math.round(minRest)}° plus tard : prévois une couche en plus`,
      });
    }
  }
  return { alerts, rain };
}
