-- AI ve Kaynak Kataloğu erişimi ROL ADINDAN (IKS_MANAGER/IKS_EMPLOYEE/AUDITOR/RCM sabit listeleri)
-- İZİNLERE taşındı. Bu geçiş mevcut rollere eski rol-adı davranışının BİREBİR izin karşılığını verir:
-- hiç kimsenin erişimi değişmez; yalnız artık izinle yönetilebilir (özel roller de verilebilir).
--
--   ai:query              doğal dil sorgu         (eski AI_QUERY_ROLES)
--   ai:run                kontrol & kanıt değerl. (eski AI_EVAL_ROLES) — yalnız IKS_MANAGER'a eksikti
--   ai:source:restricted  KISITLI seviye          (eski: AUDITOR, IKS_MANAGER, RCM, SYSTEM_ADMIN)
--   ai:source:confidential GİZLİ seviye           (eski: RCM, SYSTEM_ADMIN)
--
-- Idempotent: izin zaten varsa veya `*` / `ai:*` jokeriyle kapsanıyorsa eklenmez. Prisma bu dosyayı
-- bir kez çalıştırır; yönetici sonradan bir izni kaldırırsa geri eklenmez. Her ekleme AuditLog'a yazılır.

WITH g(role, perm) AS (
    VALUES
        ('RISK_CONTROL_MANAGER', 'ai:query'),
        ('RISK_CONTROL_MANAGER', 'ai:source:restricted'),
        ('RISK_CONTROL_MANAGER', 'ai:source:confidential'),
        ('AUDITOR',              'ai:query'),
        ('AUDITOR',              'ai:source:restricted'),
        ('IKS_MANAGER',          'ai:run'),
        ('IKS_MANAGER',          'ai:query'),
        ('IKS_MANAGER',          'ai:source:restricted'),
        ('IKS_EMPLOYEE',         'ai:query'),
        ('RISK_ANALYST',         'ai:query')
),
todo AS (
    SELECT r.id AS role_id, r.name AS role_name, g.perm
    FROM "Role" r
    JOIN g ON g.role = r.name
    WHERE jsonb_typeof(r.permissions) = 'array'
      AND NOT (r.permissions @> to_jsonb('*'::text)
            OR r.permissions @> to_jsonb('ai:*'::text)
            OR r.permissions @> to_jsonb(g.perm))
),
agg AS (
    SELECT role_id, role_name, jsonb_agg(perm ORDER BY perm) AS added FROM todo GROUP BY role_id, role_name
),
upd AS (
    UPDATE "Role" r
    SET permissions = r.permissions || agg.added
    FROM agg
    WHERE r.id = agg.role_id
    RETURNING r.id, r.name, agg.added
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "newValue", "actorType", "createdAt")
SELECT 'perm_' || md5(random()::text || clock_timestamp()::text || upd.id), 'PERMISSION_MIGRATION', 'Role', upd.id,
       jsonb_build_object('migration', '2026-11-ai-permissions-from-role-names', 'role', upd.name, 'added', upd.added),
       'SYSTEM', now()
FROM upd;
