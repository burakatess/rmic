// Backend'deki computeMonthGroup'un (backend/src/modules/controls/control-period.util.ts)
// TS portu — yalnızca ANLIK UI önizlemesi için. Kalıcı hesap her zaman backend'de
// yapılır (referenceMonth gönderilir, selectedMonths backend'de hesaplanır) —
// bu dosya asla kayıt/persist yolunda tek doğruluk kaynağı olarak kullanılmaz.

export const MONTH_LABELS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function computeMonthGroup(frequency: string, referenceMonth: number): number[] {
    if (referenceMonth < 1 || referenceMonth > 12) return [];
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
            return [];
    }
}
