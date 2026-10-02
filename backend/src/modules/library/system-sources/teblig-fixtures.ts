// Test verileri: SPK Tebliği (VII-128.10) yerel PDF'inin `pdftotext -layout` çıktısından GERÇEK sayfalar 1–5
// (yazdırma başlığı/altbilgisi dahil). Otomatik üretildi; girinti paragraf başlangıcını belirler, elle biçimlendirmeyin.

export const TEBLIG_P1 = `13 Mart 2025 PERŞEMBE                                                                                                                   23.12.2025 00:12




              13 Mart 2025 PERŞEMBE                                Resmî Gazete                                               Sayı : 32840

                                                                        TEBLİĞ
                      Sermaye Piyasası Kurulundan:
                               BİLGİ SİSTEMLERİ YÖNETİMİNE İLİŞKİN USUL VE ESASLAR TEBLİĞİ
                                                       (VII-128.10)

                                                                 BİRİNCİ BÖLÜM
                                                                Başlangıç Hükümleri
                       Amaç
                       MADDE 1- (1) Bu Tebliğin amacı, 2 nci maddede sayılan Kurum, Kuruluş ve Ortaklıkların bilgi sistemlerinin
              yönetimine ilişkin usul ve esasları belirlemektir.
                       Kapsam
                       MADDE 2- (1) Aşağıdaki Kurum, Kuruluş ve Ortaklıklar, bu Tebliğ hükümlerine uymakla yükümlüdürler:
                       a) Borsa İstanbul A.Ş.,
                       b) Borsalar ve piyasa işleticileri ile teşkilatlanmış diğer pazar yerleri,
                       c) Emeklilik yatırım fonları,
                       ç) İstanbul Takas ve Saklama Bankası A.Ş.,
                       d) Merkezi Kayıt Kuruluşu A.Ş.,
                       e) Portföy saklayıcısı kuruluşlar,
                       f) Sermaye Piyasası Lisanslama Sicil ve Eğitim Kuruluşu A.Ş.,
                       g) Sermaye piyasası kurumları,
                       ğ) Halka açık ortaklıklar,
                       h) Türkiye Sermaye Piyasaları Birliği,
                       ı) Türkiye Değerleme Uzmanları Birliği,
                       i) Kripto Varlık Hizmet Sağlayıcılar.
                       (2) Birinci fıkrada sayılan Kurum, Kuruluş ve Ortaklıklardan, 6/12/2012 tarihli ve 6362 sayılı Sermaye
              Piyasası Kanununun 136 ncı maddesi uyarınca banka ve sigorta şirketleri ile 21/11/2012 tarihli ve 6361 sayılı Finansal
              Kiralama, Faktoring, Finansman ve Tasarruf Finansman Şirketleri Kanunu uyarınca finansal kiralama, faktoring,
              finansman ve tasarruf finansman şirketlerinin bilgi sistemlerinin, kendi özel mevzuatlarında belirlenen ilkeler
              çerçevesinde yönetilmesi, bu Tebliğde öngörülen yükümlülüklerin yerine getirilmesi hükmündedir.
                       Dayanak
                       MADDE 3- (1) Bu Tebliğ, 6/12/2012 tarihli ve 6362 sayılı Sermaye Piyasası Kanununun 128 inci maddesinin
              birinci fıkrasının (h) bendine dayanılarak hazırlanmıştır.
                       Tanımlar ve kısaltmalar
                       MADDE 4- (1) Bu Tebliğde geçen;
                       a) API: Bir yazılımın başka bir yazılımda tanımlanmış işlevleri kullanabilmesi için oluşturulmuş uygulama
              programlama ara yüzünü,
                       b) Bilgi güvenliği ihlali: Bilgi sistemlerinin veya bu sistemler tarafından işlenen bilginin gizlilik, bütünlük
              veya erişilebilirliğinin ihlal edilmesini veya teşebbüste bulunulmasını, siber olayı,
                       c) Bilgi sistemleri: Bilginin işlendiği, iletildiği ve saklandığı yazılım, donanım ve iletişim altyapısı ile bunlarla
              etkileşimde bulunan insan kaynağı, faaliyet ve süreçlerin tümünü,
                       ç) Bilgi varlığı: Kurum, Kuruluş ve Ortaklıkların Kanundan ve Kanuna ilişkin alt düzenlemelerden
              kaynaklanan görevlerini yerine getirmeleri esnasında kullandıkları veri ile bunların üretildiği, işlendiği, iletildiği ve
              saklandığı donanım ve yazılım unsurlarını,
                       d) Birincil sistemler: Kurum, Kuruluş ve Ortaklıkların Kanundan ve Kanuna ilişkin alt düzenlemelerden
              kaynaklanan görevlerini yerine getirmeleri için gerekli bilgilerin elektronik ortamda güvenli ve istenildiği an erişime
              imkân sağlayacak şekilde kaydedilmesini ve kullanılmasını sağlayan altyapı, donanım, yazılım ve veriden oluşan
              sistemin tamamını,
                       e) Bütünlük: Bilginin doğruluğu ve tamlığını koruma özelliğini,
                       f) Çok faktörlü kimlik doğrulama: Kimlik doğrulama işleminin; kişinin bildiği, kişinin sahip olduğu veya
              kişinin biyometrik karakteristiği olan doğrulama faktörleri arasından iki veya daha fazla farklı faktörün kullanılarak
              gerçekleştirilmesini,
                       g) Denetim izi: Bilgi sistemleri aracılığıyla gerçekleşen işlemlerin ve bilgi güvenliği ihlal olaylarının
              başlangıcından bitimine kadar adım adım takip edilmesini sağlayacak kayıtlar ile bu kayıtlar üzerinde yapılan işlemleri
              gösteren kayıtları,

https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                                                                  Sayfa 1 / 16
`;

export const TEBLIG_P2 = `13 Mart 2025 PERŞEMBE                                                                                                                   23.12.2025 00:12



                       ğ) Erişilebilirlik: Bilginin yetkili kullanıcı, uygulama veya sistem tarafından talep edildiğinde erişilebilir ve
              kullanılabilir olma özelliğini,
                       h) Gizlilik: Bilgi sistemlerine ve bilgiye sadece yetkili kullanıcı, uygulama veya sistem tarafından
              erişilebilmesini,
                       ı) Güvenli alan: Bilgi işleme, iletişim ve depolama donanımlarını barındıran alanı,
                       i) Hassasiyet: Kurum, Kuruluş ve Ortaklıkların bünyesinde saklanan, müşterilere ait olan ve üçüncü kişilerce
              ele geçirilmesi halinde ilgili kişinin zarar görmesine, dolandırılmasına ya da sahte işlem yapılmasına sebep olabilecek
              verinin niteliğini,
                       j) İkincil sistemler: Birincil sistemler aracılığı ile yürütülen faaliyetlerde bir kesinti olması halinde, bu
              faaliyetlerin iş sürekliliği planında belirlenen kabul edilebilir kesinti süreleri içerisinde sürdürülür hale getirilmesini ve
              Kanunda ve Kanuna ilişkin alt düzenlemelerde Kurum, Kuruluş ve Ortaklıklar için tanımlanan sorumlulukların yerine
              getirilmesi açısından gerekli olan bütün bilgilere kesintisiz ve istenildiği an erişilmesini sağlayan birincil sistemin tüm
              yedeklerini,
                       k) Kanun: 6/12/2012 tarihli ve 6362 sayılı Sermaye Piyasası Kanununu,
                       l) Kişisel veri: 24/3/2016 tarihli ve 6698 sayılı Kişisel Verilerin Korunması Kanununda tanımlanan kişisel
              veriyi,
                       m) Kontrol: Bilgi sistemleri süreçleriyle ilgili olarak gerçekleştirilen ve iş hedeflerinin gerçekleştirilmesi,
              istenmeyen olayların belirlenmesi, engellenmesi ve düzeltilmesine ilişkin yeterli derecede güvence oluşturmayı
              hedefleyen politikalar, prosedürler, uygulamalar ve organizasyonel yapıların tamamını,
                       n) Kripto varlık hizmet sağlayıcı: Platformları, kripto varlık saklama hizmeti sağlayan kuruluşları ve kripto
              varlıkların ilk satış ya da dağıtımı dâhil olmak üzere kripto varlıklarla ilgili olarak hizmet sağlamak üzere belirlenmiş
              diğer kuruluşları,
                       o) Kritiklik: Bilgi varlığının, Kurum, Kuruluş ve Ortaklıkların iş hedeflerine ulaşmasındaki önemini veya
              gerekliliğini belirten niteliğini,
                       ö) Kullanıcı: Kurum, Kuruluş ve Ortaklıkların bilgi sistemlerinde kendisi adına hesap açılan Kurum, Kuruluş
              ve Ortaklıklar personelini, dışarıdan hizmet sağlayıcının personelini veya Kurum, Kuruluş ve Ortaklıkların
              müşterisini,
                       p) Kurul: Sermaye Piyasası Kurulunu,
                       r) Kurum, Kuruluş ve Ortaklıklar: 2 nci maddede sayılan kurum, kuruluş ve ortaklıkları,
                       s) Kurumsal SOME: SOME Tebliği kapsamında Kurum, Kuruluş ve Ortaklıklar tarafından kurulan Kurumsal
              Siber Olaylara Müdahale Ekibini,
                       ş) Platform: Kripto varlık alım satım, ilk satış ya da dağıtım, takas, transfer, bunların gerektirdiği saklama ve
              belirlenebilecek diğer işlemlerin bir veya daha fazlasının gerçekleştirildiği kuruluşları,
                       t) Politika: Kurum, Kuruluş ve Ortaklıkların hedef ve ilkelerini ortaya koyan ve yönetim kurulu veya üst
              yönetimi tarafından onaylanmış dokümanı,
                       u) Prosedür: Süreçlere ilişkin işlem ve eylemleri tanımlayan dokümanı,
                       ü) Saklama kuruluşu: Kripto varlık saklama hizmetinde bulunmak üzere Kurulca yetkilendirilmiş kuruluşu,
                       v) Sektörel SOME: SOME Tebliği kapsamında Kurul bünyesinde kurulan Sektörel Siber Olaylara Müdahale
              Ekibini,
                       y) Sermaye piyasası kurumları: Kanunun 35 inci maddesinde sayılan kurumları,
                       z) SOME Rehberi: Ulaştırma ve Altyapı Bakanlığı tarafından yayımlanmış en güncel “Kurumsal SOME
              Kurulum ve Yönetim Rehberi” dokümanını,
                       aa) SOME Tebliği: 11/11/2013 tarihli ve 28818 sayılı Resmî Gazete'de yayımlanan Siber Olaylara Müdahale
              Ekiplerinin Kuruluş, Görev ve Çalışmalarına Dair Usul ve Esaslar Hakkında Tebliği,
                       bb) Süreç: Bir işin yapılış ve üretiliş biçimini oluşturan sürekli işlem ve eylemleri,
                       cc) Uçtan uca güvenli iletişim: İletişime konu veriye sadece alıcısının erişebilmesi amacıyla, verinin gönderen
              tarafından sadece alıcının çözebileceği şekilde şifrelenerek iletilmesini,
                       çç) USOM: Bilgi Teknolojileri ve İletişim Kurumu bünyesinde yer alan Ulusal Siber Olaylara Müdahale
              Merkezini,
                       dd) Üçüncü taraf: Kurum, Kuruluş ve Ortaklıklar ile müşteriler dışında kalan gerçek veya tüzel kişileri,
                       ee) Üst yönetim: Yönetim kurulu tarafından belirlenen kişi ya da grubu, yönetim kurulu tarafından belirleme
              yapılmadığı durumlarda ise Kurum, Kuruluş ve Ortaklıkların en üst yetkilisini,
                       ff) Varlık sahibi: Bilgi varlıklarına yönelik güvenlik gereksinimlerini belirleyen ve bu gereksinimlere uyumu
              gözeterek bilgi varlığının idamesi ve güvenliğinden sorumlu olan kişi veya birimi,
                       ifade eder.
                                                                    İKİNCİ BÖLÜM
                                                             Bilgi Sistemlerinin Yönetilmesi

https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                                                                  Sayfa 2 / 16
`;

export const TEBLIG_P3 = `13 Mart 2025 PERŞEMBE                                                                                                                   23.12.2025 00:12



                       Bilgi sistemleri yönetiminin oluşturulması ve hayata geçirilmesi
                       MADDE 5- (1) Bilgi sistemlerinin yönetimi, kurumsal yönetim uygulamalarının bir parçası olarak ele alınır.
              Kurum, Kuruluş ve Ortaklıkların operasyonlarını istikrarlı, rekabetçi, gelişen ve güvenli bir çizgide sürdürebilmesi
              için bilgi sistemlerine ilişkin stratejilerinin iş hedefleri ile uyumlu olması sağlanır, bilgi sistemleri yönetimine ilişkin
              unsurlar yönetsel hiyerarşi içerisinde yer alır ve bilgi sistemlerinin güvenlik, performans, etkinlik, doğruluk ve
              sürekliliğini hedefleyerek doğru yönetimi için gerekli finansman ve insan kaynağı tahsis edilir. Bu amaçla oluşturulan
              bilgi sistemleri stratejisi ilgili taraflara duyurulur. Bilgi sistemleri stratejisinin iş hedefleriyle uyumu gözetilir ve
              gerektiğinde iyileştirici faaliyetler uygulanır.
                       (2) Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerinin yönetimine ilişkin kontrolleri tesis eder, bunlara ilişkin
              politika, prosedür ve süreçleri yazılı hale getirir, düzenli olarak gözden geçirerek iş alanında gerçekleşen değişiklikler
              veya teknolojik gelişmeler doğrultusunda günceller, yönetim kurulu veya üst yönetim tarafından onaylanmasını ve
              ilgililere duyurulmasını sağlar.
                       (3) Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri yönetimi konusunda rol ve sorumlukları belirleyerek yazılı
              hale getirir. Üst yönetim tarafından görevler ayrılığı ilkesi çerçevesinde görevlendirmeler yapılır.
                       Bilgi güvenliği politikası
                       MADDE 6- (1) Bilgi sistemlerinin kurulması, işletilmesi, yönetilmesi ve kullanılmasına ilişkin; bilginin
              gizliliğinin, bütünlüğünün ve gerektiğinde erişilebilir olmasının sağlanmasına yönelik olarak bilgi güvenliği politikası
              üst yönetim tarafından hazırlanır ve yönetim kurulu tarafından onaylanır. Onaylanan bilgi güvenliği politikası
              personele ve ilgili diğer taraflara duyurulur.
                       (2) Bilgi güvenliği politikası, bilgi güvenliği süreçlerinin işletilmesi için gerekli rollerin, sorumlulukların
              belirlenmesini ve görev tanımlarının yapılmasını, hedeflerin belirlenmesini, bilgi sistemlerine ilişkin risklerin
              yönetilmesine dair süreçlerin oluşturulmasını, kontrollerin tesis edilmesini, değerlendirilmesini ve gözetimini kapsar.
                       (3) Bilgi güvenliği politikası yılda en az bir defa gözden geçirilir; iş ihtiyaçları, değişen tehdit ve risklere göre
              güncellenir.
                       Üst yönetimin gözetimi ve sorumluluğu
                       MADDE 7- (1) Bilgi güvenliği politikasının ve bilgi sistemleri stratejisinin uygulanması üst yönetim
              tarafından gözetilir. Bilgi güvenliği politikası kapsamında bilgi sistemleri kontrollerinin etkin, yeterli ve uyumlu bir
              şekilde tesis edilmesi, değerlendirilmesi ve gözetimi yönetim kurulunun sorumluluğundadır.
                       (2) Yeni bilgi sistemlerinin kullanıma alınmasına ilişkin kritik projeler üst yönetim tarafından gözden geçirilir
              ve bunlara ilişkin risklerin yönetilebilirliği göz önünde bulundurularak onaylanır. Kritik projelerin Kurum, Kuruluş ve
              Ortaklıkların iç kaynaklarıyla veya dışarıdan hizmet alımı yoluyla gerçekleştirilmesine bakılmaksızın personel
              uzmanlığının, projelerin teknik gereksinimlerini karşılayabilecek nitelikte olması esastır. Bu yapıyı desteklemek üzere
              oluşturulacak yönetsel rol ve sorumluluklar açıkça belirlenir.
                       (3) Kurum, Kuruluş ve Ortaklıkların üst yönetimi, bilgi güvenliği önlemlerinin uygun düzeye getirilmesi
              hususunda gereken kararlılığı gösterir ve bu amaçla yürütülecek faaliyetlere yönelik olarak yeterli kaynağı tahsis eder.
              Üst yönetim, asgari olarak aşağıdaki faaliyetlerin yerine getirilmesini temin edecek mekanizmaları kurar:
                       a) Bilgi güvenliği politikalarının ve tüm sorumlulukların yılda en az bir kez gözden geçirilmesi ve
              onaylanması.
                       b) Bilgi sistemlerine ilişkin potansiyel risklerin etkileriyle birlikte tespit edilmesi ve söz konusu risklerin
              azaltılmasına yönelik faaliyetlerin tanımlanmasını içeren risk yönetimi sürecinin oluşturulması.
                       c) Bilgi güvenliği ihlallerinin takip edilmesi ve yılda en az bir kez değerlendirilmesi.
                       ç) Personele bilgi güvenliği gereksinimleri, riskler ve güncel tehditler konusunda bilgi düzeyini artırmaya
              yönelik eğitimlerin rol ve sorumluluklarına uygun şekilde yılda en az bir kez verilmesi.
                       (4) Bilgi sistemlerine ilişkin risklerin yönetimi amacıyla tesis edilen kontroller, Kurum, Kuruluş ve
              Ortaklıkların organizasyonel ve yönetsel yapıları içerisinde fiili olarak işleyecek şekilde yerleştirilir ve işlerliğine
              ilişkin gözetim ve denetim süreçleri tesis edilir.
                       (5) Bilgi sistemleri güvenliğine ilişkin kontrollerin gereklerinin yerine getirilmesinden ve takibinden sorumlu
              olan, bilgi sistemleri güvenliğiyle ilgili riskler ve bu risklerin yönetimi hususunda üst yönetime rapor veren, bilgi
              sistemleri iç kontrol, bilgi sistemleri denetimi, bilgi sistemleri yönetişimi ve kontrollerinin tesisi veya bilgi güvenliği
              alanlarının herhangi birinde yeterli teknik bilgiye ve en az 5 yıl tecrübeye sahip bir bilgi güvenliği sorumlusu
              belirlenir. Bilgi güvenliği sorumlusunun, bilgi sistemleri yönetimine ilişkin gerekliliklerin yerine getirilmesi
              hususunda herhangi bir görevinin bulunmaması ve üst yönetime bağlı çalışması sağlanır.
                       (6) Asgari olarak kritik iş süreçlerini ve faaliyetlerini destekleyen bilgi sistemlerinin sürekliliğini sağlamak
              üzere iş sürekliliği planının bir parçası olan bilgi sistemleri süreklilik planı hazırlanır.
                       Bilgi sistemleri risk yönetimi
                       MADDE 8- (1) Kurum, Kuruluş ve Ortaklıklar, bilgi sistemlerine ilişkin riskleri belirlemek, ölçmek, izlemek,
              işlemek ve raporlamak üzere risk yönetimi süreç ve prosedürlerini tesis eder ve güncelliğini sağlar.

https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                                                                  Sayfa 3 / 16
`;

export const TEBLIG_P4 = `13 Mart 2025 PERŞEMBE                                                                                                                   23.12.2025 00:12



                       (2) Bilgi sistemlerine ilişkin risklerin yönetilmesinde asgari olarak aşağıdaki hususlar değerlendirmeye alınır:
                       a) Bilgi teknolojilerindeki hızlı gelişmeler sebebiyle rekabetçi ortamda gelişmelere uymamanın olumsuz
              sonuçları, gelişmelere uyum konusundaki zorluklar ve mevzuatın değişebilmesi.
                       b) Bilgi sistemleri kullanımının öngörülemeyen hatalara ve hileli işlemlere zemin hazırlayabilmesi.
                       c) Bilgi sistemlerinde dışarıdan hizmet alımından dolayı dış hizmeti veren kuruluşlara bağımlılığın
              oluşabilmesi.
                       ç) İş ve hizmetlerin önemli oranda bilgi sistemlerine bağlı hale gelmesi.
                       d) Bilgi sistemleri üzerinden gerçekleştirilen işlemlerin, verilerin ve denetim izlerine ilişkin tutulan kayıtların
              güvenliğinin sağlanmasının zorlaşması.
                       (3) Bilgi sistemlerine ilişkin risk analizi, risk işleme ve gözetim süreçleri işletilir. Risk analizi yılda en az bir
              defa gerçekleştirilir. Bilgi sistemlerinde meydana gelecek önemli değişikliklerde tekrarlanır. Risk analizinde tüm bilgi
              varlıkları değerlendirmeye alınır. Risk yönetiminde asgari olarak aşağıdaki faaliyetler yerine getirilir:
                       a) Risk değerlendirme kriterlerinin belirlenmesi.
                       b) Risklerin analiz edilmesi ve risk seviyelerinin belirlenmesi.
                       c) Bilgi sistemleri stratejisine ve mevzuata aykırılık teşkil etmeyecek şekilde, iş ve bilgi güvenliği hedefleriyle
              uyumlu risk kabul kriterleri ile risk işleme seçeneklerinin belirlenmesi ve üst yönetime onaylatılması.
                       ç) İyileştirici faaliyetlerin gerekli iş gücü, kaynak ve zaman bilgisiyle kayıt altına alınması.
                       d) İyileştirici faaliyetlerin ve risk analizinin üst yönetime onaylatılması.
                       e) İyileştirici faaliyetlerin takibi ve bir sonraki analizde ele alınması.
                       (4) Bilgi sistemlerinin güvenlik açıklarına ve bilgi güvenliği tehditlerine ilişkin bilgi zamanında elde edilir,
              değerlendirilir ve belirlenen riske karşı uygun tedbirler alınır.
                       (5) Kurum, Kuruluş ve Ortaklıkların bilgi sistemleri süreçleri ve kullanıcılara sundukları hizmetlere yönelik
              risk analizi yılda en az bir defa gerçekleştirilir, süreç ve hizmetlerde meydana gelebilecek önemli değişikliklerde
              tekrarlanır.
                       (6) Kurum, Kuruluş ve Ortaklıkların bilgi sistemleri, bilgi güvenliğine ilişkin gerekliliklerin yerine getirilmesi
              hususunda herhangi bir görevi bulunmayan ve sızma testi konusunda ulusal veya uluslararası belgeye sahip gerçek
              veya tüzel kişiler tarafından yılda en az bir kez sızma testine tabi tutulur. Kurul gerekli gördüğü takdirde Kurum,
              Kuruluş ve Ortaklıkların sızma testi yaptırmasını isteyebilir.
                       (7) Sızma testinde EK-1’de yer alan usul ve esaslar uygulanır. Kurum, Kuruluş ve Ortaklıklar tarafından
              yaptırılan sızma testleri sonucunda hazırlanan sızma testi raporları tamamlanmasını müteakip bir ay içinde ve her
              durumda en geç takip eden yılın 31 Ocak tarihine kadar Kurula gönderilir. Son bildirim gününün resmi tatil gününe
              denk gelmesi halinde, resmi tatil gününü takip eden ilk iş günü son bildirim tarihi kabul edilir.
                                                                     ÜÇÜNCÜ BÖLÜM
                                                       Bilgi Sistemleri Kontrollerine İlişkin Esaslar
                       Bilgi sistemleri kontrollerinin tesisi ve yönetilmesi
                       MADDE 9- (1) Kurum, Kuruluş ve Ortaklıkların üst yönetimi, bilgi güvenliği politikası kapsamında bilgi
              sistemlerinden kaynaklanan güvenlik risklerinin yeterli düzeyde yönetilmesi, bilgi varlıklarının gizlilik, bütünlük ve
              erişilebilirliğinin sağlanması ve bilgi sistemlerinin etkin işletimi amacıyla gerekli süreçlerin ve kontrollerin
              geliştirilmesini sağlar.
                       (2) Her sürecin sahibi, rol ve sorumlulukları açık bir şekilde tanımlanır.
                       (3) Süreçlerin performansının ölçülebilmesi için ölçüm kriterleri tanımlanır.
                       (4) Her sürecin hedef ve amaçları tanımlanır ve performansı ölçülür.
                       (5) Süreçler ve kontroller hakkında ilgili personelin yeterli eğitim alması sağlanır.
                       (6) Bilgi sistemleri süreçleri ve kontrollerine ilişkin etkinlik, yeterlilik ve uyumluluk ile öngörülen risk ya da
              risklerin etkisini azaltmaya yönelik faaliyetler devamlı bir şekilde takip edilir ve değerlendirilir. Değerlendirme
              neticesinde tespit edilen önemli kontrol eksiklikleri ve yapılan çalışmalar yılda en az bir kez üst yönetime raporlanır ve
              gerekli önlemlerin alınması sağlanır.
                       Varlık yönetimi
                       MADDE 10- (1) Kurum, Kuruluş ve Ortaklıklar, sahip oldukları bilgi varlıklarını belirler, bunların envanterini
              oluşturur, güncelliğini sağlar. Envanterde varlığa ilişkin asgari olarak aşağıdaki hususlar kayıt altına alınır:
                       a) Tanımı.
                       b) Edinim tarihi, garanti ve bakım bilgisi.
                       c) Lisans bilgisi veya seri numarası.
                       ç) Konumu.
                       d) Sahibi.
                       e) Kullanıcısı.
                       f) Güvenlik sınıfı.

https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                                                                  Sayfa 4 / 16
`;

export const TEBLIG_P5 = `13 Mart 2025 PERŞEMBE                                                                                                                     23.12.2025 00:12



                        g) Yedekleme bilgisi.
                        (2) Bilgi varlıklarının güvenlik sınıfının belirlenmesi için bir kılavuz oluşturulur ve üst yönetimce onaylanır.
              Sınıflandırma esnasında asgari olarak varlıkların gizlilik, bütünlük ve erişilebilirlik gereksinimlerini, kritikliği ve
              hassasiyeti dikkate alınır. Her sınıftaki varlığa ilişkin temel koruma ve güvenlik önlemleri belirlenir ve yazılı hale
              getirilir. Sınıflandırma sürecine veriler de dâhil edilir.
                        (3) Taşınabilir cihaz ve ortamlar, içerdiği bilgilerin güvenlik sınıfına göre kaybolma, hırsızlık ve kopyalama
              gibi risklere karşı korunur. Güvenlik sınıfı yüksek bilgileri veya bu bilgilere erişim sağlayan yazılımları barındıran
              taşınabilir cihaz ve ortamlar izinsiz kurum dışına çıkarılmaz.
                        (4) Bilgi varlıklarına ilişkin uygun kullanım prosedürleri geliştirilir, yazılı hale getirilir, üst yönetim tarafından
              onaylanır ve ilgili personele imza karşılığı duyurulur.
                        (5) Kullanımdan kaldırılan donanımsal varlıklara güvenli silme veya imha işlemleri uygulanır ve kayıt altına
              alınır. Kullanımdan kaldırılan yazılım ve uygulamalara erişimler engellenir ve gerekirse bu yazılım ve uygulamalar
              arşivlenerek sistemden silinir.
                        (6) Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri kapsamında sundukları hizmetler için hizmet envanterini
              oluşturur ve güncelliğini sağlar. Envanterde asgari olarak aşağıdaki hususlar kayıt altına alınır:
                        a) Hizmetin tanımı.
                        b) Kullanıcıları.
                        c) Sahibi.
                        ç) Hizmet seviyesi taahhütleri.
                        d) Bağımlılıkları.
                        (7) Kurum, Kuruluş ve Ortaklıklar, bilgi sistemleri kapsamındaki süreçler için süreç envanterini oluşturur ve
              güncelliğini sağlar. Envanterde asgari olarak aşağıdaki hususlar kayıt altına alınır:
                        a) Sürecin tanımı.
                        b) Sahibi.
                        c) Girdi ve çıktıları.
                        ç) Bağımlılıkları.
                        Görevler ayrılığı ilkesi
                        MADDE 11- (1) Bilgi sistemleri üzerinde hata, eksiklik veya kötüye kullanım risklerini azaltmak için görev ve
              sorumluluk alanları ayrılır. Bu kapsamda ayrılması gereken görev ve sorumluluklar belirlenir, yılda en az bir kez
              gözden geçirilir ve güncelliği sağlanır.
                        (2) Bilgi sistemleri süreçleri tasarlanırken kritik işlemlerin tek bir personele veya dış hizmeti sunan kuruluşa
              bağımlı olmaması göz önünde bulundurulur.
                        (3) Görevlerin tam ve uygun şekilde ayrılmasının mümkün olmadığı durumlarda oluşabilecek hata, eksiklik
              veya kötüye kullanımı önlemeye ve tespit etmeye yönelik telafi edici kontroller tesis edilir.
                        Fiziksel ve çevresel güvenlik
                        MADDE 12- (1) Kritik bilgi sistemlerinin konumlandırıldığı veri merkezlerinin veya güvenli alanların
              yetkisiz fiziksel erişime, değişen ortam koşullarına, altyapı hizmeti kesintilerine ve felaketlere karşı korunması için
              asgari olarak aşağıdaki kontroller uygulanır:
                        a) Fiziksel giriş ve çıkışlar gerekçelendirilir, yetkilendirilir, kaydedilir ve izlenir. Erişim kontrol mekanizmaları
              devreye alınır. Erişim hakları düzenli olarak gözden geçirilir.
                        b) Yetkisiz giriş denemelerini anlık izleyecek mekanizmalar kurulur.
                        c) Kesintisiz güç kaynaklarıyla enerji beslemesi yapılır.
                        ç) İklimlendirme kontrolü ile uygun ortam koşullarında çalışma sağlanır.
                        d) Yangın, sel, deprem, patlama ve diğer doğal ya da insan kaynaklı felaketlerden kaynaklanan hasara karşı
              fiziksel koruma tasarlanır ve uygulanır.
                        e) Destekleyici altyapı hizmetlerinin (iklimlendirme, kesintisiz güç kaynağı, jeneratör, yangın söndürme
              sistemi ve benzeri) yılda en az bir kere olmak üzere düzenli bakımı gerçekleştirilir.
                        f) Kurum, Kuruluş ve Ortaklıkların personeli olmayan kurulum, bakım ve onarım hizmetlerini gerçekleştirecek
              kişilere çalışma öncesi gizlilik sözleşmesi imzalatılır. Bu kişilere Kurum, Kuruluş ve Ortaklıklarda bulundukları süre
              boyunca refakat edilir.
                        g) Destekleyici altyapı hizmetlerinin, uygun çalışma koşullarının dışına çıkılması halinde, alarm üretmesi ve
              ilgilileri bilgilendirmesi sağlanır.
                        ğ) Kritik bilgi sistemlerinin konumlandırıldığı veri merkezleri veya güvenli alanlar ve çevresi kameralar ile
              sürekli olarak izlenir ve bilgi güvenliği gereklilikleri göz önünde bulundurularak belirlenen süre boyunca görüntü
              kayıtları saklanır. Bu süre; Borsa İstanbul A.Ş., Merkezi Kayıt Kuruluşu A.Ş., İstanbul Takas ve Saklama Bankası
              A.Ş., geniş yetkili aracı kurumlar ve kripto varlık hizmet sağlayıcılar için asgari bir yıldır. Kayıt mekanizmasının 7/24
              esasına göre çalışması, hareket algılama özelliğine sahip olması ve kör nokta kalmayacak şekilde kayıt alması sağlanır.

https://www.resm#gazete.gov.tr/esk#ler/2025/03/20250313-8.htm                                                                                    Sayfa 5 / 16
`;
