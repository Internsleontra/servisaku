-- Chatbot v2: conversation modes, decision-tree state, per-turn locale, rich
-- message payloads, and the confirmation-card table that lets the assistant
-- PROPOSE a state change without ever being able to perform one.
--
-- Additive only. Every added column is nullable or carries a default, so the
-- existing rows and the running code are unaffected until the new paths ship.

-- AlterTable: ChatbotConversation
ALTER TABLE "ChatbotConversation" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'assistant';
ALTER TABLE "ChatbotConversation" ADD COLUMN     "treeState" JSONB;
ALTER TABLE "ChatbotConversation" ADD COLUMN     "intent" TEXT;
ALTER TABLE "ChatbotConversation" ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "ChatbotConversation" ADD COLUMN     "deviceInfo" JSONB;
ALTER TABLE "ChatbotConversation" ADD COLUMN     "lastLocale" TEXT;

-- AlterTable: ChatbotMessage
ALTER TABLE "ChatbotMessage" ADD COLUMN     "locale" TEXT;
ALTER TABLE "ChatbotMessage" ADD COLUMN     "attachments" JSONB;
ALTER TABLE "ChatbotMessage" ADD COLUMN     "cards" JSONB;
ALTER TABLE "ChatbotMessage" ADD COLUMN     "quickReplies" JSONB;
ALTER TABLE "ChatbotMessage" ADD COLUMN     "treeNode" TEXT;
ALTER TABLE "ChatbotMessage" ADD COLUMN     "cacheRead" INTEGER;

-- CreateTable
CREATE TABLE "ChatbotAction" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "destructive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatbotAction_conversationId_status_idx" ON "ChatbotAction"("conversationId", "status");
CREATE INDEX "ChatbotAction_userId_createdAt_idx" ON "ChatbotAction"("userId", "createdAt");
-- Drives the expiry sweep: pending cards past expiresAt.
CREATE INDEX "ChatbotAction_status_expiresAt_idx" ON "ChatbotAction"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ChatbotAction" ADD CONSTRAINT "ChatbotAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatbotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
