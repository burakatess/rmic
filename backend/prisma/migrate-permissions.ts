/**
 * Hedefli, idempotent izin geçişi — Madde 5.
 *
 * Genel seed'i çalıştırmak yerine YALNIZCA eksik `report:*` izinlerini mevcut
 * rollere EKLER. Hiçbir izni kaldırmaz, mevcut özelleştirmeleri EZMEZ.
 *
 * Kullanım:
 *   npx ts-node prisma/migrate-permissions.ts --dry     # yalnız rapor
 *   npx ts-node prisma/migrate-permissions.ts --apply   # uygula
 *
 * Politika (yalnız EKLENİR):
 *   RISK_CONTROL_MANAGER : report:view, report:export, report:org
 *   AUDITOR              : report:view, report:export           (report:org DEĞİL)
 *   AUDITEE              : report:view
 *   IKS_MANAGER          : report:view
 *   SYSTEM_ADMIN         : '*' zaten kapsıyor — dokunulmaz
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const ADD_BY_ROLE: Record<string, string[]> = {
    RISK_CONTROL_MANAGER: ['report:view', 'report:export', 'report:org'],
    AUDITOR: ['report:view', 'report:export'],
    AUDITEE: ['report:view'],
    IKS_MANAGER: ['report:view'],
};

async function main() {
    const APPLY = process.argv.includes('--apply');
    console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } });
        let changed = 0;
        for (const role of roles) {
            const want = ADD_BY_ROLE[role.name];
            if (!want) continue;
            const perms = (role.permissions as string[]) ?? [];
            const current = new Set(perms);
            if (current.has('*')) { console.log(`  ${role.name}: '*' — atlandı`); continue; }
            const missing = want.filter((p) => !current.has(p));
            if (missing.length === 0) { console.log(`  ${role.name}: güncel`); continue; }

            console.log(`  ${role.name}: + ${missing.join(', ')}`);
            changed++;
            if (APPLY) {
                await prisma.role.update({
                    where: { id: role.id },
                    data: { permissions: [...perms, ...missing] },
                });
            }
        }
        console.log(`\n${changed} rol ${APPLY ? 'güncellendi' : 'güncellenecek'}.`);
        if (!APPLY) console.log('--apply verilmedi, DB değişmedi.');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
