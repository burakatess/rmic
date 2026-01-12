'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Action {
    id: string;
    actionId: string;
    description: string;
    source: string;
    status: string;
    dueDate: string;
    slaInDays: number;
    owner: {
        firstName: string;
        lastName: string;
    };
    risk?: {
        id: string;
        riskId: string;
        name: string;
    };
    finding?: {
        id: string;
        findingId: string;
    };
}

const sourceLabels: Record<string, string> = {
    RISK: 'Risk',
    FINDING: 'Bulgu',
    AUDIT: 'Denetim',
    CONTROL_TEST: 'Kontrol Testi',
};

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    OPEN: { label: 'Açık', color: 'text-blue-700', bg: 'bg-blue-100' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'text-yellow-700', bg: 'bg-yellow-100' },
    COMPLETED: { label: 'Tamamlandı', color: 'text-green-700', bg: 'bg-green-100' },
    CLOSED: { label: 'Kapatıldı', color: 'text-gray-600', bg: 'bg-gray-100' },
    OVERDUE: { label: 'Gecikmiş', color: 'text-red-700', bg: 'bg-red-100' },
};

const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
};



export default function ActionsPage() {
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');

    useEffect(() => {
        loadActions();
    }, [statusFilter, sourceFilter]);

    const loadActions = async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter) params.status = statusFilter;
            if (sourceFilter) params.source = sourceFilter;

            const result = await api.getActions(params) as { data: Action[] };
            setActions(result.data || []);
        } catch (error) {
            console.error('Failed to load actions:', error);
            setActions([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Aksiyon Yönetimi</h1>
                    <p className="text-gray-500 mt-1">Tüm aksiyonları takip edin ve yönetin</p>
                </div>
                <Link
                    href="/actions/new"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Yeni Aksiyon
                </Link>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Aksiyon</p>
                    <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Devam Eden</p>
                    <p className="text-2xl font-bold text-yellow-600">
                        {actions.filter(a => a.status === 'IN_PROGRESS').length}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Tamamlanan</p>
                    <p className="text-2xl font-bold text-green-600">
                        {actions.filter(a => a.status === 'COMPLETED' || a.status === 'CLOSED').length}
                    </p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100">
                    <p className="text-sm text-red-600">Gecikmiş</p>
                    <p className="text-2xl font-bold text-red-600">
                        {actions.filter(a => a.status === 'OVERDUE' || (getDaysRemaining(a.dueDate) < 0 && a.status !== 'COMPLETED' && a.status !== 'CLOSED')).length}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                    >
                        <option value="">Tüm Durumlar</option>
                        <option value="OPEN">Açık</option>
                        <option value="IN_PROGRESS">Devam Ediyor</option>
                        <option value="COMPLETED">Tamamlandı</option>
                        <option value="OVERDUE">Gecikmiş</option>
                    </select>
                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                    >
                        <option value="">Tüm Kaynaklar</option>
                        <option value="RISK">Risk</option>
                        <option value="FINDING">Bulgu</option>
                        <option value="AUDIT">Denetim</option>
                        <option value="CONTROL_TEST">Kontrol Testi</option>
                    </select>
                </div>
            </div>

            {/* Actions List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div>
                    </div>
                ) : actions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                        </svg>
                        <p className="text-lg font-medium">Aksiyon bulunamadı</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {actions.map((action) => {
                            const daysRemaining = getDaysRemaining(action.dueDate);
                            const isOverdue = daysRemaining < 0 && action.status !== 'COMPLETED' && action.status !== 'CLOSED';

                            return (
                                <Link key={action.id} href={`/actions/${action.id}`}>
                                    <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-sm font-mono text-orange-600">{action.actionId}</span>
                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusLabels[action.status]?.bg} ${statusLabels[action.status]?.color}`}>
                                                        {statusLabels[action.status]?.label}
                                                    </span>
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                                        {sourceLabels[action.source]}
                                                    </span>
                                                </div>
                                                <p className="text-gray-900 font-medium mb-2">{action.description}</p>
                                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                                    <span>Sorumlu: {action.owner?.firstName} {action.owner?.lastName}</span>
                                                    {action.risk && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.location.href = `/risks/${action.risk?.id}`; }}
                                                            className="text-blue-600 hover:underline cursor-pointer"
                                                        >
                                                            Risk: {action.risk.riskId}
                                                        </span>
                                                    )}
                                                    {action.finding && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.location.href = `/findings/${action.finding?.id}`; }}
                                                            className="text-purple-600 hover:underline cursor-pointer"
                                                        >
                                                            Bulgu: {action.finding.findingId}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : daysRemaining <= 7 ? 'text-yellow-600' : 'text-gray-600'}`}>
                                                    {new Date(action.dueDate).toLocaleDateString('tr-TR')}
                                                </p>
                                                <p className={`text-xs ${isOverdue ? 'text-red-500' : daysRemaining <= 7 ? 'text-yellow-500' : 'text-gray-400'}`}>
                                                    {isOverdue ? `${Math.abs(daysRemaining)} gün gecikmiş` : `${daysRemaining} gün kaldı`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
