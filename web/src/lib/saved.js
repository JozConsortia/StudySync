// Saved answers are stored in the database per user; savedId identifies a question so it is saved once.
import { toSolutionPayload } from "./history.js";
import { toFollowupsPayload } from "./followups.js";

const cut = (s, n) => String(s ?? "").slice(0, n);

export function savedId(paperTitle, question) {
  return `${cut(paperTitle, 200)}::${cut(question.number, 20)}::${cut(question.text, 80)}`;
}

/** The request body for saving an answer, trimmed to the database limits. */
export function toSavedPayload(item) {
  return {
    id: item.id,
    paperTitle: cut(item.paperTitle, 255) || "Untitled paper",
    subject: cut(item.subject, 100),
    number: cut(item.number, 20),
    text: cut(item.text, 20000) || "(empty question)",
    marks: typeof item.marks === "number" && item.marks >= 0 ? Math.min(item.marks, 9999) : null,
    solution: toSolutionPayload(item.solution),
    followups: toFollowupsPayload(item.followups),
    savedAt: item.savedAt,
  };
}
