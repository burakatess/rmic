/**
 * Eski test kodları (TST-YYYY-NNNN) için YENİ ŞEMANIN (YYYY.BTK.XXXX.TN, nokta ayıracı)
 * hipotetik karşılığını hesaplayıp yalnızca RAPOR/eşleme (CodeAlias) üretir —
 * plan "BTK Kod Reformu — test kodları".
 *
 * ÖNEMLİ: Bu script `ControlTest.testNo` alanına HİÇBİR ZAMAN YAZMAZ — ne
 * dry-run ne de `--apply` modunda. Üretilmiş testin kodu kalıcıdır (madde
 * 13: "Tarih değişince kod değişmez"); tarihsel kayıtları yeniden adlandırmak
 * geçmiş audit/kanıt metinleriyle referans bütünlüğünü bozar. `--apply`
 * yalnızca `CodeAlias` (entityType='CONTROL_TEST') satırları yazar — eski
 * test koduyla arama/rapor eşlemesi için.
 *
 * Numaralandırma: her (control, year) grubu kendi içinde `plannedDate`'e göre
 * kronolojik sıralanır (eşitlikte testNo ile), T1'den başlanır — madde 13'ün
 * "ilk üretimde kronolojik hedef tarih sırasına göre numaralandır" kuralı.
 * AD_HOC dahil TÜM testler aynı (control, year) sayacını paylaşır.
 *
 * Not: `control.controlId` migrate-btk-codes.ts ile önceden BTK.XXXX'e
 * çevrilmemişse, hipotetik kod o kontrolün MEVCUT (eski) kodunu kullanır —
 * script yine de çalışır, yalnızca gösterim amaçlı kod BTK. öneki taşımaz.
 * Temiz bir rapor için önce migrate-btk-codes.ts'in çalıştırılması önerilir.
 *
 * Kullanım:
 *   npx ts-node prisma/migrate-btk-test-codes.ts            # dry-run (varsayılan)
 *   npx ts-node prisma/migrate-btk-test-codes.ts --apply    # yalnızca CodeAlias yazar
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

interface MappingEntry {
    testId: string; // teknik ID (CUID) — değişmez
    oldCode: string;
    newCode: string;
    controlCode: string;
    year: number;
}

interface SkippedEntry {
    testId: string;
    testNo: string;
    reason: string;
}

const NEW_FORMAT_RE = /^\d{4}\..+\.T\d+$/;

async function main() {
    const APPLY = process.argv.includes('--apply');
    console.log(`Mod: ${APPLY ? 'APPLY (yalnızca CodeAlias — testNo asla değişmez)' : 'DRY-RUN'}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const mapping: MappingEntry[] = [];
    const skipped: SkippedEntry[] = [];
    let alreadyMapped = 0;

    try {
        const tests = await prisma.controlTest.findMany({
            select: { id: true, testNo: true, controlId: true, year: true, plannedDate: true, control: { select: { controlId: true } } },
            orderBy: [{ controlId: 'asc' }, { plannedDate: 'asc' }, { testNo: 'asc' }],
        });

        // (controlId, year) bazında grupla — her grup kendi T1'inden başlar.
        const groups = new Map<string, typeof tests>();
        for (const t of tests) {
            if (NEW_FORMAT_RE.test(t.testNo)) { alreadyMapped++; continue; } // zaten yeni şema
            const year = t.year ?? t.plannedDate?.getFullYear();
            if (year == null) {
                skipped.push({ testId: t.id, testNo: t.testNo, reason: 'Yıl belirlenemedi (year ve plannedDate ikisi de boş)' });
                continue;
            }
            const key = `${t.controlId}:${year}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(t);
        }

        for (const [key, groupTests] of groups) {
            const [, yearStr] = key.split(':');
            const year = Number(yearStr);
            const controlCode = groupTests[0].control.controlId;
            let n = 1;
            for (const t of groupTests) {
                const existingAlias = await prisma.codeAlias.findFirst({
                    where: { entityType: 'CONTROL_TEST', entityId: t.id, source: 'MIGRATION' },
                });
                const newCode = existingAlias ? existingAlias.newCode : `${year}.${controlCode}.T${n}`;
                n++;
                if (existingAlias) { alreadyMapped++; mapping.push({ testId: t.id, oldCode: t.testNo, newCode, controlCode, year }); continue; }

                mapping.push({ testId: t.id, oldCode: t.testNo, newCode, controlCode, year });
                if (APPLY) {
                    await prisma.codeAlias.create({
                        data: { entityType: 'CONTROL_TEST', entityId: t.id, oldCode: t.testNo, newCode, source: 'MIGRATION' },
                    });
                }
            }
        }

        console.log(`Toplam test: ${tests.length}`);
        console.log(`Zaten yeni şemada/eşlenmiş: ${alreadyMapped}`);
        console.log(`Yeni eşlenen (yalnızca rapor${APPLY ? ' + CodeAlias' : ''}): ${mapping.length - alreadyMapped}`);
        console.log(`Atlanan: ${skipped.length}`);

        const reportPath = path.join(__dirname, 'btk-test-code-migration-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'DRY-RUN',
            summary: { totalTests: tests.length, alreadyMapped, newlyMapped: mapping.length - alreadyMapped, skipped: skipped.length },
            mapping, skipped,
        }, null, 2));
        console.log(`Rapor yazıldı: ${reportPath}`);

        if (!APPLY) console.log('\n--apply verilmedi, DB değişmedi.');
        console.log('NOT: ControlTest.testNo bu script tarafından HİÇBİR ZAMAN yazılmaz.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
