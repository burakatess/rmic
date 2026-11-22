/**
 * Tarayıcıda Excel okuma/yazma — ExcelJS (SheetJS/xlsx'in bilinen açıkları nedeniyle 2026-11'de
 * değiştirildi). ExcelJS büyük olduğundan YALNIZ kullanıldığı anda dinamik import ile yüklenir.
 * Yalnız .xlsx (OOXML) okunur; eski ikili .xls desteklenmez.
 */
import type { CellValue, Workbook, Worksheet } from 'exceljs';

export type { Workbook, Worksheet };

export async function newWorkbook(): Promise<Workbook> {
    const { Workbook: WB } = await import('exceljs');
    return new WB();
}

export async function readWorkbook(file: File | ArrayBuffer): Promise<Workbook> {
    const wb = await newWorkbook();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    await wb.xlsx.load(buf);
    return wb;
}

/** Hücre değerini düz metne çevirir (tarih → ISO, zengin metin/bağlantı/formül → görünen değer). */
export function cellText(v: CellValue): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
        const o = v as unknown as Record<string, unknown>;
        if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(r => r.text).join('');
        if ('result' in o) return cellText(o.result as CellValue);
        if (typeof o.text === 'string') return o.text;
        return '';
    }
    return String(v);
}

/** İlk satırı başlık kabul ederek satırları nesneye çevirir (boş hücre = ''; tamamen boş satır atlanır). */
export function sheetToObjects(ws: Worksheet): Record<string, string>[] {
    const out: Record<string, string>[] = [];
    let headers: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const width = Math.max(row.cellCount, headers.length);
        const vals: string[] = [];
        for (let c = 1; c <= width; c++) vals.push(cellText(row.getCell(c).value));
        if (rowNumber === 1 || headers.length === 0) { headers = vals.map(h => h.trim()); return; }
        if (vals.every(v => v === '')) return;
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? ''; });
        out.push(obj);
    });
    return out;
}

/** Satır dizisi (aoa) → sayfa. İlk satır başlık ise kalın yazılır. */
export function addAoaSheet(wb: Workbook, name: string, aoa: unknown[][], opts: { widths?: number[]; boldHeader?: boolean; autoFilter?: boolean } = {}): Worksheet {
    const ws = wb.addWorksheet(name.slice(0, 31));
    aoa.forEach(r => ws.addRow(r.map(v => (v === undefined ? null : v)) as CellValue[]));
    if (opts.boldHeader !== false && aoa.length) ws.getRow(1).font = { bold: true };
    if (opts.widths) opts.widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    if (opts.autoFilter && aoa.length && aoa[0].length) {
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(aoa.length, 1), column: aoa[0].length } };
    }
    return ws;
}

/** Nesne dizisi → sayfa (başlıklar ilk nesnenin anahtarlarıdır; boş dizide yalnız boş sayfa). */
export function addObjectSheet(wb: Workbook, name: string, rows: Record<string, unknown>[]): Worksheet {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return addAoaSheet(wb, name, headers.length ? [headers, ...rows.map(r => headers.map(h => r[h]))] : []);
}

/** Çalışma kitabını .xlsx olarak indirir (tarayıcı). */
export async function downloadWorkbook(wb: Workbook, fileName: string): Promise<void> {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
