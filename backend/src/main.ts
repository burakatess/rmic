import './instrument';
import { json, urlencoded } from 'express';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { parseTrustProxy } from './common/util/trust-proxy.util';

// .env.example / docker-compose.yml içindeki varsayılan değerler — prod'da
// bunlardan biri hâlâ kullanılıyorsa JWT tahmin edilebilir demektir, boot durdurulur.
const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-refresh-key-change-in-production',
  'change-this-in-production',
  'change-this-refresh-in-production',
]);

function assertProductionSecrets(configService: ConfigService, logger: Logger) {
  if (configService.get<string>('NODE_ENV') !== 'production') return;

  const jwtSecret = configService.get<string>('JWT_SECRET');
  const jwtRefreshSecret = configService.get<string>('JWT_REFRESH_SECRET');

  const usesPlaceholder =
    !jwtSecret ||
    !jwtRefreshSecret ||
    PLACEHOLDER_SECRETS.has(jwtSecret) ||
    PLACEHOLDER_SECRETS.has(jwtRefreshSecret) ||
    jwtSecret === jwtRefreshSecret;

  if (usesPlaceholder) {
    logger.error(
      'JWT_SECRET / JWT_REFRESH_SECRET eksik, placeholder değerde veya birbirine eşit. ' +
        'Production ortamında benzersiz, rastgele üretilmiş secret\'lar zorunludur — başlatma durduruldu.',
    );
    process.exit(1);
  }
}

/**
 * Üretimde kayıt kapsamı (RECORD_SCOPE_ENFORCEMENT) varsayılan AÇIKTIR. Kapalıysa veya
 * tanımsızsa uygulama BAŞLAMAZ — eksik birim üyeliklerini "çözmek" için kapsamın sessizce
 * kapatılmasını önler. Bilinçli istisna: RECORD_SCOPE_ENFORCEMENT=false +
 * RECORD_SCOPE_ENFORCEMENT_DISABLED_REASON (her açılışta uyarı olarak yazılır).
 */
export function scopeEnforcementStartupCheck(env: { nodeEnv?: string; flag?: string; reason?: string }): { ok: boolean; level: 'ok' | 'warn' | 'error'; message?: string } {
    if (env.nodeEnv !== 'production') return { ok: true, level: 'ok' };
    if (env.flag === 'true') return { ok: true, level: 'ok' };
    if (env.flag === 'false' && env.reason?.trim()) {
        return { ok: true, level: 'warn', message: `KAYIT KAPSAMI KAPALI (production) — gerekçe: ${env.reason.trim()}. Kullanıcılar birim/atama sınırı olmadan tüm kayıtları görür.` };
    }
    return {
        ok: false, level: 'error',
        message: env.flag === 'false'
            ? 'RECORD_SCOPE_ENFORCEMENT=false production\'da gerekçe olmadan kullanılamaz (RECORD_SCOPE_ENFORCEMENT_DISABLED_REASON) — başlatma durduruldu.'
            : 'RECORD_SCOPE_ENFORCEMENT production\'da tanımlı olmalı (true) — başlatma durduruldu. Devreye alma: docs/access-scope.md',
    };
}

async function bootstrap() {
  // Gövde ayrıştırıcıları aşağıda açıkça kaydedilir (Nest'in varsayılanı yola özel bir JSON
  // ayrıştırıcı görünce globali atlıyor).
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  assertProductionSecrets(configService, logger);

  const scopeCheck = scopeEnforcementStartupCheck({
    nodeEnv: configService.get<string>('NODE_ENV'),
    flag: configService.get<string>('RECORD_SCOPE_ENFORCEMENT'),
    reason: configService.get<string>('RECORD_SCOPE_ENFORCEMENT_DISABLED_REASON'),
  });
  if (scopeCheck.level === 'warn') logger.warn(scopeCheck.message!);
  if (!scopeCheck.ok) {
    logger.error(scopeCheck.message!);
    process.exit(1);
  }

  // Reverse proxy arkasında gerçek istemci IP'si (rate limit + denetim izi) için yalnız
  // AÇIKÇA güvenilen proxy adresleri/hop sayısı kabul edilir; "true" reddedilir.
  try {
    const trustProxy = parseTrustProxy(configService.get<string>('TRUST_PROXY'));
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
    if (trustProxy !== false) logger.log(`trust proxy: ${JSON.stringify(trustProxy)}`);
  } catch (e) {
    logger.error(`TRUST_PROXY yapılandırması geçersiz: ${(e as Error).message} — başlatma durduruldu.`);
    process.exit(1);
  }

  // API yanıt başlıkları (bağımlılıksız asgari set): çerçeve fingerprint'i gizlenir, MIME
  // sniffing kapatılır. X-Frame-Options bilinçli olarak yok — kanıt önizlemesi API'yi
  // farklı origin'den iframe'de açabilir; çerçeveleme politikası ters vekilde belirlenir.
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  http.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Excel'den simülasyon çalışma alanı: tarayıcıda okunan GRC tabloları JSON olarak gelir
  // (≤2000 risk / 10000 kontrol, DTO ile sınırlı). Varsayılan 100 KB yalnız bu uçta büyütülür.
  http.use('/api/risk-simulations/workspaces/import', json({ limit: '10mb' }));
  http.use(json());
  http.use(urlencoded({ extended: true }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL') || 'http://localhost:3000',
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger / OpenAPI — production'da tüm API şemasını (endpoint/DTO/auth
  // yapısı) herkese açık bırakmamak için varsayılan kapalı; yalnızca
  // SWAGGER_ENABLED=true açıkça set edilirse prod'da da açılabilir.
  const swaggerEnabled =
    configService.get<string>('NODE_ENV') !== 'production' ||
    configService.get<string>('SWAGGER_ENABLED') === 'true';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RMIC API')
      .setDescription(
        'Risk Yönetimi ve İç Kontrol Platformu API Dokümantasyonu. ' +
        'Bankacılık ve finans sektörüne yönelik GRC (Governance, Risk & Compliance) platformu.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-Auth',
      )
      .addTag('Auth', 'Kimlik doğrulama ve oturum yönetimi')
      .addTag('Risks', 'Risk envanteri yönetimi')
      .addTag('Controls', 'Kontrol envanteri ve test workflow')
      .addTag('Audit Plans', 'Denetim plan yönetimi')
      .addTag('Audit Executions', 'Denetim uygulama yönetimi')
      .addTag('Findings', 'Bulgu yönetimi')
      .addTag('Actions', 'Aksiyon takibi ve SLA yönetimi')
      .addTag('Compliance', 'Mevzuat uyumu')
      .addTag('Risk Entries', 'Risk giriş ekranı (Excel benzeri)')
      .addTag('Risk Management Controls', 'Risk Yönetimi Kontrolleri (RYK)')
      .addTag('Reports', 'Dashboard ve raporlar')
      .addTag('Admin', 'Sistem yönetimi')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);

  logger.log(`🚀 GRC Backend is running on: http://localhost:${port}/api`);
  if (swaggerEnabled) {
    logger.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

if (require.main === module) {
  void bootstrap();
}
