import {
    GRC_DB_APPROVAL_FLAG,
    SCOPE_PARAM_CATEGORY,
    SCOPE_PARAM_DESCRIPTION,
    SCOPE_PARAM_KEY,
    checkApplyAllowed,
    dbNameFromUrl,
    diffFields,
    fingerprintUnit,
    mergeSourceMetadata,
    planScopeParameter,
    planUpsert,
    stableMetadata,
    stableStringify,
    versionHashFromUnits,
} from './import-plan';

const inc = (stableKey: string, contentHash: string) => ({ stableKey, contentHash, title: stableKey });
const ex = (id: string, stableKey: string, contentHash: string | null) => ({ id, stableKey, contentHash });

describe('planUpsert — idempotent birim planı', () => {
    it('hepsi yeni → oluşturulur', () => {
        const p = planUpsert([], [inc('a', '1'), inc('b', '2')]);
        expect(p.toCreate.map((x) => x.stableKey)).toEqual(['a', 'b']);
        expect(p.toUpdate).toEqual([]);
        expect(p.unchanged).toEqual([]);
        expect(p.removed).toEqual([]);
    });

    it('aynı hash → değişmedi (ikinci çalıştırma 0 oluşturma / 0 güncelleme)', () => {
        const p = planUpsert([ex('1', 'a', 'h1'), ex('2', 'b', 'h2')], [inc('a', 'h1'), inc('b', 'h2')]);
        expect(p.toCreate).toHaveLength(0);
        expect(p.toUpdate).toHaveLength(0);
        expect(p.unchanged.map((x) => x.id)).toEqual(['1', '2']);
    });

    it('farklı hash → güncellenir; yeni anahtar → oluşturulur; kaynaktan kalkan → removed (silinmez)', () => {
        const p = planUpsert([ex('1', 'a', 'h1'), ex('2', 'b', 'h2'), ex('3', 'gone', 'h3')], [inc('a', 'h1'), inc('b', 'CHANGED'), inc('c', 'h4')]);
        expect(p.unchanged.map((x) => x.stableKey)).toEqual(['a']);
        expect(p.toUpdate.map((x) => [x.existing.id, x.incoming.contentHash])).toEqual([['2', 'CHANGED']]);
        expect(p.toCreate.map((x) => x.stableKey)).toEqual(['c']);
        expect(p.removed.map((x) => x.stableKey)).toEqual(['gone']);
    });

    it('mevcut kaydın hash\'i boşsa (elle eklenmiş) güncellenir', () => {
        const p = planUpsert([ex('1', 'a', null)], [inc('a', 'h1')]);
        expect(p.toUpdate).toHaveLength(1);
        expect(p.unchanged).toHaveLength(0);
    });

    it('yinelenen stableKey (yeni ya da mevcut tarafta) hata verir — sessiz ezme yok', () => {
        expect(() => planUpsert([], [inc('a', '1'), inc('a', '2')])).toThrow(/yinelenen stableKey/);
        expect(() => planUpsert([ex('1', 'a', 'x'), ex('2', 'a', 'y')], [])).toThrow(/yinelenen stableKey/);
    });
});

describe('içerik özetleri', () => {
    it('stableStringify anahtar sırasından bağımsız ve Date/undefined güvenli', () => {
        expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
        expect(stableStringify({ d: new Date('2026-03-01T00:00:00Z') })).toBe('{"d":"2026-03-01T00:00:00.000Z"}');
        expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    });

    it('fingerprintUnit metin/yapı/konum değişince değişir, kararlıdır', () => {
        const base = { stableKey: 'k', unitCode: 'k', unitType: 'control', title: 'T', originalText: 'X', locator: { page: 1 }, metadata: { a: 1, b: 2 } };
        expect(fingerprintUnit(base)).toBe(fingerprintUnit({ ...base, metadata: { b: 2, a: 1 } }));
        expect(fingerprintUnit(base)).not.toBe(fingerprintUnit({ ...base, originalText: 'Y' }));
        expect(fingerprintUnit(base)).not.toBe(fingerprintUnit({ ...base, locator: { page: 2 } }));
        expect(fingerprintUnit(base)).not.toBe(fingerprintUnit({ ...base, parentKey: 'p' }));
        expect(fingerprintUnit(base)).toHaveLength(32);
    });

    it('versionHashFromUnits sıraya duyarlıdır', () => {
        expect(versionHashFromUnits(['a', 'b'])).not.toBe(versionHashFromUnits(['b', 'a']));
        expect(versionHashFromUnits(['a', 'b'])).toBe(versionHashFromUnits(['a', 'b']));
    });

    it('diffFields: importedAt gibi uçucu üst veri karşılaştırılmaz; gerçek fark bildirilir', () => {
        const a = { title: 'T', tags: ['x'], metadata: { importedAt: '2026-01-01', k: 1 }, publishDate: new Date('2026-03-01T00:00:00Z') };
        const b = { title: 'T', tags: ['x'], metadata: { importedAt: '2027-01-01', k: 1 }, publishDate: new Date('2026-03-01T00:00:00Z') };
        expect(diffFields(a, b, ['title', 'tags', 'metadata', 'publishDate'])).toEqual([]);
        expect(diffFields(a, { ...b, title: 'U', metadata: { k: 2 } }, ['title', 'tags', 'metadata'])).toEqual(['title', 'metadata']);
        expect(stableMetadata({ importedAt: 'x', a: 1 })).toEqual({ a: 1 });
    });
});

describe('mergeSourceMetadata — insan doğrulamasını ezmez', () => {
    const incoming = { tebligNo: 'VII-128.10', scope: { status: 'UNVERIFIED', verbatimArticle2: 'MADDE 2- ...', note: 'n' } };
    it('kapsam metni değişmediyse mevcut (doğrulanmış) kapsam korunur', () => {
        const existing = { scope: { status: 'IN_SCOPE_VERIFIED', verbatimArticle2: 'MADDE 2- ...', note: 'n', verifiedBy: 'u1' }, eski: true };
        const m = mergeSourceMetadata(existing, incoming);
        expect(m.scope).toEqual(existing.scope);
        expect(m.tebligNo).toBe('VII-128.10');
        expect(m).not.toHaveProperty('eski');
    });
    it('kapsam metni değiştiyse UNVERIFIED\'a döner', () => {
        const m = mergeSourceMetadata({ scope: { status: 'VERIFIED', verbatimArticle2: 'ESKİ' } }, incoming);
        expect((m.scope as { status: string }).status).toBe('UNVERIFIED');
    });
    it('mevcut yoksa gelen olduğu gibi', () => {
        expect(mergeSourceMetadata(null, incoming)).toEqual(incoming);
    });
});

describe('grc_db koruması', () => {
    const grc = 'postgresql://postgres:postgres@localhost:5432/grc_db?schema=public';
    const scratch = 'postgresql://postgres:postgres@localhost:5432/grc_sys_src_verify?schema=public';

    it('--apply + grc_db → onay bayrağı olmadan REDDEDİLİR', () => {
        const r = checkApplyAllowed({ databaseUrl: grc, apply: true, approvalFlagGiven: false });
        expect(r.ok).toBe(false);
        expect(r.dbName).toBe('grc_db');
        expect(r.reason).toContain(GRC_DB_APPROVAL_FLAG);
    });
    it('açık onay bayrağıyla izin verilir (yine de scriptler bunu geçmez)', () => {
        expect(checkApplyAllowed({ databaseUrl: grc, apply: true, approvalFlagGiven: true }).ok).toBe(true);
    });
    it('başka veritabanı ve dry-run serbest', () => {
        expect(checkApplyAllowed({ databaseUrl: scratch, apply: true, approvalFlagGiven: false }).ok).toBe(true);
        expect(checkApplyAllowed({ databaseUrl: grc, apply: false, approvalFlagGiven: false }).ok).toBe(true);
    });
    it('veritabanı adı çözümlenemezse / URL yoksa --apply reddedilir (belirsizlikte yazma yok)', () => {
        expect(checkApplyAllowed({ databaseUrl: undefined, apply: true, approvalFlagGiven: true }).ok).toBe(false);
        expect(checkApplyAllowed({ databaseUrl: 'bozuk', apply: true, approvalFlagGiven: true }).ok).toBe(false);
        expect(checkApplyAllowed({ databaseUrl: 'postgresql://h:5432/', apply: true, approvalFlagGiven: true }).ok).toBe(false);
    });
    it('dbNameFromUrl sorgu dizgisini ve kimlik bilgisini yok sayar; "grc_db_kopya" korunan ad değildir', () => {
        expect(dbNameFromUrl(grc)).toBe('grc_db');
        expect(dbNameFromUrl('postgresql://a:b@h/grc_db_kopya')).toBe('grc_db_kopya');
        expect(checkApplyAllowed({ databaseUrl: 'postgresql://a:b@h/grc_db_kopya', apply: true, approvalFlagGiven: false }).ok).toBe(true);
    });
});

describe('planScopeParameter — evaluation_scope_profile', () => {
    const slug = 'spk-bilgi-sistemleri-yonetimi-tebligi-vii-128-10';
    it('satır yoksa oluşturulur: AI_EVAL, anahtar, UNVERIFIED başlangıç değeri, açıklama', () => {
        const p = planScopeParameter(null, slug);
        expect(p.action).toBe('create');
        expect(p.data).toEqual({
            category: SCOPE_PARAM_CATEGORY,
            key: SCOPE_PARAM_KEY,
            value: { [slug]: 'UNVERIFIED' },
            description: SCOPE_PARAM_DESCRIPTION,
        });
        expect(SCOPE_PARAM_KEY).toBe('evaluation_scope_profile');
        expect(SCOPE_PARAM_CATEGORY).toBe('AI_EVAL');
        expect(SCOPE_PARAM_DESCRIPTION).toBe('Kurum kapsam profili: kaynak slug → IN_SCOPE | OUT_OF_SCOPE | UNVERIFIED (Kontrol & Kanıt Değerlendirme, mevzuat bağlayıcılığı)');
    });
    it('satır VARSA olduğu gibi bırakılır (veri döndürülmez, ezme/birleştirme yok)', () => {
        const p = planScopeParameter({ id: 'p1' }, slug);
        expect(p).toEqual({ action: 'keep' });
        expect(p.data).toBeUndefined();
    });
});
