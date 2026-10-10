import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles, radius } from '../theme';

export function Button({ title, icon, onPress, variant = 'default', size = 'md', disabled, loading, style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const v = makeVariants(colors)[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        size === 'sm' && styles.btnSm,
        v.box,
        pressed && { opacity: 0.75 },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text.color} />
      ) : (
        icon && <Feather name={icon} size={size === 'sm' ? 14 : 16} color={v.text.color} />
      )}
      <Text style={[styles.btnText, size === 'sm' && styles.btnTextSm, v.text]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function ErrorBox({ message }) {
  const styles = useThemedStyles(makeStyles);
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const makeVariants = (colors) => ({
  default: { box: { backgroundColor: colors.surface2, borderColor: colors.borderStrong }, text: { color: colors.text } },
  primary: { box: { backgroundColor: colors.accent, borderColor: colors.accent }, text: { color: '#fff' } },
  ghost: { box: { backgroundColor: 'transparent', borderColor: 'transparent' }, text: { color: colors.muted } },
  saved: { box: { backgroundColor: colors.successSoft, borderColor: colors.successBorder }, text: { color: colors.success } },
  danger: { box: { backgroundColor: 'transparent', borderColor: 'transparent' }, text: { color: colors.danger } },
});

const makeStyles = (colors) =>
  StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnSm: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnText: { fontSize: 15, fontWeight: '600' },
  btnTextSm: { fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: 16,
  },
  chip: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.muted, fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.alertBorder,
  },
  errorText: { color: colors.alertText, fontSize: 14 },
});
