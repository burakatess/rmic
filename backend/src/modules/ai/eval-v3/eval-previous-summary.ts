// Önceki değerlendirmenin KISA yapılandırılmış özeti.
// Önceden tüm ham JSON prompt'a giriyordu ve model onu tekrar ediyordu. Artık yalnız
// sonuç durumu + kısaltılmış metinler verilir; özet KANIT DEĞİLDİR.

const txt = (v: unknown): string => (typeof v === 'string' ? v : '');

const cut = (t: unknown, n: number): string => {
    const s = typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : '';
    return s.length > n ? `${s.slice(0, n)}…` : s;
};

export function summarizePreviousEvaluation(prev: unknown): string | null {
    if (!prev || typeof prev !== 'object') return null;
    const p = prev as Record<string, unknown>;
    const lines: string[] = [];

    // v3
    const cr = p.controlResult as Record<string, unknown> | undefined;
    if (cr && typeof cr === 'object' && (cr.status || cr.text)) {
        lines.push(`Önceki kontrol sonucu durumu: ${txt(cr.status) || txt(cr.overall) || '—'}`);
        lines.push(`Önceki kontrol sonucu metni: ${cut(cr.text ?? cr.summary, 500)}`);
    } else if (cr && typeof cr === 'object' && cr.overall) {
        // v2 (eski format)
        lines.push(`Önceki genel sonuç: ${txt(cr.overall)} — ${cut(cr.summary, 400)}`);
    } else {
        return null;
    }

    if (typeof p.expectedState === 'string') lines.push(`Önceki beklenen durum: ${cut(p.expectedState, 400)}`);

    const ev = Array.isArray(p.evaluatedEvidence) ? (p.evaluatedEvidence as Record<string, unknown>[]) : [];
    if (ev.length) {
        lines.push('Önceki değerlendirmede ele alınan kanıtlar:');
        for (const e of ev.slice(0, 8)) {
            const label = cut(e.name ?? e.evidenceRef, 80);
            lines.push(`- ${label}: ${cut(e.observation ?? e.shows, 200)}`);
        }
    }

    const refs = Array.isArray(p.references) ? (p.references as Record<string, unknown>[]) : [];
    if (refs.length) {
        lines.push(
            'Önceki atıflar: ' +
                refs.slice(0, 12).map((r) => `${cut(r.sourceName, 40)} ${cut(r.articleNumber, 20)} [${txt(r.assessment)}]`).join('; '),
        );
    }

    const f = p.finding as Record<string, unknown> | undefined;
    if (f && typeof f === 'object') {
        lines.push(f.exists === true ? `Önceki bulgu: ${cut(f.title, 120)}` : 'Önceki değerlendirmede bulgu yoktu.');
    }
    const more = Array.isArray(p.additionalEvidenceRequired) ? (p.additionalEvidenceRequired as unknown[]) : [];
    if (more.length) lines.push(`Önceki ek kanıt talepleri: ${more.slice(0, 6).map((m) => cut(m, 100)).join(' | ')}`);
    return lines.join('\n');
}
