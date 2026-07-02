import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../lib/access.js';

const router = Router();
router.use(authenticate);

function mapOut(t) {
  return {
    id: t.id,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    booking_id: t.bookingId,
    created_date: t.createdAt,
  };
}

// GET /api/support — the caller's own tickets.
router.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.supportTicket.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(items.map(mapOut));
}));

const createSchema = z.object({
  category: z.enum(['technical', 'payment', 'booking', 'report_customer', 'other']),
  subject: z.string().min(3).max(140),
  message: z.string().min(5).max(4000),
  booking_id: z.string().max(60).optional(),
});

// POST /api/support — raise a ticket.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const item = await prisma.supportTicket.create({
    data: {
      userId: req.user.id,
      category: req.body.category,
      subject: req.body.subject,
      message: req.body.message,
      bookingId: req.body.booking_id ?? null,
    },
  });
  res.status(201).json(mapOut(item));
}));

export default router;
