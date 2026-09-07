# Hata İzleme (Self-Hosted Sentry) Kurulumu

## Durum

Backend (`@sentry/nestjs`) ve frontend (`@sentry/nextjs`) SDK'ları koda entegre
edildi ve **varsayılan olarak devre dışı**. `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
ortam değişkenleri tanımlanmadığı sürece hiçbir veri hiçbir yere gönderilmez —
kod hiçbir şekilde build/deploy'u etkilemez, sadece no-op çalışır.

Bu, veri egemenliği gereksinimi (bulut AI/servis yasağı) doğrultusunda bilinçli
bir tasarım: hata detayları (stack trace, istek context'i) yalnızca **kendi
sunucunuzda barındırılan** bir Sentry örneğine gider, üçüncü taraf buluta değil.

## 1. Self-hosted Sentry'yi kurma

Sentry'nin resmi self-hosted dağıtımı ayrı bir repo ve kurulum betiği ile gelir
(Postgres, Redis, Kafka, ClickHouse, Relay, Symbolicator gibi birden fazla
servisten oluşan ağır bir stack — bu projenin `docker-compose.yml`'ine dahil
edilmedi, kendi sunucunuzda ayrı bir altyapı olarak kurulmalı):

```bash
git clone https://github.com/getsentry/self-hosted.git
cd self-hosted
./install.sh
docker compose up -d
```

Detaylı kaynak kaynak gereksinimleri ve adımlar: https://develop.sentry.dev/self-hosted/

Kurulum tamamlandıktan sonra Sentry web arayüzünden:
1. Bir organizasyon oluşturun.
2. **Backend** için bir "Node.js"/"NestJS" projesi oluşturun → DSN'i kopyalayın.
3. **Frontend** için bir "Next.js" projesi oluşturun → DSN'i kopyalayın.

## 2. Ortam değişkenlerini ayarlama

**Backend** (`backend/.env`):
```
SENTRY_DSN=http://xxxxx@sentry.kurumunuz.local/1
```

**Frontend** (`frontend/.env.local` veya deploy ortam değişkenleri):
```
NEXT_PUBLIC_SENTRY_DSN=http://xxxxx@sentry.kurumunuz.local/2
SENTRY_DSN=http://xxxxx@sentry.kurumunuz.local/2
```

> `NEXT_PUBLIC_SENTRY_DSN` tarayıcıya açık gider (DSN zaten gizli bir sır değildir,
> yalnızca event gönderme adresidir). `next.config.ts` bu DSN'in origin'ini
> otomatik olarak CSP `connect-src` listesine ekler — aksi halde tarayıcının
> Sentry'ye event göndermesi CSP tarafından sessizce engellenir.

## 3. Doğrulama

Backend'i DSN tanımlıyken yeniden başlatıp kasıtlı bir hata fırlatan bir test
endpoint'i çağırarak (ör. `throw new Error('test')` içeren geçici bir route)
Sentry panelinde event'in düştüğünü doğrulayın, sonra geçici kodu kaldırın.

## 4. Mimari notlar

- **Backend**: `backend/src/instrument.ts` — `main.ts`'in en başında import
  edilir (Sentry'nin diğer tüm modüllerden önce başlatılması gerekir).
  `common/filters/all-exceptions.filter.ts` — Prisma dışı, 500 seviyesindeki
  tüm hataları Sentry'ye raporlayan global catch-all filter.
- **Frontend**: `src/instrumentation-client.ts` (tarayıcı) ve
  `src/instrumentation.ts` (sunucu/edge) — Next.js 15.3+'ın yerleşik
  instrumentation kancaları, App Router ile native uyumlu.
