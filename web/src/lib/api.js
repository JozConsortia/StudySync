// Every app (web, desktop, mobile) talks to the same API, so a student's history and saved answers
// follow them across devices. VITE_API_URL overrides the address. Otherwise, when the web app is opened
// from another device (e.g. http://10.30.19.185:5173 on a phone), the API is on that same machine at
// port 5000; the desktop app (loaded from a file) uses this computer.
function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const { protocol, hostname } = window.location;
  if (protocol === "http:" || protocol === "https:") return `${protocol}//${hostname}:5000`;
  return "http://localhost:5000";
}

export const API_URL = resolveApiUrl().replace(/\/$/, "");

const TOKEN_KEY = "studysync.token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(`Cannot reach the StudySync server at ${API_URL}. Is it running?`);
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
    request("/api/auth/register", { method: "POST", body: { fullName, email, password } }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/api/auth/me"),
  forgotPassword: (email) => request("/api/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (email, code, password) =>
    request("/api/auth/reset-password", { method: "POST", body: { email, code, password } }),

  // Daily challenges. day is the device's local date (YYYY-MM-DD), so a new set starts at local midnight.
  challenges: {
    today: (day) => request(`/api/challenges/today?day=${day}`),
    answer: (day, itemId, { choice, answer }) =>
      request(`/api/challenges/${day}/answer`, { method: "POST", body: { itemId, choice, answer } }),
  },

  // History and saved answers are stored in the database, linked to the signed-in user.
  history: {
    list: () => request("/api/history").then((d) => d.history),
    put: (id, session) => request(`/api/history/${encodeURIComponent(id)}`, { method: "PUT", body: session }),
    remove: (id) => request(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" }),
    clear: () => request("/api/history", { method: "DELETE" }),
  },
  saved: {
    list: () => request("/api/saved").then((d) => d.saved),
    add: (item) => request("/api/saved", { method: "POST", body: item }),
    remove: (key) => request(`/api/saved?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  },

  extract: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/api/papers/extract", { method: "POST", form });
  },
  transcribe: (wavBlob) => {
    const form = new FormData();
    form.append("file", wavBlob, "question.wav");
    return request("/api/papers/transcribe", { method: "POST", form });
  },
  solve: (question, subject, context) =>
    request("/api/papers/solve", {
      method: "POST",
      body: { text: question.text, marks: question.marks, subject, context },
    }),
  // A follow-up question about a solved question; history is the earlier follow-ups (toFollowupsPayload).
  followup: (question, subject, history, message) =>
    request("/api/papers/followup", {
      method: "POST",
      body: { question: question.text, subject, solution: question.solution, history, message },
    }),
};
