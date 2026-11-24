/**
 * @jest-environment node
 */
import { downloadBlankControlTemplate, parseSheet, readWorkbook, RISK_COLUMNS, CONTROL_COLUMNS } from '@/lib/sim-excel';

/** Yazma yolunu denemek için indirmeyi yakalar: üretilen .xlsx baytlarını döndürür. */
async function captureDownload(run: () => unknown | Promise<unknown>): Promise<ArrayBuffer> {
    let blob: Blob | null = null;
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = {
        createElement: () => ({ click() { /* indirme tetiklenir */ }, remove() { /* */ }, href: '', download: '' }),
        body: { appendChild() { /* */ } },
    };
    URL.createObjectURL = (b: Blob | MediaSource) => { blob = b as Blob; return 'blob:x'; };
    URL.revokeObjectURL = () => undefined;
    await run();
    for (let i = 0; i < 100 && !blob; i++) await new Promise(r => setTimeout(r, 10));
    if (!blob) throw new Error('indirme yakalanamadı');
    return (blob as Blob).arrayBuffer();
}

const asFile = (buf: ArrayBuffer, name = 'x.xlsx') => new File([buf], name);

async function workbookFromRows(riskRows: unknown[][], controlRows?: unknown[][]) {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const r = wb.addWorksheet('Risk');
    riskRows.forEach(x => r.addRow(x));
    if (controlRows) { const c = wb.addWorksheet('Kontrol'); controlRows.forEach(x => c.addRow(x)); }
    return asFile(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

describe('sim-excel — okuma (xlsx/ExcelJS geçişi karakterizasyonu)', () => {
    it('yalnız .xlsx ve 10 MB altı kabul edilir', async () => {
        await expect(readWorkbook(new File(['x'], 'a.xls'))).rejects.toThrow('.xlsx');
        await expect(readWorkbook(new File([new Uint8Array(11 * 1024 * 1024)], 'a.xlsx'))).rejects.toThrow('10 MB');
    });

    it('Risk tablosu: başlık satırı bulunur, değerler tiplenir, hatalar satır numarasıyla raporlanır', async () => {
        const file = await workbookFromRows([
            ['Risk ID', 'Risk Statü', 'Flag for IT', 'Finansal Etki (%30)', 'Olasılık', 'Mutabakat Tarihi', 'Risk Tanımı'],
            ['R-1', 'Aktif', 'Evet', 4, 3, new Date(Date.UTC(2026, 2, 5)), 'Sistem kesintisi'],
            ['R-2', 'Aktif', '', 9, 'abc', null, 'İkinci'],
            [null, null, null, null, null, null, null],
        ]);
        const parsed = parseSheet(await readWorkbook(file), 'Risk');
        expect(parsed.sheetName).toBe('Risk');
        expect(parsed.missingHeaders.length).toBeGreaterThanOrEqual(0);
        expect(parsed.rows).toHaveLength(2);
        expect(parsed.rows[0]).toMatchObject({ riskId: 'R-1', status: 'Aktif', flagForIT: true, finansalEtki: 4, tanim: 'Sistem kesintisi', rowNumber: 2 });
        expect(parsed.rows[1]).toMatchObject({ riskId: 'R-2', rowNumber: 3 });
        expect(parsed.rows[1].flagForIT).toBeUndefined(); // boş hücre satıra yazılmaz (eski davranışla aynı)
        const msgs = parsed.issues.map(i => `${i.row}:${i.message}`);
        expect(msgs.some(m => m.startsWith('3:') && m.includes('Finansal Etki') && m.includes('geçersiz'))).toBe(true);
        expect(msgs.some(m => m.startsWith('3:') && m.includes('Olasılık'))).toBe(true);
    });

    it('tarih hücresi gün olarak okunur (saat dilimi kayması yok)', async () => {
        const file = await workbookFromRows([
            ['Kontrol ID', 'Risk ID', 'Mutabakat Tarihi'],
            ['K-1', 'R-1', new Date(Date.UTC(2026, 2, 5))],
        ]);
        const parsed = parseSheet(await readWorkbook(file), 'Kontrol');
        const d = parsed.rows[0].mutabakatTarihi as string;
        expect(d.slice(0, 10)).toBe('2026-03-05');
    });

    it('yüzde biçimli Ağırlık hücresi (0,35 → %35) 35 olarak okunur; metin "35%" de 35', async () => {
        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Kontrol');
        ws.addRow(['Kontrol ID', 'Risk ID', 'Ağırlık (%)']);
        ws.addRow(['K-1', 'R-1', 0.35]);
        ws.getCell('C2').numFmt = '0%';
        ws.addRow(['K-2', 'R-1', '35%']);
        ws.addRow(['K-3', 'R-1', 40]);
        const file = asFile(await wb.xlsx.writeBuffer() as ArrayBuffer);
        const rows = parseSheet(await readWorkbook(file), 'Kontrol').rows;
        expect(rows.map(r => r.agirlik)).toEqual([35, 35, 40]);
    });

    it('başlık ilk satırda olmayabilir (üstte açıklama satırları); doğru satır numarası korunur', async () => {
        const file = await workbookFromRows([
            ['Rapor başlığı'], [],
            ['Risk ID', 'Risk Tanımı'],
            ['R-9', 'Üçüncü satırdan sonra'],
        ]);
        const parsed = parseSheet(await readWorkbook(file), 'Risk');
        expect(parsed.rows[0]).toMatchObject({ riskId: 'R-9', rowNumber: 4 });
    });

    it('Risk tablosu bulunamazsa açıklayıcı hata', async () => {
        const file = await workbookFromRows([['Başka', 'Şey'], ['a', 'b']]);
        const wb = await readWorkbook(file);
        expect(() => parseSheet(wb, 'Risk')).toThrow('Risk ID');
        expect(() => parseSheet(wb, 'Kontrol')).toThrow('Kontrol ID');
    });
});

describe('sim-excel — yazma → okuma gidiş-dönüş', () => {
    it('boş kontrol şablonu geçerli bir .xlsx üretir; başlıklar ve sayfa adları doğru', async () => {
        const ab = await captureDownload(() => downloadBlankControlTemplate());
        const wb = await readWorkbook(asFile(ab, 'sablon.xlsx'));
        const names = (wb as unknown as { SheetNames?: string[]; worksheets?: { name: string }[] });
        const sheetNames = names.SheetNames ?? names.worksheets!.map(w => w.name);
        expect(sheetNames).toEqual(['Kontrol', 'Geçerli değerler', 'Açıklama']);
        const parsed = parseSheet(wb, 'Kontrol');
        expect(parsed.rows).toHaveLength(0);
        expect(parsed.missingHeaders).toEqual([]);
        expect(CONTROL_COLUMNS.length).toBeGreaterThan(20);
        expect(RISK_COLUMNS.length).toBeGreaterThan(10);
    });
});
