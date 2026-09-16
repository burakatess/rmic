/**
 * Tarih-only alanlar (plannedDate/dueDate) UTC gece yarısında saklanan
 * takvim tarihleridir. "Gecikmiş" hesabı kurumun saat dilimiyle (İstanbul,
 * UTC+3, 2016'dan beri DST yok — sabit ofset yeterli) tutarlı olmalı: gün
 * sonuna kadar süresi olan bir iş, gün BAŞINDA gecikmiş sayılmamalı.
 *
 * Yalnızca YENİ Çalışma Panosu sorgularında kullanılır — mevcut modüllerdeki
 * `dueDate < now` karşılaştırmaları bu görevin kapsamı dışında (refactör
 * genişletmesi yapılmadı, bkz. plan).
 */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Verilen anın İstanbul takviminde karşılık geldiği günün UTC gece yarısı anı. */
export function startOfDayIstanbul(date: Date): Date {
    const istanbulLocal = new Date(date.getTime() + ISTANBUL_OFFSET_MS);
    istanbulLocal.setUTCHours(0, 0, 0, 0);
    return new Date(istanbulLocal.getTime() - ISTANBUL_OFFSET_MS);
}

/** Verilen anın İstanbul takviminde karşılık geldiği günün son anı (23:59:59.999). */
export function endOfDayIstanbul(date: Date): Date {
    return new Date(startOfDayIstanbul(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** [şimdi, şimdi + N gün sonunun İstanbul gün sonu] aralığı — "yaklaşan" göstergeleri için. */
export function daysFromNowRangeIstanbul(days: number, from: Date = new Date()): { start: Date; end: Date } {
    return { start: from, end: endOfDayIstanbul(new Date(from.getTime() + days * 24 * 60 * 60 * 1000)) };
}
