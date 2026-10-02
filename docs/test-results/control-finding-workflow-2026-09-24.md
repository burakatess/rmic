# Kontrol → Test → Bulgu → Aksiyon → Takip Test Sonuçları

Tarih: 24 Eylül 2026  
Çalışma alanı: `/Users/burak/rmic_1`  
Test veritabanı: `grc_db_test` (geliştirme verisi kullanılmadı)

## Sonuç özeti

| Kontrol | Sonuç |
|---|---|
| Backend unit testleri | **GEÇTİ** — 39 suite, 471/471 test |
| Backend E2E testleri | **GEÇTİ** — 5 suite, 148/148 test |
| Workflow E2E | **GEÇTİ** — 93/93 test |
| Frontend unit/component testleri | **GEÇTİ** — 6 suite, 36/36 test |
| Playwright Chrome | **GEÇTİ** — 21/21; auth hata yolları, KZ/KD, envanter, risk/bulgu ilişkileri, aksiyon/takip filtreleri, kanıt kilidi, yıllık plan ve Excel eşitliği |
| Backend production build | **GEÇTİ** |
| Frontend TypeScript | **GEÇTİ** |
| Frontend production build | **GEÇTİ** — ağ erişimiyle Google Inter fontu indirildikten sonra |

Durum anlamları:

- **GEÇTİ:** Beklenti doğrudan otomatik testle çalıştırıldı ve geçti.
- **KISMİ:** Servis/yardımcı fonksiyon otomatik test edildi; aynı davranışın tarayıcı etkileşimi test edilmedi.
- **KALDI:** Çalıştırılan test beklentiyi karşılamadı veya uygulama beklenen iş kuralını zorlamıyor.
- **OTOMASYON YOK:** Mevcut repoda bu davranışı uçtan uca çalıştıran test/GUI test altyapısı yok. Kod incelemesi sonucu ayrıca yazıldı.
- **KARAR GEREKLİ:** Beklenen ürün kuralı tanımlanmadığı için geçti/kaldı kararı verilemez.

## İlk taramada bulunan ve bu çalışmada giderilen sorunlar

### 1. Mutabakat E2E testleri yeni maker/checker kuralıyla uyumsuzdu — GİDERİLDİ

Beş E2E hata mesajından dördünün ana nedeni aynı: testi hazırlayan kod, bulguyu İç Kontrol onayına gönderen `SYSTEM_ADMIN` kullanıcısına aynı mutabakatı onaylatıyor. Servis artık bunu `403 Kendi gönderdiğiniz mutabakatı onaylayamazsınız` ile engelliyor. Ayrı kullanıcıyla onaylama unit testte geçiyor. Beşinci hata, başarısız onay adımı yüzünden eksik kalan geçmiş kaydı sayımıdır.

E2E fixture'ları farklı gönderici ve onaylayıcı kullanacak şekilde düzeltildi. Geri gönderme, yeniden gönderme ve nihai onay zinciri geçiyor.

### 2. Login component testleri AuthProvider olmadan render ediyordu — GİDERİLDİ

`frontend/__tests__/login.test.tsx` içindeki iki test `LoginPage` bileşenini `AuthProvider` veya uygun `useAuth` mock'u olmadan render ediyor. Sonuç: `useAuth must be used within an AuthProvider`.

Testler gerçek `AuthProvider` ve `ToastProvider` ile kuruluyor; hata ve yeniden deneme davranışları component ve Chrome testlerinde geçiyor.

### 3. Çelişkili takip sonucu kombinasyonları backend tarafından kısıtlanmıyordu — GİDERİLDİ

`result` ve `resolutionOutcome` ayrı ayrı enum doğrulamasından geçiyor; aralarındaki uyumluluk doğrulanmıyor. Kod akışına göre aşağıdaki riskler var:

- `YETERSIZ + KAPATILDI`: aksiyon `YETERSIZ` kalırken bulgunun `resolutionStatus` alanı `KAPATILDI` yapılabilir.
- `YENI_AKSIYON_GEREKLI + KAPATILDI`: yeni açık aksiyon üretilirken çözüm durumu `KAPATILDI` yazılabilir.
- `YETERLI + YENI_AKSIYON_GEREKLI`: yeni aksiyon alanları zorunlu tutulur, fakat sonuç dalı `YETERLI` olduğu için yeni aksiyon oluşturulmayabilir.
- Sonuç olmadan `resolutionOutcome=KAPATILDI` onaysız güncellemede kabul edilebilir.

Karar matrisi service katmanında zorlanıyor. X01–X08 kabul testleri tüm çelişkili kombinasyonların 400 ile reddedildiğini doğruluyor.

### 4. Önem seviyesi ürün beklentisiyle çelişiyordu — GİDERİLDİ

Yeni bulgularda yalnız KZ/`CRITICAL` ve KD/`HIGH` kabul ediliyor. Eski `MEDIUM/LOW` kayıtları geriye dönük görüntülenmeye devam ediyor.

### 5. Günlük kontrol otomatik görev üretmiyor

Bu davranış testle doğrulandı ve kodda bilinçli karar olarak belgelenmiş: `DAILY` kontrol yıllık plan iş yükünde ayrı sayılıyor, otomatik test görevi üretmiyor.

## Senaryo matrisi

### Kontrol envanteri

| ID | Sonuç | Kanıt/not |
|---|---|---|
| K01 | GEÇTİ | Yeni kontrol formu gerçek Chrome oturumunda doldurulup envanter kaydı oluşturuldu. |
| K02 | GEÇTİ | Envantere eksik Tip sütunu/filtre seçeneği eklendi; BT ve BT dışı sonuç ayrımı Chrome'da doğrulandı. |
| K03 | GEÇTİ | Zorunlu kontrol kodu mesajı, temel form alanları, direktörlük seçimi ve Unicode içerik Chrome'da; DTO/bilinmeyen alan reddi HTTP E2E'de geçti. |
| K04 | GEÇTİ | DTO uzunluk sınırları ile Türkçe/Unicode içerik HTTP E2E'de doğrulandı. |
| K05 | GEÇTİ | Aynı risk-kontrol eşleşmesi kontrol ve risk detay ekranlarında Chrome ile çift yönlü doğrulandı. |
| K06 | GEÇTİ | Yeni kontrol formundaki senkron gönderim kilidi component testinde hızlı çift tıklamada tek API çağrısı üretti. |
| K07 | GEÇTİ | Pasif kontrolün döneme alınamaması backend'de; envanterde pasifleştirme ve yeniden aktifleştirme döngüsü Chrome'da geçti. |
| K08 | GEÇTİ | Tanım değişikliğinde version artışı ve dönem snapshot'ının donması unit testlerde geçti. |
| K09 | GEÇTİ | Yıl bazlı atama/takvim izolasyonu geçti. |

### Yıllık plan ve dönem seçimi

| ID | Sonuç | Kanıt/not |
|---|---|---|
| P01 | GEÇTİ | Dry-run/taslak gerçek scope/task yazmıyor. |
| P02 | GEÇTİ | Kaydedilmiş yıllık plan değişikliği sayfa yenilendiğinde aynı satırda “Değişti” olarak Chrome'da yeniden açıldı. |
| P03 | GEÇTİ | “Değişiklikleri Geri Al” taslak farkını sildi; iki uygulanmış dönem kontrolü listede korunarak Chrome'da doğrulandı. |
| P04 | GEÇTİ | Preview/apply ve explicit task kararları testleri geçti. |
| P05 | GEÇTİ | Aktif scope tekrar eklemede no-op ve task tekrar üretmeme geçti. |
| P06 | GEÇTİ | 2027 uygulamasının 2026'yı etkilememesi geçti. |
| P07 | GEÇTİ | Pasif kontrol yeni yıl kapsamına alınamadı. |
| P08 | GEÇTİ | Önceki yıldan kapsam/takvim/atama seçenekli kopyalama geçti. |
| P09 | GEÇTİ | Taslakta mevcut kontrolün üzerine yazılmaması geçti. |
| P10 | GEÇTİ | İki dönem kontrolü seçilip toplu kontrolcü atandı; seçim başarıdan sonra korundu. Karma görev kararları component/backend testlerinde geçti. |
| P11 | GEÇTİ | Yıllık plan arama filtresinden sonra “tümünü seç” yalnız görünür tek satırı seçti; Chrome'da doğrulandı. |
| P12 | GEÇTİ | Aynı kişinin iki kontrolcü rolüne atanması reddedildi. |
| P13 | GEÇTİ | Pasif ve yetkisiz ikinci kontrolcü reddedildi. |
| P14 | GEÇTİ | Eski revision 409 üretiyor ve yazma yapmıyor. |
| P15 | GEÇTİ | Önizleme sonrası değişiklik/outdated revision reddediliyor. |
| P16 | GEÇTİ | Yetki dışı kontroller planlama servisinde reddediliyor. |

### Periyodiklik ve görev üretimi

| ID | Sonuç | Kanıt/not |
|---|---|---|
| D01 | GEÇTİ | MONTHLY = 12 task. |
| D02 | GEÇTİ | QUARTERLY/Ocak = Ocak-Nisan-Temmuz-Ekim. |
| D03 | GEÇTİ | QUARTERLY/Şubat = Şubat-Mayıs-Ağustos-Kasım. |
| D04 | GEÇTİ | Tüm 12 üç aylık referans ay kombinasyonu geçti. |
| D05 | GEÇTİ | SEMI_ANNUAL/Şubat = Şubat-Ağustos. |
| D06 | GEÇTİ | Tüm altı aylık referans ay eşleşmeleri geçti. |
| D07 | GEÇTİ | ANNUAL seçilen tek referans ayı üretiyor. |
| D08 | GEÇTİ | WEEKLY yılın cumalarını üretiyor. |
| D09 | GEÇTİ | DAILY otomatik task üretmiyor; bilinçli mevcut davranış. |
| D10 | GEÇTİ | AD_HOC tarih/takvim ayrımı unit testlerde geçti. |
| D11 | GEÇTİ | Ay sonu hafta sonu son iş gününe çekiliyor. Resmî tatil hesabı yok. |
| D12 | GEÇTİ | Artık yıl/Şubat dağılımı geçti. |

### Dönem değişikliği, kapsam ve sürüm

| ID | Sonuç | Kanıt/not |
|---|---|---|
| S01 | GEÇTİ | Periyodiklik değişikliği bekleyen taskları diff ile düzenliyor. |
| S02 | GEÇTİ | Yeni periyot taskları üretiliyor, korunacak durumlar korunuyor. |
| S03 | GEÇTİ | Referans ayı periodKey farkıyla uygulanıyor. |
| S04 | GEÇTİ | Devam eden task için açık karar olmadan atama değişikliği bloklanıyor. |
| S05 | GEÇTİ | Onaylı/tamamlanmış task değişiklikten korunuyor. |
| S06 | GEÇTİ | Bekleyen tasklar KAPSAM_DISI oluyor, silinmiyor. |
| S07 | GEÇTİ | KEEP kararı explicit decision testinde geçti. |
| S08 | GEÇTİ | CANCEL kararı kapsam dışı durumuna geçiriyor. |
| S09 | GEÇTİ | Eksik karar uygulanmayı blokluyor. |
| S10 | GEÇTİ | Devam eden/onay bekleyen durumlar karar gerektiren görevler olarak ele alınıyor. |
| S11 | GEÇTİ | REMOVED scope aynı kayıtla reaktive ediliyor. |
| S12 | GEÇTİ | Yalnız KAPSAM_DISI taskın yeniden etkinleşmesi geçti. |
| S13 | GEÇTİ | Yeni sürüm snapshot güncelleme ve açık onay kuralları geçti. |
| S14 | GEÇTİ | Preview sonrası task durum değişimi conflict/rollback üretiyor. |

### Kontrol testi — bulgu var/yok ve onay

| ID | Sonuç | Kanıt/not |
|---|---|---|
| T01 | GEÇTİ | BEKLIYOR test başlatılıyor. |
| T02 | GEÇTİ | Yanlış durumdan complete engelleniyor. |
| T03 | GEÇTİ | Taslak metni, kanıt özeti ve PDF kaydı kontrol testi sayfası kapatılıp yeniden açıldığında Chrome'da korundu. |
| T04 | GEÇTİ | Eski contentVersion conflict üretiyor. |
| T05 | GEÇTİ | BULGUSU_YOK → TAMAMLANDI, bulgu zorunlu değil. |
| T06 | GEÇTİ | BULGUSU_VAR fakat bağlı bulgu yok → 400. |
| T07 | GEÇTİ | Bağlı bulgudan sonra BULGUSU_VAR tamamlandı. |
| T08 | GEÇTİ | Aynı onaylı teste bağlı iki bulgu, kontrol özeti ile Bulgular & Aksiyonlar sekmesinde Chrome ile doğrulandı. |
| T09 | GEÇTİ | Bağlı bulgu varken BULGUSU_YOK reddediliyor. |
| T10 | GEÇTİ | Aynı kontrolün açık bulgusuna referansla tamamlandı. |
| T11 | GEÇTİ | Başka kontrol bulgusu reddedildi. |
| T12 | GEÇTİ | Kapalı bulgu referansı reddedildi. |
| T13 | GEÇTİ | İkinci kontrolcü onayı ONAYLANDI yaptı. |
| T14 | GEÇTİ | Testi yapan kendi onayını veremedi. |
| T15 | GEÇTİ | Atanmamış kontrolcü reddedildi; admin istisnası atanan kişi kuralını aşmıyor. |
| T16 | GEÇTİ | Gerekçeli iade GERI_GONDERILDI yaptı. |
| T17 | GEÇTİ | Boş iade gerekçesi 400. |
| T18 | GEÇTİ | Geri gönderilen test yeniden tamamlanabildi. |
| T19 | GEÇTİ | Onaylı testte kanıt görünür kaldı; yükleme arayüzü kaldırıldı ve kilit gerekçesi Chrome'da gösterildi. |
| T20 | GEÇTİ | Admin final onayı iptal etti; admin dışı 403 aldı. |
| T21 | GEÇTİ | Onay sonrası kontrol effectiveness eşlemesi unit akışında doğrulandı. |
| T22 | GEÇTİ | Eski test sonradan onaylansa da kontrol özeti completedAt'e göre en yeni onaylı testte kaldı. |
| T23 | GEÇTİ | En yeni final onay iptalinde kontrol özeti önceki onaylı teste döndü; hiç onay kalmazsa NOT_TESTED/null üretiliyor. |

### Bulgu ve mutabakat

| ID | Sonuç | Kanıt/not |
|---|---|---|
| B01 | GEÇTİ | controlTestId bağlı bulgu oluşturuldu. |
| B02 | GEÇTİ | Doğrudan bulgu ve FK kontrolleri backend'de; bağlı risk bulgu detay ekranında Chrome ile doğrulandı. |
| B03 | GEÇTİ | Yeni kayıtta API ve UI yalnız KZ/CRITICAL ile KD/HIGH kabul ediyor; legacy MEDIUM/LOW görüntülenebilir kalıyor. Frontend kabul testi geçti. |
| B04 | GEÇTİ | TASLAK → MUTABAKATA_GONDERILDI. |
| B05 | GEÇTİ | Birim cevabı → IC_KONTROL_ONAYINA_GONDERILDI. |
| B06 | GEÇTİ | Maker/checker aktörleri ayrıldı; mutabakat workflow E2E paketi 72/72 ve genişletilmiş paket 78/78 geçti. |
| B07 | GEÇTİ | Geri gönderme ve tekrar gönderme geçti. |
| B08 | GEÇTİ | Kendi gönderdiği mutabakatı onaylama 403. |
| B09 | GEÇTİ | Aşama atlama 400. |
| B10 | GEÇTİ | Gerekçeli iptal HTTP E2E'de workflow IPTAL yaptı ve denetim izi bıraktı. |
| B11 | GEÇTİ | Açık aksiyonlu bulgu iptal edildi; açık aksiyon ve takipler IPTAL oldu, yeni aksiyon/takip engellendi. |
| B12 | GEÇTİ | Genel update ile CLOSED/VERIFIED geçişi reddediliyor. |

### Aksiyonlar

| ID | Sonuç | Kanıt/not |
|---|---|---|
| A01 | GEÇTİ | Aksiyon ve otomatik takip oluştu. |
| A02 | GEÇTİ | Çok aksiyonlu bulgu kapanış senaryosu geçti. |
| A03 | GEÇTİ | Eksik açıklama, owner ve tarih doğrulamaları geçti. |
| A04 | GEÇTİ | Aksiyonla otomatik takip ve plannedDate bağı geçti. |
| A05 | GEÇTİ | Termin uzatma ortak domain servisine gidiyor ve açık takibi güncelliyor. |
| A06 | GEÇTİ | Çoklu aksiyonda hedef tarih en geç termin; silme sonrası kalan en geç termine yeniden hesaplandı. |
| A07 | GEÇTİ | Admin ve denetçi oturumlarında “Benim Aksiyonlarım” farklı sahiplerin yalnız kendi kaydını göstermesiyle Chrome'da geçti. |
| A08 | GEÇTİ | TAMAMLANDI aksiyonun onaylı kapanış sayılmaması geçti. |
| A09 | GEÇTİ | Gecikmiş aksiyon KPI/list filtresi geçmiş ve gelecek tarihli iki aksiyonla Chrome'da doğrulandı. |
| A10 | GEÇTİ | Kapanmış aksiyonun alan/durum değişikliği engelleniyor. |
| A11 | GEÇTİ | Delete RBAC ile birlikte bağlı takip/geçmiş kayıtlarının korunup actionId bağının null olması E2E'de geçti. |
| A12 | GEÇTİ | Son açık aksiyon silinince bulgu açık kaldı ve targetResolutionDate null yapıldı. |

### Bulgu takip çalışması

| ID | Sonuç | Kanıt/not |
|---|---|---|
| F01 | GEÇTİ | Takip oluşturma ve benzersiz kimlik akışları geçti. |
| F02 | GEÇTİ | Aksiyona bağlı takip otomatik oluştu. |
| F03 | GEÇTİ | Başka bulgu aksiyonu bağlanamadı. |
| F04 | GEÇTİ | Birim cevabı, güncel durum, İKS değerlendirmesi ve sonuç notu takip formu yeniden açıldığında Chrome'da korundu. |
| F05 | GEÇTİ | Sonuçsuz onay reddedildi. |
| F06 | GEÇTİ | İkinci kontrolcü olmadan onay reddedildi. |
| F07 | GEÇTİ | Değerlendiren kendi değerlendirmesini onaylayamadı. |
| F08 | GEÇTİ | Atanmamış kullanıcı, admin dahil, onaylayamadı. |
| F09 | GEÇTİ | Gerekçeli ikinci kontrolcü değişikliği backend E2E'de; gerekçe bulgu Tarihçe sekmesinde Chrome ile doğrulandı. |
| F10 | GEÇTİ | Sonuç kaydı tek başına aksiyonu kapatmıyor; yan etki onayda. |
| F11 | GEÇTİ | YETERLI onayı bağlı aksiyonu KAPATILDI yaptı. |
| F12 | GEÇTİ | Tek aksiyonlu bulgu otomatik kapandı. |
| F13 | GEÇTİ | İki aksiyonun biri kapanınca bulgu açık kaldı. |
| F14 | GEÇTİ | Tüm aksiyonlar kapanınca bulgu kapandı. |
| F15 | GEÇTİ | YETERSIZ sonucu aksiyonu YETERSIZ yaptı, bulgu kapanmadı. |
| F16 | GEÇTİ | YETERSIZ onayı sonrası ikinci takip oluşturuldu; YETERLI onayı aksiyon ve bulguyu kapattı. |
| F17 | GEÇTİ | Yeni aksiyon gerekli sonucu gerçek girdilerle aksiyon oluşturdu. |
| F18 | GEÇTİ | Eksik yeni aksiyon alanları 400 ve placeholder oluşmadı. |
| F19 | GEÇTİ | Yeni aksiyon oluşurken orijinal aksiyon durumu korunuyor. |
| F20 | GEÇTİ | Kısmi kapanış PARTIALLY_CLOSED yaptı ve açık aksiyonu korudu. |
| F21 | GEÇTİ | İki aksiyonlu tek E2E zincirinde PARTIALLY_CLOSED durumundan tüm aksiyonlar kapanınca CLOSED'a geçildi. |
| F22 | GEÇTİ | ERTELENDI + yeni tarih bulguyu açık tutup testDate'i güncelledi. |
| F23 | GEÇTİ | Tarihsiz erteleme 400. |
| F24 | GEÇTİ | `YETERSIZ + ERTELENDI` yalnız gelecekteki tarihle kabul ediliyor; geçmiş tarih HTTP E2E'de 400. |
| F25 | GEÇTİ | Aynı takipte iki erteleme kaydı geçmişte korundu; bulgu testDate son tarihe güncellendi. |
| F26 | GEÇTİ | Termin cron'u backend'de; ertelenmiş takip normal listede, gecikmiş takip gecikme filtresinde Chrome ile doğrulandı. |
| F27 | GEÇTİ | DEVAM_EDIYOR bulguyu/aksiyonu kapatmadı ve log ekledi. |
| F28 | GEÇTİ | Gerekçeli ret → düzeltme → yeniden onay → aksiyon/bulgu kapanışı HTTP E2E'de geçti. |
| F29 | GEÇTİ | Atomik claim ve kaybedilen yarış yan etkisizliği unit testlerde geçti. |
| F30 | GEÇTİ | Onaylı takipte sonuç/aksiyon/çözüm/durum kilitli. |
| F31 | GEÇTİ | Onaylı takipte zararsız metin güncellemesi yan etki üretmiyor. |
| F32 | GEÇTİ | Sıfır aksiyonlu bulgu otomatik kapanmıyor. |

### Çelişkili sonuç kombinasyonları

| ID | Sonuç | Kanıt/not |
|---|---|---|
| X01 | GEÇTİ | `YETERLI` ile kullanıcı tarafından çözüm sonucu gönderilmesi API'de reddediliyor; sonuç sistemce türetiliyor. |
| X02 | GEÇTİ | `YETERLI + KISMEN_KAPATILDI` HTTP E2E'de 400; sonuç açık aksiyonlara göre sistemce türetiliyor. |
| X03 | GEÇTİ | `YETERSIZ + KAPATILDI` HTTP E2E'de 400 ile reddediliyor. |
| X04 | GEÇTİ | `YENI_AKSIYON_GEREKLI + KAPATILDI` HTTP E2E'de 400 ile reddediliyor. |
| X05 | GEÇTİ | `YETERLI + YENI_AKSIYON_GEREKLI` HTTP E2E'de 400. |
| X06 | GEÇTİ | `YENI_AKSIYON_GEREKLI + ERTELENDI` HTTP E2E'de 400; yalnız eşleşen çözüm sonucu kabul ediliyor. |
| X07 | GEÇTİ | Değerlendirme sonucu olmadan `KAPATILDI` gönderimi HTTP E2E'de 400. |
| X08 | GEÇTİ | Sonuçsuz `ERTELENDI`, tarih verilse de HTTP E2E'de 400. |

### Bulgu kapanışı ve yeniden açma

| ID | Sonuç | Kanıt/not |
|---|---|---|
| C01 | GEÇTİ | Aksiyonsuz bulgu kapatılamadı. |
| C02 | GEÇTİ | Açık/yetersiz aksiyon varken kapatılamadı. |
| C03 | GEÇTİ | Yalnız TAMAMLANDI aksiyon kapalı sayılmadı. |
| C04 | GEÇTİ | Tüm aksiyonlar KAPATILDI olunca status/resolution/closedDate yazıldı. |
| C05 | GEÇTİ | Zaten kapalı bulgu tekrar kapatılamıyor. |
| C06 | GEÇTİ | Gerekçeli reopen IN_PROGRESS yaptı ve closedDate'i temizledi. |
| C07 | GEÇTİ | Açık bulgu veya gerekçesiz reopen reddedildi. |
| C08 | GEÇTİ | Kapanış → gerekçeli yeniden açma → yeni aksiyon/takip → ikinci kapanış tek HTTP E2E zincirinde geçti. |
| C09 | GEÇTİ | Onaylı takibin tekrarlı onayı idempotent ve yan etkisiz. |
| C10 | GEÇTİ | Kapalı bulguya aksiyon/takip ekleme HTTP E2E'de 400; gerekçeli yeniden açma sonrası aksiyon ekleme 201. |

### Otomatik takip, görünüm, güvenlik ve hata durumları

| ID | Sonuç | Kanıt/not |
|---|---|---|
| Q01 | GEÇTİ | Vadesi gelen uygun aksiyon için takip üretimi kod/test kapsamında. |
| Q02 | GEÇTİ | Açık takip varken duplicate üretmeme kuralı mevcut. |
| Q03 | GEÇTİ | Advisory lock/transaction aynı cron çalışmasını tekilleştiriyor. |
| Q04 | GEÇTİ | Cron TAMAMLANDI/COMPLETED aksiyona doğrulama takibi üretiyor ve aksiyon durumunu geri almıyor. |
| Q05 | GEÇTİ | Cron sorgusu kapalı ve workflow'u IPTAL bulguları otomatik olarak dışlıyor. |
| Q06 | GEÇTİ | En yeni tarihsel test sonucu kontrol detayında “Etkin Değil” olarak Chrome'da gösterildi; eski testin geç onayı backend E2E'de özeti değiştirmedi. |
| Q07 | GEÇTİ | Onaylı bulgulu testin `INEFFECTIVE` özeti kontrol envanterinde Chrome ile “Etkin Değil” olarak doğrulandı. |
| Q08 | GEÇTİ | Aynı fixture için envanter, kontrol detayı ve dönem raporu iki açık bulguyu tutarlı gösterdi. |
| Q09 | GEÇTİ | Çoklu ilişki backend E2E'de; filtreli rapor ile Excel'de iki benzersiz bulgu satırı olduğu Chrome testinde doğrulandı. |
| Q10 | GEÇTİ | Ay + direktörlük birleşik filtresindeki iki bulgu ile indirilen Excel'in ilk sayfasındaki iki kayıt/organizasyon Chrome testinde birebir karşılaştırıldı. |
| Q11 | GEÇTİ | Token yok 401, VIEWER yazmaları 403, rol matrisi E2E'de çalıştı. |
| Q12 | GEÇTİ | Backend onay yarışı atomik; Playwright bağlantı kesilmesi sonrası giriş retry senaryosu Chrome'da geçti. |
| Q13 | GEÇTİ | Playwright geçersiz/süresi dolmuş tokenı temizleyip korumalı sayfadan girişe yönlendirdi. |
| Q14 | GEÇTİ | 10 HTTP E2E: kimlik doğrulama, beş izinli tür, MIME/uzantı eşleşmesi, sıfır bayt, 15 MB ve duplicate dosya geçti; frontend politikası da testli. |
| Q15 | GEÇTİ | AuditLog ve append-only FindingStatusHistory E2E'de; kalıcı geçmiş kaydının bulgu Tarihçe sekmesinde görünmesi Chrome'da geçti. |

## On iki uçtan uca hikâyenin durumu

| Hikâye | Sonuç | Not |
|---|---|---|
| 1. Temiz kontrol / bulgu yok | GEÇTİ | Test TAMAMLANDI, ikinci kontrolcüyle ONAYLANDI. |
| 2. Tek bulgu kapanışı | GEÇTİ | Test→bulgu→aksiyon→takip→maker/checker mutabakatı→kapanış geçti. |
| 3. Çok aksiyonlu bulgu | GEÇTİ | İlk kapanışta açık, tümü kapanınca kapalı. |
| 4. Yetersiz çalışma | GEÇTİ | YETERSIZ sonrası ikinci takip üretildi; YETERLI onayı aksiyon ve bulguyu kapattı. |
| 5. Yeni aksiyon | GEÇTİ | Yeni aksiyon ve otomatik takip oluştu. |
| 6. Erteleme | GEÇTİ | YETERSIZ + ERTELENDI onayı, yeni tarihte ikinci takip üretimi, YETERLI değerlendirme ve bulgu kapanışı aynı E2E zincirinde geçti. |
| 7. Kısmi kapanış | GEÇTİ | İlk yeterli takipte PARTIALLY_CLOSED, kalan aksiyon onayında CLOSED aynı zincirde geçti. |
| 8. Test iadesi | GEÇTİ | İade, düzeltme ve yeniden tamamlama geçti. |
| 9. Mutabakat iadesi | GEÇTİ | Ayrı maker/checker aktörleriyle iade, düzeltme, tekrar gönderme ve nihai onay geçti. |
| 10. Tekrarlayan sorun | GEÇTİ | Açık bulguya referans geçti; kapalı/başka kontrol referansı reddedildi. |
| 11. Yeniden açılış | GEÇTİ | Kapanış, gerekçeli yeniden açma, yeni aksiyon/takip ve ikinci kapanış aynı E2E zincirinde geçti. |
| 12. Plan değişikliği | GEÇTİ | Bekleyen/devam eden/onaylı görev kararları ve concurrency geçti. |

## Çalıştırılan komutlar

```text
npm run test -w backend -- --runInBand
npm run test -w frontend -- --runInBand
npm run test:e2e:workflow -w backend -- --runInBand
npm run test:e2e -w backend -- --runInBand
npm run test:e2e:chrome -w frontend
npm run build -w backend
npx tsc --noEmit -p frontend/tsconfig.json
npm run build -w frontend
```

## Kalan otomasyon kapsamı

Matriste `KISMİ`, `KALDI` veya `OTOMASYON YOK` durumunda senaryo kalmadı. Kullanıcı arayüzü gerektiren akışlar 21 Chrome testiyle; iş kuralları ve veri bütünlüğü 148 backend E2E ve 471 backend unit testiyle otomatik olarak doğrulandı. Edge için aynı Playwright paketi `npm run test:e2e:edge -w frontend` komutuyla tanımlıdır; çalıştırıldığı makinede Microsoft Edge kurulu olmalıdır.

## Onaylanan geliştirme planı — 25 Eylül 2026

1. Mevcut mutabakat ve login test altyapısını yeşile getir.
2. Takip karar matrisini backend ve UI'da zorla.
3. Gerekçeli ret, düzeltme ve yeniden gönderme döngüsünü ekle.
4. Bulgu iptalinde açık Aksiyon/Takip kayıtlarını `IPTAL` yap; kapalı/iptal Bulguda yeni işi engelle.
5. `TAMAMLANDI` Aksiyon için doğrulama takibi üret ve cron kapsamını tamamla.
6. Yeni Bulgu önem derecesini KZ/KD ile sınırla; eski Orta/Düşük kayıtları görüntüle.
7. Dosya yüklemeyi 15 MB ve PDF/DOCX/XLSX/PNG/JPEG ile sınırla; boş dosyayı reddet.
8. Eksik backend API kabul testlerini ekle.
9. Eksik frontend component testlerini ekle.
10. Playwright Chromium CI ile yerel Chrome/Edge profillerini kur ve kritik zincirleri otomatikleştir.
11. Tüm paketleri yeniden çalıştırıp bu matrisi yalnız otomatik kanıtla güncelle.

### İlerleme günlüğü

- 2026-09-25: Plan ve domain kararları onaylandı; `CONTEXT.md` ve ADR-0001 oluşturuldu.
- 2026-09-25: Mutabakat maker/checker E2E fixture'ları düzeltildi; workflow paketi 72/72 geçti.
- 2026-09-25: Login testleri gerçek AuthProvider/ToastProvider ile düzeltildi; frontend 25/25 geçti.
- 2026-09-25: Takip karar matrisi için sonuçsuz kapanış, çelişkili sonuçlar ve geçmiş tarih erteleme korumaları eklendi.
- 2026-09-25: `YETERLI` sonucunda Bulgu durumu açık aksiyonlardan türetiliyor; kısmi ve tam kapanış E2E'de geçti.
- 2026-09-25: Gerekçeli ret → düzeltme → yeniden onay zinciri eklendi; workflow paketi 78/78 geçti.
- 2026-09-25: Bulgu iptali açık aksiyon/takipleri atomik olarak IPTAL yapıyor; kapalı/iptal bulguya yeni iş engeli ve gerekçeli yeniden açma E2E'leri eklendi; workflow paketi 81/81 geçti.
- 2026-09-25: Otomatik takip kapalı/iptal bulguları atlıyor; TAMAMLANDI/COMPLETED aksiyona doğrulama takibi üretip aksiyon durumunu koruyor. Backend birim paketi 471/471 geçti.
- 2026-09-25: Yeni bulgu UI'si KZ/KD ile sınırlandı. 15 MB PDF/DOCX/XLSX/PNG/JPEG politikası backend ve frontend'e uygulandı; upload E2E 10/10, frontend 35/35 geçti.
- 2026-09-25: Playwright eklendi; CI Chromium, yerel Chrome ve Edge profilleri tanımlandı. Yerel Chrome'da giriş, yetkisiz yönlendirme, bağlantı retry, geçersiz token ve KZ/KD senaryoları 4/4 geçti. Chromium indirmesi CDN zaman aşımına uğradı; yapılandırma hazır.
- 2026-09-25: X02/X05/X06/X08 doğrudan HTTP vakaları ve iptalde tarihsel kapanmış kayıtları koruma testi eklendi.
- 2026-09-25: Kontrol özeti en yeni onaylı teste göre hesaplanıyor ve final iptalinde önceki teste dönüyor; aksiyon silme hedef tarih/ilişki bütünlüğü testleri eklendi.
- 2026-09-25: Yetersizden ikinci takibe geçiş, ikinci yaşam döngüsüyle yeniden kapanış ve çoklu erteleme geçmişi E2E'leri eklendi; workflow 91/91, tüm backend E2E 146/146 geçti.
- 2026-09-25: Kontrol metin alanlarına uzunluk sınırları ve Unicode kabul testi eklendi; yeni kontrol formunda çift gönderim kilidi component testiyle doğrulandı.
- 2026-09-25: Kontrol etkinlik etiketinin envanter görünümü ve bulgu tarihçesinin detay ekranı Chrome testlerine eklendi.
- 2026-09-25: Son doğrulama: backend unit 471/471, frontend unit/component 36/36, workflow E2E 92/92, tüm backend E2E 147/147; backend ve frontend production build geçti.
- 2026-09-25: BT/BT dışı Tip sütunu ve filtresi eklendi. Risk-kontrol çift yönlü görünümü, tek testte çoklu bulgu, filtreliyken tümünü seç, ay+direktörlük raporunun Excel eşitliği ve pasif/aktif döngüsü Chrome kapsamına alındı; toplu paket 12/12 geçti.
- 2026-09-25: Kontrol oluşturma, yıllık plan taslağını yeniden açma/geri alma, toplu kontrolcü atama, kontrol testi kanıtını yeniden açma ve kilitleme, aksiyon/takip filtreleri, doğrudan risk ilişkisi ve ikinci kontrolcü geçmişi Chrome kapsamına alındı.
- 2026-09-25: Erteleme → yeni takip → sonraki YETERLI değerlendirme → kapanış tek backend E2E zincirine alındı. Nihai doğrulama: Chrome 21/21, workflow 93/93, tüm backend E2E 148/148, backend unit 471/471, frontend unit/component 36/36; TypeScript ve iki production build geçti.
