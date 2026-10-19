import { nextTestCode } from './test-code.util';

describe('nextTestCode', () => {
    it('YYYY.BTK.XXXX.TN formatında (nokta ayıracı) kod üretir', async () => {
        const db = { $queryRaw: jest.fn().mockResolvedValue([{ value: 3 }]) };
        const code = await nextTestCode(db, 'ctrl-1', 'BTK.0042', 2026);
        expect(code).toBe('2026.BTK.0042.T3');
    });

    it('sayaç scope\'u (year,control) bazlı — farklı kontrol/yıl farklı scope kullanır', async () => {
        const db = { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) };
        await nextTestCode(db, 'ctrl-1', 'BTK.0042', 2026);
        expect(db.$queryRaw.mock.calls[0][0].values).toContain('test-code:ctrl-1:2026');

        await nextTestCode(db, 'ctrl-1', 'BTK.0042', 2027);
        expect(db.$queryRaw.mock.calls[1][0].values).toContain('test-code:ctrl-1:2027');

        await nextTestCode(db, 'ctrl-2', 'BTK.0043', 2026);
        expect(db.$queryRaw.mock.calls[2][0].values).toContain('test-code:ctrl-2:2026');
    });
});
