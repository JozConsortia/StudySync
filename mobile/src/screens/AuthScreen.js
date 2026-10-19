import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { api, normalizeServerUrl, serverStore } from '../api';
import { Backdrop, Button, Card, ErrorBox, Gradient, IconButton } from '../components/ui';
import Logo from '../components/Logo';
import { BotAvatar } from '../components/Bot';
import Field, { passwordHint } from '../components/Field';
import ResetPassword from '../components/ResetPassword';
import KeyboardAwareScrollView from '../components/KeyboardAware';
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

  const openForgot = () => {
    setMode('forgot');
    setError('');
  };

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
    <View style={{ flex: 1 }}>
      <Backdrop />
      <KeyboardAwareScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Logo large />
          <IconButton
            icon={themeMode === 'dark' ? 'sun' : 'moon'}
            onPress={toggleTheme}
            label={themeMode === 'dark' ? 'Switch to bright mode' : 'Switch to dark mode'}
          />
        </View>

        <Gradient style={styles.hero}>
          <View style={[styles.ring, { width: 240, height: 240, borderRadius: 120, top: -110, right: -80 }]} />
          <View style={[styles.ring, { width: 120, height: 120, borderRadius: 60, bottom: -50, left: -30 }]} />
          <View style={styles.heroBot}>
            <BotAvatar size={70} />
          </View>
          <Text style={styles.headline}>Turn any exam paper into worked solutions.</Text>
          <Text style={styles.sub}>
            Snap a photo or pick a PDF. I'm <Text style={{ fontWeight: '800', color: '#fff' }}>StudySync Bot</Text>, and
            I'll explain every answer step by step — and read it to you too.
          </Text>
          <View style={styles.pills}>
            {[
              ['camera', 'Scan papers'],
              ['list', 'Step-by-step'],
              ['mic', 'Voice'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.pill}>
                <Feather name={icon} size={12} color="#fff" />
                <Text style={styles.pillText}>{label}</Text>
              </View>
            ))}
          </View>
        </Gradient>

        {mode === 'forgot' ? (
          <Card style={styles.card}>
            <ResetPassword
              initialEmail={email}
              onDone={onAuth}
              onCancel={() => {
                setMode('login');
                setError('');
              }}
            />
          </Card>
        ) : (
        <Card style={styles.card}>
          <View style={styles.segment} accessibilityRole="tablist">
            {[
              ['login', 'Sign in'],
              ['register', 'Create account'],
            ].map(([m, label]) => (
              <Pressable
                key={m}
                style={styles.segmentItem}
                onPress={() => {
                  setMode(m);
                  setError('');
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
              >
                {mode === m && <Gradient style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <Text style={[styles.segmentText, mode === m && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.title}>{isRegister ? 'Create your account' : 'Welcome back 👋'}</Text>
            <Text style={styles.hint}>{isRegister ? 'It takes less than a minute.' : 'Sign in to continue studying.'}</Text>
          </View>

          {isRegister && (
            <Field
              label="Full name"
              icon="user"
              placeholder="e.g. Thandi Mokoena"
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
            />
          )}
          <Field
            label="Email address"
            icon="mail"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Password"
            icon="lock"
            placeholder={isRegister ? 'Create a password (8+ characters)' : 'Enter your password'}
            value={password}
            onChangeText={setPassword}
            password
            autoCapitalize="none"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? passwordHint(password) : undefined}
            hintOk={isRegister && password.length >= 8}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {!isRegister && (
            <Pressable onPress={openForgot} style={styles.forgot} hitSlop={10} accessibilityRole="button">
              <Feather name="key" size={14} color={colors.accent} />
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          <ErrorBox message={error} />
          <Button
            title={isRegister ? 'Create account' : 'Sign in'}
            icon={isRegister ? 'user-plus' : 'log-in'}
            variant="primary"
            size="lg"
            onPress={submit}
            loading={busy}
          />
          {!isRegister && (
            <Button title="Reset password by email" icon="mail" onPress={openForgot} />
          )}

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
        )}

        <ServerSetting />
      </KeyboardAwareScrollView>
    </View>
  );
}

// Which StudySync server the app talks to. The installed app has no Expo dev server to take the address
// from, so this opens by itself until an address is set.
function ServerSetting() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [current, setCurrent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    serverStore.get().then((url) => {
      setCurrent(url);
      setDraft(url);
      if (!url) setEditing(true);
    });
  }, []);

  const save = async () => {
    setError('');
    const url = normalizeServerUrl(draft);
    if (!url) return setError('Enter the address of the computer running the StudySync server.');
    setBusy(true);
    try {
      await serverStore.check(url);
      const savedUrl = await serverStore.set(url);
      setCurrent(savedUrl);
      setDraft(savedUrl);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (current === null) return null;

  if (!editing) {
    return (
      <Pressable style={styles.serverRow} onPress={() => setEditing(true)} accessibilityLabel="Change server address">
        <Feather name="server" size={14} color={colors.muted} />
        <Text style={styles.serverText} numberOfLines={1}>
          Server: {current}
        </Text>
        <Text style={styles.link}>Change</Text>
      </Pressable>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>StudySync server</Text>
      <Text style={styles.hint}>
        The IP address of the computer running the server, for example 192.168.1.20 (port 5000 is added for you). On
        Windows, run ipconfig and use the IPv4 address. The phone must be on the same Wi-Fi.
      </Text>
      <Field
        label="Server address"
        icon="server"
        placeholder="192.168.1.20"
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onSubmitEditing={save}
      />
      <ErrorBox message={error} />
      <Button title="Test and save" variant="primary" onPress={save} loading={busy} />
      {!!current && (
        <Pressable
          onPress={() => {
            setDraft(current);
            setError('');
            setEditing(false);
          }}
          style={{ alignSelf: 'center' }}
        >
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      )}
    </Card>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  container: { padding: 20, paddingTop: 28, gap: 16, flexGrow: 1, justifyContent: 'center' },
  hero: { borderRadius: 28, padding: 22, gap: 10, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 28, borderColor: 'rgba(255,255,255,0.07)' },
  heroBot: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 8, 40, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 4,
    transform: [{ rotate: '-6deg' }],
  },
  headline: { color: '#fff', fontSize: 27, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
  sub: { color: 'rgba(255,255,255,0.88)', fontSize: 14.5, lineHeight: 21 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: { gap: 16, padding: 20 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, overflow: 'hidden' },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  link: { color: colors.accent, fontWeight: '600' },
  forgot: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: -4, paddingVertical: 4 },
  forgotText: { color: colors.accent, fontWeight: '700', fontSize: 14.5 },
  serverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  serverText: { color: colors.muted, fontSize: 13, flexShrink: 1 },
});
