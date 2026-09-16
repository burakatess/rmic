/**
 * Risk Simülasyonu için TEK satırlık, idempotent methodology seed — grc_db gibi
 * canlı verisi olan bir veritabanına uygulanır. Ana `seed.ts`'in aksine HİÇBİR
 * tabloyu silmez/temizlemez; yalnızca SimulationMethodology V1 yoksa ekler.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { METHODOLOGY_V1 } from '../src/modules/risk-simulation/calculation-engine';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const existing = await prisma.simulationMethodology.findUnique({ where: { version: METHODOLOGY_V1.version } });
    if (existing) {
        console.log(`SimulationMethodology v${METHODOLOGY_V1.version} zaten mevcut (id=${existing.id}) — atlanıyor.`);
        return;
    }

    const admin = await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('SYSTEM_ADMIN rolüne sahip bir kullanıcı bulunamadı — createdById için gerekli.');

    const created = await prisma.simulationMethodology.create({
        data: {
            version: METHODOLOGY_V1.version, config: METHODOLOGY_V1 as any, isActive: true,
            changeNote: 'İlk sürüm — calculation-engine.ts::METHODOLOGY_V1 ile birebir.',
            createdById: admin.id,
        },
    });
    console.log(`SimulationMethodology v${created.version} eklendi (id=${created.id}, createdBy=${admin.email}).`);

    // RecordCounter senkronizasyonu — audits.service.ts::createAction (nextCounterValue
    // tabanlı) ile bu ortamdaki mevcut en yüksek Action/FollowUp sıra numarası arasında
    // fark varsa (RecordCounter hiç kullanılmamışsa scope=0'dan başlar), Risk Simülasyonu
    // transferi (veya bu servisi kullanan başka bir akış) mevcut kayıtlarla ÇAKIŞABİLİR.
    // Bu yüzden burada da (grc_verify'de yapıldığı gibi) senkronize ediliyor.
    for (const [scope, prefix, table, idField] of [
        ['action', 'A-', 'action', 'actionId'],
        ['followup', 'T-', 'findingFollowUp', 'followUpId'],
    ] as const) {
        const rows: { id: string }[] = await (prisma as any)[table].findMany({
            select: { [idField]: true },
            where: { [idField]: { startsWith: prefix } },
        }).then((r: any[]) => r.map((x) => ({ id: x[idField] })));
        let maxSeq = 0;
        for (const r of rows) {
            const parts = r.id.split('-');
            const n = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(n) && n > maxSeq) maxSeq = n;
        }
        const counter = await prisma.recordCounter.findUnique({ where: { scope } });
        if (!counter || counter.value < maxSeq) {
            await prisma.recordCounter.upsert({ where: { scope }, update: { value: maxSeq }, create: { scope, value: maxSeq } });
            console.log(`RecordCounter[${scope}] ${counter?.value ?? '(yok)'} → ${maxSeq} olarak senkronize edildi.`);
        } else {
            console.log(`RecordCounter[${scope}] zaten güncel (${counter.value} >= ${maxSeq}).`);
        }
    }
}

main()
    .catch((e) => { console.error('Hata:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
