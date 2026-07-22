'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, StatusBadge, Button, DataTable, FilterBar, Modal } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

interface PendingApproval {
    id: string;
    type: 'CONTROL_TEST';
    testNo: string;
    status: string;
    findingStatus?: string | null;
    resultText?: string | null;
    evidenceSummary?: string | null;
    completedAt?: string | null;
    assigneeId?: string | null;
    control: { id: string; controlId: string; name: string; type: string };
    directorate?: { id: string; name: string } | null;
    findings?: { id: string; findingId: string; severity: string }[];
    attachments?: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const findingStatusConfig: Record<string, { label: string; variant: BV }> = {
    BULGUSU_YOK: { label: 'Bulgu Yok', variant: 'success' },
    BULGUSU_VAR: { label: 'Bulgu Var', variant: 'critical' },
};

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ApprovalDetailModal({
    id, onClose, onDone,
}: { id: string; onClose: () => void; onDone: () => void }) {
    const { success, error: showError } = useToast();
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.getApprovalDetail(id)
            .then((d: any) => setDetail(d))
            .catch(() => showError('Hata', 'Onay detayı yüklenemedi.'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleApprove = async () => {
        setSaving(true);
        try {
            await api.approveControlTest(id);
            success('Onaylandı', 'Kayıt final olarak onaylandı.');
            onDone();
        } catch (err: any) {
            showError('Hata', err.message || 'Onaylanamadı.');
        } finally { setSaving(false); }
    };

    const handleReturn = async () => {
        const reason = prompt('Geri gönderme gerekçesini yazın (zorunlu):');
        if (!reason || !reason.trim()) return;
        setSaving(true);
        try {
            await api.returnControlTest(id, reason);
            success('Geri Gönderildi', 'Kayıt testi yapan kullanıcıya düzeltme için geri gönderildi.');
            onDone();
        } catch (err: any) {
            showError('Hata', err.message || 'Geri gönderilemedi.');
        } finally { setSaving(false); }
    };

    return (
        <Modal open onClose={onClose} title="Onay Detayı" description={detail?.testNo} size="lg">
            {loading ? (
                <div className="py-10 text-center text-sm text-slate-400">Yükleniyor...</div>
            ) : !detail ? (
                <div className="py-10 text-center text-sm text-slate-400">Kayıt bulunamadı.</div>
            ) : (
                <div className="space-y-5 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Kontrol</p>
                            <p className="font-semibold text-slate-800">{detail.control?.name}</p>
                            <p className="text-xs font-mono text-slate-500">{detail.control?.controlId}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Test</p>
                            <p className="font-mono text-xs font-bold text-violet-700">{detail.testNo}</p>
                            <p className="text-xs text-slate-500">{detail.directorate?.name || '—'}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Kontrol Sonucu</p>
                            {detail.findingStatus && (
                                <StatusBadge variant={findingStatusConfig[detail.findingStatus]?.variant || 'neutral'}>
                                    {findingStatusConfig[detail.findingStatus]?.label || detail.findingStatus}
                                </StatusBadge>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gönderen / Gönderim Tarihi</p>
                            <p className="text-slate-700">
                                {detail.submittedBy ? `${detail.submittedBy.firstName} ${detail.submittedBy.lastName}` : '—'}
                                {' · '}{fmt(detail.submittedAt)}
                            </p>
                        </div>
                    </div>

                    {detail.referencedFinding && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Referans Verilen Bulgu</p>
                            <Link href={`/findings/${detail.referencedFinding.id}`} className="font-mono text-xs text-amber-800 hover:underline">
                                {detail.referencedFinding.findingId}
                            </Link>
                            {detail.referenceReason && <p className="text-xs text-amber-700 mt-1">{detail.referenceReason}</p>}
                        </div>
                    )}

                    {detail.findings?.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Bağlı Bulgular</p>
                            <div className="flex flex-wrap gap-2">
                                {detail.findings.map((f: any) => (
                                    <Link key={f.id} href={`/findings/${f.id}`}
                                        className="px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-xs font-mono text-red-700 hover:bg-red-100">
                                        {f.findingId}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {detail.resultText && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Açıklama</p>
                            <p className="text-slate-700 whitespace-pre-wrap">{detail.resultText}</p>
                        </div>
                    )}
                    {detail.evidenceSummary && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Kanıt Özeti</p>
                            <p className="text-slate-700 whitespace-pre-wrap">{detail.evidenceSummary}</p>
                        </div>
                    )}

                    {detail.attachments?.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Kanıt Ekleri</p>
                            <div className="space-y-1.5">
                                {detail.attachments.map((a: any) => (
                                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs">
                                        <span className="text-slate-700 truncate">{a.originalName}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <Button variant="outline" onClick={onClose} disabled={saving}>Kapat</Button>
                        <Button variant="secondary" onClick={handleReturn} disabled={saving}>↩ Geri Gönder</Button>
                        <Button variant="primary" onClick={handleApprove} loading={saving}>✅ Onayla</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
    const { error: showError } = useToast();
    const { user } = useAuth();
    const [items, setItems] = useState<PendingApproval[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailId, setDetailId] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (activeFilters.directorateId) params.directorateId = activeFilters.directorateId;
            const res = await api.getMyPendingApprovals(params) as { data: PendingApproval[] };
            setItems(res?.data || []);
        } catch {
            showError('Hata', 'Bekleyen onaylar yüklenemedi.');
            setItems([]);
        } finally { setLoading(false); }
    }, [activeFilters.directorateId]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        return items.filter(it => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const txt = [it.testNo, it.control.controlId, it.control.name, it.directorate?.name].filter(Boolean).join(' ').toLowerCase();
                if (!txt.includes(q)) return false;
            }
            if (activeFilters.findingStatus && it.findingStatus !== activeFilters.findingStatus) return false;
            return true;
        });
    }, [items, searchQuery, activeFilters]);

    const filterConfigs = useMemo(() => [
        {
            key: 'findingStatus', label: 'Kontrol Sonucu',
            value: activeFilters['findingStatus'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, findingStatus: v })); setPage(1); },
            options: Object.entries(findingStatusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
    ], [activeFilters]);

    const columns: ColumnDef<PendingApproval>[] = useMemo(() => [
        {
            key: 'type', header: 'Tür', defaultWidth: 110,
            render: () => <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold">Kontrol Testi</span>,
        },
        {
            key: 'testNo', header: 'Test No', sortable: true, defaultWidth: 130,
            render: (t) => (
                <button onClick={() => setDetailId(t.id)} className="font-mono text-xs font-bold text-violet-700 hover:underline text-left">
                    {t.testNo}
                </button>
            ),
        },
        {
            key: 'control', header: 'Kontrol', defaultWidth: 220,
            render: (t) => (
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{t.control.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{t.control.controlId}</p>
                </div>
            ),
        },
        {
            key: 'directorate', header: 'Direktörlük', defaultWidth: 160,
            render: (t) => <span className="text-xs text-slate-600">{t.directorate?.name || '—'}</span>,
        },
        {
            key: 'findingStatus', header: 'Sonuç', defaultWidth: 110,
            render: (t) => t.findingStatus
                ? <StatusBadge variant={findingStatusConfig[t.findingStatus]?.variant || 'neutral'}>{findingStatusConfig[t.findingStatus]?.label}</StatusBadge>
                : <span className="text-slate-300 text-xs">—</span>,
        },
        {
            key: 'completedAt', header: 'Gönderim Tarihi', sortable: true, defaultWidth: 130,
            render: (t) => <span className="text-xs text-slate-600">{fmt(t.completedAt)}</span>,
        },
        {
            key: 'actions', header: '', defaultWidth: 90,
            render: (t) => (
                <Button variant="primary" size="sm" onClick={() => setDetailId(t.id)}>İncele</Button>
            ),
        },
    ], []);

    const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Bekleyen Onaylar"
                    description="Üzerinizde bekleyen ikinci kontrolcü onaylarını görüntüleyin ve karar verin"
                    breadcrumbs={[{ label: 'Onaylarım' }]}
                />

                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Bekleyen Onay</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{items.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200">
                        <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Bulgulu</p>
                        <p className="text-2xl font-bold text-red-700 mt-1">{items.filter(i => i.findingStatus === 'BULGUSU_VAR').length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rol</p>
                        <p className="text-sm font-bold text-slate-800 mt-1.5">{user?.role?.name || '—'}</p>
                    </div>
                </div>

                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                        searchPlaceholder="Test No, Kontrol adı, Direktörlük ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearchQuery(''); setActiveFilters({}); setPage(1); }}
                    />
                </div>
            </div>

            <div className="px-8 pb-8 flex-1">
                <DataTable
                    columns={columns}
                    data={paginated}
                    rowKey={(t) => t.id}
                    loading={loading}
                    totalCount={filtered.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="approvals-table"
                    emptyTitle="Bekleyen onay yok"
                    emptyDescription="Şu anda üzerinizde onay bekleyen bir kayıt bulunmuyor."
                    onRowClick={(t) => setDetailId(t.id)}
                />
            </div>

            {detailId && (
                <ApprovalDetailModal
                    id={detailId}
                    onClose={() => setDetailId(null)}
                    onDone={() => { setDetailId(null); load(); }}
                />
            )}
        </div>
    );
}
