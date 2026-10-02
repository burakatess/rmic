// Kaynak Kataloğu temizlik önerisi — SAF kurallar (DB'siz). cleanup-library-sources.ts kullanır.
// İlke: geçmiş bir değerlendirmede kullanılmış kaynak ASLA fiziksel silinmez (SILINEBILIR olamaz).

export type CleanupAction = 'KORU' | 'ARSIVLE' | 'SILINEBILIR' | 'SISTEM_KAYNAGIYLA_DEGISTIR';

export const LEGACY_SPK_SLUG = 'spk-mevzuat';

export interface SourceFacts {
    slug: string;
    isSystemManaged: boolean;
    unitCount: number;
    chunkCount: number;
    embeddedChunkCount: number;
    mappingCount: number;
    /** EvalScenarioSource (sürüm bazlı) sayısı. */
    evalScenarioSourceCount: number;
    /** EvalScenarioRef (birim bazlı) sayısı. */
    evalScenarioRefCount: number;
    /** Birim/sürüm/slug'ı AiEvalSession alanlarında (sourceUnitIds, usedSourceUnitIds, suggestedSourceUnitIds, sourceSnapshot) geçen oturum sayısı. */
    aiEvalSessionCount: number;
    /** sentSourceUnitIds / citedSourceRefs / runInputSnapshot içinde geçen AiEvalMessage sayısı. */
    aiEvalMessageCount: number;
    /** Geçmiş snapshot'lar (oturum veya mesaj) var mı — kaynak fiilen kullanıldı demektir. */
    hasHistoricalSnapshots: boolean;
    /** Yeni Tebliğ sistem kaynağı DB'de var veya bu çalışmada içe aktarılacak. */
    replacementSourceExistsOrPlanned: boolean;
    /**
     * Kullanım verisi (değerlendirme oturum/mesajları, eksik kolon/tablo nedeniyle) tam OKUNAMADI.
     * Emin olunamıyorsa kaynak asla SILINEBILIR önerilmez.
     */
    usageDataIncomplete?: boolean;
}

export interface Recommendation {
    action: CleanupAction;
    reason: string;
}

export function isUsedByEvaluation(f: SourceFacts): boolean {
    return f.aiEvalSessionCount > 0 || f.aiEvalMessageCount > 0 || f.hasHistoricalSnapshots;
}

export function hasNoDependencies(f: SourceFacts): boolean {
    return (
        f.unitCount === 0 &&
        f.chunkCount === 0 &&
        f.mappingCount === 0 &&
        f.evalScenarioSourceCount === 0 &&
        f.evalScenarioRefCount === 0 &&
        !isUsedByEvaluation(f)
    );
}

/**
 * Kural sırası (sabit):
 *  1) sistem yönetimli → KORU
 *  2) herhangi bir değerlendirmede kullanılmış → ARSIVLE (asla fiziksel silme)
 *  3) 'spk-mevzuat' (eski, yalnız üst veri) ve yeni Tebliğ kaynağı var/planlı → SISTEM_KAYNAGIYLA_DEGISTIR
 *  4) birim+parça+eşleştirme+senaryo+kullanım hepsi 0 → SILINEBILIR
 *  5) diğer → ARSIVLE
 */
export function recommendAction(f: SourceFacts): Recommendation {
    if (f.isSystemManaged) {
        return { action: 'KORU', reason: 'Sistem tarafından yönetilen kaynak; elle değiştirilmez.' };
    }
    if (isUsedByEvaluation(f)) {
        return {
            action: 'ARSIVLE',
            reason: 'Geçmiş değerlendirmelerde kullanılmış (snapshot/atıf var); fiziksel silinmez, arşivlenir.',
        };
    }
    if (f.slug === LEGACY_SPK_SLUG && f.replacementSourceExistsOrPlanned) {
        return {
            action: 'SISTEM_KAYNAGIYLA_DEGISTIR',
            reason: 'Eski yalnız-üst-veri SPK kaydı; yeni sistem Tebliğ kaynağı ile değiştirilmeli.',
        };
    }
    if (hasNoDependencies(f) && f.usageDataIncomplete) {
        return {
            action: 'ARSIVLE',
            reason: 'Kullanım verisi tam okunamadı (şema geride olabilir); emin olunamadığı için silme önerilmez, arşivlenir.',
        };
    }
    if (hasNoDependencies(f)) {
        return { action: 'SILINEBILIR', reason: 'Birim, parça, eşleştirme, senaryo ve kullanım yok; bağımlılık bulunmuyor.' };
    }
    return { action: 'ARSIVLE', reason: 'Bağımlılıkları var (birim/parça/eşleştirme/senaryo); fiziksel silinmez, arşivlenir.' };
}

/** --apply --ids için: önerilen eylemi (yalnız ARSIVLE / SILINEBILIR) uygulanabilir mi? */
export function isApplicable(action: CleanupAction): boolean {
    return action === 'ARSIVLE' || action === 'SILINEBILIR';
}

export function refusalReason(action: CleanupAction): string | null {
    switch (action) {
        case 'KORU':
            return 'Sistem yönetimli kaynak; bu araç onu değiştirmez.';
        case 'SISTEM_KAYNAGIYLA_DEGISTIR':
            return 'Bu araç yalnızca ARSIVLE ve SILINEBILIR uygular; eski kayıt, sistem kaynağı içe aktarıldıktan sonra kütüphane arayüzünden değerlendirilmelidir.';
        default:
            return null;
    }
}

/** Arşivlemede WITHDRAWN yapılacak sürüm durumları (APPROVED/SUPERSEDED/WITHDRAWN dokunulmaz). */
export function versionStatusesToWithdraw(): string[] {
    return ['DRAFT', 'IN_REVIEW'];
}

// ─── Kullanım tespiti: FK'siz String[] / Json alanları ──────────────────────

export interface SourceRefIds {
    unitIds: Set<string>;
    versionIds: Set<string>;
    slug: string;
}

const UNIT_KEYS = new Set(['unitId', 'sourceUnitId']);
const VERSION_KEYS = new Set(['versionId', 'sourceVersionId']);
const SLUG_KEYS = new Set(['slug', 'sourceSlug']);

/**
 * AiEvalSession.sourceSnapshot / AiEvalMessage.runInputSnapshot / citedSourceRefs gibi serbest JSON'lar
 * içinde (iç içe olsa da) bu kaynağın birim id'si, sürüm id'si ya da slug'ına referans var mı?
 * Yalnızca bilinen anahtar adları (unitId, sourceUnitId, versionId, sourceVersionId, slug, sourceSlug) değerlendirilir.
 */
export function jsonReferencesSource(json: unknown, ids: SourceRefIds, depth = 0): boolean {
    if (json === null || json === undefined || depth > 8) return false;
    if (Array.isArray(json)) return json.some((j) => jsonReferencesSource(j, ids, depth + 1));
    if (typeof json !== 'object') return false;
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        if (typeof v === 'string') {
            if (UNIT_KEYS.has(k) && ids.unitIds.has(v)) return true;
            if (VERSION_KEYS.has(k) && ids.versionIds.has(v)) return true;
            if (SLUG_KEYS.has(k) && v === ids.slug) return true;
        } else if (v && typeof v === 'object' && jsonReferencesSource(v, ids, depth + 1)) return true;
    }
    return false;
}

export function anyIdIn(list: string[] | null | undefined, ids: Set<string>): boolean {
    return !!list && list.some((x) => ids.has(x));
}
