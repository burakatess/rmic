'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DetailShell, DetailHeader, Tabs, StatusBadge, Button } from '@/components/ui';

// Finding ID generator - persists across sessions using timestamp + random
const generateFindingId = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `F-${timestamp}-${random}`;
};

// Types
interface Finding {
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    recommendation: string;
    responsibleUnit: string;
}

// Demo data
const DEMO_AUDIT = {
    id: '1',
    auditCode: 'AP-2024-001',
    auditName: 'Bilgi Güvenliği Yıllık Denetimi',
    auditType: 'İç Denetim',
    auditedUnit: 'Bilgi Teknolojileri',
    auditTeam: 'BT Denetim Ekibi',
    teamLeader: { name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@company.com' },
    teamMembers: [
        { id: '1', name: 'Ahmet Yılmaz', role: 'LEADER', email: 'ahmet.yilmaz@company.com' },
        { id: '2', name: 'Ayşe Kaya', role: 'MEMBER', email: 'ayse.kaya@company.com' },
        { id: '3', name: 'Mehmet Demir', role: 'MEMBER', email: 'mehmet.demir@company.com' },
    ],
    status: 'COMPLETED',
    phase: 'CLOSED',
    rationale: 'PERIODIC',
    priority: 'HIGH',
    plannedStartDate: '2024-01-15',
    plannedEndDate: '2024-02-15',
    actualStartDate: '2024-01-15',
    actualEndDate: '2024-02-20',
    plannedManDays: 30,
    actualManDays: 35,
    scheduleVariance: 5,
    delayStatus: 'DELAYED',
    draftReportDate: '2024-02-25',
    finalReportDate: '2024-03-05',
    year: 2024,
    period: 'Q1',
    objectives: 'Bilgi güvenliği politikalarının uygulanma durumunun değerlendirilmesi.',
    scope: 'Ağ güvenliği, kimlik yönetimi, veri şifreleme, yedekleme prosedürleri.',
    milestones: [
        { name: 'Planlama Toplantısı', plannedDate: '2024-01-10', actualDate: '2024-01-10', status: 'COMPLETED' },
        { name: 'Saha Çalışması', plannedDate: '2024-01-15', actualDate: '2024-01-15', status: 'COMPLETED' },
        { name: 'Taslak Rapor', plannedDate: '2024-02-15', actualDate: '2024-02-25', status: 'COMPLETED' },
        { name: 'Final Rapor', plannedDate: '2024-02-28', actualDate: '2024-03-05', status: 'COMPLETED' },
    ],
    activities: [
        { date: '2024-03-05', user: 'Ahmet Yılmaz', action: 'Final rapor yayınlandı' },
        { date: '2024-02-25', user: 'Ayşe Kaya', action: 'Taslak rapor tamamlandı' },
    ],
};

// Config
type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    PLANNED: { label: 'Planlandı', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
};

const PHASE_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    PLANNING: { label: 'Planlama', variant: 'neutral' },
    FIELDWORK: { label: 'Saha Çalışması', variant: 'primary' },
    REPORTING: { label: 'Raporlama', variant: 'medium' },
    CLOSED: { label: 'Kapatıldı', variant: 'low' },
};

const PRIORITY_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    LOW: { label: 'Düşük', variant: 'low' },
    MEDIUM: { label: 'Orta', variant: 'warning' },
    HIGH: { label: 'Yüksek', variant: 'critical' },
};

const SEVERITY_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    LOW: { label: 'Düşük', variant: 'low' },
    MEDIUM: { label: 'Orta', variant: 'warning' },
    HIGH: { label: 'Yüksek', variant: 'high' },
    CRITICAL: { label: 'Kritik', variant: 'critical' },
};

const FINDING_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    OPEN: { label: 'Açık', variant: 'critical' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    CLOSED: { label: 'Kapatıldı', variant: 'success' },
};

const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

export default function AuditPlanDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<string>('overview');
    const [showReportMenu, setShowReportMenu] = useState(false);
    const [showAddFindingModal, setShowAddFindingModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPreview, setImportPreview] = useState<string[][]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial findings from demo
    const [findings, setFindings] = useState<Finding[]>([
        { id: 'F-LZQ1X2-AB12', title: 'Yetkisiz erişim loglarında eksiklik', description: '', severity: 'HIGH', status: 'IN_PROGRESS', recommendation: '', responsibleUnit: '' },
        { id: 'F-LZQ1X3-CD34', title: 'Şifre politikası güncel değil', description: '', severity: 'MEDIUM', status: 'OPEN', recommendation: '', responsibleUnit: '' },
        { id: 'F-LZQ1X4-EF56', title: 'Yedekleme testleri düzenli yapılmıyor', description: '', severity: 'HIGH', status: 'IN_PROGRESS', recommendation: '', responsibleUnit: '' },
        { id: 'F-LZQ1X5-GH78', title: 'Güvenlik eğitimleri periyodik değil', description: '', severity: 'LOW', status: 'CLOSED', recommendation: '', responsibleUnit: '' },
    ]);

    // New finding form
    const [newFinding, setNewFinding] = useState({
        title: '', description: '', severity: 'MEDIUM', recommendation: '', responsibleUnit: ''
    });

    const audit = DEMO_AUDIT;
    const openFindings = findings.filter(f => f.status !== 'CLOSED').length;

    // Report download
    const handleDownloadReport = (format: 'pdf' | 'word') => {
        const reportContent = `
DENETIM RAPORU
==============

Denetim Kodu: ${audit.auditCode}
Denetim Adı: ${audit.auditName}
Denetlenen Birim: ${audit.auditedUnit}
Dönem: ${audit.year} ${audit.period}

DENETIM EKİBİ
-------------
${audit.teamMembers.map(m => `- ${m.name} (${m.role === 'LEADER' ? 'Lider' : 'Üye'})`).join('\n')}

HEDEFLER
--------
${audit.objectives}

KAPSAM
------
${audit.scope}

BULGULAR (${findings.length} adet)
-----------
${findings.map(f => `
[${f.id}] ${f.title}
Ciddiyet: ${SEVERITY_CONFIG[f.severity]?.label}
Durum: ${FINDING_STATUS_CONFIG[f.status]?.label}
`).join('\n')}

Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}
        `.trim();

        const blob = new Blob([reportContent], { type: format === 'pdf' ? 'application/pdf' : 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${audit.auditCode}_Rapor.${format === 'pdf' ? 'pdf' : 'docx'}`;
        a.click();
        setShowReportMenu(false);
    };

    // Add finding
    const handleAddFinding = () => {
        const newId = generateFindingId();
        setFindings(prev => [...prev, { ...newFinding, id: newId, status: 'OPEN' }]);
        setNewFinding({ title: '', description: '', severity: 'MEDIUM', recommendation: '', responsibleUnit: '' });
        setShowAddFindingModal(false);
    };

    // Export template
    const handleExportTemplate = () => {
        const headers = ['Bulgu ID (Otomatik)', 'Başlık', 'Açıklama', 'Ciddiyet (LOW/MEDIUM/HIGH/CRITICAL)', 'Öneri', 'Sorumlu Birim'];
        const csv = headers.join(';') + '\n';
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${audit.auditCode}_Bulgu_Sablonu.csv`;
        a.click();
    };

    // Export current findings
    const handleExportFindings = () => {
        const headers = ['Bulgu ID', 'Başlık', 'Açıklama', 'Ciddiyet', 'Durum', 'Öneri', 'Sorumlu Birim'];
        const rows = findings.map(f => [f.id, f.title, f.description, f.severity, f.status, f.recommendation, f.responsibleUnit]);
        const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${audit.auditCode}_Bulgular.csv`;
        a.click();
    };

    // Import findings
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n').filter(l => l.trim());
            const parsed = lines.map(l => l.split(';').map(c => c.trim()));
            setImportPreview(parsed.slice(0, 5));
        };
        reader.readAsText(file);
        setShowImportModal(true);
    };

    const handleImportConfirm = () => {
        // Skip header row, add findings with new unique IDs
        const newFindings = importPreview.slice(1).map(row => ({
            id: generateFindingId(),
            title: row[1] || '',
            description: row[2] || '',
            severity: row[3] || 'MEDIUM',
            status: 'OPEN',
            recommendation: row[4] || '',
            responsibleUnit: row[5] || '',
        }));
        setFindings(prev => [...prev, ...newFindings]);
        setShowImportModal(false);
        setImportPreview([]);
    };

    const tabs = [
        { key: 'overview', label: 'Genel Bakış' },
        { key: 'findings', label: 'Bulgular', count: findings.length },
        { key: 'timeline', label: 'Zaman Çizelgesi' },
        { key: 'activity', label: 'Aktivite' },
    ];

    const statusCfg = STATUS_CONFIG[audit.status];
    const phaseCfg = PHASE_CONFIG[audit.phase];

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Denetim' },
                    { label: 'Denetim Planları', href: '/audits/plans' },
                    { label: audit.auditCode },
                ]}
                entityId={audit.auditCode}
                title={audit.auditName}
                badges={
                    <>
                        {statusCfg && <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>}
                        {phaseCfg && <StatusBadge variant={phaseCfg.variant}>{phaseCfg.label}</StatusBadge>}
                    </>
                }
                meta={
                    <>
                        <span>{audit.auditedUnit}</span>
                        <span>{audit.year} {audit.period}</span>
                        <span>Ekip Lideri: {audit.teamLeader.name}</span>
                    </>
                }
                actions={
                    <>
                        <Link href={`/audits/plans/${params.id}/edit`}>
                            <Button variant="outline" size="sm">Düzenle</Button>
                        </Link>
                        <div className="relative">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowReportMenu(!showReportMenu)}
                                icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                            >
                                Raporu İndir
                            </Button>
                            {showReportMenu && (
                                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5">
                                    <button onClick={() => handleDownloadReport('pdf')} className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">PDF Olarak İndir</button>
                                    <button onClick={() => handleDownloadReport('word')} className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">Word Olarak İndir</button>
                                </div>
                            )}
                        </div>
                    </>
                }
            />

            {/* Hızlı istatistikler */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Öncelik</p>
                    {PRIORITY_CONFIG[audit.priority] && (
                        <StatusBadge variant={PRIORITY_CONFIG[audit.priority].variant}>{PRIORITY_CONFIG[audit.priority].label}</StatusBadge>
                    )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Planlanan Gün</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{audit.plannedManDays}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Gerçekleşen Gün</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{audit.actualManDays}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Sapma</p>
                    <p className={`text-xl font-bold tabular-nums ${audit.scheduleVariance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {audit.scheduleVariance > 0 ? '+' : ''}{audit.scheduleVariance} gün
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Toplam Bulgu</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{findings.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-red-600 mb-1">Açık Bulgu</p>
                    <p className="text-xl font-bold tabular-nums text-red-700">{openFindings}</p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

            {/* Findings Tab */}
            {activeTab === 'findings' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Findings Header */}
                    <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-slate-700">Denetim Bulguları</h2>
                        <div className="flex items-center gap-2">
                            <button onClick={handleExportTemplate} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Şablon İndir
                            </button>
                            <button onClick={handleExportFindings} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Dışa Aktar
                            </button>
                            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                İçe Aktar
                            </button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowAddFindingModal(true)}
                                icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Bulgu Ekle
                            </Button>
                        </div>
                    </div>

                    {/* Findings Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/80 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulgu ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Başlık</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Ciddiyet</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Durum</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {findings.map(f => (
                                    <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3"><span className="font-mono text-xs font-semibold text-blue-700">{f.id}</span></td>
                                        <td className="px-4 py-3 text-slate-800">{f.title}</td>
                                        <td className="px-4 py-3 text-center">
                                            {SEVERITY_CONFIG[f.severity] ? (
                                                <StatusBadge variant={SEVERITY_CONFIG[f.severity].variant}>{SEVERITY_CONFIG[f.severity].label}</StatusBadge>
                                            ) : (
                                                <span className="text-xs text-slate-500">{f.severity}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {FINDING_STATUS_CONFIG[f.status] ? (
                                                <StatusBadge variant={FINDING_STATUS_CONFIG[f.status].variant}>{FINDING_STATUS_CONFIG[f.status].label}</StatusBadge>
                                            ) : (
                                                <span className="text-xs text-slate-500">{f.status}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer" title="Görüntüle" aria-label="Görüntüle">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Hedefleri</h2>
                            <p className="text-sm text-slate-600 leading-relaxed">{audit.objectives}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Kapsamı</h2>
                            <p className="text-sm text-slate-600 leading-relaxed">{audit.scope}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Takvim</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Planlanan Başlangıç</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.plannedStartDate)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Planlanan Bitiş</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.plannedEndDate)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Ekibi</h2>
                            <div className="space-y-3">
                                {audit.teamMembers.map(m => (
                                    <div key={m.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium text-sm">
                                                {m.name.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-800">{m.name}</p>
                                                <p className="text-xs text-slate-500">{m.email}</p>
                                            </div>
                                        </div>
                                        {m.role === 'LEADER' && <StatusBadge variant="primary">Lider</StatusBadge>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4">Kilometre Taşları</h2>
                    <div className="space-y-6">
                        {audit.milestones.map((m, idx) => (
                            <div key={idx} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className={`w-4 h-4 rounded-full ${m.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    {idx < audit.milestones.length - 1 && <div className="w-0.5 h-12 bg-slate-200" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-slate-800">{m.name}</p>
                                    <p className="text-sm text-slate-500">Planlanan: {formatDate(m.plannedDate)}</p>
                                </div>
                                {m.status === 'COMPLETED' ? (
                                    <StatusBadge variant="success">Tamamlandı</StatusBadge>
                                ) : (
                                    <StatusBadge variant="neutral">Bekliyor</StatusBadge>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Activity Tab */}
            {activeTab === 'activity' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4">Aktivite Geçmişi</h2>
                    <div className="space-y-4">
                        {audit.activities.map((a, idx) => (
                            <div key={idx} className="flex items-start gap-3 pb-4 border-b border-slate-100 last:border-0">
                                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 text-sm font-medium">
                                    {a.user.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div>
                                    <p className="text-sm text-slate-800"><span className="font-medium">{a.user}</span> {a.action}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{formatDate(a.date)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add Finding Modal */}
            {showAddFindingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-700">Yeni Bulgu Ekle</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Otomatik eşsiz ID atanacak</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Başlık <span className="text-red-500">*</span></label>
                                <input type="text" value={newFinding.title} onChange={e => setNewFinding({ ...newFinding, title: e.target.value })}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Bulgu başlığı" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Açıklama</label>
                                <textarea value={newFinding.description} onChange={e => setNewFinding({ ...newFinding, description: e.target.value })}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" rows={2} placeholder="Detaylı açıklama" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Ciddiyet</label>
                                    <select value={newFinding.severity} onChange={e => setNewFinding({ ...newFinding, severity: e.target.value })}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                        <option value="LOW">Düşük</option>
                                        <option value="MEDIUM">Orta</option>
                                        <option value="HIGH">Yüksek</option>
                                        <option value="CRITICAL">Kritik</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sorumlu Birim</label>
                                    <input type="text" value={newFinding.responsibleUnit} onChange={e => setNewFinding({ ...newFinding, responsibleUnit: e.target.value })}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Birim adı" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Öneri</label>
                                <textarea value={newFinding.recommendation} onChange={e => setNewFinding({ ...newFinding, recommendation: e.target.value })}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" rows={2} placeholder="İyileştirme önerileri" />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setShowAddFindingModal(false)}>İptal</Button>
                            <Button variant="primary" onClick={handleAddFinding} disabled={!newFinding.title}>Bulgu Ekle</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-700">Bulgu İçe Aktar</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Her bulguya otomatik eşsiz ID atanacak</p>
                        </div>
                        <div className="p-6">
                            {importPreview.length > 0 && (
                                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {importPreview[0]?.map((h, i) => (
                                                    <th key={i} className="px-3 py-2 text-left text-slate-500">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {importPreview.slice(1).map((row, ri) => (
                                                <tr key={ri}>
                                                    {row.map((c, ci) => (
                                                        <td key={ci} className="px-3 py-2 text-slate-700">{c}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="text-sm text-slate-500 mt-3">{importPreview.length - 1} bulgu import edilecek. Her birine eşsiz ID atanacak.</p>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => { setShowImportModal(false); setImportPreview([]); }}>İptal</Button>
                            <Button variant="primary" onClick={handleImportConfirm}>İçe Aktar</Button>
                        </div>
                    </div>
                </div>
            )}
        </DetailShell>
    );
}
