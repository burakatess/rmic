import { SearchService } from './search.service';

describe('SearchService', () => {
    const db: any = {
        risk: { findMany: jest.fn() }, control: { findMany: jest.fn() },
        controlYearScope: { findMany: jest.fn() }, controlTest: { findMany: jest.fn() },
        finding: { findMany: jest.fn() }, action: { findMany: jest.fn() },
        findingFollowUp: { findMany: jest.fn() },
    };
    const scope: any = { getScopeOptions: jest.fn() };
    let service: SearchService;

    beforeEach(() => {
        jest.clearAllMocks();
        Object.values(db).forEach((model: any) => model.findMany.mockResolvedValue([]));
        scope.getScopeOptions.mockResolvedValue({ org: { available: false }, unit: { directorates: [] } });
        service = new SearchService(db, scope);
    });

    it('trims Turkish text and restricts an unprivileged search to owned records', async () => {
        db.control.findMany.mockResolvedValue([{ id: 'c1', controlId: 'BTK.0042', name: 'İşlem Kontrolü', description: 'İç süreç', directorateRel: null }]);
        const response = await service.search({ q: '  İşlem  ', category: 'control' as any, limit: 10 }, 'u1', ['control:view']);
        expect(db.control.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ ownerId: 'u1' }),
        }));
        expect(response.query).toBe('İşlem');
        expect(response.data[0]).toMatchObject({ code: 'BTK.0042', url: '/controls/c1' });
    });

    it('honours category and ranks an exact code before partial matches', async () => {
        scope.getScopeOptions.mockResolvedValue({ org: { available: true }, unit: { directorates: [] } });
        db.controlTest.findMany.mockResolvedValue([
            { id: 't2', testNo: '2026.BTK.0042.T10', summary: 'Onuncu', description: null, control: { name: 'Kontrol' }, directorate: null },
            { id: 't1', testNo: '2026.BTK.0042.T1', summary: 'Birinci', description: null, control: { name: 'Kontrol' }, directorate: null },
        ]);
        const response = await service.search({ q: '2026.BTK.0042.T1', category: 'control-test' as any, limit: 10 }, 'u1', ['report:org', 'control:view']);
        expect(response.data.map(item => item.code)).toEqual(['2026.BTK.0042.T1', '2026.BTK.0042.T10']);
        expect(db.finding.findMany).not.toHaveBeenCalled();
    });

    it('applies directorate access before the finding text predicate', async () => {
        scope.getScopeOptions.mockResolvedValue({ org: { available: false }, unit: { directorates: [{ id: 'd1', name: 'BT' }] } });
        await service.search({ q: 'bulgu', category: 'finding' as any, limit: 10 }, 'u1', ['finding:view']);
        expect(db.finding.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [
                { OR: [{ directorateId: { in: ['d1'] } }, { assigneeId: 'u1' }] },
                expect.objectContaining({ OR: expect.any(Array) }),
            ] },
        }));
    });
});
