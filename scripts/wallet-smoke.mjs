// ─────────────────────────────────────────────────────────────────────────────
// Wallet / cash-commission smoke test.
//
// Exercises the full cash flow against the real database and cleans up after
// itself: collect cash → commission owed → settlement → overdue freeze →
// dispatch exclusion → settle → unfreeze → ledger reconciliation.
//
//   node scripts/wallet-smoke.mjs
//
// Follows the pattern of scripts/phase0-smoke.mjs: assertions printed, non-zero
// exit on failure, no fixtures left behind.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { prisma } from '../server/db.js';
import { cleanupAndReport } from './smoke-cleanup.mjs';
import {
  debitCommission, getWallet, applyEnforcement, recompute, frozenPartnerIds,
} from '../server/lib/wallet/index.js';
import * as settlement from '../server/lib/wallet/settlement.js';
import { split } from '../server/lib/payments/commission.js';

const tag = `walletsmoke-${Date.now()}`;
let partner; let consumer; let booking; let payment;
let failures = 0;

const ok = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

try {
  partner = await prisma.user.create({
    data: { email: `${tag}-p@test.local`, fullName: 'Smoke Partner', role: 'partner', partnerVerified: true },
  });
  consumer = await prisma.user.create({
    data: { email: `${tag}-c@test.local`, fullName: 'Smoke Consumer', role: 'consumer' },
  });

  booking = await prisma.booking.create({
    data: {
      serviceType: 'Aircon Service', status: 'completed', price: 149.9,
      date: new Date(), consumerId: consumer.id, partnerId: partner.id,
      paymentMethod: 'cash', paymentStatus: 'pending',
    },
  });

  const { commission, netPayout } = split(booking.price, { partner });
  console.log(`\nBooking RM${booking.price} → commission RM${commission}, partner keeps RM${netPayout}\n`);
  ok('commission + payout reconcile to gross', commission + netPayout === booking.price);

  // 1 — record the cash collection (what POST /api/payments/cash/collect does)
  payment = await prisma.payment.create({
    data: {
      bookingId: booking.id, amount: Math.round(booking.price * 100), amountMyr: booking.price,
      method: 'cash', provider: 'cash', status: 'paid', type: 'booking', paidAt: new Date(),
      platformFee: commission, netToPartner: netPayout, collectedById: partner.id,
      idempotencyKey: `cash:${booking.id}`,
    },
  });
  await debitCommission(booking, { partner, paymentId: payment.id });

  let wallet = await getWallet(partner.id);
  ok('commission added to outstanding', wallet.outstandingCommission === commission, `RM${wallet.outstandingCommission}`);

  // 2 — a double-tap on the collect button must not charge twice
  await debitCommission(booking, { partner, paymentId: payment.id });
  wallet = await getWallet(partner.id);
  ok('duplicate collection is a no-op', wallet.outstandingCommission === commission, `RM${wallet.outstandingCommission}`);

  // 3 — settlement generation. Pick the period first, then backdate the payment
  // into it, so the test doesn't depend on which weekday it runs on.
  const period = settlement.previousPeriod('weekly');
  const withinPeriod = new Date(period.periodStart.getTime() + 864e5);
  await prisma.payment.update({ where: { id: payment.id }, data: { paidAt: withinPeriod } });
  const stl = await settlement.generateForPartner(partner.id, { cycle: 'weekly', ...period });
  ok('settlement generated', Boolean(stl) && stl.commissionDue === commission,
    stl ? `${stl.reference} RM${stl.commissionDue}` : 'none created');

  // 4 — re-running the worker must not create a second settlement
  const again = await settlement.generateForPartner(partner.id, { cycle: 'weekly', ...period });
  ok('regeneration returns the same settlement', again?.id === stl.id);

  // 5 — overdue, but the debt is below the credit-limit grace: no freeze.
  await prisma.commissionSettlement.update({
    where: { id: stl.id },
    data: { dueDate: new Date(Date.now() - 8 * 864e5), status: 'overdue' },
  });
  const grace = await applyEnforcement(partner.id);
  ok('small debt stays unfrozen despite being overdue (credit-limit grace)',
    !grace.wallet.isFrozen, `RM${wallet.outstandingCommission} vs limit RM${grace.wallet.creditLimit}`);

  // 5b — same debt, above the grace limit: freeze.
  await prisma.partnerWallet.update({ where: { partnerId: partner.id }, data: { creditLimit: 10 } });
  const enforced = await applyEnforcement(partner.id);
  ok('partner frozen once past grace and 8 days overdue', enforced.wallet.isFrozen, enforced.wallet.freezeReason || '');

  // 6 — the freeze actually reaches dispatch
  const frozen = await frozenPartnerIds([partner.id]);
  ok('dispatch sees the partner as frozen', frozen.has(partner.id));

  // 7 — settling clears the debt and lifts the freeze
  await settlement.applyPayment(stl.id, commission, { paymentId: payment.id });
  wallet = await getWallet(partner.id);
  const settled = await prisma.commissionSettlement.findUnique({ where: { id: stl.id } });
  ok('outstanding cleared', wallet.outstandingCommission === 0, `RM${wallet.outstandingCommission}`);
  ok('settlement marked paid', settled.status === 'paid');
  ok('freeze lifted', !wallet.isFrozen);

  // 8 — the ledger is the source of truth; balances must agree with it
  const computed = await recompute(partner.id);
  ok('ledger reconciles with stored balances',
    computed.outstandingCommission === wallet.outstandingCommission
    && computed.availableBalance === wallet.availableBalance,
    `${computed.entryCount} entries`);

  const entries = await prisma.walletLedgerEntry.findMany({
    where: { partnerId: partner.id }, orderBy: { createdAt: 'asc' },
  });
  console.log('\nLedger:');
  for (const e of entries) {
    console.log(`  ${e.type.padEnd(20)} ${e.direction.padEnd(6)} ${e.bucket.padEnd(12)} RM${String(e.amount).padStart(7)}  → ${e.balanceAfter}`);
  }
} finally {
  await cleanupAndReport([partner, consumer], booking);
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\n✅ wallet smoke passed' : `\n❌ ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
