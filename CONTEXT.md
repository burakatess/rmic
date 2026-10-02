# RMIC GRC Domain Bağlamı

## Kanonik terimler

- **Ana Kontrol:** Yıllardan bağımsız kontrol envanteri kaydı.
- **Dönem Kontrolü:** Bir Ana Kontrolün belirli yıldaki dondurulmuş kapsam ve takvim kaydı.
- **Kontrol Testi:** Dönem Kontrolü için üretilen, kanıt ve sonuç taşıyan görev.
- **Bulgu:** Kontrol testi veya başka bir kaynakta tespit edilen, mutabakat ve çözüm süreci izlenen kayıt.
- **Aksiyon:** Bir Bulgunun giderilmesi için sorumlu ve termin taşıyan düzeltici iş.
- **Bulgu Takip Çalışması:** Bir Aksiyonun yeterliliğini değerlendiren ve ikinci kontrolcü onayına giren kayıt.
- **Değerlendiren:** Takip sonucunu ve kanıt değerlendirmesini kaydeden kullanıcı.
- **İkinci Kontrolcü:** Değerlendiren kişiden farklı olan ve takip sonucunu onaylayan kullanıcı.

## Değişmez iş kuralları

- Değerlendiren kişi kendi Kontrol Testini, mutabakat gönderimini veya Bulgu Takip Çalışmasını onaylayamaz.
- Yeni veya güncellenen Bulgularda önem derecesi yalnız KZ (`CRITICAL`) veya KD (`HIGH`) olabilir. Eski `MEDIUM/LOW` kayıtları görüntülenebilir.
- Aksiyonun `TAMAMLANDI` olması onaylı kapanış değildir. Onaylı takip sonucu yeterli olduğunda Aksiyon `KAPATILDI` olur.
- Bulgu kapanışı kullanıcı tarafından serbestçe seçilmez; bütün Aksiyonların onaylı kapanış durumundan türetilir.
- Kapalı veya iptal edilmiş Bulguya yeni Aksiyon ya da Bulgu Takip Çalışması eklenemez. Yeni çalışma için önce gerekçeli yeniden açma gerekir.

## Takip sonuç matrisi

| Değerlendirme | Bulgu sonucu |
|---|---|
| `YETERLI` | Sistem açık aksiyonlara göre `KISMEN_KAPATILDI` veya `KAPATILDI` türetir. |
| `YETERSIZ` | `DEVAM_EDIYOR` veya gelecekteki tarihle `ERTELENDI`. |
| `YENI_AKSIYON_GEREKLI` | `YENI_AKSIYON_GEREKLI`; yeni aksiyon alanları zorunludur. |

Sonuç olmadan takip tamamlanamaz ve onaya gönderilemez.

## Dosya kanıt politikası

- Azami boyut 15 MB.
- PDF, DOCX, XLSX, PNG ve JPEG kabul edilir.
- Uzantı ve MIME türü birlikte doğrulanır; boş dosya reddedilir.
- Aynı dosya tekrar yüklenebilir ve ayrı depolama adıyla saklanır; mevcut dosyanın üzerine yazılmaz.
- Virüs taraması şu an yüklemeyi engellemez; zorunlu production davranışı daha sonra kararlaştırılacaktır.
