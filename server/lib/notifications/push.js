// ─────────────────────────────────────────────────────────────────────────────
// Push notification adapter (FCM / Web Push / Expo).
//
// This is a *pluggable stub*, mirroring the mailer/sms pattern: when no provider
// is configured it logs to the console (in dev) and reports `delivered: false`,
// so the whole notification pipeline is exercisable without push credentials.
// Wire a real provider by calling `setPushProvider(fn)` at boot, or by
// configuring FCM/VAPID env and implementing `defaultProvider` below.
// ─────────────────────────────────────────────────────────────────────────────

// Signature a provider must implement:
//   async ({ tokens: [{token, platform, provider}], title, body, data }) => { delivered, results }
let provider = null;

export function setPushProvider(fn) {
  provider = fn;
}

// Ready when a custom provider is set or FCM credentials exist in the env.
export function isPushReady() {
  return Boolean(provider) || Boolean(process.env.FCM_SERVER_KEY || process.env.FCM_SERVICE_ACCOUNT);
}

/**
 * Send a push to a set of device tokens. Never throws — push is best-effort and
 * must not break the notification pipeline.
 */
export async function sendPush({ tokens = [], title, body, data = {} }) {
  if (!tokens.length) return { delivered: false, reason: 'no_tokens' };

  if (provider) {
    try {
      return await provider({ tokens, title, body, data });
    } catch (err) {
      return { delivered: false, reason: String(err.message || err) };
    }
  }

  // No provider configured — log in dev so the flow is observable.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n🔔 [DEV push — no provider configured]\n  → ${tokens.length} device(s)\n  ${title}\n  ${body}\n`);
  }
  return { delivered: false, reason: 'no_provider' };
}
