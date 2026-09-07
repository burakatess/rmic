-- CreateEnum
CREATE TYPE "RiskProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIED', 'ASSESSED', 'TREATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TreatmentDecision" AS ENUM ('ACCEPT', 'MITIGATE', 'TRANSFER', 'AVOID');

-- CreateEnum
CREATE TYPE "ControlTestStatus" AS ENUM ('BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'GERI_GONDERILDI', 'ONAYLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "FindingTestStatus" AS ENUM ('BULGUSU_YOK', 'BULGUSU_VAR');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('IT_GENERAL', 'IT_APPLICATION', 'OPERATIONAL', 'FINANCIAL', 'COMPLIANCE', 'BT', 'BT_DISI');

-- CreateEnum
CREATE TYPE "ControlNature" AS ENUM ('PREVENTIVE', 'DETECTIVE');

-- CreateEnum
CREATE TYPE "ControlAutomation" AS ENUM ('MANUAL', 'AUTOMATED', 'SEMI_AUTOMATED');

-- CreateEnum
CREATE TYPE "ControlFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ControlStatus" AS ENUM ('ACTIVE', 'PASSIVE');

-- CreateEnum
CREATE TYPE "EffectivenessStatus" AS ENUM ('NOT_TESTED', 'EFFECTIVE', 'INEFFECTIVE', 'PARTIALLY_EFFECTIVE');

-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('EFFECTIVE', 'INEFFECTIVE', 'PARTIALLY_EFFECTIVE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('INTERNAL_AUDIT', 'EXTERNAL_AUDIT', 'CONTROL_TEST', 'INCIDENT', 'SELF_ASSESSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "AuditPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditExecutionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditPlanPhase" AS ENUM ('PLANNING', 'FIELDWORK', 'REPORTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditPlanRationale" AS ENUM ('PERIODIC', 'REGULATORY', 'MANAGEMENT_REQUEST', 'RISK_BASED');

-- CreateEnum
CREATE TYPE "AuditPlanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AuditDelayStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingWorkflowStatus" AS ENUM ('TASLAK', 'MUTABAKATA_GONDERILDI', 'IC_KONTROL_ONAYINA_GONDERILDI', 'MUTABAKAT_YAPILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "FindingResolutionStatus" AS ENUM ('DEVAM_EDIYOR', 'KISMEN_KAPATILDI', 'KAPATILDI', 'ERTELENDI', 'YENI_AKSIYON_GEREKLI');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PARTIALLY_CLOSED', 'PENDING_REVIEW', 'CLOSED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('BT', 'IB', 'CONTROL_DEFICIENCY', 'PROCESS_GAP', 'COMPLIANCE_ISSUE', 'DOCUMENTATION', 'IT_SECURITY', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI');

-- CreateEnum
CREATE TYPE "FollowUpResult" AS ENUM ('YETERLI', 'YETERSIZ', 'YENI_AKSIYON_GEREKLI');

-- CreateEnum
CREATE TYPE "FollowUpApprovalStatus" AS ENUM ('BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'YETERSIZ', 'KAPATILDI', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AttachmentEntityType" AS ENUM ('CONTROL', 'CONTROL_TEST', 'FINDING', 'CORRECTIVE_ACTION', 'FINDING_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "RiskEntryRecordType" AS ENUM ('RISK', 'OPPORTUNITY', 'ISSUE');

-- CreateEnum
CREATE TYPE "RiskEntryStatus" AS ENUM ('AKTIF', 'PASIF', 'KAPATILDI', 'BEKLEMEDE', 'ONAYLI', 'TASLAK');

-- CreateEnum
CREATE TYPE "RiskEntryLevel" AS ENUM ('KRITIK', 'YUKSEK', 'ORTA', 'DUSUK');

-- CreateEnum
CREATE TYPE "ControlEffectivenessLevel" AS ENUM ('ETKIN', 'KISMEN_ETKIN', 'ETKIN_DEGIL');

-- CreateEnum
CREATE TYPE "RiskTreatmentOption" AS ENUM ('KABUL_ET', 'AZALT', 'TRANSFER_ET', 'KACIN');

-- CreateEnum
CREATE TYPE "RiskControlStatus" AS ENUM ('TASLAK', 'AKTIF', 'PASIF');

-- CreateEnum
CREATE TYPE "RiskActionStatus" AS ENUM ('ACIK', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'GECIKTI', 'IPTAL');

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
CREATE TABLE "Directorate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "gmy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Directorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskProposal" (
    "id" TEXT NOT NULL,
    "findingId" TEXT,
    "directorateId" TEXT,
    "riskTanimi" TEXT NOT NULL,
    "status" "RiskProposalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "kayitId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "ozet" TEXT,
    "ilgiliGmy" TEXT,
    "surec" TEXT,
    "altSurec" TEXT,
    "flagForIT" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "riskSorumlusu" TEXT,
    "categoryId" TEXT NOT NULL,
    "finansalEtki" INTEGER,
    "itibarEtkisi" INTEGER,
    "regulasyonEtkisi" INTEGER,
    "musteriEtkisi" INTEGER,
    "gizlilikEtkisi" INTEGER,
    "butunlukEtkisi" INTEGER,
    "erisilebilirlikEtkisi" INTEGER,
    "etki" DOUBLE PRECISION,
    "olasilik" INTEGER,
    "dogalRiskPuani" DOUBLE PRECISION,
    "dogalRiskSkoru" INTEGER,
    "dogalRiskSeviyesi" TEXT,
    "butunlesikKontrolPuani" DOUBLE PRECISION,
    "butunlesikKontrolSkoru" INTEGER,
    "butunlesikKontrolSeviyesi" TEXT,
    "kalintiRiskPuani" DOUBLE PRECISION,
    "kalintiRiskSkoru" INTEGER,
    "kalintiRiskSeviyesi" TEXT,
    "riskIsleme" TEXT,
    "mutabakatTarihi" TIMESTAMP(3),
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
    "controlPeriod" TEXT,
    "controlDate" TIMESTAMP(3),
    "status" "ControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "directorate" TEXT,
    "directorateId" TEXT,
    "gmy" TEXT,
    "mehaz" TEXT,
    "testSteps" TEXT,
    "notes" TEXT,
    "selectedMonths" TEXT[],
    "ownerId" TEXT NOT NULL,
    "testPerformerId" TEXT,
    "reviewerId" TEXT,
    "secondControllerId" TEXT,
    "contactPersonId" TEXT,
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
    "testNo" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sprint" TEXT,
    "assigneeId" TEXT,
    "secondControllerId" TEXT,
    "directorateId" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "resultText" TEXT,
    "evidenceSummary" TEXT,
    "evidenceUrls" TEXT[],
    "status" "ControlTestStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "findingStatus" "FindingTestStatus",
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "returnedById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "referencedFindingId" TEXT,
    "referenceReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "auditedUnit" TEXT,
    "auditTeam" TEXT,
    "teamLeader" TEXT,
    "teamSize" INTEGER,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "phase" "AuditPlanPhase" NOT NULL DEFAULT 'PLANNING',
    "rationale" "AuditPlanRationale",
    "priority" "AuditPlanPriority" NOT NULL DEFAULT 'MEDIUM',
    "plannedManDays" INTEGER,
    "actualManDays" INTEGER,
    "delayStatus" "AuditDelayStatus" NOT NULL DEFAULT 'ON_TRACK',
    "draftReportDate" TIMESTAMP(3),
    "finalReportDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExecution" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "auditPlanId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "auditor" TEXT NOT NULL,
    "status" "AuditExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "workpapers" INTEGER NOT NULL DEFAULT 0,
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
    "status" "FindingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "findingType" "FindingType",
    "summary" TEXT,
    "gmy" TEXT,
    "assigneeId" TEXT,
    "directorateId" TEXT,
    "riskId" TEXT,
    "controlId" TEXT,
    "controlTestId" TEXT,
    "auditExecutionId" TEXT,
    "workflowStatus" "FindingWorkflowStatus" NOT NULL DEFAULT 'TASLAK',
    "resolutionStatus" "FindingResolutionStatus" NOT NULL DEFAULT 'DEVAM_EDIYOR',
    "iletisimKisisi" TEXT,
    "source" "FindingSource" NOT NULL DEFAULT 'INTERNAL_AUDIT',
    "affectedSystem" TEXT,
    "recommendation" TEXT,
    "managementResponse" TEXT,
    "birimCevabi" TEXT,
    "internalControlAssessment" TEXT,
    "currentStatusDetail" TEXT,
    "targetResolutionDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "testDate" TIMESTAMP(3),
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "relatedDepartment" TEXT,
    "responsiblePerson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingFollowUp" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "actionId" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "plannedDate" TIMESTAMP(3),
    "targetResolutionDate" TIMESTAMP(3),
    "testDate" TIMESTAMP(3),
    "resolutionOutcome" "FindingResolutionStatus",
    "newFollowUpDate" TIMESTAMP(3),
    "evaluatorId" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "result" "FollowUpResult",
    "explanation" TEXT,
    "approvalStatus" "FollowUpApprovalStatus" DEFAULT 'BEKLIYOR',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "directorateId" TEXT,
    "birimCevabi" TEXT,
    "currentStatusDetail" TEXT,
    "internalControlAssessment" TEXT,
    "notes" TEXT,
    "secondControllerId" TEXT,
    "sprint" TEXT,
    "newActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "newActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingStatusHistory" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "followUpId" TEXT,
    "actionId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluator" TEXT,
    "result" "FollowUpResult",
    "explanation" TEXT,
    "evidenceLinks" TEXT,
    "operation" TEXT,
    "userId" TEXT,
    "fieldName" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changeType" TEXT,
    "workflowStatus" "FindingWorkflowStatus",
    "previousWorkflowStatus" "FindingWorkflowStatus",
    "resolutionStatus" "FindingResolutionStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "controlId" TEXT,
    "riskId" TEXT,
    "ownerId" TEXT NOT NULL,
    "responsibleDepartment" TEXT,
    "directorateId" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "extensionReason" TEXT,
    "extensionApproved" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "filePath" TEXT,
    "entityType" "AttachmentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingAttachment" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionAttachment" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpAttachment" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestAttachment" (
    "id" TEXT NOT NULL,
    "controlTestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlTestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingStatusLog" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "followUpId" TEXT,

    CONSTRAINT "FindingStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "issuer" TEXT,
    "publishDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
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
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulationArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleCrossRef" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ArticleCrossRef_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "SystemOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelEn" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEntry" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "kayitId" TEXT NOT NULL,
    "kayitTipi" "RiskEntryRecordType" NOT NULL DEFAULT 'RISK',
    "riskStatus" "RiskEntryStatus" NOT NULL DEFAULT 'AKTIF',
    "riskSahibi" TEXT,
    "surec" TEXT,
    "altSurec" TEXT,
    "riskTanimi" TEXT NOT NULL,
    "flagForIT" BOOLEAN NOT NULL DEFAULT false,
    "finansalEtki" INTEGER DEFAULT 1,
    "itibarEtkisi" INTEGER DEFAULT 1,
    "regulasyonEtkisi" INTEGER DEFAULT 1,
    "musteriEtkisi" INTEGER DEFAULT 1,
    "gizlilikEtkisi" INTEGER DEFAULT 1,
    "butunlukEtkisi" INTEGER DEFAULT 1,
    "erisebilirlikEtkisi" INTEGER DEFAULT 1,
    "etki" DOUBLE PRECISION,
    "olasilik" INTEGER DEFAULT 1,
    "dogalRiskPuani" DOUBLE PRECISION,
    "dogalRiskSkoru" INTEGER,
    "dogalRiskSeviyesi" "RiskEntryLevel",
    "butunlesikKontrolPuani" DOUBLE PRECISION,
    "butunlesikKontrolSkoru" INTEGER,
    "butunlesikKontrolSeviyesi" "ControlEffectivenessLevel",
    "kalintiRiskPuani" DOUBLE PRECISION,
    "kalintiRiskSkoru" INTEGER,
    "kalintiRiskSeviyesi" "RiskEntryLevel",
    "riskIsleme" "RiskTreatmentOption",
    "mutabakatTarihi" TIMESTAMP(3),
    "olusturmaTarihi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellemeTarihi" TIMESTAMP(3) NOT NULL,
    "riskSorumlusu" TEXT,
    "atanan" TEXT,
    "olusturan" TEXT,
    "kaydiAcan" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncedRiskId" TEXT,

    CONSTRAINT "RiskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskManagementControl" (
    "id" TEXT NOT NULL,
    "controlCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effectiveness" INTEGER NOT NULL DEFAULT 3,
    "frequency" INTEGER NOT NULL DEFAULT 3,
    "automationLevel" INTEGER NOT NULL DEFAULT 3,
    "controlScore" DOUBLE PRECISION,
    "ownerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskManagementControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEntryRMControl" (
    "id" TEXT NOT NULL,
    "riskEntryId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "applicabilityScore" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEntryRMControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RMControlTest" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "tester" TEXT NOT NULL,
    "result" "TestResult" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RMControlTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskControl" (
    "id" TEXT NOT NULL,
    "kontrolId" TEXT NOT NULL,
    "kayitId" TEXT,
    "status" "RiskControlStatus" NOT NULL DEFAULT 'AKTIF',
    "ilgiliGmy" TEXT,
    "riskSahibi" TEXT,
    "surec" TEXT,
    "altSurec" TEXT,
    "riskTanimi" TEXT,
    "kontrolTanimi" TEXT NOT NULL,
    "kontrolTuru" TEXT,
    "kontrolIslevi" TEXT,
    "kontrolIsletimeSekli" TEXT,
    "kontrolIsletimDenetimi" TEXT,
    "kontrolIsletimRaporlama" TEXT,
    "birSeviyeKontrolSikligi" TEXT,
    "kontrolPuani" DOUBLE PRECISION,
    "kontrolSkoru" TEXT,
    "butunlesikKontrolPuani" DOUBLE PRECISION,
    "butunlesikKontrolSkoru" TEXT,
    "butunlesikKontrolSeviyesi" TEXT,
    "riskSorumlusu" TEXT,
    "ozet" TEXT,
    "mutabakatTarihi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskControlRisk" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "riskControlId" TEXT NOT NULL,

    CONSTRAINT "RiskControlRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAction" (
    "id" TEXT NOT NULL,
    "aksiyonId" TEXT NOT NULL,
    "kayitId" TEXT,
    "status" "RiskActionStatus" NOT NULL DEFAULT 'ACIK',
    "aksiyonTanimi" TEXT NOT NULL,
    "aksiyonSahibi" TEXT,
    "aksiyonSorumlusu" TEXT,
    "atanan" TEXT,
    "ilgiliGmy" TEXT,
    "ozet" TEXT,
    "potaNo" TEXT,
    "bulgReferansNo" TEXT,
    "mutabakatTarihi" TIMESTAMP(3),
    "hedeflenenTamamlanmaTarihi" TIMESTAMP(3),
    "tamamlanmaTarihi" TIMESTAMP(3),
    "riskControlId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskActionRisk" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "riskActionId" TEXT NOT NULL,

    CONSTRAINT "RiskActionRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FindingRisks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FindingRisks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Directorate_name_key" ON "Directorate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Directorate_code_key" ON "Directorate"("code");

-- CreateIndex
CREATE INDEX "Directorate_isActive_idx" ON "Directorate"("isActive");

-- CreateIndex
CREATE INDEX "RiskProposal_status_idx" ON "RiskProposal"("status");

-- CreateIndex
CREATE INDEX "RiskProposal_findingId_idx" ON "RiskProposal"("findingId");

-- CreateIndex
CREATE INDEX "RiskProposal_requestedById_idx" ON "RiskProposal"("requestedById");

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
CREATE INDEX "Control_testPerformerId_idx" ON "Control"("testPerformerId");

-- CreateIndex
CREATE INDEX "Control_reviewerId_idx" ON "Control"("reviewerId");

-- CreateIndex
CREATE INDEX "Control_effectivenessStatus_idx" ON "Control"("effectivenessStatus");

-- CreateIndex
CREATE INDEX "Control_status_idx" ON "Control"("status");

-- CreateIndex
CREATE INDEX "Control_directorateId_idx" ON "Control"("directorateId");

-- CreateIndex
CREATE INDEX "ControlRiskMapping_riskId_idx" ON "ControlRiskMapping"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRiskMapping_controlId_riskId_key" ON "ControlRiskMapping"("controlId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTest_testNo_key" ON "ControlTest"("testNo");

-- CreateIndex
CREATE INDEX "ControlTest_controlId_idx" ON "ControlTest"("controlId");

-- CreateIndex
CREATE INDEX "ControlTest_status_idx" ON "ControlTest"("status");

-- CreateIndex
CREATE INDEX "ControlTest_plannedDate_idx" ON "ControlTest"("plannedDate");

-- CreateIndex
CREATE INDEX "ControlTest_directorateId_idx" ON "ControlTest"("directorateId");

-- CreateIndex
CREATE INDEX "ControlTest_assigneeId_idx" ON "ControlTest"("assigneeId");

-- CreateIndex
CREATE INDEX "ControlTest_secondControllerId_idx" ON "ControlTest"("secondControllerId");

-- CreateIndex
CREATE INDEX "ControlTest_referencedFindingId_idx" ON "ControlTest"("referencedFindingId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_planId_key" ON "AuditPlan"("planId");

-- CreateIndex
CREATE INDEX "AuditPlan_year_idx" ON "AuditPlan"("year");

-- CreateIndex
CREATE INDEX "AuditPlan_status_idx" ON "AuditPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditExecution_executionId_key" ON "AuditExecution"("executionId");

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
CREATE INDEX "Finding_controlTestId_idx" ON "Finding"("controlTestId");

-- CreateIndex
CREATE INDEX "Finding_directorateId_idx" ON "Finding"("directorateId");

-- CreateIndex
CREATE INDEX "Finding_status_idx" ON "Finding"("status");

-- CreateIndex
CREATE INDEX "Finding_severity_idx" ON "Finding"("severity");

-- CreateIndex
CREATE INDEX "Finding_assigneeId_idx" ON "Finding"("assigneeId");

-- CreateIndex
CREATE INDEX "Finding_workflowStatus_idx" ON "Finding"("workflowStatus");

-- CreateIndex
CREATE INDEX "Finding_resolutionStatus_idx" ON "Finding"("resolutionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "FindingFollowUp_followUpId_key" ON "FindingFollowUp"("followUpId");

-- CreateIndex
CREATE INDEX "FindingFollowUp_findingId_idx" ON "FindingFollowUp"("findingId");

-- CreateIndex
CREATE INDEX "FindingFollowUp_actionId_idx" ON "FindingFollowUp"("actionId");

-- CreateIndex
CREATE INDEX "FindingFollowUp_directorateId_idx" ON "FindingFollowUp"("directorateId");

-- CreateIndex
CREATE INDEX "FindingFollowUp_status_idx" ON "FindingFollowUp"("status");

-- CreateIndex
CREATE INDEX "FindingFollowUp_result_idx" ON "FindingFollowUp"("result");

-- CreateIndex
CREATE INDEX "FindingStatusHistory_findingId_idx" ON "FindingStatusHistory"("findingId");

-- CreateIndex
CREATE INDEX "FindingStatusHistory_followUpId_idx" ON "FindingStatusHistory"("followUpId");

-- CreateIndex
CREATE INDEX "FindingStatusHistory_entryDate_idx" ON "FindingStatusHistory"("entryDate");

-- CreateIndex
CREATE INDEX "FindingStatusHistory_operation_idx" ON "FindingStatusHistory"("operation");

-- CreateIndex
CREATE INDEX "FindingStatusHistory_userId_idx" ON "FindingStatusHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Action_actionId_key" ON "Action"("actionId");

-- CreateIndex
CREATE INDEX "Action_findingId_idx" ON "Action"("findingId");

-- CreateIndex
CREATE INDEX "Action_ownerId_idx" ON "Action"("ownerId");

-- CreateIndex
CREATE INDEX "Action_directorateId_idx" ON "Action"("directorateId");

-- CreateIndex
CREATE INDEX "Action_status_idx" ON "Action"("status");

-- CreateIndex
CREATE INDEX "Action_dueDate_idx" ON "Action"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "EffectivenessReview_actionId_key" ON "EffectivenessReview"("actionId");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "FindingAttachment_findingId_idx" ON "FindingAttachment"("findingId");

-- CreateIndex
CREATE INDEX "ActionAttachment_actionId_idx" ON "ActionAttachment"("actionId");

-- CreateIndex
CREATE INDEX "FollowUpAttachment_followUpId_idx" ON "FollowUpAttachment"("followUpId");

-- CreateIndex
CREATE INDEX "ControlTestAttachment_controlTestId_idx" ON "ControlTestAttachment"("controlTestId");

-- CreateIndex
CREATE INDEX "FindingStatusLog_findingId_idx" ON "FindingStatusLog"("findingId");

-- CreateIndex
CREATE INDEX "FindingStatusLog_entryDate_idx" ON "FindingStatusLog"("entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_code_key" ON "Regulation"("code");

-- CreateIndex
CREATE INDEX "RegulationArticle_regulationId_idx" ON "RegulationArticle"("regulationId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulationArticle_regulationId_articleCode_key" ON "RegulationArticle"("regulationId", "articleCode");

-- CreateIndex
CREATE INDEX "ArticleCrossRef_sourceId_idx" ON "ArticleCrossRef"("sourceId");

-- CreateIndex
CREATE INDEX "ArticleCrossRef_targetId_idx" ON "ArticleCrossRef"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleCrossRef_sourceId_targetId_key" ON "ArticleCrossRef"("sourceId", "targetId");

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

-- CreateIndex
CREATE INDEX "SystemOption_category_idx" ON "SystemOption"("category");

-- CreateIndex
CREATE INDEX "SystemOption_isActive_idx" ON "SystemOption"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemOption_category_value_key" ON "SystemOption"("category", "value");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntry_riskId_key" ON "RiskEntry"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntry_kayitId_key" ON "RiskEntry"("kayitId");

-- CreateIndex
CREATE INDEX "RiskEntry_riskStatus_idx" ON "RiskEntry"("riskStatus");

-- CreateIndex
CREATE INDEX "RiskEntry_dogalRiskSeviyesi_idx" ON "RiskEntry"("dogalRiskSeviyesi");

-- CreateIndex
CREATE INDEX "RiskEntry_kalintiRiskSeviyesi_idx" ON "RiskEntry"("kalintiRiskSeviyesi");

-- CreateIndex
CREATE INDEX "RiskEntry_surec_idx" ON "RiskEntry"("surec");

-- CreateIndex
CREATE INDEX "RiskEntry_olusturmaTarihi_idx" ON "RiskEntry"("olusturmaTarihi");

-- CreateIndex
CREATE UNIQUE INDEX "RiskManagementControl_controlCode_key" ON "RiskManagementControl"("controlCode");

-- CreateIndex
CREATE INDEX "RiskManagementControl_controlCode_idx" ON "RiskManagementControl"("controlCode");

-- CreateIndex
CREATE INDEX "RiskManagementControl_isActive_idx" ON "RiskManagementControl"("isActive");

-- CreateIndex
CREATE INDEX "RiskEntryRMControl_riskEntryId_idx" ON "RiskEntryRMControl"("riskEntryId");

-- CreateIndex
CREATE INDEX "RiskEntryRMControl_controlId_idx" ON "RiskEntryRMControl"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntryRMControl_riskEntryId_controlId_key" ON "RiskEntryRMControl"("riskEntryId", "controlId");

-- CreateIndex
CREATE INDEX "RMControlTest_controlId_idx" ON "RMControlTest"("controlId");

-- CreateIndex
CREATE INDEX "RMControlTest_testDate_idx" ON "RMControlTest"("testDate");

-- CreateIndex
CREATE UNIQUE INDEX "RiskControl_kontrolId_key" ON "RiskControl"("kontrolId");

-- CreateIndex
CREATE INDEX "RiskControlRisk_riskId_idx" ON "RiskControlRisk"("riskId");

-- CreateIndex
CREATE INDEX "RiskControlRisk_riskControlId_idx" ON "RiskControlRisk"("riskControlId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskControlRisk_riskId_riskControlId_key" ON "RiskControlRisk"("riskId", "riskControlId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAction_aksiyonId_key" ON "RiskAction"("aksiyonId");

-- CreateIndex
CREATE INDEX "RiskActionRisk_riskId_idx" ON "RiskActionRisk"("riskId");

-- CreateIndex
CREATE INDEX "RiskActionRisk_riskActionId_idx" ON "RiskActionRisk"("riskActionId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskActionRisk_riskId_riskActionId_key" ON "RiskActionRisk"("riskId", "riskActionId");

-- CreateIndex
CREATE INDEX "_FindingRisks_B_index" ON "_FindingRisks"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProposal" ADD CONSTRAINT "RiskProposal_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProposal" ADD CONSTRAINT "RiskProposal_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProposal" ADD CONSTRAINT "RiskProposal_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Control" ADD CONSTRAINT "Control_testPerformerId_fkey" FOREIGN KEY ("testPerformerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRiskMapping" ADD CONSTRAINT "ControlRiskMapping_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_referencedFindingId_fkey" FOREIGN KEY ("referencedFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExecution" ADD CONSTRAINT "AuditExecution_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_controlTestId_fkey" FOREIGN KEY ("controlTestId") REFERENCES "ControlTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditExecutionId_fkey" FOREIGN KEY ("auditExecutionId") REFERENCES "AuditExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingFollowUp" ADD CONSTRAINT "FindingFollowUp_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingFollowUp" ADD CONSTRAINT "FindingFollowUp_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingFollowUp" ADD CONSTRAINT "FindingFollowUp_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatusHistory" ADD CONSTRAINT "FindingStatusHistory_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatusHistory" ADD CONSTRAINT "FindingStatusHistory_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FindingFollowUp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatusHistory" ADD CONSTRAINT "FindingStatusHistory_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectivenessReview" ADD CONSTRAINT "EffectivenessReview_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingAttachment" ADD CONSTRAINT "FindingAttachment_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionAttachment" ADD CONSTRAINT "ActionAttachment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpAttachment" ADD CONSTRAINT "FollowUpAttachment_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FindingFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestAttachment" ADD CONSTRAINT "ControlTestAttachment_controlTestId_fkey" FOREIGN KEY ("controlTestId") REFERENCES "ControlTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatusLog" ADD CONSTRAINT "FindingStatusLog_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationArticle" ADD CONSTRAINT "RegulationArticle_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCrossRef" ADD CONSTRAINT "ArticleCrossRef_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RegulationArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCrossRef" ADD CONSTRAINT "ArticleCrossRef_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "RegulationArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_syncedRiskId_fkey" FOREIGN KEY ("syncedRiskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntryRMControl" ADD CONSTRAINT "RiskEntryRMControl_riskEntryId_fkey" FOREIGN KEY ("riskEntryId") REFERENCES "RiskEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEntryRMControl" ADD CONSTRAINT "RiskEntryRMControl_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "RiskManagementControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMControlTest" ADD CONSTRAINT "RMControlTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "RiskManagementControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskControlRisk" ADD CONSTRAINT "RiskControlRisk_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskControlRisk" ADD CONSTRAINT "RiskControlRisk_riskControlId_fkey" FOREIGN KEY ("riskControlId") REFERENCES "RiskControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAction" ADD CONSTRAINT "RiskAction_riskControlId_fkey" FOREIGN KEY ("riskControlId") REFERENCES "RiskControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskActionRisk" ADD CONSTRAINT "RiskActionRisk_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskActionRisk" ADD CONSTRAINT "RiskActionRisk_riskActionId_fkey" FOREIGN KEY ("riskActionId") REFERENCES "RiskAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FindingRisks" ADD CONSTRAINT "_FindingRisks_A_fkey" FOREIGN KEY ("A") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FindingRisks" ADD CONSTRAINT "_FindingRisks_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

