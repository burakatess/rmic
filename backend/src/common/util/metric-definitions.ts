import type { Prisma } from '@prisma/client';
import { startOfDayIstanbul } from './date-scope.util';

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

// ─── Gecikme / yaklaşan tanımı — TEK KAYNAK ──────────────────────────────────
// Liste süzgeçleri, KPI sayaçları, pano, Akış Sağlığı ve kayıt projeksiyonları (workflow-projection.ts)
// AYNI kuralı kullanır; ön yüz gecikmeyi kendisi hesaplamaz, API'nin `timingStatus` alanını gösterir.
//
// Kural: termin gününün SONUNA kadar gecikmiş sayılmaz — eşik, İstanbul takviminde BUGÜNÜN BAŞLANGICIDIR.
// (Önceden liste "terminy anlık saate göre", pano "gün başına göre" hesaplıyordu: termini bugün olan
// kayıt listede gecikmiş, panoda gecikmemiş görünüyordu.)
export const APPROACHING_DAYS = 14;
export const overdueThreshold = (now: Date = new Date()): Date => startOfDayIstanbul(now);

// Aksiyon: sonuçlanmış (kapalı/tamamlanmış/iptal) olmayan VE ikinci kontrolcü tarafından onaylanmış, silinmemiş.
// Taslak/onay bekleyen/reddedilmiş aksiyon henüz iş yürütmediği için gecikmiş sayılmaz.
export const TERMINAL_ACTION_STATUSES = [...CLOSED_ACTION_STATUSES, 'IPTAL'] as const;

type Dated = Date | string | null | undefined;
const t = (d: Dated) => (d ? new Date(d).getTime() : null);

export function isActionOverdue(a: { status: string; dueDate: Dated; approvalState?: string | null; deletedAt?: Dated }, now?: Date): boolean {
    const due = t(a.dueDate);
    if (due === null || a.deletedAt) return false;
    if (a.approvalState && a.approvalState !== 'ONAYLANDI') return false;
    return !(TERMINAL_ACTION_STATUSES as readonly string[]).includes(a.status) && due < overdueThreshold(now).getTime();
}
export function isTestOverdue(x: { status: string; plannedDate: Dated }, now?: Date): boolean {
    const d = t(x.plannedDate);
    return d !== null && (OPEN_TEST_STATUSES as readonly string[]).includes(x.status) && d < overdueThreshold(now).getTime();
}
export function isFollowUpOverdue(x: { status: string; plannedDate: Dated; deletedAt?: Dated }, now?: Date): boolean {
    const d = t(x.plannedDate);
    return d !== null && !x.deletedAt && (OPEN_FOLLOWUP_STATUSES as readonly string[]).includes(x.status) && d < overdueThreshold(now).getTime();
}
// Bulgu: kapanmamış (KAPATILDI/CLOSED değil), iptal değil ve hedef çözüm tarihi geçmiş.
export function isFindingOverdue(x: { targetResolutionDate: Dated; resolutionStatus?: string | null; workflowStatus?: string | null; status?: string | null }, now?: Date): boolean {
    const d = t(x.targetResolutionDate);
    if (d === null || x.resolutionStatus === 'KAPATILDI' || x.workflowStatus === 'IPTAL' || x.status === 'CLOSED') return false;
    return d < overdueThreshold(now).getTime();
}

// Aynı kuralın Prisma karşılıkları (JS koşullarıyla birebir; e2e testi eşitliği doğrular).
export const overdueActionWhere = (now?: Date): Prisma.ActionWhereInput => ({
    approvalState: 'ONAYLANDI', deletedAt: null, status: { notIn: [...TERMINAL_ACTION_STATUSES] as never }, dueDate: { lt: overdueThreshold(now) },
});
export const overdueTestWhere = (now?: Date): Prisma.ControlTestWhereInput => ({
    status: { in: [...OPEN_TEST_STATUSES] }, plannedDate: { lt: overdueThreshold(now) },
});
export const overdueFollowUpWhere = (now?: Date): Prisma.FindingFollowUpWhereInput => ({
    status: { in: [...OPEN_FOLLOWUP_STATUSES] }, deletedAt: null, plannedDate: { lt: overdueThreshold(now) },
});
const openFindingWhere = { resolutionStatus: { not: 'KAPATILDI' as const }, workflowStatus: { not: 'IPTAL' as const }, status: { not: 'CLOSED' as const } };
export const overdueFindingWhere = (now?: Date): Prisma.FindingWhereInput => ({
    ...openFindingWhere, targetResolutionDate: { lt: overdueThreshold(now) },
});
export const approachingFindingWhere = (now: Date = new Date()): Prisma.FindingWhereInput => ({
    ...openFindingWhere, targetResolutionDate: { gte: overdueThreshold(now), lte: new Date(now.getTime() + APPROACHING_DAYS * 86400000) },
});
