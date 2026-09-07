# Backend Dockerfile - Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts tsconfig*.json ./
COPY docker-entrypoint.sh ./

RUN npm install
RUN npx prisma generate
RUN chmod +x docker-entrypoint.sh

COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

EXPOSE 3001

# Migrasyon (prisma migrate deploy) + rol/izin seed'i + API başlatma.
# Derlenmiş giriş noktası dist/src/main.js (prisma.config.ts kökte olduğu için
# tsc çıktısı dist/src/ altında oluşur).
ENTRYPOINT ["./docker-entrypoint.sh"]
