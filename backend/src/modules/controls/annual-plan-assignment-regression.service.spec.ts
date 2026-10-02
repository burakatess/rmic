import { AnnualPlanService } from './annual-plan.service';

describe('Annual plan bulk assignments and year isolation', () => {
    const controls = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, controlId: `C${i}`, name: `Control ${i}`, frequency: 'MONTHLY', selectedMonths: [] }));
    let service: AnnualPlanService;
    let db: any;
    let scope: any;
    let items: any[];

    beforeEach(() => {
        items = controls.map(c => ({ draftId: 'd2027', controlId: c.id, inScope: true, frequency: 'MONTHLY', selectedMonths: [], assigneeId: 'first', secondControllerId: null }));
        db = {
            annualPlanDraft: {
                findUnique: jest.fn(({ where }) => Promise.resolve({ id: `d${where.year}`, year: where.year, revision: 1, status: 'OPEN', approvedRevision: null })),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn(async () => ({ items })),
            },
            annualPlanDraftItem: {
                findMany: jest.fn(async ({ where }) => where.draftId === 'd2027' ? items : [{ ...items[0], draftId: 'd2026', assigneeId: null }]),
                findUnique: jest.fn(async ({ where }) => items.find(i => i.controlId === where.draftId_controlId.controlId)),
                upsert: jest.fn(async ({ where, update }) => Object.assign(items.find(i => i.controlId === where.draftId_controlId.controlId), update)),
            },
            control: { findMany: jest.fn().mockResolvedValue(controls) },
            controlYearScope: { findMany: jest.fn().mockResolvedValue([]) },
            auditLog: { create: jest.fn() },
        };
        db.$transaction = jest.fn(fn => fn(db));
        scope = { validateAssignment: jest.fn(), computePeriodsForScope: jest.fn().mockReturnValue([]), addScope: jest.fn().mockResolvedValue({ results: [{ tasksCreated: 0 }] }) };
        service = new AnnualPlanService(db, { resolveScope: jest.fn().mockResolvedValue({ appliedScope: 'ORG' }) } as any, scope);
    });

    it.each(['assigneeId', 'secondControllerId'] as const)('fills 20 missing %s without skipping the other assigned role', async role => {
        const other = role === 'assigneeId' ? 'secondControllerId' : 'assigneeId';
        items.forEach(i => { i[role] = null; i[other] = 'existing'; });
        const result = await service.bulkDraftAction(2027, 'actor', ['control:*'], {
            controlIds: controls.map(c => c.id), action: 'ASSIGN', [role]: 'new', onlyMissing: true, expectedRevision: 1,
        }, {});
        expect(result.affectedCount).toBe(20);
        expect(items.every(i => i[role] === 'new' && i[other] === 'existing')).toBe(true);
    });

    it('previews only missing target fields and preserves existing assignments in a mixed selection', async () => {
        items[0].secondControllerId = 'keep';
        const dto = { controlIds: controls.map(c => c.id), action: 'ASSIGN' as const, secondControllerId: 'second', onlyMissing: true, expectedRevision: 1 };
        const preview = await service.bulkDraftAction(2027, 'actor', [], { ...dto, dryRun: true }, {});
        expect(preview.totalAffected).toBe(19);
        expect(preview.willOverwrite).toEqual([]);
        expect(db.annualPlanDraftItem.upsert).not.toHaveBeenCalled();
        const result = await service.bulkDraftAction(2027, 'actor', [], dto, {});
        expect(result.affectedCount).toBe(19);
        expect(items[0].secondControllerId).toBe('keep');
    });

    it('preserves the existing first controller when both roles are requested with onlyMissing', async () => {
        await service.bulkDraftAction(2027, 'actor', [], {
            controlIds: controls.map(c => c.id), action: 'ASSIGN', assigneeId: 'replacement', secondControllerId: 'second', onlyMissing: true, expectedRevision: 1,
        }, {});
        expect(items.every(i => i.assigneeId === 'first' && i.secondControllerId === 'second')).toBe(true);
    });

    it('inherits the selected year scope assignment when creating a draft row', async () => {
        const scopes = items.map(i => ({ ...i, year: 2027, status: 'ACTIVE' }));
        items = [];
        db.controlYearScope.findMany.mockResolvedValue(scopes);
        db.annualPlanDraftItem.upsert.mockImplementation(async ({ create }) => items.push(create));
        await service.bulkDraftAction(2027, 'actor', [], {
            controlIds: controls.map(c => c.id), action: 'ASSIGN', secondControllerId: 'second', onlyMissing: true, expectedRevision: 1,
        }, {});
        expect(items).toHaveLength(20);
        expect(items.every(i => i.assigneeId === 'first' && i.secondControllerId === 'second')).toBe(true);
        expect(scope.validateAssignment).toHaveBeenCalledWith(db, 'first', 'second');
    });

    it('applies complete 2027 without touching or being blocked by incomplete 2026', async () => {
        items.forEach(i => { i.secondControllerId = 'second'; });
        db.annualPlanDraft.findUnique.mockImplementation(({ where }) => Promise.resolve({
            id: `d${where.year}`, year: where.year, revision: 1,
            status: where.year === 2027 ? 'APPROVED' : 'OPEN', approvedRevision: where.year === 2027 ? 1 : null,
        }));
        expect((await service.previewApply(2026, 'actor', [])).blocked).toBe(true);
        expect((await service.applyPlan(2027, 'actor', [], { expectedRevision: 1 })).applied).toBe(true);
        expect(scope.addScope).toHaveBeenCalledTimes(20);
        for (const call of scope.addScope.mock.calls) expect(call[1].years).toEqual([2027]);
        expect(db.annualPlanDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'd2027', revision: 1 }) }));
    });
});
