import { computeEvalInputHash, EvalInputHashParts, textChecksum } from './eval-input-hash';

const base: EvalInputHashParts = {
    controlVersion: 3, controlTextHash: 'c1',
    evidence: [{ id: 'a1', checksum: 'x1' }, { id: 'a2', checksum: 'x2' }], evidenceTextHash: null,
    additionalNote: 'ilk açıklama', followUpQuestion: null,
    sourceUnits: [{ unitId: 'u1', versionId: 'v1', textHash: 't1' }],
    regulationArticleIds: [], knowledgeDocIds: [], promptVersion: 'p1', modelVersion: 'm1', methodologyHash: 'h1',
};

describe('computeEvalInputHash', () => {
    const h0 = computeEvalInputHash(base);
    it('aynı girdi → aynı hash (sıradan bağımsız)', () => {
        expect(computeEvalInputHash({ ...base, evidence: [...base.evidence].reverse() })).toBe(h0);
    });
    it.each([
        ['kullanıcı açıklaması', { additionalNote: 'değişti' }],
        ['ek soru', { followUpQuestion: 'Q2 kapsamı neydi?' }],
        ['kontrol sürümü', { controlVersion: 4 }],
        ['kontrol metni', { controlTextHash: 'c2' }],
        ['yeni kanıt', { evidence: [...base.evidence, { id: 'a3', checksum: 'x3' }] }],
        ['kanıt içeriği (checksum)', { evidence: [{ id: 'a1', checksum: 'DEĞİŞTİ' }, base.evidence[1]] }],
        ['kaynak birimi seti', { sourceUnits: [...base.sourceUnits, { unitId: 'u2', versionId: 'v1', textHash: 't2' }] }],
        ['kaynak sürümü', { sourceUnits: [{ unitId: 'u1', versionId: 'v2', textHash: 't1' }] }],
        ['kaynak metni', { sourceUnits: [{ unitId: 'u1', versionId: 'v1', textHash: 'YENI' }] }],
        ['prompt sürümü', { promptVersion: 'p2' }],
        ['model sürümü', { modelVersion: 'm2' }],
        ['metodoloji', { methodologyHash: 'h2' }],
    ] as [string, Partial<EvalInputHashParts>][])('%s değişince hash değişir', (_n, patch) => {
        expect(computeEvalInputHash({ ...base, ...patch })).not.toBe(h0);
    });
    it('textChecksum boş/null için kararlıdır', () => {
        expect(textChecksum(null)).toBe(textChecksum(''));
        expect(textChecksum('a')).not.toBe(textChecksum('b'));
    });
});
