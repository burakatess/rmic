'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ControlTest {
    id: string;
    control: { controlId: string; name: string };
    testDate: string;
    tester: string;
    result: string;
    findings?: string;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    effectivenessStatus: string;
    lastTestDate?: string;
    frequency: string;
}

const DEMO_TESTS: ControlTest[] = [
    { id: '1', control: { controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi' }, testDate: '2024-12-15', tester: 'Ahmet Yılmaz', result: 'EFFECTIVE', findings: undefined },
    { id: '2', control: { controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme' }, testDate: '2024-12-10', tester: 'Ayşe Kaya', result: 'EFFECTIVE', findings: undefined },
    { id: '3', control: { controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama' }, testDate: '2024-12-05', tester: 'Mehmet Demir', result: 'PARTIALLY_EFFECTIVE', findings: 'Restore işleminde gecikme tespit edildi' },
];

const PENDING_CONTROLS: Control[] = [
    { id: '5', controlId: 'C-2024-0005', name: 'Regülasyon İzleme', effectivenessStatus: 'NOT_TESTED', frequency: 'MONTHLY' },
    { id: '6', controlId: 'C-2024-0006', name: 'İşlem Log Analizi', effectivenessStatus: 'NOT_TESTED', frequency: 'WEEKLY' },
];

const resultLabels: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
};

export default function ControlTestingPage() {
    const [tests, setTests] = useState<ControlTest[]>([]);
    const [pendingControls, setPendingControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTestModal, setShowTestModal] = useState(false);
    const [selectedControl, setSelectedControl] = useState<Control | null>(null);
    const [testResult, setTestResult] = useState('');
    const [testFindings, setTestFindings] = useState('');

    useEffect(() => {
        setTimeout(() => {
            setTests(DEMO_TESTS);
            setPendingControls(PENDING_CONTROLS);
            setLoading(false);
        }, 500);
    }, []);

    const handleSubmitTest = () => {
        if (!selectedControl || !testResult) return;

        const newTest: ControlTest = {
            id: Date.now().toString(),
            control: { controlId: selectedControl.controlId, name: selectedControl.name },
            testDate: new Date().toISOString().split('T')[0],
            tester: 'Mevcut Kullanıcı',
            result: testResult,
            findings: testFindings || undefined,
        };

        setTests([newTest, ...tests]);
        setPendingControls(pendingControls.filter(c => c.id !== selectedControl.id));
        setShowTestModal(false);
        setSelectedControl(null);
        setTestResult('');
        setTestFindings('');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kontrol Testi</h1>
                    <p className="text-gray-500 mt-1">Kontrol etkinlik testlerini yönetin</p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Test</p>
                    <p className="text-2xl font-bold text-gray-900">{tests.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-sm text-green-600">Etkin</p>
                    <p className="text-2xl font-bold text-green-600">{tests.filter(t => t.result === 'EFFECTIVE').length}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-100">
                    <p className="text-sm text-yellow-600">Kısmen Etkin</p>
                    <p className="text-2xl font-bold text-yellow-600">{tests.filter(t => t.result === 'PARTIALLY_EFFECTIVE').length}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
                    <p className="text-sm text-red-600">Test Bekleyen</p>
                    <p className="text-2xl font-bold text-red-600">{pendingControls.length}</p>
                </div>
            </div>

            {/* Pending Tests Alert */}
            {pendingControls.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <h3 className="font-semibold text-orange-800 mb-2">Test Edilmesi Gereken Kontroller</h3>
                    <div className="flex flex-wrap gap-2">
                        {pendingControls.map((control) => (
                            <button
                                key={control.id}
                                onClick={() => {
                                    setSelectedControl(control);
                                    setShowTestModal(true);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-sm text-orange-700 hover:bg-orange-100 transition-all"
                            >
                                <span className="font-mono">{control.controlId}</span>
                                <span>→ Test Et</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Test History */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900">Test Geçmişi</h3>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Kontrol</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Test Tarihi</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Test Eden</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Sonuç</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Bulgular</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {tests.map((test) => (
                                <tr key={test.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-sm text-green-600">{test.control.controlId}</span>
                                        <p className="text-sm text-gray-900">{test.control.name}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(test.testDate).toLocaleDateString('tr-TR')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{test.tester}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${resultLabels[test.result]?.color}`}>
                                            {resultLabels[test.result]?.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {test.findings ? (
                                            <Link href="/findings/new" className="text-sm text-purple-600 hover:underline">
                                                {test.findings.substring(0, 40)}...
                                            </Link>
                                        ) : (
                                            <span className="text-sm text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Test Modal */}
            {showTestModal && selectedControl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-1">Kontrol Testi</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            <span className="font-mono text-green-600">{selectedControl.controlId}</span> - {selectedControl.name}
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-3">Test Sonucu</label>
                            <div className="grid grid-cols-3 gap-3">
                                {Object.entries(resultLabels).map(([key, { label, color }]) => (
                                    <button
                                        key={key}
                                        onClick={() => setTestResult(key)}
                                        className={`py-3 rounded-xl font-medium text-sm transition-all ${testResult === key
                                                ? color + ' ring-2 ring-offset-2'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Bulgular (Opsiyonel)</label>
                            <textarea
                                value={testFindings}
                                onChange={(e) => setTestFindings(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                                rows={3}
                                placeholder="Test sırasında tespit edilen bulgular..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowTestModal(false);
                                    setSelectedControl(null);
                                }}
                                className="px-6 py-2.5 text-gray-600"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSubmitTest}
                                disabled={!testResult}
                                className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50"
                            >
                                Testi Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
