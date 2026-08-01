-- Invoice numbering must be sequential and gapless for audit, so it comes from a
-- Postgres sequence rather than a count query (which races) or a cuid (which is
-- not sequential). Prisma does not generate this — it is maintained by hand.
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

-- CreateTable
CREATE TABLE "TaxConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "registrationNo" TEXT,
    "appliesTo" JSONB,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'tax_invoice',
    "bookingId" TEXT,
    "consumerId" TEXT,
    "partnerId" TEXT,
    "settlementId" TEXT,
    "paymentId" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discountTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL,
    "sstRate" DOUBLE PRECISION NOT NULL,
    "sstAmount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierName" TEXT NOT NULL,
    "supplierAddress" TEXT,
    "sstRegistrationNo" TEXT,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "lineItems" JSONB NOT NULL,
    "creditNoteFor" TEXT,
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxConfig_code_isActive_idx" ON "TaxConfig"("code", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxConfig_code_effectiveFrom_key" ON "TaxConfig"("code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_consumerId_issuedAt_idx" ON "Invoice"("consumerId", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_partnerId_issuedAt_idx" ON "Invoice"("partnerId", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_type_issuedAt_idx" ON "Invoice"("type", "issuedAt");

