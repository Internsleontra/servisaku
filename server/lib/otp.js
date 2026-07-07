import crypto from 'node:crypto';

// In-memory OTP challenge store keyed by E.164 phone.
// NOTE: single-process / dev only — move to Redis or a DB table for production
// (multi-instance) so limits and lockouts are shared across servers.
const store = new Map();

const CODE_TTL_MS = 5 * 60 * 1000;     // OTP valid for 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000;  // min 30s between sends
const MAX_SENDS = 5;                   // sends per window before lockout
const MAX_ATTEMPTS = 5;                // wrong-code attempts before lockout
const LOCK_MS = 15 * 60 * 1000;        // lockout duration
const WINDOW_MS = 15 * 60 * 1000;      // send-count window

const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Issue (or re-issue) an OTP, enforcing cooldown / send caps / lockout. */
export function requestOtp(phone) {
  const now = Date.now();
  let c = store.get(phone);

  if (c?.lockedUntil && c.lockedUntil > now) {
    return { ok: false, error: 'locked', retryAfter: Math.ceil((c.lockedUntil - now) / 1000) };
  }
  if (!c || now - (c.windowStart ?? 0) > WINDOW_MS) {
    c = { sends: 0, windowStart: now };
  }
  if (c.lastSentAt && now - c.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, error: 'cooldown', retryAfter: Math.ceil((RESEND_COOLDOWN_MS - (now - c.lastSentAt)) / 1000) };
  }
  if (c.sends >= MAX_SENDS) {
    c.lockedUntil = now + LOCK_MS;
    store.set(phone, c);
    return { ok: false, error: 'too_many_sends', retryAfter: Math.ceil(LOCK_MS / 1000) };
  }

  const code = genCode();
  c.codeHash = hash(code);
  c.expiresAt = now + CODE_TTL_MS;
  c.attempts = 0;
  c.sends += 1;
  c.lastSentAt = now;
  store.set(phone, c);

  return { ok: true, code, expiresInSec: CODE_TTL_MS / 1000, cooldownSec: RESEND_COOLDOWN_MS / 1000, sendsLeft: MAX_SENDS - c.sends };
}

/** Verify a submitted code, enforcing attempt caps / lockout. Consumes on success. */
export function verifyOtp(phone, code) {
  const now = Date.now();
  const c = store.get(phone);
  if (!c || !c.codeHash) return { ok: false, error: 'no_code' };
  if (c.lockedUntil && c.lockedUntil > now) {
    return { ok: false, error: 'locked', retryAfter: Math.ceil((c.lockedUntil - now) / 1000) };
  }
  if (c.expiresAt < now) return { ok: false, error: 'expired' };

  if (hash(code) !== c.codeHash) {
    c.attempts = (c.attempts ?? 0) + 1;
    if (c.attempts >= MAX_ATTEMPTS) {
      c.lockedUntil = now + LOCK_MS;
      c.codeHash = null;
    }
    store.set(phone, c);
    return { ok: false, error: 'invalid', attemptsLeft: Math.max(0, MAX_ATTEMPTS - c.attempts) };
  }

  store.delete(phone); // one-time use
  return { ok: true };
}
