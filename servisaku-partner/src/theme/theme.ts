import { colors as lightColors } from './tokens';

// Theme abstraction. Light-only today, but new screens read colours through
// useTheme() so a dark palette can be layered in later WITHOUT re-touching them.
// (Existing screens still import `colors` from tokens directly; both resolve to
// the same light values for now.)
export interface Theme {
  mode: 'light' | 'dark';
  colors: typeof lightColors;
}

export const lightTheme: Theme = { mode: 'light', colors: lightColors };

// TODO(dark-mode pass): add darkTheme and switch on useUIStore().themeMode +
// the OS colour scheme.
export function useTheme(): Theme {
  return lightTheme;
}
