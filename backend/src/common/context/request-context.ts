import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * İstek bağlamı — denetim izinin aktör bağlamı için (IP, User-Agent).
 *
 * - HTTP isteği içinde yazılan her AuditLog: actorType=USER + ipAddress + userAgent.
 * - İstek dışında (cron, arka plan) yazılan AuditLog: actorType=SYSTEM; IP/UA yoktur
 *   (bu bir hata değildir).
 * IP `req.ip`'den alınır: yalnız TRUST_PROXY ile açıkça güvenilen proxy'lerden gelen
 * X-Forwarded-For dikkate alınır (bkz. trust-proxy.util.ts). İstek gövdesi, kimlik
 * bilgisi veya token bağlama ALINMAZ.
 */
export interface RequestContextStore {
    ip?: string;
    userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

const MAX_UA = 512;

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
    const ua = req.headers['user-agent'];
    requestContext.run(
        {
            ip: req.ip || req.socket?.remoteAddress || undefined,
            userAgent: typeof ua === 'string' ? ua.slice(0, MAX_UA) : undefined,
        },
        next,
    );
}

type AuditData = Record<string, unknown>;

/** AuditLog verisine aktör bağlamını ekler; çağıranın açıkça verdiği değerler korunur. */
export function withAuditContext<T extends AuditData>(data: T, store: RequestContextStore | undefined = requestContext.getStore()): T {
    if (!data || typeof data !== 'object') return data;
    if (!store) {
        return { ...data, actorType: data.actorType ?? 'SYSTEM' };
    }
    return {
        ...data,
        actorType: data.actorType ?? 'USER',
        ipAddress: data.ipAddress ?? store.ip ?? null,
        userAgent: data.userAgent ?? store.userAgent ?? null,
    };
}
