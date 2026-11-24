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
export type WorkflowEntityType = 'CONTROL_TEST' | 'FOLLOW_UP' | 'FINDING' | 'PERIOD_CONTROL' | 'ACTION';
export type WorkflowAction = 'START' | 'COMPLETE' | 'APPROVE' | 'RETURN' | 'REVERT' | 'CANCEL' | 'REOPEN';

export const STAGE_LABELS: Record<Stage, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı', ONAYLANDI: 'Onaylandı', IPTAL: 'İptal',
};
export const ACTION_LABELS: Record<WorkflowAction, string> = {
    START: 'Başlat', COMPLETE: 'Tamamla ve 2. kontrolcüye ilet', APPROVE: 'Onayla', RETURN: 'İade et',
    REVERT: 'Önceki aşamaya geri al', CANCEL: 'İptal et', REOPEN: 'Yeniden aç',
};

/**
 * Türe özel aşama tanımları (her modülün iş mantığı). Anahtarlar ortak dört aşamadır — Kanban sütunları
 * ve komşuluk kuralları ortak kalır — ama her tür yalnız kendi kullandığı aşamaları kendi adıyla gösterir.
 * - Bulgu: Açık → Kapanış Değerlendirmesinde → Kapatıldı. Açık kalmak onay istemez (Bekliyor aşaması yok).
 * - Aksiyon planı: Taslak → 2. kontrolcü onayında → Onaylandı (aksiyon onayı bulgudan bağımsızdır).
 */
export const STAGE_DEFS: Record<WorkflowEntityType, Array<{ key: typeof STAGES[number]; label: string; hint: string }>> = {
    CONTROL_TEST: [
        { key: 'BEKLIYOR', label: 'Bekliyor', hint: 'Test henüz başlatılmadı' },
        { key: 'DEVAM_EDIYOR', label: 'Devam Ediyor', hint: 'Sorumlu kullanıcı yürütüyor' },
        { key: 'TAMAMLANDI', label: 'Tamamlandı', hint: '1. kontrolcü tamamladı, 2. kontrolcü onayında' },
        { key: 'ONAYLANDI', label: 'Onaylandı', hint: '2. kontrolcü onayladı (nihai)' },
    ],
    FOLLOW_UP: [
        { key: 'BEKLIYOR', label: 'Bekliyor', hint: 'Takip henüz başlatılmadı' },
        { key: 'DEVAM_EDIYOR', label: 'Devam Ediyor', hint: 'Takip yürütülüyor' },
        { key: 'TAMAMLANDI', label: 'Tamamlandı', hint: 'Değerlendirildi, 2. kontrolcü onayında' },
        { key: 'ONAYLANDI', label: 'Onaylandı', hint: '2. kontrolcü onayladı (nihai)' },
    ],
    PERIOD_CONTROL: [
        { key: 'BEKLIYOR', label: 'Bekliyor', hint: 'Dönemin testleri başlamadı' },
        { key: 'DEVAM_EDIYOR', label: 'Devam Ediyor', hint: 'Dönem testleri yürütülüyor' },
        { key: 'TAMAMLANDI', label: 'Tamamlandı', hint: '1. kontrolcü tamamladı, 2. kontrolcü onayında' },
        { key: 'ONAYLANDI', label: 'Onaylandı', hint: '2. kontrolcü onayladı (nihai)' },
    ],
    FINDING: [
        { key: 'DEVAM_EDIYOR', label: 'Açık', hint: 'Bulgu açık; aksiyonlar ve takipler yürütülüyor (onay gerekmez)' },
        { key: 'TAMAMLANDI', label: 'Kapanış Değerlendirmesinde', hint: '1. kontrolcü kapanışa gönderdi; 2. kontrolcü/yönetici değerlendiriyor' },
        { key: 'ONAYLANDI', label: 'Kapatıldı', hint: 'Kapanış onaylandı' },
    ],
    ACTION: [
        { key: 'DEVAM_EDIYOR', label: 'Taslak', hint: '1. kontrolcü aksiyonu hazırlıyor' },
        { key: 'TAMAMLANDI', label: '2. Kontrolcü Onayında', hint: 'Onaya gönderildi' },
        { key: 'ONAYLANDI', label: 'Onaylandı', hint: '2. kontrolcü onayladı; takip çalışması oluştu' },
    ],
};

/** Türün aşama adı (Kanban kartı, iş akışı çubuğu, geçmiş). */
export function stageLabelFor(type: WorkflowEntityType, stage: Stage): string {
    return STAGE_DEFS[type].find(d => d.key === stage)?.label ?? STAGE_LABELS[stage];
}

/** Türe özel eylem adları (ortak eylem anahtarıyla). */
const TYPE_ACTION_LABELS: Partial<Record<WorkflowEntityType, Partial<Record<WorkflowAction, string>>>> = {
    FINDING: { COMPLETE: 'Kapanış değerlendirmesine gönder', APPROVE: 'Kapanışı onayla', RETURN: 'İade et (açık kalsın)', REVERT: 'Önceki aşamaya geri al', CANCEL: 'Silme talebi' },
    ACTION: { COMPLETE: '2. kontrolcü onayına gönder', APPROVE: 'Onayla', RETURN: 'Gerekçeyle iade et', REVERT: 'Onayı geri al', CANCEL: 'Silme talebi' },
    FOLLOW_UP: { CANCEL: 'Silme talebi' },
    PERIOD_CONTROL: { CANCEL: 'Silme talebi' },
};
export function actionLabelFor(type: WorkflowEntityType, action: WorkflowAction): string {
    return TYPE_ACTION_LABELS[type]?.[action] ?? ACTION_LABELS[action];
}

/** Tür için geçerli eylem mi (türün kullanmadığı aşamaya giden geçiş yok sayılır). */
export function nextStageFor(type: WorkflowEntityType, action: WorkflowAction, from: Stage): Stage | null {
    const to = nextStage(action, from);
    if (!to || to === 'IPTAL') return to;
    return STAGE_DEFS[type].some(d => d.key === to) ? to : null;
}

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

/**
 * Bulgu yaşam döngüsü (mutabakat durumu artık aşama değil, bilgi alanıdır):
 * iptal/silinmiş → IPTAL; CLOSED → Kapatıldı; PENDING_REVIEW → Kapanış Değerlendirmesinde; diğerleri → Açık.
 */
export function findingStage(f: { workflowStatus: string; status: string; deletedAt?: Date | null }): Stage {
    if (f.workflowStatus === 'IPTAL' || f.deletedAt) return 'IPTAL';
    if (f.status === 'CLOSED') return 'ONAYLANDI';
    if (f.status === 'PENDING_REVIEW') return 'TAMAMLANDI';
    return 'DEVAM_EDIYOR';
}

/** Aksiyon planının onay hattı (yürütme durumu ayrı: BEKLIYOR…KAPATILDI). */
export function actionStage(a: { approvalState: string; status: string; deletedAt?: Date | null }): Stage {
    if (a.deletedAt || a.status === 'IPTAL') return 'IPTAL';
    if (a.approvalState === 'ONAYLANDI') return 'ONAYLANDI';
    if (a.approvalState === 'ONAY_BEKLIYOR') return 'TAMAMLANDI';
    return 'DEVAM_EDIYOR'; // TASLAK, REDDEDILDI
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
