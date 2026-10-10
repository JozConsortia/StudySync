import AsyncStorage from '@react-native-async-storage/async-storage';

// Earlier versions kept history and saved answers on the phone only. On first sign-in after
// the upgrade they are uploaded to the user's account, then removed from the phone.

const keys = (userId) => ({ history: `studysync.history.${userId}`, saved: `studysync.saved.${userId}` });

async function read(key) {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(key)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function readLegacyData(userId) {
  const k = keys(userId);
  return { history: await read(k.history), saved: await read(k.saved) };
}

export function clearLegacyData(userId) {
  const k = keys(userId);
  return AsyncStorage.multiRemove([k.history, k.saved]).catch(() => {});
}
