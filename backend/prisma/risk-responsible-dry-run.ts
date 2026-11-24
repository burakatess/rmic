/**
 * Risk Sorumlusu → kullanıcı eşleme önerisi — SALT OKUNUR (READ ONLY transaction, sonda geri alınır).
 *
 * 20261104100000_gmy_and_risk_responsible migration'ı serbest metin `riskSorumlusu`yu kişiye
 * OTOMATİK bağlamaz. Bu rapor, kullanıcıya bağlanmamış her risk için aynı ad-soyadlı AKTİF
 * kullanıcıları listeler. Hiçbir kayıt güncellenmez; eşleme risk ekranından yapılır.
 * Güven:
 *  - TEK   : metin tam olarak bir aktif kullanıcının "Ad Soyad"ı ile eşleşiyor (büyük/küçük harf duyarsız)
 *  - ÇOKLU : birden fazla aynı adlı kullanıcı → elle karar
 *  - YOK   : eşleşen kullanıcı yok → elle karar
 *
 * Kullanım: npx ts-node --transpile-only prisma/risk-responsible-dry-run.ts [--json]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

class DryRunRollback extends Error { }

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');

export function matchResponsible(text: string, users: { id: string; firstName: string; lastName: string }[]) {
    const hits = users.filter(u => norm(`${u.firstName} ${u.lastName}`) === norm(text));
    return { userIds: hits.map(u => u.id), confidence: hits.length === 1 ? 'TEK' : hits.length > 1 ? 'ÇOKLU' : 'YOK' };
}

async function main() {
    const asJson = process.argv.includes('--json');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const rows: Record<string, unknown>[] = [];
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const users = await tx.user.findMany({ where: { isActive: true }, select: { id: true, firstName: true, lastName: true } });
            const risks = await tx.risk.findMany({
                where: { riskSorumlusuId: null, NOT: [{ riskSorumlusu: null }, { riskSorumlusu: '' }] },
                select: { riskId: true, name: true, riskSorumlusu: true },
                orderBy: { riskId: 'asc' },
            });
            for (const r of risks) {
                const m = matchResponsible(r.riskSorumlusu!, users);
                rows.push({ riskId: r.riskId, metin: r.riskSorumlusu, guven: m.confidence, adaylar: m.userIds, ad: r.name.slice(0, 60) });
            }
            throw new DryRunRollback();
        });
    } catch (e) {
        if (!(e instanceof DryRunRollback)) throw e;
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
    if (asJson) { console.log(JSON.stringify(rows, null, 2)); return; }
    console.log('=== Risk Sorumlusu → kullanıcı eşleme önerisi (salt okunur, hiçbir şey yazılmadı) ===');
    console.log(`Kullanıcıya bağlanmamış serbest metinli risk: ${rows.length}`);
    for (const r of rows) console.log(`  ${r.riskId}  ${String(r.guven).padEnd(6)} "${r.metin}" → ${(r.adaylar as string[]).join(', ') || '(aday yok)'}  | ${r.ad}`);
}

if (require.main === module) {
    main().catch((e) => { console.error('❌ Dry-run hatası:', e); process.exit(1); });
}
