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
    const terminal = terminalTestStatuses.has(status);
    const overdue = !terminal && plannedDate.getTime() < now.getTime();
    return {
        displayStatus: status,
        statusReason: overdue ? 'Planlanan test tarihi geçti' : 'Kontrol testinin iş akışı durumu',
        timingStatus: overdue ? 'GECIKMIS' : 'ZAMANINDA',
        nextAction: status === 'BEKLIYOR' ? 'TESTI_BASLAT' : status === 'TAMAMLANDI' ? 'TESTI_ONAYLA' : null,
    };
}

export function projectActionStatus(status: string, dueDate: Date | null, now = new Date()): DisplayStatus {
    const terminal = terminalActionStatuses.has(status);
    const workCompleted = completedActionStatuses.has(status);
    const overdue = !!dueDate && !workCompleted && dueDate.getTime() < now.getTime();
    const approaching = !!dueDate && !workCompleted && !overdue && dueDate.getTime() - now.getTime() <= 14 * 24 * 60 * 60 * 1000;
    return {
        displayStatus: overdue ? 'GECIKMIS' : status,
        statusReason: overdue ? 'Aksiyon termini geçti ve aksiyon kapanmadı' : terminal ? 'Aksiyon sonuçlanmış' : 'Aksiyon iş akışı devam ediyor',
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

export function projectFollowUpStatus(status: string, approvalStatus: string | null): DisplayStatus {
    if (status === 'IPTAL') return { displayStatus: 'IPTAL', statusReason: 'Takip çalışması iptal edilmiş', nextAction: null };
    if (status === 'TAMAMLANDI' && approvalStatus !== 'ONAYLANDI') {
        return { displayStatus: 'ONAY_BEKLIYOR', statusReason: 'Takip değerlendirmesi ikinci kontrolcü onayı bekliyor', nextAction: 'TAKIBI_ONAYLA' };
    }
    if (status === 'ONAYLANDI' || approvalStatus === 'ONAYLANDI') {
        return { displayStatus: 'ONAYLANDI', statusReason: 'Takip değerlendirmesi onaylanmış', nextAction: null };
    }
    return { displayStatus: status, statusReason: 'Bulgu takip çalışmasının iş akışı durumu', nextAction: status === 'BEKLIYOR' ? 'TAKIBI_BASLAT' : 'TAKIBE_DEVAM_ET' };
}
