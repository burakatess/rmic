'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Attachment {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isPreviewable = (mimeType: string) => mimeType === 'application/pdf' || mimeType.startsWith('image/');

export function EvidencePreview({ attachment }: { attachment: Attachment | null }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState(false);

    useEffect(() => {
        setBlobUrl(null);
        setError(null);
        setLightbox(false);
        if (!attachment || !isPreviewable(attachment.mimeType)) return;

        let cancelled = false;
        setLoading(true);
        api.getAttachmentBlobUrl(attachment.fileName, attachment.originalName)
            .then((url) => { if (!cancelled) setBlobUrl(url); })
            .catch(() => { if (!cancelled) setError('Kanıt yüklenirken bir hata oluştu.'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => {
            cancelled = true;
            // blobUrl bir sonraki effect'te (yeni seçim) veya unmount'ta serbest bırakılır
        };
    }, [attachment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
    }, [blobUrl]);

    if (!attachment) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-slate-400 p-8 text-center">
                Önizlemek için soldaki listeden bir kanıt seçin.
            </div>
        );
    }

    const handleDownload = () => api.downloadAttachment(attachment.fileName, attachment.originalName);

    if (!isPreviewable(attachment.mimeType)) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-6 4h6m2 5H7a2 2 0 01-2-2V4a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" /></svg>
                <p className="text-sm font-semibold text-slate-600">{attachment.originalName}</p>
                <p className="text-xs text-slate-400">{attachment.mimeType} · {formatSize(attachment.sizeBytes)}</p>
                <p className="text-xs text-slate-400 max-w-xs">Bu dosya türü sayfada önizlenemiyor.</p>
                <button onClick={handleDownload} className="text-xs font-bold text-emerald-700 hover:underline">İndir →</button>
            </div>
        );
    }

    if (loading) {
        return <div className="h-full flex items-center justify-center text-sm text-slate-400">Kanıt yükleniyor…</div>;
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-sm font-semibold text-rose-600">{error}</p>
                <button onClick={handleDownload} className="text-xs font-bold text-emerald-700 hover:underline">Bunun yerine indir →</button>
            </div>
        );
    }

    if (!blobUrl) return null;

    if (attachment.mimeType === 'application/pdf') {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600 truncate">{attachment.originalName}</p>
                    <button onClick={handleDownload} className="text-xs font-bold text-emerald-700 hover:underline shrink-0 ml-2">İndir</button>
                </div>
                {/* Tarayıcının yerleşik PDF görüntüleyicisi — sayfalama ve yakınlaştırma hazır gelir */}
                <iframe src={blobUrl} title={attachment.originalName} className="flex-1 w-full border-0" />
            </div>
        );
    }

    // image/*
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 truncate">{attachment.originalName}</p>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                    <button onClick={() => setLightbox(true)} className="text-xs font-bold text-slate-500 hover:text-slate-800">Büyüt</button>
                    <button onClick={handleDownload} className="text-xs font-bold text-emerald-700 hover:underline">İndir</button>
                </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-50/50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blobUrl} alt={attachment.originalName} className="max-w-full max-h-full object-contain cursor-zoom-in" onClick={() => setLightbox(true)} />
            </div>
            {lightbox && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={blobUrl} alt={attachment.originalName} className="max-w-full max-h-full object-contain" />
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(false)} aria-label="Kapat">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
}
