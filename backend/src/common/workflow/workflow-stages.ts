/**
 * Ortak iş akışı — tek kaynak.
 *
 * Aşamalar (kullanıcı kararı): Bekliyor → Devam Ediyor → Tamamlandı (1. kontrolcü tamamladı,
 * 2. kontrolcü onayına iletildi) → Onaylandı (2. kontrolcü onayı, nihai). İptal ayrı uç durum.
 *
 * Her modülün kendi durum alanı korunur (raporlar/ekranlar bozulmaz); bu dosya onları ortak
 * aşamaya eşler, izinli geçişleri tanımlar ve geçiş geçmişini (WorkflowTransition) yazar.
 */
export const STAGES = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'] as const;
export type Stage = typeof STAGES[number] | 'IPTAL';
export type WorkflowEntityType = 'CONTROL_TEST' | 'FOLLOW_UP' | 'FINDING' | 'PERIOD_CONTROL';
export type WorkflowAction = 'START' | 'COMPLETE' | 'APPROVE' | 'RETURN' | 'REVERT' | 'CANCEL' | 'REOPEN';

export const STAGE_LABELS: Record<Stage, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı', ONAYLANDI: 'Onaylandı', IPTAL: 'İptal',
};
export const ACTION_LABELS: Record<WorkflowAction, string> = {
    START: 'Başlat', COMPLETE: 'Tamamla ve 2. kontrolcüye ilet', APPROVE: 'Onayla', RETURN: 'İade et',
    REVERT: 'Önceki aşamaya geri al', CANCEL: 'İptal et', REOPEN: 'Yeniden aç',
};

/**
 * İzinli geçişler: yalnız komşu aşamalar. Bekliyor'dan Tamamlandı/Onaylandı'ya atlanamaz;
 * Onaylandı'ya yalnız APPROVE (2. kontrolcü) ile gelinir.
 */
export const TRANSITIONS: Record<WorkflowAction, { from: Stage[]; to: Stage }> = {
    START: { from: ['BEKLIYOR'], to: 'DEVAM_EDIYOR' },
    COMPLETE: { from: ['DEVAM_EDIYOR'], to: 'TAMAMLANDI' },
    APPROVE: { from: ['TAMAMLANDI'], to: 'ONAYLANDI' },
    RETURN: { from: ['TAMAMLANDI'], to: 'DEVAM_EDIYOR' },
    // Yetkili kullanıcı bir önceki aşamaya geri alır (hedef: nextStage ile bir önceki aşama).
    REVERT: { from: ['DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'], to: 'TAMAMLANDI' },
    CANCEL: { from: ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'], to: 'IPTAL' },
    REOPEN: { from: ['IPTAL'], to: 'DEVAM_EDIYOR' },
};

/** Eylemin hedef aşaması (REVERT bir önceki aşamaya gider). Geçersizse null. */
export function nextStage(action: WorkflowAction, from: Stage): Stage | null {
    const t = TRANSITIONS[action];
    if (!t.from.includes(from)) return null;
    if (action === 'REVERT') {
        const i = (STAGES as readonly string[]).indexOf(from);
        return i > 0 ? STAGES[i - 1] : null;
    }
    return t.to;
}

/** Sürükle-bırak / hedef aşama → tek geçerli eylem (komşu değilse null: atlama yasak). */
export function actionForMove(from: Stage, to: Stage): WorkflowAction | null {
    // İleri yön: tek komşu eylem. Geri yön: iade (Tamamlandı→Devam) önceliklidir, aksi halde geri al.
    for (const a of ['START', 'COMPLETE', 'APPROVE', 'RETURN', 'REVERT', 'REOPEN'] as WorkflowAction[]) {
        if (nextStage(a, from) === to) return a;
    }
    return null;
}

// ── Modül durumu → ortak aşama ─────────────────────────────────────────────

export function testStage(status: string): Stage {
    switch (status) {
        case 'BEKLIYOR': return 'BEKLIYOR';
        case 'DEVAM_EDIYOR': case 'GERI_GONDERILDI': return 'DEVAM_EDIYOR';
        case 'TAMAMLANDI': return 'TAMAMLANDI';
        case 'ONAYLANDI': return 'ONAYLANDI';
        default: return 'IPTAL'; // IPTAL, KAPSAM_DISI
    }
}

export function followUpStage(status: string): Stage {
    switch (status) {
        case 'BEKLIYOR': return 'BEKLIYOR';
        case 'DEVAM_EDIYOR': return 'DEVAM_EDIYOR';
        case 'TAMAMLANDI': return 'TAMAMLANDI';
        case 'ONAYLANDI': return 'ONAYLANDI';
        default: return 'IPTAL';
    }
}

export function findingStage(workflowStatus: string): Stage {
    switch (workflowStatus) {
        case 'TASLAK': return 'BEKLIYOR';
        case 'MUTABAKATA_GONDERILDI': return 'DEVAM_EDIYOR';
        case 'IC_KONTROL_ONAYINA_GONDERILDI': return 'TAMAMLANDI';
        case 'MUTABAKAT_YAPILDI': return 'ONAYLANDI';
        default: return 'IPTAL';
    }
}

/** Dönem Kontrolü: onay alanları saklanır; Bekliyor/Devam Ediyor testlerin ilerleyişinden türetilir. */
export function periodControlStage(
    scope: { status: string; reviewSubmittedAt: Date | null; reviewApprovedAt: Date | null },
    tasks: Array<{ status: string; deletedAt?: Date | null }>,
): Stage {
    if (scope.status !== 'ACTIVE') return 'IPTAL';
    if (scope.reviewApprovedAt) return 'ONAYLANDI';
    if (scope.reviewSubmittedAt) return 'TAMAMLANDI';
    const live = tasks.filter(t => !t.deletedAt && !['IPTAL', 'KAPSAM_DISI'].includes(t.status));
    return live.some(t => t.status !== 'BEKLIYOR') ? 'DEVAM_EDIYOR' : 'BEKLIYOR';
}

/** Dönem kontrolü tamamlanabilir mi: tüm canlı testleri onaylanmış olmalı (en az bir test). */
export function periodControlReady(tasks: Array<{ status: string; deletedAt?: Date | null }>): boolean {
    const live = tasks.filter(t => !t.deletedAt && !['IPTAL', 'KAPSAM_DISI'].includes(t.status));
    return live.length > 0 && live.every(t => t.status === 'ONAYLANDI');
}

/** Geçiş geçmişi — çağıranın işlem istemcisiyle (aynı transaction) yazılır. */
export async function logTransition(
    db: { workflowTransition: { create: (args: any) => Promise<unknown> } },
    t: { entityType: WorkflowEntityType; entityId: string; action: WorkflowAction; from: Stage; to: Stage; userId: string | null; reason?: string | null },
) {
    if (t.from === t.to) return;
    await db.workflowTransition.create({
        data: { entityType: t.entityType, entityId: t.entityId, action: t.action, fromStage: t.from, toStage: t.to, userId: t.userId, reason: t.reason?.trim() || null },
    });
}
