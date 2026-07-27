import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../lib/access.js';
import { getOrCreatePreference } from '../lib/notifications/dispatcher.js';

const router = Router();
router.use(authenticate);

function mapOut(p) {
  return {
    user_id: p.userId,
    push_enabled: p.pushEnabled,
    email_enabled: p.emailEnabled,
    sms_enabled: p.smsEnabled,
    booking_enabled: p.bookingEnabled,
    payment_enabled: p.paymentEnabled,
    promotion_enabled: p.promotionEnabled,
    wallet_enabled: p.walletEnabled,
    support_enabled: p.supportEnabled,
    security_enabled: p.securityEnabled,
    review_enabled: p.reviewEnabled,
    sound_enabled: p.soundEnabled,
    vibration_enabled: p.vibrationEnabled,
    do_not_disturb: p.doNotDisturb,
    dnd_start: p.dndStart,
    dnd_end: p.dndEnd,
    language: p.language,
    timezone: p.timezone,
    updated_at: p.updatedAt,
  };
}

// GET /api/notification-settings — the caller's preferences (created on first read).
router.get('/', asyncHandler(async (req, res) => {
  const pref = await getOrCreatePreference(req.user.id);
  res.json(mapOut(pref));
}));

// PATCH /api/notification-settings — partial update of the caller's preferences.
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'expected HH:MM').nullable();
const updateSchema = z.object({
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  booking_enabled: z.boolean().optional(),
  payment_enabled: z.boolean().optional(),
  promotion_enabled: z.boolean().optional(),
  wallet_enabled: z.boolean().optional(),
  support_enabled: z.boolean().optional(),
  security_enabled: z.boolean().optional(),
  review_enabled: z.boolean().optional(),
  sound_enabled: z.boolean().optional(),
  vibration_enabled: z.boolean().optional(),
  do_not_disturb: z.boolean().optional(),
  dnd_start: hhmm.optional(),
  dnd_end: hhmm.optional(),
  language: z.enum(['en', 'bm']).optional(),
  timezone: z.string().max(64).optional(),
}).strict();

// snake_case API field → Prisma column.
const FIELD_MAP = {
  push_enabled: 'pushEnabled', email_enabled: 'emailEnabled', sms_enabled: 'smsEnabled',
  booking_enabled: 'bookingEnabled', payment_enabled: 'paymentEnabled', promotion_enabled: 'promotionEnabled',
  wallet_enabled: 'walletEnabled', support_enabled: 'supportEnabled', security_enabled: 'securityEnabled',
  review_enabled: 'reviewEnabled', sound_enabled: 'soundEnabled', vibration_enabled: 'vibrationEnabled',
  do_not_disturb: 'doNotDisturb', dnd_start: 'dndStart', dnd_end: 'dndEnd',
  language: 'language', timezone: 'timezone',
};

router.patch('/', validate(updateSchema), asyncHandler(async (req, res) => {
  await getOrCreatePreference(req.user.id); // ensure a row exists
  const data = {};
  for (const [apiKey, col] of Object.entries(FIELD_MAP)) {
    if (req.body[apiKey] !== undefined) data[col] = req.body[apiKey];
  }
  const pref = await prisma.notificationPreference.update({ where: { userId: req.user.id }, data });
  res.json(mapOut(pref));
}));

export default router;
