// ==========================================
// SHARED TYPES - RMIC GRC Platform
// Backend ↔ Frontend ortak tip tanımları
// ==========================================

// ==========================================
// ENUMS
// ==========================================

export enum RiskStatus {
    IDENTIFIED = 'IDENTIFIED',
    ASSESSED = 'ASSESSED',
    TREATED = 'TREATED',
    ACCEPTED = 'ACCEPTED',
    CLOSED = 'CLOSED',
}

export enum TreatmentDecision {
    ACCEPT = 'ACCEPT',
    MITIGATE = 'MITIGATE',
    TRANSFER = 'TRANSFER',
    AVOID = 'AVOID',
}

export enum ControlType {
    IT_GENERAL = 'IT_GENERAL',
    IT_APPLICATION = 'IT_APPLICATION',
    OPERATIONAL = 'OPERATIONAL',
    FINANCIAL = 'FINANCIAL',
    COMPLIANCE = 'COMPLIANCE',
    BT = 'BT',
    BT_DISI = 'BT_DISI',
}

export enum ControlNature {
    PREVENTIVE = 'PREVENTIVE',
    DETECTIVE = 'DETECTIVE',
}

export enum ControlAutomation {
    MANUAL = 'MANUAL',
    AUTOMATED = 'AUTOMATED',
    SEMI_AUTOMATED = 'SEMI_AUTOMATED',
}

export enum ControlFrequency {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    QUARTERLY = 'QUARTERLY',
    SEMI_ANNUAL = 'SEMI_ANNUAL',
    ANNUAL = 'ANNUAL',
    AD_HOC = 'AD_HOC',
}

export enum EffectivenessStatus {
    NOT_TESTED = 'NOT_TESTED',
    EFFECTIVE = 'EFFECTIVE',
    INEFFECTIVE = 'INEFFECTIVE',
    PARTIALLY_EFFECTIVE = 'PARTIALLY_EFFECTIVE',
}

export enum TestResult {
    EFFECTIVE = 'EFFECTIVE',
    INEFFECTIVE = 'INEFFECTIVE',
    PARTIALLY_EFFECTIVE = 'PARTIALLY_EFFECTIVE',
}

export enum ApprovalStatus {
    DRAFT = 'DRAFT',
    PENDING_APPROVAL = 'PENDING_APPROVAL',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

export enum FindingSeverity {
    CRITICAL = 'CRITICAL',
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
}

export enum FindingStatus {
    OPEN = 'OPEN',
    IN_PROGRESS = 'IN_PROGRESS',
    CLOSED = 'CLOSED',
    VERIFIED = 'VERIFIED',
}

export enum ActionStatus {
    OPEN = 'OPEN',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    CLOSED = 'CLOSED',
    OVERDUE = 'OVERDUE',
}

export enum ActionSource {
    RISK = 'RISK',
    FINDING = 'FINDING',
    AUDIT = 'AUDIT',
    CONTROL_TEST = 'CONTROL_TEST',
}

// ==========================================
// INTERFACES
// ==========================================

export interface UserSummary {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
}

export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserSummary;
}

export interface RiskSummary {
    id: string;
    riskId: string;
    name: string;
    status: RiskStatus;
    inherentRiskScore: number;
    residualRiskScore: number | null;
    isAboveAppetite: boolean;
    owner?: UserSummary;
    category?: { id: string; name: string; color?: string };
}

export interface ControlSummary {
    id: string;
    controlId: string;
    name: string;
    type: ControlType;
    nature: ControlNature;
    automation: ControlAutomation;
    effectivenessStatus: EffectivenessStatus;
    owner?: UserSummary;
}

export interface FindingSummary {
    id: string;
    findingId: string;
    description: string;
    severity: FindingSeverity;
    status: FindingStatus;
    isRecurrent: boolean;
}

export interface ActionSummary {
    id: string;
    actionId: string;
    description: string;
    status: ActionStatus;
    source: ActionSource;
    dueDate: string;
    owner?: UserSummary;
}

export interface DashboardData {
    summary: {
        totalRisks: number;
        risksAboveAppetite: number;
        openFindings: number;
        criticalFindings: number;
        overdueActions: number;
        totalControls: number;
    };
    risksByScore: {
        high: number;
        medium: number;
        low: number;
    };
    riskTrend: Array<{
        month: string;
        total: number;
        high: number;
    }>;
    controlEffectiveness: Array<{
        effectivenessStatus: string;
        _count: number;
    }>;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
