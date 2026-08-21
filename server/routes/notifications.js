import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, findUserByEmail } from '../lib/access.js';
import { CATEGORIES } from '../lib/notifications/catalog.js';
import { mapOut } from '../lib/notifications/dispatcher.js';
import { localeOf } from '../lib/locale.js';
import { emitNotification, emitUnreadCount, emitNotificationUpdate } from '../lib/notifications/realtime.js';

const router = Router();
router.use(authenticate);

// Emit the caller's current unread badge count to all their connected devices.
async function pushUnread(userId) {
  const count = await prisma.notification.count({ where: { userId, isRead: false, isArchived: false } });
  emitUnreadCount(userId, count);
  return count;
}

// ─── GET /api/notifications ──────────────────────────────────────────────────
// Always scoped to the caller. Returns an array (backward-compatible with the
// existing web/mobile clients) plus X-Total-Count / X-Unread-Count headers for
// paginating UIs. Supports filtering by category, read/archive state, free-text
// search and a created-at date range.
const listSchema = z.object({
  category: z.string().optional(),          // one of CATEGORIES, or "all"
  is_read: z.enum(['true', 'false']).optional(),
  is_archived: z.enum(['true', 'false']).optional(),
  q: z.string().max(120).optional(),        // search title/body
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  _limit: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const q = listSchema.parse(req.query);
  const where = { userId: req.user.id };

  if (q.category && q.category !== 'all') {
    if (!CATEGORIES.includes(q.category)) throw new ApiError(400, `Unknown category "${q.category}"`);
    where.category = q.category;
  }
  if (q.is_read !== undefined) where.isRead = q.is_read === 'true';
  // Default view hides archived; pass is_archived=true to see the archive.
  where.isArchived = q.is_archived === 'true';
  if (q.q) where.OR = [
    { title: { contains: q.q, mode: 'insensitive' } },
    { body: { contains: q.q, mode: 'insensitive' } },
  ];
  if (q.from || q.to) where.createdAt = { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) };

  const limit = q.limit || q._limit || 50;
  const page = q.page || 1;
  const skip = (page - 1) * limit;

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, take: limit, skip, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false, isArchived: false } }),
  ]);

  res.set('X-Total-Count', String(total));
  res.set('X-Unread-Count', String(unread));
  res.set('X-Page', String(page));
  res.set('X-Has-More', String(skip + items.length < total));
  res.json(items.map((n) => mapOut(n, { locale: localeOf(req) })));
}));

// ─── GET /api/notifications/unread ───────────────────────────────────────────
router.get('/unread', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query._limit) || 50, 100);
  const items = await prisma.notification.findMany({
    where: { userId: req.user.id, isRead: false, isArchived: false },
    take: limit, orderBy: { createdAt: 'desc' },
  });
  res.json(items.map((n) => mapOut(n, { locale: localeOf(req) })));
}));

// ─── GET /api/notifications/count ────────────────────────────────────────────
router.get('/count', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [unread, total, grouped] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false, isArchived: false } }),
    prisma.notification.count({ where: { userId, isArchived: false } }),
    prisma.notification.groupBy({
      by: ['category'], where: { userId, isRead: false, isArchived: false }, _count: true,
    }),
  ]);
  const by_category = Object.fromEntries(grouped.map((g) => [g.category, g._count]));
  res.json({ unread, total, by_category });
}));

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
const readAllSchema = z.object({ category: z.string().optional() });
router.patch('/read-all', validate(readAllSchema), asyncHandler(async (req, res) => {
  const where = { userId: req.user.id, isRead: false };
  if (req.body.category && req.body.category !== 'all') where.category = req.body.category;
  const result = await prisma.notification.updateMany({ where, data: { isRead: true } });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'read_all', unread });
  res.json({ ok: true, updated: result.count, unread });
}));

// ─── DELETE /api/notifications/clear-all ─────────────────────────────────────
// Clears the caller's non-archived notifications (or a single category).
router.delete('/clear-all', asyncHandler(async (req, res) => {
  const where = { userId: req.user.id };
  if (req.query.category && req.query.category !== 'all') where.category = String(req.query.category);
  const result = await prisma.notification.deleteMany({ where });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'clear_all', unread });
  res.json({ ok: true, deleted: result.count });
}));

// ─── Push token registration ─────────────────────────────────────────────────
const pushTokenSchema = z.object({
  token: z.string().min(8).max(4096),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
  provider: z.enum(['fcm', 'webpush', 'expo']).default('fcm'),
  device_id: z.string().max(200).nullish(),
});
router.post('/push-token', validate(pushTokenSchema), asyncHandler(async (req, res) => {
  const { token, platform, provider, device_id } = req.body;
  const saved = await prisma.pushToken.upsert({
    where: { token },
    create: { userId: req.user.id, token, platform, provider, deviceId: device_id ?? null },
    update: { userId: req.user.id, platform, provider, deviceId: device_id ?? null, lastSeenAt: new Date() },
  });
  res.status(201).json({ ok: true, id: saved.id });
}));
router.delete('/push-token', asyncHandler(async (req, res) => {
  const token = req.query.token || req.body?.token;
  if (!token) throw new ApiError(400, 'token is required');
  await prisma.pushToken.deleteMany({ where: { userId: req.user.id, token: String(token) } });
  res.json({ ok: true });
}));

// ─── POST /api/notifications ─────────────────────────────────────────────────
// Direct create (admin broadcasts / legacy client flows). Lifecycle events flow
// through the server-side dispatcher instead; this remains for ad-hoc messages.
const createSchema = z.object({
  user_email: z.string().email().optional(), // defaults to self
  title: z.string().min(1).max(200),
  body: z.string().max(1000).default(''),
  message: z.string().max(1000).optional(),   // legacy alias for body
  type: z.string().max(30).default('info'),
  category: z.enum(CATEGORIES).default('system'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  icon: z.string().max(20).nullish(),
  action_url: z.string().max(500).nullish(),
  link: z.string().max(500).nullish(),        // legacy alias for action_url
});
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  let target = { id: req.user.id, role: req.user.role };
  if (req.body.user_email && req.body.user_email !== req.user.email) {
    const t = await findUserByEmail(req.body.user_email);
    if (!t) throw new ApiError(400, 'Target user not found');
    target = { id: t.id, role: t.role };
  }
  const actionUrl = req.body.action_url ?? req.body.link ?? null;
  const item = await prisma.notification.create({
    data: {
      userId: target.id, role: target.role,
      title: req.body.title, body: req.body.body || req.body.message || '',
      type: req.body.type, category: req.body.category, priority: req.body.priority,
      icon: req.body.icon ?? null, actionUrl, link: actionUrl,
      channel: 'in_app', deliveryStatus: 'sent', sentAt: new Date(),
    },
  });
  const out = mapOut(item, { locale: localeOf(req) });
  emitNotification(target.id, out);
  await pushUnread(target.id);
  res.status(201).json(out);
}));

// ─── Single-notification helpers ─────────────────────────────────────────────
async function ownedOr404(id, userId) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw new ApiError(404, 'Not found');
  if (n.userId !== userId) throw new ApiError(403, 'Forbidden');
  return n;
}

// GET /api/notifications/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const n = await ownedOr404(req.params.id, req.user.id);
  res.json(mapOut(n, { locale: localeOf(req) }));
}));

// PATCH /api/notifications/:id/read  { is_read? } — defaults to marking read.
const readSchema = z.object({ is_read: z.boolean().default(true) });
router.patch('/:id/read', validate(readSchema), asyncHandler(async (req, res) => {
  const n = await ownedOr404(req.params.id, req.user.id);
  const item = await prisma.notification.update({ where: { id: n.id }, data: { isRead: req.body.is_read } });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'read', id: n.id, is_read: item.isRead, unread });
  res.json(mapOut(item, { locale: localeOf(req) }));
}));

// PATCH /api/notifications/:id/archive  { is_archived? } — defaults to archiving.
const archiveSchema = z.object({ is_archived: z.boolean().default(true) });
router.patch('/:id/archive', validate(archiveSchema), asyncHandler(async (req, res) => {
  const n = await ownedOr404(req.params.id, req.user.id);
  const item = await prisma.notification.update({ where: { id: n.id }, data: { isArchived: req.body.is_archived } });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'archive', id: n.id, is_archived: item.isArchived, unread });
  res.json(mapOut(item, { locale: localeOf(req) }));
}));

// PATCH /api/notifications/:id — legacy path: update read/archive state.
const patchSchema = z.object({
  is_read: z.boolean().optional(),
  is_archived: z.boolean().optional(),
}).refine((v) => v.is_read !== undefined || v.is_archived !== undefined, { message: 'nothing to update' });
router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
  const n = await ownedOr404(req.params.id, req.user.id);
  const data = {};
  if (req.body.is_read !== undefined) data.isRead = req.body.is_read;
  if (req.body.is_archived !== undefined) data.isArchived = req.body.is_archived;
  const item = await prisma.notification.update({ where: { id: n.id }, data });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'update', id: n.id, unread });
  res.json(mapOut(item, { locale: localeOf(req) }));
}));

// DELETE /api/notifications/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const n = await ownedOr404(req.params.id, req.user.id);
  await prisma.notification.delete({ where: { id: n.id } });
  const unread = await pushUnread(req.user.id);
  emitNotificationUpdate(req.user.id, { action: 'delete', id: n.id, unread });
  res.json({ ok: true });
}));

export default router;
