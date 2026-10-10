import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { Button, Card, ErrorBox } from '../components/ui';
import Logo from '../components/Logo';
import { BotAvatar } from '../components/Bot';
import { Feather } from '@expo/vector-icons';

export default function AuthScreen({ onAuth }) {
  const { colors, mode: themeMode, toggle: toggleTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const result = isRegister ? await api.register(fullName, email, password) : await api.login(email, password);
      await onAuth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Logo large />
          <Pressable onPress={toggleTheme} hitSlop={12} accessibilityLabel={themeMode === 'dark' ? 'Switch to bright mode' : 'Switch to dark mode'}>
            <Feather name={themeMode === 'dark' ? 'sun' : 'moon'} size={20} color={colors.muted} />
          </Pressable>
        </View>
        <Text style={styles.headline}>Turn any exam paper into worked solutions.</Text>
        <Text style={styles.sub}>
          Snap a photo or pick a PDF. StudySync reads every question and explains each answer step by step.
        </Text>
        <View style={styles.botRow}>
          <BotAvatar size={44} />
          <View style={styles.botBubble}>
            <Text style={styles.botText}>
              Hi, I'm <Text style={{ fontWeight: '700', color: colors.text }}>StudySync Bot</Text>. Ask me by typing or
              speaking, and I can read the answers to you too.
            </Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Text style={styles.title}>{isRegister ? 'Create your account' : 'Welcome back'}</Text>

          {isRegister && (
            <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? 'At least 8 characters.' : undefined}
          />

          <ErrorBox message={error} />
          <Button title={isRegister ? 'Create account' : 'Sign in'} variant="primary" onPress={submit} loading={busy} />

          <View style={styles.switchRow}>
            <Text style={{ color: colors.muted }}>{isRegister ? 'Already have an account?' : 'New to StudySync?'} </Text>
            <Pressable
              onPress={() => {
                setMode(isRegister ? 'login' : 'register');
                setError('');
              }}
            >
              <Text style={styles.link}>{isRegister ? 'Sign in' : 'Create an account'}</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, ...props }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...props} />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  botBubble: { flex: 1, padding: 12, borderRadius: 16, borderTopLeftRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  botText: { color: colors.textSoft, fontSize: 14, lineHeight: 20 },
  container: { padding: 20, paddingTop: 40, gap: 14, flexGrow: 1, justifyContent: 'center' },
  headline: { color: colors.text, fontSize: 28, fontWeight: '800', lineHeight: 34, marginTop: 12 },
  sub: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  card: { gap: 14, padding: 20 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 12 },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  link: { color: colors.accent, fontWeight: '600' },
});
