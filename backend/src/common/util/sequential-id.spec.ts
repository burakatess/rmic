import {
  createWithSequentialId,
  nextActionNo,
  nextFindingNo,
  nextFollowUpNo,
} from './sequential-id';

function counterDb() {
  const counters = new Map<string, number>();
  return {
    counters,
    $queryRaw: jest.fn((query: { values: unknown[] }) => {
      const scope = String(query.values[0]);
      const value = (counters.get(scope) ?? 0) + 1;
      counters.set(scope, value);
      return Promise.resolve([{ value }]);
    }),
  };
}

describe('hierarchical business identifiers', () => {
  it('bulgu sayacını tespit yılı bazında sıfırlar', async () => {
    const db = counterDb();
    await expect(
      nextFindingNo(db, new Date('2026-06-01T00:00:00Z')),
    ).resolves.toBe('B-2026-0001');
    await expect(
      nextFindingNo(db, new Date('2026-06-02T00:00:00Z')),
    ).resolves.toBe('B-2026-0002');
    await expect(
      nextFindingNo(db, new Date('2027-01-01T00:00:00Z')),
    ).resolves.toBe('B-2027-0001');
  });

  it('aksiyonu bulgu, takibi aksiyon bazında numaralandırır ve parent yılını korur', async () => {
    const db = counterDb();
    const a1 = await nextActionNo(db, 'finding-2', 'B-2026-0002');
    const a2 = await nextActionNo(db, 'finding-2', 'B-2026-0002');
    expect([a1, a2]).toEqual(['A-2026-0002-01', 'A-2026-0002-02']);
    await expect(nextActionNo(db, 'finding-3', 'B-2026-0003')).resolves.toBe(
      'A-2026-0003-01',
    );
    await expect(nextFollowUpNo(db, 'action-1', a1)).resolves.toBe(
      'T-2026-0002-01-01',
    );
    await expect(nextFollowUpNo(db, 'action-1', a1)).resolves.toBe(
      'T-2026-0002-01-02',
    );
    await expect(nextFollowUpNo(db, 'action-2', a2)).resolves.toBe(
      'T-2026-0002-02-01',
    );
  });

  it('eşzamanlı çağrılarda aynı scope içinde benzersiz numaralar üretir', async () => {
    const db = counterDb();
    const ids = await Promise.all(
      Array.from({ length: 20 }, () =>
        nextActionNo(db, 'finding-2', 'B-2026-0002'),
      ),
    );
    expect(new Set(ids).size).toBe(20);
    expect(ids).toContain('A-2026-0002-01');
    expect(ids).toContain('A-2026-0002-20');
  });
});

describe('createWithSequentialId', () => {
  it('benzersizlik ihlalinde (P2002) numarayı yeniden üretip tekrar dener', async () => {
    const ids = ['A-2026-0001', 'A-2026-0002', 'A-2026-0003'];
    let i = 0;
    const nextId = jest
      .fn()
      .mockImplementation(() => Promise.resolve(ids[i++]));
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      )
      .mockResolvedValueOnce({ id: 'x', actionId: 'A-2026-0003' });

    const result = await createWithSequentialId({ nextId, create });

    expect(result).toEqual({ id: 'x', actionId: 'A-2026-0003' });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenLastCalledWith('A-2026-0003');
  });

  it('P2002 dışındaki hatayı yeniden denemeden fırlatır', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { code: 'P2000' }));
    await expect(
      createWithSequentialId({ nextId: () => Promise.resolve('A-1'), create }),
    ).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('deneme sınırı aşılınca son P2002 hatasını fırlatır', async () => {
    const err = Object.assign(new Error('unique'), { code: 'P2002' });
    const create = jest.fn().mockRejectedValue(err);
    await expect(
      createWithSequentialId({
        nextId: () => Promise.resolve('A-1'),
        create,
        retries: 2,
      }),
    ).rejects.toBe(err);
    expect(create).toHaveBeenCalledTimes(3); // ilk deneme + 2 retry
  });
});
