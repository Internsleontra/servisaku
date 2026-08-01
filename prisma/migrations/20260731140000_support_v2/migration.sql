-- AlterTable

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'app',
ADD COLUMN     "chatbotConversationId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "csatComment" TEXT,
ADD COLUMN     "csatRating" INTEGER,
ADD COLUMN     "escalationLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "relatedClaimId" TEXT,
ADD COLUMN     "relatedDisputeId" TEXT,
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "slaFirstResponseAt" TIMESTAMP(3),
ADD COLUMN     "slaResolutionAt" TIMESTAMP(3),
ADD COLUMN     "tags" JSONB;

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "preferredFrom" TIMESTAMP(3) NOT NULL,
    "preferredTo" TIMESTAMP(3) NOT NULL,
    "topic" TEXT,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "assignedToId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameMy" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL DEFAULT 'HelpCircle',
    "audience" TEXT NOT NULL DEFAULT 'consumer',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HelpCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleMy" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "bodyMdMy" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'consumer',
    "tags" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "CallbackRequest_status_preferredFrom_idx" ON "CallbackRequest"("status", "preferredFrom");

-- CreateIndex
CREATE INDEX "CallbackRequest_userId_idx" ON "CallbackRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpCategory_slug_key" ON "HelpCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_categoryId_isPublished_idx" ON "HelpArticle"("categoryId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpArticle" ADD CONSTRAINT "HelpArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HelpCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

