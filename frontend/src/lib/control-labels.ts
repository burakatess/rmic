/** Kontrol sıklığı Türkçe etiketleri — tüm kontrol ekranlarında tek kaynak (ham enum değeri gösterilmez). */
export const FREQUENCY_LABELS: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};

export const frequencyText = (f?: string | null): string => (f ? FREQUENCY_LABELS[f] ?? f : '—');
