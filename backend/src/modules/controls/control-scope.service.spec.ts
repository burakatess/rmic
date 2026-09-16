import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ControlScopeService } from './control-scope.service';
import { PrismaService } from '../../prisma';

describe('ControlScopeService — yıllık kapsam + periyodik task üretimi', () => {
    let service: ControlScopeService;
    let prisma: Record<string, any>;

    const baseControl = {
        id: 'ctl-1', controlId: 'BTK-0001', type: 'BT', frequency: 'MONTHLY', selectedMonths: [], controlDate: null,
        ownerId: 'owner-1', directorateId: null, status: 'ACTIVE',
    };

    beforeEach(async () => {
        let counter = 0;
        prisma = {
            control: { findUnique: jest.fn().mockResolvedValue(baseControl) },
            controlYearScope: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            controlTest: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
            auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn().mockResolvedValue({ isActive: true, role: { permissions: ['control:*'] } }) },
            // nextTestCode/nextCounterValue'nun kullandığı atomik sayaç RPC'sinin mock'u.
            $queryRawUnsafe: jest.fn().mockImplementation(() => Promise.resolve([{ value: ++counter }])),
            $transaction: jest.fn((cb: any) => cb(prisma)),
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlScopeService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get<ControlScopeService>(ControlScopeService);
    });

    afterEach(() => jest.clearAllMocks());

    // Kabul senaryosu 2: aylık kontrol tam yıl kapsamına alındığında 12 task oluşur.
    it('MONTHLY kontrol geçmiş olmayan bir yıla alınınca 12 dönem üretir', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.controlYearScope.create.mockResolvedValue({ id: 'scope-1', year: 2030, controlId: 'ctl-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 12 });

        const result = await service.addScope('ctl-1', { years: [2030] } as any, 'user-1');

        expect(result.results[0].tasksCreated).toBe(12);
        const rows = prisma.controlTest.createMany.mock.calls[0][0].data;
        expect(rows).toHaveLength(12);
        expect(new Set(rows.map((r: any) => r.periodKey)).size).toBe(12); // her ay tekil
        expect(prisma.controlTest.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    });

    // Kabul senaryosu 3: aynı istek tekrar/eşzamanlı çalıştırıldığında task sayısı artmaz.
    it('kapsam zaten ACTIVE ise SCOPE_ADD_NOOP döner ve mevcut task\'lar tekrar oluşturulmaz (skipDuplicates)', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({ id: 'scope-1', year: 2030, status: 'ACTIVE', controlId: 'ctl-1', frequency: 'MONTHLY' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 }); // DB unique kısıtı sayesinde hepsi skip edildi

        const result = await service.addScope('ctl-1', { years: [2030] } as any, 'user-1');

        expect(result.results[0].action).toBe('SCOPE_ADD_NOOP');
        expect(result.results[0].tasksCreated).toBe(0);
        expect(prisma.controlYearScope.create).not.toHaveBeenCalled();
    });

    it('pasif kontrol yeni bir yıl kapsamına alınamaz', async () => {
        prisma.control.findUnique.mockResolvedValue({ ...baseControl, status: 'PASSIVE' });
        await expect(service.addScope('ctl-1', { years: [2030] } as any, 'user-1')).rejects.toThrow(BadRequestException);
        expect(prisma.controlYearScope.create).not.toHaveBeenCalled();
    });

    it('dryRun=true hiçbir yazma yapmadan periyot/önizleme döner', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        const result = await service.addScope('ctl-1', { years: [2030], dryRun: true } as any, 'user-1');

        expect(result.results[0].newTaskCount).toBe(12);
        expect(prisma.controlYearScope.create).not.toHaveBeenCalled();
        expect(prisma.controlTest.createMany).not.toHaveBeenCalled();
    });

    // Kabul senaryosu 4/5: kapsamdan çıkarma başka yılları/tamamlanmış işleri etkilemez.
    it('devam eden (DEVAM_EDIYOR) task varken karar verilmeden kapsam kaldırılamaz', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({ id: 'scope-1', year: 2026, status: 'ACTIVE', controlId: 'ctl-1' });
        prisma.controlTest.findMany.mockResolvedValue([{ id: 'task-1', testNo: 'TST-2026-0001', periodLabel: 'Ocak 2026', assigneeId: 'u-1', plannedDate: new Date() }]);

        const result = await service.removeScope('ctl-1', 2026, { reason: 'gerekçe' } as any, 'user-1');

        expect(result.requiresDecision).toBe(true);
        expect(result.ongoingTasks).toHaveLength(1);
        expect(prisma.controlYearScope.update).not.toHaveBeenCalled();
    });

    it('kapsam kaldırma: BEKLIYOR tasklar otomatik KAPSAM_DISI, tamamlanmış/onaylı hiç sorgulanmaz', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({ id: 'scope-1', year: 2026, status: 'ACTIVE', controlId: 'ctl-1' });
        prisma.controlTest.findMany.mockResolvedValue([]); // devam eden yok
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', status: 'REMOVED' });

        const result = await service.removeScope('ctl-1', 2026, { reason: 'gerekçe' } as any, 'user-1');

        expect(result.requiresDecision).toBe(false);
        expect(prisma.controlTest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { scopeId: 'scope-1', status: 'BEKLIYOR' },
            data: expect.objectContaining({ status: 'KAPSAM_DISI' }),
        }));
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'SCOPE_REMOVE', entityType: 'ControlYearScope' }),
        }));
    });

    it('zaten kaldırılmış kapsam tekrar kaldırılamaz', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({ id: 'scope-1', year: 2026, status: 'REMOVED' });
        await expect(service.removeScope('ctl-1', 2026, { reason: 'x' } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    // Kabul senaryosu 7: periyodiklik değişikliği geçmiş değerlendirmeleri değiştirmez.
    it('periyodiklik değişikliği yalnızca BEKLIYOR taskları etkiler, tamamlanmış/devam eden korunur', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({
            id: 'scope-1', year: 2027, status: 'ACTIVE', controlId: 'ctl-1', frequency: 'MONTHLY', selectedMonths: [], controlDate: null,
            control: { ...baseControl },
        });
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't-bekliyor', status: 'BEKLIYOR', periodKey: 'M05' },
            { id: 't-onaylandi', status: 'ONAYLANDI', periodKey: 'M06' }, // Q2'de kalıyor olsa da dokunulmaz
            { id: 't-devam', status: 'DEVAM_EDIYOR', periodKey: 'M11' },
        ]);
        prisma.controlTest.createMany.mockResolvedValue({ count: 4 });
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', frequency: 'QUARTERLY' });

        const result: any = await service.changePeriodicity('ctl-1', 2027, { frequency: 'QUARTERLY', reason: 'yeniden planlama' } as any, 'user-1');

        // Yalnızca BEKLIYOR olan t-bekliyor iptal adayı olabilir (periyodu yeni sette yoksa)
        const updateManyCall = prisma.controlTest.updateMany.mock.calls[0][0];
        expect(updateManyCall.where.id.in).toEqual(['t-bekliyor']);
        expect(updateManyCall.data.status).toBe('KAPSAM_DISI');
        expect(result.cancelled).toBe(1);
    });

    it('yalnızca kapsam dışı (KAPSAM_DISI) tasklar yeniden etkinleştirilebilir', async () => {
        prisma.controlTest.findUnique.mockResolvedValue({ id: 't-1', status: 'BEKLIYOR' });
        await expect(service.reactivateTask('t-1', 'user-1')).rejects.toThrow(BadRequestException);

        prisma.controlTest.findUnique.mockResolvedValue({ id: 't-1', status: 'KAPSAM_DISI' });
        prisma.controlTest.update.mockResolvedValue({ id: 't-1', status: 'BEKLIYOR' });
        const updated = await service.reactivateTask('t-1', 'user-1');
        expect(updated.status).toBe('BEKLIYOR');
    });

    it('olmayan kontrol için kapsam kaldırma NotFoundException fırlatır', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        await expect(service.removeScope('yok', 2026, { reason: 'x' } as any, 'user-1')).rejects.toThrow(NotFoundException);
    });

    // ─── Referans-ay seçimi (madde 6) ─────────────────────────────────────────
    it('referenceMonth verilince QUARTERLY için M02/M05/M08/M11 periodKey üretir (Ağustos referansı)', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.controlYearScope.create.mockResolvedValue({ id: 'scope-1', year: 2030, controlId: 'ctl-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 4 });

        await service.addScope('ctl-1', { years: [2030], frequency: 'QUARTERLY', referenceMonth: 8 } as any, 'user-1');

        const createData = prisma.controlYearScope.create.mock.calls[0][0].data;
        expect(createData.referenceMonth).toBe(8);
        expect(createData.selectedMonths).toEqual(['Şubat', 'Mayıs', 'Ağustos', 'Kasım']);
        const rows = prisma.controlTest.createMany.mock.calls[0][0].data;
        expect(rows.map((r: any) => r.periodKey)).toEqual(['M02', 'M05', 'M08', 'M11']);
    });

    // ─── Kontrolcü atama doğrulaması (madde 10) ───────────────────────────────
    it('aynı kişi atanan kontrolcü ve ikinci kontrolcü olarak reddedilir', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        await expect(service.addScope('ctl-1', {
            years: [2030], assigneeId: 'user-a', secondControllerId: 'user-a',
        } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('pasif kullanıcı yeni atama alamaz', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValueOnce({ isActive: false, role: { permissions: ['control:*'] } });
        await expect(service.addScope('ctl-1', {
            years: [2030], assigneeId: 'user-inactive',
        } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('yetkisiz (control izni olmayan) kullanıcı ikinci kontrolcü olarak reddedilir', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.user.findUnique
            .mockResolvedValueOnce({ isActive: true, role: { permissions: ['control:*'] } }) // assignee ok
            .mockResolvedValueOnce({ isActive: true, role: { permissions: ['risk:view'] } }); // secondController not eligible
        await expect(service.addScope('ctl-1', {
            years: [2030], assigneeId: 'user-a', secondControllerId: 'user-b',
        } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('geçerli, farklı, aktif kullanıcı çifti kabul edilir ve scope\'a yazılır', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.controlYearScope.create.mockResolvedValue({ id: 'scope-1', year: 2030, controlId: 'ctl-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 });

        await service.addScope('ctl-1', { years: [2030], assigneeId: 'user-a', secondControllerId: 'user-b' } as any, 'user-1');

        const createData = prisma.controlYearScope.create.mock.calls[0][0].data;
        expect(createData.assigneeId).toBe('user-a');
        expect(createData.secondControllerId).toBe('user-b');
    });

    // ─── Atama değişikliğinde task koruma (madde 14/17) ───────────────────────
    it('atama değişikliği BEKLIYOR task\'ları serbestçe günceller', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({
            id: 'scope-1', year: 2027, status: 'ACTIVE', controlId: 'ctl-1', frequency: 'MONTHLY', selectedMonths: [],
            controlDate: null, referenceMonth: null, assigneeId: 'user-old', secondControllerId: null,
            control: { ...baseControl },
        });
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'BEKLIYOR', periodKey: 'M01', isAutoGenerated: true, assigneeId: 'user-old', secondControllerId: null },
        ]);
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 });

        const result: any = await service.changePeriodicity('ctl-1', 2027, {
            reason: 'atama güncelleme', assigneeId: 'user-new',
        } as any, 'user-1');

        expect(result.requiresAssignmentDecision).toBeFalsy();
        const assignUpdateCall = prisma.controlTest.updateMany.mock.calls.find(
            (c: any) => c[0].data.assigneeId === 'user-new',
        );
        expect(assignUpdateCall[0].where.id.in).toEqual(['t1']);
    });

    it('devam eden task\'ta atama değişikliği kararsız bırakılırsa uygulanmadan bloke eder', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({
            id: 'scope-1', year: 2027, status: 'ACTIVE', controlId: 'ctl-1', frequency: 'MONTHLY', selectedMonths: [],
            controlDate: null, referenceMonth: null, assigneeId: 'user-old', secondControllerId: null,
            control: { ...baseControl },
        });
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'DEVAM_EDIYOR', periodKey: 'M01', isAutoGenerated: true, assigneeId: 'user-old', secondControllerId: null },
        ]);

        const result: any = await service.changePeriodicity('ctl-1', 2027, {
            reason: 'atama güncelleme', assigneeId: 'user-new',
        } as any, 'user-1');

        expect(result.requiresAssignmentDecision).toBe(true);
        expect(result.tasks[0].id).toBe('t1');
        expect(prisma.controlYearScope.update).not.toHaveBeenCalled();
    });

    it('tamamlanmış (ONAYLANDI) task atama değişikliğinde asla dokunulmaz', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({
            id: 'scope-1', year: 2027, status: 'ACTIVE', controlId: 'ctl-1', frequency: 'MONTHLY', selectedMonths: [],
            controlDate: null, referenceMonth: null, assigneeId: 'user-old', secondControllerId: null,
            control: { ...baseControl },
        });
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'ONAYLANDI', periodKey: 'M01', isAutoGenerated: true, assigneeId: 'user-old', secondControllerId: null },
        ]);
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 });

        await service.changePeriodicity('ctl-1', 2027, { reason: 'atama güncelleme', assigneeId: 'user-new' } as any, 'user-1');

        const anyAssignUpdate = prisma.controlTest.updateMany.mock.calls.some(
            (c: any) => c[0].where.id?.in?.includes('t1'),
        );
        expect(anyAssignUpdate).toBe(false);
    });
});
