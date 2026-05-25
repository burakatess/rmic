'use client';

import React, { useState, useRef } from 'react';
import { read, utils, writeFile } from 'xlsx';
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

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const bstr = e.target?.result;
                const workbook = read(bstr, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = utils.sheet_to_json<Record<string, string>>(worksheet, { raw: false, defval: '' });

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
            } catch (err) {
                alert('Dosya okunurken bir hata oluştu. Geçerli bir Excel dosyası yükleyin.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleDownloadTemplate = () => {
        const wb = utils.book_new();
        
        // Header row
        const wsData = [EXPECTED_COLUMNS];
        // Add 10 empty template rows
        for (let i = 0; i < 10; i++) {
            wsData.push(EXPECTED_COLUMNS.map(() => ''));
        }
        const ws = utils.aoa_to_sheet(wsData);
        
        // Column widths
        ws['!cols'] = [
            { wch: 22 }, // Summary
            { wch: 35 }, // Description
            { wch: 20 }, // Mehaz
            { wch: 35 }, // Test Adımları
            { wch: 12 }, // GMY
            { wch: 22 }, // Direktörlük
            { wch: 16 }, // Sıklık
            { wch: 30 }, // Aylar
            { wch: 18 }, // İletişim
            { wch: 18 }, // Assignee
            { wch: 25 }, // Not
            { wch: 18 }, // 2. Kontrolcü
            { wch: 16 }, // Due Date
        ];

        // Light-blue header styling
        const headerStyle = {
            fill: { fgColor: { rgb: 'D6EAF8' } },
            font: { bold: true, color: { rgb: '1B4F72' }, sz: 11 },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: 'A9CCE3' } },
                bottom: { style: 'thin', color: { rgb: 'A9CCE3' } },
                left: { style: 'thin', color: { rgb: 'A9CCE3' } },
                right: { style: 'thin', color: { rgb: 'A9CCE3' } },
            }
        };

        // Apply header styles
        EXPECTED_COLUMNS.forEach((_, colIdx) => {
            const cellRef = utils.encode_cell({ r: 0, c: colIdx });
            if (!ws[cellRef]) ws[cellRef] = { v: EXPECTED_COLUMNS[colIdx], t: 's' };
            ws[cellRef].s = headerStyle;
        });

        // Data validation lists — add a hidden "Listeler" sheet for dropdowns
        const listsWs = utils.aoa_to_sheet([
            ['Sıklık', 'GMY', 'Aylar'],
            ...Array.from({ length: Math.max(FREQUENCIES.length, GMY_LIST.length, MONTHS.length) }, (_, i) => [
                FREQUENCIES[i] || '',
                GMY_LIST[i] || '',
                MONTHS[i] || '',
            ])
        ]);
        listsWs['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }];

        utils.book_append_sheet(wb, ws, 'Kontroller');
        utils.book_append_sheet(wb, listsWs, 'Listeler');

        writeFile(wb, 'Kontrol_Sablona_Yukleme.xlsx');
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
                                        accept=".xlsx, .xls" 
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
