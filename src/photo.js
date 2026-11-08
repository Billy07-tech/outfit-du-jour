import { Alert } from './alert';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Prend ou choisit une photo, la réduit (pour l'IA et le stockage local) et renvoie { uri, base64 }.
export async function pickPhoto(source) {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Accès refusé', source === 'camera' ? 'Autorise la caméra dans les réglages.' : "Autorise l'accès aux photos dans les réglages.");
    return null;
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.length) return null;
  return shrink(result.assets[0].uri);
}

// Choisit plusieurs photos dans la galerie d'un coup et renvoie [{ uri, base64 }].
export async function pickPhotos(limit = 20) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Accès refusé', "Autorise l'accès aux photos dans les réglages.");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out = [];
  for (const a of result.assets.slice(0, limit)) out.push(await shrink(a.uri));
  return out;
}

// Réduit la photo (pour l'IA et le stockage local).
async function shrink(uri) {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return { uri: out.uri, base64: out.base64 };
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
