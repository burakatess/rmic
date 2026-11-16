-- AlterTable
ALTER TABLE "RiskSimulation" ADD COLUMN     "draftOwnerId" TEXT,
ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulation_draftOwnerId_key" ON "RiskSimulation"("draftOwnerId");

