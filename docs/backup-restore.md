# Yedekleme ve Felaket Kurtarma (Backup & DR)

## Ne yedekleniyor

1. **Postgres veritabanı** (`grc_db`) — tüm şema ve veri, `pg_dump` ile
   custom format (`-F custom`) olarak dump alınıyor. Bu format sıkıştırılmış
   ve seçici geri yüklemeye (tek tablo vb.) uygun.
2. **Dosya ekleri** (`backend/uploads/`) — bulgu, aksiyon ve takip
   çalışmalarına yüklenen dosyalar. Veritabanı yalnızca bu dosyaların
   metadata'sını (ad, boyut, MIME tipi) tutar, dosyaların kendisi diskte
   durur — bu yüzden **veritabanı yedeği tek başına yeterli değildir**,
   `uploads/` dizini de ayrıca yedeklenmelidir.

## Manuel yedek alma

```bash
./scripts/backup-db.sh
```

Varsayılan olarak `./backups/` dizinine, zaman damgalı iki dosya üretir:
- `grc_db_YYYYMMDD_HHMMSS.dump`
- `uploads_YYYYMMDD_HHMMSS.tar.gz`

Farklı bir hedef dizin için: `./scripts/backup-db.sh /yol/to/backup-dir`

## Otomatik (günlük) yedekleme

Sunucuda crontab'a ekleyin (her gün gece 02:00'de):

```
0 2 * * * cd /path/to/rmic_1 && ./scripts/backup-db.sh >> /var/log/rmic-backup.log 2>&1
```

Yedekler üretim sunucusundan **ayrı bir yere** (başka bir disk, off-site
depolama, S3-uyumlu bir kova vb.) periyodik olarak kopyalanmalıdır —
script kendisi bunu yapmaz, yalnızca yerel yedek üretir. Tek sunucuda
tutulan yedek, o sunucunun tamamen kaybı durumunda işe yaramaz.

## Saklama süresi (retention)

Varsayılan: 30 gün. Değiştirmek için:

```bash
BACKUP_RETENTION_DAYS=90 ./scripts/backup-db.sh
```

## Geri yükleme

```bash
./scripts/restore-db.sh backups/grc_db_20260728_020000.dump backups/uploads_20260728_020000.tar.gz
```

**Bu işlem hedef veritabanının mevcut içeriğini siler** — script bu yüzden
bir onay istemi gösterir. Geri yükleme sonrası backend'in yeniden
başlatılması önerilir.

## Geri yükleme testi (önerilir)

Bir yedeğin gerçekten işe yaradığından emin olmanın tek yolu, düzenli
aralıklarla (ör. üç ayda bir) ayrı, izole bir ortamda geri yükleme
denemesi yapmaktır:

```bash
docker run -d --name grc_restore_test -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine
DB_CONTAINER=grc_restore_test ./scripts/restore-db.sh backups/grc_db_XXXXXXXX_XXXXXX.dump
# doğrulama sonrası:
docker rm -f grc_restore_test
```

## Kapsam dışı / ayrıca değerlendirilmeli

- **Point-in-time recovery (PITR)**: Bu script tam dump alır, sürekli WAL
  arşivleme yapmaz. Dakika hassasiyetinde geri dönüş gerekiyorsa Postgres
  WAL arşivleme + `pg_basebackup` kurulması ayrı bir çalışma gerektirir.
- **Self-hosted Sentry'nin kendi verisi** (bkz. `docs/error-tracking-setup.md`)
  bu script'in kapsamında değil — kurulduğunda ayrıca yedeklenmelidir.
