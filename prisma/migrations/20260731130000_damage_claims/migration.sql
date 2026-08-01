-- AlterTable

-- CreateTable
CREATE TABLE "DamageClaim" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "partnerId" TEXT,
    "category" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "incidentDescription" TEXT NOT NULL,
    "incidentAt" TIMESTAMP(3),
    "claimedAmount" DOUBLE PRECISION NOT NULL,
    "approvedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "partnerResponse" TEXT,
    "partnerRespondedAt" TIMESTAMP(3),
    "partnerLiabilityPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partnerLiabilityAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformAbsorbed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "investigatorId" TEXT,
    "investigationNotes" TEXT,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "compensationMethod" TEXT,
    "compensationRef" TEXT,
    "compensatedAt" TIMESTAMP(3),
    "insuranceClaimRef" TEXT,
    "acknowledgeDueAt" TIMESTAMP(3),
    "responseDueAt" TIMESTAMP(3),
    "investigationDueAt" TIMESTAMP(3),
    "compensationDueAt" TIMESTAMP(3),
    "appealCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageClaimEvidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByRole" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSec" INTEGER,
    "caption" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageClaimEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DamageClaim_reference_key" ON "DamageClaim"("reference");

-- CreateIndex
CREATE INDEX "DamageClaim_status_createdAt_idx" ON "DamageClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DamageClaim_partnerId_idx" ON "DamageClaim"("partnerId");

-- CreateIndex
CREATE INDEX "DamageClaim_consumerId_idx" ON "DamageClaim"("consumerId");

-- CreateIndex
CREATE INDEX "DamageClaimEvidence_claimId_idx" ON "DamageClaimEvidence"("claimId");

-- CreateIndex
CREATE INDEX "DamageClaimEvent_claimId_createdAt_idx" ON "DamageClaimEvent"("claimId", "createdAt");

-- AddForeignKey
ALTER TABLE "DamageClaim" ADD CONSTRAINT "DamageClaim_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageClaimEvidence" ADD CONSTRAINT "DamageClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "DamageClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageClaimEvent" ADD CONSTRAINT "DamageClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "DamageClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

