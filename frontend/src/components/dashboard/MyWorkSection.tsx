'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

const SEVERITY_LABELS: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };
const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700',
    HIGH: 'bg-orange-100 text-orange-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    LOW: 'bg-blue-100 text-blue-700',
};
const ACTION_STATUS_LABELS: Record<string, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı',
    YETERSIZ: 'Yetersiz', KAPATILDI: 'Kapatıldı', OPEN: 'Açık', IN_PROGRESS: 'Devam Ediyor',
};

interface MyWorkData {
    period: { label: string };
    controlTests: any[];
    assignedFindings: any[];
    assignedActions: any[];
    upcomingDeadlines: any[];
}

function fmt(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('tr-TR');
}

function Card({ title, count, color, children, href }: {
    title: string; count: number; color: string; children: React.ReactNode; href: string;
}) {
    return (
        <div className={`bg-white rounded-xl border-2 ${color} overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{count}</span>
            </div>
            <div className="flex-1 divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {children}
            </div>
            <Link href={href} className="block px-5 py-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 transition-colors">
                Tümünü Gör →
            </Link>
        </div>
    );
}

function EmptyRow({ text }: { text: string }) {
    return <p className="px-5 py-6 text-center text-xs text-slate-400">{text}</p>;
}

export default function MyWorkSection() {
    const [data, setData] = useState<MyWorkData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getMyWork()
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32 text-slate-400">
                <div className="animate-spin w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full mr-2" />
                Bu ayki işleriniz yükleniyor...
            </div>
        );
    }
    if (!data) return null;

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-bold text-slate-900">📋 Bu Ayki İşlerim</h2>
                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">{data.period.label}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card title="Yapılacak Kontrol Testleri" count={data.controlTests.length} color="border-indigo-200" href="/controls">
                    {data.controlTests.length === 0 ? <EmptyRow text="Bu ay test edilecek kontrol yok" /> :
                        data.controlTests.slice(0, 8).map((c: any) => (
                            <Link key={c.id} href={`/controls`} className="block px-5 py-2.5 hover:bg-slate-50">
                                <p className="text-xs font-mono font-bold text-indigo-600">{c.controlId}</p>
                                <p className="text-xs text-slate-700 truncate">{c.name}</p>
                                <p className="text-[10px] text-slate-400">{c.directorateRel?.name ?? ''} · Son test: {fmt(c.lastTestDate)}</p>
                            </Link>
                        ))}
                </Card>

                <Card title="Atanmış Bulgular" count={data.assignedFindings.length} color="border-amber-200" href="/findings">
                    {data.assignedFindings.length === 0 ? <EmptyRow text="Size atanmış açık bulgu yok" /> :
                        data.assignedFindings.slice(0, 8).map((f: any) => (
                            <Link key={f.id} href={`/findings`} className="block px-5 py-2.5 hover:bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <p className="text-xs font-mono font-bold text-amber-600">{f.findingId}</p>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${SEVERITY_COLORS[f.severity] ?? 'bg-slate-100'}`}>
                                        {SEVERITY_LABELS[f.severity] ?? f.severity}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-700 truncate">{f.summary ?? ''}</p>
                                <p className="text-[10px] text-slate-400">Hedef: {fmt(f.targetResolutionDate)}</p>
                            </Link>
                        ))}
                </Card>

                <Card title="Atanmış Aksiyonlar" count={data.assignedActions.length} color="border-teal-200" href="/actions">
                    {data.assignedActions.length === 0 ? <EmptyRow text="Size atanmış açık aksiyon yok" /> :
                        data.assignedActions.slice(0, 8).map((a: any) => {
                            const overdue = new Date(a.dueDate) < new Date();
                            return (
                                <Link key={a.id} href={`/actions`} className="block px-5 py-2.5 hover:bg-slate-50">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-mono font-bold text-teal-600">{a.actionId}</p>
                                        <span className="text-[9px] text-slate-500">{ACTION_STATUS_LABELS[a.status] ?? a.status}</span>
                                    </div>
                                    <p className="text-xs text-slate-700 truncate">{a.description}</p>
                                    <p className={`text-[10px] ${overdue ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                        Vade: {fmt(a.dueDate)}{overdue ? ' — GECİKMİŞ' : ''}
                                    </p>
                                </Link>
                            );
                        })}
                </Card>

                <Card title="Yaklaşan Vadeler" count={data.upcomingDeadlines.length} color="border-rose-200" href="/actions">
                    {data.upcomingDeadlines.length === 0 ? <EmptyRow text="Bu ay yaklaşan vade yok" /> :
                        data.upcomingDeadlines.slice(0, 8).map((d: any) => (
                            <div key={`${d.type}-${d.id}`} className="px-5 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.type === 'ACTION' ? 'bg-teal-100 text-teal-700' : 'bg-purple-100 text-purple-700'}`}>
                                        {d.type === 'ACTION' ? 'Aksiyon' : 'Takip'}
                                    </span>
                                    <p className="text-xs font-mono font-bold text-slate-600">{d.ref}</p>
                                </div>
                                <p className="text-xs text-slate-700 truncate">{d.title}</p>
                                <p className="text-[10px] text-slate-400">{fmt(d.date)}</p>
                            </div>
                        ))}
                </Card>
            </div>
        </div>
    );
}
