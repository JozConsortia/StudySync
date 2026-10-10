import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';

export default function SolutionView({ solution }) {
  const [showSteps, setShowSteps] = useState(true);

  return (
    <View style={styles.wrap}>
      <View style={[styles.block, styles.answer]}>
        <Text style={[styles.label, { color: colors.success }]}>ANSWER</Text>
        <Text style={styles.answerText}>{solution.answer}</Text>
      </View>

      {solution.steps.length > 0 && (
        <View style={styles.block}>
          <Pressable style={styles.toggle} onPress={() => setShowSteps((v) => !v)}>
            <Text style={styles.label}>STEP-BY-STEP ({solution.steps.length})</Text>
            <Feather name={showSteps ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </Pressable>
          {showSteps &&
            solution.steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepN}>
                  <Text style={styles.stepNText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.body}>{s.detail}</Text>
                </View>
              </View>
            ))}
        </View>
      )}

      {!!solution.explanation && (
        <View style={styles.block}>
          <Text style={styles.label}>WHY IT WORKS</Text>
          <Text style={styles.body}>{solution.explanation}</Text>
        </View>
      )}

      {solution.tips?.length > 0 && (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.warning }]}>EXAM TIPS</Text>
          {solution.tips.map((t, i) => (
            <Text key={i} style={styles.body}>
              •  {t}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  block: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  answer: { backgroundColor: colors.successSoft, borderColor: 'rgba(60,207,145,0.3)' },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  answerText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stepN: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  stepNText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  stepTitle: { color: colors.text, fontWeight: '700', marginBottom: 2 },
  body: { color: colors.textSoft, fontSize: 14, lineHeight: 21 },
});
