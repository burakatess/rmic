/**
 * Hedefli izin geçişi — uygulayıcı. Plan: prisma/permission-migration.plan.ts
 *
 *   Varsayılan (dry-run, SALT OKUNUR): rapor üretir, hiçbir şey yazmaz.
 *     npx ts-node --transpile-only prisma/permission-migration.ts
 *   Uygulama (gerçek DB değişikliği — yedek + onay ile):
 *     npx ts-node --transpile-only prisma/permission-migration.ts --apply
 *
 * Tekrar çalıştırılabilir: her rol için tek transaction'da izin eklenir + PERMISSION_MIGRATION
 * işareti (denetim kaydı) yazılır. İşaretli role bir daha dokunulmaz. Hiçbir izin KALDIRILMAZ.
 * Rapor ayrıca katalogda olmayan eski anahtarları ve önerilen karşılıklarını listeler
 * (otomatik dönüştürülmez).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { INTENTIONALLY_NOT_GRANTED, MIGRATION_KEY, planPermissionMigration } from './permission-migration.plan';
import { isKnownPermission, LEGACY_PERMISSION_MAP } from '../src/common/permissions/permission-catalog';

class ReadOnlyRollback extends Error { }

async function main() {
    const apply = process.argv.includes('--apply');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true, _count: { select: { users: true } } } });
        const markers = await prisma.auditLog.findMany({
            where: { action: 'PERMISSION_MIGRATION', entityType: 'Role' },
            select: { entityId: true, newValue: true },
        });
        const migrated = new Set(markers.filter(m => (m.newValue as { migration?: string } | null)?.migration === MIGRATION_KEY).map(m => m.entityId));
        const plan = planPermissionMigration(roles, migrated);
        const users = new Map(roles.map(r => [r.name, r._count.users]));

        console.log(`=== Hedefli izin geçişi ${MIGRATION_KEY} — ${apply ? 'UYGULAMA' : 'DRY-RUN (hiçbir şey yazılmaz)'} ===\n`);
        console.log('Rol | kullanıcı | mevcut izin | eklenecek | zaten kapsanan | gerekçe → erişim etkisi');
        for (const r of plan) {
            console.log(`\n${r.role} (${users.get(r.role) ?? 0} kullanıcı)${r.skippedBecauseMigrated ? ' — DAHA ÖNCE GEÇİRİLDİ, dokunulmaz' : ''}`);
            console.log(`  mevcut: ${r.current.join(', ') || '(yok)'}`);
            for (const a of r.add) console.log(`  + ${a.permission}: ${a.reason} → ${a.impact}`);
            for (const c of r.alreadyCovered) console.log(`  = ${c.permission} zaten kapsanıyor (${c.by})`);
            if (!r.add.length && !r.alreadyCovered.length) console.log('  (değişiklik yok)');
        }
        console.log('\n-- Bilinçli olarak EKLENMEYENLER --');
        for (const n of INTENTIONALLY_NOT_GRANTED) console.log(`  ${n.role}: ${n.permission} — ${n.reason}`);

        console.log('\n-- Katalogda olmayan eski anahtarlar (otomatik dönüştürülmez) --');
        let legacyCount = 0;
        for (const role of roles) {
            const perms = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
            for (const p of perms.filter(x => !isKnownPermission(x))) {
                legacyCount++;
                const m = LEGACY_PERMISSION_MAP[p];
                console.log(`  ${role.name}: ${p} → ${m?.target ? `${m.target} (${m.equivalent ? 'eşdeğer' : 'eşdeğer DEĞİL'})` : 'karşılığı yok'}${m?.note ? ` — ${m.note}` : ''}`);
            }
        }
        if (!legacyCount) console.log('  (yok)');

        if (!apply) {
            // Salt okunur doğrulama: rapor yalnız okuma yaptı; ek güvence olarak READ ONLY tx açılıp kapatılır.
            await prisma.$transaction(async (tx) => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; throw new ReadOnlyRollback(); }).catch((e) => { if (!(e instanceof ReadOnlyRollback)) throw e; });
            console.log('\nDRY-RUN tamamlandı. Uygulamak için: --apply (yedek ve onay sonrası).');
            return;
        }

        for (const r of plan.filter(x => !x.skippedBecauseMigrated)) {
            const role = roles.find(x => x.name === r.role)!;
            await prisma.$transaction(async (tx) => {
                const fresh = await tx.role.findUniqueOrThrow({ where: { id: role.id }, select: { permissions: true } });
                const current = Array.isArray(fresh.permissions) ? (fresh.permissions as string[]) : [];
                const added = r.add.map(a => a.permission).filter(p => !current.includes(p));
                if (added.length) await tx.role.update({ where: { id: role.id }, data: { permissions: [...current, ...added] } });
                await tx.auditLog.create({
                    data: {
                        action: 'PERMISSION_MIGRATION', entityType: 'Role', entityId: role.id, actorType: 'SYSTEM',
                        oldValue: { permissions: current },
                        newValue: { migration: MIGRATION_KEY, added, permissions: [...current, ...added] },
                    },
                });
            });
            console.log(`  ✓ ${r.role}: ${r.add.length ? r.add.map(a => a.permission).join(', ') : 'değişiklik yok'} (işaretlendi)`);
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((e) => { console.error('❌ İzin geçişi hatası:', e); process.exit(1); });
}
