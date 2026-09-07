/**
 * Regülasyon Kütüphanesi içe aktarma — SPK Tebliği (VII-128.10) ve
 * CBDDO Bilgi ve İletişim Güvenliği Rehberi PDF'lerini ortak şablona çevirir.
 *
 * Ortak şablon (RegulationArticle):
 *   articleCode = "Madde No"        (SPK: "6", "GEÇİCİ 1" | CBDDO: "3.1.1.2")
 *   title       = madde/tedbir adı
 *   description = "Madde Açıklaması" (tam metin)
 *   category    = bölüm / alt başlık
 *
 * Kullanım:
 *   npx ts-node prisma/import-regulations.ts --dry
 *   npx ts-node prisma/import-regulations.ts --apply
 *   npx ts-node prisma/import-regulations.ts --apply --spk "<yol>" --cbddo "<yol>"
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse') as {
    PDFParse: new (o: { data: Buffer }) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> };
};

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argVal = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
};
const SPK_PATH =
    argVal('--spk') || '/Users/burak/Test ve Çalışmalar/13 Mart 2025 PERŞEMBE.pdf';
const CBDDO_PATH =
    argVal('--cbddo') ||
    '/Users/burak/Test ve Çalışmalar/Adsız — https:cbddo.gov.tr:SharedFolderServer:Genel:File:bg_rehber.pdf';

interface Article {
    articleCode: string;
    title: string;
    description: string;
    category: string | null;
}

async function pdfText(path: string): Promise<string> {
    const parser = new PDFParse({ data: readFileSync(path) });
    try {
        return (await parser.getText()).text;
    } finally {
        await parser.destroy().catch(() => undefined);
    }
}

/** Bölünmüş satırları paragraf akışına getirir; madde imlerini (•, a)) korur. */
function reflow(lines: string[]): string {
    const out: string[] = [];
    for (const raw of lines) {
        const l = raw.trim();
        if (!l) continue;
        const isBullet = /^([•\-*]|[a-zçğıöşü]\)|\(\d+\)|\d+[.)])\s/.test(l);
        const prev = out[out.length - 1];
        if (prev && !isBullet && !/[.:;]$/.test(prev) && !/[.:;]$/.test(prev.slice(-1))) {
            out[out.length - 1] = `${prev} ${l}`;
        } else {
            out.push(l);
        }
    }
    return out.join('\n').replace(/\s{2,}/g, ' ').trim();
}

function clean(s: string): string {
    return s
        .replace(/\r/g, '')
        .replace(/^\s*Sayfa \d+ ?\/ ?\d+.*$/gim, '')
        .replace(/^-- \d+ of \d+ --$/gim, '')
        .replace(/^\s*BİLGİ VE İLETİŞİM GÜVENLİĞİ REHBERİ\s*$/gim, '')
        .replace(/^\s*13 Mart 2025 PERŞEMBE\s*$/gim, '')
        .replace(/^\s*Resmî Gazete\s*$/gim, '')
        .replace(/^\s*\d+\s*$/gm, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ─── SPK Tebliği VII-128.10 ────────────────────────────────────────────────

const SPK_BOLUM: Record<string, string> = {};
function spkCategory(idx: number): string {
    if (idx <= 4) return 'Başlangıç Hükümleri';
    if (idx <= 8) return 'Bilgi Sistemlerinin Yönetimi';
    if (idx <= 29) return 'Bilgi Sistemleri Kontrollerine İlişkin Esaslar';
    return 'Çeşitli ve Son Hükümler';
}

function parseSpk(raw: string): Article[] {
    const lines = raw.split('\n');
    const out: Article[] = [];
    const isNoise = (l: string) =>
        !l.trim() ||
        /^Sayfa \d+ ?\/ ?\d+/.test(l) ||
        /^https?:/.test(l.trim()) ||
        /^\d+$/.test(l.trim());

    const starts: { line: number; code: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(GEÇİCİ MADDE|MADDE)\s+(\d+)\s*-/);
        if (m) starts.push({ line: i, code: m[1] === 'GEÇİCİ MADDE' ? `GEÇİCİ ${m[2]}` : m[2] });
    }

    for (let s = 0; s < starts.length; s++) {
        const cur = starts[s];
        const end = s + 1 < starts.length ? starts[s + 1].line : lines.length;
        // başlık: MADDE satırından yukarı, ilk gürültüsüz satır
        let title = '';
        for (let k = cur.line - 1; k >= 0 && k > cur.line - 6; k--) {
            if (!isNoise(lines[k])) {
                title = lines[k].trim();
                break;
            }
        }
        const body = clean(lines.slice(cur.line, end).join('\n'));
        if (!body) continue;
        out.push({
            articleCode: cur.code,
            title: title || `Madde ${cur.code}`,
            description: body,
            category: spkCategory(Number(cur.code.replace(/\D/g, '')) || 99),
        });
    }
    return out;
}

// ─── CBDDO Bilgi ve İletişim Güvenliği Rehberi ─────────────────────────────

function parseCbddo(raw: string): Article[] {
    const text = raw.replace(/\r/g, '');
    const out: Article[] = [];

    // Alt bölüm başlıkları: "3.1.1. Donanım Varlıklarının Envanter Yönetimi"
    // (2.x metodoloji bölümlerinde Tedbirler tablosu yok → aşağıda continue edilir)
    const headRe = /\n(\d+\.\d+\.\d+)\.\s+([^\n]{4,110})\n/g;
    const heads: { code: string; name: string; idx: number }[] = [];
    let hm: RegExpExecArray | null;
    while ((hm = headRe.exec(text))) {
        heads.push({ code: hm[1], name: hm[2].trim(), idx: hm.index });
    }

    for (let h = 0; h < heads.length; h++) {
        const cur = heads[h];
        const secEnd = h + 1 < heads.length ? heads[h + 1].idx : text.length;
        let section = text.slice(cur.idx, secEnd);

        // Yalnızca "Tedbirler" ile "Denetim Maddeleri" arasını al
        const tMatch = section.match(/\n[ \t]*Tedbirler[ \t]*\n/);
        if (!tMatch || tMatch.index === undefined) continue;
        let block = section.slice(tMatch.index + tMatch[0].length);
        const dStart = block.search(/\n[ \t]*Denetim Maddeleri[ \t]*\n/);
        if (dStart >= 0) block = block.slice(0, dStart);

        // Tedbirleri ayır: "3.1.1.2 \t1 " ya da "3.1.1.2\n1\n"
        const itemRe = /\n(\d+\.\d+\.\d+\.\d+)[ \t\n]+([123])(?![\d.])/g;
        const marks: { code: string; level: string; start: number; contentAt: number }[] = [];
        let im: RegExpExecArray | null;
        while ((im = itemRe.exec(block))) {
            marks.push({ code: im[1], level: im[2], start: im.index, contentAt: im.index + im[0].length });
        }

        for (let m = 0; m < marks.length; m++) {
            const mk = marks[m];
            const end = m + 1 < marks.length ? marks[m + 1].start : block.length;
            const chunk = block.slice(mk.contentAt, end);

            const lines = clean(chunk)
                .replace(/\t/g, ' ')
                .split('\n')
                .map((l) => l.replace(/\s{2,}/g, ' ').trim())
                .filter(Boolean);
            if (!lines.length) continue;

            // Başlık satırı: kelimelerinin çoğu büyük harfle başlıyor, kısa, nokta ile bitmiyor
            const isTitleLine = (l: string): boolean => {
                const w = l.split(/\s+/).filter((x) => /\p{L}/u.test(x));
                if (!w.length || l.length > 78 || /[.]$/.test(l)) return false;
                const caps = w.filter((x) => /^[A-ZÇĞİÖŞÜ0-9(]/.test(x)).length;
                return caps / w.length >= 0.6;
            };
            let bodyStart = 0;
            const nameLines: string[] = [];
            while (bodyStart < lines.length && isTitleLine(lines[bodyStart]) && bodyStart < 3) {
                nameLines.push(lines[bodyStart]);
                bodyStart++;
            }
            let name = nameLines.join(' ').replace(/\s{2,}/g, ' ').trim();
            // Tanım: satırları paragraf akışına getir (bölünmüş kelimeleri birleştir)
            let body = reflow(lines.slice(bodyStart));
            if (!name) {
                const first = reflow(lines);
                name = first.split(/(?<=[.:])\s/)[0].slice(0, 80);
                body = first;
            }
            if (!body) body = name;
            name = name.replace(/[.:]$/, '').trim();

            out.push({
                articleCode: mk.code,
                title: name || `Tedbir ${mk.code}`,
                description: `Tedbir Seviyesi: ${mk.level}\n${body}`,
                category: `${cur.code} ${cur.name}`,
            });
        }
    }
    return out;
}

// ─── Yazma ─────────────────────────────────────────────────────────────────

async function upsertRegulation(
    prisma: PrismaClient,
    reg: { code: string; name: string; issuer: string; publishDate?: Date },
    articles: Article[],
) {
    const r = await prisma.regulation.upsert({
        where: { code: reg.code },
        update: { name: reg.name, issuer: reg.issuer, publishDate: reg.publishDate, isActive: true },
        create: { code: reg.code, name: reg.name, issuer: reg.issuer, publishDate: reg.publishDate },
    });
    let created = 0;
    let updated = 0;
    for (const a of articles) {
        const existing = await prisma.regulationArticle.findUnique({
            where: { regulationId_articleCode: { regulationId: r.id, articleCode: a.articleCode } },
        });
        if (existing) {
            await prisma.regulationArticle.update({
                where: { id: existing.id },
                data: { title: a.title, description: a.description, category: a.category },
            });
            updated++;
        } else {
            await prisma.regulationArticle.create({
                data: { regulationId: r.id, ...a },
            });
            created++;
        }
    }
    return { created, updated };
}

async function main() {
    console.log(`Mod: ${APPLY ? 'APPLY (DB yazılacak)' : 'DRY-RUN (yalnızca özet)'}\n`);

    const spkRaw = await pdfText(SPK_PATH);
    const spk = parseSpk(spkRaw);
    console.log(`SPK Tebliği VII-128.10 → ${spk.length} madde`);
    console.log(spk.slice(0, 3).map((a) => `  ${a.articleCode} · ${a.title} (${a.description.length} kr)`).join('\n'));
    console.log(`  … ${spk[spk.length - 1].articleCode} · ${spk[spk.length - 1].title}\n`);

    const cbddoRaw = await pdfText(CBDDO_PATH);
    const cbddo = parseCbddo(cbddoRaw);
    console.log(`CBDDO Bilgi ve İletişim Güvenliği Rehberi → ${cbddo.length} tedbir`);
    const cats = [...new Set(cbddo.map((c) => c.category))];
    console.log(`  ${cats.length} kategori. Örnekler:`);
    console.log(cbddo.slice(0, 3).map((a) => `  ${a.articleCode} · ${a.title} (${a.description.length} kr)`).join('\n'));
    console.log(`  … ${cbddo[cbddo.length - 1].articleCode} · ${cbddo[cbddo.length - 1].title}\n`);

    if (args.includes('--full')) {
        const fs = await import('fs');
        fs.writeFileSync('/tmp/reg-spk.json', JSON.stringify(spk, null, 2));
        fs.writeFileSync('/tmp/reg-cbddo.json', JSON.stringify(cbddo, null, 2));
        console.log('→ /tmp/reg-spk.json, /tmp/reg-cbddo.json yazıldı');
    }

    if (!APPLY) {
        console.log('--apply verilmedi, DB değişmedi.');
        return;
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const r1 = await upsertRegulation(
            prisma,
            {
                code: 'SPK-VII-128.10',
                name: 'Bilgi Sistemleri Yönetimine İlişkin Usul ve Esaslar Tebliği (VII-128.10)',
                issuer: 'Sermaye Piyasası Kurulu',
                publishDate: new Date('2025-03-13'),
            },
            spk,
        );
        console.log(`SPK: +${r1.created} yeni, ${r1.updated} güncellendi`);

        const r2 = await upsertRegulation(
            prisma,
            {
                code: 'CBDDO-BIGR',
                name: 'Bilgi ve İletişim Güvenliği Rehberi',
                issuer: 'T.C. Cumhurbaşkanlığı Dijital Dönüşüm Ofisi',
                publishDate: new Date('2020-07-01'),
            },
            cbddo,
        );
        console.log(`CBDDO: +${r2.created} yeni, ${r2.updated} güncellendi`);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
