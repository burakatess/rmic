#!/usr/bin/env bash
# Bir yedekten veritabanını ve/veya dosya eklerini geri yükler.
# DİKKAT: Bu işlem hedef veritabanının mevcut içeriğini siler.
#
# Kullanım:
#   ./scripts/restore-db.sh <dump-dosyası.dump> [uploads-arşivi.tar.gz]
#
# Örnek:
#   ./scripts/restore-db.sh backups/grc_db_20260728_020000.dump backups/uploads_20260728_020000.tar.gz

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Kullanım: $0 <dump-dosyası.dump> [uploads-arşivi.tar.gz]"
    exit 1
fi

DUMP_FILE="$1"
UPLOADS_ARCHIVE="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DB_CONTAINER="${DB_CONTAINER:-rmic_1-postgres-1}"
DB_NAME="${DB_NAME:-grc_db}"
DB_USER="${DB_USER:-postgres}"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Hata: Dump dosyası bulunamadı: $DUMP_FILE"
    exit 1
fi

read -p "UYARI: '$DB_NAME' veritabanının mevcut içeriği silinip '$DUMP_FILE' ile değiştirilecek. Emin misiniz? (evet/hayır): " CONFIRM
if [ "$CONFIRM" != "evet" ]; then
    echo "İptal edildi."
    exit 0
fi

echo "[$(date)] Veritabanı geri yükleniyor: $DUMP_FILE"
docker cp "$DUMP_FILE" "$DB_CONTAINER:/tmp/restore.dump"
docker exec "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "/tmp/restore.dump"
docker exec "$DB_CONTAINER" rm "/tmp/restore.dump"
echo "[$(date)] Veritabanı geri yüklendi."

if [ -n "$UPLOADS_ARCHIVE" ]; then
    if [ ! -f "$UPLOADS_ARCHIVE" ]; then
        echo "Uyarı: Dosya ekleri arşivi bulunamadı: $UPLOADS_ARCHIVE — atlanıyor."
    else
        echo "[$(date)] Dosya ekleri geri yükleniyor: $UPLOADS_ARCHIVE"
        rm -rf "$ROOT_DIR/backend/uploads"
        tar -xzf "$UPLOADS_ARCHIVE" -C "$ROOT_DIR/backend"
        echo "[$(date)] Dosya ekleri geri yüklendi."
    fi
fi

echo "[$(date)] Geri yükleme tamamlandı. Backend'i yeniden başlatmanız önerilir."
