'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorState } from '@/components/ui';
import { api } from '@/lib/api';

// Types
interface FlowItem {
    id: string;
    type: 'RISK' | 'CONTROL' | 'FINDING' | 'ACTION';
    code: string;
    name: string;
    status: string;
    statusColor: string;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    owner: string;
    children?: FlowItem[];
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; icon: string }> = {
    RISK: { label: 'Risk', bg: 'bg-red-50', border: 'border-red-200', icon: '⚠' },
    CONTROL: { label: 'Kontrol', bg: 'bg-blue-50', border: 'border-blue-200', icon: '🛡' },
    FINDING: { label: 'Bulgu', bg: 'bg-purple-50', border: 'border-purple-200', icon: '🔍' },
    ACTION: { label: 'Aksiyon', bg: 'bg-green-50', border: 'border-green-200', icon: '✓' },
};

const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    LOW: 'bg-green-100 text-green-800 border-green-200',
};

const CONTROL_STATUS_COLOR: Record<string, string> = {
    EFFECTIVE: 'text-green-700 bg-green-50',
    PARTIALLY_EFFECTIVE: 'text-amber-700 bg-amber-50',
    INEFFECTIVE: 'text-red-700 bg-red-50',
};
const CONTROL_STATUS_LABEL: Record<string, string> = {
    EFFECTIVE: 'Etkin', PARTIALLY_EFFECTIVE: 'Kısmen Etkin', INEFFECTIVE: 'Etkisiz',
};
const FINDING_STATUS_COLOR: Record<string, string> = {
    OPEN: 'text-red-700 bg-red-50', IN_PROGRESS: 'text-blue-700 bg-blue-50',
    PARTIALLY_CLOSED: 'text-amber-700 bg-amber-50', CLOSED: 'text-green-700 bg-green-50',
};
const FINDING_STATUS_LABEL: Record<string, string> = {
    OPEN: 'Açık', IN_PROGRESS: 'Devam Ediyor', PARTIALLY_CLOSED: 'Kısmen Kapalı', CLOSED: 'Kapalı',
};
const ACTION_STATUS_COLOR: Record<string, string> = {
    BEKLIYOR: 'text-gray-700 bg-gray-100', DEVAM_EDIYOR: 'text-blue-700 bg-blue-50',
    TAMAMLANDI: 'text-green-700 bg-green-50', KAPATILDI: 'text-green-700 bg-green-50', YETERSIZ: 'text-red-700 bg-red-50',
};
const ACTION_STATUS_LABEL: Record<string, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı', KAPATILDI: 'Kapatıldı', YETERSIZ: 'Yetersiz',
};
const RISK_STATUS_COLOR: Record<string, string> = {
    IDENTIFIED: 'text-gray-700 bg-gray-100', ASSESSED: 'text-amber-700 bg-amber-50',
    TREATED: 'text-blue-700 bg-blue-50', ACCEPTED: 'text-slate-700 bg-slate-100', CLOSED: 'text-green-700 bg-green-50',
};
const RISK_STATUS_LABEL: Record<string, string> = {
    IDENTIFIED: 'Tanımlandı', ASSESSED: 'Değerlendirildi', TREATED: 'Tedavi Edildi', ACCEPTED: 'Kabul Edildi', CLOSED: 'Kapatıldı',
};

function buildFlowFromRelations(rel: any): FlowItem {
    const findings: any[] = rel.findings || [];
    const actions: any[] = rel.actions || [];

    const actionNode = (a: any): FlowItem => ({
        id: a.id, type: 'ACTION', code: a.actionId, name: a.description,
        status: ACTION_STATUS_LABEL[a.status] || a.status,
        statusColor: ACTION_STATUS_COLOR[a.status] || 'text-gray-700 bg-gray-100',
        owner: a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : '—',
    });

    const findingNode = (f: any): FlowItem => ({
        id: f.id, type: 'FINDING', code: f.findingId, name: f.description,
        status: FINDING_STATUS_LABEL[f.status] || f.status,
        statusColor: FINDING_STATUS_COLOR[f.status] || 'text-gray-700 bg-gray-100',
        severity: f.severity,
        owner: '—',
        children: actions.filter(a => a.findingId === f.id).map(actionNode),
    });

    const controlNode = (c: any): FlowItem => ({
        id: c.id, type: 'CONTROL', code: c.controlId, name: c.name,
        status: CONTROL_STATUS_LABEL[c.effectivenessStatus] || c.effectivenessStatus || '—',
        statusColor: CONTROL_STATUS_COLOR[c.effectivenessStatus] || 'text-gray-700 bg-gray-100',
        owner: '—',
        children: findings.filter(f => f.controlId === c.id).map(findingNode),
    });

    const directFindings = findings.filter(f => !f.controlId).map(findingNode);
    const directActions = actions.filter(a => !a.findingId && !findings.some(f => f.id === a.findingId)).map(actionNode);

    return {
        id: rel.risk.id, type: 'RISK', code: rel.risk.riskId, name: rel.risk.name,
        status: RISK_STATUS_LABEL[rel.risk.status] || rel.risk.status,
        statusColor: RISK_STATUS_COLOR[rel.risk.status] || 'text-gray-700 bg-gray-100',
        owner: rel.risk.owner ? `${rel.risk.owner.firstName} ${rel.risk.owner.lastName}` : '—',
        children: [...(rel.controls || []).map(controlNode), ...directFindings, ...directActions],
    };
}

export default function RiskControlFlowPage() {
    const [flow, setFlow] = useState<FlowItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<FlowItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res: any = await api.getRisks({ limit: 50 });
            const risks: any[] = res.data || [];
            const relations = await Promise.all(risks.map(r => api.getRiskRelations(r.id)));
            const tree = relations.map(buildFlowFromRelations);
            setFlow(tree);
            setExpandedItems(new Set(tree.slice(0, 3).map(r => r.id)));
        } catch {
            setError('Akış verileri yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleExpand = (id: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const renderFlowItem = (item: FlowItem, depth: number = 0) => {
        const config = TYPE_CONFIG[item.type];
        const hasChildren = !!item.children && item.children.length > 0;
        const isExpanded = expandedItems.has(item.id);

        return (
            <div key={item.id} className="relative">
                {depth > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200" style={{ left: `${(depth - 1) * 24 + 12}px` }}></div>
                )}

                <div
                    className={`flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''
                        }`}
                    style={{ marginLeft: `${depth * 24}px` }}
                    onClick={() => setSelectedItem(item)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
                        >
                            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    ) : (
                        <div className="w-5 h-5 flex items-center justify-center text-gray-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                        </div>
                    )}

                    <div className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${config.bg} ${config.border} border`}>
                        {config.icon} {config.label}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <Link
                                href={`/${item.type.toLowerCase()}s/${item.id}`}
                                className="text-sm font-medium text-blue-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {item.code}
                            </Link>
                            {item.severity && (
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${SEVERITY_COLORS[item.severity]}`}>
                                    {item.severity}
                                </span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${item.statusColor}`}>
                                {item.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-700 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.owner}</p>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <div className="ml-2">
                        {item.children!.map(child => renderFlowItem(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    const countByType = (items: FlowItem[]): Record<string, number> => {
        const counts: Record<string, number> = { RISK: 0, CONTROL: 0, FINDING: 0, ACTION: 0 };
        const traverse = (list: FlowItem[]) => {
            list.forEach(item => {
                counts[item.type]++;
                if (item.children) traverse(item.children);
            });
        };
        traverse(items);
        return counts;
    };
    const stats = countByType(flow);

    if (error && flow.length === 0 && !loading) {
        return (
            <div className="space-y-6">
                <div className="border-b border-gray-200 pb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Risk–Kontrol–Aksiyon Akışı</h1>
                    <p className="text-gray-500 mt-1">Riskler, kontroller, bulgular ve aksiyonlar arasındaki ilişkileri görüntüleyin.</p>
                </div>
                <ErrorState description={error} onRetry={load} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-bold text-gray-900">Risk–Kontrol–Aksiyon Akışı</h1>
                <p className="text-gray-500 mt-1">Riskler, kontroller, bulgular ve aksiyonlar arasındaki ilişkileri görüntüleyin.</p>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-6 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                {Object.entries(stats).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${TYPE_CONFIG[type].bg} ${TYPE_CONFIG[type].border} border`}>
                            {TYPE_CONFIG[type].icon}
                        </span>
                        <span className="text-sm text-gray-500">{TYPE_CONFIG[type].label}:</span>
                        <span className="text-sm font-semibold text-gray-900">{count}</span>
                    </div>
                ))}
            </div>

            <div className="flex gap-6">
                {/* Left Panel - Flow Tree */}
                <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-900">Hiyerarşi Görünümü</h2>
                        <button
                            onClick={() => setExpandedItems(new Set(flow.map(r => r.id)))}
                            className="text-xs text-blue-600 hover:underline"
                        >
                            Tümünü Aç
                        </button>
                    </div>
                    <div className="p-4 max-h-[600px] overflow-y-auto">
                        {loading ? (
                            <p className="text-sm text-gray-400 text-center py-8">Yükleniyor...</p>
                        ) : flow.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">Gösterilecek risk bulunamadı.</p>
                        ) : (
                            flow.map(item => renderFlowItem(item))
                        )}
                    </div>
                </div>

                {/* Right Panel - Detail */}
                <div className="w-[360px] bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                        <h2 className="text-sm font-semibold text-gray-900">Detay</h2>
                    </div>
                    {selectedItem ? (
                        <div className="p-4">
                            <div className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${TYPE_CONFIG[selectedItem.type].bg} ${TYPE_CONFIG[selectedItem.type].border} border mb-3`}>
                                {TYPE_CONFIG[selectedItem.type].icon} {TYPE_CONFIG[selectedItem.type].label}
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">{selectedItem.code}</h3>
                            <p className="text-sm text-gray-700 mt-1">{selectedItem.name}</p>

                            <div className="mt-4 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Durum:</span>
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${selectedItem.statusColor}`}>
                                        {selectedItem.status}
                                    </span>
                                </div>
                                {selectedItem.severity && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Ciddiyet:</span>
                                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${SEVERITY_COLORS[selectedItem.severity]}`}>
                                            {selectedItem.severity}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Sahip:</span>
                                    <span className="text-gray-900">{selectedItem.owner}</span>
                                </div>
                                {selectedItem.children && selectedItem.children.length > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Alt Öğeler:</span>
                                        <span className="text-gray-900">{selectedItem.children.length} adet</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex gap-2">
                                <Link
                                    href={`/${selectedItem.type.toLowerCase()}s/${selectedItem.id}`}
                                    className="flex-1 px-3 py-2 text-sm font-medium text-center text-white bg-slate-700 rounded-lg hover:bg-slate-800"
                                >
                                    Detaya Git
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-8 text-center">
                            <div>
                                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-gray-500">Detay görmek için<br />bir öğe seçin</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Akış Zinciri Açıklaması</h3>
                <div className="flex items-center gap-8 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200">⚠ Risk</span>
                        <span>→</span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200">🛡 Kontrol</span>
                        <span>→</span>
                        <span className="px-2 py-0.5 rounded bg-purple-50 border border-purple-200">🔍 Bulgu</span>
                        <span>→</span>
                        <span className="px-2 py-0.5 rounded bg-green-50 border border-green-200">✓ Aksiyon</span>
                    </div>
                    <div className="text-gray-400">|</div>
                    <div>
                        Riskler kontroller ile azaltılır. Kontrol eksiklikleri bulgu olarak raporlanır. Bulgular aksiyon ile giderilir.
                    </div>
                </div>
            </div>
        </div>
    );
}
