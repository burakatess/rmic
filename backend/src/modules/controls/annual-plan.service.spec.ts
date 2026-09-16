import { computeWorkload, computeWorkloadByAssignee } from './annual-plan.service';

const row = (frequency: any, overrides: Partial<{ selectedMonths: string[]; controlDate: Date | null }> = {}) => ({
    controlId: Math.random().toString(36),
    frequency,
    selectedMonths: overrides.selectedMonths ?? [],
    controlDate: overrides.controlDate ?? null,
});

describe('computeWorkload — Madde 24 kabul testleri', () => {
    it('Aylık kontrol tam yıl için 12 task üretir', () => {
        const result = computeWorkload([row('MONTHLY')], 2026);
        expect(result.totalTasks).toBe(12);
        expect(result.byMonth.every(c => c === 1)).toBe(true);
    });

    it('3 aylık kontrol 4 task üretir (çeyrek başına bir)', () => {
        const result = computeWorkload([row('QUARTERLY')], 2026);
        expect(result.totalTasks).toBe(4);
    });

    it('6 aylık kontrol 2 task üretir', () => {
        const result = computeWorkload([row('SEMI_ANNUAL')], 2026);
        expect(result.totalTasks).toBe(2);
    });

    it('Yıllık kontrol 1 task üretir', () => {
        const result = computeWorkload([row('ANNUAL')], 2026);
        expect(result.totalTasks).toBe(1);
    });

    it('Madde 24 örneği: 2 aylık + 2 üç aylık + 1 altı aylık + 2 yıllık = 36 task, 7 kontrol', () => {
        const rows = [
            row('MONTHLY'), row('MONTHLY'),
            row('QUARTERLY'), row('QUARTERLY'),
            row('SEMI_ANNUAL'),
            row('ANNUAL'), row('ANNUAL'),
        ];
        const result = computeWorkload(rows, 2026);
        expect(result.controlCount).toBe(7);
        expect(result.totalTasks).toBe(2 * 12 + 2 * 4 + 1 * 2 + 2 * 1); // 24+8+2+2=36
        expect(result.totalTasks).toBe(36);
    });

    it('AD_HOC kesin toplama dahil edilmez, ayrı sayılır', () => {
        const result = computeWorkload([row('MONTHLY'), row('AD_HOC', { controlDate: new Date('2026-05-01') })], 2026);
        expect(result.totalTasks).toBe(12); // yalnızca aylık
        expect(result.adHocCount).toBe(1);
    });

    it('AD_HOC takvimi eksikse missingScheduleCount artar', () => {
        const result = computeWorkload([row('AD_HOC')], 2026);
        expect(result.adHocCount).toBe(1);
        expect(result.missingScheduleCount).toBe(1);
    });

    it('AD_HOC controlDate VEYA selectedMonths varsa eksik sayılmaz', () => {
        const withDate = computeWorkload([row('AD_HOC', { controlDate: new Date('2026-03-01') })], 2026);
        expect(withDate.missingScheduleCount).toBe(0);
        const withMonth = computeWorkload([row('AD_HOC', { selectedMonths: ['Mart'] })], 2026);
        expect(withMonth.missingScheduleCount).toBe(0);
    });

    it('DAILY otomatik task üretmez, ayrı sayılır (dailyExcludedCount)', () => {
        const result = computeWorkload([row('DAILY')], 2026);
        expect(result.totalTasks).toBe(0);
        expect(result.dailyExcludedCount).toBe(1);
    });

    it('Artık yıl doğru işlenir (Şubat 29 gün, ay bazlı dağılım bozulmaz)', () => {
        const result = computeWorkload([row('MONTHLY')], 2028); // 2028 artık yıl
        expect(result.totalTasks).toBe(12);
    });

    it('Boş girdide sıfır/null sonuç döner, çökmez', () => {
        const result = computeWorkload([], 2026);
        expect(result.totalTasks).toBe(0);
        expect(result.controlCount).toBe(0);
        expect(result.peakCount).toBe(0);
        expect(result.peakMonths).toEqual([]);
    });

    it('En yoğun ay(lar) doğru hesaplanır', () => {
        // 2 tane yıllık kontrol (ikisi de Aralık son iş gününde) + 1 aylık (her ay 1)
        const result = computeWorkload([row('ANNUAL'), row('ANNUAL'), row('MONTHLY')], 2026);
        expect(result.peakCount).toBe(3); // Aralık: 2 yıllık + 1 aylık = 3
        expect(result.peakMonths).toEqual([11]); // Aralık = index 11
    });

    it('Kontrol sayısı ile task sayısı ayrı kavramlardır', () => {
        const result = computeWorkload([row('MONTHLY')], 2026);
        expect(result.controlCount).toBe(1);
        expect(result.totalTasks).toBe(12);
        expect(result.controlCount).not.toBe(result.totalTasks);
    });
});

const assigneeRow = (frequency: any, assigneeId: string | null, secondControllerId: string | null, overrides: Partial<{ selectedMonths: string[]; controlDate: Date | null }> = {}) => ({
    controlId: Math.random().toString(36),
    frequency, assigneeId, secondControllerId,
    selectedMonths: overrides.selectedMonths ?? [],
    controlDate: overrides.controlDate ?? null,
});

describe('computeWorkloadByAssignee — Madde 12', () => {
    it('kontrol sayısı ile task sayısını ayrı tutar (aylık kontrol 12 task, 1 kontrol)', () => {
        const result = computeWorkloadByAssignee([assigneeRow('MONTHLY', 'u1', 'u2')], 2026);
        const u1 = result.byAssignee.find(a => a.userId === 'u1')!;
        expect(u1.controlCount).toBe(1);
        expect(u1.taskCount).toBe(12);
    });

    it('aynı task birinci+ikinci kontrolcü nedeniyle toplam task sayısını ikiye katlamaz', () => {
        const result = computeWorkloadByAssignee([assigneeRow('ANNUAL', 'u1', 'u2')], 2026);
        const u1 = result.byAssignee.find(a => a.userId === 'u1')!;
        const u2Review = result.bySecondController.find(a => a.userId === 'u2')!;
        expect(u1.taskCount).toBe(1); // assignee tarafında 1 task
        expect(u2Review.reviewCount).toBe(1); // secondController tarafında 1 inceleme — ayrı sayaç, aynı task değil ikiye katlanmadı
    });

    it('atanmamış kontrol/task ayrı sayılır', () => {
        const result = computeWorkloadByAssignee([assigneeRow('MONTHLY', null, null)], 2026);
        expect(result.unassignedControlCount).toBe(1);
        expect(result.unassignedTaskCount).toBe(12);
        expect(result.byAssignee).toHaveLength(0);
    });

    it('birden fazla kontrolcü için ayrı toplanır, karışmaz', () => {
        const result = computeWorkloadByAssignee([
            assigneeRow('MONTHLY', 'u1', 'u3'),
            assigneeRow('QUARTERLY', 'u2', 'u3'),
        ], 2026);
        expect(result.byAssignee.find(a => a.userId === 'u1')!.taskCount).toBe(12);
        expect(result.byAssignee.find(a => a.userId === 'u2')!.taskCount).toBe(4);
        expect(result.bySecondController.find(a => a.userId === 'u3')!.reviewCount).toBe(16); // 12+4, aynı kişi iki kontrolün incelemesini yapıyor
    });
});
