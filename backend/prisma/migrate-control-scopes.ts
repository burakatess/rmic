/**
 * Mevcut ControlTest kayıtlarını yeni yıllık kapsam modeline (ControlYearScope)
 * geçirir — plan "Geçiş (Mevcut Veri)".
 *
 * Her Control için mevcut testlerin plannedDate yılına göre gruplanır, o yıl
 * için (yoksa) bir ControlYearScope oluşturulur (Control'ün GÜNCEL frequency/
 * selectedMonths değerleri snapshot alınır) ve her test, kontrolün frekansına
 * göre bir periodKey'e eşlenmeye çalışılır (M01..M12 / Q1..Q4 / H1-H2 / YEAR /
 * W01..W53). Güvenilir şekilde eşleşemeyen (AD_HOC/DAILY, aynı gruba düşen
 * çakışan periyot, eşleşmeyen Cuma tarihi) kayıtlar TAHMİN EDİLİP ZORLANMAZ —
 * scopeId NULL bırakılır ve ayrı bir JSON rapora yazılır.
 *
 * Tamamlanmış/onaylı testler, kanıtlar, bulgu ilişkileri ve onay geçmişi hiç
 * değiştirilmez — yalnızca yeni FK alanları (scopeId/year/periodKey/periodLabel/
 * periodStart/periodEnd) doldurulur.
 *
 * Kullanım:
 *   npx ts-node prisma/migrate-control-scopes.ts --dry     # yalnız rapor
 *   npx ts-node prisma/migrate-control-scopes.ts --apply   # uygula
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { computeScopePeriods } from '../src/modules/controls/control-period.util';

interface UnresolvedEntry {
    testId: string;
    testNo: string;
    controlId: string;
    controlCode: string;
    year: number;
    plannedDate: string;
    reason: string;
}

async function main() {
    const APPLY = process.argv.includes('--apply');
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const unresolved: UnresolvedEntry[] = [];
    let scopesCreated = 0;
    let scopesExisting = 0;
    let testsMigrated = 0;

    try {
        const controls = await prisma.control.findMany({
            select: { id: true, controlId: true, frequency: true, selectedMonths: true, controlDate: true, ownerId: true },
        });

        for (const control of controls) {
            const tests = await prisma.controlTest.findMany({
                where: { controlId: control.id, scopeId: null },
                select: { id: true, testNo: true, plannedDate: true },
                orderBy: { plannedDate: 'asc' },
            });
            if (tests.length === 0) continue;

            const byYear = new Map<number, typeof tests>();
            for (const t of tests) {
                const y = t.plannedDate.getFullYear();
                if (!byYear.has(y)) byYear.set(y, []);
                byYear.get(y)!.push(t);
            }

            for (const [year, yearTests] of byYear) {
                const periods = computeScopePeriods(control.frequency, year, {
                    selectedMonths: control.selectedMonths, controlDate: control.controlDate,
                });
                const periodByKey = new Map(periods.map(p => [p.periodKey, p]));

                // Her test için aday periodKey hesapla (kontrolün GÜNCEL frekansına göre — bkz. dosya başı not)
                const candidates = new Map<string, { key: string | null; reason?: string }>();
                for (const t of yearTests) {
                    const d = t.plannedDate;
                    let key: string | null = null;
                    switch (control.frequency) {
                        case 'MONTHLY':
                            key = `M${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                            break;
                        case 'QUARTERLY':
                            key = `Q${Math.floor(d.getMonth() / 3) + 1}`;
                            break;
                        case 'SEMI_ANNUAL':
                            key = d.getMonth() < 6 ? 'H1' : 'H2';
                            break;
                        case 'ANNUAL':
                            key = 'YEAR';
                            break;
                        case 'WEEKLY': {
                            const match = periods.find(p => p.targetDate.toDateString() === d.toDateString());
                            key = match ? match.periodKey : null;
                            break;
                        }
                        default:
                            key = null; // AD_HOC / DAILY / bilinmeyen — tahmin edilmez
                    }
                    candidates.set(t.id, { key: key && periodByKey.has(key) ? key : null, reason: !key ? `Frekans '${control.frequency}' için güvenilir dönem çıkarımı yok` : (!periodByKey.has(key) ? 'Hesaplanan periyot tanımsız' : undefined) });
                }

                // Aynı gruba/periyoda birden fazla test düşerse (çakışma) — hiçbiri zorlanmaz
                const keyCounts = new Map<string, number>();
                for (const c of candidates.values()) if (c.key) keyCounts.set(c.key, (keyCounts.get(c.key) || 0) + 1);

                const resolvedTests = yearTests.filter(t => {
                    const c = candidates.get(t.id)!;
                    return c.key && keyCounts.get(c.key) === 1;
                });
                const unresolvedTests = yearTests.filter(t => !resolvedTests.includes(t));

                for (const t of unresolvedTests) {
                    const c = candidates.get(t.id)!;
                    const reason = c.key && (keyCounts.get(c.key) || 0) > 1
                        ? `Aynı yıl/dönem (${c.key}) için birden fazla test — çakışma`
                        : (c.reason || 'Eşleşemedi');
                    unresolved.push({
                        testId: t.id, testNo: t.testNo, controlId: control.id, controlCode: control.controlId,
                        year, plannedDate: t.plannedDate.toISOString(), reason,
                    });
                }

                if (resolvedTests.length === 0) continue;

                // Scope oluştur/bul (yalnızca en az 1 test güvenle eşleşiyorsa)
                let scope = await prisma.controlYearScope.findUnique({ where: { controlId_year: { controlId: control.id, year } } });
                if (!scope) {
                    scopesCreated++;
                    if (APPLY) {
                        scope = await prisma.controlYearScope.create({
                            data: {
                                controlId: control.id, year, frequency: control.frequency,
                                selectedMonths: control.selectedMonths, controlDate: control.controlDate,
                                addedById: control.ownerId,
                            },
                        });
                    }
                } else {
                    scopesExisting++;
                }

                for (const t of resolvedTests) {
                    const key = candidates.get(t.id)!.key!;
                    const p = periodByKey.get(key)!;
                    testsMigrated++;
                    if (APPLY && scope) {
                        await prisma.controlTest.update({
                            where: { id: t.id },
                            data: {
                                scopeId: scope.id, year, periodKey: p.periodKey, periodLabel: p.periodLabel,
                                periodStart: p.start, periodEnd: p.end,
                            },
                        });
                    }
                }
            }
        }

        console.log(`Kontrol sayısı: ${controls.length}`);
        console.log(`Scope oluşturulacak/oluşturuldu: ${scopesCreated}, zaten var: ${scopesExisting}`);
        console.log(`Eşleştirilen (migrate edilecek/edildi) test: ${testsMigrated}`);
        console.log(`Eşleştirilemeyen (scopeId=NULL kalacak) test: ${unresolved.length}`);

        const reportPath = path.join(__dirname, 'control-scope-migration-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'DRY-RUN',
            summary: { totalControls: controls.length, scopesCreated, scopesExisting, testsMigrated, testsUnresolved: unresolved.length },
            unresolved,
        }, null, 2));
        console.log(`Rapor yazıldı: ${reportPath}`);

        if (!APPLY) console.log('\n--apply verilmedi, DB değişmedi.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
