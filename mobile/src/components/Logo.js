import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '../theme';
import { Gradient } from './ui';

// Three "lines of text" with a dot — mirrors the web/desktop logo, on the brand gradient.
export default function Logo({ large = false, showName = true }) {
  const styles = useThemedStyles(makeStyles);
  const s = large ? 44 : 34;
  const bar = (w) => ({ width: w * s, height: s * 0.08, borderRadius: s, backgroundColor: '#fff' });
  return (
    <View style={styles.row}>
      <Gradient style={[styles.mark, { width: s, height: s, borderRadius: s * 0.3, padding: s * 0.25 }]}>
        <View style={bar(0.44)} />
        <View style={[bar(0.31), { opacity: 0.85 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s * 0.1 }}>
          <View style={[bar(0.19), { opacity: 0.7 }]} />
          <View style={{ width: s * 0.19, height: s * 0.19, borderRadius: s, backgroundColor: '#fff' }} />
        </View>
      </Gradient>
      {showName && (
        <Text style={[styles.text, { fontSize: large ? 24 : 18 }]}>
          Study<Text style={styles.sync}>Sync</Text>
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { justifyContent: 'space-between' },
  text: { color: colors.text, fontWeight: '800', letterSpacing: -0.4 },
  sync: { color: colors.accent },
});
