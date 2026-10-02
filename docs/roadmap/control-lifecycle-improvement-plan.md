# Kontrol Yaşam Döngüsü İyileştirme Planı

Tarih: 2026-09-29  
Kapsam: Kontrol Envanteri → Yıllık Plan → Dönem Kontrolü → Kontrol Testi → Bulgu → Aksiyon → Bulgu Takip

## Amaç

Dört gelişmeyi tek bir bütün olarak uygulamak:

1. Akış Sağlığı ve Eksik Adım Merkezi
2. Durumların kaynaktan türetilmesi
3. Yıllık Plan taslak–onay–uygulama yaşam döngüsü
4. Kontrol sürümü ve etki analizi

Teknik uygulama sırası `Durum projeksiyonu → Yıllık Plan yaşam döngüsü → Sürüm etki analizi → Akış Sağlığı Merkezi` olacaktır. Akış Sağlığı Merkezi diğer üç modülün ürettiği kanonik sinyalleri tüketir; bu yüzden en son tamamlanır.

## Mevcut durum ve korunacak parçalar

- Ana Kontrol ile Dönem Kontrolü (`ControlYearScope`) ayrılmış durumda.
- Dönem Kontrolü kontrol tanımının sürümünü ve donmuş snapshot'ını taşıyor.
- Yıllık Plan taslağı revision ile eşzamanlılık korumasına sahip.
- Plan önizlemesi eklenecek/çıkarılacak/değişecek kapsamları ve üretilecek/iptal edilecek görevleri gösteriyor.
- Plan uygulaması tek transaction içinde çalışıyor.
- Dönem Kontrolü için “yeni Ana Kontrol sürümü var” ve sürümü uygulama akışı mevcut.
- Bulgu çözüm durumu ve hedef tarihi büyük ölçüde Aksiyon/Takip sonuçlarından türetiliyor.

Bu parçalar yeniden yazılmayacak; ortak projeksiyonlara bağlanıp eksik yaşam döngüleri tamamlanacak.

## Mimari kararlar

### A. Yazılan durum ile gösterilen durum ayrılacak

- İş akışının gerçek geçiş durumları veritabanında tutulabilir (`TASLAK`, `ONAY_BEKLIYOR`, `ONAYLANDI` gibi).
- Takvim veya alt kayıtlar üzerinden hesaplanabilen sunum durumları istemciden kabul edilmeyecek.
- API cevapları her kayıt için `displayStatus`, `statusReason` ve mümkünse `nextAction` döndürecek.
- Frontend kendi başına iş kuralı hesaplamayacak; yalnız API projeksiyonunu gösterecek.

### B. Yıllık Plan onayı dört göz prensibine uyacak

- Taslağı onaya gönderen kullanıcı aynı revision'ı onaylayamayacak.
- Onaylandıktan sonra taslak doğrudan düzenlenemeyecek.
- Değişiklik gerekirse gerekçeli olarak yeni revision açılacak.
- Yalnız onaylanmış revision uygulanabilecek.

### C. Etki analizi yazmadan önce çalışacak

- Ana Kontrol değişikliği kaydedilmeden önce etkilenecek yıllar, dönem kontrolleri ve görevler önizlenebilecek.
- Kaydetme Ana Kontrol sürümünü artıracak fakat uygulanmış dönem snapshot'larını sessizce değiştirmeyecek.
- Sürüm uygulaması dönem ve görev bazında açık kararla yapılacak.

### D. Akış Sağlığı kayıt kopyası olmayacak

- Sağlık bulguları ayrı ve elle güncellenen bir iş tablosuna dönüşmeyecek.
- Kaynak tablolardan sorgu anında üretilen, kodu sabit sinyaller olacak.
- Her sinyal `code`, `severity`, `entityType`, `entityId`, `message`, `nextAction`, `href` alanlarını taşıyacak.

## Faz 1 — Kanonik durum projeksiyonları

### Backend

- `WorkflowProjectionService` eklenecek.
- Aşağıdaki projeksiyonlar tek yerde tanımlanacak:
  - Ana Kontrol: mevcut yılın aktif Dönem Kontrolü varsa `AKTIF`, yoksa `PASIF`.
  - Dönem Kontrolü: kapsam durumu ve bağlı görevlerin durumundan türetilecek.
  - Kontrol Testi: mevcut state-machine durumu; gecikme ayrı `timingStatus` olarak hesaplanacak.
  - Bulgu: mutabakat durumu + türetilmiş çözüm durumu birlikte sunulacak.
  - Aksiyon: iş akışı durumu ve termin durumu ayrılacak; geçmiş tarih açık kaydı otomatik `GECIKMIS` gösterecek.
  - Bulgu Takip: değerlendirme/onay durumundan türetilecek.
- `status`, `resolutionStatus`, `closedDate` gibi türetilen alanların genel create/update DTO'larından yazılması kapatılacak; yalnız adlandırılmış geçiş endpoint'leri kullanacak.
- Eski enum değerleri API sınırında kanonik değerlere eşlenecek, geçmiş veriler kırılmayacak.

### API sözleşmesi

```json
{
  "displayStatus": "AKTIF",
  "statusReason": "2026 Yıllık Planında aktif kapsamda",
  "timingStatus": "ZAMANINDA",
  "nextAction": null
}
```

### Kabul ölçütleri

- Aynı kayıt liste, detay ve rapor ekranlarında farklı durum göstermez.
- Türetilmiş alanlar değiştirilmiş request payload'ıyla yazılamaz.
- Geçmiş tarihli açık Aksiyon `GECIKMIS` görünür; DB'ye ayrı OVERDUE yazılması gerekmez.
- Durum projeksiyonları birim testlerle sabitlenir.

## Faz 2 — Yıllık Plan onay yaşam döngüsü

### Veri modeli

`AnnualPlanDraftStatus`:

```text
OPEN → PENDING_APPROVAL → APPROVED → APPLIED
          └────────────→ CHANGES_REQUESTED → OPEN
```

`AnnualPlanDraft` üzerine:

- `submittedAt`, `submittedById`
- `approvedAt`, `approvedById`
- `decisionNote`
- `approvedRevision`

eklenecek.

### Endpoint'ler

- `POST /controls/annual-plan/:year/submit`
- `POST /controls/annual-plan/:year/approve`
- `POST /controls/annual-plan/:year/request-changes`
- Mevcut `preview` her durumda okunabilir; `apply` yalnız `APPROVED` ve aynı revision için çalışır.

### İş kuralları

- Eksik takvim/atama veya çözümlenmemiş görev kararı varsa onaya gönderilemez.
- Gönderen kendi planını onaylayamaz.
- Onay bekleyen/onaylanmış revision düzenlenemez.
- Onaydan sonra taslak değişmişse onay geçersizleşir.
- Bütün geçişler sabit audit action değerleriyle loglanır.

### Frontend

- Adım göstergesi: `Taslak → Önizleme → Onay → Uygulama`.
- Yetkiye ve duruma göre `Onaya Gönder`, `Onayla`, `Değişiklik İste`, `Planı Uygula` eylemleri.
- Karar notu ve karar geçmişi.

### Kabul ölçütleri

- Onaysız plan uygulanamaz.
- Kullanıcı kendi gönderdiği revision'ı onaylayamaz.
- Onaylanan revision ile uygulanan revision aynıdır.
- Eşzamanlı düzenleme 409 ile güvenli biçimde reddedilir.

## Faz 3 — Kontrol sürümü etki analizi

### Backend

- `POST /controls/:id/version-impact/preview`
- `POST /controls/:id/version-impact/apply`
- Önizleme şu grupları döndürür:
  - geçmiş/final dönemler: korunacak,
  - başlamamış görevler: güvenle güncellenebilir,
  - devam eden/onay bekleyen görevler: kullanıcı kararı gerekli,
  - final görevler: değiştirilemez.
- Her Dönem Kontrolü için karar: `KEEP_CURRENT`, `APPLY_TO_NOT_STARTED`, `APPLY_WITH_CONFIRMATION`.
- Uygulama revision/hash üzerinden iyimser eşzamanlılıkla çalışır.

### Frontend

- Ana Kontrol kaydedilmeden önce “Etki Analizi” özeti.
- Kaydetme sonrası yeni sürüm rozeti.
- Yıl/dönem bazında seçim yapılabilen uygulama ekranı.
- Eski ve yeni tanım/test adımları için alan bazlı fark görünümü.

### Kabul ölçütleri

- Ana Kontrol değişikliği geçmiş snapshot'ları değiştirmez.
- Final görev hiçbir seçenekle sessizce güncellenmez.
- Devam eden görev açık kullanıcı kararı olmadan değişmez.
- Uygulanan her sürüm kararı audit log'a yazılır.

## Faz 4 — Akış Sağlığı ve Eksik Adım Merkezi

### Sağlık sinyalleri — ilk sürüm

| Kod | Seviye | Koşul | Sonraki işlem |
|---|---|---|---|
| `PLAN_ASSIGNMENT_MISSING` | Kritik | Plandaki periyodik kontrolde kontrolcü eksik | Yıllık Plan atamalarına git |
| `PLAN_APPROVAL_PENDING` | Uyarı | Plan onay bekliyor | Plan karar ekranına git |
| `TEST_OVERDUE_NOT_STARTED` | Kritik | Plan tarihi geçmiş, test başlamamış | Testi aç |
| `TEST_APPROVAL_PENDING` | Uyarı | Test ikinci kontrolcü bekliyor | Onaylara git |
| `FINDING_WITHOUT_ACTION` | Kritik | Mutabakatı tamamlanmış açık bulgunun aksiyonu yok | Aksiyon ekle |
| `ACTION_OVERDUE` | Kritik | Açık aksiyonun termini geçmiş | Aksiyonu aç |
| `ACTION_COMPLETED_NO_FOLLOWUP` | Uyarı | Tamamlanmış aksiyon için takip yok | Takip oluştur |
| `FOLLOWUP_APPROVAL_PENDING` | Uyarı | Takip ikinci kontrolcü bekliyor | Takibi aç |
| `CONTROL_VERSION_OUTDATED` | Bilgi | Dönem snapshot'ı Ana Kontrolden eski | Etki analizine git |

### API

- `GET /workflow-health/summary?year=&scope=`
- `GET /workflow-health/items?code=&severity=&entityType=&page=`
- Kullanıcı yalnız RBAC/direktörlük kapsamında görebildiği kayıtları alır.

### Frontend

- Yeni menü: `Akış Sağlığı`.
- KPI'lar: Kritik, Uyarı, Onay Bekleyen, Gecikmiş, Sürümü Eski.
- Dallanmış kontrol zinciri görünümü ve filtrelenebilir sorun tablosu.
- Her satır gerçek sonraki işleme deep link verir.

### Kabul ölçütleri

- Bir sorun kaynağında çözüldüğünde sağlık merkezinden otomatik kaybolur.
- Sağlık merkezi hiçbir durumu elle değiştirmez.
- Kullanıcı yetkisi dışındaki kayıtları göremez.
- Liste sorguları N+1 üretmez ve sayfalanır.

## Teslimat dilimleri

1. **Dilim A — Projeksiyon çekirdeği:** durum hesaplayıcıları, API alanları, backend testleri.
2. **Dilim B — Plan onayı:** migration, state machine, endpoint'ler, audit, backend testleri.
3. **Dilim C — Plan UI:** adım göstergesi, karar eylemleri, component testleri.
4. **Dilim D — Sürüm etki API'si:** toplu preview/apply ve karar matrisi.
5. **Dilim E — Sürüm etki UI'si:** diff ve dönem seçim ekranı.
6. **Dilim F — Sağlık API'si:** sinyal motoru, RBAC, sayfalama ve sorgu testleri.
7. **Dilim G — Sağlık UI'si:** KPI, dallanmış görünüm, deep linkler.
8. **Dilim H — Uçtan uca kabul:** Envanterden Takibe mutlu yol ve kritik dallar.

Her dilim bağımsız test edilebilir ve önceki davranışı kırmadan yayınlanabilir.

## Test stratejisi

- Saf durum hesaplayıcıları için tablo güdümlü birim testleri.
- Yıllık Plan state-machine ve revision yarışları için service testleri.
- Gerçek PostgreSQL ile migration ve HTTP kabul testleri.
- Testing Library ile buton/yetki/durum görünürlüğü testleri.
- Playwright ile:
  1. kontrolü plana al,
  2. onaya gönder,
  3. farklı kullanıcıyla onayla,
  4. uygula,
  5. Ana Kontrolü güncelle,
  6. etki analiziyle yeni sürümü seçili döneme uygula,
  7. sağlık sinyalinin oluşup çözülmesini doğrula.

## Geriye uyumluluk ve dağıtım

- Migration önce nullable alanlarla uygulanacak.
- Mevcut `OPEN/APPLIED` taslaklar için backfill yapılacak; uygulananlar `APPLIED`, diğerleri `OPEN` kalacak.
- Eski Control/Action enum değerleri ilk aşamada silinmeyecek; projeksiyonda kanonikleştirilecek.
- Yeni UI açılmadan önce backend alanları yayınlanabilir.
- Gerekirse Akış Sağlığı menüsü feature flag ile açılabilir.

## Tamamlanma tanımı

- Dört modül aynı kanonik durum sözlüğünü kullanıyor.
- Yıllık Plan dört göz onayından geçmeden uygulanamıyor.
- Kontrol sürüm değişikliğinin etkisi kaydetme/uygulama öncesinde görünür.
- Akış Sağlığı Merkezi eksik sonraki adımları doğru deep linklerle listeliyor.
- Backend, frontend ve kritik E2E testleri yeşil.
- Tüm yazma işlemleri RBAC, DTO/FK doğrulaması ve audit log kurallarına uyuyor.
