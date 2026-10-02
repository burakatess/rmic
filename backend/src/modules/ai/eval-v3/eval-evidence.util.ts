// Kanıt özeti (digest) kurulumu — saf fonksiyon.
// Önceki davranış: tüm kanıt birleştirilip SONDAN kesiliyordu (sondaki dosyalar sessizce
// kayboluyordu). Yeni davranış: her kanıta adil pay, kısalar kullanmadığı payı
// uzunlara bırakır; kesilen kanıt AÇIKÇA işaretlenir ve limitations'a yazılır.

export interface EvidenceItem {
    evidenceId: string; // E0 (kullanıcı kanıt metni), E1...
    name: string;
    kind: string; // SCREENSHOT | DOCUMENT | LOG | EMAIL | TEXT ...
    readStatus: 'READ' | 'PARTIAL' | 'FAILED';
    note?: string | null;
    attachmentId?: string | null;
    text: string;
    /** Kullanıcının girdiği ek belge üst verisi (tarih, ilgili sistem, örneklem, test adımı, not). */
    meta?: { docDate?: string | null; relatedSystem?: string | null; relatedSample?: string | null; relatedTestStep?: string | null; note?: string | null };
}

export interface EvidenceDigest {
    text: string;
    items: (EvidenceItem & { chars: number; sentChars: number; truncated: boolean })[];
    truncated: boolean;
}

const MIN_SHARE = 1500;

export function buildEvidenceDigest(items: EvidenceItem[], maxChars: number): EvidenceDigest {
    const n = items.length;
    if (n === 0) return { text: '', items: [], truncated: false };

    // Adil pay dağıtımı (iki geçiş): kısa olanların artan payı uzunlara aktarılır.
    const budgets = new Map<string, number>();
    let remaining = maxChars;
    let pending = [...items];
    while (pending.length > 0) {
        const share = Math.max(MIN_SHARE, Math.floor(remaining / pending.length));
        const fits = pending.filter((i) => i.text.length <= share);
        if (fits.length === 0) {
            for (const i of pending) budgets.set(i.evidenceId, share);
            break;
        }
        for (const i of fits) {
            budgets.set(i.evidenceId, i.text.length);
            remaining -= i.text.length;
        }
        pending = pending.filter((i) => i.text.length > share);
    }

    const parts: string[] = [];
    const out: EvidenceDigest['items'] = [];
    let anyTruncated = false;
    for (const it of items) {
        const budget = budgets.get(it.evidenceId) ?? it.text.length;
        const truncated = it.text.length > budget;
        anyTruncated = anyTruncated || truncated;
        const body = truncated ? it.text.slice(0, budget) : it.text;
        const metaLines: string[] = [];
        if (it.meta?.docDate) metaLines.push(`belge tarihi: ${it.meta.docDate}`);
        if (it.meta?.relatedSystem) metaLines.push(`ilgili sistem: ${it.meta.relatedSystem}`);
        if (it.meta?.relatedSample) metaLines.push(`ilgili örneklem: ${it.meta.relatedSample}`);
        if (it.meta?.relatedTestStep) metaLines.push(`ilgili test adımı: ${it.meta.relatedTestStep}`);
        if (it.meta?.note) metaLines.push(`kullanıcı notu: ${it.meta.note}`);
        const header =
            `### [${it.evidenceId}] ${it.name} (tür: ${it.kind}; okuma: ${it.readStatus}` +
            `${it.note ? `; not: ${it.note}` : ''}${truncated ? '; KISALTILDI' : ''})` +
            (metaLines.length ? `\n(${metaLines.join(' | ')})` : '');
        const trunc = truncated
            ? `\n[NOT: bu kanıt uzunluk sınırı nedeniyle ilk ${budget} / ${it.text.length} karakterle iletildi; devamı incelenmedi.]`
            : '';
        parts.push(`${header}\n${body || '(içerik çıkarılamadı)'}${trunc}`);
        out.push({ ...it, chars: it.text.length, sentChars: body.length, truncated });
    }
    return { text: parts.join('\n\n'), items: out, truncated: anyTruncated };
}
