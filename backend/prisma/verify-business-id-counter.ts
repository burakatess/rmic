/**
 * Isolated-DB verification helper. Never point this script at production.
 * It only uses scopes prefixed with `verification:` and removes them afterwards.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { nextCounterValue } from '../src/common/util/sequential-id';

if (
  process.env.NODE_ENV !== 'test' ||
  !process.env.DATABASE_URL?.includes('rmic_test')
) {
  throw new Error(
    'Bu doğrulama yalnız NODE_ENV=test ve rmic_test veritabanında çalıştırılabilir.',
  );
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const scope = `verification:concurrency:${Date.now()}`;

async function main() {
  const values = await Promise.all(
    Array.from({ length: 50 }, () => nextCounterValue(prisma, scope)),
  );
  const unique = new Set(values);
  if (
    unique.size !== 50 ||
    Math.min(...values) !== 1 ||
    Math.max(...values) !== 50
  ) {
    throw new Error(`Sayaç doğrulaması başarısız: ${JSON.stringify(values)}`);
  }
  console.log('OK: 50 eşzamanlı artış benzersiz ve kesintisiz (1..50).');
}

main().finally(async () => {
  await prisma.recordCounter.deleteMany({ where: { scope } });
  await prisma.$disconnect();
  await pool.end();
});
