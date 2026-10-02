'use client';

import { useRef, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { FILE_UPLOAD_ACCEPT, validateUploadFile } from '@/lib/file-upload-policy';

export interface EvidenceItem {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    displayName?: string | null;
    description?: string | null;
    createdAt?: string;
    uploader?: { firstName: string; lastName: string } | null;
}

interface UploadTask {
    key: string;
    file: File;
    progress: number;
    status: 'uploading' | 'error' | 'linking';
    error?: string;
}

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const formatDate = (d?: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('tr-TR');
};

export function EvidenceList({
    testId, attachments, selectedId, onSelect, onUploaded, onUpdated, onRemoved, disabled, disabledReason,
}: {
    testId: string;
    attachments: EvidenceItem[];
    selectedId: string | null;
    onSelect: (a: EvidenceItem) => void;
    onUploaded: (a: EvidenceItem) => void;
    onUpdated: (a: EvidenceItem) => void;
    onRemoved: (id: string) => void;
    disabled?: boolean;
    disabledReason?: string;
}) {
    const { error: showError, success } = useToast();
    const [tasks, setTasks] = useState<UploadTask[]>([]);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [editing, setEditing] = useState<EvidenceItem | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<Map<string, () => void>>(new Map());

    const startUpload = (file: File) => {
        const validationError = validateUploadFile(file);
        if (validationError) {
            showError('Dosya yüklenemedi', validationError);
            return;
        }
        const key = `${file.name}-${Date.now()}-${Math.random()}`;
        setTasks(prev => [...prev, { key, file, progress: 0, status: 'uploading' }]);

        const { promise, abort } = api.uploadFileWithProgress(file, (pct) => {
            setTasks(prev => prev.map(t => t.key === key ? { ...t, progress: pct } : t));
        });
        abortRef.current.set(key, abort);

        promise
            .then(async (meta) => {
                setTasks(prev => prev.map(t => t.key === key ? { ...t, status: 'linking', progress: 100 } : t));
                const att = await api.addControlTestAttachment(testId, meta);
                onUploaded(att);
                setTasks(prev => prev.filter(t => t.key !== key));
                success('Yüklendi', `${file.name} eklendi.`);
            })
            .catch((e) => {
                setTasks(prev => prev.map(t => t.key === key ? { ...t, status: 'error', error: e?.message || 'Yükleme başarısız' } : t));
            })
            .finally(() => { abortRef.current.delete(key); });
    };

    const retryTask = (task: UploadTask) => {
        setTasks(prev => prev.filter(t => t.key !== task.key));
        startUpload(task.file);
    };

    const handleFiles = (files: FileList | null) => {
        if (!files || disabled) return;
        Array.from(files).forEach(startUpload);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleRemove = async (id: string) => {
        setRemovingId(id);
        try {
            await api.removeControlTestAttachment(testId, id);
            onRemoved(id);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Kanıt kaldırılamadı.');
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100">
                {disabled ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {disabledReason || 'Bu testte kanıt eklenemez/kaldırılamaz.'}
                    </p>
                ) : (
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl py-3 cursor-pointer transition-colors text-xs font-semibold text-slate-500 hover:text-blue-600"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Kanıt Yükle (PDF, DOCX, XLSX, PNG, JPEG — en fazla 15 MB)
                        <input ref={inputRef} type="file" multiple accept={FILE_UPLOAD_ACCEPT} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                    </label>
                )}
            </div>

            {tasks.length > 0 && (
                <div className="px-3 pt-2 space-y-1.5">
                    {tasks.map(t => (
                        <div key={t.key} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="truncate font-medium text-slate-600">{t.file.name}</span>
                                {t.status === 'error' ? (
                                    <button onClick={() => retryTask(t)} className="text-rose-600 font-bold ml-2 shrink-0">Tekrar Dene</button>
                                ) : (
                                    <span className="text-slate-400 ml-2 shrink-0">{t.status === 'linking' ? 'kaydediliyor…' : `%${t.progress}`}</span>
                                )}
                            </div>
                            {t.status === 'error' ? (
                                <p className="text-rose-600">{t.error}</p>
                            ) : (
                                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${t.progress}%` }} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {attachments.length === 0 && tasks.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">Henüz kanıt eklenmedi.</p>
                )}
                {attachments.map(a => (
                    <button
                        key={a.id}
                        onClick={() => onSelect(a)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selectedId === a.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{a.displayName || a.originalName}</p>
                                <p className="text-[10px] text-slate-400 truncate">Özgün: {a.originalName}</p>
                                {a.description && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{a.description}</p>}
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {a.mimeType} · {formatSize(a.sizeBytes)}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    {a.uploader ? `${a.uploader.firstName} ${a.uploader.lastName}` : 'Bilinmiyor'} · {formatDate(a.createdAt)}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {!disabled && <span role="button" tabIndex={0} title="Ad ve açıklamayı düzenle" onClick={(e) => { e.stopPropagation(); setEditing(a); setEditName(a.displayName || a.originalName); setEditDescription(a.description || ''); }} className="p-1 rounded text-slate-400 hover:text-indigo-600">✎</span>}
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); api.downloadAttachment('control-test', a.id, a.displayName || a.originalName); }}
                                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    title="İndir"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </span>
                                {!disabled && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => { e.stopPropagation(); if (removingId !== a.id) handleRemove(a.id); }}
                                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        title="Kaldır"
                                    >
                                        {removingId === a.id
                                            ? <span className="block w-3.5 h-3.5 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                    </span>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            {editing && <div className="border-t border-slate-200 p-3 space-y-2 bg-white">
                <p className="text-[10px] text-slate-400">Özgün dosya: {editing.originalName}</p>
                <input value={editName} maxLength={255} onChange={e => setEditName(e.target.value)} aria-label="Görünen ad" className="w-full text-xs border rounded px-2 py-1.5" />
                <textarea value={editDescription} maxLength={2000} onChange={e => setEditDescription(e.target.value)} aria-label="Kanıt açıklaması" className="w-full text-xs border rounded px-2 py-1.5" rows={2} />
                <div className="flex justify-end gap-2"><button className="text-xs" onClick={() => setEditing(null)}>İptal</button><button className="text-xs font-bold text-blue-700" onClick={async () => { try { const updated = await api.updateControlTestAttachment(testId, editing.id, { displayName: editName, description: editDescription }); onUpdated(updated); setEditing(null); success('Kaydedildi', 'Kanıt adı ve açıklaması güncellendi.'); } catch (e) { showError('Kaydedilemedi', e instanceof Error ? e.message : 'Kanıt güncellenemedi.'); } }}>Kaydet</button></div>
            </div>}
        </div>
    );
}
