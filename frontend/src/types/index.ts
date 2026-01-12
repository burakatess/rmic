// User and Role Types
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    department?: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
}

// Risk Management Types
export type RiskStatus = 'IDENTIFIED' | 'ASSESSED' | 'TREATED' | 'ACCEPTED' | 'CLOSED';
export type TreatmentDecision = 'ACCEPT' | 'MITIGATE' | 'TRANSFER' | 'AVOID';

export interface RiskCategory {
    id: string;
    name: string;
    description?: string;
    color?: string;
}

export interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    status: RiskStatus;
    category: RiskCategory;
    owner: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    inherentProbability: number;
    inherentImpact: number;
    inherentRiskScore: number;
    residualProbability?: number;
    residualImpact?: number;
    residualRiskScore?: number;
    riskAppetite?: number;
    isAboveAppetite: boolean;
    treatmentDecision?: TreatmentDecision;
    version: number;
    createdAt: string;
    updatedAt: string;
    _count?: {
        controls: number;
        findings: number;
        actions: number;
    };
}

// Control Types
export type ControlType = 'IT_GENERAL' | 'IT_APPLICATION' | 'OPERATIONAL' | 'FINANCIAL' | 'COMPLIANCE';
export type ControlNature = 'PREVENTIVE' | 'DETECTIVE';
export type ControlAutomation = 'MANUAL' | 'AUTOMATED' | 'SEMI_AUTOMATED';
export type ControlFrequency = 'CONTINUOUS' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'AD_HOC';
export type EffectivenessStatus = 'NOT_TESTED' | 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIALLY_EFFECTIVE';
export type TestResult = 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIALLY_EFFECTIVE';

export interface Control {
    id: string;
    controlId: string;
    name: string;
    description: string;
    type: ControlType;
    nature: ControlNature;
    automation: ControlAutomation;
    frequency: ControlFrequency;
    owner: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    effectivenessStatus: EffectivenessStatus;
    lastTestDate?: string;
    lastTestResult?: TestResult;
    createdAt: string;
    updatedAt: string;
    _count?: {
        risks: number;
        tests: number;
        findings: number;
    };
}

// Finding Types
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'VERIFIED';

export interface Finding {
    id: string;
    findingId: string;
    description: string;
    impact: string;
    severity: FindingSeverity;
    isRecurrent: boolean;
    status: FindingStatus;
    risk: {
        id: string;
        riskId: string;
        name: string;
    };
    control: {
        id: string;
        controlId: string;
        name: string;
    };
    createdAt: string;
    updatedAt: string;
    _count?: {
        actions: number;
    };
}

// Action Types
export type ActionSource = 'RISK' | 'FINDING' | 'AUDIT' | 'CONTROL_TEST';
export type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'OVERDUE';

export interface Action {
    id: string;
    actionId: string;
    description: string;
    source: ActionSource;
    status: ActionStatus;
    owner: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    risk?: {
        id: string;
        riskId: string;
        name: string;
    };
    finding?: {
        id: string;
        findingId: string;
    };
    dueDate: string;
    slaInDays: number;
    extensionReason?: string;
    isOverdue?: boolean;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}

// Dashboard Types
export interface DashboardData {
    summary: {
        totalRisks: number;
        risksAboveAppetite: number;
        openFindings: number;
        criticalFindings: number;
        overdueActions: number;
        totalControls: number;
    };
    risksByStatus: Array<{
        status: RiskStatus;
        _count: number;
    }>;
    risksByScore: {
        high: number;
        medium: number;
        low: number;
    };
    controlEffectiveness: Array<{
        effectivenessStatus: EffectivenessStatus;
        _count: number;
    }>;
    riskTrend: Array<{
        month: string;
        total: number;
        high: number;
    }>;
    recentActivity: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId: string;
        createdAt: string;
        user?: {
            firstName: string;
            lastName: string;
        };
    }>;
}

// Pagination Types
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// Auth Types
export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    };
}
