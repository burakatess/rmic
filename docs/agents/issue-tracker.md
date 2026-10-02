# Çalışma Takibi

Bu geliştirme çalışmasının ana takip kaynağı:

- `docs/test-results/control-finding-workflow-2026-09-24.md`

Her senaryo satırı bağımsız bir kabul kriteridir. Çalışma sırası rapordaki plan dilimlerine göre yürütülür.

Bir senaryo tamamlandığında:

1. Önce davranışı kamuya açık arayüzden doğrulayan otomatik test eklenir.
2. Testin önce başarısız olduğu, uygulama değişikliğinden sonra geçtiği doğrulanır.
3. Rapordaki durum `GEÇTİ` olarak değiştirilir.
4. Kanıt/not alanına test dosyası ve doğrulanan davranış yazılır.
5. İlgili unit, E2E, TypeScript ve build kontrollerinin sonucu ilerleme günlüğüne eklenir.

GitHub Issues bu çalışma için birincil takip sistemi değildir. Kullanıcı ayrıca isterse rapordaki bağımsız plan dilimleri GitHub issue'larına dönüştürülebilir.
