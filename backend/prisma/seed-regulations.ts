import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('📚 Regülasyon kütüphanesi seed başlıyor...');

    await prisma.articleCrossRef.deleteMany({});
    await prisma.regulationArticle.deleteMany({});
    await prisma.regulation.deleteMany({});

    // ── SPK Tebliği VII-128.10 ───────────────────────────────────────────────
    const spk = await prisma.regulation.create({
        data: {
            code: 'SPK-VII-128.10',
            name: 'Bilgi Sistemleri Yönetimine İlişkin Usul ve Esaslar Tebliği',
            issuer: 'Sermaye Piyasası Kurulu (SPK)',
            publishDate: new Date('2025-03-13'),
            effectiveDate: new Date('2025-03-13'),
            description: 'Sermaye piyasasında faaliyet gösteren kurum, kuruluş ve ortaklıkların bilgi sistemleri yönetimine ilişkin usul ve esasları düzenleyen tebliğ. Resmi Gazete Sayı: 32840, 13 Mart 2025.',
            status: 'ACTIVE',
        },
    });

    const spkArticles = [
        { code: 'M.1', title: 'Amaç', category: 'Genel', desc: 'Bu Tebliğin amacı, Sermaye Piyasası Kurulu\'nun gözetim ve denetimine tabi Kurum, Kuruluş ve Ortaklıkların bilgi sistemleri yönetimine ilişkin usul ve esasları ile bilgi sistemleri kontrollerini düzenlemektir.' },
        { code: 'M.2', title: 'Kapsam', category: 'Genel', desc: 'Bu Tebliğ; Sermaye Piyasası Kurulu\'nun gözetim ve denetimine tabi olan aracı kurumlar, portföy yönetim şirketleri, yatırım fonları, ortaklıklar ve diğer sermaye piyasası kurumlarını kapsar. Kapsam, faaliyetlerin niteliği ve ölçeğine göre farklılaşan yükümlülükler içermektedir.' },
        { code: 'M.3', title: 'Dayanak', category: 'Genel', desc: 'Bu Tebliğ, 6/12/2012 tarihli ve 6362 sayılı Sermaye Piyasası Kanununun 128 inci maddesinin birinci fıkrasına dayanılarak hazırlanmıştır.' },
        { code: 'M.4', title: 'Tanımlar ve Kısaltmalar', category: 'Genel', desc: 'Tebliğde geçen terimler tanımlanmaktadır: Bilgi güvenliği sorumlusu, bilgi sistemleri, bilgi sistemleri güvenlik politikası, bilgi sistemleri süreklilik planı, bilgi varlığı, dış hizmet, elektronik bankacılık hizmetleri, hassas veri, kimlik doğrulama, parola, sızma testi, siber olay ve diğer temel kavramlar.' },
        { code: 'M.5', title: 'Bilgi Sistemleri Yönetiminin Oluşturulması', category: 'Yönetişim', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri yönetimini kurumsal yönetim uygulamalarının bir parçası olarak ele alır. Yönetim kurulu, bilgi sistemlerinin doğru yönetimi için gerekli finansman ve insan kaynağını tahsis etmek, bilgi varlıklarının gizliliği, bütünlüğü ve erişilebilirliğini sağlamak amacıyla etkin kontroller tesis etmekle sorumludur. BS strateji planı yönetim kurulu tarafından onaylanır ve düzenli gözden geçirilir.' },
        { code: 'M.6', title: 'Bilgi Güvenliği Politikası', category: 'Yönetişim', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi güvenliği politikasını oluşturur ve yönetim kurulunun onayına sunar. Politika yılda en az bir kez gözden geçirilir ve güncellenir. Politika; bilgi güvenliğinin kapsamını, amacını, ilkeleri, rolleri ve sorumlulukları, uyum gerekliliklerini ve ihlal durumlarında uygulanacak yaptırımları içerir. Tüm çalışanlar politika hakkında bilgilendirilir ve bağlılıklarını teyit eder.' },
        { code: 'M.7', title: 'Üst Yönetimin Gözetimi ve Sorumluluğu', category: 'Yönetişim', desc: 'Üst yönetim, yılda en az bir kez bilgi güvenliği politikasını gözden geçirir ve onaylar. Bilgi güvenliği sorumlusu atanır; bu kişinin bilgi sistemleri ve güvenlik alanında en az 5 yıl deneyime sahip olması zorunludur. Bilgi güvenliği sorumlusu; politikanın uygulanmasını takip eder, ihlalleri raporlar, denetim bulgularını değerlendirerek aksiyon planlarına dönüştürür ve üst yönetime düzenli raporlama yapar.' },
        { code: 'M.8', title: 'Bilgi Sistemleri Risk Yönetimi', category: 'Risk', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerine yönelik riskleri yönetmek amacıyla kapsamlı bir risk yönetimi çerçevesi oluşturur. Risk analizi yılda en az bir kez gerçekleştirilir. Risk analizi kapsamında; varlık envanteri oluşturulur, tehditler ve zafiyetler tanımlanır, risklerin olasılık ve etkisi değerlendirilir, risk iştahı belirlenir ve risk azaltma önlemleri planlanır. Sızma testi sonuçları risk analizine dahil edilir.' },
        { code: 'M.9', title: 'Bilgi Sistemleri Kontrollerinin Tesisi', category: 'Kontrol', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri risklerini kabul edilebilir düzeyde tutmak amacıyla gerekli kontrolleri tesis eder. Kontroller; önleyici, tespit edici ve düzeltici nitelikte olabilir. Kontrollerin etkinliği düzenli aralıklarla test edilir ve sonuçlar belgelenir. Kontrollerdeki eksiklikler giderilmek üzere aksiyon planına alınır.' },
        { code: 'M.10', title: 'Varlık Yönetimi', category: 'Varlık', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi varlıklarının (donanım, yazılım, veri ve hizmetler dahil) güncel envanterini oluşturur ve yönetir. Her varlık için sahibi atanır. Varlıklar gizlilik, bütünlük ve erişilebilirlik açısından sınıflandırılır. Hizmet dışı bırakılan varlıklar, hassas veriler içeriyorsa güvenli imha yöntemleriyle yok edilir. Envanter yılda en az bir kez doğrulanır.' },
        { code: 'M.11', title: 'Görevler Ayrılığı İlkesi', category: 'Kontrol', desc: 'Kritik ve hassas bilgi sistemi faaliyetlerinde görevler ayrılığı ilkesi uygulanır. Aynı kişinin bir işlemi hem başlatıp hem onaylamaması, hem de denetlememesi sağlanır. Görevler ayrılığının uygulanamadığı durumlarda telafi edici kontroller tesis edilir ve bu durum belgelenir. Yönetici hesaplarının kullanım alanı en az yetkiyle sınırlandırılır.' },
        { code: 'M.12', title: 'Fiziksel ve Çevresel Güvenlik', category: 'Fiziksel', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerinin barındırıldığı fiziksel alanlar için güvenlik önlemleri alır. Veri merkezleri ve kritik BT altyapıları için erişim kontrolü, kamera sistemi, yangın söndürme, iklimlendirme, kesintisiz güç kaynağı (UPS) ve jeneratör tesis edilir. Fiziksel erişim kayıtları tutulur. Doğal afetler ve fiziksel tehlikeler gözetilerek yer seçimi yapılır. Fiziksel güvenlik düzenlemeleri belgelenir ve düzenli test edilir.' },
        { code: 'M.13', title: 'Ağ Güvenliği', category: 'Teknik', desc: 'Kurum, Kuruluş ve Ortaklıklar, kurumsal ağlarını iç ve dış tehditlere karşı korumak için katmanlı güvenlik anlayışıyla gerekli önlemleri alır. Bu kapsamda: güvenlik duvarı ve saldırı tespit/önleme sistemi (IDS/IPS) tesis edilir; ağ alt segmentlere bölünür; DMZ kurulur; uzaktan erişimlerde çok faktörlü kimlik doğrulama uygulanır; kablosuz ağlar güvenli protokollerle korunur; ağ trafiği izlenir; gereksiz servisler kapatılır. Ağ güvenliği belgeleri yılda en az bir kez güncellenir.' },
        { code: 'M.14', title: 'Bilgi Sistemlerinin İşletimi', category: 'Teknik', desc: 'Bilgi sistemlerinin güvenli, süreklı ve etkin işletimi için gerekli prosedürler oluşturulur. Kapasite planlaması yapılır, sistemlerin performansı izlenir. Yama yönetimi süreci işletilir; güvenlik yamaları risk değerlendirmesi sonucu önceliklendirilir ve belirli sürelerde uygulanır. Zararlı yazılım önleme sistemleri kurulur ve güncellenir. E-posta güvenliği için spam filtreleme, kötücül içerik tarama ve SPF/DKIM/DMARC politikaları uygulanır. Tüm işletim faaliyetleri kayıt altına alınır.' },
        { code: 'M.15', title: 'Kimlik Yönetimi', category: 'Erişim', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerine erişimi kontrol etmek amacıyla kimlik yönetim süreçleri tesis eder. Çok faktörlü kimlik doğrulama; uzaktan erişimler, kritik sistemler ve ayrıcalıklı hesaplar için zorunludur. Parola politikası belirlenir: minimum uzunluk, karmaşıklık, düzenli değiştirme ve eski parola tekrarı yasağı. Hesapların devredilmesi, askıya alınması ve silinmesi süreçleri tanımlanır. Paylaşılan hesap kullanımı önlenir.' },
        { code: 'M.16', title: 'Erişim Yönetimi', category: 'Erişim', desc: 'En az yetki ilkesi esas alınarak kullanıcılara yalnızca görevlerini yerine getirmek için gerekli olan erişim hakları tanınır. Rol tabanlı erişim kontrolü (RBAC) uygulanır. Erişim hakları; personel işe alındığında, görev değişikliğinde ve işten ayrılmasında gözden geçirilir. Ayrıcalıklı erişimler özel denetim kapsamında tutulur ve log kaydı alınır. Erişim hakları en az 6 ayda bir gözden geçirilir ve onaylanır.' },
        { code: 'M.17', title: 'İşlemlerin, Kayıtların ve Verilerin Bütünlüğü', category: 'Teknik', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri üzerinden gerçekleşen işlemlerin, kayıtların ve verilerin bütünlüğünün sağlanmasına yönelik gerekli önlemleri alır. Bütünlüğü sağlamaya yönelik önlemler verinin iletimi, işlenmesi ve saklanması aşamalarının tamamını kapsayacak şekilde tesis edilir. Bilgi sistemlerine ilişkin dışarıdan hizmet alınan kuruluşlar nezdinde gerçekleşen işlemler için de aynı yaklaşım gösterilir.' },
        { code: 'M.18', title: 'Kriptografi ve Veri Gizliliği', category: 'Teknik', desc: 'Kurum, Kuruluş ve Ortaklıklar, iletilen, işlenen ve saklanan verilerin gizliliğini sağlayacak önlemleri alır: (a) Verilerin güvenlik sınıfına uygun korunması. (b) Erişim haklarının belirlenmesi, erişimlerin kayıt altına alınması. (c) Hassas verilerin tüm ortamlarda şifrelenerek saklanması, iletilmesi ve yedeklenmesi. (ç) Güvenilirliği ispatlanmış kriptografik algoritmalar kullanılması; geçerliliğini yitirmiş veya kırılmış şifreleme anahtarlarının derhal geçersiz kılınması.' },
        { code: 'M.19', title: 'Personel Güvenliği', category: 'Personel', desc: 'Üst yönetim tarafından, bilgi sistemleri kapsamında çalışanların güvenlik farkındalığını artırmaya yönelik eğitim programları hazırlanır ve düzenli olarak güncellenir. İşe alım sürecinde güvenlik gereksinimleri değerlendirilir, gizlilik taahhütnameleri imzalatılır. Görev değişikliği ve işten ayrılma durumlarında erişim hakları derhal sonlandırılır. İç tehdit (insider threat) riskine karşı farkındalık eğitimleri verilir.' },
        { code: 'M.20', title: 'Müşteri Hizmetleri ve Elektronik Kanallar', category: 'Teknik', desc: 'Elektronik ortamda sunulan hizmetlerden yararlanacak müşteriler; sunulan hizmetlere ilişkin şartlar, riskler ve istisnai durumlarla ilgili açık biçimde bilgilendirilir. SMS OTP kullanımında SIM değişikliği kontrolü yapılır; SIM kartı değiştirilmiş telefon numaralarına belirli süre boyunca OTP gönderilmez. Mobil ve internet kanallarında güvenlik uyarıları, oturum zaman aşımı, şüpheli işlem bildirimi mekanizmaları uygulanır.' },
        { code: 'M.21', title: 'Üçüncü Taraf Erişimi ve Veri Aktarımı', category: 'Tedarikçi', desc: 'Üçüncü taraflara Kurum, Kuruluş ve Ortaklıkların bilgi sistemine erişim hakkı verilmeden önce gerekli güvenlik gereksinimleri tanımlanır ve uygulanır. Bilgi içeren ortamlar, üçüncü taraflar ile yapılan veri aktarımları sırasında gerçekleşebilecek kötüye kullanım veya bozulmaya karşı korunur. Çalışmalar yazılı hale getirilir ve veri aktarımlarına ilişkin denetim izi tutulur. Tedarikçi sözleşmelerine güvenlik hükümleri eklenir.' },
        { code: 'M.22', title: 'Denetim İzleri ve Kayıt Mekanizmaları', category: 'Denetim', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri üzerindeki riskleri göz önünde bulundurarak etkin bir denetim izi kayıt mekanizması tesis eder. Kritik bilgi sistemleri ve hassas verilere erişim, değişiklik ve silme işlemlerine ilişkin denetim izleri tutulur. Kayıt mekanizması yetkisiz müdahalelerden korunur. Kayıtlar belirli bir süre muhafaza edilir. Denetim izleri düzenli olarak gözden geçirilir ve anormallikler raporlanır.' },
        { code: 'M.23', title: 'Zaman Senkronizasyonu', category: 'Teknik', desc: 'Kurum, Kuruluş ve Ortaklıkların bilgi sistemlerinde kullandıkları zaman bilgisi tek bir referans kaynağına göre senkronize edilir. Zaman bilgisi atomik saatler vasıtasıyla temin edilir. Sistemler arasında tutarsız zaman bilgisi, log kayıtlarının güvenilirliğini zedeleyeceğinden NTP protokolü ile merkezi zaman senkronizasyonu sağlanır.' },
        { code: 'M.24', title: 'Bilgi Güvenliği İhlali Yönetimi', category: 'Olay', desc: 'Kurum, Kuruluş ve Ortaklıklar, bünyelerinde gerçekleşen her türlü bilgi güvenliği ihlalinin yönetilmesini sağlayacak kontrolleri tesis eder. İhlal değerlendirme kriterleri belirlenir: kritik operasyonların olası kesinti süresi, veri sızıntısı kapsamı, etkilenen kullanıcı sayısı, gelir kaybı. Bilgi güvenliği ihlal olaylarına müdahale planı hazırlanır ve üst yönetim tarafından onaylanır. Olaylar kayıt altına alınır, yıllık rapor kurula sunulur. Kritik ihlaller 72 saat içinde ilgili otoriteye bildirilir.' },
        { code: 'M.25', title: 'Bilgi Sistemleri Edinimi ve Geliştirme', category: 'Geliştirme', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri edinimi, geliştirilmesi ve bakımı süreçlerinde güvenlik kontrollerini tesis eder. Fonksiyonel gereksinimler ile güvenlik gereksinimleri yazılı hale getirilir. Güvenli yazılım geliştirme yaşam döngüsü (SDLC) uygulanır: geliştirme, test ve üretim ortamları birbirinden ayrılır. Yazılımlar değişiklikler öncesinde güvenlik testinden geçirilir. Kaynak kodlar güvenli ortamda muhafaza edilir. Dışarıdan temin edilen yazılımlarda kaynak kod saklama sözleşmesi yapılır.' },
        { code: 'M.26', title: 'Uygulama Güvenliği', category: 'Geliştirme', desc: 'Kurum, Kuruluş ve Ortaklıklar, uygulamaların güvenli çalışmasını temin etmek amacıyla kontroller geliştirir. Girdi doğrulama ve filtreleme mekanizmaları tesis edilir; zararlı içerikleri engellemek üzere girdiler doğrulanır. Çıktıların bütünlüğü sağlanır. Hata mesajları güvenlik bilgisi sızdırmayacak şekilde tasarlanır. Oturum yönetimi güvenli hale getirilir; çerez güvenliği sağlanır. API\'ler yetkilendirme ve hız sınırlama mekanizmalarıyla güçlendirilir. Mobil uygulamalar ek güvenlik denetimine tabi tutulur.' },
        { code: 'M.27', title: 'Bilgi Sistemleri Sürekliliği', category: 'Süreklilik', desc: 'Kurum, Kuruluş ve Ortaklıkların birincil ve ikincil sistemlerini yurt içinde bulundurmaları zorunludur. İkincil sistem, doğal ve çevresel felaketlere karşı birincil sistemle aynı risklere maruz kalmayacak şekilde konumlandırılır. İkincil sistem, birincil sisteme geçişin kesintiye uğraması halinde 24 saat içinde faaliyete geçecek biçimde yapılandırılır. BS süreklilik planı üst yönetim tarafından onaylanır, yılda en az bir kez test edilir ve güncellenir.' },
        { code: 'M.28', title: 'Değişiklik Yönetimi', category: 'Değişiklik', desc: 'Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerini oluşturan yazılım, donanım ve altyapı bileşenlerine yapılan değişiklikleri yönetmek amacıyla kontroller geliştirir. Her değişiklik için: sebep, kapsam, etki, riskler, beklenen fayda, yapılacak kişiler, maliyet, test ve eğitim faaliyetleri kayıt altına alınır. Değişiklikler uygulanmadan önce detaylı test süreci yürütülür. Planlanan değişiklikler onay sürecinden geçmedikçe işleme konulmaz. Acil durum değişiklikleri için ayrı prosedür belirlenir.' },
        { code: 'M.29', title: 'İç Denetim', category: 'Denetim', desc: 'Kurum, Kuruluş ve Ortaklıklar, yılda en az bir kez bilgi sistemlerine yönelik iç denetim gerçekleştirir. İç denetim faaliyeti dışarıdan hizmet alımı yoluyla icra edilemez. İç denetimi gerçekleştirecek kişilerin "Bilgi Sistemleri Bağımsız Denetim Lisansı"na sahip olmaları zorunludur. Denetim sonuçları yönetim kuruluna raporlanır. Bilgi güvenliği sorumlusu, tespit ve sonuçlara göre aksiyon planı hazırlar, üst yönetime onaylatır ve uyumu takip eder.' },
        { code: 'M.30', title: 'Muafiyetler', category: 'Genel', desc: 'Asgari özsermaye yükümlülüğünde belirli limitlere tabi portföy yönetim şirketleri, dar yetkili aracı kurumlar, varlık kiralama şirketleri, ipotek finansmanı kuruluşları ve diğer bazı kurumlar belirtilen maddeler bakımından muafiyet kapsamında değerlendirilebilir. Muafiyetten yararlanan kurumlar hâlâ temel bilgi güvenliği ilkelerine uymakla yükümlüdür.' },
        { code: 'M.31', title: 'Diğer Hususlar', category: 'Genel', desc: 'Bu Tebliğ hükümleri esas olmak üzere, tezgahüstü türev araç işlemi gerçekleştiren aracı kurumların bilgi işlem altyapılarına ilişkin ilgili Kurul düzenlemelerinde belirlenen ilke ve esaslara uyulur. Kripto Varlık Hizmet Sağlayıcılar, bu Tebliğdeki hükümlere ilave olarak TÜBİTAK\'ın belirlediği kriterlere de uyar. Kurul, bu Tebliğ kapsamında süreleri değiştirmeye ve bulut hizmet sağlayıcılara ilişkin kriterleri belirlemeye yetkilidir.' },
        { code: 'M.32', title: 'Yürürlükten Kaldırılan Tebliğ', category: 'Genel', desc: 'VII-128.7 ve VII-128.9 sayılı Tebliğler ile diğer ilgili düzenlemeler yürürlükten kaldırılmıştır. Bu Tebliğin yürürlüğe girmesiyle birlikte önceki düzenlemelerin yerini alacak hükümler belirtilmiştir.' },
        { code: 'M.33', title: 'Yürürlük', category: 'Genel', desc: 'Bu Tebliğ yayımı tarihinde yürürlüğe girer. Yürürlüğe girdiği tarihten itibaren kurumların mevcut sistemlerini tebliğ gerekliliklerine uygun hale getirmeleri için belirli geçiş süreleri tanınmıştır.' },
        { code: 'M.34', title: 'Yürütme', category: 'Genel', desc: 'Bu Tebliğ hükümlerini Sermaye Piyasası Kurulu yürütür.' },
    ];

    const spkArticleRecords: Record<string, string> = {};
    for (const a of spkArticles) {
        const rec = await prisma.regulationArticle.create({
            data: {
                regulationId: spk.id,
                articleCode: a.code,
                title: a.title,
                description: a.desc,
                category: a.category,
            },
        });
        spkArticleRecords[a.code] = rec.id;
    }
    console.log(`✅ SPK: ${spkArticles.length} madde eklendi`);

    // ── CBDDO BİG Rehberi ───────────────────────────────────────────────────
    const cbddo = await prisma.regulation.create({
        data: {
            code: 'CBDDO-BIG-2020',
            name: 'Bilgi ve İletişim Güvenliği Rehberi',
            issuer: 'Cumhurbaşkanlığı Dijital Dönüşüm Ofisi (CBDDO)',
            publishDate: new Date('2020-07-10'),
            effectiveDate: new Date('2020-07-10'),
            description: 'Kamu kurumları ve kritik altyapı hizmeti veren işletmelerce uyulması gereken bilgi ve iletişim güvenliği tedbirlerini içeren rehber. 2019/12 sayılı Cumhurbaşkanlığı Genelgesi kapsamında hazırlanmıştır. Sürüm: 2020/1.0.',
            status: 'ACTIVE',
        },
    });

    const cbddoArticles = [
        // Bölüm 2: Uygulama Süreci
        { code: '2.1.1', title: 'Varlık Gruplarının Belirlenmesi', category: 'Yönetişim', desc: 'Kurumun tüm varlıkları (donanım, yazılım, veri, personel, fiziksel altyapı) belirlenerek gruplandırılır. Varlık grupları; Ağ ve Sistem, Uygulama ve Veri, Taşınabilir Cihaz/Ortam, IoT, Personel ve Fiziksel Mekan olarak kategorize edilir. Her varlık için sahibi (varlık sorumlusu) atanır.' },
        { code: '2.1.2', title: 'Varlık Grubu Kritiklik Derecesinin Belirlenmesi', category: 'Risk', desc: 'Belirlenen varlık gruplarının kritiklik dereceleri; gizlilik, bütünlük ve erişilebilirlik boyutlarında değerlendirilir. Kritiklik dereceleri (Çok Yüksek, Yüksek, Orta, Düşük) belirlenerek uygulanacak güvenlik tedbirlerinin kapsamı kararlaştırılır. Kritiklik değerlendirmesi anket tabanlı yapısal bir yöntemle gerçekleştirilir.' },
        { code: '2.1.3', title: 'Mevcut Durum ve Boşluk Analizi', category: 'Risk', desc: 'Kurumun mevcut bilgi güvenliği durumu, rehber gereksinimleriyle karşılaştırılarak boşluk analizi yapılır. Mevcut kontrollerin etkinliği ve eksiklikler tespit edilir. Boşluk analizi sonuçları, uygulama yol haritasının oluşturulmasında girdi olarak kullanılır. Analiz sonuçları belgelenir ve yönetimle paylaşılır.' },
        { code: '2.1.4', title: 'Rehber Uygulama Yol Haritasının Hazırlanması', category: 'Yönetişim', desc: 'Boşluk analizi sonuçlarına göre önceliklendirilmiş bir uygulama yol haritası hazırlanır. Yol haritası; uygulanacak tedbirleri, sorumlu birimleri, tahmini tamamlanma tarihlerini ve gerekli kaynakları içerir. Yönetim onayından geçirilir ve düzenli olarak güncellenir.' },
        { code: '2.2.1', title: 'Bilgi ve İletişim Güvenliği Temel Prensipleri', category: 'Yönetişim', desc: 'Bilgi ve iletişim güvenliğinin temel prensipleri şunlardır: Gizlilik (yalnızca yetkililerin erişimi), Bütünlük (verinin yetkisiz değiştirilmemesi), Erişilebilirlik (gerektiğinde erişilebilir olması). Bu prensipler tüm güvenlik kararlarının temelini oluşturur. Kurumun güvenlik politikaları bu prensipler doğrultusunda hazırlanır.' },
        { code: '2.3.1', title: 'Rehber Uygulama Yol Haritasının İzlenmesi ve Kontrol Edilmesi', category: 'Denetim', desc: 'Uygulama yol haritasının hayata geçirilmesi düzenli aralıklarla izlenir ve kontrol edilir. Sapmaların nedenleri analiz edilerek gerekli önlemler alınır. İzleme sonuçları yönetime raporlanır. Yol haritası gerçekleşme durumuna göre güncellenir.' },
        { code: '2.3.2', title: 'Bilgi ve İletişim Güvenliği Denetimi', category: 'Denetim', desc: 'Kurumun bilgi ve iletişim güvenliği tedbirlerinin uygulanma durumu bağımsız denetimlerle periyodik olarak değerlendirilir. Denetim planı hazırlanır, uygulanır ve denetim bulguları raporlanır. Bulgulara yönelik düzeltici faaliyetler aksiyon planına alınır ve takip edilir.' },
        { code: '2.4.1', title: 'Rehber Değişikliklerinin Yönetilmesi', category: 'Değişiklik', desc: 'Rehberde yapılan güncellemeler ve değişiklikler düzenli olarak takip edilir. Değişikliklerin kuruma etkisi analiz edilir. Gerekli uyum çalışmaları planlanarak yürütülür. Değişiklik yönetimi süreci belgelenir.' },
        { code: '2.4.2', title: 'Varlık Gruplarının Değişikliklerinin Yönetilmesi', category: 'Değişiklik', desc: 'Kurumdaki varlık gruplarında gerçekleşen değişiklikler (yeni varlık eklenmesi, mevcut varlığın değiştirilmesi veya kaldırılması) güvenlik kontrolleri açısından değerlendirilir. Değişiklik öncesinde etki analizi yapılır ve güvenlik gereksinimleri güncellenir.' },

        // Bölüm 3.1: Ağ ve Sistem Güvenliği
        { code: '3.1.1', title: 'Donanım Varlıklarının Envanter Yönetimi', category: 'Varlık', desc: 'Ağa bağlı tüm donanım varlıklarının (sunucu, ağ cihazı, çevresel birim vb.) güncel envanteri tutulur. Envanter; cihaz adı, IP adresi, MAC adresi, lokasyon, sorumlu kişi ve bakım bilgilerini içerir. Yetkisiz donanımların ağa bağlanması önlenir. Envanter periyodik olarak doğrulanır.' },
        { code: '3.1.2', title: 'Yazılım Varlıklarının Envanter Yönetimi', category: 'Varlık', desc: 'Kurumda kullanılan tüm yazılımların (işletim sistemi, uygulama, güvenlik yazılımı vb.) güncel envanteri tutulur. Yetkisiz yazılımların kullanımı engellenir (uygulama beyaz listesi). Yazılımların lisans durumları takip edilir. Envanter periyodik olarak doğrulanır ve güncellenir.' },
        { code: '3.1.3', title: 'Tehdit ve Zafiyet Yönetimi', category: 'Risk', desc: 'Kurumun bilgi sistemlerinde bulunan zafiyetler periyodik taramalarla tespit edilir. Zafiyetler risk seviyesine göre önceliklendirilir ve belirlenen sürelerde giderilir. Tehdit istihbaratı takip edilerek yeni tehditler değerlendirilir. Zafiyet yönetimi süreci belgelenir ve düzenli raporlanır. Yama yönetimi bu sürecin ayrılmaz bir parçasıdır.' },
        { code: '3.1.4', title: 'E-Posta Sunucusu ve İstemcisi Güvenliği', category: 'Teknik', desc: 'E-posta sistemleri spam ve zararlı içerik filtreleme mekanizmalarıyla korunur. SPF, DKIM ve DMARC protokolleri uygulanarak e-posta sahtekarlığı önlenir. Şifreli e-posta iletişimi desteklenir. Kullanıcılar phishing saldırılarına karşı düzenli olarak eğitilir. E-posta arşivleme ve denetim izi tutulur.' },
        { code: '3.1.5', title: 'Zararlı Yazılımlardan Korunma', category: 'Teknik', desc: 'Tüm sistemlere zararlı yazılım önleme (antivirus/antimalware) yazılımı kurulur ve güncel tutulur. Gerçek zamanlı koruma aktif edilir. Düzenli taramalar gerçekleştirilir. E-posta ve web filtreleme sistemleri zararlı içerikleri engeller. Kullanıcılar zararlı yazılım belirtilerini tanımaları için eğitilir. Tespit edilen zararlı yazılımlar karantinaya alınır ve raporlanır.' },
        { code: '3.1.6', title: 'Ağ Güvenliği', category: 'Teknik', desc: 'Kurumsal ağ katmanlı güvenlik mimarisiyle korunur. Güvenlik duvarları ile iç ve dış ağlar segmente edilir; DMZ oluşturulur. IDS/IPS sistemleri ile ağ trafiği izlenir ve anormallikler tespit edilir. Gereksiz port ve servisler kapatılır. Ağ erişim kontrolü (NAC) uygulanır. VPN ile güvenli uzak erişim sağlanır. Kablosuz ağlar WPA3 gibi güçlü protokollerle korunur. Ağ topolojisi ve akış diyagramları güncel tutulur.' },
        { code: '3.1.7', title: 'Veri Sızıntısı Önleme', category: 'Teknik', desc: 'Veri sızıntısı önleme (DLP) politikaları ve araçları uygulanır. Hassas verilerin yetkisiz olarak kurumun dışına çıkması önlenir. E-posta, web, USB ve bulut kanalları DLP kapsamında izlenir. Veri sınıflandırmasına göre DLP kuralları belirlenir. DLP ihlalleri kayıt altına alınır ve ilgili birimlere raporlanır.' },
        { code: '3.1.8', title: 'İz ve Denetim Kayıtlarının Tutulması ve İzlenmesi', category: 'Denetim', desc: 'Kritik sistemler ve uygulamalarda gerçekleşen işlemlere ait log (denetim izi) kayıtları tutulur. Loglar merkezi log yönetim sistemiyle toplanır, analiz edilir ve korunur. Logların yetkisiz değiştirilmesi veya silinmesi önlenir. Log saklama süreleri belirlenir (asgari 2 yıl önerilir). SIEM (Güvenlik Bilgi ve Olay Yönetimi) sistemi ile anlık analiz ve alarm mekanizması oluşturulur.' },
        { code: '3.1.9', title: 'Sanallaştırma Güvenliği', category: 'Teknik', desc: 'Sanallaştırma altyapısı güvenli yapılandırılır; hypervisor güncel tutulur ve güçlendirilir. Sanal makineler arası izolasyon sağlanır. Yönetim arayüzlerine erişim kısıtlanır ve çok faktörlü kimlik doğrulama uygulanır. Sanal makine göçü şifreli kanallar üzerinden gerçekleştirilir. Kullanılmayan sanal makineler kapatılır veya silinir.' },
        { code: '3.1.10', title: 'Siber Güvenlik Olay Yönetimi', category: 'Olay', desc: 'Siber güvenlik olaylarını tespit etmek, müdahale etmek ve raporlamak için süreçler ve ekipler oluşturulur (SOME/CERT). Olay müdahale planı hazırlanır ve düzenli tatbikatlarla test edilir. Olaylar kayıt altına alınır, sınıflandırılır ve analiz edilir. Köken analizi (root cause analysis) yapılır. İlgili otoriteler ve paydaşlar belirlenen sürelerde bilgilendirilir.' },
        { code: '3.1.11', title: 'Sızma Testleri ve Güvenlik Denetimleri', category: 'Denetim', desc: 'Kurumun bilgi sistemlerine yönelik sızma testleri ulusal veya uluslararası belgeye sahip uzman kişi/kuruluşlar tarafından gerçekleştirilir. Testler; ağ, uygulama, fiziksel ve sosyal mühendislik bileşenlerini kapsar. Test sonuçları raporlanır ve bulgular risk seviyesine göre öncelikli olarak kapatılır. Yılda en az bir kez gerçekleştirilmesi önerilir.' },
        { code: '3.1.12', title: 'Kimlik Doğrulama ve Erişim Yönetimi', category: 'Erişim', desc: 'Bilgi sistemlerine erişimde güçlü kimlik doğrulama mekanizmaları uygulanır. Kritik sistemler ve uzak erişimde çok faktörlü kimlik doğrulama zorunlu tutulur. Güçlü parola politikası belirlenir (minimum uzunluk, karmaşıklık, düzenli değişim). Hesap kilitleme mekanizması aktif edilir. Ayrıcalıklı hesaplar ayrıca izlenir. Kullanıcı erişim hakları periyodik gözden geçirilir.' },
        { code: '3.1.13', title: 'Felaket Kurtarma ve İş Sürekliliği Yönetimi', category: 'Süreklilik', desc: 'İş sürekliliği ve felaket kurtarma planları hazırlanır, onaylanır ve düzenli olarak test edilir. Kritik sistemler için kurtarma süresi hedefleri (RTO) ve kurtarma noktası hedefleri (RPO) belirlenir. Yedek sistemler ve veri yedekleri farklı lokasyonlarda tutulur. Yedeklerin düzenli olarak geri yüklenebilirliği test edilir. Tüm personel planlar konusunda eğitilir.' },
        { code: '3.1.14', title: 'Uzaktan Çalışma', category: 'Erişim', desc: 'Uzaktan çalışma senaryoları için güvenlik politika ve prosedürleri belirlenir. Kurumsal ağa uzak erişim VPN ile şifreli kanallar üzerinden gerçekleştirilir. Uzak bağlantılarda çok faktörlü kimlik doğrulama zorunlu tutulur. Uzaktan çalışan cihazlar kurumsal güvenlik standartlarına uygun yapılandırılır ve düzenli güvenlik güncellemeleri alır.' },

        // Bölüm 3.2: Uygulama ve Veri Güvenliği
        { code: '3.2.1', title: 'Kimlik Doğrulama (Uygulama)', category: 'Erişim', desc: 'Uygulamalara erişimde güçlü kimlik doğrulama mekanizmaları uygulanır. Hassas işlemler için yeniden kimlik doğrulama gerektirilir. Varsayılan şifreler değiştirilir; test ve geliştirme ortamlarında üretim kimlik bilgileri kullanılmaz. Kimlik doğrulama hataları güvenli şekilde ele alınır; hangi bilginin yanlış olduğu açıklanmaz. Oturum açma girişimleri sınırlandırılır.' },
        { code: '3.2.2', title: 'Oturum Yönetimi', category: 'Teknik', desc: 'Uygulama oturumları güvenli yönetilir. Oturum kimlikleri rastgele ve tahmin edilemez biçimde oluşturulur. Oturum token\'ları güvenli aktarılır ve saklanır (HTTPS, HttpOnly çerez). Belirli bir işlem yapılmadığında oturum zaman aşımına uğrar. Kullanıcı çıkış yaptığında oturum sunucu tarafında sonlandırılır. Oturum sabitleme (session fixation) saldırılarına karşı önlem alınır.' },
        { code: '3.2.3', title: 'Yetkilendirme', category: 'Erişim', desc: 'Uygulamalarda en az yetki ilkesi esas alınarak kullanıcılara yalnızca ihtiyaç duydukları yetki verilir. Yetkilendirme sunucu tarafında gerçekleştirilir; istemci taraflı yetkilendirmeye güvenilmez. Yatay ve dikey ayrıcalık yükseltme saldırılarına karşı kontroller uygulanır. Yetki değişiklikleri kayıt altına alınır.' },
        { code: '3.2.4', title: 'Dosyaların ve Kaynakların Güvenliği', category: 'Teknik', desc: 'Uygulamalarda kullanılan dosya ve kaynaklar güvenli yönetilir. Dosya yükleme işlemlerinde tip doğrulama ve boyut sınırlaması uygulanır. Yüklenen dosyalar zararlı içerik taramasından geçirilir. Web root dışındaki dosyalara doğrudan erişim engellenir. Dizin listeleme devre dışı bırakılır. Hassas yapılandırma dosyaları web erişimine kapatılır.' },
        { code: '3.2.5', title: 'Güvenli Kurulum ve Yapılandırma', category: 'Teknik', desc: 'Uygulamalar ve sunucular güvenli varsayılan yapılandırmalarla kurulur. Gereksiz bileşenler, servisler ve özellikler kaldırılır (hardening). Yapılandırma değişiklikleri belgelenir ve onay sürecinden geçirilir. Güvenlik konfigürasyonları periyodik gözden geçirilir. Sıkılaştırma kılavuzları (CIS Benchmark vb.) referans alınır.' },
        { code: '3.2.6', title: 'Güvenli Yazılım Geliştirme', category: 'Geliştirme', desc: 'Yazılım geliştirme süreçleri güvenliği baştan sona entegre eden SDLC (Güvenli Yazılım Geliştirme Yaşam Döngüsü) prensiplerine uygun yürütülür. Geliştirici güvenlik eğitimleri verilir. Statik (SAST) ve dinamik (DAST) kod analizi gerçekleştirilir. Bağımlılıklar güvenlik açıkları açısından taranır (SCA). Kod incelemesi (code review) güvenlik odaklı yapılır.' },
        { code: '3.2.7', title: 'Veri Tabanı ve Kayıt Yönetimi', category: 'Teknik', desc: 'Veri tabanları güvenli yapılandırılır. Hassas veriler (parola, TC kimlik no vb.) şifreli saklanır. Parolalar tek yönlü hash algoritmaları (bcrypt, argon2) ile korunur. Veri tabanı erişimi en az yetki ilkesine göre yapılandırılır. Veri tabanı yedeklemeleri şifreli yapılır. SQL enjeksiyon saldırılarına karşı parametrik sorgular kullanılır.' },
        { code: '3.2.8', title: 'Hata Ele Alma ve Kayıt Yönetimi', category: 'Teknik', desc: 'Uygulama hataları güvenli biçimde ele alınır; kullanıcılara yalnızca genel hata mesajları gösterilir, sistem detayları gizlenir. Hatalar log sistemine kaydedilir. Log kayıtları yeterli detayda tutulur ancak hassas veri (şifre, kredi kartı numarası) içermez. Log kayıtlarına yetkisiz erişim ve değişiklik önlenir.' },
        { code: '3.2.9', title: 'İletişim Güvenliği', category: 'Teknik', desc: 'Uygulama iletişimleri şifreli kanallar üzerinden gerçekleştirilir. TLS 1.2 veya üzeri protokol kullanılır; zayıf şifreleme algoritmaları devre dışı bırakılır. Sertifikalar geçerli ve güncel tutulur. HSTS (HTTP Strict Transport Security) aktif edilir. Dahili iletişimler de mümkün olduğunca şifrelenir.' },
        { code: '3.2.10', title: 'Kötücül İşlemleri Engelleme', category: 'Teknik', desc: 'Uygulamalar XSS (Cross-Site Scripting), SQL enjeksiyon, CSRF, XXE, SSRF gibi yaygın saldırı vektörlerine karşı korunur. WAF (Web Uygulama Güvenlik Duvarı) kullanılır. Girdi doğrulama ve çıktı kodlama (output encoding) uygulanır. İçerik Güvenliği Politikası (Content Security Policy - CSP) başlıkları ayarlanır. Bot ve otomatik saldırılara karşı CAPTCHA ve hız sınırlama uygulanır.' },
        { code: '3.2.11', title: 'Dış Sistem Entegrasyonlarının Güvenliği', category: 'Teknik', desc: 'Üçüncü taraf sistemlerle entegrasyonlarda güvenlik gereksinimleri belirlenir. API bağlantıları kimlik doğrulama ve yetkilendirmeyle korunur. Veri alışverişi şifreli kanallar üzerinden gerçekleştirilir. Entegrasyon noktaları güvenlik testine tabi tutulur. Üçüncü taraf bileşenlerin güvenlik güncellemeleri takip edilir.' },

        // Bölüm 3.3: Taşınabilir Cihaz ve Ortam Güvenliği
        { code: '3.3.1', title: 'Akıllı Telefon ve Tablet Güvenliği', category: 'Teknik', desc: 'Kurumsal verilere erişen mobil cihazlar MDM (Mobil Cihaz Yönetimi) sistemiyle yönetilir. Cihazlarda ekran kilidi zorunlu tutulur. Kurumsal veriler yerel cihazda şifreli saklanır. Kayıp veya çalınan cihazlar uzaktan silinebilir (remote wipe). Jailbreak/root yapılmış cihazlara kurumsal erişim engellenir. Mobil uygulama güvenlik politikaları belirlenir.' },
        { code: '3.3.2', title: 'Taşınabilir Bilgisayar Güvenliği', category: 'Teknik', desc: 'Kurumsal dizüstü bilgisayarlarda tam disk şifreleme (BitLocker, FileVault vb.) uygulanır. Ekran kilidi politikası zorlanır. Kurumsal VPN üzerinden ağa bağlanılır. Otomatik güncellemeler aktif edilir. Taşınabilir bilgisayarlar fiziksel kayıp risklerine karşı Kensington kilidi gibi ek fiziksel güvenlik önlemleriyle korunur.' },
        { code: '3.3.3', title: 'Taşınabilir Ortam Güvenliği', category: 'Teknik', desc: 'USB bellek, CD/DVD ve diğer taşınabilir ortamların kullanımı politika ile kontrol altına alınır. Yetkisiz taşınabilir ortamların kullanımı engellenir. Kurumsal verileri içeren taşınabilir ortamlar şifreli olmalıdır. Kullanım dışı bırakılan taşınabilir ortamlar güvenli biçimde imha edilir. Taşınabilir ortamların envanteri tutulur.' },

        // Bölüm 3.4: IoT Güvenliği
        { code: '3.4.1', title: 'IoT Ağ Servisleri ve İletişimi', category: 'Teknik', desc: 'IoT cihazları kurumsal ağdan izole edilmiş ayrı bir ağ segmentine yerleştirilir. IoT cihazlarının gereksiz ağ servisleri ve portları devre dışı bırakılır. IoT iletişimleri şifreli protokollerle gerçekleştirilir. Cihazlar periyodik güvenlik güncellemelerini alacak biçimde yapılandırılır.' },
        { code: '3.4.2', title: 'IoT Dahili Veri Depolama', category: 'Teknik', desc: 'IoT cihazlarında saklanan hassas veriler şifrelenir. Cihaz firmware\'inin bütünlüğü doğrulanır. Depolanan veriler, cihaz ömrü sona erdiğinde güvenli biçimde silinir. Gereksiz veri depolama en aza indirilir.' },
        { code: '3.4.3', title: 'IoT Kimlik Doğrulama ve Yetkilendirme', category: 'Erişim', desc: 'IoT cihazlarında varsayılan kullanıcı adı ve şifreler değiştirilir. Her cihaz için benzersiz kimlik bilgileri kullanılır. Cihaz kimlik doğrulaması sertifika tabanlı yöntemlerle güçlendirilir. Cihazlara verilen erişim yetkileri en az yetki ilkesine göre belirlenir.' },
        { code: '3.4.4', title: 'IoT API ve Bağlantı Güvenliği', category: 'Teknik', desc: 'IoT cihazlarıyla iletişim kuran API\'ler kimlik doğrulama ve yetkilendirme mekanizmalarıyla korunur. API trafiği şifreli kanallar üzerinden yürütülür. API güvenlik testleri gerçekleştirilir. Gereksiz API endpoint\'leri kapatılır. Hız sınırlama uygulanarak brute-force saldırıları önlenir.' },
        { code: '3.4.5', title: 'IoT Diğer Güvenlik Tedbirleri', category: 'Teknik', desc: 'IoT cihazları üretici tarafından sağlanan güvenlik güncellemeleriyle güncel tutulur. Cihaz ömrü sona erdiğinde güvenlik güncellemesi almayan cihazlar ağdan çıkarılır. IoT cihaz envanteri güncel tutulur. Satın alma sürecinde güvenlik kriterleri değerlendirilir (güvenlik odaklı tedarik).' },

        // Bölüm 3.5: Personel Güvenliği
        { code: '3.5.1', title: 'Personel Genel Güvenlik Tedbirleri', category: 'Personel', desc: 'İşe alım sürecinde güvenlik gereksinimleri değerlendirilir. Gizlilik taahhütnameleri imzalatılır. Rol ve sorumluluklara göre erişim hakları tanımlanır. Görev değişikliği ve işten ayrılma durumlarında erişim hakları derhal sonlandırılır ve ekipmanlar iade alınır. İç tehdit riskini azaltmak için davranışsal izleme prosedürleri belirlenir.' },
        { code: '3.5.2', title: 'Eğitim ve Farkındalık Faaliyetleri', category: 'Personel', desc: 'Tüm personele yönelik düzenli bilgi güvenliği farkındalık eğitimleri verilir. Eğitimler; sosyal mühendislik, phishing, güvenli kullanım pratikleri, veri sınıflandırma ve politikalara uyumu kapsar. Eğitim etkinliği ölçülür ve raporlanır. Yeni işe başlayan personel oryantasyon eğitimi alır. Phishing simülasyonları gerçekleştirilir.' },
        { code: '3.5.3', title: 'Tedarikçi İlişkileri Güvenliği', category: 'Tedarikçi', desc: 'Tedarikçi ve üçüncü tarafların kurumsal bilgi sistemlerine erişim için güvenlik gereksinimleri belirlenir ve sözleşmelere yansıtılır. Tedarikçi erişimleri en az yetki ilkesiyle kısıtlanır, izlenir ve denetlenir. Tedarikçilerin güvenlik durumu periyodik olarak değerlendirilir. Sözleşme sona erdiğinde erişimler derhal kaldırılır.' },

        // Bölüm 3.6: Fiziksel Mekanların Güvenliği
        { code: '3.6.1', title: 'Fiziksel Mekan Genel Güvenlik Tedbirleri', category: 'Fiziksel', desc: 'Kritik bilgi sistemi bileşenlerinin bulunduğu alanlara fiziksel erişim kontrol altına alınır. Kartlı geçiş, biyometrik sistemler ve güvenlik görevlisi gibi mekanizmalar uygulanır. Fiziksel erişim logları tutulur. Ziyaretçi erişimleri kayıt altına alınır ve refakat zorunluluğu getirilir. Güvenlik kameraları kritik alanlarda konumlandırılır.' },
        { code: '3.6.2', title: 'Sistem Odası/Veri Merkezine Yönelik Güvenlik Tedbirleri', category: 'Fiziksel', desc: 'Veri merkezleri ve sistem odaları katı fiziksel erişim kontrollerine tabi tutulur. Uygun ısı, nem ve iklimlendirme sistemleri tesis edilir. UPS ve jeneratör ile kesintisiz güç sağlanır. Yangın söndürme ve algılama sistemleri kurulur. Güvenlik kameraları 7/24 kayıt yapar. Erişim yetkili personelle sınırlı tutulur ve erişim kayıtları belirli süre muhafaza edilir.' },
        { code: '3.6.3', title: 'Elektromanyetik Bilgi Kaçaklarından Korunma (TEMPEST)', category: 'Fiziksel', desc: 'Çok gizli sınıfında veri işleyen sistemler TEMPEST önlemlerine uygun biçimde yapılandırılır. Elektromanyetik radyasyon yoluyla bilgi sızmasına karşı ekranlama ve yalıtım uygulanır. TEMPEST sertifikasyonu gerektiren durumlar belirlenir ve uygun önlemler alınır.' },

        // Bölüm 4.1: Kişisel Verilerin Güvenliği
        { code: '4.1.1', title: 'Kişisel Veri Kayıt Yönetimi', category: 'Varlık', desc: 'İşlenen kişisel verilerin envanteri tutulur (VERBİS kaydı). Kişisel verilerin işleme amacı, hukuki dayanağı, saklama süresi ve aktarım bilgileri kayıt altına alınır. Veri envanteri güncel tutulur. KVKK uyum süreçleri işletilir.' },
        { code: '4.1.2', title: 'Kişisel Veri Erişim Kayıtları Yönetimi', category: 'Denetim', desc: 'Kişisel verilere erişim kayıtları tutulur. Erişim logları; kim, ne zaman, ne veriye eriştiğini içerir. Bu kayıtlar yetkisiz değiştirilmeye karşı korunur ve belirli süre muhafaza edilir. Loglar periyodik olarak analiz edilir.' },
        { code: '4.1.3', title: 'Kişisel Veri Yetkilendirme', category: 'Erişim', desc: 'Kişisel verilere erişim en az yetki ilkesine göre yapılandırılır. Yalnızca ihtiyaç duyan personel ilgili kişisel verilere erişebilir. Yetki değişiklikleri kayıt altına alınır. Aşırı veri toplanması (veri minimizasyonu ihlali) önlenir.' },
        { code: '4.1.4', title: 'Kişisel Veri Şifreleme', category: 'Teknik', desc: 'Hassas kişisel veriler (TC kimlik numarası, sağlık verisi, finansal veri vb.) veri tabanında şifreli saklanır. Aktarım sırasında TLS ile korunur. Yedeklerde de şifreleme uygulanır. Şifreleme anahtarları güvenli yönetilir.' },
        { code: '4.1.5', title: 'Kişisel Veri Yedekleme, Silme ve İmha', category: 'Teknik', desc: 'Kişisel veriler yasal saklama süreleri dolduktan sonra güvenli biçimde silinir, yok edilir veya anonim hale getirilir. İmha işlemi kayıt altına alınır. Yedeklerdeki kişisel veriler de imha kapsamına dahil edilir. İmha yöntemleri veri hassasiyetine göre belirlenir.' },
        { code: '4.1.6', title: 'Aydınlatma Yönetimi', category: 'Yönetişim', desc: 'Kişisel veri işlenmeden önce veri sahipleri KVKK kapsamında aydınlatma yükümlülüğü çerçevesinde bilgilendirilir. Aydınlatma metinleri açık, anlaşılır ve eksiksiz hazırlanır. Hangi verilerin nasıl işlendiği, aktarıldığı ve saklama süreleri açıklanır.' },
        { code: '4.1.7', title: 'Açık Rıza Yönetimi', category: 'Yönetişim', desc: 'Açık rıza gerektiren kişisel veri işleme faaliyetleri için net, bilgilendirilmiş ve özgür irade ile alınan rızalar kayıt altına alınır. Rıza geri alındığında veri işleme derhal durdurulur. Rıza kayıtları belirli süre muhafaza edilir. Koşullu rıza (hizmet sunumunun rızaya bağlanması) KVKK kapsamında değerlendirilir.' },
        { code: '4.1.8', title: 'Kişisel Veri Yönetim Sürecinin İşletilmesi', category: 'Yönetişim', desc: 'KVKK uyum süreci kapsamlı biçimde yönetilir: veri envanteri, aydınlatma, rıza, veri ihlali bildirimi, veri sahibi başvuruları. Veri ihlali durumunda 72 saat içinde KVK Kurumu\'na bildirim yapılır. Veri koruma görevlisi (DPO) gerektiğinde atanır.' },

        // Bölüm 4.2: Anlık Mesajlaşma Güvenliği
        { code: '4.2.1', title: 'Anlık Mesajlaşma Genel Güvenlik Tedbirleri', category: 'Teknik', desc: 'Kurumsal iletişimde kullanılacak anlık mesajlaşma uygulamaları belirlenir ve onaylı uygulamaların kullanımı zorunlu kılınır. Uçtan uca şifreleme destekleyen uygulamalar tercih edilir. Kurumsal veriler kişisel mesajlaşma uygulamaları üzerinden paylaşılmaz. Mesajlaşma arşivleme politikası belirlenir.' },

        // Bölüm 4.3: Bulut Bilişim Güvenliği
        { code: '4.3.1', title: 'Bulut Bilişim Genel Güvenlik Tedbirleri', category: 'Teknik', desc: 'Bulut hizmetlerinin kullanımında paylaşılan sorumluluk modeli anlaşılır ve uygulanır. Bulut hizmet sağlayıcıları güvenlik kriterleri açısından değerlendirilir. Verilerin bulutta şifreli saklanması ve iletilmesi sağlanır. Bulut ortamına erişimde çok faktörlü kimlik doğrulama zorunlu tutulur. Bulut yapılandırmaları periyodik güvenlik değerlendirmelerine tabi tutulur (CSPM).' },

        // Bölüm 4.4: Kripto Uygulamaları Güvenliği
        { code: '4.4.1', title: 'Kriptografik Algoritmalar ve Kullanımı', category: 'Teknik', desc: 'Güvenilirliği kanıtlanmış, güncel kriptografik algoritmalar kullanılır. AES-256 (simetrik şifreleme), RSA-2048 veya ECC (asimetrik), SHA-256 ve üzeri (hash) algoritmaları tercih edilir. Zayıf ve modası geçmiş algoritmalar (MD5, SHA-1, DES, RC4) kullanımdan kaldırılır. Kriptografik algoritma seçimi belgelenir ve periyodik olarak gözden geçirilir.' },
        { code: '4.4.2', title: 'Şifreleme ve Anahtar Yönetimi', category: 'Teknik', desc: 'Kriptografik anahtarlar güvenli biçimde üretilir, dağıtılır, saklanır, yenilenir ve iptal edilir. Anahtar yönetim sistemi (KMS) veya donanımsal güvenlik modülü (HSM) kullanılır. Anahtarlara erişim kısıtlanır ve kayıt altına alınır. Süresi dolan veya tehlikeye giren anahtarlar derhal iptal edilir ve yenisiyle değiştirilir.' },
        { code: '4.4.3', title: 'Kriptografik Uygulamalar', category: 'Teknik', desc: 'Sertifika yönetimi güvenli yürütülür; SSL/TLS sertifikalarının geçerlilik süreleri takip edilir. Kod imzalama uygulamaların bütünlüğünü doğrulamak için kullanılır. Elektronik imza uygulamaları 5070 sayılı Elektronik İmza Kanunu\'na uygun gerçekleştirilir. PKI (Açık Anahtar Altyapısı) bileşenleri güvenli yönetilir.' },

        // Bölüm 4.5: Kritik Altyapılar Güvenliği
        { code: '4.5.1', title: 'Kritik Altyapı Genel Güvenlik Tedbirleri', category: 'Teknik', desc: 'Kritik altyapı (enerji, su, ulaşım, sağlık, finans vb.) hizmeti veren kurumlar ek güvenlik tedbirleri alır. OT/ICS sistemleri IT sistemlerinden izole edilir. Endüstriyel kontrol sistemleri güvenlik testine tabi tutulur. Olay müdahale planları kritik altyapı senaryolarını kapsar.' },
        { code: '4.5.2', title: 'Enerji Sektörü Özelinde Güvenlik Tedbirleri', category: 'Teknik', desc: 'Enerji sektörü kurumları endüstriyel kontrol sistemleri (SCADA/DCS) için özelleşmiş güvenlik tedbirleri uygular. OT ağları BT ağlarından mantıksal ve fiziksel olarak ayrıştırılır. Uzak erişimler sıkı denetim altında tutulur. EPDK düzenlemelerine uyum sağlanır.' },
        { code: '4.5.3', title: 'Elektronik Haberleşme Sektörü Özelinde Güvenlik Tedbirleri', category: 'Teknik', desc: 'Elektronik haberleşme altyapısı işletenler ağ güvenilirliği ve sürekliliği için kapsamlı önlemler alır. BTK düzenlemelerine uyum sağlanır. Kesinti yönetimi prosedürleri belirlenir. Kritik haberleşme altyapıları yedekli yapılandırılır.' },

        // Bölüm 4.6: Yeni Geliştirmeler ve Tedarik
        { code: '4.6.1', title: 'Yeni Geliştirmeler ve Tedarik Genel Güvenlik Tedbirleri', category: 'Geliştirme', desc: 'Yeni yazılım ve sistem tedarikinde güvenlik kriterleri satın alma şartnamesine dahil edilir. Tedarikçilerin güvenlik olgunluk seviyeleri değerlendirilir. Yazılım bileşen güvenlik analizi (SBOM) talep edilir. Tedarik zinciri saldırılarına karşı doğrulama mekanizmaları uygulanır.' },

        // Bölüm 5: Sıkılaştırma Tedbirleri
        { code: '5.1.1', title: 'İşletim Sistemi Genel Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'İşletim sistemleri güvenlik sıkılaştırma kılavuzlarına (CIS Benchmark, DISA STIG) uygun yapılandırılır. Gereksiz servisler, bileşenler ve özellikler devre dışı bırakılır. Güvenlik yamaları düzenli olarak uygulanır. Yerel güvenlik duvarı etkin tutulur. Uzak yönetim arayüzleri kısıtlı ve şifreli erişime açılır.' },
        { code: '5.1.2', title: 'Linux İşletim Sistemi Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'Linux sistemlerde: gereksiz paketler kaldırılır; SELinux/AppArmor aktif edilir; SSH yapılandırması güçlendirilir (root girişi yasaklanır, anahtar tabanlı kimlik doğrulama zorunlu tutulur); güvenlik duvarı kuralları (iptables/nftables) yapılandırılır; dosya izinleri ve sahiplik kontrol edilir; güvenli önyükleme sağlanır.' },
        { code: '5.1.3', title: 'Windows İşletim Sistemi Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'Windows sistemlerde: Grup Politikaları güvenlik sıkılaştırma prensiplerine göre yapılandırılır; gereksiz rol ve özellikler kaldırılır; Windows Defender ve Windows Firewall aktif tutulur; UAC etkin edilir; SMBv1 devre dışı bırakılır; BitLocker ile disk şifreleme uygulanır; LAPS ile yerel yönetici parolaları yönetilir.' },
        { code: '5.2.1', title: 'Veri Tabanı Genel Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'Veri tabanı sunucuları sıkılaştırma kılavuzlarına uygun yapılandırılır. Varsayılan kullanıcı hesapları devre dışı bırakılır veya parolaları değiştirilir. Gereksiz depolanan prosedürler ve işlevler kaldırılır. Veri tabanına erişim uygulama sunucuları ile sınırlı tutulur (IP kısıtlaması). Veri tabanı logları etkin tutulur ve merkezi log sistemine iletilir.' },
        { code: '5.3.1', title: 'Web Sunucusu Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'Web sunucuları (Apache, Nginx, IIS) güvenlik sıkılaştırma prensiplerine göre yapılandırılır. Gereksiz modüller ve dizin listeleme devre dışı bırakılır. Güvenlik başlıkları (X-Frame-Options, X-Content-Type-Options, CSP vb.) eklenir. TLS yapılandırması güçlendirilir. Web sunucu sürüm bilgisi gizlenir. Erişim ve hata logları aktif tutulur.' },
        { code: '5.3.2', title: 'Sanallaştırma Sunucusu Sıkılaştırma Tedbirleri', category: 'Teknik', desc: 'Hypervisor sistemleri sıkılaştırma kılavuzlarına uygun yapılandırılır. Yönetim arabirimleri kısıtlı ağlara alınır. Gereksiz sanal donanım ve özellikler kaldırılır. VM escape saldırılarına karşı yamalamalar güncel tutulur. Sanal makine şablonları güvenli temel yapılandırmaya sahip oluşturulur.' },
    ];

    const cbddoArticleRecords: Record<string, string> = {};
    for (const a of cbddoArticles) {
        const rec = await prisma.regulationArticle.create({
            data: {
                regulationId: cbddo.id,
                articleCode: a.code,
                title: a.title,
                description: a.desc,
                category: a.category,
            },
        });
        cbddoArticleRecords[a.code] = rec.id;
    }
    console.log(`✅ CBDDO: ${cbddoArticles.length} bölüm eklendi`);

    // ── Çapraz Referanslar ───────────────────────────────────────────────────
    const crossRefs = [
        { spk: 'M.5', cbddo: '2.2.1', note: 'Her ikisi de kurumsal bilgi güvenliği yönetim çerçevesi ve temel prensipler' },
        { spk: 'M.6', cbddo: '2.2.1', note: 'Bilgi güvenliği politikası ve temel prensipler' },
        { spk: 'M.7', cbddo: '2.3.2', note: 'Üst yönetim gözetimi ve bağımsız denetim sorumluluğu' },
        { spk: 'M.8', cbddo: '2.1.3', note: 'Risk yönetimi ve boşluk analizi — tehdit ve risk değerlendirme' },
        { spk: 'M.8', cbddo: '3.1.3', note: 'Risk yönetimi sürecinin teknik ayağı: tehdit ve zafiyet yönetimi' },
        { spk: 'M.10', cbddo: '3.1.1', note: 'Donanım varlık envanteri yönetimi zorunluluğu' },
        { spk: 'M.10', cbddo: '3.1.2', note: 'Yazılım varlık envanteri yönetimi zorunluluğu' },
        { spk: 'M.11', cbddo: '3.5.1', note: 'Görevler ayrılığı ve personel güvenlik tedbirleri' },
        { spk: 'M.12', cbddo: '3.6.1', note: 'Fiziksel güvenlik — genel mekan tedbirleri' },
        { spk: 'M.12', cbddo: '3.6.2', note: 'Fiziksel güvenlik — sistem odası ve veri merkezi özelinde' },
        { spk: 'M.13', cbddo: '3.1.6', note: 'Ağ güvenliği mimarisi ve katmanlı koruma' },
        { spk: 'M.14', cbddo: '3.1.3', note: 'Yama yönetimi ve tehdit/zafiyet yönetimi' },
        { spk: 'M.14', cbddo: '3.1.5', note: 'Zararlı yazılım önleme: antivirüs ve e-posta güvenliği' },
        { spk: 'M.14', cbddo: '3.1.4', note: 'E-posta sunucusu güvenliği ve spam filtreleme' },
        { spk: 'M.15', cbddo: '3.1.12', note: 'Kimlik yönetimi: çok faktörlü doğrulama ve parola politikası' },
        { spk: 'M.15', cbddo: '3.2.1', note: 'Uygulama katmanında kimlik doğrulama gereksinimleri' },
        { spk: 'M.16', cbddo: '3.2.3', note: 'Yetkilendirme: en az yetki ve rol tabanlı erişim' },
        { spk: 'M.16', cbddo: '3.1.14', note: 'Erişim yönetimi: uzaktan çalışma erişim kontrolleri' },
        { spk: 'M.17', cbddo: '3.1.8', note: 'Veri bütünlüğü ve denetim izi kayıtları' },
        { spk: 'M.18', cbddo: '4.4.1', note: 'Kriptografik algoritma seçimi ve kullanımı' },
        { spk: 'M.18', cbddo: '4.4.2', note: 'Şifreleme ve kriptografik anahtar yönetimi' },
        { spk: 'M.19', cbddo: '3.5.1', note: 'Personel güvenliği: işe alım, görev değişikliği, ayrılış' },
        { spk: 'M.19', cbddo: '3.5.2', note: 'Personel güvenlik eğitimi ve farkındalık faaliyetleri' },
        { spk: 'M.21', cbddo: '3.5.3', note: 'Üçüncü taraf ve tedarikçi ilişkileri güvenliği' },
        { spk: 'M.22', cbddo: '3.1.8', note: 'Denetim izi kayıtları ve log yönetimi' },
        { spk: 'M.22', cbddo: '4.1.2', note: 'Kişisel veri erişim kayıtları yönetimi' },
        { spk: 'M.24', cbddo: '3.1.10', note: 'Bilgi güvenliği ihlali ve siber olay yönetimi' },
        { spk: 'M.25', cbddo: '3.2.6', note: 'Güvenli yazılım geliştirme yaşam döngüsü (SDLC)' },
        { spk: 'M.25', cbddo: '4.6.1', note: 'Bilgi sistemi edinimi ve tedarik güvenliği' },
        { spk: 'M.26', cbddo: '3.2.4', note: 'Uygulama güvenliği: dosya ve kaynak güvenliği' },
        { spk: 'M.26', cbddo: '3.2.5', note: 'Güvenli kurulum ve yapılandırma' },
        { spk: 'M.26', cbddo: '3.2.10', note: 'Kötücül işlemleri engelleme: XSS, SQLi, WAF' },
        { spk: 'M.26', cbddo: '3.4.4', note: 'API güvenliği: IoT ve uygulama API güvenlik kontrolü' },
        { spk: 'M.26', cbddo: '3.2.9', note: 'Uygulama iletişim güvenliği: TLS zorunluluğu' },
        { spk: 'M.27', cbddo: '3.1.13', note: 'İş sürekliliği ve felaket kurtarma planlaması' },
        { spk: 'M.28', cbddo: '2.4.1', note: 'Değişiklik yönetimi süreci' },
        { spk: 'M.29', cbddo: '2.3.2', note: 'İç denetim ve bilgi güvenliği denetimi' },
        { spk: 'M.29', cbddo: '3.1.11', note: 'İç denetim kapsamında sızma testleri ve güvenlik denetimleri' },
    ];

    for (const ref of crossRefs) {
        const sourceId = spkArticleRecords[ref.spk];
        const targetId = cbddoArticleRecords[ref.cbddo];
        if (!sourceId || !targetId) {
            console.warn(`⚠️  Atlandı: ${ref.spk} → ${ref.cbddo} (kayıt bulunamadı)`);
            continue;
        }
        await prisma.articleCrossRef.create({
            data: { sourceId, targetId, note: ref.note },
        });
        // Ters yönde de ekle
        await prisma.articleCrossRef.create({
            data: { sourceId: targetId, targetId: sourceId, note: ref.note },
        });
    }
    console.log(`✅ ${crossRefs.length} çapraz referans (${crossRefs.length * 2} yönlü) eklendi`);
    console.log('🎉 Regülasyon kütüphanesi hazır!');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
