-- Consumable restock reminders. A counter with a threshold, not a stock count —
-- see the model comment in schema.prisma for why that distinction is deliberate.
--
-- Additive: a new table only.

-- CreateTable
CREATE TABLE "PartnerConsumable" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "jobsSinceRestock" INTEGER NOT NULL DEFAULT 0,
    "threshold" INTEGER NOT NULL DEFAULT 10,
    "lastRestockedAt" TIMESTAMP(3),
    "dismissedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerConsumable_partnerId_category_item_key" ON "PartnerConsumable"("partnerId", "category", "item");
CREATE INDEX "PartnerConsumable_partnerId_idx" ON "PartnerConsumable"("partnerId");
