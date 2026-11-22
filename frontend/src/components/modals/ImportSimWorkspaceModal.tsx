'use client';

import { useState } from 'react';
import api, { ApiError } from '@/lib/api';
import { Button, Modal, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
    readWorkbook, parseSheet, downloadBlankRiskTemplate, downloadBlankControlTemplate, runDownload,
    type ParsedSheet, type ParseIssue,
} from '@/lib/sim-excel';

/*
 * Excel'den simülasyon çalışma alanı. Dosyalar tarayıcıda okunur; önce sunucuda kontrol
 * edilir (yazma yok), kullanıcı "Oluştur" dediğinde yeni bir çalışma alanı kaydedilir.
 * Mevcut çalışma alanları ve gerçek envanter değişmez.
 */

interface ServerIssue { sheet: 'Risk' | 'Kontrol'; row: number | null; id: string | null; level: 'error' | 'warning'; message: string }
interface Report {
    risks: { total: number; accepted: number; skipped: number; cancelled: number };
    controls: { total: number; accepted: number; skipped: number; approved: number; withKts: number; unmatchedTexts: number };
    errorCount: number; warningCount: number; issues: ServerIssue[]; issuesTruncated: boolean;
}
type Slot = { file: File; parsed: ParsedSheet } | null;

function FilePick({ label, hint, slot, onPick, onClear, onTemplate }: {
    label: string; hint: string; slot: Slot; onPick: (f: File) => void; onClear: () => void; onTemplate: () => void;
}) {
    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">{label}</div>
                <button type="button" onClick={onTemplate} className="text-xs font-medium text-teal-700 hover:underline">Boş şablon</button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">{hint}</p>
            {slot ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                    <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{slot.file.name}</div>
                        <div className="text-slate-500">&quot;{slot.parsed.sheetName}&quot; sayfası · {slot.parsed.rows.length} satır</div>
                    </div>
                    <button type="button" onClick={onClear} className="text-slate-500 hover:text-red-600">Kaldır</button>
                </div>
            ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 hover:border-teal-400 hover:bg-teal-50/40">
                    <span className="font-medium text-slate-700">Dosya seçin</span>
                    <span>.xlsx · en fazla 10 MB</span>
                    <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
                </label>
            )}
            {slot?.parsed.missingHeaders.length ? (
                <p className="mt-2 text-xs text-amber-700">Bulunamayan kolonlar (boş kabul edilir): {slot.parsed.missingHeaders.join(', ')}</p>
            ) : null}
        </div>
    );
}

function IssueTable({ issues }: { issues: (ServerIssue | (ParseIssue & { level: 'warning' }))[] }) {
    if (!issues.length) return null;
    return (
        <div className="max-h-56 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr><th className="px-2 py-1.5">Tablo</th><th className="px-2 py-1.5">Satır</th><th className="px-2 py-1.5">ID</th><th className="px-2 py-1.5">Durum</th></tr>
                </thead>
                <tbody>
                    {issues.map((i, n) => (
                        <tr key={n} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">{i.sheet}</td>
                            <td className="px-2 py-1.5 font-mono">{i.row ?? '—'}</td>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap">{i.id ?? '—'}</td>
                            <td className={`px-2 py-1.5 ${i.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{i.level === 'error' ? 'Alınmadı: ' : ''}{i.message}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ImportSimWorkspaceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (sim: { id: string }) => void }) {
    const [name, setName] = useState('');
    const [riskSlot, setRiskSlot] = useState<Slot>(null);
    const [controlSlot, setControlSlot] = useState<Slot>(null);
    const [report, setReport] = useState<Report | null>(null);
    const [busy, setBusy] = useState<'check' | 'create' | null>(null);
    const { success, error: showError } = useToast();

    const reset = () => { setName(''); setRiskSlot(null); setControlSlot(null); setReport(null); };
    const close = () => { if (!busy) { reset(); onClose(); } };

    const pick = async (kind: 'Risk' | 'Kontrol', file: File) => {
        setReport(null);
        try {
            const wb = await readWorkbook(file);
            const parsed = parseSheet(wb, kind);
            if (kind === 'Risk') {
                setRiskSlot({ file, parsed });
                if (!name) setName(file.name.replace(/\.xlsx$/i, ''));
                // Tek dosyada iki tablo varsa Kontrol tablosu da buradan alınır.
                if (!controlSlot) { try { setControlSlot({ file, parsed: parseSheet(wb, 'Kontrol') }); } catch { /* yalnız Risk tablosu */ } }
            } else setControlSlot({ file, parsed });
        } catch (e) {
            showError('Dosya okunamadı', e instanceof Error ? e.message : 'Excel dosyası okunamadı.');
        }
    };

    const payload = (dryRun: boolean) => ({
        name: name.trim() || 'Excel çalışma alanı', dryRun,
        sourceFileName: [riskSlot?.file.name, controlSlot && controlSlot.file !== riskSlot?.file ? controlSlot.file.name : null].filter(Boolean).join(' + ').slice(0, 255),
        risks: riskSlot?.parsed.rows ?? [], controls: controlSlot?.parsed.rows ?? [],
    });

    const check = async () => {
        if (!riskSlot) { showError('Eksik dosya', 'Risk Excel\'i zorunludur.'); return; }
        setBusy('check');
        try {
            const res = await api.importSimWorkspace(payload(true));
            setReport(res.report);
        } catch (e) {
            showError('Kontrol edilemedi', e instanceof ApiError ? e.message : 'Dosyalar kontrol edilemedi.');
        } finally { setBusy(null); }
    };

    const create = async () => {
        if (!name.trim()) { showError('Eksik bilgi', 'Çalışma alanı adı zorunludur.'); return; }
        setBusy('create');
        try {
            const res = await api.importSimWorkspace(payload(false));
            success('Oluşturuldu', `${res.simulation.simulationId}: ${res.report.risks.accepted} risk, ${res.report.controls.accepted} kontrol yüklendi.`);
            reset();
            onCreated(res.simulation);
        } catch (e) {
            showError('Oluşturulamadı', e instanceof ApiError ? e.message : 'Çalışma alanı oluşturulamadı.');
        } finally { setBusy(null); }
    };

    const clientIssues = [...(riskSlot?.parsed.issues ?? []), ...(controlSlot?.parsed.issues ?? [])].map(i => ({ ...i, level: 'warning' as const }));
    const allIssues = report ? [...report.issues.filter(i => i.level === 'error'), ...clientIssues, ...report.issues.filter(i => i.level === 'warning')] : clientIssues;

    return (
        <Modal open={open} onClose={close} title="Excel'den Çalışma Alanı" size="xl"
            description="GRC Risk ve Kontrol dışa aktarımlarını ya da doldurulmuş şablonları yükleyin. Dosyalar önce kontrol edilir; oluşturduğunuzda yeni bir çalışma alanı açılır."
            footer={<>
                <Button variant="secondary" onClick={close} disabled={!!busy}>Vazgeç</Button>
                <Button variant="secondary" onClick={check} loading={busy === 'check'} disabled={!riskSlot || !!busy}>Kontrol et</Button>
                <Button variant="primary" onClick={create} loading={busy === 'create'} disabled={!report || report.risks.accepted === 0 || !!busy}>Çalışma alanını oluştur</Button>
            </>}>
            <div className="space-y-4">
                <Input label="Ad" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Kasım 2026 BGD matrisi" />
                <div className="grid gap-3 md:grid-cols-2">
                    <FilePick label="Risk Excel'i" hint="Zorunlu. GRC Risk dışa aktarımı veya doldurulmuş Risk şablonu."
                        slot={riskSlot} onPick={f => pick('Risk', f)} onClear={() => { setRiskSlot(null); setReport(null); }} onTemplate={() => runDownload(downloadBlankRiskTemplate, m => showError('Hata', m))} />
                    <FilePick label="Kontrol Excel'i" hint="GRC Kontrol dışa aktarımı veya doldurulmuş Kontrol şablonu. Risk ID'ler Risk Excel'iyle eşleşmeli."
                        slot={controlSlot} onPick={f => pick('Kontrol', f)} onClear={() => { setControlSlot(null); setReport(null); }} onTemplate={() => runDownload(downloadBlankControlTemplate, m => showError('Hata', m))} />
                </div>

                {report && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                            ['Alınan risk', `${report.risks.accepted} / ${report.risks.total}`, report.risks.skipped ? `${report.risks.skipped} hatalı · ${report.risks.cancelled} iptal` : report.risks.cancelled ? `${report.risks.cancelled} iptal` : 'tamamı'],
                            ['Alınan kontrol', `${report.controls.accepted} / ${report.controls.total}`, `${report.controls.approved} onaylı · ${report.controls.skipped} hatalı`],
                            ['KTS girilmiş', String(report.controls.withKts), report.controls.withKts < report.controls.approved ? 'KTS\'siz riskte kalıntı hesaplanmaz' : 'tamamı'],
                            ['Uyarı / hata', `${report.warningCount + clientIssues.length} / ${report.errorCount}`, report.controls.unmatchedTexts ? `${report.controls.unmatchedTexts} P metni tanınmadı` : 'P metinleri eşleşti'],
                        ].map(([t, v, s]) => (
                            <div key={t} className="rounded-lg border border-slate-200 px-3 py-2">
                                <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{t}</div>
                                <div className="text-lg font-semibold text-slate-900">{v}</div>
                                <div className="text-[11px] text-slate-500">{s}</div>
                            </div>
                        ))}
                    </div>
                )}
                <IssueTable issues={allIssues} />
                {report?.issuesTruncated && <p className="text-xs text-slate-500">İlk 500 bulgu gösteriliyor.</p>}
                {!report && riskSlot && <p className="text-xs text-slate-500">Dosyalar okundu. Sunucu kontrolü için &quot;Kontrol et&quot;e basın; hiçbir şey kaydedilmez.</p>}
                <p className="text-xs text-slate-500">
                    Hesap uygulamanın mevcut simülasyon metodolojisiyle yapılır. Excel&apos;deki Doğal/Kalıntı Risk Puanı kayıtlı değer olarak saklanır ve
                    sapma karşılaştırmasında kullanılır. Risk ID ile eşleşen platform riskleri iz için bağlanır; gerçek envanter değişmez.
                </p>
            </div>
        </Modal>
    );
}
