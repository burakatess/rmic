/**
 * Risk → Direktörlük eşleme önerisi — SALT OKUNUR (READ ONLY transaction, sonda geri alınır).
 *
 * Direktörlüğü boş ve kurum geneli işaretlenmemiş ("eşlenmemiş") her risk için olası
 * direktörlüğü KAYNAĞI ve GÜVEN düzeyiyle raporlar. Hiçbir kayıt güncellenmez; eşleme
 * onaylandıktan sonra risk ekranından (risk:directorate:change) veya ayrı onaylı bir
 * betikle yapılır.
 *
 * Kaynaklar:
 *  - KONTROL : bağlı kontrollerin (ControlRiskMapping) direktörlüğü — tümü aynıysa
 *  - BULGU   : bu riske bağlı bulguların direktörlüğü — tümü aynıysa
 *  - GMY     : Risk.ilgiliGmy metni tek bir direktörlüğün gmy alanıyla birebir eşleşiyorsa (zayıf)
 * Güven:
 *  - YÜKSEK : KONTROL ve BULGU aynı tek direktörlüğü gösteriyor
 *  - ORTA   : KONTROL veya BULGU'dan yalnız biri, çelişkisiz
 *  - DÜŞÜK  : yalnız GMY metni
 *  - ÇELİŞKİ: kaynaklar farklı direktörlükleri gösteriyor → elle karar
 *  - YOK    : öneri yok → elle karar
 * Risk sahibinin GÜNCEL birimi bilerek KULLANILMAZ (tarihsel kayıt güncel üyelikle değişmemeli).
 *
 * Kullanım: npx ts-node --transpile-only prisma/risk-directorate-dry-run.ts [--json]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

type Confidence = 'YÜKSEK' | 'ORTA' | 'DÜŞÜK' | 'ÇELİŞKİ' | 'YOK';

export function suggestDirectorate(input: {
    controlDirs: (string | null)[];
    findingDirs: (string | null)[];
    gmyMatches: string[];
}): { directorateId: string | null; confidence: Confidence; sources: string[] } {
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const c = uniq(input.controlDirs);
    const f = uniq(input.findingDirs);
    if (c.length > 1 || f.length > 1) return { directorateId: null, confidence: 'ÇELİŞKİ', sources: [`KONTROL:${c.length}`, `BULGU:${f.length}`] };
    if (c.length === 1 && f.length === 1) {
        return c[0] === f[0]
            ? { directorateId: c[0], confidence: 'YÜKSEK', sources: ['KONTROL', 'BULGU'] }
            : { directorateId: null, confidence: 'ÇELİŞKİ', sources: ['KONTROL≠BULGU'] };
    }
    if (c.length === 1) return { directorateId: c[0], confidence: 'ORTA', sources: ['KONTROL'] };
    if (f.length === 1) return { directorateId: f[0], confidence: 'ORTA', sources: ['BULGU'] };
    if (input.gmyMatches.length === 1) return { directorateId: input.gmyMatches[0], confidence: 'DÜŞÜK', sources: ['GMY'] };
    if (input.gmyMatches.length > 1) return { directorateId: null, confidence: 'ÇELİŞKİ', sources: [`GMY:${input.gmyMatches.length}`] };
    return { directorateId: null, confidence: 'YOK', sources: [] };
}

class DryRunRollback extends Error { }

async function main() {
    const asJson = process.argv.includes('--json');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const rows: Record<string, unknown>[] = [];
    let totals: Record<string, number> = {};
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const dirs = await tx.directorate.findMany({ select: { id: true, name: true, gmy: true, isActive: true } });
            const nameOf = new Map(dirs.map(d => [d.id, d.name]));
            const norm = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('tr');
            const risks = await tx.risk.findMany({
                select: {
                    id: true, riskId: true, name: true, ilgiliGmy: true, directorateId: true, isOrgWide: true,
                    controls: { select: { control: { select: { directorateId: true } } } },
                    findings: { select: { directorateId: true } },
                    linkedFindings: { select: { directorateId: true } },
                },
                orderBy: { riskId: 'asc' },
            });
            totals = {
                toplam: risks.length,
                eslenmis: risks.filter(r => r.directorateId).length,
                kurumGeneli: risks.filter(r => r.isOrgWide).length,
                eslenmemis: risks.filter(r => !r.directorateId && !r.isOrgWide).length,
            };
            for (const r of risks.filter(x => !x.directorateId && !x.isOrgWide)) {
                const gmyMatches = r.ilgiliGmy
                    ? dirs.filter(d => d.isActive && d.gmy && norm(d.gmy) === norm(r.ilgiliGmy)).map(d => d.id)
                    : [];
                const s = suggestDirectorate({
                    controlDirs: r.controls.map(m => m.control.directorateId),
                    findingDirs: [...r.findings, ...r.linkedFindings].map(f => f.directorateId),
                    gmyMatches,
                });
                rows.push({
                    riskId: r.riskId, ad: r.name.slice(0, 60),
                    oneri: s.directorateId ? nameOf.get(s.directorateId) : null,
                    oneriId: s.directorateId, guven: s.confidence, kaynak: s.sources.join('+') || '-',
                });
            }
            throw new DryRunRollback();
        });
    } catch (e) {
        if (!(e instanceof DryRunRollback)) throw e;
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
    if (asJson) { console.log(JSON.stringify({ totals, rows }, null, 2)); return; }
    console.log('=== Risk → Direktörlük eşleme önerisi (salt okunur, hiçbir şey yazılmadı) ===');
    console.log(totals);
    const byConf = rows.reduce<Record<string, number>>((a, r) => { a[r.guven as string] = (a[r.guven as string] ?? 0) + 1; return a; }, {});
    console.log('Güven dağılımı:', byConf);
    for (const r of rows) console.log(`  ${r.riskId}  ${String(r.guven).padEnd(8)} ${String(r.kaynak).padEnd(14)} → ${r.oneri ?? '(öneri yok)'}  | ${r.ad}`);
}

if (require.main === module) {
    main().catch((e) => { console.error('❌ Dry-run hatası:', e); process.exit(1); });
}
