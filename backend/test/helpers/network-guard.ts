// E2E ağ koruması: testler dış ağa ÇIKAMAZ. Loopback (supertest, yerel test DB) dışındaki
// HTTP(S)/fetch çağrıları engellenir VE kaydedilir; çağrıyı yapan kod hatayı yutsa bile
// (ör. embedding geri dönüşü) test afterEach'te başarısız olur.
import http from 'http';
import https from 'https';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '']);
const violations: string[] = [];

function hostOf(arg: unknown): string {
    try {
        if (typeof arg === 'string') return new URL(arg).hostname;
        if (arg instanceof URL) return arg.hostname;
        if (arg && typeof arg === 'object') {
            const o = arg as { hostname?: string; host?: string; url?: string };
            if (o.url) return new URL(o.url).hostname;
            return (o.hostname ?? o.host ?? '').split(':')[0];
        }
    } catch { /* çözümlenemeyen istek dış sayılır */ }
    return '<bilinmiyor>';
}

function guard(kind: string, target: unknown) {
    const host = hostOf(target);
    if (!LOOPBACK.has(host)) {
        violations.push(`${kind} → ${host}`);
        throw new Error(`[network-guard] Test sırasında beklenmeyen dış ağ çağrısı engellendi: ${kind} ${host}`);
    }
}

const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: unknown) => {
    guard('fetch', input);
    return origFetch(input as never, init as never);
}) as typeof fetch;

for (const [mod, name] of [[http, 'http'], [https, 'https']] as const) {
    const origRequest = mod.request.bind(mod);
    const origGet = mod.get.bind(mod);
    (mod as { request: unknown }).request = (...args: unknown[]) => { guard(`${name}.request`, args[0]); return (origRequest as (...a: unknown[]) => unknown)(...args); };
    (mod as { get: unknown }).get = (...args: unknown[]) => { guard(`${name}.get`, args[0]); return (origGet as (...a: unknown[]) => unknown)(...args); };
}

afterEach(() => {
    if (violations.length > 0) {
        const list = violations.splice(0).join('; ');
        throw new Error(`[network-guard] Beklenmeyen dış ağ çağrısı: ${list}`);
    }
});
