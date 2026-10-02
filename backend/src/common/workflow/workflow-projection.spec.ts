import {
    projectActionStatus, projectControlStatus, projectFindingStatus, projectFollowUpStatus, projectScopeStatus,
} from './workflow-projection';

describe('workflow status projections', () => {
    const now = new Date('2026-09-29T12:00:00Z');

    it('Ana Kontrol durumunu yalnız mevcut yılın aktif kapsamından türetir', () => {
        expect(projectControlStatus(true, 2026).displayStatus).toBe('AKTIF');
        expect(projectControlStatus(false, 2026)).toMatchObject({ displayStatus: 'PASIF', nextAction: 'YILLIK_PLANA_AL' });
    });

    it('geçmiş tarihli açık aksiyonu DB değerinden bağımsız gecikmiş gösterir', () => {
        expect(projectActionStatus('DEVAM_EDIYOR', new Date('2026-09-01'), now)).toMatchObject({
            displayStatus: 'GECIKMIS', timingStatus: 'GECIKMIS',
        });
    });

    it('kapanmış aksiyonu geçmiş termin nedeniyle gecikmiş göstermez', () => {
        expect(projectActionStatus('KAPATILDI', new Date('2026-09-01'), now)).toMatchObject({
            displayStatus: 'KAPATILDI', timingStatus: 'ZAMANINDA',
        });
    });

    it('mutabakatı yapılmış aksiyonsuz bulgu için sonraki adımı üretir', () => {
        expect(projectFindingStatus('MUTABAKAT_YAPILDI', 'DEVAM_EDIYOR', [])).toMatchObject({
            displayStatus: 'AKSIYON_BEKLIYOR', nextAction: 'AKSIYON_EKLE',
        });
    });

    it('tamamlanan takip onaylanmadıysa onay bekliyor gösterir', () => {
        expect(projectFollowUpStatus('TAMAMLANDI', 'BEKLIYOR').displayStatus).toBe('ONAY_BEKLIYOR');
    });

    it('Dönem Kontrolünü bağlı görevlerin durumundan türetir', () => {
        expect(projectScopeStatus('ACTIVE', [{ status: 'BEKLIYOR' }]).displayStatus).toBe('BEKLIYOR');
        expect(projectScopeStatus('ACTIVE', [{ status: 'ONAYLANDI' }]).displayStatus).toBe('TAMAMLANDI');
    });
});
