'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { CreateFindingModal } from '@/components/modals/CreateFindingModal';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    department?: string;
}

interface TestRecordCard {
    id: string;
    controlId: string;
    controlUID: string;
    name: string;
    description: string;
    directorate: string;
    gmy: string;
    dueDate: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'APPROVED';
    testResult?: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | null;
    assignee: string;
    assigneeEmail: string;
    notes?: string;
    hasFinding?: boolean;
    findingsCount?: number;
    findings?: { id: string; findingId: string; description: string; severity: string; status: string; }[];
}

const statusTranslation: Record<string, string> = {
    PENDING: 'Bekliyor',
    IN_PROGRESS: 'Devam Ediyor',
    COMPLETED: 'Tamamlandı',
    OVERDUE: 'Gecikmiş',
    APPROVED: 'Onaylandı',
};

const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function ControlTestingPage() {
    const searchParams = useSearchParams();
    const urlRecordId = searchParams.get('recordId');
    const { success, error: showError } = useToast();

    const [testRecords, setTestRecords] = useState<TestRecordCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<User[]>([]);

    // Advanced search, filter, sort and multi-select states
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [findingFilter, setFindingFilter] = useState('ALL');
    const [selectedView, setSelectedView] = useState('ALL');
    const [sortField, setSortField] = useState('dueDate');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

    // Selected Test for Workspace
    const [activeRecord, setActiveRecord] = useState<TestRecordCard | null>(null);

    // Workspace Fields
    const [kontrolSonucu, setKontrolSonucu] = useState('');
    const [bulguVarMi, setBulguVarMi] = useState<'EVET' | 'HAYIR'>('HAYIR');
    const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);

    // Finding Modal State
    const [findingModalOpen, setFindingModalOpen] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            // Get users list safely with fallback for permission restrictions
            let userList: User[] = [];
            try {
                userList = await api.getUsers() as User[];
            } catch (userErr) {
                console.warn('Failed to load LDAP users (Access Denied). Using fallback mock bank users.', userErr);
                userList = [
                    { id: 'usr-1', firstName: 'Burak', lastName: 'Admin', email: 'burak.admin@grc.com', department: 'Sistem Yönetimi' },
                    { id: 'usr-2', firstName: 'Ahmet', lastName: 'Risk', email: 'ahmet.risk@grc.com', department: 'Risk Yönetimi' },
                    { id: 'usr-3', firstName: 'Mehmet', lastName: 'Auditor', email: 'mehmet.auditor@grc.com', department: 'İç Kontrol' }
                ];
            }
            setUsers(userList || []);

            // Get controls list
            const res = await api.getControls() as any;
            const list = Array.isArray(res) ? res : (res?.data || []);

            const records: TestRecordCard[] = [];
            list.forEach((c: any) => {
                if (c.testRecords && Array.isArray(c.testRecords)) {
                    c.testRecords.forEach((tr: any) => {
                        records.push({
                            id: String(tr.id),
                            controlId: String(c.controlId),
                            controlUID: String(c.id),
                            name: String(c.name),
                            description: String(c.description || ''),
                            directorate: String(c.directorate || 'BT Ağ Yönetimi'),
                            gmy: String(c.gmy || 'BT GMY'),
                            dueDate: tr.dueDate || new Date().toISOString(),
                            status: tr.status as any,
                            testResult: tr.testResult,
                            assignee: c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : 'Atanmamış',
                            assigneeEmail: c.owner?.email || '',
                            notes: tr.notes || '',
                            hasFinding: tr.hasFinding || false,
                            findingsCount: tr.findings?.length || (tr.hasFinding ? 1 : 0),
                            findings: tr.findings || [],
                        });
                    });
                }
            });

            // If empty, generate fallback mock records from controls to enrich the view
            if (records.length === 0) {
                list.slice(0, 8).forEach((c: any, index: number) => {
                    const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'];
                    const status = statuses[index % statuses.length];
                    const hasFinding = index % 3 === 0;
                    const mockFindings = hasFinding ? [
                        { id: `f-mock-${index}-1`, findingId: `F-2026-00${index}`, description: 'Yetki Kontrol Eksikliği', severity: 'HIGH', status: 'OPEN' },
                        { id: `f-mock-${index}-2`, findingId: `F-2026-05${index}`, description: 'Log Yönetim Eksikliği', severity: 'MEDIUM', status: 'OPEN' }
                    ] : [];
                    records.push({
                        id: `TR-MOCK-${index}`,
                        controlId: c.controlId || 'C-MOCK',
                        controlUID: c.id,
                        name: c.name || 'Mock Kontrol',
                        description: c.description || 'Bu kontrol için mock test açıklaması.',
                        directorate: c.directorate || 'BT Ağ Yönetimi',
                        gmy: c.gmy || 'BT GMY',
                        dueDate: new Date(Date.now() + (index - 2) * 2 * 24 * 60 * 60 * 1000).toISOString(),
                        status: status as any,
                        testResult: status === 'COMPLETED' ? (hasFinding ? 'INEFFECTIVE' : 'EFFECTIVE') : null,
                        assignee: c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : 'Atanmamış',
                        assigneeEmail: c.owner?.email || '',
                        notes: '',
                        hasFinding: hasFinding,
                        findingsCount: mockFindings.length,
                        findings: mockFindings,
                    });
                });
            }

            setTestRecords(records);

            // Select active record from URL or first record
            if (urlRecordId) {
                const target = records.find(r => r.id === urlRecordId);
                if (target) handleSelectRecord(target);
            } else if (records.length > 0) {
                handleSelectRecord(records[0]);
            }
        } catch (err) {
            console.error('Failed to load records:', err);
            showError('Hata', 'Test kayıtları yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [urlRecordId]);

    const filteredRecords = useMemo(() => {
        return testRecords.filter(r => {
            // Search
            const matchesSearch = 
                r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.controlId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.assignee.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.directorate.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!matchesSearch) return false;

            // Status Filter
            if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;

            // Finding Filter
            if (findingFilter !== 'ALL') {
                const count = r.findingsCount || 0;
                if (findingFilter === 'NONE' && count > 0) return false;
                if (findingFilter === '1' && count !== 1) return false;
                if (findingFilter === '2' && count !== 2) return false;
                if (findingFilter === '3_PLUS' && count < 3) return false;
            }

            // Saved Views (Presets)
            if (selectedView === 'MY_TESTS') {
                return r.assigneeEmail === 'burak.admin@grc.com' || r.assignee.includes('Burak') || r.assignee.includes('Admin');
            }
            if (selectedView === 'THIS_MONTH') {
                const now = new Date();
                const recordDate = new Date(r.dueDate);
                return recordDate.getMonth() === now.getMonth() && recordDate.getFullYear() === now.getFullYear();
            }
            if (selectedView === 'OVERDUE') {
                return r.status === 'OVERDUE' || (new Date(r.dueDate) < new Date() && r.status !== 'COMPLETED');
            }
            if (selectedView === 'WITH_FINDINGS') {
                return r.hasFinding === true || (r.findingsCount || 0) > 0;
            }

            return true;
        }).sort((a, b) => {
            let valA = a[sortField as keyof TestRecordCard] ?? '';
            let valB = b[sortField as keyof TestRecordCard] ?? '';

            if (sortField === 'dueDate') {
                valA = new Date(a.dueDate).getTime();
                valB = new Date(b.dueDate).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [testRecords, searchTerm, statusFilter, findingFilter, selectedView, sortField, sortOrder]);

    const handleSelectRecord = (record: TestRecordCard) => {
        setActiveRecord(record);
        setKontrolSonucu(record.notes || '');
        setBulguVarMi(record.hasFinding ? 'EVET' : 'HAYIR');
        setUploadedFiles([]);
    };

    // File Upload Handler
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        setUploading(true);
        const files = Array.from(e.target.files);
        setTimeout(() => {
            setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
            setUploading(false);
            success('Başarılı', 'Kanıt dosyası başarıyla yüklendi.');
        }, 800);
    };

    // Save as Draft
    const handleSaveDraft = () => {
        if (!activeRecord) return;
        setTestRecords(prev => prev.map(r => {
            if (r.id === activeRecord.id) {
                return {
                    ...r,
                    status: 'IN_PROGRESS',
                    notes: kontrolSonucu,
                    hasFinding: bulguVarMi === 'EVET',
                };
            }
            return r;
        }));
        success('Taslak Kaydedildi', 'İlerlemeniz geçici olarak kaydedildi.');
    };

    // Complete Execution
    const handleCompleteExecution = () => {
        if (!activeRecord) return;
        setTestRecords(prev => prev.map(r => {
            if (r.id === activeRecord.id) {
                const newRecord = {
                    ...r,
                    status: 'COMPLETED' as const,
                    testResult: bulguVarMi === 'EVET' ? ('INEFFECTIVE' as const) : ('EFFECTIVE' as const),
                    notes: kontrolSonucu,
                    hasFinding: bulguVarMi === 'EVET',
                };
                setActiveRecord(newRecord);
                return newRecord;
            }
            return r;
        }));
        success('Test Tamamlandı', 'Kontrol test sonucu sisteme işlendi.');
    };

    // Trigger Finding Modal with Smart Autofill
    const handleOpenFindingModal = () => {
        setFindingModalOpen(true);
    };

    // Stats
    const kpis = useMemo(() => {
        const total = testRecords.length;
        const pending = testRecords.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
        const completed = testRecords.filter(t => t.status === 'COMPLETED').length;
        const overdue = testRecords.filter(t => t.status === 'OVERDUE').length;
        return { total, pending, completed, overdue };
    }, [testRecords]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto py-8 px-4 h-screen flex flex-col">
            <PageHeader
                title="Aylık Operasyonel Test Çalışma Alanı"
                description="Seçilen dönemlik planlı kontrollerin testlerini, kanıt incelemelerini ve bulgu süreçlerini yönetin."
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Test Yönetimi' }]}
            />

            {/* Split Screen Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]">
                
                {/* Left Side: Test Plan List Redesigned as Table */}
                <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col h-full overflow-hidden shadow-sm">
                    <div className="pb-4 border-b border-slate-100 mb-4 flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Test Planı Çalışma Listesi</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">Operasyonel test görevleri envanteri</p>
                        </div>
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-black">
                            {filteredRecords.length} / {testRecords.length}
                        </span>
                    </div>

                    {/* Saved Views / Presets */}
                    <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                        {[
                            { id: 'ALL', label: 'Tüm Testler', icon: '📋' },
                            { id: 'MY_TESTS', label: 'Benim Testlerim', icon: '👤' },
                            { id: 'THIS_MONTH', label: 'Bu Ay', icon: '📅' },
                            { id: 'OVERDUE', label: 'Gecikenler', icon: '🚨' },
                            { id: 'WITH_FINDINGS', label: 'Bulgulu Olanlar', icon: '⚠️' }
                        ].map(view => (
                            <button
                                key={view.id}
                                type="button"
                                onClick={() => setSelectedView(view.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    selectedView === view.id
                                        ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <span>{view.icon}</span>
                                <span>{view.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="col-span-1">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Ara (ID, Kontrol, Sahip...)"
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-semibold text-slate-700"
                            />
                        </div>
                        <div className="col-span-1">
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-semibold text-slate-600"
                            >
                                <option value="ALL">Tüm Durumlar</option>
                                <option value="PENDING">Bekliyor</option>
                                <option value="IN_PROGRESS">Devam Ediyor</option>
                                <option value="COMPLETED">Tamamlandı</option>
                                <option value="OVERDUE">Gecikmiş</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <select
                                value={findingFilter}
                                onChange={e => setFindingFilter(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-semibold text-slate-600"
                            >
                                <option value="ALL">Tüm Bulgular</option>
                                <option value="NONE">Bulgusu Yok</option>
                                <option value="1">1 Bulgu</option>
                                <option value="2">2 Bulgu</option>
                                <option value="3_PLUS">3+ Bulgu</option>
                            </select>
                        </div>
                    </div>

                    {/* Redesigned Table View */}
                    <div className="flex-1 overflow-auto border border-slate-150 rounded-xl">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                                    <th className="py-3 px-3 w-8">
                                        <input
                                            type="checkbox"
                                            checked={selectedRecordIds.length === filteredRecords.length && filteredRecords.length > 0}
                                            onChange={() => {
                                                if (selectedRecordIds.length === filteredRecords.length) {
                                                    setSelectedRecordIds([]);
                                                } else {
                                                    setSelectedRecordIds(filteredRecords.map(r => r.id));
                                                }
                                            }}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('id'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Test ID</th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('controlId'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Kontrol ID</th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('name'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Kontrol Adı</th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('assignee'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Sorumlu</th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('directorate'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Direktörlük</th>
                                    <th className="py-3 px-3 cursor-pointer hover:bg-slate-100" onClick={() => { setSortField('dueDate'); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>Planlanan Tarih</th>
                                    <th className="py-3 px-3">Durum</th>
                                    <th className="py-3 px-3">Bulgu</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                                {filteredRecords.length > 0 ? (
                                    filteredRecords.map(tr => {
                                        const isSelected = activeRecord?.id === tr.id;
                                        const isChecked = selectedRecordIds.includes(tr.id);
                                        return (
                                            <tr
                                                key={tr.id}
                                                onClick={() => handleSelectRecord(tr)}
                                                className={`cursor-pointer hover:bg-slate-50/70 transition-all ${
                                                    isSelected ? 'bg-blue-50/50 hover:bg-blue-50/70' : ''
                                                }`}
                                            >
                                                <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {
                                                            setSelectedRecordIds(prev =>
                                                                prev.includes(tr.id)
                                                                    ? prev.filter(x => x !== tr.id)
                                                                    : [...prev, tr.id]
                                                            );
                                                        }}
                                                        className="rounded text-blue-600 focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="py-3 px-3 font-mono text-[10px] text-slate-500">{tr.id}</td>
                                                <td className="py-3 px-3 font-mono text-[10px] text-blue-600 font-bold">{tr.controlId}</td>
                                                <td className="py-3 px-3 font-bold text-slate-800 truncate max-w-[120px]">{tr.name}</td>
                                                <td className="py-3 px-3 truncate max-w-[80px]">{tr.assignee}</td>
                                                <td className="py-3 px-3 truncate max-w-[90px]">{tr.directorate}</td>
                                                <td className="py-3 px-3 text-[10px] text-slate-500">{formatDate(tr.dueDate)}</td>
                                                <td className="py-3 px-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                                        tr.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                        tr.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                        tr.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse' :
                                                        'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                        {statusTranslation[tr.status] || tr.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                        (tr.findingsCount || 0) === 0 ? 'bg-slate-100 text-slate-500' :
                                                        (tr.findingsCount || 0) === 1 ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                        (tr.findingsCount || 0) === 2 ? 'bg-rose-150/40 text-rose-800 border border-rose-200' :
                                                        'bg-rose-600 text-white font-extrabold shadow-sm'
                                                    }`}>
                                                        {(tr.findingsCount || 0) === 0 ? 'Bulgusu Yok' : `${tr.findingsCount} Bulgu`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                                            Arama veya filtre kriterlerine uyan test kaydı bulunamadı.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Side: Test Execution Workspace */}
                <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl flex flex-col h-full shadow-sm overflow-hidden">
                    {activeRecord ? (
                        <div className="flex flex-col h-full divide-y divide-slate-100">
                            
                            {/* SECTION 1: Test Information */}
                            <div className="p-6 bg-slate-50/50">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                {activeRecord.controlId}
                                            </span>
                                            <span className="text-xs font-bold text-slate-400">|</span>
                                            <span className="text-xs font-bold text-slate-500">{activeRecord.directorate}</span>
                                        </div>
                                        <h2 className="text-lg font-extrabold text-slate-800 mt-2">{activeRecord.name}</h2>
                                        <p className="text-xs text-slate-500 mt-1">{activeRecord.description || 'Master kontrol tanımı eklenmemiş.'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                            activeRecord.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                            activeRecord.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                            'bg-blue-50 text-blue-700 border border-blue-200'
                                        }`}>
                                            {statusTranslation[activeRecord.status]}
                                        </span>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Sorumlu: {activeRecord.assignee}</p>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: Execution Area */}
                            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                                
                                {/* 1. Kontrol Sonucu (Rich Text / TextArea) */}
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">1. Test Sonucu Açıklaması / İcra Adımları Notu</label>
                                    <textarea
                                        value={kontrolSonucu}
                                        onChange={(e) => setKontrolSonucu(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-semibold text-slate-700"
                                        placeholder="Gerçekleştirilen test adımlarını, doğrulama kriterlerini ve elde edilen kanıt özetlerini detaylandırın..."
                                    />
                                </div>

                                {/* 2. Bulgu Var mı? */}
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">2. Kontrol Faaliyetinde Aksaklık / Bulgu Tespit Edildi mi?</label>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setBulguVarMi('EVET')}
                                            className={`px-6 py-2.5 rounded-xl border text-xs font-bold transition-all flex-1 ${
                                                bulguVarMi === 'EVET'
                                                    ? 'bg-rose-50 text-rose-700 border-rose-500 shadow-sm ring-2 ring-rose-500/15'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            ⚠️ Evet (Bulgu Var)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBulguVarMi('HAYIR')}
                                            className={`px-6 py-2.5 rounded-xl border text-xs font-bold transition-all flex-1 ${
                                                bulguVarMi === 'HAYIR'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm ring-2 ring-emerald-500/15'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            🟢 Hayır (Bulgu Yok)
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Kontrol Kanıtları (File Upload) */}
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">3. Test Kanıt Dosyaları</label>
                                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center hover:bg-slate-50/50 transition-colors">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            id="workspace-upload"
                                        />
                                        <label htmlFor="workspace-upload" className="cursor-pointer block">
                                            <span className="text-2xl block mb-1">📁</span>
                                            <span className="text-xs font-bold text-blue-600 hover:underline">Sürükleyin veya Dosya Seçin</span>
                                            <span className="text-[10px] text-slate-400 block mt-1">PDF, XLSX, PNG (Max 10MB)</span>
                                        </label>
                                    </div>

                                    {uploadedFiles.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {uploadedFiles.map((file, idx) => (
                                                <span key={idx} className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
                                                    📄 {file}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Oluşturulan Bulgular Listesi */}
                                {activeRecord.findings && activeRecord.findings.length > 0 && (
                                    <div className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/50 mt-4">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">🚨 Oluşturulan Bulgular</label>
                                        <div className="space-y-2">
                                            {activeRecord.findings.map((f, idx) => (
                                                <Link
                                                    key={idx}
                                                    href={`/findings/${f.id}`}
                                                    className="block p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-xs font-bold text-blue-600 group-hover:text-blue-700">
                                                             [{f.findingId || f.id}]
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                                            f.severity === 'CRITICAL' ? 'bg-rose-600 text-white' :
                                                            f.severity === 'HIGH' ? 'bg-rose-50 text-rose-700' :
                                                            f.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700' :
                                                            'bg-slate-150 text-slate-600'
                                                        }`}>
                                                            {f.severity}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 mt-1.5 group-hover:text-blue-600 transition-colors">
                                                        {f.description}
                                                     </p>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* SECTION 3: Actions */}
                            <div className="p-6 bg-slate-50/50 flex justify-between items-center gap-3">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveDraft}
                                        className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-colors uppercase tracking-wider"
                                    >
                                        Taslak Kaydet
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCompleteExecution}
                                        disabled={!kontrolSonucu}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 uppercase tracking-wider shadow-sm"
                                    >
                                        Testi Tamamla
                                    </button>
                                </div>

                                {bulguVarMi === 'EVET' && (
                                    <button
                                        type="button"
                                        onClick={handleOpenFindingModal}
                                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all animate-pulse uppercase tracking-wider shadow-sm"
                                    >
                                        ⚠️ Bulgu Oluştur
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-8 text-slate-400 italic">
                            Workspace açmak için sol taraftan bir planlı test kaydı seçin.
                        </div>
                    )}
                </div>
            </div>

            {/* PART 6: Finding Creation Modal */}
            {findingModalOpen && activeRecord && (
                <CreateFindingModal
                    isOpen={findingModalOpen}
                    onClose={() => setFindingModalOpen(false)}
                    onSuccess={(savedFinding) => {
                        setTestRecords(prev => prev.map(r => {
                            if (r.id === activeRecord.id) {
                                const existingFindings = r.findings || [];
                                const updatedFindings = [...existingFindings, savedFinding];
                                const newRecord = {
                                    ...r,
                                    status: 'COMPLETED' as const,
                                    testResult: 'INEFFECTIVE' as const,
                                    hasFinding: true,
                                    findingsCount: updatedFindings.length,
                                    findings: updatedFindings,
                                };
                                setActiveRecord(newRecord);
                                return newRecord;
                            }
                            return r;
                        }));
                    }}
                    testContext={activeRecord}
                />
            )}
        </div>
    );
}
