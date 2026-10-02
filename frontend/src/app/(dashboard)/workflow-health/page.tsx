'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import { ErrorState, KpiCard, KpiGrid, LoadingState, PageHeader, PageShell, StatusBadge } from '@/components/ui';

type HealthItem = {
    code: string; severity: 'CRITICAL' | 'WARNING' | 'INFO'; entityType: string; entityId: string;
    title: string; message: string; nextAction: string; href: string; year?: number;
};

const CODE_LABELS: Record<string, string> = {
    PLAN_ASSIGNMENT_MISSING: 'Eksik kontrolcü ataması',
    PLAN_APPROVAL_PENDING: 'Plan onayı bekleniyor',
    TEST_OVERDUE_NOT_STARTED: 'Gecikmiş kontrol testi',
    TEST_APPROVAL_PENDING: 'Test onayı bekleniyor',
    FINDING_WITHOUT_ACTION: 'Aksiyonsuz bulgu',
    ACTION_OVERDUE: 'Gecikmiş aksiyon',
    ACTION_COMPLETED_NO_FOLLOWUP: 'Takibi açılmamış aksiyon',
    FOLLOWUP_APPROVAL_PENDING: 'Takip onayı bekleniyor',
    CONTROL_VERSION_OUTDATED: 'Eski kontrol sürümü',
};

const FLOW = [
    ['Yıllık Plan', ['PLAN_ASSIGNMENT_MISSING', 'PLAN_APPROVAL_PENDING']],
    ['Dönem Kontrolü / Test', ['TEST_OVERDUE_NOT_STARTED', 'TEST_APPROVAL_PENDING', 'CONTROL_VERSION_OUTDATED']],
    ['Bulgu', ['FINDING_WITHOUT_ACTION']],
    ['Aksiyon', ['ACTION_OVERDUE', 'ACTION_COMPLETED_NO_FOLLOWUP']],
    ['Bulgu Takip', ['FOLLOWUP_APPROVAL_PENDING']],
] as const;

export default function WorkflowHealthPage() {
    const [summary, setSummary] = useState<any>(null);
    const [items, setItems] = useState<HealthItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [severity, setSeverity] = useState('');
    const [code, setCode] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = { year, severity: severity || undefined, code: code || undefined, scope: 'ORG' };
            const [s, list] = await Promise.all([api.getWorkflowHealthSummary({ year, scope: 'ORG' }), api.getWorkflowHealthItems(params)]);
            setSummary(s); setItems(list.data || []);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Akış sağlığı verileri alınamadı.');
        } finally { setLoading(false); }
    }, [year, severity, code]);

    useEffect(() => { load(); }, [load]);

    return (
        <PageShell>
            <PageHeader title="Akış Sağlığı" description="Kontrol Envanterinden Bulgu Takibe kadar eksik sonraki adımları ve gecikmeleri gösterir." />
            {error ? <ErrorState description={error} onRetry={load} /> : loading && !summary ? <LoadingState message="Akış sağlığı hesaplanıyor..." /> : (
                <>
                    <KpiGrid columns={5}>
                        <KpiCard title="Kritik" value={summary?.critical ?? 0} variant="critical" />
                        <KpiCard title="Uyarı" value={summary?.warning ?? 0} variant="warning" />
                        <KpiCard title="Gecikmiş" value={summary?.overdue ?? 0} variant="critical" />
                        <KpiCard title="Onay Bekleyen" value={summary?.pendingApproval ?? 0} variant="info" />
                        <KpiCard title="Eski Sürüm" value={summary?.outdatedVersion ?? 0} variant="default" />
                    </KpiGrid>

                    <div className="my-6 bg-white border border-slate-200 rounded-2xl p-5">
                        <h2 className="text-sm font-bold text-slate-700 mb-4">Akış Haritası</h2>
                        <div className="flex flex-col lg:flex-row gap-2 items-stretch">
                            {FLOW.map(([label, codes], index) => {
                                const count = codes.reduce((sum, c) => sum + (summary?.byCode?.[c] ?? 0), 0);
                                return <div key={label} className="contents">
                                    <button onClick={() => setCode(codes.length === 1 ? codes[0] : '')} className={`flex-1 text-left rounded-xl border p-4 ${count > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                                        <p className="text-xs font-bold text-slate-500">{index + 1}. ADIM</p>
                                        <p className="font-semibold text-slate-800 mt-1">{label}</p>
                                        <p className={`text-2xl font-black mt-2 ${count > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{count}</p>
                                        <p className="text-xs text-slate-500">{count > 0 ? 'işlem gerekiyor' : 'sağlıklı'}</p>
                                    </button>
                                    {index < FLOW.length - 1 && <span className="self-center text-slate-300 hidden lg:block">→</span>}
                                </div>;
                            })}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2">
                            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={severity} onChange={e => setSeverity(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                <option value="">Tüm önem seviyeleri</option><option value="CRITICAL">Kritik</option><option value="WARNING">Uyarı</option><option value="INFO">Bilgi</option>
                            </select>
                            <select value={code} onChange={e => setCode(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                <option value="">Tüm sinyaller</option>{Object.entries(CODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>
                        {items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Seçili kapsamda işlem gerektiren kayıt yok.</p> : (
                            <div className="divide-y divide-slate-100">
                                {items.map(item => (
                                    <div key={`${item.code}-${item.entityId}`} className="p-4 flex items-start gap-4">
                                        <StatusBadge variant={item.severity === 'CRITICAL' ? 'critical' : item.severity === 'WARNING' ? 'warning' : 'info'}>{item.severity === 'CRITICAL' ? 'Kritik' : item.severity === 'WARNING' ? 'Uyarı' : 'Bilgi'}</StatusBadge>
                                        <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{item.title}</p><p className="text-sm text-slate-600 mt-1">{item.message}</p><p className="text-xs text-slate-400 mt-1">{CODE_LABELS[item.code] || item.code}</p></div>
                                        <Link href={item.href} className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">İşleme git →</Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    );
}
