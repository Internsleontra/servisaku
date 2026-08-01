-- AlterTable

-- AlterTable
ALTER TABLE "RefundRequest" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "creditNoteId" TEXT,
ADD COLUMN     "disputeId" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "gatewayRefundRef" TEXT,
ADD COLUMN     "isAutoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liableParty" TEXT,
ADD COLUMN     "partnerLiabilityAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "policyApplied" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "refundMethod" TEXT NOT NULL DEFAULT 'original',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "slaDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "raisedByRole" TEXT NOT NULL,
    "againstId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "desiredOutcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignedToId" TEXT,
    "resolution" TEXT,
    "resolutionType" TEXT,
    "refundRequestId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "evidence" JSONB,
    "respondedAt" TIMESTAMP(3),
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_reference_key" ON "Dispute"("reference");

-- CreateIndex
CREATE INDEX "Dispute_status_priority_idx" ON "Dispute"("status", "priority");

-- CreateIndex
CREATE INDEX "Dispute_bookingId_idx" ON "Dispute"("bookingId");

-- CreateIndex
CREATE INDEX "Dispute_raisedById_idx" ON "Dispute"("raisedById");

-- CreateIndex
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RefundRequest_consumerId_idx" ON "RefundRequest"("consumerId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

