// ─────────────────────────────────────────────────────────────────────────────
// Request locale for the whole API.
//
// This is deliberately a thin wrapper over server/lib/chatbot/locale.js rather
// than a second parser: that module already owns LOCALES, isLocale,
// parseAcceptLanguage and resolveLocale, and duplicating the Accept-Language
// handling is exactly how two mechanisms drift apart.
//
// Resolution order — explicit query parameter, then Accept-Language, then
// English. English is the fallback so a client that sends no locale keeps the
// behaviour it has today.
// ─────────────────────────────────────────────────────────────────────────────
import { LOCALES, DEFAULT_LOCALE, isLocale, parseAcceptLanguage } from './chatbot/locale.js';

export { LOCALES, DEFAULT_LOCALE, isLocale };

/**
 * Resolve the locale for an Express request.
 * @param {import('express').Request} req
 * @returns {'en'|'ms'}
 */
export function localeOf(req) {
  const explicit = req?.query?.locale;
  if (isLocale(explicit)) return explicit;

  const fromHeader = parseAcceptLanguage(req?.headers?.['accept-language']);
  if (isLocale(fromHeader)) return fromHeader;

  return DEFAULT_LOCALE;
}
