import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AnnualPlanService } from './annual-plan.service';

describe('AnnualPlanService — onay yaşam döngüsü', () => {
    let db: any;
    let service: AnnualPlanService;

    beforeEach(() => {
        db = {
            annualPlanDraft: {
                findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn(),
            },
            auditLog: { create: jest.fn() },
        };
        db.$transaction = jest.fn((fn: any) => fn(db));
        service = new AnnualPlanService(db, {} as any, {} as any);
    });

    it('onaya gönderen kullanıcı aynı revisionı onaylayamaz', async () => {
        db.annualPlanDraft.findUnique.mockResolvedValue({
            id: 'draft-1', year: 2027, revision: 4, status: 'PENDING_APPROVAL', submittedById: 'user-1',
        });
        await expect(service.approve(2027, 'user-1', { expectedRevision: 4 })).rejects.toThrow(ForbiddenException);
        expect(db.annualPlanDraft.updateMany).not.toHaveBeenCalled();
    });

    it('farklı kullanıcı onayladığında revisionı kilitler ve audit yazar', async () => {
        const draft = { id: 'draft-1', year: 2027, revision: 4, status: 'PENDING_APPROVAL', submittedById: 'user-1' };
        db.annualPlanDraft.findUnique.mockResolvedValue(draft);
        db.annualPlanDraft.findUniqueOrThrow.mockResolvedValue({ ...draft, status: 'APPROVED', approvedRevision: 4 });
        const result = await service.approve(2027, 'user-2', { expectedRevision: 4, note: 'Uygundur' });
        expect(result.approvedRevision).toBe(4);
        expect(db.annualPlanDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'APPROVED', approvedRevision: 4, approvedById: 'user-2' }),
        }));
        expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ANNUAL_PLAN_APPROVE' }) }));
    });

    it('onaylanmamış planı uygulamayı reddeder', async () => {
        db.annualPlanDraft.findUnique.mockResolvedValue({ id: 'draft-1', year: 2027, revision: 4, status: 'OPEN', approvedRevision: null });
        await expect(service.applyPlan(2027, 'user-2', [], { expectedRevision: 4 })).rejects.toThrow(ConflictException);
    });
});
