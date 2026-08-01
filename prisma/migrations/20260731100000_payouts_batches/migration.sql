-- AlterTable

-- AlterTable
ALTER TABLE "PayoutRecord" ADD COLUMN     "adjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bankSnapshot" JSONB,
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "bookingIds" JSONB,
ADD COLUMN     "commissionDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cycle" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "gatewayRef" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "partnerCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "exportUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerBankAccount" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'savings',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_reference_key" ON "PayoutBatch"("reference");

-- CreateIndex
CREATE INDEX "PayoutBatch_status_periodEnd_idx" ON "PayoutBatch"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerBankAccount_partnerId_key" ON "PartnerBankAccount"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerBankAccount_isVerified_idx" ON "PartnerBankAccount"("isVerified");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_reference_key" ON "PayoutRecord"("reference");

-- CreateIndex
CREATE INDEX "PayoutRecord_batchId_idx" ON "PayoutRecord"("batchId");

-- CreateIndex
CREATE INDEX "PayoutRecord_status_scheduledDate_idx" ON "PayoutRecord"("status", "scheduledDate");

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerBankAccount" ADD CONSTRAINT "PartnerBankAccount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

