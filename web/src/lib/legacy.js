// Earlier versions kept history and saved answers in this browser only. On first sign-in
// after the upgrade they are uploaded to the user's account, then removed from the browser.

const keys = (userId) => ({ history: `studysync.history.${userId}`, saved: `studysync.saved.${userId}` });

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function readLegacyData(userId) {
  const k = keys(userId);
  return { history: read(k.history), saved: read(k.saved) };
}

export function clearLegacyData(userId) {
  const k = keys(userId);
  try {
    localStorage.removeItem(k.history);
    localStorage.removeItem(k.saved);
  } catch {
    /* storage unavailable */
  }
}
