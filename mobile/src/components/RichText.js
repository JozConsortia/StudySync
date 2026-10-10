import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { languageLabel, parseRichText, splitComment } from '../richtext';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Shows text with line breaks kept, and code in scrollable code blocks with its indentation. */
export default function RichText({ text, style }) {
  const styles = useThemedStyles(makeStyles);
  const parts = parseRichText(text);
  return (
    <View style={styles.wrap}>
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <CodeBlock key={i} code={p.content} lang={p.lang} />
        ) : (
          <Text key={i} selectable style={style}>
            {p.content}
          </Text>
        )
      )}
    </View>
  );
}

function CodeBlock({ code, lang }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={styles.lang}>{languageLabel(lang)}</Text>
        <Pressable onPress={copy} hitSlop={8} style={styles.copy} accessibilityLabel="Copy code">
          <Feather name={copied ? 'check' : 'copy'} size={13} color={colors.muted} />
          <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      {/* Horizontal scrolling keeps long lines intact instead of wrapping them. */}
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll}>
        <Text selectable style={styles.code}>
          {code.split('\n').map((line, i, all) => {
            const [src, comment] = splitComment(line, lang);
            return (
              <Text key={i}>
                {src}
                {!!comment && <Text style={styles.comment}>{comment}</Text>}
                {i < all.length - 1 ? '\n' : ''}
              </Text>
            );
          })}
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  wrap: { gap: 8 },
  block: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    backgroundColor: colors.codeBg,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface2,
  },
  lang: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { color: colors.muted, fontSize: 11 },
  scroll: { padding: 12 },
  code: { fontFamily: MONO, fontSize: 13, lineHeight: 20, color: colors.codeText },
  comment: { color: colors.codeComment, fontStyle: 'italic' },
});
