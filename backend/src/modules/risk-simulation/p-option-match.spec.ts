import { matchPOptions, P_LABELS } from './p-option-match';
import { parseImpactArea, statusApproved } from './workspace-excel.service';

describe('matchPOptions — GRC kontrol metinleri → P1–P5', () => {
    it('GRC şablonundaki seçenek metinlerini eşler', () => {
        const r = matchPOptions({
            kontrolTuru: 'Otomatik', kontrolIslevi: 'Önleyici',
            kontrolIsletimeSekli: 'İşlem elektronik imza ile gerçekleştirilmektedir.',
            kontrolIsletimDenetimi: 'İşlemler farklı ekiplerdeki çalışanlar tarafından kontrol edilmektedir.',
            kontrolIsletimRaporlama: 'İşlemler farklı birimlere (RKD/BGD vb.) raporlanmakta ve işlemlerin gözetimi yapılmaktadır.',
        });
        expect(r).toEqual({ p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'ELEKTRONIK_IMZA', p4: 'FARKLI_EKIP', p5: 'FARKLI_BIRIM_GOZETIM', unmatched: [] });
    });

    it('Tür/İşlev alanları yer değiştirmiş kayıtta da doğru eşler', () => {
        const r = matchPOptions({ kontrolTuru: 'Tespit Edici', kontrolIslevi: 'BT Manuel' });
        expect([r.p1, r.p2]).toEqual(['BT_MANUEL', 'TESPIT_EDICI']);
        expect(r.unmatched).toEqual([]);
    });

    it('ayrıntılı metinler: "düzensiz" ile "düzenli", "aynı ekip", sistem logu', () => {
        expect(matchPOptions({ kontrolIsletimRaporlama: 'İşlemler düzensiz aralıklarla üst amirlere raporlanmaktadır.' }).p5).toBe('DUZENSIZ_UST_AMIR');
        expect(matchPOptions({ kontrolIsletimRaporlama: 'Üst amirlere düzenli aralıklarla raporlama yapılmaktadır.' }).p5).toBe('DUZENLI_UST_AMIR');
        expect(matchPOptions({ kontrolIsletimDenetimi: 'İşlemler aynı ekipteki diğer çalışanlar tarafından kontrol edilmektedir.' }).p4).toBe('AYNI_EKIP');
        expect(matchPOptions({ kontrolIsletimeSekli: 'İşlem, sistem logları veya ıslak imza ile kayıt altına alınmaktadır.' }).p3).toBe('SISTEM_LOG_ISLAK_IMZA');
    });

    it('tanınmayan dolu metin en düşük seçeneğe düşer ve raporlanır; boş alan raporlanmaz', () => {
        const r = matchPOptions({ kontrolTuru: 'Hibrit', kontrolIsletimeSekli: 'Bilinmeyen yöntem', kontrolIsletimDenetimi: '' });
        expect([r.p1, r.p3, r.p4]).toEqual(['MANUEL', 'IZ_KAYDI_YOK', 'YOK']);
        expect(r.unmatched).toEqual([{ param: 'P1', text: 'Hibrit' }, { param: 'P3', text: 'Bilinmeyen yöntem' }]);
    });

    it('dışa aktarılan her P metni kendi seçeneğine geri eşlenir (Excel gidiş-dönüşü)', () => {
        for (const p1 of Object.keys(P_LABELS.p1)) for (const p2 of Object.keys(P_LABELS.p2)) {
            const r = matchPOptions({ kontrolTuru: (P_LABELS.p1 as any)[p1], kontrolIslevi: (P_LABELS.p2 as any)[p2] });
            expect([r.p1, r.p2]).toEqual([p1, p2]);
        }
        for (const k of ['p3', 'p4', 'p5'] as const) {
            const field = { p3: 'kontrolIsletimeSekli', p4: 'kontrolIsletimDenetimi', p5: 'kontrolIsletimRaporlama' }[k];
            for (const [value, text] of Object.entries(P_LABELS[k])) {
                const r = matchPOptions({ kontrolTuru: 'Manuel', kontrolIslevi: 'Önleyici', [field]: text });
                expect(r[k]).toBe(value);
                expect(r.unmatched).toEqual([]);
            }
        }
    });

    it('etki alanı ve statü metinleri', () => {
        expect(['Olasılık ve etki', 'Yalnız olasılık', 'Yalnız etki', '', 'saçma'].map(parseImpactArea)).toEqual(['BOTH', 'PROBABILITY', 'IMPACT', 'BOTH', null]);
        expect(['Aktif', 'AKTIF', 'Onaylı', '', 'İptal', 'IPTAL', 'PASIF', 'Kapalı', 'KAPALI'].map(statusApproved)).toEqual([true, true, true, true, false, false, false, false, false]);
    });

    it('büyük harfli kayıtları da eşler', () => {
        const r = matchPOptions({ kontrolTuru: 'OTOMATIK', kontrolIslevi: 'ÖNLEYICI', kontrolIsletimeSekli: 'ISLAK IMZA',
            kontrolIsletimDenetimi: 'FARKLI EKIPLERDEKI ÇALIŞANLAR', kontrolIsletimRaporlama: 'DÜZENSIZ ARALIKLARLA' });
        expect(r).toMatchObject({ p1: 'OTOMATIK', p2: 'ONLEYICI', p3: 'SISTEM_LOG_ISLAK_IMZA', p4: 'FARKLI_EKIP', p5: 'DUZENSIZ_UST_AMIR', unmatched: [] });
    });
});
