'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Action {
    id: string;
    actionId: string;
    description: string;
    source: string;
    priority: string;
    status: string;
    owner: { name: string; department: string; email: string };
    createdDate: string;
    dueDate: string;
    completedDate?: string;
    risk?: { id: string; riskId: string; name: string };
    finding?: { id: string; findingId: string; title: string };
    updates: { date: string; note: string; user: string }[];
    attachments: { id: string; name: string; size: string; uploadedBy: string; uploadDate: string }[];
    extensionRequests: { id: string; requestDate: string; requestedDate: string; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[];
    closureNote?: string;
}

const DEMO_ACTION: Action = {
    id: '1',
    actionId: 'A-2024-0001',
    description: 'Güvenlik duvarı kurallarının kapsamlı revizyonu ve güncel olmayan IP adreslerinin temizlenmesi. Tüm kuralların dokümantasyonu ve onay sürecinin tamamlanması.',
    source: 'FINDING',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    owner: { name: 'Ahmet Yılmaz', department: 'Bilgi Güvenliği', email: 'ahmet.yilmaz@banka.com' },
    createdDate: '2024-12-05',
    dueDate: '2025-01-15',
    risk: { id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' },
    finding: { id: '1', findingId: 'F-2024-001', title: 'Güvenlik Duvarı Kurallarının Güncelliği' },
    updates: [
        { date: '2024-12-20', note: 'Kural envanteri tamamlandı, 127 aktif kural tespit edildi.', user: 'Ahmet Yılmaz' },
        { date: '2024-12-15', note: 'Çalışma başlatıldı, envanter çıkarma işlemi devam ediyor.', user: 'Ahmet Yılmaz' },
        { date: '2024-12-05', note: 'Aksiyon oluşturuldu.', user: 'Sistem' },
    ],
    attachments: [
        { id: '1', name: 'guvenlik_duvari_envanteri_v1.xlsx', size: '2.4 MB', uploadedBy: 'Ahmet Yılmaz', uploadDate: '2024-12-20' },
        { id: '2', name: 'onay_mail_kaniti.pdf', size: '156 KB', uploadedBy: 'Ahmet Yılmaz', uploadDate: '2024-12-22' },
    ],
    extensionRequests: [
        { id: '1', requestDate: '2025-01-10', requestedDate: '2025-02-01', reason: 'Tedarikçi kaynaklı gecikme', status: 'PENDING' },
    ],
    closureNote: 'Tüm aksiyon maddeleri tamamlanmış ve kanıtlar eklenmiştir.',
};

const priorityConfig: Record<string, { label: string; color: string }> = {
    CRITICAL: { label: 'Kritik', color: 'bg-red-100 text-red-700' },
    HIGH: { label: 'Yüksek', color: 'bg-orange-100 text-orange-700' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
};

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    OPEN: { label: 'Açık', color: 'bg-blue-100 text-blue-700', icon: '📋' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700', icon: '✓' },
    OVERDUE: { label: 'Gecikmiş', color: 'bg-red-100 text-red-700', icon: '⚠️' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600', icon: '🔒' },
};

const sourceLabels: Record<string, string> = {
    RISK: 'Risk Tedavisi',
    FINDING: 'Denetim Bulgusu',
    CONTROL: 'Kontrol İyileştirme',
    INCIDENT: 'Olay',
    PROACTIVE: 'Proaktif',
};

export default function ActionDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'summary' | 'updates' | 'history'>('summary');
    const [newUpdate, setNewUpdate] = useState('');
    const action = DEMO_ACTION;
    const [closureNote, setClosureNote] = useState(action.closureNote || '');

    const daysRemaining = Math.ceil((new Date(action.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    const tabs = [
        { id: 'summary', label: 'Özet', icon: '📋' },
        { id: 'updates', label: 'Güncellemeler', icon: '💬', count: action.updates.length },
        { id: 'history', label: 'Geçmiş', icon: '📜' },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/actions" className="hover:text-orange-600">Aksiyon Listesi</Link>
                    <span>/</span>
                    <span className="text-gray-900">{action.actionId}</span>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-lg text-orange-600 bg-orange-50 px-3 py-1 rounded-lg">{action.actionId}</span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${statusConfig[action.status]?.color}`}>
                                    {statusConfig[action.status]?.icon} {statusConfig[action.status]?.label}
                                </span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${priorityConfig[action.priority]?.color}`}>
                                    {priorityConfig[action.priority]?.label} Öncelik
                                </span>
                            </div>
                            <p className="text-lg text-gray-900 mb-2">{action.description}</p>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>{sourceLabels[action.source]}</span>
                                <span>•</span>
                                <span>Oluşturma: {new Date(action.createdDate).toLocaleDateString('tr-TR')}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {action.status === 'IN_PROGRESS' && (
                                <button className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
                                    Tamamla
                                </button>
                            )}
                            <Link href={`/actions/${params.id}/edit`} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                Düzenle
                            </Link>
                        </div>
                    </div>

                    {/* Key Info */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Sorumlu</p>
                            <p className="font-medium text-gray-900">{action.owner.name}</p>
                            <p className="text-xs text-gray-500">{action.owner.department}</p>
                        </div>
                        <div className={`rounded-xl p-4 ${daysRemaining <= 7 ? 'bg-red-50' : daysRemaining <= 14 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                            <p className="text-xs text-gray-500 mb-1">Hedef Tarih</p>
                            <p className="font-medium text-gray-900">{new Date(action.dueDate).toLocaleDateString('tr-TR')}</p>
                            <p className={`text-xs ${daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 14 ? 'text-yellow-600' : 'text-gray-500'}`}>
                                {daysRemaining > 0 ? `${daysRemaining} gün kaldı` : `${Math.abs(daysRemaining)} gün gecikmiş`}
                            </p>
                        </div>
                        {action.risk && (
                            <Link href={`/risks/${action.risk.id}`} className="bg-blue-50 rounded-xl p-4 hover:bg-blue-100 transition-colors">
                                <p className="text-xs text-blue-600 mb-1">İlişkili Risk</p>
                                <p className="font-mono text-sm text-blue-600">{action.risk.riskId}</p>
                                <p className="text-xs text-gray-700 truncate">{action.risk.name}</p>
                            </Link>
                        )}
                        {action.finding && (
                            <Link href={`/findings/${action.finding.id}`} className="bg-purple-50 rounded-xl p-4 hover:bg-purple-100 transition-colors">
                                <p className="text-xs text-purple-600 mb-1">İlişkili Bulgu</p>
                                <p className="font-mono text-sm text-purple-600">{action.finding.findingId}</p>
                                <p className="text-xs text-gray-700 truncate">{action.finding.title}</p>
                            </Link>
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
                                    ? 'border-orange-600 text-orange-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {activeTab === 'summary' && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Aksiyon Detayı</h3>
                                        <p className="text-gray-600 text-sm leading-relaxed">{action.description}</p>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Aksiyon Sahibi</h3>
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <p className="font-medium text-gray-900">{action.owner.name}</p>
                                            <p className="text-sm text-gray-500">{action.owner.department}</p>
                                            <p className="text-sm text-orange-600">{action.owner.email}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    {/* Extension Requests */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-semibold text-gray-900">Erteleme Talepleri</h3>
                                            <button className="text-sm text-orange-600 font-medium hover:text-orange-700">Talep Oluştur</button>
                                        </div>
                                        {action.extensionRequests.length > 0 ? (
                                            <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100">
                                                {action.extensionRequests.map(req => (
                                                    <div key={req.id} className="p-4">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : req.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                {req.status === 'PENDING' ? 'Bekliyor' : req.status === 'APPROVED' ? 'Onaylandı' : 'Reddedildi'}
                                                            </span>
                                                            <span className="text-xs text-gray-500">{new Date(req.requestDate).toLocaleDateString('tr-TR')}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-900 mt-2">{req.reason}</p>
                                                        <p className="text-xs text-gray-500 mt-1">Talep Edilen: <span className="font-medium text-gray-700">{new Date(req.requestedDate).toLocaleDateString('tr-TR')}</span></p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-500">
                                                Henüz erteleme talebi bulunmuyor.
                                            </div>
                                        )}
                                    </div>

                                    {/* Attachments */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-semibold text-gray-900">Ekler</h3>
                                            <button className="text-sm text-orange-600 font-medium hover:text-orange-700">Dosya Yükle</button>
                                        </div>
                                        {action.attachments.length > 0 ? (
                                            <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100">
                                                {action.attachments.map(file => (
                                                    <div key={file.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
                                                                📄
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                                                <p className="text-xs text-gray-500">{file.size} • {file.uploadedBy} • {file.uploadDate}</p>
                                                            </div>
                                                        </div>
                                                        <button className="text-gray-400 hover:text-gray-600">
                                                            ⬇️
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-500 border-2 border-dashed border-gray-200">
                                                Dosyaları buraya sürükleyin veya yüklemek için tıklayın
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Closure Note */}
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Kapama Notu ve Sonuç</h3>
                                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                                        <textarea
                                            placeholder="Aksiyon kapatılırken girilecek notlar..."
                                            value={closureNote}
                                            onChange={(e) => setClosureNote(e.target.value)}
                                            readOnly={action.status === 'CLOSED'}
                                            className="w-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none"
                                            rows={3}
                                        />
                                        {action.status !== 'CLOSED' && (
                                            <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                                                <button className="text-xs font-medium text-orange-600 hover:text-orange-700">Notu Kaydet</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'updates' && (
                            <div>
                                {/* Add Update */}
                                <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                                    <textarea
                                        value={newUpdate}
                                        onChange={(e) => setNewUpdate(e.target.value)}
                                        placeholder="Güncelleme notu ekle..."
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none bg-white"
                                        rows={2}
                                    />
                                    <div className="flex justify-end mt-2">
                                        <button className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700">
                                            Güncelleme Ekle
                                        </button>
                                    </div>
                                </div>

                                {/* Updates Timeline */}
                                <div className="space-y-4">
                                    {action.updates.map((update, index) => (
                                        <div key={index} className="flex gap-4">
                                            <div className="flex flex-col items-center">
                                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                                {index < action.updates.length - 1 && <div className="w-0.5 h-full bg-gray-200"></div>}
                                            </div>
                                            <div className="flex-1 pb-4">
                                                <p className="text-sm text-gray-900">{update.note}</p>
                                                <p className="text-xs text-gray-500 mt-1">{update.user} • {new Date(update.date).toLocaleDateString('tr-TR')}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
