#!/usr/bin/env node
/**
 * READ-ONLY financial integrity audit. Makes no writes of any kind.
 *
 *   node scripts/audit-financial.mjs
 *
 * Safe to run against any environment, including production — it opens no
 * transaction and issues no INSERT/UPDATE/DELETE. Exits 1 when any finding is
 * present so CI or a pre-deploy gate can block on it.
 *
 * Checks:
 *   1. escrow rows whose commission does not match the canonical split()
 *   2. escrow rows where commission + payout != gross
 *   3. completed bookings with escrow still held (money never released)
 *   4. bookings with no escrow row at all
 *   5. withdrawal records with no matching payout_debit ledger entry
 *   6. wallet balances that disagree with their own ledger
 *   7. wallet invariants: available >= 0, withdrawn <= lifetime
 *   8. pending balance backed by escrow that is actually still held
 */
import { PrismaClient } from '@prisma/client';
import { split } from '../server/lib/payments/commission.js';

const prisma = new PrismaClient();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const findings = [];

function report(severity, check, detail) {
  findings.push({ severity, check, detail });
}
function section(title) { console.log(`\n${title}\n${'─'.repeat(title.length)}`); }

async function main() {
  console.log('ServisAku financial audit — READ ONLY');
  console.log(`database: ${(process.env.DATABASE_URL || '').split('@').pop() || '(unknown)'}`);

  // ── 1 & 2. Escrow correctness ─────────────────────────────────────────────
  section('Escrow rows');
  const escrow = await prisma.escrowLedger.findMany({
    include: { booking: { include: { partner: true } } },
  });
  let mismatched = 0, unreconciled = 0;
  for (const e of escrow) {
    const canon = split(e.grossAmount, { partner: e.booking?.partner ?? null });
    if (round2(e.commissionAmount) !== canon.commission || round2(e.partnerPayout) !== canon.netPayout) {
      mismatched++;
      report('CRITICAL', 'escrow commission != canonical split',
        `${e.id} gross=${e.grossAmount} commission=${e.commissionAmount} (expected ${canon.commission}) payout=${e.partnerPayout} (expected ${canon.netPayout})`);
    }
    if (round2(e.commissionAmount + e.partnerPayout) !== round2(e.grossAmount)) {
      unreconciled++;
      report('CRITICAL', 'escrow does not reconcile to gross',
        `${e.id} ${e.commissionAmount} + ${e.partnerPayout} != ${e.grossAmount}`);
    }
  }
  console.log(`  ${escrow.length} rows · ${mismatched} mismatched · ${unreconciled} unreconciled`);

  // ── 3 & 4. Booking ↔ escrow coverage ──────────────────────────────────────
  section('Booking coverage');
  const completed = await prisma.booking.findMany({ where: { status: 'completed' }, include: { escrow: true } });
  const heldAfterCompletion = completed.filter((b) => b.escrow && b.escrow.status === 'held');
  const noEscrow = await prisma.booking.count({ where: { escrow: { is: null } } });
  if (heldAfterCompletion.length) {
    report('HIGH', 'completed booking with escrow still held',
      `${heldAfterCompletion.length} booking(s) — earnings never moved to available (see conflict C-04)`);
  }
  if (noEscrow) report('MEDIUM', 'booking with no escrow row', `${noEscrow} booking(s)`);
  console.log(`  ${completed.length} completed · ${heldAfterCompletion.length} still held · ${noEscrow} bookings without escrow`);

  // ── 5. Withdrawal records ─────────────────────────────────────────────────
  section('Withdrawal records');
  const payouts = await prisma.payoutRecord.findMany();
  let orphaned = 0;
  for (const p of payouts) {
    if (p.status === 'void') continue;
    const debit = await prisma.walletLedgerEntry.findFirst({
      where: { partnerId: p.partnerId, type: 'payout_debit' },
    });
    if (!debit) {
      orphaned++;
      report('HIGH', 'withdrawal with no payout_debit entry',
        `${p.id} amountPaid=${p.amountPaid} status=${p.status} — never debited a balance`);
    }
  }
  console.log(`  ${payouts.length} records · ${orphaned} orphaned · ${payouts.filter((p) => p.status === 'void').length} void`);

  // ── 6 & 7. Wallet derivation and invariants ───────────────────────────────
  section('Wallets');
  const wallets = await prisma.partnerWallet.findMany();
  for (const w of wallets) {
    const entries = await prisma.walletLedgerEntry.findMany({ where: { partnerId: w.partnerId } });
    const sum = (t) => round2(entries.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0));

    // Balances derive from BUCKET + DIRECTION, not from an enumerated list of
    // entry types. `adjustment` and `reversal` carry an explicit bucket from the
    // caller, so a type-based sum silently ignores them and reports a healthy
    // wallet as broken the moment a legitimate correction is posted.
    const bucketBalance = (bucket) => round2(entries
      .filter((e) => e.bucket === bucket)
      .reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0));

    const derived = {
      availableBalance: bucketBalance('available'),
      pendingBalance: bucketBalance('pending'),
      // Lifetime is a running counter, not a balance — it only ever grows, and
      // only earnings feed it. Matches ledger.js:120.
      lifetimeEarnings: round2(sum('earning_credit') + sum('opening_balance')),
    };
    for (const [k, v] of Object.entries(derived)) {
      if (round2(w[k]) !== v) {
        report('HIGH', 'wallet disagrees with its ledger',
          `partner=${w.partnerId} ${k} stored=${w[k]} derived=${v}`);
      }
    }
    if (w.availableBalance < 0) report('CRITICAL', 'negative available balance', `partner=${w.partnerId} ${w.availableBalance}`);
    if (sum('payout_debit') > derived.lifetimeEarnings) {
      report('CRITICAL', 'withdrawn exceeds lifetime earnings',
        `partner=${w.partnerId} withdrawn=${sum('payout_debit')} lifetime=${derived.lifetimeEarnings}`);
    }
  }
  console.log(`  ${wallets.length} wallet(s) checked`);

  // ── 8. Pending backed by FUNDED held escrow ───────────────────────────────
  //
  // `pending` is the partner's share of money ServisAku has actually received
  // and is holding — not the sum of every escrow row. An escrow row is written
  // at BOOKING CREATION, before any money moves; the hold entry is written at
  // PAYMENT SETTLEMENT (creditEscrowHold, called only from markPaidAndEscrow).
  // A booking the customer has not paid for creates no liability to the partner,
  // so counting it here would overstate what is owed.
  section('Pending vs funded escrow');
  const FUNDED = ['paid', 'escrowed'];
  const fundedHeld = escrow.filter((e) => e.status === 'held' && FUNDED.includes(e.booking?.paymentStatus));
  const unfundedHeld = escrow.filter((e) => e.status === 'held' && !FUNDED.includes(e.booking?.paymentStatus));

  const fundedSum = round2(fundedHeld.reduce((s, e) => s + e.partnerPayout, 0));
  const walletPending = round2(wallets.reduce((s, w) => s + w.pendingBalance, 0));

  // Funded escrow with no partner cannot be credited to anyone — creditEscrowHold
  // returns early on a missing partnerId. Reported separately so it is never
  // silently rolled into the expected figure.
  const fundedUnassigned = fundedHeld.filter((e) => !e.booking?.partnerId);
  const fundedUnassignedSum = round2(fundedUnassigned.reduce((s, e) => s + e.partnerPayout, 0));
  const attributable = round2(fundedSum - fundedUnassignedSum);

  if (walletPending !== attributable) {
    report('HIGH', 'pending balance not backed by funded held escrow',
      `wallet pending=${walletPending} vs attributable funded escrow=${attributable}`);
  }
  if (fundedUnassigned.length) {
    report('MEDIUM', 'funded escrow with no partner assigned',
      `${fundedUnassigned.length} booking(s), RM ${fundedUnassignedSum} — paid before assignment, so no partner-specific hold exists yet (lifecycle gap)`);
  }
  console.log(`  wallet pending=${walletPending} · funded held escrow=${fundedSum}`
    + ` (attributable=${attributable}, unassigned=${fundedUnassignedSum})`);
  console.log(`  unfunded held escrow (correctly excluded): ${unfundedHeld.length} row(s), `
    + `RM ${round2(unfundedHeld.reduce((s, e) => s + e.partnerPayout, 0))}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  section('Findings');
  if (!findings.length) {
    console.log('  none — all checks pass');
    return;
  }
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    console.log(`\n  ${sev} (${group.length})`);
    for (const f of group.slice(0, 20)) console.log(`    · ${f.check}: ${f.detail}`);
    if (group.length > 20) console.log(`    … and ${group.length - 20} more`);
  }
  console.log(`\n  ${findings.length} finding(s). No changes were made — this script is read-only.`);
  process.exitCode = 1;
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
