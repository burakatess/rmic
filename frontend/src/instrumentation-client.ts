// Next.js istemci tarafı (tarayıcı) hata izleme başlatması.
// NEXT_PUBLIC_SENTRY_DSN tanımlı değilse hiçbir şey yapmaz — self-hosted
// Sentry kurulana kadar devre dışıdır. DSN, next.config.ts içindeki CSP
// connect-src listesine de otomatik eklenir (aksi halde tarayıcı istekleri
// sessizce engellenir).
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
