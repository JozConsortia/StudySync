import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';

const ToastContext = createContext(() => {});

/**
 * Short messages at the bottom of the screen, e.g. "Removed from Saved · Undo".
 * showToast({ message, icon, tone: 'default' | 'success' | 'danger', action: { label, onPress }, duration })
 */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children, bottom = 0 }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((t) => setToast({ ...t, key: Date.now() }), []);
  return (
    <ToastContext.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && <ToastView key={toast.key} toast={toast} bottom={bottom} onHide={() => setToast(null)} />}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, bottom, onHide }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const anim = useRef(new Animated.Value(0)).current;
  const hiding = useRef(false);

  const hide = useCallback(() => {
    if (hiding.current) return;
    hiding.current = true;
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(onHide);
  }, [anim, onHide]);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    // Messages with an Undo stay longer so there is time to read them and react.
    const t = setTimeout(hide, toast.duration ?? (toast.action ? 5000 : 2400));
    return () => clearTimeout(t);
  }, [anim, hide, toast]);

  const iconColor = { success: colors.success, danger: colors.danger }[toast.tone] || colors.accent;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
      ]}
    >
      <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        {!!toast.icon && <Feather name={toast.icon} size={17} color={iconColor} />}
        <Text style={styles.text} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action && (
          <Pressable
            onPress={() => {
              toast.action.onPress();
              hide();
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: 480,
      alignSelf: 'stretch',
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 12,
      borderRadius: 16,
      backgroundColor: colors.surface3,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      boxShadow: `0 10px 30px ${colors.shadow}55`,
    },
    text: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
    action: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.accentSoft },
    actionText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  });
