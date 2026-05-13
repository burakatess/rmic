'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types matching backend schema
interface RiskEntry {
    id: string;
    riskId: string;
    kayitId: string;
    kayitTipi: 'RISK' | 'OPPORTUNITY' | 'ISSUE';
    riskStatus: 'AKTIF' | 'PASIF' | 'KAPATILDI' | 'BEKLEMEDE' | 'ONAYLI' | 'TASLAK';
    riskSahibi?: string;
    surec?: string;
    altSurec?: string;
    riskTanimi: string;
    flagForIT: boolean;
    finansalEtki?: number;
    itibarEtkisi?: number;
    regulasyonEtkisi?: number;
    musteriEtkisi?: number;
    gizlilikEtkisi?: number;
    butunlukEtkisi?: number;
    erisebilirlikEtkisi?: number;
    etki?: number;
    olasilik?: number;
    dogalRiskPuani?: number;
    dogalRiskSkoru?: number;
    dogalRiskSeviyesi?: 'KRITIK' | 'YUKSEK' | 'ORTA' | 'DUSUK';
    butunlesikKontrolPuani?: number;
    butunlesikKontrolSkoru?: number;
    butunlesikKontrolSeviyesi?: 'ETKIN' | 'KISMEN_ETKIN' | 'ETKIN_DEGIL';
    kalintiRiskPuani?: number;
    kalintiRiskSkoru?: number;
    kalintiRiskSeviyesi?: 'KRITIK' | 'YUKSEK' | 'ORTA' | 'DUSUK';
    riskIsleme?: 'KABUL_ET' | 'AZALT' | 'TRANSFER_ET' | 'KACIN';
    mutabakatTarihi?: string;
    olusturmaTarihi: string;
    guncellemeTarihi: string;
    riskSorumlusu?: string;
    atanan?: string;
    olusturan?: string;
    kaydiAcan?: string;
    syncedRiskId?: string;
}

// Column group definitions
const COLUMN_GROUPS = [
    { id: 'kimlik', label: 'Kimlik', color: 'bg-blue-50', columns: ['riskId', 'kayitId', 'kayitTipi', 'riskStatus'] },
    { id: 'org', label: 'Organizasyon', color: 'bg-green-50', columns: ['riskSahibi', 'surec', 'altSurec', 'riskTanimi'] },
    { id: 'it', label: 'IT', color: 'bg-yellow-50', columns: ['flagForIT'] },
    { id: 'etki', label: 'Etki Boyutları', color: 'bg-pink-50', columns: ['finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi', 'gizlilikEtkisi', 'butunlukEtkisi', 'erisebilirlikEtkisi'] },
    { id: 'dogal', label: 'Doğal Risk', color: 'bg-amber-50', columns: ['etki', 'olasilik', 'dogalRiskPuani', 'dogalRiskSkoru', 'dogalRiskSeviyesi'] },
    { id: 'kontrol', label: 'Kontrol', color: 'bg-indigo-50', columns: ['butunlesikKontrolPuani', 'butunlesikKontrolSkoru', 'butunlesikKontrolSeviyesi'] },
    { id: 'kalinti', label: 'Kalıntı Risk', color: 'bg-red-50', columns: ['kalintiRiskPuani', 'kalintiRiskSkoru', 'kalintiRiskSeviyesi'] },
    { id: 'isleme', label: 'İşleme & Tarih', color: 'bg-violet-50', columns: ['riskIsleme', 'mutabakatTarihi', 'olusturmaTarihi', 'guncellemeTarihi'] },
    { id: 'sorumluluk', label: 'Sorumluluk', color: 'bg-emerald-50', columns: ['riskSorumlusu', 'atanan', 'olusturan', 'kaydiAcan'] },
];

const RISK_DEPARTMENTS = [
    'Bilgi Güvenliği Direktörlüğü',
    'Bilgi Yönetimi Uygulama Geliştirme Direktörlüğü',
    'Borçlanma Araçları Piyasası Direktörlüğü',
    'Çevresel Sistemler Geliştirme Direktörlüğü',
    'Destek Hizmetleri Direktörlüğü',
    'Endeks Direktörlüğü',
    'Güvenlik ve İdari İşler Direktörlüğü',
    'Hukuk Müşavirliği ve Uyum Direktörlüğü',
    'İşlem Sistemleri Geliştirme Direktörlüğü',
    'Kıymetli Madenler ve Kıymetli Taşlar Piyasası Direktörlüğü',
    'Kotasyon Direktörlüğü',
    'Kurumsal Çözümler Direktörlüğü',
    'Pay Piyasası Direktörlüğü',
    'Proje Yönetimi ve Planlama Direktörlüğü',
    'Sistem Operasyon Direktörlüğü',
    'Sistem Yönetimi Direktörlüğü',
    'Türev Piyasalar Direktörlüğü',
    'Uluslararası İlişkiler Direktörlüğü',
    'Veri Teknoloji ve Üye Hizmetleri Direktörlüğü',
];

// Column definitions
const COLUMNS: { key: keyof RiskEntry; label: string; width: number; type: 'text' | 'number' | 'enum' | 'boolean' | 'date' | 'calculated'; editable: boolean; options?: string[] }[] = [
    { key: 'riskId', label: 'Risk ID', width: 120, type: 'text', editable: false },
    { key: 'kayitId', label: 'Kayıt ID', width: 120, type: 'text', editable: true },
    { key: 'kayitTipi', label: 'Kayıt Tipi', width: 100, type: 'enum', editable: true, options: ['RISK', 'OPPORTUNITY', 'ISSUE'] },
    { key: 'riskStatus', label: 'Risk Statü', width: 100, type: 'enum', editable: true, options: ['ONAYLI', 'TASLAK'] },
    { key: 'riskSahibi', label: 'Risk Sahibi', width: 250, type: 'enum', editable: true, options: RISK_DEPARTMENTS },
    { key: 'surec', label: 'Süreç', width: 150, type: 'text', editable: true },
    { key: 'altSurec', label: 'Alt Süreç', width: 150, type: 'text', editable: true },
    { key: 'riskTanimi', label: 'Risk Tanımı', width: 250, type: 'text', editable: true },
    { key: 'flagForIT', label: 'Flag For IT', width: 80, type: 'boolean', editable: true },
    { key: 'finansalEtki', label: 'Finansal Etki (%30)', width: 100, type: 'number', editable: true },
    { key: 'itibarEtkisi', label: 'İtibar Etkisi (%30)', width: 100, type: 'number', editable: true },
    { key: 'regulasyonEtkisi', label: 'Regülasyon Etkisi (%20)', width: 110, type: 'number', editable: true },
    { key: 'musteriEtkisi', label: 'Müşteri Etkisi (%20)', width: 100, type: 'number', editable: true },
    { key: 'gizlilikEtkisi', label: 'Gizlilik Etkisi (%35)', width: 100, type: 'number', editable: true },
    { key: 'butunlukEtkisi', label: 'Bütünlük Etkisi (%30)', width: 100, type: 'number', editable: true },
    { key: 'erisebilirlikEtkisi', label: 'Erişilebilirlik Etkisi (%35)', width: 120, type: 'number', editable: true },
    { key: 'etki', label: 'Etki', width: 70, type: 'calculated', editable: false },
    { key: 'olasilik', label: 'Olasılık', width: 80, type: 'number', editable: true },
    { key: 'dogalRiskPuani', label: 'Doğal Risk Puanı', width: 100, type: 'calculated', editable: false },
    { key: 'dogalRiskSkoru', label: 'Doğal Risk Skoru', width: 100, type: 'calculated', editable: false },
    { key: 'dogalRiskSeviyesi', label: 'Doğal Risk Seviyesi', width: 110, type: 'calculated', editable: false },
    { key: 'butunlesikKontrolPuani', label: 'Bütünleşik Kontrol Puanı', width: 130, type: 'number', editable: true },
    { key: 'butunlesikKontrolSkoru', label: 'Bütünleşik Kontrol Skoru', width: 130, type: 'calculated', editable: false },
    { key: 'butunlesikKontrolSeviyesi', label: 'Bütünleşik Kontrol Seviyesi', width: 140, type: 'calculated', editable: false },
    { key: 'kalintiRiskPuani', label: 'Kalıntı Risk Puanı', width: 110, type: 'calculated', editable: false },
    { key: 'kalintiRiskSkoru', label: 'Kalıntı Risk Skoru', width: 110, type: 'calculated', editable: false },
    { key: 'kalintiRiskSeviyesi', label: 'Kalıntı Risk Seviyesi', width: 120, type: 'calculated', editable: false },
    { key: 'riskIsleme', label: 'Risk İşleme', width: 110, type: 'enum', editable: true, options: ['KABUL_ET', 'AZALT', 'TRANSFER_ET', 'KACIN'] },
    { key: 'mutabakatTarihi', label: 'Mutabakat Tarihi', width: 120, type: 'date', editable: true },
    { key: 'olusturmaTarihi', label: 'Oluşturma Tarihi', width: 120, type: 'date', editable: false },
    { key: 'guncellemeTarihi', label: 'Güncelleme Tarihi', width: 120, type: 'date', editable: false },
    { key: 'riskSorumlusu', label: 'Risk Sorumlusu', width: 130, type: 'text', editable: true },
    { key: 'atanan', label: 'Atanan', width: 120, type: 'text', editable: true },
    { key: 'olusturan', label: 'Oluşturan', width: 120, type: 'text', editable: false },
    { key: 'kaydiAcan', label: 'Kaydı Açan', width: 120, type: 'text', editable: false },
];

const LEVEL_COLORS: Record<string, string> = {
    KRITIK: 'bg-red-100 text-red-800',
    YUKSEK: 'bg-orange-100 text-orange-800',
    ORTA: 'bg-yellow-100 text-yellow-800',
    DUSUK: 'bg-green-100 text-green-800',
    ETKIN: 'bg-green-100 text-green-800',
    KISMEN_ETKIN: 'bg-yellow-100 text-yellow-800',
    ETKIN_DEGIL: 'bg-red-100 text-red-800',
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
};

export default function RiskEntryPage() {
    const [entries, setEntries] = useState<RiskEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getRiskEntries() as { data: RiskEntry[]; total: number };
            setEntries(response.data || []);
        } catch (error) {
            console.error('Failed to fetch entries:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCellChange = async (id: string, key: keyof RiskEntry, value: unknown) => {
        // Optimistic update
        setEntries(prev => prev.map(e => e.id === id ? { ...e, [key]: value } : e));
        setEditingCell(null);

        try {
            const entry = entries.find(e => e.id === id);
            if (entry) {
                await api.updateRiskEntry(id, { ...entry, [key]: value });
                // Refetch to get recalculated values
                fetchData();
            }
        } catch (error) {
            console.error('Failed to update cell:', error);
            fetchData(); // Revert on error
        }
    };

    const handleAddRow = async () => {
        try {
            await api.createRiskEntry({
                riskTanimi: 'Yeni Risk Girişi',
                kayitTipi: 'RISK',
                riskStatus: 'AKTIF',
            });
            fetchData();
        } catch (error) {
            console.error('Failed to create entry:', error);
        }
    };

    const handleDeleteSelected = async () => {
        if (!confirm(`${selectedIds.length} kayıt silinecek. Devam etmek istiyor musunuz?`)) return;

        for (const id of selectedIds) {
            try {
                await api.deleteRiskEntry(id);
            } catch (error) {
                console.error('Failed to delete:', error);
            }
        }
        setSelectedIds([]);
        fetchData();
    };

    const handleSyncToInventory = async () => {
        if (selectedIds.length === 0) {
            alert('Lütfen envantere göndermek için kayıt seçin.');
            return;
        }

        try {
            const result = await api.syncRiskEntriesToInventory(selectedIds) as { id: string; status: string }[];
            const synced = result.filter(r => r.status === 'synced').length;
            const alreadySynced = result.filter(r => r.status === 'already_synced').length;
            alert(`${synced} kayıt envantere gönderildi. ${alreadySynced} kayıt zaten mevcut.`);
            setSelectedIds([]);
            fetchData();
        } catch (error) {
            console.error('Failed to sync:', error);
            alert('Senkronizasyon sırasında hata oluştu.');
        }
    };

    const handleExcelImport = () => {
        // Simple file input trigger - will implement full import later
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                alert(`Excel dosyası seçildi: ${file.name}\n\nTam Excel içe aktarma özelliği yakında...`);
            }
        };
        input.click();
    };

    // Download template function - creates CSV with all editable columns
    const handleDownloadTemplate = () => {
        // Get only editable columns for the template
        const editableColumns = COLUMNS.filter(col => col.editable);

        // Create CSV header row
        const headers = editableColumns.map(col => col.label);

        // Create example data row with placeholders
        const exampleRow = editableColumns.map(col => {
            switch (col.key) {
                case 'kayitId': return 'R-001';
                case 'kayitTipi': return 'RISK';
                case 'riskStatus': return 'AKTIF';
                case 'riskSahibi': return 'İsim Soyisim';
                case 'surec': return 'Süreç Adı';
                case 'altSurec': return 'Alt Süreç Adı';
                case 'riskTanimi': return 'Risk tanımını buraya yazın';
                case 'flagForIT': return 'HAYIR';
                case 'finansalEtki': return '1-5';
                case 'itibarEtkisi': return '1-5';
                case 'regulasyonEtkisi': return '1-5';
                case 'musteriEtkisi': return '1-5';
                case 'gizlilikEtkisi': return '1-5';
                case 'butunlukEtkisi': return '1-5';
                case 'erisebilirlikEtkisi': return '1-5';
                case 'olasilik': return '1-5';
                case 'butunlesikKontrolPuani': return '1-5';
                case 'riskIsleme': return 'KABUL_ET/AZALT/TRANSFER_ET/KACIN';
                case 'mutabakatTarihi': return 'YYYY-MM-DD';
                case 'riskSorumlusu': return 'İsim Soyisim';
                case 'atanan': return 'İsim Soyisim';
                default: return '';
            }
        });

        // Create instructions row
        const instructionRow = editableColumns.map(col => {
            if (col.type === 'enum' && col.options) {
                return `Değerler: ${col.options.join(', ')}`;
            }
            if (col.type === 'number') {
                return '1-5 arası değer';
            }
            if (col.type === 'boolean') {
                return 'EVET veya HAYIR';
            }
            if (col.type === 'date') {
                return 'YYYY-MM-DD formatında';
            }
            return 'Metin';
        });

        // Create CSV content
        const csvRows = [
            headers.join(';'),
            instructionRow.join(';'),
            exampleRow.join(';'),
            '', // Empty row for user to start adding data
        ];

        const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Excel UTF-8

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `risk_giris_sablonu_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === entries.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(entries.map(e => e.id));
        }
    };

    // KPIs
    const totalEntries = entries.length;
    const kritikCount = entries.filter(e => e.dogalRiskSeviyesi === 'KRITIK').length;
    const yuksekCount = entries.filter(e => e.dogalRiskSeviyesi === 'YUKSEK').length;
    const syncedCount = entries.filter(e => e.syncedRiskId).length;

    const renderCellValue = (entry: RiskEntry, col: typeof COLUMNS[0]) => {
        const value = entry[col.key];

        if (col.type === 'boolean') {
            return value ? '✓' : '-';
        }

        if (col.type === 'date') {
            return formatDate(value as string);
        }

        if (col.type === 'calculated' || col.type === 'enum') {
            if (typeof value === 'string' && LEVEL_COLORS[value]) {
                return (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[value]}`}>
                        {value}
                    </span>
                );
            }
            return value ?? '-';
        }

        if (col.type === 'number') {
            return value ?? '-';
        }

        return value ?? '-';
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <Link href="/risks" className="hover:text-gray-700">Risk Yönetimi</Link>
                            <span>/</span>
                            <span className="text-gray-900">Risk Girişi ve Hesaplama</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Risk Girişi ve Hesaplama</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Şablon İndir
                        </button>
                        <button
                            onClick={handleExcelImport}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Excel İçe Aktar
                        </button>
                        <button
                            onClick={handleAddRow}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Yeni Satır
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="flex items-center gap-6 py-2 px-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Toplam Kayıt:</span>
                        <span className="text-sm font-semibold text-gray-900">{totalEntries}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Kritik:</span>
                        <span className="text-sm font-semibold text-red-600">{kritikCount}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Yüksek:</span>
                        <span className="text-sm font-semibold text-orange-600">{yuksekCount}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Envanterde:</span>
                        <span className="text-sm font-semibold text-green-600">{syncedCount}</span>
                    </div>
                </div>

                {/* Column Group Tabs */}
                <div className="flex items-center gap-1 mt-4 overflow-x-auto">
                    <button
                        onClick={() => setActiveGroup(null)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${activeGroup === null ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Tümü
                    </button>
                    {COLUMN_GROUPS.map(group => (
                        <button
                            key={group.id}
                            onClick={() => setActiveGroup(group.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${activeGroup === group.id ? 'bg-gray-800 text-white' : `${group.color} text-gray-700 hover:opacity-80`
                                }`}
                        >
                            {group.label}
                        </button>
                    ))}
                </div>

                {/* Bulk Actions */}
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-3 mt-4 p-3 bg-blue-50 rounded-lg">
                        <span className="text-sm font-medium text-blue-800">{selectedIds.length} kayıt seçili</span>
                        <button
                            onClick={handleSyncToInventory}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                        >
                            Envantere Gönder
                        </button>
                        <button
                            onClick={handleDeleteSelected}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                        >
                            Sil
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-gray-50">
                <table className="w-max min-w-full border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-800 text-white">
                            <th className="sticky left-0 z-20 bg-gray-800 px-3 py-2 text-left w-10">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.length === entries.length && entries.length > 0}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded"
                                />
                            </th>
                            {COLUMNS.filter(col => {
                                if (!activeGroup) return true;
                                const group = COLUMN_GROUPS.find(g => g.id === activeGroup);
                                return group?.columns.includes(col.key);
                            }).map(col => (
                                <th
                                    key={col.key}
                                    className={`px-3 py-2 text-left text-xs font-semibold whitespace-nowrap ${col.editable ? '' : 'bg-gray-700'
                                        }`}
                                    style={{ minWidth: col.width }}
                                >
                                    {col.label}
                                    {!col.editable && <span className="ml-1 text-gray-400 text-[10px]">(Otomatik)</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, rowIndex) => (
                            <tr
                                key={entry.id}
                                className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 border-b border-gray-200`}
                            >
                                <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(entry.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds([...selectedIds, entry.id]);
                                            } else {
                                                setSelectedIds(selectedIds.filter(id => id !== entry.id));
                                            }
                                        }}
                                        className="w-4 h-4 rounded"
                                    />
                                </td>
                                {COLUMNS.filter(col => {
                                    if (!activeGroup) return true;
                                    const group = COLUMN_GROUPS.find(g => g.id === activeGroup);
                                    return group?.columns.includes(col.key);
                                }).map(col => (
                                    <td
                                        key={col.key}
                                        className={`px-3 py-2 text-sm ${col.editable ? 'cursor-text' : 'bg-gray-100/50 text-gray-600 italic'
                                            } ${col.type === 'number' ? 'text-right font-mono' : ''}`}
                                        style={{ minWidth: col.width }}
                                        onClick={() => col.editable && setEditingCell({ id: entry.id, key: col.key })}
                                    >
                                        {editingCell?.id === entry.id && editingCell?.key === col.key ? (
                                            col.type === 'enum' && col.options ? (
                                                <select
                                                    autoFocus
                                                    value={String(entry[col.key] || '')}
                                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                                    onBlur={() => setEditingCell(null)}
                                                    className="w-full px-1 py-0.5 border rounded text-sm"
                                                >
                                                    <option value="">Seçiniz</option>
                                                    {col.options.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : col.type === 'boolean' ? (
                                                <input
                                                    type="checkbox"
                                                    autoFocus
                                                    checked={Boolean(entry[col.key])}
                                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.checked)}
                                                    onBlur={() => setEditingCell(null)}
                                                    className="w-4 h-4"
                                                />
                                            ) : col.type === 'number' ? (
                                                <input
                                                    type="number"
                                                    autoFocus
                                                    min={1}
                                                    max={5}
                                                    value={entry[col.key] as number || ''}
                                                    onChange={(e) => handleCellChange(entry.id, col.key, parseInt(e.target.value) || null)}
                                                    onBlur={() => setEditingCell(null)}
                                                    className="w-full px-1 py-0.5 border rounded text-sm text-right"
                                                />
                                            ) : col.type === 'date' ? (
                                                <input
                                                    type="date"
                                                    autoFocus
                                                    value={entry[col.key] ? (entry[col.key] as string).split('T')[0] : ''}
                                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                                    onBlur={() => setEditingCell(null)}
                                                    className="w-full px-1 py-0.5 border rounded text-sm"
                                                />
                                            ) : (
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={String(entry[col.key] || '')}
                                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                                    onBlur={() => setEditingCell(null)}
                                                    onKeyDown={(e) => e.key === 'Enter' && setEditingCell(null)}
                                                    className="w-full px-1 py-0.5 border rounded text-sm"
                                                />
                                            )
                                        ) : (
                                            renderCellValue(entry, col)
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {entries.length === 0 && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="text-center py-12 text-gray-500">
                                    Henüz risk girişi bulunmuyor. "Yeni Satır" veya "Excel İçe Aktar" ile başlayın.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">{entries.length} kayıt gösteriliyor</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Hücrelere tıklayarak düzenleyebilirsiniz</span>
                </div>
            </div>
        </div>
    );
}
