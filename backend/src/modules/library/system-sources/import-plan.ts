// Sistem kaynağı içe aktarımı için SAF (DB'siz) planlama yardımcıları.
// import-system-sources.ts ve cleanup-library-sources.ts bunları kullanır; birim testleri bunları kapsar.

import { createHash } from 'crypto';

/** Anahtarları sıralı, Date'leri ISO string'e çeviren kararlı JSON — hash/karşılaştırma için. */
export function stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const walk = (v: unknown): unknown => {
        if (v === undefined) return null;
        if (v instanceof Date) return v.toISOString();
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v)) throw new Error('stableStringify: döngüsel yapı');
        seen.add(v);
        if (Array.isArray(v)) return v.map(walk);
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v).sort()) {
            const val = (v as Record<string, unknown>)[k];
            if (val !== undefined) out[k] = walk(val);
        }
        return out;
    };
    return JSON.stringify(walk(value));
}

export function sha256Short(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

export interface FingerprintInput {
    stableKey: string;
    unitCode: string;
    unitType: string;
    title: string;
    originalText: string;
    parentKey?: string | null;
    locator?: unknown;
    metadata?: unknown;
}

/**
 * Birimin DB'de saklanan tüm anlamlı alanlarının özeti. SourceUnit.contentHash olarak yazılır; yalnızca
 * metin değil yapı/konum/üst veri değişikliği de "güncellendi" sayılır.
 */
export function fingerprintUnit(u: FingerprintInput): string {
    return sha256Short(
        stableStringify({
            k: u.stableKey,
            c: u.unitCode,
            t: u.unitType,
            ti: u.title,
            o: u.originalText,
            p: u.parentKey ?? null,
            l: u.locator ?? null,
            m: u.metadata ?? null,
        }),
    );
}

/** Sürüm özeti: sıralı birim özetlerinden (birim yoksa boş). */
export function versionHashFromUnits(unitHashes: string[]): string {
    return sha256Short(unitHashes.join('|'));
}

export interface UpsertPlan<E, I> {
    toCreate: I[];
    toUpdate: { existing: E; incoming: I }[];
    unchanged: E[];
    /** Yeni içerikte artık bulunmayanlar — ASLA silinmez, yalnızca raporlanır. */
    removed: E[];
}

/**
 * Idempotent upsert planı (stableKey + contentHash): yok → oluştur; hash farklı/boş → güncelle;
 * hash aynı → değişmedi; yalnız mevcutta olan → removed (rapor).
 */
export function planUpsert<
    E extends { stableKey: string; contentHash: string | null },
    I extends { stableKey: string; contentHash: string },
>(existing: E[], incoming: I[]): UpsertPlan<E, I> {
    const byKey = new Map<string, E>();
    for (const e of existing) {
        if (byKey.has(e.stableKey)) throw new Error(`Mevcut kayıtlarda yinelenen stableKey: ${e.stableKey}`);
        byKey.set(e.stableKey, e);
    }
    const seen = new Set<string>();
    const plan: UpsertPlan<E, I> = { toCreate: [], toUpdate: [], unchanged: [], removed: [] };
    for (const inc of incoming) {
        if (seen.has(inc.stableKey)) throw new Error(`Yeni içerikte yinelenen stableKey: ${inc.stableKey}`);
        seen.add(inc.stableKey);
        const ex = byKey.get(inc.stableKey);
        if (!ex) plan.toCreate.push(inc);
        else if (ex.contentHash !== null && ex.contentHash === inc.contentHash) plan.unchanged.push(ex);
        else plan.toUpdate.push({ existing: ex, incoming: inc });
    }
    for (const e of existing) if (!seen.has(e.stableKey)) plan.removed.push(e);
    return plan;
}

/** İçe aktarma zamanı gibi her çalışmada değişen alanlar karşılaştırmadan çıkarılır. */
const VOLATILE_KEYS = ['importedAt'];
export function stableMetadata(m: unknown): unknown {
    if (m === null || typeof m !== 'object' || Array.isArray(m)) return m ?? null;
    const o: Record<string, unknown> = { ...(m as Record<string, unknown>) };
    for (const k of VOLATILE_KEYS) delete o[k];
    return o;
}

/** Karşılaştırılacak alanlardan farklı olanların adları (Date/JSON kararlı). */
export function diffFields(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
    keys: string[],
): string[] {
    const out: string[] = [];
    for (const k of keys) {
        const a = k === 'metadata' ? stableMetadata(existing[k]) : existing[k];
        const b = k === 'metadata' ? stableMetadata(incoming[k]) : incoming[k];
        if (stableStringify(a ?? null) !== stableStringify(b ?? null)) out.push(k);
    }
    return out;
}

/**
 * Kaynak üst verisi birleştirme: kapsam (scope) bir insan tarafından DOĞRULANDIYSA ve 2. madde metni
 * değişmediyse, yeniden içe aktarma o doğrulamayı SIFIRLAMAZ. Metin değiştiyse UNVERIFIED'a döner.
 */
export function mergeSourceMetadata(existing: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...incoming };
    const ex = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : null;
    const exScope = ex?.scope as { verbatimArticle2?: string } | undefined;
    const inScope = incoming.scope as { verbatimArticle2?: string } | undefined;
    if (exScope && inScope && exScope.verbatimArticle2 === inScope.verbatimArticle2) {
        merged.scope = exScope;
    }
    return merged;
}

// ─── Veritabanı koruması ───────────────────────────────────────────────────

export const PROTECTED_DB_NAME = 'grc_db';
export const GRC_DB_APPROVAL_FLAG = '--i-have-approval-for-grc_db';

export function dbNameFromUrl(databaseUrl: string | undefined): string | null {
    if (!databaseUrl) return null;
    try {
        const u = new URL(databaseUrl);
        const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
        return name || null;
    } catch {
        return null;
    }
}

export interface ApplyGuardResult {
    ok: boolean;
    dbName: string | null;
    reason?: string;
}

/**
 * Derinlemesine savunma: `--apply`, DATABASE_URL tam olarak `grc_db` adlı veritabanını gösteriyorsa,
 * ayrıca açık onay bayrağı verilmedikçe reddedilir. Veritabanı adı çözümlenemezse de (belirsizlik) reddedilir.
 */
export function checkApplyAllowed(opts: {
    databaseUrl: string | undefined;
    apply: boolean;
    approvalFlagGiven: boolean;
}): ApplyGuardResult {
    const dbName = dbNameFromUrl(opts.databaseUrl);
    if (!opts.apply) return { ok: true, dbName };
    if (!opts.databaseUrl) return { ok: false, dbName, reason: 'DATABASE_URL tanımlı değil.' };
    if (!dbName) return { ok: false, dbName, reason: 'DATABASE_URL içinden veritabanı adı çözümlenemedi; güvenlik gereği --apply reddedildi.' };
    if (dbName === PROTECTED_DB_NAME && !opts.approvalFlagGiven) {
        return {
            ok: false,
            dbName,
            reason: `--apply, "${PROTECTED_DB_NAME}" veritabanına yazmayı gerektiriyor. Yalnızca açık onay ile (${GRC_DB_APPROVAL_FLAG}) çalıştırılabilir.`,
        };
    }
    return { ok: true, dbName };
}

/** Salt-okunur oturum: sunucu tarafında default_transaction_read_only=on (yazma denemesi DB'de reddedilir). */
export const READ_ONLY_PG_OPTIONS = '-c default_transaction_read_only=on';

// ─── Kapsam profili parametresi ─────────────────────────────────────────────

export const SCOPE_PARAM_KEY = 'evaluation_scope_profile';
export const SCOPE_PARAM_CATEGORY = 'AI_EVAL';
export const SCOPE_PARAM_DESCRIPTION =
    'Kurum kapsam profili: kaynak slug → IN_SCOPE | OUT_OF_SCOPE | UNVERIFIED (Kontrol & Kanıt Değerlendirme, mevzuat bağlayıcılığı)';

export function defaultScopeParamValue(tebligSlug: string): Record<string, string> {
    return { [tebligSlug]: 'UNVERIFIED' };
}

export interface ScopeParamPlan {
    action: 'create' | 'keep';
    /** Yalnız action === 'create' iken dolu. Mevcut değer ASLA ezilmez / birleştirilmez. */
    data?: { category: string; key: string; value: Record<string, string>; description: string };
}

/**
 * Parametre satırı yoksa oluşturulur; VARSA (değeri ne olursa olsun) olduğu gibi bırakılır —
 * yönetici arayüzü yalnız mevcut Parameter satırlarını düzenleyebildiği için satırı içe aktarıcı yaratır,
 * ancak yöneticinin verdiği hiçbir kapsam kararı yeniden içe aktarmada sıfırlanmaz.
 */
export function planScopeParameter(existing: { id: string } | null, tebligSlug: string): ScopeParamPlan {
    if (existing) return { action: 'keep' };
    return {
        action: 'create',
        data: {
            category: SCOPE_PARAM_CATEGORY,
            key: SCOPE_PARAM_KEY,
            value: defaultScopeParamValue(tebligSlug),
            description: SCOPE_PARAM_DESCRIPTION,
        },
    };
}
