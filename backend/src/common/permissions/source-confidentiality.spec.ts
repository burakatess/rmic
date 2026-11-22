import { allowedConfidentialityLevels, maxConfidentialityFor } from './source-confidentiality';

describe('kaynak gizlilik seviyesi — izinden türetilir', () => {
    it('izin yok → GENEL + DAHİLİ', () => {
        expect(maxConfidentialityFor([])).toBe('INTERNAL');
        expect(maxConfidentialityFor(undefined)).toBe('INTERNAL');
        expect(allowedConfidentialityLevels(['finding:view'])).toEqual(['PUBLIC', 'INTERNAL']);
    });
    it('ai:source:restricted → KISITLI; ai:source:confidential → GİZLİ (kümülatif)', () => {
        expect(allowedConfidentialityLevels(['ai:source:restricted'])).toEqual(['PUBLIC', 'INTERNAL', 'RESTRICTED']);
        expect(allowedConfidentialityLevels(['ai:source:confidential'])).toEqual(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL']);
    });
    it('joker izinler (*, ai:*) tüm seviyeleri açar; ilgisiz joker açmaz', () => {
        expect(maxConfidentialityFor(['*'])).toBe('CONFIDENTIAL');
        expect(maxConfidentialityFor(['ai:*'])).toBe('CONFIDENTIAL');
        expect(maxConfidentialityFor(['control:*', 'report:*'])).toBe('INTERNAL');
    });
});
