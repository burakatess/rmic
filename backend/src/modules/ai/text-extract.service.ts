import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { UPLOAD_ROOT } from '../uploads/uploads.controller';

// pdf-parse v2 — PDFParse sınıfı. (v1'deki fonksiyon API'si kaldırıldı.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as {
    PDFParse: new (o: { data: Buffer }) => {
        getText(): Promise<{ text: string; total?: number }>;
        destroy(): Promise<void>;
    };
};

async function pdfToText(buf: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buf });
    try {
        const { text } = await parser.getText();
        return text || '';
    } finally {
        await parser.destroy().catch(() => undefined);
    }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

export type ExtractKind = 'text' | 'image' | 'unsupported' | 'error';

export interface ExtractedDoc {
    attachmentId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    kind: ExtractKind;
    /** Çıkarılan düz metin (text türü). */
    text?: string;
    /** Vision modeline verilecek base64 (image türü). */
    imageBase64?: string;
    /** Kullanıcıya / modele iletilecek uyarı. */
    note?: string;
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const TEXT_EXT = new Set(['.txt', '.csv']);
const SHEET_EXT = new Set(['.xlsx', '.xls']);
// İlk sürümde yerel ayrıştırıcısı olmayan türler — VISION/OCR veya sonraki faz.
const DEFERRED_EXT = new Set(['.doc', '.docx', '.ppt', '.pptx', '.eml', '.msg', '.zip', '.rar', '.7z']);

const MAX_TEXT_CHARS = 60_000; // model bağlamını şişirmemek için dosya başına tavan
const SCANNED_PDF_MIN_CHARS = 120; // bunun altı → muhtemelen taranmış, OCR gerekli

interface AttachmentLike {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}

@Injectable()
export class TextExtractService {
    private readonly logger = new Logger('TextExtract');

    async extractMany(attachments: AttachmentLike[]): Promise<ExtractedDoc[]> {
        return Promise.all(attachments.map((a) => this.extractOne(a)));
    }

    async extractOne(att: AttachmentLike): Promise<ExtractedDoc> {
        const base: ExtractedDoc = {
            attachmentId: att.id,
            fileName: att.fileName,
            originalName: att.originalName,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
            kind: 'error',
        };

        // Path traversal koruması (uploads.controller ile aynı mantık)
        if (att.fileName.includes('..') || att.fileName.startsWith('/')) {
            return { ...base, note: 'Geçersiz dosya yolu' };
        }
        const abs = join(UPLOAD_ROOT, att.fileName);
        if (!existsSync(abs)) {
            return { ...base, note: 'Dosya diskte bulunamadı' };
        }

        const ext = extname(att.originalName || att.fileName).toLowerCase();

        try {
            if (IMAGE_EXT.has(ext)) {
                const buf = readFileSync(abs);
                return { ...base, kind: 'image', imageBase64: buf.toString('base64') };
            }

            if (TEXT_EXT.has(ext)) {
                const raw = readFileSync(abs, 'utf8');
                return { ...base, kind: 'text', text: this.clip(raw) };
            }

            if (ext === '.pdf') {
                const buf = readFileSync(abs);
                const text = (await pdfToText(buf)).trim();
                if (text.length < SCANNED_PDF_MIN_CHARS) {
                    return {
                        ...base,
                        kind: 'text',
                        text,
                        note: 'PDF metni çok kısa — taranmış belge olabilir, VISION/OCR ile okunmalı.',
                    };
                }
                return { ...base, kind: 'text', text: this.clip(text) };
            }

            if (SHEET_EXT.has(ext)) {
                const wb = XLSX.read(readFileSync(abs), { type: 'buffer' });
                const parts: string[] = [];
                for (const name of wb.SheetNames as string[]) {
                    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
                    parts.push(`### Sayfa: ${name}\n${csv}`);
                }
                return { ...base, kind: 'text', text: this.clip(parts.join('\n\n')) };
            }

            if (DEFERRED_EXT.has(ext)) {
                return {
                    ...base,
                    kind: 'unsupported',
                    note: `${ext} türü ilk sürümde otomatik okunmuyor — manuel özet gerekli.`,
                };
            }

            return { ...base, kind: 'unsupported', note: `Tanınmayan tür: ${ext || 'uzantısız'}` };
        } catch (e) {
            this.logger.warn(`Çıkarım hatası ${att.originalName}: ${(e as Error).message}`);
            return { ...base, kind: 'error', note: `Dosya okunamadı: ${(e as Error).message}` };
        }
    }

    private clip(s: string): string {
        return s.length > MAX_TEXT_CHARS ? `${s.slice(0, MAX_TEXT_CHARS)}\n…[kısaltıldı]` : s;
    }
}
