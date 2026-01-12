-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIED', 'ASSESSED', 'TREATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TreatmentDecision" AS ENUM ('ACCEPT', 'MITIGATE', 'TRANSFER', 'AVOID');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('IT_GENERAL', 'IT_APPLICATION', 'OPERATIONAL', 'FINANCIAL', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "ControlNature" AS ENUM ('PREVENTIVE', 'DETECTIVE');

-- CreateEnum
CREATE TYPE "ControlAutomation" AS ENUM ('MANUAL', 'AUTOMATED', 'SEMI_AUTOMATED');

-- CreateEnum
CREATE TYPE "ControlFrequency" AS ENUM ('CONTINUOUS', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "EffectivenessStatus" AS ENUM ('NOT_TESTED', 'EFFECTIVE', 'INEFFECTIVE', 'PARTIALLY_EFFECTIVE');

-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('EFFECTIVE', 'INEFFECTIVE', 'PARTIALLY_EFFECTIVE');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "AuditPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AuditExecutionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('RISK', 'FINDING', 'AUDIT', 'CONTROL_TEST');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'OVERDUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "inherentProbability" INTEGER NOT NULL DEFAULT 1,
    "inherentImpact" INTEGER NOT NULL DEFAULT 1,
    "inherentRiskScore" INTEGER NOT NULL DEFAULT 1,
    "residualProbability" INTEGER,
    "residualImpact" INTEGER,
    "residualRiskScore" INTEGER,
    "riskAppetite" INTEGER,
    "isAboveAppetite" BOOLEAN NOT NULL DEFAULT false,
    "treatmentDecision" "TreatmentDecision",
    "treatmentApproval" BOOLEAN NOT NULL DEFAULT false,
    "treatmentApprovedBy" TEXT,
    "treatmentApprovedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessor" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "inherentScore" INTEGER NOT NULL,
    "mitigatingControlIds" TEXT[],
    "residualProbability" INTEGER,
    "residualImpact" INTEGER,
    "residualScore" INTEGER,
    "treatmentDecision" "TreatmentDecision",
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskHistory" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessRisk" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "ProcessRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "System" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "System_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRisk" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "SystemRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ControlType" NOT NULL,
    "nature" "ControlNature" NOT NULL,
    "automation" "ControlAutomation" NOT NULL,
    "frequency" "ControlFrequency" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "effectivenessStatus" "EffectivenessStatus" NOT NULL DEFAULT 'NOT_TESTED',
    "lastTestDate" TIMESTAMP(3),
    "lastTestResult" "TestResult",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRiskMapping" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "mappingType" TEXT NOT NULL DEFAULT 'PRIMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlRiskMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTest" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "tester" TEXT NOT NULL,
    "result" "TestResult" NOT NULL,
    "evidenceUrls" TEXT[],
    "findings" TEXT,
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "objectives" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "AuditPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "riskIds" TEXT[],
    "controlIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExecution" (
    "id" TEXT NOT NULL,
    "auditPlanId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "auditor" TEXT NOT NULL,
    "status" "AuditExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "controlTests" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "isRecurrent" BOOLEAN NOT NULL DEFAULT false,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "riskId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "auditExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" "ActionSource" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "riskId" TEXT,
    "findingId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "slaInDays" INTEGER NOT NULL,
    "extensionReason" TEXT,
    "extensionApproved" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EffectivenessReview" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "riskScoreBefore" INTEGER NOT NULL,
    "riskScoreAfter" INTEGER NOT NULL,
    "controlEffectiveness" "EffectivenessStatus" NOT NULL,
    "isEffective" BOOLEAN NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "managementApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "EffectivenessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulationArticle" (
    "id" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "articleCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulationArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRegulation" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "RiskRegulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRegulation" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ControlRegulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_riskId_key" ON "Risk"("riskId");

-- CreateIndex
CREATE INDEX "Risk_status_idx" ON "Risk"("status");

-- CreateIndex
CREATE INDEX "Risk_ownerId_idx" ON "Risk"("ownerId");

-- CreateIndex
CREATE INDEX "Risk_categoryId_idx" ON "Risk"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskCategory_name_key" ON "RiskCategory"("name");

-- CreateIndex
CREATE INDEX "RiskAssessment_riskId_idx" ON "RiskAssessment"("riskId");

-- CreateIndex
CREATE INDEX "RiskHistory_riskId_idx" ON "RiskHistory"("riskId");

-- CreateIndex
CREATE INDEX "RiskHistory_changedAt_idx" ON "RiskHistory"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Process_name_key" ON "Process"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessRisk_processId_riskId_key" ON "ProcessRisk"("processId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "System_name_key" ON "System"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRisk_systemId_riskId_key" ON "SystemRisk"("systemId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "Control_controlId_key" ON "Control"("controlId");

-- CreateIndex
CREATE INDEX "Control_ownerId_idx" ON "Control"("ownerId");

-- CreateIndex
CREATE INDEX "Control_effectivenessStatus_idx" ON "Control"("effectivenessStatus");

-- CreateIndex
CREATE INDEX "ControlRiskMapping_riskId_idx" ON "ControlRiskMapping"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRiskMapping_controlId_riskId_key" ON "ControlRiskMapping"("controlId", "riskId");

-- CreateIndex
CREATE INDEX "ControlTest_controlId_idx" ON "ControlTest"("controlId");

-- CreateIndex
CREATE INDEX "ControlTest_testDate_idx" ON "ControlTest"("testDate");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_planId_key" ON "AuditPlan"("planId");

-- CreateIndex
CREATE INDEX "AuditPlan_year_idx" ON "AuditPlan"("year");

-- CreateIndex
CREATE INDEX "AuditPlan_status_idx" ON "AuditPlan"("status");

-- CreateIndex
CREATE INDEX "AuditExecution_auditPlanId_idx" ON "AuditExecution"("auditPlanId");

-- CreateIndex
CREATE INDEX "AuditExecution_status_idx" ON "AuditExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_findingId_key" ON "Finding"("findingId");

-- CreateIndex
CREATE INDEX "Finding_riskId_idx" ON "Finding"("riskId");

-- CreateIndex
CREATE INDEX "Finding_controlId_idx" ON "Finding"("controlId");

-- CreateIndex
CREATE INDEX "Finding_status_idx" ON "Finding"("status");

-- CreateIndex
CREATE INDEX "Finding_severity_idx" ON "Finding"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Action_actionId_key" ON "Action"("actionId");

-- CreateIndex
CREATE INDEX "Action_ownerId_idx" ON "Action"("ownerId");

-- CreateIndex
CREATE INDEX "Action_status_idx" ON "Action"("status");

-- CreateIndex
CREATE INDEX "Action_dueDate_idx" ON "Action"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "EffectivenessReview_actionId_key" ON "EffectivenessReview"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_code_key" ON "Regulation"("code");

-- CreateIndex
CREATE INDEX "RegulationArticle_regulationId_idx" ON "RegulationArticle"("regulationId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulationArticle_regulationId_articleCode_key" ON "RegulationArticle"("regulationId", "articleCode");

-- CreateIndex
CREATE INDEX "RiskRegulation_articleId_idx" ON "RiskRegulation"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskRegulation_riskId_articleId_key" ON "RiskRegulation"("riskId", "articleId");

-- CreateIndex
CREATE INDEX "ControlRegulation_articleId_idx" ON "ControlRegulation"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRegulation_controlId_articleId_key" ON "ControlRegulation"("controlId", "articleId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Parameter_key_key" ON "Parameter"("key");

-- CreateIndex
CREATE INDEX "Parameter_category_idx" ON "Parameter"("category");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RiskCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskHistory" ADD CONSTRAINT "RiskHistory_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRisk" ADD CONSTRAINT "ProcessRisk_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRisk" ADD CONSTRAINT "ProcessRisk_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRisk" ADD CONSTRAINT "SystemRisk_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "System"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRisk" ADD CONSTRAINT "SystemRisk_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExecution" ADD CONSTRAINT "AuditExecution_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditExecutionId_fkey" FOREIGN KEY ("auditExecutionId") REFERENCES "AuditExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectivenessReview" ADD CONSTRAINT "EffectivenessReview_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationArticle" ADD CONSTRAINT "RegulationArticle_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRegulation" ADD CONSTRAINT "RiskRegulation_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRegulation" ADD CONSTRAINT "RiskRegulation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "RegulationArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRegulation" ADD CONSTRAINT "ControlRegulation_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRegulation" ADD CONSTRAINT "ControlRegulation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "RegulationArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
