#!/usr/bin/env node
/**
 * Repair funded bookings that have a partner assigned but no `escrow_hold`.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/repair-escrow-holds.mjs           # report only
 *   node scripts/repair-escrow-holds.mjs --apply
 *
 * This writes the entry the settlement path should have written. It invents
 * nothing: the amount comes from the canonical `split()`, the money is already
 * held in escrow, and the partner is already assigned. `ensureEscrowHold` is
 * idempotent (`escrow_hold:<bookingId>` is `@unique`), so a booking that already
 * has its hold is skipped rather than double-credited.
 *
 * DELIBERATELY NOT REPAIRED — funded bookings with `partnerId = null`. There is
 * nobody to hold the liability for, and inventing a partner would fabricate a
 * balance. That lifecycle is undefined; see docs/14-escrow-attribution-gap.md.
 *
 * NOT FOR PRODUCTION. NODE_ENV must be exactly "development" or "test";
 * anything else — including unset or empty — is refused. The check lives in
 * ./_assert-dev-env.mjs and is imported FIRST, before @prisma/client can load
 * .env into process.env, so the guard sees what the operator set rather than
 * what a file on disk supplied. Pass it explicitly:
 *
 *   NODE_ENV=development node scripts/repair-escrow-holds.mjs
 *   NODE_ENV=development node scripts/repair-escrow-holds.mjs --apply
 */
// MUST be first: validates NODE_ENV before any import can load .env.
import './_assert-dev-env.mjs';
import { PrismaClient } from '@prisma/client';
import { findMissingEscrowHolds, ensureEscrowHold } from '../server/lib/wallet/index.js';
import fs from 'node:fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const audit = { startedAt: new Date().toISOString(), applied: APPLY, repaired: [], skipped: [] };

function head(s) { console.log(`\n${s}\n${'─'.repeat(s.length)}`); }

async function main() {
  console.log(APPLY ? '▶ APPLY — changes will be written' : '▶ DRY RUN — no changes will be written');

  // ── Repairable: funded + partner assigned + no hold ───────────────────────
  head('Missing holds (funded, partner assigned)');
  const missing = await findMissingEscrowHolds({ db: prisma });
  if (!missing.length) console.log('  none — every funded, assigned booking has its hold');

  for (const m of missing) {
    const consistent = m.escrowPayout == null || round2(m.escrowPayout) === round2(m.expected);
    console.log(`  booking ${m.bookingId.slice(-6)}  expected RM ${m.expected}`
      + `  escrowPayout RM ${m.escrowPayout}  status=${m.status}/${m.paymentStatus}`
      + (consistent ? '' : '  ← MISMATCH vs escrow row'));

    if (!consistent) {
      // Never write a hold that disagrees with the escrow row — that would put
      // two different numbers on the same booking.
      audit.skipped.push({ ...m, reason: 'hold amount disagrees with EscrowLedger.partnerPayout' });
      console.log('    skipped — resolve the escrow row first');
      continue;
    }

    audit.repaired.push(m);
    if (APPLY) {
      const entry = await ensureEscrowHold(m.bookingId, { db: prisma });
      console.log(`    wrote ledger entry ${entry ? entry.id.slice(-6) : '(none)'}`);
    }
  }

  // ── Not repairable: funded but unassigned ─────────────────────────────────
  head('Funded but UNASSIGNED (left untouched by design)');
  const unassigned = await prisma.booking.findMany({
    where: { paymentStatus: { in: ['paid', 'escrowed'] }, partnerId: null },
    include: { escrow: true },
  });
  if (!unassigned.length) console.log('  none');
  for (const b of unassigned) {
    console.log(`  booking ${b.id.slice(-6)}  escrow payout RM ${b.escrow?.partnerPayout ?? '—'}`
      + `  paymentStatus=${b.paymentStatus}  partner=NONE`);
    audit.skipped.push({ bookingId: b.id, reason: 'no partner assigned — lifecycle undefined (docs/14)' });
  }
  console.log(`  Σ RM ${round2(unassigned.reduce((s, b) => s + (b.escrow?.partnerPayout || 0), 0))}`
    + ' — no hold created, no partner credited, no adjustment posted');

  // ── Resulting balances ────────────────────────────────────────────────────
  head('Wallet balances');
  for (const w of await prisma.partnerWallet.findMany()) {
    const entries = await prisma.walletLedgerEntry.findMany({ where: { partnerId: w.partnerId } });
    const bucket = (b) => round2(entries.filter((e) => e.bucket === b)
      .reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0));
    console.log(`  partner ${w.partnerId.slice(-6)}  stored pending=${w.pendingBalance}  derived pending=${bucket('pending')}`);
    if (APPLY && round2(w.pendingBalance) !== bucket('pending')) {
      await prisma.partnerWallet.update({ where: { id: w.id }, data: { pendingBalance: bucket('pending') } });
      console.log(`    pendingBalance updated → ${bucket('pending')}`);
    }
  }

  if (APPLY) {
    fs.mkdirSync('.backups', { recursive: true });
    audit.finishedAt = new Date().toISOString();
    const f = `.backups/repair-holds-${audit.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
    fs.writeFileSync(f, JSON.stringify(audit, null, 2));
    console.log(`\nAudit trail written to ${f}`);
  } else {
    console.log('\n(dry run — re-run with --apply to write)');
  }
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
