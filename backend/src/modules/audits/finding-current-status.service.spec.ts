import { AuditsService } from './audits.service';

describe('AuditsService finding current status summary', () => {
    const db: any = {
        finding: { findUnique: jest.fn() },
        user: { findMany: jest.fn() },
    };
    let service: AuditsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AuditsService(db);
        db.user.findMany.mockResolvedValue([
            { id: 'e1', firstName: 'Ayşe', lastName: 'Yılmaz' },
            { id: 'a1', firstName: 'Mehmet', lastName: 'Kaya' },
        ]);
    });

    it('uses the last approved follow-up and keeps a pending evaluation separate', async () => {
        db.finding.findUnique.mockResolvedValue({
            id: 'f1', status: 'IN_PROGRESS', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR',
            actions: [{ id: 'a', status: 'KAPATILDI', dueDate: new Date() }, { id: 'b', status: 'DEVAM_EDIYOR', dueDate: new Date() }],
            followUps: [
                { id: 'pending', followUpId: 'T-2', status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', result: 'YETERSIZ', evaluatedAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02'), attachments: [] },
                { id: 'approved', followUpId: 'T-1', status: 'ONAYLANDI', approvalStatus: 'ONAYLANDI', result: 'YETERLI', explanation: 'Kanıt doğrulandı', evaluatedAt: new Date('2026-09-01'), approvedAt: new Date('2026-09-02'), evaluatorId: 'e1', approvedBy: 'a1', attachments: [] },
            ],
            linkedRisks: [], attachments: [], statusLogs: [], controlTest: null, referencingTests: [],
            _count: { actions: 2, followUps: 2, linkedRisks: 0, attachments: 0 },
        });
        const result: any = await service.getFinding('f1');
        expect(result.currentStatusSummary.latestApproved.followUpId).toBe('T-1');
        expect(result.currentStatusSummary.pending.followUpId).toBe('T-2');
        expect(result.currentStatusSummary.systemSummary).toContain('diğer açık aksiyonların');
        expect(result.currentStatusSummary.actionCounts).toEqual({ open: 1, closed: 1, total: 2 });
    });
});
