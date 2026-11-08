import { Platform } from 'react-native';

// expo-notifications n'est pas disponible dans Expo Go : on le charge de façon facultative.
// Si le module natif manque, l'app fonctionne normalement, simplement sans notifications.
let N = null;
try {
  N = require('expo-notifications');
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  N = null;
}

export const notificationsAvailable = () => !!N;

export async function ensurePermission() {
  if (!N) return false;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('outfit', {
        name: 'Tenue du jour',
        importance: N.AndroidImportance.DEFAULT,
      });
    }
    const cur = await N.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await N.requestPermissionsAsync();
    return !!req.granted;
  } catch {
    return false;
  }
}

function at(dateStr, hh, mm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return [8, 0];
  return [Math.min(23, +m[1]), Math.min(59, +m[2])];
}

async function schedule(title, body, date) {
  await N.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, channelId: 'outfit' },
  });
}

// Reprogramme toutes les notifications des 7 prochains jours.
// items : [{ date, outfitName, summary, rain: { from } | null }]
export async function scheduleAll(items, settings) {
  if (!N) return 0;
  try {
    await N.cancelAllScheduledNotificationsAsync();
    if (!settings.notifMorning && !settings.notifRain) return 0;
    if (!(await ensurePermission())) return 0;
    const now = new Date();
    const [hh, mm] = parseTime(settings.notifTime);
    let count = 0;
    for (const it of items) {
      if (settings.notifMorning && it.outfitName) {
        const when = at(it.date, hh, mm);
        if (when > now) {
          await schedule(`👕 ${it.outfitName}`, it.summary, when);
          count++;
        }
      }
      if (settings.notifRain && it.rain) {
        const when = at(it.date, Math.max(6, it.rain.from - 1), 0);
        if (when > now) {
          await schedule('☔ Pluie bientôt', `Pluie prévue vers ${it.rain.from}h : prends ton imperméable.`, when);
          count++;
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}
