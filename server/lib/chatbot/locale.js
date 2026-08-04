// ─────────────────────────────────────────────────────────────────────────────
// Locale detection and localised-string resolution.
//
// Two supported languages: en and ms.
//
// Detection runs PER MESSAGE, not once per conversation. Malaysian users
// code-switch inside a single sentence — "boleh tak book aircon service for
// tomorrow?" is one utterance in two languages — so pinning a conversation to
// the language of its first turn is the classic failure here. The reply follows
// the latest user turn.
//
// Pure — no DB, no network — so the detection table is unit testable.
// ─────────────────────────────────────────────────────────────────────────────

export const LOCALES = ['en', 'ms'];
export const DEFAULT_LOCALE = 'en';

export const isLocale = (l) => LOCALES.includes(l);

// Malay function words and high-frequency service vocabulary. Deliberately
// words that are rare or absent in English rather than merely common in Malay —
// "boleh" discriminates, "service" does not (Malaysians use it in both).
const MS_WORDS = new Set([
  'saya', 'awak', 'anda', 'kami', 'kita', 'dia', 'mereka',
  'boleh', 'tak', 'tidak', 'tiada', 'ada', 'nak', 'hendak', 'mahu', 'perlu',
  'macam', 'mana', 'bila', 'kenapa', 'mengapa', 'siapa', 'berapa', 'apa',
  'dengan', 'untuk', 'daripada', 'kepada', 'pada', 'dalam', 'yang', 'ini', 'itu',
  'sudah', 'belum', 'akan', 'sedang', 'masih', 'lagi', 'juga', 'sangat',
  'esok', 'semalam', 'hari', 'minggu', 'bulan', 'pagi', 'petang', 'malam',
  'tempah', 'tempahan', 'bayar', 'bayaran', 'harga', 'duit', 'wang',
  'rumah', 'bilik', 'dapur', 'bocor', 'rosak', 'sejuk', 'bersih', 'cuci',
  'terima', 'kasih', 'tolong', 'sila', 'maaf', 'khidmat', 'komisen',
]);

// Words that look Malay to a naive matcher but are ordinary English. Without
// this, "I can pay" scores as Malay on "pay"/"ada"-adjacent noise.
const AMBIGUOUS = new Set(['ada', 'apa', 'lagi', 'ini', 'itu']);

const words = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .split(/\s+/)
  .filter(Boolean);

/**
 * Detect the language of a single message.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.fallback]  returned when there is no signal
 * @returns {{ locale: string, confident: boolean }}
 */
export function detectLocale(text, { fallback = DEFAULT_LOCALE } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return { locale: fallback, confident: false };

  const tokens = words(raw);
  if (tokens.length === 0) return { locale: fallback, confident: false };

  let strong = 0;
  let weak = 0;
  for (const t of tokens) {
    if (!MS_WORDS.has(t)) continue;
    if (AMBIGUOUS.has(t)) weak += 1;
    else strong += 1;
  }

  // One unambiguous Malay function word in a short message is enough; longer
  // messages need proportionally more so a single loanword doesn't flip a
  // sentence that is otherwise English.
  const threshold = tokens.length <= 6 ? 1 : 2;
  if (strong >= threshold) return { locale: 'ms', confident: true };
  if (strong + weak >= threshold + 1) return { locale: 'ms', confident: false };

  return { locale: 'en', confident: tokens.length > 2 };
}

/**
 * Resolve which locale to answer in.
 *
 * Order: explicit session choice → account preference → detection → header →
 * default. Detection outranks the header because the header is a device setting
 * and the message is evidence of what the person is actually writing in.
 *
 * @param {object} params
 * @param {string} [params.explicit]      set by the language switcher
 * @param {string} [params.userPreferred] User.preferredLocale
 * @param {string} [params.message]       the current turn
 * @param {string} [params.acceptLanguage] raw Accept-Language header
 * @returns {string}
 */
export function resolveLocale({ explicit, userPreferred, message, acceptLanguage } = {}) {
  if (isLocale(explicit)) return explicit;

  const detected = message ? detectLocale(message, { fallback: null }) : { locale: null, confident: false };
  // A confident detection beats a stale account preference — someone who
  // switches to Malay mid-conversation gets Malay back, not their profile
  // setting from signup.
  if (detected.confident && isLocale(detected.locale)) return detected.locale;

  if (isLocale(userPreferred)) return userPreferred;
  if (isLocale(detected.locale)) return detected.locale;

  const fromHeader = parseAcceptLanguage(acceptLanguage);
  if (isLocale(fromHeader)) return fromHeader;

  return DEFAULT_LOCALE;
}

/** First supported language in an Accept-Language header, or null. */
export function parseAcceptLanguage(header) {
  if (!header) return null;
  const tags = String(header)
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const base = tag.split('-')[0];
    if (base === 'ms' || base === 'id') return 'ms'; // Indonesian readers manage Malay
    if (base === 'en') return 'en';
  }
  return null;
}

/**
 * Read a localised value.
 *
 * Accepts a bare string (treated as English) so the pre-existing single-language
 * corpus entries keep working untouched, or an { en, ms } map. Falls back to
 * English rather than returning nothing — a missing Malay string should show the
 * English answer, not an empty bubble.
 *
 * @param {string|object} value
 * @param {string} locale
 * @returns {string}
 */
export function t(value, locale = DEFAULT_LOCALE) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[locale] || value[DEFAULT_LOCALE] || Object.values(value).find(Boolean) || '';
}
