import {
  loadAgenda,
  loadHistory,
  loadMeta,
  loadOutfits,
  loadPieces,
  loadPlanned,
  loadSettings,
} from './store';
import { fetchForecast, fetchHourly, analyzeHours, resolveLocation, weatherSummary } from './weather';
import { allOutfits, planWeek } from './recommend';
import { scheduleAll } from './notifications';

// Recalcule la semaine et reprogramme les notifications (tenue du matin + alerte pluie).
// Appelée au lancement de l'app, au retour au premier plan et après un changement de réglages.
let running = false;
export async function syncNotifications() {
  if (running) return;
  running = true;
  try {
    const [outfits, pieces, history, planned, agenda, meta, settings] = await Promise.all([
      loadOutfits(),
      loadPieces(),
      loadHistory(),
      loadPlanned(),
      loadAgenda(),
      loadMeta(),
      loadSettings(),
    ]);
    const loc = await resolveLocation(settings);
    if (!loc) return;
    const days = await fetchForecast(loc.lat, loc.lon);
    const plan = planWeek(allOutfits(outfits, pieces), days, history, planned, {}, agenda, meta);

    const items = [];
    for (const p of plan) {
      let rain = null;
      if (settings.notifRain) {
        try {
          rain = analyzeHours(await fetchHourly(loc.lat, loc.lon, p.day.date)).rain;
        } catch {}
      }
      items.push({
        date: p.day.date,
        outfitName: p.pick ? p.pick.outfit.name : null,
        summary: `${p.day.emoji} ${weatherSummary(p.day)}`,
        rain,
      });
    }
    await scheduleAll(items, settings);
  } catch {
    // silencieux : les notifications sont un bonus
  } finally {
    running = false;
  }
}
