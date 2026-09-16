/**
 * ENTEGRASYON DOĞRULAMA FIXTURE'LARI — YALNIZCA İZOLE TEST DB.
 *
 * Bu metinler RESMÎ STANDART METNİ DEĞİLDİR. NIST SP 800-53 kontrol
 * kimlikleri (AC-2, SC-13, AU-3) bilinen kamuya açık tanımlayıcılardır;
 * aşağıdaki gövdeler entegrasyonu (manuel seçim → prompt → atıf doğrulama)
 * uçtan uca test etmek için yazılmış KISA ÖZETLERDİR. Üretimde gerçek metin,
 * sürüm ve lisans doğrulanarak ayrıca girilmelidir.
 */

export interface FixtureUnit {
    stableKey: string;
    unitCode: string;
    unitType: string;
    title: string;
    originalText: string;
    translationTr: string;
    scope: string;
    role: 'relevant' | 'irrelevant' | 'conflicting-a' | 'conflicting-b';
}

export const FIXTURE_SOURCE = {
    slug: 'test-fixture-sp80053a',
    title: '[TEST FIXTURE] SP 800-53 kontrol özetleri (entegrasyon doğrulama)',
    publisher: 'RMIC — iç test fixture',
    officialUrl: 'https://csrc.nist.gov/pubs/sp/800/53/a/r5/final',
    docCode: 'FIXTURE',
    language: 'tr',
    versionLabel: 'fixture-v1',
    rightsBasis:
        'TEST FIXTURE — yalnız Kaynak Kataloğu entegrasyonunun uçtan uca doğrulanması için. Resmî metin değildir; üretimde kullanılmaz.',
};

export const FIXTURE_UNITS: FixtureUnit[] = [
    {
        stableKey: 'AC-2',
        unitCode: 'AC-2',
        unitType: 'control',
        title: 'Hesap Yönetimi (Account Management)',
        originalText:
            'Kurum, bilgi sistemi hesaplarını yönetir: hesap türlerini tanımlar, hesap oluşturma/etkinleştirme/değiştirme/devre dışı bırakma/silme işlemlerini yetkilendirir ve kayıt altına alır. Hesaplar TANIMLI ARALIKLARLA (en az yılda bir; ayrıcalıklı hesaplarda daha sık) gözden geçirilir; gereksiz veya artık ihtiyaç duyulmayan erişimler kaldırılır. Personel ayrılışında ilgili hesaplar tanımlı süre içinde devre dışı bırakılır.',
        translationTr:
            'Beklenen: periyodik erişim gözden geçirmesi kanıtlanabilir biçimde yapılır ve çıkan aksiyonlar (yetki kaldırma) uygulanır; ayrılışta hesap zamanında kapatılır.',
        scope: 'Kimlik ve erişim yönetimi, ayrıcalıklı hesaplar',
        role: 'relevant',
    },
    {
        stableKey: 'SC-13',
        unitCode: 'SC-13',
        unitType: 'control',
        title: 'Kriptografik Koruma (Cryptographic Protection)',
        originalText:
            'Kurum, tanımlı kullanımlar için kriptografiyi belirler ve uygular; kullanılan algoritma, protokol ve anahtar uzunlukları kurumun onaylı standartlarına uygun olmalıdır. Aktarım hâlindeki veri için güncel TLS sürümleri kullanılır, zayıf/eski protokol ve şifre takımları devre dışı bırakılır ve sunucu sertifikası doğrulaması istisnasız uygulanır.',
        translationTr:
            'Beklenen: kritik bağlantılarda TLS 1.2+ ve güçlü şifre takımları; istemci tarafında sertifika doğrulaması kapatılmamış.',
        scope: 'Aktarım güvenliği, TLS, sertifika',
        role: 'relevant',
    },
    {
        stableKey: 'AU-3',
        unitCode: 'AU-3',
        unitType: 'control',
        title: 'Denetim Kayıtlarının İçeriği (Content of Audit Records)',
        originalText:
            'Denetim kayıtları, olayı yeterince niteleyecek bilgiyi içerir: olayın türü, ne zaman olduğu (güvenilir bir zaman kaynağına göre), nerede olduğu, kaynağı ve OLAYLA İLİŞKİLİ KİMLİK (işlemi yapan kullanıcı/özne). Paylaşımlı veya belirsiz aktör alanları yeterli değildir.',
        translationTr:
            'Beklenen: kritik loglarda aktör (kim) ve doğru zaman damgası bulunur; saatler güvenilir kaynağa senkron.',
        scope: 'Loglama, aktör bilgisi, zaman senkronizasyonu',
        role: 'relevant',
    },
    {
        stableKey: 'CP-9',
        unitCode: 'CP-9',
        unitType: 'control',
        title: 'Sistem Yedekleme (System Backup)',
        originalText:
            'Kurum, kullanıcı ve sistem düzeyi bilgilerin yedeklerini tanımlı sıklıkta alır, yedeklerin gizliliğini/bütünlüğünü korur ve geri yükleme güvenilirliğini periyodik olarak test eder.',
        translationTr: 'Yedekleme ve geri yükleme testi ile ilgilidir — erişim gözden geçirme kontrolüyle DOĞRUDAN ilgisi yoktur.',
        scope: 'Yedekleme, süreklilik',
        role: 'irrelevant',
    },
    {
        stableKey: 'AC-2-CONFLICT-A',
        unitCode: 'AC-2 (yorum A)',
        unitType: 'clause',
        title: 'Erişim gözden geçirme sıklığı — yıllık yeterli (çelişki A)',
        originalText:
            'Erişim gözden geçirmelerinin YILDA BİR yapılması yeterlidir; ayrıcalıklı hesaplar dâhil tüm hesap türleri için yıllık döngü kabul edilir.',
        translationTr: 'Çelişkili kaynak A: yıllık gözden geçirmeyi yeterli sayar.',
        scope: 'Erişim gözden geçirme sıklığı',
        role: 'conflicting-a',
    },
    {
        stableKey: 'AC-2-CONFLICT-B',
        unitCode: 'AC-2 (yorum B)',
        unitType: 'clause',
        title: 'Erişim gözden geçirme sıklığı — ayrıcalıklıda çeyreklik (çelişki B)',
        originalText:
            'Ayrıcalıklı hesaplar için erişim gözden geçirmesi EN AZ ÇEYREKLİK yapılmalıdır; yıllık döngü ayrıcalıklı erişimler için yetersizdir.',
        translationTr: 'Çelişkili kaynak B: ayrıcalıklı hesaplarda çeyreklik gözden geçirme şart koşar.',
        scope: 'Erişim gözden geçirme sıklığı',
        role: 'conflicting-b',
    },
];
