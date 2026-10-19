/**
 * Sıralı, insan-okur kayıt numarası üretimi.
 *
 * Atomik yaklaşım (yeğlenen): `RecordCounter` tablosunda tek deyimlik
 * `UPDATE ... value = value + 1 RETURNING value`. Yarış-koşulu YOK, retry
 * gerektirmez, transaction içinde güvenlidir (aborted-tx sorunu yok).
 */

import { Prisma } from '@prisma/client';

interface RawClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

/**
 * `RecordCounter` sayacını atomik olarak 1 artırıp yeni değeri döndürür.
 * Sayaç satırı yoksa 1'den başlatır (migration mevcut kayıtlardan tohumlar).
 */
export async function nextCounterValue(
  db: RawClient,
  scope: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>(Prisma.sql`
        INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
        VALUES (${scope}, 1, NOW())
        ON CONFLICT ("scope")
        DO UPDATE SET "value" = "RecordCounter"."value" + 1, "updatedAt" = NOW()
        RETURNING "value"
    `);
  return rows[0].value;
}

/** En az dört haneli, yıllık kök kayıt numarası. */
export function formatRecordId(
  letter: string,
  value: number,
  year = new Date().getFullYear(),
): string {
  return `${letter}-${year}-${value.toString().padStart(4, '0')}`;
}

const FINDING_NO = /^B-(\d{4})-(\d{4,})$/;
const ACTION_NO = /^A-(\d{4})-(\d{4,})-(\d{2,})$/;

export function detectionYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
    }).format(date),
  );
}

export async function nextFindingNo(
  db: RawClient,
  detectedAt: Date,
): Promise<string> {
  const year = detectionYear(detectedAt);
  return formatRecordId(
    'B',
    await nextCounterValue(db, `finding:${year}`),
    year,
  );
}

export async function nextActionNo(
  db: RawClient,
  findingInternalId: string,
  findingNo: string,
): Promise<string> {
  const match = FINDING_NO.exec(findingNo);
  if (!match) throw new Error(`Geçersiz parent bulgu numarası: ${findingNo}`);
  const sequence = await nextCounterValue(db, `action:${findingInternalId}`);
  return `A-${match[1]}-${match[2]}-${sequence.toString().padStart(2, '0')}`;
}

export async function nextFollowUpNo(
  db: RawClient,
  actionInternalId: string,
  actionNo: string,
): Promise<string> {
  const match = ACTION_NO.exec(actionNo);
  if (!match) throw new Error(`Geçersiz parent aksiyon numarası: ${actionNo}`);
  const sequence = await nextCounterValue(db, `followup:${actionInternalId}`);
  return `T-${match[1]}-${match[2]}-${match[3]}-${sequence.toString().padStart(2, '0')}`;
}

// ─── Geriye dönük: P2002-retry sarmalayıcı (sequence-dışı çağrılar için) ──────
export async function createWithSequentialId<T>(opts: {
  create: (candidateId: string) => Promise<T>;
  nextId: () => Promise<string>;
  retries?: number;
}): Promise<T> {
  const retries = opts.retries ?? 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const candidate = await opts.nextId();
    try {
      return await opts.create(candidate);
    } catch (e) {
      if (isUniqueViolation(e)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002'
  );
}
