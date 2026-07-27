-- AuditPlan / AuditExecution zenginleştirme (Faz 13d/e — audits/plans ve audits/executions UI'ını gerçek veriye bağlamak için)

-- Yeni enum türleri
DO $$ BEGIN
  CREATE TYPE "AuditPlanPhase" AS ENUM ('PLANNING', 'FIELDWORK', 'REPORTING', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditPlanRationale" AS ENUM ('PERIODIC', 'REGULATORY', 'MANAGEMENT_REQUEST', 'RISK_BASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditPlanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditDelayStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AuditPlanStatus enum genişletme
ALTER TYPE "AuditPlanStatus" ADD VALUE IF NOT EXISTS 'PLANNED';
ALTER TYPE "AuditPlanStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AuditExecutionStatus enum genişletme
ALTER TYPE "AuditExecutionStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "AuditExecutionStatus" ADD VALUE IF NOT EXISTS 'REVIEW';

-- AuditPlan yeni kolonlar
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "auditedUnit" TEXT;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "auditTeam" TEXT;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "teamLeader" TEXT;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "teamSize" INTEGER;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "plannedStartDate" TIMESTAMP(3);
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "plannedEndDate" TIMESTAMP(3);
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "phase" "AuditPlanPhase" NOT NULL DEFAULT 'PLANNING';
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "rationale" "AuditPlanRationale";
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "priority" "AuditPlanPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "plannedManDays" INTEGER;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "actualManDays" INTEGER;
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "delayStatus" "AuditDelayStatus" NOT NULL DEFAULT 'ON_TRACK';
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "draftReportDate" TIMESTAMP(3);
ALTER TABLE "AuditPlan" ADD COLUMN IF NOT EXISTS "finalReportDate" TIMESTAMP(3);

-- AuditExecution yeni kolonlar
ALTER TABLE "AuditExecution" ADD COLUMN IF NOT EXISTS "executionId" TEXT;
ALTER TABLE "AuditExecution" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AuditExecution" ADD COLUMN IF NOT EXISTS "workpapers" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE UNIQUE INDEX "AuditExecution_executionId_key" ON "AuditExecution"("executionId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;
