import { EvalSourceRetrievalService, formatUnitsForPrompt, sourceTypeLabel } from './eval-source-retrieval.service';
import { buildRetrievalQuery } from './eval-retrieval.util';
import { METHODOLOGY_HASH } from '../../library/system-sources/methodology';
import { U_TLS } from './eval-v3.fixtures';

function row(id: string, code: string, title: string, text: string, kind = 'OFFICIAL_GUIDE', over: Record<string, unknown> = {}) {
    return {
        id, unitCode: code, title, originalText: text, locator: { page: 12 }, metadata: null,
        version: { id: 'ver-1', versionLabel: '1.1', approvalStatus: 'APPROVED',
            source: { id: 'src-1', slug: kind === 'REGULATION' ? 'spk-teblig' : 'rehber', title: kind === 'REGULATION' ? 'Tebliğ' : 'Rehber', kind, metadata: null, rightRag: 'ALLOWED', rightsVerifiedAt: new Date() } },
        ...over,
    };
}

function make(opts: { rows?: any[]; embeddingsEnabled?: boolean; embedFails?: boolean; chunks?: any[]; profile?: any; methodology?: any } = {}) {
    const prisma: any = {
        sourceUnit: { findMany: jest.fn(async () => opts.rows ?? []) },
        sourceChunk: { findMany: jest.fn(async () => opts.chunks ?? []) },
        parameter: { findUnique: jest.fn(async () => (opts.profile ? { value: opts.profile } : null)) },
        source: { findUnique: jest.fn(async () => opts.methodology ?? null) },
    };
    const embeddings: any = {
        enabled: opts.embeddingsEnabled ?? false,
        embedQuery: jest.fn(async () => { if (opts.embedFails) throw new Error('bağlantı hatası'); return [1, 0, 0]; }),
    };
    return { svc: new EvalSourceRetrievalService(prisma, embeddings), prisma, embeddings };
}

const q = buildRetrievalQuery({
    controlName: 'Ağ şifreleme', controlText: 'İletişimin şifreli protokollerle yapılması.', evidenceText: 'TLS şifreleme ayarları.',
});
const tlsRow = row('u-tls', 'BIGR-3.2.9.1', 'İletişim kanallarında gizliliğin sağlanması', 'Ağ üzerinden iletilen verinin gizliliği için şifreli iletişim protokolleri kullanılır. Şifreleme belgelenir.');
const logRow = row('u-log', 'BIGR-4.4.1', 'İz kayıtlarının toplanması', 'İz kayıtları merkezi sistemde toplanır ve düzenli incelenir.');

describe('EvalSourceRetrievalService.retrieve', () => {
    it('yalnız APPROVED + RAG izinli + aktif + sistem-yönetimli kaynaklardan arar (where koşulu)', async () => {
        const { svc, prisma } = make({ rows: [tlsRow, logRow] });
        await svc.retrieve(q);
        const where = prisma.sourceUnit.findMany.mock.calls[0][0].where;
        expect(where.version.approvalStatus).toBe('APPROVED');
        expect(where.version.supersededById).toBeNull();
        expect(where.version.source).toMatchObject({ isActive: true, isSystemManaged: true, isTestFixture: false, rightRag: 'ALLOWED' });
        expect(where.version.source.rightsVerifiedAt).toEqual({ not: null });
        expect(where.version.source.kind.in).not.toContain('INTERNAL_METHODOLOGY'); // metodoloji ayrı ve her zaman
    });

    it('embedding kapalıyken sözcük araması ile devam eder ve bunu retrievalNote\'ta belirtir', async () => {
        const { svc } = make({ rows: [tlsRow, logRow], embeddingsEnabled: false });
        const r = await svc.retrieve(q);
        expect(r.note.method).toBe('LEXICAL_ONLY');
        expect(r.note.semanticUnavailableReason).toMatch(/kapalı/);
        expect(r.units[0].unitId).toBe('u-tls');
        expect(r.units[0].method).toBe('LEXICAL_ONLY');
        expect(r.units[0].score).toBeGreaterThan(0);
        expect(r.units[0].rank).toBe(1);
        expect(r.note.sentUnitIds).toEqual(r.units.map((u) => u.unitId));
        expect(r.note.candidates[0]).toMatchObject({ unitId: 'u-tls', sent: true });
    });

    it('embedding hatası araması bozmaz: sözcük moduna düşer', async () => {
        const { svc } = make({ rows: [tlsRow, logRow], embeddingsEnabled: true, embedFails: true, chunks: [{ unitId: 'u-tls', embedding: [1, 0, 0] }] });
        const r = await svc.retrieve(q);
        expect(r.note.method).toBe('LEXICAL_ONLY');
        expect(r.note.semanticUnavailableReason).toMatch(/başarısız/);
        expect(r.units.length).toBeGreaterThan(0);
    });

    it('embedding varsa HYBRID çalışır ve anlamsal skor kaydedilir', async () => {
        const { svc } = make({ rows: [tlsRow, logRow], embeddingsEnabled: true, chunks: [{ unitId: 'u-tls', embedding: [1, 0, 0] }, { unitId: 'u-log', embedding: [0, 1, 0] }] });
        const r = await svc.retrieve(q);
        expect(r.note.method).toBe('HYBRID');
        expect(r.note.semanticUsed).toBe(true);
        expect(r.note.candidates.find((c) => c.unitId === 'u-tls')?.semantic).toBeCloseTo(1, 3);
    });

    it('havuz boşsa (kaynaklar içe aktarılmamış) boş döner ve nedeni yazar — madde uydurtmaz', async () => {
        const { svc } = make({ rows: [] });
        const r = await svc.retrieve(q);
        expect(r.units).toEqual([]);
        expect(r.note.notes.join(' ')).toMatch(/içe aktarılmamış/);
    });

    it('ilgisiz sorguda eşik altı → hiçbir birim gönderilmez', async () => {
        const { svc } = make({ rows: [tlsRow, logRow] });
        const r = await svc.retrieve(buildRetrievalQuery({ controlName: 'Kantin', controlText: 'Temizlik çizelgesi', evidenceText: '' }));
        expect(r.units).toEqual([]);
        expect(r.note.notes.join(' ')).toMatch(/Eşiği geçen/);
    });

    it('kurum kapsam profili Tebliğ birimini IN_SCOPE / OUT_OF_SCOPE yapar; profil yoksa UNVERIFIED', async () => {
        const regRow = row('u-reg', 'md.9', 'Bilgi güvenliği politikası', 'Üst yönetim bilgi güvenliği politikasını onaylar ve iletişim şifreleme dahil kontrolleri gözetir.', 'REGULATION');
        const qq = buildRetrievalQuery({ controlName: 'Bilgi güvenliği politikası', controlText: 'Politika onayı ve şifreleme.', evidenceText: '' });
        expect((await make({ rows: [regRow] }).svc.retrieve(qq)).units[0].scopeStatus).toBe('UNVERIFIED');
        expect((await make({ rows: [regRow], profile: { 'spk-teblig': 'IN_SCOPE' } }).svc.retrieve(qq)).units[0].scopeStatus).toBe('IN_SCOPE');
        expect((await make({ rows: [regRow], profile: { 'spk-teblig': 'OUT_OF_SCOPE' } }).svc.retrieve(qq)).units[0].scopeStatus).toBe('OUT_OF_SCOPE');
    });

    it('uzun birim kısaltılır ve açıkça işaretlenir', async () => {
        const long = row('u-long', 'BIGR-1.1.1', 'Şifreleme politikası', 'iletişim şifreleme protokolleri '.repeat(200));
        const r = await make({ rows: [long] }).svc.retrieve(q);
        expect(r.units[0].truncated).toBe(true);
        expect(r.units[0].text.length).toBeLessThanOrEqual(3000);
        expect(formatUnitsForPrompt(r.units)).toContain('kısaltıldı');
    });
});

describe('loadUserSelected — canlı yetki/onay', () => {
    it('onayı geri alınmış birimle değerlendirme başlatılamaz', async () => {
        const { svc } = make({ rows: [row('u1', 'BIGR-1', 't', 'x', 'OFFICIAL_GUIDE', { version: { id: 'v', versionLabel: '1', approvalStatus: 'WITHDRAWN', source: { id: 's', slug: 's', title: 'S', kind: 'OFFICIAL_GUIDE', metadata: null, rightRag: 'ALLOWED', rightsVerifiedAt: new Date() } } })] });
        await expect(svc.loadUserSelected(['u1'])).rejects.toThrow(/artık onaylı değil/);
    });
    it('RAG hakkı doğrulanmamış birim reddedilir', async () => {
        const { svc } = make({ rows: [row('u1', 'BIGR-1', 't', 'x', 'OFFICIAL_GUIDE', { version: { id: 'v', versionLabel: '1', approvalStatus: 'APPROVED', source: { id: 's', slug: 's', title: 'S', kind: 'OFFICIAL_GUIDE', metadata: null, rightRag: 'UNKNOWN', rightsVerifiedAt: null } } })] });
        await expect(svc.loadUserSelected(['u1'])).rejects.toThrow(/RAG kullanım hakkı/);
    });
    it('boş seçimde DB\'ye gidilmez', async () => {
        const { svc, prisma } = make();
        expect(await svc.loadUserSelected([])).toEqual([]);
        expect(prisma.sourceUnit.findMany).not.toHaveBeenCalled();
    });
});

describe('loadMethodology', () => {
    it('DB\'de onaylı sürüm yoksa yerleşik metin kullanılır', async () => {
        const m = await make().svc.loadMethodology();
        expect(m.origin).toBe('BUILTIN');
        expect(m.hash).toBe(METHODOLOGY_HASH.slice(0, 16));
    });
    it('DB\'deki onaylı sürüm metni öncelikli (sürüm değişince hash değişir)', async () => {
        const m = await make({ methodology: { isActive: true, versions: [{ versionLabel: '2.0', fullText: 'Yeni metodoloji' }] } }).svc.loadMethodology();
        expect(m.origin).toBe('DB');
        expect(m.version).toBe('2.0');
        expect(m.hash).not.toBe(METHODOLOGY_HASH.slice(0, 16));
    });
    it('pasif (arşivlenmiş) kaynak kullanılmaz', async () => {
        const m = await make({ methodology: { isActive: false, versions: [{ versionLabel: '2.0', fullText: 'x' }] } }).svc.loadMethodology();
        expect(m.origin).toBe('BUILTIN');
    });
});

describe('prompt biçimi', () => {
    it('rehber birimi "kanuni zorunluluk değildir" etiketiyle, Tebliğ kapsam durumuyla işaretlenir', () => {
        expect(sourceTypeLabel({ sourceKind: 'OFFICIAL_GUIDE', scopeStatus: 'IN_SCOPE' })).toMatch(/kanuni zorunluluk değildir/);
        expect(sourceTypeLabel({ sourceKind: 'REGULATION', scopeStatus: 'UNVERIFIED' })).toMatch(/KAPSAM DOĞRULANMADI/);
        expect(sourceTypeLabel({ sourceKind: 'REGULATION', scopeStatus: 'IN_SCOPE' })).toBe('BAĞLAYICI MEVZUAT');
        const t = formatUnitsForPrompt([U_TLS]);
        expect(t).toContain('[U:u-tls]');
        expect(t).toContain('sayfa 87');
    });
});

describe('resolveLegacyRegulationSelections — eski mevzuat seçimi köprüsü', () => {
    const snapshot = [
        { madde: 'CBDDO-BIGR md.3.2.9.1', regulasyon: 'BİG Rehberi', baslik: 'İletişim', metin: 'eski tablo metni' },
        { madde: 'SPK-VII-128.10 md.99', regulasyon: 'Tebliğ', baslik: 'Olmayan', metin: 'kütüphanede yok' },
    ];
    it('karşılığı olan madde SourceUnit olarak eklenir (atıf yapılabilir); olmayan yalnız bağlam olur', async () => {
        const { svc, prisma } = make({ rows: [tlsRow] });
        const r = await svc.resolveLegacyRegulationSelections(snapshot);
        expect(prisma.sourceUnit.findMany.mock.calls[0][0].where.unitCode.in).toEqual(expect.arrayContaining(['BIGR-3.2.9.1', 'md.99']));
        expect(r.units.map((u) => u.unitId)).toEqual(['u-tls']);
        expect(r.units[0].origin).toBe('USER_SELECTED');
        expect(r.contextOnly).toHaveLength(1);
        expect(r.contextOnly[0].madde).toBe('SPK-VII-128.10 md.99');
    });
    it('seçim yoksa DB\'ye gidilmez', async () => {
        const { svc, prisma } = make();
        expect(await svc.resolveLegacyRegulationSelections(null)).toEqual({ units: [], contextOnly: [] });
        expect(prisma.sourceUnit.findMany).not.toHaveBeenCalled();
    });
});
