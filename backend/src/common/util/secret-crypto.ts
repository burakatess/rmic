import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Ayar sırlarını (ör. LDAP servis hesabı şifresi) veritabanında şifreli saklama: AES-256-GCM.
 * Anahtar `SETTINGS_ENCRYPTION_KEY` ortam değişkeninden gelir (32 bayt; hex 64 karakter veya base64).
 * Biçim: v1:<iv b64>:<tag b64>:<şifreli b64>. Anahtar yoksa şifreleme reddedilir (düz metin saklanmaz).
 */
export class SecretKeyMissingError extends Error {
    constructor() { super('SETTINGS_ENCRYPTION_KEY tanımlı değil veya geçersiz (32 bayt olmalı).'); }
}

export function loadSettingsKey(raw: string | undefined | null): Buffer {
    const v = (raw ?? '').trim();
    if (!v) throw new SecretKeyMissingError();
    const buf = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
    if (buf.length !== 32) throw new SecretKeyMissingError();
    return buf;
}

export function encryptSecret(plain: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(payload: string, key: Buffer): string {
    const [ver, iv, tag, data] = payload.split(':');
    if (ver !== 'v1' || !iv || !tag || !data) throw new Error('Şifreli değer biçimi tanınmadı.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
