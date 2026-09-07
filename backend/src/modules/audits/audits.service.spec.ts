import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditsService } from './audits.service';
import { PrismaService } from '../../prisma';

describe('AuditsService — kritik iş kuralları', () => {
    let service: AuditsService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            finding: { findUnique: jest.fn(), update: jest.fn() },
            findingStatusHistory: { create: jest.fn() },
            auditLog: { create: jest.fn() },
            action: { findMany: jest.fn() },
            user: { findUnique: jest.fn() },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<AuditsService>(AuditsService);
    });

    afterEach(() => jest.clearAllMocks());

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

        it('hiç aksiyon yoksa finding.update çağrılmaz', async () => {
            prisma.action.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

            await service.recalculateFindingTargetDate('f-1');

            expect(prisma.finding.update).not.toHaveBeenCalled();
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
        });

        it('bir aksiyon bile açık ise bulguyu kapatmaz', async () => {
            prisma.action.findMany.mockResolvedValue([{ status: 'KAPATILDI' }, { status: 'DEVAM_EDIYOR' }]);

            await service.checkAndCloseFindinIfAllActionsClosed('f-1', 'user-1');

            expect(prisma.finding.update).not.toHaveBeenCalled();
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
});
