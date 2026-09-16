import { nextCounterValue } from '../../common/util/sequential-id';

/**
 * Yeni test kodu — YYYY-BTK-XXXX-TN. Sayaç `RecordCounter`'da
 * `test-code:{controlId}:{year}` scope'uyla tutulur: her (kontrol, yıl)
 * çifti için bağımsız, her yeni yılda doğal olarak T1'den başlar (yeni
 * scope satırı), iptal edilen numara asla tekrar kullanılmaz (sayaç yalnızca
 * artar), AD_HOC testler de aynı sayaçtan çeker (aynı controlId+year).
 *
 * `nextCounterValue` tek deyimlik atomik UPDATE...RETURNING kullanır, bu
 * yüzden bir transaction içinde ardışık çağrılar (örn. 12 aylık task'ı tek
 * seferde üretirken) her biri gerçek, taahhüt-beklemeyen bir artış görür —
 * eski `findFirst(orderBy desc)+1` deseninin (aynı transaction içindeki
 * commit-edilmemiş satırları görememe) yarattığı çakışma riski burada yok.
 */
export async function nextTestCode(
    db: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> },
    controlId: string,
    controlCode: string,
    year: number,
): Promise<string> {
    const n = await nextCounterValue(db, `test-code:${controlId}:${year}`);
    return `${year}-${controlCode}-T${n}`;
}
