import { createContext, useContext, useState, useEffect } from 'react';

// The partner app has no localization coverage: its pages are literal English,
// and only shared chrome (bottom nav, chatbot widget, 404) goes through the
// dictionary. Leaving it on the consumer default rendered that chrome in Malay
// — "Papan Pemuka · Jadual · Pendapatan · Profil" — around English pages.
//
// So partner is pinned to English rather than merely defaulted to it: `ms` is
// not in its supported set, which means a stored preference (shared origin in
// dev, or a stale value) is coerced away instead of reviving the problem.
// VITE_APP is a compile-time literal, so each bundle keeps only its own branch.
const IS_PARTNER = import.meta.env.VITE_APP === 'partner';

// Languages the dictionary actually carries. Anything else falls back to the
// default rather than leaving the UI in a language we cannot render.
export const SUPPORTED_LANGS = IS_PARTNER ? ['en'] : ['ms', 'en'];

// ServisAku is a Malaysian marketplace, so Bahasa Malaysia is the default for
// anyone who has not chosen otherwise. A stored preference always wins.
export const DEFAULT_LANG = IS_PARTNER ? 'en' : 'ms';

// Exported so the API client can read the same key rather than repeating the
// literal — the request layer is not a component and cannot use the context.
export const STORAGE_KEY = 'servisaku-lang';

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
