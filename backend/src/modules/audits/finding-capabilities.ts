/**
 * Bulgu detayında kullanıcının YAPABİLECEĞİ işlemler — tek kaynak. Frontend butonları
 * bu bayraklara göre gösterir, kuralı kendisi yeniden hesaplamaz. Bayraklar ilgili
 * uçların kontrollerini (rol, kayıt kapsamı, sahiplik, workflow durumu) yansıtır; uçlar
 * kendi kontrollerini yine uygular — bayrak yalnız arayüz içindir, güvenlik katmanı değil.
 */
export type FindingAccessLevel = 'FULL' | 'PARTIAL';

export interface FindingCapabilities {
    canEditFinding: boolean;
    canAdvanceWorkflow: boolean;
    canApproveWorkflow: boolean;
    canCreateAction: boolean;
    canAddStatusNote: boolean;
    canManageAttachments: boolean;
    canLinkRisk: boolean;
    canViewHistory: boolean;
}

export interface ActionCapabilities {
    canEdit: boolean;
    canComplete: boolean;
    // Maker-checker (birinci / ikinci kontrolcü)
    canSubmit: boolean;
    canApprove: boolean;
    canRevert: boolean;
    canRequestDelete: boolean;
    canDecideDelete: boolean;
    canExtend: boolean;
    canManageAttachments: boolean;
}

const ROLE_ALIASES: Record<string, string> = { ADMIN: 'SYSTEM_ADMIN', RISK_MANAGER: 'RISK_CONTROL_MANAGER', CONTROL_OWNER: 'AUDITEE' };
const norm = (role?: string | null) => (role ? ROLE_ALIASES[role] ?? role : '');

// audits.controller.ts bulgu/aksiyon yazma uçlarındaki @Roles setleri
const FINDING_WRITERS = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR']);
const FINDING_APPROVERS = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER']);
// actions.controller.ts complete/extend uçlarındaki @Roles seti (AUDITEE yalnız kendi aksiyonu)
const ACTION_PROGRESS_ROLES = new Set(['SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE']);

const CLOSED_ACTION = new Set(['KAPATILDI', 'CLOSED', 'IPTAL']);
const COMPLETED_ACTION = new Set(['TAMAMLANDI', 'COMPLETED']);

export function findingCapabilities(
    finding: { status?: string | null; workflowStatus?: string | null; firstControllerId?: string | null },
    actor: { id?: string; role?: string | null },
    level: FindingAccessLevel,
): FindingCapabilities {
    // Aksiyon girişi bulgunun birinci kontrolcüsünündür (kontrolcüsü olmayan eski bulgularda rol yeterli).
    const isFirstController = !finding.firstControllerId || finding.firstControllerId === actor.id;
    const role = norm(actor.role);
    const full = level === 'FULL';
    const writer = full && FINDING_WRITERS.has(role);
    const approver = full && FINDING_APPROVERS.has(role);
    const open = finding.status !== 'CLOSED' && finding.workflowStatus !== 'IPTAL';
    return {
        canEditFinding: writer && finding.workflowStatus !== 'IPTAL',
        canAdvanceWorkflow: writer,
        canApproveWorkflow: approver,
        canCreateAction: (writer && open) && isFirstController,
        canAddStatusNote: writer,
        canManageAttachments: writer,
        canLinkRisk: writer,
        canViewHistory: full,
    };
}

export function actionCapabilities(
    action: {
        status?: string | null; ownerId?: string | null; approvalState?: string | null;
        firstControllerId?: string | null; secondControllerId?: string | null;
        deletionRequestedAt?: Date | string | null; deletedAt?: Date | string | null; deletionRequestedById?: string | null;
    },
    actor: { id: string; role?: string | null },
    level: FindingAccessLevel,
): ActionCapabilities {
    const role = norm(actor.role);
    const full = level === 'FULL';
    const isOwner = !!action.ownerId && action.ownerId === actor.id;
    const open = !CLOSED_ACTION.has(action.status ?? '');
    // complete/extend: rol seti + (AUDITEE ise sahiplik) + kayıt kapsamı (tam erişim veya sahiplik)
    const progress = open && ACTION_PROGRESS_ROLES.has(role)
        && (role !== 'AUDITEE' || isOwner) && (full || isOwner);
    const writer = full && FINDING_WRITERS.has(role);
    const state = action.approvalState ?? 'ONAYLANDI';
    const deleted = !!action.deletedAt;
    const deletionPending = !!action.deletionRequestedAt && !deleted;
    const isFirst = !action.firstControllerId || action.firstControllerId === actor.id;
    const isSecond = !!action.secondControllerId && action.secondControllerId === actor.id;
    const draft = state === 'TASLAK' || state === 'REDDEDILDI';
    const approver = full && (role === 'SYSTEM_ADMIN' || role === 'RISK_CONTROL_MANAGER');
    return {
        canEdit: writer && open && draft && !deletionPending && !deleted && isFirst,
        canComplete: progress && !COMPLETED_ACTION.has(action.status ?? '') && state === 'ONAYLANDI',
        canExtend: progress && state === 'ONAYLANDI',
        canManageAttachments: writer && open && !deleted,
        canSubmit: writer && open && draft && !deletionPending && !deleted && isFirst && !!action.secondControllerId,
        canApprove: approver && isSecond && state === 'ONAY_BEKLIYOR' && !deleted,
        canRevert: approver && isSecond && state === 'ONAYLANDI' && !deleted && !deletionPending,
        canRequestDelete: writer && open && !deleted && !deletionPending && state !== 'ONAY_BEKLIYOR' && isFirst,
        // Silme kararı yönetici rolündedir; talep eden kendi talebine karar veremez.
        canDecideDelete: approver && deletionPending && action.deletionRequestedById !== actor.id,
    };
}

/** Detay yanıtına bayrakları ekler: bulgu düzeyi + her aksiyon için. */
export function withCapabilities<T extends { status?: string | null; workflowStatus?: string | null; actions?: any[] }>(
    finding: T,
    actor: { id: string; role?: string | null },
    level: FindingAccessLevel,
) {
    return {
        ...finding,
        capabilities: findingCapabilities(finding, actor, level),
        actions: (finding.actions ?? []).map(a => ({ ...a, capabilities: actionCapabilities(a, actor, level) })),
    };
}
