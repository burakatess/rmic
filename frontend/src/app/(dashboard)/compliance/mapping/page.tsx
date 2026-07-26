'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageShell, PageHeader, KpiCard, KpiGrid, QuickFilterBar, DataTable } from '@/components/ui';
import type { ColumnDef, QuickFilterItem } from '@/components/ui';

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
    risks: { id: string; riskId: string; name: string }[];
    controls: { id: string; controlId: string; name: string }[];
}

const DEMO_REGULATIONS: Regulation[] = [
    { id: '1', code: 'BDDK', name: 'BDDK Düzenlemeleri', articleCount: 12 },
    { id: '2', code: 'KVKK', name: 'Kişisel Verilerin Korunması Kanunu', articleCount: 8 },
    { id: '3', code: 'ISO27001', name: 'ISO 27001 Bilgi Güvenliği', articleCount: 15 },
];

const DEMO_MAPPINGS: MappingItem[] = [
    { regulationId: '1', regulationCode: 'BDDK', articleCode: 'M.5.1', articleTitle: 'Bilgi Sistemleri Güvenliği', risks: [{ id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' }], controls: [{ id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi' }] },
    { regulationId: '1', regulationCode: 'BDDK', articleCode: 'M.5.2', articleTitle: 'Erişim Kontrolü', risks: [{ id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' }], controls: [{ id: '2', controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme Kontrolü' }] },
    { regulationId: '2', regulationCode: 'KVKK', articleCode: 'M.12', articleTitle: 'Veri Güvenliği', risks: [{ id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' }], controls: [] },
    { regulationId: '3', regulationCode: 'ISO27001', articleCode: 'A.12.3', articleTitle: 'Yedekleme', risks: [{ id: '3', riskId: 'R-2024-0003', name: 'Operasyonel Kesinti Riski' }], controls: [{ id: '3', controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama' }] },
];

const DEMO_RISKS = [
    { id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' },
    { id: '2', riskId: 'R-2024-0002', name: 'Regülasyon Uyumsuzluk Riski' },
    { id: '3', riskId: 'R-2024-0003', name: 'Operasyonel Kesinti Riski' },
    { id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' },
];

const DEMO_CONTROLS = [
    { id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi' },
    { id: '2', controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme Kontrolü' },
    { id: '3', controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama' },
];

// Kapsam durumu: renk tek başına sinyal olmasın diye etiket + title birlikte kullanılır
function getCoverage(riskCount: number, controlCount: number): { dot: string; label: string; title: string } {
    if (riskCount > 0 && controlCount > 0) return { dot: 'bg-emerald-500', label: 'Tam', title: 'Tam Kapsam (Risk + Kontrol)' };
    if (riskCount > 0 || controlCount > 0) return { dot: 'bg-amber-500', label: 'Kısmi', title: 'Kısmi Kapsam' };
    return { dot: 'bg-red-500', label: 'Yok', title: 'Kapsam Yok' };
}

export default function ComplianceMappingPage() {
    const [regulations] = useState<Regulation[]>(DEMO_REGULATIONS);
    const [mappings, setMappings] = useState<MappingItem[]>([]);
    const [selectedRegulation, setSelectedRegulation] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setTimeout(() => {
            setMappings(DEMO_MAPPINGS);
            setLoading(false);
        }, 500);
    }, []);

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
            key: 'article', header: 'Madde', defaultWidth: 200,
            render: (m) => (
                <div>
                    <p className="text-xs font-medium text-slate-800">{m.articleCode}</p>
                    <p className="text-xs text-slate-500">{m.articleTitle}</p>
                </div>
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
