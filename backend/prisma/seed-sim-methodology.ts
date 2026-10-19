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

    // Business identifier sayaçları yalnız domain migration/servisleri tarafından
    // yönetilir; methodology seed'i numaralandırma state'ine dokunmaz.
}

main()
    .catch((e) => { console.error('Hata:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
