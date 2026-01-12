import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting database seed...');

    // Create Roles - 4 Ana Rol
    const roles = await Promise.all([
        prisma.role.upsert({
            where: { name: 'SYSTEM_ADMIN' },
            update: {
                description: 'Sistem Yöneticisi - Kullanıcı ve sistem yönetimi',
                permissions: [
                    'admin:*',
                    'user:*',
                    'role:*',
                    'risk:read',
                    'control:read',
                    'report:*',
                    'system:*'
                ],
            },
            create: {
                name: 'SYSTEM_ADMIN',
                description: 'Sistem Yöneticisi - Kullanıcı ve sistem yönetimi',
                permissions: [
                    'admin:*',
                    'user:*',
                    'role:*',
                    'risk:read',
                    'control:read',
                    'report:*',
                    'system:*'
                ],
            },
        }),
        prisma.role.upsert({
            where: { name: 'RISK_CONTROL_MANAGER' },
            update: {
                description: 'Risk ve İç Kontrol Yöneticisi - Risk ve kontrol yönetimi',
                permissions: [
                    'dashboard:read',
                    'risk:*',
                    'control:*',
                    'finding:read',
                    'action:read',
                    'compliance:*',
                    'report:*'
                ],
            },
            create: {
                name: 'RISK_CONTROL_MANAGER',
                description: 'Risk ve İç Kontrol Yöneticisi - Risk ve kontrol yönetimi',
                permissions: [
                    'dashboard:read',
                    'risk:*',
                    'control:*',
                    'finding:read',
                    'action:read',
                    'compliance:*',
                    'report:*'
                ],
            },
        }),
        prisma.role.upsert({
            where: { name: 'AUDITOR' },
            update: {
                description: 'Denetçi - Denetim ve bulgu yönetimi',
                permissions: [
                    'dashboard:read',
                    'risk:read',
                    'control:read',
                    'audit:*',
                    'finding:*',
                    'action:*',
                    'report:read'
                ],
            },
            create: {
                name: 'AUDITOR',
                description: 'Denetçi - Denetim ve bulgu yönetimi',
                permissions: [
                    'dashboard:read',
                    'risk:read',
                    'control:read',
                    'audit:*',
                    'finding:*',
                    'action:*',
                    'report:read'
                ],
            },
        }),
        prisma.role.upsert({
            where: { name: 'AUDITEE' },
            update: {
                description: 'Denetlenen - Sadece atanan bulgu ve aksiyonları görür',
                permissions: [
                    'dashboard:read:own',
                    'finding:read:own',
                    'action:read:own',
                    'action:update:own',
                    'action:upload:own'
                ],
            },
            create: {
                name: 'AUDITEE',
                description: 'Denetlenen - Sadece atanan bulgu ve aksiyonları görür',
                permissions: [
                    'dashboard:read:own',
                    'finding:read:own',
                    'action:read:own',
                    'action:update:own',
                    'action:upload:own'
                ],
            },
        }),
    ]);

    console.log('✅ Roles created');

    // Create Users
    const passwordHash = await bcrypt.hash('password123', 10);
    const systemAdminRole = roles.find((r) => r.name === 'SYSTEM_ADMIN')!;
    const riskControlManagerRole = roles.find((r) => r.name === 'RISK_CONTROL_MANAGER')!;
    const auditorRole = roles.find((r) => r.name === 'AUDITOR')!;
    const auditeeRole = roles.find((r) => r.name === 'AUDITEE')!;

    const users = await Promise.all([
        prisma.user.upsert({
            where: { email: 'admin@grc.com' },
            update: { roleId: systemAdminRole.id },
            create: {
                email: 'admin@grc.com',
                passwordHash,
                firstName: 'System',
                lastName: 'Administrator',
                department: 'IT',
                roleId: systemAdminRole.id,
            },
        }),
        prisma.user.upsert({
            where: { email: 'risk.manager@grc.com' },
            update: { roleId: riskControlManagerRole.id },
            create: {
                email: 'risk.manager@grc.com',
                passwordHash,
                firstName: 'Ahmet',
                lastName: 'Yılmaz',
                department: 'Risk Yönetimi',
                roleId: riskControlManagerRole.id,
            },
        }),
        prisma.user.upsert({
            where: { email: 'control.owner@grc.com' },
            update: { roleId: riskControlManagerRole.id },
            create: {
                email: 'control.owner@grc.com',
                passwordHash,
                firstName: 'Ayşe',
                lastName: 'Kaya',
                department: 'İç Kontrol',
                roleId: riskControlManagerRole.id,
            },
        }),
        prisma.user.upsert({
            where: { email: 'auditor@grc.com' },
            update: { roleId: auditorRole.id },
            create: {
                email: 'auditor@grc.com',
                passwordHash,
                firstName: 'Mehmet',
                lastName: 'Demir',
                department: 'İç Denetim',
                roleId: auditorRole.id,
            },
        }),
        prisma.user.upsert({
            where: { email: 'action.owner@grc.com' },
            update: { roleId: auditeeRole.id },
            create: {
                email: 'action.owner@grc.com',
                passwordHash,
                firstName: 'Zeynep',
                lastName: 'Çelik',
                department: 'Operasyonlar',
                roleId: auditeeRole.id,
            },
        }),
    ]);

    console.log('✅ Users created');

    // Create Risk Categories
    const categories = await Promise.all([
        prisma.riskCategory.upsert({
            where: { name: 'Operasyonel Risk' },
            update: {},
            create: { name: 'Operasyonel Risk', description: 'Operasyonel süreçlerden kaynaklanan riskler', color: '#ef4444' },
        }),
        prisma.riskCategory.upsert({
            where: { name: 'Finansal Risk' },
            update: {},
            create: { name: 'Finansal Risk', description: 'Finansal kayıp ve likidite riskleri', color: '#f59e0b' },
        }),
        prisma.riskCategory.upsert({
            where: { name: 'Uyum Riski' },
            update: {},
            create: { name: 'Uyum Riski', description: 'Regülasyon ve mevzuat uyum riskleri', color: '#8b5cf6' },
        }),
        prisma.riskCategory.upsert({
            where: { name: 'BT Riski' },
            update: {},
            create: { name: 'BT Riski', description: 'Bilgi teknolojileri ve siber güvenlik riskleri', color: '#3b82f6' },
        }),
        prisma.riskCategory.upsert({
            where: { name: 'Stratejik Risk' },
            update: {},
            create: { name: 'Stratejik Risk', description: 'Stratejik kararlar ve piyasa riskleri', color: '#10b981' },
        }),
        prisma.riskCategory.upsert({
            where: { name: 'İtibar Riski' },
            update: {},
            create: { name: 'İtibar Riski', description: 'Kurumsal itibar ve marka riskleri', color: '#ec4899' },
        }),
    ]);

    console.log('✅ Risk categories created');

    // Create Regulations
    await Promise.all([
        prisma.regulation.upsert({
            where: { code: 'BDDK' },
            update: {},
            create: {
                code: 'BDDK',
                name: 'Bankacılık Düzenleme ve Denetleme Kurumu Mevzuatı',
                description: 'Türk bankacılık sektörünü düzenleyen kurum',
            },
        }),
        prisma.regulation.upsert({
            where: { code: 'ISO27001' },
            update: {},
            create: {
                code: 'ISO27001',
                name: 'ISO 27001 Bilgi Güvenliği Yönetim Sistemi',
                description: 'Uluslararası bilgi güvenliği standardı',
            },
        }),
        prisma.regulation.upsert({
            where: { code: 'KVKK' },
            update: {},
            create: {
                code: 'KVKK',
                name: 'Kişisel Verilerin Korunması Kanunu',
                description: 'Türkiye kişisel veri koruma mevzuatı',
            },
        }),
        prisma.regulation.upsert({
            where: { code: 'DORA' },
            update: {},
            create: {
                code: 'DORA',
                name: 'Digital Operational Resilience Act',
                description: 'AB dijital operasyonel dayanıklılık mevzuatı',
            },
        }),
        prisma.regulation.upsert({
            where: { code: 'COBIT' },
            update: {},
            create: {
                code: 'COBIT',
                name: 'COBIT Framework',
                description: 'BT yönetişimi ve yönetimi çerçevesi',
            },
        }),
    ]);

    console.log('✅ Regulations created');

    // Create Demo Risks
    const riskOwner = users.find((u) => u.email === 'risk.manager@grc.com')!;
    const operationalCategory = categories.find((c) => c.name === 'Operasyonel Risk')!;
    const itCategory = categories.find((c) => c.name === 'BT Riski')!;
    const complianceCategory = categories.find((c) => c.name === 'Uyum Riski')!;

    const risks = await Promise.all([
        prisma.risk.upsert({
            where: { riskId: 'R-2024-0001' },
            update: {},
            create: {
                riskId: 'R-2024-0001',
                name: 'Siber Saldırı Riski',
                description: 'Kurum sistemlerine yönelik siber saldırılar sonucu veri kaybı veya sistem kesintisi yaşanması riski',
                categoryId: itCategory.id,
                ownerId: riskOwner.id,
                status: 'ASSESSED',
                inherentProbability: 4,
                inherentImpact: 5,
                inherentRiskScore: 20,
                residualProbability: 2,
                residualImpact: 4,
                residualRiskScore: 8,
                riskAppetite: 10,
                isAboveAppetite: false,
                treatmentDecision: 'MITIGATE',
            },
        }),
        prisma.risk.upsert({
            where: { riskId: 'R-2024-0002' },
            update: {},
            create: {
                riskId: 'R-2024-0002',
                name: 'Regülasyon Uyumsuzluk Riski',
                description: 'BDDK ve KVKK regülasyonlarına uyumsuzluk nedeniyle yaptırım uygulanması riski',
                categoryId: complianceCategory.id,
                ownerId: riskOwner.id,
                status: 'ASSESSED',
                inherentProbability: 3,
                inherentImpact: 5,
                inherentRiskScore: 15,
                residualProbability: 2,
                residualImpact: 4,
                residualRiskScore: 8,
                riskAppetite: 8,
                isAboveAppetite: false,
                treatmentDecision: 'MITIGATE',
            },
        }),
        prisma.risk.upsert({
            where: { riskId: 'R-2024-0003' },
            update: {},
            create: {
                riskId: 'R-2024-0003',
                name: 'Operasyonel Hata Riski',
                description: 'Manuel süreçlerde insan hatası nedeniyle müşteri mağduriyeti veya finansal kayıp oluşması riski',
                categoryId: operationalCategory.id,
                ownerId: riskOwner.id,
                status: 'IDENTIFIED',
                inherentProbability: 4,
                inherentImpact: 3,
                inherentRiskScore: 12,
                riskAppetite: 8,
                isAboveAppetite: true,
            },
        }),
        prisma.risk.upsert({
            where: { riskId: 'R-2024-0004' },
            update: {},
            create: {
                riskId: 'R-2024-0004',
                name: 'Veri Sızıntısı Riski',
                description: 'Müşteri verilerinin izinsiz olarak üçüncü taraflarla paylaşılması veya sızdırılması riski',
                categoryId: itCategory.id,
                ownerId: riskOwner.id,
                status: 'TREATED',
                inherentProbability: 3,
                inherentImpact: 5,
                inherentRiskScore: 15,
                residualProbability: 1,
                residualImpact: 4,
                residualRiskScore: 4,
                riskAppetite: 6,
                isAboveAppetite: false,
                treatmentDecision: 'MITIGATE',
                treatmentApproval: true,
            },
        }),
        prisma.risk.upsert({
            where: { riskId: 'R-2024-0005' },
            update: {},
            create: {
                riskId: 'R-2024-0005',
                name: 'Kritik Sistem Kesintisi Riski',
                description: 'Kritik bankacılık sistemlerinde yaşanacak kesintiler nedeniyle hizmet aksaması riski',
                categoryId: itCategory.id,
                ownerId: riskOwner.id,
                status: 'ASSESSED',
                inherentProbability: 2,
                inherentImpact: 5,
                inherentRiskScore: 10,
                residualProbability: 1,
                residualImpact: 4,
                residualRiskScore: 4,
                riskAppetite: 5,
                isAboveAppetite: false,
                treatmentDecision: 'MITIGATE',
            },
        }),
    ]);

    console.log('✅ Demo risks created');

    // Create Demo Controls
    const controlOwner = users.find((u) => u.email === 'control.owner@grc.com')!;

    const controls = await Promise.all([
        prisma.control.upsert({
            where: { controlId: 'C-2024-0001' },
            update: {},
            create: {
                controlId: 'C-2024-0001',
                name: 'Güvenlik Duvarı Yönetimi',
                description: 'Kurumsal ağ trafiğinin güvenlik duvarları ile izlenmesi ve kontrolü',
                type: 'IT_GENERAL',
                nature: 'PREVENTIVE',
                automation: 'AUTOMATED',
                frequency: 'DAILY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'EFFECTIVE',
            },
        }),
        prisma.control.upsert({
            where: { controlId: 'C-2024-0002' },
            update: {},
            create: {
                controlId: 'C-2024-0002',
                name: 'Erişim Yetkilendirme Kontrolü',
                description: 'Kullanıcı erişim yetkilerinin periyodik olarak gözden geçirilmesi',
                type: 'IT_GENERAL',
                nature: 'PREVENTIVE',
                automation: 'MANUAL',
                frequency: 'QUARTERLY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'EFFECTIVE',
            },
        }),
        prisma.control.upsert({
            where: { controlId: 'C-2024-0003' },
            update: {},
            create: {
                controlId: 'C-2024-0003',
                name: 'Veri Şifreleme Kontrolü',
                description: 'Hassas verilerin şifrelenerek saklanması ve iletilmesi',
                type: 'IT_APPLICATION',
                nature: 'PREVENTIVE',
                automation: 'AUTOMATED',
                frequency: 'DAILY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'EFFECTIVE',
            },
        }),
        prisma.control.upsert({
            where: { controlId: 'C-2024-0004' },
            update: {},
            create: {
                controlId: 'C-2024-0004',
                name: 'Uyum İzleme Kontrolü',
                description: 'Regülasyon değişikliklerinin izlenmesi ve etki analizi yapılması',
                type: 'COMPLIANCE',
                nature: 'DETECTIVE',
                automation: 'MANUAL',
                frequency: 'MONTHLY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'PARTIALLY_EFFECTIVE',
            },
        }),
        prisma.control.upsert({
            where: { controlId: 'C-2024-0005' },
            update: {},
            create: {
                controlId: 'C-2024-0005',
                name: 'İşlem Doğrulama Kontrolü',
                description: 'Kritik işlemlerin maker-checker prensibi ile doğrulanması',
                type: 'OPERATIONAL',
                nature: 'PREVENTIVE',
                automation: 'SEMI_AUTOMATED',
                frequency: 'DAILY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'EFFECTIVE',
            },
        }),
        prisma.control.upsert({
            where: { controlId: 'C-2024-0006' },
            update: {},
            create: {
                controlId: 'C-2024-0006',
                name: 'Yedekleme ve Kurtarma Kontrolü',
                description: 'Kritik sistemlerin düzenli yedeklenmesi ve felaket kurtarma testleri',
                type: 'IT_GENERAL',
                nature: 'DETECTIVE',
                automation: 'AUTOMATED',
                frequency: 'DAILY',
                ownerId: controlOwner.id,
                effectivenessStatus: 'EFFECTIVE',
            },
        }),
    ]);

    console.log('✅ Demo controls created');

    // Create Control-Risk Mappings
    await Promise.all([
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[0].id, riskId: risks[0].id } },
            update: {},
            create: { controlId: controls[0].id, riskId: risks[0].id, mappingType: 'PRIMARY' },
        }),
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[1].id, riskId: risks[0].id } },
            update: {},
            create: { controlId: controls[1].id, riskId: risks[0].id, mappingType: 'SECONDARY' },
        }),
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[2].id, riskId: risks[3].id } },
            update: {},
            create: { controlId: controls[2].id, riskId: risks[3].id, mappingType: 'PRIMARY' },
        }),
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[3].id, riskId: risks[1].id } },
            update: {},
            create: { controlId: controls[3].id, riskId: risks[1].id, mappingType: 'PRIMARY' },
        }),
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[4].id, riskId: risks[2].id } },
            update: {},
            create: { controlId: controls[4].id, riskId: risks[2].id, mappingType: 'PRIMARY' },
        }),
        prisma.controlRiskMapping.upsert({
            where: { controlId_riskId: { controlId: controls[5].id, riskId: risks[4].id } },
            update: {},
            create: { controlId: controls[5].id, riskId: risks[4].id, mappingType: 'PRIMARY' },
        }),
    ]);

    console.log('✅ Control-Risk mappings created');

    // Create Demo Finding
    const finding = await prisma.finding.upsert({
        where: { findingId: 'F-2024-0001' },
        update: {},
        create: {
            findingId: 'F-2024-0001',
            description: 'Erişim yetkilendirme kontrolünde eksiklik tespit edildi. Ayrılan personelin sistem erişimleri zamanında kapatılmamaktadır.',
            impact: 'Yetkisiz erişim riski ve potansiyel veri sızıntısı',
            severity: 'HIGH',
            isRecurrent: false,
            status: 'OPEN',
            riskId: risks[0].id,
            controlId: controls[1].id,
        },
    });

    console.log('✅ Demo finding created');

    // Create Demo Action
    const actionOwner = users.find((u) => u.email === 'action.owner@grc.com')!;

    await prisma.action.upsert({
        where: { actionId: 'A-2024-0001' },
        update: {},
        create: {
            actionId: 'A-2024-0001',
            description: 'Otomatik erişim yetki iptali sürecinin İK sistemine entegre edilmesi',
            source: 'FINDING',
            status: 'IN_PROGRESS',
            ownerId: actionOwner.id,
            findingId: finding.id,
            riskId: risks[0].id,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            slaInDays: 30,
        },
    });

    console.log('✅ Demo action created');

    // Create Parameters
    await Promise.all([
        prisma.parameter.upsert({
            where: { key: 'RISK_SCORE_LEVELS' },
            update: {},
            create: {
                category: 'RISK_SCORING',
                key: 'RISK_SCORE_LEVELS',
                value: { low: { min: 1, max: 7 }, medium: { min: 8, max: 14 }, high: { min: 15, max: 25 } },
                description: 'Risk skor seviye aralıkları',
            },
        }),
        prisma.parameter.upsert({
            where: { key: 'DEFAULT_ACTION_SLA' },
            update: {},
            create: {
                category: 'SLA',
                key: 'DEFAULT_ACTION_SLA',
                value: { critical: 7, high: 14, medium: 30, low: 60 },
                description: 'Bulgu ciddiyetine göre varsayılan aksiyon SLA süreleri (gün)',
            },
        }),
    ]);

    console.log('✅ Parameters created');

    console.log('');
    console.log('🎉 Database seed completed successfully!');
    console.log('');
    console.log('Demo kullanıcılar (şifre: password123):');
    console.log('  - admin@grc.com (Sistem Yöneticisi)');
    console.log('  - risk.manager@grc.com (Risk ve İK Yöneticisi)');
    console.log('  - control.owner@grc.com (Risk ve İK Yöneticisi)');
    console.log('  - auditor@grc.com (Denetçi)');
    console.log('  - action.owner@grc.com (Denetlenen)');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
