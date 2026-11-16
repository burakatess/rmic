/**
 * Kontrol Alanı (RiskControl) ve GRC Kontrol Excel'indeki serbest metinleri simülasyonun
 * P1–P5 seçeneklerine eşler. Metinler GRC şablonundaki seçenek metinleridir (ör. "İşlem
 * elektronik imza ile gerçekleştirilmektedir."). Tanınmayan metin en düşük (0 puanlı)
 * seçeneğe düşer ve `unmatched` listesinde raporlanır — sessizce puan uydurulmaz.
 */
import type { P1, P2, P3, P4, P5 } from './calculation-engine';

// "ı" → "i": büyük harfli kayıtlar ("OTOMATIK", "FARKLI EKIP") tr küçültmede "ı" verir;
// kurallar da noktasız yazılır, böylece büyük/küçük harf yazımı fark etmez.
const norm = (s: string | null | undefined) =>
    (s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').replace(/[.]/g, '').trim();

type Rule<T> = { value: T; test: (n: string) => boolean };

const P1_RULES: Rule<P1>[] = [
    { value: 'OTOMATIK', test: n => n === 'otomatik' },
    { value: 'BT_MANUEL', test: n => n === 'bt manuel' || n.includes('yari otomatik') || n.includes('bt destekli') },
    { value: 'MANUEL', test: n => n === 'manuel' },
];
const P2_RULES: Rule<P2>[] = [
    { value: 'ONLEYICI', test: n => n.startsWith('önleyici') },
    { value: 'DUZELTICI', test: n => n.startsWith('düzeltici') },
    { value: 'TESPIT_EDICI', test: n => n.startsWith('tespit edici') },
];
const P3_RULES: Rule<P3>[] = [
    { value: 'ELEKTRONIK_IMZA', test: n => n.includes('elektronik imza') },
    { value: 'SISTEM_LOG_ISLAK_IMZA', test: n => n.includes('sistem log') || n.includes('islak imza') },
    { value: 'KULLANICI_SIFRE_SES_EMAIL', test: n => n.includes('kullanici adi') || n.includes('parola') || n.includes('e-mail') || n.includes('ses kaydi') },
    { value: 'IZ_KAYDI_YOK', test: n => n.includes('iz kaydi yok') },
];
const P4_RULES: Rule<P4>[] = [
    { value: 'HER_IKISI', test: n => n.includes('her ikisi') },
    { value: 'FARKLI_EKIP', test: n => n.includes('farkli ekip') },
    { value: 'AYNI_EKIP', test: n => n.includes('ayni ekip') },
    { value: 'YOK', test: n => n.startsWith('bulunmamaktadir') || n === 'yok' },
];
const P5_RULES: Rule<P5>[] = [
    { value: 'FARKLI_BIRIM_GOZETIM', test: n => n.includes('farkli birim') },
    { value: 'DUZENSIZ_UST_AMIR', test: n => n.includes('düzensiz') },
    { value: 'DUZENLI_UST_AMIR', test: n => n.includes('düzenli') },
    { value: 'YOK', test: n => n.startsWith('bulunmamaktadir') || n === 'yok' },
];

function match<T>(rules: Rule<T>[], text: string | null | undefined): T | null {
    const n = norm(text);
    if (!n) return null;
    return rules.find(r => r.test(n))?.value ?? null;
}

export interface PMatchResult {
    p1: P1; p2: P2; p3: P3; p4: P4; p5: P5;
    /** Tanınmayan (dolu ama eşleşmeyen) alanlar; boş alanlar burada yer almaz. */
    unmatched: { param: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'; text: string }[];
}

export function matchPOptions(src: {
    kontrolTuru?: string | null; kontrolIslevi?: string | null;
    kontrolIsletimeSekli?: string | null; kontrolIsletimDenetimi?: string | null; kontrolIsletimRaporlama?: string | null;
}): PMatchResult {
    const unmatched: PMatchResult['unmatched'] = [];
    // Kontrol Türü / İşlevi kayıtlarda yer değiştirmiş olabiliyor: her iki alana da bakılır.
    const p1 = match(P1_RULES, src.kontrolTuru) ?? match(P1_RULES, src.kontrolIslevi);
    const p2 = match(P2_RULES, src.kontrolIslevi) ?? match(P2_RULES, src.kontrolTuru);
    const p3 = match(P3_RULES, src.kontrolIsletimeSekli);
    const p4 = match(P4_RULES, src.kontrolIsletimDenetimi);
    const p5 = match(P5_RULES, src.kontrolIsletimRaporlama);
    const note = (param: PMatchResult['unmatched'][number]['param'], v: unknown, text: string | null | undefined) => {
        if (v === null && norm(text)) unmatched.push({ param, text: String(text) });
    };
    note('P1', p1, match(P2_RULES, src.kontrolTuru) ? src.kontrolIslevi : src.kontrolTuru);
    // Yer değiştirmiş kayıtta İşlev alanı P1 metni taşır; P2 için diğer alan raporlanır.
    note('P2', p2, match(P1_RULES, src.kontrolIslevi) ? src.kontrolTuru : src.kontrolIslevi);
    note('P3', p3, src.kontrolIsletimeSekli);
    note('P4', p4, src.kontrolIsletimDenetimi);
    note('P5', p5, src.kontrolIsletimRaporlama);
    return {
        p1: p1 ?? 'MANUEL', p2: p2 ?? 'TESPIT_EDICI', p3: p3 ?? 'IZ_KAYDI_YOK', p4: p4 ?? 'YOK', p5: p5 ?? 'YOK',
        unmatched,
    };
}

/**
 * Dışa aktarımda yazılan GRC seçenek metinleri (frontend seçimleriyle aynı). Her metin
 * `matchPOptions` ile kendi seçeneğine geri eşlenir — Excel gidiş-dönüşü kayıpsızdır.
 */
export const P_LABELS = {
    p1: { MANUEL: 'Manuel', BT_MANUEL: 'BT Manuel', OTOMATIK: 'Otomatik' } as Record<P1, string>,
    p2: { TESPIT_EDICI: 'Tespit Edici', DUZELTICI: 'Düzeltici', ONLEYICI: 'Önleyici' } as Record<P2, string>,
    p3: {
        IZ_KAYDI_YOK: 'Kontrolün iz kaydı yoktur.',
        KULLANICI_SIFRE_SES_EMAIL: 'Kullanıcı adı / parola / ses kaydı / ortak alan / e-mail',
        SISTEM_LOG_ISLAK_IMZA: 'Sistem logları veya ıslak imza ile kayıt altında',
        ELEKTRONIK_IMZA: 'Elektronik imza ile gerçekleştiriliyor',
    } as Record<P3, string>,
    p4: {
        YOK: 'Bulunmamaktadır.', AYNI_EKIP: 'Aynı ekipteki çalışanlarca kontrol',
        FARKLI_EKIP: 'Farklı ekiplerdeki çalışanlarca kontrol', HER_IKISI: 'Her ikisi de yapılmaktadır.',
    } as Record<P4, string>,
    p5: {
        YOK: 'Bulunmamaktadır.', DUZENSIZ_UST_AMIR: 'Düzensiz aralıklarla üst amirlere',
        DUZENLI_UST_AMIR: 'Düzenli aralıklarla üst amirlere', FARKLI_BIRIM_GOZETIM: 'Farklı birimlere (RKD/BGD vb.) + gözetim',
    } as Record<P5, string>,
};
