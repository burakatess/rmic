import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

// Backend API farklı origin'de çalışabiliyor (dev'de localhost:3001) — connect-src
// bunu içermezse tüm fetch çağrıları CSP tarafından sessizce engellenir.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const apiOrigin = new URL(apiUrl).origin;

// Self-hosted Sentry DSN tanımlıysa, tarayıcının hata event'lerini gönderebilmesi
// için ingest origin'i CSP connect-src'e eklenir — aksi halde CSP sessizce engeller.
let sentryOrigin: string | null = null;
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    sentryOrigin = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin;
  } catch {
    sentryOrigin = null;
  }
}

// Recharts SVG/inline stilleri ve Next.js'in kendi inline script'leri için
// 'unsafe-inline' gerekiyor; dış kaynaklardan script/style yüklenmiyor.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${sentryOrigin ? ` ${sentryOrigin}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
