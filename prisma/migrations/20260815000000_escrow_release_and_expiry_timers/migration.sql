-- Escrow release timers (C-04) and paid-but-unassigned expiry (RM116).
--
-- ADDITIVE AND NON-DESTRUCTIVE. Two nullable columns and four indexes. No
-- existing column is renamed, dropped or rewritten, and no row is modified —
-- this migration is fully reversible by dropping what it adds.
--
-- WHY REAL COLUMNS. Completion time already exists inside Booking."lifecycle"
-- (a JSON array of { status, at, by }). The release worker asks, on every tick,
-- "which held escrow rows belong to a booking completed more than 48 hours
-- ago?" — a question no index can answer against a JSON blob. Both timers
-- therefore get indexed DateTime columns.
--
--   completedAt           — stamped when a booking's status becomes 'completed'
--   completionConfirmedAt — stamped when the CUSTOMER confirms completion,
--                           which starts the shorter 24h timer in T&C 7.9(b)
--
-- BACKFILL IS DELIBERATELY OMITTED. Existing completed bookings keep
-- completedAt = NULL, so the worker will not release them on its first tick.
-- Backfilling from `lifecycle` would make the worker immediately pay out every
-- historical booking at once — including the two rows behind the RM232 C-04
-- backlog, which are a business decision, not a migration side effect. Those
-- are released deliberately, through the existing admin endpoint or a reviewed
-- one-off, after the balances are checked.

-- ── Booking: completion timestamps ──────────────────────────────────────────
ALTER TABLE "Booking" ADD COLUMN "completedAt"           TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "completionConfirmedAt" TIMESTAMP(3);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Release worker: held escrow whose booking completed before a cutoff.
CREATE INDEX "Booking_status_completedAt_idx"
    ON "Booking"("status", "completedAt");

-- Release worker: the 24h post-confirmation branch.
CREATE INDEX "Booking_completionConfirmedAt_idx"
    ON "Booking"("completionConfirmedAt");

-- Expiry worker: paid but still unassigned since a cutoff. partnerId is NULL
-- for exactly the rows this looks for, so it leads the index.
CREATE INDEX "Booking_partnerId_paymentStatus_createdAt_idx"
    ON "Booking"("partnerId", "paymentStatus", "createdAt");
