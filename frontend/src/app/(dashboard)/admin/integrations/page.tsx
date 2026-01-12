'use client';

import { useState } from 'react';

interface Integration {
    id: string;
    name: string;
    type: 'API' | 'DATABASE' | 'AUTH' | 'EMAIL' | 'FILE_STORAGE' | 'AUDIT';
    description: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
    lastSync: string | null;
    config: Record<string, string>;
}

const DEMO_INTEGRATIONS: Integration[] = [
    {
        id: '1', name: 'Active Directory (LDAP)', type: 'AUTH',
        description: 'Kullanıcı kimlik doğrulama ve yetkilendirme entegrasyonu',
        status: 'CONNECTED', lastSync: '2024-12-29T10:30:00',
        config: { server: 'ldap.company.local', port: '389', baseDn: 'dc=company,dc=local' }
    },
    {
        id: '2', name: 'E-posta Bildirimleri (SMTP)', type: 'EMAIL',
        description: 'Risk ve aksiyon bildirimleri için e-posta servisi',
        status: 'CONNECTED', lastSync: '2024-12-29T12:00:00',
        config: { server: 'smtp.company.local', port: '587', from: 'grc@company.com' }
    },
    {
        id: '3', name: 'Dosya Depolama (S3)', type: 'FILE_STORAGE',
        description: 'Kanıt ve doküman depolama servisi',
        status: 'DISCONNECTED', lastSync: null,
        config: { bucket: 'grc-evidence', region: 'eu-central-1' }
    },
    {
        id: '4', name: 'SIEM Entegrasyonu', type: 'AUDIT',
        description: 'Güvenlik olayları ve log yönetimi',
        status: 'ERROR', lastSync: '2024-12-28T08:00:00',
        config: { endpoint: 'https://siem.company.local/api', apiKey: '***hidden***' }
    },
    {
        id: '5', name: 'BDDK Raporlama API', type: 'API',
        description: 'Düzenleyiciye otomatik raporlama',
        status: 'CONNECTED', lastSync: '2024-12-29T09:00:00',
        config: { endpoint: 'https://api.bddk.org.tr/reporting', version: 'v2' }
    },
];

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    API: { label: 'API', color: 'bg-blue-100 text-blue-700', icon: '🔗' },
    DATABASE: { label: 'Veritabanı', color: 'bg-purple-100 text-purple-700', icon: '🗄️' },
    AUTH: { label: 'Kimlik Doğrulama', color: 'bg-indigo-100 text-indigo-700', icon: '🔐' },
    EMAIL: { label: 'E-posta', color: 'bg-green-100 text-green-700', icon: '📧' },
    FILE_STORAGE: { label: 'Dosya Depolama', color: 'bg-amber-100 text-amber-700', icon: '📁' },
    AUDIT: { label: 'Denetim', color: 'bg-gray-100 text-gray-700', icon: '📋' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    CONNECTED: { label: 'Bağlı', color: 'bg-green-100 text-green-700' },
    DISCONNECTED: { label: 'Bağlı Değil', color: 'bg-gray-100 text-gray-600' },
    ERROR: { label: 'Hata', color: 'bg-red-100 text-red-700' },
};

export default function IntegrationsPage() {
    const [integrations] = useState<Integration[]>(DEMO_INTEGRATIONS);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    const selectedIntegration = integrations.find(i => i.id === selectedId);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Henüz senkronize edilmedi';
        const date = new Date(dateString);
        return `${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const connectedCount = integrations.filter(i => i.status === 'CONNECTED').length;
    const errorCount = integrations.filter(i => i.status === 'ERROR').length;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Entegrasyonlar</h1>
                        <p className="text-gray-500 mt-0.5">Dış sistemler ve servislerle bağlantıları yönetin</p>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition-all shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Yeni Entegrasyon
                    </button>
                </div>

                {/* Status Summary */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-500">Toplam Entegrasyon</p>
                        <p className="text-2xl font-bold text-gray-900">{integrations.length}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                        <p className="text-sm text-green-600">Aktif Bağlantı</p>
                        <p className="text-2xl font-bold text-green-600">{connectedCount}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="text-sm text-red-600">Hata</p>
                        <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                    </div>
                </div>

                <div className="flex gap-6">
                    {/* Integration List */}
                    <div className="flex-1 space-y-3">
                        {integrations.map(integration => (
                            <div
                                key={integration.id}
                                onClick={() => setSelectedId(integration.id)}
                                className={`bg-white rounded-lg p-4 border cursor-pointer transition-all ${selectedId === integration.id
                                        ? 'border-blue-500 ring-2 ring-blue-100'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl">
                                            {TYPE_CONFIG[integration.type].icon}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                                            <p className="text-sm text-gray-500">{integration.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${TYPE_CONFIG[integration.type].color}`}>
                                            {TYPE_CONFIG[integration.type].label}
                                        </span>
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${STATUS_CONFIG[integration.status].color}`}>
                                            {STATUS_CONFIG[integration.status].label}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">
                                    Son senkronizasyon: {formatDate(integration.lastSync)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detail Panel */}
                    <div className="w-[380px] bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {selectedIntegration ? (
                            <div>
                                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                                    <h2 className="font-semibold text-gray-900">{selectedIntegration.name}</h2>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Durum</label>
                                        <div className="mt-1">
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${STATUS_CONFIG[selectedIntegration.status].color}`}>
                                                {STATUS_CONFIG[selectedIntegration.status].label}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Son Senkronizasyon</label>
                                        <p className="text-sm text-gray-900 mt-1">{formatDate(selectedIntegration.lastSync)}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Yapılandırma</label>
                                        <div className="mt-1 bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-1">
                                            {Object.entries(selectedIntegration.config).map(([key, value]) => (
                                                <div key={key} className="flex justify-between">
                                                    <span className="text-gray-500">{key}:</span>
                                                    <span className="text-gray-900">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                                            Test Et
                                        </button>
                                        <button className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                                            Düzenle
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                                Detay görmek için bir entegrasyon seçin
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Modal (Placeholder) */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Yeni Entegrasyon Ekle</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Entegrasyon Tipi</label>
                                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                                    <option>API Entegrasyonu</option>
                                    <option>LDAP / Active Directory</option>
                                    <option>E-posta (SMTP)</option>
                                    <option>Dosya Depolama (S3)</option>
                                    <option>SIEM</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bağlantı Adı</label>
                                <input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Entegrasyon adı" />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600">İptal</button>
                            <button className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg">Devam</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
