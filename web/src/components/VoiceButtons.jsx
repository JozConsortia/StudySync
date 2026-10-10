import { LoaderCircle, Mic, Square, Volume2 } from "lucide-react";
import { canSpeak, solutionToSpeech, speak, stopSpeaking, useSpeakingKey } from "../lib/speech.js";
import { useVoiceInput } from "../lib/voice.js";

/**
 * Microphone button for a text box. Click to start, click again to stop.
 * onText(text, { final }) receives what was said; onError(message) reports problems.
 */
export function MicButton({ onText, onError, onStart, disabled }) {
  const voice = useVoiceInput({ onText, onError });
  if (!voice.available) return null;

  const active = voice.state === "listening" || voice.state === "recording";
  const busy = voice.state === "transcribing";
  const label = busy ? "Transcribing…" : active ? "Stop" : "Speak";

  return (
    <button
      type="button"
      className={`btn btn-sm mic-btn ${active ? "recording" : ""}`}
      onClick={() => {
        if (active) return voice.stop();
        onStart?.();
        voice.start();
      }}
      disabled={disabled || busy}
      title={active ? "Stop recording" : "Speak your question"}
      aria-label={active ? "Stop recording" : "Speak your question"}
    >
      {busy ? <LoaderCircle size={15} className="spin" /> : active ? <Square size={13} /> : <Mic size={15} />}
      {label}
      {active && <span className="rec-dot" aria-hidden="true" />}
    </button>
  );
}

/** Reads a solution aloud with the device's voice; click again to stop. */
export function ListenButton({ solution, question, id }) {
  const speakingKey = useSpeakingKey();
  if (!canSpeak) return null;
  const speaking = speakingKey === id;
  return (
    <button
      type="button"
      className={`bot-action ${speaking ? "active" : ""}`}
      onClick={() => (speaking ? stopSpeaking() : speak(solutionToSpeech(solution, question), id))}
      title={speaking ? "Stop reading" : "Read the answer aloud"}
    >
      {speaking ? <Square size={13} /> : <Volume2 size={14} />}
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}
