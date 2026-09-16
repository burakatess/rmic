/**
 * Kurumsal Kaynak Kütüphanesi (KnowledgeDoc) toplu içe aktarma.
 *
 * Kurumunuzdaki doküman kütüğünü (politika/prosedür/talimat/rehber/sözlük listesi)
 * ortak şablona çevirip tek komutla yükler. `code` alanına göre UPSERT yapar —
 * tekrar çalıştırmak güvenlidir (yeni satır ekler, mevcut satırı günceller).
 *
 * Ortak şablon (KnowledgeDoc):
 *   kind          POLICY | PROCEDURE | METHODOLOGY | RUBRIC | GLOSSARY | PRECEDENT
 *                 (Türkçe karşılıklar da kabul edilir: Politika, Prosedür, Talimat,
 *                  Metodoloji, Rehber/Rubrik, Terminoloji/Sözlük, Emsal)
 *   code          Kurumsal doküman no — BENZERSİZ, 2-40 karakter (ör. "POL-BT-01")
 *   title         Doküman adı (3-300)
 *   body          AI'nin okuyacağı METİN — tam metin veya odaklı özet (3-20000)
 *   category      Sahip birim / konu alanı (<=120)                          [ops.]
 *   tags          Anahtar kelimeler; JSON'da dizi, CSV/XLSX'te ";" ile ayır  [ops.]
 *   sourceRef     Kaynak/atıf — doküman no + revizyon + yayım bilgisi (<=200) [ops.]
 *   effectiveDate Yürürlük tarihi — "YYYY-MM-DD" veya "GG.AA.YYYY"           [ops.]
 *   isActive      true/false (varsayılan true)                              [ops.]
 *
 * Kullanım:
 *   npx ts-node prisma/import-knowledge.ts --file kurum-kaynaklar.xlsx            # DRY (yazmaz)
 *   npx ts-node prisma/import-knowledge.ts --file kurum-kaynaklar.csv  --apply
 *   npx ts-node prisma/import-knowledge.ts --file kaynaklar.json --apply --created-by admin@rmic.com
 *   npx ts-node prisma/import-knowledge.ts --file kaynaklar.json --apply --deactivate-missing
 *   npx ts-node prisma/import-knowledge.ts --template                            # şablon dosyaları üret
 *
 * .json / .csv / .xlsx desteklenir (ilk sayfa). CSV/XLSX başlık satırı yukarıdaki
 * alan adlarıyla eşleşmeli (büyük/küçük harf ve TR eşanlamlıları toleranslı).
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { extname, resolve } from 'path';
import { PrismaClient, KnowledgeDocKind, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as XLSX from 'xlsx';

// ─── CLI ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const argVal = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = has('--apply');
const TEMPLATE = has('--template');
const DEACTIVATE_MISSING = has('--deactivate-missing');
const FILE = argVal('--file');
const CREATED_BY = argVal('--created-by');

// ─── Alan eşleme (kurum tablosu başlıkları → şablon alanları) ──────────────
const HEADER_ALIASES: Record<string, string> = {
    kind: 'kind', tur: 'kind', tür: 'kind', 'doküman türü': 'kind', 'dokuman turu': 'kind', tip: 'kind',
    code: 'code', kod: 'code', 'doküman no': 'code', 'dokuman no': 'code', 'belge no': 'code', no: 'code',
    title: 'title', baslik: 'title', başlık: 'title', ad: 'title', 'doküman adı': 'title', 'dokuman adi': 'title',
    body: 'body', icerik: 'body', içerik: 'body', metin: 'body', 'tam metin': 'body', ozet: 'body', özet: 'body',
    category: 'category', kategori: 'category', 'sahip birim': 'category', birim: 'category', konu: 'category',
    tags: 'tags', etiket: 'tags', etiketler: 'tags', 'anahtar kelimeler': 'tags',
    sourceref: 'sourceRef', 'source ref': 'sourceRef', kaynak: 'sourceRef', atif: 'sourceRef', atıf: 'sourceRef',
    revizyon: 'sourceRef',
    effectivedate: 'effectiveDate', 'effective date': 'effectiveDate', 'yürürlük tarihi': 'effectiveDate',
    'yururluk tarihi': 'effectiveDate', 'yayım tarihi': 'effectiveDate', tarih: 'effectiveDate',
    isactive: 'isActive', aktif: 'isActive', 'is active': 'isActive', durum: 'isActive',
};

const KIND_ALIASES: Record<string, KnowledgeDocKind> = {
    policy: 'POLICY', politika: 'POLICY',
    procedure: 'PROCEDURE', prosedur: 'PROCEDURE', prosedür: 'PROCEDURE', talimat: 'PROCEDURE', 'iş akışı': 'PROCEDURE',
    methodology: 'METHODOLOGY', metodoloji: 'METHODOLOGY', 'yöntem': 'METHODOLOGY', yontem: 'METHODOLOGY',
    rubric: 'RUBRIC', rubrik: 'RUBRIC', rehber: 'RUBRIC', 'derecelendirme': 'RUBRIC', 'puanlama': 'RUBRIC',
    glossary: 'GLOSSARY', terminoloji: 'GLOSSARY', sozluk: 'GLOSSARY', sözlük: 'GLOSSARY', tanimlar: 'GLOSSARY',
    precedent: 'PRECEDENT', emsal: 'PRECEDENT', 'örnek bulgu': 'PRECEDENT', ornek: 'PRECEDENT',
};

interface Row {
    kind: string; code: string; title: string; body: string;
    category?: string; tags?: string; sourceRef?: string; effectiveDate?: string; isActive?: string;
}
interface Parsed {
    kind: KnowledgeDocKind; code: string; title: string; body: string;
    category: string | null; tags: string[]; sourceRef: string | null;
    effectiveDate: Date | null; isActive: boolean;
}

// ─── Dosya okuma ───────────────────────────────────────────────────────────
function readRows(path: string): Record<string, unknown>[] {
    const abs = resolve(path);
    if (!existsSync(abs)) throw new Error(`Dosya bulunamadı: ${abs}`);
    const ext = extname(abs).toLowerCase();

    if (ext === '.json') {
        const data: unknown = JSON.parse(readFileSync(abs, 'utf8'));
        const arr = Array.isArray(data)
            ? data
            : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
              ? (data as { items: unknown[] }).items
              : null;
        if (!arr) throw new Error('JSON bir dizi ya da { "items": [...] } olmalı.');
        return arr as Record<string, unknown>[];
    }
    if (ext === '.csv') {
        // UTF-8 metin olarak oku — buffer modu Türkçe karakterleri bozabiliyor.
        const wb = XLSX.read(readFileSync(abs, 'utf8'), { type: 'string', raw: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    }
    if (ext === '.xlsx' || ext === '.xls') {
        const wb = XLSX.read(readFileSync(abs), { type: 'buffer', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    }
    throw new Error(`Desteklenmeyen uzantı: ${ext} (.json / .csv / .xlsx kullanın)`);
}

function cellToString(v: unknown): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
    // JSON'da dizi gelen alanlar (ör. tags) — ";" ile birleştir, sonra ortak ayrıştırıcı böler.
    if (Array.isArray(v)) return v.map((x) => cellToString(x)).join(';');
    return JSON.stringify(v);
}

function normalizeRow(raw: Record<string, unknown>): Row {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        const key = HEADER_ALIASES[k.trim().toLowerCase()] ?? k.trim();
        out[key] = cellToString(v).trim();
    }
    return out as unknown as Row;
}

function parseDate(s: string): Date | null {
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    const tr = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (tr) return new Date(`${tr[3]}-${tr[2].padStart(2, '0')}-${tr[1].padStart(2, '0')}T00:00:00Z`);
    // Excel seri numarası (ör. 45658) — 1900 epoch, 1900 artık yıl hatası düzeltmesi dahil.
    if (/^\d{4,6}(\.\d+)?$/.test(s.trim())) {
        const serial = parseFloat(s);
        const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        if (!isNaN(d.getTime()) && d.getUTCFullYear() > 1970 && d.getUTCFullYear() < 2100) return d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function parseBool(s: string | undefined, def = true): boolean {
    if (s == null || s === '') return def;
    return !/^(false|0|hayır|hayir|pasif|no|inactive)$/i.test(s.trim());
}

function validate(row: Row, idx: number): { parsed?: Parsed; errors: string[] } {
    const errors: string[] = [];
    const kindRaw = (row.kind || '').trim();
    const kind = KIND_ALIASES[kindRaw.toLowerCase()] ?? (Object.values(KnowledgeDocKind).includes(kindRaw as KnowledgeDocKind) ? (kindRaw as KnowledgeDocKind) : undefined);
    if (!kind) errors.push(`kind geçersiz: "${kindRaw}" (POLICY/PROCEDURE/METHODOLOGY/RUBRIC/GLOSSARY/PRECEDENT ya da TR karşılığı)`);

    const code = (row.code || '').trim();
    if (code.length < 2 || code.length > 40) errors.push(`code 2-40 karakter olmalı ("${code}")`);

    const title = (row.title || '').trim();
    if (title.length < 3 || title.length > 300) errors.push(`title 3-300 karakter olmalı`);

    const body = (row.body || '').trim();
    if (body.length < 3) errors.push('body boş — AI bu metni okuyacak, doldurun');
    if (body.length > 20000) errors.push(`body 20000 karakteri aşıyor (${body.length}) — bölün ya da özetleyin`);

    const category = (row.category || '').trim() || null;
    if (category && category.length > 120) errors.push('category 120 karakteri aşıyor');

    const tags = (row.tags || '')
        .split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
    if (tags.some((t) => t.length > 40)) errors.push('bir etiket 40 karakteri aşıyor');

    const sourceRef = (row.sourceRef || '').trim() || null;
    if (sourceRef && sourceRef.length > 200) errors.push('sourceRef 200 karakteri aşıyor');

    let effectiveDate: Date | null = null;
    const effectiveRaw = (row.effectiveDate || '').trim();
    if (effectiveRaw) {
        effectiveDate = parseDate(effectiveRaw);
        if (!effectiveDate) errors.push(`effectiveDate okunamadı: "${effectiveRaw}"`);
    }

    if (errors.length || !kind) return { errors: errors.map((e) => `#${idx + 1} [${code || '?'}] ${e}`) };
    return {
        parsed: { kind, code, title, body, category, tags, sourceRef, effectiveDate, isActive: parseBool(row.isActive) },
        errors: [],
    };
}

// ─── Şablon üretimi ────────────────────────────────────────────────────────
function writeTemplates() {
    const sample: Parsed[] = [
        {
            kind: 'POLICY', code: 'POL-BT-01', title: 'Bilgi Güvenliği Politikası',
            body: 'Bu politika ... (AI\'nin uyum değerlendirmesinde referans alacağı tam metin veya odaklı özet).',
            category: 'Bilgi Teknolojileri', tags: ['erişim', 'ISO 27001', 'KVKK'],
            sourceRef: 'POL-BT-01 Rev.3 (Yön. Kurulu 2025/14)', effectiveDate: new Date('2025-01-01T00:00:00Z'),
            isActive: true,
        },
        {
            kind: 'RUBRIC', code: 'RUB-BULGU-DERECE', title: 'Bulgu Önem Derecesi Rehberi',
            body: 'CRITICAL: yasal yaptırım riski...\nHIGH: kontrol büyük ölçüde işlemiyor...\nMEDIUM: ...\nLOW: ...',
            category: 'İç Kontrol', tags: ['derecelendirme'], sourceRef: 'İç Kontrol Metodolojisi Ek-2',
            effectiveDate: null, isActive: true,
        },
    ];
    writeFileSync(resolve('prisma/knowledge-import-template.json'), JSON.stringify(sample, null, 2), 'utf8');

    const headers = ['kind', 'code', 'title', 'body', 'category', 'tags', 'sourceRef', 'effectiveDate', 'isActive'];
    const csvRows = sample.map((s) => [
        s.kind, s.code, s.title, s.body.replace(/\n/g, ' '), s.category ?? '', s.tags.join(';'),
        s.sourceRef ?? '', s.effectiveDate ? s.effectiveDate.toISOString().slice(0, 10) : '', String(s.isActive),
    ]);
    const csv = [headers, ...csvRows]
        .map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
        .join('\n');
    writeFileSync(resolve('prisma/knowledge-import-template.csv'), csv, 'utf8');
    console.log('Şablonlar yazıldı:\n  prisma/knowledge-import-template.json\n  prisma/knowledge-import-template.csv');
}

// ─── Ana akış ──────────────────────────────────────────────────────────────
async function main() {
    if (TEMPLATE) return writeTemplates();
    if (!FILE) {
        console.error('--file <yol> gerekli. Şablon için: npx ts-node prisma/import-knowledge.ts --template');
        process.exit(1);
    }

    const rawRows = readRows(FILE);
    console.log(`${rawRows.length} satır okundu: ${FILE}`);

    const parsed: Parsed[] = [];
    const allErrors: string[] = [];
    const seen = new Set<string>();
    rawRows.forEach((raw, i) => {
        const row = normalizeRow(raw);
        // tümü boş satırları atla
        if (!row.code && !row.title && !row.body) return;
        const { parsed: p, errors } = validate(row, i);
        if (errors.length || !p) return allErrors.push(...errors);
        if (seen.has(p.code)) return allErrors.push(`#${i + 1} [${p.code}] dosyada mükerrer code`);
        seen.add(p.code);
        parsed.push(p);
    });

    if (allErrors.length) {
        console.log(`\n⚠ ${allErrors.length} geçersiz satır:`);
        allErrors.forEach((e) => console.log('  ' + e));
    }
    console.log(`\n✓ ${parsed.length} geçerli kayıt hazır.`);
    console.log(
        '  Türlere göre: ' +
            Object.entries(
                parsed.reduce<Record<string, number>>((a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a), {}),
            )
                .map(([k, n]) => `${k}=${n}`)
                .join(', '),
    );

    if (!APPLY) {
        console.log('\n--apply verilmedi — DB değişmedi. İlk 5 kayıt önizleme:');
        parsed.slice(0, 5).forEach((p) =>
            console.log(`  [${p.kind}] ${p.code} — ${p.title}  (body ${p.body.length} krk, tags: ${p.tags.join('/') || '—'})`),
        );
        return;
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        // Aktör kullanıcı (createdById zorunlu). --created-by email|id ya da ilk SYSTEM_ADMIN.
        let actor = CREATED_BY
            ? await prisma.user.findFirst({ where: { OR: [{ id: CREATED_BY }, { email: CREATED_BY }] } })
            : null;
        if (!actor) {
            actor = await prisma.user.findFirst({
                where: { role: { name: 'SYSTEM_ADMIN' } },
                orderBy: { createdAt: 'asc' },
            });
        }
        if (!actor) throw new Error('Aktör kullanıcı bulunamadı. --created-by <email> verin.');
        console.log(`\nAktör: ${actor.email} (${actor.id})`);

        let created = 0;
        let updated = 0;
        let unchanged = 0;
        for (const p of parsed) {
            const existing = await prisma.knowledgeDoc.findUnique({ where: { code: p.code } });
            const data = {
                kind: p.kind, title: p.title, body: p.body, category: p.category,
                tags: p.tags, sourceRef: p.sourceRef, effectiveDate: p.effectiveDate, isActive: p.isActive,
            };
            if (!existing) {
                const doc = await prisma.knowledgeDoc.create({ data: { code: p.code, createdById: actor.id, ...data } });
                await audit(prisma, actor.id, 'CREATE', doc.id, null, doc);
                created++;
                continue;
            }
            const same =
                existing.kind === data.kind &&
                existing.title === data.title &&
                existing.body === data.body &&
                (existing.category ?? null) === data.category &&
                JSON.stringify([...existing.tags].sort()) === JSON.stringify([...data.tags].sort()) &&
                (existing.sourceRef ?? null) === data.sourceRef &&
                (existing.effectiveDate?.getTime() ?? null) === (data.effectiveDate?.getTime() ?? null) &&
                existing.isActive === data.isActive;
            if (same) {
                unchanged++;
                continue;
            }
            const doc = await prisma.knowledgeDoc.update({ where: { code: p.code }, data });
            await audit(prisma, actor.id, 'UPDATE', doc.id, existing, doc);
            updated++;
        }

        let deactivated = 0;
        if (DEACTIVATE_MISSING) {
            const codes = [...seen];
            const stale = await prisma.knowledgeDoc.findMany({
                where: { isActive: true, code: { notIn: codes } },
            });
            for (const s of stale) {
                await prisma.knowledgeDoc.update({ where: { id: s.id }, data: { isActive: false } });
                await audit(prisma, actor.id, 'DELETE', s.id, s, { ...s, isActive: false });
                deactivated++;
            }
        }

        console.log(
            `\n✓ Bitti — yeni: ${created}, güncellenen: ${updated}, değişmeyen: ${unchanged}` +
                (DEACTIVATE_MISSING ? `, pasifleştirilen (dosyada yok): ${deactivated}` : ''),
        );
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

async function audit(
    prisma: PrismaClient,
    userId: string,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
) {
    await prisma.auditLog
        .create({
            data: {
                userId,
                action,
                entityType: 'KnowledgeDoc',
                entityId,
                oldValue: oldValue ?? Prisma.JsonNull,
                newValue: newValue ?? Prisma.JsonNull,
            },
        })
        .catch(() => undefined);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
