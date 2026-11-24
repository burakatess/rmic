/**
 * Hedefli izin geçişi — PLAN (yan etkisiz). Uygulayıcı: prisma/permission-migration.ts
 *
 * Seed varsayılanlarını TOPLUCA eklemez: yalnız bu geliştirmenin (kayıt kapsamı, kanıt izni,
 * taslak silme, risk direktörlüğü, Kontrol Havuzu) gerektirdiği izinler listelenir.
 * Paket 1'de korunan bilinçli izin kaldırmaları geri getirilmez: bir rol bu geçişten bir kez
 * geçtiyse (işaret: AuditLog action=PERMISSION_MIGRATION, newValue.migration=MIGRATION_KEY)
 * tekrar çalıştırmada o role DOKUNULMAZ — yönetici sonradan bir izni kaldırdıysa geri eklenmez.
 */
import { matchesPermission } from '../src/common/util/permission-match';

export const MIGRATION_KEY = '2026-11-access-scope-v1';

export interface TargetedGrant {
    role: string;
    permission: string;
    reason: string;
    impact: string;
}

export const TARGETED_GRANTS: TargetedGrant[] = [
    { role: 'RISK_CONTROL_MANAGER', permission: 'scope:org', reason: 'Merkezi yönetici kurum geneli kayıt kapsamına sahip olmalı', impact: 'Kapsam açılınca bugünkü kurum geneli görünürlüğü korunur' },
    { role: 'RISK_CONTROL_MANAGER', permission: 'evidence:view', reason: 'Kanıt indirme ayrı izne bağlandı', impact: 'Kapsam açılınca kanıt erişimi korunur' },
    { role: 'RISK_CONTROL_MANAGER', permission: 'finding:delete', reason: 'Taslak bulgu silme izne bağlandı (Paket 1: SYSTEM_ADMIN+RCM)', impact: 'Taslak silme yetkisi korunur; durum kuralları aynı' },
    { role: 'RISK_CONTROL_MANAGER', permission: 'risk:directorate:change', reason: 'Risk direktörlüğü değişikliği erişimi etkiler; ayrı izin', impact: 'Risklerin direktörlük eşlemesini yapabilir' },
    { role: 'AUDITOR', permission: 'scope:org', reason: 'Merkezi iç kontrol çalışanı kurum geneli kayıt kapsamına sahip', impact: 'Kapsam açılınca bugünkü kurum geneli görünürlüğü korunur; yazma/onay/export izinleri değişmez' },
    { role: 'AUDITOR', permission: 'evidence:view', reason: 'Kanıt indirme ayrı izne bağlandı', impact: 'Kapsam açılınca kanıt erişimi korunur' },
    { role: 'AUDITOR', permission: 'finding:delete:own', reason: 'Kendi oluşturduğu taslağı silebilir (ürün kararı)', impact: 'Yalnız kendi TASLAK bulgusunu silebilir; başkasınınki 403' },
    { role: 'RISK_ANALYST', permission: 'scope:org:risk', reason: 'Risk modülünde kurum geneli görüntüleme', impact: 'Tüm riskleri görür; test/bulgu/aksiyonda birim + atama' },
    { role: 'RISK_ANALYST', permission: 'evidence:view', reason: 'Kanıt indirme ayrı izne bağlandı', impact: 'Kapsamındaki kayıtların kanıtlarını açar' },
    { role: 'AUDITEE', permission: 'evidence:view', reason: 'Kanıt indirme ayrı izne bağlandı', impact: 'Yetkili birim/atanmış kayıtların kanıtlarını açar' },
    { role: 'AUDITEE', permission: 'control:view', reason: 'Kontrol Havuzu ortak ana veri (ürün kararı)', impact: 'Kontrol Havuzu görünür; düzenleme, plan uygulama, diğer birimlerin kayıtları ve kanıt indirme AÇILMAZ' },
];

/** Bilinçli olarak eklenmeyenler (rapor için). */
export const INTENTIONALLY_NOT_GRANTED: { role: string; permission: string; reason: string }[] = [
    { role: 'VIEWER', permission: 'evidence:view', reason: 'Salt okunur rolden kanıt indirme türetilmez (ürün kararı)' },
    { role: 'VIEWER', permission: 'report:export', reason: 'Salt okunur rolden export türetilmez (ürün kararı)' },
    { role: 'AUDITOR', permission: 'report:org', reason: 'Kayıt kapsamı ile kurum geneli rapor izni ayrı tutulur' },
];

export interface RoleRow { id: string; name: string; permissions: unknown }

export interface PlanRow {
    role: string;
    current: string[];
    add: { permission: string; reason: string; impact: string }[];
    alreadyCovered: { permission: string; by: string }[];
    skippedBecauseMigrated: boolean;
}

export function planPermissionMigration(roles: RoleRow[], migratedRoleIds: Set<string>): PlanRow[] {
    const byName = new Map(roles.map(r => [r.name, r]));
    const roleNames = [...new Set(TARGETED_GRANTS.map(g => g.role))];
    const out: PlanRow[] = [];
    for (const name of roleNames) {
        const role = byName.get(name);
        if (!role) continue;
        const current = Array.isArray(role.permissions) ? role.permissions.filter((p): p is string => typeof p === 'string') : [];
        const row: PlanRow = { role: name, current, add: [], alreadyCovered: [], skippedBecauseMigrated: migratedRoleIds.has(role.id) };
        for (const g of TARGETED_GRANTS.filter(x => x.role === name)) {
            if (matchesPermission(current, g.permission)) {
                const by = current.includes(g.permission) ? g.permission : current.includes('*') ? '*' : `${g.permission.split(':')[0]}:*`;
                row.alreadyCovered.push({ permission: g.permission, by });
            } else if (!row.skippedBecauseMigrated) {
                row.add.push({ permission: g.permission, reason: g.reason, impact: g.impact });
            }
        }
        out.push(row);
    }
    return out;
}
