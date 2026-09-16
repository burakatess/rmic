-- CreateEnum
CREATE TYPE "AiEvalMessageKind" AS ENUM ('EVALUATION', 'QUESTION', 'ANSWER');

-- AlterTable
ALTER TABLE "AiEvalMessage" ADD COLUMN     "additionalNote" TEXT,
ADD COLUMN     "answerText" TEXT,
ADD COLUMN     "kind" "AiEvalMessageKind" NOT NULL DEFAULT 'EVALUATION',
ADD COLUMN     "retrievalNote" JSONB,
ADD COLUMN     "schemaIssues" JSONB,
ADD COLUMN     "schemaValid" BOOLEAN,
ADD COLUMN     "schemaVersion" TEXT;

-- AlterTable
ALTER TABLE "AiEvalSession" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsReviewReason" TEXT;
