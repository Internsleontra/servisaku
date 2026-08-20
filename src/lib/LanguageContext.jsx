import { createContext, useContext, useState, useEffect } from 'react';

// Languages the dictionary actually carries. Anything else falls back to the
// default rather than leaving the UI in a language we cannot render.
export const SUPPORTED_LANGS = ['ms', 'en'];

// ServisAku is a Malaysian marketplace, so Bahasa Malaysia is the default for
// anyone who has not chosen otherwise. A stored preference always wins.
export const DEFAULT_LANG = 'ms';

const STORAGE_KEY = 'servisaku-lang';

function normalise(value) {
  return SUPPORTED_LANGS.includes(value) ? value : DEFAULT_LANG;
}

/**
 * Coerce an arbitrary stored/profile value to a language we can render.
 * Returns null for anything unsupported so callers can fall back to the live
 * language rather than silently showing a different one.
 */
export function normaliseLang(value) {
  return SUPPORTED_LANGS.includes(value) ? value : null;
}

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // No stored value means a first-time visitor → default, not English.
    return stored ? normalise(stored) : DEFAULT_LANG;
  } catch {
    // Private mode / disabled storage: still render, just without persistence.
    return DEFAULT_LANG;
  }
}

const LanguageContext = createContext({ lang: DEFAULT_LANG, setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  const setLang = (newLang) => {
    const next = normalise(newLang);
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  // Keep <html lang> in step: screen readers pick pronunciation from it, and
  // it is what `:lang()` rules and browser translation prompts read.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
