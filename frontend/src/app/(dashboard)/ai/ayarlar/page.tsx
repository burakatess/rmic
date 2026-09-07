'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { AiStatus, AiUsage } from '@/types/ai';

export default function AiSettingsPage() {
    const { success, error: showError } = useToast();
    const [status, setStatus] = useState<AiStatus | null>(null);
    const [usage, setUsage] = useState<AiUsage | null>(null);
    const [liveModels, setLiveModels] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, u] = await Promise.all([
                api.getAiStatus(),
                api.getAiUsage().catch(() => null),
            ]);
            setStatus(s);
            setUsage(u);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const checkModels = async () => {
        setChecking(true);
        try {
            const { models } = await api.getAiModels();
            setLiveModels(models);
            success('Bağlantı başarılı', `${models.length} model listelendi.`);
        } catch (e) {
            showError('Bağlantı hatası', e instanceof Error ? e.message : 'Model listesi alınamadı');
        } finally {
            setChecking(false);
        }
    };

    const configured = status ? [status.models.heavy, status.models.light, status.models.vision] : [];
    const missing = liveModels ? configured.filter((m) => !liveModels.includes(m)) : [];

    return (
        <PageShell>
            <PageHeader
                title="Ayarlar & Kullanım"
                description="Yapay zekâ modülünün bağlantı durumu, yapılandırılmış modeller ve son 30 günün kullanımı."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Ayarlar & Kullanım' }]}
            />

            {loading && <LoadingState />}

            {!loading && status && (
                <div className="space-y-6">
                    <section className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center gap-3">
                            <span
                                className={`inline-flex h-2.5 w-2.5 rounded-full ${status.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            />
                            <h2 className="text-sm font-semibold text-slate-800">
                                Modül {status.enabled ? 'etkin' : 'devre dışı'}
                            </h2>
                        </div>
                        {!status.enabled && (
                            <p className="mt-2 text-sm text-slate-500">
                                <code className="font-mono">backend/.env</code> içinde{' '}
                                <code className="font-mono">AI_ENABLED=true</code> ve geçerli bir{' '}
                                <code className="font-mono">AI_API_KEY</code> tanımlanmalı.
                            </p>
                        )}
                        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                            <Row label="Uç nokta" value={status.baseUrl} />
                            <Row label="Yoğun (HEAVY)" value={status.models.heavy} />
                            <Row label="Hafif (LIGHT)" value={status.models.light} />
                            <Row label="Görsel (VISION)" value={status.models.vision} />
                            <Row label="Embedding" value={status.embedModel} />
                        </dl>

                        <div className="mt-4 flex items-center gap-3">
                            <Button size="sm" variant="outline" onClick={checkModels} loading={checking} disabled={!status.enabled}>
                                Canlı model listesini doğrula
                            </Button>
                            {liveModels && (
                                <span className={`text-xs ${missing.length ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {missing.length
                                        ? `Sağlayıcıda bulunamayan: ${missing.join(', ')}`
                                        : 'Yapılandırılmış 3 model de sağlayıcıda mevcut.'}
                                </span>
                            )}
                        </div>
                    </section>

                    {usage && (
                        <section className="rounded-xl border border-slate-200 bg-white p-5">
                            <h2 className="text-sm font-semibold text-slate-800">Son {usage.periodDays} gün</h2>
                            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <Stat label="Toplam çağrı" value={usage.total} />
                                <Stat label="Girdi token" value={usage.tokensIn.toLocaleString('tr-TR')} />
                                <Stat label="Çıktı token" value={usage.tokensOut.toLocaleString('tr-TR')} />
                                <Stat
                                    label="Kabul oranı"
                                    value={usage.acceptanceRate == null ? '—' : `%${Math.round(usage.acceptanceRate * 100)}`}
                                />
                                <Stat label="Kabul" value={usage.accepted} />
                                <Stat label="Ret" value={usage.rejected} />
                                <Stat label="Hata" value={usage.failed} />
                            </dl>
                        </section>
                    )}

                    {liveModels && (
                        <section className="rounded-xl border border-slate-200 bg-white p-5">
                            <h2 className="text-sm font-semibold text-slate-800">Sağlayıcıdaki modeller ({liveModels.length})</h2>
                            <ul className="mt-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-500">
                                {liveModels.map((m) => (
                                    <li key={m} className={configured.includes(m) ? 'font-semibold text-emerald-600' : ''}>
                                        {m}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </PageShell>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="font-mono text-xs text-slate-700 break-all">{value}</dd>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-800 tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
        </div>
    );
}
