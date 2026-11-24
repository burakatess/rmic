import { matchesPermission } from '../util/permission-match';

/**
 * Kaynak Kataloğu gizlilik seviyesi — kullanıcının İZİNLERİNDEN türetilir (rol adından değil).
 * Önceden `role === 'AUDITOR' || role === 'IKS_MANAGER'` gibi rol adı karşılaştırmaları vardı;
 * özel (yeni) roller bu yüzden hiçbir zaman KISITLI/GİZLİ kaynağa erişemezdi.
 *
 *   ai:source:confidential → GİZLİ (ve altı)
 *   ai:source:restricted   → KISITLI (ve altı)
 *   hiçbiri                → GENEL + DAHİLİ
 * `*` ve `ai:*` jokeri her ikisini de kapsar (matchesPermission semantiği).
 */
export type Confidentiality = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';

const ORDER: Confidentiality[] = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];

export function maxConfidentialityFor(permissions: readonly string[] | undefined | null): Confidentiality {
    const perms = permissions ?? [];
    if (matchesPermission(perms, 'ai:source:confidential')) return 'CONFIDENTIAL';
    if (matchesPermission(perms, 'ai:source:restricted')) return 'RESTRICTED';
    return 'INTERNAL';
}

export function allowedConfidentialityLevels(permissions: readonly string[] | undefined | null): Confidentiality[] {
    return ORDER.slice(0, ORDER.indexOf(maxConfidentialityFor(permissions)) + 1);
}
