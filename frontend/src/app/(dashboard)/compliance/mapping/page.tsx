'use client';

import { useState, useEffect } from 'react';

interface Regulation {
    id: string;
    code: string;
    name: string;
    articleCount: number;
}

interface MappingItem {
    regulationId: string;
    regulationCode: string;
    articleCode: string;
    articleTitle: string;
    risks: { id: string; riskId: string; name: string }[];
    controls: { id: string; controlId: string; name: string }[];
}

const DEMO_REGULATIONS: Regulation[] = [
    { id: '1', code: 'BDDK', name: 'BDDK Düzenlemeleri', articleCount: 12 },
    { id: '2', code: 'KVKK', name: 'Kişisel Verilerin Korunması Kanunu', articleCount: 8 },
    { id: '3', code: 'ISO27001', name: 'ISO 27001 Bilgi Güvenliği', articleCount: 15 },
];

const DEMO_MAPPINGS: MappingItem[] = [
    { regulationId: '1', regulationCode: 'BDDK', articleCode: 'M.5.1', articleTitle: 'Bilgi Sistemleri Güvenliği', risks: [{ id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' }], controls: [{ id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi' }] },
    { regulationId: '1', regulationCode: 'BDDK', articleCode: 'M.5.2', articleTitle: 'Erişim Kontrolü', risks: [{ id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' }], controls: [{ id: '2', controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme Kontrolü' }] },
    { regulationId: '2', regulationCode: 'KVKK', articleCode: 'M.12', articleTitle: 'Veri Güvenliği', risks: [{ id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' }], controls: [] },
    { regulationId: '3', regulationCode: 'ISO27001', articleCode: 'A.12.3', articleTitle: 'Yedekleme', risks: [{ id: '3', riskId: 'R-2024-0003', name: 'Operasyonel Kesinti Riski' }], controls: [{ id: '3', controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama' }] },
];

const DEMO_RISKS = [
    { id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' },
    { id: '2', riskId: 'R-2024-0002', name: 'Regülasyon Uyumsuzluk Riski' },
    { id: '3', riskId: 'R-2024-0003', name: 'Operasyonel Kesinti Riski' },
    { id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' },
];

const DEMO_CONTROLS = [
    { id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi' },
    { id: '2', controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme Kontrolü' },
    { id: '3', controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama' },
];

export default function ComplianceMappingPage() {
    const [regulations] = useState<Regulation[]>(DEMO_REGULATIONS);
    const [mappings, setMappings] = useState<MappingItem[]>([]);
    const [selectedRegulation, setSelectedRegulation] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setTimeout(() => {
            setMappings(DEMO_MAPPINGS);
            setLoading(false);
        }, 500);
    }, []);

    const filteredMappings = selectedRegulation
        ? mappings.filter(m => m.regulationId === selectedRegulation)
        : mappings;

    const getCoverageColor = (riskCount: number, controlCount: number) => {
        if (riskCount > 0 && controlCount > 0) return 'bg-green-500';
        if (riskCount > 0 || controlCount > 0) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Uyum Eşleştirme</h1>
                <p className="text-gray-500 mt-1">Regülasyon maddeleri ile risk ve kontrolleri ilişkilendirin</p>
            </div>

            {/* Regulation Filter */}
            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={() => setSelectedRegulation('')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!selectedRegulation ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                >
                    Tümü
                </button>
                {regulations.map((reg) => (
                    <button
                        key={reg.id}
                        onClick={() => setSelectedRegulation(reg.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedRegulation === reg.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                    >
                        {reg.code}
                    </button>
                ))}
            </div>

            {/* Coverage Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Madde</p>
                    <p className="text-2xl font-bold text-gray-900">{filteredMappings.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-sm text-green-600">Tam Eşleşme</p>
                    <p className="text-2xl font-bold text-green-600">
                        {filteredMappings.filter(m => m.risks.length > 0 && m.controls.length > 0).length}
                    </p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-100">
                    <p className="text-sm text-yellow-600">Kısmi Eşleşme</p>
                    <p className="text-2xl font-bold text-yellow-600">
                        {filteredMappings.filter(m => (m.risks.length > 0) !== (m.controls.length > 0)).length}
                    </p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
                    <p className="text-sm text-red-600">Eşleme Yok</p>
                    <p className="text-2xl font-bold text-red-600">
                        {filteredMappings.filter(m => m.risks.length === 0 && m.controls.length === 0).length}
                    </p>
                </div>
            </div>

            {/* Mapping Matrix */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Regülasyon</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Madde</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Eşleşen Riskler</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Eşleşen Kontroller</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase">Kapsam</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredMappings.map((mapping, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                            {mapping.regulationCode}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-medium text-gray-900">{mapping.articleCode}</p>
                                        <p className="text-xs text-gray-500">{mapping.articleTitle}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        {mapping.risks.length === 0 ? (
                                            <span className="text-xs text-gray-400">Eşleme yok</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {mapping.risks.map((risk) => (
                                                    <span key={risk.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                        {risk.riskId}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {mapping.controls.length === 0 ? (
                                            <span className="text-xs text-gray-400">Eşleme yok</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {mapping.controls.map((control) => (
                                                    <span key={control.id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                                        {control.controlId}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className={`w-4 h-4 rounded-full mx-auto ${getCoverageColor(mapping.risks.length, mapping.controls.length)}`}></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-8 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-gray-600">Tam Kapsam (Risk + Kontrol)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-gray-600">Kısmi Kapsam</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-600">Kapsam Yok</span>
                </div>
            </div>
        </div>
    );
}
