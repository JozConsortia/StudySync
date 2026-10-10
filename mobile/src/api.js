import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:5000) to point at your server.
// In development we fall back to the machine running the Expo dev server, port 5000.
function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:5000`;
}

export const API_URL = resolveApiUrl();
const TOKEN_KEY = 'studysync.token';

export const tokenStore = {
  get: () => AsyncStorage.getItem(TOKEN_KEY),
  set: (token) => (token ? AsyncStorage.setItem(TOKEN_KEY, token) : AsyncStorage.removeItem(TOKEN_KEY)),
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = await tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(`Cannot reach the StudySync server at ${API_URL}. Check that it is running and on the same network.`);
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
};
