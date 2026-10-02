import {
    SCOPE_NOTE,
    TEBLIG_KAYNAK_URL,
    decodeHtmlEntities,
    extractScope,
    htmlToText,
    parseTebligText,
    pdfLayoutToParagraphText,
    tlsHelpMessage,
} from './teblig-parser';
import { TEBLIG_P1, TEBLIG_P2, TEBLIG_P3, TEBLIG_P4, TEBLIG_P5 } from './teblig-fixtures';

// Gerçek yerel PDF'in (13 Mart 2025 PERŞEMBE, 16 sayfa) ilk 5 sayfası — yazdırma başlığı/altbilgisi ile.
const PAGES = [TEBLIG_P1, TEBLIG_P2, TEBLIG_P3, TEBLIG_P4, TEBLIG_P5];

describe('teblig-parser — PDF (layout) yolu', () => {
    const text = pdfLayoutToParagraphText(PAGES);
    const r = parseTebligText(text);
    const get = (k: string) => r.units.find((u) => u.stableKey === k)!;

    it('yazdırma başlığı, site adresi ve "Sayfa n / 16" altbilgisi atılır', () => {
        expect(text).not.toMatch(/23\.12\.2025 00:12/);
        expect(text).not.toMatch(/Sayfa \d+ \/ 16/);
        expect(text).not.toMatch(/resm#gazete|https?:\/\//);
        for (const u of r.units) {
            expect(u.originalText).not.toMatch(/PERŞEMBE\s+23\.12\.2025/);
            expect(u.originalText).not.toMatch(/Sayfa \d+ \/ 16/);
        }
    });

    it('künye: Resmî Gazete tarihi ve sayısı okunur', () => {
        expect(r.masthead).toEqual({ tarih: '2025-03-13', sayi: '32840' });
        expect(r.warnings.filter((w) => w.code === 'MASTHEAD_MISMATCH')).toEqual([]);
    });

    it('sayfa sınırlarını aşan maddeler (4. madde) tek parça ve tamdır', () => {
        const m4 = get('md.4');
        expect(m4.title).toBe('Tanımlar ve kısaltmalar');
        expect(m4.originalText.startsWith('MADDE 4- (1) Bu Tebliğde geçen;')).toBe(true);
        expect(m4.metadata.bentler.length).toBe(36);
        expect(m4.originalText).toContain('\nf) Çok faktörlü kimlik doğrulama:');
        expect(m4.originalText).toContain('\nff) Varlık sahibi:');
        expect(m4.originalText.trimEnd().endsWith('ifade eder.')).toBe(true);
        expect(m4.originalText).not.toContain('Sayfa 1 / 16');
    });

    it('1–5. maddeler sırayla bulunur, başlıklar madde üstündeki satırdır', () => {
        expect(r.articleOrder.slice(0, 5)).toEqual(['1', '2', '3', '4', '5']);
        expect(['md.1', 'md.2', 'md.3', 'md.4', 'md.5'].map((k) => get(k).title)).toEqual([
            'Amaç', 'Kapsam', 'Dayanak', 'Tanımlar ve kısaltmalar', 'Bilgi sistemleri yönetiminin oluşturulması ve hayata geçirilmesi',
        ]);
        expect(get('md.1').metadata).toMatchObject({ bolum: 'BİRİNCİ BÖLÜM', bolumAdi: 'Başlangıç Hükümleri' });
        expect(get('md.5').metadata).toMatchObject({ bolum: 'İKİNCİ BÖLÜM', bolumAdi: 'Bilgi Sistemlerinin Yönetilmesi' });
        expect(r.warnings.filter((w) => w.code === 'GAP' || w.code === 'ORDER' || w.code === 'FIKRA_ORDER')).toEqual([]);
    });

    it('madde 2: fıkra + bent yapısı korunur; çok fıkralı maddede md.2.f1 / md.2.f2 alt birimleri parentKey ile bağlanır', () => {
        const m2 = get('md.2');
        expect(m2.unitType).toBe('article');
        expect(m2.unitCode).toBe('md.2');
        expect(m2.parentKey).toBeNull();
        expect(m2.metadata.fikraSayisi).toBe(2);
        expect(m2.metadata.bentler).toHaveLength(12);
        expect(m2.metadata.tebligNo).toBe('VII-128.10');
        expect(m2.metadata.resmiGazeteTarihi).toBe('2025-03-13');
        expect(m2.metadata.resmiGazeteSayisi).toBe('32840');
        expect(m2.metadata.yururlukDurumu).toBe('YURURLUKTE');
        expect(m2.metadata.kaynakUrl).toBe(TEBLIG_KAYNAK_URL);
        const f1 = get('md.2.f1');
        const f2 = get('md.2.f2');
        expect(f1.parentKey).toBe('md.2');
        expect(f1.unitType).toBe('clause');
        expect(f1.metadata.fikra).toBe(1);
        expect(f1.originalText.split('\n')).toHaveLength(13); // (1) + 12 bent
        expect(f1.originalText.startsWith('(1) Aşağıdaki Kurum, Kuruluş ve Ortaklıklar')).toBe(true);
        expect(f2.originalText.startsWith('(2) Birinci fıkrada sayılan')).toBe(true);
        expect(f2.metadata.bentler).toEqual([]);
        expect(m2.originalText).toBe(`MADDE 2- ${f1.originalText}\n${f2.originalText}`);
    });

    it('tek fıkralı maddede alt birim üretilmez', () => {
        expect(r.units.find((u) => u.stableKey === 'md.1.f1')).toBeUndefined();
        expect(get('md.1').metadata.fikraSayisi).toBe(1);
        expect(r.units.find((u) => u.stableKey === 'md.3.f1')).toBeUndefined();
    });

    it('bent harfleri Türkçe alfabeyle korunur (ç, ğ, ı)', () => {
        const letters = get('md.2').metadata.bentler.map((b) => b.split(')')[0]);
        expect(letters).toEqual(['a', 'b', 'c', 'ç', 'd', 'e', 'f', 'g', 'ğ', 'h', 'ı', 'i']);
    });

    it('içerik özeti kararlı; metin değişince değişir', () => {
        const again = parseTebligText(pdfLayoutToParagraphText(PAGES));
        expect(again.units.map((u) => u.contentHash)).toEqual(r.units.map((u) => u.contentHash));
        const changed = parseTebligText(text.replace('Borsa İstanbul A.Ş.,', 'Borsa İstanbul A.Ş.;'));
        expect(changed.units.find((u) => u.stableKey === 'md.2')!.contentHash).not.toBe(get('md.2').contentHash);
        expect(changed.units.find((u) => u.stableKey === 'md.3')!.contentHash).toBe(get('md.3').contentHash);
    });
});

describe('teblig-parser — sayfa sonunda kalan başlık (modellenmiş küçük düzen)', () => {
    // Gerçek düzen: başlık sayfanın son satırı, MADDE sonraki sayfanın ilk satırı (madde 25, 29, 32 örnekleri).
    const first = (s: string) => ' '.repeat(23) + s;
    const cont = (s: string) => ' '.repeat(14) + s;
    const page1 = [
        first('MADDE 24- (1) Kurum, Kuruluş ve Ortaklıklar, bilgi güvenliği ihlallerini kayıt altına alır.'),
        cont('İhlaller üst yönetime bildirilir.'),
        first('Bilgi sistemleri edinimi, geliştirilmesi ve bakımı'),
        '',
        'https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                    Sayfa 9 / 16',
    ].join('\n');
    const page2 = [
        '13 Mart 2025 PERŞEMBE                                                                    23.12.2025 00:12',
        '',
        first('MADDE 25- (1) Kurum, Kuruluş ve Ortaklıklar, edinim süreçlerinde güvenlik gereksinimlerini belirler.'),
        first('(2) Test ortamı canlı ortamdan ayrılır.'),
    ].join('\n');
    const r = parseTebligText(pdfLayoutToParagraphText([page1, page2]));

    it('başlık, altbilgi/başlık satırları aşıldıktan sonra doğru maddeye verilir; önceki maddeye eklenmez', () => {
        const m24 = r.units.find((u) => u.stableKey === 'md.24')!;
        const m25 = r.units.find((u) => u.stableKey === 'md.25')!;
        expect(m25.title).toBe('Bilgi sistemleri edinimi, geliştirilmesi ve bakımı');
        expect(m24.originalText).not.toContain('edinimi');
        expect(m24.originalText).toContain('İhlaller üst yönetime bildirilir.');
        expect(m25.metadata.fikraSayisi).toBe(2);
    });
});

describe('teblig-parser — Geçici madde ve sıra doğrulaması', () => {
    it('GEÇİCİ MADDE ayrı anahtarla (md.g1) alınır, normal sayaç bozulmaz', () => {
        const txt = [
            'Yürürlükten kaldırılan tebliğ',
            'MADDE 32- (1) Eski tebliğ yürürlükten kaldırılmıştır.',
            'Geçiş süresi',
            'GEÇİCİ MADDE 1- (1) Uyum 31/12/2025 tarihine kadar sağlanır.',
            'Yürürlük',
            'MADDE 33- (1) Bu Tebliğ 30/6/2025 tarihinde yürürlüğe girer.',
        ].join('\n');
        const r = parseTebligText(txt);
        expect(r.articleOrder).toEqual(['32', 'Geçici 1', '33']);
        const g = r.units.find((u) => u.stableKey === 'md.g1')!;
        expect(g.title).toBe('Geçiş süresi');
        expect(g.metadata.gecici).toBe(true);
        expect(g.originalText.startsWith('GEÇİCİ MADDE 1- (1)')).toBe(true);
        expect(r.units.find((u) => u.stableKey === 'md.33')!.metadata.yururlukTarihi).toBe('2025-06-30');
    });

    it('madde boşluğu / sırasızlık uyarı olarak bildirilir', () => {
        const r = parseTebligText(['Amaç', 'MADDE 1- (1) A.', 'Kapsam', 'MADDE 3- (1) B.'].join('\n'));
        expect(r.warnings.some((w) => w.code === 'GAP')).toBe(true);
    });
});

describe('teblig-parser — HTML yolu', () => {
    // NOT: Canlı Resmî Gazete sayfası bu makineden TLS hatası verdiği için alınamadı; bu HTML, sitenin
    // paragraf-başına-<p> yapısına göre MODELLENMİŞ sentetik bir örnektir (gerçek sayfa değildir).
    const html = `<!DOCTYPE html><html><head><title>x</title><style>p{color:red}</style><script>var a = "<p>MADDE 99-</p>";</script></head>
<body><div id="nav"><a href="/">Ana&nbsp;Sayfa</a></div>
<p class="c">13 Mart 2025 PERŞEMBE&nbsp;&nbsp;Resm&icirc; Gazete&nbsp;&nbsp;Say&#305; : 32840</p>
<p align="center"><b>B&#304;R&#304;NC&#304; B&Ouml;L&Uuml;M</b></p>
<p align="center"><b>Ba&#351;lang&#305;&ccedil; H&uuml;k&uuml;mleri</b></p>
<p align="center"><b>Kapsam</b></p>
<p>MADDE 2- (1) A&#351;a&#287;&#305;daki Kurum, Kurulu&#351; ve Ortakl&#305;klar, bu Te&#287;li&#287; h&uuml;k&uuml;mlerine uymakla y&uuml;k&uuml;ml&uuml;d&uuml;rler:</p>
<p>a) Borsa &#304;stanbul A.&#350;.,</p>
<p>b) Kripto Varl&#305;k Hizmet Sa&#287;lay&#305;c&#305;lar.</p>
<p>(2) Birinci f&#305;krada say&#305;lanlar&hellip; <i>bu</i> Te&#287;li&#287;de &ouml;ng&ouml;r&uuml;len &amp; belirlenen y&uuml;k&uuml;ml&uuml;l&uuml;kleri&rsquo;ni yerine getirir.</p>
<!-- yorum --><p>Eki i&ccedil;in t&#305;klay&#305;n&#305;z</p></body></html>`;

    it('htmlToText: etiketler atılır, script/style/yorum kalmaz, entity çözülür, paragraf satırları korunur', () => {
        const t = htmlToText(html);
        expect(t).not.toMatch(/<|>|MADDE 99|color:red|yorum/);
        expect(t).toContain('BİRİNCİ BÖLÜM');
        expect(t).toContain('Başlangıç Hükümleri');
        expect(t).toContain('Resmî Gazete');
        expect(t).toContain('& belirlenen');
        expect(t).toContain('yükümlülükleri’ni');
        expect(t.split('\n').filter((l) => l.startsWith('a) '))).toHaveLength(1);
        expect(t).toContain('Ana Sayfa');
        expect(t).not.toMatch(/&\w+;|&#\d+;/);
        expect(t.split('\n').every((l) => l === l.trim())).toBe(true);
    });

    it('decodeHtmlEntities: sayısal, onaltılık ve adlandırılmış; bilinmeyen entity olduğu gibi kalır', () => {
        expect(decodeHtmlEntities('&#350;&#x15F;&ccedil;&nbsp;&bilinmeyen;&#99999999;')).toBe('Şşç &bilinmeyen;&#99999999;');
    });

    it('HTML metni de aynı ayrıştırıcıdan geçer: madde/fıkra/bent yapısı PDF yolundakiyle aynı', () => {
        const r = parseTebligText(htmlToText(html));
        const m2 = r.units.find((u) => u.stableKey === 'md.2')!;
        expect(m2.title).toBe('Kapsam');
        expect(m2.metadata.bolum).toBe('BİRİNCİ BÖLÜM');
        expect(m2.metadata.bolumAdi).toBe('Başlangıç Hükümleri');
        expect(m2.metadata.bentler).toEqual(['a) Borsa İstanbul A.Ş.,', 'b) Kripto Varlık Hizmet Sağlayıcılar.']);
        expect(r.units.filter((u) => u.parentKey === 'md.2').map((u) => u.stableKey)).toEqual(['md.2.f1', 'md.2.f2']);
        expect(r.masthead.sayi).toBe('32840');
        // sayfa altındaki "Eki için tıklayınız" bağlantı metni son maddeye eklenmez
        expect(m2.originalText).not.toContain('Eki için');
    });
});

describe('teblig-parser — extractScope (kapsam)', () => {
    const text = pdfLayoutToParagraphText(PAGES);
    const scope = extractScope(text)!;
    const art2 = parseTebligText(text).units.find((u) => u.stableKey === 'md.2')!;

    it('2. maddenin BİREBİR metnini döndürür', () => {
        expect(scope.verbatimArticle2).toBe(art2.originalText);
        expect(scope.verbatimArticle2).toContain('a) Borsa İstanbul A.Ş.,');
        expect(scope.verbatimArticle2).toContain('i) Kripto Varlık Hizmet Sağlayıcılar.');
        expect(scope.verbatimArticle2).toContain('hükmündedir.');
    });

    it('kurum satırları yapısal listedir ve uygulanabilirlik kararı (boolean) İÇERMEZ', () => {
        expect(scope.institutionLines).toHaveLength(12);
        expect(scope.institutionLines[0]).toEqual({ bent: 'a', text: 'Borsa İstanbul A.Ş.,' });
        expect(scope.institutionLines[11]).toEqual({ bent: 'i', text: 'Kripto Varlık Hizmet Sağlayıcılar.' });
        expect(Object.keys(scope).sort()).toEqual(['fikralar', 'institutionLines', 'note', 'verbatimArticle2']);
        const collectBooleans = (o: unknown): boolean[] =>
            Array.isArray(o) ? o.flatMap(collectBooleans) : o && typeof o === 'object' ? Object.values(o).flatMap(collectBooleans) : typeof o === 'boolean' ? [o] : [];
        expect(collectBooleans(scope)).toEqual([]);
        expect(scope.fikralar.map((f) => f.no)).toEqual([1, 2]);
    });

    it('scopeNote sabiti ve kapsamla birlikte döner; madde 2 yoksa null', () => {
        expect(SCOPE_NOTE).toBe('İlgili mevzuat hükmünün incelenen kurum veya süreç bakımından doğrudan uygulanabilirliği ayrıca doğrulanmalıdır.');
        expect(scope.note).toBe(SCOPE_NOTE);
        expect(extractScope('MADDE 1- (1) Sadece bir madde.')).toBeNull();
    });
});

describe('teblig-parser — --url TLS hatası mesajı', () => {
    it('sertifika hatasında Türkçe açıklama verir, NODE_EXTRA_CA_CERTS ve kaydedilmiş HTML önerir; TLS doğrulamasını kapatmayı önermez', () => {
        const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'unable to verify the first certificate' } });
        const msg = tlsHelpMessage(TEBLIG_KAYNAK_URL, err);
        expect(msg).toContain('sertifika');
        expect(msg).toContain('NODE_EXTRA_CA_CERTS');
        expect(msg).toContain('--html');
        expect(msg).toContain('KAPATILMAZ');
        expect(msg).not.toMatch(/rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|curl -k/);
    });

    it('TLS dışı hata genel mesajla bildirilir', () => {
        const msg = tlsHelpMessage('https://x.example', new Error('HTTP 503'));
        expect(msg).toContain('HTTP 503');
        expect(msg).not.toContain('NODE_EXTRA_CA_CERTS');
    });
});
