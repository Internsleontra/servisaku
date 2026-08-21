-- Malay columns for the last customer-visible backend content.
--
-- ADDITIVE AND NON-DESTRUCTIVE. Three ADD COLUMNs. No column is renamed,
-- dropped or rewritten, no row is modified, and every existing English field
-- keeps its value and its meaning. Clients that never read the new columns are
-- unaffected.
--
-- BookingQuestion.labelMy / QuestionOption.labelMy
--   Quote line items are built from these labels, so a quote could not be
--   localized while they were English-only. NOT NULL DEFAULT '' rather than
--   nullable: the seed always writes a value, and '' is an explicit "not yet
--   translated" that the validator can detect. A NULL would be
--   indistinguishable from a column that was simply never backfilled.
--
-- Notification.titleMy / Notification.bodyMy
--   NULLABLE on purpose. Notifications are rendered from catalog.js templates
--   at creation time and persisted; going forward both languages are written.
--   Historical rows CANNOT be reconstructed: buildMetadata() persisted only
--   `event`, `channels`, `ctaLabel`, `serviceName`, `ref`, `amount`,
--   `partnerName` and `customerName`, while the 88 templates interpolate 24
--   further fields (reason, date, timeSlot, eta, otp, rating, outcome, payout,
--   …). Re-rendering an old row would emit "undefined" into customer-visible
--   text, so those rows are deliberately left NULL and fall back to the stored
--   English. No backfill is attempted here for exactly that reason.

-- AlterTable
ALTER TABLE "BookingQuestion" ADD COLUMN     "labelMy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "QuestionOption" ADD COLUMN     "labelMy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "titleMy" TEXT,
ADD COLUMN     "bodyMy" TEXT;
