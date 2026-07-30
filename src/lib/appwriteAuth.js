/**
 * appwriteAuth.js — thin wrappers over the Appwrite Account API for every
 * login path ServisAku supports. Consumed by AuthContext + OTPLogin.
 *
 * OTP flows are two-step:
 *   1) request → Appwrite creates (or reuses) a user and sends the code,
 *      returning a userId.
 *   2) verify  → exchange { userId, secret(code) } for a session.
 */
import { account, ID } from './appwrite';

/* ── Session / identity ── */
export const getCurrentUser = () => account.get();               // throws if no session
export const logout = () => account.deleteSession('current');
export const createJWT = () => account.createJWT();              // { jwt } for the backend

/* ── Email + password ── */
export async function loginEmailPassword(email, password) {
  return account.createEmailPasswordSession(email, password);
}
export async function registerEmailPassword(email, password, name) {
  await account.create(ID.unique(), email, password, name);
  return account.createEmailPasswordSession(email, password);
}

/**
 * Appwrite refuses createSession() outright while any session is still active:
 *   401 user_session_already_exists
 *   "Creation of a session is prohibited when a session is active."
 * A stale session survives a half-finished login, a browser refresh, or simply
 * revisiting /otp-login while signed in — and then every subsequent OTP verify
 * fails no matter how correct the code is. Signing in again must always be
 * allowed, so drop whatever is there first.
 */
async function clearActiveSession() {
  try {
    await account.deleteSession('current');
  } catch {
    /* no active session — nothing to clear */
  }
}

/* ── Email OTP ── */
export async function requestEmailOtp(email) {
  const token = await account.createEmailToken(ID.unique(), email); // { userId }
  return token.userId;
}
export async function verifyEmailOtp(userId, code) {
  await clearActiveSession();
  return account.createSession(userId, code);
}

/* ── Phone OTP ── */
export async function requestPhoneOtp(phone) {
  const token = await account.createPhoneToken(ID.unique(), phone); // { userId }
  return token.userId;
}
export async function verifyPhoneOtp(userId, code) {
  await clearActiveSession();
  return account.createSession(userId, code);
}
