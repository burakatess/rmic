'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, LoadingState, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { AiEvalSessionListItem } from '@/types/ai';

export default function AiEvalListPage() {
    const router = useRouter();
    const { error: showError } = useToast();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [sessions, setSessions] = useState<AiEvalSessionListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const status = await api.getAiStatus().catch(() => ({ enabled: false }));
            setEnabled(status.enabled);
            setSessions(await api.listAiEvalSessions());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const create = async () => {
        setCreating(true);
        try {
            const s = await api.createAiEvalSession({});
            router.push(`/ai/kontrol-kanit/${s.id}`);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Oturum oluşturulamadı');
            setCreating(false);
        }
    };

    return (
        <PageShell>
            <PageHeader
                title="Kontrol & Kanıt Değerlendirme"
                description="Bir kontrol (envanterden veya elle) ve mevzuat maddeleri için sunduğunuz belge, ekran görüntüsü ve e-postaları yapay zekâ ile uyum açısından değerlendirin."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Kontrol & Kanıt Değerlendirme' }]}
                actions={
                    <Button onClick={create} loading={creating} disabled={enabled === false}>
                        Yeni Değerlendirme
                    </Button>
                }
            />

            {enabled === false && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Yapay zeka modülü kapalı. <code className="font-mono">backend/.env</code> içinde{' '}
                    <code className="font-mono">AI_ENABLED=true</code> ve <code className="font-mono">AI_API_KEY</code> gerekli.
                </div>
            )}

            {loading ? (
                <LoadingState />
            ) : sessions.length === 0 ? (
                <EmptyState
                    title="Henüz değerlendirme yok"
                    description="Yeni bir değerlendirme başlatın; kontrol alanını doldurup kanıt ekleyin."
                />
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <ul className="divide-y divide-slate-100">
                        {sessions.map((s) => (
                            <li key={s.id}>
                                <Link
                                    href={`/ai/kontrol-kanit/${s.id}`}
                                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
                                >
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                                        {s.title}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {s._count.attachments} kanıt · {s._count.messages} mesaj
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {new Date(s.updatedAt).toLocaleDateString('tr-TR')}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </PageShell>
    );
}
