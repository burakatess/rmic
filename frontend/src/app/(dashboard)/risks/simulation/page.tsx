'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import { PageShell, PageHeader, DataTable, Button, Modal, Input, Textarea, StatusBadge } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

interface SimRow {
    id: string;
    simulationId: string;
    name: string;
    description?: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    createdAt: string;
    createdBy?: { firstName: string; lastName: string };
    _count?: { scenarios: number };
}

function NewSimulationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (sim: SimRow) => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();

    const submit = async () => {
        if (!name.trim()) { showError('Eksik bilgi', 'Simülasyon adı zorunludur.'); return; }
        setSaving(true);
        try {
            const sim = await api.createRiskSimulation({ name: name.trim(), description: description.trim() || undefined }) as SimRow;
            success('Oluşturuldu', `${sim.simulationId} oluşturuldu.`);
            onCreated(sim);
            setName(''); setDescription('');
        } catch (e) {
            showError('Hata', e instanceof ApiError ? e.message : 'Simülasyon oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Yeni Risk Simülasyonu" size="md"
            footer={<>
                <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
                <Button variant="primary" onClick={submit} loading={saving}>Oluştur</Button>
            </>}>
            <div className="space-y-4">
                <Input label="Simülasyon Adı" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Veri Bütünlüğü Riski - Kontrol Kaldırma Senaryoları" />
                <Textarea label="Açıklama (opsiyonel)" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                <p className="text-xs text-slate-500">
                    Bu simülasyon gerçek risk envanterinden tamamen bağımsızdır. İçindeki senaryolarda yaptığınız
                    değişiklikler yalnızca açıkça onayladığınız &quot;Envantere Aktar&quot; adımıyla gerçek kayıtlara işlenir.
                </p>
            </div>
        </Modal>
    );
}

export default function RiskSimulationListPage() {
    const [rows, setRows] = useState<SimRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const { error: showError } = useToast();
    const { hasPermission } = useAuth();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getRiskSimulations() as SimRow[];
            setRows(Array.isArray(res) ? res : []);
        } catch {
            showError('Hata', 'Simülasyonlar yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => { load(); }, [load]);

    const columns: ColumnDef<SimRow>[] = [
        {
            key: 'simulationId', header: 'Kod', minWidth: 120,
            render: (r) => <Link href={`/risks/simulation/${r.id}`} className="font-mono text-sm text-blue-600 hover:underline">{r.simulationId}</Link>,
        },
        { key: 'name', header: 'Ad', minWidth: 260, render: (r) => <Link href={`/risks/simulation/${r.id}`} className="text-slate-900 hover:underline font-medium">{r.name}</Link> },
        { key: 'scenarios', header: 'Senaryo Sayısı', minWidth: 100, render: (r) => r._count?.scenarios ?? 0 },
        {
            key: 'status', header: 'Durum', minWidth: 100,
            render: (r) => <StatusBadge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status === 'ACTIVE' ? 'Aktif' : 'Arşivlendi'}</StatusBadge>,
        },
        { key: 'createdBy', header: 'Oluşturan', minWidth: 140, render: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '—' },
        { key: 'createdAt', header: 'Oluşturulma', minWidth: 120, render: (r) => new Date(r.createdAt).toLocaleDateString('tr-TR') },
    ];

    return (
        <PageShell>
            <PageHeader
                title="Risk Simülasyonu"
                description="Gerçek envanteri değiştirmeden 'bu kontrolü kaldırırsam / bu aksiyonu uygularsam risk ne olur?' sorularını test edin."
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Simülasyonu' }]}
                actions={hasPermission('risk:sim:create') ? <Button variant="primary" onClick={() => setModalOpen(true)}>Yeni Simülasyon</Button> : undefined}
            />
            <DataTable
                columns={columns}
                data={rows}
                rowKey={(r) => r.id}
                loading={loading}
                totalCount={rows.length}
                page={1}
                pageSize={50}
                onPageChange={() => {}}
                storageKey="risk-simulation-list-table"
                emptyTitle="Henüz simülasyon yok"
                emptyDescription="Bir gerçek riskten veya sıfırdan hipotetik bir senaryo ile yeni bir simülasyon başlatın."
                emptyActionLabel={hasPermission('risk:sim:create') ? 'Yeni Simülasyon' : undefined}
                onEmptyAction={hasPermission('risk:sim:create') ? () => setModalOpen(true) : undefined}
                onRefresh={load}
            />
            <NewSimulationModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(sim) => { setModalOpen(false); load(); window.location.href = `/risks/simulation/${sim.id}`; }} />
        </PageShell>
    );
}
