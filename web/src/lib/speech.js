import { useEffect, useState } from "react";
import { parseRichText } from "./richtext.js";

// ---------------------------------------------------------------- turning an answer into speech

// Reads maths the way a teacher would say it, e.g. "x^2" -> "x squared", "a >= b" -> "a is at least b".
function speakableMaths(text) {
  return text
    .replace(/\^2\b/g, " squared")
    .replace(/\^3\b/g, " cubed")
    .replace(/\^\(?(-?\w+)\)?/g, " to the power of $1")
    .replace(/sqrt\(([^)]*)\)/gi, "the square root of $1")
    .replace(/\s*>=\s*/g, " is greater than or equal to ")
    .replace(/\s*<=\s*/g, " is less than or equal to ")
    .replace(/\s*!=\s*/g, " is not equal to ")
    .replace(/(\d)\s*\*\s*(\d)/g, "$1 times $2")
    .replace(/(\d)\s*\/\s*(\d)/g, "$1 over $2")
    .replace(/[*_`#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Code is not read symbol by symbol; the listener is pointed to the screen instead.
function speakableRich(text) {
  return parseRichText(text)
    .map((p) => (p.type === "code" ? "The code is shown on screen." : speakableMaths(p.content)))
    .join(" ");
}

/** The text read aloud for a solution: answer, then each step, the explanation and the tips. */
export function solutionToSpeech(solution, question) {
  const parts = [];
  if (question) parts.push(`The question: ${speakableRich(question)}.`);
  parts.push(`Answer: ${speakableRich(solution.answer)}.`);
  solution.steps?.forEach((s, i) => parts.push(`Step ${i + 1}: ${speakableMaths(s.title)}. ${speakableRich(s.detail)}`));
  if (solution.explanation) parts.push(`Why it works: ${speakableRich(solution.explanation)}`);
  if (solution.tips?.length) parts.push(`Exam tips: ${solution.tips.map(speakableRich).join(" ")}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------- the device's own voice

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

let speakingKey = null;
const listeners = new Set();
const setSpeaking = (key) => {
  speakingKey = key;
  listeners.forEach((fn) => fn(key));
};

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en[-_](ZA|GB|US)/i.test(v.lang) && /natural|online|google/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

/** Reads text aloud. `key` identifies what is being read, so its button can show "Stop". */
export function speak(text, key) {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  // Long text is split into sentences: some browsers stop reading a single very long utterance.
  const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
  const voice = pickVoice();
  setSpeaking(key);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk.trim());
    if (voice) u.voice = voice;
    u.rate = 1;
    if (i === chunks.length - 1) u.onend = () => speakingKey === key && setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel();
  setSpeaking(null);
}

/** The key currently being read aloud (or null). */
export function useSpeakingKey() {
  const [key, setKey] = useState(speakingKey);
  useEffect(() => {
    listeners.add(setKey);
    return () => listeners.delete(setKey);
  }, []);
  return key;
}
