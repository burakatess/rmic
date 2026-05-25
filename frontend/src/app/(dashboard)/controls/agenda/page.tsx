'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ControlCard {
    id: string;
    controlId: string;
    name: string;
    directorate: string;
    frequency: string;
    dueDate: string;
    assignee: string;
    hasFinding: boolean;
    status: 'ACTIVE' | 'PASSIVE';
    effectivenessStatus: string;
    kanbanStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
}

type KanbanColumn = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';

// ─── Config ──────────────────────────────────────────────────────────────────

const columnConfig: Record<KanbanColumn, { title: string; color: string; bgColor: string; borderColor: string; dotColor: string; icon: string }> = {
    PENDING: { title: 'Bekliyor', color: 'text-blue-700', bgColor: 'bg-blue-50/70', borderColor: 'border-blue-100', dotColor: 'bg-blue-500', icon: '📋' },
    IN_PROGRESS: { title: 'Devam Ediyor', color: 'text-amber-700', bgColor: 'bg-amber-50/70', borderColor: 'border-amber-100', dotColor: 'bg-amber-500', icon: '🔄' },
    COMPLETED: { title: 'Tamamlandı', color: 'text-purple-700', bgColor: 'bg-purple-50/70', borderColor: 'border-purple-100', dotColor: 'bg-purple-500', icon: '✅' },
    APPROVED: { title: 'Onaylandı', color: 'text-green-700', bgColor: 'bg-green-50/70', borderColor: 'border-green-100', dotColor: 'bg-green-500', icon: '🛡️' },
};

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};

const formatDate = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function ControlAgendaKanban() {
    const [controls, setControls] = useState<ControlCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDirectorate, setFilterDirectorate] = useState('all');
    const [filterFrequency, setFilterFrequency] = useState('all');

    useEffect(() => {
        const load = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const res = await api.getControls() as any;
                const list = Array.isArray(res) ? res : (res?.data || []);
                
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cards: ControlCard[] = list.filter((c: any) => (c.status || 'ACTIVE') === 'ACTIVE').map((c: any) => {
                    // Determine kanban status based on effectivenessStatus and other properties
                    let kStatus: KanbanColumn = 'PENDING';
                    if (c.effectivenessStatus === 'EFFECTIVE') {
                        kStatus = 'APPROVED';
                    } else if (c.effectivenessStatus === 'PARTIALLY_EFFECTIVE') {
                        kStatus = 'COMPLETED';
                    } else if (c.effectivenessStatus === 'INEFFECTIVE') {
                        kStatus = 'IN_PROGRESS';
                    }

                    return {
                        id: String(c.id),
                        controlId: String(c.controlId || ''),
                        name: String(c.name || ''),
                        directorate: String(c.directorate || c.owner?.department || 'Genel'),
                        frequency: String(c.frequency || 'MONTHLY'),
                        dueDate: c.nextTestDate || c.controlDate || new Date().toISOString(),
                        assignee: c.owner ? `${c.owner.firstName || ''} ${c.owner.lastName || ''}`.trim() : 'Atanmamış',
                        hasFinding: (c.findings?.length || 0) > 0 || c.effectivenessStatus === 'INEFFECTIVE',
                        status: (c.status || 'ACTIVE') as 'ACTIVE' | 'PASSIVE',
                        effectivenessStatus: String(c.effectivenessStatus || 'NOT_TESTED'),
                        kanbanStatus: kStatus,
                    };
                });
                setControls(cards);
            } catch (err) {
                console.error('Failed to load controls for kanban:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const directorates = useMemo(() => [...new Set(controls.map(c => c.directorate))].filter(Boolean).sort(), [controls]);

    const filteredControls = useMemo(() => {
        return controls.filter(c => {
            if (filterDirectorate !== 'all' && c.directorate !== filterDirectorate) return false;
            if (filterFrequency !== 'all' && c.frequency !== filterFrequency) return false;
            return true;
        });
    }, [controls, filterDirectorate, filterFrequency]);

    const columns: Record<KanbanColumn, ControlCard[]> = useMemo(() => {
        const cols: Record<KanbanColumn, ControlCard[]> = {
            PENDING: [], IN_PROGRESS: [], COMPLETED: [], APPROVED: [],
        };
        filteredControls.forEach(c => {
            cols[c.kanbanStatus].push(c);
        });
        // Sort by due date
        Object.values(cols).forEach(arr => arr.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
        return cols;
    }, [filteredControls]);

    // HTML5 Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, targetCol: KanbanColumn) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        setControls(prev => prev.map(c => {
            if (c.id === id) {
                // Update both local kanban status and map to effectivenessStatus
                let effStatus = 'NOT_TESTED';
                if (targetCol === 'APPROVED') effStatus = 'EFFECTIVE';
                else if (targetCol === 'COMPLETED') effStatus = 'PARTIALLY_EFFECTIVE';
                else if (targetCol === 'IN_PROGRESS') effStatus = 'INEFFECTIVE';

                return {
                    ...c,
                    kanbanStatus: targetCol,
                    effectivenessStatus: effStatus
                };
            }
            return c;
        }));

        // Optionally post status change to backend API here to sync persistence
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50 min-h-screen">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Kontrol Takip Panosu"
                    description="Kontrollerinizi Bekliyor, Devam Ediyor, Tamamlandı ve Onaylandı aşamalarında dinamik olarak sürükleyip bırakarak izleyin."
                    breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Takip Panosu' }]}
                />

                {/* Filters */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-600">Direktörlük:</label>
                        <select
                            value={filterDirectorate}
                            onChange={e => setFilterDirectorate(e.target.value)}
                            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="all">Tümü</option>
                            {directorates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-600">Sıklık:</label>
                        <select
                            value={filterFrequency}
                            onChange={e => setFilterFrequency(e.target.value)}
                            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="all">Tümü</option>
                            {Object.entries(frequencyLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div className="ml-auto text-sm text-slate-500">
                        Toplam: <span className="font-semibold text-slate-700">{filteredControls.length}</span> kontrol aktif izleniyor
                    </div>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="px-8 pb-8 flex-1 overflow-x-auto">
                <div className="grid grid-cols-4 gap-6 min-w-[1200px] h-full">
                    {(Object.keys(columnConfig) as KanbanColumn[]).map(colKey => {
                        const cfg = columnConfig[colKey];
                        const cards = columns[colKey];

                        return (
                            <div
                                key={colKey}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, colKey)}
                                className={`flex flex-col rounded-2xl border ${cfg.borderColor} bg-slate-100/50 p-3 min-h-[500px] transition-all hover:bg-slate-100/80`}
                            >
                                {/* Column Header */}
                                <div className="px-3 py-2.5 mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-xl">{cfg.icon}</span>
                                        <h3 className="font-bold text-sm text-slate-800 tracking-tight">{cfg.title}</h3>
                                    </div>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-slate-700 border border-slate-200/80 shadow-sm">
                                        {cards.length}
                                    </span>
                                </div>

                                {/* Cards */}
                                <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]">
                                    {cards.length === 0 ? (
                                        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white/40">
                                            Kart sürükleyip bırakın
                                        </div>
                                    ) : (
                                        cards.map(card => (
                                            <div
                                                key={card.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, card.id)}
                                                className="block p-4 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-lg transition-all group cursor-grab active:cursor-grabbing relative"
                                            >
                                                {/* Drag Handle Effect */}
                                                <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                </div>

                                                {/* Control ID & Status Badges */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <Link href={`/controls/${card.id}`} className="font-mono text-xs font-bold text-blue-600 hover:underline">
                                                        {card.controlId}
                                                    </Link>
                                                    <div className="flex gap-1.5">
                                                        {card.hasFinding ? (
                                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-md border border-rose-100 uppercase tracking-wider">
                                                                Bulgu Var
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-md border border-emerald-100 uppercase tracking-wider">
                                                                Temiz
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Summary Name */}
                                                <p className="text-sm font-semibold text-slate-800 line-clamp-2 mb-3 group-hover:text-blue-600 transition-colors">
                                                    {card.name}
                                                </p>

                                                {/* Meta Info */}
                                                <div className="space-y-1.5 mb-3">
                                                    {card.directorate && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                            <span className="text-slate-400">🏢</span>
                                                            <span className="font-medium text-slate-600">{card.directorate}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                        <span className="text-slate-400">📅</span>
                                                        <span>Vade: {formatDate(card.dueDate)}</span>
                                                    </div>
                                                </div>

                                                {/* Footer: Frequency & Assignee */}
                                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                                    <StatusBadge variant="neutral">{frequencyLabel[card.frequency] || card.frequency}</StatusBadge>
                                                    {card.assignee && (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                                                                <span className="text-[10px] font-bold text-blue-700">{card.assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                                                            </div>
                                                            <span className="text-[11px] font-medium text-slate-600 max-w-[90px] truncate">{card.assignee}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
