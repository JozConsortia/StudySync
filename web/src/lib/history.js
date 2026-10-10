// History of every paper scanned and question asked. Stored in the database per user;
// these helpers convert between the paper shown on screen and a history entry.

const cut = (s, n) => String(s ?? "").slice(0, n);

export function newHistoryId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// The questions as stored: in-progress states are left out, only finished solutions are kept.
function snapshotQuestions(paper) {
  return paper.questions.map((q) => ({
    id: q.id,
    number: q.number,
    text: q.text,
    marks: q.marks ?? null,
    solution: q.status === "done" ? q.solution : null,
  }));
}

/** Inserts or updates the history entry for a paper. Returns the same list if nothing changed. */
export function upsertHistory(list, paper) {
  const questions = snapshotQuestions(paper);
  const existing = list.find((e) => e.id === paper.historyId);
  if (existing && JSON.stringify(existing.questions) === JSON.stringify(questions)) return list;

  const entry = {
    id: paper.historyId,
    kind: paper.kind || "paper",
    title: paper.title,
    subject: paper.subject || "",
    fileName: paper.fileName || null,
    method: paper.method || null,
    pages: paper.pages || 0,
    createdAt: existing?.createdAt || paper.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions,
  };
  return [entry, ...list.filter((e) => e.id !== paper.historyId)];
}

/** Turns a stored entry back into a paper the Scan view can display and continue. */
export function paperFromHistory(entry) {
  return {
    ...entry,
    historyId: entry.id,
    rawText: "",
    questions: entry.questions.map((q) => ({
      ...q,
      status: q.solution ? "done" : "idle",
      error: "",
    })),
  };
}

export function toSolutionPayload(s) {
  return {
    answer: cut(s.answer, 20000),
    steps: (s.steps || []).slice(0, 50).map((st) => ({ title: cut(st.title, 500), detail: cut(st.detail, 20000) })),
    explanation: cut(s.explanation, 20000),
    tips: (s.tips || []).slice(0, 10).map((t) => cut(t, 2000)),
  };
}

/** The request body for saving an entry, trimmed to the database limits. */
export function toHistoryPayload(entry) {
  return {
    kind: entry.kind === "typed" ? "typed" : "paper",
    title: cut(entry.title, 255) || "Untitled paper",
    subject: cut(entry.subject, 100),
    fileName: entry.fileName ? cut(entry.fileName, 255) : null,
    method: entry.method ? cut(entry.method, 20) : null,
    pages: Math.min(entry.pages || 0, 1000),
    createdAt: entry.createdAt,
    questions: entry.questions.slice(0, 200).map((q) => ({
      id: cut(q.id, 20),
      number: cut(q.number, 20),
      text: cut(q.text, 20000) || "(empty question)",
      marks: typeof q.marks === "number" && q.marks >= 0 ? Math.min(q.marks, 9999) : null,
      solution: q.solution ? toSolutionPayload(q.solution) : null,
    })),
  };
}
