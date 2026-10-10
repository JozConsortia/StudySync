import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { solutionToSpeech, speak, stopSpeaking, useSpeakingKey } from '../speech';

// Recording formats Gemini can listen to: AAC on Android, WAV on iPhone. 16 kHz mono is plenty for speech.
const RECORDING = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};
const RECORDING_TYPE = Platform.OS === 'android' ? { name: 'question.aac', mimeType: 'audio/aac' } : { name: 'question.wav', mimeType: 'audio/wav' };
const MAX_SECONDS = 90;

/** Tap to record a spoken question, tap again to stop; the server turns it into text. */
export function MicButton({ onText, onError, onStart }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const recorder = useAudioRecorder(RECORDING);
  const [state, setState] = useState('idle'); // idle | recording | transcribing
  const timer = useRef(null);

  if (Platform.OS === 'web') return null; // the phone apps record; the web app has its own microphone button

  const start = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      onError('Microphone access is needed to speak your question. Allow it in Settings.');
      return;
    }
    onStart?.();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
    timer.current = setTimeout(stop, MAX_SECONDS * 1000);
  };

  const stop = async () => {
    clearTimeout(timer.current);
    if (!recorder.isRecording) return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    setState('transcribing');
    try {
      const { text } = await api.transcribe({ uri: recorder.uri, ...RECORDING_TYPE });
      onText(text);
    } catch (err) {
      onError(err.message);
    } finally {
      setState('idle');
    }
  };

  const recording = state === 'recording';
  const busy = state === 'transcribing';
  return (
    <Pressable
      onPress={recording ? stop : start}
      disabled={busy}
      style={({ pressed }) => [styles.mic, recording && styles.micRecording, (pressed || busy) && { opacity: 0.7 }]}
      accessibilityLabel={recording ? 'Stop recording' : 'Speak your question'}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <Feather name={recording ? 'square' : 'mic'} size={15} color={recording ? colors.danger : colors.text} />
      )}
      <Text style={[styles.micText, recording && { color: colors.danger }]}>
        {busy ? 'Transcribing…' : recording ? 'Stop' : 'Speak'}
      </Text>
    </Pressable>
  );
}

/** Reads a solution aloud with the phone's voice; tap again to stop. */
export function ListenButton({ solution, question, id }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const speaking = useSpeakingKey() === id;
  return (
    <Pressable
      onPress={() => (speaking ? stopSpeaking() : speak(solutionToSpeech(solution, question), id))}
      style={[styles.listen, speaking && styles.listenActive]}
      hitSlop={6}
      accessibilityLabel={speaking ? 'Stop reading' : 'Read the answer aloud'}
    >
      <Feather name={speaking ? 'square' : 'volume-2'} size={13} color={speaking ? colors.accent : colors.muted} />
      <Text style={[styles.listenText, speaking && { color: colors.accent }]}>{speaking ? 'Stop' : 'Listen'}</Text>
    </Pressable>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    mic: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface2,
    },
    micRecording: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    micText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    listen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    listenActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
    listenText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  });
