import { computeMonthGroup, computeScopePeriods, monthNumbersToLabels } from './control-period.util';

describe('computeMonthGroup', () => {
    it('QUARTERLY — tüm 12 referans ayı doğru gruplar üretir', () => {
        const expected: Record<number, number[]> = {
            1: [1, 4, 7, 10], 2: [2, 5, 8, 11], 3: [3, 6, 9, 12],
            4: [1, 4, 7, 10], 5: [2, 5, 8, 11], 6: [3, 6, 9, 12],
            7: [1, 4, 7, 10], 8: [2, 5, 8, 11], 9: [3, 6, 9, 12],
            10: [1, 4, 7, 10], 11: [2, 5, 8, 11], 12: [3, 6, 9, 12],
        };
        for (const [ref, group] of Object.entries(expected)) {
            expect(computeMonthGroup('QUARTERLY', Number(ref))).toEqual(group);
        }
    });

    it('QUARTERLY — spec örnekleri: Mart→{3,6,9,12}, Ağustos→{2,5,8,11}, Ocak→{1,4,7,10}', () => {
        expect(computeMonthGroup('QUARTERLY', 3)).toEqual([3, 6, 9, 12]);
        expect(computeMonthGroup('QUARTERLY', 8)).toEqual([2, 5, 8, 11]);
        expect(computeMonthGroup('QUARTERLY', 1)).toEqual([1, 4, 7, 10]);
    });

    it('SEMI_ANNUAL — spec örnekleri: Şubat→{2,8}, Ekim→{4,10}', () => {
        expect(computeMonthGroup('SEMI_ANNUAL', 2)).toEqual([2, 8]);
        expect(computeMonthGroup('SEMI_ANNUAL', 10)).toEqual([4, 10]);
    });

    it('SEMI_ANNUAL — ref<=6 ise +6, aksi halde -6, her zaman sıralı', () => {
        expect(computeMonthGroup('SEMI_ANNUAL', 1)).toEqual([1, 7]);
        expect(computeMonthGroup('SEMI_ANNUAL', 6)).toEqual([6, 12]);
        expect(computeMonthGroup('SEMI_ANNUAL', 7)).toEqual([1, 7]);
        expect(computeMonthGroup('SEMI_ANNUAL', 12)).toEqual([6, 12]);
    });

    it('ANNUAL — yalnızca referans ayı döner, her ay seçilebilir', () => {
        for (let m = 1; m <= 12; m++) expect(computeMonthGroup('ANNUAL', m)).toEqual([m]);
    });

    it('MONTHLY — referans aydan bağımsız tüm 12 ay', () => {
        expect(computeMonthGroup('MONTHLY', 5)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('geçersiz referenceMonth (0, 13) reddedilir', () => {
        expect(() => computeMonthGroup('QUARTERLY', 0)).toThrow();
        expect(() => computeMonthGroup('QUARTERLY', 13)).toThrow();
    });

    it('DAILY/WEEKLY/AD_HOC referans-ay seçimi kullanmaz — hata fırlatır', () => {
        expect(() => computeMonthGroup('DAILY', 5)).toThrow();
        expect(() => computeMonthGroup('AD_HOC', 5)).toThrow();
    });
});

describe('monthNumbersToLabels', () => {
    it('ay numaralarını Türkçe adlara çevirir', () => {
        expect(monthNumbersToLabels([2, 5, 8, 11])).toEqual(['Şubat', 'Mayıs', 'Ağustos', 'Kasım']);
    });
});

describe('computeScopePeriods — referenceMonth ile genişletme', () => {
    it('QUARTERLY + referenceMonth=8 → M02/M05/M08/M11 periodKey, kronolojik sırada', () => {
        const periods = computeScopePeriods('QUARTERLY', 2026, { referenceMonth: 8 });
        expect(periods.map(p => p.periodKey)).toEqual(['M02', 'M05', 'M08', 'M11']);
        expect(periods).toHaveLength(4);
    });

    it('SEMI_ANNUAL + referenceMonth=10 → M04/M10', () => {
        const periods = computeScopePeriods('SEMI_ANNUAL', 2026, { referenceMonth: 10 });
        expect(periods.map(p => p.periodKey)).toEqual(['M04', 'M10']);
    });

    it('ANNUAL + referenceMonth=6 → tek M06 dönemi (artık Aralık\'a sabit değil)', () => {
        const periods = computeScopePeriods('ANNUAL', 2026, { referenceMonth: 6 });
        expect(periods.map(p => p.periodKey)).toEqual(['M06']);
        expect(periods[0].targetDate.getMonth()).toBe(5); // Haziran (0-indexed)
    });

    it('hedef tarih ayın son iş günü kuralını korur (referenceMonth ile de)', () => {
        const periods = computeScopePeriods('QUARTERLY', 2026, { referenceMonth: 3 });
        const marPeriod = periods.find(p => p.periodKey === 'M03')!;
        expect(marPeriod.targetDate.getFullYear()).toBe(2026);
        expect(marPeriod.targetDate.getMonth()).toBe(2); // Mart
        expect(marPeriod.targetDate.getDate()).toBeGreaterThanOrEqual(27); // ayın son günlerinde
    });

    it('GERİYE DÖNÜK UYUMLULUK: referenceMonth verilmezse QUARTERLY eski sabit takvimi (Q1-Q4) kullanır', () => {
        const periods = computeScopePeriods('QUARTERLY', 2026, {});
        expect(periods.map(p => p.periodKey)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });

    it('GERİYE DÖNÜK UYUMLULUK: referenceMonth verilmezse SEMI_ANNUAL eski H1/H2 kullanır', () => {
        const periods = computeScopePeriods('SEMI_ANNUAL', 2026, {});
        expect(periods.map(p => p.periodKey)).toEqual(['H1', 'H2']);
    });

    it('GERİYE DÖNÜK UYUMLULUK: referenceMonth verilmezse ANNUAL eski YEAR (Aralık hedef) kullanır', () => {
        const periods = computeScopePeriods('ANNUAL', 2026, {});
        expect(periods.map(p => p.periodKey)).toEqual(['YEAR']);
        expect(periods[0].targetDate.getMonth()).toBe(11); // Aralık
    });

    it('MONTHLY, WEEKLY, DAILY, AD_HOC referenceMonth verilse bile etkilenmez', () => {
        const monthly = computeScopePeriods('MONTHLY', 2026, { referenceMonth: 5 });
        expect(monthly).toHaveLength(12);
        expect(monthly.map(p => p.periodKey)[0]).toBe('M01');

        const daily = computeScopePeriods('DAILY', 2026, { referenceMonth: 5 });
        expect(daily).toEqual([]);

        const adhoc = computeScopePeriods('AD_HOC', 2026, { referenceMonth: 5, controlDate: new Date(2026, 3, 15) });
        expect(adhoc[0].periodKey).toBe('ADHOC');
        expect(adhoc[0].targetDate).toEqual(new Date(2026, 3, 15));
    });
});
