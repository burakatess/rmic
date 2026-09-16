import { createWithSequentialId } from './sequential-id';

describe('createWithSequentialId', () => {
    it('benzersizlik ihlalinde (P2002) numarayı yeniden üretip tekrar dener', async () => {
        const ids = ['A-2026-0001', 'A-2026-0002', 'A-2026-0003'];
        let i = 0;
        const nextId = jest.fn().mockImplementation(() => Promise.resolve(ids[i++]));
        const create = jest
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
            .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
            .mockResolvedValueOnce({ id: 'x', actionId: 'A-2026-0003' });

        const result = await createWithSequentialId({ nextId, create });

        expect(result).toEqual({ id: 'x', actionId: 'A-2026-0003' });
        expect(create).toHaveBeenCalledTimes(3);
        expect(create).toHaveBeenLastCalledWith('A-2026-0003');
    });

    it('P2002 dışındaki hatayı yeniden denemeden fırlatır', async () => {
        const create = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'P2000' }));
        await expect(
            createWithSequentialId({ nextId: () => Promise.resolve('A-1'), create }),
        ).rejects.toThrow('boom');
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('deneme sınırı aşılınca son P2002 hatasını fırlatır', async () => {
        const err = Object.assign(new Error('unique'), { code: 'P2002' });
        const create = jest.fn().mockRejectedValue(err);
        await expect(
            createWithSequentialId({ nextId: () => Promise.resolve('A-1'), create, retries: 2 }),
        ).rejects.toBe(err);
        expect(create).toHaveBeenCalledTimes(3); // ilk deneme + 2 retry
    });
});
