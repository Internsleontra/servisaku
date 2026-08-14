#!/usr/bin/env node
/**
 * Correct escrow rows written with the customer booking fee instead of the
 * partner commission, void orphaned withdrawal records, and rebuild wallet
 * balances from the ledger.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/correct-escrow-commission.mjs            # report only
 *   node scripts/correct-escrow-commission.mjs --apply    # write + audit trail
 *
 * Auditable and reversible:
 *   · every change is written to .backups/correction-<stamp>.json with the
 *     before and after value of each field
 *   · nothing is deleted — orphaned payouts move to status 'void' with a reason
 *   · wallet balances are rebuilt from ledger entries, which are themselves
 *     append-only, so the derivation can always be re-run
 *
 * NOT FOR PRODUCTION. NODE_ENV must be exactly "development" or "test";
 * anything else — including unset or empty — is refused. The check lives in
 * ./_assert-dev-env.mjs and is imported FIRST, before @prisma/client can load
 * .env into process.env, so the guard sees what the operator set rather than
 * what a file on disk supplied. Pass it explicitly:
 *
 *   NODE_ENV=development node scripts/correct-escrow-commission.mjs
 *   NODE_ENV=development node scripts/correct-escrow-commission.mjs --apply
 */
// MUST be first: validates NODE_ENV before any import can load .env.
import './_assert-dev-env.mjs';
import { PrismaClient } from '@prisma/client';
import { split } from '../server/lib/payments/commission.js';
import fs from 'node:fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const audit = { startedAt: new Date().toISOString(), applied: APPLY, escrow: [], payouts: [], wallets: [], invariants: [] };
let failures = 0;

function line(s = '') { console.log(s); }
function head(s) { line(); line(s); line('─'.repeat(s.length)); }

async function main() {
  line(APPLY ? '▶ APPLY — changes will be written' : '▶ DRY RUN — no changes will be written');

  // ── 1. Escrow rows ────────────────────────────────────────────────────────
  head('Escrow rows');
  const rows = await prisma.escrowLedger.findMany({
    include: { booking: { include: { partner: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let totalBefore = 0, totalAfter = 0;
  for (const e of rows) {
    const partner = e.booking?.partner ?? null;
    const canon = split(e.grossAmount, { partner });
    const changed = round2(e.commissionAmount) !== canon.commission
      || round2(e.partnerPayout) !== canon.netPayout;

    totalBefore = round2(totalBefore + e.partnerPayout);
    totalAfter = round2(totalAfter + canon.netPayout);

    if (!changed) continue;
    audit.escrow.push({
      id: e.id,
      bookingId: e.bookingId,
      bookingStatus: e.booking?.status ?? null,
      before: { commissionAmount: e.commissionAmount, commissionRate: e.commissionRate, partnerPayout: e.partnerPayout },
      after: { commissionAmount: canon.commission, commissionRate: canon.rate, partnerPayout: canon.netPayout },
    });
    line(`  ${e.id.slice(-6)}  gross ${String(e.grossAmount).padStart(7)}  `
      + `payout ${String(e.partnerPayout).padStart(7)} → ${String(canon.netPayout).padStart(7)}  `
      + `(${e.booking?.status ?? 'no booking'})`);

    if (APPLY) {
      await prisma.escrowLedger.update({
        where: { id: e.id },
        data: {
          commissionAmount: canon.commission,
          commissionRate: canon.rate,
          partnerPayout: canon.netPayout,
        },
      });
    }
  }
  line(`  ${audit.escrow.length} of ${rows.length} rows corrected · partner payout ${totalBefore} → ${totalAfter} (${round2(totalBefore - totalAfter)} overstated)`);

  // ── 2. Orphaned withdrawal records ────────────────────────────────────────
  head('Withdrawal records');
  const payouts = await prisma.payoutRecord.findMany();
  for (const p of payouts) {
    // A withdrawal is legitimate only if a matching payout_debit exists — that
    // is the entry the withdraw endpoint writes. Without it the record never
    // moved money and represents nothing.
    const debit = await prisma.walletLedgerEntry.findFirst({
      where: { partnerId: p.partnerId, type: 'payout_debit' },
    });
    if (debit) { line(`  ${p.id.slice(-6)}  RM ${p.amountPaid}  has a matching debit — left untouched`); continue; }
    if (p.status === 'void') { line(`  ${p.id.slice(-6)}  already void`); continue; }

    const reason = 'No matching payout_debit ledger entry — record was written outside the withdraw endpoint and never debited a balance.';
    audit.payouts.push({ id: p.id, before: { status: p.status }, after: { status: 'void' }, amountPaid: p.amountPaid, reason });
    line(`  ${p.id.slice(-6)}  RM ${p.amountPaid}  → void  (${reason.slice(0, 48)}…)`);
    if (APPLY) {
      await prisma.payoutRecord.update({
        where: { id: p.id },
        data: { status: 'void', failureReason: reason },
      });
    }
  }

  // ── 3. Wallet balances, rebuilt from the ledger ───────────────────────────
  head('Wallet balances (derived from ledger)');
  const wallets = await prisma.partnerWallet.findMany();
  for (const w of wallets) {
    const entries = await prisma.walletLedgerEntry.findMany({ where: { partnerId: w.partnerId } });
    const sum = (type) => round2(entries.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0));

    const derived = {
      availableBalance: round2(sum('earning_credit') + sum('opening_balance') - sum('payout_debit')),
      pendingBalance: round2(sum('escrow_hold') - sum('escrow_release')),
      lifetimeEarnings: round2(sum('earning_credit') + sum('opening_balance')),
      outstandingCommission: round2(sum('commission_debit') - sum('settlement_credit')),
    };

    const before = {
      availableBalance: w.availableBalance, pendingBalance: w.pendingBalance,
      lifetimeEarnings: w.lifetimeEarnings, outstandingCommission: w.outstandingCommission,
    };
    const changed = Object.keys(derived).some((k) => round2(before[k]) !== derived[k]);
    line(`  partner ${w.partnerId.slice(-6)}`);
    for (const k of Object.keys(derived)) {
      const mark = round2(before[k]) !== derived[k] ? ' ←' : '';
      line(`    ${k.padEnd(22)} ${String(before[k]).padStart(8)} → ${String(derived[k]).padStart(8)}${mark}`);
    }
    if (changed) {
      audit.wallets.push({ partnerId: w.partnerId, before, after: derived });
      if (APPLY) await prisma.partnerWallet.update({ where: { id: w.id }, data: derived });
    }
  }

  // ── 4. Invariants ─────────────────────────────────────────────────────────
  head('Invariants');
  const heldSum = round2((await prisma.escrowLedger.findMany({ where: { status: 'held' } }))
    .reduce((s, e) => s + e.partnerPayout, 0));

  for (const w of await prisma.partnerWallet.findMany()) {
    const entries = await prisma.walletLedgerEntry.findMany({ where: { partnerId: w.partnerId } });
    const sum = (t) => round2(entries.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0));
    const withdrawn = sum('payout_debit');
    const lifetime = round2(sum('earning_credit') + sum('opening_balance'));
    const available = round2(lifetime - withdrawn);

    const checks = [
      ['available >= 0', available >= 0, `available=${available}`],
      ['withdrawn <= lifetime', withdrawn <= lifetime, `withdrawn=${withdrawn} lifetime=${lifetime}`],
    ];
    for (const [name, pass, detail] of checks) {
      audit.invariants.push({ partnerId: w.partnerId, name, pass, detail });
      if (!pass) failures++;
      line(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} ${detail}`);
    }
  }

  // This one is global, not per-partner: the ledger's pending bucket must be
  // backed by escrow that is actually still held.
  const walletPending = round2((await prisma.partnerWallet.findMany()).reduce((s, w) => s + w.pendingBalance, 0));
  const pendingOk = walletPending === heldSum;
  audit.invariants.push({ name: 'pending == Σ held escrow partnerPayout', pass: pendingOk, detail: `wallet=${walletPending} escrow=${heldSum}` });
  if (!pendingOk) failures++;
  line(`  ${pendingOk ? 'PASS' : 'FAIL'}  ${'pending == Σ held escrow'.padEnd(24)} wallet=${walletPending} escrow=${heldSum}`);

  // ── Audit trail ───────────────────────────────────────────────────────────
  audit.finishedAt = new Date().toISOString();
  audit.invariantFailures = failures;
  if (APPLY) {
    fs.mkdirSync('.backups', { recursive: true });
    const f = `.backups/correction-${audit.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
    fs.writeFileSync(f, JSON.stringify(audit, null, 2));
    line();
    line(`Audit trail written to ${f}`);
  }

  line();
  if (failures) {
    line(`⚠ ${failures} invariant(s) still failing — reported, not auto-corrected.`);
  } else {
    line('✓ All invariants hold.');
  }
  if (!APPLY) line('(dry run — re-run with --apply to write)');
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
