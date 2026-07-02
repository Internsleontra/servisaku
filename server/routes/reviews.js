import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, getBookingOr404, emailsByIds, isAdmin } from '../lib/access.js';

const router = Router();

async function mapManyOut(items) {
  const emails = await emailsByIds(items.map((r) => r.userId));
  return items.map((r) => ({
    id: r.id,
    booking_id: r.bookingId,
    user_id: r.userId,
    user_email: emails[r.userId],
    rating: r.rating,
    comment: r.comment,
    photos: Array.isArray(r.photos) ? r.photos : [],
    created_date: r.createdAt,
  }));
}

// GET /api/reviews — public read (reviews are displayed on service pages)
router.get('/', asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.booking_id) where.bookingId = String(req.query.booking_id);
  const take = req.query._limit ? Math.min(Number(req.query._limit) || 50, 200) : 100;
  const items = await prisma.review.findMany({ where, take, orderBy: { createdAt: 'desc' } });
  res.json(await mapManyOut(items));
}));

// GET /api/reviews/mine — the partner's own reviews (with service + reviewer + reply).
router.get('/mine', authenticate, asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner' && !isAdmin(req.user)) throw new ApiError(403, 'Partners only');
  const items = await prisma.review.findMany({
    where: { booking: { partnerId: req.user.id } },
    include: { booking: { select: { serviceType: true } }, user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(items.map((r) => ({
    id: r.id,
    booking_id: r.bookingId,
    rating: r.rating,
    comment: r.comment,
    photos: Array.isArray(r.photos) ? r.photos : [],
    created_date: r.createdAt,
    reply: r.reply,
    replied_at: r.repliedAt,
    reported: r.reported,
    service_type: r.booking?.serviceType,
    reviewer_name: r.user?.fullName,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!item) throw new ApiError(404, 'Not found');
  res.json((await mapManyOut([item]))[0]);
}));

// Partner reply / report (only the booking's assigned partner).
async function reviewForPartner(id, user) {
  const review = await prisma.review.findUnique({ where: { id }, include: { booking: { select: { partnerId: true } } } });
  if (!review) throw new ApiError(404, 'Review not found');
  if (review.booking?.partnerId !== user.id && !isAdmin(user)) throw new ApiError(403, 'Forbidden');
  return review;
}

router.post('/:id/reply', authenticate, validate(z.object({ reply: z.string().min(1).max(1000) })), asyncHandler(async (req, res) => {
  const review = await reviewForPartner(req.params.id, req.user);
  const updated = await prisma.review.update({ where: { id: review.id }, data: { reply: req.body.reply, repliedAt: new Date() } });
  res.json({ id: updated.id, reply: updated.reply, replied_at: updated.repliedAt });
}));

router.post('/:id/report', authenticate, validate(z.object({ reason: z.string().min(1).max(500) })), asyncHandler(async (req, res) => {
  const review = await reviewForPartner(req.params.id, req.user);
  const updated = await prisma.review.update({ where: { id: review.id }, data: { reported: true, reportReason: req.body.reason } });
  res.json({ id: updated.id, reported: updated.reported });
}));

const createSchema = z.object({
  booking_id: z.string().min(1),
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().max(3000).nullish(),
  photos: z.array(z.string().max(2000)).max(6).optional(),
});

// POST /api/reviews — only the booking's consumer, only after completion, only once
router.post('/', authenticate, validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.body.booking_id);
  if (booking.consumerId !== req.user.id) {
    throw new ApiError(403, 'You can only review your own bookings');
  }
  if (booking.status !== 'completed') {
    throw new ApiError(400, 'You can only review completed bookings');
  }
  const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (existing) throw new ApiError(409, 'This booking has already been reviewed');

  const item = await prisma.review.create({
    data: {
      bookingId: booking.id,
      userId: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment ?? null,
      photos: req.body.photos ?? null,
    },
  });

  // Keep the partner's aggregate rating in sync.
  if (booking.partnerId) {
    const agg = await prisma.review.aggregate({
      where: { booking: { partnerId: booking.partnerId } },
      _avg: { rating: true },
    });
    await prisma.user.update({
      where: { id: booking.partnerId },
      data: { partnerRating: Math.round((agg._avg.rating ?? req.body.rating) * 10) / 10 },
    });
  }

  res.status(201).json((await mapManyOut([item]))[0]);
}));

// Moderation only — authors cannot edit reviews after submission.
router.patch('/:id', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.comment !== undefined) data.comment = String(req.body.comment).slice(0, 3000);
  if (req.body.rating !== undefined) data.rating = Math.min(5, Math.max(1, Number(req.body.rating)));
  const item = await prisma.review.update({ where: { id: req.params.id }, data });
  res.json((await mapManyOut([item]))[0]);
}));

router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  await prisma.review.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
