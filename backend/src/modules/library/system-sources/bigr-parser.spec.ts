import { parseBigrPages, verifyBigrUnits, parseBigrToc, type BigrPage, type BigrUnit } from './bigr-parser';
import { P5, P6, P7, P63, P64, P110, P111, P172, P173, P180, P181, P193 } from './bigr-fixtures';

// Fixture'lar gerçek PDF sayfalarıdır (bigr-fixtures.ts). Sayfa numarası = PDF sayfa dizini.
const pg = (page: number, text: string): BigrPage => ({ page, text });
const byCode = (units: BigrUnit[], no: string) => units.find((u) => u.unitCode === `BIGR-${no}`);

describe('bigr-parser — tedbir bazlı ayrıştırma (gerçek düzen)', () => {
    describe('3.1.8 (sayfa 63 tedbirler, sayfa 64 denetim maddeleri)', () => {
        const pages = [pg(63, P63), pg(64, P64)];
        const r = parseBigrPages(pages);

        it('8 tedbir üretir; numara/başlık/seviye/sayfa doğrudur', () => {
            expect(r.units.map((u) => u.unitCode)).toEqual(
                ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `BIGR-3.1.8.${n}`),
            );
            const u1 = byCode(r.units, '3.1.8.1')!;
            expect(u1.stableKey).toBe('BIGR-3.1.8.1');
            expect(u1.unitType).toBe('control');
            expect(u1.title).toBe('İz ve Denetim Kayıtlarının Tutulması');
            expect(u1.metadata.tedbirSeviyesi).toBe(1);
            expect(u1.page).toBe(63);
            expect(u1.metadata.sayfaBasili).toBe(59);
            expect(u1.metadata.dokumanSurumu).toBe('1.1');
            expect(u1.metadata.tedbirBaslikNo).toBe('3.1.8');
            expect(byCode(r.units, '3.1.8.6')!.metadata.tedbirSeviyesi).toBe(2);
            expect(byCode(r.units, '3.1.8.7')!.metadata.tedbirSeviyesi).toBe(2);
        });

        it('sütun ortalı hücrede numara satırı tanımın ortasında olsa da tanım metni tam alınır (3.1.8.1)', () => {
            const u1 = byCode(r.units, '3.1.8.1')!;
            expect(u1.originalText.startsWith('Tüm sistemlerde ve ağ cihazlarında kayıt mekanizması etkin olmalıdır.')).toBe(true);
            expect(u1.originalText.endsWith('güvenli bir şekilde yok edilmelidir.')).toBe(true);
        });

        it('komşu tedbirleri BİRLEŞTİRMEZ ve komşunun seviyesini/sorusunu almaz', () => {
            const u1 = byCode(r.units, '3.1.8.1')!;
            const u2 = byCode(r.units, '3.1.8.2')!;
            const u3 = byCode(r.units, '3.1.8.3')!;
            expect(u1.originalText).not.toContain('Sistem yöneticisi, operatörler');
            expect(u2.originalText).not.toContain('Tüm sistemlerde');
            expect(u2.originalText).not.toContain('Kayıtlarda zaman damgalarının');
            expect(u3.originalText).not.toContain('Sistem yöneticisi');
            expect(u1.metadata.denetimSorulari).toHaveLength(5);
            expect(u1.metadata.denetimSorulari[0]).toBe('Kurumun sistem ve ağ cihazlarının yüzde kaçında kayıt tutulmaktadır?');
            expect(u2.metadata.denetimSorusu).not.toContain('yüzde kaçında');
            expect(u2.metadata.denetimSorulari).toHaveLength(3);
            expect(u3.metadata.denetimSorulari).toEqual(['Kurumda senkronize ve yedekli zaman sunucusu kullanılmakta mıdır?']);
            for (const u of r.units) expect(u.originalText).not.toMatch(/\b3\.1\.8\.\d\b(?!\s*$)/); // yalnız "Bk." satırları numara içerebilir
        });

        it('çapraz referansları (Bk. Tedbir No / Tedbir Başlık No) hücrenin kendi tedbirine bağlar', () => {
            const u3 = byCode(r.units, '3.1.8.3')!;
            expect(u3.metadata.caprazReferanslar).toEqual(['5.1.1.11']);
            expect(u3.metadata.caprazReferansDetay).toEqual([{ tur: 'TEDBIR', no: '5.1.1.11' }]);
            expect(u3.originalText.endsWith('Bk. Tedbir No: 5.1.1.11')).toBe(true);
            const u8 = byCode(r.units, '3.1.8.8')!;
            expect(u8.metadata.caprazReferansDetay).toEqual([{ tur: 'TEDBIR_BASLIK', no: '3.1.10' }]);
            expect(byCode(r.units, '3.1.8.1')!.metadata.caprazReferanslar).toEqual([]);
        });

        it('çalışan başlık ve altbilgi (sayfa numarası) metne sızmaz', () => {
            for (const u of r.units) {
                expect(u.originalText).not.toContain('BİLGİ VE İLETİŞİM GÜVENLİĞİ REHBERİ');
                expect(u.title).not.toContain('BİLGİ VE İLETİŞİM');
                expect(u.originalText).not.toMatch(/(^|\n)\s*59\s*($|\n)/);
            }
        });

        it('denetim sorusu ait olduğu satırın sayfasıyla eşlenir; tutarlılık raporu temizdir', () => {
            expect(byCode(r.units, '3.1.8.1')!.metadata.denetimSayfasi).toBe(64);
            const v = verifyBigrUnits(r.units, pages);
            expect(v.ok).toBe(true);
            expect(v.groupCounts['3.1.8']).toBe(8);
            expect(v.gaps).toEqual([]);
        });
    });

    describe('3.2.9 — çok paragraflı hücre ve sayfa sınırı (110/111)', () => {
        const pages = [pg(110, P110), pg(111, P111)];
        const r = parseBigrPages(pages);

        it('3.2.9.1 … 3.2.9.7 doğru başlık/seviye ile bulunur; 3.2.9.2 iki paragraflıdır ve 3.2.9.1 ile karışmaz', () => {
            const nums = r.units.filter((u) => u.metadata.tedbirBaslikNo === '3.2.9').map((u) => u.metadata.tedbirNo);
            expect(nums).toEqual(['3.2.9.1', '3.2.9.2', '3.2.9.3', '3.2.9.4', '3.2.9.5', '3.2.9.6', '3.2.9.7']);
            const u1 = byCode(r.units, '3.2.9.1')!;
            const u2 = byCode(r.units, '3.2.9.2')!;
            expect(u1.title).toBe('SSL/TLS Protokolünün Güvenli Kullanılması');
            expect(u1.metadata.tedbirSeviyesi).toBe(1);
            expect(u1.page).toBe(110);
            expect(u1.originalText).not.toContain('Güvenilen bir sertifika otoritesinden');
            expect(u2.title).toBe('Sertifika Denetimlerinin Yapılması');
            expect(u2.originalText.split('\n')).toHaveLength(2);
            expect(u2.originalText).toContain('OCSP stapling');
            expect(byCode(r.units, '3.2.9.3')!.metadata.tedbirSeviyesi).toBe(2);
            expect(byCode(r.units, '3.2.9.4')!.metadata.tedbirSeviyesi).toBe(3);
        });

        it('3.2.9.1 denetim soruları 3 ayrı soru; sonraki sayfadaki soru satırı doğru tedbire bağlanır', () => {
            const u1 = byCode(r.units, '3.2.9.1')!;
            expect(u1.metadata.denetimSayfasi).toBe(111);
            expect(u1.metadata.denetimSorulari).toEqual([
                'Şifreli iletişim için hangi protokol versiyonu kullanılıyor?',
                'Sertifikalarda kullanılabilecek algoritmalar ve protokoller tanımlanmış mı?',
                'Sertifikalarda kullanılan algoritmalar ve protokoller ulusal ve/veya uluslararası otoriteler tarafından güvenli/uygulanabilir olarak kabul ediliyor mu?',
            ]);
            expect(byCode(r.units, '3.2.9.2')!.metadata.denetimSorulari).toHaveLength(2);
        });

        it('sayfa sonundaki sonraki grup başlığı (3.2.10) altındaki ilk tedbir kendi sayfasında bulunur, denetim satırı eksikse tahmin edilmez', () => {
            const u = byCode(r.units, '3.2.10.1')!;
            expect(u.page).toBe(111);
            expect(u.metadata.tedbirBaslikNo).toBe('3.2.10');
            expect(u.title).toBe('Sunucu Tarafında Girdi Doğrulama Denetiminin Yapılması');
            expect(u.metadata.denetimSorusu).toBeNull();
            expect(r.warnings.some((w) => w.code === 'MISSING_QUESTION' && w.unitCode === 'BIGR-3.2.10.1')).toBe(true);
        });

        it('önceki grubun devam eden denetim satırı (3.2.8.6) tedbir satırı olmadan ORPHAN olarak raporlanır, uydurma birim üretilmez', () => {
            expect(byCode(r.units, '3.2.8.6')).toBeUndefined();
            expect(r.warnings.some((w) => w.code === 'ORPHAN_QUESTION_ROW' && w.unitCode === 'BIGR-3.2.8.6')).toBe(true);
        });
    });

    describe('4.4.1 — sütun kayması (seviye rakamı numara satırında değil)', () => {
        const pages = [pg(172, P172), pg(173, P173)];
        const r = parseBigrPages(pages);

        it('seviye başka satırda olsa da doğru tedbire bağlanır; ad seviye rakamını içermez', () => {
            const u1 = byCode(r.units, '4.4.1.1')!;
            const u2 = byCode(r.units, '4.4.1.2')!;
            expect(u1.metadata.tedbirSeviyesi).toBe(1);
            expect(u1.title).toBe('Kriptografik Algoritma Tipinin Seçilmesi');
            expect(u2.metadata.tedbirSeviyesi).toBe(1);
            expect(u2.title).toBe('Kripto Uygulama, Cihaz ve Sistemlerin Kriptografik Algoritma Güvenliği');
            expect(byCode(r.units, '4.4.1.3')!.metadata.tedbirSeviyesi).toBe(1);
            expect(byCode(r.units, '4.4.1.4')!.metadata.tedbirSeviyesi).toBe(3);
            expect(r.warnings.filter((w) => w.code === 'MISSING_LEVEL')).toEqual([]);
        });

        it('3 bölümlü grup başlıkları (4.4.1) tedbir değildir → birim üretilmez; tedbirler 4 bölümlüdür', () => {
            expect(byCode(r.units, '4.4.1')).toBeUndefined();
            expect(r.units.every((u) => /^BIGR-\d+\.\d+\.\d+\.\d+$/.test(u.unitCode))).toBe(true);
            expect(r.units.map((u) => u.metadata.tedbirNo)).toEqual(['4.4.1.1', '4.4.1.2', '4.4.1.3', '4.4.1.4']);
        });

        it('sayfa: 4.4.1.1/2 → 172, 4.4.1.3/4 → 173; 3.x soru/denetim satırları başka gruba karışmaz', () => {
            expect(byCode(r.units, '4.4.1.1')!.page).toBe(172);
            expect(byCode(r.units, '4.4.1.3')!.page).toBe(173);
            expect(byCode(r.units, '4.4.1.1')!.metadata.denetimSorulari[0]).toBe('Kriptografik algoritma seçimi nasıl yapılmaktadır?');
            expect(byCode(r.units, '4.4.1.1')!.metadata.denetimSorulari).toHaveLength(2);
            expect(verifyBigrUnits(r.units, pages).ok).toBe(true);
        });
    });

    describe('5.1.1 — sıkılaştırma bölümü (sayfa 193)', () => {
        const r = parseBigrPages([pg(193, P193)]);
        it('5.1.1.1 … doğru; denetim sayfası verilmediği için soru uydurulmaz', () => {
            const u = byCode(r.units, '5.1.1.1')!;
            expect(u.title).toBe('Kurulum Güvenliği');
            expect(u.metadata.tedbirSeviyesi).toBe(1);
            expect(u.originalText).toContain('orijinal dağıtıcı özet değerleriyle teyit edilmelidir.');
            expect(u.metadata.denetimSorusu).toBeNull();
            expect(byCode(r.units, '5.1.1')).toBeUndefined();
            expect(r.units).toHaveLength(7);
            expect(r.warnings.filter((w) => w.code === 'MISSING_QUESTION')).toHaveLength(7);
        });
    });

    describe('içindekiler (TOC) ve bölüm/alt bölüm adları', () => {
        it('İÇİNDEKİLER sayfaları atlanır (birim üretmez); adlar sayaçla türetilir ve x.y.z. başlıklarıyla doğrulanır', () => {
            const pages = [pg(5, P5), pg(6, P6), pg(7, P7), pg(63, P63), pg(64, P64), pg(172, P172), pg(173, P173), pg(193, P193)];
            const r = parseBigrPages(pages);
            expect(r.stats.tocPages).toBe(3);
            expect(r.units.filter((u) => u.page <= 7)).toEqual([]);
            expect(r.warnings.filter((w) => w.code === 'TOC_NUMBERING_MISMATCH')).toEqual([]);
            const a = byCode(r.units, '3.1.8.1')!.metadata;
            expect(a.bolumNo).toBe('3');
            expect(a.bolumAdi).toBe('VARLIK GRUPLARINA YÖNELİK GÜVENLİK TEDBİRLERİ');
            expect(a.altBolumNo).toBe('3.1');
            expect(a.altBolumAdi).toBe('Ağ ve Sistem Güvenliği');
            expect(a.tedbirBaslikAdi).toBe('İz ve Denetim Kayıtlarının Tutulması ve İzlenmesi');
            const b = byCode(r.units, '4.4.1.1')!.metadata;
            expect([b.bolumNo, b.bolumAdi, b.altBolumNo, b.altBolumAdi]).toEqual([
                '4', 'UYGULAMA VE TEKNOLOJİ ALANLARINA YÖNELİK GÜVENLİK TEDBİRLERİ', '4.4', 'Kripto Uygulamaları Güvenliği',
            ]);
            expect(b.tedbirBaslikAdi).toBe('Kriptografik Algoritmalar ve Kullanımı');
            const c = byCode(r.units, '5.1.1.1')!.metadata;
            expect([c.bolumNo, c.bolumAdi, c.altBolumAdi]).toEqual(['5', 'SIKILAŞTIRMA TEDBİRLERİ', 'İşletim Sistemi Sıkılaştırma Tedbirleri']);
        });

        it('TOC olmadan adlar null kalır (tahmin edilmez)', () => {
            const r = parseBigrPages([pg(63, P63), pg(64, P64)]);
            expect(byCode(r.units, '3.1.8.1')!.metadata.bolumAdi).toBeNull();
            expect(byCode(r.units, '3.1.8.1')!.metadata.altBolumNo).toBe('3.1');
        });

        it('parseBigrToc: bölüm adları sayaçla eşlenir', () => {
            const w: never[] = [];
            const toc = parseBigrToc(
                [P5, P6, P7].map((t, i) => ({ page: i + 5, lines: t.split('\n'), printedPage: null, isToc: true })),
                w,
            );
            expect(toc.bolumAdlari['3']).toBe('VARLIK GRUPLARINA YÖNELİK GÜVENLİK TEDBİRLERİ');
            expect(toc.altBolumAdlari['3.2']).toBe('Uygulama ve Veri Güvenliği');
            expect(toc.baslikAdlari['3.2.9']).toBe('İletişim Güvenliği');
        });
    });

    describe('kaynak belgedeki numara yazım hatası (4.4.3.8 → "4.3.8")', () => {
        const pages = [pg(180, P180), pg(181, P181)];
        const r = parseBigrPages(pages);
        it('denetim satırındaki hatalı numara yalnızca bir önceki satırın ardılı ise okunur ve UYARI verilir', () => {
            const u = byCode(r.units, '4.4.3.8')!;
            expect(u).toBeDefined();
            expect(u.metadata.denetimBasiliNumara).toBe('4.3.8');
            expect(u.metadata.denetimSorusu).toContain('COMSEC laboratuvarında');
            expect(r.warnings.some((w) => w.code === 'SOURCE_NUMBER_TYPO' && w.unitCode === 'BIGR-4.4.3.8')).toBe(true);
            // komşu (4.4.3.7) sorusu 4.4.3.8'in sorusunu içermemeli
            expect(byCode(r.units, '4.4.3.7')!.metadata.denetimSorulari).toHaveLength(1);
            expect(verifyBigrUnits(r.units, pages).issues.filter((i) => i.kind === 'QUESTION_NUMBER_NOT_ON_PAGE')).toEqual([]);
        });
    });

    describe('verifyBigrUnits', () => {
        const pages = [pg(63, P63), pg(64, P64)];
        const units = parseBigrPages(pages).units;

        it('yanlış sayfayı yakalar', () => {
            const bad = units.map((u) => (u.unitCode === 'BIGR-3.1.8.2' ? { ...u, page: 110, pageEnd: 110 } : u));
            const v = verifyBigrUnits(bad, [...pages, pg(110, P110)]);
            expect(v.ok).toBe(false);
            expect(v.issues.some((i) => i.kind === 'NUMBER_NOT_ON_PAGE' && i.unitCode === 'BIGR-3.1.8.2')).toBe(true);
        });

        it('yanlış denetim sayfasını yakalar', () => {
            // denetim sayfası olarak 110 verilirse 3.1.8.1 numarası orada bulunamaz
            const bad2 = units.map((u) =>
                u.unitCode === 'BIGR-3.1.8.1' ? { ...u, metadata: { ...u.metadata, denetimSayfasi: 110 } } : u,
            );
            const v = verifyBigrUnits(bad2, [...pages, pg(110, P110)]);
            expect(v.issues.some((i) => i.kind === 'QUESTION_NUMBER_NOT_ON_PAGE')).toBe(true);
        });

        it('grup içi numara boşluğunu ve yinelenen anahtarı bildirir', () => {
            const gap = units.filter((u) => u.unitCode !== 'BIGR-3.1.8.4');
            const v = verifyBigrUnits(gap, pages);
            expect(v.ok).toBe(false);
            expect(v.gaps).toEqual([{ group: '3.1.8', missing: ['3.1.8.4'] }]);
            const dup = verifyBigrUnits([...units, units[0]], pages);
            expect(dup.issues.some((i) => i.kind === 'DUPLICATE_KEY')).toBe(true);
        });
    });

    it('boş girdi güvenle boş sonuç döner', () => {
        const r = parseBigrPages([]);
        expect(r.units).toEqual([]);
        expect(r.warnings).toEqual([]);
    });

    it('birim içerik özeti kararlıdır ve içerik değişince değişir', () => {
        const a = parseBigrPages([pg(63, P63), pg(64, P64)]).units;
        const b = parseBigrPages([pg(63, P63), pg(64, P64)]).units;
        expect(a.map((u) => u.contentHash)).toEqual(b.map((u) => u.contentHash));
        const changed = parseBigrPages([pg(63, P63.replace('Zaman Sunucusu Kullanımı', 'Zaman Sunucusu Kullanımı X')), pg(64, P64)]).units;
        expect(byCode(changed, '3.1.8.3')!.contentHash).not.toBe(byCode(a, '3.1.8.3')!.contentHash);
        expect(byCode(changed, '3.1.8.2')!.contentHash).toBe(byCode(a, '3.1.8.2')!.contentHash);
    });
});
