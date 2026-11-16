/**
 * TRUST_PROXY yapılandırması — Express `trust proxy` ayarı.
 *
 * Güvenli varsayılan: tanımsız → proxy'ye GÜVENİLMEZ (req.ip = TCP bağlantı adresi;
 * istemcinin gönderdiği X-Forwarded-For yok sayılır).
 *
 * Kabul edilen değerler:
 *  - Hop sayısı  : "1", "2" … (önündeki N proxy'ye güven)
 *  - Adres listesi: "10.0.0.5, 10.0.1.0/24, loopback" (yalnız bu adreslerden gelen
 *                   X-Forwarded-For dikkate alınır)
 * "true", "*", "all" REDDEDİLİR: tüm hop'lara güvenmek istemcinin sahte
 * X-Forwarded-For ile IP/rate-limit kimliğini değiştirmesine izin verir.
 */
export type TrustProxySetting = false | number | string[];

const NAMED = new Set(['loopback', 'linklocal', 'uniquelocal']);
const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$/;
const IPV6_CIDR = /^[0-9a-fA-F:]+(\/(12[0-8]|1[01]\d|[1-9]?\d))?$/;

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
    const value = (raw ?? '').trim();
    if (!value || value === 'false' || value === '0') return false;
    if (['true', '*', 'all'].includes(value.toLowerCase())) {
        throw new Error('TRUST_PROXY=true/* desteklenmez: güvenilen proxy adreslerini veya hop sayısını açıkça verin.');
    }
    if (/^\d+$/.test(value)) {
        const hops = Number(value);
        if (hops < 1 || hops > 10) throw new Error('TRUST_PROXY hop sayısı 1–10 arasında olmalıdır.');
        return hops;
    }
    const entries = value.split(',').map(e => e.trim()).filter(Boolean);
    for (const e of entries) {
        if (!NAMED.has(e) && !IPV4_CIDR.test(e) && !(e.includes(':') && IPV6_CIDR.test(e))) {
            throw new Error(`TRUST_PROXY geçersiz girdi: ${e}`);
        }
    }
    return entries;
}
