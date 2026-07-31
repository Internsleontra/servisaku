// ─────────────────────────────────────────────────────────────────────────────
// One-off backfill: give every existing partner a PartnerWallet whose balance
// matches what the old computed wallet reported, recorded as a single
// `opening_balance` ledger entry.
//
// Why an entry rather than just setting the number: the ledger is meant to
// explain every ringgit in a balance. A wallet that starts with an unexplained
// figure breaks that from day one, and the reconciliation check in
// GET /api/wallet/admin/:partnerId/reconcile would flag every legacy partner.
//
//   node scripts/backfill-wallets.mjs           # report only, writes nothing
//   node scripts/backfill-wallets.mjs --apply   # perform the backfill
//
// Safe to re-run: partners who already have a ledger entry are skipped.
//
// NOTE ON THE OLD ROUNDING BUG: the previous computation used
// `Math.round(price * 0.8)`, rounding each job's payout to whole ringgit. This
// script reproduces that figure so balances do not visibly jump, and reports the
// per-partner difference against the correct sen-accurate figure. Whether to
// reconcile that difference is a business decision — see docs/10 §E1.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { prisma } from '../server/db.js';
import { post, getOrCreateWallet } from '../server/lib/wallet/ledger.js';
import { split, round2 } from '../server/lib/payments/commission.js';

const APPLY = process.argv.includes('--apply');

const ACTIVE_STATUSES = ['accepted', 'en_route', 'arrived', 'started'];
const COUNTED_PAYOUT_STATUSES = ['pending', 'scheduled', 'processing', 'completed'];

// The exact arithmetic the old computeWallet() in server/routes/payouts.js used.
const legacyPayoutOf = (price) => Math.round((price || 0) * 0.8);

async function main() {
  const partners = await prisma.user.findMany({
    where: { role: 'partner' },
    select: { id: true, email: true, fullName: true, partnerProfile: true },
  });

  console.log(`${APPLY ? 'Backfilling' : 'DRY RUN —'} ${partners.length} partner(s)\n`);

  let created = 0; let skipped = 0; let totalDrift = 0;

  for (const partner of partners) {
    const existing = await prisma.walletLedgerEntry.findFirst({ where: { partnerId: partner.id } });
    if (existing) { skipped += 1; continue; }

    const [completed, active, payouts] = await Promise.all([
      prisma.booking.findMany({ where: { partnerId: partner.id, status: 'completed' }, select: { price: true } }),
      prisma.booking.findMany({ where: { partnerId: partner.id, status: { in: ACTIVE_STATUSES } }, select: { price: true } }),
      prisma.payoutRecord.findMany({ where: { partnerId: partner.id }, select: { netPayout: true, status: true } }),
    ]);

    const legacyLifetime = completed.reduce((s, b) => s + legacyPayoutOf(b.price), 0);
    const correctLifetime = round2(completed.reduce((s, b) => s + split(b.price, { partner }).netPayout, 0));
    const pending = round2(active.reduce((s, b) => s + split(b.price, { partner }).netPayout, 0));
    const withdrawn = round2(payouts
      .filter((p) => COUNTED_PAYOUT_STATUSES.includes(p.status))
      .reduce((s, p) => s + (p.netPayout || 0), 0));

    const opening = round2(Math.max(0, legacyLifetime - withdrawn));
    const drift = round2(correctLifetime - legacyLifetime);
    totalDrift = round2(totalDrift + drift);

    if (completed.length === 0 && active.length === 0 && payouts.length === 0) {
      // Nothing to carry over — create the wallet lazily on first real use.
      skipped += 1;
      continue;
    }

    const label = partner.email || partner.fullName || partner.id;
    console.log(
      `  ${label.padEnd(34)} opening RM${String(opening).padStart(9)}  pending RM${String(pending).padStart(8)}`
      + `  ${drift !== 0 ? `rounding drift RM${drift > 0 ? '+' : ''}${drift}` : ''}`,
    );

    if (!APPLY) { created += 1; continue; }

    await getOrCreateWallet(partner.id);
    if (opening > 0) {
      await post({
        partnerId: partner.id,
        type: 'opening_balance',
        amount: opening,
        description: 'Opening balance carried over from the pre-ledger wallet calculation',
        idempotencyKey: `opening:${partner.id}`,
        metadata: {
          legacyLifetime, correctLifetime, roundingDrift: drift, withdrawn,
          completedBookings: completed.length,
        },
      });
    }
    if (pending > 0) {
      await post({
        partnerId: partner.id,
        type: 'escrow_hold',
        amount: pending,
        description: 'In-progress job earnings carried over at backfill',
        idempotencyKey: `opening_pending:${partner.id}`,
      });
    }
    created += 1;
  }

  console.log(`\n${APPLY ? 'Created' : 'Would create'}: ${created}   Skipped: ${skipped}`);
  if (totalDrift !== 0) {
    console.log(
      `\n⚠  Total rounding drift across all partners: RM${totalDrift > 0 ? '+' : ''}${totalDrift}`
      + '\n   This is what the old Math.round(price * 0.8) lost or gained versus the'
      + '\n   sen-accurate split. Opening balances reproduce the OLD figure so nothing'
      + '\n   visibly changes; reconciling the difference is a business decision.',
    );
  }
  if (!APPLY) console.log('\nRe-run with --apply to write.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
