# RMIC — Risk Yönetimi ve İç Kontrol Platformu

Bankacılık ve finans sektörüne yönelik **GRC (Governance, Risk & Compliance)** platformu. Kurumsal risk yönetimi, iç kontrol test süreçleri, denetim bulguları, aksiyon takibi ve mevzuat uyumunu tek çatı altında yönetir.

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Backend | NestJS 11, Prisma 7, PostgreSQL |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Auth | Passport + JWT (access + refresh token) |
| Grafik | Recharts 3.6 |

## Proje Yapısı

```
rmic/
├── backend/          # NestJS API sunucusu
│   ├── prisma/       # Veritabanı schema ve migration'lar
│   └── src/
│       ├── common/   # Guards, decorators, interceptors
│       ├── modules/  # İş modülleri (auth, risks, controls, ...)
│       └── prisma/   # Prisma service
├── frontend/         # Next.js web uygulaması
│   └── src/
│       ├── app/      # Sayfa rotaları (App Router)
│       ├── components/ # Paylaşılan bileşenler
│       ├── hooks/    # Custom React hooks
│       ├── lib/      # API client, yardımcı fonksiyonlar
│       └── types/    # TypeScript tip tanımları
└── shared/           # Ortak tipler (backend ↔ frontend)
```

## Modüller

| Modül | Açıklama |
|-------|----------|
| **Auth** | JWT kimlik doğrulama, refresh token, rol yönetimi |
| **Risks** | Risk envanteri, skorlama (olasılık × etki), değerlendirme, işleme |
| **Controls** | Kontrol envanteri, test workflow'u (draft → onay → red/kabul) |
| **Audits** | Denetim planları ve uygulanması |
| **Findings** | Bulgu yönetimi (kritik/yüksek/orta/düşük) |
| **Actions** | Aksiyon takibi, SLA yönetimi, etkinlik değerlendirmesi |
| **Compliance** | Mevzuat uyumu (BDDK, DORA, ISO 27001) |
| **Risk Entry** | Excel benzeri risk giriş ve hesaplama ekranı |
| **RYK** | Risk Yönetimi Kontrolleri |
| **Reports** | Dashboard, trend analizi, ısı haritası |
| **Admin** | Kullanıcı, rol ve sistem parametre yönetimi |

## Kurulum

### Gereksinimler

- Node.js ≥ 20
- PostgreSQL ≥ 15
- npm ≥ 10

### 1. Veritabanı

```bash
# PostgreSQL'de veritabanı oluştur
createdb grc_db
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # .env dosyasını düzenle (DATABASE_URL, JWT_SECRET vb.)
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed     # Demo verileri yükle
npm run start:dev       # http://localhost:3001/api
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:3000
```

### 4. Demo Giriş

```
Email:  admin@grc.com
Şifre:  password123
```

## API Dokümantasyonu

Backend çalışırken Swagger UI'a şu adresten erişilebilir:

```
http://localhost:3001/api/docs
```

## Geliştirme Komutları

| Komut | Açıklama |
|-------|----------|
| `npm run start:dev` | Backend (watch mode) |
| `npm run dev` | Frontend (dev server) |
| `npm run build` | Production build |
| `npm run lint` | ESLint kontrolü |
| `npm run test` | Unit testler |
| `npm run test:e2e` | E2E testler |
| `npm run prisma:migrate` | DB migration |
| `npm run prisma:seed` | Demo veri yükleme |

## Lisans

UNLICENSED — Özel kullanım
