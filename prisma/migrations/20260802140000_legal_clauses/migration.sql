-- Citable clause chunks derived from a published legal document.
--
-- Additive: a new table only. Nothing reads it until the chatbot's legal
-- knowledge source is switched on, which is itself gated behind
-- CHATBOT_LEGAL_SOURCE_ENABLED (default off) pending docs/12-tc-conflict-report.md.

-- CreateTable
CREATE TABLE "LegalClause" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "clauseNo" TEXT NOT NULL,
    "partLabel" TEXT,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalClause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per clause per locale per document version. A rebuild replaces rows
-- rather than accumulating them.
CREATE UNIQUE INDEX "LegalClause_documentId_clauseNo_locale_key" ON "LegalClause"("documentId", "clauseNo", "locale");
CREATE INDEX "LegalClause_documentId_ordinal_idx" ON "LegalClause"("documentId", "ordinal");
CREATE INDEX "LegalClause_clauseNo_idx" ON "LegalClause"("clauseNo");

-- AddForeignKey
ALTER TABLE "LegalClause" ADD CONSTRAINT "LegalClause_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
