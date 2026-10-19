import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles, radius } from '../theme';

/** The brand gradient (violet → blue → cyan) as a background. */
export function Gradient({ style, children, colors: override, ...props }) {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={override || colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style} {...props}>
      {children}
    </LinearGradient>
  );
}

export function Button({ title, icon, onPress, variant = 'default', size = 'md', disabled, loading, style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const v = makeVariants(colors)[variant];
  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={v.text.color} />
      ) : (
        icon && <Feather name={icon} size={size === 'sm' ? 14 : 17} color={v.text.color} />
      )}
      {!!title && <Text style={[styles.btnText, size === 'sm' && styles.btnTextSm, v.text]}>{title}</Text>}
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        size === 'sm' && styles.btnSm,
        size === 'lg' && styles.btnLg,
        v.box,
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {variant === 'primary' && <Gradient style={StyleSheet.absoluteFill} />}
      {content}
    </Pressable>
  );
}

/** A round icon-only button, e.g. the theme toggle in the top bar. */
export function IconButton({ icon, onPress, label, color, style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }, style]}
    >
      <Feather name={icon} size={17} color={color || colors.textSoft} />
    </Pressable>
  );
}

export function Card({ children, style }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

/** tone: default | accent | success | warning | glass (white text, for use on the gradient) */
export function Chip({ label, icon, tone = 'default' }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = makeTones(colors)[tone];
  return (
    <View style={[styles.chip, t.box]}>
      {icon && <Feather name={icon} size={11} color={t.text.color} />}
      <Text style={[styles.chipText, t.text]}>{label}</Text>
    </View>
  );
}

/** A rounded, tinted square holding an icon. tone picks the colour. */
export function IconTile({ icon, tone = 'accent', size = 40 }) {
  const { colors } = useTheme();
  const t = {
    accent: [colors.accentSoft, colors.accent],
    violet: [colors.violetSoft, colors.violet],
    cyan: [colors.cyanSoft, colors.cyan],
    pink: [colors.pinkSoft, colors.pink],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
  }[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: t[0],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name={icon} size={size * 0.46} color={t[1]} />
    </View>
  );
}

export function ErrorBox({ message }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Feather name="alert-circle" size={16} color={colors.alertText} style={{ marginTop: 1 }} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Soft coloured light behind a screen: small dots with a large blurred shadow, so the edges fade smoothly. */
export function Backdrop() {
  const { colors } = useTheme();
  const hex = (a) =>
    Math.round(a * 255)
      .toString(16)
      .padStart(2, '0');
  const alpha = hex(colors.glowOpacity * 4);
  const core = hex(colors.glowOpacity * 2.2); // the shadow is faint at its inner edge, so the core is dimmer to match
  const glow = (color, size, pos) => (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}${core}`,
          boxShadow: `0 0 ${size * 1.2}px ${size * 0.6}px ${color}${alpha}`,
        },
        pos,
      ]}
    />
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {glow(colors.glow1, 140, { top: -70, left: -50 })}
      {glow(colors.glow2, 120, { top: 380, right: -90 })}
      {glow(colors.glow1, 100, { bottom: -60, left: 10 })}
    </View>
  );
}

/** Big screen title with an optional coloured kicker above it and actions on the right. */
export function ScreenHeader({ kicker, title, subtitle, right }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.headRow}>
      <View style={{ flex: 1, gap: 2 }}>
        {!!kicker && <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>}
        <Text style={styles.h1}>{title}</Text>
        {subtitle}
      </View>
      {right}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.search}>
      <Feather name="search" size={16} color={colors.muted} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Feather name="x-circle" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Illustrated empty state: a gradient badge with an icon, orbited by small dots. */
export function EmptyState({ icon, title, body, action }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <Backdrop />
      <View style={styles.emptyArt}>
        <View style={[styles.orbit, { width: 150, height: 150, borderRadius: 75 }]} />
        <View style={[styles.orbit, { width: 112, height: 112, borderRadius: 56 }]} />
        <View style={[styles.dot, { top: 8, right: 30, backgroundColor: colors.cyan }]} />
        <View style={[styles.dot, { bottom: 18, left: 14, backgroundColor: colors.violet, width: 10, height: 10 }]} />
        <View style={[styles.dot, { top: 40, left: 4, backgroundColor: colors.pink, width: 6, height: 6 }]} />
        <Gradient style={styles.emptyBadge}>
          <Feather name={icon} size={30} color="#fff" />
        </Gradient>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

const makeVariants = (colors) => ({
  default: { box: { backgroundColor: colors.surface2, borderColor: colors.borderStrong }, text: { color: colors.text } },
  primary: { box: { backgroundColor: colors.accent, borderColor: 'transparent', overflow: 'hidden' }, text: { color: '#fff' } },
  ghost: { box: { backgroundColor: 'transparent', borderColor: 'transparent' }, text: { color: colors.muted } },
  saved: { box: { backgroundColor: colors.successSoft, borderColor: colors.successBorder }, text: { color: colors.success } },
  danger: { box: { backgroundColor: colors.dangerSoft, borderColor: 'transparent' }, text: { color: colors.danger } },
  // for use on top of the gradient
  light: { box: { backgroundColor: '#ffffff', borderColor: '#ffffff' }, text: { color: '#2b2370' } },
  glass: { box: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.3)' }, text: { color: '#fff' } },
});

const makeTones = (colors) => ({
  default: { box: { backgroundColor: colors.surface2, borderColor: colors.border }, text: { color: colors.muted } },
  accent: { box: { backgroundColor: colors.accentSoft, borderColor: 'transparent' }, text: { color: colors.accent } },
  success: { box: { backgroundColor: colors.successSoft, borderColor: 'transparent' }, text: { color: colors.success } },
  warning: { box: { backgroundColor: colors.warningSoft, borderColor: 'transparent' }, text: { color: colors.warning } },
  glass: { box: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.22)' }, text: { color: '#fff' } },
});

const makeStyles = (colors) =>
  StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnSm: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999 },
  btnLg: { paddingVertical: 16, borderRadius: 16 },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnTextSm: { fontSize: 13 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: 16,
    boxShadow: `0 8px 24px ${colors.shadow}14`,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  error: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.alertBorder,
  },
  errorText: { flex: 1, color: colors.alertText, fontSize: 14, lineHeight: 20 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyArt: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  orbit: { position: 'absolute', borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 5 },
  emptyBadge: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    boxShadow: `0 12px 30px ${colors.glow1}55`,
  },
  emptyTitle: { color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300, marginBottom: 8 },
});
