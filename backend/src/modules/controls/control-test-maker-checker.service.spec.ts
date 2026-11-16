import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ControlsService } from './controls.service';

describe('ControlsService test yürütme — maker/checker', () => {
    const db: any = {
        controlTest: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
        auditLog: { create: jest.fn() },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    let service: ControlsService;
    const base = { id: 't1', controlId: 'c1', assigneeId: 'maker', secondControllerId: 'checker', contentVersion: 3 };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ControlsService(db);
        db.controlTest.update.mockImplementation(({ data }: any) => Promise.resolve({ ...base, ...data }));
        db.controlTest.updateMany.mockResolvedValue({ count: 1 });
        db.controlTest.findUniqueOrThrow.mockResolvedValue(base);
        db.auditLog.create.mockResolvedValue({});
    });

    it('onay bekleyen (TAMAMLANDI) testte taslak kaydedilemez — içerik dondurulur', async () => {
        db.controlTest.findUnique.mockResolvedValue({ ...base, status: 'TAMAMLANDI' });
        await expect(service.saveDraft('t1', { contentVersion: 3, evidenceSummary: 'x' }, 'maker')).rejects.toBeInstanceOf(ConflictException);
        expect(db.controlTest.update).not.toHaveBeenCalled();
    });

    it('ikinci kontrolcü devam eden testin içeriğini değiştiremez', async () => {
        db.controlTest.findUnique.mockResolvedValue({ ...base, status: 'DEVAM_EDIYOR' });
        await expect(service.saveDraft('t1', { contentVersion: 3, evidenceSummary: 'x' }, 'checker')).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.controlTest.update).not.toHaveBeenCalled();
    });

    it('ikinci kontrolcü testi başlatamaz veya tamamlayamaz', async () => {
        db.controlTest.findUnique.mockResolvedValue({ ...base, status: 'BEKLIYOR' });
        await expect(service.startTest('t1', 'checker')).rejects.toBeInstanceOf(ForbiddenException);
        db.controlTest.findUnique.mockResolvedValue({ ...base, status: 'DEVAM_EDIYOR' });
        await expect(service.completeTest('t1', { findingStatus: 'BULGUSU_YOK' } as any, 'checker')).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.controlTest.updateMany).not.toHaveBeenCalled();
    });

    it('maker devam eden testte taslak kaydedebilir', async () => {
        db.controlTest.findUnique.mockResolvedValue({ ...base, status: 'DEVAM_EDIYOR' });
        await service.saveDraft('t1', { contentVersion: 3, evidenceSummary: 'x' }, 'maker');
        expect(db.controlTest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ evidenceSummary: 'x' }) }));
    });
});
