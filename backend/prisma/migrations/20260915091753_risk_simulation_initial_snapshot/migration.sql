/*
  Warnings:

  - Added the required column `initialStateSnapshot` to the `RiskSimulationScenario` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RiskSimulationScenario" ADD COLUMN     "initialStateSnapshot" JSONB NOT NULL;
