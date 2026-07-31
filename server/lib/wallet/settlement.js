// ─────────────────────────────────────────────────────────────────────────────
// Commission settlement — rolls a period's cash-job commissions into a single
// invoice-like obligation the partner pays off, then applies the overdue ladder.
//
// Concurrency: settlement creation is guarded by the unique `reference`
// (partner + period), so running this worker on several instances — or re-running
// it after a crash — produces one settlement per partner per period, not several.
// That matters because the in-process queue (notifications/queue.js) loses work
// on restart, so anything financial has to be safely re-runnable.
//
// Timezone: periods are computed in Asia/Kuala_Lumpur. A UTC-based week boundary
// would put Sunday-evening MYT jobs in the wrong settlement.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { split, round2 } from '../payments/commission.js';
import { post, getOrCreateWallet } from './ledger.js';
import { applyEnforcement, nextReminderDue } from './index.js';
import { notify } from '../notifications/index.js';

const TZ_OFFSET_MIN = 8 * 60; // MYT is a fixed UTC+8 — no DST to account for.
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a partner has to settle once a period closes. */
export const PAYMENT_TERMS_DAYS = 7;

// ─── Period maths (pure) ─────────────────────────────────────────────────────

/** Shift a UTC instant into "MYT wall clock" so date maths reads as local. */
const toMyt = (d) => new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
const fromMyt = (d) => new Date(d.getTime() - TZ_OFFSET_MIN * 60_000);

/**
 * The most recently *completed* settlement period before `now`.
 * Weekly periods run Monday 00:00 → Sunday 23:59:59.999 MYT.
 * Monthly periods run the 1st → last day of the month, MYT.
 */
export function previousPeriod(cycle, now = new Date()) {
  const local = toMyt(now);

  if (cycle === 'monthly') {
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0, 0) - 1);
    return { periodStart: fromMyt(start), periodEnd: fromMyt(end), label: monthLabel(start) };
  }

  // Weekly. getUTCDay() on the shifted date gives the MYT weekday; 0 = Sunday.
  const dow = local.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0, 0)
    - daysSinceMonday * DAY_MS);
  const lastMonday = new Date(thisMonday.getTime() - 7 * DAY_MS);
  const lastSundayEnd = new Date(thisMonday.getTime() - 1);
  return { periodStart: fromMyt(lastMonday), periodEnd: fromMyt(lastSundayEnd), label: isoWeekLabel(lastMonday) };
}

function monthLabel(d) {
  return `${d.getUTCFullYear()}M${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Canonical ISO-8601 week number: shift to the Thursday of the same week (which
// determines the ISO year), then count weeks from 1 January of that year.
function isoWeekLabel(monday) {
  const d = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}W${String(week).padStart(2, '0')}`;
}

/** Deterministic, collision-safe reference — also the concurrency guard. */
export function settlementReference(partnerId, label) {
  return `STL-${label}-${partnerId.slice(-6).toUpperCase()}`;
}

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Create the settlement for one partner and period, if they collected any cash.
 * Idempotent: a second call returns the existing settlement untouched.
 */
export async function generateForPartner(partnerId, { cycle, periodStart, periodEnd, label }) {
  const reference = settlementReference(partnerId, label);

  const existing = await prisma.commissionSettlement.findUnique({ where: { reference } });
  if (existing) return existing;

  // Cash payments the partner collected during the period.
  const payments = await prisma.payment.findMany({
    where: {
      method: 'cash',
      status: 'paid',
      type: 'booking',
      collectedById: partnerId,
      paidAt: { gte: periodStart, lte: periodEnd },
    },
    include: { booking: true },
  });
  if (payments.length === 0) return null;

  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  let grossCash = 0;
  let commissionDue = 0;
  const bookingIds = [];

  for (const p of payments) {
    // Use the commission snapshot taken when the cash was collected — a later
    // tier change must not retroactively alter what the partner owes.
    const gross = p.amountMyr ?? round2(p.amount / 100);
    const commission = p.platformFee || split(gross, { partner }).commission;
    grossCash = round2(grossCash + gross);
    commissionDue = round2(commissionDue + commission);
    bookingIds.push(p.bookingId);
  }

  const wallet = await getOrCreateWallet(partnerId);
  const dueDate = new Date(periodEnd.getTime() + PAYMENT_TERMS_DAYS * DAY_MS);

  const settlement = await prisma.commissionSettlement.create({
    data: {
      walletId: wallet.id,
      partnerId,
      reference,
      cycle,
      periodStart,
      periodEnd,
      grossCashCollected: grossCash,
      commissionDue,
      // SST on ServisAku's commission is computed by the taxation feature; until
      // TaxConfig exists it stays 0 rather than being guessed at here.
      sstOnCommission: 0,
      totalDue: commissionDue,
      status: 'pending',
      dueDate,
      bookingIds,
    },
  });

  notify({
    userId: partnerId,
    event: 'settlement_generated',
    data: {
      amount: `RM ${commissionDue.toFixed(2)}`,
      reference,
      when: dueDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }),
    },
  }).catch(() => {});

  return settlement;
}

/**
 * Generate settlements for every partner on `cycle` who collected cash in the
 * last period of that cycle.
 *
 * The cycle filter is essential, not cosmetic: without it a weekly-cycle partner
 * would be billed again by the monthly run, since both runs would find the same
 * cash payments. A partner is settled on exactly one cycle — the one on their
 * wallet.
 */
export async function generateSettlements(cycle = 'weekly', now = new Date()) {
  const period = previousPeriod(cycle, now);

  const collectors = await prisma.payment.findMany({
    where: {
      method: 'cash',
      status: 'paid',
      type: 'booking',
      collectedById: { not: null },
      paidAt: { gte: period.periodStart, lte: period.periodEnd },
    },
    select: { collectedById: true },
    distinct: ['collectedById'],
  });
  if (collectors.length === 0) return { period, created: [] };

  const partnerIds = collectors.map((c) => c.collectedById);
  const onThisCycle = new Set(
    (await prisma.partnerWallet.findMany({
      where: { partnerId: { in: partnerIds }, settlementCycle: cycle },
      select: { partnerId: true },
    })).map((w) => w.partnerId),
  );

  const created = [];
  for (const partnerId of partnerIds) {
    // Recording a cash collection always creates the wallet (via the commission
    // debit), so a collector without a matching wallet row is simply on the
    // other cycle and is skipped here.
    if (!onThisCycle.has(partnerId)) continue;
    try {
      const s = await generateForPartner(partnerId, { cycle, ...period });
      if (s) created.push(s);
    } catch (err) {
      // One partner's failure must not abort the run for everyone else.
      console.error(`[settlement] generation failed for ${partnerId}:`, err?.message || err);
    }
  }
  return { period, created };
}

// ─── Payment application ─────────────────────────────────────────────────────

/**
 * Apply a payment against a settlement and reduce the partner's outstanding
 * commission. Safe to call twice for the same payment — the ledger's
 * idempotency key absorbs the duplicate.
 */
export async function applyPayment(settlementId, amount, { paymentId, createdById } = {}) {
  const settlement = await prisma.commissionSettlement.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new Error(`settlement ${settlementId} not found`);

  const applied = round2(Math.min(amount, round2(settlement.totalDue - settlement.amountPaid)));
  if (applied <= 0) return settlement;

  await post({
    partnerId: settlement.partnerId,
    type: 'settlement_credit',
    amount: applied,
    description: `Commission settlement ${settlement.reference}`,
    settlementId: settlement.id,
    paymentId,
    createdById,
    idempotencyKey: paymentId ? `settlement:${settlement.id}:${paymentId}` : undefined,
  });

  const amountPaid = round2(settlement.amountPaid + applied);
  const fullyPaid = amountPaid >= round2(settlement.totalDue);

  const updated = await prisma.commissionSettlement.update({
    where: { id: settlement.id },
    data: {
      amountPaid,
      status: fullyPaid ? 'paid' : 'partially_paid',
      paidAt: fullyPaid ? new Date() : null,
      paymentId: paymentId ?? settlement.paymentId,
    },
  });

  // Clearing the debt may lift a freeze — re-evaluate immediately rather than
  // leaving the partner blocked until the next worker tick.
  const { changed, wallet } = await applyEnforcement(settlement.partnerId);
  if (changed && !wallet.isFrozen) {
    notify({ userId: settlement.partnerId, event: 'account_unfrozen' }).catch(() => {});
  }
  if (fullyPaid) {
    notify({
      userId: settlement.partnerId,
      event: 'settlement_paid',
      data: { amount: `RM ${amountPaid.toFixed(2)}`, reference: settlement.reference },
    }).catch(() => {});
  }

  return updated;
}

// ─── Overdue enforcement ─────────────────────────────────────────────────────

/** Send due/overdue reminders and apply freezes. Idempotent per rung. */
export async function enforceOverdue(now = new Date()) {
  const due = await prisma.commissionSettlement.findMany({
    where: { status: { in: ['pending', 'partially_paid', 'overdue'] }, dueDate: { lte: now } },
    take: 500,
  });

  const touched = new Set();
  for (const settlement of due) {
    try {
      const reminder = nextReminderDue(settlement, now);
      if (reminder) {
        await prisma.commissionSettlement.update({
          where: { id: settlement.id },
          data: {
            remindersSent: reminder.rung + 1,
            lastReminderAt: now,
            status: reminder.isOverdue && settlement.status === 'pending' ? 'overdue' : settlement.status,
          },
        });
        notify({
          userId: settlement.partnerId,
          event: reminder.isOverdue ? 'commission_overdue' : 'commission_due',
          data: {
            amount: `RM ${round2(settlement.totalDue - settlement.amountPaid).toFixed(2)}`,
            reference: settlement.reference,
            days: reminder.daysOverdue,
          },
        }).catch(() => {});
      }
      touched.add(settlement.partnerId);
    } catch (err) {
      console.error(`[settlement] overdue handling failed for ${settlement.id}:`, err?.message || err);
    }
  }

  for (const partnerId of touched) {
    try {
      const { changed, wallet, wasFrozen } = await applyEnforcement(partnerId, now);
      if (changed && wallet.isFrozen && !wasFrozen) {
        notify({
          userId: partnerId,
          event: 'account_frozen_overdue',
          data: { reason: wallet.freezeReason },
        }).catch(() => {});
      }
      if (changed && wallet.payoutsSuspended) {
        notify({ userId: partnerId, event: 'payouts_suspended' }).catch(() => {});
      }
    } catch (err) {
      console.error(`[settlement] enforcement failed for ${partnerId}:`, err?.message || err);
    }
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────
let timer = null;

/**
 * Hourly tick: generate any settlement whose period has closed, then run the
 * overdue ladder. Mirrors startScheduler() in notifications/queue.js — same
 * unref'd interval, same "never let one failure kill the tick" posture.
 */
export function startSettlementWorker({ intervalMs = 60 * 60_000 } = {}) {
  if (timer) return timer;
  const tick = async () => {
    try {
      await generateSettlements('weekly');
      await generateSettlements('monthly');
      await enforceOverdue();
    } catch (err) {
      console.error('[settlement] worker tick failed:', err?.message || err);
    }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export function stopSettlementWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
