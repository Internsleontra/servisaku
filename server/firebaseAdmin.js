import fs from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialise Firebase Admin so /auth/firebase can verify client ID tokens.
// firebase-admin v14 only exposes the modular API (firebase-admin/app, /auth) —
// the old namespaced `admin.apps`/`admin.auth()` shape is gone.
//
// Provide credentials any one of these ways (see repo-root .env):
//   1. FIREBASE_SERVICE_ACCOUNT       = the service-account JSON as a single-line string
//   2. FIREBASE_SERVICE_ACCOUNT_PATH  = path to the downloaded service-account .json
//   3. GOOGLE_APPLICATION_CREDENTIALS = path to the service-account .json
// If none is set, adminAuth stays null and token verification returns 401
// (the rest of the API keeps working).

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && fs.existsSync(path)) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }
  return null;
}

let app = getApps()[0] ?? null;
if (!app) {
  try {
    const svc = loadServiceAccount();
    if (svc) {
      app = initializeApp({ credential: cert(svc) });
      console.log(`✅ Firebase Admin ready (project: ${svc.project_id})`);
    } else {
      console.warn('⚠️  Firebase Admin not configured — phone/Google login disabled. Set FIREBASE_SERVICE_ACCOUNT_PATH to your service-account .json.');
    }
  } catch (error) {
    console.error('Firebase Admin init failed:', error.message);
  }
}

export const adminAuth = app ? getAuth(app) : null;
export const isFirebaseAdminReady = Boolean(app);
