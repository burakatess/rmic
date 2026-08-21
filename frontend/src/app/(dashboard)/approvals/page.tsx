'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
    PageHeader, PageShell, StatusBadge, Button, DataTable, Modal,
    KpiCard, KpiGrid, AdvancedFilterPanel, ActiveFilterChips, SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, AdvancedFilterField } from '@/components/ui';
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

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

const IconReturn = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v1M3 10l5-5m-5 5l5 5" /></svg>
);
const IconCheckCircle = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ApprovalDetailModal({
    id, onClose, onDone,
}: { id: string; onClose: () => void; onDone: () => void }) {
    const { success, error: showError } = useToast();
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // prompt() yerine modal içi geri gönderme gerekçesi (ikincil durum)
    const [returnMode, setReturnMode] = useState(false);
    const [returnReason, setReturnReason] = useState('');

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
        if (!returnReason.trim()) return;
        setSaving(true);
        try {
            await api.returnControlTest(id, returnReason);
            success('Geri Gönderildi', 'Kayıt testi yapan kullanıcıya düzeltme için geri gönderildi.');
            onDone();
        } catch (err: any) {
            showError('Hata', err.message || 'Geri gönderilemedi.');
        } finally { setSaving(false); }
    };

    return (
        <Modal open onClose={onClose} title="Onay Detayı" size="lg">
            {loading ? (
                <div className="py-10 text-center text-sm text-slate-400">Yükleniyor...</div>
            ) : !detail ? (
                <div className="py-10 text-center text-sm text-slate-400">Kayıt bulunamadı.</div>
            ) : (
                <div className="space-y-5 text-sm">
                    {/* Başlık alanı — entityId chip + statü rozeti */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                            {detail.testNo}
                        </span>
                        {detail.findingStatus && (
                            <StatusBadge variant={findingStatusConfig[detail.findingStatus]?.variant || 'neutral'}>
                                {findingStatusConfig[detail.findingStatus]?.label || detail.findingStatus}
                            </StatusBadge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Kontrol</p>
                            <p className="font-medium text-slate-800">{detail.control?.name}</p>
                            <p className="text-xs font-mono text-slate-500">{detail.control?.controlId}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Test</p>
                            <p className="font-mono text-xs font-bold text-blue-700">{detail.testNo}</p>
                            <p className="text-xs text-slate-500">{detail.directorate?.name || '—'}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-semibold text-slate-700 mb-1">Gönderen / Gönderim Tarihi</p>
                        <p className="text-slate-700">
                            {detail.submittedBy ? `${detail.submittedBy.firstName} ${detail.submittedBy.lastName}` : '—'}
                            {' · '}{fmt(detail.submittedAt)}
                        </p>
                    </div>

                    {detail.referencedFinding && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-sm font-semibold text-amber-700 mb-1">Referans Verilen Bulgu</p>
                            <Link href={`/findings/${detail.referencedFinding.id}`} className="font-mono text-xs text-amber-800 hover:underline">
                                {detail.referencedFinding.findingId}
                            </Link>
                            {detail.referenceReason && <p className="text-xs text-amber-700 mt-1">{detail.referenceReason}</p>}
                        </div>
                    )}

                    {detail.findings?.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Bağlı Bulgular</p>
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
                            <p className="text-sm font-semibold text-slate-700 mb-1">Açıklama</p>
                            <p className="text-slate-700 whitespace-pre-wrap">{detail.resultText}</p>
                        </div>
                    )}
                    {detail.evidenceSummary && (
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">Kanıt Özeti</p>
                            <p className="text-slate-700 whitespace-pre-wrap">{detail.evidenceSummary}</p>
                        </div>
                    )}

                    {detail.attachments?.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Kanıt Ekleri</p>
                            <div className="space-y-1.5">
                                {detail.attachments.map((a: any) => (
                                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs">
                                        <span className="text-slate-700 truncate">{a.originalName}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Geri gönderme gerekçesi — ikincil durum */}
                    {returnMode && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                            <label className="block text-sm font-semibold text-slate-700">
                                Geri Gönderme Gerekçesi <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                autoFocus
                                value={returnReason}
                                onChange={e => setReturnReason(e.target.value)}
                                rows={3}
                                placeholder="Gerekçenizi yazın..."
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white resize-none
                                           focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => { setReturnMode(false); setReturnReason(''); }} disabled={saving}>
                                    İptal
                                </Button>
                                <Button variant="primary" size="sm" onClick={handleReturn} loading={saving} disabled={saving || !returnReason.trim()}>
                                    Onayla
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <Button variant="outline" onClick={onClose} disabled={saving}>Kapat</Button>
                        <Button variant="secondary" onClick={() => setReturnMode(true)} disabled={saving || returnMode} icon={<IconReturn />}>
                            Geri Gönder
                        </Button>
                        <Button variant="primary" onClick={handleApprove} loading={saving} disabled={returnMode} icon={<IconCheckCircle />}>
                            Onayla
                        </Button>
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
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
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

    const bulguluCount = useMemo(() => items.filter(i => i.findingStatus === 'BULGUSU_VAR').length, [items]);

    // ── Gelişmiş filtre alanları ──────────────────────────────────────────────

    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select', key: 'findingStatus', label: 'Kontrol Sonucu',
            value: activeFilters['findingStatus'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, findingStatus: v })); setPage(1); },
            options: Object.entries(findingStatusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
    ], [activeFilters]);

    // ── Aktif filtre chip'leri ────────────────────────────────────────────────

    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({ key: 'search', label: 'Arama', value: searchQuery, onRemove: () => { setSearchQuery(''); setPage(1); } });
        if (activeFilters.findingStatus) chips.push({
            key: 'findingStatus', label: 'Kontrol Sonucu',
            value: findingStatusConfig[activeFilters.findingStatus]?.label ?? activeFilters.findingStatus,
            onRemove: () => { setActiveFilters(p => ({ ...p, findingStatus: '' })); setPage(1); },
        });
        return chips;
    }, [searchQuery, activeFilters]);

    const clearAll = () => { setSearchQuery(''); setActiveFilters({}); setColFilters({}); setPage(1); };

    // ── Columns ───────────────────────────────────────────────────────────────

    const columns: ColumnDef<PendingApproval>[] = useMemo(() => [
        {
            key: 'type', header: 'Tür', defaultWidth: 110,
            render: () => <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold">Kontrol Testi</span>,
        },
        {
            key: 'testNo', header: 'Test No', sortable: true, defaultWidth: 130,
            filter: { type: 'text', placeholder: 'Test No...', fn: (t: PendingApproval, v) => t.testNo.toLowerCase().includes(v.toLowerCase()) },
            render: (t) => (
                <button onClick={() => setDetailId(t.id)} className="font-mono text-xs font-bold text-blue-700 hover:underline text-left cursor-pointer">
                    {t.testNo}
                </button>
            ),
        },
        {
            key: 'control', header: 'Kontrol', defaultWidth: 220,
            filter: { type: 'text', placeholder: 'Kontrol adı...', fn: (t: PendingApproval, v) => (t.control.name + ' ' + t.control.controlId).toLowerCase().includes(v.toLowerCase()) },
            render: (t) => (
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{t.control.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{t.control.controlId}</p>
                </div>
            ),
        },
        {
            key: 'directorate', header: 'Direktörlük', defaultWidth: 160,
            filter: { type: 'text', placeholder: 'Direktörlük...', fn: (t: PendingApproval, v) => (t.directorate?.name || '').toLowerCase().includes(v.toLowerCase()) },
            render: (t) => <span className="text-xs text-slate-600">{t.directorate?.name || '—'}</span>,
        },
        {
            key: 'findingStatus', header: 'Sonuç', defaultWidth: 110,
            filter: { type: 'select', options: Object.entries(findingStatusConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (t: PendingApproval, v) => t.findingStatus === v },
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

    const colFiltered = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return filtered;
        return filtered.filter(t => columns.every(col => {
            const val = colFilters[col.key];
            return !val || !col.filter?.fn || col.filter.fn(t, val);
        }));
    }, [filtered, colFilters, columns]);

    const paginated = useMemo(() => colFiltered.slice((page - 1) * pageSize, page * pageSize), [colFiltered, page]);

    return (
        <PageShell>
            <PageHeader
                title="Bekleyen Onaylar"
                description="Üzerinizde bekleyen ikinci kontrolcü onaylarını görüntüleyin ve karar verin"
                breadcrumbs={[{ label: 'Onaylarım' }]}
            />

            {/* KPI'lar */}
            <KpiGrid columns={3}>
                <KpiCard title="Bekleyen Onay" value={items.length} variant="default"
                    active={!activeFilters.findingStatus && !searchQuery}
                    onClick={clearAll} />
                <KpiCard title="Bulgulu" value={bulguluCount} variant="critical"
                    active={activeFilters.findingStatus === 'BULGUSU_VAR'}
                    onClick={() => { setActiveFilters(p => ({ ...p, findingStatus: p.findingStatus === 'BULGUSU_VAR' ? '' : 'BULGUSU_VAR' })); setPage(1); }} />
                <KpiCard title="Rol" value={<span className="text-sm">{user?.role?.name || '—'}</span>} variant="default" />
            </KpiGrid>

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={searchQuery}
                onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                searchPlaceholder="Test No, Kontrol adı, Direktörlük ara..."
                fields={advancedFields}
                activeCount={Object.values(activeFilters).filter(v => v).length}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            <DataTable
                columns={columns}
                data={paginated}
                rowKey={(t) => t.id}
                loading={loading}
                totalCount={colFiltered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="approvals-table"
                emptyTitle="Bekleyen onay yok"
                emptyDescription="Şu anda üzerinizde onay bekleyen bir kayıt bulunmuyor."
                onRowClick={(t) => setDetailId(t.id)}
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={load}
                toolbar={
                    <SavedViewMenu
                        storageKey="approvals-table"
                        getPayload={() => ({ search: searchQuery, filters: activeFilters, columnFilters: colFilters })}
                        onApply={(p) => {
                            setSearchQuery(typeof p.search === 'string' ? p.search : '');
                            setActiveFilters((p.filters as Record<string, string>) || {});
                            setColFilters((p.columnFilters as Record<string, string>) || {});
                            setPage(1);
                        }}
                    />
                }
            />

            {detailId && (
                <ApprovalDetailModal
                    id={detailId}
                    onClose={() => setDetailId(null)}
                    onDone={() => { setDetailId(null); load(); }}
                />
            )}
        </PageShell>
    );
}
