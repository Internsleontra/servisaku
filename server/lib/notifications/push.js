// ─────────────────────────────────────────────────────────────────────────────
// Push notification adapter (FCM / Web Push / Expo).
//
// Two real transports, chosen per device from PushToken.provider:
//   • Expo  — the servisaku-consumer and servisaku-partner apps
//   • FCM   — web and any native build not going through Expo (HTTP v1; the
//             legacy server-key API is deprecated)
//
// Still pluggable and still inert when unconfigured, mirroring the mailer/sms
// pattern: without credentials it logs to the console in dev and reports
// `delivered: false`, so the pipeline stays exercisable. Override entirely with
// setPushProvider(fn).
//
// A token the provider reports as dead (Expo DeviceNotRegistered, FCM
// UNREGISTERED) is returned in `invalidTokens` so the caller can delete it
// rather than retrying it on every future notification.
// ─────────────────────────────────────────────────────────────────────────────

// Signature a provider must implement:
//   async ({ tokens: [{token, platform, provider}], title, body, data }) => { delivered, results }
let provider = null;

export function setPushProvider(fn) {
  provider = fn;
}

// Ready when a custom provider is set, FCM credentials exist, or Expo is usable.
// Expo's push API needs no credentials for basic sends, so a deployment with the
// Expo apps alone is genuinely push-capable.
export function isPushReady() {
  return Boolean(provider)
    || Boolean(process.env.FCM_SERVER_KEY || process.env.FCM_SERVICE_ACCOUNT)
    || process.env.EXPO_PUSH_ENABLED !== 'false';
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

  // Expo tokens go to Expo's push service; everything else to FCM. Both Expo
  // apps register `provider: 'expo'` (PushToken.provider), so the split is
  // already recorded per device.
  const expoTokens = tokens.filter((t) => t.provider === 'expo' || String(t.token).startsWith('ExponentPushToken'));
  const fcmTokens = tokens.filter((t) => !expoTokens.includes(t));

  const results = [];
  const invalidTokens = [];

  if (expoTokens.length) {
    const r = await sendViaExpo(expoTokens, { title, body, data });
    results.push(r);
    invalidTokens.push(...(r.invalidTokens || []));
  }
  if (fcmTokens.length && isFcmReady()) {
    const r = await sendViaFcm(fcmTokens, { title, body, data });
    results.push(r);
    invalidTokens.push(...(r.invalidTokens || []));
  }

  if (results.length === 0) {
    // Nothing configured — log in dev so the flow is still observable.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n🔔 [DEV push — no provider configured]\n  → ${tokens.length} device(s)\n  ${title}\n  ${body}\n`);
    }
    return { delivered: false, reason: 'no_provider' };
  }
  return { delivered: results.some((r) => r.delivered), results, invalidTokens };
}

// ─── Expo ────────────────────────────────────────────────────────────────────
// Expo's push API needs no credentials for basic sends; EXPO_ACCESS_TOKEN is
// only required if "enhanced security" is enabled on the Expo account.
async function sendViaExpo(tokens, { title, body, data }) {
  const messages = tokens.map((t) => ({
    to: t.token, title, body, data, sound: 'default', priority: 'high',
  }));
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { delivered: false, provider: 'expo', reason: `expo ${res.status}` };

    // DeviceNotRegistered means the app was uninstalled — the token is dead and
    // the caller deletes it rather than retrying it forever.
    const invalidTokens = [];
    (json.data || []).forEach((r, i) => {
      if (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(tokens[i].token);
      }
    });
    return { delivered: true, provider: 'expo', invalidTokens, raw: json };
  } catch (err) {
    return { delivered: false, provider: 'expo', reason: String(err.message) };
  }
}

// ─── FCM (HTTP v1) ───────────────────────────────────────────────────────────
const isFcmReady = () => Boolean(process.env.FCM_SERVICE_ACCOUNT || process.env.FCM_SERVER_KEY);

let cachedFcmToken = null;

/**
 * Mint an OAuth access token from the service account.
 * FCM HTTP v1 requires this; the legacy server-key API is deprecated.
 */
async function fcmAccessToken() {
  if (cachedFcmToken && cachedFcmToken.exp > Date.now() + 60_000) return cachedFcmToken.token;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;

  const sa = JSON.parse(raw);
  const { createSign } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || 'FCM token exchange failed');
  cachedFcmToken = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedFcmToken.token;
}

async function sendViaFcm(tokens, { title, body, data }) {
  try {
    const accessToken = await fcmAccessToken();
    if (!accessToken) return { delivered: false, provider: 'fcm', reason: 'no_service_account' };
    const projectId = JSON.parse(process.env.FCM_SERVICE_ACCOUNT).project_id;

    const invalidTokens = [];
    let anyDelivered = false;

    // HTTP v1 sends one message per token; batching was a legacy-API feature.
    for (const t of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title, body },
            // FCM data values must all be strings.
            data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')])),
          },
        }),
      });
      if (res.ok) { anyDelivered = true; continue; }
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.details?.[0]?.errorCode || err?.error?.status;
      if (code === 'UNREGISTERED' || res.status === 404) invalidTokens.push(t.token);
    }
    return { delivered: anyDelivered, provider: 'fcm', invalidTokens };
  } catch (err) {
    return { delivered: false, provider: 'fcm', reason: String(err.message) };
  }
}
