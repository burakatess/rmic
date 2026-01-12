'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import AddActionModal from '@/components/modals/AddActionModal';

interface Finding {
    id: string;
    findingId: string;
    title: string;
    description: string;
    source: string;
    severity: string;
    status: string;
    risk: { id: string; riskId: string; name: string };
    control: { id: string; controlId: string; name: string };
    owner: { name: string; department: string; email: string };
    identifiedDate: string;
    targetDate: string;
    closedDate?: string;
    recommendation: string;
    managementResponse?: string;
    affectedSystem?: string;
    relatedDepartment?: string;
    responsiblePerson?: string;
}

interface Action {
    id: string;
    actionId: string;
    description: string;
    status: string;
    dueDate: string;
    owner: string;
}

const severityConfig: Record<string, { label: string; color: string }> = {
    CRITICAL: { label: 'Kritik', color: 'bg-red-100 text-red-700 border-red-200' },
    HIGH: { label: 'Yüksek', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700 border-green-200' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'Açık', color: 'bg-blue-100 text-blue-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700' },
    PENDING_REVIEW: { label: 'İnceleme Bekliyor', color: 'bg-purple-100 text-purple-700' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600' },
};

const sourceLabels: Record<string, string> = {
    CONTROL_TEST: 'Kontrol Testi',
    INTERNAL_AUDIT: 'İç Denetim',
    EXTERNAL_AUDIT: 'Dış Denetim',
    INCIDENT: 'Olay',
    SELF_ASSESSMENT: 'Öz Değerlendirme',
};

const actionStatusConfig: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'Açık', color: 'bg-blue-100 text-blue-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700' },
};

export default function FindingDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'history'>('summary');
    const [finding, setFinding] = useState<Finding | null>(null);
    const [actions, setActions] = useState<Action[]>([]);
    const [showAddActionModal, setShowAddActionModal] = useState(false);
    const [loading, setLoading] = useState(true);

    // Fetch finding and actions from API
    useEffect(() => {
        const fetchData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getFinding(params.id as string) as any;
                if (data) {
                    setFinding({
                        id: String(data.id),
                        findingId: String(data.findingId || ''),
                        title: String(data.description || '').slice(0, 50) + '...',
                        description: String(data.description || ''),
                        source: String(data.source || 'CONTROL_TEST'),
                        severity: String(data.severity || 'MEDIUM'),
                        status: String(data.status || 'OPEN'),
                        risk: { id: data.risk?.id || '1', riskId: data.risk?.riskId || '', name: data.risk?.name || '' },
                        control: { id: data.control?.id || '1', controlId: data.control?.controlId || '', name: data.control?.name || '' },
                        owner: { name: 'Bilinmiyor', department: '', email: '' },
                        identifiedDate: data.createdAt || new Date().toISOString(),
                        targetDate: data.targetResolutionDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        recommendation: String(data.recommendation || ''),
                        managementResponse: String(data.managementResponse || ''),
                        affectedSystem: String(data.affectedSystem || ''),
                        relatedDepartment: String(data.relatedDepartment || ''),
                        responsiblePerson: String(data.responsiblePerson || ''),
                    });
                    if (data.actions?.length) {
                        setActions(data.actions.map((a: { id: string; actionId: string; description: string; status: string; dueDate: string; owner?: { firstName: string; lastName: string } }) => ({
                            id: String(a.id),
                            actionId: String(a.actionId || ''),
                            description: String(a.description || ''),
                            status: String(a.status || 'OPEN'),
                            dueDate: a.dueDate || new Date().toISOString(),
                            owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim()
                        })));
                    }
                }
            } catch (err) {
                console.error('Failed to fetch finding:', err);
                setFinding(null);
            } finally {
                setLoading(false);
            }
        };
        if (params.id) fetchData();
    }, [params.id]);

    const handleAddAction = async (formData: { description: string; ownerUnit: string; ownerId: string; dueDate: string; status: string; attachments: File[] }) => {
        setLoading(true);
        try {
            await api.createAction({
                description: formData.description,
                findingId: params.id as string,
                source: 'FINDING',
                dueDate: new Date(formData.dueDate).toISOString(),
                slaInDays: 14,
                // Additional fields can be mapped here when backend supports them
            });
            // Refresh actions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getFinding(params.id as string) as any;
            if (data?.actions) {
                setActions(data.actions.map((a: { id: string; actionId: string; description: string; status: string; dueDate: string; owner?: { firstName: string; lastName: string } }) => ({
                    id: String(a.id),
                    actionId: String(a.actionId || ''),
                    description: String(a.description || ''),
                    status: String(a.status || 'OPEN'),
                    dueDate: a.dueDate || new Date().toISOString(),
                    owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim()
                })));
            }
            setShowAddActionModal(false);
        } catch (err) {
            console.error('Failed to create action:', err);
            throw err; // Re-throw to let modal handle it
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'summary', label: 'Özet', icon: '📋' },
        { id: 'actions', label: 'Aksiyonlar', icon: '📌', count: actions.filter(a => a.status !== 'COMPLETED').length },
        { id: 'history', label: 'Geçmiş', icon: '📜' },
    ];

    const completedActions = actions.filter(a => a.status === 'COMPLETED').length;
    const progress = actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!finding) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <span className="text-4xl mb-2">⚠️</span>
                <p>Bulgu bulunamadı</p>
                <Link href="/findings" className="mt-4 text-purple-600 hover:underline">Bulgulara Dön</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/findings" className="hover:text-purple-600">Bulgular</Link>
                    <span>/</span>
                    <span className="text-gray-900">{finding.findingId}</span>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-lg text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">{finding.findingId}</span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${severityConfig[finding.severity]?.color}`}>
                                    {severityConfig[finding.severity]?.label}
                                </span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${statusConfig[finding.status]?.color}`}>
                                    {statusConfig[finding.status]?.label}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{finding.title}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>{sourceLabels[finding.source]}</span>
                                <span>•</span>
                                <span>Tespit: {new Date(finding.identifiedDate).toLocaleDateString('tr-TR')}</span>
                                <span>•</span>
                                <span>Hedef: {new Date(finding.targetDate).toLocaleDateString('tr-TR')}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowAddActionModal(true)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                                + Aksiyon Ekle
                            </button>
                            <Link href={`/findings/${params.id}/edit`} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700">
                                Düzenle
                            </Link>
                        </div>
                    </div>

                    {/* Progress and Links */}
                    <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-2">Aksiyon İlerlemesi</p>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: `${progress}%` }}></div>
                                </div>
                                <span className="text-sm font-medium text-gray-900">%{progress}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{completedActions}/{actions.length} tamamlandı</p>
                        </div>

                        {/* Associated Risk */}
                        {finding.risk.name ? (
                            <Link href={`/risks/${finding.risk.id}`} className="bg-blue-50 rounded-xl p-4 hover:bg-blue-100 transition-colors">
                                <p className="text-xs text-blue-600 mb-1">İlişkili Risk</p>
                                <p className="font-mono text-sm text-blue-600">{finding.risk.riskId}</p>
                                <p className="text-sm text-gray-900 truncate">{finding.risk.name}</p>
                            </Link>
                        ) : (
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 border-dashed flex flex-col justify-center">
                                <p className="text-xs text-gray-500 mb-1">İlişkili Risk</p>
                                <p className="text-sm text-gray-400 italic">İlişkili risk bulunmuyor</p>
                            </div>
                        )}

                        {/* Associated Control */}
                        {finding.control.name ? (
                            <Link href={`/controls/${finding.control.id}`} className="bg-green-50 rounded-xl p-4 hover:bg-green-100 transition-colors">
                                <p className="text-xs text-green-600 mb-1">İlişkili Kontrol</p>
                                <p className="font-mono text-sm text-green-600">{finding.control.controlId}</p>
                                <p className="text-sm text-gray-900 truncate">{finding.control.name}</p>
                            </Link>
                        ) : (
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 border-dashed flex flex-col justify-center">
                                <p className="text-xs text-gray-500 mb-1">İlişkili Kontrol</p>
                                <p className="text-sm text-gray-400 italic">İlişkili kontrol bulunmuyor</p>
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
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {activeTab === 'summary' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Bulgu Kaynağı</h3>
                                        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
                                            {sourceLabels[finding.source] || finding.source}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Etkilenen Sistem</h3>
                                        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
                                            {finding.affectedSystem || 'Belirtilmemiş'}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Bulgu Sahibi</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-purple-50 rounded-xl p-4">
                                                <p className="text-xs text-purple-600 mb-1">Sorumlu Kişi</p>
                                                <p className="font-medium text-gray-900">{finding.responsiblePerson || finding.owner.name || 'Belirtilmemiş'}</p>
                                            </div>
                                            <div className="bg-pink-50 rounded-xl p-4">
                                                <p className="text-xs text-pink-600 mb-1">Direktörlük</p>
                                                <p className="font-medium text-gray-900">{finding.relatedDepartment || finding.owner.department || 'Belirtilmemiş'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Bulgu Açıklaması</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{finding.description}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Öneri</h3>
                                        <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700">
                                            {finding.recommendation || 'Öneri bulunmuyor.'}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 mb-3">Yönetim Yanıtı</h3>
                                        <div className="bg-green-50 rounded-xl p-4 text-sm text-gray-700">
                                            {finding.managementResponse || 'Yanıt bekleniyor...'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Bulgu Sahibi</h3>
                                    <div className="bg-gray-50 rounded-xl p-4 inline-block">
                                        <p className="font-medium text-gray-900">{finding.owner.name}</p>
                                        <p className="text-sm text-gray-500">{finding.owner.department}</p>
                                        <p className="text-sm text-purple-600">{finding.owner.email}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-sm text-gray-500">{actions.length} aksiyon bu bulguyla ilişkilendirilmiş</p>
                                </div>
                                <div className="space-y-3">
                                    {actions.map(action => (
                                        <div key={action.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.status === 'COMPLETED' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                                                    {action.status === 'COMPLETED' ? '✓' : '📌'}
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-orange-600">{action.actionId}</p>
                                                    <p className="text-gray-900">{action.description}</p>
                                                    <p className="text-xs text-gray-500">Sorumlu: {action.owner}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${actionStatusConfig[action.status]?.color}`}>
                                                    {actionStatusConfig[action.status]?.label}
                                                </span>
                                                <span className="text-gray-500">{new Date(action.dueDate).toLocaleDateString('tr-TR')}</span>
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

            {/* Add Action Modal */}
            <AddActionModal
                isOpen={showAddActionModal}
                onClose={() => setShowAddActionModal(false)}
                onSubmit={handleAddAction}
                findingId={finding.findingId}
            />
        </div>
    );
}
