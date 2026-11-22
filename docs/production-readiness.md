# Üretime Hazırlık (Paket 4)

Bu belge canlıya geçiş için yapılandırma, bağımlılık, yedek/geri yükleme, veri aktarımı ve pilot/UAT adımlarını tanımlar. **Gerçek ortamda uygulanacak her adım yedek + onay ile yapılır.** 2026-11-03 itibarıyla bu adımların hiçbiri gerçek DB'de çalıştırılmadı; sonuçlar izole kopyadan alındı.

## 1. Üretim yapılandırması

| Değişken | Üretim değeri | Uygulamanın davranışı |
|---|---|---|
| `NODE_ENV` | `production` | Aşağıdaki başlangıç kontrolleri yalnız bu değerde zorunlu |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Rastgele, birbirinden farklı (`openssl rand -hex 32`) | Eksik, placeholder veya eşitse **başlamaz** |
| `RECORD_SCOPE_ENFORCEMENT` | `true` | Tanımsızsa **başlamaz**; `false` yalnız `RECORD_SCOPE_ENFORCEMENT_DISABLED_REASON` ile (her açılışta uyarı) |
| `TRUST_PROXY` | Ters vekil hop sayısı (`1`) veya adres/CIDR | `true`/`*` verilirse **başlamaz**; denetim izindeki IP buna dayanır |
| `FRONTEND_URL` | Tam origin (`https://grc.kurum.local`) | CORS yalnız bu origin'e açık |
| `DATABASE_URL` | **`grc_app`** kullanıcısı (DML; DDL yok) | Migration ayrı kullanıcıyla (`grc_migrator`) çalışır |
| `AI_ENABLED` | Karara bağlı | `false` iken AI uçları kapalı |
| `FOLLOWUP_CRON_ENABLED` | Pilotta `false`, canlıda karara bağlı | Otomatik takip üretimi |
| `NEXT_PUBLIC_API_URL` (frontend) | API'nin kamuya açık URL'si | İstemciye gömülür — sır koyulmaz |

**DB kullanıcıları** — `backend/prisma/db-roles/roles.sql` (test konteynerinde doğrulandı, gerçek DB'de uygulanmadı):
- `grc_migrator`: şema sahibi, yalnız `prisma migrate deploy` için.
- `grc_app`: tablolarda SELECT/INSERT/UPDATE/DELETE; `AuditLog` üzerinde UPDATE/DELETE/TRUNCATE **yok**; `_prisma_migrations` erişimi yok. Ek olarak `audit_log_immutable` tetikleyicisi.
- `grc_maintenance`: bakım/arşiv — tüm tablolarda yalnız SELECT (`pg_dump` için yeterli). Saklama/silme politikası karara bağlanana kadar yazma yetkisi yok.

**Ağ / başlıklar:**
- Frontend: CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS (`frontend/next.config.ts`).
- API (`backend/src/main.ts`): `X-Powered-By` kapalı, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Kanıt önizlemesi farklı origin'den iframe'de açılabildiği için API'de `X-Frame-Options` yok; çerçeveleme politikası ters vekilde `frame-ancestors <frontend-origin>` ile verilmeli.
- `backend/uploads` web kökünden erişilemez olmalı; dosyalar yalnız yetki kontrollü `/api/uploads/...` ucundan sunulur.

**Açılış provası (izole kopya, `NODE_ENV=production`):** bayrak yokken açılış durdu; `TRUST_PROXY=true` ile durdu; geçerli yapılandırmayla açıldı, kimliksiz istek ve yanlış parola 401 döndü.

## 2. Bağımlılık açıkları (üretim bağımlılıkları, `npm audit --omit=dev`)

| | Önce | Sonra |
|---|---|---|
| Kritik | 3 | 0 |
| Yüksek | 17 | 1 |
| Orta | 11 | 7 |

Yapılan güncellemeler (hepsi aynı major içinde):
- `npm audit fix` (zorlamasız) — geçişli bağımlılıklar (`proxy-addr`, `body-parser`, `qs`, `fast-uri`, `brace-expansion`, `hono` vb.).
- `next` 16.1.1 → 16.4.4, `eslint-config-next` 16.4.4 (kritik DoS / istek deserialization; `sharp`, `postcss` bununla kapandı).
- `multer` 2.5.0 — backend `diskStorage` için doğrudan bağımlılık yapıldı; `@nestjs/platform-express` 2.4.0'a sabitlediği için kökte `overrides`.
- `prisma`, `@prisma/client`, `@prisma/adapter-pg` 7.10.1'e hizalandı (CLI ile client aynı sürümde olmalı).

Kalanlar ve erişilebilirlik:

| Paket | Önem | Erişilebilir mi | Karar |
|---|---|---|---|
| `xlsx` 0.18.5 (prototype pollution, ReDoS) | Yüksek | **Evet**: AI değerlendirmesi kullanıcının yüklediği `.xlsx` kanıtı sunucuda ayrıştırır (`ai/text-extract.service.ts`); frontend'de içe aktarma modalı. Kimlik doğrulama + `ai:run` arkasında | npm'de düzeltilmiş sürüm yok. Seçenekler: SheetJS'in kendi dağıtımından 0.20.3 (kaynak değişikliği — tedarik zinciri kararı), `exceljs`'e geçiş veya AI'da xlsx ayrıştırmayı kapatma. **Karar gerekli** |
| `@sentry/*` bundler eklentileri, `glob`, `minimatch` | Orta | Hayır — yalnız derleme zamanı | Sentry sonraki sürümünde |
| `js-yaml` (`@nestjs/swagger` içi) | Orta | Hayır — kullanıcı YAML'ı ayrıştırılmıyor; Swagger üretimde kapalı | `@nestjs/swagger` güncellemesiyle |

## 3. Tutarlı yedek ve izole geri yükleme tatbikatı

- `scripts/backup-db.sh`: **önce** `pg_dump` (tutarlı anlık görüntü), **sonra** `uploads` arşivi; her dosya için `.sha256`. Uygulama kayıtlı dosyayı diskten silmediği için dump'taki her ek referansı arşivde bulunur.
- `scripts/restore-drill.sh <dump> <uploads.tar.gz>`: test konteynerinde geçici DB'ye geri yükler; sağlama toplamı, `pg_restore --exit-on-error`, migration geçmişi, satır sayıları ve **DB ↔ dosya tutarlılığı** kontrol eder. Canlı konteyner/DB adlarını reddeder. `KEEP=1` kopyayı bırakır.
- `scripts/restore-db.sh`: `UPLOADS_DIR` ile geri yükleme hedefi değiştirilebilir (izole geri yüklemede canlı `backend/uploads` ezilmez).

**Tatbikat sonucu (2026-11-03, grc_db salt okunur dump → test konteyneri):**
- Dump 9,4 MB, uploads 30 MB; sağlama toplamları OK; `pg_restore` 3 sn, hatasız.
- 28 migration uygulanmış, yarım kalan yok; 11 tablonun satır sayıları kaynak grc_db ile birebir aynı (User 11, ControlTest 107, AuditLog 828 …).
- **DB ↔ dosya: 23 referanstan 8'inin dosyası yok** (7 `ControlTestAttachment` — BTK.99xx test kontrolleri, 1 `AiEvalAttachment` `2026/09/abc.pdf`). Canlı `backend/uploads` dizininde de yoklar — yedekleme kaynaklı değil, grc_db'deki geliştirme verisinden kalma yetim referanslar. Pilot/canlı DB bu kontrolden **sıfır eksikle** geçmeli.

## 4. Veri aktarım dry-run'ı (izole kopya)

Gerçek ortamda sıra (her adım yedek + onay):
1. Yedek al → `restore-drill.sh` ile doğrula.
2. `prisma migrate status` → `prisma migrate deploy` (`grc_migrator` ile).
3. Sapma kontrolü: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → boş olmalı.
4. `prisma/permission-migration.ts` dry-run → onay → `--apply`.
5. `prisma/access-scope-dry-run.ts` ve `prisma/risk-directorate-dry-run.ts` raporları; üyelikleri gir.
6. Dışarıdan kayıt yüklendiyse `psql -f prisma/maintenance/resync-record-counters.sql` (yalnız artırır, tekrar çalıştırılabilir).
7. `RECORD_SCOPE_ENFORCEMENT=true` ile aç, UAT erişim senaryolarını çalıştır.

**Kopya üzerindeki sonuç:**
- Bekleyen 3 migration (`20261030100000_finding_created_by`, `20261030101000_audit_log_actor_type`, `20261102100000_risk_directorate`) < 1 sn'de uygulandı; şema sapması yok.
- İzin geçişi: RCM +4, AUDITOR +3, RISK_ANALYST +2, AUDITEE +2 izin; ikinci çalıştırmada dört rol de "daha önce geçirildi, dokunulmaz"; 4 `PERMISSION_MIGRATION` denetim kaydı; katalog dışı eski anahtar yok.
- Erişim raporu: direktörlüksüz bulgu/test/risk 0; **11 aktif kullanıcının hiçbirinde birim üyeliği yok** → AUDITEE ve RISK_ANALYST kullanıcıları kapsam açılınca yalnız doğrudan atandıkları işleri görür. Kapsam açılmadan önce üyelikler girilmeli.
- Sayaç hizalaması 1 sayaç güncelledi: grc_db'de `control-code` sayacı yok, mevcut kontroller BTK.99xx. Hizalama sonrası yeni kontrol kodu BTK.10000'den başlar (benzersizlik korunur). Pilot DB temiz kurulacağı için orada etkisi yok.

**Bulunan hata (düzeltildi):** sayaçlar yalnız migration anında tohumlanıyordu; sonradan doğrudan INSERT ile gelen kayıtlar ilk yeni bulguda `Unique constraint failed (findingId)` → 500 veriyordu (izole tarayıcı testinde yakalandı). `resync-record-counters.sql` bu boşluğu kapatır.

## 5. Pilot / UAT planı

**Ortam:** `grc_db_pilot` (bkz. `docs/pilot-db-reset.md`), `NODE_ENV=production`, `RECORD_SCOPE_ENFORCEMENT=true`, `AI_ENABLED` karara göre, `FOLLOWUP_CRON_ENABLED=false`.

**Pilot kullanıcıları (en az):** 1 sistem yöneticisi, 1 risk & kontrol yöneticisi (ikinci kontrolcü), 2 iç kontrol (AUDITOR — biri yürütücü, biri yedek), iki farklı birimden birer AUDITEE, 1 yalnız aksiyon sahibi, 1 VIEWER.

**Giriş kriterleri:** yedek + tatbikat başarılı (eksik dosya 0); izin geçişi uygulandı; tüm pilot kullanıcılarının üyelikleri girildi; erişim raporunda beklenmeyen "0 kayıt" yok; e2e paketi geçti.

**UAT senaryoları** (2026-11-03 ikinci tur: U2–U7 ve U9 izole ortamda — `grc_verify`, `RECORD_SCOPE_ENFORCEMENT=true`, üretim varsayılan rolleri — tarayıcıyla çalıştırıldı; U1 ve U8 yalnız otomatik testlerle doğrulandı. Hepsi pilotta gerçek kullanıcılarla tekrarlanacak):

| # | Senaryo | Beklenen |
|---|---|---|
| U1 | Rol ekranından izin ver/kaldır | Sonraki istekte etkili; bilinmeyen izin anahtarı 400 |
| U2 | İki birim kullanıcısı: liste, detay, arama, kanıt | Diğer birimin kaydı listede yok, detay 404, kanıt 404 |
| U3 | Tek aksiyona atanmış kullanıcı bulgu detayı | Yalnız kendi aksiyonu/takibi; diğer aksiyon, birim cevabı, tarihçe yok; bulgu düzeyi yazma 403 ve buton görünmez |
| U4 | Yıllık Plan → atama → onay → uygulama | AUDITOR birinci kontrolcü listesinde; ikinci kontrolcü listesi `control:approve` sahipleri; gönderen kendi planını onaylayamaz; dönem testleri oluşur |
| U5 | Test → bulgu → mutabakat → aksiyon → takip → onay | Maker kendi testini/takibini onaylayamaz; ikinci kontrolcü testi yürütemez, onay bekleyen içeriği değiştiremez; onay sonrası aksiyon ve bulgu kapanır |
| U6 | Denetim izi sayfalama + filtreli export | Toplam ve sayfa doğru; export yalnız filtreye uyan kayıtlar |
| U7 | Pasif kullanıcıya atanmış takip | Yönetici gerekçeyle yeniden atar; kendini atayamaz; denetim kaydı oluşur |
| U8 | Şifre değişikliği | Diğer oturumlar sonlanır; `CHANGE_PASSWORD` kaydı |
| U9 | Risk oluştur/düzenle (gerçek kategori, direktörlük, kurum geneli) | Önizleme = sunucu hesabı (eşik değerleri dahil); kurum geneli seçilince direktörlük boşalır; `RISK_DIRECTORATE_CHANGE` kaydı |

**Çıkış kriterleri:** U1–U9 pilot kullanıcılarla geçti; açık kritik/yüksek hata yok; geri bildirimler sınıflandırıldı (`docs/agents/triage-labels.md`).

**Geri dönüş:** erişim sorunu → `RECORD_SCOPE_ENFORCEMENT=false` + gerekçe (veri değişmez); veri sorunu → son doğrulanmış yedekten `restore-db.sh`.

## 6. Kalan riskler

- **Atomiklik (2026-11 kapatıldı):** ana kayıt + denetim kaydı (ve bağlı tarihçe/alt kayıtlar) tüm yazma yollarında tek transaction'dadır; denetim yazılamazsa ana işlem geri alınır (`test/atomic-writes.e2e-spec.ts`). Bilinçli olarak kapsam dışı: salt olay kayıtları (başarısız giriş, AI sorgusu) ve `workspace.saveDraft` içindeki test bitirme adımı (kendi işleminde).
- `xlsx` kararı (bölüm 2).
- `@Body() data: any` kalan legacy uçlar (CLAUDE.md teknik borç listesi).
- **IKS rol adı bağımlılığı (2026-11 kapatıldı):** AI ve rapor kuralları izinle yönetilir (`ai:query`, `ai:run`, `ai:source:restricted|confidential`, `report:view`); mevcut roller eski erişimin birebir karşılığını aldı (canlı rol verisi kopyası üzerinde önce/sonra karşılaştırıldı). Roller hâlâ vardır ve silinmedi; `AI_TEST_ROLES`/`AI_REVIEW_ROLES` (IKS içermeyen sistem-rol listeleri) ayrı bir geçiş konusudur.
- **Karar gerekli — RCM risk izinleri:** varsayılan katalogda `RISK_CONTROL_MANAGER`'da `risk:*` yok (HEAD'de de yoktu); backend risk oluşturma/düzenlemeyi RCM'ye açıyor, arayüz "Yeni Risk"i ve risk menüsünü gizliyor.
- **Karar gerekli — eski kontrol ayları:** `referenceMonth` olmayan periyodik kontrollerde Yıllık Plan, kontrolün eski `selectedMonths` değerini (ör. Mart/Eylül) dönem kaydına kopyalıyor; testler ise sabit takvimle (Haz/Ara) üretiliyor. Dönem Kontrolleri ay filtresi bu yüzden yanlış eşleşebilir.
- Dönem Kontrolleri ekranında kapsam seçici yok (her zaman "İşlerim"); kurum geneli yöneticiler kendilerine atanmamış dönem kontrollerini bu ekranda göremez (HEAD davranışı).
- **Liste sınırı (2026-11 kapatıldı):** seçim listeleri ve envanter ekranları `fetchAllPages` (`frontend/src/lib/list-all.ts`) ile TÜM sayfaları getirir (500'lük sayfalar, paralel; güvenlik tavanı 40 sayfa = 20.000 kayıt aşılırsa `truncated` bildirilir ve konsola uyarı yazılır). Sayfalı liste sıralamalarına `id` ikincil anahtarı eklendi (eşit değerlerde sayfa geçişinde kayıt tekrarlanıyor/atlanıyordu). Ekranlar hâlâ istemci tarafında süzer; yüz binlerce kayıtta sunucu tarafı filtreleme gerekir.
