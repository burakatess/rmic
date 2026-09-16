# Endpoint Yetkilendirme Envanteri (Madde 5)

Global: `JwtAuthGuard` (APP_GUARD) tüm route'larda — `@Public()` hariç.
`PermissionsGuard` (APP_GUARD, opt-in) yalnızca `@RequirePermissions(...)` taşıyan handler'larda kısıt uygular.
`RolesGuard` controller/handler başına `@UseGuards` + `@Roles(...)` ile.

| Controller | Erişim modeli | Kayıt kapsamı | Not |
|---|---|---|---|
| `auth/*` login/register/refresh | `@Public()` | — | Bilinçli. Throttle 5/60sn (test'te devre dışı). |
| `auth/me`, `auth/change-password`, `auth/logout` | JWT (herhangi kimlik doğrulanmış) | Kendi oturumu | `@CurrentUser('id')` |
| `health/*` | `@Public()` | — | Bilinçli. |
| `reports/*` (GET) | JWT + `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER, AUDITOR, IKS_MANAGER, AUDITEE)` + `@RequirePermissions('report:view')` | — | "Her oturumlu kullanıcıya açık" KALDIRILDI. |
| `reports/dashboard\|risk-trends\|control-heatmap\|recurrent-findings\|action-performance\|risk-heatmap\|risk-trend-enhanced\|executive-summary\|ek6/data\|monthly` | + `@RequirePermissions('report:view','report:org')` | Kurum geneli | `report:org` yoksa 403. |
| `reports/monthly/word`, `reports/ek6/word` | + `@RequirePermissions('report:view','report:export','report:org')` | Kurum geneli | Dışa aktarma ayrı izin. |
| `reports/my-work` | `report:view` | Yalnız `@CurrentUser('id')` kalemleri | Her zaman kişiye özel. |
| `reports/bulgu-takip` | `report:view` | `report:org` varsa tümü + query `directorateId`; yoksa **yalnızca `assigneeId = userId`**, `directorateId` yok sayılır | Alt sorgular da kapsamlanır. |
| `findings` write (`POST/PUT/DELETE /findings`, workflow/*, follow-ups, actions) | JWT + `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER, AUDITOR)` | — | Workflow onayları RCM/ADMIN. |
| `findings/:id/workflow/kapat\|yeniden-ac` | `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER)` | — | Onaylı kapanış/yeniden açma. |
| `findings/:id/follow-ups/:fu/second-controller` | `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER)` | — | İkinci kontrolcü ataması (ayrı, gerekçeli). |
| `findings/:id/follow-ups/:fu` onay | rol + **`secondControllerId === userId`** + değerlendiren ≠ onaylayan | Nesne düzeyi | SYSTEM_ADMIN bypass YOK. |
| `findings/:id/follow-ups/:fu` delete | `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER)` | — | |
| `actions/:id` update/complete/extend | `@Roles(SYSTEM_ADMIN, AUDITOR, AUDITEE)` + **AUDITEE yalnızca `ownerId === userId`** | Nesne düzeyi | Bulguya bağlı → ortak `AuditsService` (Madde 2). |
| `actions/:id` delete | `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER)` | — | |
| `actions/:id/approve` (etkinlik) | `@Roles(AUDITOR)` | — | |
| `admin/*` | `@Roles(SYSTEM_ADMIN)` (class) | — | `findAllUsers` GET ayrıca RCM/AUDITOR. |
| `admin/roles`, `admin/users` yazımları | SYSTEM_ADMIN | — | ROLE_CHANGE / PERMISSION_CHANGE / USER_ACTIVATION_CHANGE audit'i **aynı transaction'da** (Madde 6). |
| `directorates\|risk-actions\|risk-controls\|risk-management-controls` write | JWT + `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER[, AUDITOR])` | — | Tüm write endpoint'lerinde `@Roles` mevcut (denetlendi). |
| `tests/generate` | `@Roles(SYSTEM_ADMIN, RISK_CONTROL_MANAGER)` | — | |
| `risk-proposals` create | JWT (herhangi) | Kendi talebi | Bilinçli — herkes risk önerebilir. approve/reject: SYSTEM_ADMIN. |
| `ai/*` | `AI_*_ROLES` + `ai:*` permission (bkz. ai.constants.ts) | — | |
| `ai/eval-sessions/*` (tüm rotalar: liste, oluştur, güncelle, rename, complete, reopen, clone, archive/unarchive, trash/restore, bulk, attachments +meta +version, messages, cancel, findings/review, outputs) | JWT + `@Roles(...AI_EVAL_ROLES)` (controller sınıfı) | **Kayıt sahipliği**: her metod `getSession`/`loadOwned` ile `createdById === userId` doğrular; değilse `ForbiddenException`. Toplu işlemler kayıt başına kontrol + `{ok, failed}` raporu. | Yeni endpoint'lere aynı desen uygulandı. Her yaşam döngüsü/inceleme/tamamlama işlemi `auditLog` (`AI_EVAL_*`) yazar. |
| `knowledge-docs` | okuma `AI_EVAL_ROLES`; yazma SYSTEM_ADMIN/RCM; silme SYSTEM_ADMIN | — | |
| `library/*` (Kaynak Kataloğu) | JWT + `@Roles`: okuma/arama/`unit-lookup`/readiness/senaryo yazımı `AI_EVAL_ROLES`; kaynak/sürüm/birim/kart/dataset yazımı + `review-content` + `build-index` `SYSTEM_ADMIN, RISK_CONTROL_MANAGER`; **`verify-rights` / `revoke-rights` yalnız `SYSTEM_ADMIN, RISK_CONTROL_MANAGER`**; eşleştirme + senaryo/karar inceleme + JSONL dışa aktarım + `flag-re-review` `SYSTEM_ADMIN, RISK_CONTROL_MANAGER, AUDITOR` | Retrieval (`search`): **yetki filtresi retrieval'dan ÖNCE** (rol→gizlilik + `APPROVED` + `rightRag=ALLOWED` + `rightsVerifiedAt` + `indexStatus=READY` + geçerlilik tarihi). `unit-lookup` (manuel seçim): aynı filtre, indeks KOŞUL DEĞİL. `verifyCitations` uydurma/iletilmemiş referansı + alıntı uyuşmazlığını reddeder. | İçerik incelemesi (`contentReviewedBy`) ile kullanım hakkı onayı (`rightsVerifiedBy` + `rightsBasis`) AYRI. Sistem `rightRag`'i kendiliğinden ALLOWED yapmaz. Kullanım hakkı/onay geri alınmış kaynakla yeni AI değerlendirme çalışması başlatılamaz (`resolveSourceUnitsForRun` bloklar). Her yazma `auditLog`. |
| `ai/eval-sessions/:id/suggest-sources` | JWT + `@Roles(...AI_EVAL_ROLES)` + kayıt sahipliği | Onaylı kontrol–kaynak eşleşmeleri + kontrol metniyle örtüşen, `APPROVED`+`rightRag=ALLOWED`+erişilebilir birimler önerilir; `suggestedSourceUnitIds` yazılır. Seçim kullanıcıya bırakılır (gizli enjeksiyon yok). Yetkisiz kaynak varlığı/içeriği açığa çıkarılmaz. | Boş sonuçta neden + (yetkiliye) katalog yönlendirmesi. |
| `uploads/*` | JWT | — | MIME+uzantı whitelist, 25MB, path-traversal koruması. |

## Denetim sonucu
- **Anonim erişim**: yalnızca `@Public()` (auth login/register/refresh, health). Diğer her şey JWT arkasında (401, 403 değil).
- **Yazım endpoint'leri**: tümü `@Roles` ile kısıtlı — "yalnız kimlik doğrulanmış" açık yazım endpoint'i bulunamadı.
- **Kapsam (nesne/veri düzeyi)**: `actions` (AUDITEE ownership), follow-up onayı (secondController), `reports/bulgu-takip` (assignee scope). `User.directorateId` modelde yok → birim-bazlı kapsam yerine açık atama ilişkisi kullanıldı.
- **FE**: `PermissionGate` + kimlik bazlı gösterim (onay düğmesi yalnız atanmış ikinci kontrolcüye). BE kontrolü FE ile değiştirilmedi.
