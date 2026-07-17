/**
 * IKS rolleri seed'i — mevcut veriyi SİLMEZ, yalnızca rolleri upsert eder.
 * Çalıştırma: npx ts-node --project tsconfig.json prisma/seed-roles.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const roles = [
        {
            name: 'IKS_EMPLOYEE',
            description: 'İç Kontrol Sistemi Çalışanı',
            permissions: ['dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute'],
        },
        {
            name: 'IKS_MANAGER',
            description: 'İç Kontrol Sistemi Yöneticisi',
            permissions: [
                'dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute',
                'finding:update', 'finding:create', 'action:update', 'action:create', 'report:view',
            ],
        },
    ];

    for (const r of roles) {
        const role = await prisma.role.upsert({
            where: { name: r.name },
            update: { description: r.description, permissions: r.permissions },
            create: r,
        });
        console.log(`✅ Rol upsert: ${role.name}`);
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
