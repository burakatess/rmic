/**
 * Mevcut (yeni `code`/`controlVersion`/snapshot alanlarından ÖNCE oluşturulmuş)
 * `ControlYearScope` (Dönem Kontrolü) satırlarını doldurur — plan Faz 4.
 *
 * Her satır için:
 *   code             = "{yıl}.{ana kontrol kodu}" (computePeriodCode — sayaç
 *                       gerekmez, controlId+year zaten @@unique).
 *   controlVersion   = 1 (bu geçmiş dönemler zaten uygulanmış; makul başlangıç
 *                       varsayımı — kontrolün o zamanki gerçek tanımı elde
 *                       tutulmuyor, bu yüzden "sürüm 1" ile başlatılır ve
 *                       mevcut tanım snapshot olarak dondurulur).
 *   snapshot*        = Control'ün GÜNCEL description/testSteps/mehaz/name'i
 *                       (geçmişe dönük gerçek o-anki tanım geri getirilemez —
 *                       bu, "artık geriye dönük bilgi yok" durumunu dürüstçe
 *                       en iyi yaklaşımla doldurur, veri uydurmaz).
 *
 * Yalnızca `code IS NULL` olan satırlar işlenir — idempotent, tekrar
 * çalıştırma zaten doldurulmuş satırları atlar.
 *
 * Kullanım:
 *   npx ts-node prisma/backfill-period-codes.ts            # dry-run (varsayılan)
 *   npx ts-node prisma/backfill-period-codes.ts --apply    # gerçekten uygula
 *
 * ÖNEMLİ: Bu script bu çalışma kapsamında ÜRETİM DB'sine (grc_db) karşı
 * --apply ile ÇALIŞTIRILMAMIŞTIR — yalnızca izole test DB'de doğrulanmıştır.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { computePeriodCode } from '../src/modules/controls/period-code.util';

interface BackfillEntry {
    scopeId: string;
    controlId: string;
    controlCode: string;
    year: number;
    code: string;
}

interface ConflictEntry {
    scopeId: string;
    code: string;
    reason: string;
}

async function main() {
    const APPLY = process.argv.includes('--apply');
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const backfilled: BackfillEntry[] = [];
    const conflicts: ConflictEntry[] = [];
    let alreadyFilled = 0;

    try {
        const scopes = await prisma.controlYearScope.findMany({
            where: { code: null },
            orderBy: [{ year: 'asc' }, { controlId: 'asc' }],
            include: { control: { select: { id: true, controlId: true, name: true, description: true, testSteps: true, mehaz: true, version: true } } },
        });

        const alreadyFilledCount = await prisma.controlYearScope.count({ where: { NOT: { code: null } } });
        alreadyFilled = alreadyFilledCount;

        for (const scope of scopes) {
            const code = computePeriodCode(scope.control.controlId, scope.year);

            const collision = await prisma.controlYearScope.findUnique({ where: { code }, select: { id: true } });
            if (collision) {
                conflicts.push({ scopeId: scope.id, code, reason: `"${code}" zaten başka bir dönem kaydında kullanılıyor` });
                continue;
            }

            backfilled.push({ scopeId: scope.id, controlId: scope.control.id, controlCode: scope.control.controlId, year: scope.year, code });

            if (APPLY) {
                await prisma.controlYearScope.update({
                    where: { id: scope.id },
                    data: {
                        code,
                        controlVersion: 1,
                        snapshotName: scope.control.name, snapshotDescription: scope.control.description,
                        snapshotTestSteps: scope.control.testSteps, snapshotMehaz: scope.control.mehaz,
                    },
                });
            }
        }

        console.log(`Toplam dönem kaydı (kod eksik): ${scopes.length}`);
        console.log(`Zaten dolu (atlanan): ${alreadyFilled}`);
        console.log(`Yeni dolduruldu: ${backfilled.length}`);
        console.log(`Çakışma (atlanan): ${conflicts.length}`);

        const reportPath = path.join(__dirname, 'backfill-period-codes-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'DRY-RUN',
            summary: { totalMissingCode: scopes.length, alreadyFilled, backfilled: backfilled.length, conflicts: conflicts.length },
            backfilled, conflicts,
        }, null, 2));
        console.log(`Rapor yazıldı: ${reportPath}`);

        if (!APPLY) console.log('\n--apply verilmedi, DB değişmedi.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
