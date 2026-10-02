'use client';

import { useState, useRef } from 'react';
import api from '@/lib/api';
import { FILE_UPLOAD_ACCEPT, validateUploadFile } from '@/lib/file-upload-policy';
import { EvidencePreview } from '@/components/controls/EvidencePreview';

export interface AttachmentMeta {
    id?: string;                 // Kalıcı ek kaydı id'si (varsa)
    uploadId?: string;
    fileName: string;            // Sunucudaki göreli yol (YYYY/MM/hex.ext)
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    displayName?: string | null;
    description?: string | null;
}

export type UploadedAttachmentMeta = AttachmentMeta & { uploadId: string };

interface FileUploadProps {
    attachments: AttachmentMeta[];
    /** Yeni dosya yüklendiğinde metadata döner (parent state'e ekler veya API'ye kaydeder) */
    onUpload: (meta: UploadedAttachmentMeta) => void | Promise<void>;
    /** Bir ek silindiğinde (id varsa kalıcı sil, yoksa sadece state'ten çıkar) */
    onRemove: (att: AttachmentMeta, index: number) => void | Promise<void>;
    label?: string;
    disabled?: boolean;
    compact?: boolean;
    attachmentKind?: 'control-test' | 'finding' | 'action' | 'follow-up';
    onUpdate?: (att: AttachmentMeta, patch: { displayName?: string; description?: string }) => void | Promise<void>;
}

function fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['pdf'].includes(ext)) return '📕';
    if (['doc', 'docx'].includes(ext)) return '📘';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
    if (['ppt', 'pptx'].includes(ext)) return '📙';
    if (['eml', 'msg'].includes(ext)) return '✉️';
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return '🖼️';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
    return '📄';
}

function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload({
    attachments, onUpload, onRemove, label = 'Ekler', disabled = false, compact = false, attachmentKind = 'finding', onUpdate,
}: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<AttachmentMeta | null>(null);
    const [editing, setEditing] = useState<AttachmentMeta | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setError(null);
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const validationError = validateUploadFile(file);
                if (validationError) throw new Error(validationError);
                const meta = await api.uploadFile(file);
                await onUpload(meta);
            }
        } catch (err: any) {
            setError(err.message || 'Yükleme başarısız');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleDownload = async (att: AttachmentMeta) => {
        try {
            if (!att.id) throw new Error('Dosya henüz bir kayda bağlanmadı');
            await api.downloadAttachment(attachmentKind, att.id, att.displayName || att.originalName);
        } catch {
            setError('İndirme başarısız');
        }
    };

    return (
        <div>
            {label && <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">{label}</label>}

            <div
                onClick={() => !disabled && !uploading && inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); if (!disabled) handleFiles(e.dataTransfer.files); }}
                className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                    ${compact ? 'px-3 py-2' : 'px-4 py-3'}
                    ${disabled ? 'border-slate-100 bg-slate-50 cursor-not-allowed' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}
            >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-xs text-slate-500">
                    {uploading ? 'Yükleniyor...' : 'Dosya seç veya sürükle (PDF, DOCX, XLSX, PNG, JPEG — en fazla 15 MB)'}
                </span>
            </div>
            <input ref={inputRef} type="file" multiple accept={FILE_UPLOAD_ACCEPT} className="hidden"
                onChange={e => handleFiles(e.target.files)} disabled={disabled} />

            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}

            {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {attachments.map((att, i) => (
                        <li key={att.id ?? att.fileName ?? i}
                            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                            <span>{fileIcon(att.originalName)}</span>
                            <button type="button" onClick={() => att.id ? setPreview(att) : undefined}
                                className="flex-1 text-left text-slate-700 hover:text-indigo-600 hover:underline truncate">
                                {att.displayName || att.originalName}
                            </button>
                            {onUpdate && !disabled && att.id && <button type="button" title="Düzenle" onClick={() => { setEditing(att); setEditName(att.displayName || att.originalName); setEditDescription(att.description || ''); }} className="text-slate-400 hover:text-indigo-600">✎</button>}
                            {att.id && <button type="button" title="İndir" onClick={() => handleDownload(att)} className="text-slate-400 hover:text-indigo-600">↓</button>}
                            <span className="text-slate-400 shrink-0">{fmtSize(att.sizeBytes)}</span>
                            {!disabled && (
                                <button type="button" onClick={() => onRemove(att, i)}
                                    className="text-slate-400 hover:text-red-500 shrink-0" title="Kaldır">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {editing && <div className="mt-2 border rounded-lg p-2 space-y-2"><p className="text-[10px] text-slate-400">Özgün: {editing.originalName}</p><input aria-label="Görünen ad" maxLength={255} value={editName} onChange={e => setEditName(e.target.value)} className="w-full text-xs border rounded px-2 py-1"/><textarea aria-label="Açıklama" maxLength={2000} value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full text-xs border rounded px-2 py-1"/><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="text-xs">İptal</button><button type="button" className="text-xs font-bold text-indigo-700" onClick={async () => { await onUpdate?.(editing, { displayName: editName, description: editDescription }); setEditing(null); }}>Kaydet</button></div></div>}
            {preview && <div className="fixed inset-0 z-[60] bg-black/50 p-8" onClick={() => setPreview(null)}><div className="bg-white rounded-xl h-full max-w-5xl mx-auto overflow-hidden" onClick={e => e.stopPropagation()}><div className="h-full"><EvidencePreview attachment={preview as any} kind={attachmentKind}/></div></div></div>}
        </div>
    );
}

export default FileUpload;
