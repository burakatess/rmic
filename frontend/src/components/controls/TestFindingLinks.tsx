'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export interface LinkedFinding {
    id: string; findingId: string; summary: string | null; status: string; workflowStatus: string; resolutionStatus: string;
    control: { id: string; controlId: string; name: string } | null;
    relation: 'SAME_TEST' | 'SAME_CONTROL' | 'OTHER_CONTROL';
}

const RELATION: Record<LinkedFinding['relation'], { label: string; cls: string }> = {
    SAME_TEST: { label: 'Bu testten', cls: 'bg-emerald-50 text-emerald-700' },
    SAME_CONTROL: { label: 'Aynı kontrol', cls: 'bg-blue-50 text-blue-700' },
    OTHER_CONTROL: { label: 'Başka kontrol', cls: 'bg-violet-50 text-violet-700' },
};
const WF: Record<string, string> = { TASLAK: 'Taslak', MUTABAKATA_GONDERILDI: 'Mutabakatta', IC_KONTROL_ONAYINA_GONDERILDI: 'İç kontrol onayında', MUTABAKAT_YAPILDI: 'Mutabakat yapıldı', IPTAL: 'İptal' };
const RES: Record<string, string> = { DEVAM_EDIYOR: 'Açık', KISMEN_KAPATILDI: 'Kısmen kapatıldı', KAPATILDI: 'Kapatıldı', ERTELENDI: 'Ertelendi', YENI_AKSIYON_GEREKLI: 'Yeni aksiyon gerekli' };

/** Kontrol sonucuna eklenecek referans cümlesi (kullanıcı metinde düzenleyebilir). */
export function buildFindingReferenceText(findings: Array<{ findingId: string }>): string {
    if (findings.length === 0) return '';
    const codes = findings.map(f => f.findingId);
    const list = codes.length === 1 ? `${codes[0]} numaralı bulgu` : `${codes.slice(0, -1).join(', ')} ve ${codes[codes.length - 1]} numaralı bulgular`;
    const tail = codes.length === 1 ? 'söz konusu bulgu kapsamında takip edilmektedir.' : 'söz konusu bulgular kapsamında takip edilmektedir.';
    return `Gerçekleştirilen kontrol kapsamında değerlendirilen hususun, sistemde kayıtlı ${list} ile ilişkili olduğu belirlenmiş olup, ilgili husus ${tail}`;
}

/** Metin, bağlı tüm bulgu numaralarını zaten içeriyor mu? (Tamamlarken otomatik eklemede kullanılır.) */
export const textReferencesAll = (text: string, findings: Array<{ findingId: string }>) =>
    findings.every(f => text.includes(f.findingId));

/**
 * Kontrol testi ↔ bulgu çoklu ilişkilendirme. Aynı veya başka kontrolden tespit edilmiş mevcut bulgular
 * aranıp seçilir (mükerrer bulgu açmak yerine). Seçim test yürütülürken değiştirilebilir.
 */
export function TestFindingLinks({ testId, editable, onLinksChange, onInsertText }: {
    testId: string; editable: boolean;
    onLinksChange?: (links: LinkedFinding[]) => void;
    onInsertText?: (text: string) => void;
}) {
    const { success, error: showError } = useToast();
    const [links, setLinks] = useState<LinkedFinding[]>([]);
    const [picking, setPicking] = useState(false);
    const [search, setSearch] = useState('');
    const [cands, setCands] = useState<LinkedFinding[]>([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.getTestFindingLinks(testId);
            const l = r.map((x: { finding: LinkedFinding }) => x.finding);
            setLinks(l); onLinksChange?.(l);
        } catch { /* görünüm opsiyonel */ }
    }, [testId, onLinksChange]);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!picking) return;
        const h = setTimeout(() => {
            api.getTestFindingCandidates(testId, search).then(setCands).catch(() => setCands([]));
        }, 250);
        return () => clearTimeout(h);
    }, [picking, search, testId]);

    const save = async (ids: string[]) => {
        setBusy(true);
        try {
            await api.setTestFindingLinks(testId, ids);
            await load();
            success('Kaydedildi', 'Bulgu ilişkileri güncellendi.');
        } catch (e) {
            showError('Kaydedilemedi', (e as Error).message);
        } finally { setBusy(false); }
    };
    const linkedIds = useMemo(() => new Set(links.map(l => l.id)), [links]);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="test-finding-links">
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">İlişkili bulgular ({links.length})</p>
                <div className="flex gap-2">
                    {links.length > 0 && onInsertText && editable && (
                        <Button size="xs" variant="outline" onClick={() => onInsertText(buildFindingReferenceText(links))}>Sonuç metnine referans ekle</Button>
                    )}
                    {editable && <Button size="xs" variant={picking ? 'secondary' : 'outline'} onClick={() => setPicking(p => !p)}>{picking ? 'Kapat' : '+ Mevcut bulgudan seç'}</Button>}
                </div>
            </div>

            {links.length === 0 ? (
                <p className="text-sm text-slate-400">Henüz ilişkilendirilmiş bulgu yok. Aynı husus için yeni bulgu açmadan önce mevcut bulguları kontrol edin.</p>
            ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {links.map(f => (
                        <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                            <Link href={`/findings/${f.id}`} target="_blank" className="font-mono font-semibold text-blue-700 hover:underline">{f.findingId}</Link>
                            <span className="text-slate-800 truncate max-w-[280px]">{f.summary || '—'}</span>
                            <span className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${RELATION[f.relation].cls}`}>{RELATION[f.relation].label}</span>
                            <span className="text-[11px] text-slate-500">{WF[f.workflowStatus] ?? f.workflowStatus} · {RES[f.resolutionStatus] ?? f.resolutionStatus}</span>
                            {f.control && <span className="text-[11px] text-slate-500">Kontrol: {f.control.controlId}</span>}
                            {editable && <button type="button" disabled={busy} onClick={() => save(links.filter(l => l.id !== f.id).map(l => l.id))} className="ml-auto text-xs text-red-600 hover:underline">Kaldır</button>}
                        </li>
                    ))}
                </ul>
            )}

            {picking && (
                <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bulgu no, başlık veya açıklama ara" aria-label="Bulgu ara" autoFocus
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm mb-2" />
                    <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-100">
                        {cands.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Açık bulgu bulunamadı.</li>}
                        {cands.map(c => (
                            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                <input type="checkbox" aria-label={`${c.findingId} seç`} checked={linkedIds.has(c.id)} disabled={busy}
                                    onChange={e => save(e.target.checked ? [...links.map(l => l.id), c.id] : links.filter(l => l.id !== c.id).map(l => l.id))} />
                                <span className="font-mono font-semibold text-slate-700">{c.findingId}</span>
                                <span className="truncate text-slate-700 flex-1">{c.summary || '—'}</span>
                                <span className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${RELATION[c.relation].cls}`}>{RELATION[c.relation].label}</span>
                                {c.control && <span className="text-[11px] text-slate-500 whitespace-nowrap">{c.control.controlId}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
