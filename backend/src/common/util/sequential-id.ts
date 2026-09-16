/**
 * Sıralı, insan-okur kayıt numarası üretimi (A-2026-0007, T-2026-0012 …).
 *
 * Atomik yaklaşım (yeğlenen): `RecordCounter` tablosunda tek deyimlik
 * `UPDATE ... value = value + 1 RETURNING value`. Yarış-koşulu YOK, retry
 * gerektirmez, transaction içinde güvenlidir (aborted-tx sorunu yok).
 */

interface RawClient {
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 * `RecordCounter` sayacını atomik olarak 1 artırıp yeni değeri döndürür.
 * Sayaç satırı yoksa 1'den başlatır (migration mevcut kayıtlardan tohumlar).
 */
export async function nextCounterValue(db: RawClient, scope: string): Promise<number> {
    const rows = await db.$queryRawUnsafe<{ value: number }[]>(
        `INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
         VALUES ($1, 1, NOW())
         ON CONFLICT ("scope")
         DO UPDATE SET "value" = "RecordCounter"."value" + 1, "updatedAt" = NOW()
         RETURNING "value"`,
        scope,
    );
    return rows[0].value;
}

/** `A-2026-0007` biçimli numara — yıl yalnızca gösterim; sıra sayacı yıldan bağımsız. */
export function formatRecordId(letter: string, value: number, year = new Date().getFullYear()): string {
    return `${letter}-${year}-${value.toString().padStart(4, '0')}`;
}

// ─── Geriye dönük: P2002-retry sarmalayıcı (sequence-dışı çağrılar için) ──────
export async function createWithSequentialId<T>(opts: {
    create: (candidateId: string) => Promise<T>;
    nextId: () => Promise<string>;
    retries?: number;
}): Promise<T> {
    const retries = opts.retries ?? 5;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const candidate = await opts.nextId();
        try {
            return await opts.create(candidate);
        } catch (e) {
            if (isUniqueViolation(e)) {
                lastErr = e;
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

function isUniqueViolation(e: unknown): boolean {
    return !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002';
}
