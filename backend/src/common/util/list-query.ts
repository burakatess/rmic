import { BadRequestException } from '@nestjs/common';

/**
 * Liste endpoint'leri için ortak sayfalama ve sıralama kuralları.
 *
 * - limit: [1, MAX_PAGE_LIMIT] aralığına sıkıştırılır (sınırsız `take` → bellek/DB yükü).
 *   Mevcut ekranlar seçim listeleri için en fazla 500 istiyor; daha büyük değer
 *   hata değil, tavana indirilir.
 * - sortBy: yalnız modelin skaler alanları (Prisma.<Model>ScalarFieldEnum). İlişki
 *   veya bilinmeyen alan adı Prisma'ya dinamik anahtar olarak geçirilmez → 400.
 */
export const MAX_PAGE_LIMIT = 500;

export function parsePaging(
    query: { page?: unknown; limit?: unknown },
    defaultLimit: number,
    maxLimit = MAX_PAGE_LIMIT,
): { page: number; limit: number; skip: number } {
    const rawPage = parseInt(String(query.page ?? ''), 10);
    const rawLimit = parseInt(String(query.limit ?? ''), 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
    return { page, limit, skip: (page - 1) * limit };
}

export function safeOrderBy(
    sortBy: unknown,
    sortOrder: unknown,
    allowedFields: Record<string, string> | readonly string[],
    fallbackField: string,
    fallbackOrder: 'asc' | 'desc',
): Record<string, 'asc' | 'desc'> {
    const allowed = new Set(Array.isArray(allowedFields) ? allowedFields : Object.values(allowedFields));
    const field = sortBy === undefined || sortBy === null || sortBy === '' ? fallbackField : String(sortBy);
    if (!allowed.has(field)) {
        throw new BadRequestException(`Geçersiz sıralama alanı: ${field.slice(0, 50)}`);
    }
    let order: 'asc' | 'desc' = fallbackOrder;
    if (sortOrder !== undefined && sortOrder !== null && sortOrder !== '') {
        const normalized = String(sortOrder).toLowerCase();
        if (normalized !== 'asc' && normalized !== 'desc') {
            throw new BadRequestException('Geçersiz sıralama yönü: asc veya desc olmalı');
        }
        order = normalized;
    }
    return { [field]: order };
}
