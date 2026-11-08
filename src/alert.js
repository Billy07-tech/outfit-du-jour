import { Alert as RNAlert, Platform } from 'react-native';

// Sur le web, Alert.alert de React Native ne fait rien : on utilise les boîtes du navigateur.
export const Alert = {
  alert(title, message, buttons) {
    if (Platform.OS !== 'web') return RNAlert.alert(title, message, buttons);
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons || [];
    if (list.length > 1) {
      // Confirmation : le bouton « annuler » = Annuler, l'autre = action.
      const action = list.find((b) => b.style !== 'cancel') || list[list.length - 1];
      if (window.confirm(text)) action.onPress?.();
      else list.find((b) => b.style === 'cancel')?.onPress?.();
    } else {
      window.alert(text);
      list[0]?.onPress?.();
    }
  },
};
