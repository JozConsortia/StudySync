import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';

/** A labelled text box with an icon; `password` adds a show / hide button. */
const Field = forwardRef(function Field({ label, hint, hintOk, icon, password, inputStyle, right, ...props }, ref) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrap, focused && styles.inputFocused]}>
        {icon && <Feather name={icon} size={16} color={focused ? colors.accent : colors.muted} />}
        <TextInput
          ref={ref}
          style={[styles.input, inputStyle]}
          placeholderTextColor={colors.muted}
          secureTextEntry={password && !visible}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
        {password && (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
            <Feather name={visible ? 'eye-off' : 'eye'} size={17} color={colors.muted} />
          </Pressable>
        )}
        {right}
      </View>
      {!!hint && <Text style={[styles.hint, hintOk && { color: colors.success }]}>{hint}</Text>}
    </View>
  );
});

export default Field;

/** "At least 8 characters (3 more)" under a new-password box. */
export function passwordHint(password) {
  if (password.length >= 8) return '✓ At least 8 characters';
  return `At least 8 characters${password.length ? ` (${8 - password.length} more)` : ''}`;
}

const makeStyles = (colors) =>
  StyleSheet.create({
    label: { color: colors.text, fontSize: 14, fontWeight: '600' },
    hint: { color: colors.muted, fontSize: 12 },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.inputBg,
    },
    inputFocused: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    input: { flex: 1, paddingVertical: 13, color: colors.text, fontSize: 15 },
  });
