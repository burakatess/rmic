import { read, utils, writeFile, SSF, type WorkBook, type WorkSheet } from 'xlsx';

/*
 * Risk simülasyonu ↔ GRC Excel tabloları. Excel dosyaları TARAYICIDA okunur/yazılır; sunucuya
 * yalnız alan adlarına eşlenmiş, temizlenmiş satırlar gider (sunucu xlsx ayrıştırmaz).
 * Kolon sırası GRC dışa aktarımıyla aynıdır; simülasyon girdileri için GRC'de olmayan dört ek
 * kolon (Onaylı, KTS, Ağırlık, Etki Alanı) Kontrol tablosunun sonuna eklenir.
 */

export type ColKind = 'input' | 'computed' | 'record';
export type ColType = 'text' | 'longtext' | 'int' | 'num' | 'bool' | 'date' | 'percent';
export interface SimCol { header: string; key: string | null; kind: ColKind; type: ColType; help: string }

const c = (header: string, key: string | null, kind: ColKind, type: ColType, help: string): SimCol => ({ header, key, kind, type, help });
const IMPACT_HELP = '1–5 arası tam sayı. Boş veya N/A: boyut bilinmiyor (etki hesaplanmaz).';

export const RISK_COLUMNS: SimCol[] = [
    c('Risk ID', 'riskId', 'input', 'text', 'Zorunlu, tekil. Kontrol tablosundaki Risk ID ile eşleşir.'),
    c('Kayıt ID', 'kayitId', 'record', 'text', 'GRC kayıt numarası (bilgi).'),
    c('Risk Statü', 'status', 'input', 'text', '"İptal" statüsündeki riskler simülasyona alınmaz.'),
    c('İlgili GMY', 'ilgiliGmy', 'record', 'text', 'Bilgi.'),
    c('Risk Sahibi', 'riskSahibi', 'record', 'text', 'Bilgi.'),
    c('Süreç', 'surec', 'input', 'text', 'Süreç filtresinde kullanılır.'),
    c('Alt Süreç', 'altSurec', 'input', 'text', 'Bilgi.'),
    c('Risk Tanımı', 'tanim', 'input', 'longtext', 'Risk tanımı.'),
    c('Flag for IT', 'flagForIT', 'input', 'bool', '1 / Evet: BT etkisi (Gizlilik, Bütünlük, Erişilebilirlik) kullanılır. Boş: İş etkisi.'),
    c('Finansal Etki (%30)', 'finansalEtki', 'input', 'int', IMPACT_HELP),
    c('İtibar Etkisi (%30)', 'itibarEtkisi', 'input', 'int', IMPACT_HELP),
    c('Regülasyon Etkisi (%20)', 'regulasyonEtkisi', 'input', 'int', IMPACT_HELP),
    c('Müşteri Etkisi (%20)', 'musteriEtkisi', 'input', 'int', IMPACT_HELP),
    c('Gizlilik Etkisi (%35)', 'gizlilikEtkisi', 'input', 'int', IMPACT_HELP),
    c('Bütünlük Etkisi (%30)', 'butunlukEtkisi', 'input', 'int', IMPACT_HELP),
    c('Erişilebilirlik Etkisi (%35)', 'erisilebilirlikEtkisi', 'input', 'int', IMPACT_HELP),
    c('Etki', 'etki', 'computed', 'int', 'Ağırlıklı etki, yarım yukarı yuvarlanır (hesaplanır).'),
    c('Olasılık', 'olasilik', 'input', 'int', 'Zorunlu, 1–5 arası tam sayı.'),
    c('Doğal Risk Puanı', 'dogalRiskPuani', 'computed', 'num', 'Etki × olasılık (hesaplanır). Yüklemede kayıtlı değer olarak saklanır; sapma karşılaştırması için.'),
    c('Doğal Risk Skoru', 'dogalRiskSkoru', 'computed', 'int', 'Seviye kademesi 1–5 (hesaplanır).'),
    c('Doğal Risk Seviyesi', 'dogalRiskSeviyesi', 'computed', 'text', 'Hesaplanır. Yüklemede kayıtlı değer olarak saklanır.'),
    c('Bütünleşik Kontrol Puanı', 'bkpPuani', 'computed', 'num', 'Σ (kontrol etkinlik puanı × ağırlık), 0–100 (hesaplanır).'),
    c('Bütünleşik Kontrol Skoru', null, 'computed', 'text', 'Uygulama metodolojisinde karşılığı yok; boş bırakılır.'),
    c('Bütünleşik Kontrol Seviyesi', 'bkpSeviyesi', 'computed', 'text', 'Çok Zayıf … Çok Güçlü (hesaplanır).'),
    c('Kalıntı Risk Puanı', 'kalintiRiskPuani', 'computed', 'num', 'Kademe düşürme sonrası olasılık × etki (hesaplanır). Yüklemede kayıtlı değer olarak saklanır.'),
    c('Kalıntı Risk Skoru', 'kalintiRiskSkoru', 'computed', 'int', 'Seviye kademesi 1–5 (hesaplanır).'),
    c('Kalıntı Risk Seviyesi', 'kalintiRiskSeviyesi', 'computed', 'text', 'Hesaplanır. Yüklemede kayıtlı değer olarak saklanır.'),
    c('Risk İşleme', 'riskIsleme', 'record', 'text', 'Bilgi.'),
    c('Mutabakat Tarihi', 'mutabakatTarihi', 'record', 'date', 'Tarih (bilgi).'),
    c('Oluşturma Tarihi', 'olusturmaTarihi', 'record', 'date', 'Tarih (bilgi).'),
    c('Güncelleme', 'guncelleme', 'record', 'date', 'Tarih (bilgi).'),
    c('Risk Sorumlusu', 'riskSorumlusu', 'record', 'text', 'Bilgi.'),
    c('Özet', 'ozet', 'record', 'longtext', 'Bilgi.'),
];

export const P_TEXTS: Record<'kontrolTuru' | 'kontrolIslevi' | 'isletimSekli' | 'isletimDenetimi' | 'isletimRaporlama', { param: string; options: [string, number][] }> = {
    kontrolTuru: { param: 'P1', options: [['Manuel', 0.5], ['BT Manuel', 1], ['Otomatik', 1.5]] },
    kontrolIslevi: { param: 'P2', options: [['Tespit Edici', 0.5], ['Düzeltici', 1], ['Önleyici', 1.5]] },
    isletimSekli: { param: 'P3', options: [['Kontrolün iz kaydı yoktur.', 0], ['Kullanıcı adı / parola / ses kaydı / ortak alan / e-mail', 0.5], ['Sistem logları veya ıslak imza ile kayıt altında', 1], ['Elektronik imza ile gerçekleştiriliyor', 1.5]] },
    isletimDenetimi: { param: 'P4', options: [['Bulunmamaktadır.', 0], ['Aynı ekipteki çalışanlarca kontrol', 0.5], ['Farklı ekiplerdeki çalışanlarca kontrol', 1], ['Her ikisi de yapılmaktadır.', 1.5]] },
    isletimRaporlama: { param: 'P5', options: [['Bulunmamaktadır.', 0], ['Düzensiz aralıklarla üst amirlere', 0.5], ['Düzenli aralıklarla üst amirlere', 1], ['Farklı birimlere (RKD/BGD vb.) + gözetim', 1.5]] },
};
export const IMPACT_AREA_TEXTS = ['Olasılık ve etki', 'Yalnız olasılık', 'Yalnız etki'];
const pHelp = (k: keyof typeof P_TEXTS) => `${P_TEXTS[k].param}: "Geçerli değerler" sayfasındaki metinlerden biri. Tanınmayan metin en düşük seçeneği alır ve raporlanır.`;

export const CONTROL_COLUMNS: SimCol[] = [
    c('Kontrol ID', 'kontrolId', 'input', 'text', 'Zorunlu. Aynı risk için tekil.'),
    c('Kayıt ID', 'kayitId', 'record', 'text', 'GRC kayıt numarası (bilgi).'),
    c('Kontrol Statü', 'status', 'input', 'text', 'İptal / Pasif / Kapalı: hesaba katılmaz ("Onaylı" kolonu doluysa o geçerlidir).'),
    c('Risk ID', 'riskId', 'input', 'text', 'Zorunlu. Risk tablosundaki bir Risk ID olmalı.'),
    c('İlgili GMY', 'ilgiliGmy', 'record', 'text', 'Riskten gelir (yüklemede okunmaz).'),
    c('Risk Sahibi', 'riskSahibi', 'record', 'text', 'Riskten gelir (yüklemede okunmaz).'),
    c('Süreç', 'surec', 'record', 'text', 'Riskten gelir (yüklemede okunmaz).'),
    c('Alt Süreç', 'altSurec', 'record', 'text', 'Riskten gelir (yüklemede okunmaz).'),
    c('Risk Tanımı', 'riskTanimi', 'record', 'longtext', 'Riskten gelir (yüklemede okunmaz).'),
    c('Kontrol Tanımı', 'tanim', 'input', 'longtext', 'Kontrol tanımı.'),
    c('Kontrol Türü', 'kontrolTuru', 'input', 'text', pHelp('kontrolTuru')),
    c('Kontrol İşlevi', 'kontrolIslevi', 'input', 'text', pHelp('kontrolIslevi')),
    c('Kontrolün İşletilme Şekli', 'isletimSekli', 'input', 'text', pHelp('isletimSekli')),
    c('Kontrol İşletimin Denetimi', 'isletimDenetimi', 'input', 'text', pHelp('isletimDenetimi')),
    c('Kontrol İşletiminin Raporlanması', 'isletimRaporlama', 'input', 'text', pHelp('isletimRaporlama')),
    c('1. Seviye Kontrol Sıklığı', 'siklik', 'record', 'text', 'Bilgi.'),
    c('Kontrol Puanı', 'kontrolPuani', 'computed', 'num', 'P1+…+P5, en fazla 7,5 (hesaplanır).'),
    c('Kontrol Skoru', 'kontrolSkoru', 'computed', 'num', 'Kontrol etkinlik puanı: (Kontrol Puanı / 7,5 × 100) × 0,4 + KTS × 0,6 (hesaplanır; KTS boşsa boş).'),
    c('Bütünleşik Kontrol Puanı', 'bkpPuani', 'computed', 'num', 'Riskin bütünleşik kontrol puanı (hesaplanır).'),
    c('Bütünleşik Kontrol Skoru', null, 'computed', 'text', 'Uygulama metodolojisinde karşılığı yok; boş bırakılır.'),
    c('Bütünleşik Kontrol Seviyesi', 'bkpSeviyesi', 'computed', 'text', 'Hesaplanır.'),
    c('Mutabakat Tarihi', 'mutabakatTarihi', 'record', 'date', 'Tarih (bilgi).'),
    c('Oluşturma Tarihi', 'olusturmaTarihi', 'record', 'date', 'Tarih (bilgi).'),
    c('Güncelleme', 'guncelleme', 'record', 'date', 'Tarih (bilgi).'),
    c('Risk Sorumlusu', 'riskSorumlusu', 'record', 'text', 'Bilgi.'),
    c('Özet', 'ozet', 'record', 'longtext', 'Bilgi.'),
    c('Custom field (Last Comment(SR))', 'lastComment', 'record', 'longtext', 'Bilgi.'),
    c('Outward issue link (Risk-Kontrol)', 'outwardLink', 'record', 'text', 'Bilgi.'),
    // ── Ek kolonlar (GRC'de yok) ──
    c('Onaylı', 'onayli', 'input', 'bool', 'Ek kolon. 1 / Evet: hesaba katılır, 0 / Hayır: katılmaz. Boşsa Kontrol Statü belirler.'),
    c('KTS (0-100)', 'kts', 'input', 'num', 'Ek kolon. Kontrol test sonucu 0–100. Boş: bilinmiyor (kalıntı risk hesaplanmaz).'),
    c('Ağırlık (%)', 'agirlik', 'input', 'percent', 'Ek kolon. Riskin kontrolleri içindeki pay, 0–100. Riskin hiçbir kontrolünde dolu değilse onaylı kontroller arasında eşit paylaştırılır.'),
    c('Etki Alanı', 'etkiAlani', 'input', 'text', 'Ek kolon. "Olasılık ve etki", "Yalnız olasılık" veya "Yalnız etki". Boş: Olasılık ve etki.'),
];

// ─── Okuma ──────────────────────────────────────────────────────────────────

export interface ParseIssue { sheet: 'Risk' | 'Kontrol'; row: number | null; id: string | null; message: string }
export interface ParsedSheet { rows: Record<string, unknown>[]; issues: ParseIssue[]; sheetName: string; missingHeaders: string[] }

const MAX_FILE = 10 * 1024 * 1024;
const MAX_LEN: Record<string, number> = { riskId: 100, kontrolId: 100, dogalRiskSeviyesi: 50, kalintiRiskSeviyesi: 50, etkiAlani: 50 };
const normHeader = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const stripParen = (s: string) => s.replace(/\s*\(.*\)\s*$/, '');

function headerIndex(cols: SimCol[]) {
    const m = new Map<string, SimCol>();
    for (const col of cols) {
        if (!col.key) continue;
        m.set(normHeader(col.header), col);
        const short = normHeader(stripParen(col.header));
        if (!m.has(short)) m.set(short, col);
    }
    return m;
}

export async function readWorkbook(file: File): Promise<WorkBook> {
    if (file.size > MAX_FILE) throw new Error('Dosya 10 MB sınırını aşıyor.');
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Yalnız .xlsx dosyası yüklenebilir.');
    return read(await file.arrayBuffer(), { type: 'array', cellDates: true });
}

function toText(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim();
    return s === '' ? null : s;
}
const isNA = (s: string) => ['n/a', 'na', '-', '—', 'yok'].includes(s.toLocaleLowerCase('tr'));
function toNumber(v: unknown): number | null | 'invalid' {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 'invalid';
    const s = toText(v);
    if (s === null || isNA(s)) return null;
    const n = Number(s.replace('%', '').replace(',', '.'));
    return Number.isFinite(n) ? n : 'invalid';
}
function toBool(v: unknown): boolean | null | 'invalid' {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : 'invalid';
    const s = toText(v)?.toLocaleLowerCase('tr').replace(/ı/g, 'i');
    if (!s) return null;
    if (['1', 'evet', 'e', 'x', 'true', 'var', 'onayli', 'yes'].includes(s)) return true;
    if (['0', 'hayir', 'h', 'false', 'yok', 'no', 'onaysiz', 'iptal'].includes(s)) return false;
    return 'invalid';
}
function toIsoDate(v: unknown): string | null | 'invalid' {
    if (v === null || v === undefined || v === '') return null;
    // Tarih kolonları gün olarak saklanır: SheetJS yerel saat dilimi dönüşümünde saniyelik kayma
    // üretebiliyor; yerel takvim günü alınır.
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'invalid' : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString();
    if (typeof v === 'number') {
        const d = SSF.parse_date_code(v);
        return d ? new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S))).toISOString() : 'invalid';
    }
    const s = String(v).trim();
    const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (tr) return new Date(Date.UTC(+tr[3], +tr[2] - 1, +tr[1], +(tr[4] ?? 0), +(tr[5] ?? 0))).toISOString();
    const t = Date.parse(s);
    return Number.isNaN(t) ? 'invalid' : new Date(t).toISOString();
}

/** Çalışma kitabında, belirtilen anahtar başlığı (Risk ID / Kontrol ID) içeren sayfayı bulur. */
function findSheet(wb: WorkBook, kind: 'Risk' | 'Kontrol'): { ws: WorkSheet; name: string; headerRow: number } | null {
    const want = kind === 'Risk' ? 'risk id' : 'kontrol id';
    const avoid = kind === 'Risk' ? 'kontrol id' : null;
    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws['!ref']) continue;
        const range = utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 10); r++) {
            const heads: string[] = [];
            for (let ci = range.s.c; ci <= range.e.c; ci++) {
                const cell = ws[utils.encode_cell({ r, c: ci })];
                if (cell?.v !== undefined) heads.push(normHeader(String(cell.v)));
            }
            if (heads.includes(want) && (!avoid || !heads.includes(avoid))) return { ws, name, headerRow: r };
        }
    }
    return null;
}

export function parseSheet(wb: WorkBook, kind: 'Risk' | 'Kontrol'): ParsedSheet {
    const cols = kind === 'Risk' ? RISK_COLUMNS : CONTROL_COLUMNS;
    const found = findSheet(wb, kind);
    if (!found) throw new Error(kind === 'Risk' ? 'Dosyada "Risk ID" başlıklı bir Risk tablosu bulunamadı.' : 'Dosyada "Kontrol ID" başlıklı bir Kontrol tablosu bulunamadı.');
    const { ws, name, headerRow } = found;
    const range = utils.decode_range(ws['!ref']!);
    const idx = headerIndex(cols);
    const colMap: { ci: number; col: SimCol }[] = [];
    const seenKeys = new Set<string>();
    for (let ci = range.s.c; ci <= range.e.c; ci++) {
        const cell = ws[utils.encode_cell({ r: headerRow, c: ci })];
        if (cell?.v === undefined) continue;
        const h = String(cell.v);
        const col = idx.get(normHeader(h)) ?? idx.get(normHeader(stripParen(h)));
        if (col && !seenKeys.has(col.key!)) { colMap.push({ ci, col }); seenKeys.add(col.key!); }
    }
    const required = cols.filter(col => col.kind === 'input' && col.key);
    const missingHeaders = required.filter(col => !seenKeys.has(col.key!)).map(col => col.header);
    const issues: ParseIssue[] = [];
    const rows: Record<string, unknown>[] = [];
    const idKey = kind === 'Risk' ? 'riskId' : 'kontrolId';

    for (let r = headerRow + 1; r <= range.e.r; r++) {
        const row: Record<string, unknown> = { rowNumber: r + 1 };
        let any = false;
        const rowIssues: string[] = [];
        for (const { ci, col } of colMap) {
            const cell = ws[utils.encode_cell({ r, c: ci })];
            const v = cell?.v;
            if (v === undefined || v === null || v === '') continue;
            any = true;
            const key = col.key!;
            // Yüklemede okunmayan kolonlar: hesaplanan (kayıtlı sonuçlar hariç) ve riskten gelen bilgiler.
            const recordResult = kind === 'Risk' && ['dogalRiskPuani', 'dogalRiskSeviyesi', 'kalintiRiskPuani', 'kalintiRiskSeviyesi'].includes(key);
            if (col.kind === 'computed' && !recordResult) continue;
            if (kind === 'Kontrol' && ['ilgiliGmy', 'riskSahibi', 'surec', 'altSurec', 'riskTanimi'].includes(key)) continue;
            switch (col.type) {
                case 'int': {
                    const n = toNumber(v);
                    if (n === 'invalid' || (n !== null && (!Number.isInteger(n) || n < 1 || n > 5))) { rowIssues.push(`${col.header}: "${toText(v)}" geçersiz (1–5); boş alındı.`); break; }
                    row[key] = n;
                    break;
                }
                case 'num': case 'percent': {
                    let n = toNumber(v);
                    if (n !== 'invalid' && n !== null && col.type === 'percent' && typeof v === 'number' && cell?.z && String(cell.z).includes('%')) n = n * 100;
                    const max = key === 'kts' ? 100 : key === 'agirlik' ? 100 : 25;
                    if (n === 'invalid' || (n !== null && (n < 0 || n > max))) { rowIssues.push(`${col.header}: "${toText(v)}" geçersiz (0–${max}); boş alındı.`); break; }
                    row[key] = n === null ? null : Math.round(n * 10000) / 10000;
                    break;
                }
                case 'bool': {
                    const b = toBool(v);
                    if (b === 'invalid') { rowIssues.push(`${col.header}: "${toText(v)}" tanınmadı; boş alındı.`); break; }
                    row[key] = b;
                    break;
                }
                case 'date': {
                    const d = toIsoDate(v);
                    if (d === 'invalid') { rowIssues.push(`${col.header}: "${toText(v)}" tarih değil; boş alındı.`); break; }
                    row[key] = d;
                    break;
                }
                default: {
                    const s = toText(v);
                    const max = MAX_LEN[key] ?? (col.type === 'longtext' ? 10000 : 300);
                    if (s && s.length > max) { rowIssues.push(`${col.header}: ${max} karakterden uzun; kısaltıldı.`); row[key] = s.slice(0, max); }
                    else row[key] = s;
                }
            }
        }
        if (!any) continue;
        if (kind === 'Risk' && row.flagForIT === null) row.flagForIT = false;
        rows.push(row);
        const id = (row[idKey] as string) ?? null;
        rowIssues.forEach(message => issues.push({ sheet: kind, row: r + 1, id, message }));
    }
    return { rows, issues, sheetName: name, missingHeaders };
}

// ─── Yazma ──────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<ColKind, string> = { input: 'Hesap girdisi', computed: 'Simülasyonla hesaplanır (yüklemede okunmaz)', record: 'GRC kayıt bilgisi' };

function cellValue(col: SimCol, row: Record<string, unknown>): unknown {
    if (!col.key) return null;
    const v = row[col.key];
    if (v === null || v === undefined) return null;
    if (col.type === 'bool') return v ? 1 : (col.key === 'flagForIT' ? null : 0);
    if (col.type === 'date' && typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d; }
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    return v;
}

function dataSheet(cols: SimCol[], rows: Record<string, unknown>[]) {
    const ws = utils.aoa_to_sheet([cols.map(col => col.header), ...rows.map(r => cols.map(col => cellValue(col, r)))], { cellDates: true, dateNF: 'dd"."mm"."yyyy' } /* SheetJS: çıplak nokta saniye kesri sanılır */);
    ws['!cols'] = cols.map(col => ({ wch: col.type === 'longtext' ? 48 : Math.max(12, Math.min(32, col.header.length + 2)) }));
    ws['!autofilter'] = { ref: utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: cols.length - 1 } }) };
    return ws;
}

function helpSheet(cols: SimCol[], title: string, extra: string[]) {
    const aoa: unknown[][] = [[title], [], ...extra.map(l => [l]), [], ['Kolon', 'Tür', 'Nasıl doldurulur']];
    cols.forEach(col => aoa.push([col.header, KIND_LABEL[col.kind], col.help]));
    const ws = utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 34 }, { wch: 40 }, { wch: 100 }];
    return ws;
}

function validValuesSheet() {
    const aoa: unknown[][] = [['Kolon', 'Parametre', 'Geçerli metin', 'Puan']];
    const header = (key: string) => CONTROL_COLUMNS.find(col => col.key === key)!.header;
    for (const [key, def] of Object.entries(P_TEXTS)) def.options.forEach(([text, pts]) => aoa.push([header(key), def.param, text, pts]));
    IMPACT_AREA_TEXTS.forEach(t => aoa.push(['Etki Alanı', '—', t, null]));
    aoa.push(['Onaylı', '—', '1 / Evet', null], ['Onaylı', '—', '0 / Hayır', null]);
    const ws = utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 60 }, { wch: 8 }];
    return ws;
}

const COMMON_HELP = [
    'Metodoloji: uygulamanın simülasyon metodolojisi (P1–P5 → Kontrol Puanı; KTS ile Kontrol Skoru; ağırlıklı Bütünleşik Kontrol Puanı; kademe düşürme ile kalıntı risk).',
    'Hesaplanan kolonlar yüklemede okunmaz; Risk tablosundaki Doğal/Kalıntı Risk Puanı ve Seviyesi "kayıtlı değer" olarak saklanır ve sapma karşılaştırmasında kullanılır.',
    'Boş hücreler kabul edilir. Eksik alanlar simülatörde doldurulabilir.',
];

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);

export function downloadRiskWorkbook(rows: Record<string, unknown>[], baseName: string) {
    const wb = utils.book_new();
    utils.book_append_sheet(wb, dataSheet(RISK_COLUMNS, rows), 'Risk');
    utils.book_append_sheet(wb, helpSheet(RISK_COLUMNS, 'Risk Excel\'i — Açıklama', COMMON_HELP), 'Açıklama');
    writeFile(wb, `${safeName(baseName)}_Risk.xlsx`);
}

export function downloadControlWorkbook(rows: Record<string, unknown>[], baseName: string) {
    const wb = utils.book_new();
    utils.book_append_sheet(wb, dataSheet(CONTROL_COLUMNS, rows), 'Kontrol');
    utils.book_append_sheet(wb, validValuesSheet(), 'Geçerli değerler');
    utils.book_append_sheet(wb, helpSheet(CONTROL_COLUMNS, 'Kontrol Excel\'i — Açıklama', [
        ...COMMON_HELP,
        'Son dört kolon (Onaylı, KTS, Ağırlık, Etki Alanı) GRC dışa aktarımında yoktur; simülasyon girdisidir.',
    ]), 'Açıklama');
    writeFile(wb, `${safeName(baseName)}_Kontrol.xlsx`);
}

export const downloadBlankRiskTemplate = () => downloadRiskWorkbook([], 'Bos_Sablon');
export const downloadBlankControlTemplate = () => downloadControlWorkbook([], 'Bos_Sablon');

// ─── Simülasyon testi raporu ────────────────────────────────────────────────

type Res = { natural: { puan: number; level: string } | null; bkp: { value: number; level: string } | null; residual: { risk: number; level: string | null } | null };
type FieldChange = { field: string; label: string; before: string; after: string };
export interface TestReportData {
    simulation: { simulationId: string; name: string };
    test: { id: string; name: string; status: 'ACTIVE' | 'FINISHED'; startedAt: string; finishedAt: string | null; startedBy?: { firstName: string; lastName: string } | null; finishedBy?: { firstName: string; lastName: string } | null };
    comparedAt: string;
    summary: {
        changedRisks: number; resDown: number; resUp: number; risksAdded: number; risksDeleted: number; ctrlsAdded: number; ctrlsDeleted: number; ctrlsChanged: number;
        distBefore: Record<string, number> & { unknown: number }; distAfter: Record<string, number> & { unknown: number }; methodChanged: boolean;
    };
    risks: {
        scenarioId: string; riskId: string; desc: string | null; status: 'added' | 'deleted' | 'changed'; direction: 'down' | 'up' | 'same' | 'unknown';
        before: Res | null; after: Res | null; changes: FieldChange[];
        controls: { id: string; name: string; status: 'added' | 'deleted' | 'changed'; changes: FieldChange[]; kepBefore: number | null; kepAfter: number | null }[];
    }[];
    log: { entries: { t: string; user: string | null; recordType: string; recordId: string; riskId: string | null; action: string; field: string | null; before: string; after: string }[]; truncated: boolean };
}

const STATUS_TR = { added: 'Eklendi', deleted: 'Silindi', changed: 'Değişti' } as const;
const DIR_TR = { down: 'Kalıntı düştü', up: 'Kalıntı yükseldi', same: 'Kalıntı aynı', unknown: 'Kalıntı bilinmiyor' } as const;
const r2 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const sheet = (aoa: unknown[][], widths: number[]) => { const ws = utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(wch => ({ wch })); return ws; };
const trDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('tr-TR') : '—');

export function downloadTestReport(rep: TestReportData) {
    const s = rep.summary;
    const lv = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük', 'Çok Düşük'];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, sheet([
        ['Risk Simülasyonu — Test raporu'], [],
        ['Simülasyon', `${rep.simulation.simulationId} · ${rep.simulation.name}`],
        ['Test', rep.test.name],
        ['Durum', rep.test.status === 'ACTIVE' ? 'Devam ediyor' : 'Bitirildi'],
        ['Başlangıç', trDate(rep.test.startedAt)],
        [rep.test.status === 'ACTIVE' ? 'Karşılaştırma anı' : 'Bitiş', trDate(rep.test.status === 'ACTIVE' ? rep.comparedAt : rep.test.finishedAt)],
        ['Metodoloji değişti mi', s.methodChanged ? 'Evet' : 'Hayır'], [],
        ['Değişen risk', s.changedRisks], ['Kalıntısı düşen', s.resDown], ['Kalıntısı yükselen', s.resUp],
        ['Eklenen risk', s.risksAdded], ['Silinen risk', s.risksDeleted],
        ['Eklenen kontrol', s.ctrlsAdded], ['Silinen kontrol', s.ctrlsDeleted], ['Değişen kontrol', s.ctrlsChanged], [],
        ['Kalıntı seviyesi', 'Başlangıç', rep.test.status === 'ACTIVE' ? 'Şimdi' : 'Bitiş'],
        ...lv.map(l => [l, s.distBefore[l] ?? 0, s.distAfter[l] ?? 0]),
        ['Hesaplanamayan', s.distBefore.unknown, s.distAfter.unknown],
    ], [28, 40, 16]), 'Özet');

    utils.book_append_sheet(wb, sheet([
        ['Risk ID', 'Risk tanımı', 'Durum', 'Sonuç etkisi',
            'Doğal puan (önce)', 'Doğal seviye (önce)', 'Bütünleşik puan (önce)', 'Bütünleşik seviye (önce)', 'Kalıntı puan (önce)', 'Kalıntı seviye (önce)',
            'Doğal puan (sonra)', 'Doğal seviye (sonra)', 'Bütünleşik puan (sonra)', 'Bütünleşik seviye (sonra)', 'Kalıntı puan (sonra)', 'Kalıntı seviye (sonra)'],
        ...rep.risks.map(r => [r.riskId, r.desc, STATUS_TR[r.status], DIR_TR[r.direction],
            r.before?.natural?.puan ?? null, r.before?.natural?.level ?? null, r2(r.before?.bkp?.value), r.before?.bkp?.level ?? null, r.before?.residual?.risk ?? null, r.before?.residual?.level ?? null,
            r.after?.natural?.puan ?? null, r.after?.natural?.level ?? null, r2(r.after?.bkp?.value), r.after?.bkp?.level ?? null, r.after?.residual?.risk ?? null, r.after?.residual?.level ?? null]),
    ], [12, 48, 10, 18, 10, 12, 12, 14, 10, 12, 10, 12, 12, 14, 10, 12]), 'Risk farkları');

    const fields: unknown[][] = [['Risk ID', 'Risk tanımı', 'Kayıt türü', 'Kontrol ID', 'İşlem', 'Alan', 'Önce', 'Sonra']];
    for (const r of rep.risks) {
        for (const c of r.changes) fields.push([r.riskId, r.desc, 'Risk', null, 'Değişti', c.label, c.before, c.after]);
        for (const c of r.controls) {
            if (c.status !== 'changed') fields.push([r.riskId, r.desc, 'Kontrol', c.name, STATUS_TR[c.status], null, null, null]);
            for (const ch of c.changes) fields.push([r.riskId, r.desc, 'Kontrol', c.name, 'Değişti', ch.label, ch.before, ch.after]);
            if (c.kepBefore !== c.kepAfter) fields.push([r.riskId, r.desc, 'Kontrol', c.name, 'Sonuç', 'Kontrol skoru', r2(c.kepBefore), r2(c.kepAfter)]);
        }
    }
    utils.book_append_sheet(wb, sheet(fields, [12, 40, 10, 14, 10, 26, 40, 40]), 'Alan farkları');

    utils.book_append_sheet(wb, sheet([
        ['Zaman', 'Kullanıcı', 'Kayıt türü', 'Kayıt', 'Risk ID', 'İşlem', 'Alan', 'Önce', 'Sonra'],
        ...rep.log.entries.map(e => [trDate(e.t), e.user, e.recordType, e.recordId, e.riskId, e.action, e.field, e.before, e.after]),
    ], [18, 20, 10, 14, 12, 18, 24, 40, 40]), 'Değişiklik günlüğü');

    writeFile(wb, `${safeName(`${rep.simulation.simulationId}_Test_Raporu_${rep.test.name}`)}.xlsx`);
}
