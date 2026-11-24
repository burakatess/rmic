/**
 * Sayfalı liste uçlarının TÜM kayıtlarını getirir. Seçim listeleri ve envanter ekranları yanıtı
 * tam liste varsayar; tek sayfa istemek (sunucu tavanı 500) kalan kayıtları SESSİZCE düşürürdü.
 *
 * Yanıt biçimleri: `{ data, pagination: { total } }`, `{ data, total }` veya düz dizi (sayfalanmayan uç).
 * Toplam sayı bilinmiyorsa tek sayfa tam sayılır. Güvenlik tavanı `maxPages` aşılırsa `truncated: true`
 * döner (çağıran kullanıcıyı uyarabilir) — kayıtlar yine de sessizce atılmaz, tavan açıkça bildirilir.
 */
export interface ListAllResult<T> {
    data: T[];
    pagination: { total: number; page: 1; limit: number; totalPages: 1; truncated: boolean };
}

type PageResponse<T> = T[] | { data?: T[]; total?: number; pagination?: { total?: number } };

export const LIST_PAGE_SIZE = 500; // backend MAX_PAGE_LIMIT (list-query.ts) ile aynı
const PARALLEL = 5;

export async function fetchAllPages<T>(
    fetchPage: (page: number, limit: number) => Promise<unknown>,
    opts: { pageSize?: number; maxPages?: number } = {},
): Promise<ListAllResult<T>> {
    const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
    const maxPages = opts.maxPages ?? 40;
    const first = (await fetchPage(1, pageSize)) as PageResponse<T>;

    if (Array.isArray(first)) {
        return { data: first, pagination: { total: first.length, page: 1, limit: pageSize, totalPages: 1, truncated: false } };
    }
    const items = first?.data ?? [];
    const total = first?.pagination?.total ?? first?.total;
    if (typeof total !== 'number' || items.length >= total) {
        return { data: items, pagination: { total: total ?? items.length, page: 1, limit: pageSize, totalPages: 1, truncated: false } };
    }

    const needed = Math.ceil(total / pageSize);
    const pages = Math.min(needed, maxPages);
    const rest: T[][] = [];
    for (let start = 2; start <= pages; start += PARALLEL) {
        const batch = Array.from({ length: Math.min(PARALLEL, pages - start + 1) }, (_, i) => start + i);
        const results = await Promise.all(batch.map(async p => ((await fetchPage(p, pageSize)) as { data?: T[] })?.data ?? []));
        rest.push(...results);
    }
    const data = items.concat(...rest);
    const truncated = needed > maxPages;
    if (truncated) console.warn(`Liste ${total} kayıt içeriyor; ilk ${data.length} kayıt getirildi (güvenlik tavanı).`);
    return { data, pagination: { total, page: 1, limit: pageSize, totalPages: 1, truncated } };
}

/** `limit` verilmemiş veya sunucu tavanına eşit/üstündeyse çağıran TAM liste istiyordur. */
export const wantsAll = (limit: unknown): boolean => limit === undefined || limit === null || limit === '' || Number(limit) >= LIST_PAGE_SIZE;
