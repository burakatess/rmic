/**
 * Sistem kaynaklarının (isSystemManaged) ONAYLI sürümleri için chunk + embedding indeksini üretir
 * (RetrievalService.buildIndex — idempotent: eski chunk'lar silinip yenileri tek transaction'da yazılır).
 *
 * DİKKAT: Embedding sağlayıcısına (AI_BASE_URL) kaynak metnini gönderir ve chunk tablosuna yazar.
 * Varsayılan DRY-RUN'dır (yalnız planı listeler). `--apply` gerekir; `grc_db` için ayrıca
 * `--i-have-approval-for-grc_db` bayrağı istenir.
 *
 * Kullanım:
 *   DATABASE_URL=postgresql://.../grc_sys_src_verify npx ts-node prisma/build-source-index.ts [--apply] [--only=<slug>]
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { RetrievalService } from '../src/modules/library/retrieval.service';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const dbName = (process.env.DATABASE_URL || '').split('/').pop()?.split('?')[0];

async function main() {
    if (APPLY && dbName === 'grc_db' && !process.argv.includes('--i-have-approval-for-grc_db')) {
        console.error('Bu işlem gerçek `grc_db` için AÇIK ONAY gerektirir (--i-have-approval-for-grc_db). Reddedildi.');
        process.exit(1);
    }
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const retrieval = app.get(RetrievalService, { strict: false });
    const admin = await prisma.user.findFirst({ where: { role: { name: 'SYSTEM_ADMIN' } } });
    if (!admin) throw new Error('SYSTEM_ADMIN kullanıcı yok.');

    const versions = await prisma.sourceVersion.findMany({
        where: {
            approvalStatus: 'APPROVED',
            source: {
                isSystemManaged: true, isActive: true,
                kind: { in: ['REGULATION', 'OFFICIAL_GUIDE', 'CORPORATE_POLICY'] },
                ...(ONLY ? { slug: ONLY } : {}),
            },
        },
        include: { source: { select: { slug: true } }, _count: { select: { units: true, chunks: true } } },
    });
    console.log(`DB: ${dbName} · mod: ${APPLY ? 'APPLY' : 'DRY-RUN'} · sürüm sayısı: ${versions.length}`);
    for (const v of versions) {
        console.log(`- ${v.source.slug}@${v.versionLabel}: birim=${v._count.units} mevcut chunk=${v._count.chunks} indeks=${v.indexStatus}`);
        if (!APPLY) continue;
        const r = await retrieval.buildIndex(v.id, admin.id);
        console.log(`  → ${r.status}, chunk=${r.chunks}`);
    }
    if (!APPLY) console.log('\n--apply verilmedi: hiçbir şey yazılmadı ve embedding sağlayıcısına çağrı yapılmadı.');
    await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
