'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PLANNED: { label: 'Planlandı', color: 'bg-blue-100 text-blue-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-amber-100 text-amber-700' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700' },
};

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
    PLANNING: { label: 'Planlama', color: 'bg-slate-100 text-slate-700' },
    FIELDWORK: { label: 'Saha Çalışması', color: 'bg-indigo-100 text-indigo-700' },
    REPORTING: { label: 'Raporlama', color: 'bg-purple-100 text-purple-700' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
    HIGH: { label: 'Yüksek', color: 'bg-red-100 text-red-700' },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
    HIGH: { label: 'Yüksek', color: 'bg-red-100 text-red-700' },
    CRITICAL: { label: 'Kritik', color: 'bg-red-200 text-red-800' },
};

const FINDING_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'Açık', color: 'text-red-600' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'text-amber-600' },
    CLOSED: { label: 'Kapatıldı', color: 'text-green-600' },
};

const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

export default function AuditPlanDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'timeline' | 'activity'>('overview');
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

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <Link href="/audits/plans" className="hover:text-gray-700">Denetim Planları</Link>
                        <span>›</span>
                        <span className="text-gray-900">{audit.auditCode}</span>
                    </div>

                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-bold text-gray-900">{audit.auditName}</h1>
                                <span className={`px-2.5 py-1 text-xs font-medium rounded ${STATUS_CONFIG[audit.status].color}`}>
                                    {STATUS_CONFIG[audit.status].label}
                                </span>
                                <span className={`px-2.5 py-1 text-xs font-medium rounded ${PHASE_CONFIG[audit.phase].color}`}>
                                    {PHASE_CONFIG[audit.phase].label}
                                </span>
                            </div>
                            <p className="text-gray-500">{audit.auditCode} • {audit.auditedUnit} • {audit.year} {audit.period}</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link href={`/audits/plans/${params.id}/edit`} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                Düzenle
                            </Link>
                            <div className="relative">
                                <button onClick={() => setShowReportMenu(!showReportMenu)} className="px-4 py-2 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#152a45] flex items-center gap-1">
                                    Raporu İndir
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {showReportMenu && (
                                    <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                                        <button onClick={() => handleDownloadReport('pdf')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">PDF Olarak İndir</button>
                                        <button onClick={() => handleDownloadReport('word')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">Word Olarak İndir</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-6 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Öncelik</p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${PRIORITY_CONFIG[audit.priority].color}`}>{PRIORITY_CONFIG[audit.priority].label}</span>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Planlanan Gün</p>
                        <p className="text-xl font-bold text-gray-900">{audit.plannedManDays}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Gerçekleşen Gün</p>
                        <p className="text-xl font-bold text-gray-900">{audit.actualManDays}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Sapma</p>
                        <p className={`text-xl font-bold ${audit.scheduleVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {audit.scheduleVariance > 0 ? '+' : ''}{audit.scheduleVariance} gün
                        </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Toplam Bulgu</p>
                        <p className="text-xl font-bold text-gray-900">{findings.length}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-red-100">
                        <p className="text-xs text-red-600 mb-1">Açık Bulgu</p>
                        <p className="text-xl font-bold text-red-600">{openFindings}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-gray-200 mb-6">
                    {[
                        { id: 'overview', label: 'Genel Bakış' },
                        { id: 'findings', label: `Bulgular (${findings.length})` },
                        { id: 'timeline', label: 'Zaman Çizelgesi' },
                        { id: 'activity', label: 'Aktivite' },
                    ].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Findings Tab */}
                {activeTab === 'findings' && (
                    <div className="bg-white rounded-lg border border-gray-200">
                        {/* Findings Header */}
                        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900">Denetim Bulguları</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={handleExportTemplate} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Şablon İndir
                                </button>
                                <button onClick={handleExportFindings} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Dışa Aktar
                                </button>
                                <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    İçe Aktar
                                </button>
                                <button onClick={() => setShowAddFindingModal(true)} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Bulgu Ekle
                                </button>
                            </div>
                        </div>

                        {/* Findings Table */}
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bulgu ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Başlık</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ciddiyet</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Durum</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {findings.map(f => (
                                    <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3"><span className="text-blue-700 font-medium">{f.id}</span></td>
                                        <td className="px-4 py-3 text-gray-900">{f.title}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${SEVERITY_CONFIG[f.severity]?.color || ''}`}>
                                                {SEVERITY_CONFIG[f.severity]?.label || f.severity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-sm font-medium ${FINDING_STATUS_CONFIG[f.status]?.color || ''}`}>
                                                {FINDING_STATUS_CONFIG[f.status]?.label || f.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button className="text-gray-400 hover:text-blue-600">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-2 space-y-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Denetim Hedefleri</h2>
                                <p className="text-gray-700">{audit.objectives}</p>
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Denetim Kapsamı</h2>
                                <p className="text-gray-700">{audit.scope}</p>
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Takvim</h2>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs text-gray-500 mb-1">Planlanan Başlangıç</p>
                                        <p className="font-medium text-gray-900">{formatDate(audit.plannedStartDate)}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs text-gray-500 mb-1">Planlanan Bitiş</p>
                                        <p className="font-medium text-gray-900">{formatDate(audit.plannedEndDate)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Denetim Ekibi</h2>
                                <div className="space-y-3">
                                    {audit.teamMembers.map(m => (
                                        <div key={m.id} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium text-sm">
                                                    {m.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                                                    <p className="text-xs text-gray-500">{m.email}</p>
                                                </div>
                                            </div>
                                            {m.role === 'LEADER' && <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Lider</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="space-y-6">
                            {audit.milestones.map((m, idx) => (
                                <div key={idx} className="flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-4 h-4 rounded-full ${m.status === 'COMPLETED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        {idx < audit.milestones.length - 1 && <div className="w-0.5 h-12 bg-gray-200" />}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900">{m.name}</p>
                                        <p className="text-sm text-gray-500">Planlanan: {formatDate(m.plannedDate)}</p>
                                    </div>
                                    <span className={m.status === 'COMPLETED' ? 'text-green-600 text-sm' : 'text-gray-400 text-sm'}>
                                        {m.status === 'COMPLETED' ? '✓ Tamamlandı' : 'Bekliyor'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Activity Tab */}
                {activeTab === 'activity' && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="space-y-4">
                            {audit.activities.map((a, idx) => (
                                <div key={idx} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                                        {a.user.split(' ').map(n => n[0]).join('')}
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-900"><span className="font-medium">{a.user}</span> {a.action}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{formatDate(a.date)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Finding Modal */}
            {showAddFindingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Yeni Bulgu Ekle</h2>
                            <p className="text-sm text-gray-500">Otomatik eşsiz ID atanacak</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Başlık *</label>
                                <input type="text" value={newFinding.title} onChange={e => setNewFinding({ ...newFinding, title: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Bulgu başlığı" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                                <textarea value={newFinding.description} onChange={e => setNewFinding({ ...newFinding, description: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg" rows={2} placeholder="Detaylı açıklama" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciddiyet</label>
                                    <select value={newFinding.severity} onChange={e => setNewFinding({ ...newFinding, severity: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg">
                                        <option value="LOW">Düşük</option>
                                        <option value="MEDIUM">Orta</option>
                                        <option value="HIGH">Yüksek</option>
                                        <option value="CRITICAL">Kritik</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sorumlu Birim</label>
                                    <input type="text" value={newFinding.responsibleUnit} onChange={e => setNewFinding({ ...newFinding, responsibleUnit: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Birim adı" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Öneri</label>
                                <textarea value={newFinding.recommendation} onChange={e => setNewFinding({ ...newFinding, recommendation: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg" rows={2} placeholder="İyileştirme önerileri" />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowAddFindingModal(false)} className="px-4 py-2 text-sm text-gray-600">İptal</button>
                            <button onClick={handleAddFinding} disabled={!newFinding.title} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:bg-gray-300">Bulgu Ekle</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Bulgu İçe Aktar</h2>
                            <p className="text-sm text-gray-500">Her bulguya otomatik eşsiz ID atanacak</p>
                        </div>
                        <div className="p-6">
                            {importPreview.length > 0 && (
                                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                {importPreview[0]?.map((h, i) => (
                                                    <th key={i} className="px-3 py-2 text-left text-gray-500">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {importPreview.slice(1).map((row, ri) => (
                                                <tr key={ri}>
                                                    {row.map((c, ci) => (
                                                        <td key={ci} className="px-3 py-2 text-gray-700">{c}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="text-sm text-gray-500 mt-3">{importPreview.length - 1} bulgu import edilecek. Her birine eşsiz ID atanacak.</p>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => { setShowImportModal(false); setImportPreview([]); }} className="px-4 py-2 text-sm text-gray-600">İptal</button>
                            <button onClick={handleImportConfirm} className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg">İçe Aktar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
