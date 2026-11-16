import { parseTrustProxy } from './trust-proxy.util';
import { withAuditContext } from '../context/request-context';

describe('parseTrustProxy', () => {
    it('tanımsız/false → proxy güveni yok', () => {
        expect(parseTrustProxy(undefined)).toBe(false);
        expect(parseTrustProxy('')).toBe(false);
        expect(parseTrustProxy('false')).toBe(false);
    });

    it('true / * reddedilir (sahte X-Forwarded-For ile kimlik değiştirme)', () => {
        expect(() => parseTrustProxy('true')).toThrow();
        expect(() => parseTrustProxy('*')).toThrow();
    });

    it('hop sayısı ve adres listesi kabul edilir', () => {
        expect(parseTrustProxy('1')).toBe(1);
        expect(parseTrustProxy('10.0.0.5, 10.0.1.0/24, loopback')).toEqual(['10.0.0.5', '10.0.1.0/24', 'loopback']);
        expect(parseTrustProxy('fd00::1')).toEqual(['fd00::1']);
    });

    it('geçersiz girdi ve aşırı hop reddedilir', () => {
        expect(() => parseTrustProxy('proxy.local')).toThrow();
        expect(() => parseTrustProxy('99')).toThrow();
    });
});

describe('withAuditContext', () => {
    it('HTTP bağlamında USER + IP + UA ekler, açık değerleri ezmez', () => {
        expect(withAuditContext({ action: 'X' }, { ip: '10.0.0.9', userAgent: 'UA' }))
            .toEqual({ action: 'X', actorType: 'USER', ipAddress: '10.0.0.9', userAgent: 'UA' });
        expect(withAuditContext({ action: 'X', actorType: 'SYSTEM' }, { ip: '1.1.1.1' }).actorType).toBe('SYSTEM');
    });

    it('istek dışında SYSTEM aktörü; IP/UA eklenmez (hata değildir)', () => {
        expect(withAuditContext({ action: 'CRON' }, undefined)).toEqual({ action: 'CRON', actorType: 'SYSTEM' });
    });
});
