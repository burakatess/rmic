-- AlterTable
ALTER TABLE "Control" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ControlYearScope" ADD COLUMN     "code" TEXT,
ADD COLUMN     "controlVersion" INTEGER,
ADD COLUMN     "snapshotDescription" TEXT,
ADD COLUMN     "snapshotMehaz" TEXT,
ADD COLUMN     "snapshotName" TEXT,
ADD COLUMN     "snapshotTestSteps" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ControlYearScope_code_key" ON "ControlYearScope"("code");
