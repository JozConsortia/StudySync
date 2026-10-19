import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { Gradient } from './ui';
import RichText from './RichText';

export default function SolutionView({ solution }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showSteps, setShowSteps] = useState(true);
  const steps = solution.steps;

  return (
    <View style={styles.wrap}>
      <View style={[styles.block, styles.answer]}>
        <Label icon="check-circle" color={colors.success} text="ANSWER" />
        <RichText text={solution.answer} style={styles.answerText} />
      </View>

      {steps.length > 0 && (
        <View style={styles.block}>
          <Pressable style={styles.toggle} onPress={() => setShowSteps((v) => !v)}>
            <Label icon="list" color={colors.accent} text={`STEP-BY-STEP · ${steps.length}`} />
            <Feather name={showSteps ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </Pressable>
          {showSteps &&
            steps.map((s, i) => (
              <View key={i} style={styles.step}>
                {/* the timeline: a numbered node with a line down to the next step */}
                <View style={styles.rail}>
                  <Gradient style={styles.stepN}>
                    <Text style={styles.stepNText}>{i + 1}</Text>
                  </Gradient>
                  {i < steps.length - 1 && <View style={styles.line} />}
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <RichText text={s.detail} style={styles.body} />
                </View>
              </View>
            ))}
        </View>
      )}

      {!!solution.explanation && (
        <View style={[styles.block, styles.why]}>
          <Label icon="compass" color={colors.cyan} text="WHY IT WORKS" />
          <RichText text={solution.explanation} style={styles.body} />
        </View>
      )}

      {solution.tips?.length > 0 && (
        <View style={[styles.block, styles.tips]}>
          <Label icon="star" color={colors.warning} text="EXAM TIPS" />
          {solution.tips.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Feather name="arrow-right" size={13} color={colors.warning} style={{ marginTop: 4 }} />
              <View style={{ flex: 1 }}>
                <RichText text={t} style={styles.body} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Label({ icon, color, text }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.labelRow}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[styles.label, { color }]}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  wrap: { gap: 10, paddingTop: 4 },
  block: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  answer: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  why: { backgroundColor: colors.cyanSoft, borderColor: 'transparent' },
  tips: { backgroundColor: colors.warningSoft, borderColor: 'transparent' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  answerText: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26 },
  stepN: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  line: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: colors.borderStrong },
  stepBody: { flex: 1, paddingTop: 3, paddingBottom: 14 },
  stepTitle: { color: colors.text, fontWeight: '700', marginBottom: 3 },
  body: { color: colors.textSoft, fontSize: 14, lineHeight: 21 },
});
