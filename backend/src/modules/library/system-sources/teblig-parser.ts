// Sistem kaynağı C — SPK "Bilgi Sistemleri Yönetimine İlişkin Usul ve Esaslar Tebliği (VII-128.10)"
// (Resmî Gazete 13.03.2025, sayı 32840) — madde/fıkra bazlı ayrıştırıcı.
//
// Girdi metni İKİ yoldan gelebilir; ikisi de "her paragraf bir satır" biçimine indirgenir:
//   • Resmî Gazete HTML sayfası → htmlToText (bağımlılıksız; etiketleri atar, entity çözer, satır sonlarını korur)
//   • Yerel PDF (pdftotext -layout) → pdfLayoutToParagraphText (yazdırma başlık/altbilgisini atar, girinti
//     ile paragraf başlangıcını (ilk satır ~22-24 sütun, devam satırı ~14 sütun) bulup satırları birleştirir)
// Ardından parseTebligText paragraf listesini MADDE / fıkra / bent yapısına ayırır.
//
// Uygulanabilirlik (kapsam) kararı BU KODDA VERİLMEZ: extractScope yalnızca 2. maddenin birebir metnini ve
// kurum satırlarını döndürür; scopeNote ile "doğrudan uygulanabilirlik ayrıca doğrulanmalı" uyarısı eşlik eder.
//
// CLI:
//   npx ts-node -P tsconfig.json src/modules/library/system-sources/teblig-parser.ts --pdf "<dosya.pdf>"
//   ... --html "<kaydedilmiş.html>"      ... --url [adres]   (varsayılan TLS doğrulamasıyla; devre dışı bırakılmaz)

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export const TEBLIG_SOURCE_SLUG = 'spk-bilgi-sistemleri-yonetimi-tebligi-vii-128-10';
export const TEBLIG_ADI = 'Bilgi Sistemleri Yönetimine İlişkin Usul ve Esaslar Tebliği';
export const TEBLIG_NO = 'VII-128.10';
export const TEBLIG_YAYIMLAYAN = 'Sermaye Piyasası Kurulu';
export const TEBLIG_RG_TARIHI = '2025-03-13';
export const TEBLIG_RG_SAYISI = '32840';
export const TEBLIG_KAYNAK_URL = 'https://www.resmigazete.gov.tr/eskiler/2025/03/20250313-8.htm';
export const TEBLIG_VERSION = '2025-03-13';
export const SCOPE_NOTE =
    'İlgili mevzuat hükmünün incelenen kurum veya süreç bakımından doğrudan uygulanabilirliği ayrıca doğrulanmalıdır.';

export interface TebligUnitMetadata {
    tebligAdi: string;
    tebligNo: string;
    resmiGazeteTarihi: string;
    resmiGazeteSayisi: string;
    madde: string; // "2" veya "Geçici 1"
    maddeNo: number;
    gecici: boolean;
    maddeBasligi: string | null;
    bolum: string | null; // "BİRİNCİ BÖLÜM"
    bolumAdi: string | null; // "Başlangıç Hükümleri"
    fikra: number | null; // yalnız fıkra birimlerinde
    fikraSayisi: number;
    bentler: string[];
    yururlukDurumu: 'YURURLUKTE';
    yururlukTarihi: string | null;
    kaynakUrl: string;
}

export interface TebligUnit {
    stableKey: string;
    unitCode: string;
    unitType: 'article' | 'clause';
    title: string;
    originalText: string;
    parentKey: string | null;
    metadata: TebligUnitMetadata;
    contentHash: string;
}

export interface TebligWarning {
    code: 'UNRECOGNIZED_PARAGRAPH' | 'ORDER' | 'GAP' | 'FIKRA_ORDER' | 'MASTHEAD_MISMATCH' | 'NO_TITLE' | 'NO_ARTICLES';
    message: string;
}

export interface TebligParseResult {
    units: TebligUnit[];
    warnings: TebligWarning[];
    /** Sırayla bulunan madde etiketleri (ör. "1", "2", …, "32", "Geçici 1", "33", "34"). */
    articleOrder: string[];
    masthead: { tarih: string | null; sayi: string | null };
}

const norm = (s: string): string => s.replace(/[ \t\u00a0]+/g, ' ').trim();

export function sha256Short(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

// ────────────────────────────── HTML → metin ──────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„',
    ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', sect: '§', copy: '©', reg: '®', deg: '°',
    laquo: '«', raquo: '»', shy: '',
    Ccedil: 'Ç', ccedil: 'ç', Ouml: 'Ö', ouml: 'ö', Uuml: 'Ü', uuml: 'ü',
    Acirc: 'Â', acirc: 'â', Icirc: 'Î', icirc: 'î', Ucirc: 'Û', ucirc: 'û',
    Scedil: 'Ş', scedil: 'ş', Gbreve: 'Ğ', gbreve: 'ğ', Idot: 'İ', inodot: 'ı',
};

export function decodeHtmlEntities(s: string): string {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (m, g: string) => {
        if (g[0] === '#') {
            const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
            if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
            try {
                return String.fromCodePoint(code);
            } catch {
                return m;
            }
        }
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, g) ? NAMED_ENTITIES[g] : m;
    });
}

/**
 * Bağımlılıksız HTML → düz metin. Paragraf/blok etiketleri satır sonu üretir; script/style/yorum atılır;
 * satır içi boşluklar tek boşluğa indirilir; art arda boş satırlar teke düşürülür.
 */
export function htmlToText(html: string): string {
    let s = html.replace(/\r/g, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<(script|style|noscript|head)\b[\s\S]*?<\/\1\s*>/gi, '');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|tr|li|ul|ol|table|h[1-6]|section|article|header|footer|blockquote|pre|center)\s*>/gi, '\n');
    s = s.replace(/<(p|div|tr|li|h[1-6]|section|article|blockquote|pre|center)\b[^>]*>/gi, '\n');
    s = s.replace(/<\/(td|th)\s*>/gi, ' ');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeHtmlEntities(s);
    const lines = s.split('\n').map((l) => norm(l));
    const out: string[] = [];
    for (const l of lines) {
        if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
        out.push(l);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
}

// ────────────────────────────── PDF (layout) → paragraf metni ──────────────────────────────

const PRINT_HEADER_RE = /^\s*\d{1,2}\s+\p{L}+\s+\d{4}\s+\p{L}+\s+\d{1,2}\.\d{2}\.\d{4}\s+\d{1,2}:\d{2}\s*$/u;
const PRINT_FOOTER_RE = /^\s*(?:https?:\/\/\S*)?\s*Sayfa\s+\d+\s*\/\s*\d+\s*$/;
const URL_ONLY_RE = /^\s*https?:\/\/\S+\s*$/;
const ATTACHMENT_LINK_RE = /^\s*Eki için tıklayınız\s*$/i;

/**
 * pdftotext -layout sayfa metinlerini "her paragraf bir satır" düz metne çevirir.
 * Sayfa başlığı ("13 Mart 2025 PERŞEMBE   23.12.2025 00:12"), altbilgi (site adresi + "Sayfa n / N") ve
 * "Eki için tıklayınız" bağlantı metni atılır. Paragraf başlangıcı: sayfadaki en küçük girintiden ≥4 fazla girinti.
 */
export function pdfLayoutToParagraphText(pageTexts: string[]): string {
    const pageLines = pageTexts.map((page) =>
        page
            .replace(/\r/g, '')
            .split('\n')
            .filter(
                (l) =>
                    l.trim() &&
                    !PRINT_HEADER_RE.test(l) &&
                    !PRINT_FOOTER_RE.test(l) &&
                    !URL_ONLY_RE.test(l) &&
                    !ATTACHMENT_LINK_RE.test(l),
            ),
    );
    // Devam satırı girintisi tüm sayfalarda aynıdır (x konumu sabit); yalnız ilk-satırlardan oluşan bir sayfada
    // sayfa-içi minimum yanıltıcı olacağından taban, TÜM sayfaların en küçük girintisidir.
    const allIndents = pageLines.flat().map((l) => l.length - l.trimStart().length);
    if (!allIndents.length) return '';
    const base = Math.min(...allIndents);
    const paras: string[] = [];
    for (const lines of pageLines) {
        for (const l of lines) {
            const indent = l.length - l.trimStart().length;
            const t = norm(l);
            const centered = indent > base + 30; // ortalı başlıklar (BÖLÜM adları, tebliğ başlığı) — ayrı satır
            const startsPara = indent >= base + 4 || centered;
            if (startsPara || paras.length === 0) paras.push(t);
            else paras[paras.length - 1] += ' ' + t;
        }
    }
    return paras.join('\n');
}

export async function extractTebligPdfText(pdfPath: string): Promise<string> {
    const bin = process.env.PDFTOTEXT_BIN || 'pdftotext';
    const candidates = [bin, '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext', '/usr/bin/pdftotext'];
    let lastErr: unknown;
    for (const b of candidates) {
        try {
            const { stdout } = await execFileAsync(b, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
                maxBuffer: 64 * 1024 * 1024,
                encoding: 'utf8',
            });
            const pages = stdout.split('\f');
            if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
            return pdfLayoutToParagraphText(pages);
        } catch (e) {
            lastErr = e;
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') break;
        }
    }
    throw new Error(`pdftotext çalıştırılamadı (${(lastErr as Error)?.message ?? 'bilinmeyen hata'}).`);
}

// ────────────────────────────── ayrıştırma ──────────────────────────────

const MADDE_RE = /^(GEÇİCİ\s+)?MADDE\s+(\d+)\s*[-–—]\s*(.*)$/u;
const FIKRA_RE = /^\((\d+)\)\s*(.*)$/u;
const BENT_RE = /^([a-zçğıöşü]{1,2})\)\s+(.*)$/u;
const BOLUM_RE = /^(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU)\s+BÖLÜM$/u;
const FOOTER_STOP_RE = /^(Eki için tıklayınız|Resmî Gazete Ana Sayfa|©|Sayfa\s+\d+\s*\/\s*\d+)/i;

const AYLAR: Record<string, string> = {
    ocak: '01', şubat: '02', mart: '03', nisan: '04', mayıs: '05', haziran: '06',
    temmuz: '07', ağustos: '08', eylül: '09', ekim: '10', kasım: '11', aralık: '12',
};

interface ParaKind {
    text: string;
    madde?: { gecici: boolean; no: number; rest: string };
    bolum?: string;
}

interface FikraAcc {
    no: number;
    lines: string[]; // paragraf satırları: ilk satır "(k) …", devamı bent satırları vb.
    bentler: string[];
}

interface MaddeAcc {
    gecici: boolean;
    no: number;
    label: string;
    title: string | null;
    bolum: string | null;
    bolumAdi: string | null;
    fikralar: FikraAcc[];
    headLine: string; // "MADDE n-" öneki dahil ilk satır
}

/** Metin: paragraf başına bir satır (htmlToText ya da pdfLayoutToParagraphText çıktısı). */
export function parseTebligText(text: string, opts: { kaynakUrl?: string } = {}): TebligParseResult {
    const warnings: TebligWarning[] = [];
    const kaynakUrl = opts.kaynakUrl ?? TEBLIG_KAYNAK_URL;
    const paras: ParaKind[] = text
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => norm(l))
        .filter(Boolean)
        .map((t) => {
            const m = t.match(MADDE_RE);
            if (m) return { text: t, madde: { gecici: !!m[1], no: parseInt(m[2], 10), rest: m[3] } };
            if (BOLUM_RE.test(t)) return { text: t, bolum: t };
            return { text: t };
        });

    // Künye (masthead): tarih ve sayı
    const masthead: TebligParseResult['masthead'] = { tarih: null, sayi: null };
    for (const p of paras.slice(0, 40)) {
        const d = p.text.match(/(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/iu);
        if (d && !masthead.tarih) {
            masthead.tarih = `${d[3]}-${AYLAR[d[2].toLocaleLowerCase('tr-TR')]}-${d[1].padStart(2, '0')}`;
        }
        const s = p.text.match(/Sayı\s*:\s*(\d+)/u);
        if (s && !masthead.sayi) masthead.sayi = s[1];
    }
    if (masthead.tarih && masthead.tarih !== TEBLIG_RG_TARIHI) {
        warnings.push({ code: 'MASTHEAD_MISMATCH', message: `Künyedeki tarih ${masthead.tarih}, beklenen ${TEBLIG_RG_TARIHI}.` });
    }
    if (masthead.sayi && masthead.sayi !== TEBLIG_RG_SAYISI) {
        warnings.push({ code: 'MASTHEAD_MISMATCH', message: `Künyedeki sayı ${masthead.sayi}, beklenen ${TEBLIG_RG_SAYISI}.` });
    }

    const maddeler: MaddeAcc[] = [];
    let cur: MaddeAcc | null = null;
    let curBolum: string | null = null;
    let curBolumAdi: string | null = null;
    let pendingBolumAdi = false;
    let bolumAdiIdx = -1;
    let stopped = false;

    for (let i = 0; i < paras.length && !stopped; i++) {
        const p = paras[i];
        if (p.bolum) {
            curBolum = p.bolum;
            curBolumAdi = null;
            pendingBolumAdi = true;
            cur = null;
            continue;
        }
        if (p.madde) {
            // Başlık: hemen önceki paragraf (BÖLÜM satırı, bölüm adı, madde/fıkra/bent satırı olmayan; kısa ve noktalamasız)
            let title: string | null = null;
            const prev = i > 0 ? paras[i - 1] : null;
            if (
                prev &&
                i - 1 !== bolumAdiIdx &&
                !prev.madde &&
                !prev.bolum &&
                !FIKRA_RE.test(prev.text) &&
                !BENT_RE.test(prev.text) &&
                prev.text.length <= 120 &&
                !/[.;:,]$/.test(prev.text)
            ) {
                title = prev.text;
            }
            const fm = p.madde.rest.match(FIKRA_RE);
            const first: FikraAcc = fm
                ? { no: parseInt(fm[1], 10), lines: [`(${fm[1]}) ${fm[2]}`.trim()], bentler: [] }
                : { no: 1, lines: [p.madde.rest], bentler: [] };
            const label = p.madde.gecici ? `Geçici ${p.madde.no}` : String(p.madde.no);
            cur = {
                gecici: p.madde.gecici,
                no: p.madde.no,
                label,
                title,
                bolum: curBolum,
                bolumAdi: curBolumAdi,
                fikralar: [first],
                headLine: `${p.madde.gecici ? 'GEÇİCİ ' : ''}MADDE ${p.madde.no}-`,
            };
            maddeler.push(cur);
            pendingBolumAdi = false;
            continue;
        }
        // Bölüm adı: BÖLÜM satırından hemen sonraki paragraf
        if (pendingBolumAdi && curBolumAdi === null) {
            curBolumAdi = p.text;
            bolumAdiIdx = i;
            pendingBolumAdi = false;
            continue;
        }
        if (!cur) continue; // ilk maddeden önceki künye/başlık satırları
        if (FOOTER_STOP_RE.test(p.text)) {
            stopped = true;
            continue;
        }
        // Sonraki paragraf MADDE ise bu paragraf madde başlığıdır (başlık madde satırı işlenirken alınır).
        const next = paras[i + 1];
        if (next && next.madde && !FIKRA_RE.test(p.text) && !BENT_RE.test(p.text)) continue;

        const fk = p.text.match(FIKRA_RE);
        if (fk) {
            cur.fikralar.push({ no: parseInt(fk[1], 10), lines: [p.text], bentler: [] });
            continue;
        }
        const last = cur.fikralar[cur.fikralar.length - 1];
        if (BENT_RE.test(p.text)) {
            last.lines.push(p.text);
            last.bentler.push(p.text);
            continue;
        }
        // Devam paragrafı ("ifade eder." gibi): bir önceki paragraf cümle bitirmemişse (, ; :) ya da küçük harfle başlıyorsa
        const prevLine = last.lines[last.lines.length - 1];
        if (/[,;:]$/.test(prevLine) || /^\p{Ll}/u.test(p.text)) {
            last.lines.push(p.text);
            continue;
        }
        warnings.push({
            code: 'UNRECOGNIZED_PARAGRAPH',
            message: `Tanınmayan paragraf (madde ${cur.label} sonrası) yok sayıldı: "${p.text.slice(0, 80)}"`,
        });
    }

    // Sıra ve boşluk kontrolü (Geçici maddeler ayrı sayaç)
    const articleOrder = maddeler.map((m) => m.label);
    let lastNormal = 0;
    for (const m of maddeler) {
        if (m.gecici) continue;
        if (m.no !== lastNormal + 1) {
            warnings.push({
                code: m.no <= lastNormal ? 'ORDER' : 'GAP',
                message: `Madde sırası bozuk: ${lastNormal} sonrası ${m.no} bulundu.`,
            });
        }
        lastNormal = m.no;
    }
    for (const m of maddeler) {
        m.fikralar.forEach((f, idx) => {
            if (f.no !== idx + 1) {
                warnings.push({ code: 'FIKRA_ORDER', message: `Madde ${m.label}: ${idx + 1}. fıkra yerine (${f.no}) bulundu.` });
            }
        });
    }
    if (!maddeler.length) warnings.push({ code: 'NO_ARTICLES', message: 'Metinde hiç MADDE bulunamadı.' });

    // Yürürlük tarihi (33. maddeden): "… 30/6/2025 tarihinde yürürlüğe girer."
    let yururlukTarihi: string | null = null;
    const yur = maddeler.find((m) => !m.gecici && /yürürlüğe girer/i.test(m.fikralar.map((f) => f.lines.join(' ')).join(' ')));
    if (yur) {
        const dm = yur.fikralar.map((f) => f.lines.join(' ')).join(' ').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dm) yururlukTarihi = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    }

    // Birimleri üret
    const units: TebligUnit[] = [];
    for (const m of maddeler) {
        const key = m.gecici ? `md.g${m.no}` : `md.${m.no}`;
        const fullLines = m.fikralar.map((f, idx) => (idx === 0 ? `${m.headLine} ${f.lines[0]}`.trim() : f.lines[0]));
        const merged: string[] = [];
        m.fikralar.forEach((f, idx) => {
            merged.push(idx === 0 ? fullLines[0] : f.lines[0], ...f.lines.slice(1));
        });
        const originalText = merged.join('\n');
        const allBentler = m.fikralar.flatMap((f) => f.bentler);
        const baseMeta = {
            tebligAdi: TEBLIG_ADI,
            tebligNo: TEBLIG_NO,
            resmiGazeteTarihi: TEBLIG_RG_TARIHI,
            resmiGazeteSayisi: TEBLIG_RG_SAYISI,
            madde: m.label,
            maddeNo: m.no,
            gecici: m.gecici,
            maddeBasligi: m.title,
            bolum: m.bolum,
            bolumAdi: m.bolumAdi,
            fikraSayisi: m.fikralar.length,
            yururlukDurumu: 'YURURLUKTE' as const,
            yururlukTarihi,
            kaynakUrl,
        };
        if (!m.title) warnings.push({ code: 'NO_TITLE', message: `Madde ${m.label}: başlık bulunamadı.` });
        const parent: TebligUnit = {
            stableKey: key,
            unitCode: key,
            unitType: 'article',
            title: m.title ?? `Madde ${m.label}`,
            originalText,
            parentKey: null,
            metadata: { ...baseMeta, fikra: null, bentler: allBentler },
            contentHash: '',
        };
        parent.contentHash = sha256Short(JSON.stringify([parent.stableKey, parent.title, parent.originalText]));
        units.push(parent);
        if (m.fikralar.length > 1) {
            for (const f of m.fikralar) {
                const ck = `${key}.f${f.no}`;
                const child: TebligUnit = {
                    stableKey: ck,
                    unitCode: `${key}(${f.no})`,
                    unitType: 'clause',
                    title: `${parent.title} — ${f.no}. fıkra`,
                    originalText: f.lines.join('\n'),
                    parentKey: key,
                    metadata: { ...baseMeta, fikra: f.no, bentler: f.bentler },
                    contentHash: '',
                };
                child.contentHash = sha256Short(JSON.stringify([child.stableKey, child.title, child.originalText]));
                units.push(child);
            }
        }
    }
    return { units, warnings, articleOrder, masthead };
}

// ────────────────────────────── kapsam (madde 2) ──────────────────────────────

export interface TebligScope {
    /** 2. maddenin birebir metni (fıkra/bent satır yapısıyla). */
    verbatimArticle2: string;
    fikralar: { no: number; text: string }[];
    /** Kurum satırları (1. fıkra bentleri) — yalnız listeleme; uygulanabilirlik kararı VERİLMEZ. */
    institutionLines: { bent: string; text: string }[];
    note: string;
}

/**
 * Tebliğin 2. maddesini (Kapsam) birebir ve yapısal olarak döndürür. Uygulama, bir kurumun kapsamda olup olmadığına
 * KENDİSİ karar vermez; bu çıktı yalnızca insan doğrulaması için sunulur (scope.status = 'UNVERIFIED').
 */
export function extractScope(text: string): TebligScope | null {
    const r = parseTebligText(text);
    const art = r.units.find((u) => u.stableKey === 'md.2');
    if (!art) return null;
    const fikralar = r.units
        .filter((u) => u.parentKey === 'md.2')
        .map((u) => ({ no: u.metadata.fikra as number, text: u.originalText }));
    const institutionLines = art.originalText
        .split('\n')
        .map((l) => l.match(BENT_RE))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => ({ bent: m[1], text: m[2] }));
    return { verbatimArticle2: art.originalText, fikralar, institutionLines, note: SCOPE_NOTE };
}

// ────────────────────────────── kaynak yükleme (CLI) ──────────────────────────────

export function tlsHelpMessage(url: string, err: unknown): string {
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    const code = cause?.code ?? (err as { code?: string })?.code ?? '';
    const tlsCodes = [
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_UNTRUSTED',
    ];
    if (tlsCodes.includes(code) || /certificate|SSL|TLS/i.test(cause?.message ?? '')) {
        return (
            `"${url}" adresine güvenli bağlantı kurulamadı: sunucu sertifikası doğrulanamadı (${code || 'TLS hatası'}).\n` +
            `Güvenlik gereği TLS doğrulaması KAPATILMAZ. Seçenekler:\n` +
            `  1) Kurumunuzun/sitenin kök-ara sertifikasını bir .pem dosyasına koyup NODE_EXTRA_CA_CERTS=/yol/sertifika.pem ile yeniden çalıştırın.\n` +
            `  2) Sayfayı tarayıcıdan "Farklı kaydet" ile HTML olarak kaydedip --html <dosya> verin.\n` +
            `  3) Yerel PDF kopyasını --pdf <dosya> ile verin.`
        );
    }
    return `"${url}" adresi alınamadı: ${(err as Error)?.message ?? String(err)}${code ? ` (${code})` : ''}. --html veya --pdf ile yerel dosya kullanabilirsiniz.`;
}

export async function fetchTebligHtml(url: string): Promise<string> {
    try {
        const res = await fetch(url); // varsayılan TLS doğrulaması — kapatılmaz
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') ?? '';
        const declared = (ct.match(/charset=([\w-]+)/i)?.[1] ?? buf.toString('latin1').match(/charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase();
        let out = new TextDecoder(declared === 'utf8' ? 'utf-8' : declared, { fatal: false }).decode(buf);
        if (out.includes('�') && declared === 'utf-8') out = new TextDecoder('windows-1254').decode(buf);
        return out;
    } catch (e) {
        throw new Error(tlsHelpMessage(url, e));
    }
}

/** Girdi kaynağını (--pdf / --html / --url) paragraf metnine çevirir. */
export async function loadTebligText(src: { pdf?: string; html?: string; url?: string }): Promise<{ text: string; kaynak: string; checksum: string; sourceBytes: number }> {
    if (src.pdf) {
        const bytes = fs.readFileSync(src.pdf);
        return { text: await extractTebligPdfText(src.pdf), kaynak: `pdf:${src.pdf}`, checksum: createHash('sha256').update(bytes).digest('hex'), sourceBytes: bytes.length };
    }
    if (src.html) {
        const bytes = fs.readFileSync(src.html);
        return { text: htmlToText(bytes.toString('utf8')), kaynak: `html:${src.html}`, checksum: createHash('sha256').update(bytes).digest('hex'), sourceBytes: bytes.length };
    }
    if (src.url) {
        const html = await fetchTebligHtml(src.url);
        const bytes = Buffer.from(html, 'utf8');
        return { text: htmlToText(html), kaynak: `url:${src.url}`, checksum: createHash('sha256').update(bytes).digest('hex'), sourceBytes: bytes.length };
    }
    throw new Error('Tebliğ kaynağı verilmedi: --pdf <dosya>, --html <dosya> veya --url gerekli.');
}

// ────────────────────────────── CLI ──────────────────────────────

async function cli(): Promise<void> {
    const args = process.argv.slice(2);
    const val = (k: string): string | undefined => {
        const i = args.indexOf(k);
        if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
        const eq = args.find((a) => a.startsWith(`${k}=`));
        return eq ? eq.slice(k.length + 1) : undefined;
    };
    const src = {
        pdf: val('--pdf'),
        html: val('--html'),
        url: args.includes('--url') ? (val('--url') ?? TEBLIG_KAYNAK_URL) : undefined,
    };
    try {
        const { text, kaynak } = await loadTebligText(src);
        const r = parseTebligText(text, { kaynakUrl: src.url ?? TEBLIG_KAYNAK_URL });
        const articles = r.units.filter((u) => u.unitType === 'article');
        console.log(`Kaynak: ${kaynak}`);
        console.log(`Künye: tarih=${r.masthead.tarih} sayı=${r.masthead.sayi}`);
        console.log(`Madde sayısı: ${articles.length} | toplam birim (madde+fıkra): ${r.units.length}`);
        console.log(`Sıra: ${r.articleOrder.join(', ')}`);
        console.log(`Uyarılar: ${r.warnings.length}`);
        for (const w of r.warnings) console.log(`  - [${w.code}] ${w.message}`);
        const sc = extractScope(text);
        if (sc) {
            console.log(`\n2. madde kurum satırları (${sc.institutionLines.length}):`);
            for (const l of sc.institutionLines) console.log(`  ${l.bent}) ${l.text}`);
            console.log(`Not: ${sc.note}`);
        }
        if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }
}

if (require.main === module) {
    void cli();
}
