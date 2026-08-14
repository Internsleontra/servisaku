-- Financial naming remediation.
--
-- Two distinct concepts were both called "platform fee":
--   · the CUSTOMER's flat booking fee (added to what they pay)
--   · ServisAku's COMMISSION on the partner (deducted from their earnings)
-- EscrowLedger."platformFee" held the first while meaning the second, so every
-- row recorded a flat RM5 cut instead of the tier-aware 20% commission.
--
-- PayoutRecord was likewise named as if it were a per-booking earnings record.
-- It is a WITHDRAWAL of available balance covering many bookings at once, which
-- is why it has no bookingId — that is correct, not a gap.
--
-- ⚠ THIS MIGRATION CHANGES BOTH SCHEMA AND DATA, AND IS PARTLY DESTRUCTIVE.
-- It performs, in order:
--   1. SCHEMA RENAME   EscrowLedger."platformFee" -> "commissionAmount"
--   2. SCHEMA ADD      EscrowLedger."commissionRate" (NOT NULL, DEFAULT 0.20)
--   3. DATA BACKFILL   UPDATE every EscrowLedger row's "commissionRate" from
--                      "commissionAmount" / "grossAmount"
--   4. SCHEMA RENAME   PayoutRecord."grossEarning" -> "amountRequested"
--   5. SCHEMA RENAME   PayoutRecord."netPayout"    -> "amountPaid"
--   6. DESTRUCTIVE     DROP COLUMN PayoutRecord."commissionAmount"
--
-- ROLLBACK. Steps 1–5 are reversible in SQL (rename back, drop the added
-- column). STEP 6 IS NOT: dropping a column discards its values, and no SQL
-- statement can recover them. Recovery depends entirely on the pre-migration
-- snapshot .backups/financial-*.json, which captures EscrowLedger,
-- PayoutRecord, PartnerWallet and WalletLedgerEntry as they stood before this
-- ran. That file is gitignored and must be kept outside version control —
-- without it this migration cannot be undone. The column was verified 0 in
-- every row before dropping (max|value| = 0), so no value is believed lost,
-- but the irreversibility is structural regardless.
--
-- NO AMOUNT IS RECOMPUTED HERE. The renames carry every existing value across
-- unchanged, and the only write is the "commissionRate" backfill above.
-- Recomputing the amounts happens in the separate, reversible correction
-- script so the two concerns can be rolled back independently.
-- "commissionAmount" therefore still holds the WRONG (booking fee) value after
-- this migration — by design, so the correction has an original to diff against.

-- ── EscrowLedger ────────────────────────────────────────────────────────────
ALTER TABLE "EscrowLedger" RENAME COLUMN "platformFee" TO "commissionAmount";

-- Rate in force at booking time, snapshotted so a later tier change cannot
-- retroactively alter a settled split. Backfilled below from the values the
-- rows actually carry, so the column is honest about what each row represents
-- until the correction script runs.
ALTER TABLE "EscrowLedger" ADD COLUMN "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.20;

UPDATE "EscrowLedger"
   SET "commissionRate" = CASE
         WHEN "grossAmount" > 0 THEN "commissionAmount" / "grossAmount"
         ELSE 0.20
       END;

-- ── PayoutRecord ────────────────────────────────────────────────────────────
ALTER TABLE "PayoutRecord" RENAME COLUMN "grossEarning" TO "amountRequested";
ALTER TABLE "PayoutRecord" RENAME COLUMN "netPayout"    TO "amountPaid";

-- Retired: commission is taken once, at booking time, and never on a
-- withdrawal. Verified 0 in every row before dropping (max|value| = 0), and the
-- pre-migration table is captured in .backups/financial-*.json.
ALTER TABLE "PayoutRecord" DROP COLUMN "commissionAmount";
