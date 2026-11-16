'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { PageShell, PageHeader, DataTable, Button, Modal, StatusBadge, ConfirmDialog } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import { ImportSimWorkspaceModal } from '@/components/modals/ImportSimWorkspaceModal';

/*
 * Risk Simülasyonu. Üstte "Güncel simülatör": Risk Envanteri + Kontrol Alanı'nın şimdiki hali
 * (kullanıcının kaydedilmemiş çalışma kopyası). Simülatörde simülasyon başlatılır, değişiklik
 * yapılır ve adıyla kaydedilir. Altta kayıtlı simülasyonlar: açılıp incelenir, yeniden
 * değiştirilip test edilir; toplu seçilip silinebilir.
 */

interface SimRow {
    id: string;
    simulationId: string;
    name: string;
    description?: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    mode?: 'SCENARIO' | 'WORKSPACE';
    createdAt: string;
    updatedAt: string;
    createdBy?: { firstName: string; lastName: string };
    _count?: { scenarios: number; tests: number };
}

const simHref = (r: SimRow) => (r.mode === 'WORKSPACE' ? `/risks/simulation/workspace/${r.id}` : `/risks/simulation/${r.id}`);
const dt = (v: string) => new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export default function RiskSimulationListPage() {
    const router = useRouter();
    const [rows, setRows] = useState<SimRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [importOpen, setImportOpen] = useState(false);
    const [opening, setOpening] = useState(false);
    const [unsaved, setUnsaved] = useState<{ id: string; builtAt: string } | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState<{ id: string; requestNo: string; simulationId: string | null; simulationLabel: string; scenarioIds: string[]; requestedAt: string; requestedBy: { firstName: string; lastName: string } }[]>([]);
    const { success, error: showError, warning } = useToast();
    const { hasPermission } = useAuth();
    // Risk Yönetimi modülünü (risk:view) gören herkes simülasyonu kullanır (backend ile aynı kural).
    const canCreate = hasPermission('risk:sim:create') || hasPermission('risk:view');
    const canDelete = hasPermission('risk:sim:delete') || hasPermission('risk:view');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [res, pend] = await Promise.all([api.getRiskSimulations() as Promise<SimRow[]>, api.listTransferRequests('PENDING').catch(() => [])]);
            setPendingTransfers(Array.isArray(pend) ? pend : []);
            setRows(Array.isArray(res) ? res : []);
            setSelected(prev => new Set([...prev].filter(id => (res as SimRow[]).some(r => r.id === id))));
        } catch {
            showError('Hata', 'Simülasyonlar yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => { load(); }, [load]);

    const openSimulator = async (refresh = false) => {
        setOpening(true);
        try {
            const res = await api.openLiveSim(refresh);
            if (res.hasUnsavedChanges && !refresh) { setUnsaved({ id: res.id, builtAt: res.builtAt }); return; }
            setUnsaved(null);
            router.push(`/risks/simulation/workspace/${res.id}`);
        } catch (e) {
            showError('Simülatör açılamadı', e instanceof ApiError ? e.message : 'Güncel veriyle çalışma alanı kurulamadı.');
        } finally { setOpening(false); }
    };

    const runDelete = async () => {
        setDeleting(true);
        try {
            const res = await api.bulkDeleteSims([...selected]);
            if (res.deleted.length) success('Silindi', `${res.deleted.length} simülasyon silindi.`);
            if (res.skipped.length) warning('Silinmeyenler', res.skipped.map(s => `${s.simulationId ?? s.id}: ${s.reason}`).join(' · '));
            setConfirmDelete(false);
            setSelected(new Set());
            await load();
        } catch (e) {
            showError('Silinemedi', e instanceof ApiError ? e.message : 'Simülasyonlar silinemedi.');
        } finally { setDeleting(false); }
    };

    const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setSelected(prev => (prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id))));

    const columns: ColumnDef<SimRow>[] = [
        {
            key: 'simulationId', header: 'Kod', minWidth: 120,
            render: (r) => <Link href={simHref(r)} className="font-mono text-sm text-blue-600 hover:underline">{r.simulationId}</Link>,
        },
        {
            key: 'name', header: 'Ad', minWidth: 260,
            render: (r) => (
                <div>
                    <Link href={simHref(r)} className="text-slate-900 hover:underline font-medium">{r.name}</Link>
                    {r.description && <div className="text-xs text-slate-500 line-clamp-1">{r.description}</div>}
                </div>
            ),
        },
        {
            key: 'mode', header: 'Tür', minWidth: 130,
            render: (r) => r.mode === 'WORKSPACE'
                ? <StatusBadge variant="info">Simülasyon</StatusBadge>
                : <StatusBadge variant="neutral">Eski senaryo</StatusBadge>,
        },
        { key: 'risks', header: 'Risk', minWidth: 70, render: (r) => r._count?.scenarios ?? 0 },
        { key: 'tests', header: 'Simülasyon testi', minWidth: 110, render: (r) => (r.mode === 'WORKSPACE' ? r._count?.tests ?? 0 : '—') },
        { key: 'createdBy', header: 'Kaydeden', minWidth: 140, render: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '—' },
        { key: 'updatedAt', header: 'Son değişiklik', minWidth: 130, render: (r) => dt(r.updatedAt) },
    ];

    return (
        <PageShell>
            <PageHeader
                title="Risk Simülasyonu"
                description="Gerçek envanteri değiştirmeden kontrol ve risk niteliklerini değiştirip sonuçlarını görün; denemelerinizi kaydedip sonra yeniden açın."
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Simülasyonu' }]}
            />

            <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white px-5 py-5">
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">Güncel simülatör</div>
                    <div className="mt-0.5 text-[17px] font-semibold text-slate-900">Risk kütüğünün şimdiki hali üzerinde çalışın</div>
                    <p className="mt-1 max-w-3xl text-[13px] text-slate-600">
                        Risk Envanteri ve Kontrol Alanı&apos;ndaki en güncel verilerle açılır. <b>Simülatörü aç</b> → <b>Simülasyonu başlat</b> → değişiklik yapın →
                        <b> Kaydet</b>. Kaydettiğiniz simülasyonlar aşağıda listelenir; açıp neler yaptığınızı görebilir, yeniden değiştirip test edebilirsiniz.
                    </p>
                </div>
                {canCreate && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="primary" onClick={() => openSimulator(false)} loading={opening}>Simülatörü aç</Button>
                        <Button variant="secondary" onClick={() => setImportOpen(true)}>Excel&apos;den yükle</Button>
                    </div>
                )}
            </div>

            {pendingTransfers.length > 0 && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                    <div className="mb-2 text-[15px] text-slate-900"><b>Onay bekleyen envantere aktarım talepleri</b> <span className="text-slate-500">{pendingTransfers.length}</span></div>
                    <ul className="divide-y divide-amber-100 text-sm">
                        {pendingTransfers.map(t => (
                            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                                <span className="font-mono font-semibold">{t.requestNo}</span>
                                <span className="min-w-0 flex-1 truncate text-slate-700">{t.simulationLabel} · {t.scenarioIds.length} risk</span>
                                <span className="text-[12px] text-slate-500">{t.requestedBy.firstName} {t.requestedBy.lastName} · {dt(t.requestedAt)}</span>
                                {t.simulationId && <Link href={`/risks/simulation/workspace/${t.simulationId}?tab=transfer`} className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-[13px] font-medium text-amber-900 hover:bg-amber-100">İncele</Link>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mb-2 text-[15px] text-slate-900"><b>Kayıtlı simülasyonlar</b> <span className="text-slate-500">{rows.length}</span></div>
            <DataTable
                columns={columns}
                data={rows}
                rowKey={(r) => r.id}
                loading={loading}
                totalCount={rows.length}
                page={1}
                pageSize={100}
                onPageChange={() => {}}
                storageKey="risk-simulation-saved-table"
                showCheckbox={canDelete}
                selectedRows={selected}
                onRowSelect={toggle}
                onSelectAll={toggleAll}
                toolbar={canDelete && selected.size > 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-600">{selected.size} seçili</span>
                        <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Seçilenleri sil</Button>
                        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Seçimi kaldır</Button>
                    </div>
                ) : undefined}
                emptyTitle="Henüz kayıtlı simülasyon yok"
                emptyDescription="Simülatörü açın, simülasyonu başlatın ve değişikliklerinizi kaydedin; burada listelenir."
                emptyActionLabel={canCreate ? 'Simülatörü aç' : undefined}
                onEmptyAction={canCreate ? () => openSimulator(false) : undefined}
                onRefresh={load}
            />

            <ImportSimWorkspaceModal open={importOpen} onClose={() => setImportOpen(false)} onCreated={(sim) => { setImportOpen(false); router.push(`/risks/simulation/workspace/${sim.id}`); }} />

            <Modal open={unsaved !== null} onClose={() => !opening && setUnsaved(null)} title="Kaydedilmemiş çalışmanız var" size="md"
                footer={<>
                    <Button variant="secondary" onClick={() => openSimulator(true)} loading={opening}>Güncel veriyle yeniden başla</Button>
                    <Button variant="primary" onClick={() => unsaved && router.push(`/risks/simulation/workspace/${unsaved.id}`)} disabled={opening}>Kaldığım yerden devam et</Button>
                </>}>
                <p className="text-sm text-slate-600">
                    Güncel simülatörde {unsaved ? dt(unsaved.builtAt) : ''} tarihinde kurulan ve henüz kaydetmediğiniz değişiklikler (veya devam eden bir simülasyon) var.
                    Kaldığınız yerden devam edebilir ya da bu değişiklikleri atıp Risk Envanteri ve Kontrol Alanı&apos;nın şimdiki haliyle yeniden başlayabilirsiniz.
                </p>
            </Modal>

            <ConfirmDialog open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} onConfirm={runDelete} loading={deleting}
                title={`${selected.size} simülasyon silinsin mi?`}
                message="Seçilen simülasyonlar; riskleri, kontrolleri, simülasyon testleri ve raporlarıyla birlikte kalıcı olarak silinir. Gerçek envanter etkilenmez. Envantere aktarım yapılmış simülasyonlar denetim izi için silinmez."
                confirmLabel="Kalıcı olarak sil" cancelLabel="Vazgeç" />
        </PageShell>
    );
}
