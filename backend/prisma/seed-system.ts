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
        permissions: ['finding:view', 'finding:create', 'finding:update', 'action:*', 'control:*', 'ai:view', 'ai:run', 'ai:accept', 'ai:review', 'ai:admin'],
    },
    {
        name: 'AUDITOR', description: 'Denetçi',
        permissions: ['finding:view', 'finding:create', 'action:view', 'action:create', 'control:view', 'control:test', 'ai:view', 'ai:run', 'ai:accept'],
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

// AI Kontrol & Kanıt Değerlendirme için başlangıç kaynak kütüphanesi. Kurum kendi
// politika/prosedürlerini uygulamadan ekler; bunlar yalnızca çalışma zemini.
const STARTER_KNOWLEDGE_DOCS: {
    kind: 'POLICY' | 'PROCEDURE' | 'METHODOLOGY' | 'RUBRIC' | 'GLOSSARY' | 'PRECEDENT';
    code: string;
    title: string;
    category: string;
    body: string;
}[] = [
    {
        kind: 'RUBRIC',
        code: 'RUB-BULGU-DERECE',
        title: 'Bulgu Önem Derecesi Rehberi',
        category: 'Derecelendirme',
        body: [
            'CRITICAL: Yasal/regülatif yaptırım riski veya çok yüksek bağlı risk; kontrol tümüyle işlemiyor; doğrudan parasal veya veri kaybı mümkün. Hedef çözüm süresi ≈ 30 gün.',
            'HIGH: Kontrol büyük ölçüde işlemiyor; bağlı risk yüksek; tekrar eden uygunsuzluk. Hedef süre ≈ 60 gün.',
            'MEDIUM: Kontrol kısmen işliyor; telafi edici kontrol mevcut; etki sınırlı. Hedef süre ≈ 90 gün.',
            'LOW: Biçimsel/dokümantasyon eksiği; işleyişe etkisi düşük. Hedef süre ≈ 120 gün.',
        ].join('\n'),
    },
    {
        kind: 'METHODOLOGY',
        code: 'MET-KANIT-KABUL',
        title: 'Kabul Edilen Kanıt Türleri ve Kalite Ölçütleri',
        category: 'Metodoloji',
        body: [
            'Bir kanıt; testin kapsadığı döneme ait olmalı, kaynağı belli olmalı (sistem raporu, onay e-postası, imzalı tutanak, ekran görüntüsü) ve üzerinde tarih/dönem bilgisi bulunmalıdır.',
            'Eksik imza/onay, dönem dışı tarih, maskesiz kişisel veri (KVKK) ve okunamazlık kanıt kalitesini düşüren uyarılardır.',
            'Tek bir ekran görüntüsü genelde yetersizdir; mümkünse sistem kaydı veya bağımsız ikinci bir kanıtla desteklenmelidir.',
        ].join('\n'),
    },
    {
        kind: 'GLOSSARY',
        code: 'GLO-TEMEL',
        title: 'Temel Terimler',
        category: 'Terminoloji',
        body: [
            'Kontrol etkinliği: Kontrolün tasarlandığı amaca uygun ve tutarlı biçimde işlemesi.',
            'Bulgu: Kontrol testinde tespit edilen, kontrol zafiyetine işaret eden nesnel durum.',
            'Bulgu adayı: İç kontrolün değerlendirmesine sunulan, henüz bulgu niteliği kazanmamış tespit.',
            'Telafi edici kontrol: Asıl kontrol zayıf olduğunda riski kısmen azaltan ikincil kontrol.',
        ].join('\n'),
    },
];

async function upsertKnowledgeDocs() {
    const email = process.env.PILOT_ADMIN_EMAIL || 'admin@rmic.com';
    const admin = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!admin) {
        console.log('  ℹ️  Admin kullanıcı bulunamadı — başlangıç kaynakları atlandı.');
        return;
    }
    for (const d of STARTER_KNOWLEDGE_DOCS) {
        await prisma.knowledgeDoc.upsert({
            where: { code: d.code },
            update: { kind: d.kind, title: d.title, body: d.body, category: d.category, isActive: true },
            create: { ...d, createdById: admin.id },
        });
        console.log(`  ✅ Kaynak: ${d.code}`);
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

    console.log('👉 AI Kaynak Kütüphanesi (başlangıç)');
    await upsertKnowledgeDocs();

    console.log('');
    console.log('✅ Sistem seed tamamlandı — hiçbir domain/demo verisi oluşturulmadı.');
}

main()
    .catch((e) => { console.error('❌ Sistem seed hatası:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
