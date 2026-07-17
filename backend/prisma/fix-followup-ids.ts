/**
 * FollowUp ID standardizasyon script'i — tek seferlik.
 * Standart format: YYYY.MM.TİP.NN[.ANNNN]  (örn. 2026.07.BT.11.A0027)
 *
 * Düzeltilenler:
 *  - FU-YYYY-MM-NNNN formatlı eski seed kayıtları
 *  - .A<cuid-kuyruğu> formatlı hatalı kayıtlar (örn. .A55t3)
 *
 * Çalıştırma:
 *  npx ts-node --project tsconfig.json prisma/fix-followup-ids.ts --dry   # önizleme
 *  npx ts-node --project tsconfig.json prisma/fix-followup-ids.ts        # uygula
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY = process.argv.includes('--dry');

// Geçerli format: YYYY.MM.TİP.NN veya YYYY.MM.TİP.NN.ANNNN
const VALID = /^\d{4}\.\d{2}\.(BT|İB)\.\w+(\.A\d{4})?$/;

function buildId(date: Date, findingType: string | null, findingId: string, actionBusinessId?: string | null): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const typeCode = findingType === 'IB' ? 'İB' : 'BT';
    const findingNum = findingId.split('.').pop() || '01';
    let id = `${year}.${month}.${typeCode}.${findingNum}`;
    if (actionBusinessId) {
        const actionNum = (actionBusinessId.split('-').pop() || '0001').padStart(4, '0');
        id += `.A${actionNum}`;
    }
    return id;
}

async function main() {
    const followUps = await prisma.findingFollowUp.findMany({
        include: {
            finding: { select: { findingId: true, findingType: true } },
            action: { select: { actionId: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const malformed = followUps.filter(fu => !VALID.test(fu.followUpId));
    console.log(`Toplam ${followUps.length} takip kaydı, ${malformed.length} tanesi standart dışı.\n`);

    const taken = new Set(followUps.map(fu => fu.followUpId));
    const updates: { id: string; oldId: string; newId: string }[] = [];

    for (const fu of malformed) {
        const date = fu.plannedDate ?? fu.createdAt;
        let newId = buildId(date, fu.finding.findingType, fu.finding.findingId, fu.action?.actionId);

        // Çakışma çözümü
        if (taken.has(newId)) {
            let n = 2;
            while (taken.has(`${newId}-${n}`)) n++;
            newId = `${newId}-${n}`;
        }
        taken.delete(fu.followUpId);
        taken.add(newId);
        updates.push({ id: fu.id, oldId: fu.followUpId, newId });
    }

    for (const u of updates) {
        console.log(`${u.oldId}  →  ${u.newId}`);
    }

    if (DRY) {
        console.log(`\n[DRY RUN] ${updates.length} kayıt güncellenecekti. Değişiklik yapılmadı.`);
        return;
    }

    if (updates.length === 0) {
        console.log('Güncellenecek kayıt yok.');
        return;
    }

    await prisma.$transaction(
        updates.map(u => prisma.findingFollowUp.update({ where: { id: u.id }, data: { followUpId: u.newId } })),
    );
    console.log(`\n✅ ${updates.length} kayıt güncellendi.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
