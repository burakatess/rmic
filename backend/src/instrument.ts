// Sentry, tüm diğer import'lardan önce başlatılmalıdır (bkz. @sentry/nestjs kurulum kılavuzu).
// SENTRY_DSN tanımlı değilse hiçbir şey yapmaz — self-hosted Sentry kurulana kadar devre dışıdır.
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    sendDefaultPii: false,
  });
}
