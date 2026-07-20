/**
 * Pilot DB hazırlık kontrol/orkestrasyon script'i.
 *
 * Bu script veri SİLMEZ ve şema DEĞİŞTİRMEZ — yalnızca:
 *   1. Bağlı olunan DB'yi (maskelenmiş) gösterir ve backup hatırlatması yapar.
 *   2. Migration durumunu kontrol eder (uygulanmamış migration varsa UYARIR, uygulamaz).
 *   3. seed-system.ts'i çalıştırır (roller, admin, parametreler — idempotent).
 *   4. Domain tablolarının GERÇEKTEN boş olduğunu doğrular; boş değilse
 *      clean-domain-data.ts çalıştırılması gerektiğini söyler ve durur.
 *   5. Her şey temizse "pilot için hazır" özet raporu basar.
 *
 * Kullanım:
 *   npx ts-node --project tsconfig.json prisma/prepare-pilot-db.ts
 *   npm run db:prepare-pilot -w backend
 *
 * Önkoşul: DATABASE_URL, hazırlanacak pilot DB'sine işaret etmeli
 * (örn. .env içinde grc_db_pilot). Bu script DATABASE_URL'i DEĞİŞTİRMEZ,
 * yalnızca process.env üzerinden zaten ayarlanmış olanı kullanır.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function maskDatabaseUrl(url: string | undefined): string {
    if (!url) return '(tanımsız)';
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

const DOMAIN_TABLE_COUNTS: { label: string; count: () => Promise<number> }[] = [
    { label: 'Risk', count: () => prisma.risk.count() },
    { label: 'Control', count: () => prisma.control.count() },
    { label: 'ControlTest', count: () => prisma.controlTest.count() },
    { label: 'Finding', count: () => prisma.finding.count() },
    { label: 'Action', count: () => prisma.action.count() },
    { label: 'FindingFollowUp', count: () => prisma.findingFollowUp.count() },
    { label: 'RiskEntry', count: () => prisma.riskEntry.count() },
    { label: 'RiskControl', count: () => prisma.riskControl.count() },
    { label: 'RiskAction', count: () => prisma.riskAction.count() },
];

async function step1_backupReminder() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ADIM 1/5 — Backup Hatırlatması');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Hedef DB: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log('   Devam etmeden önce mevcut veriyi yedeklediğinizden emin olun:');
    console.log('');
    console.log('     pg_dump "$DATABASE_URL" -F c -f "backup-$(date +%Y%m%d-%H%M%S).dump"');
    console.log('');
    console.log('   Bu script backup ALMAZ — yalnızca hatırlatır. (bkz. docs/pilot-db-reset.md)');
}

async function step2_migrationStatus() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ADIM 2/5 — Migration Durumu');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
        const output = execSync('npx prisma migrate status', {
            cwd: __dirname + '/..',
            env: process.env,
            encoding: 'utf-8',
        });
        console.log(output);
    } catch (e: any) {
        // `prisma migrate status` uygulanmamış migration varsa non-zero exit ile çıkar —
        // bu execSync için "hata" sayılır ama aslında script'in yakalaması gereken durumdur.
        // stdout, hata objesine iliştirilmiş halde gelir; oradan asıl mesajı çıkarıyoruz.
        const output: string = e.stdout?.toString() || e.message || '';
        console.log(output);
        if (/have not yet been applied|following migration/i.test(output)) {
            console.warn('⚠️  Uygulanmamış migration tespit edildi. Devam etmeden önce:');
            console.warn('     npx prisma migrate deploy   (pilot/prod için — migrate dev DEĞİL)');
        } else {
            console.error('❌ Migration durumu kontrol edilemedi:', output.split('\n')[0]);
        }
        process.exit(1);
    }
}

async function step3_seedSystem() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ADIM 3/5 — Sistem Seed (roller, admin, parametreler)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    execSync('npx ts-node --project tsconfig.json prisma/seed-system.ts', {
        cwd: __dirname + '/..',
        env: process.env,
        stdio: 'inherit',
    });
}

async function step4_verifyDomainEmpty(): Promise<boolean> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ADIM 4/5 — Domain Verisi Boşluk Doğrulaması');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    let allEmpty = true;
    for (const t of DOMAIN_TABLE_COUNTS) {
        const c = await t.count();
        const ok = c === 0;
        allEmpty = allEmpty && ok;
        console.log(`   ${ok ? '✅' : '❌'} ${t.label.padEnd(20)} ${c} kayıt`);
    }
    if (!allEmpty) {
        console.warn('\n⚠️  Domain tablolarında hâlâ veri var. Bu, temiz bir pilot başlangıcı DEĞİL.');
        console.warn('   Seçenekler:');
        console.warn('     A) Bu DB zaten farklı bir amaçla kullanılıyorsa, DATABASE_URL değişkenini');
        console.warn('        gerçekten boş bir grc_db_pilot veritabanına yönlendirin.');
        console.warn('     B) Mevcut DB temizlenecekse (backup SONRASI):');
        console.warn('        npm run db:clean-domain:dry -w backend   (önce dry-run ile kontrol edin)');
        console.warn('        CONFIRM_CLEAN_DOMAIN_DATA=true npm run db:clean-domain -w backend');
    }
    return allEmpty;
}

async function step5_summary(domainEmpty: boolean) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ADIM 5/5 — Özet');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const adminCount = await prisma.user.count({ where: { isActive: true, role: { name: 'SYSTEM_ADMIN' } } });
    const roleCount = await prisma.role.count();
    console.log(`   Roller: ${roleCount}`);
    console.log(`   Aktif SYSTEM_ADMIN kullanıcı: ${adminCount}`);
    console.log(`   Domain verisi boş: ${domainEmpty ? 'EVET ✅' : 'HAYIR ❌'}`);
    if (domainEmpty && adminCount > 0) {
        console.log('\n🎉 Bu DB pilot testine hazır: temiz domain, sistem verisi mevcut, admin girişi var.');
    } else {
        console.log('\n⛔ Bu DB henüz pilot testine hazır DEĞİL — yukarıdaki uyarıları çözün.');
    }
}

async function main() {
    await step1_backupReminder();
    await step2_migrationStatus();
    await step3_seedSystem();
    const domainEmpty = await step4_verifyDomainEmpty();
    await step5_summary(domainEmpty);
}

main()
    .catch((e) => { console.error('❌ Hazırlık hatası:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
