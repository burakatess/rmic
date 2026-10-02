/**
 * Mevcut kontrol kodlarını (K-YYYY-NNNN) kalıcı BTK.XXXX (nokta ayıracı) formatına geçirir —
 * plan "BTK Kod Reformu".
 *
 * Her Control için `control-code` RecordCounter sayacından (aynı atomik
 * sayaç, generateControlCode() ile birebir) YENİ, BAĞIMSIZ bir BTK kodu
 * alınır — eski kodun sonek numarası HİÇBİR ŞEKİLDE yeniden kullanılmaz
 * (farklı yıllarda aynı sonek çakışması — örn. K-2026-0042 / K-2027-0042 —
 * bu tasarımda yapı gereği oluşamaz, "yalnızca prefix değiştirme" YAPILMAZ).
 * Eski kod → yeni kod eşlemesi CodeAlias tablosuna yazılır (eski kodla arama
 * desteği için); `--apply` verilmezse yalnızca rapor üretilir, DB değişmez.
 * Zaten migrate edilmiş kayıt (CodeAlias'ta source='MIGRATION' satırı varsa)
 * atlanır — script tekrar çalıştırılabilir (idempotent).
 *
 * Teknik ID'ler (Control.id / CUID) ve tüm ilişkiler DEĞİŞMEZ — yalnızca
 * görünür `controlId` alanı güncellenir.
 *
 * Dönem Kontrolü kod tutarlılığı (madde 22 — "dönem kontrol haritası"):
 * kontrolün `controlId`'si değiştiğinde, o kontrole bağlı ve ZATEN kod
 * atanmış (backfill'den veya normal akıştan gelen) `ControlYearScope.code`
 * değerleri de AYNI transaction içinde `{yıl}.{yeni kod}` olarak yeniden
 * hesaplanır — aksi halde dönem kodu kalıcı olarak eski, artık var olmayan
 * ana kontrol koduna işaret ederdi.
 *

 * Kullanım:
 *   npx ts-node prisma/migrate-btk-codes.ts            # dry-run (varsayılan)
 *   npx ts-node prisma/migrate-btk-codes.ts --apply     # gerçekten uygula
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
import { nextCounterValue } from '../src/common/util/sequential-id';
import { computePeriodCode } from '../src/modules/controls/period-code.util';

interface MappingEntry {
    controlId: string; // teknik ID (CUID) — değişmez
    oldCode: string;
    newCode: string;
    periodCodesUpdated: { scopeId: string; year: number; oldPeriodCode: string | null; newPeriodCode: string }[];
}

interface ConflictEntry {
    controlId: string;
    newCode: string;
    reason: string;
}

async function main() {
    const APPLY = process.argv.includes('--apply');
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const mapping: MappingEntry[] = [];
    const conflicts: ConflictEntry[] = [];
    let alreadyMigrated = 0;
    let newlyMapped = 0;

    // Dry-run'da GERÇEK sayacı (RecordCounter) İLERLETMEYİZ — yalnızca mevcut
    // değeri bir kez okuyup bellekte simüle ederiz. Böylece dry-run tekrar
    // çalıştırılınca aynı önizlemeyi verir ve "--apply verilmedi, DB
    // değişmedi" mesajı gerçeği yansıtır (RecordCounter dahil).
    let dryRunCounter: number | null = null;
    const nextCode = async (): Promise<string> => {
        if (APPLY) {
            const value = await nextCounterValue(prisma, 'control-code');
            return `BTK.${value.toString().padStart(4, '0')}`;
        }
        if (dryRunCounter === null) {
            const row = await prisma.recordCounter.findUnique({ where: { scope: 'control-code' } });
            dryRunCounter = row?.value ?? 0;
        }
        dryRunCounter += 1;
        return `BTK.${dryRunCounter.toString().padStart(4, '0')}`;
    };

    try {
        // Deterministik sıra — aynı script birden çok kez çalıştırıldığında
        // (henüz migrate edilmemiş kalan kayıtlar için) tutarlı davranır.
        const controls = await prisma.control.findMany({
            orderBy: [{ createdAt: 'asc' }, { controlId: 'asc' }],
            select: { id: true, controlId: true },
        });

        for (const control of controls) {
            const existingAlias = await prisma.codeAlias.findFirst({
                where: { entityType: 'CONTROL', entityId: control.id, source: 'MIGRATION' },
            });
            if (existingAlias) {
                alreadyMigrated++;
                mapping.push({ controlId: control.id, oldCode: control.controlId, newCode: existingAlias.newCode, periodCodesUpdated: [] });
                continue;
            }
            if (control.controlId.startsWith('BTK.')) {
                // Zaten yeni formatta (örn. bu script öncesinde manuel oluşturulmuş) — atla.
                alreadyMigrated++;
                continue;
            }

            const newCode = await nextCode();

            // Savunmacı çakışma kontrolü — bağımsız sayaçtan geldiği için pratikte
            // asla tetiklenmemeli, ama sessizce güvenmek yerine doğrulanır.
            const collision = await prisma.control.findUnique({ where: { controlId: newCode }, select: { id: true } });
            if (collision) {
                conflicts.push({ controlId: control.id, newCode, reason: `"${newCode}" zaten başka bir kontrolde kullanılıyor` });
                continue;
            }

            // Bu kontrole bağlı, ZATEN kod atanmış dönem kayıtları — yeni ana
            // kontrol koduyla tutarlı kalması için birlikte yeniden hesaplanır.
            const linkedScopes = await prisma.controlYearScope.findMany({
                where: { controlId: control.id, code: { not: null } },
                select: { id: true, year: true, code: true },
            });
            const periodCodesUpdated = linkedScopes.map(s => ({
                scopeId: s.id, year: s.year, oldPeriodCode: s.code, newPeriodCode: computePeriodCode(newCode, s.year),
            }));

            mapping.push({ controlId: control.id, oldCode: control.controlId, newCode, periodCodesUpdated });
            newlyMapped++;

            if (APPLY) {
                await prisma.$transaction([
                    prisma.codeAlias.create({
                        data: { entityType: 'CONTROL', entityId: control.id, oldCode: control.controlId, newCode, source: 'MIGRATION' },
                    }),
                    prisma.control.update({ where: { id: control.id }, data: { controlId: newCode } }),
                    ...periodCodesUpdated.map(p =>
                        prisma.controlYearScope.update({ where: { id: p.scopeId }, data: { code: p.newPeriodCode } })),
                ]);
            }
        }

        const periodCodesUpdatedTotal = mapping.reduce((sum, m) => sum + m.periodCodesUpdated.length, 0);

        console.log(`Kontrol sayısı: ${controls.length}`);
        console.log(`Zaten migrate edilmiş: ${alreadyMigrated}`);
        console.log(`Yeni eşlenen: ${newlyMapped}`);
        console.log(`Çakışma (atlanan): ${conflicts.length}`);
        console.log(`Birlikte güncellenen dönem kontrolü kodu: ${periodCodesUpdatedTotal}`);

        const reportPath = path.join(__dirname, 'btk-code-migration-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'DRY-RUN',
            summary: { totalControls: controls.length, alreadyMigrated, newlyMapped, conflicts: conflicts.length, periodCodesUpdated: periodCodesUpdatedTotal },
            mapping, conflicts,
        }, null, 2));
        console.log(`Rapor yazıldı: ${reportPath}`);

        if (!APPLY) console.log('\n--apply verilmedi, DB değişmedi (RecordCounter dahil).');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
