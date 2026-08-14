#!/usr/bin/env node
/**
 * Reverse the synthetic opening_pending aggregate and rebuild the pending
 * balance from per-booking ledger entries.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/reconcile-pending.mjs           # report only
 *   node scripts/reconcile-pending.mjs --apply
 *
 * Background
 * ──────────
 * `pending` means: the partner's share of money ServisAku has actually received
 * and is holding. An EscrowLedger row is written at BOOKING CREATION, before any
 * money moves; the `escrow_hold` ledger entry is written at PAYMENT SETTLEMENT.
 * Only the second creates a liability to the partner.
 *
 * scripts/backfill-wallets.mjs wrote a single `escrow_hold` per partner keyed
 * `opening_pending:<partnerId>` — an AGGREGATE over that partner's active
 * bookings, with no bookingId. It double-counts any booking that also has its
 * own per-booking hold, and it counts bookings the customer never paid for.
 *
 * This script reverses that aggregate with an auditable `adjustment` entry. The
 * original entry is NEVER deleted — the ledger is append-only, and the reversal
 * has to remain visible next to what it reversed.
 *
 * Deliberately NOT done here:
 *   · no hold is created for a funded booking with no partner assigned. There is
 *     no partner to receive the liability. That lifecycle is undefined and is a
 *     product decision, not something to fabricate into a ledger.
 *   · no escrow is released, no earning credited (conflict C-04 stays paused).
 *
 * NOT FOR PRODUCTION. NODE_ENV must be exactly "development" or "test";
 * anything else — including unset or empty — is refused. The check lives in
 * ./_assert-dev-env.mjs and is imported FIRST, before @prisma/client can load
 * .env into process.env, so the guard sees what the operator set rather than
 * what a file on disk supplied. Pass it explicitly:
 *
 *   NODE_ENV=development node scripts/reconcile-pending.mjs
 *   NODE_ENV=development node scripts/reconcile-pending.mjs --apply
 */
// MUST be first: validates NODE_ENV before any import can load .env.
import './_assert-dev-env.mjs';
import { PrismaClient } from '@prisma/client';
import { adjust } from '../server/lib/wallet/index.js';
import fs from 'node:fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const FUNDED = ['paid', 'escrowed'];

const REASON = 'Reversal of synthetic opening_pending aggregate created by scripts/backfill-wallets.mjs';

const audit = { startedAt: new Date().toISOString(), applied: APPLY, reversals: [], wallets: [], checks: [] };

function head(s) { console.log(`\n${s}\n${'─'.repeat(s.length)}`); }

async function main() {
  console.log(APPLY ? '▶ APPLY — changes will be written' : '▶ DRY RUN — no changes will be written');

  // ── 1. Find synthetic aggregates ──────────────────────────────────────────
  head('Synthetic opening_pending aggregates');
  const synthetic = await prisma.walletLedgerEntry.findMany({
    where: { type: 'escrow_hold', idempotencyKey: { startsWith: 'opening_pending:' } },
  });

  if (!synthetic.length) console.log('  none found');
  for (const e of synthetic) {
    // Has it already been reversed? `adjust` takes no idempotency key, so guard
    // here rather than risk reversing twice on a second run.
    const already = await prisma.walletLedgerEntry.findFirst({
      where: { partnerId: e.partnerId, type: 'adjustment', bucket: 'pending', description: REASON },
    });
    if (already) { console.log(`  ${e.id.slice(-6)}  RM ${e.amount}  already reversed — skipping`); continue; }

    console.log(`  ${e.id.slice(-6)}  RM ${e.amount}  partner=${e.partnerId.slice(-6)}  → reverse (original kept)`);
    audit.reversals.push({ originalEntryId: e.id, partnerId: e.partnerId, amount: e.amount, reason: REASON });

    if (APPLY) {
      await adjust({
        partnerId: e.partnerId,
        amount: e.amount,
        direction: 'debit',      // pending goes DOWN
        bucket: 'pending',
        reason: REASON,
      });
    }
  }

  // ── 2. Rebuild pending from the ledger ────────────────────────────────────
  head('Pending balance, rebuilt from ledger');
  for (const w of await prisma.partnerWallet.findMany()) {
    const entries = await prisma.walletLedgerEntry.findMany({ where: { partnerId: w.partnerId } });
    // pending = credits into the pending bucket − debits out of it, whatever the
    // entry type. Reading bucket/direction rather than enumerating types means a
    // future entry type is counted automatically.
    const pending = round2(entries
      .filter((e) => e.bucket === 'pending')
      .reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0));

    console.log(`  partner ${w.partnerId.slice(-6)}  pendingBalance ${w.pendingBalance} → ${pending}`);
    if (round2(w.pendingBalance) !== pending) {
      audit.wallets.push({ partnerId: w.partnerId, before: w.pendingBalance, after: pending });
      if (APPLY) await prisma.partnerWallet.update({ where: { id: w.id }, data: { pendingBalance: pending } });
    }
  }

  // ── 3. Verify against the funded-only definition ──────────────────────────
  head('Verification');
  const escrow = await prisma.escrowLedger.findMany({ include: { booking: true } });
  const fundedHeld = escrow.filter((e) => e.status === 'held' && FUNDED.includes(e.booking?.paymentStatus));
  const attributable = round2(fundedHeld.filter((e) => e.booking?.partnerId)
    .reduce((s, e) => s + e.partnerPayout, 0));
  const unassigned = fundedHeld.filter((e) => !e.booking?.partnerId);
  const unassignedSum = round2(unassigned.reduce((s, e) => s + e.partnerPayout, 0));

  const wallets = await prisma.partnerWallet.findMany();
  const totals = {
    pending: round2(wallets.reduce((s, w) => s + w.pendingBalance, 0)),
    available: round2(wallets.reduce((s, w) => s + w.availableBalance, 0)),
    lifetime: round2(wallets.reduce((s, w) => s + w.lifetimeEarnings, 0)),
  };
  const withdrawn = round2((await prisma.walletLedgerEntry.aggregate({
    where: { type: 'payout_debit' }, _sum: { amount: true },
  }))._sum.amount || 0);

  const checks = [
    ['pending', totals.pending, 36],
    ['available', totals.available, 0],
    ['lifetime', totals.lifetime, 0],
    ['withdrawn', withdrawn, 0],
  ];
  for (const [name, actual, expected] of checks) {
    const pass = actual === expected;
    audit.checks.push({ name, actual, expected, pass });
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(11)} ${String(actual).padStart(8)}  (expected ${expected})`);
  }
  console.log(`\n  attributable funded escrow: RM ${attributable}`);
  console.log(`  funded but UNASSIGNED:      RM ${unassignedSum} across ${unassigned.length} booking(s)`
    + ` — left uncredited by design, pending a product decision`);
  for (const e of unassigned) {
    console.log(`    · booking ${e.bookingId.slice(-6)}  payout RM ${e.partnerPayout}  paymentStatus=${e.booking.paymentStatus}  partner=NONE`);
  }

  if (APPLY) {
    fs.mkdirSync('.backups', { recursive: true });
    const f = `.backups/reconcile-pending-${audit.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
    audit.finishedAt = new Date().toISOString();
    fs.writeFileSync(f, JSON.stringify(audit, null, 2));
    console.log(`\nAudit trail written to ${f}`);
  } else {
    console.log('\n(dry run — re-run with --apply to write)');
  }
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
