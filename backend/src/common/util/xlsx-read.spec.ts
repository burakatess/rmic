import ExcelJS from 'exceljs';
import { cellText, loadWorkbook, parseCsvObjects, sheetToCsv, sheetToObjects } from './xlsx-read';

async function build(fill: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    fill(wb);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('xlsx-read (ExcelJS) — sunucu tarafı Excel okuma', () => {
    it('sayfaları CSV\'ye çevirir; virgül, tırnak ve satır sonu kaçışlanır; Türkçe karakter korunur', async () => {
        const buf = await build(wb => {
            const a = wb.addWorksheet('Kanıtlar');
            a.addRow(['Kontrol', 'Açıklama']);
            a.addRow(['K-1', 'Şifre, "güçlü" olmalı']);
            a.addRow(['K-2', 'İlk satır\nİkinci satır']);
            wb.addWorksheet('Boş');
        });
        const wb = await loadWorkbook(buf);
        expect(wb.worksheets.map(w => w.name)).toEqual(['Kanıtlar', 'Boş']);
        expect(sheetToCsv(wb.worksheets[0])).toBe('Kontrol,Açıklama\nK-1,"Şifre, ""güçlü"" olmalı"\nK-2,"İlk satır\nİkinci satır"');
        expect(sheetToCsv(wb.worksheets[1])).toBe('');
    });

    it('formül sonucu, tarih, zengin metin ve bağlantı görünen değerle okunur; formül çalıştırılmaz', async () => {
        const buf = await build(wb => {
            const ws = wb.addWorksheet('S');
            ws.addRow(['n', 'f', 'd', 'r', 'l']);
            ws.addRow([2, { formula: 'A2*21', result: 42 }, new Date('2026-03-05T00:00:00Z'), { richText: [{ text: 'a' }, { text: 'b' }] }, { text: 'site', hyperlink: 'https://example.com' }]);
        });
        const ws = (await loadWorkbook(buf)).worksheets[0];
        const [row] = sheetToObjects(ws);
        expect(row).toEqual({ n: '2', f: '42', d: '2026-03-05T00:00:00.000Z', r: 'ab', l: 'site' });
    });

    it('sheetToObjects: boş satırlar atlanır, eksik hücre boş metin olur', async () => {
        const buf = await build(wb => {
            const ws = wb.addWorksheet('S');
            ws.addRow(['ad', 'kod']);
            ws.addRow(['A']);
            ws.addRow([]);
            ws.addRow(['B', 'x']);
        });
        expect(sheetToObjects((await loadWorkbook(buf)).worksheets[0])).toEqual([{ ad: 'A', kod: '' }, { ad: 'B', kod: 'x' }]);
    });

    it('bozuk veya xlsx olmayan içerik hata fırlatır (sessizce boş dönmez)', async () => {
        await expect(loadWorkbook(Buffer.from('bu bir excel değil'))).rejects.toBeDefined();
    });

    it('cellText: null/hata hücresi boş metin', () => {
        expect(cellText(null)).toBe('');
        expect(cellText({ error: '#N/A' } as unknown as ExcelJS.CellValue)).toBe('');
    });

    it('parseCsvObjects: BOM, tırnaklı alan, "" kaçışı, alan içi satır sonu, CRLF, boş satır', () => {
        const csv = '﻿ad,not\r\nA,"x, ""y"""\r\n\r\nB,"a\nb"\r\n';
        expect(parseCsvObjects(csv)).toEqual([{ ad: 'A', not: 'x, "y"' }, { ad: 'B', not: 'a\nb' }]);
        expect(parseCsvObjects('')).toEqual([]);
    });
});
