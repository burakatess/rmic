import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditsService } from './audits.service';
import { PrismaService } from '../../prisma';

describe('AuditsService — kritik iş kuralları', () => {
    let service: AuditsService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            finding: { findUnique: jest.fn(), update: jest.fn() },
            findingStatusHistory: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            findingStatusLog: { create: jest.fn() },
            auditLog: { create: jest.fn() },
            action: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
            findingFollowUp: {
                findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(), updateMany: jest.fn(),
            },
            user: { findUnique: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
            $queryRawUnsafe: jest.fn().mockResolvedValue([{ value: 1 }]),
        };
        // $transaction — callback'i aynı mock istemcisiyle çalıştır (tx === prisma).
        prisma.$transaction = jest.fn((arg: any) =>
            typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
        );

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<AuditsService>(AuditsService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('generateDueFollowUps', () => {
        it('kapalı veya iptal bulguları atlar; tamamlanmış aksiyonu açık takip yoksa doğrulamaya alır', async () => {
            prisma.action.findMany.mockResolvedValue([]);

            await service.generateDueFollowUps('manual');

            expect(prisma.action.findMany).toHaveBeenCalledWith({
                where: {
                    dueDate: { lte: expect.any(Date) },
                    status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ', 'TAMAMLANDI', 'COMPLETED'] },
                    finding: {
                        status: { not: 'CLOSED' },
                        workflowStatus: { not: 'IPTAL' },
                    },
                    followUps: { none: { status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] } } },
                },
                select: { id: true, findingId: true, dueDate: true, status: true },
            });
        });

        it('TAMAMLANDI aksiyon için doğrulama takibi üretirken aksiyon durumunu geri almaz', async () => {
            const dueDate = new Date('2026-01-01');
            prisma.action.findMany.mockResolvedValue([{ id: 'a-1', findingId: 'f-1', dueDate, status: 'TAMAMLANDI' }]);
            prisma.findingFollowUp.findFirst.mockResolvedValue(null);
            prisma.findingFollowUp.create.mockResolvedValue({ id: 'fu-1' });

            const result = await service.generateDueFollowUps('manual');

            expect(result.generatedCount).toBe(1);
            expect(prisma.findingFollowUp.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ findingId: 'f-1', actionId: 'a-1', status: 'BEKLIYOR' }),
            });
            expect(prisma.action.update).not.toHaveBeenCalled();
        });
    });

    // ─── Mutabakat Workflow Geçişleri ──────────────────────────────────────

    describe('mutabakataGonder', () => {
        it('TASLAK statüsündeki bulguyu MUTABAKATA_GONDERILDI\'ye geçirir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'TASLAK' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKATA_GONDERILDI' });

            const result = await service.mutabakataGonder('f-1', 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKATA_GONDERILDI');
            expect(prisma.finding.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { workflowStatus: 'MUTABAKATA_GONDERILDI' } }),
            );
        });

        it('TASLAK dışındaki statüden geçişe izin vermez', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKAT_YAPILDI' });

            await expect(service.mutabakataGonder('f-1', 'user-1')).rejects.toThrow(BadRequestException);
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('bulgu bulunamazsa NotFoundException fırlatır', async () => {
            prisma.finding.findUnique.mockResolvedValue(null);

            await expect(service.mutabakataGonder('f-x', 'user-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('icKontrolOnayinaGonder', () => {
        it('MUTABAKATA_GONDERILDI statüsünde birim cevabını kaydedip geçiş yapar', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });

            await service.icKontrolOnayinaGonder('f-1', 'Birim cevabı metni', '2026-12-01', 'user-1');

            // İlk update çağrısı birim cevabını + hedef tarihi yazar
            expect(prisma.finding.update).toHaveBeenNthCalledWith(1,
                expect.objectContaining({
                    data: expect.objectContaining({ birimCevabi: 'Birim cevabı metni', targetResolutionDate: new Date('2026-12-01') }),
                }),
            );
        });

        it('yanlış statüden çağrılırsa reddeder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'TASLAK' });

            await expect(
                service.icKontrolOnayinaGonder('f-1', 'cevap', undefined, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('mutabakatOnayla', () => {
        it('IC_KONTROL_ONAYINA_GONDERILDI statüsünde onaylar ve KAPATILDI ise closedDate set eder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKAT_YAPILDI' });

            await service.mutabakatOnayla('f-1', { resolutionStatus: 'KAPATILDI' }, 'user-1');

            expect(prisma.finding.update).toHaveBeenNthCalledWith(1,
                expect.objectContaining({
                    data: expect.objectContaining({ resolutionStatus: 'KAPATILDI', closedDate: expect.any(Date) }),
                }),
            );
        });

        it('yanlış statüden çağrılırsa reddeder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'TASLAK' });

            await expect(
                service.mutabakatOnayla('f-1', {}, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('mutabakatı İç Kontrol onayına GÖNDEREN kişi kendi mutabakatını onaylayamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.findingStatusHistory.findFirst.mockResolvedValue({ evaluator: 'user-1' });

            await expect(
                service.mutabakatOnayla('f-1', {}, 'user-1'),
            ).rejects.toThrow(ForbiddenException);
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('gönderen BAŞKA bir kullanıcıysa onay sorunsuz ilerler', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKAT_YAPILDI' });
            prisma.findingStatusHistory.findFirst.mockResolvedValue({ evaluator: 'other-user' });

            const result = await service.mutabakatOnayla('f-1', {}, 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKAT_YAPILDI');
        });
    });

    describe('mutabakatGeriGonder', () => {
        it('IC_KONTROL_ONAYINA_GONDERILDI\'den MUTABAKATA_GONDERILDI\'ye geri gönderir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKATA_GONDERILDI' });

            const result = await service.mutabakatGeriGonder('f-1', 'Yetersiz kanıt', 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKATA_GONDERILDI');
        });

        it('yanlış statüden çağrılırsa reddeder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKAT_YAPILDI' });

            await expect(
                service.mutabakatGeriGonder('f-1', 'sebep', 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('iptalEt', () => {
        it('herhangi bir statüden IPTAL\'e geçirir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.finding.update.mockResolvedValue({ id: 'f-1', workflowStatus: 'IPTAL' });

            const result = await service.iptalEt('f-1', 'Hatalı bulgu', 'user-1');

            expect(result.workflowStatus).toBe('IPTAL');
        });

        it('zaten IPTAL olan bulguyu tekrar iptal etmeye izin vermez', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IPTAL' });

            await expect(service.iptalEt('f-1', 'sebep', 'user-1')).rejects.toThrow(BadRequestException);
        });
    });

    // ─── recalculateFindingTargetDate ──────────────────────────────────────

    describe('recalculateFindingTargetDate', () => {
        it('açık aksiyonlar varsa en geç dueDate\'i hedef tarih olarak yazar', async () => {
            prisma.action.findMany.mockResolvedValueOnce([
                { dueDate: new Date('2026-01-10') },
                { dueDate: new Date('2026-03-05') },
            ]);

            await service.recalculateFindingTargetDate('f-1');

            expect(prisma.finding.update).toHaveBeenCalledWith({
                where: { id: 'f-1' },
                data: { targetResolutionDate: new Date('2026-03-05') },
            });
        });

        it('açık aksiyon yoksa (hepsi kapalı), tüm aksiyonların en geç tarihine düşer', async () => {
            prisma.action.findMany
                .mockResolvedValueOnce([]) // açık aksiyon yok
                .mockResolvedValueOnce([{ dueDate: new Date('2025-06-01') }, { dueDate: new Date('2025-08-01') }]);

            await service.recalculateFindingTargetDate('f-1');

            expect(prisma.finding.update).toHaveBeenCalledWith({
                where: { id: 'f-1' },
                data: { targetResolutionDate: new Date('2025-08-01') },
            });
        });

        it('hiç aksiyon yoksa eski hedef tarihi temizler', async () => {
            prisma.action.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

            await service.recalculateFindingTargetDate('f-1');

            expect(prisma.finding.update).toHaveBeenCalledWith({
                where: { id: 'f-1' },
                data: { targetResolutionDate: null },
            });
        });
    });

    // ─── checkAndCloseFindinIfAllActionsClosed ─────────────────────────────

    describe('checkAndCloseFindinIfAllActionsClosed', () => {
        it('tüm aksiyonlar KAPATILDI ise bulguyu CLOSED yapar', async () => {
            prisma.action.findMany.mockResolvedValue([{ status: 'KAPATILDI' }, { status: 'KAPATILDI' }]);
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1' });
            prisma.finding.update.mockResolvedValue({});
            prisma.findingStatusHistory.create.mockResolvedValue({});

            await service.checkAndCloseFindinIfAllActionsClosed('f-1', 'user-1');

            expect(prisma.finding.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
            );
            expect(prisma.findingFollowUp.updateMany).toHaveBeenCalledWith({
                where: { findingId: 'f-1', status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI'] } },
                data: { status: 'IPTAL' },
            });
        });

        it('en az bir aksiyon kapalı ve biri açık ise bulguyu kısmen kapatır', async () => {
            prisma.action.findMany.mockResolvedValue([{ status: 'KAPATILDI' }, { status: 'DEVAM_EDIYOR' }]);
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1' });
            prisma.finding.update.mockResolvedValue({});
            prisma.findingStatusHistory.create.mockResolvedValue({});

            await service.checkAndCloseFindinIfAllActionsClosed('f-1', 'user-1');

            expect(prisma.finding.update).toHaveBeenCalledWith({
                where: { id: 'f-1' },
                data: { status: 'PARTIALLY_CLOSED', resolutionStatus: 'KISMEN_KAPATILDI', closedDate: null },
            });
        });

        it('hiç aksiyon yoksa bulguyu kapatmaz (boş liste = "tüm aksiyonlar kapalı" sayılmaz)', async () => {
            prisma.action.findMany.mockResolvedValue([]);

            await service.checkAndCloseFindinIfAllActionsClosed('f-1', 'user-1');

            expect(prisma.finding.update).not.toHaveBeenCalled();
        });
    });

    // ─── updateFollowUp: YENI_AKSIYON_GEREKLI / ERTELENDI doğrulaması ──────

    describe('updateFollowUp — iş kuralı doğrulamaları', () => {
        const baseFollowUp = { id: 'fu-1', findingId: 'f-1' };

        it('YENI_AKSIYON_GEREKLI seçilip newAction eksikse reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };

            await expect(
                service.updateFollowUp('f-1', 'fu-1', { result: 'YENI_AKSIYON_GEREKLI' }, 'user-1'),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.findingFollowUp.update).not.toHaveBeenCalled();
        });

        it('YENI_AKSIYON_GEREKLI seçilip newAction.ownerId geçersiz bir kullanıcıysa reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.updateFollowUp('f-1', 'fu-1', {
                    result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'Yeni aksiyon', ownerId: 'no-such-user', dueDate: '2026-12-01' },
                }, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('ERTELENDI seçilip newFollowUpDate verilmezse reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };

            await expect(
                service.updateFollowUp('f-1', 'fu-1', { resolutionOutcome: 'ERTELENDI' }, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('takip çalışması bulunamazsa NotFoundException fırlatır', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() };

            await expect(
                service.updateFollowUp('f-1', 'fu-x', {}, 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });
    });

    // ─── Generic update ile workflow atlatma engeli (Madde 3) ─────────────
    describe('updateFinding — durum geçişi genel PUT ile yapılamaz', () => {
        beforeEach(() => {
            prisma.finding = { ...prisma.finding, update: jest.fn().mockResolvedValue({ id: 'f-1' }) };
        });

        it.each(['workflowStatus', 'resolutionStatus', 'closedDate'])(
            '%s alanı genel güncellemede reddedilir',
            async (field) => {
                await expect(
                    service.updateFinding('f-1', { [field]: field === 'closedDate' ? '2026-01-01' : 'KAPATILDI' }, 'u-1'),
                ).rejects.toThrow(BadRequestException);
                expect(prisma.finding.update).not.toHaveBeenCalled();
            },
        );

        it('status=CLOSED genel güncellemede reddedilir', async () => {
            await expect(
                service.updateFinding('f-1', { status: 'CLOSED' }, 'u-1'),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('ara statü (IN_PROGRESS) genel güncellemeden geçebilir', async () => {
            await service.updateFinding('f-1', { status: 'IN_PROGRESS', summary: 'x' }, 'u-1');
            const data = prisma.finding.update.mock.calls[0][0].data;
            expect(data.status).toBe('IN_PROGRESS');
        });
    });

    // ─── Onaylı kapanış / yeniden açma (Madde 3) ──────────────────────────
    describe('closeFinding / reopenFinding', () => {
        beforeEach(() => {
            prisma.finding = { ...prisma.finding, findUnique: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'f-1' }) };
            prisma.findingStatusHistory = { create: jest.fn().mockResolvedValue({}) };
        });

        it('sıfır aksiyonlu bulgu kapatılamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'IN_PROGRESS', actions: [] });
            await expect(service.closeFinding('f-1', 'gerekçe', 'u-1')).rejects.toThrow(BadRequestException);
        });

        it('aksiyon yalnızca TAMAMLANDI ise (KAPATILDI değil) bulgu kapatılamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({
                id: 'f-1', status: 'IN_PROGRESS', actions: [{ status: 'TAMAMLANDI' }, { status: 'KAPATILDI' }],
            });
            await expect(service.closeFinding('f-1', 'gerekçe', 'u-1')).rejects.toThrow(BadRequestException);
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('gerekçe yoksa kapatılamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'IN_PROGRESS', actions: [{ status: 'KAPATILDI' }] });
            await expect(service.closeFinding('f-1', '  ', 'u-1')).rejects.toThrow(BadRequestException);
        });

        it('tüm aksiyonlar KAPATILDI + gerekçe → CLOSED, closedDate sunucuda üretilir', async () => {
            prisma.finding.findUnique.mockResolvedValue({
                id: 'f-1', status: 'IN_PROGRESS', actions: [{ status: 'KAPATILDI' }, { status: 'CLOSED' }],
            });
            await service.closeFinding('f-1', 'tüm aksiyonlar tamam', 'u-1');
            const data = prisma.finding.update.mock.calls[0][0].data;
            expect(data.status).toBe('CLOSED');
            expect(data.closedDate).toBeInstanceOf(Date);
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ action: 'CLOSE', entityType: 'Finding' }) }),
            );
        });

        it('kapalı olmayan bulgu yeniden açılamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'IN_PROGRESS' });
            await expect(service.reopenFinding('f-1', 'gerekçe', 'u-1')).rejects.toThrow(BadRequestException);
        });

        it('kapalı bulgu gerekçeyle yeniden açılır → IN_PROGRESS, closedDate temizlenir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'CLOSED' });
            await service.reopenFinding('f-1', 'yeni kanıt geldi', 'u-1');
            const data = prisma.finding.update.mock.calls[0][0].data;
            expect(data.status).toBe('IN_PROGRESS');
            expect(data.closedDate).toBeNull();
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ action: 'REOPEN' }) }),
            );
        });
    });

    // ─── Takip onayı ve ilişki bütünlüğü (Madde 3/5/6) ────────────────────
    describe('updateFollowUp — onay bütünlüğü', () => {
        // Onaya hazır bir takip: değerlendirilmiş (result YETERLI), ikinci kontrolcü atanmış.
        const readyFollowUp = (over: Record<string, unknown> = {}) => ({
            id: 'fu-1', findingId: 'f-1', actionId: null,
            evaluatorId: 'evaluator-x', result: 'YETERLI',
            approvalStatus: 'BEKLIYOR', status: 'TAMAMLANDI',
            secondControllerId: 'second-ctrl', ...over,
        });

        beforeEach(() => {
            prisma.action = { ...prisma.action, findUnique: jest.fn(), update: jest.fn() };
            prisma.findingFollowUp = {
                findFirst: jest.fn(),
                findUnique: jest.fn().mockResolvedValue({ id: 'fu-1', status: 'ONAYLANDI' }),
                update: jest.fn().mockResolvedValue({ id: 'fu-1', actionId: null, result: 'YETERLI' }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                create: jest.fn(),
            };
        });

        it('başka bulguya ait aksiyon takip kaydına bağlanamaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp());
            prisma.action.findUnique.mockResolvedValue({ id: 'a-9', findingId: 'BASKA-BULGU' });
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { actionId: 'a-9' }, 'user-1', 'AUDITOR'),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.findingFollowUp.update).not.toHaveBeenCalled();
        });

        it('kullanıcı kendi değerlendirmesini onaylayamaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ evaluatorId: 'second-ctrl' }));
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN'),
            ).rejects.toThrow(ForbiddenException);
            expect(prisma.findingFollowUp.updateMany).not.toHaveBeenCalled();
        });

        it('atanmış ikinci kontrolcü DIŞINDA biri (admin dahil) onaylayamaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp());
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'admin-user', 'SYSTEM_ADMIN'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('ikinci kontrolcü atanmamışsa onay engellenir', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ secondControllerId: null }));
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'anyone', 'SYSTEM_ADMIN'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('onay izni/rolü olmayan kullanıcı onaylayamaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ secondControllerId: 'aud-user' }));
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'aud-user', 'AUDITOR'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('değerlendirme sonucu yokken onay reddedilir', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ result: null, status: 'DEVAM_EDIYOR', secondControllerId: 'second-ctrl' }),
            );
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN'),
            ).rejects.toThrow(BadRequestException);
        });

        it('geçerli onay: onaylayan/zaman SUNUCU tarafından atomik claim ile yazılır', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ evaluatorId: 'evaluator-x' }));
            await service.updateFollowUp(
                'f-1', 'fu-1',
                { status: 'ONAYLANDI', approvedBy: 'attacker', approvedAt: '2000-01-01' },
                'second-ctrl', 'RISK_CONTROL_MANAGER',
            );
            const claim = prisma.findingFollowUp.updateMany.mock.calls[0][0];
            expect(claim.where).toEqual(
                expect.objectContaining({ NOT: { OR: [{ status: 'ONAYLANDI' }, { approvalStatus: 'ONAYLANDI' }] } }),
            );
            expect(claim.data.approvedBy).toBe('second-ctrl');
            expect(claim.data.approvedAt).toBeInstanceOf(Date);
        });

        it('atomik claim kaybedilirse (count=0) aksiyon yan etkisi çalışmaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ actionId: 'a-1' }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: 'a-1', result: 'YETERLI' });
            prisma.findingFollowUp.updateMany.mockResolvedValue({ count: 0 });
            await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');
            expect(prisma.action.update).not.toHaveBeenCalled();
        });

        it('atomik claim kazanılırsa (count=1) aksiyon KAPATILDI olur', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ actionId: 'a-1' }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: 'a-1', result: 'YETERLI' });
            prisma.findingFollowUp.updateMany.mockResolvedValue({ count: 1 });
            prisma.action = {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({}),
                findMany: jest.fn().mockResolvedValue([{ status: 'KAPATILDI' }]),
            };
            prisma.finding.update.mockResolvedValue({});
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1' });
            await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');
            expect(prisma.action.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'a-1' }, data: expect.objectContaining({ status: 'KAPATILDI' }) }),
            );
        });

        it('zaten ONAYLANDI olan takibe tekrar onay yan etki üretmez', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ actionId: 'a-1', approvalStatus: 'ONAYLANDI', status: 'ONAYLANDI' }),
            );
            await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');
            expect(prisma.findingFollowUp.updateMany).not.toHaveBeenCalled();
            expect(prisma.action.update).not.toHaveBeenCalled();
        });

        it('evaluatorId istemci alanı yok sayılır; değerlendiren = oturum sahibi', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ evaluatorId: null, result: null, status: 'DEVAM_EDIYOR' }),
            );
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: null, result: 'YETERSIZ' });
            await service.updateFollowUp('f-1', 'fu-1', { result: 'YETERSIZ', evaluatorId: 'fake' }, 'user-9', 'AUDITOR');
            const data = prisma.findingFollowUp.update.mock.calls[0][0].data;
            expect(data.evaluatorId).toBe('user-9');
            expect(data.evaluatedAt).toBeInstanceOf(Date);
        });

        it('onaylanmamış YETERLI değerlendirmesi bulgunun çözüm durumunu değiştirmez', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ evaluatorId: null, result: null, status: 'DEVAM_EDIYOR' }),
            );
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: null, result: 'YETERLI' });

            await service.updateFollowUp(
                'f-1', 'fu-1',
                { status: 'TAMAMLANDI', currentStatusDetail: 'Kanıt yeterli.', result: 'YETERLI' },
                'evaluator-1', 'AUDITOR',
            );

            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('onaylanmamış YETERSIZ değerlendirmesi aksiyon veya bulguyu değiştirmez', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ actionId: 'a-1', evaluatorId: null, result: null, status: 'DEVAM_EDIYOR' }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: 'a-1', result: 'YETERSIZ', resolutionOutcome: 'DEVAM_EDIYOR' });
            await service.updateFollowUp('f-1', 'fu-1', { status: 'TAMAMLANDI', result: 'YETERSIZ', resolutionOutcome: 'DEVAM_EDIYOR' }, 'evaluator-1', 'AUDITOR');
            expect(prisma.action.update).not.toHaveBeenCalled();
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('yeni aksiyon taslağını değerlendirme kaydında onaya kadar saklar', async () => {
            const draft = {
                description: 'Kalıcı düzeltici aksiyon', ownerId: 'owner-1',
                dueDate: '2099-12-31', responsibleDepartment: 'Operasyon',
            };
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ evaluatorId: null, result: null, status: 'DEVAM_EDIYOR' }),
            );
            prisma.user.findUnique.mockResolvedValue({ id: 'owner-1' });
            prisma.findingFollowUp.update.mockResolvedValue({
                id: 'fu-1', actionId: null, result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI', newActionDraft: draft,
            });

            await service.updateFollowUp('f-1', 'fu-1', {
                status: 'TAMAMLANDI', result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI', newAction: draft,
            }, 'evaluator-1', 'AUDITOR');

            expect(prisma.findingFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ newActionDraft: draft, newActionRequired: true }),
            }));
            expect(prisma.action.update).not.toHaveBeenCalled();
            expect(prisma.finding.update).not.toHaveBeenCalled();
        });

        it('ikinci kontrolcü onayında YETERSIZ aksiyon açık/yetersiz kalır, kapanmaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ actionId: 'a-1', result: 'YETERSIZ', resolutionOutcome: 'DEVAM_EDIYOR' }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: 'a-1', result: 'YETERSIZ', resolutionOutcome: 'DEVAM_EDIYOR' });
            prisma.action.update.mockResolvedValue({});
            prisma.finding.update.mockResolvedValue({});
            await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');
            expect(prisma.action.update).toHaveBeenCalledWith({ where: { id: 'a-1' }, data: { status: 'YETERSIZ' } });
        });

        it('onaylı erteleme yeni takip üretir, aksiyon terminini değiştirmez', async () => {
            const next = new Date('2099-12-31T00:00:00.000Z');
            prisma.findingFollowUp.findFirst
                .mockResolvedValueOnce(readyFollowUp({ actionId: 'a-1', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: next }))
                .mockResolvedValueOnce(null);
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', actionId: 'a-1', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: next });
            prisma.findingFollowUp.create.mockResolvedValue({ id: 'fu-next' });
            prisma.action.update.mockResolvedValue({});
            prisma.finding.update.mockResolvedValue({});
            await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');
            expect(prisma.findingFollowUp.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actionId: 'a-1', plannedDate: next, status: 'BEKLIYOR' }) });
            expect(prisma.action.update).toHaveBeenCalledWith({ where: { id: 'a-1' }, data: { status: 'YETERSIZ' } });
            expect(prisma.action.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dueDate: expect.anything() }) }));
        });
    });

    describe('createFollowUpForAction', () => {
        it.each(['TAMAMLANDI', 'COMPLETED'])(
            '%s aksiyona manuel takip eklenince aksiyon durumunu geriye almaz',
            async (status) => {
                prisma.action.findFirst = jest.fn().mockResolvedValue({
                    id: 'a-1', findingId: 'f-1', status, dueDate: new Date('2026-12-01'), finding: {},
                });
                prisma.findingFollowUp.create.mockResolvedValue({ id: 'fu-1' });

                await service.createFollowUpForAction('f-1', 'a-1', {}, 'user-1');

                expect(prisma.action.update).not.toHaveBeenCalled();
            },
        );
    });
});
