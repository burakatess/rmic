/**
 * Kayıt kapsamı (RECORD_SCOPE_ENFORCEMENT) açılmadan ÖNCE etki raporu — SALT OKUNUR.
 *
 * Tüm sorgular `SET TRANSACTION READ ONLY` ile açılmış tek bir transaction içinde
 * çalışır ve sonunda geri alınır; veritabanına hiçbir şey yazılmaz.
 *
 * Rapor:
 *  1. Sistem rolleri: DB'deki izinler ile varsayılan (prisma/system-roles.ts) farkı.
 *  2. Kullanıcı başına: birim üyeliği, kapsam açıldığında görünecek kayıt sayıları
 *     (a) DB'deki mevcut izinlerle, (b) varsayılan izinler senkronize edilirse.
 *  3. Kapsam kaynağı eksik kayıtlar (direktörlüğü olmayan bulgu/test) — yöneticiye
 *     gösterilmesi gereken boşluklar.
 *
 * Kullanım:  npx ts-node prisma/access-scope-dry-run.ts [--json]
 * Kişisel veri: kullanıcılar e-posta yerine iç kimlik + rol ile listelenir.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { SYSTEM_ROLES } from './system-roles';
import {
    actionWhere, buildAccessContext, controlTestWhere, findingFullWhere, followUpWhere, riskWhere,
} from '../src/common/services/access-scope.service';

const NEW_SCOPE_PERMISSIONS = ['scope:org', 'scope:org:risk', 'evidence:view', 'finding:delete', 'finding:delete:own'];

function permList(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : [];
}

async function visibleCounts(tx: Prisma.TransactionClient, userId: string, perms: string[], units: string[]) {
    const ctx = buildAccessContext({ id: userId, permissions: perms }, units, true);
    const w = <T>(x: T | null) => (x ?? {}) as T;
    const [findings, actions, followUps, tests, risks] = await Promise.all([
        tx.finding.count({ where: w(findingFullWhere(ctx)) }),
        tx.action.count({ where: w(actionWhere(ctx)) }),
        tx.findingFollowUp.count({ where: w(followUpWhere(ctx)) }),
        tx.controlTest.count({ where: w(controlTestWhere(ctx)) }),
        tx.risk.count({ where: w(riskWhere(ctx)) }),
    ]);
    return { findings, actions, followUps, tests, risks };
}

async function main() {
    const asJson = process.argv.includes('--json');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const report: Record<string, unknown> = {};

    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;

            const roles = await tx.role.findMany({ select: { id: true, name: true, permissions: true } });
            const defaults = new Map(SYSTEM_ROLES.map(r => [r.name, r.permissions]));
            report.roles = roles.map(r => {
                const current = permList(r.permissions);
                const def = defaults.get(r.name);
                return {
                    role: r.name,
                    systemRole: !!def,
                    missingDefaults: def && !current.includes('*') ? def.filter(p => !current.includes(p)) : [],
                    missingNewScopePermissions: current.includes('*') ? [] : NEW_SCOPE_PERMISSIONS.filter(p => def?.includes(p) && !current.includes(p)),
                };
            });

            const users = await tx.user.findMany({
                where: { isActive: true },
                select: { id: true, role: { select: { name: true, permissions: true } }, directorateMemberships: { select: { directorateId: true } } },
                orderBy: { createdAt: 'asc' },
            });
            const totals = {
                findings: await tx.finding.count(), actions: await tx.action.count(),
                followUps: await tx.findingFollowUp.count(), tests: await tx.controlTest.count(), risks: await tx.risk.count(),
            };
            report.totals = totals;
            report.users = [];
            for (const u of users) {
                const units = u.directorateMemberships.map(m => m.directorateId);
                const dbPerms = permList(u.role.permissions);
                const defPerms = defaults.get(u.role.name) ?? dbPerms;
                (report.users as unknown[]).push({
                    user: `…${u.id.slice(-6)}`,
                    role: u.role.name,
                    memberships: units.length,
                    visibleWithCurrentDbPermissions: await visibleCounts(tx, u.id, dbPerms, units),
                    visibleAfterDefaultPermissionSync: await visibleCounts(tx, u.id, defPerms, units),
                });
            }

            report.scopeGaps = {
                findingsWithoutDirectorate: await tx.finding.count({ where: { directorateId: null } }),
                controlTestsWithoutDirectorate: await tx.controlTest.count({ where: { directorateId: null, control: { directorateId: null } } }),
                activeUsersWithoutMembership: users.filter(u => u.directorateMemberships.length === 0).map(u => ({ user: `…${u.id.slice(-6)}`, role: u.role.name })),
                // Direktörlüğü boş ve kurum geneli işaretli olmayan risk yalnız kurum geneli kapsamlılara ve sahibine görünür.
                risksWithoutDirectorate: await tx.risk.count({ where: { directorateId: null, isOrgWide: false } }),
                note: 'Direktörlüksüz riskler için öneri raporu: prisma/risk-directorate-dry-run.ts (otomatik backfill yapılmaz).',
            };

            // Değişikliklerin geri alındığından emin olmak için transaction bilinçli olarak iptal edilir.
            throw new DryRunRollback();
        });
    } catch (e) {
        if (!(e instanceof DryRunRollback)) throw e;
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }

    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log('=== Kayıt kapsamı dry-run (salt okunur, hiçbir şey yazılmadı) ===\n');
    console.log('Toplam kayıt:', report.totals);
    console.log('\n-- Roller: varsayılana göre eksik izinler --');
    for (const r of report.roles as any[]) {
        if (!r.systemRole) { console.log(`  ${r.role}: sistem rolü değil (özel rol) — elle değerlendirin`); continue; }
        console.log(`  ${r.role}: eksik yeni kapsam izinleri [${r.missingNewScopePermissions.join(', ') || '-'}]; tüm eksikler [${r.missingDefaults.join(', ') || '-'}]`);
    }
    console.log('\n-- Kullanıcılar: kapsam açılınca görünecek kayıtlar (mevcut DB izinleri → varsayılan izinler senkronize edilirse) --');
    for (const u of report.users as any[]) {
        const a = u.visibleWithCurrentDbPermissions, b = u.visibleAfterDefaultPermissionSync;
        const fmt = (k: string) => `${k}=${a[k]}→${b[k]}`;
        console.log(`  ${u.user} ${u.role.padEnd(22)} üyelik=${u.memberships}  ${['findings', 'actions', 'followUps', 'tests', 'risks'].map(fmt).join('  ')}`);
    }
    console.log('\n-- Kapsam boşlukları --');
    console.log(report.scopeGaps);
}

class DryRunRollback extends Error { }

main().catch((e) => { console.error('❌ Dry-run hatası:', e); process.exit(1); });
