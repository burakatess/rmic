import { fetchAllPages, wantsAll } from '@/lib/list-all';

const make = (total: number, shape: 'pagination' | 'flat' = 'pagination') => {
    const calls: number[] = [];
    const fn = jest.fn(async (page: number, limit: number) => {
        calls.push(page);
        const start = (page - 1) * limit;
        const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: start + i }));
        return shape === 'pagination' ? { data, pagination: { total } } : { data, total };
    });
    return { fn, calls };
};

describe('fetchAllPages — 500 sınırı sessizce kayıt düşürmez', () => {
    it('tek sayfaya sığan liste için yalnız bir istek yapar', async () => {
        const { fn } = make(120);
        const r = await fetchAllPages<{ id: number }>(fn, { pageSize: 500 });
        expect(r.data).toHaveLength(120);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(r.pagination.truncated).toBe(false);
    });

    it('500\'ü aşan listeyi tüm sayfalarıyla, sırayla ve kopyasız getirir', async () => {
        const { fn } = make(1234);
        const r = await fetchAllPages<{ id: number }>(fn, { pageSize: 500 });
        expect(r.data).toHaveLength(1234);
        expect(r.data.map(x => x.id)).toEqual(Array.from({ length: 1234 }, (_, i) => i));
        expect(fn).toHaveBeenCalledTimes(3);
        expect(r.pagination).toMatchObject({ total: 1234, truncated: false });
    });

    it('düz `total` alanlı yanıt biçimini de destekler (risk kontrolleri/aksiyonları)', async () => {
        const { fn } = make(1001, 'flat');
        expect((await fetchAllPages(fn, { pageSize: 500 })).data).toHaveLength(1001);
    });

    it('sayfalanmayan (düz dizi) uçta tek istekle döner', async () => {
        const fn = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
        const r = await fetchAllPages(fn);
        expect(r.data).toHaveLength(2);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('toplam bilinmiyorsa gelen sayfa tam kabul edilir', async () => {
        const fn = jest.fn().mockResolvedValue({ data: [{ id: 1 }] });
        expect((await fetchAllPages(fn)).data).toHaveLength(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('güvenlik tavanı aşılırsa truncated bildirilir (sessiz değil)', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { fn } = make(2600);
        const r = await fetchAllPages(fn, { pageSize: 500, maxPages: 3 });
        expect(r.data).toHaveLength(1500);
        expect(r.pagination).toMatchObject({ total: 2600, truncated: true });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('bir sayfa hata verirse hata iletilir (kısmi liste dönmez)', async () => {
        const fn = jest.fn(async (page: number) => { if (page === 2) throw new Error('ağ hatası'); return { data: Array.from({ length: 500 }, (_, i) => ({ id: i })), pagination: { total: 900 } }; });
        await expect(fetchAllPages(fn, { pageSize: 500 })).rejects.toThrow('ağ hatası');
    });

    it('wantsAll: limit yok veya sunucu tavanı → tüm liste; küçük limit → tek sayfa', () => {
        expect([undefined, null, '', 500, '500', 1000].every(wantsAll)).toBe(true);
        expect([10, '25', 200, 499].some(wantsAll)).toBe(false);
    });
});
