import { BadRequestException } from '@nestjs/common';

/**
 * DTO → Prisma tarih alanı: undefined = dokunma, null/'' = temizle, metin = Date.
 * Ham 'YYYY-MM-DD' metni Prisma DateTime'a geçirilemez (ISO-8601 tam tarih ister).
 */
export function toDateField(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new BadRequestException(`Geçersiz tarih: ${value}`);
    return d;
}

/** undefined olmayan alanları alır (kısmi güncellemede dokunulmayan alan yazılmaz). */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Yabancı anahtar listesinin tamamı var mı — yoksa okunur 400 (Prisma FK hatası değil). */
export async function assertAllExist(
    count: (ids: string[]) => Promise<number>, ids: string[] | undefined, label: string,
): Promise<string[] | undefined> {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)];
    if (unique.length && (await count(unique)) !== unique.length) {
        throw new BadRequestException(`Geçersiz ${label}: seçilen kayıtlardan bazıları bulunamadı`);
    }
    return unique;
}
