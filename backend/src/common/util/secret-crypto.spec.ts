import { decryptSecret, encryptSecret, loadSettingsKey, SecretKeyMissingError } from './secret-crypto';

describe('secret-crypto', () => {
    const key = loadSettingsKey('a'.repeat(64));
    it('şifreler ve geri çözer; her şifrelemede farklı çıktı (rastgele IV)', () => {
        const a = encryptSecret('Gizli!123', key);
        const b = encryptSecret('Gizli!123', key);
        expect(a).not.toBe(b);
        expect(a).not.toContain('Gizli');
        expect(decryptSecret(a, key)).toBe('Gizli!123');
    });
    it('yanlış anahtar veya oynanmış veri çözülemez', () => {
        const enc = encryptSecret('x', key);
        expect(() => decryptSecret(enc, loadSettingsKey('b'.repeat(64)))).toThrow();
        const parts = enc.split(':'); parts[3] = Buffer.from('zz').toString('base64');
        expect(() => decryptSecret(parts.join(':'), key)).toThrow();
    });
    it('anahtar yok/kısa ise reddedilir', () => {
        expect(() => loadSettingsKey('')).toThrow(SecretKeyMissingError);
        expect(() => loadSettingsKey('abcd')).toThrow(SecretKeyMissingError);
        expect(loadSettingsKey(Buffer.alloc(32, 1).toString('base64')).length).toBe(32);
    });
});
