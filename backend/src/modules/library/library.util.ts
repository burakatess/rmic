import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';

/**
 * Kaynak Kataloğu denetim izi — servisler bunu paylaşır. Yazım başarısız olsa
 * bile ana işlem sürer (fire-and-forget, mevcut desen).
 */
export async function writeAudit(
    prisma: PrismaService,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
): Promise<void> {
    await prisma.auditLog
        .create({
            data: {
                userId,
                action,
                entityType,
                entityId,
                oldValue: (oldValue ?? Prisma.JsonNull),
                newValue: (newValue ?? Prisma.JsonNull),
            },
        })
        .catch(() => undefined);
}

/** ISO tarih string'ini Date'e çevirir; boş/geçersizse null. */
export function toDate(s?: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

export function sha256Short(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
