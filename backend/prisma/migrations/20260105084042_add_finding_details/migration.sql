-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('INTERNAL_AUDIT', 'EXTERNAL_AUDIT', 'CONTROL_TEST', 'INCIDENT', 'SELF_ASSESSMENT', 'OTHER');

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "affectedSystem" TEXT,
ADD COLUMN     "closedDate" TIMESTAMP(3),
ADD COLUMN     "managementResponse" TEXT,
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "source" "FindingSource" NOT NULL DEFAULT 'INTERNAL_AUDIT',
ADD COLUMN     "targetResolutionDate" TIMESTAMP(3);
