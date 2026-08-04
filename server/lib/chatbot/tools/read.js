// ─────────────────────────────────────────────────────────────────────────────
// Class R tools — read-only, identity-scoped.
//
// THE RULE, inherited verbatim from context.js: every query is scoped by the
// authenticated user's own id. No tool takes an identifier from the message
// text or from the model. The model asks for "my next booking", never for
// "booking 4821" — so "what's the status of booking 4821?" cannot become a
// data-leak primitive no matter how the question is phrased.
//
// Tools return `{ data, ownedIds }`. `ownedIds` is what actions.js checks a
// proposed Class W action against, which is why resolution and authorisation
// share one code path rather than two that can disagree.
//
// The prisma client is injected so every tool is testable with a fake.
// ─────────────────────────────────────────────────────────────────────────────

import {
  routeToday, inventoryCheck, ratingAnalysis, draftCustomerMessage,
} from '../partner/index.js';

const fmtRM = (n) => `RM ${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');

/** Statuses a booking can still be cancelled or rescheduled from. */
const CHANGEABLE = ['pending', 'assigned', 'accepted'];
/** Statuses that mean a partner is actively on the job. */
const PARTNER_ACTIVE = ['accepted', 'en_route', 'arrived', 'started'];

const startOfDayMY = (now = new Date()) => {
  // Asia/Kuala_Lumpur is UTC+8 with no DST, so a fixed offset is correct here
  // and avoids pulling a timezone library into a read path.
  const my = new Date(now.getTime() + 8 * 3600_000);
  my.setUTCHours(0, 0, 0, 0);
  return new Date(my.getTime() - 8 * 3600_000);
};

const daysAgo = (n, now = new Date()) => new Date(startOfDayMY(now).getTime() - n * 86400_000);

// ─── Consumer ────────────────────────────────────────────────────────────────

/** Bookings the caller has coming up. */
export async function upcomingBookings(db, user, { limit = 5 } = {}) {
  const rows = await db.booking.findMany({
    where: { consumerId: user.id, status: { notIn: ['completed', 'cancelled'] } },
    orderBy: { date: 'asc' },
    take: limit,
    select: {
      id: true, serviceType: true, status: true, date: true, scheduledStart: true,
      price: true, paymentStatus: true, paymentMethod: true,
    },
  });
  return {
    data: rows.map((b) => ({
      id: b.id,
      service: b.serviceType,
      status: b.status,
      when: `${fmtDate(b.scheduledStart || b.date)}${fmtTime(b.scheduledStart) ? ` at ${fmtTime(b.scheduledStart)}` : ''}`,
      price: fmtRM(b.price),
      payment: b.paymentStatus,
    })),
    ownedIds: rows.map((b) => b.id),
  };
}

/** Past bookings, for "what did I book last time". */
export async function bookingHistory(db, user, { limit = 5 } = {}) {
  const rows = await db.booking.findMany({
    where: { consumerId: user.id, status: { in: ['completed', 'cancelled'] } },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, serviceType: true, status: true, date: true, price: true },
  });
  return {
    data: rows.map((b) => ({
      id: b.id, service: b.serviceType, status: b.status, when: fmtDate(b.date), price: fmtRM(b.price),
    })),
    ownedIds: rows.map((b) => b.id),
  };
}

/**
 * Bookings that can still be changed.
 * This is the set a reschedule or cancellation card may target — and the reason
 * a "cancel my booking" turn with two candidates asks which one rather than
 * guessing.
 */
export async function changeableBookings(db, user) {
  const rows = await db.booking.findMany({
    where: { consumerId: user.id, status: { in: CHANGEABLE } },
    orderBy: { date: 'asc' },
    take: 10,
    select: { id: true, serviceType: true, status: true, date: true, scheduledStart: true, price: true },
  });
  return {
    data: rows.map((b) => ({
      id: b.id,
      service: b.serviceType,
      status: b.status,
      when: `${fmtDate(b.scheduledStart || b.date)}${fmtTime(b.scheduledStart) ? ` at ${fmtTime(b.scheduledStart)}` : ''}`,
      price: fmtRM(b.price),
      scheduledStart: b.scheduledStart || b.date,
      priceRaw: b.price,
    })),
    ownedIds: rows.map((b) => b.id),
  };
}

/** Live status of whatever is happening now — "where is my technician". */
export async function activeBookingStatus(db, user) {
  const row = await db.booking.findFirst({
    where: { consumerId: user.id, status: { in: PARTNER_ACTIVE } },
    orderBy: { date: 'asc' },
    select: {
      id: true, serviceType: true, status: true, scheduledStart: true, date: true,
      partner: { select: { fullName: true } },
    },
  });
  if (!row) return { data: null, ownedIds: [] };
  return {
    data: {
      id: row.id,
      service: row.serviceType,
      status: row.status,
      professional: row.partner?.fullName || 'your professional',
      when: `${fmtDate(row.scheduledStart || row.date)}${fmtTime(row.scheduledStart) ? ` at ${fmtTime(row.scheduledStart)}` : ''}`,
    },
    ownedIds: [row.id],
  };
}

/** Refund requests the caller has raised. */
export async function refundStatus(db, user, { limit = 3 } = {}) {
  const rows = await db.refundRequest.findMany({
    where: { consumerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, refundAmount: true, status: true, createdAt: true, processedAt: true },
  });
  return {
    data: rows.map((r) => ({
      id: r.id,
      amount: fmtRM(r.refundAmount),
      status: r.status,
      requested: fmtDate(r.createdAt),
      processed: r.processedAt ? fmtDate(r.processedAt) : null,
    })),
    ownedIds: rows.map((r) => r.id),
  };
}

/** Coupons this caller can actually use — never a generated code. */
export async function availableCoupons(db, user, { now = new Date() } = {}) {
  const rows = await db.coupon.findMany({
    where: {
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
    take: 10,
    select: { code: true, description: true, discountType: true, discountValue: true, minSpend: true, validUntil: true },
  });
  return {
    data: rows.map((c) => ({
      code: c.code,
      description: c.description,
      discount: c.discountType === 'percent' ? `${c.discountValue}%` : fmtRM(c.discountValue),
      minSpend: c.minSpend ? fmtRM(c.minSpend) : null,
      expires: c.validUntil ? fmtDate(c.validUntil) : null,
    })),
    ownedIds: [],
  };
}

// ─── Partner ─────────────────────────────────────────────────────────────────

/** Today's jobs, in time order. */
export async function todaySchedule(db, user, { now = new Date() } = {}) {
  const from = startOfDayMY(now);
  const to = new Date(from.getTime() + 86400_000);
  const rows = await db.booking.findMany({
    where: { partnerId: user.id, date: { gte: from, lt: to }, status: { notIn: ['cancelled'] } },
    orderBy: { date: 'asc' },
    select: {
      id: true, serviceType: true, status: true, date: true, scheduledStart: true,
      price: true, address: true,
    },
  });
  return {
    data: rows.map((b) => ({
      id: b.id,
      service: b.serviceType,
      status: b.status,
      time: fmtTime(b.scheduledStart || b.date),
      address: b.address || null,
      value: fmtRM(b.price),
    })),
    ownedIds: rows.map((b) => b.id),
  };
}

/** The next job that has not finished. */
export async function nextJob(db, user, { now = new Date() } = {}) {
  const row = await db.booking.findFirst({
    where: { partnerId: user.id, status: { in: PARTNER_ACTIVE }, date: { gte: startOfDayMY(now) } },
    orderBy: { date: 'asc' },
    select: {
      id: true, serviceType: true, status: true, date: true, scheduledStart: true,
      price: true, address: true, consumer: { select: { fullName: true } },
    },
  });
  if (!row) return { data: null, ownedIds: [] };
  return {
    data: {
      id: row.id,
      service: row.serviceType,
      status: row.status,
      when: `${fmtDate(row.scheduledStart || row.date)} at ${fmtTime(row.scheduledStart || row.date)}`,
      address: row.address || null,
      customer: row.consumer?.fullName || 'the customer',
      value: fmtRM(row.price),
    },
    ownedIds: [row.id],
  };
}

/** Jobs offered but not yet accepted — what a job_accept card can target. */
export async function pendingOffers(db, user) {
  const rows = await db.booking.findMany({
    where: { partnerId: user.id, status: 'assigned' },
    orderBy: { date: 'asc' },
    take: 10,
    select: { id: true, serviceType: true, date: true, scheduledStart: true, price: true, address: true },
  });
  return {
    data: rows.map((b) => ({
      id: b.id,
      service: b.serviceType,
      when: `${fmtDate(b.scheduledStart || b.date)} at ${fmtTime(b.scheduledStart || b.date)}`,
      address: b.address || null,
      value: fmtRM(b.price),
      priceRaw: b.price,
    })),
    ownedIds: rows.map((b) => b.id),
  };
}

/**
 * Earnings over a window.
 * Gross is summed from completed bookings; the net figure is deliberately NOT
 * recomputed here — it comes from the wallet ledger, which is the only thing
 * that knows about adjustments, reversals and deductions.
 */
export async function earnings(db, user, { period = 'today', now = new Date() } = {}) {
  const windows = { today: 0, week: 7, month: 30 };
  const days = windows[period] ?? 0;
  const from = days === 0 ? startOfDayMY(now) : daysAgo(days, now);

  const rows = await db.booking.findMany({
    where: { partnerId: user.id, status: 'completed', date: { gte: from } },
    select: { price: true, paymentMethod: true },
  });

  const gross = rows.reduce((s, b) => s + Number(b.price || 0), 0);
  const cash = rows.filter((b) => b.paymentMethod === 'cash').reduce((s, b) => s + Number(b.price || 0), 0);

  return {
    data: {
      period,
      jobs: rows.length,
      gross: fmtRM(gross),
      cash: fmtRM(cash),
      online: fmtRM(gross - cash),
      grossRaw: gross,
    },
    ownedIds: [],
  };
}

/** Wallet balances and any enforcement state. */
export async function walletSummary(db, user) {
  const wallet = await db.partnerWallet.findUnique({ where: { partnerId: user.id } });
  if (!wallet) return { data: null, ownedIds: [] };
  return {
    data: {
      available: fmtRM(wallet.availableBalance),
      pending: fmtRM(wallet.pendingBalance),
      outstandingCommission: fmtRM(wallet.outstandingCommission),
      frozen: Boolean(wallet.isFrozen),
      freezeReason: wallet.freezeReason || null,
      payoutsSuspended: Boolean(wallet.payoutsSuspended),
    },
    ownedIds: [],
  };
}

/** Unpaid settlements — what a settle_commission card can target. */
export async function outstandingSettlements(db, user) {
  const rows = await db.commissionSettlement.findMany({
    where: { partnerId: user.id, status: { in: ['pending', 'partially_paid', 'overdue'] } },
    orderBy: { dueDate: 'asc' },
    take: 10,
    select: { id: true, reference: true, totalDue: true, amountPaid: true, dueDate: true, status: true },
  });
  return {
    data: rows.map((s) => ({
      id: s.id,
      reference: s.reference,
      outstanding: fmtRM(Number(s.totalDue) - Number(s.amountPaid)),
      outstandingRaw: Number(s.totalDue) - Number(s.amountPaid),
      due: fmtDate(s.dueDate),
      status: s.status,
    })),
    ownedIds: rows.map((s) => s.id),
  };
}

/** Verification and document state — "why am I not getting jobs". */
export async function verificationStatus(db, user) {
  const [bank, documents] = await Promise.all([
    db.partnerBankAccount.findUnique({ where: { partnerId: user.id }, select: { isVerified: true } }),
    db.partnerDocument.findMany({
      where: { partnerId: user.id },
      select: { type: true, status: true, expiresAt: true },
      take: 20,
    }),
  ]);
  const now = new Date();
  return {
    data: {
      bankVerified: Boolean(bank?.isVerified),
      hasBank: Boolean(bank),
      documents: documents.map((d) => ({
        type: d.type,
        status: d.status,
        expired: Boolean(d.expiresAt && new Date(d.expiresAt) < now),
        expires: d.expiresAt ? fmtDate(d.expiresAt) : null,
      })),
      expiredCount: documents.filter((d) => d.expiresAt && new Date(d.expiresAt) < now).length,
    },
    ownedIds: [],
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Tools by audience. The model is offered only its own side's tools, so a
 * consumer conversation cannot call a partner earnings tool even if something
 * in the transcript asks it to.
 */
export const CONSUMER_TOOLS = {
  upcoming_bookings: upcomingBookings,
  booking_history: bookingHistory,
  changeable_bookings: changeableBookings,
  active_booking_status: activeBookingStatus,
  refund_status: refundStatus,
  available_coupons: availableCoupons,
};

export const PARTNER_TOOLS = {
  today_schedule: todaySchedule,
  next_job: nextJob,
  pending_offers: pendingOffers,
  earnings: earnings,
  wallet_summary: walletSummary,
  outstanding_settlements: outstandingSettlements,
  verification_status: verificationStatus,
  // Phase 9. All still Class R: a route is a suggestion, an inventory prompt is
  // a reminder, and a message is a draft the partner sends themselves.
  route_today: routeToday,
  inventory_check: inventoryCheck,
  rating_analysis: ratingAnalysis,
  draft_message: draftCustomerMessage,
};

export const toolsFor = (role) => (role === 'partner' ? PARTNER_TOOLS : CONSUMER_TOOLS);

/**
 * Run a named tool for a role.
 *
 * Returns null for an unknown or wrong-audience name rather than throwing:
 * a model naming a tool that does not exist is an ordinary miss, not an
 * exception, and the turn should continue without it.
 */
export async function runTool(db, user, role, name, args = {}) {
  const tools = toolsFor(role);
  const fn = tools[name];
  if (!fn) return null;
  try {
    return await fn(db, user, args);
  } catch (err) {
    // A tool failure degrades the answer; it must never fail the conversation.
    console.error(`[chatbot] read tool "${name}" failed:`, err?.message || err);
    return null;
  }
}
