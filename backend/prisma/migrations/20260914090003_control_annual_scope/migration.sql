-- CreateEnum
CREATE TYPE "ControlYearScopeStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterEnum
ALTER TYPE "ControlTestStatus" ADD VALUE 'KAPSAM_DISI';

-- AlterTable
ALTER TABLE "ControlTest" ADD COLUMN     "outOfScopeAt" TIMESTAMP(3),
ADD COLUMN     "outOfScopeById" TEXT,
ADD COLUMN     "outOfScopeReason" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "periodLabel" TEXT,
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "scopeId" TEXT,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "ControlYearScope" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ControlYearScopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" "ControlFrequency" NOT NULL,
    "selectedMonths" TEXT[],
    "controlDate" TIMESTAMP(3),
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "copiedFromYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlYearScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlYearScope_year_idx" ON "ControlYearScope"("year");

-- CreateIndex
CREATE INDEX "ControlYearScope_status_idx" ON "ControlYearScope"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlYearScope_controlId_year_key" ON "ControlYearScope"("controlId", "year");

-- CreateIndex
CREATE INDEX "ControlTest_scopeId_idx" ON "ControlTest"("scopeId");

-- CreateIndex
CREATE INDEX "ControlTest_year_idx" ON "ControlTest"("year");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTest_scopeId_periodKey_key" ON "ControlTest"("scopeId", "periodKey");

-- AddForeignKey
ALTER TABLE "ControlYearScope" ADD CONSTRAINT "ControlYearScope_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlYearScope" ADD CONSTRAINT "ControlYearScope_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlYearScope" ADD CONSTRAINT "ControlYearScope_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "ControlYearScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

