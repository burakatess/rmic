import { actionCapabilities, findingCapabilities, withCapabilities } from './finding-capabilities';

describe('finding-capabilities — arayüz yetenekleri uç kurallarını yansıtır', () => {
    const open = { status: 'IN_PROGRESS', workflowStatus: 'MUTABAKAT_YAPILDI' };

    it('PARTIAL erişimli kullanıcı rolü ne olursa olsun bulgu düzeyi işlem yapamaz', () => {
        for (const role of ['AUDITOR', 'RISK_CONTROL_MANAGER', 'SYSTEM_ADMIN', 'AUDITEE']) {
            const c = findingCapabilities(open, { role }, 'PARTIAL');
            expect(Object.values(c).every(v => v === false)).toBe(true);
        }
    });

    it('TAM erişimde rol setleri: AUDITOR yazar ama onaylayamaz; AUDITEE hiçbir bulgu işlemi yapamaz', () => {
        expect(findingCapabilities(open, { role: 'AUDITOR' }, 'FULL')).toMatchObject({ canEditFinding: true, canCreateAction: true, canApproveWorkflow: false });
        expect(findingCapabilities(open, { role: 'RISK_MANAGER' }, 'FULL')).toMatchObject({ canApproveWorkflow: true });
        const auditee = findingCapabilities(open, { role: 'AUDITEE' }, 'FULL');
        expect(auditee).toMatchObject({ canEditFinding: false, canCreateAction: false, canAddStatusNote: false, canViewHistory: true });
    });

    it('workflow durumu: kapalı/iptal bulguya aksiyon eklenmez, iptal bulgu düzenlenmez', () => {
        expect(findingCapabilities({ status: 'CLOSED', workflowStatus: 'MUTABAKAT_YAPILDI' }, { role: 'AUDITOR' }, 'FULL').canCreateAction).toBe(false);
        const cancelled = findingCapabilities({ status: 'IN_PROGRESS', workflowStatus: 'IPTAL' }, { role: 'AUDITOR' }, 'FULL');
        expect(cancelled).toMatchObject({ canCreateAction: false, canEditFinding: false });
    });

    it('kapalı veya kapanış değerlendirmesindeki bulgu düzenlenemez (Düzenle gizlenir)', () => {
        expect(findingCapabilities({ status: 'CLOSED', workflowStatus: 'MUTABAKAT_YAPILDI' }, { role: 'AUDITOR' }, 'FULL').canEditFinding).toBe(false);
        expect(findingCapabilities({ status: 'PENDING_REVIEW', workflowStatus: 'TASLAK' }, { role: 'SYSTEM_ADMIN' }, 'FULL').canEditFinding).toBe(false);
        expect(findingCapabilities({ status: 'PARTIALLY_CLOSED', workflowStatus: 'TASLAK' }, { role: 'AUDITOR' }, 'FULL').canEditFinding).toBe(true);
    });

    it('aksiyon: sorumlu kendi aksiyonunu tamamlar/uzatır ama düzenleyemez; başkasınınkine dokunamaz', () => {
        const own = actionCapabilities({ status: 'DEVAM_EDIYOR', ownerId: 'u1' }, { id: 'u1', role: 'AUDITEE' }, 'PARTIAL');
        expect(own).toEqual({
            canEdit: false, canComplete: true, canExtend: true, canManageAttachments: false,
            canSubmit: false, canApprove: false, canRevert: false, canRequestDelete: false, canDecideDelete: false,
        });
        const other = actionCapabilities({ status: 'DEVAM_EDIYOR', ownerId: 'u2' }, { id: 'u1', role: 'AUDITEE' }, 'FULL');
        expect(Object.values(other).every(v => v === false)).toBe(true);
        // PARTIAL erişimli AUDITOR başkasının aksiyonunda işlem yapamaz
        const partialAuditor = actionCapabilities({ status: 'DEVAM_EDIYOR', ownerId: 'u2' }, { id: 'u1', role: 'AUDITOR' }, 'PARTIAL');
        expect(Object.values(partialAuditor).every(v => v === false)).toBe(true);
    });

    it('aksiyon: kapatılmış aksiyonda işlem yok; tamamlanmış aksiyon yeniden tamamlanmaz; RCM tamamlama ucuna yetkili değil', () => {
        expect(Object.values(actionCapabilities({ status: 'KAPATILDI', ownerId: 'u1' }, { id: 'u1', role: 'AUDITOR' }, 'FULL')).every(v => v === false)).toBe(true);
        expect(actionCapabilities({ status: 'TAMAMLANDI', ownerId: 'u1' }, { id: 'u1', role: 'AUDITEE' }, 'PARTIAL').canComplete).toBe(false);
        // Onaylı aksiyon düzenlenemez; taslak düzenlenir (RCM tamamlama ucuna yine yetkili değil).
        expect(actionCapabilities({ status: 'DEVAM_EDIYOR', ownerId: 'x' }, { id: 'u1', role: 'RISK_CONTROL_MANAGER' }, 'FULL')).toMatchObject({ canEdit: false, canComplete: false });
        expect(actionCapabilities({ status: 'DEVAM_EDIYOR', ownerId: 'x', approvalState: 'TASLAK' }, { id: 'u1', role: 'RISK_CONTROL_MANAGER' }, 'FULL')).toMatchObject({ canEdit: true, canComplete: false });
    });

    it('aksiyon maker-checker: birinci kontrolcü düzenler/gönderir/silme talep eder; ikinci kontrolcü onaylar/geri alır/silmeyi sonuçlandırır', () => {
        const base = { status: 'BEKLIYOR', ownerId: 'o', firstControllerId: 'maker', secondControllerId: 'checker' };
        const maker = { id: 'maker', role: 'AUDITOR' }, checker = { id: 'checker', role: 'RISK_CONTROL_MANAGER' }, other = { id: 'x', role: 'SYSTEM_ADMIN' };
        expect(actionCapabilities({ ...base, approvalState: 'TASLAK' }, maker, 'FULL')).toMatchObject({ canEdit: true, canSubmit: true, canRequestDelete: true, canApprove: false });
        expect(actionCapabilities({ ...base, approvalState: 'TASLAK' }, other, 'FULL')).toMatchObject({ canEdit: false, canSubmit: false });
        expect(actionCapabilities({ ...base, approvalState: 'ONAY_BEKLIYOR' }, maker, 'FULL')).toMatchObject({ canEdit: false, canSubmit: false, canRequestDelete: false });
        expect(actionCapabilities({ ...base, approvalState: 'ONAY_BEKLIYOR' }, checker, 'FULL')).toMatchObject({ canApprove: true, canRevert: false });
        expect(actionCapabilities({ ...base, approvalState: 'ONAY_BEKLIYOR' }, other, 'FULL').canApprove).toBe(false);
        expect(actionCapabilities({ ...base, approvalState: 'ONAYLANDI' }, checker, 'FULL')).toMatchObject({ canRevert: true, canApprove: false });
        expect(actionCapabilities({ ...base, approvalState: 'ONAYLANDI', deletionRequestedAt: new Date() }, checker, 'FULL')).toMatchObject({ canDecideDelete: true, canRevert: false });
        expect(actionCapabilities({ ...base, approvalState: 'ONAYLANDI', deletionRequestedAt: new Date() }, maker, 'FULL')).toMatchObject({ canRequestDelete: false, canEdit: false });
    });

    it('withCapabilities her aksiyona bayrak ekler', () => {
        const out = withCapabilities({ ...open, actions: [{ id: 'a', status: 'BEKLIYOR', ownerId: 'u1' }] }, { id: 'u1', role: 'AUDITEE' }, 'PARTIAL');
        expect(out.capabilities.canEditFinding).toBe(false);
        expect(out.actions[0].capabilities.canComplete).toBe(true);
    });
});
