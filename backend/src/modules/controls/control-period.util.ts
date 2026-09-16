import { ControlFrequency } from '@prisma/client';

export interface ScopePeriod {
    periodKey: string;
    periodLabel: string;
    start: Date;
    end: Date;
    targetDate: Date;
}

/** Ayın son iş gününü döner (Cmt→Cuma, Paz→Cuma). Native Date rollover kullanır — artık yıl güvenli. */
export function getLastBusinessDay(year: number, month: number): Date {
    const lastDay = new Date(year, month + 1, 0);
    const dow = lastDay.getDay();
    if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
    else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
    return lastDay;
}

/** Yılın tüm Cuma tarihlerini döner (ISO hafta başına 1) */
export function getFridaysInYear(year: number): Date[] {
    const fridays: Date[] = [];
    const d = new Date(year, 0, 1);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    while (d.getFullYear() === year) {
        fridays.push(new Date(d));
        d.setDate(d.getDate() + 7);
    }
    return fridays;
}

export const TURKISH_MONTH_INDEX: Record<string, number> = {
    'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
    'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11,
};

const MONTH_LABEL_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const FREQ_GROUP_LABEL_TR: Partial<Record<ControlFrequency, string>> = {
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık',
};

function endOfDay(d: Date): Date {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e;
}

/** 1-12 ay numarası dizisini Türkçe ay adı dizisine çevirir (görüntü/saklama amaçlı). */
export function monthNumbersToLabels(months: number[]): string[] {
    return months.map(m => MONTH_LABEL_TR[m - 1]);
}

/**
 * Referans ay + sıklığa göre aynı yıl içindeki ay grubunu döner (1-12).
 * Her zaman kronolojik sırada. QUARTERLY/SEMI_ANNUAL/ANNUAL için kullanıcı
 * seçimi budur — MONTHLY zaten tüm ayları kullanır, bu fonksiyona girmez.
 */
export function computeMonthGroup(frequency: ControlFrequency, referenceMonth: number): number[] {
    if (referenceMonth < 1 || referenceMonth > 12) {
        throw new Error(`computeMonthGroup: geçersiz referenceMonth (${referenceMonth}) — 1-12 olmalı`);
    }
    switch (frequency) {
        case 'MONTHLY':
            return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        case 'QUARTERLY':
            return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                .filter(m => (((m - referenceMonth) % 3) + 3) % 3 === 0);
        case 'SEMI_ANNUAL': {
            const other = referenceMonth <= 6 ? referenceMonth + 6 : referenceMonth - 6;
            return [referenceMonth, other].sort((a, b) => a - b);
        }
        case 'ANNUAL':
            return [referenceMonth];
        default:
            throw new Error(`computeMonthGroup: ${frequency} referans-ay seçimi kullanmaz`);
    }
}

/**
 * Frekansa göre takvim-doğru dönem listesi üretir. Çeyrek/yarıyıl/ay sınırları
 * gerçek takvim aralıklarıdır (kullanıcı seçimi değil) — hedef tarih için mevcut
 * getLastBusinessDay yeniden kullanılır.
 */
export function computeScopePeriods(
    frequency: ControlFrequency,
    year: number,
    opts: { selectedMonths?: string[]; controlDate?: Date | null; referenceMonth?: number | null } = {},
): ScopePeriod[] {
    // Referans-ay seçimi verilmişse QUARTERLY/SEMI_ANNUAL/ANNUAL için M01..M12
    // periodKey uzayını kullan (MONTHLY ile aynı anahtar uzayı — bkz. plan D4:
    // bu sayede changePeriodicity'nin var olan periodKey-diff mantığı ay-grubu
    // değişikliğini de otomatik doğru eşler, yeni bir remap mekanizması gerekmez).
    // referenceMonth verilmemişse (eski/legacy scope kayıtları) aşağıdaki sabit-
    // takvim dalları AYNEN çalışmaya devam eder — geriye dönük uyumluluk korunur.
    if (opts.referenceMonth != null && (frequency === 'ANNUAL' || frequency === 'SEMI_ANNUAL' || frequency === 'QUARTERLY')) {
        const months = computeMonthGroup(frequency, opts.referenceMonth);
        const groupLabel = FREQ_GROUP_LABEL_TR[frequency];
        return months.map(m => ({
            periodKey: `M${m.toString().padStart(2, '0')}`,
            periodLabel: `${MONTH_LABEL_TR[m - 1]} ${year} — ${groupLabel} uygulama ayı`,
            start: new Date(year, m - 1, 1),
            end: endOfDay(new Date(year, m, 0)),
            targetDate: getLastBusinessDay(year, m - 1),
        }));
    }
    switch (frequency) {
        case 'ANNUAL': {
            const target = getLastBusinessDay(year, 11);
            return [{
                periodKey: 'YEAR', periodLabel: `${year} Yılı`,
                start: new Date(year, 0, 1), end: endOfDay(new Date(year, 11, 31)), targetDate: target,
            }];
        }
        case 'SEMI_ANNUAL': {
            return [
                { periodKey: 'H1', periodLabel: `${year} — 1. Yarıyıl (Oca-Haz)`, start: new Date(year, 0, 1), end: endOfDay(new Date(year, 5, 30)), targetDate: getLastBusinessDay(year, 5) },
                { periodKey: 'H2', periodLabel: `${year} — 2. Yarıyıl (Tem-Ara)`, start: new Date(year, 6, 1), end: endOfDay(new Date(year, 11, 31)), targetDate: getLastBusinessDay(year, 11) },
            ];
        }
        case 'QUARTERLY': {
            const labels = ['1. Çeyrek (Oca-Mar)', '2. Çeyrek (Nis-Haz)', '3. Çeyrek (Tem-Eyl)', '4. Çeyrek (Eki-Ara)'];
            const periods: ScopePeriod[] = [];
            for (let q = 0; q < 4; q++) {
                const startMonth = q * 3;
                const endMonth = startMonth + 2;
                periods.push({
                    periodKey: `Q${q + 1}`,
                    periodLabel: `${year} — ${labels[q]}`,
                    start: new Date(year, startMonth, 1),
                    end: endOfDay(new Date(year, endMonth + 1, 0)),
                    targetDate: getLastBusinessDay(year, endMonth),
                });
            }
            return periods;
        }
        case 'MONTHLY': {
            const periods: ScopePeriod[] = [];
            for (let m = 0; m < 12; m++) {
                periods.push({
                    periodKey: `M${(m + 1).toString().padStart(2, '0')}`,
                    periodLabel: `${MONTH_LABEL_TR[m]} ${year}`,
                    start: new Date(year, m, 1),
                    end: endOfDay(new Date(year, m + 1, 0)),
                    targetDate: getLastBusinessDay(year, m),
                });
            }
            return periods;
        }
        case 'WEEKLY': {
            const fridays = getFridaysInYear(year);
            return fridays.map((f, idx) => ({
                periodKey: `W${(idx + 1).toString().padStart(2, '0')}`,
                periodLabel: `${year} — Hafta ${idx + 1} (${f.toLocaleDateString('tr-TR')})`,
                start: f,
                end: endOfDay(f),
                targetDate: f,
            }));
        }
        case 'DAILY':
            // Günlük kontroller için otomatik dönem/task üretilmez (legacy davranışla
            // aynı — aşırı task patlaması riski, bkz. plan "Bilinçli Varsayımlar").
            return [];
        case 'AD_HOC':
        default: {
            // Tekil tarih: scope.controlDate > selectedMonths[0] (son iş günü) > yılın son iş günü
            let target: Date;
            if (opts.controlDate) {
                target = opts.controlDate;
            } else if (opts.selectedMonths && opts.selectedMonths.length > 0) {
                const mi = TURKISH_MONTH_INDEX[opts.selectedMonths[0]];
                target = mi !== undefined ? getLastBusinessDay(year, mi) : getLastBusinessDay(year, 11);
            } else {
                target = getLastBusinessDay(year, 11);
            }
            return [{
                periodKey: 'ADHOC', periodLabel: `${year} — Arızi`,
                start: new Date(year, 0, 1), end: endOfDay(new Date(year, 11, 31)), targetDate: target,
            }];
        }
    }
}
