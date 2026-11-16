import { suggestDirectorate } from '../../../prisma/risk-directorate-dry-run';

describe('Risk → direktörlük eşleme önerisi (dry-run mantığı)', () => {
    it('kontrol ve bulgu aynı birimi gösteriyorsa YÜKSEK', () => {
        expect(suggestDirectorate({ controlDirs: ['d1', 'd1'], findingDirs: ['d1'], gmyMatches: [] }))
            .toEqual({ directorateId: 'd1', confidence: 'YÜKSEK', sources: ['KONTROL', 'BULGU'] });
    });
    it('tek kaynak ORTA; GMY metni DÜŞÜK', () => {
        expect(suggestDirectorate({ controlDirs: ['d1'], findingDirs: [], gmyMatches: ['d9'] }).confidence).toBe('ORTA');
        expect(suggestDirectorate({ controlDirs: [], findingDirs: [], gmyMatches: ['d9'] })).toEqual({ directorateId: 'd9', confidence: 'DÜŞÜK', sources: ['GMY'] });
    });
    it('çelişki ve öneri yok durumlarında direktörlük önerilmez', () => {
        expect(suggestDirectorate({ controlDirs: ['d1', 'd2'], findingDirs: [], gmyMatches: [] }).directorateId).toBeNull();
        expect(suggestDirectorate({ controlDirs: ['d1'], findingDirs: ['d2'], gmyMatches: [] }).confidence).toBe('ÇELİŞKİ');
        expect(suggestDirectorate({ controlDirs: [null], findingDirs: [], gmyMatches: [] })).toEqual({ directorateId: null, confidence: 'YOK', sources: [] });
    });
});
