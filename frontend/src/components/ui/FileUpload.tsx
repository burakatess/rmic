'use client';

import { useState, useRef } from 'react';
import api from '@/lib/api';

export interface AttachmentMeta {
    id?: string;                 // Kalıcı ek kaydı id'si (varsa)
    fileName: string;            // Sunucudaki göreli yol (YYYY/MM/hex.ext)
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}

interface FileUploadProps {
    attachments: AttachmentMeta[];
    /** Yeni dosya yüklendiğinde metadata döner (parent state'e ekler veya API'ye kaydeder) */
    onUpload: (meta: AttachmentMeta) => void | Promise<void>;
    /** Bir ek silindiğinde (id varsa kalıcı sil, yoksa sadece state'ten çıkar) */
    onRemove: (att: AttachmentMeta, index: number) => void | Promise<void>;
    label?: string;
    disabled?: boolean;
    compact?: boolean;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.eml,.msg,.png,.jpg,.jpeg,.gif,.txt,.csv,.zip,.rar,.7z';

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
    attachments, onUpload, onRemove, label = 'Ekler', disabled = false, compact = false,
}: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setError(null);
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
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
            await api.downloadAttachment(att.fileName, att.originalName);
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
                    {uploading ? 'Yükleniyor...' : 'Dosya seç veya sürükle (PDF, Word, Excel, e-posta, görsel...)'}
                </span>
            </div>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
                onChange={e => handleFiles(e.target.files)} disabled={disabled} />

            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}

            {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {attachments.map((att, i) => (
                        <li key={att.id ?? att.fileName ?? i}
                            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                            <span>{fileIcon(att.originalName)}</span>
                            <button type="button" onClick={() => handleDownload(att)}
                                className="flex-1 text-left text-slate-700 hover:text-indigo-600 hover:underline truncate">
                                {att.originalName}
                            </button>
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
        </div>
    );
}

export default FileUpload;
