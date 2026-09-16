export type DashboardScope = 'MINE' | 'UNIT' | 'ORG';
export type DashboardWorkTab = 'ALL' | 'TESTS' | 'ACTIONS' | 'FOLLOWUPS' | 'RECONCILIATION';

export interface DashboardScopeParams {
    scope?: DashboardScope;
    directorateId?: string[];
    year?: number;
    month?: number;
    includeCarryover?: boolean;
}

export interface DashboardScopeOptions {
    mine: { available: true };
    unit: { available: boolean; directorates: { id: string; name: string }[] };
    org: { available: boolean };
}

export interface AppliedScope {
    applied: DashboardScope;
    directorateIds: string[] | null;
}

export interface DashboardSummary {
    scope: AppliedScope;
    overdue: { total: number; tests: number | null; actions: number | null; followUps: number | null } | null;
    pendingApproval: { total: number; reason: string | null };
    dueThisWeek: { total: number; from: string; to: string } | null;
    criticalHighFindings: { total: number | null; reason?: string };
}

export interface DashboardWorkItem {
    id: string;
    type: 'TEST' | 'ACTION' | 'FOLLOWUP' | 'RECONCILIATION';
    ref: string;
    title: string;
    dueDate: string | null;
    severity: string | null;
    carriedOver: boolean;
    expectedAction: { label: string; href: string };
    assigneeName: string | null;
    /** Yalnızca TEST türü: kontrol yıllık kapsama (ControlYearScope) bağlı değil (AD_HOC / eşleştirilemeyen legacy). */
    isAdHoc?: boolean;
}

export interface DashboardWorkItemsResponse {
    scope: AppliedScope;
    page: number;
    pageSize: number;
    totalCount: number;
    fetchedCount: number;
    capped: boolean;
    data: DashboardWorkItem[];
}

export interface DashboardApprovals {
    total: number;
    byType: {
        controlTest: { count: number; href: string };
        followUp: { count: number; href: string };
        reconciliation: { count: number; href: string };
    };
}

export interface DashboardCriticalIssue {
    key: string;
    label: string;
    count: number;
    severity: 'critical' | 'high' | 'medium';
    href: string;
}

export interface DashboardAnnualPlan {
    scope: AppliedScope;
    year: number;
    controlCount: number;
    plannedTaskCount: number;
    notStarted: number;
    inProgress: number;
    pendingApproval: number;
    completed: number;
    cancelled: number;
    overdue: number;
    completionRate: number | null;
    resultDistribution: Record<string, number>;
    byPeriod: { periodKey: string; planned: number; completed: number }[];
}

export interface DashboardUpcomingItem {
    date: string;
    type: 'TEST' | 'ACTION' | 'FOLLOWUP';
    ref: string;
    title: string;
    href: string;
}

export interface DashboardUpcoming {
    scope: AppliedScope;
    range: { from: string; to: string; days: number };
    days: { date: string; items: DashboardUpcomingItem[] }[];
}
