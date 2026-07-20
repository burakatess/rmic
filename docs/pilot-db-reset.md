# Pilot DB Hazırlığı ve Veri Temizleme

## Amaç

Gerçek kullanıcı pilot testlerine, geliştirme/demo/e2e verisiyle kirlenmiş bir
veritabanıyla başlanmaması için bu doküman ve eşlik eden script'ler var.
Amaç: pilot kullanıcılarının gördüğü ilk ekranın, kurgusal Türkçe demo
verileriyle (sahte riskler, bulgular, "Ahmet Yılmaz" kullanıcıları vb.) değil,
temiz ve kontrollü bir başlangıç durumuyla karşılanması.

## Ortam Ayrımı

| Ortam | DB adı | Amaç | Veri kaynağı |
|---|---|---|---|
| Development | `grc_db` | Geliştirici/demo çalışması | `npm run prisma:seed` (`seed.ts`, kapsamlı demo veri) |
| Test | `grc_db_test` | Otomatik e2e/unit testler | `backend/test/global-setup.js` (her çalıştırmada `prisma db push` + testler kendi fixture'larını üretir/siler) |
| **Pilot** | `grc_db_pilot` | **Gerçek kullanıcı pilot testi** | `seed-system.ts` (yalnızca sistem verisi) + pilot kullanıcıları |
| Prod (ileride) | `grc_db_prod` | Canlı ortam | Migration + `seed-system.ts`, domain verisi yalnızca gerçek kullanım |

Üç DB de aynı PostgreSQL sunucusunda farklı isimlerle yaşayabilir (`docker-compose.yml`'daki tek `postgres` servisi, `POSTGRES_DB` sadece ilk DB'yi oluşturur — diğerleri `createdb` ile eklenir, aşağıya bakın) veya ayrı sunucularda olabilir. Önemli olan: **hangi ortamda hangi `DATABASE_URL`'in kullanıldığının her zaman açık olması.**

## Cevap: Mevcut DB mi, yeni `grc_db_pilot` mı?

**Önerilen: Yeni `grc_db_pilot`.** Gerekçe:

- `grc_db` (dev) hem bu oturumdaki hem önceki oturumlardaki test/keşif verisiyle dolu — "temiz başlangıç" ilkesini baştan ihlal eder.
- Yeni bir DB oluşturmak, mevcut geliştirici iş akışını (dev DB üzerinde serbestçe deneme/seed) hiç bozmadan pilotu izole eder.
- Migration geçmişini `migrate deploy` ile temiz bir şekilde uygulayıp, seed-system.ts ile sadece gerekeni yükleyerek başlamak, "mevcut DB'yi temizle" akışına göre çok daha az risklidir (silme operasyonu = 0).
- "Mevcut DB'yi temizleme" (Seçenek B) yalnızca yeni bir DB açmanın gerçekten mümkün olmadığı durumlarda (örn. tek sunuculu kısıtlı altyapı) kullanılmalı — bu doküman o senaryo için de tam prosedürü içeriyor.

## Seçenek A — Yeni Temiz Pilot DB (ÖNERİLEN)

```bash
# 1. Yeni DB oluştur (aynı Postgres sunucusunda)
docker exec -it <postgres-container> createdb -U postgres grc_db_pilot
# veya lokal Postgres: createdb grc_db_pilot

# 2. .env.pilot dosyası oluştur (backend/ altında, git'e eklenmez)
cat > backend/.env.pilot <<'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/grc_db_pilot?schema=public"
JWT_SECRET="<pilot-icin-guclu-benzersiz-secret>"
JWT_REFRESH_SECRET="<pilot-icin-guclu-benzersiz-secret>"
FRONTEND_URL="https://pilot.rmic.example"
PORT=3001
NODE_ENV=production
PILOT_ADMIN_EMAIL="admin@sirket.com"
PILOT_ADMIN_PASSWORD="<guclu-gecici-sifre>"
PILOT_DIRECTORATES="Gerçek Direktörlük 1:GD1,Gerçek Direktörlük 2:GD2"
EOF

# 3. Migration'ları uygula (migrate dev DEĞİL — deploy)
set -a && source backend/.env.pilot && set +a
cd backend && npx prisma migrate deploy

# 4. Hazırlık + doğrulama script'ini çalıştır (sistem seed + boşluk kontrolü)
npm run db:prepare-pilot -w backend
```

`db:prepare-pilot` şunu doğrular: migration'lar uygulanmış, sistem verisi (roller, admin, parametreler) mevcut, domain tabloları (Risk/Control/Finding/Action/...) tamamen boş. Hepsi doğruysa "pilot için hazır" özetini basar.

## Seçenek B — Mevcut DB'yi Temizleme

Yalnızca yeni DB açmak mümkün değilse kullanın. **Backup almadan asla ilerlemeyin.**

```bash
# 1. BACKUP (zorunlu adım)
pg_dump "$DATABASE_URL" -F c -f "backup-$(date +%Y%m%d-%H%M%S).dump"

# 2. Dry-run — neyin silineceğini gör, HİÇBİR ŞEY SİLİNMEZ
npm run db:clean-domain:dry -w backend

# 3. Çıktıyı incele, sayılar mantıklı mı kontrol et, sonra gerçek silme
CONFIRM_CLEAN_DOMAIN_DATA=true npm run db:clean-domain -w backend

# 4. Sistem verisini garantiye al (idempotent, zarar vermez)
npm run prisma:seed-system -w backend

# 5. Doğrula
npm run db:prepare-pilot -w backend
```

## Hangi Tablolar Temizlenir, Hangileri Korunur?

### Korunur (sistem/referans verisi — script hiç dokunmaz)

| Tablo | Neden korunuyor |
|---|---|
| `User` | Gerçek/pilot kullanıcı hesapları — script kullanıcıyı asla silmez, yalnızca demo kullanıcıları **manuel** kaldırmanız gerekir (aşağıya bakın) |
| `Role` | Sistem rolleri (SYSTEM_ADMIN, RISK_CONTROL_MANAGER, AUDITOR, VIEWER, IKS_*) |
| `RefreshToken` | Kullanıcıya bağlı oturum verisi, `User` cascade ile yönetilir |
| `Directorate` | Organizasyon taksonomisi — gerçek direktörlükler girildiyse korunmalı |
| `SystemOption` | Dinamik dropdown referans verisi (şu an kullanılmıyor ama şema seviyesinde sistem verisi) |
| `Parameter` | SLA eşikleri, uygulama config'i — iş kuralı, demo verisi değil |
| `Regulation`, `RegulationArticle`, `ArticleCrossRef` | SPK VII-128.10 / CBDDO BİG Rehberi statik regülasyon kütüphanesi — kullanıcı üretimi değil, gerçek referans içerik. **Not:** `seed.ts` bu tabloları da siliyor (tam demo reseed amacıyla); `clean-domain-data.ts` bilinçli olarak dokunmuyor. Ekip bunun aksini isterse ayrı bir karar/flag gerekir. |
| `RiskCategory` | Risk taksonomisi (örn. "BT Riski", "Operasyonel Risk") — organizasyonel referans veri, demo risk kaydı değil |

### Temizlenir (domain/test/demo verisi — `clean-domain-data.ts` FK sırasına göre siler)

`Finding`, `Action`, `FindingFollowUp`, `FindingStatusHistory`, `FindingStatusLog`, `FindingAttachment`, `ActionAttachment`, `FollowUpAttachment`, `ControlTestAttachment`, `Attachment` (polimorfik), `EffectivenessReview`, `RiskProposal`, `Control`, `ControlTest`, `ControlRiskMapping`, `ControlRegulation`, `RiskRegulation` (mapping — Risk/Control silinince zaten cascade olur), `Risk`, `RiskAssessment`, `RiskHistory`, `RiskControl`, `RiskControlRisk`, `RiskAction`, `RiskActionRisk`, `RiskEntry`, `RiskEntryRMControl`, `RiskManagementControl`, `RMControlTest`, `Process`, `ProcessRisk`, `System`, `SystemRisk`, `AuditPlan`, `AuditExecution`.

Tam silme sırası ve gerekçesi `backend/prisma/clean-domain-data.ts` içindeki `DELETE_PLAN` sabitinde kod olarak da belgeli.

### Dikkatli Ele Alınır

**`AuditLog`** — varsayılan olarak **korunur**. Pilot öncesi demo/test dönemine ait kayıtları temizlemek isterseniz `CLEAN_AUDIT_LOGS=true` flag'ini `CONFIRM_CLEAN_DOMAIN_DATA=true` ile birlikte verin.

> **Pilot başladıktan sonra `CLEAN_AUDIT_LOGS=true` bir daha ASLA kullanılmamalı.** AuditLog, kim-ne-zaman-ne-yaptı sorusunun tek kaynağıdır; KVKK/SPK uyumluluğu ve olay sonrası inceleme (post-incident review) için gereklidir. Pilot sonrası silinen bir audit kaydı geri getirilemez ve "neden bu değişiklik oldu" sorusuna cevap verecek son kanıtı yok eder.

**Upload dosyaları (`backend/uploads/`)** — DB'den bağımsız, paylaşılan bir dosya sistemi yoludur. `clean-domain-data.ts` her çalıştırmada (dry-run dahil) hangi dosyaların artık hiçbir attachment kaydı tarafından referans edilmediğini (orphan) listeler. Gerçek silme için ayrı `CLEAN_UPLOAD_FILES=true` flag'i gerekir.

> ⚠️ **Kritik kısıt:** Orphan tespiti yalnızca **o an bağlı olunan `DATABASE_URL`'in** attachment kayıtlarına bakar. `backend/uploads/` klasörü birden fazla ortam (örn. hem dev hem pilot) arasında fiziksel olarak paylaşılıyorsa, `CLEAN_UPLOAD_FILES=true` başka bir ortamın hâlâ ihtiyaç duyduğu dosyaları silebilir. **Pilot ortamı için ayrı bir upload dizini/volume kullanılması önerilir** (örn. Docker'da ayrı bir named volume mount, `docker-compose.yml`'a eklenmeli — bu doküman kapsamında henüz yapılmadı, bilinen bir eksik olarak aşağıda listelendi).

## Demo Kullanıcılar Ne Olacak?

Script'ler `User` tablosuna **hiç dokunmaz** (silme yok, RBAC/audit-log FK bütünlüğü riske girmesin diye bilinçli tercih). Bu yüzden demo kullanıcıların (`admin@rmic.com`, `burak@rmic.com`, `mgr1@rmic.com`, `aud1@rmic.com`, `ana1@rmic.com`, `birim@rmic.com` vb. — hepsi `Test1234!` şifreli, `seed.ts`'ten gelen) temizlenmesi **manuel bir karar** gerektirir:

- **Yeni `grc_db_pilot` (Seçenek A) kullanıyorsanız**: sorun yok, bu kullanıcılar zaten hiç var olmayacak — `seed-system.ts` yalnızca sizin belirlediğiniz `PILOT_ADMIN_EMAIL` ile tek bir admin oluşturur.
- **Mevcut DB'yi temizliyorsanız (Seçenek B)**: demo kullanıcılar domain verisiyle birlikte otomatik silinmez, hâlâ orada olacaktır. Temizlik sonrası admin panelinden (`/admin/users`) manuel olarak deaktive edin veya silin — script bunu bilerek yapmıyor çünkü "hangi kullanıcı demo, hangisi gerçek" ayrımı otomatik olarak güvenle yapılamaz (isim/e-posta desenine güvenmek riskli).

## Direktörlükler Korunmalı mı, Yeniden mi Yüklenecek?

Bağlama göre değişir:

- Mevcut `Directorate` kayıtları **gerçek organizasyon yapısını** yansıtıyorsa → **korunmalı**, script zaten dokunmuyor.
- Mevcut kayıtlar `seed.ts`'ten gelen demo direktörlüklerse ("BT Ağ Yönetimi", "Bilgi Güvenliği" vb. — gerçek olabilir de, fabrikasyon da olabilir, kod bunu ayırt edemez) → ekip karar vermeli. Gerçekse tutun; değilse admin panelinden manuel silin veya yeni pilot DB'de `PILOT_DIRECTORATES` env değişkeniyle gerçek listeyi girin.

`seed-system.ts` **hiçbir zaman demo direktörlük adı üretmez** — yalnızca `PILOT_DIRECTORATES="Ad:Kod,Ad2:Kod2"` verilirse ekler, verilmezse hiç dokunmaz.

## Geri Dönüş Planı

1. Her gerçek temizlik/silme öncesi `pg_dump -F c` ile alınan backup, `pg_restore` ile aynı veya yeni bir DB'ye geri yüklenebilir:
   ```bash
   pg_restore -d grc_db_pilot --clean --if-exists backup-20260717-1200.dump
   ```
2. `clean-domain-data.ts` **transaction içinde çalışmaz** (her tablo ayrı `deleteMany` çağrısıdır) — yani script yarıda kesilirse (örn. bağlantı kopması) kısmi bir silme durumu oluşabilir. Bu senaryoda tek güvenli geri dönüş yolu backup'tan restore etmektir; script'i "kaldığı yerden devam ettirmeye" çalışmayın.
3. Upload dosyaları (`CLEAN_UPLOAD_FILES=true` ile silinenler) **geri dönüşü olmayan** bir işlemdir — dosya sistemi seviyesinde backup (örn. `tar czf uploads-backup.tar.gz backend/uploads/`) ayrıca alınmalıdır, `pg_dump` bunu kapsamaz.
4. `seed-system.ts` idempotent olduğu için zararsızca tekrar çalıştırılabilir; geri alma gerektirmez.

## Bilinen Riskler / Manuel Karar Gerektiren Noktalar

- **Upload klasörü paylaşımı**: yukarıda belirtildiği gibi, pilot ve dev/diğer ortamlar aynı `backend/uploads/` fiziksel yolunu paylaşıyorsa `CLEAN_UPLOAD_FILES=true` riskli olabilir. Kalıcı çözüm: ortam başına ayrı upload dizini/volume (bu değişiklik henüz yapılmadı — `uploads.controller.ts`'deki `UPLOAD_ROOT` şu an `process.cwd()/uploads` olarak sabit, env değişkeni ile override edilebilir hale getirilmesi ayrı bir iş kalemi).
- **Regülasyon kütüphanesi ve RiskCategory'nin sınıflandırması** ürün kararı gerektirir — bu dokümanda "referans veri, korunur" olarak sınıflandırıldı ama ekip aksini isterse `clean-domain-data.ts`'e ek/opsiyonel bir adım eklenebilir.
- **`clean-domain-data.ts` transaction kullanmıyor** — büyük veri setlerinde yarıda kesilme riski var (bkz. Geri Dönüş Planı §2). İleride `prisma.$transaction([...])` ile sarmalamak değerlendirilebilir; şu an FK sırası doğru olduğu için işlevsel olarak çalışıyor ama atomiklik garantisi yok.
- **Migration geçmişi**: `grc_db_test` şu an `prisma db push` ile senkronize ediliyor (migration history yok) — bu test ortamı için kasıtlı ve doğru, ama gerçek pilot/prod DB'sinde **mutlaka** `prisma migrate deploy` kullanılmalı, `db push` asla kullanılmamalı (migration geçmişini bozar).
