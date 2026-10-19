import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:5000) to point at your server.
// In development we fall back to the machine running the Expo dev server, port 5000.
// An installed app (APK) has no dev server, so students can also set the address on the sign-in screen;
// that choice is kept on the phone and wins over both.
function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:5000` : '';
}

const DEFAULT_API_URL = resolveApiUrl();
const TOKEN_KEY = 'studysync.token';
const SERVER_KEY = 'studysync.server';

let apiUrl = DEFAULT_API_URL;
const serverLoaded = AsyncStorage.getItem(SERVER_KEY)
  .then((stored) => {
    if (stored) apiUrl = stored;
  })
  .catch(() => {});

// "192.168.1.20" -> "http://192.168.1.20:5000"; full URLs (https://studysync.example.com) are kept as typed.
export function normalizeServerUrl(input) {
  let url = String(input || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
    if (!/:\d+$/.test(url)) url += ':5000';
  }
  return url;
}

export const serverStore = {
  get: async () => {
    await serverLoaded;
    return apiUrl;
  },
  // An empty address goes back to the default (EXPO_PUBLIC_API_URL or the Expo dev machine).
  set: async (url) => {
    await serverLoaded;
    apiUrl = normalizeServerUrl(url) || DEFAULT_API_URL;
    if (apiUrl && apiUrl !== DEFAULT_API_URL) await AsyncStorage.setItem(SERVER_KEY, apiUrl);
    else await AsyncStorage.removeItem(SERVER_KEY);
    return apiUrl;
  },
  // Resolves if a StudySync server answers at `url`, otherwise throws a readable error.
  check: async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${url}/api/health`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.status) throw new Error('Not a StudySync server');
    } catch {
      throw new Error(`No StudySync server answered at ${url}. Check the address and that the phone is on the same Wi-Fi.`);
    } finally {
      clearTimeout(timer);
    }
  },
};

export const tokenStore = {
  get: () => AsyncStorage.getItem(TOKEN_KEY),
  set: (token) => (token ? AsyncStorage.setItem(TOKEN_KEY, token) : AsyncStorage.removeItem(TOKEN_KEY)),
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = await tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const base = await serverStore.get();
  if (!base) throw new Error('Set the StudySync server address first: tap Server below the sign-in form.');

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(`Cannot reach the StudySync server at ${base}. Check that it is running and on the same network.`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (fullName, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { fullName, email, password } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (email, code, password) =>
    request('/api/auth/reset-password', { method: 'POST', body: { email, code, password } }),

  // Daily challenges. day is the phone's local date (YYYY-MM-DD), so a new set starts at local midnight.
  challenges: {
    today: (day) => request(`/api/challenges/today?day=${day}`),
    stats: (day) => request(`/api/challenges/stats?day=${day}`).then((d) => d.stats),
    answer: (day, itemId, { choice, answer }) =>
      request(`/api/challenges/${day}/answer`, { method: 'POST', body: { itemId, choice, answer } }),
  },

  // History and saved answers are stored in the database, linked to the signed-in user.
  history: {
    list: () => request('/api/history').then((d) => d.history),
    put: (id, session) => request(`/api/history/${encodeURIComponent(id)}`, { method: 'PUT', body: session }),
    remove: (id) => request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    clear: () => request('/api/history', { method: 'DELETE' }),
  },
  saved: {
    list: () => request('/api/saved').then((d) => d.saved),
    add: (item) => request('/api/saved', { method: 'POST', body: item }),
    remove: (key) => request(`/api/saved?key=${encodeURIComponent(key)}`, { method: 'DELETE' }),
  },

  // file: { uri, name, mimeType }
  extract: (file) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType });
    return request('/api/papers/extract', { method: 'POST', form });
  },
  // file: { uri, name, mimeType } of a recorded spoken question
  transcribe: (file) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType });
    return request('/api/papers/transcribe', { method: 'POST', form });
  },
  solve: (question, subject, context) =>
    request('/api/papers/solve', {
      method: 'POST',
      body: { text: question.text, marks: question.marks, subject, context },
    }),
  // A follow-up question about a solved question; history is the earlier follow-ups (toFollowupsPayload).
  followup: (question, subject, history, message) =>
    request('/api/papers/followup', {
      method: 'POST',
      body: { question: question.text, subject, solution: question.solution, history, message },
    }),
};
