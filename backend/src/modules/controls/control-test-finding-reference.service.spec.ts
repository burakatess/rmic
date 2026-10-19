import { BadRequestException } from '@nestjs/common';
import { ControlsService } from './controls.service';

describe('ControlsService control test finding reference', () => {
    const db: any = {
        controlTest: { findUnique: jest.fn(), update: jest.fn() },
        finding: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        auditLog: { create: jest.fn() },
    };
    let service: ControlsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ControlsService(db);
        db.controlTest.findUnique.mockResolvedValue({ id: 't-new', controlId: 'c1', status: 'DEVAM_EDIYOR', plannedDate: new Date('2026-10-01') });
        db.controlTest.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 't-new', ...data }));
        db.auditLog.create.mockResolvedValue({});
    });

    it('completes as finding-present without replacing the finding primary test', async () => {
        db.finding.findUnique.mockResolvedValue({ id: 'f1', findingId: 'B-1', controlId: 'c1', controlTestId: 't-original', status: 'IN_PROGRESS', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR' });
        const result = await service.completeTest('t-new', { referencedFindingId: 'f1', referenceReason: 'Ekim döneminde sorun devam ediyor.', continuationConfirmed: true }, 'u1');
        expect(result).toMatchObject({ findingStatus: 'BULGUSU_VAR', referencedFindingId: 'f1', status: 'TAMAMLANDI' });
        expect(db.finding.findUnique).toHaveBeenCalledTimes(1);
        expect(db.controlTest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ controlTestId: expect.anything() }) }));
    });

    it.each([
        [{ controlId: 'other', status: 'IN_PROGRESS', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR' }, 'bu kontrolle ilişkili değil'],
        [{ controlId: 'c1', status: 'CLOSED', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'KAPATILDI' }, 'Kapalı'],
        [{ controlId: 'c1', status: 'IN_PROGRESS', workflowStatus: 'IPTAL', resolutionStatus: 'DEVAM_EDIYOR' }, 'iptal'],
    ])('rejects an ineligible finding', async (finding, message) => {
        db.finding.findUnique.mockResolvedValue({ id: 'f1', findingId: 'B-1', controlTestId: null, ...finding });
        await expect(service.completeTest('t-new', { referencedFindingId: 'f1', referenceReason: 'Sorun devam etmektedir.', continuationConfirmed: true }, 'u1')).rejects.toThrow(BadRequestException);
        await expect(service.completeTest('t-new', { referencedFindingId: 'f1', referenceReason: 'Sorun devam etmektedir.', continuationConfirmed: true }, 'u1')).rejects.toThrow(message);
    });
});
