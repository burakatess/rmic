import {
    LEGACY_SPK_SLUG,
    anyIdIn,
    hasNoDependencies,
    isApplicable,
    isUsedByEvaluation,
    jsonReferencesSource,
    recommendAction,
    refusalReason,
    versionStatusesToWithdraw,
    type SourceFacts,
} from './cleanup-rules';

const facts = (o: Partial<SourceFacts> = {}): SourceFacts => ({
    slug: 'x',
    isSystemManaged: false,
    unitCount: 0,
    chunkCount: 0,
    embeddedChunkCount: 0,
    mappingCount: 0,
    evalScenarioSourceCount: 0,
    evalScenarioRefCount: 0,
    aiEvalSessionCount: 0,
    aiEvalMessageCount: 0,
    hasHistoricalSnapshots: false,
    replacementSourceExistsOrPlanned: true,
    ...o,
});

describe('recommendAction — kural sırası', () => {
    it('sistem yönetimli → KORU (kullanılmış olsa bile)', () => {
        expect(recommendAction(facts({ isSystemManaged: true })).action).toBe('KORU');
        expect(recommendAction(facts({ isSystemManaged: true, aiEvalSessionCount: 4, unitCount: 10 })).action).toBe('KORU');
    });

    it('herhangi bir değerlendirmede kullanılmış → ARSIVLE (asla fiziksel silme)', () => {
        expect(recommendAction(facts({ aiEvalSessionCount: 1 })).action).toBe('ARSIVLE');
        expect(recommendAction(facts({ aiEvalMessageCount: 1 })).action).toBe('ARSIVLE');
        expect(recommendAction(facts({ hasHistoricalSnapshots: true })).action).toBe('ARSIVLE');
    });

    it("eski 'spk-mevzuat' + yeni Tebliğ var/planlı → SISTEM_KAYNAGIYLA_DEGISTIR", () => {
        expect(recommendAction(facts({ slug: LEGACY_SPK_SLUG })).action).toBe('SISTEM_KAYNAGIYLA_DEGISTIR');
        expect(recommendAction(facts({ slug: LEGACY_SPK_SLUG, unitCount: 0, replacementSourceExistsOrPlanned: true })).action).toBe('SISTEM_KAYNAGIYLA_DEGISTIR');
    });

    it("'spk-mevzuat' geçmişte kullanılmışsa ARSIVLE (kural sırası: kullanım önce)", () => {
        expect(recommendAction(facts({ slug: LEGACY_SPK_SLUG, aiEvalSessionCount: 2 })).action).toBe('ARSIVLE');
    });

    it("'spk-mevzuat' ama değiştirecek kaynak yok → genel kurallar (bağımlılık yoksa SILINEBILIR)", () => {
        expect(recommendAction(facts({ slug: LEGACY_SPK_SLUG, replacementSourceExistsOrPlanned: false })).action).toBe('SILINEBILIR');
        expect(recommendAction(facts({ slug: LEGACY_SPK_SLUG, replacementSourceExistsOrPlanned: false, unitCount: 3 })).action).toBe('ARSIVLE');
    });

    it('birim+parça+eşleştirme+senaryo+kullanım hepsi 0 → SILINEBILIR', () => {
        expect(recommendAction(facts()).action).toBe('SILINEBILIR');
        expect(hasNoDependencies(facts())).toBe(true);
    });

    it.each([
        ['birim', { unitCount: 1 }],
        ['parça', { chunkCount: 1 }],
        ['embedding\'li parça', { chunkCount: 1, embeddedChunkCount: 1 }],
        ['eşleştirme', { mappingCount: 1 }],
        ['senaryo kaynağı', { evalScenarioSourceCount: 1 }],
        ['senaryo referansı', { evalScenarioRefCount: 1 }],
    ] as [string, Partial<SourceFacts>][])('tek başına %s bağımlılığı → ARSIVLE (SILINEBILIR değil)', (_n, o) => {
        expect(recommendAction(facts(o)).action).toBe('ARSIVLE');
    });

    it('kullanım verisi tam okunamadıysa (şema geride) asla SILINEBILIR önerilmez', () => {
        const r = recommendAction(facts({ usageDataIncomplete: true }));
        expect(r.action).toBe('ARSIVLE');
        expect(r.reason).toMatch(/okunamadı/);
    });

    it('her öneri bir gerekçe içerir', () => {
        for (const o of [{}, { isSystemManaged: true }, { unitCount: 2 }, { aiEvalSessionCount: 1 }, { slug: LEGACY_SPK_SLUG }]) {
            expect(recommendAction(facts(o)).reason.length).toBeGreaterThan(10);
        }
    });
});

describe('geçmişte kullanılmış kaynak ASLA SILINEBILIR olamaz (tüm kombinasyonlar)', () => {
    it('kullanım göstergelerinin herhangi biri > 0 iken hiçbir gerçekçi kombinasyon SILINEBILIR vermez', () => {
        const nums = [0, 1, 5];
        const bools = [false, true];
        let checked = 0;
        for (const aiEvalSessionCount of nums)
            for (const aiEvalMessageCount of nums)
                for (const hasHistoricalSnapshots of bools)
                    for (const unitCount of nums)
                        for (const chunkCount of nums)
                            for (const mappingCount of nums)
                                for (const slug of ['x', LEGACY_SPK_SLUG])
                                    for (const replacementSourceExistsOrPlanned of bools)
                                        for (const usageDataIncomplete of bools) {
                                            const f = facts({
                                                slug, aiEvalSessionCount, aiEvalMessageCount, hasHistoricalSnapshots,
                                                unitCount, chunkCount, mappingCount, replacementSourceExistsOrPlanned, usageDataIncomplete,
                                            });
                                            const rec = recommendAction(f);
                                            if (isUsedByEvaluation(f)) {
                                                expect(rec.action).not.toBe('SILINEBILIR');
                                                expect(rec.action).toBe('ARSIVLE');
                                                checked++;
                                            }
                                            // SILINEBILIR yalnız bağımlılık ve kullanım yokken
                                            if (rec.action === 'SILINEBILIR') expect(hasNoDependencies(f) && !usageDataIncomplete).toBe(true);
                                        }
        expect(checked).toBeGreaterThan(100);
    });
});

describe('uygulanabilirlik ve ret gerekçeleri', () => {
    it('yalnız ARSIVLE ve SILINEBILIR uygulanır', () => {
        expect(isApplicable('ARSIVLE')).toBe(true);
        expect(isApplicable('SILINEBILIR')).toBe(true);
        expect(isApplicable('KORU')).toBe(false);
        expect(isApplicable('SISTEM_KAYNAGIYLA_DEGISTIR')).toBe(false);
        expect(refusalReason('KORU')).toMatch(/Sistem yönetimli/);
        expect(refusalReason('SISTEM_KAYNAGIYLA_DEGISTIR')).toMatch(/ARSIVLE ve SILINEBILIR/);
        expect(refusalReason('ARSIVLE')).toBeNull();
    });

    it('arşivde yalnız DRAFT/IN_REVIEW sürümler WITHDRAWN olur; APPROVED/SUPERSEDED dokunulmaz', () => {
        expect(versionStatusesToWithdraw()).toEqual(['DRAFT', 'IN_REVIEW']);
    });
});

describe('FK\'siz referans tespiti (jsonReferencesSource / anyIdIn)', () => {
    const ids = { unitIds: new Set(['u1', 'u2']), versionIds: new Set(['v1']), slug: 'kaynak-a' };

    it('sourceSnapshot: unitId / versionId / slug eşleşmesi (iç içe dahil)', () => {
        expect(jsonReferencesSource([{ unitId: 'u1', slug: 'baska' }], ids)).toBe(true);
        expect(jsonReferencesSource([{ unitId: 'zzz', versionId: 'v1' }], ids)).toBe(true);
        expect(jsonReferencesSource([{ unitId: 'zzz', slug: 'kaynak-a' }], ids)).toBe(true);
        expect(jsonReferencesSource({ sourceUnits: [{ unitId: 'zzz', sourceSlug: 'kaynak-a' }] }, ids)).toBe(true);
        expect(jsonReferencesSource([{ sourceUnitId: 'u2', sourceVersionId: 'v9' }], ids)).toBe(true);
    });

    it('ilgisiz / boş / metin içinde geçen değerler eşleşmez', () => {
        expect(jsonReferencesSource(null, ids)).toBe(false);
        expect(jsonReferencesSource([], ids)).toBe(false);
        expect(jsonReferencesSource([{ unitId: 'zzz', slug: 'baska', metin: 'u1 kaynak-a v1' }], ids)).toBe(false);
        expect(jsonReferencesSource('u1', ids)).toBe(false);
    });

    it('anyIdIn', () => {
        expect(anyIdIn(['a', 'u2'], ids.unitIds)).toBe(true);
        expect(anyIdIn([], ids.unitIds)).toBe(false);
        expect(anyIdIn(null, ids.unitIds)).toBe(false);
    });
});
