# ADR-0001: Kontrol–Bulgu–Takip kabul otomasyonu

Tarih: 2026-09-25  
Durum: Kabul edildi

## Bağlam

`docs/test-results/control-finding-workflow-2026-09-24.md` içinde kalan, kısmi ve otomasyonsuz senaryolar bulunuyor. Bazı sonuç alanları birbiriyle çelişebiliyor; UI ve backend önem derecesinde farklı davranıyor; tarayıcı E2E altyapısı yok.

## Karar

- Geliştirme davranış odaklı TDD ile dikey dilimler hâlinde yürütülecek.
- Backend kabul testleri gerçek `grc_db_test` PostgreSQL veritabanını ve kamuya açık HTTP endpoint'lerini kullanacak.
- Frontend component davranışları Testing Library ile test edilecek.
- Kritik uçtan uca akışlar Playwright Chromium ile CI'da; yerel Chrome ve Edge komutlarıyla uyumluluk amacıyla çalıştırılacak.
- Takip sonucu matrisi ve dosya politikası `CONTEXT.md` içindeki değişmez kurallara uyacak.
- Ana ilerleme kaydı test sonuçları dokümanıdır; bir satır yalnız otomatik kanıt üretildiğinde `GEÇTİ` olur.

## Sonuçlar

- Çelişkili takip sonucu kombinasyonları API seviyesinde reddedilecek.
- Bulgu sonucu aksiyonların gerçek durumundan türetilecek.
- Açık alt kayıtları bulunan Bulgu iptal edilebilir; açık Aksiyon ve takipler `IPTAL` durumuna geçirilirken kapanmış/onaylanmış geçmiş korunacak.
- Kapalı/iptal Bulgular cron ve yeni çalışma girişlerinden dışlanacak.
- Virüs taramasının production'da zorunlu olup olmayacağı sonraki karara bırakıldı.
