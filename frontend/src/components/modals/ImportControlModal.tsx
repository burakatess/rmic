'use client';

import React, { useState, useRef } from 'react';
import { addAoaSheet, downloadWorkbook, newWorkbook, readWorkbook, sheetToObjects } from '@/lib/xlsx-io';
import { Button, DataTable } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';

interface ImportControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: () => void;
}

interface ImportedControl {
    _rowId: number;
    summary: string;
    description: string;
    mehaz: string;
    testSteps: string;
    gmy: string;
    directorate: string;
    frequency: string;
    months: string;
    contactPerson: string;
    assignee: string;
    notes: string;
    secondController: string;
    dueDate: string;
    validationStatus: 'VALID' | 'INVALID';
    errorMessage?: string;
}

const FREQUENCIES = ['Günlük', 'Haftalık', 'Aylık', '3 Aylık', '6 Aylık', 'Yıllık', 'Arızi'];
const GMY_LIST = ['GM', 'GMY1', 'GMY2', 'GMY3', 'GMY4', 'GMY5', 'GMY6', 'GMY7'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const EXPECTED_COLUMNS = [
    'Summary (Kontrol No) *',
    'Description (Açıklama)',
    'Mehaz',
    'Test Adımları',
    'İlgili GMY',
    'İlgili Direktörlük *',
    'Periyodik Sıklık *',
    'Gerçekleştirilecek Aylar',
    'İletişim Kişisi',
    'Assignee',
    'Not',
    '2. Kontrolcü',
    'Due Date (YYYY-AA-GG)',
];

export default function ImportControlModal({ isOpen, onClose, onImportSuccess }: ImportControlModalProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
    const [data, setData] = useState<ImportedControl[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateNaming = (summary: string, frequency: string): string | null => {
        if (!summary) return 'Summary zorunludur.';
        if (frequency === 'Arızi') {
            // Format: AyAdı-Arızi-N
            const parts = summary.split('-');
            if (parts.length !== 3 || !MONTHS.includes(parts[0]) || parts[1] !== 'Arızi' || isNaN(Number(parts[2]))) {
                return 'Arızi formatı hatalı. Örn: Şubat-Arızi-1';
            }
        } else {
            // Format: YYYY.KBT-XX or YYYY.KİB-XX
            const regex = /^20\d{2}\.(KBT|KİB)-\d+$/;
            if (!regex.test(summary)) {
                return 'Periyodik formatı hatalı. Örn: 2026.KBT-01';
            }
        }
        return null;
    };

    const validateRow = (row: Record<string, string>, index: number): ImportedControl => {
        let isValid = true;
        let errorMessage = '';

        const summary = (row['Summary (Kontrol No) *'] || '').trim();
        const description = (row['Description (Açıklama)'] || '').trim();
        const mehaz = (row['Mehaz'] || '').trim();
        const testSteps = (row['Test Adımları'] || '').trim();
        const gmy = (row['İlgili GMY'] || '').trim();
        const directorate = (row['İlgili Direktörlük *'] || '').trim();
        const frequency = (row['Periyodik Sıklık *'] || '').trim();
        const months = (row['Gerçekleştirilecek Aylar'] || '').trim();
        const contactPerson = (row['İletişim Kişisi'] || '').trim();
        const assignee = (row['Assignee'] || '').trim();
        const notes = (row['Not'] || '').trim();
        const secondController = (row['2. Kontrolcü'] || '').trim();
        const dueDate = (row['Due Date (YYYY-AA-GG)'] || '').trim();

        if (!summary) { isValid = false; errorMessage += 'Summary zorunlu. '; }
        if (!directorate) { isValid = false; errorMessage += 'Direktörlük zorunlu. '; }
        if (!frequency || !FREQUENCIES.includes(frequency)) { isValid = false; errorMessage += 'Sıklık geçersiz. '; }
        
        if (gmy && !GMY_LIST.includes(gmy)) { isValid = false; errorMessage += 'GMY geçersiz. '; }

        if (['3 Aylık', '6 Aylık', 'Yıllık'].includes(frequency)) {
            if (!months) { isValid = false; errorMessage += 'Aylar zorunlu. '; }
            else {
                const monthArr = months.split(',').map(m => m.trim());
                if (monthArr.some(m => !MONTHS.includes(m))) {
                    isValid = false; errorMessage += 'Ay isimleri geçersiz. ';
                }
            }
        }

        const nameError = validateNaming(summary, frequency);
        if (nameError) { isValid = false; errorMessage += nameError; }

        if (dueDate && isNaN(Date.parse(dueDate))) {
            isValid = false; errorMessage += 'Due Date geçersiz. ';
        }

        return {
            _rowId: index,
            summary, description, mehaz, testSteps, gmy, directorate, frequency, months, contactPerson, assignee, notes, secondController, dueDate,
            validationStatus: isValid ? 'VALID' : 'INVALID',
            errorMessage: errorMessage.trim(),
        };
    };

    const handleFileUpload = async (file: File) => {
        try {
            const workbook = await readWorkbook(file);
            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('Sayfa yok');
            // Satır numarası Excel'deki gerçek satırdır (başlık 1, ilk veri 2) — hata mesajları buna göre.
            const json = sheetToObjects(worksheet) as Record<string, string>[];

            const parsed = json.map((row, idx) => validateRow(row, idx + 2));

            // Duplicate check
            const seen = new Set();
            parsed.forEach(p => {
                if (p.summary) {
                    if (seen.has(p.summary)) {
                        p.validationStatus = 'INVALID';
                        p.errorMessage = (p.errorMessage ? p.errorMessage + ' ' : '') + 'Mükerrer Kontrol No.';
                    } else {
                        seen.add(p.summary);
                    }
                }
            });

            setData(parsed);
            setStep('preview');
        } catch {
            alert('Dosya okunurken bir hata oluştu. Geçerli bir .xlsx dosyası yükleyin (eski .xls desteklenmez).');
        }
    };

    const handleDownloadTemplate = async () => {
        const wb = await newWorkbook();

        // Başlık + 10 boş şablon satırı; sütun genişlikleri: Summary, Description, Mehaz, Test Adımları, GMY,
        // Direktörlük, Sıklık, Aylar, İletişim, Assignee, Not, 2. Kontrolcü, Due Date.
        const wsData: unknown[][] = [EXPECTED_COLUMNS];
        for (let i = 0; i < 10; i++) wsData.push(EXPECTED_COLUMNS.map(() => ''));
        const ws = addAoaSheet(wb, 'Kontroller', wsData, { widths: [22, 35, 20, 35, 12, 22, 16, 30, 18, 18, 25, 18, 16] });

        // Açık mavi başlık biçimi
        const border = { style: 'thin' as const, color: { argb: 'FFA9CCE3' } };
        ws.getRow(1).eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };
            cell.font = { bold: true, color: { argb: 'FF1B4F72' }, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top: border, bottom: border, left: border, right: border };
        });

        // Açılır liste kaynakları için "Listeler" sayfası
        addAoaSheet(wb, 'Listeler', [
            ['Sıklık', 'GMY', 'Aylar'],
            ...Array.from({ length: Math.max(FREQUENCIES.length, GMY_LIST.length, MONTHS.length) }, (_, i) => [
                FREQUENCIES[i] || '',
                GMY_LIST[i] || '',
                MONTHS[i] || '',
            ]),
        ], { widths: [12, 12, 12] });

        await downloadWorkbook(wb, 'Kontrol_Sablona_Yukleme.xlsx');
    };

    const handleImport = async () => {
        const validData = data.filter(d => d.validationStatus === 'VALID');
        if (validData.length === 0) {
            alert('İçe aktarılacak geçerli kayıt bulunamadı.');
            return;
        }

        setStep('importing');
        // Simulate API call
        setTimeout(() => {
            onImportSuccess();
            onClose();
            setStep('upload');
            setData([]);
        }, 1500);
    };

    const columns: ColumnDef<ImportedControl>[] = [
        {
            key: 'validationStatus', header: 'Durum', defaultWidth: 100,
            render: (r) => (
                <span className={`px-2 py-1 text-xs rounded font-medium ${r.validationStatus === 'VALID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.validationStatus === 'VALID' ? 'Geçerli' : 'Hatalı'}
                </span>
            )
        },
        { key: 'summary', header: 'Kontrol No (Summary)', defaultWidth: 150, render: (r) => r.summary },
        { key: 'directorate', header: 'Direktörlük', defaultWidth: 150, render: (r) => r.directorate },
        { key: 'frequency', header: 'Sıklık', defaultWidth: 100, render: (r) => r.frequency },
        {
            key: 'errorMessage', header: 'Hata Mesajı', defaultWidth: 250,
            render: (r) => <span className="text-xs text-red-600">{r.errorMessage}</span>
        }
    ];

    if (!isOpen) return null;

    const validCount = data.filter(d => d.validationStatus === 'VALID').length;
    const invalidCount = data.length - validCount;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl transform transition-all flex flex-col max-h-[90vh]">
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Kontrol Envanteri Toplu Yükleme</h2>
                            <p className="text-sm text-slate-500 mt-1">Excel şablonunu kullanarak toplu kontrol içeri aktarabilirsiniz.</p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg p-2 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-5 flex-1 overflow-y-auto">
                        {step === 'upload' && (
                            <div className="space-y-6">
                                <div className="flex justify-end">
                                    <Button variant="outline" onClick={handleDownloadTemplate} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}>
                                        Boş Şablon İndir
                                    </Button>
                                </div>
                                <div 
                                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
                                    onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                                    onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault(); setDragActive(false);
                                        if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                                    }}
                                >
                                    <svg className="w-12 h-12 mx-auto text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <p className="text-slate-600 font-medium mb-2">Excel dosyanızı buraya sürükleyin</p>
                                    <p className="text-slate-400 text-sm mb-4">veya bilgisayarınızdan seçin (.xlsx, .xls)</p>
                                    <input 
                                        type="file" 
                                        accept=".xlsx" 
                                        className="hidden" 
                                        ref={fileInputRef} 
                                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} 
                                    />
                                    <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                                        Dosya Seç
                                    </Button>
                                </div>
                            </div>
                        )}

                        {step === 'preview' && (
                            <div className="space-y-4 h-full flex flex-col">
                                <div className="flex gap-4">
                                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex-1">
                                        <p className="text-xs text-blue-600 font-semibold uppercase">Toplam Satır</p>
                                        <p className="text-2xl font-bold text-blue-700">{data.length}</p>
                                    </div>
                                    <div className="bg-green-50 border border-green-100 rounded-lg p-4 flex-1">
                                        <p className="text-xs text-green-600 font-semibold uppercase">Geçerli</p>
                                        <p className="text-2xl font-bold text-green-700">{validCount}</p>
                                    </div>
                                    <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex-1">
                                        <p className="text-xs text-red-600 font-semibold uppercase">Hatalı</p>
                                        <p className="text-2xl font-bold text-red-700">{invalidCount}</p>
                                    </div>
                                </div>

                                {invalidCount > 0 && (
                                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                        <p>Hatalı satırlar içeri aktarılamaz. Lütfen Excel dosyanızı düzeltip tekrar yükleyin veya sadece geçerli satırları içeri aktarın.</p>
                                    </div>
                                )}

                                <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 h-[400px]">
                                    <DataTable
                                        columns={columns}
                                        data={data}
                                        rowKey={(r) => String(r._rowId)}
                                        pageSize={100}
                                        page={1}
                                        totalCount={data.length}
                                        storageKey="import-preview-table"
                                        onPageChange={() => {}}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 'importing' && (
                            <div className="flex flex-col items-center justify-center py-20">
                                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                                <h3 className="text-lg font-medium text-slate-900">İçeri Aktarılıyor...</h3>
                                <p className="text-slate-500 mt-2">Bu işlem birkaç saniye sürebilir.</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                        <Button variant="outline" onClick={step === 'preview' ? () => { setStep('upload'); setData([]); } : onClose} disabled={step === 'importing'}>
                            {step === 'preview' ? 'Geri' : 'İptal'}
                        </Button>
                        {step === 'preview' && (
                            <Button variant="primary" onClick={handleImport} disabled={validCount === 0}>
                                {validCount} Kaydı İçeri Aktar
                            </Button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
