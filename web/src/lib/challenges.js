// Helpers for daily challenges.

/** The device's local date as YYYY-MM-DD: a new set of challenges starts at local midnight. */
export function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "5h 12m" until local midnight. */
export function untilMidnight(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.round((midnight - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** The first challenge not answered yet (or the last one when all are done). */
export function firstOpen(items) {
  const i = items.findIndex((c) => !c.result);
  return i === -1 ? items.length - 1 : i;
}

/** correct | partly | incorrect | null (not answered) */
export function outcome(item) {
  const r = item.result;
  if (!r) return null;
  if (item.type === "mcq") return r.correct ? "correct" : "incorrect";
  return r.verdict || (r.correct ? "correct" : "incorrect");
}
