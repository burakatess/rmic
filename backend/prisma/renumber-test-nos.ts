/**
 * ControlTest.testNo standardizasyon script'i — tek seferlik.
 * Standart format: YYYY.KBT-XXX (BT kontrolleri) veya YYYY.KİB-XXX (BT dışı)
 * Örn: 2026.KBT-001, 2026.KİB-042
 *
 * Çalıştırma:
 *  npx ts-node --project tsconfig.json prisma/renumber-test-nos.ts --dry   # önizleme
 *  npx ts-node --project tsconfig.json prisma/renumber-test-nos.ts        # uygula
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY = process.argv.includes('--dry');

const VALID = /^\d{4}\.(KBT|KİB)-\d{3,}$/;
const BT_TYPES = new Set(['BT', 'IT_GENERAL', 'IT_APPLICATION']);

function suffix(type: string): 'KBT' | 'KİB' {
    return BT_TYPES.has(type) ? 'KBT' : 'KİB';
}

async function main() {
    const tests = await prisma.controlTest.findMany({
        include: { control: { select: { type: true } } },
        orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }],
    });

    const malformed = tests.filter(t => !VALID.test(t.testNo));
    console.log(`Toplam ${tests.length} test kaydı, ${malformed.length} tanesi standart dışı.\n`);

    // Bucket: `${year}.${suffix}` → mevcut kullanılan numaralar
    const counters = new Map<string, number>();
    const taken = new Set(tests.map(t => t.testNo));

    // Önce geçerli kayıtların mevcut numaralarını counters'a yükle
    for (const t of tests) {
        if (VALID.test(t.testNo)) {
            const [prefix, num] = t.testNo.split('-');
            const n = parseInt(num, 10);
            const current = counters.get(prefix) ?? 0;
            if (n > current) counters.set(prefix, n);
        }
    }

    const updates: { id: string; oldNo: string; newNo: string }[] = [];

    for (const t of malformed) {
        const date = t.plannedDate ?? t.createdAt;
        const year = date.getFullYear();
        const sfx = suffix(t.control.type);
        const prefix = `${year}.${sfx}`;
        const next = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, next);
        let newNo = `${prefix}-${next.toString().padStart(3, '0')}`;

        // Çakışma emniyeti
        while (taken.has(newNo)) {
            const bumped = (counters.get(prefix) ?? 0) + 1;
            counters.set(prefix, bumped);
            newNo = `${prefix}-${bumped.toString().padStart(3, '0')}`;
        }
        taken.delete(t.testNo);
        taken.add(newNo);
        updates.push({ id: t.id, oldNo: t.testNo, newNo });
    }

    for (const u of updates) console.log(`${u.oldNo}  →  ${u.newNo}`);

    if (DRY) {
        console.log(`\n[DRY RUN] ${updates.length} kayıt güncellenecekti.`);
        return;
    }
    if (updates.length === 0) {
        console.log('Güncellenecek kayıt yok.');
        return;
    }

    await prisma.$transaction(
        updates.map(u => prisma.controlTest.update({ where: { id: u.id }, data: { testNo: u.newNo } })),
    );
    console.log(`\n✅ ${updates.length} kayıt güncellendi.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
