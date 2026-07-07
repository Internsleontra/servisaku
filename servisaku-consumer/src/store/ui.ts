import { create } from 'zustand';

// UI/preferences state (client-only). Server state lives in TanStack Query;
// auth/session in AuthContext. Dark mode + font scaling are wired here so the
// Preferences screen (§5.16) and a later dark-mode pass can flip them globally.
export type ThemeMode = 'system' | 'light' | 'dark';
export type FontScaleKey = 'standard' | 'large' | 'xlarge';

export const FONT_SCALE: Record<FontScaleKey, number> = { standard: 1, large: 1.15, xlarge: 1.3 };

interface UIState {
  themeMode: ThemeMode;
  fontScale: FontScaleKey;
  reduceMotion: boolean;
  highContrast: boolean;
  dataSaver: boolean;
  setThemeMode: (m: ThemeMode) => void;
  setFontScale: (f: FontScaleKey) => void;
  setReduceMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  themeMode: 'system',
  fontScale: 'standard',
  reduceMotion: false,
  highContrast: false,
  dataSaver: false,
  setThemeMode: (themeMode) => set({ themeMode }),
  setFontScale: (fontScale) => set({ fontScale }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setHighContrast: (highContrast) => set({ highContrast }),
  setDataSaver: (dataSaver) => set({ dataSaver }),
}));
