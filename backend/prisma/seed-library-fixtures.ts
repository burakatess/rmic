/**
 * ENTEGRASYON DOĞRULAMA FIXTURE'LARI — YALNIZCA İZOLE TEST DB.
 *
 * Açıkça test fixture'ı olarak işaretlenmiş, ONAYLI + RAG hakkı İZİNLİ örnek
 * kaynak birimleri kurar; böylece Kaynak Kataloğu ↔ Kontrol & Kanıt Değerlendirme
 * entegrasyonu uçtan uca çalıştırılabilir.
 *
 * GÜVENLİK: grc_db (üretim/gerçek dev) üzerinde ÇALIŞMAYI REDDEDER. DATABASE_URL
 * içinde "test" / "fixture" / "verify" / "_lib" geçmeli ya da --force verilmeli.
 * Üretim kayıtlarını kendiliğinden APPROVED yapmaz; yalnız fixture kaynağını.
 *
 * Kullanım:
 *   DATABASE_URL=postgresql://.../grc_verify npx ts-node prisma/seed-library-fixtures.ts --apply --created-by admin@rmic.com
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { FIXTURE_SOURCE, FIXTURE_UNITS } from './library-data/fixture-source-units';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const CREATED_BY = (() => {
    const i = args.indexOf('--created-by');
    return i >= 0 ? args[i + 1] : undefined;
})();

function assertIsolated() {
    const url = process.env.DATABASE_URL || '';
    const safe = /test|fixture|verify|_lib|scratch|grc_mig|srccat/i.test(url);
    if (!safe && !FORCE) {
        console.error(
            'REDDEDİLDİ: DATABASE_URL izole bir test DB gibi görünmüyor:\n  ' +
                url.replace(/:[^:@/]*@/, ':***@') +
                '\nFixture yalnız izole DB\'de çalışır. Emin iseniz --force ekleyin.',
        );
        process.exit(1);
    }
}

async function main() {
    assertIsolated();
    console.log(`Fixture seed — ${APPLY ? 'UYGULA' : 'KURU'} · DB: ${(process.env.DATABASE_URL || '').replace(/:[^:@/]*@/, ':***@')}`);
    console.log(`  Fixture kaynağı: ${FIXTURE_SOURCE.slug} · ${FIXTURE_UNITS.length} birim`);
    if (!APPLY) {
        console.log('\n--apply verilmedi. DB değişmedi.');
        return;
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const actor =
            (CREATED_BY
                ? await prisma.user.findFirst({ where: { OR: [{ id: CREATED_BY }, { email: CREATED_BY }] } })
                : null) ??
            (await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } }, orderBy: { createdAt: 'asc' } }));
        if (!actor) throw new Error('Aktör kullanıcı bulunamadı.');

        // 1) Fixture kaynağı — isTestFixture=true, RAG hakkı doğrulanmış (fixture dayanağıyla)
        const source = await prisma.source.upsert({
            where: { slug: FIXTURE_SOURCE.slug },
            create: {
                slug: FIXTURE_SOURCE.slug,
                kind: 'STANDARD_FRAMEWORK',
                title: FIXTURE_SOURCE.title,
                publisher: FIXTURE_SOURCE.publisher,
                officialUrl: FIXTURE_SOURCE.officialUrl,
                docCode: FIXTURE_SOURCE.docCode,
                language: FIXTURE_SOURCE.language,
                confidentiality: 'PUBLIC',
                tags: ['test-fixture', 'entegrasyon-dogrulama'],
                isTestFixture: true,
                rightRefLink: 'ALLOWED',
                rightRag: 'ALLOWED',
                rightFullText: 'ALLOWED',
                rightsBasis: FIXTURE_SOURCE.rightsBasis,
                rightsVerifiedById: actor.id,
                rightsVerifiedAt: new Date(),
                rightsNote: FIXTURE_SOURCE.rightsBasis,
                createdById: actor.id,
            },
            update: {
                title: FIXTURE_SOURCE.title,
                isTestFixture: true,
                rightRag: 'ALLOWED',
                rightsBasis: FIXTURE_SOURCE.rightsBasis,
                rightsVerifiedById: actor.id,
                rightsVerifiedAt: new Date(),
            },
        });

        // 2) Sürüm — APPROVED + içerik incelemesi işaretli
        const version = await prisma.sourceVersion.upsert({
            where: { sourceId_versionLabel: { sourceId: source.id, versionLabel: FIXTURE_SOURCE.versionLabel } },
            create: {
                sourceId: source.id,
                versionLabel: FIXTURE_SOURCE.versionLabel,
                approvalStatus: 'APPROVED',
                contentRetrieved: true,
                contentReviewedById: actor.id,
                contentReviewedAt: new Date(),
                accessedAt: new Date(),
                storageNote: 'TEST FIXTURE — resmî metin değil.',
            },
            update: {
                approvalStatus: 'APPROVED',
                contentReviewedById: actor.id,
                contentReviewedAt: new Date(),
            },
        });

        // 3) Birimler
        for (const u of FIXTURE_UNITS) {
            await prisma.sourceUnit.upsert({
                where: { versionId_stableKey: { versionId: version.id, stableKey: u.stableKey } },
                create: {
                    versionId: version.id,
                    stableKey: u.stableKey,
                    unitCode: u.unitCode,
                    unitType: u.unitType,
                    title: u.title,
                    originalText: u.originalText,
                    translationTr: u.translationTr,
                    scope: u.scope,
                    riskAreas: [],
                },
                update: { originalText: u.originalText, translationTr: u.translationTr, title: u.title },
            });
        }
        // Birim upsert'i sürümü STALE'e çekmiş olabilir → içerik incelemesini + onayı yeniden işaretle
        await prisma.sourceVersion.update({
            where: { id: version.id },
            data: {
                approvalStatus: 'APPROVED',
                contentReviewedById: actor.id,
                contentReviewedAt: new Date(),
                indexStatus: 'NONE',
            },
        });

        console.log(`  ✓ fixture kaynağı + sürüm (APPROVED) + ${FIXTURE_UNITS.length} birim`);
        console.log(`  → RAG indeksi için: POST /api/library/versions/${version.id}/build-index (embedding açıksa)`);
        console.log(`  versionId=${version.id}`);
        console.log(`  unitIds:`);
        const units = await prisma.sourceUnit.findMany({ where: { versionId: version.id }, select: { id: true, unitCode: true } });
        units.forEach((x) => console.log(`    ${x.unitCode.padEnd(20)} ${x.id}`));

        console.log('\n🎯 Fixture seed tamamlandı (izole DB).');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
