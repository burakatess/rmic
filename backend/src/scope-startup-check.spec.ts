import { scopeEnforcementStartupCheck } from './main';

describe('Üretimde kayıt kapsamı başlangıç doğrulaması', () => {
    it('geliştirmede kontrol uygulanmaz', () => {
        expect(scopeEnforcementStartupCheck({ nodeEnv: 'development' }).ok).toBe(true);
    });
    it('production + true → başlar', () => {
        expect(scopeEnforcementStartupCheck({ nodeEnv: 'production', flag: 'true' })).toEqual({ ok: true, level: 'ok' });
    });
    it('production + tanımsız → başlamaz', () => {
        expect(scopeEnforcementStartupCheck({ nodeEnv: 'production' }).ok).toBe(false);
    });
    it('production + false gerekçesiz → başlamaz; gerekçeyle → uyarıyla başlar', () => {
        expect(scopeEnforcementStartupCheck({ nodeEnv: 'production', flag: 'false' }).ok).toBe(false);
        const r = scopeEnforcementStartupCheck({ nodeEnv: 'production', flag: 'false', reason: 'Yerel geliştirme' });
        expect(r.ok).toBe(true);
        expect(r.level).toBe('warn');
        expect(r.message).toContain('Yerel geliştirme');
    });
});
