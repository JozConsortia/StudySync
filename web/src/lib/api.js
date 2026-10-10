export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

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
  solve: (question, subject) =>
    request("/api/papers/solve", {
      method: "POST",
      body: { text: question.text, marks: question.marks, subject },
    }),
};
