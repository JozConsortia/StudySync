import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// Speaking a question:
//  - In Chrome and Edge the browser's own speech recognition is used: instant, words appear live.
//  - Elsewhere (the desktop app, Firefox, Safari) the question is recorded and sent to the server,
//    which transcribes it with Gemini.

const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const isElectron = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
let liveRecognitionWorks = Boolean(SpeechRecognition) && !isElectron;

const MAX_SECONDS = 90;

export const canRecord =
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

/** Encodes mono PCM samples as a 16-bit WAV file (a format Gemini can listen to). */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buffer], { type: "audio/wav" });
}

/** Converts the browser's recording (usually WebM/Opus) into a small 16 kHz mono WAV. */
async function toWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const targetRate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), targetRate);
  } finally {
    ctx.close();
  }
}

/**
 * Voice input for a text box.
 * onText(text, { final }) receives the recognised words; onError(message) explains problems.
 * Returns { state, start, stop, available } where state is idle | listening | recording | transcribing.
 */
export function useVoiceInput({ onText, onError }) {
  const [state, setState] = useState("idle");
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };
  const recognition = useRef(null);
  const recorder = useRef(null);
  const micStream = useRef(null);
  const timer = useRef(null);

  const stopTracks = () => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
  };

  const startRecording = useCallback(async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handlers.current.onError("Microphone access was blocked. Allow the microphone and try again.");
      return;
    }
    const chunks = [];
    micStream.current = stream;
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearTimeout(timer.current);
      stopTracks();
      setState("transcribing");
      try {
        const wav = await toWav(new Blob(chunks, { type: rec.mimeType }));
        const { text } = await api.transcribe(wav);
        handlers.current.onText(text, { final: true });
      } catch (err) {
        handlers.current.onError(err.message || "The recording could not be transcribed.");
      } finally {
        setState("idle");
      }
    };
    rec.start();
    setState("recording");
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
  }, []);

  const startLive = useCallback(() => {
    const rec = new SpeechRecognition();
    recognition.current = rec;
    rec.lang = "en-ZA";
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      handlers.current.onText((finalText + interim).trim(), { final: false });
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        handlers.current.onError("Microphone access was blocked. Allow the microphone and try again.");
      } else if (e.error === "network" || e.error === "language-not-supported") {
        // This browser can't reach its speech service: use recording + server transcription instead.
        liveRecognitionWorks = false;
        startRecording();
      }
    };
    rec.onend = () => {
      recognition.current = null;
      setState((s) => (s === "listening" ? "idle" : s));
      if (finalText.trim()) handlers.current.onText(finalText.trim(), { final: true });
    };
    rec.start();
    setState("listening");
  }, [startRecording]);

  const start = useCallback(() => {
    if (liveRecognitionWorks) startLive();
    else if (canRecord) startRecording();
    else handlers.current.onError("Voice input is not supported in this browser.");
  }, [startLive, startRecording]);

  const stop = useCallback(() => {
    if (recognition.current) recognition.current.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(
    () => () => {
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
      clearTimeout(timer.current);
    },
    []
  );

  return { state, start, stop, available: liveRecognitionWorks || canRecord };
}
