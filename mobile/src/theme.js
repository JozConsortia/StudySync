import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dark is the default; bright mode is for people who prefer it. The choice is remembered on the device.
export const palettes = {
  dark: {
    bg: '#000000',
    surface: '#0b0b0c',
    surface2: '#141416',
    surface3: '#1c1c1f',
    border: '#232327',
    borderStrong: '#34343a',
    text: '#f4f4f5',
    textSoft: '#d4d4d8',
    muted: '#9a9aa3',
    accent: '#5b8cff',
    accentHover: '#7aa2ff',
    accentSoft: 'rgba(91, 140, 255, 0.14)',
    accentBorder: 'rgba(91, 140, 255, 0.45)',
    success: '#3ccf91',
    successSoft: 'rgba(60, 207, 145, 0.12)',
    successBorder: 'rgba(60, 207, 145, 0.35)',
    doneBorder: '#1f2a24',
    danger: '#ff6b6b',
    dangerSoft: 'rgba(255, 107, 107, 0.1)',
    alertText: '#ffb3b3',
    alertBorder: 'rgba(255, 107, 107, 0.35)',
    warning: '#f5c46b',
    inputBg: '#050505',
    codeBg: '#050507',
    codeText: '#e8e8ee',
    codeComment: '#7fb88f',
    logoBg: '#111114',
  },
  light: {
    bg: '#f4f5f8',
    surface: '#ffffff',
    surface2: '#f3f4f7',
    surface3: '#e9ebf0',
    border: '#e1e4ea',
    borderStrong: '#cdd2dc',
    text: '#15161a',
    textSoft: '#33363e',
    muted: '#5d616c',
    accent: '#3563e9',
    accentHover: '#2a52c9',
    accentSoft: 'rgba(53, 99, 233, 0.1)',
    accentBorder: 'rgba(53, 99, 233, 0.45)',
    success: '#12935c',
    successSoft: 'rgba(18, 147, 92, 0.09)',
    successBorder: 'rgba(18, 147, 92, 0.32)',
    doneBorder: '#bfe3d1',
    danger: '#d33a3a',
    dangerSoft: 'rgba(211, 58, 58, 0.08)',
    alertText: '#a32424',
    alertBorder: 'rgba(211, 58, 58, 0.3)',
    warning: '#9a6200',
    inputBg: '#ffffff',
    codeBg: '#f6f7f9',
    codeText: '#1d1f24',
    codeComment: '#2f7d47',
    logoBg: '#111114',
  },
};

export const radius = 14;

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
