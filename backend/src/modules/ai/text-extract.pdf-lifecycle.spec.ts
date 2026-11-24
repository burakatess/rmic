import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TextExtractService } from './text-extract.service';
import { UPLOAD_ROOT } from '../uploads/uploads.controller';

/** Geçerli xref ofsetleriyle tek sayfalık metin PDF'i üretir. */
function minimalPdf(text: string): Buffer {
    const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

/**
 * pdf-parse (pdfjs) yaşam döngüsü: ayrıştırıcı her kullanımda destroy() edilir. Bu dosya
 * `--detectOpenHandles` ile çalıştırıldığında açık worker/timer bırakmamalıdır.
 */
// pdfjs sahte worker'ı dinamik import ile kurar; Jest'te bu yalnız --experimental-vm-modules ile
// çalışır (`npm test` betiği ayarlar). Bayraksız doğrudan jest çağrısında atlanır.
const vmModules = (process.env.NODE_OPTIONS ?? '').includes('--experimental-vm-modules');

(vmModules ? describe : describe.skip)('TextExtractService — PDF ayrıştırıcı yaşam döngüsü', () => {
    const dir = join(UPLOAD_ROOT, '__pdf-lifecycle-test__');
    const service = new TextExtractService();

    beforeAll(() => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'a.pdf'), minimalPdf('Kontrol kaniti metni yeterince uzun bir cumle olarak yazildi'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('gerçek PDF metnini çıkarır ve ardışık çağrılarda ayrıştırıcıyı kapatır', async () => {
        for (let i = 0; i < 3; i++) {
            const doc = await service.extractOne({ id: `a${i}`, fileName: '__pdf-lifecycle-test__/a.pdf', originalName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1 } as any);
            expect(doc.kind).toBe('text');
            expect(doc.text).toContain('Kontrol kaniti metni');
        }
    });

    it('yükleme kökü dışına çıkan yol okunmaz', async () => {
        const doc = await service.extractOne({ id: 'x', fileName: '../package.json', originalName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 1 } as any);
        expect(doc).toMatchObject({ kind: 'error', note: 'Geçersiz dosya yolu' });
    });
});
