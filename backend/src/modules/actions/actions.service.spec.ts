import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { AuditsService } from '../audits/audits.service';
import { PrismaService } from '../../prisma';

describe('ActionsService — nesne bazlı yetkilendirme + ortak domain delegasyonu (Madde 2)', () => {
    let service: ActionsService;
    let prisma: Record<string, any>;
    let audits: { createAction: jest.Mock; updateAction: jest.Mock; deleteAction: jest.Mock };

    beforeEach(async () => {
        prisma = {
            action: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
            finding: { findUnique: jest.fn() },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
            user: { findUnique: jest.fn() },
            $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
        };
        audits = {
            createAction: jest.fn().mockResolvedValue({ id: 'a-new', actionId: 'A-2026-0001' }),
            updateAction: jest.fn().mockResolvedValue({ id: 'a-1' }),
            deleteAction: jest.fn().mockResolvedValue({ message: 'ok' }),
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ActionsService,
                { provide: PrismaService, useValue: prisma },
                { provide: AuditsService, useValue: audits },
            ],
        }).compile();
        service = module.get<ActionsService>(ActionsService);
    });

    afterEach(() => jest.clearAllMocks());

    it('AUDITEE başka kullanıcının aksiyonunu güncelleyemez', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'other-user' });
        await expect(
            service.update('a-1', { status: 'COMPLETED' }, 'auditee-1', 'AUDITEE'),
        ).rejects.toThrow(ForbiddenException);
        expect(audits.updateAction).not.toHaveBeenCalled();
    });

    it('AUDITEE başka kullanıcının aksiyonunu tamamlayamaz', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'other-user' });
        await expect(service.complete('a-1', 'auditee-1', 'AUDITEE')).rejects.toThrow(ForbiddenException);
    });

    it('AUDITEE başka kullanıcının aksiyonunu uzatamaz', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'other-user' });
        await expect(
            service.extend('a-1', { newDueDate: '2026-12-01', reason: 'x' }, 'auditee-1', 'AUDITEE'),
        ).rejects.toThrow(ForbiddenException);
    });

    it('AUDITEE kendi aksiyonunu tamamlayabilir', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'auditee-1', status: 'BEKLIYOR' });
        prisma.action.update.mockResolvedValue({ id: 'a-1', status: 'COMPLETED' });
        await expect(service.complete('a-1', 'auditee-1', 'AUDITEE')).resolves.toBeDefined();
        expect(prisma.action.update).toHaveBeenCalled();
    });

    it('yönetici rolü başkasının aksiyonunu güncelleyebilir — ortak domain servisine delege', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'other-user' });
        await service.update('a-1', { description: 'x' }, 'admin-1', 'SYSTEM_ADMIN');
        expect(audits.updateAction).toHaveBeenCalledWith('f-1', 'a-1', expect.objectContaining({ description: 'x' }), 'admin-1');
    });

    it('/actions create — bulguya bağlı olmalı; ortak createAction\'a delege', async () => {
        prisma.finding.findUnique.mockResolvedValue({ id: 'f-1' });
        await service.create({ findingId: 'f-1', description: 'd', ownerId: 'u-1', dueDate: '2026-12-01' }, 'u-1');
        expect(audits.createAction).toHaveBeenCalledWith('f-1', expect.objectContaining({ description: 'd' }), 'u-1');
    });

    it('/actions create — findingId yoksa 400', async () => {
        await expect(service.create({ riskId: 'r-1', description: 'd', dueDate: '2026-12-01' }, 'u-1'))
            .rejects.toThrow(/bulguya bağlı/i);
    });

    it('extend — ortak updateAction\'a delege (termin + takip + hedef tarih)', async () => {
        prisma.action.findUnique.mockResolvedValue({ id: 'a-1', findingId: 'f-1', ownerId: 'u-1' });
        await service.extend('a-1', { newDueDate: '2026-12-15', reason: 'gerekçe' }, 'u-1', 'SYSTEM_ADMIN');
        expect(audits.updateAction).toHaveBeenCalledWith('f-1', 'a-1',
            expect.objectContaining({ dueDate: '2026-12-15', extensionReason: 'gerekçe', extensionApproved: false }), 'u-1');
    });

    it('aksiyon yoksa NotFoundException (Prisma 500 değil)', async () => {
        prisma.action.findUnique.mockResolvedValue(null);
        await expect(service.complete('yok', 'u-1', 'AUDITOR')).rejects.toThrow(NotFoundException);
    });
});
