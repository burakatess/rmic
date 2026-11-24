#!/usr/bin/env bash
# İzole geri yükleme tatbikatı — bir yedeğin gerçekten geri yüklenebildiğini ve DB ile
# kanıt dosyalarının birbiriyle TUTARLI olduğunu doğrular. Canlı DB'ye ve canlı
# backend/uploads dizinine DOKUNMAZ.
#
# Kullanım:
#   ./scripts/restore-drill.sh <grc_db_TS.dump> <uploads_TS.tar.gz>
#
# Ortam:
#   DRILL_CONTAINER  hedef Postgres konteyneri (varsayılan: rmic_1-postgres-test-1)
#   DRILL_DB         geçici DB adı (varsayılan: grc_restore_drill)
#   DRILL_USER       konteyner kullanıcısı (varsayılan: grc_test)
#   KEEP=1           tatbikat DB'sini ve açılmış dosyaları silme (veri aktarım dry-run'ı için)
#
# Kontroller:
#   1) .sha256 varsa sağlama toplamı
#   2) pg_restore hatasız (--exit-on-error)
#   3) Migration geçmişi (_prisma_migrations) ve tablo satır sayıları
#   4) DB'deki her ek kaydının (Attachment, FindingAttachment, ActionAttachment,
#      FollowUpAttachment, ControlTestAttachment, AiEvalAttachment) dosyası arşivde var mı
# Değişmez: backup-db.sh önce dump, sonra uploads arşivi alır ve uygulama kayıtlı dosyayı
# diskten silmez — bu yüzden dump'taki her referans arşivde bulunmalıdır. Eksik = HATA.

set -euo pipefail

DUMP_FILE="${1:?Kullanım: $0 <dump> <uploads.tar.gz>}"
UPLOADS_ARCHIVE="${2:?Kullanım: $0 <dump> <uploads.tar.gz>}"
DRILL_CONTAINER="${DRILL_CONTAINER:-rmic_1-postgres-test-1}"
DRILL_DB="${DRILL_DB:-grc_restore_drill}"
DRILL_USER="${DRILL_USER:-grc_test}"

# Koruma: canlı konteyner/DB adlarına geri yükleme yapılmaz.
if [ "$DRILL_CONTAINER" = "rmic_1-postgres-1" ] || [[ "$DRILL_DB" =~ ^grc_db(_prod|_pilot)?$ ]]; then
    echo "GUARD: tatbikat canlı konteynere/DB'ye yapılamaz ($DRILL_CONTAINER/$DRILL_DB)." >&2
    exit 2
fi
[ -f "$DUMP_FILE" ] || { echo "Dump bulunamadı: $DUMP_FILE" >&2; exit 1; }
[ -f "$UPLOADS_ARCHIVE" ] || { echo "Arşiv bulunamadı: $UPLOADS_ARCHIVE" >&2; exit 1; }

FAIL=0
psqlq() { docker exec "$DRILL_CONTAINER" psql -U "$DRILL_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -tAc "$1"; }

echo "== 1) Sağlama toplamı"
for f in "$DUMP_FILE" "$UPLOADS_ARCHIVE"; do
    if [ -f "$f.sha256" ]; then
        (cd "$(dirname "$f")" && shasum -a 256 -c "$(basename "$f").sha256") || FAIL=1
    else
        echo "  (yok) $f.sha256 — atlandı"
    fi
done

echo "== 2) Geri yükleme → $DRILL_CONTAINER/$DRILL_DB"
docker exec "$DRILL_CONTAINER" psql -U "$DRILL_USER" -d postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"$DRILL_DB\" WITH (FORCE);"
docker exec "$DRILL_CONTAINER" psql -U "$DRILL_USER" -d postgres -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$DRILL_DB\";"
docker cp "$DUMP_FILE" "$DRILL_CONTAINER:/tmp/drill.dump"
START=$(date +%s)
docker exec "$DRILL_CONTAINER" pg_restore -U "$DRILL_USER" -d "$DRILL_DB" --no-owner --no-privileges --exit-on-error /tmp/drill.dump
docker exec "$DRILL_CONTAINER" rm -f /tmp/drill.dump
echo "  pg_restore tamam ($(( $(date +%s) - START )) sn)"

echo "== 3) Migration geçmişi ve satır sayıları"
echo "  uygulanmış migration: $(psqlq "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
echo "  son migration: $(psqlq "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")"
echo "  yarım kalmış migration: $(psqlq "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")"
for t in User Role Directorate Control ControlTest Risk Finding Action FindingFollowUp AuditLog RecordCounter; do
    printf '  %-16s %s\n' "$t" "$(psqlq "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo 'tablo yok')"
done

echo "== 4) DB ↔ kanıt dosyası tutarlılığı"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/rmic-drill.XXXXXX")"
tar -xzf "$UPLOADS_ARCHIVE" -C "$WORK"
REFS="$WORK/refs.txt"
psqlq "
  SELECT 'Attachment', \"fileName\" FROM \"Attachment\"
  UNION ALL SELECT 'FindingAttachment', \"fileName\" FROM \"FindingAttachment\"
  UNION ALL SELECT 'ActionAttachment', \"fileName\" FROM \"ActionAttachment\"
  UNION ALL SELECT 'FollowUpAttachment', \"fileName\" FROM \"FollowUpAttachment\"
  UNION ALL SELECT 'ControlTestAttachment', \"fileName\" FROM \"ControlTestAttachment\"
  UNION ALL SELECT 'AiEvalAttachment', \"fileName\" FROM \"AiEvalAttachment\"" > "$REFS"
TOTAL=0; MISSING=0
while IFS='|' read -r table name; do
    [ -n "$name" ] || continue
    TOTAL=$((TOTAL + 1))
    if [ ! -f "$WORK/uploads/$name" ]; then
        MISSING=$((MISSING + 1))
        [ "$MISSING" -le 20 ] && echo "  EKSİK: $table → $name"
    fi
done < "$REFS"
ARCHIVE_FILES=$(find "$WORK/uploads" -type f | wc -l | tr -d ' ')
echo "  DB'deki ek referansı: $TOTAL, arşivdeki dosya: $ARCHIVE_FILES, eksik: $MISSING"
[ "$MISSING" -eq 0 ] || FAIL=1

if [ "${KEEP:-0}" = "1" ]; then
    echo "KEEP=1 — tatbikat DB'si ($DRILL_DB) ve dosyalar ($WORK) bırakıldı."
else
    docker exec "$DRILL_CONTAINER" psql -U "$DRILL_USER" -d postgres -qc "DROP DATABASE IF EXISTS \"$DRILL_DB\" WITH (FORCE);"
    rm -rf "$WORK"
fi

if [ "$FAIL" -ne 0 ]; then echo "SONUÇ: BAŞARISIZ"; exit 1; fi
echo "SONUÇ: BAŞARILI — yedek geri yüklenebilir ve DB/kanıt tutarlı."
