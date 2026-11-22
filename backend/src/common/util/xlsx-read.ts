import ExcelJS from 'exceljs';

/**
 * Sunucuda .xlsx okuma — ExcelJS (SheetJS/xlsx'in bilinen prototype-pollution ve ReDoS
 * açıkları nedeniyle 2026-11'de değiştirildi). Yalnız OOXML (.xlsx) okunur; eski ikili .xls desteklenmez.
 * Formüller sonuç değeriyle okunur; hiçbir formül/makro çalıştırılmaz.
 */

/** Hücre değerini düz metne çevirir (tarih → ISO, zengin metin/bağlantı/formül → görünen değer). */
export function cellText(v: ExcelJS.CellValue): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
        const o = v as unknown as Record<string, unknown>;
        if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(r => r.text).join('');
        if ('result' in o) return cellText(o.result as ExcelJS.CellValue);
        if (typeof o.text === 'string') return o.text;
        if ('error' in o) return '';
        return '';
    }
    return String(v);
}

export async function loadWorkbook(buf: Buffer | Uint8Array): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    // ExcelJS tipi eski Buffer'ı bekler; Node Buffer'ı olduğu gibi verilir.
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    return wb;
}

/** Sayfayı CSV'ye çevirir (tırnak/virgül/satır sonu kaçışlı). */
export function sheetToCsv(ws: ExcelJS.Worksheet): string {
    const rows: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= row.cellCount; c++) {
            const t = cellText(row.getCell(c).value);
            cells.push(/[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
        }
        rows.push(cells.join(','));
    });
    return rows.join('\n');
}

/** İlk satırı başlık kabul ederek satırları nesneye çevirir (boş hücre = ''). */
export function sheetToObjects(ws: ExcelJS.Worksheet): Record<string, string>[] {
    const out: Record<string, string>[] = [];
    let headers: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const vals: string[] = [];
        for (let c = 1; c <= Math.max(row.cellCount, headers.length); c++) vals.push(cellText(row.getCell(c).value));
        if (rowNumber === 1 || headers.length === 0) { headers = vals.map(h => h.trim()); return; }
        if (vals.every(v => v === '')) return;
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? ''; });
        out.push(obj);
    });
    return out;
}

/**
 * Küçük RFC-4180 CSV ayrıştırıcı (tırnaklı alan, "" kaçışı, alan içi satır sonu, BOM).
 * Başlık satırı anahtar olur; tamamen boş satırlar atlanır.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
    const src = text.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let field = '', row: string[] = [], inQ = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQ) {
            if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
            else field += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(field); field = '';
            rows.push(row); row = [];
        } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows;
    if (!head) return [];
    const headers = head.map(h => h.trim());
    return body
        .filter(r => r.some(v => v !== ''))
        .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']).filter(([h]) => h)));
}
