import { buildEvidenceDigest, EvidenceItem } from './eval-evidence.util';

const item = (id: string, len: number, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
    evidenceId: id, name: `dosya-${id}`, kind: 'DOCUMENT', readStatus: 'READ', text: 'a'.repeat(len), ...over,
});

describe('buildEvidenceDigest', () => {
    it('sığan kanıtlar kesilmez', () => {
        const d = buildEvidenceDigest([item('E1', 1000), item('E2', 2000)], 40_000);
        expect(d.truncated).toBe(false);
        expect(d.items.every((i) => !i.truncated)).toBe(true);
    });

    it('uzun kanıt kısaltılır AMA sondaki dosya sessizce kaybolmaz ve KISALTILDI işaretlenir', () => {
        const d = buildEvidenceDigest([item('E1', 60_000), item('E2', 3_000), item('E3', 3_000)], 20_000);
        expect(d.truncated).toBe(true);
        expect(d.items[0].truncated).toBe(true);
        expect(d.text).toContain('[E2]');
        expect(d.text).toContain('[E3]');
        expect(d.text).toContain('KISALTILDI');
        expect(d.items[1].truncated).toBe(false); // kısa kanıtlar tam
        expect(d.text.length).toBeLessThan(26_000);
    });

    it('belge üst verisini ve okuma durumunu başlığa yazar (önceden prompt\'a hiç gitmiyordu)', () => {
        const d = buildEvidenceDigest([item('E1', 50, { meta: { docDate: '2026-06-30', relatedSystem: 'AD', relatedSample: 'Q2 örneklemi' }, readStatus: 'PARTIAL' })], 10_000);
        expect(d.text).toContain('belge tarihi: 2026-06-30');
        expect(d.text).toContain('ilgili sistem: AD');
        expect(d.text).toContain('okuma: PARTIAL');
    });

    it('okunamayan dosya boş sayılmaz, başlığı ve notuyla görünür', () => {
        const d = buildEvidenceDigest([item('E1', 0, { readStatus: 'FAILED', note: 'Desteklenmeyen dosya türü.', text: '' })], 10_000);
        expect(d.text).toContain('okuma: FAILED');
        expect(d.text).toContain('(içerik çıkarılamadı)');
    });
});
