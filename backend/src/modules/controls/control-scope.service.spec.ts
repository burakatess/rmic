import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ControlScopeService } from './control-scope.service';
import { PrismaService } from '../../prisma';

describe('ControlScopeService — yıllık kapsam + periyodik task üretimi', () => {
    let service: ControlScopeService;
    let prisma: Record<string, any>;

    const baseControl = {
        id: 'ctl-1', controlId: 'BTK.0001', type: 'BT', frequency: 'MONTHLY', selectedMonths: [], controlDate: null,
        ownerId: 'owner-1', directorateId: null, status: 'ACTIVE',
        name: 'Ağ Erişim Kontrolü', description: 'Test açıklaması', testSteps: '1. Adım', mehaz: 'BDDK', version: 1,
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
        prisma.controlTest.updateMany.mockResolvedValue({ count: 1 });
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

    // ─── Dönem Kontrolü kodu + kontrol sürümü snapshot'ı (madde 4/11/17) ──────
    it('yeni dönem kaydı oluşurken kod "{yıl}.{ana kod}" olarak türetilir ve kontrol tanımı snapshot\'ı donar', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(null);
        prisma.controlYearScope.create.mockResolvedValue({ id: 'scope-1', year: 2027, controlId: 'ctl-1' });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 });

        await service.addScope('ctl-1', { years: [2027] } as any, 'user-1');

        const createData = prisma.controlYearScope.create.mock.calls[0][0].data;
        expect(createData.code).toBe('2027.BTK.0001');
        expect(createData.controlVersion).toBe(1);
        expect(createData.snapshotName).toBe('Ağ Erişim Kontrolü');
        expect(createData.snapshotDescription).toBe('Test açıklaması');
        expect(createData.snapshotTestSteps).toBe('1. Adım');
        expect(createData.snapshotMehaz).toBe('BDDK');
    });

    it('reaktivasyonda (REMOVED→ACTIVE) mevcut kod/snapshot yeniden hesaplanmaz, aynı kayıt kullanılır', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue({
            id: 'scope-1', year: 2027, status: 'REMOVED', code: '2027.BTK.0001', controlVersion: 1,
        });
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', year: 2027 });
        prisma.controlTest.createMany.mockResolvedValue({ count: 0 });

        await service.addScope('ctl-1', { years: [2027] } as any, 'user-1');

        const updateData = prisma.controlYearScope.update.mock.calls[0][0].data;
        expect(updateData.code).toBeUndefined();
        expect(updateData.controlVersion).toBeUndefined();
    });
});

// ─── applyNewVersion — madde 17 üç kademeli koruma ────────────────────────────
describe('ControlScopeService.applyNewVersion', () => {
    let service: ControlScopeService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            controlYearScope: { findUnique: jest.fn(), update: jest.fn() },
            controlTest: { findMany: jest.fn() },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
            $transaction: jest.fn((cb: any) => cb(prisma)),
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlScopeService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get<ControlScopeService>(ControlScopeService);
    });

    afterEach(() => jest.clearAllMocks());

    const scopeAtVersion = (controlVersion: number, liveControlVersion: number) => ({
        id: 'scope-1', status: 'ACTIVE', controlVersion,
        control: { version: liveControlVersion, name: 'Yeni Ad', description: 'Yeni Açıklama', testSteps: 'Yeni Adımlar', mehaz: 'Yeni Mehaz' },
    });

    it('kaynak kontrolde yeni sürüm yoksa (version eşit/düşük) reddeder', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(scopeAtVersion(2, 2));
        await expect(service.applyNewVersion('ctl-1', 2027, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('yalnızca BEKLIYOR/hiç task yoksa açık onay gerekmeden uygular ve snapshot güncellenir', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(scopeAtVersion(1, 2));
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'BEKLIYOR', isAutoGenerated: true },
        ]);
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', controlVersion: 2 });

        const result: any = await service.applyNewVersion('ctl-1', 2027, 'user-1');

        expect(result.requiresDecision).toBeFalsy();
        const updateData = prisma.controlYearScope.update.mock.calls[0][0].data;
        expect(updateData.controlVersion).toBe(2);
        expect(updateData.snapshotName).toBe('Yeni Ad');
    });

    it('devam eden task varsa açık onay olmadan bloklar, scope güncellenmez', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(scopeAtVersion(1, 2));
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'DEVAM_EDIYOR', isAutoGenerated: true, testNo: '2027.BTK.0001.T1' },
        ]);

        const result: any = await service.applyNewVersion('ctl-1', 2027, 'user-1');

        expect(result.requiresDecision).toBe(true);
        expect(result.ongoingTasks).toHaveLength(1);
        expect(prisma.controlYearScope.update).not.toHaveBeenCalled();
    });

    it('devam eden task varken açık onayla (confirmOngoing) uygulanabilir', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(scopeAtVersion(1, 2));
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'DEVAM_EDIYOR', isAutoGenerated: true, testNo: '2027.BTK.0001.T1' },
        ]);
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', controlVersion: 2 });

        const result: any = await service.applyNewVersion('ctl-1', 2027, 'user-1', { confirmOngoing: true });
        expect(result.requiresDecision).toBe(false);
    });

    it('tamamlanmış (ONAYLANDI) task varlığı onay gerektirmez — yalnızca DEVAM_EDIYOR/TAMAMLANDI/GERI_GONDERILDI bloklar', async () => {
        prisma.controlYearScope.findUnique.mockResolvedValue(scopeAtVersion(1, 2));
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', status: 'ONAYLANDI', isAutoGenerated: true },
        ]);
        prisma.controlYearScope.update.mockResolvedValue({ id: 'scope-1', controlVersion: 2 });

        const result: any = await service.applyNewVersion('ctl-1', 2027, 'user-1');
        expect(result.requiresDecision).toBeFalsy();
    });
});

// ─── listPeriodControls — Dönem Kontrolleri ekranı (madde 12/24) ──────────────
describe('ControlScopeService.listPeriodControls', () => {
    let service: ControlScopeService;
    let prisma: Record<string, any>;

    const scopeRow = (overrides: Partial<any> = {}) => ({
        id: 'scope-1', code: '2027.BTK.0042', controlVersion: 1, frequency: 'MONTHLY', referenceMonth: null, selectedMonths: [],
        control: { id: 'ctl-1', controlId: 'BTK.0042', name: 'Kullanıcı Erişim Gözden Geçirme', directorateId: 'dir-1', version: 1 },
        assignee: { id: 'u1', firstName: 'A', lastName: 'B' }, secondController: { id: 'u2', firstName: 'C', lastName: 'D' },
        ...overrides,
    });

    beforeEach(async () => {
        prisma = {
            controlYearScope: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([scopeRow()]) },
            controlTest: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [ControlScopeService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get<ControlScopeService>(ControlScopeService);
    });

    afterEach(() => jest.clearAllMocks());

    it('gecikmiş/onay-bekleyen/bulgulu sayıları doğru hesaplar, iptal/kapsam-dışı testleri hariç tutar', async () => {
        const past = new Date('2020-01-01');
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', scopeId: 'scope-1', status: 'BEKLIYOR', plannedDate: past, findingStatus: null },
            { id: 't2', scopeId: 'scope-1', status: 'TAMAMLANDI', plannedDate: new Date(), findingStatus: null },
            { id: 't3', scopeId: 'scope-1', status: 'ONAYLANDI', plannedDate: new Date(), findingStatus: 'BULGUSU_VAR' },
            { id: 't4', scopeId: 'scope-1', status: 'IPTAL', plannedDate: past, findingStatus: null },
        ]);

        const result = await service.listPeriodControls({ year: 2027 });

        expect(result.data[0].overdueCount).toBe(1); // yalnızca t1 (geçmiş + BEKLIYOR)
        expect(result.data[0].pendingApprovalCount).toBe(1); // t2
        expect(result.data[0].completedTaskCount).toBe(1); // t3
        expect(result.data[0].findingsCount).toBe(1); // t3
        expect(result.data[0].totalTaskCount).toBe(3); // t1,t2,t3 — t4 (IPTAL) hariç
    });

    it('hasNewControlVersion: control.version > controlVersion ise true', async () => {
        prisma.controlYearScope.findMany.mockResolvedValue([
            scopeRow({ controlVersion: 1, control: { id: 'ctl-1', controlId: 'BTK.0042', name: 'X', directorateId: null, version: 2 } }),
        ]);
        const result = await service.listPeriodControls({ year: 2027 });
        expect(result.data[0].hasNewControlVersion).toBe(true);
    });

    it('onlyOverdue filtresi yalnızca gecikmiş dönem kontrollerini bırakır', async () => {
        // Prisma, görev filtresini pagination'dan önce uyguladığı için yalnız eşleşen scope döner.
        prisma.controlYearScope.findMany.mockResolvedValue([scopeRow()]);
        prisma.controlTest.findMany.mockResolvedValue([
            { id: 't1', scopeId: 'scope-1', status: 'BEKLIYOR', plannedDate: new Date('2020-01-01'), findingStatus: null },
        ]);
        const result = await service.listPeriodControls({ year: 2027, onlyOverdue: true });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].scopeId).toBe('scope-1');
        const where = prisma.controlYearScope.findMany.mock.calls[0][0].where;
        expect(where.AND).toContainEqual({ tasks: { some: { status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] }, plannedDate: { lt: expect.any(Date) } } } });
        expect(prisma.controlYearScope.count).toHaveBeenCalledWith({ where });
    });
});
