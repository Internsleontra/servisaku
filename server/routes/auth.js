import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminAuth } from '../firebaseAdmin.js';
import { sendMail } from '../lib/mailer.js';
import { sendSms, isSmsReady } from '../lib/sms.js';
import { requestOtp, verifyOtp } from '../lib/otp.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(120),
  // Self-registration may never create privileged accounts.
  role: z.enum(['consumer', 'partner']).default('consumer'),
});

const loginSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});

// Fields a user may change on their own profile. Privileged flags
// (role, partnerVerified, partnerRating) are admin-only via PATCH /api/users/:id.
const meSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).nullish(),
  city: z.string().max(100).nullish(),
  bio: z.string().max(2000).nullish(),
  avatarUrl: z.string().max(2000).nullish(),
  partnerCategory: z.string().max(100).nullish(),
  bankAccount: z.string().max(100).nullish(),
});

function signToken(user, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

// Refresh token — long-lived, carries the user's tokenVersion so bumping it
// (logout-all) invalidates every outstanding refresh token.
function signRefreshToken(user, deviceId) {
  return jwt.sign(
    { id: user.id, type: 'refresh', tv: user.tokenVersion ?? 0, did: deviceId || null },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// E.164-ish normalisation (the app sends country code + number already).
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^0-9+]/g, '');
  if (!d.startsWith('+')) d = `+${d}`;
  return d;
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, fullName, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, role },
    });

    const token = signToken(user);
    res.json({ access_token: token, user: sanitize(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/firebase
router.post('/firebase', async (req, res, next) => {
  try {
    const { token, role = 'consumer', fullName } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    if (!adminAuth) return res.status(503).json({ error: 'Phone/Google sign-in is not configured on the server' });

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { uid, email, phone_number, name } = decodedToken;
    // Name to use when creating a fresh account: explicit signup name → Google
    // display name → a neutral placeholder.
    const displayName = (typeof fullName === 'string' && fullName.trim()) || name || 'User';

    // We search by firebaseUid first. If not found, try by email or phone (to link existing accounts)
    let user = await prisma.user.findUnique({ where: { firebaseUid: uid } });

    if (!user) {
      if (email) {
        user = await prisma.user.findUnique({ where: { email } });
      }
      
      // If user still not found, we create a new one
      if (!user) {
        user = await prisma.user.create({
          data: {
            firebaseUid: uid,
            email: email || null,
            phone: phone_number || null,
            fullName: displayName,
            role,
          },
        });
      } else {
        // Link existing user to this Firebase UID
        user = await prisma.user.update({
          where: { id: user.id },
          data: { firebaseUid: uid },
        });
      }
    }

    // Issue our internal JWT for the rest of the application
    const internalToken = signToken(user);
    res.json({ access_token: internalToken, user: sanitize(user) });
  } catch (err) {
    console.error('Firebase Auth Error:', err);
    res.status(401).json({ error: 'Invalid or expired Firebase token' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ access_token: token, user: sanitize(user) });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(sanitize(user));
  } catch (err) { next(err); }
});

// PATCH /api/auth/me — whitelisted profile fields only
router.patch('/me', authenticate, validate(meSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({ where: { id: req.user.id }, data: req.body });
    res.json(sanitize(user));
  } catch (err) { next(err); }
});

// PATCH /api/auth/consumer-profile — merge consumer-only fields into the
// consumerProfile JSON (gender, birthday, language, comms preferences, …).
const consumerProfileSchema = z.object({
  gender: z.enum(['male', 'female', 'prefer_not_to_say']).nullish(),
  birthday: z.string().max(30).nullish(),
  language: z.string().max(10).nullish(),
  nationality: z.string().max(60).nullish(),
  timezone: z.string().max(60).nullish(),
  comms: z.record(z.any()).optional(), // { marketing:{push,sms,email,whatsapp}, transactional:{…} }
  notifPrefs: z.record(z.any()).optional(), // { [category]: { push,sms,email,whatsapp } }
  muteUntil: z.string().max(40).nullish(),
}).strict();

router.patch('/consumer-profile', authenticate, validate(consumerProfileSchema), async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user.id } });
    const merged = { ...(current?.consumerProfile ?? {}), ...req.body };
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { consumerProfile: merged } });
    res.json(sanitize(user));
  } catch (err) { next(err); }
});

// POST /api/auth/logout  (client-side token removal, server just acks)
router.post('/logout', (req, res) => res.json({ ok: true }));

// --- Password reset (stateless, single-use JWT — no schema/table needed) ---
// The token is bound to a fingerprint of the current passwordHash, so once the
// password changes the link can't be reused.
function resetFingerprint(user) {
  return crypto.createHash('sha256').update(user.passwordHash || user.id).digest('hex').slice(0, 16);
}
function makeResetToken(user) {
  return jwt.sign({ id: user.id, kind: 'pwreset', v: resetFingerprint(user) }, process.env.JWT_SECRET, { expiresIn: '30m' });
}

const forgotSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
});

// POST /api/auth/forgot-password — always 200 (never reveals if an email exists).
router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    let devLink;
    if (user && user.passwordHash) {
      const token = makeResetToken(user);
      const base = process.env.WEB_APP_URL || 'http://localhost:5173';
      const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      const { delivered } = await sendMail({
        to: user.email,
        subject: 'Reset your ServisAku password',
        text: `Reset your ServisAku password using this link (valid for 30 minutes):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `<p>Reset your ServisAku password using the link below (valid for 30 minutes):</p><p><a href="${link}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
      if (!delivered && process.env.NODE_ENV !== 'production') devLink = link;
    }
    res.json({ ok: true, ...(devLink ? { dev_reset_link: devLink } : {}) });
  } catch (err) { next(err); }
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

// POST /api/auth/reset-password — verify token, set new password, log the user in.
router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.body.token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }
    if (payload.kind !== 'pwreset') return res.status(400).json({ error: 'Invalid reset token' });

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(400).json({ error: 'Invalid reset token' });
    if (payload.v !== resetFingerprint(user)) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ access_token: signToken(updated), user: sanitize(updated) });
  } catch (err) { next(err); }
});

/* ------------------------------ Phone OTP (custom, passwordless) ----------- */

const otpRequestSchema = z.object({ phone: z.string().min(6).max(20) });

// POST /api/auth/otp/request — issue an OTP; tells the app if the phone exists.
router.post('/otp/request', validate(otpRequestSchema), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const existing = await prisma.user.findFirst({ where: { phone } });

    const r = requestOtp(phone);
    if (!r.ok) {
      const status = r.error === 'invalid' ? 400 : 429;
      return res.status(status).json({ error: r.error, retry_after: r.retryAfter });
    }
    await sendSms({ to: phone, body: `Your ServisAku verification code is ${r.code}. It expires in 5 minutes.` });

    res.json({
      existing_user: !!existing,
      expires_in: r.expiresInSec,
      resend_in: r.cooldownSec,
      sends_left: r.sendsLeft,
      // Dev only (no SMS provider): surface the code so the flow is testable.
      ...(!isSmsReady && process.env.NODE_ENV !== 'production' ? { dev_code: r.code } : {}),
    });
  } catch (err) { next(err); }
});

const otpVerifySchema = z.object({
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(8),
  device_id: z.string().max(128).optional(),
  full_name: z.string().max(120).optional(),
});

// POST /api/auth/otp/verify — verify code, log in (or create a phone-only user).
router.post('/otp/verify', validate(otpVerifySchema), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const r = verifyOtp(phone, req.body.code);
    if (!r.ok) {
      const status = r.error === 'locked' ? 423 : 400;
      return res.status(status).json({ error: r.error, attempts_left: r.attemptsLeft, retry_after: r.retryAfter });
    }

    let user = await prisma.user.findFirst({ where: { phone } });
    let isNew = false;
    if (!user) {
      user = await prisma.user.create({
        data: { phone, fullName: (req.body.full_name || 'Guest').trim(), role: 'consumer', profileComplete: false },
      });
      isNew = true;
    }
    const needsProfile = isNew || !user.profileComplete;

    res.json({
      access_token: signToken(user, '2h'),
      refresh_token: signRefreshToken(user, req.body.device_id),
      user: sanitize(user),
      is_new_user: needsProfile,
    });
  } catch (err) { next(err); }
});

const refreshSchema = z.object({ refresh_token: z.string().min(10), device_id: z.string().max(128).optional() });

// POST /api/auth/refresh — rotate an access token (and the refresh token).
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    let payload;
    try { payload = jwt.verify(req.body.refresh_token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token' });

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || (user.tokenVersion ?? 0) !== payload.tv) {
      return res.status(401).json({ error: 'Session revoked' });
    }
    res.json({
      access_token: signToken(user, '2h'),
      refresh_token: signRefreshToken(user, payload.did || req.body.device_id),
    });
  } catch (err) { next(err); }
});

// POST /api/auth/logout-all — revoke every device's refresh token.
router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* --------------------------- Complete profile (new users) ------------------ */

const completeProfileSchema = z.object({
  full_name: z.string().min(2).max(60),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()).optional(),
  gender: z.enum(['male', 'female', 'prefer_not_to_say']).optional(),
  birthday: z.string().max(30).optional(),
  referral_code: z.string().max(30).optional(),
});

// POST /api/auth/complete-profile — finish a phone-only signup.
router.post('/complete-profile', authenticate, validate(completeProfileSchema), async (req, res, next) => {
  try {
    const { full_name, email, gender, birthday, referral_code } = req.body;
    if (email) {
      const clash = await prisma.user.findFirst({ where: { email, NOT: { id: req.user.id } } });
      if (clash) return res.status(409).json({ error: 'That email is already in use' });
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        fullName: full_name.trim(),
        ...(email ? { email } : {}),
        consumerProfile: { gender: gender ?? null, birthday: birthday ?? null, referralCode: referral_code ?? null },
        profileComplete: true,
      },
    });
    res.json(sanitize(user));
  } catch (err) { next(err); }
});

function sanitize(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export default router;
