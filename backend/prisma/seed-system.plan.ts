/**
 * seed-system.ts için yan etkisiz planlama yardımcıları.
 *
 * Kural: Sistem seed'i her konteyner açılışında çalışabilir (docker-entrypoint.sh,
 * RUN_SEED_SYSTEM). Bu yüzden yönetici ekranından değiştirilebilen hiçbir değeri
 * (rol izinleri, SLA parametreleri, kaynak metinleri, direktörlük durumu) EZMEMELİDİR.
 *
 * - Eksik rol → varsayılan izinlerle oluşturulur.
 * - Mevcut rol → izinlerine dokunulmaz. Varsayılanda olup rolde olmayan izinler
 *   yalnızca raporlanır; operatör açıkça SEED_SYSTEM_SYNC_ROLE_PERMISSIONS=true
 *   verirse EKLENİR (hiçbir izin kaldırılmaz).
 */

export interface RoleDefinition {
    name: string;
    description?: string;
    permissions: string[];
}

export interface ExistingRole {
    name: string;
    permissions: unknown;
}

export interface RoleSeedPlan {
    toCreate: RoleDefinition[];
    /** Mevcut rol adı → varsayılanda olup rolde bulunmayan izinler. */
    missingDefaults: Record<string, string[]>;
    /** syncMissing=true ise rolün yazılacak (birleştirilmiş) izin listesi. */
    toMerge: Record<string, string[]>;
}

function asPermissionList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];
}

export function planRoleSeed(
    defaults: RoleDefinition[],
    existing: ExistingRole[],
    syncMissing: boolean,
): RoleSeedPlan {
    const byName = new Map(existing.map(r => [r.name, asPermissionList(r.permissions)]));
    const plan: RoleSeedPlan = { toCreate: [], missingDefaults: {}, toMerge: {} };

    for (const def of defaults) {
        const current = byName.get(def.name);
        if (!current) {
            plan.toCreate.push(def);
            continue;
        }
        // '*' tüm izinleri kapsar — eksik sayılacak bir şey yok.
        if (current.includes('*')) continue;
        const missing = def.permissions.filter(p => !current.includes(p));
        if (missing.length === 0) continue;
        plan.missingDefaults[def.name] = missing;
        if (syncMissing) plan.toMerge[def.name] = [...current, ...missing];
    }
    return plan;
}

export function isTruthyEnv(value: string | undefined): boolean {
    return value === 'true' || value === '1';
}
