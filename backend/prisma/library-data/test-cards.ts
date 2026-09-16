/**
 * 12 KONTROL TEST KARTI — kurum içi denetim metodolojisi TASLAĞI.
 * Bunlar resmî standart veya kurum politikası DEĞİLDİR (origin=AI_DRAFT,
 * status=DRAFT). Standart referansları metinde ADLA anılır; kaynak birim
 * eşleştirmesi ilgili standart kütüphaneye ingest edildikten sonra kurulur
 * ("eşleştirme bekliyor").
 */
export interface TestCardSeed {
    code: string;
    topicNo: number;
    title: string;
    purposeRisk: string;
    scopePrereq: string;
    method: string;
    steps: { no: number; text: string }[];
    expectedState: string;
    requestedEvidence: string[];
    evidenceSufficiency: string;
    decisionCriteria: { met: string; notMet: string; inconclusive: string; conflicting: string };
    misleadingSignals: string;
    sampleControlResult: string;
    sampleEvidenceRequest: string;
    /** Bilgi amaçlı — eşleştirme bu standart birimlerine kurulmalı (henüz ingest yok). */
    suggestedSourceRefs: string[];
}

const D = {
    met: 'Test adımlarının tamamı, dönemi ve kapsamı uygun doğrulayıcı kanıtla karşılandı; istisna yoksa veya istisnalar telafi edici kontrolle kapatıldıysa.',
    notMet: 'Bir veya daha fazla adım için beklenen durum sağlanmadı ve telafi edici kontrol gösterilemedi; ya da kontrol tasarımı gereksinimi karşılamıyor.',
    inconclusive: 'Kanıt eksik, okunamıyor, dönem/kapsam dışı ya da yalnızca beyan niteliğinde; sonuç için ek kanıt gerekli.',
    conflicting: 'Kanıtlar birbiriyle çelişiyor (ör. politika X derken sistem çıktısı Y gösteriyor); çelişki giderilmeden karar verilemez.',
};

export const TEST_CARDS: TestCardSeed[] = [
    {
        code: 'TK-BT-01',
        topicNo: 1,
        title: 'Kullanıcı yaşam döngüsü ve periyodik yetki gözden geçirme',
        purposeRisk:
            'Amaç: İşe alım, görev değişikliği ve işten ayrılışta erişim haklarının zamanında verildiğini/kaldırıldığını ve kritik sistemlerde periyodik yetki gözden geçirmesinin fiilen yapıldığını doğrulamak. Risk: Artık ihtiyaç duyulmayan (yetim/aşırı) erişimler yetkisiz işlem, veri sızıntısı ve görevler ayrılığı ihlali riskini artırır.',
        scopePrereq:
            'Kapsam: Kritik borsa ve kurumsal sistemler (dizin hizmeti, işlem/emir sistemi, veritabanları, uygulama rolleri). Önkoşul: Gözden geçirme döneminin İK hareket listesi, sistem kullanıcı envanteri ve varsa rol-yetki matrisi.',
        method: 'İnceleme + yeniden gerçekleştirme (re-performance) + görüşme. İK ayrılış kayıtları ile sistemdeki hesap durumları çapraz eşleştirilir; gözden geçirme kanıtı (imza/onay/ticket) incelenir; bir örnek gözden geçirme adım adım yeniden yürütülür.',
        steps: [
            { no: 1, text: 'Dönem içindeki tüm işten ayrılanların İK listesini al; her biri için hedef sistemlerdeki hesabın devre dışı bırakılma/silinme tarihini tespit et.' },
            { no: 2, text: 'Ayrılış tarihi ile hesap kapatma tarihi arasındaki gün farkını hesapla; kurum SLA’sı ile karşılaştır (parametre — kurum dolduracak).' },
            { no: 3, text: 'Dönemde tanımlı periyodik yetki gözden geçirmesinin planlandığı tarihte gerçekten yapıldığını, kimin yaptığını ve onayladığını kanıtla doğrula.' },
            { no: 4, text: 'Gözden geçirmede "kaldırılacak" işaretlenen yetkiler için, ilgili kaldırma işleminin sistemde uygulandığını (değişiklik kaydı) doğrula.' },
            { no: 5, text: 'Bir örnek kullanıcı için mevcut yetkilerin güncel görev tanımıyla uyumlu olduğunu, örneklem seçim yöntemini belgeleyerek kontrol et.' },
        ],
        expectedState:
            'Ayrılanların erişimi tanımlı süre içinde kaldırılmış; periyodik gözden geçirme planlanan dönemde bağımsız bir onaylayanla yapılmış; gözden geçirme çıktısındaki aksiyonlar kapatılmış; örneklemde aşırı yetki yok.',
        requestedEvidence: [
            'Dönemin İK işe giriş/çıkış/görev değişikliği listesi (tarihli)',
            'Hedef sistemlerin dönem başı ve dönem sonu kullanıcı/rol dökümü',
            'Periyodik yetki gözden geçirme kaydı: kapsam, tarih, yapan, onaylayan, sonuç',
            'Gözden geçirmede kaldırılması kararlaştırılan yetkiler için değişiklik/işlem kaydı',
            'Rol-yetki matrisi veya görev tanımları (örneklem karşılaştırması için)',
        ],
        evidenceSufficiency:
            'Yeterli: sistem tarafından üretilmiş, tarihli, dönemi kapsayan kullanıcı dökümleri + gözden geçirmeye ait onay izi + kaldırma işlemlerinin bağımsız kaydı. Yetersiz: yalnızca "gözden geçirme yapıldı" beyanı, tarihsiz ekran görüntüsü, yalnızca dönem dışı bir döküm, ya da yalnızca gözden geçirme sunumu (uygulama kanıtı olmadan).',
        decisionCriteria: D,
        misleadingSignals:
            'Hesabın "pasif" görünmesi silinmiş anlamına gelmez (yeniden etkinleştirilebilir). Gözden geçirme dosyasının tarihi ile onay tarihinin aynı gün ve toplu olması "göstermelik" olabilir. Ayrılan kişinin hesabı kapalı ama aynı kişinin ikinci/servis hesabı açık olabilir. Dizin hizmetinde kapalı hesap uygulama katmanında hâlâ yetkili olabilir.',
        sampleControlResult:
            'Sunulan kanıtlar, ayrıcalıklı olmayan kullanıcı erişimlerinin kaldırılmasının {dönem} döneminde büyük ölçüde işlediğini; ancak 12 ayrılıştan 3’ünde hesabın kurum SLA’sını aşan sürede (ort. X gün) kapatıldığını ve periyodik gözden geçirmenin planlanan tarihten sonra yapıldığını göstermektedir.',
        sampleEvidenceRequest:
            'Aşağıdaki kanıtlar eksik/yetersiz:\n• {dönem} için hedef sistemlerin dönem sonu kullanıcı dökümü (sistem üretimi, tarihli)\n• Gözden geçirmede kaldırılması kararlaştırılan yetkilerin uygulandığını gösteren değişiklik kayıtları\n• Erişim kaldırma SLA süresinin kurum tarafından tanımlanmış değeri',
        suggestedSourceRefs: ['NIST SP 800-53 AC-2, AC-6, PS-4, PS-5', 'NIST SP 800-53A AC-2 assessment', 'NIST CSF 2.0 PR.AA'],
    },
    {
        code: 'TK-BT-02',
        topicNo: 2,
        title: 'Ayrıcalıklı ve servis hesapları',
        purposeRisk:
            'Amaç: Yönetici/kök ve servis (uygulamalar arası) hesaplarının envanterinin, sahipliğinin, erişim gerekçesinin ve etkinlik izlemesinin bulunduğunu doğrulamak. Risk: Sahipsiz veya izlenmeyen ayrıcalıklı hesaplar tespit edilemeyen kötüye kullanım ve yanal hareket için birincil vektördür.',
        scopePrereq:
            'Kapsam: İşletim sistemi yönetici hesapları, veritabanı sa/root, dizin hizmeti ayrıcalıklı grupları, uygulama süper-kullanıcıları ve servis hesapları. Önkoşul: Ayrıcalıklı hesap envanteri, PAM/kasa kayıtları (varsa), grup üyelik dökümleri.',
        method: 'İnceleme + yeniden gerçekleştirme. Envanter ile sistemlerden çekilen gerçek ayrıcalıklı grup üyelikleri karşılaştırılır; her hesap için sahip, gerekçe ve son kullanım incelenir; interaktif giriş yapabilen servis hesapları tespit edilir.',
        steps: [
            { no: 1, text: 'Ayrıcalıklı hesap envanterini al; her sistemden ayrıcalıklı grup/rol üyeliğinin güncel dökümünü çek ve envanterle karşılaştır (eksik/fazla kayıt).' },
            { no: 2, text: 'Her ayrıcalıklı ve servis hesabı için tanımlı bir sahip (kişi) ve iş gerekçesi bulunduğunu doğrula.' },
            { no: 3, text: 'Servis hesaplarının parola/anahtar rotasyon politikasına tabi olduğunu ve interaktif oturum açmasının kısıtlandığını kontrol et.' },
            { no: 4, text: 'Ayrıcalıklı erişimlerin loglandığını ve bu logların bağımsız gözden geçirmeye tabi olduğunu doğrula (bkz. TK-BT-05).' },
            { no: 5, text: 'Son N gün içinde hiç kullanılmamış ayrıcalıklı hesapları tespit et ve gerekçesini sor.' },
        ],
        expectedState:
            'Tüm ayrıcalıklı/servis hesapları envanterde; her birinin sahibi ve gerekçesi var; servis hesapları interaktif giriş yapamıyor ve rotasyona tabi; ayrıcalıklı kullanım loglanıyor; atıl hesap yok veya gerekçelendirilmiş.',
        requestedEvidence: [
            'Ayrıcalıklı hesap ve servis hesabı envanteri (sahip, gerekçe, oluşturma tarihi)',
            'Her hedef sistemden ayrıcalıklı grup/rol üyelik dökümü (tarihli, sistem üretimi)',
            'Servis hesabı parola/anahtar rotasyon politikası ve son rotasyon kayıtları',
            'Ayrıcalıklı hesaplarda interaktif giriş kısıtlama ayarının kanıtı',
            'Ayrıcalıklı oturum logları örneği ve gözden geçirme kaydı',
        ],
        evidenceSufficiency:
            'Yeterli: sistemden çekilmiş güncel üyelik dökümleri + envanterle mutabakat + rotasyon kayıtları. Yetersiz: elle tutulan ve güncelliği doğrulanamayan envanter, tek seferlik ekran görüntüsü, "rotasyon yapılıyor" beyanı.',
        decisionCriteria: D,
        misleadingSignals:
            'PAM kasasında görünen hesap sayısı ile dizindeki gerçek ayrıcalıklı üyelik farklı olabilir (kasa dışı hesaplar). "Servis hesabı" adlandırması gerçekte bir kişinin kullandığı paylaşımlı hesabı gizleyebilir. Yerleşik yönetici hesabının yeniden adlandırılması onu ayrıcalıksız yapmaz.',
        sampleControlResult:
            'Sunulan kanıtlar, ayrıcalıklı hesap yönetiminin kısmen etkin olduğunu; envanterdeki 40 hesabın 6’sının hedef sistem dökümünde bulunmadığını (fazla kayıt), 4 servis hesabının interaktif giriş yapabildiğini ve 3 hesabın 180 günden uzun süredir kullanılmadığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• {dönem} için dizin hizmeti ve veritabanı ayrıcalıklı üyelik dökümleri\n• Servis hesaplarının son 12 ay parola/anahtar rotasyon kayıtları\n• Atıl (>90 gün) ayrıcalıklı hesaplar için iş gerekçesi',
        suggestedSourceRefs: ['NIST SP 800-53 AC-2(7), AC-6(5), IA-5', 'NIST CSF 2.0 PR.AA-05', 'CPMI-IOSCO — Protection'],
    },
    {
        code: 'TK-BT-03',
        topicNo: 3,
        title: 'Parola ve kimlik doğrulama',
        purposeRisk:
            'Amaç: Parola politikası ve çok faktörlü kimlik doğrulamanın (MFA) kritik sistemlerde tasarlandığı gibi zorlandığını doğrulamak. Risk: Zayıf/paylaşılan kimlik bilgileri ve MFA boşlukları hesap ele geçirme riskini doğrudan artırır.',
        scopePrereq:
            'Kapsam: Dizin hizmeti, VPN/uzaktan erişim, ayrıcalıklı erişim, kritik uygulamaların kimlik doğrulaması. Önkoşul: Parola politikası ayar dökümleri, MFA kapsam listesi, kimlik doğrulama logları.',
        method: 'İnceleme + yeniden gerçekleştirme. Politika ayarlarının gerçek sistem konfigürasyonundan okunması; MFA’nın kapsanan tüm giriş yollarında zorlandığının bir test hesabıyla (uygun ortamda) veya loglardan doğrulanması.',
        steps: [
            { no: 1, text: 'Parola politikası parametrelerini (uzunluk, karmaşıklık/geçmiş, kilitleme, süre) hedef sistemlerin gerçek konfigürasyon çıktısından oku.' },
            { no: 2, text: 'MFA zorunlu tutulan kullanıcı/erişim yolu kapsamını al; kapsam dışı bırakılanların gerekçesini incele.' },
            { no: 3, text: 'Uzaktan erişim ve ayrıcalıklı erişim için MFA’nın istisnasız zorlandığını loglardan veya konfigürasyondan doğrula.' },
            { no: 4, text: 'Paylaşılan/genel hesapların kimlik doğrulamada kullanılıp kullanılmadığını kontrol et.' },
            { no: 5, text: 'Servis hesaplarında ve API kimlik doğrulamasında sır yönetiminin (kasa, kısa ömür) uygulandığını doğrula.' },
        ],
        expectedState:
            'Politika parametreleri kurum standardını karşılıyor ve tüm hedef sistemlerde teknik olarak zorlanıyor; MFA kritik ve uzaktan erişimde istisnasız aktif; paylaşılan hesapla kimlik doğrulama yok.',
        requestedEvidence: [
            'Her hedef sistemin parola politikası konfigürasyon çıktısı (sistem üretimi, tarihli)',
            'MFA kapsam listesi ve kapsam dışı istisnalar + gerekçeleri',
            'Uzaktan/ayrıcalıklı erişim için MFA zorlandığını gösteren konfigürasyon veya log örneği',
            'Kimlik doğrulama başarısızlık/kilitleme logları örneği',
        ],
        evidenceSufficiency:
            'Yeterli: doğrudan sistemden okunan konfigürasyon + MFA kapsamının tam listesi + istisna gerekçeleri. Yetersiz: politika DOKÜMANI (uygulandığı kanıtı olmadan), "MFA var" ifadesi, yalnızca bir kullanıcının ekran görüntüsü.',
        decisionCriteria: D,
        misleadingSignals:
            'Politikanın dizinde tanımlı olması alt sistemlerde (yerel hesaplar, eski uygulamalar) geçerli olduğu anlamına gelmez. "MFA etkin" ayarı bazı eski protokoller (legacy auth) için baypas edilebilir. Bir kullanıcının MFA’lı girişi tüm kullanıcıların MFA’lı olduğunu göstermez.',
        sampleControlResult:
            'Sunulan kanıtlar, parola politikasının dizin hizmetinde kurum standardıyla uyumlu olduğunu; ancak 2 eski uygulamanın yerel kimlik doğrulama kullandığını ve VPN dışındaki bir uzaktan yönetim arayüzünde MFA’nın zorlanmadığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Eski uygulamaların kimlik doğrulama yöntemi ve parola politikası çıktısı\n• Tüm uzaktan erişim yollarının (VPN, bastion, yönetim panelleri) MFA kapsam kanıtı',
        suggestedSourceRefs: ['NIST SP 800-53 IA-2, IA-5', 'NIST CSF 2.0 PR.AA-03', 'OWASP ASVS V2 (Authentication)'],
    },
    {
        code: 'TK-BT-04',
        topicNo: 4,
        title: 'TLS ve sertifika doğrulaması',
        purposeRisk:
            'Amaç: Kritik iç ve dış bağlantılarda güncel TLS sürümlerinin kullanıldığını, sertifikaların geçerli/doğrulandığını ve zayıf şifre takımlarının kapatıldığını doğrulamak. Risk: Zayıf TLS veya doğrulanmayan sertifikalar araya girme (MITM) ve veri sızıntısı riskini artırır.',
        scopePrereq:
            'Kapsam: Üye/dış sistem bağlantıları, piyasa verisi dağıtımı, yönetim arayüzleri, uygulamalar arası çağrılar. Önkoşul: Bağlantı envanteri, TLS tarama/konfigürasyon çıktıları, sertifika envanteri.',
        method: 'İnceleme + teknik test. TLS yapılandırma taraması (kurum aracıyla) sonuçlarının incelenmesi; sertifika geçerlilik, zincir ve iptal kontrolü; istemci tarafında sunucu sertifikası doğrulamasının açık olduğunun kod/konfigürasyondan teyidi.',
        steps: [
            { no: 1, text: 'Kritik bağlantı envanterini al; her uç nokta için desteklenen TLS sürümleri ve şifre takımlarının taranmış çıktısını incele.' },
            { no: 2, text: 'TLS 1.2 altı sürümlerin ve zayıf/anonim şifre takımlarının kapalı olduğunu doğrula.' },
            { no: 3, text: 'Sertifikaların son kullanma tarihi, ortak ad/SAN uyumu ve güvenilir zincir durumunu kontrol et; kısa süre içinde dolacakları listele.' },
            { no: 4, text: 'İstemci uygulamalarında sunucu sertifikası doğrulamasının devre dışı bırakılmadığını (ör. "verify=false", "trust all") kod/konfigürasyondan doğrula.' },
            { no: 5, text: 'Sertifika yönetiminin (yenileme, iptal, özel anahtar koruması) tanımlı bir süreçle yürütüldüğünü incele.' },
        ],
        expectedState:
            'Tüm kritik uç noktalar TLS 1.2+ ve güçlü şifre takımları kullanıyor; sertifikalar geçerli ve doğrulanıyor; istemci doğrulaması hiçbir yerde kapatılmamış; yenileme süreci işliyor.',
        requestedEvidence: [
            'Kritik uç nokta bağlantı envanteri',
            'TLS tarama/konfigürasyon çıktıları (araç adı, tarih, kapsam)',
            'Sertifika envanteri (uç nokta, veren, geçerlilik, SAN)',
            'İstemci tarafı sertifika doğrulama ayarının kod/konfigürasyon kanıtı',
            'Sertifika yönetim prosedürü ve son yenileme kayıtları',
        ],
        evidenceSufficiency:
            'Yeterli: dönemi kapsayan otomatik tarama çıktısı + sertifika envanteri + istemci doğrulama kanıtı. Yetersiz: tek bir uç noktanın tarayıcı ekran görüntüsü, "hepsi TLS 1.3" beyanı, tarih içermeyen tarama.',
        decisionCriteria: D,
        misleadingSignals:
            'Dış yük dengeleyicide TLS güçlü olsa da arka uç (backend) düz metin olabilir. Bir uç noktanın güçlü olması envanterin tamamını temsil etmez. Sertifika geçerli görünse de istemci doğrulaması kapalıysa koruma yoktur. Kendinden imzalı iç sertifikalar "geçersiz" görünebilir ama bilinçli tasarım olabilir — gerekçe sorulmalı.',
        sampleControlResult:
            'Sunulan kanıtlar, dışa dönük uç noktalarda TLS yapılandırmasının güçlü olduğunu; ancak iki uygulamalar-arası bağlantının TLS 1.0’a izin verdiğini ve bir toplu iş istemcisinde sunucu sertifikası doğrulamasının kapatıldığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Uygulamalar-arası (iç) bağlantıların TLS tarama çıktıları\n• Toplu iş / entegrasyon istemcilerinin sertifika doğrulama ayarları\n• 60 gün içinde dolacak sertifikaların yenileme planı',
        suggestedSourceRefs: ['NIST SP 800-53 SC-8, SC-12, SC-13, SC-17', 'NIST CSF 2.0 PR.DS-02', 'OWASP ASVS V9 (Communication)'],
    },
    {
        code: 'TK-BT-05',
        topicNo: 5,
        title: 'Log kapsamı, aktör bilgisi ve zaman senkronizasyonu',
        purposeRisk:
            'Amaç: Kritik sistemlerde güvenlik olaylarının, aktör (kim) ve doğru zaman damgasıyla loglandığını, logların bütünlüğünün korunduğunu ve saatlerin güvenilir bir kaynağa senkronize olduğunu doğrulamak. Risk: Eksik/aktörü belirsiz/zamanı kaymış loglar olay incelemesini ve kanıt değerini yok eder.',
        scopePrereq:
            'Kapsam: Kimlik doğrulama, ayrıcalıklı işlem, yapılandırma değişikliği, işlem/emir kayıtları, güvenlik cihazları. Önkoşul: Log kaynağı envanteri, SIEM/log toplama konfigürasyonu, NTP yapılandırması, saklama politikası.',
        method: 'İnceleme + yeniden gerçekleştirme. Log kaynağı envanteri ile SIEM’e fiilen gelen kaynakların karşılaştırılması; örnek olaylarda aktör ve zaman alanlarının doluluğu; NTP kaynağı ve sapma ölçümü; log bütünlüğü (değiştirilemezlik) kontrolü.',
        steps: [
            { no: 1, text: 'Log üretmesi beklenen kritik sistem envanterini al; SIEM/toplayıcıya son 30 günde veri gönderen kaynak listesiyle karşılaştır (sessiz kaynaklar).' },
            { no: 2, text: 'Kimlik doğrulama, ayrıcalıklı işlem ve yapılandırma değişikliği için birer örnek log kaydında aktör kimliği, kaynak IP ve zaman damgası alanlarının dolu olduğunu doğrula.' },
            { no: 3, text: 'Zaman damgalarının zaman dilimi ve NTP senkronizasyon durumunu kontrol et; kritik sunucularda saat sapmasını ölç (parametre — tolerans kurum dolduracak).' },
            { no: 4, text: 'Logların yetkisiz değiş/silmeye karşı korunduğunu (WORM, ayrı hesap, hash zinciri vb.) doğrula.' },
            { no: 5, text: 'Log saklama süresinin kurum politikası ve ilgili düzenleme beklentileriyle uyumlu olduğunu kontrol et.' },
        ],
        expectedState:
            'Tüm kritik kaynaklar merkezi log platformuna aktif gönderim yapıyor; olay kayıtlarında aktör ve doğru zaman damgası var; saatler tolerans içinde senkronize; loglar değiştirilemez; saklama süresi karşılanıyor.',
        requestedEvidence: [
            'Log kaynağı envanteri ve SIEM’e gelen aktif kaynak listesi (son 30 gün)',
            'Örnek log kayıtları: kimlik doğrulama, ayrıcalıklı işlem, yapılandırma değişikliği',
            'NTP yapılandırması ve kritik sunucularda saat sapma ölçümü',
            'Log bütünlüğü koruması kanıtı (WORM/hash/erişim ayrımı)',
            'Log saklama politikası ve fiili saklama süresi kanıtı',
        ],
        evidenceSufficiency:
            'Yeterli: kaynak-SIEM mutabakatı + gerçek log örnekleri + NTP/sapma ölçüm çıktısı. Yetersiz: "her şey loglanıyor" beyanı, SIEM arayüzünün genel ekran görüntüsü, tek bir kaynağın logu.',
        decisionCriteria: D,
        misleadingSignals:
            'SIEM’de kaynak "tanımlı" olması veri geldiği anlamına gelmez (son olay tarihi kontrol edilmeli). Zaman damgası yerel saat olabilir ve UTC sanılabilir. "admin" gibi paylaşılan aktör alanı gerçek kişiyi göstermez. Log hacminin yüksek olması kapsamın doğru olduğunu göstermez.',
        sampleControlResult:
            'Sunulan kanıtlar, merkezi loglamanın büyük ölçüde işlediğini; ancak envanterdeki 25 kaynaktan 4’ünün son 30 günde SIEM’e veri göndermediğini, iki veritabanı sunucusunda saatin toleransı aşan sapma gösterdiğini ve yapılandırma değişikliği loglarında aktör alanının bir sistemde boş kaldığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Sessiz log kaynakları için son olay tarihleri ve gerekçe\n• Kritik sunucuların NTP sapma ölçüm çıktısı ve kurum tolerans değeri\n• Yapılandırma değişikliği loglarında aktör alanının doluluğunu gösteren örnekler',
        suggestedSourceRefs: ['NIST SP 800-53 AU-2, AU-3, AU-6, AU-8, AU-9, AU-11', 'NIST CSF 2.0 DE.AE, PR.PS-04', 'CPMI-IOSCO — Detection'],
    },
    {
        code: 'TK-BT-06',
        topicNo: 6,
        title: 'Yama, zafiyet ve ürün destek durumu',
        purposeRisk:
            'Amaç: Kritik varlıklarda zafiyet taramasının düzenli yapıldığını, yüksek/kritik ve bilinen istismar edilen (KEV) zafiyetlerin tanımlı süre içinde giderildiğini ve destek dışı (EOL) ürünlerin yönetildiğini doğrulamak. Risk: Yamalanmayan/desteği biten sistemler istismar için hazır hedeftir.',
        scopePrereq:
            'Kapsam: Sunucular, ağ cihazları, veritabanları, uygulama bileşenleri, uç noktalar. Önkoşul: Varlık envanteri, zafiyet tarama raporları, yama/değişiklik kayıtları, ürün yaşam döngüsü (EOL) listesi.',
        method: 'İnceleme + yeniden gerçekleştirme. Tarama kapsamının varlık envanteriyle karşılaştırılması; bir örnek yüksek/kritik bulgunun keşif–giderme süresinin yeniden hesaplanması; CISA KEV ile açık zafiyetlerin çapraz kontrolü; EOL bileşenler için telafi edici kontrol incelemesi.',
        steps: [
            { no: 1, text: 'Kritik varlık envanterini al; son dönemin zafiyet tarama raporundaki taranan varlık kümesiyle karşılaştır (taranmayanlar).' },
            { no: 2, text: 'Yüksek ve kritik seviye açık bulgular için keşif tarihi ile giderme/kapatma tarihi arasındaki süreyi hesapla; kurum SLA’sıyla karşılaştır (parametre — kurum dolduracak).' },
            { no: 3, text: 'Açık bulguları CISA KEV kataloğu ile karşılaştır; KEV’de olan ve giderilmemiş zafiyetleri listele.' },
            { no: 4, text: 'Destek dışı (EOL) yazılım/donanım bileşenlerini tespit et; her biri için yükseltme planı veya onaylı telafi edici kontrol olduğunu doğrula.' },
            { no: 5, text: 'Örnek yama uygulamalarının değişiklik yönetimi sürecinden geçtiğini kontrol et (bkz. TK-BT-07).' },
        ],
        expectedState:
            'Tarama kapsamı varlık envanterini kapsıyor; yüksek/kritik bulgular SLA içinde gideriliyor; açık KEV zafiyeti yok; EOL bileşenler planlı veya telafi edici kontrolle yönetiliyor.',
        requestedEvidence: [
            'Varlık envanteri ve zafiyet tarama kapsam listesi',
            'Dönemin zafiyet tarama raporları (tarih, araç, kapsam, bulgu seviyeleri)',
            'Yüksek/kritik bulgular için keşif ve giderme tarihleri (bulgu bazında)',
            'CISA KEV karşılaştırması / açık KEV listesi',
            'EOL bileşen listesi ve yükseltme planı veya telafi edici kontrol onayı',
        ],
        evidenceSufficiency:
            'Yeterli: dönemi kapsayan tarama raporları + bulgu bazında tarih verisi + KEV çapraz kontrolü. Yetersiz: tek bir tarama özeti, "yamalar güncel" beyanı, giderme tarihleri olmadan yalnızca açık bulgu sayısı.',
        decisionCriteria: D,
        misleadingSignals:
            'Tarama "başarılı" olsa da kimlik doğrulamasız (unauthenticated) tarama eksik bulgu üretir. Bulgunun "kapatıldı" işaretlenmesi yeniden tarama ile doğrulanmamış olabilir. Ortalama giderme süresi, kritik bulgulardaki uzun kuyruğu gizleyebilir. EOL bileşenin "izole" olduğu beyanı ağ kanıtıyla doğrulanmalı.',
        sampleControlResult:
            'Sunulan kanıtlar, zafiyet yönetiminin kısmen etkin olduğunu; envanterdeki 120 varlıktan 14’ünün son taramada kapsanmadığını, kritik bulgularda ortalama giderme süresinin kurum SLA’sını aştığını ve CISA KEV listesindeki 2 zafiyetin dönem sonunda hâlâ açık olduğunu göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Taranmayan varlıklar için gerekçe ve kimlik doğrulamalı tarama kapsamı\n• Kritik bulgular için keşif–giderme tarihleri ve kurum SLA değeri\n• Açık KEV zafiyetleri için giderme/telafi planı',
        suggestedSourceRefs: ['NIST SP 800-53 RA-5, SI-2, SI-3, SA-22', 'NIST CSF 2.0 ID.RA, PR.PS', 'CISA KEV Catalog'],
    },
    {
        code: 'TK-BT-07',
        topicNo: 7,
        title: 'Değişiklik ve üretime geçiş',
        purposeRisk:
            'Amaç: Üretim sistemlerine yapılan değişikliklerin yetkilendirildiğini, test edildiğini, görevler ayrılığına uygun şekilde devreye alındığını ve acil değişikliklerin sonradan onaya bağlandığını doğrulamak. Risk: Kontrolsüz değişiklik erişilebilirlik kesintisi, güvenlik açığı ve yetkisiz kod riski taşır.',
        scopePrereq:
            'Kapsam: Uygulama sürümleri, altyapı/konfigürasyon değişiklikleri, veritabanı şema değişiklikleri, acil düzeltmeler. Önkoşul: Dönemin değişiklik kayıtları (CAB/ticket), dağıtım (deployment) kayıtları, kod deposu erişim/merge kayıtları.',
        method: 'İnceleme + yeniden gerçekleştirme. Bir değişiklik örnekleminin talep–onay–test–dağıtım zincirinin belge ve sistem kayıtlarıyla yeniden kurulması; geliştirici ile dağıtımı yapanın ayrı kişiler olduğunun doğrulanması; acil değişikliklerde geriye dönük onayın kontrolü.',
        steps: [
            { no: 1, text: 'Dönemdeki tüm üretim değişikliklerinin listesini al (değişiklik yönetimi sistemi + dağıtım kayıtları çapraz).' },
            { no: 2, text: 'Bir örneklem için değişiklik talebi, onay, test kanıtı ve dağıtım kaydının varlığını ve tarih sırasını doğrula.' },
            { no: 3, text: 'Değişikliği geliştiren/onaylayan ile üretime alan kişilerin farklı olduğunu (görevler ayrılığı) kod deposu ve dağıtım kayıtlarından doğrula.' },
            { no: 4, text: 'Değişiklik yönetimi sistemi kaydı olmayan üretim dağıtımı olup olmadığını kontrol et (yetkisiz/kayıt dışı değişiklik).' },
            { no: 5, text: 'Acil değişiklikler için tanımlı süre içinde geriye dönük onay alındığını doğrula.' },
        ],
        expectedState:
            'Tüm üretim değişiklikleri kayıtlı ve onaylı; test kanıtı mevcut; geliştiren ≠ üretime alan; kayıt dışı dağıtım yok; acil değişiklikler geriye dönük onaylanmış.',
        requestedEvidence: [
            'Dönemin değişiklik kaydı listesi (talep, onay, tarih, sahip)',
            'Üretim dağıtım/pipeline kayıtları (kim, ne zaman, hangi sürüm)',
            'Örneklem değişiklikler için test kanıtı ve onay izi',
            'Kod deposu merge/approval kayıtları (görevler ayrılığı için)',
            'Acil değişiklik prosedürü ve dönemdeki acil değişikliklerin geriye dönük onay kayıtları',
        ],
        evidenceSufficiency:
            'Yeterli: değişiklik sistemi ile dağıtım kayıtlarının mutabakatı + örneklemde tam zincir + görevler ayrılığı kanıtı. Yetersiz: yalnızca CAB toplantı tutanağı, "her değişiklik onaylanıyor" beyanı, dağıtım kaydı olmadan yalnızca ticket.',
        decisionCriteria: D,
        misleadingSignals:
            'Ticket’ın "onaylandı" durumunda olması dağıtımdan önce onaylandığı anlamına gelmez — tarih sırası kontrol edilmeli. CI/CD otomasyonu görevler ayrılığını sağlayabilir ama pipeline’ı tetikleyen kişi manuel override yapmış olabilir. "Konfigürasyon değişikliği değişiklik değildir" varsayımı yanlıştır.',
        sampleControlResult:
            'Sunulan kanıtlar, değişiklik yönetiminin büyük ölçüde işlediğini; ancak 30 dağıtımdan 2’sinin ilgili değişiklik kaydı bulunmadan üretime alındığını ve 5 örnekten 1’inde değişikliği geliştiren kişinin aynı zamanda üretime aldığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Değişiklik kaydı olmadan yapılan dağıtımların gerekçesi\n• Örneklem değişiklikler için test kanıtı ve onay–dağıtım tarih sırası\n• Acil değişiklik geriye dönük onay süresinin kurum tanımı',
        suggestedSourceRefs: ['NIST SP 800-53 CM-3, CM-4, CM-5, SA-10', 'NIST CSF 2.0 PR.PS-01, ID.AM', 'OWASP ASVS V1 (Architecture)'],
    },
    {
        code: 'TK-BT-08',
        topicNo: 8,
        title: 'Yedekleme ve geri yükleme',
        purposeRisk:
            'Amaç: Kritik veri ve sistemlerin tanımlı sıklıkta yedeklendiğini, yedeklerin korunduğunu (şifreleme, ayrık/immutable kopya) ve geri yükleme testinin dönemsel olarak BAŞARIYLA yapıldığını doğrulamak. Risk: Test edilmemiş yedek, olay anında kurtarılamaz.',
        scopePrereq:
            'Kapsam: Kritik veritabanları, uygulama durumu, konfigürasyon, işlem kayıtları. Önkoşul: Yedekleme politikası, yedek işi (job) logları, geri yükleme testi kayıtları, saklama ve konum bilgisi. RTO/RPO değerleri kurum tarafından tanımlanmış olmalı (parametre).',
        method: 'İnceleme + yeniden gerçekleştirme. Yedek işi loglarından dönem boyunca başarı oranının çıkarılması; en az bir geri yükleme testinin kanıtının (kim, ne zaman, hangi sistem, sonuç, süre) incelenmesi; yedeklerin ayrık/immutable kopyasının varlığının doğrulanması.',
        steps: [
            { no: 1, text: 'Yedekleme kapsam listesini al; kritik sistem envanteriyle karşılaştır (yedeklenmeyen kritik sistem).' },
            { no: 2, text: 'Dönem boyunca yedek işlerinin başarı/başarısızlık loglarını incele; başarısız işlerin yeniden çalıştırıldığını doğrula.' },
            { no: 3, text: 'Dönemde yapılan geri yükleme testinin kaydını incele: kapsanan sistem, hedef ortam, elde edilen kurtarma süresi/nokta, sonuç.' },
            { no: 4, text: 'Yedeklerin şifrelendiğini ve üretimden ayrık, tercihen değiştirilemez (immutable) bir kopyasının bulunduğunu doğrula.' },
            { no: 5, text: 'Elde edilen kurtarma süresi/noktasının kurum RTO/RPO değerleriyle karşılaştırıldığını kontrol et.' },
        ],
        expectedState:
            'Tüm kritik sistemler kapsamda; yedek işleri istikrarlı başarılı; dönemde en az bir başarılı geri yükleme testi yapılmış ve RTO/RPO ile karşılaştırılmış; yedekler şifreli ve ayrık/immutable.',
        requestedEvidence: [
            'Yedekleme kapsam listesi ve kritik sistem envanteri',
            'Dönemin yedek işi logları (başarı/başarısızlık, tarih)',
            'Geri yükleme testi kaydı: kapsam, tarih, yapan, hedef ortam, sonuç, elde edilen RTO/RPO',
            'Yedek şifreleme ve ayrık/immutable kopya kanıtı',
            'Kurum RTO/RPO tanımları',
        ],
        evidenceSufficiency:
            'Yeterli: dönem boyunca yedek işi logları + GERÇEKLEŞTİRİLMİŞ geri yükleme testi kanıtı (sonuç dahil) + ayrık kopya kanıtı. Yetersiz: "yedekler alınıyor" beyanı, yedek yazılımının arayüz ekran görüntüsü, yalnızca yedekleme planı, geri yükleme "prosedürü" (testi olmadan).',
        decisionCriteria: D,
        misleadingSignals:
            'Yedek işinin "tamamlandı" durumu verinin tutarlı/kurtarılabilir olduğunu göstermez (bozuk yedek). Geri yükleme testinin "yapıldığı" beyanı, elde edilen süre ve sonuç olmadan yetersizdir. Yedekler aynı depolama/aynı hesap altındaysa fidye yazılımı senaryosunda ayrık sayılmaz.',
        sampleControlResult:
            'Sunulan kanıtlar, yedeklemenin düzenli çalıştığını; ancak dönemde planlanan geri yükleme testinin yalnızca bir sistem için ve hedef kurtarma süresi ölçülmeden yapıldığını, iki kritik sistemin immutable/ayrık kopyasının bulunmadığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Tüm kritik sistemleri kapsayan, elde edilen RTO/RPO’yu içeren geri yükleme testi kaydı\n• Yedeklerin üretimden ayrık ve değiştirilemez kopyasının kanıtı\n• Kurum tarafından onaylanmış RTO/RPO değerleri',
        suggestedSourceRefs: ['NIST SP 800-53 CP-9, CP-10, CP-4', 'NIST CSF 2.0 RC.RP, PR.DS-11', 'CPMI-IOSCO — Recovery'],
    },
    {
        code: 'TK-BT-09',
        topicNo: 9,
        title: 'İş sürekliliği ve felaket kurtarma',
        purposeRisk:
            'Amaç: Kritik borsa hizmetleri için iş etki analizinin güncel olduğunu, süreklilik/kurtarma planlarının tanımlandığını ve dönemsel tatbikatın kanıtlanabilir sonuçlarla yapıldığını doğrulamak. Risk: Tatbik edilmemiş plan gerçek olayda çalışmaz; hizmet kesintisi piyasa bütünlüğünü etkiler.',
        scopePrereq:
            'Kapsam: İşlem/emir, takas mutabakatı için veri, piyasa verisi, gözetim, kritik destek sistemleri. Önkoşul: Güncel iş etki analizi (BIA), süreklilik/DR planları, tatbikat planı ve sonuç raporları, alternatif merkez bilgisi. Kurtarma hedefleri (RTO/RPO) kurum tanımlı olmalı (parametre).',
        method: 'İnceleme + görüşme + yeniden gerçekleştirme. BIA’nın güncelliği ve kritiklik sınıflandırması; planların kapsamı; en az bir tatbikatın senaryosu, katılımcıları, elde edilen kurtarma süresi, tespit edilen aksaklıklar ve düzeltici aksiyonların kapanışı.',
        steps: [
            { no: 1, text: 'BIA’nın son güncelleme tarihini ve kritik hizmet listesini kontrol et; büyük değişikliklerden sonra güncellenip güncellenmediğini sor.' },
            { no: 2, text: 'Her kritik hizmet için tanımlı bir süreklilik/kurtarma planı ve atanmış sorumlu olduğunu doğrula.' },
            { no: 3, text: 'Dönemde yapılan tatbikatın kaydını incele: senaryo türü (masaüstü/teknik/tam), tarih, katılımcılar, elde edilen kurtarma süresi.' },
            { no: 4, text: 'Tatbikatta elde edilen sürelerin kurum RTO/RPO hedefleriyle karşılaştırıldığını ve sapmaların ele alındığını kontrol et.' },
            { no: 5, text: 'Tatbikatta çıkan bulguların düzeltici aksiyona bağlandığını ve bu aksiyonların kapatıldığını doğrula.' },
        ],
        expectedState:
            'BIA güncel; tüm kritik hizmetlerin planı ve sahibi var; dönemde anlamlı bir tatbikat yapılmış, sonuçları RTO/RPO ile karşılaştırılmış; tatbikat bulguları kapatılmış.',
        requestedEvidence: [
            'Güncel BIA (tarih, kritik hizmet sınıflandırması)',
            'Kritik hizmetlerin süreklilik/DR planları ve sorumlu atamaları',
            'Dönemin tatbikat planı ve sonuç raporu (senaryo, katılımcı, elde edilen süre)',
            'Tatbikat bulguları ve düzeltici aksiyon takip kaydı',
            'Kurum RTO/RPO ve alternatif merkez bilgileri',
        ],
        evidenceSufficiency:
            'Yeterli: güncel BIA + gerçekleştirilmiş tatbikat sonuç raporu (ölçülen sürelerle) + bulgu kapanış kaydı. Yetersiz: yalnızca plan dokümanı, "her yıl tatbikat yapılır" beyanı, sonuç içermeyen tatbikat duyurusu, masaüstü tatbikatın teknik kurtarma yeteneği kanıtı sayılması.',
        decisionCriteria: D,
        misleadingSignals:
            'Planın "onaylı" olması test edildiği anlamına gelmez. Masaüstü tatbikat, gerçek sistem devralma (failover) yeteneğini kanıtlamaz. Tatbikatın "başarılı" ilan edilmesi, elde edilen sürenin RTO’yu aştığı gerçeğini gizleyebilir. BIA bir yıldan eskiyse ve büyük mimari değişiklik olduysa güncel değildir.',
        sampleControlResult:
            'Sunulan kanıtlar, süreklilik yönetiminin kısmen etkin olduğunu; BIA’nın güncel olduğunu ancak dönemdeki tek tatbikatın masaüstü nitelikte olduğunu, gerçek failover testi yapılmadığını ve önceki tatbikat bulgularından ikisinin hâlâ açık olduğunu göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Kritik işlem sistemleri için gerçek devralma (failover) testi sonuçları ve elde edilen RTO\n• Önceki tatbikat bulguları için kapanış kanıtı\n• Kurum tarafından onaylanmış hizmet bazlı RTO/RPO değerleri',
        suggestedSourceRefs: ['NIST SP 800-53 CP-2, CP-3, CP-4, CP-7', 'NIST CSF 2.0 RC (Recover), ID.BE', 'CPMI-IOSCO — Recovery / Contingency planning'],
    },
    {
        code: 'TK-BT-10',
        topicNo: 10,
        title: 'DLP ve veri aktarımı',
        purposeRisk:
            'Amaç: Hassas verinin (piyasa hassas bilgi, kişisel veri, kritik yapılandırma) tanımlandığını, çıkış kanallarının (e-posta, web, taşınabilir medya, bulut, API) kontrol edildiğini ve olayların ele alındığını doğrulamak. Risk: Kontrolsüz veri çıkışı piyasa bütünlüğü, KVKK ve gizlilik ihlali riskleri doğurur.',
        scopePrereq:
            'Kapsam: Uç noktalar, e-posta ağ geçidi, web proxy, bulut erişim, dosya paylaşımı, veri aktarım (SFTP/API) noktaları. Önkoşul: Veri sınıflandırma politikası, DLP politika/kural dökümü, DLP olay kayıtları, aktarım envanteri.',
        method: 'İnceleme + teknik test. DLP kurallarının hassas veri sınıflarını kapsayıp kapsamadığının kontrolü; bir örnek kuralın uygun test verisiyle (üretim dışı) tetiklenmesi; olay kayıtlarında sınıflandırma, aksiyon ve kapanışın incelenmesi.',
        steps: [
            { no: 1, text: 'Veri sınıflandırma politikasındaki hassas veri sınıflarını al; DLP kurallarının bu sınıfları hedeflediğini doğrula (kapsam boşluğu).' },
            { no: 2, text: 'İzlenen çıkış kanallarının listesini al; e-posta, web, uç nokta, bulut ve dosya aktarımı için aktif kural bulunduğunu doğrula.' },
            { no: 3, text: 'Bir örnek DLP kuralını üretim dışı ortamda uygun test verisiyle tetikle; algılama ve tanımlı aksiyonun (engelle/karantina/uyar) gerçekleştiğini gözlemle.' },
            { no: 4, text: 'Dönemin DLP olaylarından bir örneklem al; sınıflandırma, atanan sahip, alınan aksiyon ve kapanış durumunu incele.' },
            { no: 5, text: 'Sık istisna/beyaz liste tanımlarını gözden geçir; geniş istisnaların gerekçelendirildiğini kontrol et.' },
        ],
        expectedState:
            'DLP kuralları tüm hassas veri sınıflarını ve ana çıkış kanallarını kapsıyor; test kuralı beklenen aksiyonu üretiyor; olaylar sınıflandırılıp sahiplendiriliyor ve kapatılıyor; istisnalar dar ve gerekçeli.',
        requestedEvidence: [
            'Veri sınıflandırma politikası ve hassas veri sınıfları',
            'DLP kural/politika dökümü (kanal, veri sınıfı, aksiyon)',
            'Örnek kural testi kanıtı (test verisi, tarih, gözlenen aksiyon)',
            'Dönemin DLP olay kayıtları örneklemi (sınıflandırma, aksiyon, kapanış)',
            'İstisna/beyaz liste tanımları ve gerekçeleri',
        ],
        evidenceSufficiency:
            'Yeterli: kural kapsamının veri sınıflarıyla eşleştirilmesi + gerçek test kanıtı + olay yaşam döngüsü örneklemi. Yetersiz: "DLP var" beyanı, yalnızca ürün lisans bilgisi, olayların yalnızca sayısı (yaşam döngüsü olmadan), yalnızca "izleme modunda" çalışan kurallar için engelleme iddiası.',
        decisionCriteria: D,
        misleadingSignals:
            '"İzleme (monitor) modu" engelleme sanılabilir. Kanal listesinde bulut/kişisel e-posta eksik olabilir. Şifreli/parola korumalı ekler DLP’yi baypas edebilir. Olay sayısının düşük olması kapsamın iyi olduğunu değil, kuralların dar olduğunu gösteriyor olabilir.',
        sampleControlResult:
            'Sunulan kanıtlar, DLP kontrolünün kısmen etkin olduğunu; e-posta ve uç nokta kanallarında kuralların aktif olduğunu ancak bulut depolama ve web yükleme kanallarının kapsanmadığını, kritik kuralların bir kısmının hâlâ izleme modunda olduğunu ve olayların %30’unun 30 günden uzun süredir kapatılmadığını göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Bulut depolama ve web yükleme kanalları için DLP kural kanıtı\n• Kritik kuralların engelleme (enforce) modunda çalıştığının kanıtı\n• Açık DLP olayları için sahip ve kapanış planı',
        suggestedSourceRefs: ['NIST SP 800-53 AC-4, SC-7, MP-5, SI-4', 'NIST CSF 2.0 PR.DS, DE.CM', 'OWASP ASVS V8 (Data Protection)'],
    },
    {
        code: 'TK-BT-11',
        topicNo: 11,
        title: 'Güvenli geliştirme ve API yetkilendirmesi',
        purposeRisk:
            'Amaç: Yazılım geliştirme yaşam döngüsünde güvenlik gereksinimlerinin, kod incelemesinin, bağımlılık/gizli bilgi taramasının ve API yetkilendirmesinin (kimlik doğrulama + nesne/işlev düzeyi yetki) uygulandığını doğrulamak. Risk: Güvensiz geliştirme ve zayıf API yetkilendirmesi doğrudan veri sızıntısı ve yetkisiz işlem riskidir.',
        scopePrereq:
            'Kapsam: Kurum içi geliştirilen kritik uygulamalar ve API’ler, CI/CD boru hattı, kod deposu. Önkoşul: SDLC/güvenli geliştirme prosedürü, pipeline konfigürasyonu, SAST/SCA/secret-scan çıktıları, API envanteri ve yetkilendirme tasarımı.',
        method: 'İnceleme + teknik test. Pipeline’da güvenlik adımlarının zorunlu olduğunun konfigürasyondan teyidi; bir örnek sürümde kod incelemesi ve tarama kanıtının kontrolü; kritik bir API için yetkilendirmenin (nesne düzeyi dahil) test edilmesi.',
        steps: [
            { no: 1, text: 'CI/CD pipeline konfigürasyonundan SAST, bağımlılık (SCA) ve gizli bilgi (secret) taramalarının zorunlu ve baypas edilemez olduğunu doğrula.' },
            { no: 2, text: 'Bir örnek üretim sürümü için zorunlu kod incelemesi (en az bir bağımsız onay) ve tarama sonucunun temiz/kabul edilmiş olduğunu kontrol et.' },
            { no: 3, text: 'API envanterini al; her kritik API için kimlik doğrulama ve yetkilendirme modelinin tanımlı olduğunu doğrula.' },
            { no: 4, text: 'Bir kritik API uç noktasında, yetkisiz bir kimlikle başka kullanıcının nesnesine erişim denemesi yaparak nesne düzeyi yetki kontrolünü (BOLA/IDOR) test et (uygun ortamda).' },
            { no: 5, text: 'API anahtarları/token’larının süre sınırlı olduğunu ve kasada/gizli yönetiminde tutulduğunu doğrula (bkz. TK-BT-02, TK-BT-03).' },
        ],
        expectedState:
            'Pipeline’da güvenlik taramaları zorunlu; kritik bulgular engelleyici; her sürüm bağımsız kod incelemesinden geçiyor; kritik API’ler kimlik doğrulama + nesne/işlev düzeyi yetkilendirme uyguluyor; token’lar kısa ömürlü ve korunuyor.',
        requestedEvidence: [
            'SDLC / güvenli geliştirme prosedürü',
            'CI/CD pipeline konfigürasyonu (güvenlik adımları, zorunluluk ayarı)',
            'Örnek sürüm için kod inceleme onayı ve SAST/SCA/secret-scan çıktıları',
            'API envanteri ve yetkilendirme tasarım dokümanı',
            'Kritik bir API için yetkilendirme testi kanıtı (istek/yanıt, tarih, ortam)',
        ],
        evidenceSufficiency:
            'Yeterli: pipeline konfigürasyonundan zorunluluk kanıtı + örnek sürüm için tam güvenlik zinciri + gerçek API yetki testi. Yetersiz: "kod incelemesi yapılıyor" beyanı, tarama aracının lisans bilgisi, yalnızca dokümante edilmiş API tasarımı (test olmadan), "geçilebilir uyarı" seviyesindeki taramaların engelleyici sayılması.',
        decisionCriteria: D,
        misleadingSignals:
            'Pipeline’da tarama adımı var ama "continue-on-error" ile sonuç yok sayılıyor olabilir. Kod incelemesi aynı takım içinde göstermelik olabilir (bağımsızlık kontrol edilmeli). API "kimlik doğrulama istiyor" ama her kimliğe tüm nesnelere erişim veriyor olabilir (yetki ≠ kimlik doğrulama). Swagger/doküman güncel görünse de canlı davranış farklı olabilir.',
        sampleControlResult:
            'Sunulan kanıtlar, güvenli geliştirme kontrolünün kısmen etkin olduğunu; SAST ve SCA adımlarının pipeline’da tanımlı ancak "uyarı" seviyesinde (engelleyici değil) olduğunu, örneklenen API uç noktasının kimlik doğrulama yaptığını fakat nesne düzeyi yetki kontrolü uygulamadığını (başka kullanıcının kaydına erişilebildiğini) göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Güvenlik taramalarının kritik bulgularda pipeline’ı durdurduğunun kanıtı\n• Kritik API’lerin nesne düzeyi yetkilendirme testleri\n• Kod incelemesinin bağımsızlığını (farklı sorumlu) gösteren merge kayıtları',
        suggestedSourceRefs: ['NIST SP 800-53 SA-3, SA-8, SA-11, SA-15, SC-8', 'NIST CSF 2.0 PR.PS-06', 'OWASP ASVS V1/V4/V13; OWASP API Security'],
    },
    {
        code: 'TK-BT-12',
        topicNo: 12,
        title: 'Üçüncü taraf ve uzaktan erişim',
        purposeRisk:
            'Amaç: Kritik hizmet sağlayan üçüncü tarafların risk değerlendirmesine tabi tutulduğunu, sözleşmesel güvenlik yükümlülüklerinin bulunduğunu, erişimlerinin en az ayrıcalık ve izlenebilirlik ilkesiyle yönetildiğini ve uzaktan erişimin güvenli kanaldan yapıldığını doğrulamak. Risk: Üçüncü taraf erişimi genişletilmiş bir saldırı yüzeyidir; borsa süreçlerinde tedarik zinciri riski yüksektir.',
        scopePrereq:
            'Kapsam: Kritik tedarikçiler, dış bakım/destek erişimi, bulut sağlayıcılar, üye/dış sistem bağlantıları. Önkoşul: Üçüncü taraf envanteri ve kritiklik sınıflandırması, tedarikçi risk değerlendirme kayıtları, sözleşme güvenlik ekleri, uzaktan erişim envanteri ve logları.',
        method: 'İnceleme + yeniden gerçekleştirme + görüşme. Kritik tedarikçiler için risk değerlendirmesinin dönemsel yapıldığının kontrolü; sözleşmelerde güvenlik/denetim/olay bildirimi maddelerinin varlığı; bir dış erişim örneğinin talep–onay–süre sınırı–log zincirinin yeniden kurulması.',
        steps: [
            { no: 1, text: 'Üçüncü taraf envanterini al; kritik olarak sınıflandırılanlar için dönemde/tanımlı sıklıkta risk değerlendirmesi yapıldığını doğrula.' },
            { no: 2, text: 'Kritik tedarikçi sözleşmelerinde güvenlik gereksinimleri, denetim/bilgi hakkı, olay bildirim süresi ve alt yüklenici hükümleri bulunduğunu incele.' },
            { no: 3, text: 'Dış/uzaktan erişimlerin envanterini al; her birinin sahibi, iş gerekçesi ve geçerlilik süresi (süresiz erişim olmamalı) olduğunu doğrula.' },
            { no: 4, text: 'Bir dış erişim örneği için: talep, onay, MFA’lı güvenli kanal, oturum kaydı/loglama ve iş bitiminde erişimin kaldırılması zincirini yeniden kur.' },
            { no: 5, text: 'Kritik hizmetlerde tedarikçinin bağımsız güvence raporu (ör. SOC 2 / ISAE 3402) veya eşdeğerinin alınıp değerlendirildiğini kontrol et.' },
        ],
        expectedState:
            'Kritik tedarikçiler dönemsel risk değerlendirmesine tabi; sözleşmelerde güvenlik yükümlülükleri var; dış erişimler gerekçeli, süre sınırlı, MFA’lı ve loglu; iş bitince kaldırılıyor; bağımsız güvence raporları alınıp değerlendiriliyor.',
        requestedEvidence: [
            'Üçüncü taraf envanteri ve kritiklik sınıflandırması',
            'Kritik tedarikçiler için risk değerlendirme kayıtları (tarih, kapsam, sonuç)',
            'Sözleşme güvenlik ekleri örnekleri (güvenlik, denetim hakkı, olay bildirimi)',
            'Uzaktan/dış erişim envanteri (sahip, gerekçe, geçerlilik süresi)',
            'Bir dış erişim için talep–onay–oturum log–kaldırma kanıt zinciri',
            'Kritik tedarikçilerin bağımsız güvence raporları ve değerlendirme notları',
        ],
        evidenceSufficiency:
            'Yeterli: envanter + dönemsel risk değerlendirme kanıtı + örnek erişim tam zinciri + bağımsız güvence raporu değerlendirmesi. Yetersiz: yalnızca tedarikçi listesi, "sözleşmelerde güvenlik maddesi vardır" beyanı, süresiz VPN hesapları, güvence raporunun alınıp okunmadan dosyalanması.',
        decisionCriteria: D,
        misleadingSignals:
            'Tedarikçinin ISO/SOC belgesi olması, kapsamın kurumun kullandığı hizmeti içerdiği anlamına gelmez (kapsam ve tarih kontrol edilmeli). "Onaylı tedarikçi listesi" güncel olmayabilir. Dış destek erişimi "gerektiğinde açılıyor" denip aslında sürekli açık olabilir. Jump host üzerinden erişim loglanıyor sanılırken oturum içeriği kaydedilmiyor olabilir.',
        sampleControlResult:
            'Sunulan kanıtlar, üçüncü taraf yönetiminin kısmen etkin olduğunu; kritik 15 tedarikçiden 4’ünün dönemde risk değerlendirmesinin yapılmadığını, iki dış destek erişiminin süre sınırı olmadan açık kaldığını ve bir kritik tedarikçinin bağımsız güvence raporunun kapsamının kurumun kullandığı hizmeti içermediğini göstermektedir.',
        sampleEvidenceRequest:
            'Eksik kanıtlar:\n• Risk değerlendirmesi yapılmayan kritik tedarikçiler için değerlendirme kayıtları\n• Süresiz dış erişimler için gerekçe ve süre sınırlandırma\n• Bağımsız güvence raporlarının kapsam/tarih uygunluk değerlendirmesi',
        suggestedSourceRefs: ['NIST SP 800-53 SR-3, SR-6, AC-17, AC-20, CA-3, PS-7', 'NIST CSF 2.0 GV.SC, ID.RA-10', 'CPMI-IOSCO — Interdependencies / third-party'],
    },
];
