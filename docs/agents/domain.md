# Domain Dokümanları

Bu repo tek ortak domain bağlamı kullanır.

## Okuma sırası

Kontrol, dönem, test, bulgu, aksiyon veya takip alanında çalışmadan önce:

1. Varsa kökteki `CONTEXT.md` dosyasını oku.
2. `docs/adr/` altındaki ilgili mimari kararları oku.
3. `docs/test-results/control-finding-workflow-2026-09-24.md` içindeki ilgili senaryoları ve güncel sonuçları oku.

## Dil birliği

Kod, test adı, UI etiketi ve dokümantasyonda `CONTEXT.md` içindeki kanonik terimler kullanılır. Aynı kavram için yeni eş anlamlılar üretilmez.

Yeni bir ürün kararı mevcut davranışı değiştiriyorsa karar `docs/adr/` altında belgelenir. Henüz kararlaştırılmamış davranış test raporunda `KARAR GEREKLİ` kalır.
