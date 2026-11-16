-- ============================================================================
-- RMIC GRC — Veritabanı rol/yetki planı (UYGULANMADI; gerçek DB'de onayla çalıştırılır)
-- Doğrulama: yalnız izole test konteynerinde (docker-compose.test.yml) çalıştırıldı.
--
-- Kullanım (veritabanı sahibi/süper kullanıcı ile, hedef DB'ye bağlıyken):
--   psql -v app_pw="'...'" -v mig_pw="'...'" -v mnt_pw="'...'" -f roles.sql
-- Parolalar dosyada TUTULMAZ; psql değişkeni veya secret yöneticisinden verilir.
--
-- Roller:
--   grc_migrator : şema sahibi — yalnız `prisma migrate deploy` (DDL). Uygulama bunu KULLANMAZ.
--   grc_app      : uygulama — iş tablolarında CRUD; "AuditLog" üzerinde yalnız SELECT+INSERT
--                  (UPDATE/DELETE yok → denetim izi uygulama tarafından değiştirilemez/silinemez)
--   grc_maintenance : bakım/arşiv — salt okunur. Saklama/arşiv/silme politikası KARARA BAĞLANANA
--                  KADAR silme yetkisi verilmez (otomatik kalıcı silme yok).
-- Ek savunma: "AuditLog" UPDATE/DELETE tetikleyicisi — yetki hatası olsa bile değişikliği reddeder.
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grc_migrator') THEN CREATE ROLE grc_migrator LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grc_app') THEN CREATE ROLE grc_app LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grc_maintenance') THEN CREATE ROLE grc_maintenance LOGIN; END IF;
END $$;

\if :{?mig_pw}
ALTER ROLE grc_migrator PASSWORD :mig_pw;
\endif
\if :{?app_pw}
ALTER ROLE grc_app PASSWORD :app_pw;
\endif
\if :{?mnt_pw}
ALTER ROLE grc_maintenance PASSWORD :mnt_pw;
\endif

-- Süper kullanıcı/oluşturma yetkisi YOK
ALTER ROLE grc_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE grc_maintenance NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE grc_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Şema ve mevcut nesneler migrator'a devredilir (DDL sahibi)
GRANT CONNECT ON DATABASE :"DBNAME" TO grc_app, grc_maintenance, grc_migrator;
ALTER SCHEMA public OWNER TO grc_migrator;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO grc_migrator', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO grc_migrator', r.sequence_name);
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO grc_app, grc_maintenance;

-- Uygulama: iş tablolarında CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO grc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO grc_app;
-- Denetim izi: yalnız okuma + ekleme
REVOKE UPDATE, DELETE, TRUNCATE ON public."AuditLog" FROM grc_app;
-- Migration geçmişi uygulamaya kapalı (yalnız migrator)
REVOKE ALL ON public."_prisma_migrations" FROM grc_app;

-- Bakım: salt okunur
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grc_maintenance;

-- Gelecekte migrator'ın oluşturacağı tablolar için varsayılan yetkiler
ALTER DEFAULT PRIVILEGES FOR ROLE grc_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO grc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grc_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO grc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grc_migrator IN SCHEMA public GRANT SELECT ON TABLES TO grc_maintenance;

-- Ek savunma: AuditLog değiştirilemez (sahip dahil). Onaylı arşiv işi için ileride oturum
-- değişkeni ile açık istisna tanımlanır — saklama kararı verilmeden EKLENMEZ.
CREATE OR REPLACE FUNCTION public.audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog kayıtları değiştirilemez/silinemez (%).', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS audit_log_immutable ON public."AuditLog";
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON public."AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();
