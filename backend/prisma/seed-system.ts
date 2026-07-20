/**
 * Sistem/referans veri seed'i — PİLOT ORTAM İÇİN GÜVENLİDİR.
 *
 * Bu script yalnızca sistemin çalışması için gereken referans/sistem verisini
 * upsert eder: roller, tek zorunlu admin kullanıcı, sistem parametreleri ve
 * (opsiyonel) gerçek direktörlükler. HİÇBİR domain/demo verisi (Risk, Control,
 * Finding, Action, FollowUp vb.) ÜRETMEZ ve mevcut hiçbir kaydı SİLMEZ —
 * `seed.ts`'in aksine tamamen idempotent ve additive'dir; dolu bir DB üzerinde
 * bile güvenle tekrar tekrar çalıştırılabilir.
 *
 * Kullanım:
 *   npx ts-node --project tsconfig.json prisma/seed-system.ts
 *   npm run prisma:seed-system -w backend
 *
 * Ortam değişkenleri (opsiyonel, admin kullanıcı için):
 *   PILOT_ADMIN_EMAIL      (varsayılan: admin@rmic.com)
 *   PILOT_ADMIN_PASSWORD   (varsayılan: geçici, ÇALIŞTIRDIKTAN SONRA DEĞİŞTİRİN)
 *   PILOT_ADMIN_FIRST_NAME (varsayılan: Sistem)
 *   PILOT_ADMIN_LAST_NAME  (varsayılan: Admin)
 *
 *   PILOT_DIRECTORATES     (opsiyonel) "Ad:Kod,Ad2:Kod2" formatında gerçek
 *                          direktörlük listesi. Verilmezse HİÇBİR direktörlük
 *                          oluşturulmaz — demo direktörlük adı asla üretilmez.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function maskDatabaseUrl(url: string | undefined): string {
    if (!url) return '(tanımsız)';
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

// Uygulamanın kullandığı 7 rol (5 çekirdek + 2 IKS — seed-roles.ts ile aynı liste,
// idempotent upsert olduğu için burada birleştirmek güvenli).
const SYSTEM_ROLES: { name: string; description?: string; permissions: string[] }[] = [
    { name: 'SYSTEM_ADMIN', description: 'Sistem Yöneticisi — tüm yetkiler', permissions: ['*'] },
    {
        name: 'RISK_CONTROL_MANAGER', description: 'Risk ve Kontrol Yöneticisi',
        permissions: ['finding:view', 'finding:create', 'finding:update', 'action:*', 'control:*'],
    },
    {
        name: 'AUDITOR', description: 'Denetçi',
        permissions: ['finding:view', 'finding:create', 'action:view', 'action:create', 'control:view', 'control:test'],
    },
    { name: 'RISK_ANALYST', description: 'Risk Analisti', permissions: ['finding:view', 'control:view'] },
    { name: 'VIEWER', description: 'Görüntüleyici', permissions: ['finding:view', 'control:view', 'action:view'] },
    {
        name: 'IKS_EMPLOYEE', description: 'İç Kontrol Sistemi Çalışanı',
        permissions: ['dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute'],
    },
    {
        name: 'IKS_MANAGER', description: 'İç Kontrol Sistemi Yöneticisi',
        permissions: [
            'dashboard:view', 'control:view', 'finding:view', 'action:view', 'test:execute',
            'finding:update', 'finding:create', 'action:update', 'action:create', 'report:view',
        ],
    },
];

// Uygulamanın çalışması için gerekli minimum sistem parametreleri (SLA eşikleri vb.)
// — demo/rastgele veri değil, iş kuralı konfigürasyonu.
const SYSTEM_PARAMETERS: { category: string; key: string; value: any; description?: string }[] = [
    { category: 'SLA', key: 'finding_close_days_critical', value: 30, description: 'Kritik bulgu kapanma SLA (gün)' },
    { category: 'SLA', key: 'finding_close_days_high', value: 60, description: 'Yüksek bulgu kapanma SLA (gün)' },
    { category: 'SLA', key: 'finding_close_days_medium', value: 90, description: 'Orta bulgu kapanma SLA (gün)' },
    { category: 'GENERAL', key: 'app_name', value: 'RMIC - İç Kontrol Sistemi' },
];

async function upsertRoles(): Promise<Record<string, string>> {
    const roleIds: Record<string, string> = {};
    for (const r of SYSTEM_ROLES) {
        const role = await prisma.role.upsert({
            where: { name: r.name },
            update: { description: r.description, permissions: r.permissions },
            create: { name: r.name, description: r.description, permissions: r.permissions },
        });
        roleIds[r.name] = role.id;
        console.log(`  ✅ Rol: ${role.name}`);
    }
    return roleIds;
}

async function upsertParameters() {
    for (const p of SYSTEM_PARAMETERS) {
        await prisma.parameter.upsert({
            where: { key: p.key },
            update: { category: p.category, value: p.value, description: p.description },
            create: p,
        });
    }
    console.log(`  ✅ ${SYSTEM_PARAMETERS.length} sistem parametresi`);
}

async function ensureAdminUser(roleIds: Record<string, string>) {
    const email = process.env.PILOT_ADMIN_EMAIL || 'admin@rmic.com';
    const firstName = process.env.PILOT_ADMIN_FIRST_NAME || 'Sistem';
    const lastName = process.env.PILOT_ADMIN_LAST_NAME || 'Admin';
    const usedDefaultPassword = !process.env.PILOT_ADMIN_PASSWORD;
    const password = process.env.PILOT_ADMIN_PASSWORD || 'ChangeMe1234!';

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`  ℹ️  Admin kullanıcı zaten var, dokunulmadı: ${email}`);
        return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
        data: {
            email, passwordHash, firstName, lastName,
            department: 'Sistem Yönetimi',
            roleId: roleIds['SYSTEM_ADMIN'],
            isActive: true,
        },
    });
    console.log(`  ✅ Admin kullanıcı oluşturuldu: ${email}`);
    if (usedDefaultPassword) {
        console.warn('  ⚠️  PILOT_ADMIN_PASSWORD verilmedi — geçici varsayılan şifre kullanıldı.');
        console.warn('  ⚠️  Pilot başlamadan ÖNCE bu kullanıcının şifresini mutlaka değiştirin!');
    }
}

async function upsertDirectorates() {
    const raw = process.env.PILOT_DIRECTORATES;
    if (!raw) {
        console.log('  ℹ️  PILOT_DIRECTORATES verilmedi — direktörlük oluşturulmadı (demo direktörlük üretilmez).');
        return;
    }
    const entries = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const entry of entries) {
        const [name, code] = entry.split(':').map(s => s?.trim());
        if (!name) continue;
        await prisma.directorate.upsert({
            where: { name },
            update: { code: code || undefined, isActive: true },
            create: { name, code: code || null, isActive: true },
        });
        console.log(`  ✅ Direktörlük: ${name}${code ? ` (${code})` : ''}`);
    }
}

async function main() {
    console.log('🔧 Sistem/referans veri seed başlıyor (pilot-güvenli, domain veri üretmez)');
    console.log(`   DB: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log('');

    console.log('👉 Roller');
    const roleIds = await upsertRoles();

    console.log('👉 Sistem Parametreleri');
    await upsertParameters();

    console.log('👉 Admin Kullanıcı');
    await ensureAdminUser(roleIds);

    console.log('👉 Direktörlükler');
    await upsertDirectorates();

    console.log('');
    console.log('✅ Sistem seed tamamlandı — hiçbir domain/demo verisi oluşturulmadı.');
}

main()
    .catch((e) => { console.error('❌ Sistem seed hatası:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
