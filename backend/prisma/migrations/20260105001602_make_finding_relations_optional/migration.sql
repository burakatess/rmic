-- DropForeignKey
ALTER TABLE "Finding" DROP CONSTRAINT "Finding_controlId_fkey";

-- DropForeignKey
ALTER TABLE "Finding" DROP CONSTRAINT "Finding_riskId_fkey";

-- AlterTable
ALTER TABLE "Finding" ALTER COLUMN "riskId" DROP NOT NULL,
ALTER COLUMN "controlId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;
