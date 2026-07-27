// ─────────────────────────────────────────────────────────────────────────────
// Preference gating — pure logic deciding which channels a notification may use
// for a given recipient, based on their NotificationPreference row.
//
// Rules:
//   • in_app is (almost) always allowed so the notification center stays complete;
//     it's suppressed only when the recipient disabled that whole category.
//   • Category toggles (bookingEnabled, paymentEnabled, …) gate every channel.
//   • Channel toggles (pushEnabled, emailEnabled, smsEnabled) gate their channel.
//   • Do-Not-Disturb (explicit flag or quiet-hours window) suppresses the noisy
//     channels (push, sms, email) — but never in_app, and never for `urgent`.
//   • Security notifications are always delivered in_app regardless of prefs
//     (a user must always be able to see a security alert), and urgent security
//     events bypass DND on all channels.
//
// Kept free of DB / IO so it is trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

// Sensible defaults used when a user has no NotificationPreference row yet.
export const DEFAULT_PREFERENCES = {
  pushEnabled: true, emailEnabled: true, smsEnabled: true,
  bookingEnabled: true, paymentEnabled: true, promotionEnabled: true,
  walletEnabled: true, supportEnabled: true, securityEnabled: true, reviewEnabled: true,
  soundEnabled: true, vibrationEnabled: true,
  doNotDisturb: false, dndStart: null, dndEnd: null,
  language: 'en', timezone: 'Asia/Kuala_Lumpur',
};

// category → the preference boolean that switches the whole category off.
const CATEGORY_PREF = {
  bookings: 'bookingEnabled',
  jobs: 'bookingEnabled', // partner-side jobs ride the same master booking toggle
  payments: 'paymentEnabled',
  wallet: 'walletEnabled',
  promotions: 'promotionEnabled',
  support: 'supportEnabled',
  security: 'securityEnabled',
  reviews: 'reviewEnabled',
  system: null, // system/account notices are never fully silenced
};

const CHANNEL_PREF = {
  push: 'pushEnabled',
  email: 'emailEnabled',
  sms: 'smsEnabled',
  in_app: null, // in_app has no channel-level opt-out
};

/** Is the category enabled for this user? Security is always considered enabled. */
export function isCategoryEnabled(pref, category) {
  if (category === 'security') return true;
  const key = CATEGORY_PREF[category];
  if (!key) return true;
  return pref[key] !== false;
}

// "HH:MM" → minutes since midnight, or null if malformed.
function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Is DND active for this user at `now`? True when the explicit flag is set, or
 * when `now` falls inside the configured quiet-hours window (which may wrap
 * across midnight, e.g. 22:00 → 07:00).
 */
export function isDndActive(pref, now = new Date()) {
  if (pref.doNotDisturb) return true;
  const start = toMinutes(pref.dndStart);
  const end = toMinutes(pref.dndEnd);
  if (start == null || end == null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * Given a user's preferences and a rendered notification, return the concrete
 * list of channels that should actually be used (a subset of `requested`).
 *
 * @param pref       NotificationPreference-shaped object (defaults applied)
 * @param requested  channels the event wants to use (from the catalog)
 * @param opts       { category, priority, now }
 */
export function resolveChannels(pref, requested, { category, priority = 'normal', now = new Date() } = {}) {
  const p = { ...DEFAULT_PREFERENCES, ...(pref || {}) };
  const urgent = priority === 'urgent';
  const dnd = !urgent && isDndActive(p, now);
  const categoryOn = isCategoryEnabled(p, category);

  const out = [];
  for (const ch of requested) {
    if (ch === 'in_app') {
      // in_app is dropped only when the whole category is off (security exempt).
      if (categoryOn) out.push('in_app');
      continue;
    }
    if (!categoryOn) continue;                 // category disabled → no external channels
    const chKey = CHANNEL_PREF[ch];
    if (chKey && p[chKey] === false) continue; // channel disabled by user
    if (dnd) continue;                         // quiet hours → suppress noisy channels
    out.push(ch);
  }

  // Safety net: a security notification must always reach the in-app center.
  if (category === 'security' && !out.includes('in_app')) out.unshift('in_app');
  return out;
}
