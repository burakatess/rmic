# Test Durumları

| Durum | Anlamı | Çıkış koşulu |
|---|---|---|
| `GEÇTİ` | Beklenen davranış otomatik testle doğrulandı. | İlgili test ve gerekli regresyon paketi başarılı. |
| `KALDI` | Davranış beklentiyi karşılamıyor veya mevcut test başarısız. | Test-first düzeltme uygulanıp bütün ilgili testler geçmeli. |
| `KISMİ` | Davranışın yalnız bir katmanı doğrulandı. | Eksik API, component veya browser katmanı otomatikleştirilmeli. |
| `OTOMASYON YOK` | Senaryo için güvenilir otomatik doğrulama bulunmuyor. | Uygun seviyede davranış testi eklenmeli. |
| `KARAR GEREKLİ` | Beklenen ürün davranışı kesinleşmedi. | Kullanıcı kararı belgelenip kabul testi yazılmalı. |

Durumlar yalnız kanıtla değiştirilir. Kod incelemesi tek başına `GEÇTİ` sayılmaz.
