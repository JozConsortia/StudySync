import { useEffect, useState } from 'react';
import * as Speech from 'expo-speech';
import { parseRichText } from './richtext';

// ---------------------------------------------------------------- turning an answer into speech
// Same rules as the web app (web/src/lib/speech.js).

function speakableMaths(text) {
  return text
    .replace(/\^2\b/g, ' squared')
    .replace(/\^3\b/g, ' cubed')
    .replace(/\^\(?(-?\w+)\)?/g, ' to the power of $1')
    .replace(/sqrt\(([^)]*)\)/gi, 'the square root of $1')
    .replace(/\s*>=\s*/g, ' is greater than or equal to ')
    .replace(/\s*<=\s*/g, ' is less than or equal to ')
    .replace(/\s*!=\s*/g, ' is not equal to ')
    .replace(/(\d)\s*\*\s*(\d)/g, '$1 times $2')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 over $2')
    .replace(/[*_`#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakableRich(text) {
  return parseRichText(text)
    .map((p) => (p.type === 'code' ? 'The code is shown on screen.' : speakableMaths(p.content)))
    .join(' ');
}

/** The text read aloud for a solution: answer, then each step, the explanation and the tips. */
export function solutionToSpeech(solution, question) {
  const parts = [];
  if (question) parts.push(`The question: ${speakableRich(question)}.`);
  parts.push(`Answer: ${speakableRich(solution.answer)}.`);
  solution.steps?.forEach((s, i) => parts.push(`Step ${i + 1}: ${speakableMaths(s.title)}. ${speakableRich(s.detail)}`));
  if (solution.explanation) parts.push(`Why it works: ${speakableRich(solution.explanation)}`);
  if (solution.tips?.length) parts.push(`Exam tips: ${solution.tips.map(speakableRich).join(' ')}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- the phone's own voice

let speakingKey = null;
const listeners = new Set();
const setSpeaking = (key) => {
  speakingKey = key;
  listeners.forEach((fn) => fn(key));
};

/** Reads text aloud; `key` identifies what is being read so its button can show "Stop". */
export function speak(text, key) {
  Speech.stop();
  // Phones limit how long one utterance can be, so the text is read sentence by sentence.
  const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
  setSpeaking(key);
  chunks.forEach((chunk, i) => {
    const last = i === chunks.length - 1;
    Speech.speak(chunk.trim(), {
      language: 'en',
      rate: 1,
      onDone: last ? () => speakingKey === key && setSpeaking(null) : undefined,
      onStopped: () => speakingKey === key && setSpeaking(null),
      onError: () => setSpeaking(null),
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
  setSpeaking(null);
}

export function useSpeakingKey() {
  const [key, setKey] = useState(speakingKey);
  useEffect(() => {
    listeners.add(setKey);
    return () => listeners.delete(setKey);
  }, []);
  return key;
}
