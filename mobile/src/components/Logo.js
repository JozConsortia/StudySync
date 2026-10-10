import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

// Three "lines of text" with a dot — mirrors the web/desktop logo.
export default function Logo({ large = false }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = large ? 40 : 30;
  const bar = (w) => ({ width: w * s, height: s * 0.08, borderRadius: s, backgroundColor: colors.accent });
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: s, height: s, borderRadius: s * 0.22, padding: s * 0.25 }]}>
        <View style={bar(0.44)} />
        <View style={bar(0.31)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s * 0.1 }}>
          <View style={bar(0.19)} />
          <View style={{ width: s * 0.19, height: s * 0.19, borderRadius: s, backgroundColor: colors.accent }} />
        </View>
      </View>
      <Text style={[styles.text, { fontSize: large ? 22 : 17 }]}>StudySync</Text>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { backgroundColor: colors.logoBg, justifyContent: 'space-between' },
  text: { color: colors.text, fontWeight: '800' },
});
