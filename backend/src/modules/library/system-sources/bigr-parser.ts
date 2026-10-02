// Sistem kaynağı B — T.C. Siber Güvenlik Başkanlığı "Bilgi ve İletişim Güvenliği Rehberi" v1.1
// (01.03.2026) — TEDBİR bazlı birim ayrıştırıcı.
//
// Rehberin gerçek düzeni (pdftotext -layout ile gözlenen):
//   • Her "x.y.z." başlığı altında önce "Tedbirler" tablosu (Tedbir No | Tedbir Seviyesi |
//     Tedbir Adı | Tedbir Tanımı), ardından "Denetim Maddeleri" tablosu (Tedbir No | Tedbir Adı |
//     Denetim Yöntem Önerileri | Denetim Soru Önerileri) gelir. Tablolar sayfa değiştirirse başlık
//     satırı her sayfada tekrarlanır. Tedbir numaraları daima 4 bölümlüdür ("3.1.8.1");
//     "4.4.1" / "5.1.1" gibi 3 bölümlü numaralar TEDBİR GRUBU başlığıdır (tedbir değil).
//   • Hücreler dikeyde ORTALIDIR: numara/seviye/ad satırı, tanım paragraflarının ortasına denk gelir;
//     aynı hücrede birden çok paragraf (boş satırla ayrılmış) olabilir. Bu yüzden satır satır
//     "numara satırından sonraki bloklar" yaklaşımı yanlış olur; sağ sütun blokları, sol küme
//     (numara+ad) merkezine göre en küçük kareler ile satırlara dağıtılır ve belirsiz dağıtım
//     uyarı olarak raporlanır (tahmin edilip sessizce geçilmez).
//   • Bölüm ("3") ve alt bölüm ("3.1") numaraları PDF metin katmanında YOKTUR (görsel/ana hat);
//     adları İÇİNDEKİLER'den, sırayla sayarak türetilir ve x.y.z. başlık numaralarıyla çapraz
//     doğrulanır; tutmazsa uyarı verilir.
//   • Çapraz referanslar: "Bk. Tedbir No: 5.1.1.11", "Bk. Denetim No: …", "Bk. Tedbir Başlık No: 3.1.10",
//     "Bk. Bölüm 4.3".
//
// Saf fonksiyonlar: parseBigrPages / verifyBigrUnits. Yalnız extractPdfPages dış süreç (pdftotext) çağırır.

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const BIGR_SOURCE_SLUG = 'siber-guvenlik-baskanligi-bilgi-ve-iletisim-guvenligi-rehberi';
export const BIGR_TITLE = 'Bilgi ve İletişim Güvenliği Rehberi';
export const BIGR_PUBLISHER = 'T.C. Siber Güvenlik Başkanlığı';
export const BIGR_VERSION = '1.1';
export const BIGR_PUBLISH_DATE = '2026-03-01';
export const BIGR_RUNNING_HEADER = 'BİLGİ VE İLETİŞİM GÜVENLİĞİ REHBERİ';

export interface BigrPage {
    /** PDF sayfa dizini (1 tabanlı; pdftotext -f/-l ile aynı). */
    page: number;
    text: string;
}

export interface BigrCrossRef {
    tur: 'TEDBIR' | 'DENETIM' | 'TEDBIR_BASLIK' | 'BOLUM';
    no: string;
}

export interface BigrUnitMetadata {
    bolumNo: string | null;
    bolumAdi: string | null;
    altBolumNo: string | null;
    altBolumAdi: string | null;
    tedbirBaslikNo: string;
    tedbirBaslikAdi: string | null;
    tedbirNo: string;
    tedbirSeviyesi: number | null;
    denetimSorusu: string | null;
    denetimSorulari: string[];
    denetimSayfasi: number | null;
    /** Denetim satırında basılı numara, tedbir numarasından farklıysa (kaynak belgedeki yazım hatası). */
    denetimBasiliNumara: string | null;
    /** Tanım hücresi yalnızca "Bk. …" çapraz referansından oluşuyor (özgün tanım metni yok). */
    yalnizcaCaprazReferans: boolean;
    caprazReferanslar: string[];
    caprazReferansDetay: BigrCrossRef[];
    dokumanSurumu: string;
    sayfa: number;
    sayfaBasili: number | null;
}

export interface BigrUnit {
    stableKey: string;
    unitCode: string;
    unitType: 'control';
    title: string;
    originalText: string;
    page: number;
    pageEnd: number;
    metadata: BigrUnitMetadata;
    contentHash: string;
}

export type BigrWarningCode =
    | 'MISSING_TITLE'
    | 'MISSING_TEXT'
    | 'MISSING_LEVEL'
    | 'SOURCE_NUMBER_TYPO'
    | 'MISSING_QUESTION'
    | 'QUESTION_IS_CROSSREF'
    | 'TEXT_IS_CROSSREF'
    | 'ORPHAN_QUESTION_ROW'
    | 'DUPLICATE_TEDBIR_ROW'
    | 'AMBIGUOUS_PARAGRAPH_ASSIGNMENT'
    | 'ROW_WITHOUT_TEXT'
    | 'UNASSIGNED_TEXT'
    | 'COLUMN_MISALIGNED'
    | 'CLUSTER_TOUCHING'
    | 'QUESTION_TITLE_MISMATCH'
    | 'TOC_NUMBERING_MISMATCH'
    | 'NO_COLUMN_BOUNDARY'
    | 'GROUP_NAME_MISMATCH';

export interface BigrWarning {
    code: BigrWarningCode;
    message: string;
    page?: number;
    unitCode?: string;
}

export interface BigrParseStats {
    pagesTotal: number;
    tocPages: number;
    tedbirRows: number;
    denetimRows: number;
    tedbirTablePages: number;
    denetimTablePages: number;
    ambiguousBlocks: number;
    unitsWithoutQuestion: number;
}

export interface BigrParseResult {
    units: BigrUnit[];
    warnings: BigrWarning[];
    stats: BigrParseStats;
}

// ────────────────────────────── yardımcılar ──────────────────────────────

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const lower = (s: string): string => s.toLocaleLowerCase('tr-TR');
const TEDBIR_NO_RE = /^\s{0,16}(\d+\.\d+\.\d+\.\d+)(?![\d.])/;
const HEADING_RE = /^\s{0,10}(\d+\.\d+\.\d+)\.\s+(\S.*)$/;
const BK_RE =
    /Bk\.\s*(Tedbir Başlık No|Tedbir No|Denetim No|Bölüm)\s*:?\s*(\d+(?:\.\d+)*(?:\s*(?:,|ve)\s*\d+(?:\.\d+)*)*)/g;

export function sha256Short(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/** Birim içerik özeti — idempotent içe aktarma bununla değişikliği anlar. */
export function computeBigrUnitHash(u: {
    unitCode: string;
    title: string;
    originalText: string;
    metadata: Pick<BigrUnitMetadata, 'tedbirSeviyesi' | 'denetimSorulari' | 'caprazReferanslar' | 'dokumanSurumu'>;
}): string {
    return sha256Short(
        JSON.stringify([
            u.unitCode,
            u.title,
            u.originalText,
            u.metadata.tedbirSeviyesi,
            u.metadata.denetimSorulari,
            u.metadata.caprazReferanslar,
            u.metadata.dokumanSurumu,
        ]),
    );
}

interface PreparedPage {
    page: number;
    lines: string[];
    printedPage: number | null;
    isToc: boolean;
}

/** Çalışan başlığı ve sayfa altbilgisini (yalnız rakam) çıkarır; satır konumlarını korur. */
function preparePage(p: BigrPage): PreparedPage {
    const lines = p.text.replace(/\r/g, '').split('\n');
    let printed: number | null = null;
    for (let i = 0; i < lines.length; i++) {
        if (norm(lines[i]) === BIGR_RUNNING_HEADER) lines[i] = '';
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].trim()) continue;
        if (/^\s*\d{1,3}\s*$/.test(lines[i])) {
            printed = parseInt(lines[i].trim(), 10);
            lines[i] = '';
        }
        break;
    }
    const leaderLines = lines.filter((l) => /(?:\.\s?){6,}\s*\d+\s*$/.test(l)).length;
    const isToc = /İÇİNDEKİLER/.test(p.text) || leaderLines >= 5;
    return { page: p.page, lines, printedPage: printed, isToc };
}

// ────────────────────────────── içindekiler (isimler) ──────────────────────────────

export interface BigrToc {
    bolumAdlari: Record<string, string>;
    altBolumAdlari: Record<string, string>;
    baslikAdlari: Record<string, string>;
}

function isAllUpper(s: string): boolean {
    const letters = s.replace(/[^\p{L}]/gu, '');
    return letters.length > 2 && letters === letters.toLocaleUpperCase('tr-TR');
}

export function parseBigrToc(pages: PreparedPage[], warnings: BigrWarning[]): BigrToc {
    const toc: BigrToc = { bolumAdlari: {}, altBolumAdlari: {}, baslikAdlari: {} };
    let bolum = 0;
    let alt = 0;
    let started = false;
    for (const pg of pages) {
        if (!pg.isToc) continue;
        for (const raw of pg.lines) {
            if (!/(?:\.\s?){4,}\s*\d+\s*$/.test(raw)) continue;
            const text = norm(raw.replace(/(?:\.\s?){4,}\s*\d+\s*$/, ''));
            if (!text) continue;
            const m = text.match(/^(\d+(?:\.\d+){2})\.?\s+(\S.*)$/);
            if (m) {
                toc.baslikAdlari[m[1]] = m[2];
                const [b, a] = m[1].split('.');
                if (started && (Number(b) !== bolum || Number(a) !== alt)) {
                    warnings.push({
                        code: 'TOC_NUMBERING_MISMATCH',
                        message: `İçindekiler'de ${m[1]} başlığı, sayaçla türetilen ${bolum}.${alt} alt bölümüyle uyuşmuyor.`,
                        page: pg.page,
                    });
                }
                continue;
            }
            if (/^\d/.test(text)) continue; // başka numaralı satır (ör. şekil/tablo)
            if (/^(KAYNAKÇA|EKLER|EK-|ŞEKİLLER|TABLOLAR|KISALTMALAR|TANIMLAR)/.test(text)) {
                if (started && /^(KAYNAKÇA|EKLER|EK-)/.test(text)) started = false;
                continue;
            }
            if (isAllUpper(text)) {
                if (!started && !/^GİRİŞ/.test(text)) continue;
                started = true;
                bolum += 1;
                alt = 0;
                toc.bolumAdlari[String(bolum)] = text;
            } else if (started) {
                alt += 1;
                toc.altBolumAdlari[`${bolum}.${alt}`] = text;
            }
        }
    }
    return toc;
}

// ────────────────────────────── tablo bölgesi ──────────────────────────────

type TableMode = 'TEDBIR' | 'DENETIM';

interface SplitLine {
    left: string;
    right: string;
    straddle: boolean;
}

function splitAt(line: string, cut: number): SplitLine {
    const at = (i: number) => (i < 0 || i >= line.length ? ' ' : line[i]);
    let c = cut;
    let straddle = false;
    if (at(c - 1) !== ' ' && at(c) !== ' ') {
        if (at(c - 2) === ' ') c = c - 1;
        else if (at(c + 1) === ' ') c = c + 1;
        else straddle = true;
    }
    return { left: line.slice(0, c), right: line.slice(c), straddle };
}

/**
 * Sağ sütunun (Tedbir Tanımı / Denetim Soru Önerileri) başladığı karakter konumu.
 * pdftotext -layout karakter adımı sayfaya göre değiştiği için (59–73 arası gözlendi) konum,
 * başlık satırının uzunluğundan (tablo genişliği ile orantılı) tahmin edilir ve ±4 pencerede,
 * "solunda en az 2 boşluk bulunan" satır başı sayısı en yüksek olan sütun seçilir.
 */
function detectRightColumn(lines: string[], headerEnd: number, mode: TableMode): number | null {
    const bodies = lines.filter((l) => l.trim());
    if (!bodies.length) return null;
    const prior = Math.round(headerEnd * (mode === 'TEDBIR' ? 0.64 : 0.62));
    let best: number | null = null;
    let bestScore = 0;
    for (let c = prior - 4; c <= prior + 4; c++) {
        let score = 0;
        for (const l of bodies) {
            if (l[c] !== undefined && l[c] !== ' ' && (l[c - 1] ?? ' ') === ' ' && (l[c - 2] ?? ' ') === ' ') score++;
        }
        if (score > bestScore || (score === bestScore && best !== null && Math.abs(c - prior) < Math.abs(best - prior))) {
            best = c;
            bestScore = score;
        }
    }
    return bestScore > 0 ? best : null;
}

const BK_MID_PENALTY = 4;
const BULLET_RE = /^(?:[•·*–-]|\d+[.)]|[a-zçğıöşü][.)])\s/u;

interface RowInfo {
    idx: number; // sayfadaki satır dizini (numara satırı)
    no: string;
    printed: string; // sayfada basılı numara (yazım hatası varsa no'dan farklı)
    level: number | null;
    clusterTop: number;
    clusterBottom: number;
    nameLines: string[];
}

interface Block {
    start: number;
    end: number;
    lines: string[]; // sağ hücre satırları (boşluk normalize)
    isBk: boolean; // "Bk. …" çapraz referans paragrafı
}

interface TableRow {
    no: string;
    printed: string;
    level: number | null;
    name: string;
    blocks: string[][]; // paragraf = satır listesi
    page: number;
    printedPage: number | null;
}

/** Sağ sütun bloklarını (paragraflar) sol küme merkezlerine göre satırlara dağıtır (en küçük kareler DP). */
function assignBlocks(
    blocks: Block[],
    centers: number[],
): { groups: number[]; ambiguous: boolean[]; ok: boolean } {
    const n = centers.length;
    const m = blocks.length;
    if (n === 0 || m < n) return { groups: [], ambiguous: [], ok: false };
    const cost = (a: number, b: number, j: number): number => {
        // "Bk. …" paragrafı çoğunlukla (129 örnekten 127'si) hücrenin son paragrafıdır: ardından başka
        // paragraf gelmesi yumuşak biçimde cezalandırılır (kesin yasak değil; 3.1.12.9 / 3.1.14.12 gibi istisnalar var).
        let penalty = 0;
        for (let t = a; t < b; t++) if (blocks[t].isBk && !blocks[t + 1].isBk) penalty += BK_MID_PENALTY;
        const c = (blocks[a].start + blocks[b].end) / 2;
        return (c - centers[j]) ** 2 + penalty;
    };
    const INF = 1e18;
    // dp[j][i] = ilk i blok, ilk j satır
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
    const cut: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(-1));
    dp[0][0] = 0;
    for (let j = 1; j <= n; j++) {
        for (let i = j; i <= m; i++) {
            for (let k = j - 1; k < i; k++) {
                if (dp[j - 1][k] >= INF) continue;
                const v = dp[j - 1][k] + cost(k, i - 1, j - 1);
                if (v < dp[j][i]) {
                    dp[j][i] = v;
                    cut[j][i] = k;
                }
            }
        }
    }
    // bölme noktaları: groups[j] = j. satırın blok sayısı
    const groups: number[] = new Array<number>(n).fill(0);
    let i = m;
    for (let j = n; j >= 1; j--) {
        const k = cut[j][i];
        groups[j - 1] = i - k;
        i = k;
    }
    // Belirsizlik: her sınırı bir blok kaydırmanın maliyet farkı küçükse belirsiz.
    const total = dp[n][m];
    const ambiguous: boolean[] = new Array<boolean>(n).fill(false);
    const groupCost = (gs: number[]) => {
        let s = 0;
        let p = 0;
        for (let j = 0; j < gs.length; j++) {
            s += cost(p, p + gs[j] - 1, j);
            p += gs[j];
        }
        return s;
    };
    for (let j = 0; j < n - 1; j++) {
        for (const d of [-1, 1]) {
            const gs = groups.slice();
            gs[j] += d;
            gs[j + 1] -= d;
            if (gs[j] < 1 || gs[j + 1] < 1) continue;
            const diff = groupCost(gs) - total;
            if (diff < 3) {
                ambiguous[j] = true;
                ambiguous[j + 1] = true;
            }
        }
    }
    return { groups, ambiguous, ok: true };
}

function isStructuralLine(line: string, names: Set<string>): boolean {
    const t = norm(line);
    if (!t) return false;
    const indent = line.length - line.trimStart().length;
    if (indent <= 10 && /^\d+\.\d+\.\d+\.\s+\S/.test(t)) return true;
    if (t === 'Tedbirler' || t === 'Denetim Maddeleri' || t === 'Amaç') return true;
    if (indent <= 10 && names.has(lower(t))) return true;
    return false;
}

interface TableParseCtx {
    warnings: BigrWarning[];
    stats: BigrParseStats;
    names: Set<string>;
}

/** Bir sayfadaki tek bir tablo bölgesini (başlık satırından sonrası) satırlara ayırır. */
function parseTableRegion(
    pg: PreparedPage,
    mode: TableMode,
    first: number,
    last: number,
    headerEnd: number,
    ctx: TableParseCtx,
): TableRow[] {
    const lines = pg.lines.slice(first, last + 1);
    const cRight = detectRightColumn(lines, headerEnd, mode);
    if (cRight === null) {
        if (lines.some((l) => TEDBIR_NO_RE.test(l))) {
            ctx.warnings.push({
                code: 'NO_COLUMN_BOUNDARY',
                message: `Sayfa ${pg.page}: sağ sütun sınırı belirlenemedi; tablo atlandı.`,
                page: pg.page,
            });
        }
        return [];
    }
    const splits = lines.map((l) => splitAt(l, cRight));
    splits.forEach((s, i) => {
        if (s.straddle) {
            ctx.warnings.push({
                code: 'COLUMN_MISALIGNED',
                message: `Sütun sınırı satırı bölüyor (sayfa ${pg.page}, satır ${first + i + 1}): "${norm(lines[i]).slice(0, 80)}"`,
                page: pg.page,
            });
        }
    });

    // Numara satırları. Kaynak belgedeki tek tük yazım hatası ("4.4.3.8" yerine "4.3.8"): DENETİM tablosunda,
    // önceki satırın ardılı olan numaradan tek bir bölümü eksik yazılmış 3 bölümlü numara, beklenen numara olarak
    // okunur ve SOURCE_NUMBER_TYPO uyarısı verilir (sessizce düzeltilmez).
    interface NumInfo {
        no: string;
        printed: string;
    }
    const numInfo: (NumInfo | null)[] = [];
    let lastNo: string | null = null;
    splits.forEach((sp, i) => {
        const m4 = sp.left.match(TEDBIR_NO_RE);
        if (m4) {
            numInfo[i] = { no: m4[1], printed: m4[1] };
            lastNo = m4[1];
            return;
        }
        numInfo[i] = null;
        const m3 = mode === 'DENETIM' ? sp.left.match(/^\s{0,16}(\d+\.\d+\.\d+)(?![\d.])/) : null;
        if (m3 && lastNo) {
            const lp = lastNo.split('.');
            const expected = [...lp.slice(0, 3), String(parseInt(lp[3], 10) + 1)];
            const cand = m3[1].split('.');
            const dropOne = expected.some((_, k) => expected.filter((__, q) => q !== k).join('.') === cand.join('.'));
            if (dropOne) {
                numInfo[i] = { no: expected.join('.'), printed: m3[1] };
                lastNo = expected.join('.');
                ctx.warnings.push({
                    code: 'SOURCE_NUMBER_TYPO',
                    message: `Sayfa ${pg.page}: denetim satırında "${m3[1]}" yazılmış; önceki satıra (${lp.join('.')}) göre ${expected.join('.')} olarak okundu (kaynak belgedeki numara hatası).`,
                    page: pg.page,
                    unitCode: `BIGR-${expected.join('.')}`,
                });
            }
        }
    });
    const numberIdx: number[] = [];
    numInfo.forEach((n, i) => {
        if (n) numberIdx.push(i);
    });
    if (!numberIdx.length) return [];

    // Sol kümeler: numara satırı olmayan her sol-sütun satırı EN YAKIN numara satırına atanır.
    // (Hücreler dikeyde ortalı olduğundan çok satırlı ad, numaranın üstüne/altına dağılır; pdftotext ad
    // satırları arasında bazen boş satır bırakır — bu yüzden bitişik-satır kümesi yerine en yakın numara.)
    // İki numaraya eşit uzaklıktaki satırlar, ikinci turda en yakın SAHİPLİ komşu satırın satırına verilir.
    const owner = new Map<number, number>(); // satır dizini → row dizini
    const tied: number[] = [];
    splits.forEach((sp, i) => {
        if (!sp.left.trim() || numInfo[i]) return;
        let best = -1;
        let bestD = Infinity;
        let tie = false;
        numberIdx.forEach((ni, r) => {
            const d = Math.abs(ni - i);
            if (d < bestD) {
                bestD = d;
                best = r;
                tie = false;
            } else if (d === bestD) tie = true;
        });
        if (best < 0 || bestD > 6) {
            ctx.warnings.push({
                code: 'UNASSIGNED_TEXT',
                message: `Sayfa ${pg.page}: sol sütun metni hiçbir satıra atanamadı: "${norm(sp.left).slice(0, 60)}"`,
                page: pg.page,
            });
            return;
        }
        if (tie) tied.push(i);
        else owner.set(i, best);
    });
    for (const i of tied) {
        let best = -1;
        let bestD = Infinity;
        for (const [j, r] of owner) {
            const d = Math.abs(j - i);
            if (d < bestD && d <= 2) {
                bestD = d;
                best = r;
            }
        }
        if (best < 0) {
            // komşu ipucu yok: önceki numara satırına ver ve uyar
            best = numberIdx.filter((ni) => ni < i).length - 1;
            ctx.warnings.push({
                code: 'CLUSTER_TOUCHING',
                message: `Sayfa ${pg.page}: "${norm(splits[i].left).slice(0, 60)}" satırı iki numaraya eşit uzaklıkta; ad ayrımı doğrulanmalı.`,
                page: pg.page,
                unitCode: `BIGR-${numInfo[numberIdx[Math.max(0, best)]]!.no}`,
            });
        }
        owner.set(i, Math.max(0, best));
    }
    const rows: RowInfo[] = numberIdx.map((idx, r) => {
        const own = [...owner.entries()].filter(([, rr]) => rr === r).map(([i]) => i);
        const top = Math.min(idx, ...own);
        const bottom = Math.max(idx, ...own);
        const info = numInfo[idx]!;
        let level: number | null = null;
        let rest = splits[idx].left.replace(new RegExp('^\\s*' + info.printed.replace(/\./g, '\\.')), '');
        if (mode === 'TEDBIR') {
            const lm = rest.match(/^\s+([123])(?![\d.])/);
            if (lm) {
                level = parseInt(lm[1], 10);
                rest = rest.replace(/^\s+[123](?![\d.])/, '');
            }
        }
        // Sütun kayması: seviye rakamı numara satırında değil, kümenin başka bir satırında (yalnız başına) olabilir.
        const levelLine = new Set<number>();
        if (mode === 'TEDBIR' && level === null) {
            const found: { i: number; v: number }[] = [];
            for (const i of own) {
                const lm2 = splits[i].left.match(/^\s{4,40}([123])(?:\s{2,}|$)/);
                if (lm2) found.push({ i, v: parseInt(lm2[1], 10) });
            }
            if (found.length === 1) {
                level = found[0].v;
                levelLine.add(found[0].i);
            }
        }
        const nameLines: string[] = [];
        for (let i = top; i <= bottom; i++) {
            if (i !== idx && owner.get(i) !== r) continue;
            let txt = i === idx ? rest : splits[i].left;
            if (levelLine.has(i)) txt = txt.replace(/^\s{4,40}[123]/, '');
            if (norm(txt)) nameLines.push(norm(txt));
        }
        return { idx, no: info.no, printed: info.printed, level, clusterTop: top, clusterBottom: bottom, nameLines };
    });

    // Sağ sütun blokları
    const blocks: Block[] = [];
    let cur: Block | null = null;
    splits.forEach((s, i) => {
        const t = norm(s.right);
        if (!t) {
            if (cur) {
                blocks.push(cur);
                cur = null;
            }
            return;
        }
        if (!cur) cur = { start: i, end: i, lines: [], isBk: false };
        cur.end = i;
        cur.lines.push(t);
    });
    if (cur) blocks.push(cur);
    // pdftotext, sol sütundaki çok satırlı ad/numara yüzünden sağ sütunda paragraf İÇİNDE tek boş satır bırakabilir
    // (bu satırda SOL sütunda metin vardır). Şu koşulların hepsi varsa iki blok aynı paragraftır:
    //  • aralarında tam 1 boş sağ satır var ve o satırda sol sütunda metin var,
    //  • önceki blok cümle sonu (. : ; ? !) ile bitmiyor ve madde imli (•) satır içermiyor,
    //  • sonraki blok madde imi / "Bk." ile başlamıyor.
    for (let k = blocks.length - 1; k > 0; k--) {
        const prev = blocks[k - 1];
        const prevLast = prev.lines[prev.lines.length - 1];
        const gap = blocks[k].start - prev.end - 1;
        if (
            gap === 1 &&
            splits[prev.end + 1].left.trim() !== '' &&
            !/[.:;?!][)"”’']?$/.test(prevLast) &&
            !prev.lines.some((l) => BULLET_RE.test(l)) &&
            !BULLET_RE.test(blocks[k].lines[0]) &&
            !/^Bk\./.test(blocks[k].lines[0])
        ) {
            prev.end = blocks[k].end;
            prev.lines.push(...blocks[k].lines);
            blocks.splice(k, 1);
        }
    }
    for (const b of blocks) b.isBk = /^Bk\.\s/.test(b.lines[0]);
    const merged = blocks;

    const centers = rows.map((r) => (r.clusterTop + r.clusterBottom) / 2);
    const asg = assignBlocks(merged, centers);
    if (!asg.ok) {
        ctx.warnings.push({
            code: 'ROW_WITHOUT_TEXT',
            message: `Sayfa ${pg.page}: ${rows.length} satır için yalnızca ${merged.length} sağ hücre bloğu bulundu (${rows.map((r) => r.no).join(', ')}).`,
            page: pg.page,
        });
        return [];
    }

    const out: TableRow[] = [];
    let p = 0;
    rows.forEach((r, j) => {
        const g = merged.slice(p, p + asg.groups[j]);
        p += asg.groups[j];
        const gCenter = (g[0].start + g[g.length - 1].end) / 2;
        const dev = Math.abs(gCenter - centers[j]);
        if (asg.ambiguous[j] && g.length > 1) ctx.stats.ambiguousBlocks += 1;
        if ((asg.ambiguous[j] && merged.length > rows.length) || dev > 2.5) {
            ctx.warnings.push({
                code: 'AMBIGUOUS_PARAGRAPH_ASSIGNMENT',
                message: `${r.no}: sağ hücre paragraflarının satıra dağılımı belirsiz (merkez sapması ${dev.toFixed(1)} satır, ${g.length} paragraf) — sayfa ${pg.page}.`,
                page: pg.page,
                unitCode: `BIGR-${r.no}`,
            });
        }
        const paras: string[][] = g.map((b) => b.lines);
        out.push({
            no: r.no,
            printed: r.printed,
            level: r.level,
            name: r.nameLines.join(' '),
            blocks: paras,
            page: pg.page,
            printedPage: pg.printedPage,
        });
    });
    return out;
}

// ────────────────────────────── ana ayrıştırıcı ──────────────────────────────

function extractCrossRefs(text: string): { list: string[]; detay: BigrCrossRef[] } {
    const detay: BigrCrossRef[] = [];
    const flat = norm(text);
    for (const m of flat.matchAll(BK_RE)) {
        const tur: BigrCrossRef['tur'] =
            m[1] === 'Tedbir No'
                ? 'TEDBIR'
                : m[1] === 'Denetim No'
                  ? 'DENETIM'
                  : m[1] === 'Tedbir Başlık No'
                    ? 'TEDBIR_BASLIK'
                    : 'BOLUM';
        for (const no of m[2].match(/\d+(?:\.\d+)*/g) ?? []) detay.push({ tur, no });
    }
    const list: string[] = [];
    for (const d of detay) if (!list.includes(d.no)) list.push(d.no);
    return { list, detay };
}

function paragraphsToText(paras: string[][]): string {
    return paras.map((p) => norm(p.join(' '))).join('\n');
}

/** Bir tedbirin başlık kelimeleri, denetim satırının sol kümesinde (ad + yöntem) bulunmalı. */
function titleWordsIn(title: string, cluster: string): boolean {
    const bag = new Set(lower(cluster).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const words = lower(title).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return words.length > 0 && words.every((w) => bag.has(w));
}

export function parseBigrPages(pages: BigrPage[]): BigrParseResult {
    const warnings: BigrWarning[] = [];
    const stats: BigrParseStats = {
        pagesTotal: pages.length,
        tocPages: 0,
        tedbirRows: 0,
        denetimRows: 0,
        tedbirTablePages: 0,
        denetimTablePages: 0,
        ambiguousBlocks: 0,
        unitsWithoutQuestion: 0,
    };
    const prepared = pages.map(preparePage);
    stats.tocPages = prepared.filter((p) => p.isToc).length;
    const toc = parseBigrToc(prepared, warnings);
    const names = new Set<string>([
        ...Object.values(toc.bolumAdlari),
        ...Object.values(toc.altBolumAdlari),
    ].map(lower));
    const ctx: TableParseCtx = { warnings, stats, names };

    const tedbirRows: (TableRow & { baslikNo: string | null; baslikAdi: string | null })[] = [];
    const denetimRows: (TableRow & { baslikNo: string | null; leftCluster: string })[] = [];

    let baslikNo: string | null = null;
    let baslikAdi: string | null = null;
    let ended = false;

    for (const pg of prepared) {
        if (pg.isToc || ended) continue;
        const L = pg.lines;
        let i = 0;
        while (i < L.length) {
            const line = L[i];
            const t = norm(line);
            if (!t) {
                i++;
                continue;
            }
            if (/^(KAYNAKÇA|EKLER)$/.test(t) && line.length - line.trimStart().length <= 5) {
                ended = true;
                break;
            }
            const hm = line.match(HEADING_RE);
            if (hm) {
                baslikNo = hm[1];
                baslikAdi = toc.baslikAdlari[hm[1]] ?? norm(hm[2]);
                if (toc.baslikAdlari[hm[1]] && norm(hm[2]) !== toc.baslikAdlari[hm[1]]) {
                    // Başlık iki satıra bölünmüş olabilir — içindekiler adı esas alınır; farkı uyar.
                    if (!toc.baslikAdlari[hm[1]].startsWith(norm(hm[2]))) {
                        warnings.push({
                            code: 'GROUP_NAME_MISMATCH',
                            message: `${hm[1]} başlığı gövdede "${norm(hm[2])}", içindekilerde "${toc.baslikAdlari[hm[1]]}".`,
                            page: pg.page,
                        });
                    }
                }
                i++;
                continue;
            }
            // Tablo başlık satırı
            if (/^\s*Tedbir\s+(Tedbir|Denetim Yöntem)\s*$/.test(line)) {
                const h1 = L[i + 1] ?? '';
                const mode: TableMode | null = /Tedbir Tanımı/.test(h1)
                    ? 'TEDBIR'
                    : /Denetim Soru/.test(h1)
                      ? 'DENETIM'
                      : null;
                if (!mode) {
                    i++;
                    continue;
                }
                let start = i + 2;
                if (/^\s*No\./.test(L[start] ?? '')) start += 1;
                let end = L.length - 1;
                for (let k = start; k < L.length; k++) {
                    if (isStructuralLine(L[k], names)) {
                        end = k - 1;
                        break;
                    }
                }
                const rows = parseTableRegion(pg, mode, start, end, h1.trimEnd().length, ctx);
                // parseTableRegion satır indekslerini bölgeye göre göreli üretir; sayfa numarası için yeterli.
                if (mode === 'TEDBIR') {
                    stats.tedbirTablePages += 1;
                    for (const r of rows) tedbirRows.push({ ...r, baslikNo, baslikAdi });
                } else {
                    stats.denetimTablePages += 1;
                    for (const r of rows) denetimRows.push({ ...r, baslikNo, leftCluster: r.name });
                }
                i = end + 1;
                continue;
            }
            i++;
        }
    }

    stats.tedbirRows = tedbirRows.length;
    stats.denetimRows = denetimRows.length;

    // Birimleri kur
    const units: BigrUnit[] = [];
    const byNo = new Map<string, BigrUnit>();
    const denetimByNo = new Map<string, (typeof denetimRows)[number]>();
    for (const d of denetimRows) {
        if (denetimByNo.has(d.no)) {
            warnings.push({
                code: 'DUPLICATE_TEDBIR_ROW',
                message: `Denetim satırı ${d.no} birden fazla kez bulundu (sayfa ${denetimByNo.get(d.no)!.page} ve ${d.page}); ilki kullanıldı.`,
                page: d.page,
                unitCode: `BIGR-${d.no}`,
            });
            continue;
        }
        denetimByNo.set(d.no, d);
    }

    for (const r of tedbirRows) {
        const unitCode = `BIGR-${r.no}`;
        if (byNo.has(r.no)) {
            warnings.push({
                code: 'DUPLICATE_TEDBIR_ROW',
                message: `Tedbir satırı ${r.no} birden fazla kez bulundu (sayfa ${byNo.get(r.no)!.page} ve ${r.page}); ilki kullanıldı.`,
                page: r.page,
                unitCode,
            });
            continue;
        }
        const originalText = paragraphsToText(r.blocks);
        const [b, a, g] = r.no.split('.');
        const bolumNo = b;
        const altBolumNo = `${b}.${a}`;
        const groupNo = `${b}.${a}.${g}`;
        const denetim = denetimByNo.get(r.no);
        // Soru hücresinde sorular çoğu satırda ayrı paragraftır; bitişik yazılmışsa "?" sonrası büyük harfle bölünür.
        const questionParas = denetim
            ? denetim.blocks
                  .map((p) => norm(p.join(' ')))
                  .filter(Boolean)
                  .flatMap((q) => q.split(/(?<=\?)\s+(?=\p{Lu})/u))
            : [];
        const questions = questionParas.filter((q) => !/^Bk\.\s/.test(q));
        const textIsRefOnly = r.blocks.length > 0 && r.blocks.every((p) => /^Bk\.\s/.test(norm(p.join(' '))));
        const refs = extractCrossRefs(originalText);
        const qRefs = extractCrossRefs(questionParas.filter((q) => /^Bk\.\s/.test(q)).join('\n'));
        const allDetay = [...refs.detay, ...qRefs.detay];
        const allList = [...new Set([...refs.list, ...qRefs.list])];

        if (!r.name) warnings.push({ code: 'MISSING_TITLE', message: `${r.no}: tedbir adı bulunamadı (sayfa ${r.page}).`, page: r.page, unitCode });
        if (!originalText) warnings.push({ code: 'MISSING_TEXT', message: `${r.no}: tedbir tanımı bulunamadı (sayfa ${r.page}).`, page: r.page, unitCode });
        if (r.level === null) warnings.push({ code: 'MISSING_LEVEL', message: `${r.no}: tedbir seviyesi okunamadı (sayfa ${r.page}).`, page: r.page, unitCode });
        if (textIsRefOnly) {
            warnings.push({ code: 'TEXT_IS_CROSSREF', message: `${r.no}: tedbir tanımı yalnızca çapraz referans ("${originalText.slice(0, 60)}"); özgün tanım metni yok.`, page: r.page, unitCode });
        }
        if (!denetim) {
            stats.unitsWithoutQuestion += 1;
            warnings.push({ code: 'MISSING_QUESTION', message: `${r.no}: denetim satırı bulunamadı.`, page: r.page, unitCode });
        } else if (!questions.length) {
            stats.unitsWithoutQuestion += 1;
            warnings.push({
                code: questionParas.length ? 'QUESTION_IS_CROSSREF' : 'MISSING_QUESTION',
                message: questionParas.length
                    ? `${r.no}: denetim soru hücresi yalnızca çapraz referans ("${questionParas[0].slice(0, 60)}"); soru metni yok.`
                    : `${r.no}: denetim soru hücresi boş.`,
                page: denetim.page,
                unitCode,
            });
        } else if (r.name && !titleWordsIn(r.name, denetim.leftCluster)) {
            warnings.push({
                code: 'QUESTION_TITLE_MISMATCH',
                message: `${r.no}: denetim satırının adı ("${denetim.leftCluster.slice(0, 60)}") tedbir adıyla ("${r.name.slice(0, 60)}") uyuşmuyor; soru başka satırdan gelmiş olabilir.`,
                page: denetim.page,
                unitCode,
            });
        }
        if (r.baslikNo && r.baslikNo !== groupNo) {
            warnings.push({
                code: 'GROUP_NAME_MISMATCH',
                message: `${r.no}: tedbir, "${r.baslikNo}" başlığı altında bulundu ama numarası ${groupNo} grubuna ait.`,
                page: r.page,
                unitCode,
            });
        }
        const metadata: BigrUnitMetadata = {
            bolumNo,
            bolumAdi: toc.bolumAdlari[bolumNo] ?? null,
            altBolumNo,
            altBolumAdi: toc.altBolumAdlari[altBolumNo] ?? null,
            tedbirBaslikNo: groupNo,
            tedbirBaslikAdi: toc.baslikAdlari[groupNo] ?? (r.baslikNo === groupNo ? r.baslikAdi : null),
            tedbirNo: r.no,
            tedbirSeviyesi: r.level,
            denetimSorusu: questions.length ? questions.join('\n') : null,
            denetimSorulari: questions,
            denetimSayfasi: denetim ? denetim.page : null,
            denetimBasiliNumara: denetim && denetim.printed !== r.no ? denetim.printed : null,
            yalnizcaCaprazReferans: textIsRefOnly,
            caprazReferanslar: allList,
            caprazReferansDetay: allDetay,
            dokumanSurumu: BIGR_VERSION,
            sayfa: r.page,
            sayfaBasili: r.printedPage,
        };
        const unit: BigrUnit = {
            stableKey: unitCode,
            unitCode,
            unitType: 'control',
            title: r.name,
            originalText,
            page: r.page,
            pageEnd: r.page,
            metadata,
            contentHash: '',
        };
        unit.contentHash = computeBigrUnitHash(unit);
        units.push(unit);
        byNo.set(r.no, unit);
    }
    for (const [no, d] of denetimByNo) {
        if (!byNo.has(no)) {
            warnings.push({
                code: 'ORPHAN_QUESTION_ROW',
                message: `Denetim satırı ${no} (sayfa ${d.page}) için tedbir satırı bulunamadı.`,
                page: d.page,
                unitCode: `BIGR-${no}`,
            });
        }
    }
    return { units, warnings, stats };
}

// ────────────────────────────── doğrulama ──────────────────────────────

export interface BigrConsistencyIssue {
    kind: 'NUMBER_NOT_ON_PAGE' | 'QUESTION_NUMBER_NOT_ON_PAGE' | 'DUPLICATE_KEY' | 'GAP' | 'NOT_ASCENDING';
    unitCode?: string;
    message: string;
}

export interface BigrConsistencyReport {
    ok: boolean;
    unitsChecked: number;
    issues: BigrConsistencyIssue[];
    /** Üst grup (x.y.z) → tedbir sayısı. */
    groupCounts: Record<string, number>;
    gaps: { group: string; missing: string[] }[];
}

/**
 * Tutarlılık raporu: (1) her birimin numarası, iddia ettiği sayfanın metninde sayı sütununda geçmeli
 * (2) denetim sorusu sayfasında da geçmeli (3) yinelenen anahtar (4) grup içi numara boşlukları.
 */
export function verifyBigrUnits(units: BigrUnit[], pages: BigrPage[]): BigrConsistencyReport {
    const issues: BigrConsistencyIssue[] = [];
    const pageMap = new Map<number, string[]>();
    for (const p of pages) pageMap.set(p.page, p.text.split('\n'));
    const hasNumberOnPage = (page: number, no: string): boolean => {
        const lines = pageMap.get(page);
        if (!lines) return false;
        const re = new RegExp(`^\\s{0,16}${no.replace(/\./g, '\\.')}(?![\\d.])`);
        return lines.some((l) => re.test(l));
    };

    const seen = new Map<string, number>();
    for (const u of units) {
        seen.set(u.stableKey, (seen.get(u.stableKey) ?? 0) + 1);
        const no = u.metadata.tedbirNo;
        if (`BIGR-${no}` !== u.unitCode || u.stableKey !== u.unitCode) {
            issues.push({ kind: 'DUPLICATE_KEY', unitCode: u.unitCode, message: `${u.unitCode}: stableKey/unitCode/tedbirNo tutarsız.` });
        }
        for (let pg = u.page; pg <= u.pageEnd; pg++) {
            if (pg === u.page && !hasNumberOnPage(pg, no)) {
                issues.push({
                    kind: 'NUMBER_NOT_ON_PAGE',
                    unitCode: u.unitCode,
                    message: `${u.unitCode}: numara sayfa ${u.page} metninde bulunamadı.`,
                });
            }
        }
        const dp = u.metadata.denetimSayfasi;
        if (dp !== null && !hasNumberOnPage(dp, u.metadata.denetimBasiliNumara ?? no)) {
            issues.push({
                kind: 'QUESTION_NUMBER_NOT_ON_PAGE',
                unitCode: u.unitCode,
                message: `${u.unitCode}: denetim sorusu satırının numarası sayfa ${dp} metninde bulunamadı.`,
            });
        }
    }
    for (const [k, n] of seen) {
        if (n > 1) issues.push({ kind: 'DUPLICATE_KEY', unitCode: k, message: `${k} ${n} kez üretildi.` });
    }

    const groups = new Map<string, number[]>();
    for (const u of units) {
        const parts = u.metadata.tedbirNo.split('.');
        const g = parts.slice(0, 3).join('.');
        const arr = groups.get(g) ?? [];
        arr.push(parseInt(parts[3], 10));
        groups.set(g, arr);
    }
    const gaps: { group: string; missing: string[] }[] = [];
    const groupCounts: Record<string, number> = {};
    for (const [g, arr] of groups) {
        groupCounts[g] = arr.length;
        const set = new Set(arr);
        const max = Math.max(...arr);
        const missing: string[] = [];
        for (let i = 1; i <= max; i++) if (!set.has(i)) missing.push(`${g}.${i}`);
        if (missing.length) {
            gaps.push({ group: g, missing });
            issues.push({ kind: 'GAP', message: `${g} grubunda eksik numaralar: ${missing.join(', ')}` });
        }
        const sorted = arr.every((v, i) => i === 0 || v > arr[i - 1]);
        if (!sorted) issues.push({ kind: 'NOT_ASCENDING', message: `${g} grubunda tedbirler artan sırada değil.` });
    }
    return { ok: issues.length === 0, unitsChecked: units.length, issues, groupCounts, gaps };
}

// ────────────────────────────── PDF → sayfa metni ──────────────────────────────

/**
 * pdftotext -layout ile sayfa sayfa metin çıkarır. Kabuk kullanılmaz (execFile, argüman dizisi).
 * pdftotext yolu PDFTOTEXT_BIN ortam değişkeniyle değiştirilebilir.
 */
export async function extractPdfPages(pdfPath: string): Promise<BigrPage[]> {
    const bin = process.env.PDFTOTEXT_BIN || 'pdftotext';
    const candidates = [bin, '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext', '/usr/bin/pdftotext'];
    let lastErr: unknown;
    for (const b of candidates) {
        try {
            const { stdout } = await execFileAsync(b, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
                maxBuffer: 512 * 1024 * 1024,
                encoding: 'utf8',
            });
            const parts = stdout.split('\f');
            if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
            return parts.map((text, i) => ({ page: i + 1, text }));
        } catch (e) {
            lastErr = e;
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') break;
        }
    }
    throw new Error(
        `pdftotext çalıştırılamadı (${(lastErr as Error)?.message ?? 'bilinmeyen hata'}). ` +
            `poppler-utils kurulu olmalı veya PDFTOTEXT_BIN ayarlanmalı.`,
    );
}
