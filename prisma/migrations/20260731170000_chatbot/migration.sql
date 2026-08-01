-- AlterTable

-- CreateTable
CREATE TABLE "ChatbotConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'consumer',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'active',
    "topic" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "supportTicketId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "wasHelpful" BOOLEAN,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "sources" JSONB,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "latencyMs" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatbotConversation_userId_lastMessageAt_idx" ON "ChatbotConversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatbotConversation_sessionId_idx" ON "ChatbotConversation"("sessionId");

-- CreateIndex
CREATE INDEX "ChatbotConversation_status_idx" ON "ChatbotConversation"("status");

-- CreateIndex
CREATE INDEX "ChatbotMessage_conversationId_createdAt_idx" ON "ChatbotMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatbotMessage" ADD CONSTRAINT "ChatbotMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatbotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

