import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const K = {
  outfits: 'outfits_v1',
  pieces: 'pieces_v1', // pièces séparées (haut, bas, chaussures, veste)
  history: 'history_v1', // { 'YYYY-MM-DD': outfitId } tenues réellement portées
  planned: 'planned_v1', // { 'YYYY-MM-DD': outfitId } choix manuels pour la semaine
  agenda: 'agenda_v1', // { 'YYYY-MM-DD': { event, title } }
  meta: 'meta_v1', // { [outfitId]: { fav, up, down } }
  settings: 'settings_v1',
};

const DEFAULT_SETTINGS = {
  city: '', // vide = position GPS
  gender: '', // utilisé pour les recherches Pinterest (ex: homme, femme)
  styles: [], // styles préférés pour les inspirations (vide = tous)
  notifMorning: true, // notification de la tenue du jour
  notifTime: '08:00', // heure de la notification
  notifRain: true, // alerte pluie
  autoDirty: true, // met la tenue au sale après port
};

async function getJSON(key, fallback) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

const setJSON = (key, value) => AsyncStorage.setItem(key, JSON.stringify(value));

export const loadOutfits = () => getJSON(K.outfits, []);
export const saveOutfits = (outfits) => setJSON(K.outfits, outfits);

export const loadPieces = () => getJSON(K.pieces, []);
export const savePieces = (pieces) => setJSON(K.pieces, pieces);

export const loadHistory = () => getJSON(K.history, {});
export const saveHistory = (h) => setJSON(K.history, h);

export const loadPlanned = () => getJSON(K.planned, {});
export const savePlanned = (p) => setJSON(K.planned, p);

export const loadAgenda = () => getJSON(K.agenda, {});
export const saveAgenda = (a) => setJSON(K.agenda, a);

export const loadMeta = () => getJSON(K.meta, {});
export const saveMeta = (m) => setJSON(K.meta, m);

export async function loadSettings() {
  const s = await getJSON(K.settings, {});
  return { ...DEFAULT_SETTINGS, ...s };
}
export const saveSettings = (s) => setJSON(K.settings, s);

// Les photos sont stockées à part (data URI réduite) pour garder la liste légère.
export const loadPhoto = (id) => AsyncStorage.getItem('photo:' + id);
export const savePhoto = (id, dataUri) => AsyncStorage.setItem('photo:' + id, dataUri);

const dropValue = (map, id) =>
  Object.fromEntries(
    Object.entries(map).filter(([, v]) => v !== id && !(typeof v === 'string' && v.split('|').includes(id)))
  );

export async function deleteOutfit(id) {
  const [outfits, history, planned, meta] = await Promise.all([
    loadOutfits(),
    loadHistory(),
    loadPlanned(),
    loadMeta(),
  ]);
  await saveOutfits(outfits.filter((o) => o.id !== id));
  await saveHistory(dropValue(history, id));
  await savePlanned(dropValue(planned, id));
  const { [id]: _gone, ...restMeta } = meta;
  await saveMeta(restMeta);
  await AsyncStorage.removeItem('photo:' + id);
}

// Supprimer une pièce retire aussi toutes les combinaisons qui l'utilisent
// (les ids de combinaisons contiennent les ids des pièces).
export async function deletePiece(id) {
  const [pieces, history, planned, meta] = await Promise.all([
    loadPieces(),
    loadHistory(),
    loadPlanned(),
    loadMeta(),
  ]);
  await savePieces(pieces.filter((p) => p.id !== id));
  await saveHistory(dropValue(history, id));
  await savePlanned(dropValue(planned, id));
  const keep = Object.fromEntries(Object.entries(meta).filter(([k]) => !k.split('|').includes(id)));
  await saveMeta(keep);
  await AsyncStorage.removeItem('photo:' + id);
}

// Mise à jour d'un favori / d'une note.
export async function updateMeta(id, patch) {
  const meta = await loadMeta();
  const cur = meta[id] || { fav: false, up: 0, down: 0 };
  const next = { ...meta, [id]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
  await saveMeta(next);
  return next;
}

// La clé API reste dans le stockage sécurisé du téléphone.
// Sur le web, SecureStore n'existe pas : la clé est gardée dans le stockage du navigateur.
export const getApiKey = () =>
  Platform.OS === 'web' ? AsyncStorage.getItem('gemini_key') : SecureStore.getItemAsync('gemini_key');
export const setApiKey = (key) =>
  Platform.OS === 'web'
    ? key
      ? AsyncStorage.setItem('gemini_key', key)
      : AsyncStorage.removeItem('gemini_key')
    : key
      ? SecureStore.setItemAsync('gemini_key', key)
      : SecureStore.deleteItemAsync('gemini_key');

// Met une tenue (ou ses pièces principales, pour une combinaison) au sale / propre.
export async function setOutfitDirty(outfit, dirty) {
  if (!outfit) return;
  if (outfit.parts) {
    const ids = outfit.parts
      .filter((p) => p.category === 'Haut' || p.category === 'Bas')
      .map((p) => p.id);
    const pieces = await loadPieces();
    await savePieces(pieces.map((p) => (ids.includes(p.id) ? { ...p, dirty } : p)));
  } else {
    const outfits = await loadOutfits();
    await saveOutfits(outfits.map((o) => (o.id === outfit.id ? { ...o, dirty } : o)));
  }
}
