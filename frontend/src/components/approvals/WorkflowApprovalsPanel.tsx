'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import type { WorkflowDecisionItem, WorkflowPendingItem } from '@/lib/api';
import { Button, DataTable, Modal, StatusBadge } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Maker-checker iş kutusu: ikinci kontrolcü olarak kararımı bekleyen aksiyon / takip
 * işleri ve birinci kontrolcüsü olduğum kayıtlar hakkında verilen son kararlar.
 * Butonlar yalnız arayüz kolaylığıdır; yetki arka uçta yeniden denetlenir.
 */

type BV = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

const KIND: Record<WorkflowPendingItem['kind'], { label: string; variant: BV }> = {
    ACTION_APPROVAL: { label: 'Aksiyon Onayı', variant: 'warning' },
    ACTION_DELETION: { label: 'Aksiyon Silme', variant: 'critical' },
    FOLLOWUP_APPROVAL: { label: 'Takip Onayı', variant: 'info' },
    FOLLOWUP_DELETION: { label: 'Takip Silme', variant: 'critical' },
    FINDING_CLOSURE: { label: 'Bulgu Kapanışı', variant: 'success' },
    FINDING_DELETION: { label: 'Bulgu Silme', variant: 'critical' },
};

const DECISION: Record<string, { label: string; variant: BV }> = {
    ACTION_REJECTED: { label: 'Aksiyon Reddedildi — Düzeltin', variant: 'critical' },
    ACTION_APPROVED: { label: 'Aksiyon Onaylandı', variant: 'success' },
    ACTION_REVERTED: { label: 'Aksiyon Onayı Geri Alındı', variant: 'warning' },
    ACTION_DELETED: { label: 'Aksiyon Silindi', variant: 'neutral' },
    ACTION_DELETE_REJECTED: { label: 'Aksiyon Silme Talebi Reddedildi', variant: 'warning' },
    FOLLOWUP_REJECTED: { label: 'Takip Reddedildi — Düzeltin', variant: 'critical' },
    FOLLOWUP_APPROVED: { label: 'Takip Onaylandı', variant: 'success' },
    FOLLOWUP_REVERTED: { label: 'Takip Onayı Geri Alındı', variant: 'warning' },
    FOLLOWUP_DELETED: { label: 'Takip Silindi', variant: 'neutral' },
    FOLLOWUP_DELETE_REJECTED: { label: 'Takip Silme Talebi Reddedildi', variant: 'warning' },
    FINDING_CLOSED: { label: 'Bulgu Kapatıldı', variant: 'success' },
    FINDING_CLOSURE_RETURNED: { label: 'Bulgu Kapanışı İade Edildi', variant: 'warning' },
    FINDING_DELETED: { label: 'Bulgu Silindi', variant: 'neutral' },
    FINDING_DELETE_REJECTED: { label: 'Bulgu Silme Talebi Reddedildi', variant: 'warning' },
    TEST_RETURNED: { label: 'Test Geri Gönderildi — Düzeltin', variant: 'critical' },
    TEST_APPROVED: { label: 'Test Onaylandı', variant: 'success' },
    TEST_DELETED: { label: 'Test Silindi', variant: 'neutral' },
    TEST_DELETE_REJECTED: { label: 'Test Silme Talebi Reddedildi', variant: 'warning' },
};

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

type Decide = { item: WorkflowPendingItem; approve: boolean };

export function WorkflowApprovalsPanel({ onCountChange }: { onCountChange?: (n: number) => void }) {
    const { success, error: showError } = useToast();
    const [items, setItems] = useState<WorkflowPendingItem[]>([]);
    const [decisions, setDecisions] = useState<WorkflowDecisionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [kindFilter, setKindFilter] = useState<string>('');
    const [deciding, setDeciding] = useState<Decide | null>(null);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getWorkflowApprovals();
            setItems(res.items || []);
            setDecisions(res.decisions || []);
            onCountChange?.(res.items?.length || 0);
        } catch {
            showError('Hata', 'Onay bekleyen işler yüklenemedi.');
            setItems([]); setDecisions([]);
        } finally { setLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => (kindFilter ? items.filter(i => i.kind === kindFilter) : items), [items, kindFilter]);

    const submitDecision = async () => {
        if (!deciding) return;
        const { item, approve } = deciding;
        if (!approve && !reason.trim()) { showError('Gerekçe gerekli', 'Ret için gerekçe yazın.'); return; }
        setSaving(true);
        try {
            const r = approve ? undefined : reason.trim();
            if (!item.finding) throw new Error('Bu kaydın kararı kendi detay ekranında verilir.');
            if (item.kind === 'ACTION_APPROVAL') await api.findingActionOp(item.finding.id, item.recordId, approve ? 'approve' : 'reject', r);
            else if (item.kind === 'ACTION_DELETION') await api.findingActionOp(item.finding.id, item.recordId, approve ? 'delete-approve' : 'delete-reject', r);
            else if (item.kind === 'FOLLOWUP_DELETION') await api.followUpOp(item.finding.id, item.recordId, approve ? 'delete-approve' : 'delete-reject', r);
            else if (item.kind === 'FINDING_DELETION') await api.decideDeletion('FINDING', item.recordId, approve, r);
            success('Kaydedildi', `${item.code}: ${approve ? 'onaylandı' : 'reddedildi'}.`);
            setDeciding(null); setReason('');
            load();
        } catch (err) {
            showError('İşlem yapılamadı', (err as Error).message);
        } finally { setSaving(false); }
    };

    const columns: ColumnDef<WorkflowPendingItem>[] = useMemo(() => [
        {
            key: 'kind', header: 'Tür', defaultWidth: 130,
            render: (i) => <StatusBadge variant={KIND[i.kind].variant}>{KIND[i.kind].label}</StatusBadge>,
        },
        {
            key: 'code', header: 'Kayıt', defaultWidth: 150,
            render: (i) => <span className="font-mono text-xs font-bold text-slate-700">{i.code}</span>,
        },
        {
            key: 'finding', header: 'Bulgu', defaultWidth: 190,
            render: (i) => i.finding ? (
                <Link href={i.link} className="block min-w-0 hover:underline">
                    <span className="font-mono text-[11px] text-violet-700">{i.finding.findingId}</span>
                    {i.finding.summary && <span className="block text-xs text-slate-600 truncate">{i.finding.summary}</span>}
                </Link>
            ) : <span className="text-xs text-slate-500">Manuel aksiyon planı</span>,
        },
        {
            key: 'detail', header: 'Açıklama / Gerekçe', defaultWidth: 220,
            render: (i) => (
                <div className="text-xs text-slate-600 line-clamp-2">
                    {i.reason ? <><span className="font-semibold">Gerekçe:</span> {i.reason}</> : (i.description || '—')}
                </div>
            ),
        },
        {
            key: 'requestedBy', header: 'Talep Eden', defaultWidth: 120,
            render: (i) => <span className="text-xs text-slate-600">{i.requestedBy?.name || '—'}</span>,
        },
        {
            key: 'requestedAt', header: 'Talep Tarihi', defaultWidth: 120,
            render: (i) => <span className="text-xs text-slate-600">{fmt(i.requestedAt)}</span>,
        },
        {
            key: 'ops', header: '', defaultWidth: 210,
            render: (i) => i.kind === 'FOLLOWUP_APPROVAL' || i.kind === 'FINDING_CLOSURE' || !i.finding ? (
                // Takip onayı ve bulgu kapanışı değerlendirmenin okunmasını gerektirir; manuel (bulgusuz)
                // kayıtların işlemleri bulgu ucundan yapılamaz — karar kaydın kendi detay ekranında verilir.
                <Link href={i.link}><Button size="sm" variant="primary">{i.kind === 'FINDING_CLOSURE' ? 'Kapanışı İncele' : i.kind === 'FOLLOWUP_APPROVAL' ? 'Değerlendirmeyi İncele' : 'İncele'}</Button></Link>
            ) : (
                <div className="flex gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => { setReason(''); setDeciding({ item: i, approve: true }); }}>
                        {i.kind === 'ACTION_APPROVAL' ? 'Onayla' : 'Silmeyi Onayla'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setReason(''); setDeciding({ item: i, approve: false }); }}>Reddet</Button>
                </div>
            ),
        },
    ], []);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        items.forEach(i => { c[i.kind] = (c[i.kind] || 0) + 1; });
        return c;
    }, [items]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tür filtresi">
                <button type="button" onClick={() => setKindFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${!kindFilter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                    Tümü ({items.length})
                </button>
                {(Object.keys(KIND) as WorkflowPendingItem['kind'][]).map(k => (
                    <button key={k} type="button" onClick={() => setKindFilter(k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kindFilter === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {KIND[k].label} ({counts[k] || 0})
                    </button>
                ))}
            </div>

            <DataTable
                columns={columns}
                data={filtered}
                rowKey={(i) => `${i.kind}-${i.recordId}`}
                loading={loading}
                totalCount={filtered.length}
                page={1}
                pageSize={Math.max(filtered.length, 1)}
                onPageChange={() => undefined}
                storageKey="workflow-approvals-table"
                emptyTitle="Onayınızı bekleyen aksiyon, takip, bulgu kapanışı veya bulgu silme talebi yok"
                emptyDescription="İkinci kontrolcüsü olduğunuz kayıtlar onaya gönderildiğinde burada görünür."
                onRefresh={load}
            />

            {/* Kayıtlarım hakkındaki kararlar "Taleplerim" sekmesine taşındı (MyRequestsPanel). */}

            <Modal open={!!deciding} onClose={() => { if (!saving) setDeciding(null); }} size="sm">
                {deciding && (
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-slate-800">
                            {deciding.item.code} — {deciding.approve ? 'Onayla' : 'Reddet'}
                        </h3>
                        <p className="text-sm text-slate-500">
                            {deciding.approve
                                ? deciding.item.kind === 'ACTION_APPROVAL'
                                    ? 'Aksiyon onaylanınca takip çalışması hedef tarihte oluşturulur.'
                                    : deciding.item.kind === 'FINDING_DELETION'
                                        ? 'Bulgu "İptal" olarak işaretlenir; bağlı açık aksiyon ve takip çalışmaları da iptal edilir. Kayıtlar denetim için korunur.'
                                        : 'Silme onaylanınca kayıt "Silindi" olarak işaretlenir (kayıt korunur).'
                                : (deciding.item.kind === 'FINDING_DELETION' ? 'Gerekçe talep edene iletilir; bulgu mevcut haliyle kalır.' : 'Gerekçe birinci kontrolcüye iletilir.')}
                        </p>
                        {!deciding.approve && (
                            <>
                                <label htmlFor="wf-decision-reason" className="block text-sm font-medium text-slate-700">Gerekçe *</label>
                                <textarea id="wf-decision-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setDeciding(null)} disabled={saving}>Vazgeç</Button>
                            <Button variant={deciding.approve ? 'primary' : 'danger'} onClick={submitDecision} loading={saving}
                                disabled={!deciding.approve && !reason.trim()}>
                                {deciding.approve ? 'Onayla' : 'Reddet'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default WorkflowApprovalsPanel;
