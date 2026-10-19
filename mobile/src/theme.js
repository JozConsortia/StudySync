import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dark is the default; bright mode is for people who prefer it. The choice is remembered on the device.
// "Midnight study": deep indigo surfaces with a violet → blue → cyan brand gradient.
export const palettes = {
  dark: {
    bg: '#06070e',
    surface: '#0e1020',
    surface2: '#151830',
    surface3: '#1d2140',
    border: '#1f2340',
    borderStrong: '#2f3458',
    text: '#f3f4fc',
    textSoft: '#cdd1e8',
    muted: '#8a8fae',
    accent: '#7b8cff',
    accentHover: '#97a4ff',
    accentSoft: 'rgba(123, 140, 255, 0.14)',
    accentBorder: 'rgba(123, 140, 255, 0.5)',
    violet: '#a77bff',
    violetSoft: 'rgba(167, 123, 255, 0.15)',
    cyan: '#38d3e8',
    cyanSoft: 'rgba(56, 211, 232, 0.14)',
    pink: '#ff7ab6',
    pinkSoft: 'rgba(255, 122, 182, 0.14)',
    success: '#3ddc97',
    successSoft: 'rgba(61, 220, 151, 0.12)',
    successBorder: 'rgba(61, 220, 151, 0.35)',
    doneBorder: 'rgba(61, 220, 151, 0.28)',
    danger: '#ff6b81',
    dangerSoft: 'rgba(255, 107, 129, 0.1)',
    alertText: '#ffb3c0',
    alertBorder: 'rgba(255, 107, 129, 0.35)',
    warning: '#ffc86b',
    warningSoft: 'rgba(255, 200, 107, 0.12)',
    inputBg: '#0a0c18',
    codeBg: '#080913',
    codeText: '#e8e9f5',
    codeComment: '#7fd0a0',
    logoBg: '#14172c',
    gradient: ['#8b5cf6', '#5b7cfa', '#22c3e6'],
    gradientSoft: ['rgba(139, 92, 246, 0.22)', 'rgba(34, 195, 230, 0.08)'],
    glow1: '#7c4dff',
    glow2: '#1fb6ff',
    glowOpacity: 0.07,
    tabBar: 'rgba(17, 19, 38, 0.96)',
    shadow: '#000000',
  },
  light: {
    bg: '#f4f5fc',
    surface: '#ffffff',
    surface2: '#f1f2fa',
    surface3: '#e6e8f6',
    border: '#e3e5f3',
    borderStrong: '#cfd3e8',
    text: '#13152b',
    textSoft: '#363a58',
    muted: '#5f6485',
    accent: '#4f5df0',
    accentHover: '#3d4ad6',
    accentSoft: 'rgba(79, 93, 240, 0.1)',
    accentBorder: 'rgba(79, 93, 240, 0.45)',
    violet: '#7c4dea',
    violetSoft: 'rgba(124, 77, 234, 0.1)',
    cyan: '#0e93ab',
    cyanSoft: 'rgba(14, 147, 171, 0.1)',
    pink: '#d6337f',
    pinkSoft: 'rgba(214, 51, 127, 0.09)',
    success: '#0f9960',
    successSoft: 'rgba(15, 153, 96, 0.09)',
    successBorder: 'rgba(15, 153, 96, 0.32)',
    doneBorder: 'rgba(15, 153, 96, 0.3)',
    danger: '#d6334f',
    dangerSoft: 'rgba(214, 51, 79, 0.08)',
    alertText: '#a3203a',
    alertBorder: 'rgba(214, 51, 79, 0.3)',
    warning: '#a06400',
    warningSoft: 'rgba(160, 100, 0, 0.09)',
    inputBg: '#ffffff',
    codeBg: '#f5f6fb',
    codeText: '#1d1f2e',
    codeComment: '#2f7d47',
    logoBg: '#14172c',
    gradient: ['#7c4dea', '#4f6ef7', '#14b4d4'],
    gradientSoft: ['rgba(124, 77, 234, 0.12)', 'rgba(20, 180, 212, 0.05)'],
    glow1: '#9b7bff',
    glow2: '#5cc8ff',
    glowOpacity: 0.06,
    tabBar: 'rgba(255, 255, 255, 0.97)',
    shadow: '#2a2f6b',
  },
};

export const radius = 20;

const KEY = 'studysync.theme';
const ThemeContext = createContext({ mode: 'dark', colors: palettes.dark, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => (saved === 'light' || saved === 'dark') && setMode(saved))
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, colors: palettes[mode], toggle }), [mode, toggle]);
  return createElement(ThemeContext.Provider, { value }, children);
}

/** { mode, colors, toggle } for the current theme. */
export const useTheme = () => useContext(ThemeContext);

/** Builds a component's StyleSheet from the current theme's colours (rebuilt only when the theme changes). */
export function useThemedStyles(makeStyles) {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors, makeStyles]);
}
