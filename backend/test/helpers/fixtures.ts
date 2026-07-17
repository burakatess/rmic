import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const TEST_PASSWORD = 'TestE2E1234!';

/**
 * Test DB'sindeki tüm uygulama tablolarını TRUNCATE CASCADE ile temizler.
 * İzole test DB'sinde çalıştığı için güvenli — prod/dev DB'sine asla dokunmaz
 * (bağlantı .env.test'teki grc_db_test'e sabit).
 */
export async function resetDatabase(prisma: PrismaClient) {
    const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%';
    `);
    if (tables.length === 0) return;
    const names = tables.map(t => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
}

export async function seedRoles(prisma: PrismaClient) {
    const roles = [
        { name: 'SYSTEM_ADMIN', permissions: ['*'] },
        { name: 'RISK_CONTROL_MANAGER', permissions: ['finding:view', 'finding:create', 'finding:update', 'action:*', 'control:*'] },
        { name: 'AUDITOR', permissions: ['finding:view', 'finding:create', 'action:view', 'action:create', 'control:view', 'control:test'] },
        { name: 'VIEWER', permissions: ['finding:view', 'control:view', 'action:view'] },
    ];
    const created: Record<string, string> = {};
    for (const r of roles) {
        const role = await prisma.role.create({ data: r });
        created[r.name] = role.id;
    }
    return created;
}

export async function createTestUser(
    prisma: PrismaClient,
    roleId: string,
    overrides: Partial<{ email: string; firstName: string; lastName: string }> = {},
) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const suffix = Math.random().toString(36).slice(2, 8);
    return prisma.user.create({
        data: {
            email: overrides.email || `e2e-${suffix}@test.local`,
            passwordHash,
            firstName: overrides.firstName || 'E2E',
            lastName: overrides.lastName || 'User',
            roleId,
            isActive: true,
        },
    });
}

export async function createTestDirectorate(prisma: PrismaClient, name?: string) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return prisma.directorate.create({
        data: { name: name || `Test Direktörlük ${suffix}`, isActive: true },
    });
}

export async function createTestControl(
    prisma: PrismaClient,
    opts: { ownerId: string; directorateId?: string },
) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return prisma.control.create({
        data: {
            controlId: `E2E-CTRL-${suffix}`,
            name: `E2E Test Kontrolü ${suffix}`,
            description: 'E2E test için oluşturulan kontrol',
            type: 'BT',
            nature: 'PREVENTIVE',
            automation: 'MANUAL',
            frequency: 'MONTHLY',
            status: 'ACTIVE',
            ownerId: opts.ownerId,
            directorateId: opts.directorateId || null,
        },
    });
}

export async function createTestControlTest(
    prisma: PrismaClient,
    opts: { controlId: string; assigneeId?: string },
) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return prisma.controlTest.create({
        data: {
            testNo: `2026.KBT-E2E${suffix}`,
            controlId: opts.controlId,
            plannedDate: new Date(),
            status: 'BEKLIYOR',
            assigneeId: opts.assigneeId || null,
        },
    });
}

export const E2E_TEST_PASSWORD = TEST_PASSWORD;
