import { nextCounterValue } from '../../common/util/sequential-id';

/**
 * Kalıcı kontrol kodu — BTK-XXXX, yıl içermez. `RecordCounter` (scope:
 * 'control-code') üzerinden atomik üretilir — aynı deseni actions/audits/
 * risk-simulation modülleri de kullanıyor (bkz. common/util/sequential-id.ts).
 * padStart(4,'0') 9999 sonrası kesmez, doğal olarak 5+ haneye genişler.
 */
export async function generateControlCode(db: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> }): Promise<string> {
    const value = await nextCounterValue(db, 'control-code');
    return `BTK-${value.toString().padStart(4, '0')}`;
}
