'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { PageShell, PageHeader, StatusBadge, LoadingState, EmptyState, Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const taskStatusLabel: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Onay Bekliyor', variant: 'info' },
    GERI_GONDERILDI: { label: 'Geri Gönderildi', variant: 'critical' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
    KAPSAM_DISI: { label: 'Kapsam Dışı', variant: 'neutral' },
};
const resultLabel: Record<string, { label: string; variant: BV }> = {
    BULGUSU_YOK: { label: 'Uygun', variant: 'success' },
    BULGUSU_VAR: { label: 'Bulgu Var', variant: 'critical' },
};

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};
const fmtDateTime = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('tr-TR');
};

export default function PeriodControlDetailPage() {
    const params = useParams<{ scopeId: string }>();
    const router = useRouter();
    const { success, error: showError } = useToast();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [versionModalOpen, setVersionModalOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [versionPreview, setVersionPreview] = useState<any>(null);
    const [confirmOngoing, setConfirmOngoing] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!params.scopeId) return;
        setLoading(true);
        try {
            const d = await api.getPeriodControlDetail(params.scopeId);
            setDetail(d);
        } catch {
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }, [params.scopeId]);

    useEffect(() => { load(); }, [load]);

    const openVersionModal = async () => {
        setVersionModalOpen(true);
        setConfirmOngoing(false);
        setVersionPreview(null);
        try {
            const r = await api.applyControlVersion(detail.control.id, detail.year, { dryRun: true });
            setVersionPreview(r);
        } catch {
            showError('Hata', 'Önizleme yüklenemedi.');
        }
    };

    const applyVersion = async () => {
        setBusy(true);
        try {
            const r = await api.applyControlVersion(detail.control.id, detail.year, { confirmOngoing });
            if (r.requiresDecision) {
                setVersionPreview({ ...versionPreview, ongoingTasks: r.ongoingTasks, requiresDecision: true });
                showError('Karar Gerekli', 'Devam eden testler var — onaylayarak devam edin.');
                return;
            }
            success('Başarılı', 'Yeni kontrol sürümü bu döneme uygulandı.');
            setVersionModalOpen(false);
            load();
        } catch {
            showError('Hata', 'Sürüm uygulama başarısız oldu.');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <PageShell><LoadingState message="Dönem kontrolü yükleniyor..." /></PageShell>;
    }
    if (!detail) {
        return (
            <PageShell>
                <EmptyState title="Dönem kontrolü bulunamadı" description="Aradığınız kayıt mevcut değil veya erişim yetkiniz yok."
                    actionLabel="Dönem Kontrollerine Dön" onAction={() => router.push('/controls/agenda')} />
            </PageShell>
        );
    }

    const describeMonths = () => {
        if (detail.frequency === 'MONTHLY') return 'Her ay';
        if (detail.frequency === 'WEEKLY') return 'Her Cuma';
        if (detail.selectedMonths?.length > 0) return detail.selectedMonths.join(', ');
        return '—';
    };

    const activeTests = (detail.tests || []).filter((t: any) => t.status !== 'IPTAL' && t.status !== 'KAPSAM_DISI');
    const completedCount = activeTests.filter((t: any) => t.status === 'ONAYLANDI').length;
    const withFindings = activeTests.filter((t: any) => t.findingStatus === 'BULGUSU_VAR');

    return (
        <PageShell>
            <PageHeader
                title={detail.code || `${detail.year}.${detail.control.controlId}`}
                description={detail.control.name}
                breadcrumbs={[
                    { label: 'Kontrol Yönetimi' },
                    { label: 'Dönem Kontrolleri', href: '/controls/agenda' },
                    { label: detail.code || detail.year },
                ]}
                badge={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant={detail.status === 'ACTIVE' ? 'success' : 'neutral'}>{detail.status === 'ACTIVE' ? 'Kapsamda' : 'Kapsam Dışı'}</StatusBadge>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{frequencyLabel[detail.frequency] || detail.frequency}</span>
                        {detail.hasNewControlVersion && <StatusBadge variant="warning" dot>Kaynak kontrolde yeni sürüm var</StatusBadge>}
                    </div>
                }
                actions={
                    <div className="flex items-center gap-2">
                        <Link href={`/controls/${detail.control.id}`} target="_blank" className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-slate-400">
                            Kaynak Kontrol: {detail.control.controlId}
                        </Link>
                        <Link href={`/controls/annual-plan?year=${detail.year}`} target="_blank" className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-slate-400">
                            Yıllık Plan: {detail.year}
                        </Link>
                        {detail.hasNewControlVersion && (
                            <Button variant="primary" size="sm" onClick={openVersionModal}>Yeni Sürümü Uygula</Button>
                        )}
                    </div>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Kontrol Tanımı & Test Adımları (dönemin donmuş snapshot'ı) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Kontrol Tanımı (Bu dönemde kullanılan sürüm)</h3>
                        <p className="text-sm font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap">{detail.snapshot?.description || detail.control.description || 'Tanım girilmemiş.'}</p>
                        {detail.snapshot?.testSteps && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Test Adımları</p>
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.snapshot.testSteps}</p>
                            </div>
                        )}
                        {detail.snapshot?.mehaz && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Mehaz</p>
                                <p className="text-sm text-slate-600">{detail.snapshot.mehaz}</p>
                            </div>
                        )}
                    </div>

                    {/* Takvim */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">{detail.year} Yılı Takvimi</h3>
                        <p className="text-sm text-slate-700"><span className="font-bold">{frequencyLabel[detail.frequency] || detail.frequency}</span> — Uygulama ayları: {describeMonths()}</p>
                        {detail.copiedFromYear && <p className="text-xs text-slate-400 mt-1">Kaynak: {detail.copiedFromYear} yılından kopyalandı</p>}
                    </div>

                    {/* Test Listesi */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="p-5 pb-0 flex items-center justify-between">
                            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Testler ({completedCount}/{activeTests.length} onaylandı)</h3>
                        </div>
                        {(detail.tests || []).length === 0 ? (
                            <p className="text-sm text-slate-400 p-5">Bu dönem için henüz test bulunmuyor.</p>
                        ) : (
                            <table className="w-full text-sm mt-3">
                                <thead className="bg-slate-50 border-y border-slate-200 text-left text-[10px] font-bold text-slate-400 uppercase">
                                    <tr>
                                        <th className="px-5 py-2">Test Kodu</th>
                                        <th className="px-3 py-2">Hedef Tarih</th>
                                        <th className="px-3 py-2">İş Akışı Durumu</th>
                                        <th className="px-3 py-2">Kontrol Sonucu</th>
                                        <th className="px-3 py-2">Bulgu</th>
                                        <th className="px-5 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {(detail.tests || []).map((t: any) => {
                                        const st = taskStatusLabel[t.status];
                                        const rs = t.findingStatus ? resultLabel[t.findingStatus] : null;
                                        return (
                                            <tr key={t.id} className="border-b border-slate-50 last:border-0">
                                                <td className="px-5 py-2.5 font-mono font-bold text-slate-700">{t.testNo}</td>
                                                <td className="px-3 py-2.5 text-slate-500">{fmt(t.plannedDate)}</td>
                                                <td className="px-3 py-2.5">{st ? <StatusBadge variant={st.variant} size="sm">{st.label}</StatusBadge> : t.status}</td>
                                                <td className="px-3 py-2.5">{rs ? <StatusBadge variant={rs.variant} size="sm">{rs.label}</StatusBadge> : <span className="text-slate-300">—</span>}</td>
                                                <td className="px-3 py-2.5">
                                                    {t.findings?.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                            {t.findings.map((f: any) => (
                                                                <Link key={f.id} href={`/findings/${f.id}`} target="_blank" className="text-[11px] font-mono font-bold text-rose-600 hover:underline">{f.findingId}</Link>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-5 py-2.5 text-right">
                                                    <Link href={`/controls/testing/${t.id}`} target="_blank" className="text-xs font-bold text-emerald-700 hover:underline">
                                                        {['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(t.status) ? 'Testi Aç →' : 'Görüntüle →'}
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Kontrolcüler</h3>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atanan Kontrolcü</p>
                                <p className="font-bold text-slate-800">{detail.assignee ? `${detail.assignee.firstName} ${detail.assignee.lastName}` : 'Atanmamış'}</p>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İkinci Kontrolcü</p>
                                <p className="font-bold text-slate-800">{detail.secondController ? `${detail.secondController.firstName} ${detail.secondController.lastName}` : 'Atanmamış'}</p>
                            </div>
                        </div>
                    </div>

                    {withFindings.length > 0 && (
                        <div className="bg-white rounded-2xl border border-rose-200 p-5">
                            <h3 className="text-xs font-extrabold text-rose-500 uppercase tracking-wider mb-3">İlgili Bulgular</h3>
                            <div className="space-y-2">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {withFindings.flatMap((t: any) => (t.findings || []).map((f: any) => (
                                    <Link key={f.id} href={`/findings/${f.id}`} target="_blank" className="block text-xs font-mono font-bold text-rose-600 hover:underline">{f.findingId}</Link>
                                )))}
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Plan / Atama Değişiklik Geçmişi</h3>
                        {(detail.history || []).length === 0 ? (
                            <p className="text-xs text-slate-400">Kayıt bulunamadı.</p>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {detail.history.map((h: any) => (
                                    <div key={h.id} className="text-xs border-b border-slate-100 pb-2">
                                        <span className="font-bold text-slate-700">{h.action}</span>
                                        <span className="text-slate-400"> · {fmtDateTime(h.createdAt)} · {h.user ? `${h.user.firstName} ${h.user.lastName}` : 'Sistem'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} title="Yeni Kontrol Sürümünü Bu Döneme Uygula" size="md"
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setVersionModalOpen(false)}>Vazgeç</Button>
                    <Button variant="primary" onClick={applyVersion} disabled={busy || (versionPreview?.ongoingTasks?.length > 0 && !confirmOngoing)}>
                        {busy ? 'İşleniyor...' : 'Uygula'}
                    </Button>
                </div>}
            >
                {!versionPreview ? (
                    <p className="text-sm text-slate-400">Önizleme yükleniyor...</p>
                ) : (
                    <div className="space-y-4 text-sm">
                        <p>Kaynak kontrol sürüm <span className="font-bold">{versionPreview.fromVersion}</span> → <span className="font-bold">{versionPreview.toVersion}</span> olarak güncellenecek.</p>
                        <p className="text-xs text-slate-500">Bu değişiklik yalnızca bu dönemin gösterdiği tanım/test adımları snapshot'ını günceller — tamamlanmış testlerin kendi kayıtlı değerlendirmesi asla değişmez.</p>
                        {versionPreview.ongoingTasks?.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Devam eden/onay bekleyen testler var</p>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {versionPreview.ongoingTasks.map((t: any) => (
                                    <p key={t.id} className="text-xs text-amber-900">{t.testNo} — {t.periodLabel} ({taskStatusLabel[t.status]?.label || t.status})</p>
                                ))}
                                <label className="flex items-center gap-2 text-xs font-bold text-amber-900 pt-1">
                                    <input type="checkbox" checked={confirmOngoing} onChange={(e) => setConfirmOngoing(e.target.checked)} />
                                    Devam eden testler varken uygulamayı onaylıyorum
                                </label>
                            </div>
                        )}
                        {!versionPreview.ongoingTasks?.length && (versionPreview.notStartedTaskCount ?? 0) >= 0 && (
                            <p className="text-xs text-slate-500">{versionPreview.notStartedTaskCount ?? 0} henüz başlamamış test etkilenecek.</p>
                        )}
                    </div>
                )}
            </Modal>
        </PageShell>
    );
}
