/**
 * Ortak metrik/statü tanımları — rapor ve çalışma panosu sayaçları AYNI
 * tanımı kullanmalı (Madde 8). Yeni bir "kapanmış/iptal/aktif" kontrolü
 * eklerken burayı genişlet, inline literal dizi yazma.
 */

// "Kapanmış/tamamlanmış" aksiyon statüleri — Türkçe kanonik + legacy İngilizce.
export const CLOSED_ACTION_STATUSES = ['CLOSED', 'COMPLETED', 'KAPATILDI', 'TAMAMLANDI'] as const;

// Kontrol testi — iptal/kapsam dışı (aktif iş yüküne ve tamamlanma paydasına girmez).
export const CANCELLED_TEST_STATUSES = ['IPTAL', 'KAPSAM_DISI'] as const;

// Kontrol testi — aktif iş yükü/gecikme hesabına giren statüler (iptal/kapsam dışı hariç).
export const ACTIVE_TEST_STATUSES = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'GERI_GONDERILDI', 'ONAYLANDI'] as const;

// Kontrol testi — henüz onaylanmamış, gecikme sayılabilecek statüler.
export const OPEN_TEST_STATUSES = ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] as const;

// Bulgu — kapanmamış (açık) durum filtresi.
export const OPEN_FINDING_WHERE = { not: 'CLOSED' } as const;

// Takip çalışması — henüz sonuçlanmamış statüler.
export const OPEN_FOLLOWUP_STATUSES = ['BEKLIYOR', 'DEVAM_EDIYOR'] as const;
