export type WorkflowEntityType = 'CONTROL_TEST' | 'FOLLOW_UP' | 'FINDING' | 'PERIOD_CONTROL' | 'ACTION';
export type WorkflowStage = 'BEKLIYOR' | 'DEVAM_EDIYOR' | 'TAMAMLANDI' | 'ONAYLANDI' | 'IPTAL';
export type WorkflowActionKey = 'START' | 'COMPLETE' | 'APPROVE' | 'RETURN' | 'REVERT' | 'CANCEL' | 'REOPEN' | 'WITHDRAW';
export type Approver = { id: string; name: string; role?: string };
export type Person = { id: string; name: string } | null;

export interface WorkflowState {
    entityType: WorkflowEntityType; entityId: string; code: string; title: string; href: string;
    stage: WorkflowStage; stageLabel: string; rawStatus: string;
    assignee: Person; checker: Person; submittedBy: Person;
    /** Türün kendi aşamaları (ör. bulgu: Açık → Kapanış Değerlendirmesinde → Kapatıldı). */
    stages: Array<{ key: WorkflowStage; label: string; hint?: string }>;
    actions: Array<{ action: WorkflowActionKey; label: string; needsReason: boolean; formHref?: string }>;
    /** Onay bekleyen kayıtta kimin onayında olduğu (atanmış 2. kontrolcü / onaylayabilecek yöneticiler). */
    approval?: { approvers: Approver[]; alsoManagers: Approver[]; note: string | null } | null;
    deletion: { requestedAt: string; reason: string | null; requestedBy: Person; approvers?: Approver[]; canWithdraw?: boolean } | null;
    history: Array<{ id: string; action: string; actionLabel: string; from: string; to: string; fromLabel: string; toLabel: string; reason: string | null; at: string; by: Person }>;
}

export interface BoardItem {
    entityType: WorkflowEntityType; entityId: string; code: string; title: string; href: string;
    stage: WorkflowStage; stageLabel?: string; rawStatus: string; assignee: Person; checker: Person;
    plannedDate: string | null; updatedAt: string; flags?: Array<'GECIKMIS' | 'YENI_SURUM' | 'SILME_TALEBI'>;
}
export interface BoardResponse {
    columns: Array<{ stage: WorkflowStage; label: string; total: number; items: BoardItem[] }>;
    scope: 'MINE' | 'ORG'; canOrg: boolean; year: number;
}

export interface DeletionRequestRow {
    type: 'CONTROL' | 'CONTROL_TEST' | 'PERIOD_CONTROL' | 'FINDING' | 'ACTION' | 'FOLLOW_UP'; id: string; code: string; title: string; href: string;
    reason: string | null; requestedAt: string; requestedBy: Person; canDecide: boolean;
    canWithdraw?: boolean; approvers?: Approver[];
}

/** Taleplerim: gönderdiğim, karar bekleyen onay / silme talepleri. */
export interface MyRequestItem {
    kind: 'TEST_APPROVAL' | 'ACTION_APPROVAL' | 'FOLLOWUP_APPROVAL' | 'FINDING_CLOSURE' | 'PERIOD_APPROVAL' | 'DELETION';
    recordType: string; recordId: string; code: string; title: string | null; link: string; submittedAt: string; reason: string | null;
    approvers: Approver[]; approverNote: string | null;
    withdraw: { via: 'WORKFLOW'; entityType: WorkflowEntityType } | { via: 'DELETION'; type: DeletionRequestRow['type'] };
}

export const ENTITY_LABELS: Record<WorkflowEntityType, string> = {
    CONTROL_TEST: 'Kontrol Testi', FOLLOW_UP: 'Takip Çalışması', FINDING: 'Bulgu', PERIOD_CONTROL: 'Dönem Kontrolü', ACTION: 'Aksiyon Planı',
};
