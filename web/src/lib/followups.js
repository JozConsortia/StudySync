// Follow-up questions a student asks about a solved question, with StudySync Bot's replies.
// Each turn is { question, answer, askedAt }. They are stored with the question in history and saved answers.

const cut = (s, n) => String(s ?? "").slice(0, n);

export const MAX_FOLLOWUPS = 30;

export const FOLLOWUP_SUGGESTIONS = [
  "Explain it more simply",
  "Why does the first step work?",
  "Give me a similar practice question",
  "What mistakes should I avoid?",
];

/** The turns as sent to the server, trimmed to its limits. */
export function toFollowupsPayload(list) {
  return (list || []).slice(-MAX_FOLLOWUPS).map((f) => ({
    question: cut(f.question, 4000) || "(empty)",
    answer: cut(f.answer, 20000),
    askedAt: f.askedAt ? cut(f.askedAt, 40) : null,
  }));
}
