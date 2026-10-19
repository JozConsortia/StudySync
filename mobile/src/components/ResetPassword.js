import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { Button, ErrorBox, IconTile } from './ui';
import Field, { passwordHint } from './Field';

/**
 * "Forgot password": the student enters their email, receives a 6-digit code by email, then enters the
 * code with a new password. onDone receives { token, user } (they are signed in with the new password).
 * lockEmail: used from the account screen, where the email is already known.
 */
export default function ResetPassword({ initialEmail = '', lockEmail = false, onDone, onCancel }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until "Send a new code" is allowed
  const codeRef = useRef(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.forgotPassword(email);
      setNotice(res.message);
      setWait(res.resendAfterSeconds || 45);
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError('');
    if (code.replace(/\D/g, '').length !== 6) return setError('Enter the 6-digit code from the email.');
    if (password.length < 8) return setError('Your new password must be at least 8 characters.');
    setBusy(true);
    try {
      await onDone(await api.resetPassword(email, code, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <IconTile icon={step === 'email' ? 'key' : 'mail'} tone="violet" size={46} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{step === 'email' ? 'Reset your password' : 'Check your email'}</Text>
          <Text style={styles.sub}>
            {step === 'email'
              ? "We'll email you a 6-digit code to set a new password."
              : `Enter the code we sent to ${email.trim()} and choose a new password.`}
          </Text>
        </View>
      </View>

      {step === 'email' ? (
        <>
          <Field
            label="Email address"
            icon="mail"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            editable={!lockEmail}
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="send"
            onSubmitEditing={sendCode}
          />
          <ErrorBox message={error} />
          <Button title="Email me a code" icon="send" variant="primary" size="lg" onPress={sendCode} loading={busy} />
        </>
      ) : (
        <>
          {!!notice && (
            <View style={styles.notice}>
              <Feather name="inbox" size={15} color={colors.success} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}
          <Field
            ref={codeRef}
            label="6-digit code"
            icon="hash"
            placeholder="123456"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            inputStyle={styles.codeInput}
          />
          <Field
            label="New password"
            icon="lock"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            password
            autoCapitalize="none"
            autoComplete="new-password"
            hint={passwordHint(password)}
            hintOk={password.length >= 8}
            returnKeyType="done"
            onSubmitEditing={reset}
          />
          <ErrorBox message={error} />
          <Button title="Save new password" icon="check" variant="primary" size="lg" onPress={reset} loading={busy} />
          <View style={styles.row}>
            <Pressable onPress={sendCode} disabled={wait > 0 || busy} hitSlop={8}>
              <Text style={[styles.link, (wait > 0 || busy) && { color: colors.muted }]}>
                {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
              </Text>
            </Pressable>
            {!lockEmail && (
              <Pressable
                onPress={() => {
                  setStep('email');
                  setError('');
                  setCode('');
                }}
                hitSlop={8}
              >
                <Text style={styles.link}>Use another email</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {!!onCancel && (
        <Pressable onPress={onCancel} style={styles.back} hitSlop={8}>
          <Feather name="arrow-left" size={15} color={colors.accent} />
          <Text style={styles.link}>{lockEmail ? 'Cancel' : 'Back to sign in'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    wrap: { gap: 16 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: colors.text, fontSize: 20, fontWeight: '800' },
    sub: { color: colors.muted, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
    notice: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    noticeText: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 19 },
    codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
    link: { color: colors.accent, fontWeight: '700' },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 4 },
  });
