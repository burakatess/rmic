import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AuditsService } from './audits.service';
import { PrismaService } from '../../prisma';

describe('AuditsService — kritik iş kuralları', () => {
    let service: AuditsService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            finding: {
                findUnique: jest.fn(), update: jest.fn(),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn(),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            findingStatusHistory: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
            findingStatusLog: { create: jest.fn() },
            auditLog: { create: jest.fn() },
            action: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
            findingFollowUp: {
                findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(), updateMany: jest.fn(),
            },
            user: { findUnique: jest.fn() },
            directorate: { findUnique: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([{ locked: true, value: 1 }]),
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
                select: { id: true, actionId: true, findingId: true, dueDate: true, status: true },
            });
        });

        it('TAMAMLANDI aksiyon için doğrulama takibi üretirken aksiyon durumunu geri almaz', async () => {
            const dueDate = new Date('2026-01-01');
            prisma.action.findMany.mockResolvedValue([{ id: 'a-1', actionId: 'A-2026-0002-01', findingId: 'f-1', dueDate, status: 'TAMAMLANDI' }]);
            prisma.findingFollowUp.findFirst.mockResolvedValue(null);
            prisma.findingFollowUp.create.mockResolvedValue({ id: 'fu-1', followUpId: 'T-1' });

            const result = await service.generateDueFollowUps('cron');

            expect(result.generatedCount).toBe(1);
            expect(prisma.findingFollowUp.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ findingId: 'f-1', actionId: 'a-1', status: 'BEKLIYOR' }),
                select: { id: true, followUpId: true },
            });
            expect(prisma.action.update).not.toHaveBeenCalled();
            // Otomatik üretim denetim izine girer (cron → kullanıcı yok, SYSTEM aktörü Prisma katmanında).
            expect(prisma.auditLog.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ userId: null, action: 'AUTO_GENERATE', entityType: 'FindingFollowUp', entityId: 'fu-1' }),
            });
        });
    });

    // ─── Mutabakat Workflow Geçişleri ──────────────────────────────────────

    // Geçişler atomiktir: durum koşulu updateMany WHERE'indedir; statü geçmişi ve
    // denetim izi aynı transaction'da yazılır.
    const expectAtomicTransition = (from: string, to: string, extra: Record<string, unknown> = {}) => {
        expect(prisma.finding.updateMany).toHaveBeenCalledWith({
            where: { id: 'f-1', workflowStatus: from },
            data: { ...extra, workflowStatus: to },
        });
        expect(prisma.findingStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ workflowStatus: to, previousWorkflowStatus: from }),
        }));
        expect(prisma.auditLog.create).toHaveBeenCalled();
        expect(prisma.finding.update).not.toHaveBeenCalled();
    };

    describe('mutabakataGonder', () => {
        it('TASLAK statüsündeki bulguyu MUTABAKATA_GONDERILDI\'ye atomik geçirir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'TASLAK' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKATA_GONDERILDI' });

            const result = await service.mutabakataGonder('f-1', 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKATA_GONDERILDI');
            expectAtomicTransition('TASLAK', 'MUTABAKATA_GONDERILDI');
        });

        it('TASLAK dışındaki statüden geçişe izin vermez (400)', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKAT_YAPILDI' });

            await expect(service.mutabakataGonder('f-1', 'user-1')).rejects.toThrow(BadRequestException);
            expect(prisma.finding.updateMany).not.toHaveBeenCalled();
        });

        it('ön kontrolden sonra durum eşzamanlı değişirse 409 döner ve geçmiş/denetim yazılmaz', async () => {
            prisma.finding.findUnique
                .mockResolvedValueOnce({ workflowStatus: 'TASLAK' })
                .mockResolvedValueOnce({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.finding.updateMany.mockResolvedValue({ count: 0 });

            await expect(service.mutabakataGonder('f-1', 'user-1')).rejects.toThrow(ConflictException);
            expect(prisma.findingStatusHistory.create).not.toHaveBeenCalled();
            expect(prisma.auditLog.create).not.toHaveBeenCalled();
        });

        it('bulgu bulunamazsa NotFoundException fırlatır', async () => {
            prisma.finding.findUnique.mockResolvedValue(null);

            await expect(service.mutabakataGonder('f-x', 'user-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('icKontrolOnayinaGonder', () => {
        it('birim cevabı ve hedef tarih geçişle aynı atomik güncellemede yazılır', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });

            await service.icKontrolOnayinaGonder('f-1', 'Birim cevabı metni', '2026-12-01', 'user-1');

            expectAtomicTransition('MUTABAKATA_GONDERILDI', 'IC_KONTROL_ONAYINA_GONDERILDI', {
                birimCevabi: 'Birim cevabı metni', targetResolutionDate: new Date('2026-12-01'),
            });
        });

        it('yanlış statüden çağrılırsa reddeder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'TASLAK' });

            await expect(
                service.icKontrolOnayinaGonder('f-1', 'cevap', undefined, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('mutabakatOnayla', () => {
        it('onaylar ve KAPATILDI ise closedDate geçişle birlikte yazılır', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKAT_YAPILDI' });

            await service.mutabakatOnayla('f-1', { resolutionStatus: 'KAPATILDI' }, 'user-1');

            expectAtomicTransition('IC_KONTROL_ONAYINA_GONDERILDI', 'MUTABAKAT_YAPILDI', {
                resolutionStatus: 'KAPATILDI', closedDate: expect.any(Date),
            });
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
            expect(prisma.finding.updateMany).not.toHaveBeenCalled();
        });

        it('gönderen BAŞKA bir kullanıcıysa onay sorunsuz ilerler', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKAT_YAPILDI' });
            prisma.findingStatusHistory.findFirst.mockResolvedValue({ evaluator: 'other-user' });

            const result = await service.mutabakatOnayla('f-1', {}, 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKAT_YAPILDI');
        });

        it('iki eşzamanlı onaydan ikincisi 409 alır', async () => {
            prisma.finding.findUnique
                .mockResolvedValueOnce({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' })
                .mockResolvedValueOnce({ workflowStatus: 'MUTABAKAT_YAPILDI' });
            prisma.finding.updateMany.mockResolvedValue({ count: 0 });

            await expect(service.mutabakatOnayla('f-1', {}, 'user-1')).rejects.toThrow(ConflictException);
        });
    });

    describe('mutabakatGeriGonder', () => {
        it('IC_KONTROL_ONAYINA_GONDERILDI\'den MUTABAKATA_GONDERILDI\'ye geri gönderir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'MUTABAKATA_GONDERILDI' });

            const result = await service.mutabakatGeriGonder('f-1', 'Yetersiz kanıt', 'user-1');

            expect(result.workflowStatus).toBe('MUTABAKATA_GONDERILDI');
            expectAtomicTransition('IC_KONTROL_ONAYINA_GONDERILDI', 'MUTABAKATA_GONDERILDI');
        });

        it('yanlış statüden çağrılırsa reddeder', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKAT_YAPILDI' });

            await expect(
                service.mutabakatGeriGonder('f-1', 'sebep', 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('iptalEt', () => {
        it('herhangi bir statüden IPTAL\'e koşullu geçirir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.finding.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workflowStatus: 'IPTAL' });
            prisma.findingFollowUp.findMany.mockResolvedValue([]);

            const result = await service.iptalEt('f-1', 'Hatalı bulgu', 'user-1');

            expect(result.workflowStatus).toBe('IPTAL');
            expect(prisma.finding.updateMany).toHaveBeenCalledWith({
                where: { id: 'f-1', workflowStatus: 'MUTABAKATA_GONDERILDI' },
                data: { workflowStatus: 'IPTAL' },
            });
        });

        it('iptal sırasında durum değiştiyse 409 döner', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'MUTABAKATA_GONDERILDI' });
            prisma.findingFollowUp.findMany.mockResolvedValue([]);
            prisma.finding.updateMany.mockResolvedValue({ count: 0 });

            await expect(service.iptalEt('f-1', 'Hatalı bulgu', 'user-1')).rejects.toThrow(ConflictException);
        });

        it('zaten IPTAL olan bulguyu tekrar iptal etmeye izin vermez', async () => {
            prisma.finding.findUnique.mockResolvedValue({ workflowStatus: 'IPTAL' });

            await expect(service.iptalEt('f-1', 'sebep', 'user-1')).rejects.toThrow(BadRequestException);
        });
    });

    describe('deleteFinding', () => {
        const draft = (over: Record<string, unknown> = {}) => ({
            id: 'f-1', findingId: 'B-2026-0001', description: 'd', workflowStatus: 'TASLAK', status: 'OPEN', createdById: 'creator-1',
            resolutionStatus: null, controlTestId: null, controlId: null,
            actions: [{ id: 'a-1', actionId: 'A-1', status: 'BEKLIYOR' }],
            followUps: [{ id: 'fu-1', followUpId: 'T-1', status: 'BEKLIYOR', approvalStatus: 'BEKLIYOR' }],
            _count: { referencingTests: 0, attachments: 2 },
            ...over,
        });

        beforeEach(() => {
            prisma.action.deleteMany = jest.fn();
            prisma.findingFollowUp.deleteMany = jest.fn();
        });

        it('süreci başlamamış TASLAK bulguyu bağımlılıklarıyla tek transaction\'da siler', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft());

            const result = await service.deleteFinding('f-1', 'user-1', ['finding:delete']);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.findingFollowUp.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['fu-1'] } } });
            expect(prisma.action.deleteMany).toHaveBeenCalledWith({ where: { findingId: 'f-1' } });
            expect(prisma.finding.deleteMany).toHaveBeenCalledWith({ where: { id: 'f-1', workflowStatus: 'TASLAK' } });
            expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    action: 'DELETE', entityType: 'Finding',
                    oldValue: expect.objectContaining({ findingId: 'B-2026-0001', deletedActions: ['A-1'], deletedAttachmentCount: 2 }),
                }),
            }));
            expect(result).toEqual({ message: 'Bulgu silindi', findingId: 'B-2026-0001' });
        });

        it.each([
            ['mutabakata gönderilmiş', { workflowStatus: 'MUTABAKATA_GONDERILDI' }],
            ['kapalı', { status: 'CLOSED', resolutionStatus: 'KAPATILDI' }],
            ['aksiyonunda ilerleme olan', { actions: [{ id: 'a-1', actionId: 'A-1', status: 'DEVAM_EDIYOR' }] }],
            ['onaylı takipli', { followUps: [{ id: 'fu-1', followUpId: 'T-1', status: 'ONAYLANDI', approvalStatus: 'ONAYLANDI' }] }],
            ['kontrol testi referanslı', { _count: { referencingTests: 1, attachments: 0 } }],
        ])('%s bulgu 409 ile reddedilir ve hiçbir şey silinmez', async (_label, over) => {
            prisma.finding.findUnique.mockResolvedValue(draft(over));

            await expect(service.deleteFinding('f-1', 'user-1', ['finding:delete'])).rejects.toThrow(ConflictException);
            expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
            expect(prisma.action.deleteMany).not.toHaveBeenCalled();
            expect(prisma.auditLog.create).not.toHaveBeenCalled();
        });

        it('kontrolden sonra bulgu mutabakata gönderildiyse (count=0) 409 döner, denetim izi yazılmaz', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft());
            prisma.finding.deleteMany.mockResolvedValue({ count: 0 });

            await expect(service.deleteFinding('f-1', 'user-1', ['finding:delete'])).rejects.toThrow(ConflictException);
            expect(prisma.auditLog.create).not.toHaveBeenCalled();
        });

        it('finding:delete:own: kendi oluşturduğu taslağı siler; koşullu silme sahipliği de içerir', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft({ createdById: 'auditor-1' }));

            await service.deleteFinding('f-1', 'auditor-1', ['finding:delete:own']);

            expect(prisma.finding.deleteMany).toHaveBeenCalledWith({
                where: { id: 'f-1', workflowStatus: 'TASLAK', createdById: 'auditor-1' },
            });
            expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ oldValue: expect.objectContaining({ deletedVia: 'finding:delete:own' }) }),
            }));
        });

        it('finding:delete:own: başkasının taslağı 403 (durumdan önce), hiçbir şey silinmez', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft({ createdById: 'someone-else' }));
            await expect(service.deleteFinding('f-1', 'auditor-1', ['finding:delete:own'])).rejects.toThrow(ForbiddenException);
            expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
        });

        it('finding:delete:own: oluşturucusu bilinmeyen (null) taslak 403', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft({ createdById: null }));
            await expect(service.deleteFinding('f-1', 'auditor-1', ['finding:delete:own'])).rejects.toThrow(ForbiddenException);
        });

        it('finding:delete:own: kendi taslağı da olsa süreç başlamışsa 409', async () => {
            prisma.finding.findUnique.mockResolvedValue(draft({ createdById: 'auditor-1', workflowStatus: 'MUTABAKATA_GONDERILDI' }));
            await expect(service.deleteFinding('f-1', 'auditor-1', ['finding:delete:own'])).rejects.toThrow(ConflictException);
        });

        it('silme izni yoksa 403 ve DB okunmaz', async () => {
            await expect(service.deleteFinding('f-1', 'viewer-1', ['finding:view'])).rejects.toThrow(ForbiddenException);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('bulunamayan bulgu 404', async () => {
            prisma.finding.findUnique.mockResolvedValue(null);
            await expect(service.deleteFinding('f-x', 'user-1', ['finding:delete'])).rejects.toThrow(NotFoundException);
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

        const validNewAction = {
            description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1',
            ownerId: 'owner-1', dueDate: '2099-12-01',
        };

        it('YENI_AKSIYON_GEREKLI seçilip yeni aksiyon bilgisi eksikse reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };

            await expect(
                service.updateFollowUp('f-1', 'fu-1', { result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI' }, 'user-1'),
            ).rejects.toThrow('Yeni aksiyon planı');
            expect(prisma.findingFollowUp.update).not.toHaveBeenCalled();
        });

        it('YENI_AKSIYON_GEREKLI için sorumlu birim seçilmemişse reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };
            await expect(
                service.updateFollowUp('f-1', 'fu-1', {
                    result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'Plan', dueDate: '2099-12-01' },
                }, 'user-1'),
            ).rejects.toThrow('sorumlu birim');
        });

        it('YENI_AKSIYON_GEREKLI için hedef tarih geçmişteyse reddeder', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };
            await expect(
                service.updateFollowUp('f-1', 'fu-1', {
                    result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                    newAction: { ...validNewAction, dueDate: '2000-01-01' },
                }, 'user-1'),
            ).rejects.toThrow('hedef tarihi');
        });

        it('YENI_AKSIYON_GEREKLI için geçersiz birim reddedilir', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };
            prisma.directorate.findUnique.mockResolvedValue(null);
            await expect(
                service.updateFollowUp('f-1', 'fu-1', { result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI', newAction: validNewAction }, 'user-1'),
            ).rejects.toThrow('Geçersiz birim');
        });

        it('YENI_AKSIYON_GEREKLI için geçersiz sorumlu kullanıcı reddedilir', async () => {
            prisma.findingFollowUp = { findFirst: jest.fn().mockResolvedValue(baseFollowUp), update: jest.fn() };
            prisma.directorate.findUnique.mockResolvedValue({ id: 'dir-1' });
            prisma.user.findUnique.mockResolvedValue(null);
            await expect(
                service.updateFollowUp('f-1', 'fu-1', {
                    result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                    newAction: { ...validNewAction, ownerId: 'no-such-user' },
                }, 'user-1'),
            ).rejects.toThrow('Geçersiz kullanıcı');
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
            prisma.finding = {
                ...prisma.finding, findUnique: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'f-1' }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'f-1' }),
            };
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
            expect(prisma.finding.updateMany).not.toHaveBeenCalled();
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
            const call = prisma.finding.updateMany.mock.calls[0][0];
            // Kapanış koşulu UPDATE içinde: arada açık aksiyon eklenirse kapanmaz.
            expect(call.where).toEqual({
                id: 'f-1', status: { not: 'CLOSED' },
                actions: { some: {}, every: { status: { in: ['KAPATILDI', 'CLOSED'] } } },
            });
            expect(call.data.status).toBe('CLOSED');
            expect(call.data.closedDate).toBeInstanceOf(Date);
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ action: 'CLOSE', entityType: 'Finding' }) }),
            );
        });

        it('kapanış sırasında yeni açık aksiyon eklendiyse (count=0) 409 döner', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'IN_PROGRESS', actions: [{ status: 'KAPATILDI' }] });
            prisma.finding.updateMany.mockResolvedValue({ count: 0 });
            await expect(service.closeFinding('f-1', 'gerekçe', 'u-1')).rejects.toThrow(ConflictException);
            expect(prisma.auditLog.create).not.toHaveBeenCalled();
        });

        it('kapalı olmayan bulgu yeniden açılamaz', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'IN_PROGRESS' });
            await expect(service.reopenFinding('f-1', 'gerekçe', 'u-1')).rejects.toThrow(BadRequestException);
        });

        it('kapalı bulgu gerekçeyle yeniden açılır → IN_PROGRESS, closedDate temizlenir', async () => {
            prisma.finding.findUnique.mockResolvedValue({ id: 'f-1', status: 'CLOSED' });
            await service.reopenFinding('f-1', 'yeni kanıt geldi', 'u-1');
            expect(prisma.finding.updateMany.mock.calls[0][0].where).toEqual({ id: 'f-1', status: 'CLOSED' });
            const data = prisma.finding.updateMany.mock.calls[0][0].data;
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
            prisma.action = { ...prisma.action, findUnique: jest.fn(), update: jest.fn(), create: jest.fn() };
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

        it('onay bekleyen kayıt maker tarafından API üzerinden değiştirilemez', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ assigneeId: 'maker-1' }));
            await expect(service.updateFollowUp(
                'f-1', 'fu-1', { currentStatusDetail: 'değiştirildi' }, 'maker-1', 'AUDITOR',
            )).rejects.toThrow(ForbiddenException);
            expect(prisma.findingFollowUp.update).not.toHaveBeenCalled();
        });

        it('checker reddederse açıklamayı ezmeden revizyona döner ve yeni takip oluşturmaz', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ explanation: 'Maker açıklaması' }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', status: 'DEVAM_EDIYOR', approvalStatus: 'REDDEDILDI' });

            await service.updateFollowUp(
                'f-1', 'fu-1', { approvalStatus: 'REDDEDILDI', explanation: 'Kanıt eksik' },
                'second-ctrl', 'SYSTEM_ADMIN',
            );

            expect(prisma.findingFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ rejectionReason: 'Kanıt eksik', status: 'DEVAM_EDIYOR', approvalStatus: 'REDDEDILDI' }),
            }));
            expect(prisma.findingFollowUp.create).not.toHaveBeenCalled();
        });

        it('reddedilen kayıt maker tarafından düzenlenip tekrar onaya gönderilebilir', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({
                status: 'DEVAM_EDIYOR', approvalStatus: 'REDDEDILDI', assigneeId: 'maker-1', evaluatorId: 'maker-1',
            }));
            prisma.findingFollowUp.update.mockResolvedValue({ id: 'fu-1', status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR' });

            await service.updateFollowUp(
                'f-1', 'fu-1', { status: 'TAMAMLANDI', currentStatusDetail: 'Revize edildi', result: 'YETERSIZ', resolutionOutcome: 'DEVAM_EDIYOR' },
                'maker-1', 'AUDITOR',
            );

            expect(prisma.findingFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', rejectionReason: null }),
            }));
        });

        it('geçerli onay: onaylayan/zaman SUNUCU tarafından atomik claim ile yazılır', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({ evaluatorId: 'evaluator-x' }));
            await service.updateFollowUp(
                'f-1', 'fu-1',
                { status: 'ONAYLANDI', approvedBy: 'attacker', approvedAt: '2000-01-01' },
                'second-ctrl', 'RISK_CONTROL_MANAGER',
            );
            const claim = prisma.findingFollowUp.updateMany.mock.calls[0][0];
            expect(claim.where).toEqual(expect.objectContaining({
                status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', secondControllerId: 'second-ctrl',
            }));
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

        it('Yeni Aksiyon Gerekli onayında taslaktan yeni aksiyon (plan + birim + sorumlu + tarih) oluşturur', async () => {
            const draft = {
                description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1',
                ownerId: 'owner-1', dueDate: '2099-12-31',
            };
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({
                actionId: 'a-1', result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI', newActionDraft: draft,
                action: { id: 'a-1', actionId: 'A-1', ownerId: 'owner-0' },
            }));
            prisma.directorate.findUnique.mockResolvedValue({ id: 'dir-1' });
            prisma.user.findUnique.mockResolvedValue({ id: 'owner-1' });
            prisma.findingFollowUp.update.mockResolvedValue({
                id: 'fu-1', followUpId: 'T-1', actionId: 'a-1', result: 'YENI_AKSIYON_GEREKLI',
            });
            const createSpy = jest.spyOn(service, 'createAction')
                .mockResolvedValue({ id: 'a-2', actionId: 'A-2026-0034-02' } as never);

            const result = await service.updateFollowUp('f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN');

            expect(createSpy).toHaveBeenCalledWith('f-1', expect.objectContaining({
                description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1',
                ownerId: 'owner-1', dueDate: '2099-12-31', status: 'BEKLIYOR',
            }), 'second-ctrl', prisma);
            expect(prisma.findingFollowUp.create).not.toHaveBeenCalled();
            expect((result as { createdAction?: unknown }).createdAction).toEqual({ id: 'a-2', actionId: 'A-2026-0034-02' });
        });

        it('ikinci kontrolcü onay isteğinde yeni aksiyon taslağını değiştiremez', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({
                actionId: 'a-1', result: 'YENI_AKSIYON_GEREKLI',
                newActionDraft: { description: 'Plan', directorateId: 'dir-1', ownerId: 'owner-1', dueDate: '2099-12-31' },
            }));
            await expect(service.updateFollowUp('f-1', 'fu-1', {
                status: 'ONAYLANDI',
                newAction: { description: 'Onaylayanın değişikliği', directorateId: 'dir-2', dueDate: '2099-12-31' },
            }, 'second-ctrl', 'SYSTEM_ADMIN')).rejects.toThrow('Onay sırasında yeni aksiyon taslağı değiştirilemez');
            expect(prisma.findingFollowUp.updateMany).not.toHaveBeenCalled();
        });

        it('yeni aksiyon oluşturma başarısızsa onay işlemi hata verir', async () => {
            const draft = { description: 'Plan', directorateId: 'dir-1', ownerId: 'owner-1', dueDate: '2099-12-31' };
            prisma.findingFollowUp.findFirst.mockResolvedValue(readyFollowUp({
                actionId: 'a-1', result: 'YENI_AKSIYON_GEREKLI', newActionDraft: draft,
            }));
            prisma.directorate.findUnique.mockResolvedValue({ id: 'dir-1' });
            prisma.user.findUnique.mockResolvedValue({ id: 'owner-1' });
            prisma.findingFollowUp.update.mockResolvedValue({
                id: 'fu-1', followUpId: 'T-1', actionId: 'a-1', result: 'YENI_AKSIYON_GEREKLI',
            });
            jest.spyOn(service, 'createAction').mockRejectedValue(new Error('simulated create failure'));

            await expect(service.updateFollowUp(
                'f-1', 'fu-1', { status: 'ONAYLANDI' }, 'second-ctrl', 'SYSTEM_ADMIN',
            )).rejects.toThrow('simulated create failure');
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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

        it('Yeni Aksiyon Gerekli değerlendirmesinde yeni aksiyon taslağını saklar, aksiyon oluşturmaz', async () => {
            const draft = {
                description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1',
                ownerId: 'owner-1', dueDate: '2099-12-31',
            };
            prisma.findingFollowUp.findFirst.mockResolvedValue(
                readyFollowUp({ evaluatorId: null, result: null, status: 'DEVAM_EDIYOR' }),
            );
            prisma.directorate.findUnique.mockResolvedValue({ id: 'dir-1' });
            prisma.user.findUnique.mockResolvedValue({ id: 'owner-1' });
            prisma.findingFollowUp.update.mockResolvedValue({
                id: 'fu-1', actionId: null, result: 'YENI_AKSIYON_GEREKLI', newActionDraft: draft,
            });
            const createSpy = jest.spyOn(service, 'createAction');

            await service.updateFollowUp('f-1', 'fu-1', {
                status: 'TAMAMLANDI', result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI', newAction: draft,
            }, 'evaluator-1', 'AUDITOR');

            expect(prisma.findingFollowUp.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    newActionRequired: true,
                    newActionDraft: expect.objectContaining({ description: 'Kalıcı düzeltici aksiyon', directorateId: 'dir-1' }),
                }),
            }));
            expect(createSpy).not.toHaveBeenCalled();
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
            prisma.action.findUnique.mockResolvedValue({ id: 'a-1', actionId: 'A-2026-0002-01' });
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
                    id: 'a-1', actionId: 'A-2026-0002-01', findingId: 'f-1', status, dueDate: new Date('2026-12-01'), finding: {},
                });
                prisma.findingFollowUp.create.mockResolvedValue({ id: 'fu-1' });

                await service.createFollowUpForAction('f-1', 'a-1', {}, 'user-1');

                expect(prisma.action.update).not.toHaveBeenCalled();
            },
        );
    });

    describe('takip birinci kontrolcü yeniden atama', () => {
        const fu = (over: Record<string, unknown> = {}) => ({
            id: 'fu-1', findingId: 'f-1', status: 'DEVAM_EDIYOR', approvalStatus: 'BEKLIYOR',
            assigneeId: 'left-user', evaluatorId: 'left-user', secondControllerId: 'checker', ...over,
        });
        beforeEach(() => {
            prisma.findingFollowUp = {
                findFirst: jest.fn().mockResolvedValue(fu()),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn().mockResolvedValue(fu({ assigneeId: 'new-maker', evaluatorId: null })),
            };
            prisma.user.findUnique.mockResolvedValue({ isActive: true, role: { name: 'AUDITOR' } });
            prisma.findingStatusHistory.create = jest.fn();
        });
        const call = (body: any, user = 'manager', role = 'RISK_CONTROL_MANAGER') =>
            service.reassignFollowUpAssignee('f-1', 'fu-1', body, user, role);

        it('yetkili yönetici gerekçeyle yeniden atar; taslak sahipliği düşer; denetim kaydı aynı transaction\'da', async () => {
            await call({ assigneeId: 'new-maker', reason: 'Önceki sorumlu kurumdan ayrıldı' });
            expect(prisma.findingFollowUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
                data: { assigneeId: 'new-maker', evaluatorId: null, evaluatedAt: null },
            }));
            expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
                action: 'FOLLOWUP_REASSIGN', oldValue: { assigneeId: 'left-user', evaluatorId: 'left-user' },
            }) });
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('onaylanmış takipte tarihsel aktör değişmez (409); onay bekleyende önce ret gerekir (409)', async () => {
            prisma.findingFollowUp.findFirst.mockResolvedValue(fu({ status: 'ONAYLANDI', approvalStatus: 'ONAYLANDI' }));
            await expect(call({ assigneeId: 'new-maker', reason: 'x' })).rejects.toThrow(ConflictException);
            prisma.findingFollowUp.findFirst.mockResolvedValue(fu({ status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR' }));
            await expect(call({ assigneeId: 'new-maker', reason: 'x' })).rejects.toThrow('önce değerlendirmeyi gerekçeyle reddedin');
            expect(prisma.findingFollowUp.updateMany).not.toHaveBeenCalled();
        });

        it('maker/checker korunur: kendini, ikinci kontrolcüyü veya değerlendirme yetkisi olmayanı atayamaz', async () => {
            await expect(call({ assigneeId: 'manager', reason: 'x' })).rejects.toThrow('Kendinizi');
            await expect(call({ assigneeId: 'checker', reason: 'x' })).rejects.toThrow('İkinci kontrolcü');
            prisma.user.findUnique.mockResolvedValue({ isActive: true, role: { name: 'VIEWER' } });
            await expect(call({ assigneeId: 'viewer', reason: 'x' })).rejects.toThrow('yetkisine sahip değil');
            prisma.user.findUnique.mockResolvedValue({ isActive: false, role: { name: 'AUDITOR' } });
            await expect(call({ assigneeId: 'passive', reason: 'x' })).rejects.toThrow('aktif değil');
        });

        it('yetkisiz rol ve gerekçesiz istek reddedilir', async () => {
            await expect(call({ assigneeId: 'new-maker', reason: 'x' }, 'aud', 'AUDITOR')).rejects.toThrow(ForbiddenException);
            await expect(call({ assigneeId: 'new-maker', reason: '  ' })).rejects.toThrow('gerekçesi');
        });

        it('eşzamanlı onaya gönderme olduysa (count=0) yeniden atama yapılmaz', async () => {
            prisma.findingFollowUp.updateMany.mockResolvedValue({ count: 0 });
            await expect(call({ assigneeId: 'new-maker', reason: 'x' })).rejects.toThrow(ConflictException);
            expect(prisma.auditLog.create).not.toHaveBeenCalled();
        });
    });

    describe('ikinci kontrolcü atama — çıkmaz önleme', () => {
        beforeEach(() => {
            prisma.findingFollowUp = {
                findFirst: jest.fn().mockResolvedValue({ id: 'fu-1', status: 'DEVAM_EDIYOR', approvalStatus: 'BEKLIYOR', assigneeId: 'maker', evaluatorId: null }),
                update: jest.fn(),
            };
        });
        it('onay yetkisi olmayan kullanıcı ikinci kontrolcü atanamaz', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'x', isActive: true, role: { name: 'AUDITEE' } });
            await expect(service.assignSecondController('f-1', 'fu-1', { secondControllerId: 'x', reason: 'r' }, 'mgr', 'SYSTEM_ADMIN'))
                .rejects.toThrow('takip onayı verme yetkisine');
        });
        it('birinci kontrolcü aynı takibin ikinci kontrolcüsü olamaz', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'maker', isActive: true, role: { name: 'RISK_CONTROL_MANAGER' } });
            await expect(service.assignSecondController('f-1', 'fu-1', { secondControllerId: 'maker', reason: 'r' }, 'mgr', 'SYSTEM_ADMIN'))
                .rejects.toThrow('Birinci kontrolcü');
        });
    });
});
