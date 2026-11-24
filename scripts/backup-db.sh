#!/usr/bin/env bash
# Postgres veritabanı + dosya eklerinin (uploads/) yedeğini alır.
# Kullanım: ./scripts/backup-db.sh [hedef-dizin]
# Varsayılan hedef dizin: ./backups
#
# Cron ile günlük çalıştırmak için (her gün 02:00'de):
#   0 2 * * * cd /path/to/rmic_1 && ./scripts/backup-db.sh >> /var/log/rmic-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

DB_CONTAINER="${DB_CONTAINER:-rmic_1-postgres-1}"
DB_NAME="${DB_NAME:-grc_db}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Yedekleme başlıyor → $BACKUP_DIR"

# Tutarlılık: SIRA ÖNEMLİ. Önce DB dump'ı (pg_dump tek tutarlı anlık görüntü), SONRA
# uploads arşivi. Uygulama kayıtlı dosyayı diskten silmediği için dump'taki her ek
# referansı arşivde bulunur; arşivde fazladan (dump'tan sonra yüklenen) dosya olabilir,
# zararsızdır. Doğrulama: ./scripts/restore-drill.sh <dump> <uploads.tar.gz>

# 1) Veritabanı dump'ı (sıkıştırılmış, tek dosyada tüm şema+veri)
DB_DUMP_FILE="$BACKUP_DIR/grc_db_${TIMESTAMP}.dump"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -F custom -f "/tmp/backup_${TIMESTAMP}.dump"
docker cp "$DB_CONTAINER:/tmp/backup_${TIMESTAMP}.dump" "$DB_DUMP_FILE"
docker exec "$DB_CONTAINER" rm "/tmp/backup_${TIMESTAMP}.dump"
echo "[$(date)] Veritabanı dump'ı tamamlandı: $DB_DUMP_FILE ($(du -h "$DB_DUMP_FILE" | cut -f1))"

# 2) Dosya ekleri (bulgu/aksiyon/takip dosyaları — DB'de yalnızca metadata var)
UPLOADS_DIR="$ROOT_DIR/backend/uploads"
if [ -d "$UPLOADS_DIR" ]; then
    UPLOADS_ARCHIVE="$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"
    tar -czf "$UPLOADS_ARCHIVE" -C "$ROOT_DIR/backend" uploads
    echo "[$(date)] Dosya ekleri arşivlendi: $UPLOADS_ARCHIVE ($(du -h "$UPLOADS_ARCHIVE" | cut -f1))"
fi

# Sağlama toplamları (off-site kopya ve geri yüklemede bütünlük kontrolü için)
for f in "$DB_DUMP_FILE" ${UPLOADS_ARCHIVE:+"$UPLOADS_ARCHIVE"}; do
    (cd "$(dirname "$f")" && shasum -a 256 "$(basename "$f")" > "$(basename "$f").sha256")
done

# 3) Eski yedekleri temizle (retention süresini aşanlar)
find "$BACKUP_DIR" -name "grc_db_*.dump" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "*.sha256" -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date)] Yedekleme tamamlandı. Saklama süresi: ${RETENTION_DAYS} gün."
