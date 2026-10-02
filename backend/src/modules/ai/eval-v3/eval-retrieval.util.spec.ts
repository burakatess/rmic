import { buildRetrievalQuery, bm25Score, fuseAndRank, tokenize, stem, extractCodeMentions, CandidateDoc } from './eval-retrieval.util';

// SENTETİK aday birimler (gerçek rehber metni değildir).
const docs: CandidateDoc[] = [
    { unitId: 'u-tls', unitCode: 'BIGR-3.2.9.1', title: 'İletişim kanallarında gizliliğin sağlanması',
      text: 'Ağ üzerinden iletilen verinin gizliliği için şifreli iletişim protokolleri kullanılır. Şifreleme yapılandırması belgelenir.' },
    { unitId: 'u-log', unitCode: 'BIGR-4.4.1', title: 'İz kayıtlarının merkezi olarak toplanması',
      text: 'Sistem iz kayıtları merkezi kayıt yönetim sisteminde toplanır ve düzenli incelenir.' },
    { unitId: 'u-patch', unitCode: 'BIGR-5.1.1', title: 'Yama yönetimi',
      text: 'Güvenlik güncellemeleri belirlenen sürelerde uygulanır, yaşam döngüsü sonu yazılımlar izlenir.' },
    { unitId: 'u-fiz', unitCode: 'BIGR-2.1.1', title: 'Fiziksel güvenlik',
      text: 'Sunucu odalarına giriş kontrol altındadır, ziyaretçi kayıtları tutulur.' },
];

describe('tokenize/stem', () => {
    it('Türkçe küçük harf, stopword ve kısa token eler', () => {
        expect(tokenize('İletişim ve ağ için ŞİFRELEME')).toEqual(['iletişim', 'şifreleme']);
    });
    it('eklemeli çekimleri ortak köke indirir', () => {
        expect(stem('şifreleme')).toBe(stem('şifrelenmiş'));
        expect(stem('iletişim')).toBe(stem('iletişimin'));
    });
    it('madde/tedbir numarası anmalarını çıkarır', () => {
        expect(extractCodeMentions('Bkz. 3.2.9.1 ve md. 12 ile 10.0.0.1')).toEqual(expect.arrayContaining(['3.2.9.1', 'md.12']));
    });
});

describe('hybrid retrieval — sözcük + anlamsal + eşik', () => {
    it('şifreleme kanıtı için doğru tedbiri (3.2.9.1) en üstte bulur', () => {
        const q = buildRetrievalQuery({
            controlName: 'Ağ trafiği şifreleme kontrolü', controlText: 'Kurum ağ iletişiminin şifreli protokollerle yapıldığını doğrular.',
            evidenceText: 'Sunucu yapılandırma ekranında TLS şifreleme ayarları görülmektedir.',
        });
        const lex = bm25Score(q, docs);
        const ranked = fuseAndRank(q, docs, lex, null, { minScore: 0.3, topK: 5 });
        expect(ranked[0].unitId).toBe('u-tls');
        expect(ranked.find((r) => r.unitId === 'u-fiz')).toBeUndefined();
    });

    it('log yönetimi kanıtı log tedbirini bulur, şifreleme tedbirini getirmez', () => {
        const q = buildRetrievalQuery({
            controlName: 'İz kaydı yönetimi', controlText: 'Sistem iz kayıtlarının merkezi sistemde toplanması ve düzenli incelenmesi.',
            evidenceText: 'SIEM üzerinde log toplama ayarları ve haftalık inceleme tutanakları.',
        });
        const ranked = fuseAndRank(q, docs, bm25Score(q, docs), null, { minScore: 0.3, topK: 5 });
        expect(ranked[0].unitId).toBe('u-log');
        expect(ranked.some((r) => r.unitId === 'u-tls')).toBe(false);
    });

    it('ilgisiz kanıt için eşik altında kalır → hiçbir birim dönmez (madde uydurtmaz)', () => {
        const q = buildRetrievalQuery({ controlName: 'Kantin hijyeni', controlText: 'Yemekhane temizlik çizelgesi.', evidenceText: 'Temizlik formu imzalı.' });
        const ranked = fuseAndRank(q, docs, bm25Score(q, docs), null, { minScore: 0.3, topK: 5 });
        expect(ranked).toHaveLength(0);
    });

    it('açık tedbir numarası anması güçlü sinyaldir', () => {
        const q = buildRetrievalQuery({ controlName: 'Kontrol', controlText: 'Rehberin 5.1.1 tedbiri kapsamında yama denetimi.', evidenceText: '' });
        const ranked = fuseAndRank(q, docs, bm25Score(q, docs), null, { minScore: 0.3, topK: 3 });
        expect(ranked[0].unitId).toBe('u-patch');
        expect(ranked[0].codeMention).toBe(true);
    });

    it('anlamsal skor sözcük eşleşmesi olmayan birimi de getirebilir (HYBRID)', () => {
        const q = buildRetrievalQuery({ controlName: 'Kontrol', controlText: 'Bağlantı güvenliği.', evidenceText: '' });
        const sem = new Map<string, number>([['u-tls', 0.82], ['u-log', 0.3], ['u-patch', 0.25], ['u-fiz', 0.2]]);
        const ranked = fuseAndRank(q, docs, bm25Score(q, docs), sem, { minScore: 0.3, topK: 3 });
        expect(ranked[0].unitId).toBe('u-tls');
        expect(ranked[0].method).toBe('SEMANTIC_ONLY');
    });

    it('topK sınırı uygulanır ve sıra deterministiktir', () => {
        const q = buildRetrievalQuery({ controlName: 'Güvenlik', controlText: 'Şifreleme iz kayıtları güvenlik güncellemeleri sunucu erişim.', evidenceText: '' });
        const a = fuseAndRank(q, docs, bm25Score(q, docs), null, { minScore: 0.05, topK: 2 });
        const b = fuseAndRank(q, docs, bm25Score(q, docs), null, { minScore: 0.05, topK: 2 });
        expect(a).toHaveLength(2);
        expect(a.map((x) => x.unitId)).toEqual(b.map((x) => x.unitId));
        expect(a.map((x) => x.rank)).toEqual([1, 2]);
    });
});
