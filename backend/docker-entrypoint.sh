#!/bin/sh
# Backend konteyner başlangıcı: şema migrasyonlarını uygula, (opsiyonel) sistem
# rollerini/izinlerini seed'le, sonra API'yi başlat.
set -e

echo "→ prisma migrate deploy"
npx prisma migrate deploy

# Roller + izinler (ai:* dahil) — idempotent upsert, her açılışta güvenli.
# Kapatmak için compose'da RUN_SEED_SYSTEM=false verin.
if [ "${RUN_SEED_SYSTEM:-true}" = "true" ]; then
  echo "→ prisma seed-system (roller + izinler)"
  npx ts-node prisma/seed-system.ts || echo "  seed-system atlandı (hata yoksayıldı)"
fi

# Demo/örnek veri — yalnızca açıkça istenirse (üretimde ASLA).
if [ "${RUN_SEED_DEMO:-false}" = "true" ]; then
  echo "→ prisma seed (demo veri)"
  npx ts-node prisma/seed.ts || echo "  demo seed atlandı"
fi

echo "→ API başlatılıyor"
exec node dist/src/main.js
