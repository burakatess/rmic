/**
 * Sistem/referans veri seed'i — PİLOT ORTAM İÇİN GÜVENLİDİR.
 *
 * Bu script yalnızca sistemin çalışması için gereken referans/sistem verisini
 * eksikse oluşturur (mevcut kayıtları EZMEZ): roller, tek zorunlu admin kullanıcı, sistem parametreleri ve
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
import { isTruthyEnv, planRoleSeed } from './seed-system.plan';
import { SYSTEM_ROLES } from './system-roles';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function maskDatabaseUrl(url: string | undefined): string {
    if (!url) return '(tanımsız)';
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

// Rol tanımları prisma/system-roles.ts içinde (dry-run raporu da aynı listeyi kullanır).

// Uygulamanın çalışması için gerekli minimum sistem parametreleri (SLA eşikleri vb.)
// — demo/rastgele veri değil, iş kuralı konfigürasyonu.
const SYSTEM_PARAMETERS: { category: string; key: string; value: any; description?: string }[] = [
    { category: 'SLA', key: 'finding_close_days_critical', value: 30, description: 'Kritik bulgu kapanma SLA (gün)' },
    { category: 'SLA', key: 'finding_close_days_high', value: 60, description: 'Yüksek bulgu kapanma SLA (gün)' },
    { category: 'SLA', key: 'finding_close_days_medium', value: 90, description: 'Orta bulgu kapanma SLA (gün)' },
    { category: 'GENERAL', key: 'app_name', value: 'RMIC - İç Kontrol Sistemi' },
];

// Mevcut rollerin izinleri EZİLMEZ (yönetici ekranındaki değişiklikler restart'ta
// kaybolmasın). Eksik varsayılan izinler raporlanır; yalnızca operatör açıkça
// SEED_SYSTEM_SYNC_ROLE_PERMISSIONS=true verirse eklenir (hiçbir izin kaldırılmaz).
async function upsertRoles(): Promise<Record<string, string>> {
    const syncMissing = isTruthyEnv(process.env.SEED_SYSTEM_SYNC_ROLE_PERMISSIONS);
    const existing = await prisma.role.findMany({
        where: { name: { in: SYSTEM_ROLES.map(r => r.name) } },
        select: { name: true, permissions: true },
    });
    const plan = planRoleSeed(SYSTEM_ROLES, existing, syncMissing);

    for (const r of plan.toCreate) {
        await prisma.role.create({ data: { name: r.name, description: r.description, permissions: r.permissions } });
        console.log(`  ✅ Rol oluşturuldu: ${r.name}`);
    }
    for (const [name, missing] of Object.entries(plan.missingDefaults)) {
        if (plan.toMerge[name]) {
            await prisma.role.update({ where: { name }, data: { permissions: plan.toMerge[name] } });
            console.log(`  ✅ Rol ${name}: eksik varsayılan izinler eklendi (${missing.join(', ')})`);
        } else {
            console.warn(`  ⚠️  Rol ${name}: varsayılanda olup rolde olmayan izinler (dokunulmadı): ${missing.join(', ')}`);
        }
    }

    const roles = await prisma.role.findMany({
        where: { name: { in: SYSTEM_ROLES.map(r => r.name) } },
        select: { id: true, name: true },
    });
    const roleIds: Record<string, string> = {};
    for (const role of roles) roleIds[role.name] = role.id;
    console.log(`  ✅ ${roles.length} sistem rolü hazır (mevcut izinler korunur)`);
    return roleIds;
}

async function upsertParameters() {
    for (const p of SYSTEM_PARAMETERS) {
        await prisma.parameter.upsert({
            where: { key: p.key },
            // Yönetici SLA/parametre değerini değiştirmiş olabilir — yalnız eksikse oluştur.
            update: {},
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
            // Pasife alınmış direktörlüğü restart'ta yeniden aktifleştirme.
            update: {},
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
            // Kurumun düzenlediği/arşivlediği başlangıç kaynağını ezme.
            update: {},
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
