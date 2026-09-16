'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { PageShell, PageHeader, Button, Modal, Input, Select, StatusBadge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

interface ScenarioRow {
    id: string;
    name: string;
    sourceType: 'EXISTING_RISK' | 'HYPOTHETICAL';
    sourceRiskId?: string | null;
    naturalProbability: number;
    finalImpactChoice: string;
    createdAt: string;
    methodology: { version: number };
    _count: { controls: number; actions: number };
}

interface SimDetail {
    id: string;
    simulationId: string;
    name: string;
    description?: string | null;
    status: string;
    scenarios: ScenarioRow[];
}

function NewScenarioModal({ simId, open, onClose, onCreated }: { simId: string; open: boolean; onClose: () => void; onCreated: (s: ScenarioRow) => void }) {
    const [name, setName] = useState('Baseline');
    const [sourceType, setSourceType] = useState<'EXISTING_RISK' | 'HYPOTHETICAL'>('HYPOTHETICAL');
    const [sourceRiskId, setSourceRiskId] = useState('');
    const [risks, setRisks] = useState<{ id: string; riskId: string; name: string }[]>([]);
    const [naturalProbability, setNaturalProbability] = useState(3);
    const [finalImpactChoice, setFinalImpactChoice] = useState<'BUSINESS' | 'INFOSEC'>('BUSINESS');
    const [impacts, setImpacts] = useState({ finansalEtki: 3, itibarEtkisi: 3, regulasyonEtkisi: 3, musteriEtkisi: 3, gizlilikEtkisi: 3, butunlukEtkisi: 3, erisilebilirlikEtkisi: 3 });
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();

    useEffect(() => {
        if (open && sourceType === 'EXISTING_RISK' && risks.length === 0) {
            api.getRisks().then((res: any) => setRisks(Array.isArray(res) ? res : (res.data || res.risks || []))).catch(() => { });
        }
    }, [open, sourceType, risks.length]);

    const submit = async () => {
        if (sourceType === 'EXISTING_RISK' && !sourceRiskId) { showError('Eksik bilgi', 'Bir kaynak risk seçin.'); return; }
        setSaving(true);
        try {
            const body: any = {
                name: name.trim() || 'Senaryo', sourceType, naturalProbability, finalImpactChoice,
                ...impacts,
            };
            if (sourceType === 'EXISTING_RISK') body.sourceRiskId = sourceRiskId;
            const scenario = await api.createSimScenario(simId, body) as ScenarioRow;
            success('Oluşturuldu', 'Senaryo oluşturuldu.');
            onCreated(scenario);
        } catch (e) {
            showError('Hata', e instanceof ApiError ? e.message : 'Senaryo oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Yeni Senaryo" size="lg"
            footer={<>
                <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
                <Button variant="primary" onClick={submit} loading={saving}>Oluştur</Button>
            </>}>
            <div className="space-y-4">
                <Input label="Senaryo Adı" value={name} onChange={e => setName(e.target.value)} />
                <Select label="Kaynak" value={sourceType} onChange={e => setSourceType(e.target.value as any)}
                    options={[{ value: 'HYPOTHETICAL', label: 'Hipotetik (sıfırdan)' }, { value: 'EXISTING_RISK', label: 'Gerçek bir riskten başlat' }]} />
                {sourceType === 'EXISTING_RISK' && (
                    <Select label="Kaynak Risk" value={sourceRiskId} onChange={e => setSourceRiskId(e.target.value)}
                        placeholder="Risk seçin..."
                        options={risks.map(r => ({ value: r.id, label: `${r.riskId} — ${r.name}` }))} />
                )}
                <div className="grid grid-cols-2 gap-4">
                    <Input type="number" min={1} max={5} label="Doğal Olasılık (1-5)" value={naturalProbability}
                        onChange={e => setNaturalProbability(Number(e.target.value))} />
                    <Select label="Nihai Etki Grubu" value={finalImpactChoice} onChange={e => setFinalImpactChoice(e.target.value as any)}
                        options={[{ value: 'BUSINESS', label: 'İş Etkisi (%30/%30/%20/%20)' }, { value: 'INFOSEC', label: 'BT Etkisi (%35/%30/%35)' }]}
                        hint="İki grup otomatik birleştirilmez — hangisinin nihai etki sayılacağını siz seçersiniz." />
                </div>
                <div className="grid grid-cols-4 gap-3">
                    {(['finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi'] as const).map(k => (
                        <Input key={k} type="number" min={1} max={5} label={{ finansalEtki: 'Finansal', itibarEtkisi: 'İtibar', regulasyonEtkisi: 'Regülasyon', musteriEtkisi: 'Müşteri' }[k]}
                            value={(impacts as any)[k]} onChange={e => setImpacts(v => ({ ...v, [k]: Number(e.target.value) }))} />
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {(['gizlilikEtkisi', 'butunlukEtkisi', 'erisilebilirlikEtkisi'] as const).map(k => (
                        <Input key={k} type="number" min={1} max={5} label={{ gizlilikEtkisi: 'Gizlilik', butunlukEtkisi: 'Bütünlük', erisilebilirlikEtkisi: 'Erişilebilirlik' }[k]}
                            value={(impacts as any)[k]} onChange={e => setImpacts(v => ({ ...v, [k]: Number(e.target.value) }))} />
                    ))}
                </div>
            </div>
        </Modal>
    );
}

export default function RiskSimulationDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [sim, setSim] = useState<SimDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const { error: showError } = useToast();
    const { hasPermission } = useAuth();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const s = await api.getRiskSimulation(params.id) as SimDetail;
            setSim(s);
        } catch {
            showError('Hata', 'Simülasyon yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [params.id, showError]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <PageShell><div className="py-24 text-center text-slate-400">Yükleniyor…</div></PageShell>;
    if (!sim) return <PageShell><EmptyState title="Simülasyon bulunamadı" /></PageShell>;

    return (
        <PageShell>
            <PageHeader
                title={sim.name}
                description={sim.description || undefined}
                badge={<span className="font-mono text-xs text-slate-500">{sim.simulationId}</span>}
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Simülasyonu', href: '/risks/simulation' }, { label: sim.name }]}
                actions={hasPermission('risk:sim:create') ? <Button variant="primary" onClick={() => setModalOpen(true)}>Yeni Senaryo</Button> : undefined}
            />

            {sim.scenarios.length === 0 ? (
                <EmptyState title="Henüz senaryo yok" description="Bir gerçek risk üzerinden ya da tamamen hipotetik bir senaryo başlatın."
                    actionLabel={hasPermission('risk:sim:create') ? 'Yeni Senaryo' : undefined} onAction={() => setModalOpen(true)} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sim.scenarios.map(s => (
                        <Link key={s.id} href={`/risks/simulation/scenario/${s.id}`}
                            className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-slate-900">{s.name}</span>
                                <StatusBadge variant={s.sourceType === 'EXISTING_RISK' ? 'info' : 'neutral'} size="sm">
                                    {s.sourceType === 'EXISTING_RISK' ? 'Gerçek Riskten' : 'Hipotetik'}
                                </StatusBadge>
                            </div>
                            <div className="text-xs text-slate-500 space-y-1">
                                <div>Olasılık: {s.naturalProbability} · Nihai Etki: {s.finalImpactChoice === 'BUSINESS' ? 'İş' : 'BT'}</div>
                                <div>{s._count.controls} kontrol · {s._count.actions} aksiyon · metodoloji v{s.methodology.version}</div>
                                <div>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <NewScenarioModal simId={sim.id} open={modalOpen} onClose={() => setModalOpen(false)}
                onCreated={(s) => { setModalOpen(false); router.push(`/risks/simulation/scenario/${s.id}`); }} />
        </PageShell>
    );
}
