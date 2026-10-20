import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Small vibrations that confirm a tap. They never throw: some phones have no vibration motor
// and the web build has none at all.
const run = (fn) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const haptics = {
  /** Switching tabs, picking an option. */
  select: () => run(() => Haptics.selectionAsync()),
  /** A normal button press that changes something. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
