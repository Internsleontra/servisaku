-- NOTE: `prisma migrate diff` also emits
--   ALTER TABLE "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;
-- That is pre-existing drift from 20260725000000_notification_system, which added
-- the column with DEFAULT CURRENT_TIMESTAMP to backfill existing rows. It is
-- unrelated to the wallet work and is deliberately left out of this migration.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "amountMyr" DOUBLE PRECISION,
ADD COLUMN     "collectedById" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "netToPartner" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "sstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'booking';

-- CreateTable
CREATE TABLE "PartnerWallet" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outstandingCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "settlementCycle" TEXT NOT NULL DEFAULT 'weekly',
    "nextSettlementDate" TIMESTAMP(3),
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "payoutsSuspended" BOOLEAN NOT NULL DEFAULT false,
    "freezeReason" TEXT,
    "frozenAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "payoutId" TEXT,
    "settlementId" TEXT,
    "claimId" TEXT,
    "reversalOf" TEXT,
    "createdById" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlement" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossCashCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sstOnCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "bookingIds" JSONB,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "adminOverrideById" TEXT,
    "adminOverrideReason" TEXT,
    "adminOverrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerWallet_partnerId_key" ON "PartnerWallet"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerWallet_isFrozen_idx" ON "PartnerWallet"("isFrozen");

-- CreateIndex
CREATE INDEX "PartnerWallet_nextSettlementDate_idx" ON "PartnerWallet"("nextSettlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_partnerId_createdAt_idx" ON "WalletLedgerEntry"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_bookingId_idx" ON "WalletLedgerEntry"("bookingId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_type_idx" ON "WalletLedgerEntry"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSettlement_reference_key" ON "CommissionSettlement"("reference");

-- CreateIndex
CREATE INDEX "CommissionSettlement_partnerId_status_idx" ON "CommissionSettlement"("partnerId", "status");

-- CreateIndex
CREATE INDEX "CommissionSettlement_status_dueDate_idx" ON "CommissionSettlement"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_type_status_idx" ON "Payment"("type", "status");

-- CreateIndex
CREATE INDEX "Payment_partnerId_idx" ON "Payment"("partnerId");

-- AddForeignKey
ALTER TABLE "PartnerWallet" ADD CONSTRAINT "PartnerWallet_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "PartnerWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "PartnerWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

