export type AnnualPlanScope = 'MINE' | 'UNIT' | 'ORG';

export interface AnnualPlanWorkload {
    controlCount: number;
    totalTasks: number;
    byMonth: number[];
    byFrequency: Record<string, number>;
    adHocCount: number;
    missingScheduleCount: number;
    dailyExcludedCount: number;
    peakMonths: number[];
    peakCount: number;
}

export interface AnnualPlanRow {
    controlId: string;
    controlCode: string;
    name: string;
    frequency: string;
    directorateId: string | null;
    ownerId: string;
    inScope: boolean;
    effectiveFrequency: string;
    effectiveReferenceMonth: number | null;
    effectiveSelectedMonths: string[];
    effectiveControlDate: string | null;
    assigneeId: string | null;
    secondControllerId: string | null;
    assignmentComplete: boolean;
    plannedTestCount: number;
    isAdHoc: boolean;
    missingSchedule: boolean;
    changedInDraft: boolean;
    pendingAction: 'NONE' | 'ADD' | 'REMOVE' | 'MODIFY';
    prevYearScoped: boolean;
    nextYearScoped: boolean;
}

export interface EligibleController {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
}

export interface WorkloadByAssigneeEntry {
    userId: string; name: string; controlCount: number; taskCount: number; byMonth: number[];
}

export interface WorkloadByAssignee {
    byAssignee: WorkloadByAssigneeEntry[];
    bySecondController: { userId: string; name: string; reviewCount: number }[];
    unassignedControlCount: number;
    unassignedTaskCount: number;
}

export interface AnnualPlanWorkspace {
    year: number;
    draftId: string;
    draftRevision: number;
    draftStatus: 'OPEN' | 'APPLIED';
    draftUpdatedAt: string;
    draftLastAppliedAt: string | null;
    scope: {
        applied: AnnualPlanScope;
        directorateIds: string[] | null;
        options: {
            mine: { available: true };
            unit: { available: boolean; directorates: { id: string; name: string }[] };
            org: { available: boolean };
        };
    };
    workload: AnnualPlanWorkload;
    changedCount: number;
    page: number;
    pageSize: number;
    totalCount: number;
    data: AnnualPlanRow[];
}

export interface AnnualPlanDraftItem {
    id: string;
    draftId: string;
    controlId: string;
    inScope: boolean;
    frequency: string | null;
    selectedMonths: string[];
    controlDate: string | null;
    reason: string | null;
}

export interface AnnualPlanPreview {
    toAdd: { controlId: string; controlCode: string; name: string; frequency: string; periodCount: number; assigneeId: string | null; secondControllerId: string | null }[];
    toRemove: { controlId: string; controlCode: string; name: string }[];
    toModify: {
        controlId: string; controlCode: string; name: string; fromFrequency: string; toFrequency: string;
        toCreate: number; toCancel: number; protectedCount: number;
        assigneeChange: { from: string | null; to: string | null } | null;
        secondControllerChange: { from: string | null; to: string | null } | null;
    }[];
    conflicts: { controlId: string; controlCode: string; name: string; reason: string; ongoingTasks: any[] }[];
    missingSchedule: { controlId: string; controlCode: string; name: string }[];
    assignmentBlocked: { controlId: string; controlCode: string; name: string }[];
    taskSummary: { toCreate: number; toCancel: number; protectedCount: number };
    blocked: boolean;
}

export interface AnnualPlanApplyResult {
    applied: boolean;
    requiresDecision: boolean;
    added?: number;
    removed?: number;
    modified?: number;
    tasksCreated?: number;
}
