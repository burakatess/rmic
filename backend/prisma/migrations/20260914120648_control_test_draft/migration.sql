-- AlterTable
ALTER TABLE "ControlTest" ADD COLUMN     "contentVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stepObservations" JSONB;

