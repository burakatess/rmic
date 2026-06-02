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
    console.log('🌱 Starting comprehensive database seed...');

    // Clear existing data to guarantee clean state
    console.log('🧹 Cleaning database...');
    await prisma.action.deleteMany({});
    await prisma.finding.deleteMany({});
    await prisma.controlTest.deleteMany({});
    await prisma.testRecord.deleteMany({});
    await prisma.controlRiskMapping.deleteMany({});
    await prisma.control.deleteMany({});
    await prisma.risk.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});

    // Create Roles
    console.log('👥 Creating roles...');
    const roles = await Promise.all([
        prisma.role.create({
            data: {
                name: 'ADMIN',
                description: 'Sistem Yöneticisi',
                permissions: ['dashboard:view', 'control:view', 'control:create', 'control:update', 'control:delete', 'control:test', 'control:approve', 'finding:view', 'action:view'],
            }
        }),
        prisma.role.create({
            data: {
                name: 'RISK_MANAGER',
                description: 'Risk Yöneticisi',
                permissions: ['dashboard:view', 'control:view', 'control:create', 'control:update', 'finding:view', 'action:view'],
            }
        }),
        prisma.role.create({
            data: {
                name: 'AUDITOR',
                description: 'İç Denetçi',
                permissions: ['dashboard:view', 'control:view', 'control:test', 'control:approve', 'finding:view', 'finding:create', 'action:view'],
            }
        }),
        prisma.role.create({
            data: {
                name: 'CONTROL_OWNER',
                description: 'Kontrol Sahibi',
                permissions: ['dashboard:view', 'control:view', 'control:update', 'control:test'],
            }
        }),
        prisma.role.create({
            data: {
                name: 'VIEWER',
                description: 'Görüntüleyici',
                permissions: ['dashboard:view', 'control:view', 'finding:view', 'action:view'],
            }
        }),
    ]);

    const adminRole = roles.find(r => r.name === 'ADMIN')!;
    const riskManagerRole = roles.find(r => r.name === 'RISK_MANAGER')!;
    const auditorRole = roles.find(r => r.name === 'AUDITOR')!;
    const controlOwnerRole = roles.find(r => r.name === 'CONTROL_OWNER')!;
    const viewerRole = roles.find(r => r.name === 'VIEWER')!;

    // Create Users (Minimum 10)
    console.log('👤 Creating users...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const users = await Promise.all([
        prisma.user.create({
            data: { email: 'burak.admin@grc.com', passwordHash, firstName: 'Burak', lastName: 'Yılmaz', department: 'BT Ağ Yönetimi', roleId: adminRole.id }
        }),
        prisma.user.create({
            data: { email: 'ahmet.risk@grc.com', passwordHash, firstName: 'Ahmet', lastName: 'Kaya', department: 'Bilgi Güvenliği', roleId: riskManagerRole.id }
        }),
        prisma.user.create({
            data: { email: 'mehmet.auditor@grc.com', passwordHash, firstName: 'Mehmet', lastName: 'Demir', department: 'İç Denetim', roleId: auditorRole.id }
        }),
        prisma.user.create({
            data: { email: 'ayse.control@grc.com', passwordHash, firstName: 'Ayşe', lastName: 'Çelik', department: 'Altyapı', roleId: controlOwnerRole.id }
        }),
        prisma.user.create({
            data: { email: 'zeynep.viewer@grc.com', passwordHash, firstName: 'Zeynep', lastName: 'Yıldız', department: 'Operasyon', roleId: viewerRole.id }
        }),
        prisma.user.create({
            data: { email: 'can.owner@grc.com', passwordHash, firstName: 'Can', lastName: 'Öztürk', department: 'Uygulama Geliştirme', roleId: controlOwnerRole.id }
        }),
        prisma.user.create({
            data: { email: 'elif.risk@grc.com', passwordHash, firstName: 'Elif', lastName: 'Aydın', department: 'Bilgi Güvenliği', roleId: riskManagerRole.id }
        }),
        prisma.user.create({
            data: { email: 'kemal.audit@grc.com', passwordHash, firstName: 'Kemal', lastName: 'Arslan', department: 'İç Denetim', roleId: auditorRole.id }
        }),
        prisma.user.create({
            data: { email: 'deniz.owner@grc.com', passwordHash, firstName: 'Deniz', lastName: 'Koç', department: 'Operasyon', roleId: controlOwnerRole.id }
        }),
        prisma.user.create({
            data: { email: 'selin.viewer@grc.com', passwordHash, firstName: 'Selin', lastName: 'Şahin', department: 'Uygulama Geliştirme', roleId: viewerRole.id }
        }),
    ]);

    // Create Categories
    const btdisiCat = await prisma.riskCategory.upsert({
        where: { name: 'BT Dışı Riskler' },
        update: {},
        create: { name: 'BT Dışı Riskler', description: 'BT dışı operasyonel riskler', color: '#10b981' }
    });

    const btCat = await prisma.riskCategory.upsert({
        where: { name: 'BT Riskleri' },
        update: {},
        create: { name: 'BT Riskleri', description: 'Bilgi teknolojileri riskleri', color: '#3b82f6' }
    });

    // Create Base Risks
    console.log('⚠️ Creating risks...');
    const riskData = [
        { riskId: 'R-2026-0001', name: 'Yetkisiz Veri Erişimi', description: 'Kritik müşteri verilerine yetkisiz erişim sağlanması', categoryId: btCat.id },
        { riskId: 'R-2026-0002', name: 'Sistem Kesintisi', description: 'Ana bankacılık sisteminde plan dışı kesinti yaşanması', categoryId: btCat.id },
        { riskId: 'R-2026-0003', name: 'Mevzuata Uyumsuzluk', description: 'BDDK veya KVKK kurallarına uyum sağlanamaması', categoryId: btdisiCat.id },
        { riskId: 'R-2026-0004', name: 'İç Suistimal', description: 'Çalışanların yetkilerini kötüye kullanarak suiistimal yapması', categoryId: btdisiCat.id },
        { riskId: 'R-2026-0005', name: 'Tedarikçi Riski', description: 'Üçüncü taraf hizmet sağlayıcıların taahhütlerini yerine getirememesi', categoryId: btCat.id }
    ];

    const risks = await Promise.all(
        riskData.map(r => prisma.risk.create({
            data: {
                riskId: r.riskId,
                name: r.name,
                description: r.description,
                categoryId: r.categoryId,
                ownerId: users[1].id,
                status: 'ASSESSED'
            }
        }))
    );

    // Create 50 Controls
    console.log('🛡️ Creating 50 controls...');
    const directorates = ['BT Ağ Yönetimi', 'Bilgi Güvenliği', 'Altyapı', 'Uygulama Geliştirme', 'Operasyon'];
    const frequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC'];
    const controlTypes = ['BT', 'BT_DISI'];
    const natures = ['PREVENTIVE', 'DETECTIVE'];
    const automations = ['MANUAL', 'AUTOMATED', 'SEMI_AUTOMATED'];

    const controls = [];
    for (let i = 1; i <= 50; i++) {
        const idStr = `C-${2026}-${String(i).padStart(4, '0')}`;
        const dir = directorates[(i - 1) % directorates.length];
        const freq = frequencies[(i - 1) % frequencies.length] as any;
        const type = controlTypes[(i - 1) % controlTypes.length] as any;
        const nature = natures[(i - 1) % natures.length] as any;
        const aut = automations[(i - 1) % automations.length] as any;
        const owner = users[3 + (i % 3)]; // distribute owners
        const status = i % 10 === 0 ? 'PASSIVE' : 'ACTIVE';
        const effectiveness = i % 7 === 0 ? 'INEFFECTIVE' : (i % 5 === 0 ? 'PARTIALLY_EFFECTIVE' : 'EFFECTIVE');

        const control = await prisma.control.create({
            data: {
                controlId: idStr,
                name: `${dir} ${freq} Kontrolü - ${i}`,
                description: `${dir} kapsamında ${freq.toLowerCase()} olarak yürütülen ${nature.toLowerCase()} kontrol faaliyeti.`,
                type,
                nature,
                automation: aut,
                frequency: freq,
                status: status as any,
                directorate: dir,
                gmy: 'Teknoloji Genel Müdür Yardımcılığı',
                mehaz: 'BDDK Bilgi Sistemleri Yönetmeliği',
                testSteps: '1. Logları incele.\n2. Yetki listesini kontrol et.\n3. Kanıtı yükle.',
                ownerId: owner.id,
                testPerformerId: users[5].id,
                reviewerId: users[2].id,
                effectivenessStatus: effectiveness as any,
            }
        });
        controls.push(control);

        // Map to a risk
        await prisma.controlRiskMapping.create({
            data: {
                controlId: control.id,
                riskId: risks[i % risks.length].id,
                mappingType: 'PRIMARY'
            }
        });
    }

    // Create 150 TestRecords & ControlTests (Control -> Tests)
    console.log('🧪 Creating 150 test records...');
    let testCount = 0;
    const testRecords = [];

    // Past Completed Tests using ControlTest (en az 100 adet)
    for (let i = 0; i < 100; i++) {
        const ctrl = controls[i % controls.length];
        const tester = users[3 + (i % 3)];
        const result = i % 12 === 0 ? 'INEFFECTIVE' : (i % 9 === 0 ? 'PARTIALLY_EFFECTIVE' : 'EFFECTIVE');
        
        await prisma.controlTest.create({
            data: {
                controlId: ctrl.id,
                testDate: new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000), // in the past
                tester: `${tester.firstName} ${tester.lastName}`,
                result,
                evidenceUrls: ['/evidences/test-log.pdf'],
                findings: result !== 'EFFECTIVE' ? 'Kontrol testinde hedeflenen eşik değerin altında kalındığı tespit edilmiştir.' : null,
                notes: 'Rutine uygun yapılmıştır.',
                approvalStatus: 'APPROVED',
                approvedBy: 'Mehmet Demir',
                approvedAt: new Date(),
                hasFinding: result !== 'EFFECTIVE'
            }
        });
        testCount++;
    }

    // Active/Pending/In Progress TestRecords (en az 50 adet)
    for (let i = 0; i < 55; i++) {
        const ctrl = controls[i % controls.length];
        const status = i % 4 === 0 ? 'OVERDUE' : (i % 3 === 0 ? 'IN_PROGRESS' : (i % 2 === 0 ? 'COMPLETED' : 'PENDING'));
        const result = status === 'COMPLETED' ? (i % 5 === 0 ? 'INEFFECTIVE' : 'EFFECTIVE') : null;
        
        const record = await prisma.testRecord.create({
            data: {
                controlId: ctrl.id,
                dueDate: new Date(Date.now() + (i - 10) * 24 * 60 * 60 * 1000), // some overdue, some future
                status: status as any,
                assigneeId: ctrl.ownerId,
                completedAt: status === 'COMPLETED' ? new Date() : null,
                testResult: result as any,
                hasFinding: result === 'INEFFECTIVE',
                notes: status === 'COMPLETED' ? 'İşlem tamamlandı, kanıtlar doğrulandı.' : null
            }
        });
        testRecords.push(record);
        testCount++;
    }
    console.log(`Total tests created: ${testCount}`);

    // Create 30 Findings (Tests -> Findings)
    console.log('🔍 Creating 30 findings...');
    const findings = [];
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const findingStatuses = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'VERIFIED'];

    for (let i = 1; i <= 30; i++) {
        const sev = severities[(i - 1) % severities.length];
        const fStatus = findingStatuses[(i - 1) % findingStatuses.length];
        const ctrl = controls[i % controls.length];
        
        const finding = await prisma.finding.create({
            data: {
                findingId: `F-2026-${String(i).padStart(4, '0')}`,
                description: `${ctrl.directorate} biriminde yapılan kontrolde yetki aşımı/süreç sapması tespit edilmiştir.`,
                impact: 'Bankacılık operasyonlarında uyumsuzluk ve süreç aksaması riski.',
                severity: sev as any,
                status: fStatus as any,
                isRecurrent: i % 7 === 0,
                riskId: risks[i % risks.length].id,
                controlId: ctrl.id,
                source: 'CONTROL_TEST',
                affectedSystem: 'Core Banking, LDAP',
                recommendation: 'Yetki tanımlama süreçlerinin gözden geçirilerek maker-checker kontrolünün sıkılaştırılması.',
                managementResponse: 'Bulgu kabul edilmiş olup aksiyon planı başlatılmıştır.',
                targetResolutionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                relatedDepartment: ctrl.directorate,
                responsiblePerson: 'Ayşe Çelik'
            }
        });
        findings.push(finding);
    }

    // Create 20 Actions (Findings -> Actions)
    console.log('🚀 Creating 20 actions...');
    const actionStatuses = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI'];
    for (let i = 1; i <= 20; i++) {
        const finding = findings[i % findings.length];
        const actStatus = actionStatuses[(i - 1) % actionStatuses.length];
        const isOverdue = i % 4 === 0;
        
        await prisma.action.create({
            data: {
                actionId: `A-2026-${String(i).padStart(4, '0')}`,
                description: `Bulguya yönelik otomatik log kontrol entegrasyonunun yazılması ve devreye alınması.`,
                status: actStatus as any,
                ownerId: users[5].id, // assigned to Can Owner
                findingId: finding.id,
                riskId: finding.riskId,
                dueDate: isOverdue ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
                responsibleDepartment: finding.relatedDepartment || 'Bilgi Teknolojileri',
            }
        });
    }

    console.log('✅ Database seeding finished successfully!');
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
