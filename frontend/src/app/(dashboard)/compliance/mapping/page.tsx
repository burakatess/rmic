'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageShell, PageHeader, KpiCard, KpiGrid, QuickFilterBar, DataTable, ErrorState } from '@/components/ui';
import type { ColumnDef, QuickFilterItem } from '@/components/ui';
import { api } from '@/lib/api';

interface Regulation {
    id: string;
    code: string;
    name: string;
    articleCount: number;
}

interface MappingItem {
    regulationId: string;
    regulationCode: string;
    articleCode: string;
    articleTitle: string;
    articleDescription: string;
    risks: { id: string; riskId: string; name: string }[];
    controls: { id: string; controlId: string; name: string }[];
}

// Kapsam durumu: renk tek başına sinyal olmasın diye etiket + title birlikte kullanılır
function getCoverage(riskCount: number, controlCount: number): { dot: string; label: string; title: string } {
    if (riskCount > 0 && controlCount > 0) return { dot: 'bg-emerald-500', label: 'Tam', title: 'Tam Kapsam (Risk + Kontrol)' };
    if (riskCount > 0 || controlCount > 0) return { dot: 'bg-amber-500', label: 'Kısmi', title: 'Kısmi Kapsam' };
    return { dot: 'bg-red-500', label: 'Yok', title: 'Kapsam Yok' };
}

export default function ComplianceMappingPage() {
    const [regulations, setRegulations] = useState<Regulation[]>([]);
    const [mappings, setMappings] = useState<MappingItem[]>([]);
    const [selectedRegulation, setSelectedRegulation] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const regs: any[] = await api.getRegulations();
            const regulationList: Regulation[] = regs.map(r => ({
                id: r.id, code: r.code, name: r.name, articleCount: r._count?.articles ?? 0,
            }));
            setRegulations(regulationList);

            const articlesByReg = await Promise.all(
                regulationList.map(r => api.getRegulationArticles(r.id).then((articles: any[]) => ({ reg: r, articles })))
            );

            const items: MappingItem[] = [];
            for (const { reg, articles } of articlesByReg) {
                for (const a of articles) {
                    items.push({
                        regulationId: reg.id,
                        regulationCode: reg.code,
                        articleCode: a.articleCode,
                        articleTitle: a.title,
                        articleDescription: a.description || '',
                        risks: (a.risks || []).map((rr: any) => ({ id: rr.risk.id, riskId: rr.risk.riskId, name: rr.risk.name })),
                        controls: (a.controls || []).map((cc: any) => ({ id: cc.control.id, controlId: cc.control.controlId, name: cc.control.name })),
                    });
                }
            }
            setMappings(items);
        } catch {
            setError('Uyum eşleştirme verileri yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filteredMappings = selectedRegulation
        ? mappings.filter(m => m.regulationId === selectedRegulation)
        : mappings;

    const fullMatch = filteredMappings.filter(m => m.risks.length > 0 && m.controls.length > 0).length;
    const partialMatch = filteredMappings.filter(m => (m.risks.length > 0) !== (m.controls.length > 0)).length;
    const noMatch = filteredMappings.filter(m => m.risks.length === 0 && m.controls.length === 0).length;

    const quickFilterItems: QuickFilterItem[] = useMemo(() => regulations.map(reg => ({
        key: reg.id,
        label: reg.code,
        count: mappings.filter(m => m.regulationId === reg.id).length,
    })), [regulations, mappings]);

    const columns: ColumnDef<MappingItem>[] = useMemo(() => [
        {
            key: 'regulationCode', header: 'Regülasyon', defaultWidth: 130,
            render: (m) => (
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {m.regulationCode}
                </span>
            ),
        },
        {
            key: 'articleCode', header: 'Madde', defaultWidth: 130,
            render: (m) => (
                <p className="text-xs font-semibold text-slate-800" title={m.articleTitle}>{m.articleCode}</p>
            ),
        },
        {
            key: 'articleDescription', header: 'Açıklama', defaultWidth: 320,
            render: (m) => (
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed" title={m.articleDescription}>
                    {m.articleDescription || '—'}
                </p>
            ),
        },
        {
            key: 'risks', header: 'Eşleşen Riskler', defaultWidth: 200,
            render: (m) => m.risks.length === 0 ? (
                <span className="text-xs text-slate-400">Eşleme yok</span>
            ) : (
                <div className="flex flex-wrap gap-1">
                    {m.risks.map((risk) => (
                        <span key={risk.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded" title={risk.name}>
                            {risk.riskId}
                        </span>
                    ))}
                </div>
            ),
        },
        {
            key: 'controls', header: 'Eşleşen Kontroller', defaultWidth: 200,
            render: (m) => m.controls.length === 0 ? (
                <span className="text-xs text-slate-400">Eşleme yok</span>
            ) : (
                <div className="flex flex-wrap gap-1">
                    {m.controls.map((control) => (
                        <span key={control.id} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded" title={control.name}>
                            {control.controlId}
                        </span>
                    ))}
                </div>
            ),
        },
        {
            key: 'coverage', header: 'Kapsam', defaultWidth: 110,
            render: (m) => {
                const c = getCoverage(m.risks.length, m.controls.length);
                return (
                    <span className="inline-flex items-center gap-1.5" title={c.title}>
                        <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                        <span className="text-xs text-slate-600">{c.label}</span>
                    </span>
                );
            },
        },
    ], []);

    if (error && mappings.length === 0 && !loading) {
        return (
            <PageShell>
                <PageHeader title="Uyum Eşleştirme" description="Regülasyon maddeleri ile risk ve kontrolleri ilişkilendirin" breadcrumbs={[{ label: 'Uyum' }, { label: 'Eşleştirme' }]} />
                <ErrorState description={error} onRetry={load} />
            </PageShell>
        );
    }

    return (
        <PageShell>
            <PageHeader
                title="Uyum Eşleştirme"
                description="Regülasyon maddeleri ile risk ve kontrolleri ilişkilendirin"
                breadcrumbs={[{ label: 'Uyum' }, { label: 'Eşleştirme' }]}
            />

            {/* Coverage Summary */}
            <KpiGrid columns={4}>
                <KpiCard title="Toplam Madde" value={filteredMappings.length} variant="default" />
                <KpiCard title="Tam Eşleşme" value={fullMatch} variant="success" />
                <KpiCard title="Kısmi Eşleşme" value={partialMatch} variant="warning" />
                <KpiCard title="Eşleme Yok" value={noMatch} variant="critical" />
            </KpiGrid>

            {/* Regulation Filter */}
            <QuickFilterBar
                label="Regülasyon:"
                items={quickFilterItems}
                active={selectedRegulation || null}
                onChange={(k) => setSelectedRegulation(k ?? '')}
            />

            {/* Mapping Matrix */}
            <DataTable
                columns={columns}
                data={filteredMappings}
                rowKey={(m) => `${m.regulationId}-${m.articleCode}`}
                loading={loading}
                emptyTitle="Eşleştirme bulunamadı"
                emptyDescription="Seçili regülasyon için tanımlı madde eşleştirmesi yok."
            />

            {/* Legend */}
            <div className="flex items-center justify-center gap-8 text-sm mt-4">
                <div className="flex items-center gap-2" title="Tam Kapsam (Risk + Kontrol)">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-slate-600">Tam Kapsam (Risk + Kontrol)</span>
                </div>
                <div className="flex items-center gap-2" title="Kısmi Kapsam">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-slate-600">Kısmi Kapsam</span>
                </div>
                <div className="flex items-center gap-2" title="Kapsam Yok">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-slate-600">Kapsam Yok</span>
                </div>
            </div>
        </PageShell>
    );
}
