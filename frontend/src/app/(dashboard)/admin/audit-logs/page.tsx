'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { PageHeader, DataTable, StatusBadge } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface AuditLog {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
    user?: { id: string; email: string; firstName: string; lastName: string };
}

const ACTION_LABELS: Record<string, { label: string; variant: 'critical' | 'warning' | 'success' | 'info' | 'neutral' }> = {
    CREATE: { label: 'Oluşturma', variant: 'success' },
    UPDATE: { label: 'Güncelleme', variant: 'warning' },
    DELETE: { label: 'Silme', variant: 'critical' },
    LOGIN: { label: 'Giriş', variant: 'info' },
    LOGOUT: { label: 'Çıkış', variant: 'neutral' },
    APPROVAL: { label: 'Onay', variant: 'info' },
};

const SIEM_FORMATS = [
    { value: 'cef', label: 'CEF — QRadar / ArcSight' },
    { value: 'leef', label: 'LEEF — IBM QRadar' },
    { value: 'json', label: 'JSON / NDJSON — Splunk' },
];

function fmt(d: string) {
    return new Date(d).toLocaleString('tr-TR');
}

export default function AuditLogsPage() {
    const { user } = useAuth();
    const { success: toastSuccess, error: toastError } = useToast();

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<AuditLog | null>(null);

    // Filters
    const [entityType, setEntityType] = useState('');
    const [action, setAction] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [limit, setLimit] = useState('200');

    // SIEM
    const [siemFormat, setSiemFormat] = useState('cef');
    const [siemConfig, setSiemConfig] = useState({ format: 'CEF', syslogHost: '', syslogPort: 514, enabled: false });
    const [savingConfig, setSavingConfig] = useState(false);
    const [exporting, setExporting] = useState(false);

    const isAdmin = user?.role?.name === 'SYSTEM_ADMIN' || user?.role?.permissions?.includes('*');

    const buildParams = useCallback(() => {
        const params = new URLSearchParams();
        if (entityType) params.set('entityType', entityType);
        if (action) params.set('action', action);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', `${endDate}T23:59:59`);
        if (limit) params.set('limit', limit);
        return params;
    }, [entityType, action, startDate, endDate, limit]);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.request<AuditLog[]>(`/admin/audit-logs?${buildParams()}`);
            setLogs(data);
        } catch (err: any) {
            toastError('Hata', err.message || 'Denetim izleri yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [buildParams, toastError]);

    useEffect(() => {
        if (isAdmin) {
            loadLogs();
            api.request<any>('/admin/siem-config')
                .then(cfg => setSiemConfig(c => ({ ...c, ...cfg })))
                .catch(() => { });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = buildParams();
            params.set('format', siemFormat);
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch(`${API_BASE_URL}/admin/audit-logs/export?${params}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error(`Dışa aktarım başarısız (HTTP ${res.status})`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${siemFormat}-${new Date().toISOString().slice(0, 10)}.${siemFormat === 'json' ? 'ndjson' : 'log'}`;
            a.click();
            URL.revokeObjectURL(url);
            toastSuccess('Başarılı', 'Denetim izleri indirildi.');
        } catch (err: any) {
            toastError('Hata', err.message || 'Dışa aktarım başarısız.');
        } finally {
            setExporting(false);
        }
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        try {
            await api.request('/admin/siem-config', { method: 'PUT', body: siemConfig });
            toastSuccess('Başarılı', 'SIEM yapılandırması kaydedildi.');
        } catch (err: any) {
            toastError('Hata', err.message || 'Yapılandırma kaydedilemedi.');
        } finally {
            setSavingConfig(false);
        }
    };

    const columns: ColumnDef<AuditLog>[] = [
        {
            key: 'createdAt', header: 'Tarih', defaultWidth: 150,
            render: (l) => <span className="text-xs text-slate-600 font-mono">{fmt(l.createdAt)}</span>,
        },
        {
            key: 'user', header: 'Kullanıcı', defaultWidth: 180,
            render: (l) => l.user
                ? <div><p className="text-xs font-semibold text-slate-800">{l.user.firstName} {l.user.lastName}</p><p className="text-[10px] text-slate-400">{l.user.email}</p></div>
                : <span className="text-xs text-slate-400">Sistem</span>,
        },
        {
            key: 'action', header: 'İşlem', defaultWidth: 110,
            render: (l) => {
                const cfg = ACTION_LABELS[l.action] ?? { label: l.action, variant: 'neutral' as const };
                return <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>;
            },
        },
        {
            key: 'entityType', header: 'Kayıt Tipi', defaultWidth: 130,
            render: (l) => <span className="text-xs font-mono text-indigo-600">{l.entityType}</span>,
        },
        {
            key: 'entityId', header: 'Kayıt ID', defaultWidth: 200,
            render: (l) => <span className="text-[10px] font-mono text-slate-500 truncate block">{l.entityId}</span>,
        },
        {
            key: 'ipAddress', header: 'IP', defaultWidth: 110,
            render: (l) => <span className="text-xs text-slate-500">{l.ipAddress ?? '—'}</span>,
        },
    ];

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="font-medium">Bu sayfa yalnızca Sistem Yöneticisi rolüne açıktır</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Denetim İzleri" description="Sistem aktivite kayıtları ve SIEM dışa aktarımı" />

            {/* Filtreler */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">İşlem</label>
                    <select value={action} onChange={e => setAction(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                        <option value="">Tümü</option>
                        {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Kayıt Tipi</label>
                    <input type="text" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="Finding, Control..."
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-40" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Başlangıç</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Bitiş</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Limit</label>
                    <select value={limit} onChange={e => setLimit(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                        {['100', '200', '500', '1000'].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
                <button onClick={loadLogs} disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                    {loading ? 'Yükleniyor...' : 'Filtrele'}
                </button>
            </div>

            {/* Tablo */}
            <DataTable
                columns={columns}
                data={logs}
                rowKey={(l) => l.id}
                onRowClick={(l) => setDetail(l)}
                loading={loading}
                emptyTitle="Denetim izi bulunamadı"
                storageKey="audit-logs-table"
            />

            {/* SIEM Dışa Aktarım */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">SIEM Dışa Aktarım</h3>
                    <p className="text-xs text-slate-500 mt-0.5">QRadar, Splunk, ArcSight gibi SIEM platformlarına uygun formatta dışa aktarın</p>
                </div>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Manuel indirme */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Dosya Olarak İndir</h4>
                        <p className="text-xs text-slate-500 mb-3">Yukarıdaki filtreler indirmeye de uygulanır.</p>
                        <div className="flex gap-3">
                            <select value={siemFormat} onChange={e => setSiemFormat(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                                {SIEM_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <button onClick={handleExport} disabled={exporting}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                                {exporting ? 'İndiriliyor...' : 'İndir'}
                            </button>
                        </div>
                    </div>

                    {/* Syslog yönlendirme config */}
                    <form onSubmit={handleSaveConfig}>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Syslog Yönlendirme Yapılandırması</h4>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Syslog Sunucu</label>
                                    <input type="text" value={siemConfig.syslogHost} placeholder="siem.sirket.local"
                                        onChange={e => setSiemConfig(c => ({ ...c, syslogHost: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Port</label>
                                    <input type="number" value={siemConfig.syslogPort}
                                        onChange={e => setSiemConfig(c => ({ ...c, syslogPort: parseInt(e.target.value) || 514 }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Format</label>
                                    <select value={siemConfig.format}
                                        onChange={e => setSiemConfig(c => ({ ...c, format: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                                        <option value="CEF">CEF</option>
                                        <option value="LEEF">LEEF</option>
                                        <option value="JSON">JSON</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 mt-5 text-sm text-slate-700 cursor-pointer">
                                    <input type="checkbox" checked={siemConfig.enabled}
                                        onChange={e => setSiemConfig(c => ({ ...c, enabled: e.target.checked }))}
                                        className="w-4 h-4 text-indigo-600 rounded" />
                                    Aktif
                                </label>
                            </div>
                            <button type="submit" disabled={savingConfig}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                                {savingConfig ? 'Kaydediliyor...' : 'Yapılandırmayı Kaydet'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Detay Modal */}
            {detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
                            <h3 className="font-bold text-slate-900">Denetim İzi Detayı</h3>
                            <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><p className="text-xs text-slate-400">Tarih</p><p className="font-mono">{fmt(detail.createdAt)}</p></div>
                                <div><p className="text-xs text-slate-400">Kullanıcı</p><p>{detail.user ? `${detail.user.firstName} ${detail.user.lastName}` : 'Sistem'}</p></div>
                                <div><p className="text-xs text-slate-400">İşlem</p><p>{ACTION_LABELS[detail.action]?.label ?? detail.action}</p></div>
                                <div><p className="text-xs text-slate-400">Kayıt</p><p className="font-mono text-xs">{detail.entityType} / {detail.entityId}</p></div>
                                {detail.ipAddress && <div><p className="text-xs text-slate-400">IP</p><p className="font-mono text-xs">{detail.ipAddress}</p></div>}
                            </div>
                            {detail.oldValue != null && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 mb-1">Eski Değer</p>
                                    <pre className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-[11px] overflow-x-auto max-h-48">{JSON.stringify(detail.oldValue, null, 2)}</pre>
                                </div>
                            )}
                            {detail.newValue != null && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 mb-1">Yeni Değer</p>
                                    <pre className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-[11px] overflow-x-auto max-h-48">{JSON.stringify(detail.newValue, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
