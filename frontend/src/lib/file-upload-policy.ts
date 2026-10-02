export const FILE_UPLOAD_ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg';
export const FILE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, ReadonlySet<string>>> = {
    pdf: new Set(['application/pdf']),
    docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
    png: new Set(['image/png']),
    jpg: new Set(['image/jpeg']),
    jpeg: new Set(['image/jpeg']),
};

export function validateUploadFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
    if (file.size === 0) return 'Boş dosya yüklenemez.';
    if (file.size > FILE_UPLOAD_MAX_BYTES) return 'Dosya boyutu 15 MB sınırını aşamaz.';
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const allowedMimes = MIME_BY_EXTENSION[extension];
    if (!allowedMimes) return 'Yalnız PDF, DOCX, XLSX, PNG ve JPEG dosyaları yüklenebilir.';
    if (!allowedMimes.has(file.type)) return 'Dosya uzantısı ile içerik türü eşleşmiyor.';
    return null;
}
