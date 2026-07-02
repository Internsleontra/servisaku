-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDraft" JSONB,
ADD COLUMN     "partnerProfile" JSONB;
