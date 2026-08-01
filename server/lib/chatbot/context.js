// ─────────────────────────────────────────────────────────────────────────────
// Read-only, self-scoped account context.
//
// THE RULE: every query here is scoped by the authenticated user's own id. The
// bot never accepts a booking id, email, or any other identifier from the
// message text — not from the user, and certainly not from the model. That is
// what makes "what's the status of booking X?" unable to become a data-leak
// primitive: the identifier is never used, only the session's identity.
//
// Anonymous conversations get no context at all.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtRM = (n) => `RM ${Number(n || 0).toFixed(2)}`;

/**
 * Summarise the caller's own recent activity for the model.
 *
 * @param {object|null} user  the authenticated user, or null when anonymous
 * @returns {Promise<string|null>} a plain-text summary, or null
 */
export async function buildUserContext(user) {
  if (!user?.id) return null;

  try {
    if (user.role === 'partner') return partnerContext(user);
    return consumerContext(user);
  } catch (err) {
    // Context is an enhancement, not a requirement — a failure here degrades
    // the answer, it must not fail the conversation.
    console.error('[chatbot] context build failed:', err?.message || err);
    return null;
  }
}

async function consumerContext(user) {
  const [bookings, refunds, claims] = await Promise.all([
    prisma.booking.findMany({
      where: { consumerId: user.id }, // scoped by identity, never by a supplied id
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { serviceType: true, status: true, date: true, price: true, paymentStatus: true, paymentMethod: true },
    }),
    prisma.refundRequest.findMany({
      where: { consumerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { refundAmount: true, status: true, createdAt: true },
    }),
    prisma.damageClaim.findMany({
      where: { consumerId: user.id, status: { notIn: ['closed', 'rejected'] } },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { reference: true, status: true, claimedAmount: true },
    }),
  ]);

  const lines = [];
  if (bookings.length) {
    lines.push('Recent bookings:');
    for (const b of bookings) {
      lines.push(`- ${b.serviceType} on ${fmtDate(b.date)} — status ${b.status}, ${fmtRM(b.price)}, payment ${b.paymentStatus}${b.paymentMethod ? ` (${b.paymentMethod})` : ''}`);
    }
  } else {
    lines.push('No bookings yet.');
  }
  if (refunds.length) {
    lines.push('Refund requests:');
    for (const r of refunds) lines.push(`- ${fmtRM(r.refundAmount)} requested ${fmtDate(r.createdAt)} — ${r.status}`);
  }
  if (claims.length) {
    lines.push('Open damage claims:');
    for (const c of claims) lines.push(`- ${c.reference} for ${fmtRM(c.claimedAmount)} — ${c.status}`);
  }
  return lines.join('\n');
}

async function partnerContext(user) {
  const [wallet, settlements, bank, jobs] = await Promise.all([
    prisma.partnerWallet.findUnique({ where: { partnerId: user.id } }),
    prisma.commissionSettlement.findMany({
      where: { partnerId: user.id, status: { in: ['pending', 'partially_paid', 'overdue'] } },
      orderBy: { dueDate: 'asc' },
      take: 2,
    }),
    prisma.partnerBankAccount.findUnique({ where: { partnerId: user.id }, select: { isVerified: true } }),
    prisma.booking.count({ where: { partnerId: user.id, status: { in: ['accepted', 'en_route', 'arrived', 'started'] } } }),
  ]);

  const lines = [];
  if (wallet) {
    lines.push(`Wallet: ${fmtRM(wallet.availableBalance)} available, ${fmtRM(wallet.pendingBalance)} pending, ${fmtRM(wallet.outstandingCommission)} commission outstanding.`);
    if (wallet.isFrozen) lines.push(`New job offers are currently PAUSED: ${wallet.freezeReason || 'overdue commission'}.`);
    if (wallet.payoutsSuspended) lines.push('Payouts are currently on hold.');
  }
  for (const s of settlements) {
    lines.push(`Settlement ${s.reference}: ${fmtRM(s.totalDue - s.amountPaid)} due by ${fmtDate(s.dueDate)} — ${s.status}.`);
  }
  lines.push(bank
    ? `Bank details on file: ${bank.isVerified ? 'verified' : 'awaiting verification'}.`
    : 'No bank details on file yet.');
  lines.push(`${jobs} job(s) currently in progress.`);
  return lines.join('\n');
}
