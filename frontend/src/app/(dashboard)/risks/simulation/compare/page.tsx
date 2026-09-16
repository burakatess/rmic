'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { PageShell, PageHeader, KpiCard, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

function fmt(n: number | null | undefined, digits = 1) {
    return n === null || n === undefined ? '—' : n.toFixed(digits);
}

function ScenarioColumn({ label, data }: { label: string; data: any }) {
    const { scenario, result } = data;
    return (
        <div className="border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">{label}</div>
            <div className="font-semibold text-slate-900 mb-3">{scenario.name}</div>
            <table className="w-full text-sm">
                <tbody>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Doğal Risk</td><td className="py-1.5 text-right font-mono">{result.naturalRisk?.puan} ({result.naturalRisk?.seviye})</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">BKP</td><td className="py-1.5 text-right font-mono">{fmt(result.target?.bkp?.bkp)}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Olasılık Kontrol Gücü</td><td className="py-1.5 text-right font-mono">{fmt(result.target?.residualSuggestion?.probabilityStrength)}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Etki Kontrol Gücü</td><td className="py-1.5 text-right font-mono">{fmt(result.target?.residualSuggestion?.impactStrength)}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Artık Risk (Olasılık×Etki)</td><td className="py-1.5 text-right font-mono">{result.residual?.probability}×{result.residual?.impact}={result.residual?.risk}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Artık Risk Seviyesi</td><td className="py-1.5 text-right font-mono">{result.residual?.level?.label ?? '—'}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Manuel Override</td><td className="py-1.5 text-right font-mono">{result.residual?.isOverridden ? 'Evet' : 'Hayır'}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Metodoloji Sürümü</td><td className="py-1.5 text-right font-mono">v{scenario.methodology.version}</td></tr>
                </tbody>
            </table>
        </div>
    );
}

function CompareContent() {
    const params = useSearchParams();
    const a = params.get('a');
    const b = params.get('b');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { error: showError } = useToast();

    useEffect(() => {
        if (!a || !b) { setLoading(false); return; }
        setLoading(true);
        api.compareSimScenarios(a, b).then(setData).catch(() => showError('Hata', 'Karşılaştırma yüklenemedi.')).finally(() => setLoading(false));
    }, [a, b, showError]);

    if (!a || !b) return <EmptyState title="İki senaryo seçin" description="Karşılaştırma için URL'e ?a=<senaryoId>&b=<senaryoId> ekleyin veya bir senaryo sayfasından karşılaştırmayı başlatın." />;
    if (loading) return <div className="py-24 text-center text-slate-400">Yükleniyor…</div>;
    if (!data) return null;

    const puanDiff = (data.b.result.residual?.risk ?? 0) - (data.a.result.residual?.risk ?? 0);
    const bkpDiff = (data.b.result.target?.bkp?.bkp ?? 0) - (data.a.result.target?.bkp?.bkp ?? 0);

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard title="Artık Risk Farkı (B - A)" value={puanDiff} variant={puanDiff <= 0 ? 'success' : 'critical'} />
                <KpiCard title="BKP Farkı (yüzde puan, B - A)" value={`${bkpDiff >= 0 ? '+' : ''}${fmt(bkpDiff)} yüzde puan`} variant={bkpDiff >= 0 ? 'success' : 'warning'} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <ScenarioColumn label="Senaryo A" data={data.a} />
                <ScenarioColumn label="Senaryo B" data={data.b} />
            </div>
        </>
    );
}

export default function CompareScenariosPage() {
    return (
        <PageShell>
            <PageHeader title="Senaryo Karşılaştırma" description="İki senaryonun yan yana karşılaştırması — farklar yüzde puan cinsinden gösterilir."
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Simülasyonu', href: '/risks/simulation' }, { label: 'Karşılaştırma' }]} />
            <Suspense fallback={<div className="py-24 text-center text-slate-400">Yükleniyor…</div>}>
                <CompareContent />
            </Suspense>
        </PageShell>
    );
}
