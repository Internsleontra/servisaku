import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, getBookingOr404, isBookingParticipant, emailsByIds } from '../lib/access.js';
import { localizedError } from '../lib/errors.js';
import { localeOf } from '../lib/locale.js';

const router = Router();
router.use(authenticate);

async function mapManyOut(items) {
  const emails = await emailsByIds(items.map((m) => m.senderId));
  return items.map((m) => ({
    id: m.id,
    booking_id: m.bookingId,
    sender_id: m.senderId,
    sender_email: emails[m.senderId],
    sender_name: m.senderName,
    sender_role: m.senderRole,
    message: m.message,
    message_type: m.type,
    file_url: m.fileUrl,
    is_read: m.isRead,
    read_at: m.readAt,
    created_date: m.createdAt,
  }));
}

// GET /api/chat?booking_id=… — booking participants and admins only
router.get('/', asyncHandler(async (req, res) => {
  const bookingId = req.query.booking_id;
  if (!bookingId) throw new ApiError(400, 'booking_id is required');
  const booking = await getBookingOr404(String(bookingId), localeOf(req));
  if (!isBookingParticipant(req.user, booking)) throw localizedError(403, 'forbidden', localeOf(req));

  const take = req.query._limit ? Math.min(Number(req.query._limit) || 100, 500) : 100;
  const items = await prisma.chatMessage.findMany({
    where: { bookingId: booking.id },
    take,
    orderBy: { createdAt: 'asc' },
  });
  res.json(await mapManyOut(items));
}));

const createSchema = z.object({
  booking_id: z.string().min(1),
  message: z.string().min(1).max(2000),
  message_type: z.enum(['text', 'image', 'system']).default('text'),
  file_url: z.string().max(2000).nullish(),
});

// POST /api/chat — sender identity always comes from the token, never the body
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.body.booking_id, localeOf(req));
  if (!isBookingParticipant(req.user, booking)) throw localizedError(403, 'forbidden', localeOf(req));

  const sender = await prisma.user.findUnique({ where: { id: req.user.id } });
  const item = await prisma.chatMessage.create({
    data: {
      bookingId: booking.id,
      senderId: req.user.id,
      senderName: sender?.fullName ?? 'User',
      senderRole: req.user.role,
      message: req.body.message,
      type: req.body.message_type,
      fileUrl: req.body.file_url ?? null,
    },
  });
  res.status(201).json((await mapManyOut([item]))[0]);
}));

const patchSchema = z.object({
  is_read: z.boolean(),
});

// PATCH /api/chat/:id — recipients may mark messages read; nothing else is mutable
router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
  const message = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!message) throw localizedError(404, 'not_found', localeOf(req));
  const booking = await getBookingOr404(message.bookingId, localeOf(req));
  if (!isBookingParticipant(req.user, booking)) throw localizedError(403, 'forbidden', localeOf(req));

  const item = await prisma.chatMessage.update({
    where: { id: message.id },
    data: { isRead: req.body.is_read, readAt: req.body.is_read ? new Date() : null },
  });
  res.json((await mapManyOut([item]))[0]);
}));

export default router;
