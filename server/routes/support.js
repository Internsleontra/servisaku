import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin } from '../lib/access.js';
import { localizedError } from '../lib/errors.js';
import { localeOf } from '../lib/locale.js';
import {
  dueDates, priorityFor, breaches, canReopen, queueComparator,
  ESCALATION_LEVELS, REOPEN_WINDOW_DAYS,
} from '../lib/support/sla.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

// Support agents need ticket access without full admin rights. `support_agent`
// is deliberately NOT in ADMIN_ROLES (server/lib/access.js) — an agent must not
// inherit finance permissions.
const isAgent = (user) => isAdmin(user) || user?.role === 'support_agent';
const requireAgent = (req) => { if (!isAgent(req.user)) throw new ApiError(403, 'Support staff only'); };

const reference = () => `TKT-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;

const MAX_OPEN_TICKETS = 10;
// Named so the limit in the guard and the limit quoted in the error message
// cannot drift apart when one of them is changed.
const CALLBACK_MAX_DAYS_AHEAD = 30;

function mapOut(t, { forAgent = false } = {}) {
  return {
    id: t.id,
    reference: t.reference,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    booking_id: t.bookingId,
    created_date: t.createdAt,
    // Additive — existing clients ignore what they don't read.
    priority: t.priority,
    channel: t.channel,
    assigned_to_id: t.assignedToId,
    escalation_level: t.escalationLevel,
    sla_first_response_at: t.slaFirstResponseAt,
    sla_resolution_at: t.slaResolutionAt,
    sla_breaches: breaches(t),
    first_response_at: t.firstResponseAt,
    resolved_at: t.resolvedAt,
    closed_at: t.closedAt,
    reopen_count: t.reopenCount,
    can_reopen: canReopen(t),
    csat_rating: t.csatRating,
    csat_comment: t.csatComment,
    tags: t.tags ?? null,
    updated_at: t.updatedAt,
    ...(forAgent ? { user_id: t.userId } : {}),
  };
}

function mapMessage(m) {
  return {
    id: m.id,
    sender_id: m.senderId,
    sender_role: m.senderRole,
    message: m.message,
    is_internal: m.isInternal,
    attachments: m.attachments ?? null,
    created_date: m.createdAt,
  };
}

async function getTicketFor(req, id) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw localizedError(404, 'ticket_not_found', localeOf(req));
  if (!isAgent(req.user) && ticket.userId !== req.user.id) throw localizedError(403, 'forbidden', localeOf(req));
  return ticket;
}

// GET /api/support — own tickets; agents may pass ?all=true for the full queue.
router.get('/', asyncHandler(async (req, res) => {
  const wantsAll = isAgent(req.user) && String(req.query.all) === 'true';
  const where = wantsAll ? {} : { userId: req.user.id };
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.assigned_to_me === 'true' && isAgent(req.user)) where.assignedToId = req.user.id;

  const items = await prisma.supportTicket.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
  });
  res.json(items.map((t) => mapOut(t, { forAgent: wantsAll })));
}));

// GET /api/support/queue — agent work queue, breach risk first.
router.get('/queue', asyncHandler(async (req, res) => {
  requireAgent(req);
  const items = await prisma.supportTicket.findMany({
    where: { status: { notIn: ['resolved', 'closed'] } },
    take: 500,
  });
  items.sort(queueComparator());
  res.json(items.map((t) => mapOut(t, { forAgent: true })));
}));

// GET /api/support/stats — volume, response times, CSAT, breach rate.
router.get('/stats', asyncHandler(async (req, res) => {
  requireAgent(req);
  const tickets = await prisma.supportTicket.findMany({ take: 5000 });
  const open = tickets.filter((t) => !['resolved', 'closed'].includes(t.status));
  const rated = tickets.filter((t) => t.csatRating != null);
  const answered = tickets.filter((t) => t.firstResponseAt);

  const avgHours = (rows, field) => {
    if (!rows.length) return null;
    const total = rows.reduce((s, t) => s + (new Date(t[field]) - new Date(t.createdAt)), 0);
    return Number((total / rows.length / 3600_000).toFixed(2));
  };

  res.json({
    total: tickets.length,
    open: open.length,
    breaching: open.filter((t) => breaches(t).length > 0).length,
    avg_first_response_hours: avgHours(answered, 'firstResponseAt'),
    avg_resolution_hours: avgHours(tickets.filter((t) => t.resolvedAt), 'resolvedAt'),
    csat_average: rated.length ? Number((rated.reduce((s, t) => s + t.csatRating, 0) / rated.length).toFixed(2)) : null,
    csat_responses: rated.length,
    by_status: tickets.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {}),
    by_category: tickets.reduce((a, t) => { a[t.category] = (a[t.category] || 0) + 1; return a; }, {}),
  });
}));

const createSchema = z.object({
  category: z.enum(['technical', 'payment', 'booking', 'report_customer', 'refund', 'damage', 'account', 'complaint', 'other']),
  subject: z.string().min(3).max(140),
  message: z.string().min(5).max(4000),
  booking_id: z.string().max(60).optional(),
  channel: z.enum(['app', 'email', 'phone', 'chatbot', 'whatsapp']).default('app'),
  attachments: z.array(z.object({
    url: z.string().max(500), name: z.string().max(200).optional(),
    mimeType: z.string().max(100).optional(), sizeBytes: z.coerce.number().int().optional(),
  })).max(5).optional(),
});

// POST /api/support — raise a ticket.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const openCount = await prisma.supportTicket.count({
    where: { userId: req.user.id, status: { notIn: ['resolved', 'closed'] } },
  });
  if (openCount >= MAX_OPEN_TICKETS) {
    throw localizedError(429, 'ticket_limit_reached', localeOf(req), MAX_OPEN_TICKETS);
  }

  const priority = priorityFor(req.body.category);
  const item = await prisma.supportTicket.create({
    data: {
      userId: req.user.id,
      category: req.body.category,
      subject: req.body.subject,
      message: req.body.message,
      bookingId: req.body.booking_id ?? null,
      reference: reference(),
      priority,
      channel: req.body.channel,
      ...dueDates(priority),
    },
  });

  // The opening message is also the first thread entry, so the conversation
  // reads as one continuous exchange rather than a subject plus replies.
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: item.id,
      senderId: req.user.id,
      senderRole: req.user.role === 'partner' ? 'partner' : 'consumer',
      message: req.body.message,
      attachments: req.body.attachments ?? undefined,
    },
  });

  notify({
    userId: req.user.id, event: 'support_ticket_created',
    data: { ticketRef: item.reference, ticketId: item.id },
  }).catch(() => {});

  res.status(201).json(mapOut(item));
}));

// GET /api/support/:id — ticket + thread.
router.get('/:id', asyncHandler(async (req, res) => {
  const ticket = await getTicketFor(req, req.params.id);
  const agentView = isAgent(req.user);
  const messages = await prisma.supportTicketMessage.findMany({
    where: {
      ticketId: ticket.id,
      // Internal notes are filtered in the QUERY, not in the UI. A client-side
      // filter is one API call away from leaking an agent's private notes.
      ...(agentView ? {} : { isInternal: false }),
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ ...mapOut(ticket, { forAgent: agentView }), messages: messages.map(mapMessage) });
}));

// POST /api/support/:id/messages — reply.
const replySchema = z.object({
  message: z.string().min(1).max(4000),
  is_internal: z.boolean().default(false),
  attachments: z.array(z.object({
    url: z.string().max(500), name: z.string().max(200).optional(),
    mimeType: z.string().max(100).optional(), sizeBytes: z.coerce.number().int().optional(),
  })).max(5).optional(),
});
router.post('/:id/messages', validate(replySchema), asyncHandler(async (req, res) => {
  const ticket = await getTicketFor(req, req.params.id);
  const agent = isAgent(req.user);
  // Only staff can write an internal note — a customer marking their own message
  // internal would hide it from the agent meant to read it.
  const internal = agent && req.body.is_internal;

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderId: req.user.id,
      senderRole: agent ? 'agent' : (req.user.role === 'partner' ? 'partner' : 'consumer'),
      message: req.body.message,
      isInternal: internal,
      attachments: req.body.attachments ?? undefined,
    },
  });

  const data = {};
  // An internal note is not a response to the customer, so it must not stop the
  // first-response clock.
  if (agent && !internal && !ticket.firstResponseAt) data.firstResponseAt = new Date();
  if (agent && !internal && ticket.status === 'open') data.status = 'in_progress';
  if (!agent && ticket.status === 'awaiting_customer') data.status = 'in_progress';
  if (Object.keys(data).length) await prisma.supportTicket.update({ where: { id: ticket.id }, data });

  if (agent && !internal) {
    notify({
      userId: ticket.userId, event: 'support_reply',
      data: { ticketRef: ticket.reference, ticketId: ticket.id },
    }).catch(() => {});
  }
  res.status(201).json(mapMessage(message));
}));

// PATCH /api/support/:id — agent updates status, priority, tags.
const patchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'awaiting_customer', 'escalated']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});
router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
  requireAgent(req);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw localizedError(404, 'ticket_not_found', localeOf(req));

  const data = {};
  if (req.body.status) data.status = req.body.status;
  if (req.body.priority) {
    data.priority = req.body.priority;
    // Re-baseline the clocks: a ticket bumped to urgent should be measured
    // against the urgent target from now on.
    Object.assign(data, dueDates(req.body.priority));
  }
  if (req.body.tags) data.tags = req.body.tags;

  const updated = await prisma.supportTicket.update({ where: { id: ticket.id }, data });
  res.json(mapOut(updated, { forAgent: true }));
}));

// POST /api/support/:id/assign — claim or assign.
const assignSchema = z.object({ assignee_id: z.string().nullish() });
router.post('/:id/assign', validate(assignSchema), asyncHandler(async (req, res) => {
  requireAgent(req);
  const assigneeId = req.body.assignee_id === undefined ? req.user.id : req.body.assignee_id;
  const updated = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: { assignedToId: assigneeId },
  });
  if (assigneeId && assigneeId !== req.user.id) {
    notify({ userId: assigneeId, event: 'ticket_assigned', data: { ticketRef: updated.reference, ticketId: updated.id } }).catch(() => {});
  }
  res.json(mapOut(updated, { forAgent: true }));
}));

// POST /api/support/:id/escalate — bump a level.
const escalateSchema = z.object({ reason: z.string().min(5).max(500) });
router.post('/:id/escalate', validate(escalateSchema), asyncHandler(async (req, res) => {
  requireAgent(req);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw localizedError(404, 'ticket_not_found', localeOf(req));
  if (ticket.escalationLevel >= ESCALATION_LEVELS.MANAGER) {
    throw new ApiError(409, 'This ticket is already at the highest escalation level');
  }
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      escalationLevel: ticket.escalationLevel + 1,
      status: 'escalated',
      // Escalation clears the assignee so the ticket returns to the queue for
      // whoever handles the next level.
      assignedToId: null,
    },
  });
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id, senderId: req.user.id, senderRole: 'system',
      message: `Escalated to level ${updated.escalationLevel}: ${req.body.reason}`,
      isInternal: true,
    },
  });
  res.json(mapOut(updated, { forAgent: true }));
}));

// POST /api/support/:id/resolve — resolve and request CSAT.
const resolveSchema = z.object({ resolution: z.string().min(5).max(2000) });
router.post('/:id/resolve', validate(resolveSchema), asyncHandler(async (req, res) => {
  requireAgent(req);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw localizedError(404, 'ticket_not_found', localeOf(req));

  const now = new Date();
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: 'resolved', resolvedAt: now, firstResponseAt: ticket.firstResponseAt ?? now },
  });
  await prisma.supportTicketMessage.create({
    data: { ticketId: ticket.id, senderId: req.user.id, senderRole: 'agent', message: req.body.resolution },
  });

  notify({ userId: ticket.userId, event: 'support_ticket_closed', data: { ticketRef: ticket.reference } }).catch(() => {});
  notify({ userId: ticket.userId, event: 'csat_request', data: { ticketRef: ticket.reference, ticketId: ticket.id } }).catch(() => {});
  res.json(mapOut(updated, { forAgent: true }));
}));

// POST /api/support/:id/reopen — the owner reopens within the window.
router.post('/:id/reopen', asyncHandler(async (req, res) => {
  const ticket = await getTicketFor(req, req.params.id);
  if (ticket.userId !== req.user.id) throw localizedError(403, 'ticket_reopen_owner_only', localeOf(req));
  if (!canReopen(ticket)) {
    throw localizedError(409, 'ticket_reopen_limit', localeOf(req), REOPEN_WINDOW_DAYS);
  }
  const priority = ticket.priority;
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: 'reopened',
      reopenCount: { increment: 1 },
      resolvedAt: null,
      closedAt: null,
      ...dueDates(priority),
    },
  });
  res.json(mapOut(updated));
}));

// POST /api/support/:id/csat — rate, once.
const csatSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
router.post('/:id/csat', validate(csatSchema), asyncHandler(async (req, res) => {
  const ticket = await getTicketFor(req, req.params.id);
  if (ticket.userId !== req.user.id) throw localizedError(403, 'ticket_rate_owner_only', localeOf(req));
  if (ticket.csatRating != null) throw localizedError(409, 'ticket_already_rated', localeOf(req));
  if (!['resolved', 'closed'].includes(ticket.status)) throw localizedError(400, 'ticket_rate_after_resolved', localeOf(req));

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { csatRating: req.body.rating, csatComment: req.body.comment ?? null },
  });
  res.json(mapOut(updated));
}));

// ─── Callback requests ───────────────────────────────────────────────────────

function mapCallback(c, { masked = true } = {}) {
  const phone = c.phone || '';
  return {
    id: c.id,
    user_id: c.userId,
    // Phone numbers are PII: masked in list views, full value only to the
    // assigned agent (who has to dial it).
    phone: masked ? `••••${phone.slice(-4)}` : phone,
    preferred_from: c.preferredFrom,
    preferred_to: c.preferredTo,
    topic: c.topic,
    booking_id: c.bookingId,
    status: c.status,
    assigned_to_id: c.assignedToId,
    scheduled_at: c.scheduledAt,
    attempt_count: c.attemptCount,
    last_attempt_at: c.lastAttemptAt,
    completed_at: c.completedAt,
    outcome_note: c.outcomeNote,
    created_date: c.createdAt,
  };
}

router.get('/callbacks/list', asyncHandler(async (req, res) => {
  const agentView = isAgent(req.user) && String(req.query.all) === 'true';
  const where = agentView ? {} : { userId: req.user.id };
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.callbackRequest.findMany({ where, orderBy: { preferredFrom: 'asc' }, take: 200 });
  res.json(items.map((c) => mapCallback(c, { masked: !(agentView && c.assignedToId === req.user.id) })));
}));

const callbackSchema = z.object({
  phone: z.string().min(7).max(20),
  preferred_from: z.coerce.date(),
  preferred_to: z.coerce.date(),
  topic: z.string().max(200).optional(),
  booking_id: z.string().max(60).optional(),
});
router.post('/callbacks', validate(callbackSchema), asyncHandler(async (req, res) => {
  const { preferred_from: from, preferred_to: to } = req.body;
  if (from >= to) throw localizedError(400, 'callback_window_order', localeOf(req));
  if (from < new Date()) throw localizedError(400, 'callback_window_past', localeOf(req));
  if (from > new Date(Date.now() + CALLBACK_MAX_DAYS_AHEAD * 86400000)) {
    throw localizedError(400, 'callback_window_too_far', localeOf(req), CALLBACK_MAX_DAYS_AHEAD);
  }

  const item = await prisma.callbackRequest.create({
    data: {
      userId: req.user.id,
      phone: req.body.phone,
      preferredFrom: from,
      preferredTo: to,
      topic: req.body.topic ?? null,
      bookingId: req.body.booking_id ?? null,
    },
  });
  notify({ userId: req.user.id, event: 'callback_requested', data: { when: from.toLocaleString('en-MY') } }).catch(() => {});
  res.status(201).json(mapCallback(item));
}));

const callbackPatchSchema = z.object({
  status: z.enum(['scheduled', 'attempted', 'completed', 'cancelled']).optional(),
  scheduled_at: z.coerce.date().optional(),
  outcome_note: z.string().max(1000).optional(),
});
router.patch('/callbacks/:id', validate(callbackPatchSchema), asyncHandler(async (req, res) => {
  requireAgent(req);
  const existing = await prisma.callbackRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, 'Callback request not found');

  const data = { assignedToId: existing.assignedToId ?? req.user.id };
  if (req.body.status) data.status = req.body.status;
  if (req.body.scheduled_at) data.scheduledAt = req.body.scheduled_at;
  if (req.body.outcome_note !== undefined) data.outcomeNote = req.body.outcome_note;
  if (req.body.status === 'attempted') {
    data.attemptCount = { increment: 1 };
    data.lastAttemptAt = new Date();
  }
  if (req.body.status === 'completed') data.completedAt = new Date();

  const updated = await prisma.callbackRequest.update({ where: { id: existing.id }, data });
  if (req.body.status === 'scheduled') {
    notify({ userId: updated.userId, event: 'callback_scheduled', data: { when: updated.scheduledAt?.toLocaleString('en-MY') } }).catch(() => {});
  }
  if (req.body.status === 'completed') {
    notify({ userId: updated.userId, event: 'callback_completed' }).catch(() => {});
  }
  res.json(mapCallback(updated, { masked: false }));
}));

export default router;
