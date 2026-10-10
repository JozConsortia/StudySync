import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

/** StudySync Bot's face. While it is "thinking" the eyes blink quickly and the antenna pulses. */
export function BotAvatar({ size = 36, thinking = false }) {
  const { colors } = useTheme();
  const blink = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pause = thinking ? 600 : 3800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(pause),
        Animated.timing(blink, { toValue: 0.15, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    if (thinking) pulse.start();
    return () => {
      loop.stop();
      pulse.stop();
    };
  }, [thinking, blink, glow]);

  const u = size / 64; // design units: the face is drawn on a 64 x 64 grid
  const eye = { width: 7.2 * u, height: 7.2 * u, borderRadius: 4 * u, backgroundColor: '#8fe3ff' };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      {/* antenna */}
      <View style={{ position: 'absolute', left: 30.5 * u, top: 6 * u, width: 3 * u, height: 10 * u, backgroundColor: colors.accent, borderRadius: 2 * u }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 28 * u,
          top: 2 * u,
          width: 8 * u,
          height: 8 * u,
          borderRadius: 4 * u,
          backgroundColor: colors.accent,
          opacity: thinking ? glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 1,
        }}
      />
      {/* ears */}
      <View style={{ position: 'absolute', left: 5 * u, top: 28 * u, width: 6 * u, height: 14 * u, borderRadius: 3 * u, backgroundColor: colors.accent }} />
      <View style={{ position: 'absolute', left: 53 * u, top: 28 * u, width: 6 * u, height: 14 * u, borderRadius: 3 * u, backgroundColor: colors.accent }} />
      {/* head and face screen */}
      <View style={{ position: 'absolute', left: 10 * u, top: 15 * u, width: 44 * u, height: 40 * u, borderRadius: 12 * u, backgroundColor: colors.accent }}>
        <View style={{ position: 'absolute', left: 6 * u, top: 7 * u, width: 32 * u, height: 24 * u, borderRadius: 8 * u, backgroundColor: '#0b1020', alignItems: 'center' }}>
          <Animated.View style={{ flexDirection: 'row', gap: 7 * u, marginTop: 6.4 * u, transform: [{ scaleY: blink }] }}>
            <View style={eye} />
            <View style={eye} />
          </Animated.View>
          <View style={{ marginTop: 3 * u, width: 12 * u, height: 4 * u, borderBottomLeftRadius: 6 * u, borderBottomRightRadius: 6 * u, borderWidth: 2.4 * u, borderTopWidth: 0, borderColor: '#8fe3ff' }} />
        </View>
      </View>
    </View>
  );
}

/** A chat message from StudySync Bot: avatar on the left, answer bubble on the right. */
export function BotMessage({ thinking = false, label = 'StudySync Bot', actions = null, children }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <BotAvatar thinking={thinking} />
      <View style={styles.bubble}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{label}</Text>
          {actions}
        </View>
        {thinking ? <TypingIndicator /> : children}
      </View>
    </View>
  );
}

function TypingIndicator() {
  const styles = useThemedStyles(makeStyles);
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.typing} accessibilityLiveRegion="polite">
      <View style={styles.dots}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
          />
        ))}
      </View>
      <Text style={styles.typingText}>Working it out step by step…</Text>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    bubble: {
      flex: 1,
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      borderTopLeftRadius: 4,
      backgroundColor: colors.surface2,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dots: { flexDirection: 'row', gap: 4 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
    typingText: { color: colors.muted, fontSize: 14 },
  });
