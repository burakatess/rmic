'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

interface Control {
    id: string;
    controlId: string;
    name: string;
    description: string;
    type: string;
    nature: string;
    automation: string;
    frequency: string;
    owner: { name: string; department: string; email: string };
    effectivenessStatus: string;
    lastTestDate: string;
    nextTestDate: string;
    controlPeriod?: string;
    linkedRisks: { id: string; riskId: string; name: string; score: number }[];
}

interface TestResult {
    id: string;
    testDate: string;
    tester: string;
    result: string;
    findings?: string;
}

const DEMO_CONTROL: Control = {
    id: '1',
    controlId: 'C-2024-0001',
    name: 'Güvenlik Duvarı Yönetimi',
    description: 'Kurumsal ağ güvenliğini sağlamak için güvenlik duvarı kurallarının yönetimi, izlenmesi ve düzenli olarak gözden geçirilmesi. Bu kontrol, yetkisiz erişim girişimlerini engellemek ve ağ trafiğini filtrelemek için kritik öneme sahiptir.',
    type: 'IT_GENERAL',
    nature: 'PREVENTIVE',
    automation: 'AUTOMATED',
    frequency: 'CONTINUOUS',
    owner: { name: 'Mehmet Demir', department: 'Bilgi Güvenliği', email: 'mehmet.demir@banka.com' },
    effectivenessStatus: 'EFFECTIVE',
    lastTestDate: '2024-12-15',
    nextTestDate: '2025-01-15',
    linkedRisks: [
        { id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski', score: 12 },
        { id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski', score: 15 },
    ],
};

const DEMO_TESTS: TestResult[] = [
    { id: '1', testDate: '2024-12-15', tester: 'Ahmet Yılmaz', result: 'EFFECTIVE' },
    { id: '2', testDate: '2024-09-10', tester: 'Ayşe Kaya', result: 'EFFECTIVE' },
    { id: '3', testDate: '2024-06-05', tester: 'Mehmet Demir', result: 'PARTIALLY_EFFECTIVE', findings: 'Bazı kurallar güncel değil' },
];

const typeLabels: Record<string, string> = {
    IT_GENERAL: 'BT',
    IT_APPLICATION: 'BT',
    OPERATIONAL: 'BT Dışı',
    FINANCIAL: 'BT Dışı',
    COMPLIANCE: 'BT Dışı',
    BT: 'BT',
    BT_DISI: 'BT Dışı'
};
const natureLabels: Record<string, string> = { PREVENTIVE: 'Önleyici', DETECTIVE: 'Tespit Edici', CORRECTIVE: 'Düzeltici' };
const automationLabels: Record<string, string> = { AUTOMATED: 'Otomatik', SEMI_AUTOMATED: 'Yarı Otomatik', MANUAL: 'Manuel' };
const frequencyLabels: Record<string, string> = { DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık', QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi' };
const periodLabels: Record<string, string> = {
    JAN_APR_JUL_OCT: 'Ocak - Nisan - Temmuz - Ekim',
    FEB_MAY_AUG_NOV: 'Şubat - Mayıs - Ağustos - Kasım',
    MAR_JUN_SEP_DEC: 'Mart - Haziran - Eylül - Aralık',
    JAN_JUL: 'Ocak - Temmuz',
    FEB_AUG: 'Şubat - Ağustos',
    MAR_SEP: 'Mart - Eylül',
    APR_OCT: 'Nisan - Ekim',
    MAY_NOV: 'Mayıs - Kasım',
    JUN_DEC: 'Haziran - Aralık',
    JANUARY: 'Ocak',
    FEBRUARY: 'Şubat',
    MARCH: 'Mart',
    APRIL: 'Nisan',
    MAY: 'Mayıs',
    JUNE: 'Haziran',
    JULY: 'Temmuz',
    AUGUST: 'Ağustos',
    SEPTEMBER: 'Eylül',
    OCTOBER: 'Ekim',
    NOVEMBER: 'Kasım',
    DECEMBER: 'Aralık',
};
const effectivenessConfig: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'bg-gray-100 text-gray-600' },
};

// Helper function to generate periods based on frequency
const generatePeriods = (frequency: string, year: number) => {
    const periods: { key: string; label: string; startDate: Date; endDate: Date }[] = [];

    switch (frequency) {
        case 'DAILY':
            // Return current month's days
            const daysInMonth = new Date(year, new Date().getMonth() + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(year, new Date().getMonth(), d);
                periods.push({
                    key: date.toISOString().split('T')[0],
                    label: `${d} ${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][new Date().getMonth()]}`,
                    startDate: date,
                    endDate: date
                });
            }
            break;
        case 'WEEKLY':
            for (let w = 1; w <= 52; w++) {
                periods.push({
                    key: `${year}-W${w.toString().padStart(2, '0')}`,
                    label: `Hafta ${w}`,
                    startDate: new Date(year, 0, 1 + (w - 1) * 7),
                    endDate: new Date(year, 0, 7 + (w - 1) * 7)
                });
            }
            break;
        case 'MONTHLY':
            const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            months.forEach((m, i) => {
                periods.push({
                    key: `${year}-${(i + 1).toString().padStart(2, '0')}`,
                    label: m,
                    startDate: new Date(year, i, 1),
                    endDate: new Date(year, i + 1, 0)
                });
            });
            break;
        case 'QUARTERLY':
            ['Q1 (Oca-Mar)', 'Q2 (Nis-Haz)', 'Q3 (Tem-Eyl)', 'Q4 (Eki-Ara)'].forEach((q, i) => {
                periods.push({
                    key: `${year}-Q${i + 1}`,
                    label: q,
                    startDate: new Date(year, i * 3, 1),
                    endDate: new Date(year, i * 3 + 3, 0)
                });
            });
            break;
        case 'SEMI_ANNUAL':
            ['1. Yarıyıl (Oca-Haz)', '2. Yarıyıl (Tem-Ara)'].forEach((h, i) => {
                periods.push({
                    key: `${year}-H${i + 1}`,
                    label: h,
                    startDate: new Date(year, i * 6, 1),
                    endDate: new Date(year, i * 6 + 6, 0)
                });
            });
            break;
        case 'ANNUAL':
        default:
            periods.push({
                key: `${year}`,
                label: `${year} Yılı`,
                startDate: new Date(year, 0, 1),
                endDate: new Date(year, 11, 31)
            });
            break;
    }
    return periods;
};

// TestHistoryTab Component
function TestHistoryTab({
    control,
    tests,
    effectivenessConfig
}: {
    control: Control;
    tests: TestResult[];
    effectivenessConfig: Record<string, { label: string; color: string }>
}) {
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({
        result: 'EFFECTIVE',
        hasFinding: false,
        notes: '',
        files: [] as File[]
    });

    const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    // Get days in selected month
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Find test for a specific day
    const getTestForDay = (day: number) => {
        return tests.find(t => {
            const testDate = new Date(t.testDate);
            return testDate.getFullYear() === selectedYear &&
                testDate.getMonth() === selectedMonth &&
                testDate.getDate() === day;
        });
    };

    // Get button color based on test status
    const getDayButtonClass = (day: number) => {
        const test = getTestForDay(day);
        const isSelected = selectedDay === day;

        if (isSelected) {
            return 'bg-purple-600 text-white border-purple-600';
        }

        if (test) {
            if (test.findings) {
                return 'bg-red-100 border-red-400 text-red-700'; // Has finding
            }
            return 'bg-green-100 border-green-400 text-green-700'; // No finding
        }

        return 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'; // Not tested
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFormData(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files!)] }));
        }
    };

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!selectedDay) return;
        setSaving(true);
        try {
            const testData = {
                testDate: new Date(selectedYear, selectedMonth, selectedDay),
                result: formData.result,
                hasFinding: formData.hasFinding,
                findings: formData.hasFinding ? formData.notes : null,
                notes: formData.notes,
                tester: 'Current User', // TODO: Get from auth context
                evidenceUrls: []
            };
            await api.createControlTest(control.id, testData);
            setShowAddForm(false);
            setFormData({ result: 'EFFECTIVE', hasFinding: false, notes: '', files: [] });
            window.location.reload(); // Refresh to show new test
        } catch (error) {
            console.error('Failed to save test:', error);
            alert('Test sonucu kaydedilemedi!');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitForApproval = async () => {
        if (!selectedDay) return;
        setSaving(true);
        try {
            const testData = {
                testDate: new Date(selectedYear, selectedMonth, selectedDay),
                result: formData.result,
                hasFinding: formData.hasFinding,
                findings: formData.hasFinding ? formData.notes : null,
                notes: formData.notes,
                tester: 'Current User',
                evidenceUrls: []
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newTest = await api.createControlTest(control.id, testData) as any;
            await api.submitTestForApproval(newTest.id);
            setShowAddForm(false);
            setFormData({ result: 'EFFECTIVE', hasFinding: false, notes: '', files: [] });
            alert('Test sonucu onaya gönderildi!');
            window.location.reload();
        } catch (error) {
            console.error('Failed to submit for approval:', error);
            alert('Onaya gönderilemedi!');
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = async (testId: string) => {
        try {
            await api.approveTest(testId);
            alert('Test sonucu onaylandı!');
            window.location.reload();
        } catch (error) {
            console.error('Failed to approve:', error);
            alert('Onaylama başarısız!');
        }
    };

    const handleReject = async (testId: string) => {
        const reason = prompt('Red sebebini giriniz:');
        if (!reason) return;
        try {
            await api.rejectTest(testId, reason);
            alert('Test sonucu reddedildi!');
            window.location.reload();
        } catch (error) {
            console.error('Failed to reject:', error);
            alert('Reddetme başarısız!');
        }
    };

    // Keep old handleSubmit for compatibility
    const handleSubmit = handleSave;

    const selectedTest = selectedDay ? getTestForDay(selectedDay) : null;
    const selectedDateStr = selectedDay
        ? `${selectedDay} ${monthNames[selectedMonth]} ${selectedYear}`
        : '';

    return (
        <div>
            {/* Year and Month Selector */}
            <div className="flex items-center gap-4 mb-4">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Yıl</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => { setSelectedYear(Number(e.target.value)); setSelectedDay(null); }}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Ay</label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => { setSelectedMonth(Number(e.target.value)); setSelectedDay(null); }}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                        {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-400 rounded"></span> Bulgusuz</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-400 rounded"></span> Bulgulu</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-gray-200 rounded"></span> Girilmemiş</span>
                </div>
            </div>

            {/* Day Selector */}
            <div className="mb-6">
                <label className="block text-xs text-gray-500 mb-2">
                    Dönem ({frequencyLabels[control.frequency] || control.frequency})
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {days.map(day => (
                        <button
                            key={day}
                            onClick={() => setSelectedDay(day)}
                            className={`w-10 h-8 text-xs rounded border transition-all font-medium ${getDayButtonClass(day)}`}
                        >
                            {day}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selected Day Test Result */}
            {selectedDay && (
                <div className="bg-gray-50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-gray-900">
                            {selectedDateStr} - Test Sonucu
                        </h4>
                        {!selectedTest && !showAddForm && (
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                            >
                                + Sonuç Ekle
                            </button>
                        )}
                    </div>

                    {selectedTest ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4 flex-wrap">
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${effectivenessConfig[selectedTest.result]?.color}`}>
                                    {effectivenessConfig[selectedTest.result]?.label}
                                </span>
                                <span className={`px-3 py-1 rounded-lg text-sm ${selectedTest.findings ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    Bulgu: {selectedTest.findings ? 'Var' : 'Yok'}
                                </span>
                                {/* Approval Status Badge */}
                                {(selectedTest as unknown as { approvalStatus?: string }).approvalStatus === 'PENDING_APPROVAL' && (
                                    <span className="px-3 py-1 rounded-lg text-sm bg-amber-100 text-amber-700 font-medium">
                                        ⏳ Onay Bekliyor
                                    </span>
                                )}
                                {(selectedTest as unknown as { approvalStatus?: string }).approvalStatus === 'APPROVED' && (
                                    <span className="px-3 py-1 rounded-lg text-sm bg-green-100 text-green-700 font-medium">
                                        ✓ Onaylandı
                                    </span>
                                )}
                                {(selectedTest as unknown as { approvalStatus?: string }).approvalStatus === 'REJECTED' && (
                                    <span className="px-3 py-1 rounded-lg text-sm bg-red-100 text-red-700 font-medium">
                                        ✗ Reddedildi
                                    </span>
                                )}
                                {(selectedTest as unknown as { approvalStatus?: string }).approvalStatus === 'DRAFT' && (
                                    <span className="px-3 py-1 rounded-lg text-sm bg-gray-100 text-gray-700 font-medium">
                                        📝 Taslak
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500">
                                Test Eden: {selectedTest.tester} |
                                Tarih: {new Date(selectedTest.testDate).toLocaleDateString('tr-TR')}
                            </p>
                            {selectedTest.findings && (
                                <p className="text-sm text-orange-600">{selectedTest.findings}</p>
                            )}

                            {/* Reviewer Approval Buttons - Show only if PENDING_APPROVAL */}
                            {(selectedTest as unknown as { approvalStatus?: string }).approvalStatus === 'PENDING_APPROVAL' && (
                                <div className="pt-4 border-t border-gray-200 mt-4">
                                    <p className="text-xs text-gray-500 mb-3">Kontrol Eden olarak görüntülüyorsunuz</p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleApprove(selectedTest.id)}
                                            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                                        >
                                            ✓ Onayla
                                        </button>
                                        <button
                                            onClick={() => handleReject(selectedTest.id)}
                                            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                                        >
                                            ✗ Reddet
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : showAddForm ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Test Sonucu</label>
                                    <select
                                        value={formData.result}
                                        onChange={(e) => setFormData(prev => ({ ...prev, result: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                    >
                                        <option value="EFFECTIVE">Etkin</option>
                                        <option value="PARTIALLY_EFFECTIVE">Kısmen Etkin</option>
                                        <option value="INEFFECTIVE">Etkin Değil</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bulgusu Var Mı?</label>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, hasFinding: true }))}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${formData.hasFinding ? 'bg-red-100 border-red-400 text-red-700' : 'bg-white border-gray-200'}`}
                                        >
                                            Evet
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, hasFinding: false }))}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${!formData.hasFinding ? 'bg-green-100 border-green-400 text-green-700' : 'bg-white border-gray-200'}`}
                                        >
                                            Hayır
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar / Özet</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                    rows={3}
                                    placeholder="Test notları..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dosya/Ek Yükle</label>
                                <input
                                    type="file"
                                    multiple
                                    onChange={handleFileChange}
                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                                />
                                {formData.files.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {formData.files.map((file, i) => (
                                            <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">{file.name}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleSubmitForApproval}
                                    disabled={saving}
                                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {saving ? 'Gönderiliyor...' : 'Onaya Gönder'}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                                <button
                                    onClick={() => setShowAddForm(false)}
                                    disabled={saving}
                                    className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                                >
                                    İptal
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">Bu tarihte henüz test sonucu girilmemiş.</p>
                    )}
                </div>
            )
            }
        </div >
    );
}

export default function ControlDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'summary' | 'risks' | 'tests' | 'history'>('summary');
    const [control, setControl] = useState<Control>(DEMO_CONTROL);
    const [tests] = useState<TestResult[]>(DEMO_TESTS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchControlData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getControl(params.id as string) as any;
                if (data) {
                    setControl({
                        id: String(data.id),
                        controlId: String(data.controlId || ''),
                        name: String(data.name || ''),
                        description: String(data.description || ''),
                        type: String(data.type || 'IT_GENERAL'),
                        nature: String(data.nature || 'PREVENTIVE'),
                        automation: String(data.automation || 'MANUAL'),
                        frequency: String(data.frequency || 'MONTHLY'),
                        controlPeriod: String(data.controlPeriod || ''),
                        owner: {
                            name: `${data.owner?.firstName || ''} ${data.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                            department: String(data.owner?.department || ''),
                            email: String(data.owner?.email || '')
                        },
                        effectivenessStatus: String(data.effectivenessStatus || 'NOT_TESTED'),
                        lastTestDate: data.lastTestDate || new Date().toISOString(),
                        nextTestDate: data.nextTestDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        // Check both 'risks' and 'riskMappings' for backward compatibility
                        linkedRisks: (data.risks || data.riskMappings || []).map((rm: { risk?: { id: string; riskId: string; name: string; residualRiskScore: number }; id?: string; riskId?: string; name?: string; residualRiskScore?: number }) => {
                            const risk = rm.risk || rm;
                            return {
                                id: String(risk?.id || ''),
                                riskId: String(risk?.riskId || ''),
                                name: String(risk?.name || ''),
                                score: Number(risk?.residualRiskScore || 0)
                            };
                        })
                    });
                }
            } catch (err) {
                console.error('Failed to fetch control:', err);
                // Keep demo data on error
            } finally {
                setLoading(false);
            }
        };
        if (params.id) {
            fetchControlData();
        }
    }, [params.id]);

    const tabs = [
        { id: 'summary', label: 'Özet', icon: '📋' },
        { id: 'risks', label: 'Bağlı Riskler', icon: '⚠️', count: control.linkedRisks.length },
        { id: 'tests', label: 'Test Geçmişi', icon: '🧪', count: tests.length },
        { id: 'history', label: 'Değişiklik Geçmişi', icon: '📜' },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/controls" className="hover:text-green-600">Kontrol Envanteri</Link>
                    <span>/</span>
                    <span className="text-gray-900">{control.controlId}</span>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-lg text-green-600 bg-green-50 px-3 py-1 rounded-lg">{control.controlId}</span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${effectivenessConfig[control.effectivenessStatus]?.color}`}>
                                    {effectivenessConfig[control.effectivenessStatus]?.label}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{control.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>{typeLabels[control.type]}</span>
                                <span>•</span>
                                <span>{natureLabels[control.nature]}</span>
                                <span>•</span>
                                <span>Sahip: {control.owner.name}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link href="/controls/testing" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                Test Et
                            </Link>
                            <Link href={`/controls/${params.id}/edit`} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
                                Düzenle
                            </Link>
                        </div>
                    </div>

                    {/* Control Properties */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Kontrol Tipi</p>
                            <p className="font-medium text-gray-900">{typeLabels[control.type]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Kontrol Niteliği</p>
                            <p className="font-medium text-gray-900">{natureLabels[control.nature]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Otomasyon</p>
                            <p className="font-medium text-gray-900">{automationLabels[control.automation]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Uygulama Sıklığı</p>
                            <p className="font-medium text-gray-900">{frequencyLabels[control.frequency]}</p>
                        </div>
                        {control.controlPeriod && (
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs text-gray-500 mb-1">Kontrol Periyodu</p>
                                <p className="font-medium text-blue-700">{periodLabels[control.controlPeriod] || control.controlPeriod}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex border-b border-gray-100">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`px-6 py-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-green-600 text-green-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {activeTab === 'summary' && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Kontrol Açıklaması</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{control.description}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Kontrol Sahibi</h3>
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="font-medium text-gray-900">{control.owner.name}</p>
                                        <p className="text-sm text-gray-500">{control.owner.department}</p>
                                        <p className="text-sm text-green-600">{control.owner.email}</p>
                                    </div>

                                    <h3 className="font-semibold text-gray-900 mt-6 mb-3">Test Takvimi</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Son Test:</span>
                                            <span className="text-gray-900">{new Date(control.lastTestDate).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Sonraki Test:</span>
                                            <span className="text-orange-600 font-medium">{new Date(control.nextTestDate).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'risks' && (
                            <div>
                                <p className="text-sm text-gray-500 mb-4">{control.linkedRisks.length} risk bu kontrolle ilişkilendirilmiş</p>
                                <div className="space-y-3">
                                    {control.linkedRisks.map(risk => (
                                        <Link key={risk.id} href={`/risks/${risk.id}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">⚠️</div>
                                                <div>
                                                    <p className="font-mono text-sm text-blue-600">{risk.riskId}</p>
                                                    <p className="font-medium text-gray-900">{risk.name}</p>
                                                </div>
                                            </div>
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${risk.score >= 15 ? 'bg-red-500' : risk.score >= 10 ? 'bg-yellow-500' : 'bg-green-500'}`}>
                                                {risk.score}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'tests' && (
                            <TestHistoryTab
                                control={control}
                                tests={tests}
                                effectivenessConfig={effectivenessConfig}
                            />
                        )}

                        {activeTab === 'history' && (
                            <div className="text-center py-12 text-gray-500">
                                <span className="text-4xl block mb-2">📜</span>
                                <p>Değişiklik geçmişi görüntülenecek</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
