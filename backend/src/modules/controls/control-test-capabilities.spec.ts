import { controlTestCapabilities } from './control-test-capabilities';

describe('controlTestCapabilities — test sayfası yetenekleri servis kurallarını yansıtır', () => {
    const auditor = { id: 'maker', role: 'AUDITOR', permissions: ['control:view', 'control:test'] };
    const rcm = { id: 'checker', role: 'RISK_CONTROL_MANAGER', permissions: ['control:*'] };
    const otherRcm = { id: 'rcm2', role: 'RISK_CONTROL_MANAGER', permissions: ['control:*'] };
    const admin = { id: 'adm', role: 'SYSTEM_ADMIN', permissions: ['*'] };
    const pending = { status: 'TAMAMLANDI', assigneeId: 'maker', secondControllerId: 'checker' };

    it('onay bekleyen testte yalnız atanmış ikinci kontrolcü (veya admin) onaylar/geri gönderir', () => {
        expect(controlTestCapabilities(pending, auditor)).toMatchObject({ canApprove: false, canReturn: false, canEditContent: false });
        expect(controlTestCapabilities(pending, rcm)).toMatchObject({ canApprove: true, canReturn: true });
        expect(controlTestCapabilities(pending, otherRcm)).toMatchObject({ canApprove: false, canReturn: false });
        expect(controlTestCapabilities(pending, admin)).toMatchObject({ canApprove: true, canReturn: true });
    });

    it('testi yapan kendi onayını veremez (admin dahil)', () => {
        expect(controlTestCapabilities({ ...pending, assigneeId: 'adm', secondControllerId: null }, admin).canApprove).toBe(false);
    });

    it('ikinci kontrolcü testi yürütemez; yürütme izni olmayan başlatamaz', () => {
        const open = { status: 'DEVAM_EDIYOR', assigneeId: 'maker', secondControllerId: 'checker' };
        expect(controlTestCapabilities(open, rcm)).toMatchObject({ canEditContent: false, canComplete: false });
        expect(controlTestCapabilities(open, auditor)).toMatchObject({ canEditContent: true, canComplete: true });
        expect(controlTestCapabilities({ status: 'BEKLIYOR' }, { id: 'v', role: 'VIEWER', permissions: ['control:view'] }).canStart).toBe(false);
    });
});
