// Kontrol & Kanıt Değerlendirme v3 — sabit ifadeler ve dil kuralları.

/** Retrieval sonucu yetersizse modelin/arka planın kullandığı sabit ifade. */
export const NO_REFERENCE_SENTENCE =
    'İncelenen kaynaklarda mevcut kanıtla doğrudan ilişkilendirilebilen bir hüküm tespit edilememiştir.';

/** Kapsamı doğrulanmamış mevzuat için sabit ifade. */
export const SCOPE_UNVERIFIED_SENTENCE =
    'İlgili mevzuat hükmünün incelenen kurum veya süreç bakımından doğrudan uygulanabilirliği ayrıca doğrulanmalıdır.';

/** Resmî rehber tedbiri kanuni zorunluluk gibi sunulamaz. */
export const GUIDE_NOT_BINDING_SENTENCE =
    'Resmî rehber tedbiridir; tek başına kanuni bir zorunluluk olarak sunulmamıştır.';

export const NO_FINDING_SENTENCE = 'Bulgu tespit edilmemiştir.';

/** Kontrol Sonucu / bulgu metninde kaçınılacak öznel veya kanıt sınırını aşan ifadeler. */
export const BANNED_PHRASES: { pattern: RegExp; label: string }[] = [
    { pattern: /d[üu]ş[üu]n[üu]yoruz/i, label: 'düşünüyoruz' },
    { pattern: /bize g[öo]re/i, label: 'bize göre' },
    { pattern: /\bhatal[ıi]d[ıi]r\b/i, label: 'hatalıdır' },
    { pattern: /[çc]ok yetersiz/i, label: 'çok yetersizdir' },
    { pattern: /kesinlikle (g[üu]venli değil|g[üu]vensiz|uyumsuz)/i, label: 'kesinlikle güvensiz/uyumsuz' },
    { pattern: /a[çc][ıi]k metindir/i, label: 'açık metindir' },
];

/** Rehber maddesini mevzuat zorunluluğu gibi gösteren ifadeler. */
export const GUIDE_AS_LAW_PATTERNS: RegExp[] = [
    /mevzuata ayk[ıi]r/i,
    /kanuni zorunluluk/i,
    /yasal zorunluluk/i,
    /mevzuat[a-zçğıöşü]* ihlal/i,
];

/** Eski dört sütunlu yapıya ait anahtarlar — v3 çıktıda bulunamaz (atılır). */
export const LEGACY_FOUR_COLUMN_KEYS = [
    'requirementAssessments', 'applicability', 'requirement', 'rationale', 'gereklilik',
    'uygulanabilirlik', 'sonuc', 'gerekce',
];
