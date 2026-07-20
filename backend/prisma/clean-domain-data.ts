/**
 * Domain/test/demo verisini temizleyen DESTRUCTIVE script.
 *
 * VARSAYILAN DAVRANIŞ: DRY-RUN. Hiçbir şey silmez — yalnızca hangi tablolardan
 * kaç kayıt silineceğini raporlar. Gerçek silme için CONFIRM_CLEAN_DOMAIN_DATA=true
 * gerekir. Production'a karşı ayrıca ALLOW_PRODUCTION_CLEAN=true gerekir.
 *
 * Kullanım:
 *   # Dry-run (varsayılan, güvenli — her ortamda çalıştırılabilir)
 *   npx ts-node --project tsconfig.json prisma/clean-domain-data.ts
 *   npm run db:clean-domain:dry -w backend
 *
 *   # Gerçek silme (dev/test/pilot-reset DB'sinde)
 *   CONFIRM_CLEAN_DOMAIN_DATA=true npx ts-node --project tsconfig.json prisma/clean-domain-data.ts
 *   CONFIRM_CLEAN_DOMAIN_DATA=true npm run db:clean-domain -w backend
 *
 *   # NODE_ENV=production ise ek olarak:
 *   NODE_ENV=production CONFIRM_CLEAN_DOMAIN_DATA=true ALLOW_PRODUCTION_CLEAN=true npm run db:clean-domain -w backend
 *
 * Opsiyonel flag'ler:
 *   CLEAN_AUDIT_LOGS=true      → AuditLog tablosunu da temizler (varsayılan: korunur).
 *                                Pilot BAŞLADIKTAN SONRA asla kullanmayın.
 *   CLEAN_UPLOAD_FILES=true    → backend/uploads altındaki, artık hiçbir attachment
 *                                kaydı tarafından referans edilmeyen (orphan) dosyaları
 *                                diskten siler. Dry-run'da bu dosyalar yalnızca listelenir.
 *
 * NE SİLİNMEZ (sistem/referans verisi — bu script hiç dokunmaz):
 *   User, Role, RefreshToken, Directorate, SystemOption, Parameter,
 *   Regulation, RegulationArticle, ArticleCrossRef, RiskCategory
 *   (RiskCategory ve Regulation kütüphanesi demo değil, statik referans/taksonomi
 *   verisi olarak sınıflandırıldı — bkz. docs/pilot-db-reset.md)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative } from 'path';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CONFIRM = process.env.CONFIRM_CLEAN_DOMAIN_DATA === 'true';
const ALLOW_PROD = process.env.ALLOW_PRODUCTION_CLEAN === 'true';
const CLEAN_AUDIT_LOGS = process.env.CLEAN_AUDIT_LOGS === 'true';
const CLEAN_UPLOAD_FILES = process.env.CLEAN_UPLOAD_FILES === 'true';
const UPLOAD_ROOT = join(__dirname, '..', 'uploads');

function maskDatabaseUrl(url: string | undefined): string {
    if (!url) return '(tanımsız)';
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

// Silme sırası KRİTİK — FK constraint'lerini bozmayacak şekilde leaf → root.
// (seed.ts'in kendi kullandığı, üretimde kanıtlanmış temizlik sırası referans alındı;
// sistem tabloları [User/Role/Directorate/SystemOption/Parameter] ve statik referans
// verisi [Regulation*, RiskCategory] listeden ÇIKARILDI.)
const DELETE_PLAN: { label: string; run: () => Promise<{ count: number }> }[] = [
    { label: 'FindingStatusHistory', run: () => prisma.findingStatusHistory.deleteMany({}) },
    { label: 'FindingStatusLog', run: () => prisma.findingStatusLog.deleteMany({}) },
    { label: 'FollowUpAttachment', run: () => prisma.followUpAttachment.deleteMany({}) },
    { label: 'ActionAttachment', run: () => prisma.actionAttachment.deleteMany({}) },
    { label: 'FindingAttachment', run: () => prisma.findingAttachment.deleteMany({}) },
    { label: 'ControlTestAttachment', run: () => prisma.controlTestAttachment.deleteMany({}) },
    { label: 'Attachment (polimorfik)', run: () => prisma.attachment.deleteMany({}) },
    { label: 'EffectivenessReview', run: () => prisma.effectivenessReview.deleteMany({}) },
    { label: 'FindingFollowUp', run: () => prisma.findingFollowUp.deleteMany({}) },
    { label: 'RiskProposal', run: () => prisma.riskProposal.deleteMany({}) },
    { label: 'Action', run: () => prisma.action.deleteMany({}) },
    { label: 'Finding', run: () => prisma.finding.deleteMany({}) },
    { label: 'ControlTest', run: () => prisma.controlTest.deleteMany({}) },
    { label: 'ControlRegulation (mapping)', run: () => prisma.controlRegulation.deleteMany({}) },
    { label: 'RiskRegulation (mapping)', run: () => prisma.riskRegulation.deleteMany({}) },
    { label: 'ControlRiskMapping', run: () => prisma.controlRiskMapping.deleteMany({}) },
    { label: 'Control', run: () => prisma.control.deleteMany({}) },
    { label: 'RiskAssessment', run: () => prisma.riskAssessment.deleteMany({}) },
    { label: 'RiskHistory', run: () => prisma.riskHistory.deleteMany({}) },
    { label: 'RiskActionRisk', run: () => prisma.riskActionRisk.deleteMany({}) },
    { label: 'RiskAction', run: () => prisma.riskAction.deleteMany({}) },
    { label: 'RiskControlRisk', run: () => prisma.riskControlRisk.deleteMany({}) },
    { label: 'RiskControl', run: () => prisma.riskControl.deleteMany({}) },
    { label: 'ProcessRisk', run: () => prisma.processRisk.deleteMany({}) },
    { label: 'SystemRisk', run: () => prisma.systemRisk.deleteMany({}) },
    { label: 'Risk', run: () => prisma.risk.deleteMany({}) },
    { label: 'Process', run: () => prisma.process.deleteMany({}) },
    { label: 'System', run: () => prisma.system.deleteMany({}) },
    { label: 'RiskEntryRMControl', run: () => prisma.riskEntryRMControl.deleteMany({}) },
    { label: 'RiskManagementControl', run: () => prisma.riskManagementControl.deleteMany({}) },
    { label: 'RMControlTest', run: () => prisma.rMControlTest.deleteMany({}) },
    { label: 'RiskEntry', run: () => prisma.riskEntry.deleteMany({}) },
    { label: 'AuditExecution', run: () => prisma.auditExecution.deleteMany({}) },
    { label: 'AuditPlan', run: () => prisma.auditPlan.deleteMany({}) },
];

// Dry-run'da kayıt sayısını almak için count delegate eşlemesi (run() ile birebir aynı sıra/model).
const COUNT_PLAN: { label: string; count: () => Promise<number> }[] = [
    { label: 'FindingStatusHistory', count: () => prisma.findingStatusHistory.count() },
    { label: 'FindingStatusLog', count: () => prisma.findingStatusLog.count() },
    { label: 'FollowUpAttachment', count: () => prisma.followUpAttachment.count() },
    { label: 'ActionAttachment', count: () => prisma.actionAttachment.count() },
    { label: 'FindingAttachment', count: () => prisma.findingAttachment.count() },
    { label: 'ControlTestAttachment', count: () => prisma.controlTestAttachment.count() },
    { label: 'Attachment (polimorfik)', count: () => prisma.attachment.count() },
    { label: 'EffectivenessReview', count: () => prisma.effectivenessReview.count() },
    { label: 'FindingFollowUp', count: () => prisma.findingFollowUp.count() },
    { label: 'RiskProposal', count: () => prisma.riskProposal.count() },
    { label: 'Action', count: () => prisma.action.count() },
    { label: 'Finding', count: () => prisma.finding.count() },
    { label: 'ControlTest', count: () => prisma.controlTest.count() },
    { label: 'ControlRegulation (mapping)', count: () => prisma.controlRegulation.count() },
    { label: 'RiskRegulation (mapping)', count: () => prisma.riskRegulation.count() },
    { label: 'ControlRiskMapping', count: () => prisma.controlRiskMapping.count() },
    { label: 'Control', count: () => prisma.control.count() },
    { label: 'RiskAssessment', count: () => prisma.riskAssessment.count() },
    { label: 'RiskHistory', count: () => prisma.riskHistory.count() },
    { label: 'RiskActionRisk', count: () => prisma.riskActionRisk.count() },
    { label: 'RiskAction', count: () => prisma.riskAction.count() },
    { label: 'RiskControlRisk', count: () => prisma.riskControlRisk.count() },
    { label: 'RiskControl', count: () => prisma.riskControl.count() },
    { label: 'ProcessRisk', count: () => prisma.processRisk.count() },
    { label: 'SystemRisk', count: () => prisma.systemRisk.count() },
    { label: 'Risk', count: () => prisma.risk.count() },
    { label: 'Process', count: () => prisma.process.count() },
    { label: 'System', count: () => prisma.system.count() },
    { label: 'RiskEntryRMControl', count: () => prisma.riskEntryRMControl.count() },
    { label: 'RiskManagementControl', count: () => prisma.riskManagementControl.count() },
    { label: 'RMControlTest', count: () => prisma.rMControlTest.count() },
    { label: 'RiskEntry', count: () => prisma.riskEntry.count() },
    { label: 'AuditExecution', count: () => prisma.auditExecution.count() },
    { label: 'AuditPlan', count: () => prisma.auditPlan.count() },
];

async function collectAttachmentFileNames(): Promise<Set<string>> {
    const [findingAtt, actionAtt, followUpAtt, testAtt, poly] = await Promise.all([
        prisma.findingAttachment.findMany({ select: { fileName: true } }),
        prisma.actionAttachment.findMany({ select: { fileName: true } }),
        prisma.followUpAttachment.findMany({ select: { fileName: true } }),
        prisma.controlTestAttachment.findMany({ select: { fileName: true } }),
        prisma.attachment.findMany({ select: { fileName: true } }),
    ]);
    const names = new Set<string>();
    for (const rows of [findingAtt, actionAtt, followUpAtt, testAtt, poly]) {
        for (const r of rows) names.add(r.fileName);
    }
    return names;
}

function walkFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

/** DB'de artık hiçbir attachment kaydı tarafından referans edilmeyen upload dosyalarını bulur. */
async function findOrphanUploadFiles(): Promise<string[]> {
    const referenced = await collectAttachmentFileNames();
    const allFiles = walkFiles(UPLOAD_ROOT);
    return allFiles
        .map(f => relative(UPLOAD_ROOT, f))
        .filter(rel => !referenced.has(rel));
}

async function assertAdminRemains() {
    const adminCount = await prisma.user.count({
        where: { isActive: true, role: { name: 'SYSTEM_ADMIN' } },
    });
    if (adminCount === 0) {
        throw new Error(
            'GÜVENLİK DURDURMASI: Bu işlemden sonra aktif SYSTEM_ADMIN kullanıcı kalmayacaktı. ' +
            'Bu script User/Role tablolarına dokunmuyor, yani bu durum zaten mevcut — ' +
            'devam etmeden önce en az bir aktif SYSTEM_ADMIN kullanıcı oluşturun (bkz. seed-system.ts).',
        );
    }
    console.log(`  ✅ Doğrulama: ${adminCount} aktif SYSTEM_ADMIN kullanıcı korunuyor.`);
}

async function main() {
    console.log('🧹 clean-domain-data — Domain/Test/Demo Veri Temizleme');
    console.log(`   DB: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || '(tanımsız)'}`);
    console.log(`   Mod: ${CONFIRM ? '⚠️  GERÇEK SİLME' : '🔍 DRY-RUN (hiçbir şey silinmeyecek)'}`);
    console.log('');

    if (process.env.NODE_ENV === 'production' && CONFIRM && !ALLOW_PROD) {
        console.error('❌ NODE_ENV=production tespit edildi. Gerçek silme için ayrıca ALLOW_PRODUCTION_CLEAN=true gerekli.');
        console.error('   Bu ek güvenlik kilidi, production DB\'sinin yanlışlıkla temizlenmesini önlemek içindir.');
        process.exit(1);
    }

    // ── Admin doğrulaması — silmeden ÖNCE de kontrol et (bu script User'a dokunmasa da) ──
    await assertAdminRemains();

    // ── Domain tabloları: sayım (dry-run ve gerçek modda ortak) ──
    console.log('\n📊 Domain Tabloları:');
    let totalToDelete = 0;
    const counts: { label: string; count: number }[] = [];
    for (const item of COUNT_PLAN) {
        const c = await item.count();
        counts.push({ label: item.label, count: c });
        totalToDelete += c;
        if (c > 0) console.log(`   ${CONFIRM ? '🗑️ ' : '👀'} ${item.label.padEnd(28)} ${c} kayıt`);
    }
    if (totalToDelete === 0) console.log('   (temizlenecek domain kaydı yok)');
    console.log(`   ─────────────────────────────────────`);
    console.log(`   Toplam: ${totalToDelete} kayıt`);

    // ── AuditLog (ayrı flag) ──
    const auditLogCount = await prisma.auditLog.count();
    console.log(`\n📋 AuditLog: ${auditLogCount} kayıt — flag: CLEAN_AUDIT_LOGS=${CLEAN_AUDIT_LOGS}`);
    if (!CLEAN_AUDIT_LOGS) {
        console.log('   ℹ️  AuditLog korunacak (varsayılan). Pilot BAŞLADIKTAN SONRA bu flag hiç kullanılmamalı.');
    } else if (CONFIRM) {
        console.log('   ⚠️  AuditLog SİLİNECEK (CLEAN_AUDIT_LOGS=true + CONFIRM_CLEAN_DOMAIN_DATA=true).');
    } else {
        console.log('   👀 Dry-run: AuditLog silinecekler arasında görünecek ama şimdilik silinmiyor.');
    }

    // ── Upload dosyaları (ayrı flag, her zaman dry-run listelenir) ──
    const orphans = await findOrphanUploadFiles();
    console.log(`\n📁 Upload Klasörü: ${orphans.length} orphan dosya bulundu (${UPLOAD_ROOT})`);
    if (orphans.length > 0) {
        for (const f of orphans.slice(0, 20)) console.log(`   📄 ${f}`);
        if (orphans.length > 20) console.log(`   ... ve ${orphans.length - 20} dosya daha`);
    }
    console.log(`   Not: Domain temizliği sonrası TÜM attachment kayıtları silineceği için,`);
    console.log(`   gerçek çalıştırmadan sonra buradaki tüm dosyalar orphan hâle gelecektir.`);
    console.log(`   ⚠️  ÖNEMLİ: uploads/ klasörü DB'den bağımsız, PAYLAŞILAN bir dosya sistemi yoludur.`);
    console.log(`   Orphan tespiti yalnızca ŞU AN BAĞLI OLUNAN DB'nin (${maskDatabaseUrl(process.env.DATABASE_URL)}) attachment`);
    console.log(`   kayıtlarına bakar. Aynı uploads/ klasörünü başka bir DB (örn. dev) de kullanıyorsa,`);
    console.log(`   CLEAN_UPLOAD_FILES=true o DB'nin hâlâ ihtiyaç duyduğu dosyaları da silebilir.`);
    console.log(`   Yalnızca bu DB'nin uploads/ klasörünü TEK BAŞINA kullandığından eminseniz kullanın`);
    console.log(`   (pilot ortamında ayrı bir upload dizini/volume önerilir — bkz. docs/pilot-db-reset.md).`);
    console.log(`   flag: CLEAN_UPLOAD_FILES=${CLEAN_UPLOAD_FILES}`);

    if (!CONFIRM) {
        console.log('\n🔍 DRY-RUN tamamlandı. Hiçbir şey silinmedi.');
        console.log('   Gerçek silme için: CONFIRM_CLEAN_DOMAIN_DATA=true ile tekrar çalıştırın.');
        return;
    }

    // ── GERÇEK SİLME ──
    console.log('\n⚠️  GERÇEK SİLME BAŞLIYOR — bu işlem geri alınamaz. Backup aldığınızdan emin olun.');
    for (const item of DELETE_PLAN) {
        const res = await item.run();
        if (res.count > 0) console.log(`   🗑️  ${item.label}: ${res.count} kayıt silindi`);
    }

    if (CLEAN_AUDIT_LOGS) {
        const res = await prisma.auditLog.deleteMany({});
        console.log(`   🗑️  AuditLog: ${res.count} kayıt silindi`);
    }

    if (CLEAN_UPLOAD_FILES) {
        // Silmeden hemen önce orphan listesini TAZELE — DB'deki attachment kayıtları
        // az önce silindiği için artık tüm eski dosyalar orphan olacaktır.
        const freshOrphans = await findOrphanUploadFiles();
        let deletedFiles = 0;
        for (const rel of freshOrphans) {
            try {
                unlinkSync(join(UPLOAD_ROOT, rel));
                deletedFiles++;
            } catch (e) {
                console.warn(`   ⚠️  Dosya silinemedi: ${rel} (${(e as Error).message})`);
            }
        }
        console.log(`   🗑️  Upload dosyaları: ${deletedFiles}/${freshOrphans.length} dosya silindi`);
    } else {
        console.log('   ℹ️  CLEAN_UPLOAD_FILES=true verilmediği için upload dosyaları diskte bırakıldı (orphan).');
    }

    // ── Son doğrulama ──
    await assertAdminRemains();

    console.log('\n✅ Temizlik tamamlandı.');
}

main()
    .catch((e) => { console.error('❌ Temizlik hatası:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
