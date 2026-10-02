import { computePeriodCode } from './period-code.util';

describe('computePeriodCode', () => {
    it('"{yıl}.{ana kontrol kodu}" formatında Dönem Kontrolü kodu üretir', () => {
        expect(computePeriodCode('BTK.0042', 2027)).toBe('2027.BTK.0042');
    });

    it('farklı yıllar için farklı, bağımsız kod üretir (aynı ana kontrol)', () => {
        expect(computePeriodCode('BTK.0042', 2026)).toBe('2026.BTK.0042');
        expect(computePeriodCode('BTK.0042', 2027)).toBe('2027.BTK.0042');
        expect(computePeriodCode('BTK.0042', 2026)).not.toBe(computePeriodCode('BTK.0042', 2027));
    });
});
