// ─────────────────────────────────────────────────────────────────────────────
// Localized customer-facing API errors.
//
// Reuses server/lib/locale.js for resolution — this module owns the message
// text, never the locale parsing.
//
// Only errors a CUSTOMER can actually reach belong here. Authorization guards
// ("Forbidden", "Partners only") and API-contract violations ("token is
// required") stay English on purpose: a working client never renders them, and
// translating them makes them harder to search for in a bug report.
//
// REVIEW BEFORE PRODUCTION: machine-authored translations, no native-speaker
// review.
// ─────────────────────────────────────────────────────────────────────────────
import { ApiError } from './access.js';

const MESSAGES = {
  service_not_found: {
    en: (id) => `Service not found: ${id}`,
    ms: (id) => `Perkhidmatan tidak dijumpai: ${id}`,
  },
  category_not_found: {
    en: (slug) => `Category not found: ${slug}`,
    ms: (slug) => `Kategori tidak dijumpai: ${slug}`,
  },
};

/**
 * Build a localized ApiError.
 * @param {number} status
 * @param {keyof typeof MESSAGES} code stable, English, never shown to a customer
 * @param {'en'|'ms'} locale
 * @param {...any} args interpolated into the message
 */
export function localizedError(status, code, locale, ...args) {
  const set = MESSAGES[code];
  const fn = (set && (set[locale === 'ms' ? 'ms' : 'en'] || set.en));
  const message = fn ? fn(...args) : code;
  return new ApiError(status, message, [{ code, ...(args[0] !== undefined ? { value: args[0] } : {}) }]);
}

export const ERROR_CODES = Object.keys(MESSAGES);
