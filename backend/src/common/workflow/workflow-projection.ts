import { APPROACHING_DAYS, isActionOverdue, isFindingOverdue, isFollowUpOverdue, isTestOverdue, overdueThreshold } from '../util/metric-definitions';

export type DisplayStatus = {
    displayStatus: string;
    statusReason: string;
    timingStatus?: 'ZAMANINDA' | 'YAKLASIYOR' | 'GECIKMIS' | 'TARIHSIZ';
    nextAction?: string | null;
};

const terminalActionStatuses = new Set(['KAPATILDI', 'CLOSED', 'IPTAL']);
const completedActionStatuses = new Set([...terminalActionStatuses, 'TAMAMLANDI', 'COMPLETED']);
const terminalTestStatuses = new Set(['ONAYLANDI', 'IPTAL', 'KAPSAM_DISI']);

export function projectControlStatus(hasActiveCurrentYearScope: boolean, year: number): DisplayStatus {
    return hasActiveCurrentYearScope
        ? { displayStatus: 'AKTIF', statusReason: `${year} Yıllık Planında aktif kapsamda`, nextAction: null }
        : { displayStatus: 'PASIF', statusReason: `${year} Yıllık Planında aktif kapsamda değil`, nextAction: 'YILLIK_PLANA_AL' };
}

export function projectScopeStatus(scopeStatus: string, tasks: { status: string }[]): DisplayStatus {
    if (scopeStatus === 'REMOVED') {
        return { displayStatus: 'KAPSAM_DISI', statusReason: 'Dönem Kontrolü yıllık kapsamdan çıkarılmış', nextAction: null };
    }
    if (tasks.length === 0) {
        return { displayStatus: 'PLANLANDI', statusReason: 'Aktif kapsam var ancak henüz test görevi yok', nextAction: 'TAKVIMI_KONTROL_ET' };
    }
    if (tasks.every(t => terminalTestStatuses.has(t.status))) {
        return { displayStatus: 'TAMAMLANDI', statusReason: 'Dönemin bütün kontrol testleri sonuçlanmış', nextAction: null };
    }
    if (tasks.some(t => ['TAMAMLANDI', 'GERI_GONDERILDI'].includes(t.status))) {
        return { displayStatus: 'ONAY_SURECINDE', statusReason: 'En az bir kontrol testi onay veya düzeltme bekliyor', nextAction: 'TEST_ONAYLARINI_INCELE' };
    }
    if (tasks.some(t => t.status === 'DEVAM_EDIYOR')) {
        return { displayStatus: 'DEVAM_EDIYOR', statusReason: 'En az bir kontrol testi yürütülüyor', nextAction: 'TESTE_DEVAM_ET' };
    }
    return { displayStatus: 'BEKLIYOR', statusReason: 'Kontrol testleri henüz başlamamış', nextAction: 'TESTI_BASLAT' };
}

export function projectTestStatus(status: string, plannedDate: Date, now = new Date()): DisplayStatus {
    // Gecikme kuralı metric-definitions.ts'teki tek tanımdan (açık testler; onay bekleyen/onaylı gecikmiş değil).
    const overdue = isTestOverdue({ status, plannedDate }, now);
    return {
        displayStatus: status,
        statusReason: overdue ? 'Planlanan test tarihi geçti' : 'Kontrol testinin iş akışı durumu',
        timingStatus: overdue ? 'GECIKMIS' : 'ZAMANINDA',
        nextAction: status === 'BEKLIYOR' ? 'TESTI_BASLAT' : status === 'TAMAMLANDI' ? 'TESTI_ONAYLA' : null,
    };
}

/**
 * Aksiyon sunum durumu. `approvalState` verilirse onaysız (taslak/onay bekleyen/reddedilmiş) aksiyon
 * gecikmiş sayılmaz — henüz iş yürütmüyor, takip çalışması da açılmamıştır.
 */
export function projectActionStatus(status: string, dueDate: Date | null, now = new Date(), approvalState?: string | null): DisplayStatus {
    const terminal = terminalActionStatuses.has(status);
    const workCompleted = completedActionStatuses.has(status);
    const approved = !approvalState || approvalState === 'ONAYLANDI';
    const overdue = isActionOverdue({ status, dueDate, approvalState }, now);
    const approaching = !!dueDate && approved && !workCompleted && !overdue && dueDate.getTime() - now.getTime() <= APPROACHING_DAYS * 24 * 60 * 60 * 1000;
    return {
        displayStatus: overdue ? 'GECIKMIS' : status,
        statusReason: overdue ? 'Aksiyon termini geçti ve aksiyon kapanmadı'
            : !approved ? 'Aksiyon henüz ikinci kontrolcü tarafından onaylanmadı'
                : terminal ? 'Aksiyon sonuçlanmış' : 'Aksiyon iş akışı devam ediyor',
        timingStatus: !dueDate ? 'TARIHSIZ' : overdue ? 'GECIKMIS' : approaching ? 'YAKLASIYOR' : 'ZAMANINDA',
        nextAction: overdue ? 'AKSIYONU_GUNCELLE' : status === 'TAMAMLANDI' || status === 'COMPLETED' ? 'TAKIP_BASLAT' : null,
    };
}

export function projectFindingStatus(
    workflowStatus: string,
    resolutionStatus: string,
    actions: { status: string }[],
): DisplayStatus {
    if (workflowStatus === 'IPTAL') return { displayStatus: 'IPTAL', statusReason: 'Bulgu mutabakat sürecinde iptal edilmiş', nextAction: null };
    if (workflowStatus !== 'MUTABAKAT_YAPILDI') {
        return { displayStatus: workflowStatus, statusReason: 'Bulgu mutabakat sürecinde', nextAction: 'MUTABAKATI_TAMAMLA' };
    }
    if (actions.length === 0 && resolutionStatus !== 'KAPATILDI') {
        return { displayStatus: 'AKSIYON_BEKLIYOR', statusReason: 'Mutabakatı tamamlanmış açık bulgunun aksiyonu yok', nextAction: 'AKSIYON_EKLE' };
    }
    return { displayStatus: resolutionStatus, statusReason: 'Çözüm durumu aksiyon ve takip sonuçlarından türetilir', nextAction: resolutionStatus === 'KAPATILDI' ? null : 'AKSIYONLARI_IZLE' };
}

export function projectFollowUpStatus(status: string, approvalStatus: string | null, plannedDate?: Date | null, now = new Date(), deletedAt?: Date | null): DisplayStatus {
    const timing = plannedDate === undefined ? {} : {
        timingStatus: (!plannedDate ? 'TARIHSIZ' : isFollowUpOverdue({ status, plannedDate, deletedAt }, now) ? 'GECIKMIS'
            : status === 'IPTAL' || deletedAt || !['BEKLIYOR', 'DEVAM_EDIYOR'].includes(status) ? 'ZAMANINDA'
                : plannedDate.getTime() - now.getTime() <= APPROACHING_DAYS * 86400000 ? 'YAKLASIYOR' : 'ZAMANINDA') as DisplayStatus['timingStatus'],
    };
    if (status === 'IPTAL') return { displayStatus: 'IPTAL', statusReason: 'Takip çalışması iptal edilmiş', nextAction: null, ...timing };
    if (status === 'TAMAMLANDI' && approvalStatus !== 'ONAYLANDI') {
        return { displayStatus: 'ONAY_BEKLIYOR', statusReason: 'Takip değerlendirmesi ikinci kontrolcü onayı bekliyor', nextAction: 'TAKIBI_ONAYLA', ...timing };
    }
    if (status === 'ONAYLANDI' || approvalStatus === 'ONAYLANDI') {
        return { displayStatus: 'ONAYLANDI', statusReason: 'Takip değerlendirmesi onaylanmış', nextAction: null, ...timing };
    }
    return { displayStatus: status, statusReason: 'Bulgu takip çalışmasının iş akışı durumu', nextAction: status === 'BEKLIYOR' ? 'TAKIBI_BASLAT' : 'TAKIBE_DEVAM_ET', ...timing };
}

/** Bulgu zamanlaması: hedef çözüm tarihine göre (kapalı/iptal bulgu gecikmiş sayılmaz). */
export function projectFindingTiming(
    f: { targetResolutionDate: Date | null; resolutionStatus?: string | null; workflowStatus?: string | null; status?: string | null },
    now = new Date(),
): { timingStatus: NonNullable<DisplayStatus['timingStatus']> } {
    if (!f.targetResolutionDate) return { timingStatus: 'TARIHSIZ' };
    if (isFindingOverdue(f, now)) return { timingStatus: 'GECIKMIS' };
    const open = f.resolutionStatus !== 'KAPATILDI' && f.workflowStatus !== 'IPTAL' && f.status !== 'CLOSED';
    const approaching = open && f.targetResolutionDate.getTime() >= overdueThreshold(now).getTime() && f.targetResolutionDate.getTime() - now.getTime() <= APPROACHING_DAYS * 86400000;
    return { timingStatus: approaching ? 'YAKLASIYOR' : 'ZAMANINDA' };
}
