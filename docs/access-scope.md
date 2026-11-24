# Kayıt Kapsamı (Erişim) Politikası

Bu belge, kullanıcının **hangi kayıtları görebileceğini** belirleyen merkezi politikayı ve devreye alma adımlarını tanımlar. Kod: `backend/src/common/services/access-scope.service.ts`.

## İlke

- **İşlem izni ile kayıt kapsamı ayrıdır.** `finding:update`, `report:export`, onay ve silme izinleri ayrıca kontrol edilir. Kapsam yalnız görünürlüğü belirler.
- **`report:org` bir rapor iznidir**, kayıt kapsamı vermez. Kurum geneli kayıt kapsamı `scope:org` (tüm modüller) veya `scope:org:<modül>` (ör. `scope:org:risk`) ile verilir.
- **Birim üyeliği (DirectorateMembership) yalnız kapsam belirler.** Birden çok birime üye olmak yönetici veya onay yetkisi vermez.
- **Kaydın kapsamı kaydın kendi direktörlüğünden türetilir.** Sorumlunun güncel birimi kullanılmaz. Kişi birim değiştirirse tarihsel kaydın organizasyonu değişmez.
- **Eksik bilgi kurum geneline düşmez.** Direktörlüğü olmayan kayıt yalnız kurum geneli kapsamlı kullanıcılara ve doğrudan atananlara görünür.
- Aynı politika liste, detay, arama, sayaç, rapor ("Bulgu Takip") ve kanıt indirmede uygulanır.

## Kapsam kaynakları

| Kayıt | Birim kapsamı | Doğrudan atama |
|---|---|---|
| Bulgu | `Finding.directorateId` (birim kullanıcısı TASLAK bulguyu görmez) | `assigneeId` |
| Aksiyon | Bağlı bulgunun kapsamı | `ownerId` |
| Takip | Bağlı bulgunun kapsamı | `assigneeId`, `evaluatorId`, `secondControllerId`, kendi aksiyonunun takipleri |
| Kontrol testi | `ControlTest.directorateId`; yoksa kontrolün direktörlüğü | `assigneeId`, `secondControllerId` |
| Risk | `Risk.directorateId` (nullable). `isOrgWide=true` yalnız kurum geneli kapsamlılara açılır; boş direktörlük kurum geneline **açılmaz** | `ownerId` |
| Kanıt | Bağlı kaydın erişimi + ayrıca `evidence:view` izni | — |
| Kontrol Havuzu | Kurum geneli, `control:view` izniyle | İlişkili test, bulgu ve risk kayıtları ve sayıları kendi politikasından geçer |

**Kısmi erişim:** Yalnız bir aksiyona veya takibe atanmış kullanıcı bulgu detayında yalnız kendi iş kalemlerini ve üst bilgiyi görür. Diğer aksiyonlar, takipler, kanıtlar, durum günlüğü ve ilişkiler (sayıları dahil) gizlenir. Durum geçmişi, durum günlüğü ve ilişki haritası uçları bu kullanıcıya 403 döner. Bulgu kanıtı bulgunun tamamına erişim ister.

Kapsam dışı kayıt 404 döner, varlık bilgisi açıklanmaz.

## Rol matrisi (varsayılan izinler — `backend/prisma/system-roles.ts`)

| Rol | Kayıt kapsamı | Not |
|---|---|---|
| SYSTEM_ADMIN | Kurum geneli (`*`) | Maker/checker ve atanmış ikinci kontrolcü kuralları yine geçerli |
| RISK_CONTROL_MANAGER | `scope:org` | `finding:delete`, `evidence:view`, `risk:directorate:change` |
| AUDITOR (merkezi iç kontrol) | `scope:org` | `finding:delete:own` (yalnız kendi taslağı); `report:org` yok |
| RISK_ANALYST | `scope:org:risk` | Test, bulgu, aksiyon, takipte birim + atama |
| AUDITEE (birim kullanıcısı / birim yöneticisi) | Üyelik + atama | `control:view` (Kontrol Havuzu ortak ana veri — düzenleme, plan, diğer birim kayıtları, kanıt **açmaz**), `evidence:view` yalnız kapsamındaki kayıtlar. Birim yöneticisi = AUDITEE + çoklu üyelik |
| VIEWER | Üyelik + atama, salt okunur | `evidence:view` ve `report:export` **verilmez** |

## Devreye alma (RECORD_SCOPE_ENFORCEMENT)

Politika `RECORD_SCOPE_ENFORCEMENT=true` olmadıkça uygulanmaz; bugünkü davranış korunur. Açmadan önce şu adımlar sırayla yapılır:

1. **Etki raporu (salt okunur):**
   ```bash
   cd backend && npx ts-node --transpile-only prisma/access-scope-dry-run.ts
   ```
   Rapor şunları gösterir: rollerin eksik izinleri, kullanıcı başına görünecek kayıt sayıları (mevcut DB izinleriyle ve varsayılanlar senkronize edilirse), direktörlüğü eksik kayıtlar ve üyeliği olmayan kullanıcılar.
2. **Hedefli izin geçişi** — toplu seed senkronu (`SEED_SYSTEM_SYNC_ROLE_PERMISSIONS`) **kullanılmaz**; o yol bilinçli olarak kaldırılmış izinleri geri getirebilir.
   ```bash
   cd backend && npx ts-node --transpile-only prisma/permission-migration.ts          # dry-run (salt okunur)
   cd backend && npx ts-node --transpile-only prisma/permission-migration.ts --apply  # yedek + onay sonrası
   ```
   Rapor: Rol → mevcut izin → eklenecek → gerekçe → erişim etkisi; bilinçli eklenmeyenler; katalogda olmayan eski anahtarlar (otomatik dönüştürülmez). Plan `prisma/permission-migration.plan.ts`. Her rol tek transaction'da işlenir ve `PERMISSION_MIGRATION` denetim kaydıyla işaretlenir; işaretli role tekrar dokunulmaz, hiçbir izin kaldırılmaz.
3. **Birim üyeliklerini gir.** AUDITEE, VIEWER ve RISK_ANALYST kullanıcılarının DirectorateMembership kayıtları olmadan bu kullanıcılar yalnız kendilerine doğrudan atanmış işleri görür.
4. Dry-run'ı tekrar çalıştır. Beklenmeyen "0 kayıt" sonuçlarını kapat.
5. `RECORD_SCOPE_ENFORCEMENT=true` ile yeniden başlat. Pilot kullanıcılarla UAT matrisindeki erişim senaryolarını doğrula.

**Geri dönüş:** `RECORD_SCOPE_ENFORCEMENT=false` ile eski görünürlüğe dönülür. Veri değişmez.

**Üretimde başlangıç doğrulaması** (`backend/src/main.ts::scopeEnforcementStartupCheck`): `NODE_ENV=production` iken bayrak tanımlı değilse uygulama **başlamaz**; `true` beklenir. `false` yalnız `RECORD_SCOPE_ENFORCEMENT_DISABLED_REASON` ile kabul edilir ve her başlangıçta uyarı loglanır (sessizce kapatılamaz). Geliştirmede (`docker-compose.yml`) bayrak gerekçesiyle `false`.

### Risk direktörlüğü geçişi

Mevcut risklerin `directorateId` alanı boş gelir (güncel birimden otomatik backfill **yapılmaz**). Öneri raporu salt okunurdur:
```bash
cd backend && npx ts-node --transpile-only prisma/risk-directorate-dry-run.ts
```
Kaynak (KONTROL / BULGU / GMY) ve güven (YÜKSEK / ORTA / DÜŞÜK / ÇELİŞKİ / YOK) ile önerir; atamayı risk sahibi/yönetici yapar. Direktörlük değişikliği `risk:directorate:change` izni ister ve `RISK_DIRECTORATE_CHANGE` denetim kaydı üretir.

### Kontrolcü uygunluğu (Yıllık Plan, dönem kontrolü, test)

Rol adı listesi kaldırıldı (`backend/src/common/services/controller-eligibility.ts`). Kural: aktif kullanıcı + işlem izni (birinci kontrolcü `control:test` veya `test:execute`; ikinci kontrolcü `control:approve`) + kayıt kapsamı (kurum geneli test kapsamı veya kontrolün direktörlüğüne üyelik) + birinci ≠ ikinci. Test yaşam döngüsü uçları da aynı izinlerle korunur; testin ikinci kontrolcüsü testi başlatamaz, taslak kaydedemez, tamamlayamaz; onay bekleyen testin içeriği dondurulur (değişiklik yalnız geri gönderimle).

## IKS_MANAGER / IKS_EMPLOYEE uyumluluk envanteri

Roller silinmedi veya birleştirilmedi. **2026-11: AI ve rapor kurallarındaki rol adı bağımlılıkları İZİNLERE taşındı** (aşağıdaki tablo güncel durumu gösterir; ayrıntı ve geçiş: `migrations/20261123100000_ai_permissions_from_role_names`):

| Yer | Kullanım | Risk |
|---|---|---|
| ~~`annual-plan.service.ts` `ALWAYS_ELIGIBLE_ROLES`~~ | **Kaldırıldı** — uygunluk izin tabanlı (`controller-eligibility.ts`); AUDITOR ve RCM artık dışlanmıyor. IKS rolleri `test:execute` izniyle uygun kalır (uyumluluk) | — |
| ~~`ai.constants.ts` `AI_EVAL_ROLES` / `AI_QUERY_ROLES`~~ | **Kaldırıldı** — değerlendirme ve Kaynak Kataloğu okuma `ai:run`, doğal dil sorgu `ai:query` iznine bağlandı. Eski erişim korunarak IKS_MANAGER'a `ai:run`, ilgili rollere `ai:query` verildi | — |
| ~~`ai-eval.service.ts`, `library.controller.ts` gizlilik seviyesi~~ | **Kaldırıldı** — `common/permissions/source-confidentiality.ts`: `ai:source:restricted` → KISITLI, `ai:source:confidential` → GİZLİ (`*` ve `ai:*` ikisini de kapsar). Katalog yönlendirmesi `ai:admin` | — |
| ~~`reports.controller.ts` `REPORT_ROLES`~~ | **Kaldırıldı** — `report:view` izni zaten yeterliydi; özel roller de rapor görebilir (kurum geneli için `report:org`) | — |
| `backend/prisma/seed-roles.ts`, `migrate-permissions.ts`, `system-roles.ts` | Rol tanımları ve izin göçü | `seed-roles.ts` farklı izin seti tanımlar; tekrar çalıştırılırsa davranışı denetlenmeli |
| `backend/test/helpers/fixtures.ts:42`, `security.e2e-spec.ts:38` | Güvenlik e2e testi IKS_MANAGER kullanıcısıyla dar rapor kapsamını doğruluyor | Rol kaldırılırsa test yeniden yazılmalı |
| `frontend/src/app/(dashboard)/profile/page.tsx:15-16` | Görünen rol etiketi | — |

**İzin farkları (grc_db, salt okunur):**

- IKS_MANAGER'da olup RISK_CONTROL_MANAGER'da olmayan: `control:view`, `action:view`, `test:execute`, `action:update`, `action:create`. RCM bunların çoğunu `control:*` ve `action:*` ile kapsıyor; `test:execute` RCM'de yok.
- RISK_CONTROL_MANAGER'da olup IKS_MANAGER'da olmayan: `action:*`, `control:*`, `report:export`, `report:org`, `ai:*` izinleri.
- IKS_EMPLOYEE'de olup AUDITOR'da olmayan: `test:execute`.
- AUDITOR'da olup IKS_EMPLOYEE'de olmayan: `finding:create`, `action:create`, `control:test`, `report:view`, `report:export`, `ai:view`, `ai:run`, `ai:accept`.

**Önerilen geçiş planı (karar bekliyor):**

1. ✅ Yıllık Plan / test uygunluğu izinlere taşındı. Kalan: AI gizlilik seviyesi ve rapor rol listeleri (`library.controller.ts`, `ai-eval.service.ts`, `ai.constants.ts`, `reports.controller.ts`) rol adı yerine açık izinle tanımlansın, ör. `library:restricted`.
2. ✅ AUDITOR uygunluğu tarayıcıda doğrulandı (Yıllık Plan atama listesinde görünür).
3. `test:execute` izninin kullanıldığı yerleri belirle; `control:test` ile birleştirilip birleştirilmeyeceğine karar ver.
4. Güvenlik e2e testini dar rapor kapsamını izinle ifade eden bir test kullanıcısına taşı.
5. Ancak bundan sonra IKS rollerini kullanım dışı bırak. Rolleri silme; `description` ile "kullanım dışı" işaretle, yeni atamayı engelle.
