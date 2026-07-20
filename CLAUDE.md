# RMIC GRC — Güvenli Kodlama Kılavuzu

Bu dosya her oturumda otomatik yüklenir. **Yeni kod yazarken veya mevcut kodu düzenlerken aşağıdaki kurallara uy.** Kural kırılacaksa gerekçesini yorumla belgele.

## Yığın Bağlamı
- **Backend**: NestJS 11 + Prisma 7 + PostgreSQL. JWT (`accessToken`/`refreshToken`) tabanlı auth. RBAC: `Role` DB tablosu + `permissions Json[]` + `@Roles()` guard + `PermissionGate` frontend.
- **Frontend**: Next.js 16 (App Router, client components). LocalStorage'da token — bilinçli bir tasarım tercihi (server-side kritik kararlar için değil).
- **Veri hassasiyeti**: Bulgu, aksiyon, denetim izleri, kullanıcı bilgileri KVKK kapsamında; SPK VII-128.10 ve CBDDO BİG Rehberi uyumluluğu hedefleniyor.

## Kimlik Doğrulama & Yetkilendirme

1. **Her yeni backend endpoint** varsayılan olarak `JwtAuthGuard` altında olmalı. Public route yalnızca `@Public()` decorator'ı ile açık işaretlenir (login, register, refresh). `AppModule` guard'ı global — özel bir sebep yoksa bypass etme.
2. **Yazma/silme endpoint'leri** için `@UseGuards(RolesGuard)` + `@Roles(...)` şart. En kısıtlayıcı rol setiyle başla (`SYSTEM_ADMIN, RISK_CONTROL_MANAGER`), gerekiyorsa genişlet.
3. **Admin yolu (`/admin/*`)**: yalnızca `SYSTEM_ADMIN`. `AdminController` bunu class seviyesinde uyguluyor — yeni admin controller yazarken aynı deseni koru.
4. **Frontend'de yetki kontrolü**: sidebar, buton, sayfa girişleri `<PermissionGate permission="...">` ile sarılmalı. Ama frontend gate **hiçbir zaman** tek güvenlik katmanı değildir — backend guard'ı olmadan yazma açmayı reddet.
5. **Kullanıcı `userId` daima `@CurrentUser('id')` decorator'ından alınır**. Frontend'den gelen `userId`, `assigneeId`, `ownerId` gibi alanları asla actor kimliği olarak kabul etme; yalnızca hedef nesne referansı olarak yaz.
6. **Şifreler**: sadece `bcrypt.hash(pwd, 10)` ile hashlenir. `passwordHash` alanı asla API response'unda dönmez — `{ passwordHash, ...rest } = user; return rest;` deseni kullan. `getProfile` bunu doğru yapıyor, referans al.
7. **Şifre değiştirme** her zaman mevcut şifre doğrulaması ister (`bcrypt.compare`), başarısızlıkta `UnauthorizedException('Mevcut şifre hatalı')`.

## Girdi Doğrulama (kritik)

1. **`@Body() data: any` YASAK.** Her yazma endpoint'i için `class-validator` DTO yaz (`Create*Dto`, `Update*Dto`). `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` global — DTO olmadan bilinmeyen alanları Prisma'ya dökmek `PrismaClientValidationError` veya sessiz veri bozulmasına yol açar.
2. **Enum alanları** `@IsEnum(EnumName)` ile korunur — frontend'in tuttuğu değeri asla ham dizi olarak Prisma'ya geçirme.
3. **Foreign key alanları** (`controlId`, `directorateId`, `ownerId`, `controlTestId` vb.) yazmadan **önce varlığını doğrula** (`prisma.X.findUnique`). Yoksa `BadRequestException('Geçersiz X: seçilen X bulunamadı')` fırlat — Prisma FK ihlali 500 vermez, kullanıcıya okunur mesaj gider. Örnekler: `audits.service.ts::updateFinding` controlId doğrulaması, `controls.service.ts::update` directorateId doğrulaması.
4. **Metin alanları** `@IsString() @MaxLength()` ile sınırlanır. Prisma `@db.Text` kullanılan alanlarda bile 10.000+ karakterlik input DoS riski taşır.
5. **Tarih alanları** `@IsDateString()` ile doğrulanır, service'te `new Date()` ile dönüştürülür. Ham string'i Prisma'ya geçme.
6. **ID formatları** (`findingId`, `actionId`, `testNo`, `followUpId`) daima backend'de üretilir. Frontend'den gelen bu alanları asla kabul etme — mevcut helper'ları kullan: `buildFollowUpId`, `generateTestNo`, `generateActionId`.

## SQL Injection & ORM

- **Prisma parametrelendirmesi güvenli** — `where: { name: userInput }` OK.
- `$queryRawUnsafe` **YASAK**. Zorunluysa `Prisma.sql\`\`` template ile parametreli `$queryRaw` kullan; input direkt string enterpolasyonu asla.
- `orderBy: { [userField]: 'asc' }` gibi dinamik alan adları için beyaz liste kontrolü yap.
- `mode: 'insensitive'` içeren `contains` sorguları — kullanıcı girdisi 200 karakteri geçmiyorsa güvenli.

## XSS & Çıktı Kaçırma

- React default olarak escape ediyor — `dangerouslySetInnerHTML` **YASAK** (audit sürecine çıkar).
- Kullanıcı üretimli HTML render edilecekse `sanitize-html` veya `DOMPurify` şart.
- **JSON diff/dump** kullanıcı verisi içerir; audit-log detay modal'ında `<pre>{JSON.stringify(v, null, 2)}</pre>` deseni doğrudur — HTML injection edemez.

## CSRF

- Auth `Authorization: Bearer` header ile, cookie değil → CSRF vektörü **yok**. Cookie-tabanlı auth'a geçilirse `SameSite=Strict` + CSRF token eklenmeli.

## Secrets & Konfig

- **Kesinlikle** hardcoded secret, connection string, API key koda girmez. `.env` dosyaları git'te yok (kontrol et: `.gitignore`'da `.env*`).
- `ConfigService.get('...')` üzerinden oku. Yeni bir secret ekleniyorsa `.env.example` de güncelle.
- Log'lara `passwordHash`, `refreshToken`, `Authorization` header, `oldValue/newValue` içindeki hassas alan yazmadan önce redaction yap.
- Frontend `NEXT_PUBLIC_*` env'leri istemciye gömülür — buraya asla secret koyma.

## Denetim İzi (Audit Log)

1. **Her yazma işlemi** `prisma.auditLog.create` ile loglanır: `{ userId, action, entityType, entityId, oldValue?, newValue? }`. Yeni bir service metodu yazıyorsan bunu unutma — mevcut deseni takip et (`audits.service.ts`, `controls.service.ts`).
2. `LOGIN`, `LOGOUT`, `CHANGE_PASSWORD` gibi güvenlik olayları da loglanmalı.
3. `oldValue`/`newValue`'da **passwordHash, token, kredi kartı** gibi alanları elleme (bcrypt hash zaten güvenli ama gerekmedikçe döngüde tutma).
4. Log yazımı başarısız olsa bile ana işlem sürmeli — audit-log yazımı `try/catch` içinde olmalı **veya** transaction dışında (fire-and-forget, mevcut desen böyle).

## Dosya Yükleme

- Şu an aktif dosya yükleme yok. Eklenirse: MIME whitelist (`image/*, application/pdf, .docx, .xlsx`), boyut limiti (10 MB), dosya adı sanitizasyonu, virüs taraması (ClamAV entegrasyonu), yüklendiği dizin web'den erişilemez olmalı.

## Rate Limit & DoS

- `@nestjs/throttler` public route'lara (`login`, `register`, `refresh`) eklenmeli — brute-force koruması. Zorunlu değil ama önerilen: 5 istek / 60 sn per IP.
- Rapor endpoint'leri (`/reports/bulgu-takip`, `/reports/monthly`) N+1 sorgu içermemeli, `select` daraltılmalı — mevcut kod bunu yapıyor.

## Hata Yönetimi

- İç hata mesajlarını **istemciye sızdırma**. `NotFoundException`, `BadRequestException`, `UnauthorizedException` gibi Nest exception'ları anlamlı Türkçe mesajlarla fırlat. Prisma error'larını doğrudan istemciye dönme — filter yaz veya try/catch ile sarmala.
- Frontend `ApiError` (`lib/api.ts`) status ve mesaj tutar; toast göster (`err.message`), asla `err.stack` render etme.

## Hassas Veri (KVKK/SPK)

1. Kullanıcı kişisel verisi (ad, soyad, e-posta, departman) yalnızca yasal amaç için tutuluyor. Yeni bir kişisel veri alanı eklerken gerekçesini schema comment olarak yaz.
2. Silme (`DELETE /admin/users/:id`) veri anonimleştirmesi mi cascade mi olduğunu netleştir. Şu an cascade değil — `refreshTokens` ve `auditLogs` bağlı; audit'in kaybolmaması için `SetNull` tercih edilir.
3. Kişisel veri **URL parametresine** veya **loglara açık** yazılmamalı. E-postayı `entityId` olarak kullanma; cuid kullan.

## SIEM & İzlenebilirlik

- Yeni denetim eventleri `admin.service.ts::exportAuditLogs` CEF/LEEF/JSON çıktısına otomatik dahil olacak — özel bir şey yapman gerekmez.
- Yeni bir güvenlik-kritik event (örn. `ROLE_CHANGE`, `PERMISSION_CHANGE`) eklerken `AuditLog.action` string'i açık ve stabil olsun; SIEM tarafında kural yazılabilsin.

## Frontend Güvenlik Başlıkları

Next.js `middleware.ts` veya `next.config.ts` headers'a şunlar eklenmeli (henüz eklenmediyse iş listesine al):
- `Content-Security-Policy` (script-src 'self' 'unsafe-inline' — recharts inline stil kullanıyor)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (production HTTPS)

## Yeni Kod Yazarken Checklist

Backend endpoint eklemeden önce:
- [ ] DTO ve validation eklendi mi?
- [ ] `@UseGuards(RolesGuard)` + `@Roles(...)` doğru rol setiyle mi?
- [ ] `@CurrentUser('id')` ile actor userId alındı mı?
- [ ] FK alanları doğrulandı mı (findUnique)?
- [ ] `auditLog.create` yazıldı mı?
- [ ] Hata mesajları Türkçe ve iç detay sızdırmıyor mu?

Frontend sayfa/component eklemeden önce:
- [ ] `<PermissionGate>` ile korundu mu?
- [ ] Yetki dışı kullanıcıya net mesaj gösteriliyor mu?
- [ ] `dangerouslySetInnerHTML` yok mu?
- [ ] `api.ts` üzerinden çağrı yapılıyor mu (ApiError yakalanıyor mu)?

## Bilinen Teknik Borç (öncelikli iyileştirmeler)

- Bazı legacy endpoint'lerde hâlâ `@Body() data: any` var (`controls.controller.ts:update`, `audits.controller.ts` bazı route'lar). Bu endpoint'lere dokunulursa DTO'ya geçir.
- `AuthProvider` demo-fallback (`/auth/me` başarısızsa hardcoded ADMIN kullanıcı) **production'a gitmemeli** — kullanıcıya asla '*' permission verilmemeli.
- Rate limit `@nestjs/throttler` eklenmedi.
- CSP header'ları eklenmedi.
