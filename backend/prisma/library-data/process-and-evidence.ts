/**
 * BORSA SÜREÇ KAPSAM KARTLARI + KANIT YETERLİLİĞİ REHBERİ — kurum içi metodoloji
 * TASLAĞI (status=DRAFT). Kuruma özgü değerler (RTO/RPO, gecikme toleransı,
 * saklama süresi, işlem limiti) UYDURULMAZ; paramSpec içinde filledValue=null ile
 * "kurum dolduracak" parametreleri olarak tutulur.
 */

export interface ProcessCardSeed {
    code: string;
    title: string;
    area: 'trading' | 'market_data' | 'surveillance' | 'connectivity' | 'session' | 'clock_records';
    description: string;
    criticalAssets: string[];
    paramSpec: { key: string; label: string; unit: string; filledValue: null }[];
    /** İlişkili genel BT kontrol test kartı kodları (eşleştirme kütüphane ekranından kurulur). */
    linkedTestCardCodes: string[];
}

const P = (key: string, label: string, unit: string): { key: string; label: string; unit: string; filledValue: null } => ({
    key,
    label,
    unit,
    filledValue: null,
});

export const PROCESS_CARDS: ProcessCardSeed[] = [
    {
        code: 'SK-ISLEM-01',
        title: 'İşlem / emir sistemleri',
        area: 'trading',
        description:
            'Emir kabul, eşleştirme, işlem üretimi ve emir defteri hizmetlerinin bütünlüğü, erişilebilirliği ve yetkili erişimi. Kapsam yalnızca borsa işletmeciliği içindir; takas, saklama, merkezi karşı taraf ve işlem kayıt hizmetleri AYRI kapsamdır ve bu kart onları kapsamaz.',
        criticalAssets: ['Emir yönetim sistemi', 'Eşleştirme motoru', 'Emir defteri veri deposu', 'İşlem yayın arayüzü', 'Risk/limit kontrol bileşeni'],
        paramSpec: [
            P('rto_trading', 'İşlem sistemi kurtarma süresi hedefi (RTO)', 'dakika'),
            P('rpo_trading', 'İşlem verisi kurtarma noktası hedefi (RPO)', 'saniye'),
            P('order_ack_latency', 'Emir onay gecikme toleransı', 'milisaniye'),
            P('trade_record_retention', 'İşlem kaydı saklama süresi', 'yıl'),
            P('max_msg_rate', 'Kabul edilen azami mesaj/emir hızı', 'mesaj/sn'),
        ],
        linkedTestCardCodes: ['TK-BT-01', 'TK-BT-02', 'TK-BT-05', 'TK-BT-07', 'TK-BT-08', 'TK-BT-09'],
    },
    {
        code: 'SK-PVERI-01',
        title: 'Piyasa verisi dağıtımı',
        area: 'market_data',
        description:
            'Fiyat, derinlik ve işlem verisinin üyelere ve dış abonelere zamanında, eksiksiz ve adil (eşit erişim) dağıtımı. Veri bütünlüğü ve yayın sürekliliği önceliklidir.',
        criticalAssets: ['Piyasa verisi yayın motoru', 'Dağıtım ağ altyapısı', 'Abonelik/erişim yönetimi', 'Veri arşivi', 'Yeniden yayın (replay) hizmeti'],
        paramSpec: [
            P('md_dissemination_latency', 'Yayın gecikme toleransı', 'milisaniye'),
            P('md_availability_target', 'Yayın erişilebilirlik hedefi', 'yüzde'),
            P('md_gap_recovery_time', 'Veri boşluğu telafi süresi', 'saniye'),
            P('md_archive_retention', 'Piyasa verisi arşiv saklama süresi', 'yıl'),
        ],
        linkedTestCardCodes: ['TK-BT-04', 'TK-BT-05', 'TK-BT-08', 'TK-BT-09', 'TK-BT-12'],
    },
    {
        code: 'SK-GOZETIM-01',
        title: 'Gözetim (piyasa dürüstlüğü izleme) sistemleri',
        area: 'surveillance',
        description:
            'Manipülasyon, içeriden öğrenenlerin ticareti ve olağan dışı işlem tespiti için izleme sistemlerinin veri bütünlüğü, alarm üretimi ve erişim kısıtı. Gözetim verisine erişim hassas ve dar tutulmalıdır.',
        criticalAssets: ['Gözetim uygulaması', 'Alarm/senaryo motoru', 'Geçmiş işlem ve emir veri ambarı', 'Vaka yönetim modülü', 'Referans veri (üye/hesap eşleştirme)'],
        paramSpec: [
            P('surv_data_completeness_check', 'Veri eksiksizlik mutabakat sıklığı', 'gün'),
            P('surv_alert_review_sla', 'Alarm inceleme SLA süresi', 'iş günü'),
            P('surv_data_retention', 'Gözetim verisi saklama süresi', 'yıl'),
        ],
        linkedTestCardCodes: ['TK-BT-01', 'TK-BT-05', 'TK-BT-10', 'TK-BT-11'],
    },
    {
        code: 'SK-BAGLANTI-01',
        title: 'Üye ve dış sistem bağlantıları',
        area: 'connectivity',
        description:
            'Üyelerin ve dış kurumların (veri sağlayıcı, düzenleyici, altyapı kuruluşları) borsa sistemlerine bağlantı noktalarının kimlik doğrulaması, yetkilendirmesi, izolasyonu ve izlenmesi.',
        criticalAssets: ['Üye erişim ağ geçidi (gateway)', 'FIX/protokol oturum yöneticisi', 'Sınır güvenlik duvarı ve IPS', 'Bağlantı sertifika/anahtar altyapısı', 'Bağlantı izleme/telemetri'],
        paramSpec: [
            P('conn_session_idle_timeout', 'Oturum boşta kalma zaman aşımı', 'dakika'),
            P('conn_cert_renewal_lead', 'Sertifika yenileme öncesi uyarı süresi', 'gün'),
            P('conn_ddos_mitigation_time', 'Aşırı trafik/DDoS azaltma tepki süresi', 'dakika'),
        ],
        linkedTestCardCodes: ['TK-BT-02', 'TK-BT-03', 'TK-BT-04', 'TK-BT-05', 'TK-BT-12'],
    },
    {
        code: 'SK-SEANS-01',
        title: 'Seans açılış / kapanış süreçleri',
        area: 'session',
        description:
            'Seans durum geçişlerinin (açılış öncesi, sürekli işlem, kapanış eşleşmesi, seans sonu) yetkili, doğrulanabilir ve geri alınabilir biçimde yürütülmesi; manuel müdahalelerin loglanması.',
        criticalAssets: ['Seans durum yönetim bileşeni', 'Açılış/kapanış fiyatı hesaplama modülü', 'Operatör kontrol paneli', 'Seans olay logu', 'Fiyat/işlem yayını'],
        paramSpec: [
            P('session_transition_window', 'Durum geçişi için izin verilen zaman penceresi', 'dakika'),
            P('manual_intervention_approval_sla', 'Manuel müdahale onay süresi', 'dakika'),
            P('session_log_retention', 'Seans olay logu saklama süresi', 'yıl'),
        ],
        linkedTestCardCodes: ['TK-BT-01', 'TK-BT-05', 'TK-BT-07'],
    },
    {
        code: 'SK-ZAMAN-01',
        title: 'Kritik işlem kayıtları ve zaman senkronizasyonu',
        area: 'clock_records',
        description:
            'Emir ve işlem kayıtlarının değiştirilemez biçimde saklanması, zaman damgalarının güvenilir bir zaman kaynağına senkronize edilmesi ve düzenleyiciye raporlama için bütünlük güvencesi.',
        criticalAssets: ['İşlem/emir kayıt deposu (WORM/immutable)', 'Zaman sunucusu (NTP/PTP) altyapısı', 'Zaman damgası doğrulama bileşeni', 'Düzenleyici raporlama arayüzü', 'Kayıt bütünlük/hash kanıtı'],
        paramSpec: [
            P('clock_sync_tolerance', 'Kabul edilen azami saat sapması', 'milisaniye'),
            P('record_immutability_method', 'Kayıt değiştirilemezlik yöntemi', 'metin'),
            P('regulatory_report_retention', 'Düzenleyici kayıt saklama süresi', 'yıl'),
        ],
        linkedTestCardCodes: ['TK-BT-05', 'TK-BT-08'],
    },
];

// ─── Kanıt yeterliliği rehberi ─────────────────────────────────────────────
export interface EvidenceRuleSeed {
    code: string;
    category: 'distinction' | 'dimension';
    title: string;
    rule: string;
    goodExample?: string;
    badExample?: string;
    scoringSpec?: unknown;
    orderNo: number;
}

export const EVIDENCE_RULES: EvidenceRuleSeed[] = [
    {
        code: 'KY-A1',
        category: 'distinction',
        title: 'Beyan ile doğrulayıcı kanıt',
        rule: 'Kontrol sahibinin ya da bir yöneticinin "yapılıyor / uygundur" ifadesi BEYANDIR; tek başına kontrolün işlediğini kanıtlamaz. Doğrulayıcı kanıt, kontrolün fiilen yürütüldüğünü gösteren, kontrolden bağımsız üretilmiş çıktıdır (sistem logu, onay izi, üretim kaydı).',
        goodExample: 'Dizin hizmetinden çekilmiş, gözden geçirme dönemini kapsayan kullanıcı-rol dökümü ve gözden geçirmeye ait onay iş akışı kaydı.',
        badExample: 'İç kontrol sorumlusunun "erişim gözden geçirmeleri her çeyrek yapılıyor" yazılı yanıtı.',
        orderNo: 1,
    },
    {
        code: 'KY-A2',
        category: 'distinction',
        title: 'Kontrol tasarımı ile işleyiş etkinliği',
        rule: 'Bir prosedürün, politikanın veya sistem ayarının VAR OLMASI kontrolün TASARIMIDIR. İşleyiş etkinliği, kontrolün ilgili dönem boyunca TUTARLI biçimde uygulandığını gösteren kanıt gerektirir. Tasarım yeterli ama işleyiş kanıtı yoksa sonuç "doğrulanamadı"dır.',
        goodExample: 'Yama SLA politikası + dönem boyunca bulgu bazında keşif/giderme tarihleri gösteren tarama çıktıları.',
        badExample: 'Yalnızca "Yama Yönetimi Prosedürü v2.1" dokümanı.',
        orderNo: 2,
    },
    {
        code: 'KY-A3',
        category: 'distinction',
        title: 'Tek ekran görüntüsü ile dönemsel çalışma',
        rule: 'Tek bir tarihe ait ekran görüntüsü, yalnızca o an için bir durumu gösterir. Kontrolün DÖNEM BOYUNCA çalıştığını kanıtlamak için dönemi kapsayan kayıt (log, iş geçmişi, periyodik çıktı) gerekir.',
        goodExample: 'Yedek işlerinin dönem boyunca günlük başarı/başarısızlık logları.',
        badExample: 'Yedek yazılımının bugünkü "son yedek başarılı" ekranının fotoğrafı.',
        orderNo: 3,
    },
    {
        code: 'KY-A4',
        category: 'distinction',
        title: 'Örneklem sonucu ile tüm evrene ilişkin sonuç',
        rule: 'Örneklem üzerinden yapılan test, yalnızca test edilen kalemler için kesin sonuç verir; evrenin tamamı için ancak örnekleme yöntemi (evren, büyüklük, seçim) belgelendiğinde makul güvence sağlar. "5 kullanıcıya baktım, sorun yok" ifadesi "tüm erişimler uygun" anlamına gelmez.',
        goodExample: '210 kişilik evrenden rastgele 25 kullanıcı; seçim yöntemi ve evren dökümü ekli; 25’inde de yetki görev tanımıyla uyumlu.',
        badExample: 'Denetçinin "birkaç kullanıcıya baktım, hepsi uygundu" notu.',
        orderNo: 4,
    },
    {
        code: 'KY-A5',
        category: 'distinction',
        title: 'Kanıt yokluğu ile kontrol eksikliği',
        rule: 'İstenen kanıtın sağlanamaması, kontrolün OLMADIĞI anlamına gelmez; sonuç "doğrulanamadı" olur ve eksik kanıt talep edilir. Kontrolün fiilen mevcut olmadığı (tasarım eksikliği) ancak pozitif bir tespitle söylenebilir.',
        goodExample: '"Geri yükleme testi kaydı talep edildi, sağlanamadı → doğrulanamadı; şu kanıt gerekli: ..."',
        badExample: '"Geri yükleme testi kanıtı gelmedi → kontrol yok → uyumsuzluk."',
        orderNo: 5,
    },
    {
        code: 'KY-A6',
        category: 'distinction',
        title: 'Teknik eksiklik ile mevzuat ihlali',
        rule: 'Bir teknik zayıflık (ör. eski TLS sürümü) otomatik olarak mevzuat ihlali DEĞİLDİR. Mevzuat ihlali, ilgili düzenlemenin bir maddesinin/gerekliliğinin karşılanmadığının, o madde referansıyla gösterilmesini gerektirir. Madde eşleştirmesi doğrulanamıyorsa "teknik bulgu" olarak sınıflandır, "mevzuata aykırı" deme.',
        goodExample: 'Uyumsuzluk: X sistemi Y verisini şifrelemeden aktarıyor → {mevzuat} md. Z (veri güvenliği) gereğini karşılamıyor (madde metni ekli).',
        badExample: 'Zayıf parola politikası bulundu → "mevzuata aykırılık".',
        orderNo: 6,
    },
    {
        code: 'KY-D1',
        category: 'dimension',
        title: 'İlgililik',
        rule: 'Kanıt, test edilen kontrol amacına ve adımına doğrudan hitap ediyor mu? İlgisiz/dolaylı kanıt puanı düşürür.',
        scoringSpec: { weight: 0.2, scale: '0=ilgisiz, 1=kısmen, 2=doğrudan ilgili' },
        orderNo: 10,
    },
    {
        code: 'KY-D2',
        category: 'dimension',
        title: 'Dönem uygunluğu',
        rule: 'Kanıtın tarihi/aralığı değerlendirme dönemini kapsıyor mu? Dönem dışı kanıt sonuç için yeterli değildir.',
        scoringSpec: { weight: 0.2, scale: '0=dönem dışı, 1=kısmen kapsıyor, 2=tam kapsıyor' },
        orderNo: 11,
    },
    {
        code: 'KY-D3',
        category: 'dimension',
        title: 'Sistem / kapsam eşleşmesi',
        rule: 'Kanıt, kontrolün uygulandığı sistemi/varlık kümesini mi gösteriyor, yoksa farklı bir ortamı mı? Test ortamı kanıtı üretim kontrolünü kanıtlamaz.',
        scoringSpec: { weight: 0.2, scale: '0=farklı kapsam, 1=kısmi, 2=tam eşleşme' },
        orderNo: 12,
    },
    {
        code: 'KY-D4',
        category: 'dimension',
        title: 'Bütünlük / eksiksizlik',
        rule: 'Kanıt kırpılmış, filtrelenmiş veya seçili mi? Tam döküm ile "gösterilmek istenen kısım" arasındaki fark puanı etkiler.',
        scoringSpec: { weight: 0.15, scale: '0=seçili/kırpık, 1=çoğu var, 2=tam' },
        orderNo: 13,
    },
    {
        code: 'KY-D5',
        category: 'dimension',
        title: 'Okunabilirlik',
        rule: 'Kanıt makine/insan tarafından okunup değerlendirilebiliyor mu (net, çözünür, dili anlaşılır)? Okunamayan kanıt "doğrulanamadı" sonucunu destekler.',
        scoringSpec: { weight: 0.1, scale: '0=okunamıyor, 1=kısmen, 2=net' },
        orderNo: 14,
    },
    {
        code: 'KY-D6',
        category: 'dimension',
        title: 'Kaynak izlenebilirliği',
        rule: 'Kanıtın kimin, hangi sistemden, ne zaman ürettiği belli mi? Kaynağı belirsiz kanıtın güvence değeri düşüktür.',
        scoringSpec: { weight: 0.1, scale: '0=kaynak belirsiz, 1=kısmen, 2=tam izlenebilir' },
        orderNo: 15,
    },
    {
        code: 'KY-D7',
        category: 'dimension',
        title: 'Çelişki',
        rule: 'Kanıt diğer kanıtlarla veya kontrol beyanıyla çelişiyor mu? Çelişki giderilmeden "karşılandı" denemez; sonuç "çelişkili"dir.',
        scoringSpec: { weight: 0.05, scale: '0=açık çelişki, 1=belirsiz, 2=tutarlı', note: 'Çelişki tespiti sonucu KARARI CELISKILI yapar; ağırlıklı puandan bağımsız veto.' },
        orderNo: 16,
    },
];

// Sayısal puanlama (opsiyonel): ağırlıklı ortalama.
export const SCORING_MODEL = {
    method: 'weighted_average',
    formula: 'skor = Σ(boyut_puanı/2 × ağırlık); 0..1 aralığında',
    thresholds: { met: '>= 0.80 ve KY-D7 vetosu yok', partial: '0.50 – 0.79', notMetOrInconclusive: '< 0.50' },
    note: 'Sayısal skor YALNIZCA boyut puanları ve ağırlıkları gösterildiğinde üretilir. Modelin öznel güven yüzdesi doğruluk olasılığı olarak SUNULMAZ.',
};
